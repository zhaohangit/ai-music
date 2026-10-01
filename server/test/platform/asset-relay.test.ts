import { describe, it, expect } from "vitest";
import {
  sealAssetTicket,
  openAssetTicket,
  createAssetRelay,
} from "../../src/platform/asset-relay.js";
import { LocalObjectStorage } from "../../src/platform/object-storage.js";
import { testConfig } from "./helpers.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
const key = Buffer.alloc(32, 7);
describe("private signed asset relay", () => {
  it("authenticates opaque expiring tickets and rejects modification, expiry and excessive TTL", () => {
    const t = {
      purpose: "media" as const,
      key: "users/private/audio.mp3",
      expires: Date.now() + 60000,
    };
    const token = sealAssetTicket(key, t);
    expect(token).not.toContain("users");
    expect(openAssetTicket(key, token)).toEqual(t);
    expect(() => openAssetTicket(key, token + "x")).toThrow();
    expect(() => openAssetTicket(key, token, t.expires)).toThrow();
    expect(() =>
      openAssetTicket(
        key,
        sealAssetTicket(key, { ...t, expires: Date.now() + 7200000 }),
      ),
    ).toThrow();
  });
  it("serves only authorized media, supports byte ranges, and exposes no application endpoints", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mv-relay-"));
    const storage = new LocalObjectStorage(dir);
    await storage.put(
      "users/x/audio.mp3",
      Buffer.from("0123456789"),
      "audio/mpeg",
    );
    const sock = net.createServer();
    await new Promise<void>((r) => sock.listen(0, "127.0.0.1", r));
    const port = (sock.address() as net.AddressInfo).port;
    await new Promise<void>((r) => sock.close(() => r()));
    const config = testConfig();
    const relay = await createAssetRelay(storage, config, {
      ASSET_RELAY_ENABLED: "true",
      ASSET_RELAY_PORT: String(port),
    });
    try {
      const base = `http://127.0.0.1:${port}`;
      expect((await fetch(base + "/api/session")).status).toBe(404);
      expect((await fetch(base + "/users/x/audio.mp3")).status).toBe(404);
      const token = sealAssetTicket(config.sessionSecret, {
        purpose: "media",
        key: "users/x/audio.mp3",
        expires: Date.now() + 30000,
      });
      const response = await fetch(base + "/media/" + token + ".mp3", {
        headers: { Range: "bytes=2-5" },
      });
      expect(response.status).toBe(206);
      expect(await response.text()).toBe("2345");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await relay.storage.providerAccessible!()).toBe(false);
    } finally {
      await relay.close();
      await storage.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
