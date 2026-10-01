import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformApp, type PlatformAppDeps } from '../../src/platform/app.js';
import type { AuthenticatedSession } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const appDeps = (overrides: Partial<PlatformAppDeps>): PlatformAppDeps => ({
  config: testConfig({ AUTH_MODE: 'oidc' }),
  repository: { consumeRateLimit: vi.fn(async () => 1) },
  sessions: {},
  modelCross: {},
  music: {},
  sunoActions: {},
  ai: {},
  storage: {},
  queue: {},
  events: {},
  suno: { configured: false },
  staticDir: null,
  log: () => undefined,
  ...overrides,
} as unknown as PlatformAppDeps);

describe('authentication entrypoint', () => {
  it('returns an existing MuseFlow session directly to the requested workspace route', async () => {
    const session = {
      tokenHash: 'existing-session',
      user: platformUser('existing-user'),
      clientId: 'museflow-test',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    } satisfies AuthenticatedSession;
    const authenticate = vi.fn(async () => session);
    const beginLogin = vi.fn(async () => 'https://identity.example.test/authorize');
    const app = createPlatformApp(appDeps({
      sessions: { authenticate, beginLogin } as unknown as PlatformAppDeps['sessions'],
    }));

    const response = await request(app).get('/api/auth/login?returnTo=%2F%23%2Fbilling');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/#/billing');
    expect(authenticate).toHaveBeenCalledOnce();
    expect(beginLogin).not.toHaveBeenCalled();
  });

  it('returns a validated authorization cancellation to the original hash route', async () => {
    const cancelLogin = vi.fn(async () => ({
      returnTo: '/#/billing?tab=usage', errorCode: 'access_denied', validated: true,
    }));
    const app = createPlatformApp(appDeps({
      sessions: { cancelLogin } as unknown as PlatformAppDeps['sessions'],
    }));

    const response = await request(app).get('/api/auth/callback?state=state-1&error=access_denied&error_description=private-detail');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/#/billing?tab=usage&auth_error=access_denied');
    expect(cancelLogin).toHaveBeenCalledOnce();
  });

  it('starts OIDC login for an anonymous browser and preserves the requested hash route', async () => {
    const beginLogin = vi.fn(async (_req, _res, returnTo) => {
      expect(returnTo).toBe('/#/create?project=demo');
      return 'http://modelcross.test/api/user/auth/work/authorize?state=opaque';
    });
    const authenticate = vi.fn(async () => null);
    const app = createPlatformApp(appDeps({
      sessions: { authenticate, beginLogin } as unknown as PlatformAppDeps['sessions'],
    }));

    const response = await request(app).get('/api/auth/login?returnTo=%2F%23%2Fcreate%3Fproject%3Ddemo');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('http://modelcross.test/api/user/auth/work/authorize?state=opaque');
    expect(authenticate).toHaveBeenCalledOnce();
    expect(beginLogin).toHaveBeenCalledOnce();
  });

  it('returns a successful OIDC callback to the route recorded by the session transaction', async () => {
    const completeLogin = vi.fn(async () => ({
      returnTo: '/#/projects?tab=recent',
      user: platformUser('callback-user'),
    }));
    const app = createPlatformApp(appDeps({
      sessions: { completeLogin } as unknown as PlatformAppDeps['sessions'],
    }));

    const response = await request(app).get('/api/auth/callback?state=opaque&code=authorization-code');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/#/projects?tab=recent');
    expect(completeLogin).toHaveBeenCalledOnce();
  });

  it('does not expose arbitrary upstream OAuth error values', async () => {
    const cancelLogin = vi.fn(async () => ({
      returnTo: '/#/create', errorCode: 'authorization_failed', validated: false,
    }));
    const app = createPlatformApp(appDeps({
      sessions: { cancelLogin } as unknown as PlatformAppDeps['sessions'],
    }));

    const response = await request(app).get('/api/auth/callback?state=state-1&error=provider_secret&error_description=do-not-leak');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/#/create?auth_error=authorization_failed');
    expect(response.headers.location).not.toContain('do-not-leak');
  });
});
