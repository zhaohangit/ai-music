import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformApp, type PlatformAppDeps } from '../../src/platform/app.js';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { AccountSummary, AuthenticatedSession } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const appDeps = (overrides: Partial<PlatformAppDeps>): PlatformAppDeps => ({
  repository: {}, sessions: {}, modelCross: {}, music: {}, sunoActions: {}, ai: {}, storage: {}, queue: {}, events: {},
  suno: { configured: false }, staticDir: null, log: () => undefined,
  ...overrides,
} as unknown as PlatformAppDeps);

describe('ModelCross account read boundary', () => {
  it('publishes advanced sliders only for the V4.5+ models documented by MXAPI', () => {
    for (const profile of DEFAULT_MUSIC_MODEL_PROFILES.filter((item) =>
      ['chirp-fenix', 'chirp-crow', 'chirp-bluejay', 'chirp-auk', 'chirp-auk-turbo'].includes(item.id))) {
      expect(profile.capabilities.styleWeight, `${profile.id} styleWeight`).toEqual({ min: 0, max: 1, default: 0.65 });
      expect(profile.capabilities.weirdness, `${profile.id} weirdness`).toEqual({ min: 0, max: 1, default: 0.5 });
    }
    for (const profile of DEFAULT_MUSIC_MODEL_PROFILES.filter((item) =>
      ['chirp-v4', 'chirp-v3-5', 'chirp-v3-0'].includes(item.id))) {
      expect(profile.capabilities.styleWeight, `${profile.id} styleWeight`).toBeUndefined();
      expect(profile.capabilities.weirdness, `${profile.id} weirdness`).toBeUndefined();
    }
    expect(DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-v4')?.capabilities.operations)
      .toContain('remaster');
    expect(DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-crow')?.capabilities.operations)
      .toContain('remaster');
    expect(DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-fenix')?.capabilities.operations)
      .toContain('remaster');
    for (const id of ['chirp-v3-5', 'chirp-v3-0']) {
      expect(DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === id)?.capabilities.operations)
        .not.toContain('remaster');
    }
  });

  it('reads the authoritative account in OIDC mode while live billing mutations are disabled', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc', BILLING_LIVE_ENABLED: 'false' });
    const session: AuthenticatedSession = {
      tokenHash: 'opaque-session-hash',
      user: platformUser('oidc-account-user'),
      clientId: config.oidc.clientId,
      accessToken: 'oidc-account-access',
      refreshToken: 'oidc-account-refresh',
      idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const account: AccountSummary = {
      balanceCredits: 321,
      reservedCredits: 9,
      displayBalance: '321',
      unit: 'credits',
      subscription: null,
      entitlements: {},
      walletUrl: 'https://account.example.test/wallet',
      ordersUrl: 'https://account.example.test/orders',
      accountUrl: 'https://account.example.test/account',
      lastUsage: null,
    };
    const accountRequest = vi.fn(async () => account);
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => session) },
      modelCross: { account: accountRequest },
    }));

    const response = await request(app).get('/api/session');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authenticated: true,
      account: { balance: 330, availableBalance: 321, reservedBalance: 9 },
      demo: false,
    });
    expect(accountRequest).toHaveBeenCalledOnce();
    expect(accountRequest).toHaveBeenCalledWith('oidc-account-access');
  });

  it('bypasses the short account cache when the wallet return refresh is explicit', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc', BILLING_LIVE_ENABLED: 'false' });
    const session: AuthenticatedSession = {
      tokenHash: 'wallet-refresh-session-hash', user: platformUser('wallet-refresh-user'),
      clientId: config.oidc.clientId, accessToken: 'wallet-refresh-access', refreshToken: null,
      idToken: null, accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const baseAccount: AccountSummary = {
      balanceCredits: 10, reservedCredits: 0, displayBalance: '10', unit: 'credits',
      subscription: null, entitlements: {}, walletUrl: config.modelCross.walletUrl,
      ordersUrl: config.modelCross.ordersUrl, accountUrl: config.modelCross.accountUrl, lastUsage: null,
    };
    const accountRequest = vi.fn()
      .mockResolvedValueOnce(baseAccount)
      .mockResolvedValueOnce({ ...baseAccount, balanceCredits: 510, displayBalance: '510' });
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => session) },
      repository: { billingStats: vi.fn(async () => ({ monthSpent: 0, monthGeneratedTracks: 0, pendingReservations: 0 })) },
      modelCross: { account: accountRequest },
    }));

    expect((await request(app).get('/api/session')).body.account.availableBalance).toBe(10);
    const refreshed = await request(app).get('/api/billing/summary?refresh=1');

    expect(refreshed.status).toBe(200);
    expect(refreshed.headers['cache-control']).toBe('no-store');
    expect(refreshed.body.account.availableBalance).toBe(510);
    expect(accountRequest).toHaveBeenCalledTimes(2);
  });

  it('force-refreshes a revoked ModelCross access token before clearing the browser session', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc', BILLING_LIVE_ENABLED: 'false' });
    const staleSession: AuthenticatedSession = {
      tokenHash: 'stale-session-hash', user: platformUser('stale-session-user'),
      clientId: config.oidc.clientId, accessToken: 'stale-access', refreshToken: 'refresh-token', idToken: null,
      accessExpiresAt: new Date(Date.now() + 10 * 60_000), refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const refreshedSession: AuthenticatedSession = {
      ...staleSession, tokenHash: 'refreshed-session-hash', accessToken: 'refreshed-access',
    };
    const authenticate = vi.fn(async (_req: unknown, _res: unknown, options?: { forceRefresh?: boolean }) =>
      options?.forceRefresh ? refreshedSession : staleSession);
    const account = (balanceCredits: number): AccountSummary => ({
      balanceCredits, reservedCredits: 0, displayBalance: String(balanceCredits), unit: 'credits',
      subscription: null, entitlements: {}, walletUrl: config.modelCross.walletUrl,
      ordersUrl: config.modelCross.ordersUrl, accountUrl: config.modelCross.accountUrl, lastUsage: null,
    });
    const accountRequest = vi.fn(async (accessToken: string) => {
      if (accessToken === 'stale-access') throw Object.assign(new Error('access token revoked'), { status: 401 });
      return account(900);
    });
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate, logout: vi.fn(async () => undefined) },
      modelCross: { account: accountRequest },
    }));

    const response = await request(app).get('/api/session');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ authenticated: true, account: { availableBalance: 900 } });
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(authenticate.mock.calls[1]?.[2]).toEqual({ forceRefresh: true });
    expect(accountRequest).toHaveBeenNthCalledWith(1, 'stale-access');
    expect(accountRequest).toHaveBeenNthCalledWith(2, 'refreshed-access');
  });

  it('redirects an authenticated top-up request to the configured ModelCross wallet', async () => {
    const walletUrl = 'https://account.example.test/wallet?source=museflow';
    const config = testConfig({
      AUTH_MODE: 'oidc',
      MODELCROSS_WALLET_URL: walletUrl,
    });
    const session: AuthenticatedSession = {
      tokenHash: 'topup-session-hash',
      user: platformUser('topup-account-user'),
      clientId: config.oidc.clientId,
      accessToken: 'topup-account-access',
      refreshToken: 'topup-account-refresh',
      idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const account: AccountSummary = {
      balanceCredits: 321,
      reservedCredits: 9,
      displayBalance: '321',
      unit: 'credits',
      subscription: null,
      entitlements: {},
      walletUrl: config.modelCross.walletUrl,
      ordersUrl: config.modelCross.ordersUrl,
      accountUrl: config.modelCross.accountUrl,
      lastUsage: null,
    };
    const authenticate = vi.fn(async () => session);
    const accountRequest = vi.fn(async () => account);
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate },
      modelCross: { account: accountRequest },
    }));

    const response = await request(app).get('/api/billing/topup');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(walletUrl);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(accountRequest).toHaveBeenCalledOnce();
    expect(accountRequest).toHaveBeenCalledWith('topup-account-access');
  });

  it('rejects an unauthenticated top-up request without reading the ModelCross account', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const authenticate = vi.fn(async () => null);
    const accountRequest = vi.fn();
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate } as unknown as PlatformAppDeps['sessions'],
      modelCross: { account: accountRequest } as unknown as PlatformAppDeps['modelCross'],
    }));

    const response = await request(app).get('/api/billing/topup');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication required' });
    expect(response.headers.location).toBeUndefined();
    expect(authenticate).toHaveBeenCalledOnce();
    expect(accountRequest).not.toHaveBeenCalled();
  });

  it('returns only the ModelCross-authorized intersection of locally supported music models', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const session: AuthenticatedSession = {
      tokenHash: 'model-catalog-session',
      user: platformUser('model-catalog-owner'),
      clientId: config.oidc.clientId,
      accessToken: 'model-catalog-access',
      refreshToken: 'model-catalog-refresh',
      idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const musicModelIds = vi.fn(async () => ['chirp-fenix', 'chirp-v4', 'not-supported-by-museflow']);
    const listModelProfiles = vi.fn(async () => DEFAULT_MUSIC_MODEL_PROFILES);
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => session) } as unknown as PlatformAppDeps['sessions'],
      modelCross: { musicModelIds } as unknown as PlatformAppDeps['modelCross'],
      repository: { listModelProfiles } as unknown as PlatformAppDeps['repository'],
    }));

    const response = await request(app).get('/api/catalog/music-models');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.map((model: { id: string }) => model.id)).toEqual(['chirp-fenix', 'chirp-v4']);
    expect(response.body[0].capabilities.operations).toEqual(expect.arrayContaining([
      'sound', 'upload', 'upload_extend', 'whole_song', 'crop', 'speed',
      'aligned_lyrics', 'video', 'convert_wav',
    ]));
    expect(response.body[0].capabilities.maxTitleLength).toBe(100);
    expect(response.body[1].capabilities.maxTitleLength).toBe(80);
    expect(musicModelIds).toHaveBeenCalledWith('model-catalog-access');
    expect(listModelProfiles).toHaveBeenCalledOnce();
  });

  it('does not expose the local model list to an unauthenticated OIDC request', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const listModelProfiles = vi.fn(async () => DEFAULT_MUSIC_MODEL_PROFILES);
    const musicModelIds = vi.fn();
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => null) } as unknown as PlatformAppDeps['sessions'],
      modelCross: { musicModelIds } as unknown as PlatformAppDeps['modelCross'],
      repository: { listModelProfiles } as unknown as PlatformAppDeps['repository'],
    }));

    const response = await request(app).get('/api/catalog/music-models');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication required' });
    expect(musicModelIds).not.toHaveBeenCalled();
    expect(listModelProfiles).not.toHaveBeenCalled();
  });

  it('fails closed when the authoritative ModelCross model catalog cannot be read', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const session = {
      tokenHash: 'failed-model-catalog-session', user: platformUser('failed-model-catalog-owner'),
      clientId: config.oidc.clientId, accessToken: 'failed-model-catalog-access', refreshToken: 'refresh', idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000), refreshExpiresAt: new Date(Date.now() + 3_600_000),
    } satisfies AuthenticatedSession;
    const listModelProfiles = vi.fn(async () => DEFAULT_MUSIC_MODEL_PROFILES);
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => session) } as unknown as PlatformAppDeps['sessions'],
      modelCross: {
        musicModelIds: vi.fn(async () => {
          throw Object.assign(new Error('upstream ModelCross internal details'), { status: 503 });
        }),
      } as unknown as PlatformAppDeps['modelCross'],
      repository: { listModelProfiles } as unknown as PlatformAppDeps['repository'],
    }));

    const response = await request(app)
      .get('/api/catalog/music-models')
      .set('X-Request-ID', 'model-catalog-request-1');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'music model catalog unavailable',
      requestId: 'model-catalog-request-1',
    });
    expect(response.body.error).not.toContain('upstream ModelCross internal details');
    expect(response.headers['x-request-id']).toBe('model-catalog-request-1');
    expect(listModelProfiles).not.toHaveBeenCalled();
  });

  it('returns seven dynamically priced AI actions only when catalog, billing and model authorization all agree', async () => {
    const config = testConfig({
      AUTH_MODE: 'oidc',
      BILLING_LIVE_ENABLED: 'true',
      AI_LIVE_ENABLED: 'true',
      MODELCROSS_TASK_TOKEN_SECRET: 'test-task-token-secret-with-more-than-32-characters',
      MODELCROSS_AI_RELAY_TOKEN: 'test-deployment-ai-relay-token',
    });
    const session = {
      tokenHash: 'ai-catalog-session', user: platformUser('ai-catalog-owner'),
      clientId: config.oidc.clientId, accessToken: 'ai-catalog-access', refreshToken: 'refresh', idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000), refreshExpiresAt: new Date(Date.now() + 3_600_000),
    } satisfies AuthenticatedSession;
    const musicOperationCatalog = vi.fn(async (_token: string, requested: Array<{
      action: string; operationCode: string; fallbackCredits: number;
    }>) => requested.map((entry) => ({
      ...entry,
      available: true,
      estimatedCredits: entry.fallbackCredits,
      priceVersion: 'modelcross-ai-v7',
      chargingEnabled: true,
      preview: false,
    })));
    const musicModelIds = vi.fn(async () => ['mc-music-lyrics', 'mc-music-fast']);
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => session) } as unknown as PlatformAppDeps['sessions'],
      modelCross: { musicOperationCatalog, musicModelIds } as unknown as PlatformAppDeps['modelCross'],
    }));

    const modelsResponse = await request(app).get('/api/catalog/ai-models');
    const response = await request(app).get('/api/catalog/ai-operations');

    expect(modelsResponse.status).toBe(200);
    expect(modelsResponse.body).toEqual([
      expect.objectContaining({
        id: 'mc-music-lyrics', enabled: true, defaultForLyrics: true,
      }),
      expect.objectContaining({
        id: 'mc-music-fast', enabled: true, defaultForFastTasks: true,
      }),
    ]);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toHaveLength(7);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'lyrics.generate', operationCode: 'lyrics_generate', estimatedCredits: 2,
        model: 'mc-music-lyrics', modelAuthorized: true, chargingEnabled: true,
        available: true, executable: true, previewExecutable: false,
        parameters: expect.objectContaining({
          language: expect.objectContaining({ default: 'zh-CN' }),
          length: expect.objectContaining({ default: 'medium' }),
        }),
      }),
      expect.objectContaining({
        action: 'prompt.optimize', operationCode: 'prompt_optimize', estimatedCredits: 1,
        model: 'mc-music-fast', modelAuthorized: true, available: true,
      }),
    ]));
    expect(musicOperationCatalog).toHaveBeenCalledWith('ai-catalog-access', expect.arrayContaining([
      expect.objectContaining({ action: 'lyrics.continue', operationCode: 'lyrics_rewrite', fallbackCredits: 1 }),
      expect.objectContaining({ action: 'style.suggest', operationCode: 'prompt_optimize', fallbackCredits: 1 }),
    ]));
    expect(musicModelIds).toHaveBeenCalledWith('ai-catalog-access');
    expect(musicModelIds).toHaveBeenCalledWith('test-deployment-ai-relay-token');
  });

  it('keeps ModelCross AI prices visible but disables execution when the OIDC rollout gates are off', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc', BILLING_LIVE_ENABLED: 'false', AI_LIVE_ENABLED: 'false' });
    const session = {
      tokenHash: 'ai-preview-session', user: platformUser('ai-preview-owner'),
      clientId: config.oidc.clientId, accessToken: 'ai-preview-access', refreshToken: 'refresh', idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000), refreshExpiresAt: new Date(Date.now() + 3_600_000),
    } satisfies AuthenticatedSession;
    const app = createPlatformApp(appDeps({
      config,
      sessions: { authenticate: vi.fn(async () => session) } as unknown as PlatformAppDeps['sessions'],
      modelCross: {
        musicOperationCatalog: vi.fn(async (_token: string, requested: Array<{
          action: string; operationCode: string; fallbackCredits: number;
        }>) => requested.map((entry) => ({
          ...entry,
          available: true,
          estimatedCredits: entry.fallbackCredits,
          priceVersion: 'modelcross-ai-preview-v2',
          chargingEnabled: false,
          preview: true,
          reason: 'ModelCross 当前仅开放价格预览，真实扣费已关闭',
        }))),
        musicModelIds: vi.fn(async () => ['mc-music-lyrics', 'mc-music-fast']),
      } as unknown as PlatformAppDeps['modelCross'],
    }));

    const response = await request(app).get('/api/catalog/ai-operations');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(7);
    expect(response.body.every((entry: { available: boolean }) => entry.available === false)).toBe(true);
    expect(response.body.every((entry: { previewExecutable: boolean }) => entry.previewExecutable === false)).toBe(true);
    expect(response.body.every((entry: { estimatedCredits: number }) => entry.estimatedCredits === 1 || entry.estimatedCredits === 2)).toBe(true);
    expect(response.body[0]).toMatchObject({
      catalogAvailable: true,
      chargingEnabled: false,
      reason: 'AI 真实调用尚未启用',
    });
  });
});
