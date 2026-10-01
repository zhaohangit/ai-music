import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPlatformConfig } from '../../src/platform/config.js';
import { BASE_DEVELOPMENT_ENV } from './helpers.js';

const productionEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  PLATFORM_MODE: 'true',
  PUBLIC_URL: 'https://music.example.test',
  DATABASE_URL: 'postgres://museflow:secret@db.example.test:5432/museflow',
  AUTH_MODE: 'oidc',
  MUSEFLOW_SESSION_SECRET: 'production-session-secret-that-is-at-least-32-characters',
  MODELCROSS_OIDC_ISSUER: 'https://identity.example.test',
  MODELCROSS_BASE_URL: 'https://api.example.test',
  MODELCROSS_OIDC_CLIENT_ID: 'museflow-production',
  MODELCROSS_OIDC_CLIENT_SECRET: 'production-oidc-client-secret',
  MODELCROSS_TASK_TOKEN_SECRET: 'production-task-token-secret-that-is-at-least-32-characters',
  STORAGE_DRIVER: 's3',
  S3_REGION: 'auto',
  S3_BUCKET: 'private-museflow',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  ASSET_HOST_ALLOWLIST: 'cdn.example.test',
  QUEUE_DRIVER: 'bullmq',
  REDIS_URL: 'redis://cache.example.test:6379/0',
  ...overrides,
});

