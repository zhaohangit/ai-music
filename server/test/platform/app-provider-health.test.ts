import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformApp, type PlatformAppDeps } from '../../src/platform/app.js';
import { SunoError } from '../../src/suno.js';
import type { AuthenticatedSession } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const adminSession = (): AuthenticatedSession => ({
  tokenHash: 'provider-health-session',
  user: { ...platformUser('provider-health-admin'), roles: ['admin'] },
  clientId: 'museflow-test',
  accessToken: 'provider-health-access',
  refreshToken: 'provider-health-refresh',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
});

type FailingDependency = 'database' | 'queue' | 'events' | 'storage';

const appFor = (
  suno: { configured: boolean; delegated?: boolean; balance: () => Promise<number | null>; pointsLogs?: (page?: number, pageSize?: number) => Promise<unknown> },
  failingDependency?: FailingDependency,
  session: AuthenticatedSession | null = adminSession(),
  modelCross: Record<string, unknown> = {},
) => createPlatformApp({
  config: testConfig(),
  repository: {
    healthCounts: vi.fn(async () => ({ active: 2, queued: 3 })),
    listModelProfiles: vi.fn(async () => []),
    database: { ready: vi.fn(async () => failingDependency !== 'database') },
  },
  sessions: { authenticate: vi.fn(async () => session) },
  modelCross, music: {}, sunoActions: {}, ai: {},
  storage: { list: vi.fn(async () => {
    if (failingDependency === 'storage') throw new Error('storage unavailable');
    return [];
  }) },
  queue: { ready: vi.fn(async () => failingDependency !== 'queue') },
  events: { ready: vi.fn(async () => failingDependency !== 'events') },
  suno,
  staticDir: null,
  log: () => undefined,
} as unknown as PlatformAppDeps);

describe('Provider health and ModelCross-managed settings', () => {
  it('uses the read-only points endpoint and caches successful health probes', async () => {
    const balance = vi.fn(async () => 77);
    const app = appFor({ configured: true, balance });

    const first = await request(app).get('/api/health');
    const second = await request(app).get('/api/health');

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      configured: true,
      upstreamReachable: true,
      providerAuthenticated: true,
      providerErrorCode: null,
      ready: true,
      balance: null,
    });
    expect(first.body.providerCheckedAt).toEqual(expect.any(String));
    expect(first.body.providerLatencyMs).toEqual(expect.any(Number));
    expect(second.body.balance).toBeNull();
    expect(balance).toHaveBeenCalledOnce();
  });

  it('caches ModelCross gateway status without exposing or repeatedly probing merchant points', async () => {
    const musicProviderStatus = vi.fn(async () => ({
      gatewayEnabled: true,
      billingEnabled: true,
      providerConfigured: true,
      providerReachable: true,
      providerAuthenticated: true,
      errorCode: null,
      checkedAt: new Date().toISOString(),
    }));
    const balance = vi.fn(async () => 999);
    const app = appFor(
      { configured: true, delegated: true, balance },
      undefined,
      adminSession(),
      { musicProviderStatus },
    );

    const [first, second] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/health'),
    ]);

    expect(first.body).toMatchObject({
      configured: true,
      upstreamReachable: true,
      providerAuthenticated: true,
      balance: null,
    });
    expect(second.body.providerAuthenticated).toBe(true);
    expect(musicProviderStatus).toHaveBeenCalledOnce();
    expect(balance).not.toHaveBeenCalled();
  });

  it('fails closed when ModelCross reports authentication without an enabled gateway contract', async () => {
    const musicProviderStatus = vi.fn(async () => ({
      gatewayEnabled: false,
      billingEnabled: true,
      providerConfigured: true,
      providerReachable: true,
      providerAuthenticated: true,
      errorCode: 'gateway_disabled',
      checkedAt: new Date().toISOString(),
    }));
    const app = appFor(
      { configured: true, delegated: true, balance: vi.fn(async () => 999) },
      undefined,
      adminSession(),
      { musicProviderStatus },
    );

    const [health, readiness] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/health/ready'),
    ]);

    expect(health.body).toMatchObject({
      configured: false,
      upstreamReachable: true,
      providerAuthenticated: true,
      ready: false,
      musicMutationsExecutable: false,
    });
    expect(readiness.status).toBe(503);
    expect(readiness.body.checks).toMatchObject({
      provider: false,
      providerConfigured: false,
      musicMutations: false,
    });
  });

  it('distinguishes a reachable Provider with rejected credentials from mere configuration', async () => {
    const app = appFor({
      configured: true,
      balance: vi.fn(async () => { throw new SunoError('secret must not be exposed', 401); }),
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configured: true,
      upstreamReachable: true,
      providerAuthenticated: false,
      providerErrorCode: 'provider_auth_failed',
      ready: false,
      balance: null,
      error: 'music provider health check failed',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret must not be exposed');
  });

  it('keeps public health and music mutations fail-closed for every middleware dependency', async () => {
    for (const dependency of ['database', 'queue', 'events', 'storage'] as const) {
      const app = appFor({ configured: true, balance: vi.fn(async () => 100) }, dependency);
      const [publicHealth, readiness] = await Promise.all([
        request(app).get('/api/health'),
        request(app).get('/health/ready'),
      ]);

      expect(publicHealth.status).toBe(200);
      expect(publicHealth.body).toMatchObject({
        ready: false,
        musicMutationsExecutable: false,
        dependencies: { [dependency]: false },
      });
      expect(readiness.status).toBe(503);
      expect(readiness.body.checks[dependency]).toBe(false);
      expect(readiness.body.checks.musicMutations).toBe(false);
    }
  });

  it('reports truthful ModelCross ownership and lets admins force a non-mutating probe', async () => {
    const balance = vi.fn(async () => 123);
    const app = appFor({ configured: true, balance });

    const settings = await request(app).get('/api/settings');
    const probe = await request(app).post('/api/settings/test');

    expect(settings.body).toMatchObject({
      apiBaseUrl: '', apiKeySet: true, platformManaged: true,
      managedBy: 'modelcross', adminUrl: null, providerConfigured: true,
    });
    expect(probe.body).toMatchObject({
      ok: true, provider: 'MXAPI / Suno', configured: true,
      reachable: true, authenticated: true, balance: 123, errorCode: null,
    });
    expect(probe.body.checkedAt).toEqual(expect.any(String));
    expect(balance).toHaveBeenCalledOnce();
  });

  it('exposes V2 provider points diagnostics only through the administrator route', async () => {
    const balance = vi.fn(async () => 123);
    const pointsLogs = vi.fn(async (page = 1, pageSize = 20) => ({
      list: [{ id: 'ledger-1', amount: -20 }],
      pagination: { page, pageSize, total: 1, totalPages: 1 },
    }));
    const app = appFor({ configured: true, balance, pointsLogs });

    const response = await request(app).get('/api/admin/provider/points?page=2&pageSize=40');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      balance: 123,
      logs: {
        list: [{ id: 'ledger-1', amount: -20 }],
        pagination: { page: 2, pageSize: 40, total: 1, totalPages: 1 },
      },
    });
    expect(pointsLogs).toHaveBeenCalledWith(2, 40);

    await expect(request(app).get('/api/admin/provider/points?pageSize=101')).resolves.toMatchObject({ status: 400 });
    expect(pointsLogs).toHaveBeenCalledOnce();

    const userApp = appFor({ configured: true, balance, pointsLogs }, undefined, {
      ...adminSession(), user: { ...adminSession().user, roles: ['user'] },
    });
    await expect(request(userApp).get('/api/admin/provider/points')).resolves.toMatchObject({ status: 403 });
  });
});
