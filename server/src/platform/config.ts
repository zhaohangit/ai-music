import path from 'node:path';
import { createHash } from 'node:crypto';

export type AuthMode = 'oidc' | 'development';
export type StorageDriver = 's3' | 'local';
export type QueueDriver = 'bullmq' | 'inline';

export interface PlatformConfig {
  enabled: boolean;
  nodeEnv: string;
  publicUrl: string;
  databaseUrl: string;
  redisUrl: string | null;
  authMode: AuthMode;
  sessionSecret: Buffer;
  sessionCookieName: string;
  sessionMaxAgeSeconds: number;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
  };
  modelCross: {
    baseUrl: string;
    walletUrl: string;
    ordersUrl: string;
    accountUrl: string;
    lyricsModel: string;
    fastModel: string;
    aiModels: string[];
    taskTokenSecret: string | null;
    aiRelayToken: string | null;
    billingLive: boolean;
    aiLive: boolean;
    aiLocalLive: boolean;
  };
  musicProvider: {
    allowDevelopmentFakeProvider: boolean;
    /** Explicit local-only escape hatch for testing a deployment-owned MXAPI key. */
    allowDevelopmentDirectProvider: boolean;
  };
  storage: {
    driver: StorageDriver;
    localDir: string;
    endpoint: string | null;
    presignEndpoint: string | null;
    providerUploadUrlsReachable: boolean;
    region: string;
    bucket: string;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    forcePathStyle: boolean;
    signedUrlTtlSeconds: number;
    allowPrivateAssetUrls: boolean;
    assetHostAllowlist: string[];
  };
  queue: {
    driver: QueueDriver;
    prefix: string;
    pollIntervalMs: number;
    pollLeaseMs: number;
    providerResultGraceMs: number;
    concurrency: number;
  };
  limits: {
    maxConcurrentGenerations: number;
    maxConcurrentAiRuns: number;
    maxReferenceAudioBytesPerUser: number;
  };
  runtimeRole: 'api' | 'worker' | 'all';
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`invalid integer configuration value: ${value ?? ''}`);
  }
  return parsed;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

const unsafeProductionSecretMarkers = [
  'change-me',
  'default',
  'example',
  'placeholder',
  'sample',
] as const;

const unsafeProductionSecretValues = new Set([
  'development-only-secret',
]);

function assertProductionSecret(value: string, name: string, production: boolean): void {
  if (!production) return;
  const normalized = value.trim().toLowerCase();
  if (unsafeProductionSecretValues.has(normalized)
    || unsafeProductionSecretMarkers.some((marker) => normalized.includes(marker))) {
    throw new Error(`${name} must not use a default or example value in production`);
  }
}

function assertProductionDatabaseCredential(value: string, production: boolean): void {
  if (!production) return;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  if (parsed.password) {
    let password = parsed.password;
    try { password = decodeURIComponent(password); } catch { /* malformed escapes are rejected by the driver */ }
    assertProductionSecret(password, 'DATABASE_URL password', true);
  }
}

function url(value: string, name: string, allowHttp: boolean): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error(`${name} must use ${allowHttp ? 'http or https' : 'https'}`);
  }
  if (parsed.username || parsed.password) throw new Error(`${name} must not contain credentials`);
  return parsed.toString().replace(/\/+$/, '');
}

function sessionKey(raw: string, production: boolean): Buffer {
  if (production && raw.length < 32) throw new Error('MUSEFLOW_SESSION_SECRET must contain at least 32 characters in production');
  return createHash('sha256').update(raw).digest();
}

