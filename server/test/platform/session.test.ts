import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret, hashToken } from '../../src/platform/crypto.js';
import { safeReturnTo, SessionManager } from '../../src/platform/session.js';
import { ModelCrossTokenError, type ModelCrossClient, type OidcTokens } from '../../src/platform/modelcross-client.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import { MemorySessionRepository, platformUser, testConfig } from './helpers.js';

function fakeRequest(input: { cookies?: Record<string, string>; userAgent?: string; ip?: string } = {}): Request {
  return {
    cookies: input.cookies ?? {},
    ip: input.ip ?? '127.0.0.1',
    get: (name: string) => name.toLowerCase() === 'user-agent' ? input.userAgent : undefined,
  } as unknown as Request;
}

function fakeResponse(): Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> } {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> };
}

describe('SessionManager', () => {
  it('creates a one-time OIDC transaction with PKCE S256, nonce, encrypted verifier, and safe return path', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const authorizationUrl = vi.fn(async (input: { state: string; nonce: string; codeChallenge: string }) => {
      const url = new URL('https://identity.example.test/authorize');
      for (const [key, value] of Object.entries(input)) url.searchParams.set(key, value);
      return url.toString();
    });
    const manager = new SessionManager(
      config,
      repository as unknown as PlatformRepository,
      { authorizationUrl } as unknown as ModelCrossClient,
    );
    await repository.storeAuthTransaction({
      stateHash: 'expired-state', codeVerifierCiphertext: 'expired-verifier', nonce: 'expired-nonce',
      returnTo: '/', expiresAt: new Date(Date.now() - 1000),
    });
    const response = fakeResponse();
    const redirect = new URL(await manager.beginLogin(
      fakeRequest({ userAgent: 'session-test', ip: '192.0.2.9' }),
      response,
      '//evil.example.test/open-redirect',
    ));

    const state = redirect.searchParams.get('state')!;
    const nonce = redirect.searchParams.get('nonce')!;
    const challenge = redirect.searchParams.get('codeChallenge')!;
    expect(state).toHaveLength(43);
    expect(nonce).toHaveLength(43);
    expect(response.cookie).toHaveBeenCalledWith('museflow_oidc_state', state, expect.objectContaining({
      httpOnly: true, sameSite: 'lax', maxAge: 300_000,
    }));
    expect(repository.authTransactions).toHaveLength(1);
    const transaction = [...repository.authTransactions.values()][0]!;
    expect(transaction.stateHash).toBe(hashToken(state));
    expect(transaction.returnTo).toBe('/#/create');
    expect(transaction.codeVerifierCiphertext).not.toContain(state);
    const verifier = decryptSecret(transaction.codeVerifierCiphertext, config.sessionSecret);
    expect(verifier).toHaveLength(86);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    expect(transaction.nonce).toBe(nonce);
  });

  it('keeps MuseFlow hash routes and falls back to the real workspace route', () => {
    expect(safeReturnTo('/#/billing')).toBe('/#/billing');
    expect(safeReturnTo('/#/create?from=login')).toBe('/#/create?from=login');
    expect(safeReturnTo('//evil.example.test')).toBe('/#/create');
    expect(safeReturnTo('https://evil.example.test')).toBe('/#/create');
    expect(safeReturnTo(undefined)).toBe('/#/create');
  });

  it('completes OIDC only for matching state/nonce and consumes the transaction once', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const user = platformUser('oidc-user', ['creator']);
    const tokens: OidcTokens = {
      accessToken: 'oidc-access', refreshToken: 'oidc-refresh', idToken: 'signed-id-token',
      expiresIn: 900, refreshExpiresIn: 3600, scope: 'openid modelcross.work modelcross.work.billing',
    };
    const modelCross = {
      authorizationUrl: vi.fn(async ({ state }: { state: string }) => `https://identity.test/authorize?state=${state}`),
      exchangeCode: vi.fn(async () => tokens),
      verifyIdToken: vi.fn(async (_token: string, nonce: string) => ({ sub: user.subject, iss: user.issuer, nonce })),
      userFromClaims: vi.fn(() => user),
    } as unknown as ModelCrossClient;
    const manager = new SessionManager(config, repository as unknown as PlatformRepository, modelCross);
    const beginResponse = fakeResponse();
    const authorization = new URL(await manager.beginLogin(fakeRequest(), beginResponse, '/app/projects?tab=recent'));
    const state = authorization.searchParams.get('state')!;
    const transaction = [...repository.authTransactions.values()][0]!;
    const verifier = decryptSecret(transaction.codeVerifierCiphertext, config.sessionSecret);

    const completedResponse = fakeResponse();
    const completed = await manager.completeLogin(
      fakeRequest({ cookies: { museflow_oidc_state: state }, userAgent: 'oidc-browser' }),
      completedResponse,
      { state, code: 'authorization-code' },
    );

    expect(completed).toEqual({ returnTo: '/app/projects?tab=recent', user });
    expect(modelCross.exchangeCode).toHaveBeenCalledWith('authorization-code', verifier);
    expect(modelCross.verifyIdToken).toHaveBeenCalledWith('signed-id-token', transaction.nonce);
    expect(repository.authTransactions).toHaveLength(0);
    expect(completedResponse.clearCookie).toHaveBeenCalledWith('museflow_oidc_state', expect.any(Object));
    const sessionCookie = completedResponse.cookie.mock.calls.find((call) => call[0] === config.sessionCookieName);
    expect(sessionCookie?.[1]).toEqual(expect.any(String));
    expect(repository.sessions.has(hashToken(sessionCookie![1] as string))).toBe(true);

    await expect(manager.completeLogin(
      fakeRequest({ cookies: { museflow_oidc_state: state } }), fakeResponse(), { state, code: 'authorization-code' },
    )).rejects.toThrow('expired or already used');
  });

  it('keeps independent state cookies for concurrent login tabs', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const user = platformUser('multi-tab-user', ['creator']);
    const tokens: OidcTokens = {
      accessToken: 'multi-access', refreshToken: 'multi-refresh', idToken: 'multi-id-token',
      expiresIn: 900, refreshExpiresIn: 3600, scope: 'openid modelcross.work',
    };
    const modelCross = {
      authorizationUrl: vi.fn(async ({ state }: { state: string }) => `https://identity.test/authorize?state=${state}`),
      exchangeCode: vi.fn(async () => tokens),
      verifyIdToken: vi.fn(async (_token: string, nonce: string) => ({ sub: user.subject, iss: user.issuer, nonce })),
      userFromClaims: vi.fn(() => user),
    } as unknown as ModelCrossClient;
    const manager = new SessionManager(config, repository as unknown as PlatformRepository, modelCross);

    const firstResponse = fakeResponse();
    const firstAuthorization = new URL(await manager.beginLogin(fakeRequest(), firstResponse, '/#/create'));
    const firstState = firstAuthorization.searchParams.get('state')!;
    const firstAggregate = firstResponse.cookie.mock.calls.find((call) => call[0] === 'museflow_oidc_state')?.[1] as string;
    const firstMarker = `museflow_oidc_state_${hashToken(firstState).slice(0, 32)}`;

    const secondResponse = fakeResponse();
    const secondAuthorization = new URL(await manager.beginLogin(
      fakeRequest({ cookies: { museflow_oidc_state: firstAggregate } }),
      secondResponse,
      '/#/billing',
    ));
    const secondState = secondAuthorization.searchParams.get('state')!;
    const secondAggregate = secondResponse.cookie.mock.calls.find((call) => call[0] === 'museflow_oidc_state')?.[1] as string;
    const secondMarker = `museflow_oidc_state_${hashToken(secondState).slice(0, 32)}`;

    expect(secondState).not.toBe(firstState);
    expect(repository.authTransactions).toHaveLength(2);
    expect(firstResponse.cookie.mock.calls.some((call) => call[0] === firstMarker && call[1] === '1')).toBe(true);
    expect(secondResponse.cookie.mock.calls.some((call) => call[0] === secondMarker && call[1] === '1')).toBe(true);

    await expect(manager.completeLogin(
      fakeRequest({ cookies: {
        museflow_oidc_state: secondAggregate,
        [firstMarker]: '1',
        [secondMarker]: '1',
      } }),
      fakeResponse(),
      { state: firstState, code: 'first-code' },
    )).resolves.toMatchObject({ returnTo: '/#/create' });

    await expect(manager.completeLogin(
      fakeRequest({ cookies: {
        museflow_oidc_state: secondAggregate,
        [secondMarker]: '1',
      } }),
      fakeResponse(),
      { state: secondState, code: 'second-code' },
    )).resolves.toMatchObject({ returnTo: '/#/billing' });
    expect(repository.authTransactions).toHaveLength(0);
    expect(modelCross.exchangeCode).toHaveBeenCalledTimes(2);
  });

  it('consumes a cancelled authorization and returns only a safe error code', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const manager = new SessionManager(
      config,
      repository as unknown as PlatformRepository,
      { authorizationUrl: vi.fn(async ({ state }: { state: string }) => `https://identity.test/authorize?state=${state}`) } as unknown as ModelCrossClient,
    );
    const beginResponse = fakeResponse();
    const authorization = new URL(await manager.beginLogin(fakeRequest(), beginResponse, '/#/billing?tab=usage'));
    const state = authorization.searchParams.get('state')!;
    const marker = `museflow_oidc_state_${hashToken(state).slice(0, 32)}`;
    const aggregate = beginResponse.cookie.mock.calls.find((call) => call[0] === 'museflow_oidc_state')?.[1] as string;
    const response = fakeResponse();

    await expect(manager.cancelLogin(
      fakeRequest({ cookies: { museflow_oidc_state: aggregate, [marker]: '1' } }),
      response,
      { state, error: 'access_denied', error_description: 'upstream secret must not escape' },
    )).resolves.toEqual({ returnTo: '/#/billing?tab=usage', errorCode: 'access_denied', validated: true });
    expect(repository.authTransactions).toHaveLength(0);
    expect(response.clearCookie).toHaveBeenCalledWith('museflow_oidc_state', expect.any(Object));
    expect(response.clearCookie).toHaveBeenCalledWith(marker, expect.any(Object));

    await expect(manager.cancelLogin(
      fakeRequest({ cookies: { museflow_oidc_state: aggregate, [marker]: '1' } }),
      fakeResponse(),
      { state, error: 'provider_internal_detail' },
    )).resolves.toEqual({ returnTo: '/#/create', errorCode: 'authorization_failed', validated: false });
  });

  it('rejects state mismatch before exchanging a code', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const modelCross = {
      authorizationUrl: vi.fn(async () => 'https://identity.test/authorize'),
      exchangeCode: vi.fn(),
    } as unknown as ModelCrossClient;
    const manager = new SessionManager(config, repository as unknown as PlatformRepository, modelCross);
    await expect(manager.completeLogin(
      fakeRequest({ cookies: { museflow_oidc_state: 'cookie-state' } }),
      fakeResponse(),
      { state: 'query-state', code: 'code' },
    )).rejects.toThrow('OIDC state validation failed');
    expect(modelCross.exchangeCode).not.toHaveBeenCalled();
  });

  it('persists only a hash of the browser cookie and encrypted upstream tokens in development', async () => {
    const config = testConfig();
    const repository = new MemorySessionRepository();
    const manager = new SessionManager(
      config,
      repository as unknown as PlatformRepository,
      {} as ModelCrossClient,
    );
    const user = platformUser('dev-user');
    const response = fakeResponse();
    const created = await manager.createDevelopmentSession(
      fakeRequest({ userAgent: 'browser-v1', ip: '198.51.100.8' }), response, user,
    );
    const rawCookie = response.cookie.mock.calls[0]![1] as string;
    const stored = repository.sessions.get(hashToken(rawCookie))!;

    expect(repository.sessions.has(rawCookie)).toBe(false);
    expect(stored.access_token_ciphertext).not.toContain(`dev-access-${user.subject}`);
    expect(stored.refresh_token_ciphertext).not.toContain(`dev-refresh-${user.subject}`);
    expect(decryptSecret(stored.access_token_ciphertext, config.sessionSecret)).toBe(`dev-access-${user.subject}`);
    expect(created.user).toEqual(user);

    const authenticated = await manager.authenticate(fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } }));
    expect(authenticated).toMatchObject({
      tokenHash: hashToken(rawCookie), accessToken: `dev-access-${user.subject}`,
      refreshToken: `dev-refresh-${user.subject}`, user,
    });
    await manager.logout(fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } }), response);
    expect(await manager.authenticate(fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } }))).toBeNull();
  });

  it('never creates a development identity or cookie while OIDC authentication is active', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const manager = new SessionManager(
      config,
      repository as unknown as PlatformRepository,
      {} as ModelCrossClient,
    );
    const response = fakeResponse();

    await expect(manager.createDevelopmentSession(
      fakeRequest(), response, platformUser('forbidden-dev-user'),
    )).rejects.toMatchObject({ status: 404, message: 'development login is disabled' });
    expect(response.cookie).not.toHaveBeenCalled();
    expect(repository.identities.size).toBe(0);
    expect(repository.sessions.size).toBe(0);
  });

  it('revokes an unreadable session after a deployment secret rotation and clears its browser cookie', async () => {
    const oldConfig = testConfig({ MUSEFLOW_SESSION_SECRET: 'old-session-secret-with-more-than-32-characters' });
    const newConfig = testConfig({ MUSEFLOW_SESSION_SECRET: 'new-session-secret-with-more-than-32-characters' });
    const repository = new MemorySessionRepository();
    const user = platformUser('rotated-secret-user');
    const rawCookie = 'session-encrypted-by-the-previous-deployment';
    const tokenHash = hashToken(rawCookie);
    await repository.upsertIdentity(user);
    await repository.createSession({
      tokenHash,
      subject: user.subject,
      clientId: oldConfig.oidc.clientId,
      accessTokenCiphertext: encryptSecret('old-access-token', oldConfig.sessionSecret),
      refreshTokenCiphertext: encryptSecret('old-refresh-token', oldConfig.sessionSecret),
      idTokenCiphertext: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
      userAgentHash: null,
      ipHash: null,
    });
    const response = fakeResponse();
    const manager = new SessionManager(newConfig, repository as unknown as PlatformRepository, {} as ModelCrossClient);

    await expect(manager.authenticate(
      fakeRequest({ cookies: { [newConfig.sessionCookieName]: rawCookie } }),
      response,
    )).resolves.toBeNull();
    expect(repository.sessions.get(tokenHash)?.revoked_at).toBeInstanceOf(Date);
    expect(response.clearCookie).toHaveBeenCalledWith(newConfig.sessionCookieName, expect.any(Object));
  });

  it('rotates expiring OIDC tokens and revokes the session for an invalid refresh credential', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const user = platformUser('refresh-user');
    await repository.upsertIdentity(user);
    const rawCookie = 'opaque-browser-cookie';
    const tokenHash = hashToken(rawCookie);
    await repository.createSession({
      tokenHash, subject: user.subject, clientId: config.oidc.clientId,
      accessTokenCiphertext: encryptSecret('expired-access', config.sessionSecret),
      refreshTokenCiphertext: encryptSecret('refresh-token', config.sessionSecret),
      idTokenCiphertext: null,
      accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null, ipHash: null,
    });
    const refreshed: OidcTokens = {
      accessToken: 'new-access', refreshToken: 'new-refresh', idToken: 'new-id-token',
      expiresIn: 600, refreshExpiresIn: 7200, scope: 'openid',
    };
    const modelCross = {
      refresh: vi.fn(async () => refreshed),
      verifyIdToken: vi.fn(async () => ({ sub: user.subject, iss: user.issuer })),
      userFromClaims: vi.fn(() => user),
      userinfo: vi.fn(async () => user),
    } as unknown as ModelCrossClient;
    const manager = new SessionManager(config, repository as unknown as PlatformRepository, modelCross);

    const session = await manager.authenticate(fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } }));
    expect(session).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh', idToken: 'new-id-token' });
    expect(modelCross.refresh).toHaveBeenCalledWith('refresh-token');
    expect(modelCross.verifyIdToken).toHaveBeenCalledWith('new-id-token');
    expect(modelCross.userinfo).toHaveBeenCalledWith('new-access');

    repository.sessions.get(tokenHash)!.access_expires_at = new Date(Date.now() - 1000);
    (modelCross.refresh as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ModelCrossTokenError('refresh revoked', 400, 'invalid_grant'),
    );
    const response = fakeResponse();
    expect(await manager.authenticate(
      fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } }), response,
    )).toBeNull();
    expect(repository.sessions.get(tokenHash)!.revoked_at).toBeInstanceOf(Date);
    expect(response.clearCookie).toHaveBeenCalledWith(config.sessionCookieName, expect.any(Object));
  });

  it('keeps an expiring session retryable when ModelCross refresh is rate limited', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const user = platformUser('refresh-rate-limited-user');
    await repository.upsertIdentity(user);
    const rawCookie = 'rate-limited-session-cookie';
    const tokenHash = hashToken(rawCookie);
    await repository.createSession({
      tokenHash, subject: user.subject, clientId: config.oidc.clientId,
      accessTokenCiphertext: encryptSecret('expiring-access', config.sessionSecret),
      refreshTokenCiphertext: encryptSecret('retryable-refresh', config.sessionSecret),
      idTokenCiphertext: null,
      accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null, ipHash: null,
    });
    const refreshed: OidcTokens = {
      accessToken: 'retried-access', refreshToken: 'retried-refresh', idToken: null,
      expiresIn: 600, refreshExpiresIn: 7200, scope: 'openid',
    };
    const refresh = vi.fn<() => Promise<OidcTokens>>()
      .mockRejectedValueOnce(new ModelCrossTokenError('refresh rate limited', 429, 'temporarily_unavailable'))
      .mockResolvedValueOnce(refreshed);
    const modelCross = {
      refresh,
      userinfo: vi.fn(async () => user),
    } as unknown as ModelCrossClient;
    const manager = new SessionManager(config, repository as unknown as PlatformRepository, modelCross);
    const response = fakeResponse();
    const request = fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } });

    await expect(manager.authenticate(request, response)).rejects.toThrow('refresh rate limited');
    expect(repository.sessions.get(tokenHash)?.revoked_at).toBeNull();
    expect(response.clearCookie).not.toHaveBeenCalled();

    await expect(manager.authenticate(request, response)).resolves.toMatchObject({
      accessToken: 'retried-access', refreshToken: 'retried-refresh',
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('single-flights concurrent refresh rotation and applies current user roles to every request', async () => {
    const config = testConfig({ AUTH_MODE: 'oidc' });
    const repository = new MemorySessionRepository();
    const originalUser = platformUser('concurrent-refresh-user', ['admin']);
    const refreshedUser = platformUser('concurrent-refresh-user', []);
    await repository.upsertIdentity(originalUser);
    const rawCookie = 'concurrent-opaque-cookie';
    await repository.createSession({
      tokenHash: hashToken(rawCookie), subject: originalUser.subject, clientId: config.oidc.clientId,
      accessTokenCiphertext: encryptSecret('expiring-access', config.sessionSecret),
      refreshTokenCiphertext: encryptSecret('one-time-refresh', config.sessionSecret),
      idTokenCiphertext: null,
      accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null, ipHash: null,
    });
    let releaseRefresh = (): void => undefined;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const refreshed: OidcTokens = {
      accessToken: 'rotated-access', refreshToken: 'rotated-refresh', idToken: null,
      expiresIn: 600, refreshExpiresIn: 7200, scope: 'openid',
    };
    const modelCross = {
      refresh: vi.fn(async () => { await refreshGate; return refreshed; }),
      userinfo: vi.fn(async () => refreshedUser),
    } as unknown as ModelCrossClient;
    const manager = new SessionManager(config, repository as unknown as PlatformRepository, modelCross);
    const request = fakeRequest({ cookies: { [config.sessionCookieName]: rawCookie } });

    const first = manager.authenticate(request);
    const second = manager.authenticate(request);
    await vi.waitFor(() => expect(modelCross.refresh).toHaveBeenCalledTimes(1));
    releaseRefresh();
    const sessions = await Promise.all([first, second]);

    expect(modelCross.refresh).toHaveBeenCalledTimes(1);
    expect(modelCross.userinfo).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(2);
    for (const session of sessions) {
      expect(session).toMatchObject({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
      expect(session?.user.roles).toEqual([]);
    }
    expect(repository.sessions.get(hashToken(rawCookie))?.revoked_at).toBeNull();
  });
});
