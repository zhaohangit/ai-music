import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const name of [".env", ".env.mv.local"]) {
  const file = path.join(root, name);
  if (fs.existsSync(file))
    Object.assign(env, parseEnv(fs.readFileSync(file, "utf8")));
}
let tunnel = null;
if (env.ASSET_RELAY_AUTO_TUNNEL === "true") {
  const binary = path.resolve(
    root,
    env.CLOUDFLARED_PATH || ".tools/cloudflared",
  );
  if (!fs.existsSync(binary))
    throw new Error("Verified cloudflared binary is missing");
  const urlFile = path.resolve(
    env.ASSET_RELAY_PUBLIC_URL_FILE || path.join(root, "data/asset-relay-url"),
  );
  env.ASSET_RELAY_PUBLIC_URL_FILE = urlFile;
  fs.mkdirSync(path.dirname(urlFile), { recursive: true });
  fs.writeFileSync(urlFile, "", { mode: 0o600 });
  tunnel = spawn(
    binary,
    [
      "tunnel",
      "--no-autoupdate",
      "--url",
      `http://127.0.0.1:${env.ASSET_RELAY_PORT || 8790}`,
    ],
    { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] },
  );
  let buffer = "";
  tunnel.stderr.on("data", (data) => {
    buffer = (buffer + data.toString()).slice(-12000);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && fs.readFileSync(urlFile, "utf8") !== match[0]) {
      fs.writeFileSync(urlFile, match[0], { mode: 0o600 });
      console.log(
        "Read-only signed asset tunnel assigned; the API verifies reachability before use.",
      );
    }
  });
  tunnel.on("error", (e) => console.error("Asset tunnel:", e.message));
  tunnel.on("exit", () => {
    fs.writeFileSync(urlFile, "", { mode: 0o600 });
    if (!closing)
      console.error(
        "Asset tunnel stopped; external media access is disabled until restart.",
      );
  });
}
const server = spawn(process.execPath, ["server/dist/index.js"], {
  cwd: root,
  env,
  stdio: "inherit",
});
const web = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
    "--strictPort",
  ],
  {
    cwd: path.join(root, "web"),
    env: { ...env, SERVER_URL: "http://127.0.0.1:8787" },
    stdio: "inherit",
  },
);
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  tunnel?.kill("SIGTERM");
  server.kill("SIGTERM");
  web.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
for (const child of [server, web]) {
  child.on("error", (error) => {
    console.error(error.message);
    stop();
  });
  child.on("exit", (code) => {
    if (!closing && code) {
      process.exitCode = code;
      stop();
    }
  });
}
