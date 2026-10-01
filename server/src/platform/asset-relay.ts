import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { PlatformConfig } from "./config.js";
import type { ObjectStorage } from "./object-storage.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
interface Ticket {
  purpose: "media" | "probe";
  key: string;
  expires: number;
}
export function sealAssetTicket(key: Buffer, ticket: Ticket): string {
  return encryptSecret(JSON.stringify(ticket), key);
}
export function openAssetTicket(
  key: Buffer,
  token: string,
  now = Date.now(),
): Ticket {
  const value = JSON.parse(decryptSecret(token, key)) as Ticket;
  if (
    !["media", "probe"].includes(value.purpose) ||
    typeof value.key !== "string" ||
    value.key.length > 1500 ||
    !Number.isSafeInteger(value.expires) ||
    value.expires <= now ||
    value.expires > now + 3_600_000
  )
    throw new Error("expired or invalid media ticket");
  return value;
}
/** A dedicated, read-only server. It exposes no app, auth, catalog or directory routes. */
export async function createAssetRelay(
  storage: ObjectStorage,
  config: PlatformConfig,
  env: NodeJS.ProcessEnv,
): Promise<{ storage: ObjectStorage; close: () => Promise<void> }> {
  if (env.ASSET_RELAY_ENABLED !== "true")
    return { storage, close: async () => undefined };
  if (config.nodeEnv === "production" || config.authMode !== "development")
    throw new Error(
      "Temporary asset relay is only available in local development",
    );
  const port = Number(env.ASSET_RELAY_PORT || 8790);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid asset relay port");
  const secret = config.sessionSecret;
  async function publicBase(): Promise<string | null> {
    const value = env.ASSET_RELAY_PUBLIC_URL_FILE
      ? await fs
          .readFile(env.ASSET_RELAY_PUBLIC_URL_FILE, "utf8")
          .catch(() => "")
      : env.ASSET_RELAY_PUBLIC_URL || "";
    if (!value.trim()) return null;
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      /^(localhost|127\.|\[|10\.|192\.168\.)/.test(url.hostname)
    )
      throw new Error("Asset relay requires a public HTTPS origin");
    return url.origin;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(req.method || "")) {
      res.writeHead(405).end();
      return;
    }
    const match = new URL(req.url || "/", "http://localhost").pathname.match(
      /^\/media\/([A-Za-z0-9_-]{40,4096})(?:\.[a-z0-9]{1,6})?$/,
    );
    if (!match) {
      res.writeHead(404).end();
      return;
    }
    try {
      const ticket = openAssetTicket(secret, match[1]);
      if (ticket.purpose === "probe") {
        res.setHeader("Content-Type", "text/plain");
        res.end(ticket.key);
        return;
      }
      const object = await storage.read(ticket.key, req.headers.range);
      res.statusCode = object.contentRange ? 206 : 200;
      res.setHeader("Content-Type", object.mimeType);
      if (object.byteSize !== null)
        res.setHeader("Content-Length", object.byteSize);
      if (object.contentRange)
        res.setHeader("Content-Range", object.contentRange);
      if (object.acceptRanges)
        res.setHeader("Accept-Ranges", object.acceptRanges);
      if (req.method === "HEAD") {
        object.body.destroy();
        res.end();
        return;
      }
      await pipeline(object.body, res);
    } catch {
      if (!res.headersSent) res.writeHead(404).end();
      else res.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  let checked = { base: "", expires: 0, ready: false };
  let checking: Promise<boolean> | null = null;
  const ready = async () => {
    const base = await publicBase().catch(() => null);
    if (!base) return false;
    if (checked.base === base && checked.expires > Date.now())
      return checked.ready;
    if (checking) return checking;
    checking = (async () => {
      const nonce = randomUUID();
      const token = sealAssetTicket(secret, {
        purpose: "probe",
        key: nonce,
        expires: Date.now() + 30_000,
      });
      let okay = false;
      try {
        const r = await fetch(`${base}/media/${token}`, {
          signal: AbortSignal.timeout(8_000),
          redirect: "error",
        });
        okay = r.ok && (await r.text()) === nonce;
      } catch {}
      checked = { base, expires: Date.now() + 30_000, ready: okay };
      return okay;
    })().finally(() => (checking = null));
    return checking;
  };
  const proxy = new Proxy(storage, {
    get(target, property) {
      if (property === "providerAccessible") return ready;
      if (property === "signedGetUrl")
        return async (key: string, options?: { expiresIn?: number }) => {
          if (!(await ready()))
            throw new Error(
              "公共签名素材通道尚未就绪，请检查本地中继或 S3 配置",
            );
          if (!(await storage.head(key)))
            throw new Error("signed asset not found");
          const ttl = Math.max(30, Math.min(3600, options?.expiresIn ?? 300));
          const token = sealAssetTicket(secret, {
            purpose: "media",
            key,
            expires: Date.now() + ttl * 1000,
          });
          const extension = path.extname(key);
          return `${await publicBase()}/media/${token}${/^\.[a-z0-9]{1,6}$/.test(extension) ? extension : ""}`;
        };
      const v = Reflect.get(target, property);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return {
    storage: proxy,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
