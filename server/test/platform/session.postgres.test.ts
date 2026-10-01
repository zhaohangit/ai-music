import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { encryptSecret, hashToken } from '../../src/platform/crypto.js';
import { PlatformDatabase } from '../../src/platform/database.js';
import { ModelCrossTokenError, type ModelCrossClient, type OidcTokens } from '../../src/platform/modelcross-client.js';
import { PlatformRepository } from '../../src/platform/repository.js';
import { SessionManager } from '../../src/platform/session.js';
import { isolatedPostgres, platformUser, testConfig, type IsolatedPostgres } from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
let postgres: IsolatedPostgres;

const requestWithCookie = (name: string, value: string): Request => ({
  cookies: { [name]: value },
  ip: '198.51.100.10',
  get: () => undefined,
}) as unknown as Request;

integration('Session refresh rotation on PostgreSQL', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('uses a cross-instance row lock so a one-time refresh token rotates exactly once', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const bootstrap = new PlatformRepository(postgres.database);
    const originalUser = platformUser('postgres-refresh-user', ['admin']);
    const refreshedUser = platformUser('postgres-refresh-user', []);
    await bootstrap.upsertIdentity(originalUser);
    const rawCookie = 'postgres-concurrent-session-cookie';
    const tokenHash = hashToken(rawCookie);
    await bootstrap.createSession({
      tokenHash, subject: originalUser.subject, clientId: config.oidc.clientId,
      accessTokenCiphertext: encryptSecret('expired-access', config.sessionSecret),
      refreshTokenCiphertext: encryptSecret('single-use-refresh', config.sessionSecret),
      idTokenCiphertext: null,
      accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null, ipHash: null,
    });

    const scopedUrl = new URL(process.env.TEST_DATABASE_URL!);
    scopedUrl.searchParams.set('options', `-csearch_path=${postgres.schema}`);
    const firstDatabase = new PlatformDatabase(scopedUrl.toString());
    const secondDatabase = new PlatformDatabase(scopedUrl.toString());
    let releaseRefresh = (): void => undefined;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const refreshed: OidcTokens = {
      accessToken: 'rotated-access', refreshToken: 'rotated-refresh', idToken: null,
      expiresIn: 600, refreshExpiresIn: 3600, scope: 'openid',
    };
    const modelCross = {
      refresh: vi.fn(async () => { await refreshGate; return refreshed; }),
      userinfo: vi.fn(async () => refreshedUser),
    } as unknown as ModelCrossClient;
    const firstManager = new SessionManager(config, new PlatformRepository(firstDatabase), modelCross);
    const secondManager = new SessionManager(config, new PlatformRepository(secondDatabase), modelCross);
    const request = requestWithCookie(config.sessionCookieName, rawCookie);

    try {
      const first = firstManager.authenticate(request);
      await vi.waitFor(() => expect(modelCross.refresh).toHaveBeenCalledTimes(1));
      const second = secondManager.authenticate(request);
      releaseRefresh();
      const sessions = await Promise.all([first, second]);

      expect(modelCross.refresh).toHaveBeenCalledTimes(1);
      expect(modelCross.userinfo).toHaveBeenCalledTimes(1);
      for (const session of sessions) {
        expect(session).toMatchObject({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
        expect(session?.user.roles).toEqual([]);
      }
      expect((await bootstrap.getIdentity(originalUser.subject))?.roles).toEqual([]);
      const stored = await postgres.database.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM app_sessions WHERE token_hash=$1', [tokenHash],
      );
      expect(stored.rows[0]?.revoked_at).toBeNull();
    } finally {
      releaseRefresh();
      await Promise.all([firstDatabase.close(), secondDatabase.close()]);
    }
  });

  it('rolls back transient refresh errors but revokes a terminally invalid refresh credential', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new PlatformRepository(postgres.database);
    const user = platformUser('postgres-refresh-error-user');
    await repository.upsertIdentity(user);
    const rawCookie = 'postgres-refresh-error-cookie';
    const tokenHash = hashToken(rawCookie);
    await repository.createSession({
      tokenHash, subject: user.subject, clientId: config.oidc.clientId,
      accessTokenCiphertext: encryptSecret('expired-access', config.sessionSecret),
      refreshTokenCiphertext: encryptSecret('refresh-under-test', config.sessionSecret),
      idTokenCiphertext: null,
      accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null, ipHash: null,
    });
    const refresh = vi.fn<() => Promise<OidcTokens>>()
      .mockRejectedValueOnce(new ModelCrossTokenError('rate limited', 429, 'temporarily_unavailable'))
      .mockRejectedValueOnce(new ModelCrossTokenError('refresh revoked', 400, 'invalid_grant'));
    const manager = new SessionManager(
      config,
      repository,
      { refresh } as unknown as ModelCrossClient,
    );
    const browserRequest = requestWithCookie(config.sessionCookieName, rawCookie);

    await expect(manager.authenticate(browserRequest)).rejects.toThrow('rate limited');
    let stored = await postgres.database.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM app_sessions WHERE token_hash=$1', [tokenHash],
    );
    expect(stored.rows[0]?.revoked_at).toBeNull();

    await expect(manager.authenticate(browserRequest)).resolves.toBeNull();
    stored = await postgres.database.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM app_sessions WHERE token_hash=$1', [tokenHash],
    );
    expect(stored.rows[0]?.revoked_at).toBeInstanceOf(Date);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
