import path from 'node:path';
import fs from 'node:fs/promises';
import type { Express } from 'express';
import type { SettingsStore } from '../settings.js';
import { SunoClient } from '../suno.js';
import { createAssetRelay } from './asset-relay.js';
import { MvService } from './mv/service.js';
import { MvProvider } from './mv/provider.js';
import { MvMedia } from './mv/media.js';
import { AiAssistantService } from './ai-service.js';
import { createPlatformApp } from './app.js';
import { DEFAULT_MUSIC_MODEL_PROFILES } from './catalog.js';
import { loadPlatformConfig, type PlatformConfig } from './config.js';
import { PlatformDatabase, type PoolLike } from './database.js';
import { ModelCrossClient } from './modelcross-client.js';
import { MusicService } from './music-service.js';
import { SunoActionsService } from './suno-actions-service.js';
import { MusicWorker } from './music-worker.js';
import { createObjectStorage, type ObjectStorage } from './object-storage.js';
import { createPlatformQueue, PlatformEventBus, type PlatformQueue } from './queue.js';
import { PlatformRepository } from './repository.js';
import { SessionManager } from './session.js';

export interface PlatformRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  pool?: PoolLike;
  fetchImpl?: typeof fetch;
  staticDir?: string | null;
  migrationsDir?: string;
  settings?: SettingsStore;
  log?: (event: Record<string, unknown>) => void;
}

export interface PlatformRuntime {
  config: PlatformConfig;
  app: Express | null;
  database: PlatformDatabase;
  repository: PlatformRepository;
  modelCross: ModelCrossClient;
  sessions: SessionManager;
  storage: ObjectStorage;
  queue: PlatformQueue;
  events: PlatformEventBus;
  music: MusicService;
  sunoActions: SunoActionsService;
  worker: MusicWorker | null;
  suno: SunoClient;
  close(): Promise<void>;
}

/** Build and start the selected API/worker dependency graph. */
export async function createPlatformRuntime(options: PlatformRuntimeOptions = {}): Promise<PlatformRuntime> {
  const env = options.env ?? process.env;
  const config = loadPlatformConfig(env);
  if (!config.enabled) throw new Error('platform runtime is disabled');
  if (config.runtimeRole !== 'all' && config.queue.driver === 'inline') {
    throw new Error('QUEUE_DRIVER=bullmq is required when API and worker use separate runtime roles');
  }

  const database = new PlatformDatabase(options.pool ?? config.databaseUrl);
  let storage: ObjectStorage | null = null;
  let queue: PlatformQueue | null = null;
  let events: PlatformEventBus | null = null;
  let worker: MusicWorker | null = null;
  let mv: MvService | null = null;
  let closeRelay: (() => Promise<void>) | null = null;
  try {
    await database.migrate(options.migrationsDir);
    const repository = new PlatformRepository(database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);

    const fetchImpl = options.fetchImpl ?? fetch;
    const modelCross = new ModelCrossClient(config, fetchImpl);
    const sessions = new SessionManager(config, repository, modelCross);
    storage = createObjectStorage(config);
    const relay = await createAssetRelay(storage, config, env);
    storage = relay.storage; closeRelay = relay.close;
    queue = createPlatformQueue(config);
    events = new PlatformEventBus(config);
    await events.start();

    // Live requests go through ModelCross with the short-lived task credential
    // already used for Reserve/Capture. Only the explicit development preview
    // path may still connect directly with a deployment-local fake/test key.
    const delegatedProvider = config.modelCross.billingLive;
    const providerBaseUrl = (delegatedProvider
      ? config.modelCross.baseUrl
      : env.SUNO_API_BASE_URL?.trim() || config.modelCross.baseUrl).replace(/\/+$/, '');
    const providerCredential = delegatedProvider ? null : env.SUNO_API_KEY_FILE ? (await fs.readFile(env.SUNO_API_KEY_FILE, 'utf8')).trim() : env.SUNO_API_KEY?.trim() || null;
    const requestTimeoutMs = Number(env.SUNO_REQUEST_TIMEOUT_MS ?? 30_000);
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 250) {
      throw new Error('SUNO_REQUEST_TIMEOUT_MS must be an integer of at least 250');
    }
    const suno = new SunoClient(
      providerBaseUrl, providerCredential, fetchImpl, requestTimeoutMs, delegatedProvider,
    );
    const music = new MusicService(config, repository, modelCross, suno, queue, events);
    const sunoActions = new SunoActionsService(
      config, repository, modelCross, suno, storage, queue, events,
    );
    mv = new MvService(config, repository, storage, new MvProvider(config, env, fetchImpl), new MvMedia(env, storage), sunoActions);
    const ai = new AiAssistantService(config, repository, modelCross, events);

    if (config.runtimeRole === 'worker' || config.runtimeRole === 'all') {
      worker = new MusicWorker(config, repository, modelCross, suno, storage, queue, events);
      await worker.start();
      await mv.startWorker();
    }

    const app = config.runtimeRole === 'worker' ? null : createPlatformApp({
      config,
      repository,
      sessions,
      modelCross,
      music,
      sunoActions,
      mv,
      ai,
      storage,
      queue,
      events,
      suno,
      settings: options.settings,
      staticDir: options.staticDir === undefined ? path.resolve('web/dist') : options.staticDir,
      log: options.log,
    });

    let closed = false;
    return {
      config, app, database, repository, modelCross, sessions, storage, queue, events, music, sunoActions, worker, suno,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        await mv?.close();
        await closeRelay?.();
        await worker?.stop();
        await Promise.allSettled([queue!.close(), events!.close(), storage!.close()]);
        await database.close();
      },
    };
  } catch (error) {
    await mv?.close().catch(() => undefined);
    await closeRelay?.().catch(() => undefined);
    await worker?.stop().catch(() => undefined);
    await Promise.allSettled([
      queue?.close(),
      events?.close(),
      storage?.close(),
    ].filter((value): value is Promise<void> => value !== undefined));
    await database.close().catch(() => undefined);
    throw error;
  }
}
