import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { loadPlatformConfig } from "../server/dist/platform/config.js";
import { LocalObjectStorage } from "../server/dist/platform/object-storage.js";
import { sealAssetTicket } from "../server/dist/platform/asset-relay.js";
const env = {
  ...process.env,
  ...parseEnv(await fs.readFile(".env", "utf8")),
  ...parseEnv(await fs.readFile(".env.mv.local", "utf8")),
};
const config = loadPlatformConfig(env),
  storage = new LocalObjectStorage(config.storage.localDir);
const base = (
  await fs.readFile(env.ASSET_RELAY_PUBLIC_URL_FILE, "utf8")
).trim();
if (!base) throw new Error("Asset tunnel has no assigned URL");
const key = `relay-verification/${Date.now()}.mp3`;
await storage.put(key, Buffer.from("0123456789"), "audio/mpeg");
try {
  const token = sealAssetTicket(config.sessionSecret, {
    purpose: "media",
    key,
    expires: Date.now() + 60000,
  });
  const response = await fetch(`${base}/media/${token}.mp3`, {
    headers: { Range: "bytes=2-5" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 206 || (await response.text()) !== "2345")
    throw new Error("Public range request failed");
  const closed = await fetch(base + "/api/session", {
    signal: AbortSignal.timeout(15000),
  });
  if (closed.status !== 404)
    throw new Error("Relay unexpectedly exposes app routes");
  const expired = sealAssetTicket(config.sessionSecret, {
    purpose: "media",
    key,
    expires: Date.now() - 1000,
  });
  const rejected = await fetch(`${base}/media/${expired}.mp3`, {
    signal: AbortSignal.timeout(15000),
  });
  if (rejected.status !== 404)
    throw new Error("Expired media ticket was accepted");
  console.log(
    JSON.stringify({
      publicSignedAsset: true,
      rangeStatus: 206,
      appRoutesExposed: false,
      expiredTicketRejected: true,
      realUserMediaTransmitted: false,
    }),
  );
} finally {
  await storage.delete(key);
  await storage.close();
}