describe('platform configuration security gates', () => {
  it('forbids development authentication and plaintext public/OIDC URLs in production', () => {
    expect(() => loadPlatformConfig(productionEnv({ AUTH_MODE: 'development' })))
      .toThrow('AUTH_MODE=development is forbidden in production');
    expect(() => loadPlatformConfig(productionEnv({ PUBLIC_URL: 'http://music.example.test' })))
      .toThrow('PUBLIC_URL must use https');
    expect(() => loadPlatformConfig(productionEnv({ MODELCROSS_OIDC_ISSUER: 'http://identity.example.test' })))
      .toThrow('MODELCROSS_OIDC_ISSUER must use https');
  });

  it('requires the OIDC callback to use the exact MuseFlow origin and callback path', () => {
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_OIDC_REDIRECT_URI: 'http://localhost:8787/api/auth/callback',
    })).toThrow('MODELCROSS_OIDC_REDIRECT_URI must use the same origin as PUBLIC_URL');
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_OIDC_REDIRECT_URI: 'http://127.0.0.1:8788/api/auth/callback',
    })).toThrow('MODELCROSS_OIDC_REDIRECT_URI must use the same origin as PUBLIC_URL');
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_OIDC_REDIRECT_URI: 'http://127.0.0.1:8787/oauth/callback',
    })).toThrow('MODELCROSS_OIDC_REDIRECT_URI must use the /api/auth/callback path');
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_OIDC_REDIRECT_URI: 'http://127.0.0.1:8787/api/auth/callback?source=oidc',
    })).toThrow('MODELCROSS_OIDC_REDIRECT_URI must use the /api/auth/callback path');
  });

  it('requires production secrets and private S3 credentials', () => {
    expect(() => loadPlatformConfig(productionEnv({ MUSEFLOW_SESSION_SECRET: '' })))
      .toThrow('MUSEFLOW_SESSION_SECRET is required');
    expect(() => loadPlatformConfig(productionEnv({ MUSEFLOW_SESSION_SECRET: 'too-short' })))
      .toThrow('at least 32 characters');
    expect(() => loadPlatformConfig(productionEnv({ MODELCROSS_OIDC_CLIENT_SECRET: '' })))
      .toThrow('MODELCROSS_OIDC_CLIENT_SECRET is required');
    expect(() => loadPlatformConfig(productionEnv({ S3_ACCESS_KEY_ID: '' })))
      .toThrow('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required');
  });

  it('rejects checked-in defaults and obvious example secrets in production', () => {
    expect(() => loadPlatformConfig(productionEnv({
      MUSEFLOW_SESSION_SECRET: 'museflow-development-session-secret-change-me',
    }))).toThrow('MUSEFLOW_SESSION_SECRET must not use a default or example value in production');
    expect(() => loadPlatformConfig(productionEnv({
      MODELCROSS_OIDC_CLIENT_SECRET: 'modelcross-example-client-secret',
    }))).toThrow('MODELCROSS_OIDC_CLIENT_SECRET must not use a default or example value in production');
    expect(() => loadPlatformConfig(productionEnv({
      MODELCROSS_TASK_TOKEN_SECRET: 'default-task-token-secret-that-is-long-enough-for-production',
    }))).toThrow('MODELCROSS_TASK_TOKEN_SECRET must not use a default or example value in production');
    expect(() => loadPlatformConfig(productionEnv({
      MODELCROSS_AI_RELAY_TOKEN: 'example-ai-relay-token-for-production',
    }))).toThrow('MODELCROSS_AI_RELAY_TOKEN must not use a default or example value in production');
    expect(() => loadPlatformConfig(productionEnv({
      S3_SECRET_ACCESS_KEY: 'museflow-minio-change-me',
    }))).toThrow('S3_SECRET_ACCESS_KEY must not use a default or example value in production');
    expect(() => loadPlatformConfig(productionEnv({
      DATABASE_URL: 'postgresql://museflow:museflow-local-change-me@db.example.test:5432/museflow',
    }))).toThrow('DATABASE_URL password must not use a default or example value in production');
  });

  it('leaves optional secrets optional and does not apply production sentinels in development', () => {
    const productionWithoutOptionalIntegrations = loadPlatformConfig(productionEnv({
      PLATFORM_MODE: 'false',
      DATABASE_URL: '',
      QUEUE_DRIVER: 'inline',
      REDIS_URL: '',
      STORAGE_DRIVER: 'local',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      MODELCROSS_TASK_TOKEN_SECRET: '',
      MODELCROSS_AI_RELAY_TOKEN: '',
      ASSET_HOST_ALLOWLIST: '',
    }));
    expect(productionWithoutOptionalIntegrations.modelCross.taskTokenSecret).toBeNull();
    expect(productionWithoutOptionalIntegrations.modelCross.aiRelayToken).toBeNull();
    expect(productionWithoutOptionalIntegrations.storage.secretAccessKey).toBeNull();

    const development = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MUSEFLOW_SESSION_SECRET: 'change-me',
      MODELCROSS_OIDC_CLIENT_SECRET: 'example-client-secret',
      MODELCROSS_TASK_TOKEN_SECRET: 'default-task-token-secret',
      MODELCROSS_AI_RELAY_TOKEN: 'default-ai-relay-token',
      S3_SECRET_ACCESS_KEY: 'sample-storage-secret',
    });
    expect(development.modelCross.taskTokenSecret).toBe('default-task-token-secret');
    expect(development.modelCross.aiRelayToken).toBe('default-ai-relay-token');
    expect(development.storage.secretAccessKey).toBe('sample-storage-secret');
  });

  it('requires Redis for BullMQ and rejects invalid bounded integer values', () => {
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, QUEUE_DRIVER: 'bullmq', REDIS_URL: '' }))
      .toThrow('REDIS_URL is required for BullMQ');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, WORKER_CONCURRENCY: '0' }))
      .toThrow('invalid integer configuration value');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, SIGNED_URL_TTL_SECONDS: '999999' }))
      .toThrow('invalid integer configuration value');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, WORKER_POLL_LEASE_MS: '1000' }))
      .toThrow('invalid integer configuration value');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, PROVIDER_RESULT_GRACE_MS: '1000' }))
      .toThrow('invalid integer configuration value');
  });

  it('fails closed for Provider upload URLs unless S3 signing has a reachable endpoint', () => {
    const internalOnly = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://minio:9000',
      S3_ACCESS_KEY_ID: 'test-access',
      S3_SECRET_ACCESS_KEY: 'test-secret',
    });
    expect(internalOnly.storage.providerUploadUrlsReachable).toBe(false);

    const publicSigner = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://minio:9000',
      S3_PRESIGN_ENDPOINT: 'https://assets.example.test',
      S3_ACCESS_KEY_ID: 'test-access',
      S3_SECRET_ACCESS_KEY: 'test-secret',
    });
    expect(publicSigner.storage.presignEndpoint).toBe('https://assets.example.test');
    expect(publicSigner.storage.providerUploadUrlsReachable).toBe(true);

    expect(() => loadPlatformConfig(productionEnv({
      S3_ENDPOINT: 'https://storage.example.test',
      S3_PRESIGN_ENDPOINT: 'http://assets.example.test',
    }))).toThrow('S3_PRESIGN_ENDPOINT must use https');
  });

  it('requires durable PostgreSQL, BullMQ/Redis and S3 in production platform mode', () => {
    expect(() => loadPlatformConfig(productionEnv({ DATABASE_URL: '' })))
      .toThrow('DATABASE_URL is required in production platform mode');
    expect(() => loadPlatformConfig(productionEnv({ QUEUE_DRIVER: 'inline' })))
      .toThrow('QUEUE_DRIVER=bullmq is required in production platform mode');
    expect(() => loadPlatformConfig(productionEnv({ STORAGE_DRIVER: 'local' })))
      .toThrow('STORAGE_DRIVER=s3 is required in production platform mode');
    expect(() => loadPlatformConfig(productionEnv({ ASSET_HOST_ALLOWLIST: '' })))
      .toThrow('ASSET_HOST_ALLOWLIST is required in production platform mode');
  });

  it('requires a deployment-managed task-token secret for live billing', () => {
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      BILLING_LIVE_ENABLED: 'true',
      MODELCROSS_TASK_TOKEN_SECRET: '',
    })).toThrow('MODELCROSS_TASK_TOKEN_SECRET is required when live billing is enabled');
    expect(() => loadPlatformConfig(productionEnv({ MODELCROSS_TASK_TOKEN_SECRET: 'too-short' })))
      .toThrow('MODELCROSS_TASK_TOKEN_SECRET must contain at least 32 characters');
  });

  it('never permits real AI without the ModelCross billing gate', () => {
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      AI_LIVE_ENABLED: 'true',
      BILLING_LIVE_ENABLED: 'false',
    })).toThrow('AI_LIVE_ENABLED requires BILLING_LIVE_ENABLED');
  });

  it('requires a separate deployment AI Relay token for live AI', () => {
    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      AI_LIVE_ENABLED: 'true',
      BILLING_LIVE_ENABLED: 'true',
      MODELCROSS_TASK_TOKEN_SECRET: 'billing-task-token-secret',
      MODELCROSS_AI_RELAY_TOKEN: '',
    })).toThrow('MODELCROSS_AI_RELAY_TOKEN is required when live AI is enabled');

    const configured = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      AI_LIVE_ENABLED: 'true',
      BILLING_LIVE_ENABLED: 'true',
      MODELCROSS_TASK_TOKEN_SECRET: 'billing-task-token-secret',
      MODELCROSS_AI_RELAY_TOKEN: 'deployment-ai-relay-token',
    });
    expect(configured.modelCross.aiRelayToken).toBe('deployment-ai-relay-token');
  });

  it('allows explicitly enabled local direct AI only in development', () => {
    const configured = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      AI_LOCAL_LIVE_ENABLED: 'true',
      MODELCROSS_AI_RELAY_TOKEN: 'local-ai-relay-token',
    });
    expect(configured.modelCross.aiLocalLive).toBe(true);
    expect(configured.modelCross.billingLive).toBe(false);

    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      AI_LOCAL_LIVE_ENABLED: 'true',
      MODELCROSS_AI_RELAY_TOKEN: '',
    })).toThrow('MODELCROSS_AI_RELAY_TOKEN is required when local live AI is enabled');

    expect(() => loadPlatformConfig(productionEnv({
      AI_LOCAL_LIVE_ENABLED: 'true',
      MODELCROSS_AI_RELAY_TOKEN: 'production-ai-relay-token',
    }))).toThrow('AI_LOCAL_LIVE_ENABLED is only allowed');
  });

  it('keeps direct development Provider access opt-in and development-only', () => {
    expect(loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      ALLOW_DEVELOPMENT_DIRECT_PROVIDER: 'true',
    }).musicProvider.allowDevelopmentDirectProvider).toBe(true);
    expect(loadPlatformConfig(productionEnv({
      ALLOW_DEVELOPMENT_DIRECT_PROVIDER: 'true',
    })).musicProvider.allowDevelopmentDirectProvider).toBe(false);
  });

  it('keeps the curated AI model list canonical and includes both defaults', () => {
    const configured = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_LYRICS_MODEL: 'gpt-5.4',
      MODELCROSS_FAST_MODEL: 'gemini-3-flash-preview',
      MODELCROSS_AI_MODELS: 'gpt-5.4,gpt-5.6-sol,gemini-3-flash-preview,gpt-5.4',
    });
    expect(configured.modelCross.aiModels).toEqual([
      'gpt-5.4', 'gpt-5.6-sol', 'gemini-3-flash-preview',
    ]);

    expect(() => loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_LYRICS_MODEL: 'gpt-5.4',
      MODELCROSS_FAST_MODEL: 'gemini-3-flash-preview',
      MODELCROSS_AI_MODELS: 'gpt-5.4',
    })).toThrow('must include MODELCROSS_LYRICS_MODEL and MODELCROSS_FAST_MODEL');
  });

  it('does not enable real billing or AI implicitly and derives, rather than stores, the session key', () => {
    const rawSecret = BASE_DEVELOPMENT_ENV.MUSEFLOW_SESSION_SECRET!;
    const config = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      OBJECT_STORAGE_LOCAL_DIR: './relative-test-objects',
      ASSET_HOST_ALLOWLIST: ' cdn.example.test, MEDIA.example.test ',
      MODELCROSS_OIDC_SCOPES: 'openid profile modelcross.work modelcross.work.billing',
    });

    expect(config.modelCross.billingLive).toBe(false);
    expect(config.modelCross.aiLive).toBe(false);
    expect(config.sessionSecret).toEqual(createHash('sha256').update(rawSecret).digest());
    expect(config.sessionSecret.toString('utf8')).not.toContain(rawSecret);
    expect(config.storage.localDir).toBe(path.resolve('./relative-test-objects'));
    expect(config.storage.assetHostAllowlist).toEqual(['cdn.example.test', 'media.example.test']);
    expect(config.oidc.scopes).toContain('modelcross.work.billing');
  });

  it('uses the current ModelCross account, wallet, and usage routes by default', () => {
    const config = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_OIDC_ISSUER: undefined,
      MODELCROSS_BASE_URL: undefined,
      MODELCROSS_ACCOUNT_URL: undefined,
      MODELCROSS_WALLET_URL: undefined,
      MODELCROSS_ORDERS_URL: undefined,
    });

    expect(config.oidc.issuer).toBe('http://modelcross.localhost:3000');
    expect(config.modelCross.baseUrl).toBe('http://modelcross.localhost:3000');
    expect(config.modelCross.accountUrl).toBe('http://modelcross.localhost:3000/profile');
    expect(config.modelCross.walletUrl).toBe('http://modelcross.localhost:3000/wallet');
    expect(config.modelCross.ordersUrl).toBe('http://modelcross.localhost:3000/usage-logs');
  });

  it('allows the canonical browser-facing ModelCross hostname for OIDC and wallet links', () => {
    const config = loadPlatformConfig({
      ...BASE_DEVELOPMENT_ENV,
      MODELCROSS_OIDC_ISSUER: 'http://modelcross.localhost:3000',
      MODELCROSS_BASE_URL: 'http://modelcross.localhost:3000',
      MODELCROSS_ACCOUNT_URL: 'http://modelcross.localhost:3000/profile',
      MODELCROSS_WALLET_URL: 'http://modelcross.localhost:3000/wallet',
      MODELCROSS_ORDERS_URL: 'http://modelcross.localhost:3000/usage-logs',
    });

    expect(config.oidc.issuer).toBe('http://modelcross.localhost:3000');
    expect(config.modelCross.accountUrl).toBe('http://modelcross.localhost:3000/profile');
  });

  it('rejects URL credentials and unknown storage, queue, auth, and runtime modes', () => {
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, PUBLIC_URL: 'http://user:pass@localhost:8787' }))
      .toThrow('PUBLIC_URL must not contain credentials');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, AUTH_MODE: 'magic' }))
      .toThrow('AUTH_MODE must be oidc or development');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, STORAGE_DRIVER: 'public-disk' }))
      .toThrow('STORAGE_DRIVER must be s3 or local');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, QUEUE_DRIVER: 'memory' }))
      .toThrow('QUEUE_DRIVER must be bullmq or inline');
    expect(() => loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, RUNTIME_ROLE: 'sidecar' }))
      .toThrow('RUNTIME_ROLE must be api, worker, or all');
  });
});
