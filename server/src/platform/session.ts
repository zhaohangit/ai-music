import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { PlatformConfig } from './config.js';
import { ModelCrossClient, ModelCrossTokenError, type OidcTokens } from './modelcross-client.js';
import { PlatformRepository, SessionRefreshRejectedError, type RawSessionRow } from './repository.js';
import type { AuthenticatedSession, PlatformUser } from './types.js';
import { decryptSecret, encryptSecret, hashToken } from './crypto.js';

const base64url = (value: Buffer): string => value.toString('base64url');
const hash = hashToken;
const fingerprint = (value: string | undefined): string | null => value ? hash(value).slice(0, 32) : null;
const DEFAULT_RETURN_TO = '/#/create';
const OIDC_TRANSACTION_TTL_MS = 5 * 60_000;
const MAX_PENDING_OIDC_STATES = 8;

/**
 * These values are safe to expose in the browser URL after an upstream
 * authorization failure. Never forward `error_description` or any provider
 * response detail because it may contain credentials or internal metadata.
 */
const AUTH_FAILURE_CODES = new Set([
  'access_denied',
  'login_required',
  'consent_required',
  'interaction_required',
  'temporarily_unavailable',
  'server_error',
  'invalid_request',
]);

export function safeAuthFailureCode(value: unknown): string {
  return typeof value === 'string' && AUTH_FAILURE_CODES.has(value)
    ? value
    : 'authorization_failed';
}

function normalizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return DEFAULT_RETURN_TO;
  try {
    const parsed = new URL(value, 'http://museflow.local');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 1000);
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

export function safeReturnTo(value: unknown): string {
  return normalizeReturnTo(value);
}