export function loadPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  const enabled = bool(env.PLATFORM_MODE, !!env.DATABASE_URL);
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const production = nodeEnv === 'production';
  const authMode = (env.AUTH_MODE?.trim() || (production ? 'oidc' : 'development')) as AuthMode;
  if (authMode !== 'oidc' && authMode !== 'development') throw new Error('AUTH_MODE must be oidc or development');
  if (production && authMode === 'development') throw new Error('AUTH_MODE=development is forbidden in production');

  const publicUrl = url(env.PUBLIC_URL?.trim() || 'http://127.0.0.1:8787', 'PUBLIC_URL', !production);
  // Keep the browser-visible ModelCross hostname as the default issuer. This
  // must match both Discovery's `issuer` and the JWT `iss`; host.docker.internal
  // or a loopback alias may still be supplied explicitly for a custom deployment.
  const issuer = url(env.MODELCROSS_OIDC_ISSUER?.trim() || 'http://modelcross.localhost:3000', 'MODELCROSS_OIDC_ISSUER', !production);
  const modelCrossBase = url(env.MODELCROSS_BASE_URL?.trim() || issuer, 'MODELCROSS_BASE_URL', !production);
  const redirectUri = url(
    env.MODELCROSS_OIDC_REDIRECT_URI?.trim() || `${publicUrl}/api/auth/callback`,
    'MODELCROSS_OIDC_REDIRECT_URI',
    !production,
  );
  const parsedRedirectUri = new URL(redirectUri);
  if (parsedRedirectUri.origin !== new URL(publicUrl).origin) {
    throw new Error('MODELCROSS_OIDC_REDIRECT_URI must use the same origin as PUBLIC_URL');
  }
  if (parsedRedirectUri.pathname !== '/api/auth/callback' || parsedRedirectUri.search || parsedRedirectUri.hash) {
    throw new Error('MODELCROSS_OIDC_REDIRECT_URI must use the /api/auth/callback path without query or fragment');
  }
  const databaseUrl = env.DATABASE_URL?.trim() || 'postgres://museflow:museflow@127.0.0.1:5432/museflow';
  if (env.DATABASE_URL?.trim()) assertProductionDatabaseCredential(databaseUrl, production);
  const storageDriver = (env.STORAGE_DRIVER?.trim() || (production ? 's3' : 'local')) as StorageDriver;
  if (storageDriver !== 's3' && storageDriver !== 'local') throw new Error('STORAGE_DRIVER must be s3 or local');
  const queueDriver = (env.QUEUE_DRIVER?.trim() || (env.REDIS_URL ? 'bullmq' : 'inline')) as QueueDriver;
  if (queueDriver !== 'bullmq' && queueDriver !== 'inline') throw new Error('QUEUE_DRIVER must be bullmq or inline');
  const runtimeRole = (env.RUNTIME_ROLE?.trim() || 'all') as PlatformConfig['runtimeRole'];
  if (!['api', 'worker', 'all'].includes(runtimeRole)) throw new Error('RUNTIME_ROLE must be api, worker, or all');

  const clientId = env.MODELCROSS_OIDC_CLIENT_ID?.trim() || 'museflow';
  const clientSecret = authMode === 'oidc'
    ? required(env.MODELCROSS_OIDC_CLIENT_SECRET, 'MODELCROSS_OIDC_CLIENT_SECRET')
    : env.MODELCROSS_OIDC_CLIENT_SECRET?.trim() || 'development-only-secret';
  const rawSessionSecret = production
    ? required(env.MUSEFLOW_SESSION_SECRET, 'MUSEFLOW_SESSION_SECRET')
    : env.MUSEFLOW_SESSION_SECRET?.trim() || 'museflow-development-session-secret-change-me';
  assertProductionSecret(clientSecret, 'MODELCROSS_OIDC_CLIENT_SECRET', production);
  assertProductionSecret(rawSessionSecret, 'MUSEFLOW_SESSION_SECRET', production);

  const endpoint = env.S3_ENDPOINT?.trim()
    ? url(env.S3_ENDPOINT.trim(), 'S3_ENDPOINT', true)
    : null;
  const presignEndpoint = env.S3_PRESIGN_ENDPOINT?.trim()
    ? url(env.S3_PRESIGN_ENDPOINT.trim(), 'S3_PRESIGN_ENDPOINT', !production)
    : null;
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim() || null;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim() || null;
  if (storageDriver === 's3' && (!accessKeyId || !secretAccessKey)) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for S3 storage');
  }
  if (secretAccessKey) assertProductionSecret(secretAccessKey, 'S3_SECRET_ACCESS_KEY', production);
  if (queueDriver === 'bullmq' && !env.REDIS_URL?.trim()) throw new Error('REDIS_URL is required for BullMQ');
  const taskTokenSecret = env.MODELCROSS_TASK_TOKEN_SECRET?.trim() || null;
  if (taskTokenSecret) assertProductionSecret(taskTokenSecret, 'MODELCROSS_TASK_TOKEN_SECRET', production);
  const aiRelayToken = env.MODELCROSS_AI_RELAY_TOKEN?.trim() || null;
  if (aiRelayToken) assertProductionSecret(aiRelayToken, 'MODELCROSS_AI_RELAY_TOKEN', production);
  const billingLive = bool(env.BILLING_LIVE_ENABLED, false);
  const aiLive = bool(env.AI_LIVE_ENABLED, false);
  const aiLocalLive = bool(env.AI_LOCAL_LIVE_ENABLED, false);
  const lyricsModel = env.MODELCROSS_LYRICS_MODEL?.trim() || 'mc-music-lyrics';
  const fastModel = env.MODELCROSS_FAST_MODEL?.trim() || 'mc-music-fast';
  const configuredAiModels = (env.MODELCROSS_AI_MODELS?.trim() || `${lyricsModel},${fastModel}`)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const aiModels = [...new Set(configuredAiModels)];
  if (!aiModels.length || aiModels.length > 16
    || aiModels.some((model) => model.length > 128 || /[\u0000-\u001f\u007f]/.test(model))) {
    throw new Error('MODELCROSS_AI_MODELS must contain 1 to 16 canonical model IDs');
  }
  if (!aiModels.includes(lyricsModel) || !aiModels.includes(fastModel)) {
    throw new Error('MODELCROSS_AI_MODELS must include MODELCROSS_LYRICS_MODEL and MODELCROSS_FAST_MODEL');
  }
  const allowDevelopmentFakeProvider = !production
    && authMode === 'development'
    && bool(env.ALLOW_DEVELOPMENT_FAKE_PROVIDER ?? env.E2E_FAKE_PROVIDER, false);
  const allowDevelopmentDirectProvider = !production
    && authMode === 'development'
    && bool(env.ALLOW_DEVELOPMENT_DIRECT_PROVIDER, false);
  const providerUploadUrlsReachable = storageDriver === 's3'
    && (endpoint === null
      || presignEndpoint !== null
      || bool(env.PROVIDER_UPLOAD_URLS_REACHABLE, false)
      || allowDevelopmentFakeProvider);
  const allowPrivateAssetUrls = !production && bool(env.ALLOW_PRIVATE_ASSET_URLS, true);
  const assetHostAllowlist = (env.ASSET_HOST_ALLOWLIST?.trim() || '')
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
  if (billingLive && !taskTokenSecret) {
    throw new Error('MODELCROSS_TASK_TOKEN_SECRET is required when live billing is enabled');
  }
  if (aiLive && !billingLive) {
    throw new Error('AI_LIVE_ENABLED requires BILLING_LIVE_ENABLED so real AI cannot run without ModelCross billing');
  }
  if (aiLive && !aiRelayToken) {
    throw new Error('MODELCROSS_AI_RELAY_TOKEN is required when live AI is enabled');
  }
  if (aiLocalLive && (production || authMode !== 'development')) {
    throw new Error('AI_LOCAL_LIVE_ENABLED is only allowed with AUTH_MODE=development outside production');
  }
  if (aiLocalLive && !aiRelayToken) {
    throw new Error('MODELCROSS_AI_RELAY_TOKEN is required when local live AI is enabled');
  }
  if (enabled && production) {
    if (!env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required in production platform mode');
    if (queueDriver !== 'bullmq') throw new Error('QUEUE_DRIVER=bullmq is required in production platform mode');
    if (storageDriver !== 's3') throw new Error('STORAGE_DRIVER=s3 is required in production platform mode');
    if (taskTokenSecret && taskTokenSecret.length < 32) {
      throw new Error('MODELCROSS_TASK_TOKEN_SECRET must contain at least 32 characters in production');
    }
    if (!assetHostAllowlist.length) {
      throw new Error('ASSET_HOST_ALLOWLIST is required in production platform mode');
    }
  }

  return {
    enabled,
    nodeEnv,
    publicUrl,
    databaseUrl,
    redisUrl: env.REDIS_URL?.trim() || null,
    authMode,
    sessionSecret: sessionKey(rawSessionSecret, production),
    sessionCookieName: env.SESSION_COOKIE_NAME?.trim() || 'museflow_session',
    sessionMaxAgeSeconds: int(env.SESSION_MAX_AGE_SECONDS, 30 * 24 * 60 * 60, 300, 90 * 24 * 60 * 60),
    oidc: {
      issuer,
      clientId,
      clientSecret,
      redirectUri,
      scopes: (env.MODELCROSS_OIDC_SCOPES?.trim() || 'openid profile email modelcross.work modelcross.work.billing')
        .split(/\s+/).filter(Boolean),
    },
    modelCross: {
      baseUrl: modelCrossBase,
      walletUrl: env.MODELCROSS_WALLET_URL?.trim() || `${modelCrossBase}/wallet`,
      ordersUrl: env.MODELCROSS_ORDERS_URL?.trim() || `${modelCrossBase}/usage-logs`,
      accountUrl: env.MODELCROSS_ACCOUNT_URL?.trim() || `${modelCrossBase}/profile`,
      lyricsModel,
      fastModel,
      aiModels,
      taskTokenSecret,
      aiRelayToken,
      billingLive,
      aiLive,
      aiLocalLive,
    },
    musicProvider: { allowDevelopmentFakeProvider, allowDevelopmentDirectProvider },
    storage: {
      driver: storageDriver,
      localDir: path.resolve(env.OBJECT_STORAGE_LOCAL_DIR?.trim() || './data/objects'),
      endpoint,
      presignEndpoint,
      providerUploadUrlsReachable,
      region: env.S3_REGION?.trim() || 'auto',
      bucket: env.S3_BUCKET?.trim() || 'museflow',
      accessKeyId,
      secretAccessKey,
      forcePathStyle: bool(env.S3_FORCE_PATH_STYLE, !!endpoint),
      signedUrlTtlSeconds: int(env.SIGNED_URL_TTL_SECONDS, 300, 30, 3600),
      allowPrivateAssetUrls,
      assetHostAllowlist,
    },
    queue: {
      driver: queueDriver,
      prefix: env.REDIS_KEY_PREFIX?.trim() || `museflow:${nodeEnv}`,
      pollIntervalMs: int(env.MUSIC_POLL_INTERVAL_MS, 4000, 500, 60_000),
      pollLeaseMs: int(env.WORKER_POLL_LEASE_MS, 15 * 60_000, 30_000, 60 * 60_000),
      providerResultGraceMs: int(env.PROVIDER_RESULT_GRACE_MS, 5 * 60_000, 5_000, 60 * 60_000),
      concurrency: int(env.WORKER_CONCURRENCY, 4, 1, 64),
    },
    limits: {
      maxConcurrentGenerations: int(env.MAX_CONCURRENT_GENERATIONS_PER_USER, 2, 1, 32),
      maxConcurrentAiRuns: int(env.MAX_CONCURRENT_AI_RUNS_PER_USER, 4, 1, 32),
      maxReferenceAudioBytesPerUser: int(
        env.MAX_REFERENCE_AUDIO_BYTES_PER_USER,
        500 * 1024 * 1024,
        50 * 1024 * 1024,
        100 * 1024 * 1024 * 1024,
      ),
    },
    runtimeRole,
  };
}
