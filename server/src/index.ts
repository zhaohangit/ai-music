import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { JsonStore, Library } from './library.js';
import { loadPlatformConfig } from './platform/config.js';
import { createPlatformRuntime, type PlatformRuntime } from './platform/runtime.js';
import { SunoPoller } from './poller.js';
import { SettingsStore } from './settings.js';
import { SunoClient } from './suno.js';
import type { Template } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '../../.env');
if (process.env.MUSEFLOW_LOAD_DOTENV !== "false" && fs.existsSync(envFile)) {
  if (typeof process.loadEnvFile !== 'function') throw new Error('Loading .env requires Node.js 20.12 or newer');
  // Existing shell/deployment variables retain precedence over `.env`.
  process.loadEnvFile(envFile);
}

const config = loadConfig();
const defaultStatic = path.resolve(here, '../../web/dist');
const staticDir = config.staticDir ?? (fs.existsSync(defaultStatic) ? defaultStatic : null);

if (loadPlatformConfig().enabled) await startPlatform();
else await startLegacy();

async function startPlatform(): Promise<void> {
  const runtime = await createPlatformRuntime({ staticDir });
  const server = runtime.app
    ? runtime.app.listen(config.port, config.host, () => {
      console.log(`MuseFlow platform API listening on http://${config.host}:${config.port}`);
      console.log(`  role:     ${runtime.config.runtimeRole}`);
      console.log(`  auth:     ${runtime.config.authMode}`);
      console.log(`  storage:  ${runtime.config.storage.driver}`);
      console.log(`  queue:    ${runtime.config.queue.driver}`);
      console.log(`  billing:  ${runtime.config.modelCross.billingLive ? 'live' : 'disabled'}`);
      console.log(`  AI:       ${runtime.config.modelCross.aiLive
        ? 'live'
        : runtime.config.modelCross.aiLocalLive ? 'local-direct' : 'demo'}`);
      console.log(`  static:   ${staticDir ?? '(none — run the web development server)'}`);
    })
    : null;
  if (!runtime.app) console.log('MuseFlow platform worker started');
  installPlatformShutdown(runtime, server);
}

async function startLegacy(): Promise<void> {
  const tracksDir = path.join(config.dataDir, 'tracks');
  const coversDir = path.join(config.dataDir, 'covers');
  const library = new Library(path.join(config.dataDir, 'library.json'));
  const templates = new JsonStore<Template>(path.join(config.dataDir, 'templates.json'));
  const settings = new SettingsStore(path.join(config.dataDir, 'settings.json'), {
    apiBaseUrl: config.apiBaseUrlEnv,
    apiKey: config.apiKeyEnv,
  });
  await Promise.all([library.load(), templates.load(), settings.load()]);

  const effective = settings.effective();
  const client = new SunoClient(effective.apiBaseUrl, effective.apiKey, fetch, config.requestTimeoutMs);
  const poller = new SunoPoller(library, client, tracksDir, coversDir, {
    intervalMs: config.pollIntervalMs,
    assetTimeoutMs: config.requestTimeoutMs,
  });
  const recovered = await poller.recover();
  const app = createApp({
    library,
    templates,
    settings,
    client,
    poller,
    tracksDir,
    coversDir,
    staticDir,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  const server = app.listen(config.port, config.host, () => {
    console.log(`AI Music legacy server listening on http://${config.host}:${config.port}`);
    console.log(`  provider: ${effective.apiBaseUrl} [${effective.source.apiBaseUrl}]${effective.apiKey ? ` (bearer set [${effective.source.apiKey}])` : ' (API key not set)'}`);
    console.log(`  data:     ${config.dataDir}`);
    console.log(`  static:   ${staticDir ?? '(none — run the web development server)'}`);
    if (recovered.failed) console.log(`  marked ${recovered.failed} interrupted task(s) as error`);
    if (recovered.resumed) console.log(`  resumed polling ${recovered.resumed} submitted task(s)`);
  });
  poller.start();
  installLegacyShutdown(server, poller);
}

function closeServer(server: Server | null): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function installPlatformShutdown(runtime: PlatformRuntime, server: Server | null): void {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`received ${signal}; shutting down platform runtime`);
    const forceExit = setTimeout(() => {
      console.error('graceful shutdown timed out');
      process.exit(1);
    }, 20_000);
    forceExit.unref();
    let failed = false;
    try {
      await closeServer(server);
      await runtime.close();
    } catch (error) {
      failed = true;
      console.error(error);
    } finally {
      clearTimeout(forceExit);
      process.exit(failed ? 1 : 0);
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

function installLegacyShutdown(server: Server, poller: SunoPoller): void {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`received ${signal}; shutting down`);
    poller.stop();
    const forceExit = setTimeout(() => {
      console.error('graceful shutdown timed out');
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    try {
      await closeServer(server);
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      console.error(error);
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