function equalState(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class SessionManager {
  private readonly cookieOptions: CookieOptions;
  private readonly stateCookie = 'museflow_oidc_state';

  constructor(
    private readonly config: PlatformConfig,
    private readonly repository: PlatformRepository,
    private readonly modelCross: ModelCrossClient,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: config.publicUrl.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
      maxAge: config.sessionMaxAgeSeconds * 1000,
    };
  }

  /**
   * The aggregate cookie is retained for compatibility with older browsers
   * and tests. The per-state cookie is the authoritative marker for a flow:
   * unlike one shared value, it cannot be overwritten when two tabs start
   * login at the same time.
   */
  private stateCookieName(state: string): string {
    // Derive the name from a digest instead of embedding an untrusted callback
    // value in a Set-Cookie header. The callback can deterministically locate
    // the marker while malformed state strings remain harmless.
    return `${this.stateCookie}_${hash(state).slice(0, 32)}`;
  }

  private pendingStates(req: Request): string[] {
    const raw = req.cookies?.[this.stateCookie];
    if (typeof raw !== 'string' || !raw) return [];
    // States are base64url values, so a dot is a safe delimiter. Ignore
    // malformed/oversized values supplied by a client; the transaction table
    // remains the server-side source of truth.
    return raw.split('.')
      .filter((value) => /^[A-Za-z0-9_-]{32,128}$/.test(value))
      .slice(-MAX_PENDING_OIDC_STATES);
  }

  private hasStateCookie(req: Request, state: string): boolean {
    const perFlow = req.cookies?.[this.stateCookieName(state)];
    if (perFlow === '1' || perFlow === state) return true;
    return this.pendingStates(req).some((candidate) => equalState(candidate, state));
  }

  private consumeStateCookies(req: Request, res: Response, state: string): void {
    const remaining = this.pendingStates(req)
      .filter((candidate) => !equalState(candidate, state));
    if (remaining.length) {
      res.cookie(this.stateCookie, remaining.join('.'), {
        ...this.cookieOptions,
        maxAge: OIDC_TRANSACTION_TTL_MS,
      });
    } else {
      res.clearCookie(this.stateCookie, this.cookieOptions);
    }
    // Clearing an absent cookie is harmless, and ensures a callback consumed
    // through the legacy aggregate cookie cannot leave a stale per-flow mark.
    res.clearCookie(this.stateCookieName(state), this.cookieOptions);
  }

  private sessionFromRow(row: RawSessionRow): AuthenticatedSession {
    return {
      tokenHash: row.token_hash,
      user: this.repository.sessionUser(row),
      clientId: row.client_id,
      accessToken: decryptSecret(row.access_token_ciphertext, this.config.sessionSecret),
      refreshToken: decryptSecret(row.refresh_token_ciphertext, this.config.sessionSecret),
      idToken: row.id_token_ciphertext ? decryptSecret(row.id_token_ciphertext, this.config.sessionSecret) : null,
      accessExpiresAt: new Date(row.access_expires_at),
      refreshExpiresAt: new Date(row.refresh_expires_at),
    };
  }

  async beginLogin(req: Request, res: Response, returnTo: unknown): Promise<string> {
    const state = base64url(randomBytes(32));
    const nonce = base64url(randomBytes(32));
    const codeVerifier = base64url(randomBytes(64));
    const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
    await Promise.all([
      this.repository.purgeExpiredAuthTransactions(),
      this.repository.purgeExpiredSessions(),
    ]);
    await this.repository.storeAuthTransaction({
      stateHash: hash(state),
      codeVerifierCiphertext: encryptSecret(codeVerifier, this.config.sessionSecret),
      nonce,
      returnTo: normalizeReturnTo(returnTo),
      expiresAt: new Date(Date.now() + OIDC_TRANSACTION_TTL_MS),
    });
    const pending = this.pendingStates(req);
    const nextStates = [...pending.filter((candidate) => !equalState(candidate, state)), state]
      .slice(-MAX_PENDING_OIDC_STATES);
    res.cookie(this.stateCookie, nextStates.join('.'), {
      ...this.cookieOptions,
      maxAge: OIDC_TRANSACTION_TTL_MS,
    });
    res.cookie(this.stateCookieName(state), '1', {
      ...this.cookieOptions,
      maxAge: OIDC_TRANSACTION_TTL_MS,
    });
    return this.modelCross.authorizationUrl({ state, nonce, codeChallenge });
  }

  async completeLogin(req: Request, res: Response, query: Record<string, unknown>): Promise<{ returnTo: string; user: PlatformUser }> {
    const state = typeof query.state === 'string' ? query.state : '';
    const code = typeof query.code === 'string' ? query.code : '';
    if (!state || !code || !this.hasStateCookie(req, state)) {
      if (state) this.consumeStateCookies(req, res, state);
      throw Object.assign(new Error('OIDC state validation failed'), { status: 400 });
    }
    const transaction = await this.repository.takeAuthTransaction(hash(state));
    this.consumeStateCookies(req, res, state);
    if (!transaction) throw Object.assign(new Error('OIDC transaction expired or already used'), { status: 400 });
    let codeVerifier: string;
    try {
      codeVerifier = decryptSecret(transaction.codeVerifierCiphertext, this.config.sessionSecret);
    } catch {
      throw Object.assign(new Error('OIDC transaction is no longer valid; restart login'), { status: 400 });
    }
    const tokens = await this.modelCross.exchangeCode(code, codeVerifier);
    if (!tokens.idToken) throw new Error('ModelCross did not return an ID token');
    const claims = await this.modelCross.verifyIdToken(tokens.idToken, transaction.nonce);
    const user = this.modelCross.userFromClaims(claims);
    await this.repository.upsertIdentity(user);
    const rawSessionToken = await this.storeSession(tokens, user, req);
    res.cookie(this.config.sessionCookieName, rawSessionToken, this.cookieOptions);
    return { returnTo: transaction.returnTo, user };
  }

  /**
   * Complete an OAuth authorization-error callback without exposing provider
   * details. A valid state consumes its one-time transaction and returns the
   * original internal route; invalid state falls back to the workspace route.
   */
  async cancelLogin(
    req: Request,
    res: Response,
    query: Record<string, unknown>,
  ): Promise<{ returnTo: string; errorCode: string; validated: boolean }> {
    const state = typeof query.state === 'string' ? query.state : '';
    const errorCode = safeAuthFailureCode(query.error);
    if (!state || !this.hasStateCookie(req, state)) {
      return { returnTo: DEFAULT_RETURN_TO, errorCode, validated: false };
    }
    const transaction = await this.repository.takeAuthTransaction(hash(state));
    // Remove a stale browser marker even if the transaction has already
    // expired or was consumed by a previous callback.
    this.consumeStateCookies(req, res, state);
    if (!transaction) return { returnTo: DEFAULT_RETURN_TO, errorCode, validated: false };
    return { returnTo: transaction.returnTo, errorCode, validated: true };
  }

  async createDevelopmentSession(req: Request, res: Response, user: PlatformUser): Promise<AuthenticatedSession> {
    if (this.config.authMode !== 'development' || this.config.nodeEnv === 'production') throw Object.assign(new Error('development login is disabled'), { status: 404 });
    await this.repository.upsertIdentity(user);
    const tokens: OidcTokens = {
      accessToken: `dev-access-${user.subject}`,
      refreshToken: `dev-refresh-${user.subject}`,
      idToken: null,
      expiresIn: 24 * 60 * 60,
      refreshExpiresIn: this.config.sessionMaxAgeSeconds,
      scope: 'openid modelcross.work modelcross.work.billing',
    };
    const rawSessionToken = await this.storeSession(tokens, user, req);
    res.cookie(this.config.sessionCookieName, rawSessionToken, this.cookieOptions);
    const row = await this.repository.getSessionRow(hash(rawSessionToken));
    if (!row) throw new Error('development session was not persisted');
    return this.sessionFromRow(row);
  }

  private async storeSession(tokens: OidcTokens, user: PlatformUser, req: Request): Promise<string> {
    const raw = base64url(randomBytes(48));
    const now = Date.now();
    await this.repository.createSession({
      tokenHash: hash(raw), subject: user.subject, clientId: this.config.oidc.clientId,
      accessTokenCiphertext: encryptSecret(tokens.accessToken, this.config.sessionSecret),
      refreshTokenCiphertext: encryptSecret(tokens.refreshToken, this.config.sessionSecret),
      idTokenCiphertext: tokens.idToken ? encryptSecret(tokens.idToken, this.config.sessionSecret) : null,
      accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
      refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
      userAgentHash: fingerprint(req.get('user-agent')),
      ipHash: fingerprint(req.ip),
    });
    return raw;
  }

  async authenticate(req: Request, res?: Response, options: { forceRefresh?: boolean } = {}): Promise<AuthenticatedSession | null> {
    const raw = typeof req.cookies?.[this.config.sessionCookieName] === 'string'
      ? req.cookies[this.config.sessionCookieName] as string
      : '';
    if (!raw) return null;
    const row = await this.repository.getSessionRow(hash(raw));
    if (!row) {
      if (res) res.clearCookie(this.config.sessionCookieName, this.cookieOptions);
      return null;
    }
    let session: AuthenticatedSession;
    try {
      session = this.sessionFromRow(row);
    } catch {
      // A deployment secret rotation makes previously encrypted upstream
      // tokens unreadable. Fail closed, revoke that one server-side session,
      // and return to the public login surface instead of trapping the whole
      // application in repeated 500 responses.
      await this.repository.revokeSession(row.token_hash);
      if (res) res.clearCookie(this.config.sessionCookieName, this.cookieOptions);
      return null;
    }
    if ((options.forceRefresh || session.accessExpiresAt.getTime() <= Date.now() + 30_000) && this.config.authMode === 'oidc') {
      const refreshedRow = await this.repository.refreshSessionAtomically(
        session.tokenHash,
        new Date(Date.now() + 30_000),
        async (lockedRow) => {
          const lockedSession = this.sessionFromRow(lockedRow);
          let refreshed: OidcTokens;
          try {
            refreshed = await this.modelCross.refresh(lockedSession.refreshToken);
          } catch (error) {
            if (error instanceof ModelCrossTokenError && error.invalidRefreshCredential) {
              throw new SessionRefreshRejectedError(error.message);
            }
            throw error;
          }
          if (refreshed.idToken) {
            const claims = await this.modelCross.verifyIdToken(refreshed.idToken);
            const tokenUser = this.modelCross.userFromClaims(claims);
            if (tokenUser.subject !== lockedSession.user.subject) {
              throw new SessionRefreshRejectedError('refreshed ID token subject changed');
            }
          }
          const currentUser = await this.modelCross.userinfo(refreshed.accessToken);
          if (currentUser.subject !== lockedSession.user.subject) {
            throw new SessionRefreshRejectedError('refreshed userinfo subject changed');
          }
          const now = Date.now();
          return {
            accessTokenCiphertext: encryptSecret(refreshed.accessToken, this.config.sessionSecret),
            refreshTokenCiphertext: encryptSecret(refreshed.refreshToken, this.config.sessionSecret),
            idTokenCiphertext: refreshed.idToken
              ? encryptSecret(refreshed.idToken, this.config.sessionSecret)
              : lockedRow.id_token_ciphertext,
            accessExpiresAt: new Date(now + refreshed.expiresIn * 1000),
            refreshExpiresAt: new Date(now + refreshed.refreshExpiresIn * 1000),
            user: currentUser,
          };
        },
      );
      if (!refreshedRow) {
        if (res) res.clearCookie(this.config.sessionCookieName, this.cookieOptions);
        return null;
      }
      session = this.sessionFromRow(refreshedRow);
    }
    return session;
  }

  async logout(req: Request, res: Response): Promise<void> {
    const raw = typeof req.cookies?.[this.config.sessionCookieName] === 'string'
      ? req.cookies[this.config.sessionCookieName] as string
      : '';
    if (raw) await this.repository.revokeSession(hash(raw));
    res.clearCookie(this.config.sessionCookieName, this.cookieOptions);
  }
}
