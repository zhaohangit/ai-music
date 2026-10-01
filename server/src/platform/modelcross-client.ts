import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type {
  AccountSummary,
  AiAssistAction,
  BillingQuote,
  BillingReservation,
  MusicOperationCatalogItem,
  PlatformUser,
} from './types.js';
import type { PlatformConfig } from './config.js';

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

export interface OidcTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string;
}

export class ModelCrossTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly oauthError: string | null,
  ) {
    super(message);
    this.name = 'ModelCrossTokenError';
  }

  get invalidRefreshCredential(): boolean {
    return this.oauthError === 'invalid_grant' || this.oauthError === 'invalid_token';
  }
}

export interface ModelCrossAiResult {
  payload: Record<string, unknown>;
  requestId: string | null;
}

export interface RequestedMusicOperation {
  action: string;
  operationCode: string;
  fallbackCredits: number;
}

export interface ModelCrossMusicProviderStatus {
  gatewayEnabled: boolean;
  billingEnabled: boolean;
  providerConfigured: boolean;
  providerReachable: boolean;
  providerAuthenticated: boolean;
  errorCode: string | null;
  checkedAt: string;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const string = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const epochOrString = (value: unknown): string | null => {
  const raw = string(value);
  if (raw) return raw;
  const seconds = number(value);
  return seconds && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
};

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error('ModelCross response is too large');
  try { return text ? JSON.parse(text) : {}; } catch { return { error: text.slice(0, 300) }; }
}

const billingStatuses: BillingReservation['status'][] = [
  'reserved', 'captured', 'partially_captured', 'released', 'refunded', 'reconcile_required',
];

interface BillingOperationPayload {
  raw: Record<string, unknown>;
  operationId: string;
  reservationId: string;
  operationCode: string;
  resourceId: string;
  priceVersion: string;
  quotedAmount: number;
  reservedAmount: number;
  capturedAmount: number;
  releasedAmount: number;
  refundedAmount: number;
  totalItems: number;
  successfulItems: number;
  status: BillingReservation['status'];
}

function exactString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.trim() === value ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseBillingPolicy(value: unknown, context: string): BillingQuote['partialSuccessPolicy'] {
  if (value !== 'pro_rata') {
    throw new Error(`${context} returned an unsupported partial_success_policy`);
  }
  return 'per_take';
}

function parseBillingOperation(value: unknown, context: string): BillingOperationPayload {
  const payload = object(value);
  const operationId = exactString(payload.operation_id);
  const reservationId = exactString(payload.reservation_id);
  const operationCode = exactString(payload.operation_code);
  const resourceId = exactString(payload.resource_id);
  const priceVersion = exactString(payload.price_version);
  const productKey = exactString(payload.product_key);
  const resourceType = exactString(payload.resource_type);
  const quotedAmount = positiveInteger(payload.quoted_amount);
  const reservedAmount = nonNegativeInteger(payload.reserved_amount);
  const capturedAmount = nonNegativeInteger(payload.captured_amount);
  const releasedAmount = nonNegativeInteger(payload.released_amount);
  const refundedAmount = nonNegativeInteger(payload.refunded_amount);
  const totalItems = positiveInteger(payload.total_items);
  const successfulItems = nonNegativeInteger(payload.successful_items);
  const expiresAt = positiveInteger(payload.expires_at);
  const creditsAvailable = nonNegativeInteger(payload.credits_available);
  const status = exactString(payload.status);
  if (!operationId || !reservationId || !operationCode || !resourceId || !priceVersion
    || !productKey || !resourceType || quotedAmount === null || reservedAmount === null
    || capturedAmount === null || releasedAmount === null || refundedAmount === null
    || totalItems === null || successfulItems === null || expiresAt === null
    || creditsAvailable === null || typeof payload.replayed !== 'boolean'
    || !billingStatuses.includes(status as BillingReservation['status'])) {
    throw new Error(`${context} response is incomplete or invalid`);
  }
  if (reservedAmount > quotedAmount || capturedAmount > quotedAmount
    || releasedAmount > quotedAmount || refundedAmount > capturedAmount
    || successfulItems > totalItems) {
    throw new Error(`${context} response contains inconsistent amounts or item counts`);
  }
  return {
    raw: payload,
    operationId,
    reservationId,
    operationCode,
    resourceId,
    priceVersion,
    quotedAmount,
    reservedAmount,
    capturedAmount,
    releasedAmount,
    refundedAmount,
    totalItems,
    successfulItems,
    status: status as BillingReservation['status'],
  };
}

function parseTokens(value: unknown): OidcTokens {
  const body = object(value);
  const accessToken = string(body.access_token);
  const refreshToken = string(body.refresh_token);
  if (!accessToken || !refreshToken) throw new Error('ModelCross token response is incomplete');
  return {
    accessToken,
    refreshToken,
    idToken: string(body.id_token),
    expiresIn: Math.max(60, number(body.expires_in) ?? 900),
    refreshExpiresIn: Math.max(300, number(body.refresh_expires_in) ?? 30 * 24 * 60 * 60),
    scope: string(body.scope) ?? '',
  };
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
}

function extractOutputText(payload: Record<string, unknown>): string {
  const direct = string(payload.output_text);
  if (direct) return direct;
  for (const output of array(payload.output)) {
    const outputObject = object(output);
    for (const content of array(outputObject.content)) {
      const contentObject = object(content);
      const text = string(contentObject.text) ?? string(contentObject.output_text);
      if (text) return text;
    }
  }
  const choices = array(payload.choices);
  if (choices[0]) {
    const message = object(object(choices[0]).message);
    const text = string(message.content);
    if (text) return text;
  }
  throw new Error('ModelCross AI response does not contain text output');
}

function parseJsonText(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI output must be a JSON object');
  return parsed as Record<string, unknown>;
}

export class ModelCrossClient {
  private discoveryCache: { value: OidcDiscovery; expiresAt: number } | null = null;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private readonly modelCatalogCache = new Map<string, { ids: string[]; expiresAt: number }>();
  private readonly modelCatalogInFlight = new Map<string, Promise<string[]>>();

  constructor(private readonly config: PlatformConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async discovery(): Promise<OidcDiscovery> {
    if (this.discoveryCache && this.discoveryCache.expiresAt > Date.now()) return this.discoveryCache.value;
    const response = await this.fetchImpl(`${this.config.oidc.issuer}/.well-known/openid-configuration`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`ModelCross discovery returned HTTP ${response.status}`);
    const value = object(await safeJson(response)) as unknown as OidcDiscovery;
    for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'userinfo_endpoint', 'jwks_uri'] as const) {
      if (!string(value[field])) throw new Error(`ModelCross discovery is missing ${field}`);
    }
    if (value.issuer.replace(/\/+$/, '') !== this.config.oidc.issuer) throw new Error('ModelCross discovery issuer mismatch');
    this.discoveryCache = { value, expiresAt: Date.now() + 5 * 60_000 };
    this.jwks = createRemoteJWKSet(new URL(value.jwks_uri));
    return value;
  }

  async authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): Promise<string> {
    const discovery = await this.discovery();
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('client_id', this.config.oidc.clientId);
    url.searchParams.set('redirect_uri', this.config.oidc.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.config.oidc.scopes.join(' '));
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<OidcTokens> {
    const discovery = await this.discovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: this.config.oidc.redirectUri,
      code_verifier: codeVerifier,
    });
    const response = await this.fetchImpl(discovery.token_endpoint, {
      method: 'POST', headers: {
        Authorization: basicAuth(this.config.oidc.clientId, this.config.oidc.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
      }, body, signal: AbortSignal.timeout(15_000),
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(`ModelCross code exchange failed (${response.status}): ${string(object(payload).error) ?? 'unknown error'}`);
    return parseTokens(payload);
  }

  async refresh(refreshToken: string): Promise<OidcTokens> {
    const discovery = await this.discovery();
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken,
    });
    const response = await this.fetchImpl(discovery.token_endpoint, {
      method: 'POST', headers: {
        Authorization: basicAuth(this.config.oidc.clientId, this.config.oidc.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
      }, body, signal: AbortSignal.timeout(15_000),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      const oauthError = string(object(payload).error);
      throw new ModelCrossTokenError(
        `ModelCross refresh failed (${response.status}): ${oauthError ?? 'unknown error'}`,
        response.status,
        oauthError,
      );
    }
    return parseTokens(payload);
  }

  async verifyIdToken(idToken: string, expectedNonce?: string): Promise<JWTPayload> {
    const discovery = await this.discovery();
    if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const verified = await jwtVerify(idToken, this.jwks, {
      issuer: discovery.issuer,
      audience: this.config.oidc.clientId,
      algorithms: ['RS256'],
      clockTolerance: 10,
    });
    if (expectedNonce && verified.payload.nonce !== expectedNonce) throw new Error('OIDC nonce mismatch');
    return verified.payload;
  }

  userFromClaims(claims: JWTPayload): PlatformUser {
    const subject = string(claims.sub);
    const issuer = string(claims.iss);
    if (!subject || !issuer) throw new Error('ID token is missing subject or issuer');
    const roles = Array.isArray(claims.roles)
      ? claims.roles.filter((role): role is string => typeof role === 'string')
      : typeof claims.role === 'string' ? [claims.role] : [];
    return {
      subject,
      issuer,
      modelCrossUserId: string(claims.user_id) ?? subject,
      email: string(claims.email),
      emailVerified: claims.email_verified === true,
      displayName: string(claims.name) ?? string(claims.preferred_username) ?? `用户 ${subject}`,
      avatarUrl: string(claims.picture),
      roles,
    };
  }

  async userinfo(accessToken: string): Promise<PlatformUser> {
    const discovery = await this.discovery();
    const response = await this.fetchImpl(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw Object.assign(new Error(`ModelCross userinfo returned HTTP ${response.status}`), { status: response.status });
    // OIDC UserInfo requires `sub`, but unlike an ID token it does not require
    // an `iss` claim. Identity rows are keyed by issuer + subject, so bind the
    // response to the already verified Discovery issuer instead of expecting a
    // non-standard field from ModelCross (or trusting one supplied in JSON).
    const claims = { ...object(await safeJson(response)), iss: discovery.issuer };
    return this.userFromClaims(claims as JWTPayload);
  }

  async account(accessToken: string): Promise<AccountSummary> {
    const requestAccount = async (path: string): Promise<Record<string, unknown>> => {
      const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw Object.assign(new Error(`ModelCross account returned HTTP ${response.status}`), { status: response.status });
      const envelope = object(await safeJson(response));
      return object(envelope.data ?? envelope);
    };
    const [data, displayData] = await Promise.all([
      requestAccount('/api/work/v2/account'),
      // The v1 Work account contract is explicitly USD. MuseFlow's product
      // credit is one hundredth of a dollar, so this is the source of truth
      // for the user-facing balance rather than raw quota units.
      requestAccount('/api/work/v1/account'),
    ]);
    const wallet = object(data.wallet);
    const credits = object(data.credits);
    const legacySubscription = object(data.subscription);
    const displaySubscription = object(displayData.subscription);
    const entitlementList = array(data.entitlements).map(object);
    const subscription = entitlementList.find((entry) => entry.type === 'subscription') ?? legacySubscription;
    const usdBalance = number(displayData.balance);
    const creditsFromUsd = (usd: number): number =>
      Math.max(0, Math.round(usd * 10_000) / 100);
    const rawBalance = number(credits.available_credits ?? credits.available ?? data.balance_credits ?? data.balance_minor ?? data.wallet_balance ?? wallet.balance_credits ?? wallet.quota);
    const balance = usdBalance !== null
      ? creditsFromUsd(usdBalance)
      : number(credits.available_credits);
    const reserved = number(credits.reserved_credits);
    if (balance === null) {
      if (rawBalance === null) throw new Error('ModelCross account response is missing credits.available');
      if (reserved === null) throw new Error('ModelCross account response is missing credits.reserved');
      throw new Error('ModelCross account response is missing a user-facing USD balance');
    }
    const subscriptionDisplayCredits = number(displaySubscription.quota_remaining);
    const displayName = string(displaySubscription.name);
    const displayStatus = string(displaySubscription.status);
    const displayRenewsAt = epochOrString(displaySubscription.expires_at);
    const entitlementValue = object(data.entitlements);
    const entitlements: AccountSummary['entitlements'] = {};
    for (const [key, value] of Object.entries(entitlementValue)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))) entitlements[key] = value as never;
    }
    const subscriptionId = string(subscription.id ?? subscription.subscription_id);
    return {
      balanceCredits: balance,
      reservedCredits: reserved ?? 0,
      displayBalance: balance.toLocaleString('zh-CN'),
      unit: 'credits',
      subscription: subscriptionId || displayName ? {
        id: subscriptionId ?? '',
        name: displayName ?? string(subscription.name ?? subscription.plan_name) ?? '订阅套餐',
        status: displayStatus ?? string(subscription.status) ?? 'active',
        remainingCredits: subscriptionDisplayCredits !== null
          ? creditsFromUsd(subscriptionDisplayCredits)
          : number(subscription.remaining_credits) ?? 0,
        renewsAt: displayRenewsAt ?? epochOrString(subscription.renews_at ?? subscription.expires_at),
      } : null,
      entitlements,
      walletUrl: this.config.modelCross.walletUrl,
      ordersUrl: this.config.modelCross.ordersUrl,
      accountUrl: this.config.modelCross.accountUrl,
      lastUsage: null,
    };
  }

  /**
   * Return the music models that the current ModelCross Work identity may use.
   * ModelCross remains the group/channel authorization boundary; MuseFlow only
   * intersects this list with its local presentation metadata and provider
   * adapter support.
   */
  async musicModelIds(accessToken: string): Promise<string[]> {
    if (this.config.authMode === 'development') return [];
    const cached = this.modelCatalogCache.get(accessToken);
    if (cached && cached.expiresAt > Date.now()) return [...cached.ids];
    if (cached) this.modelCatalogCache.delete(accessToken);

    const existingRequest = this.modelCatalogInFlight.get(accessToken);
    if (existingRequest) return [...await existingRequest];

    const request = (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}/v1/models`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
          });
          const envelope = object(await safeJson(response));
          if (!response.ok) {
            if ([500, 502, 503, 504].includes(response.status) && attempt < 2) {
              await new Promise<void>((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
              continue;
            }
            throw Object.assign(new Error(`ModelCross model catalog returned HTTP ${response.status}`), {
              status: response.status,
              payload: envelope,
            });
          }
          if (envelope.success === false) {
            throw Object.assign(new Error(
              string(envelope.message) ?? 'ModelCross model catalog rejected the request',
            ), { status: 502, payload: envelope });
          }

          const nested = object(envelope.data);
          const entries = Array.isArray(envelope.data)
            ? envelope.data
            : Array.isArray(nested.items) ? nested.items : null;
          if (!entries) {
            throw Object.assign(new Error('ModelCross model catalog response is incomplete or invalid'), {
              status: 502,
              payload: envelope,
            });
          }

          const ids = [...new Set(entries.map((entry, index) => {
            const model = object(entry);
            const id = string(model.id ?? model.model ?? model.name);
            if (!id) {
              throw Object.assign(new Error(`ModelCross model catalog entry ${index} is invalid`), {
                status: 502,
                payload: envelope,
              });
            }
            return id;
          }))];
          this.modelCatalogCache.set(accessToken, { ids, expiresAt: Date.now() + 5_000 });
          while (this.modelCatalogCache.size > 256) {
            const oldestKey = this.modelCatalogCache.keys().next().value as string | undefined;
            if (!oldestKey) break;
            this.modelCatalogCache.delete(oldestKey);
          }
          return ids;
        } catch (error) {
          if (attempt < 2 && object(error).status === undefined) {
            await new Promise<void>((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
            continue;
          }
          throw error;
        }
      }
      throw new Error('ModelCross model catalog retry budget exhausted');
    })();
    this.modelCatalogInFlight.set(accessToken, request);
    try {
      return [...await request];
    } finally {
      if (this.modelCatalogInFlight.get(accessToken) === request) {
        this.modelCatalogInFlight.delete(accessToken);
      }
    }
  }

  /**
   * Resolve every paid music action against ModelCross's owner-scoped Work
   * Billing Catalog. Billing being disabled is a mutation kill switch, not a
   * reason to substitute local prices. Only the explicitly labelled local
   * development identity receives fallback preview entries.
   */
  async musicOperationCatalog(
    accessToken: string,
    requested: RequestedMusicOperation[],
  ): Promise<MusicOperationCatalogItem[]> {
    if (this.config.authMode === 'development') {
      return requested.map((entry) => ({
        action: entry.action,
        operationCode: entry.operationCode,
        available: true,
        estimatedCredits: entry.fallbackCredits,
        priceVersion: 'museflow-development-preview-v1',
        chargingEnabled: false,
        preview: true,
        reason: '本地开发预览价格，不会发起真实扣费',
      }));
    }

    const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}/api/work/v1/billing/catalog`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const envelope = object(await safeJson(response));
    if (!response.ok) {
      throw Object.assign(new Error(`ModelCross billing catalog returned HTTP ${response.status}`), {
        status: response.status,
        payload: envelope,
      });
    }
    const entries = (Array.isArray(envelope.data)
      ? envelope.data
      : array(object(envelope.data).items)).map(object);
    const byCode = new Map(entries.flatMap((entry) => {
      const operationCode = string(entry.operation_code);
      return operationCode ? [[operationCode, entry] as const] : [];
    }));

    return requested.map((request) => {
      const entry = byCode.get(request.operationCode);
      if (!entry) {
        return {
          action: request.action,
          operationCode: request.operationCode,
          available: false,
          estimatedCredits: null,
          priceVersion: null,
          chargingEnabled: false,
          preview: false,
          reason: 'ModelCross 价格目录尚未配置此操作',
        };
      }
      const amount = number(entry.amount ?? entry.estimated_credits ?? entry.amount_minor);
      const priceVersion = string(entry.price_version);
      if (amount === null || amount < 0 || !priceVersion) {
        return {
          action: request.action,
          operationCode: request.operationCode,
          available: false,
          estimatedCredits: null,
          priceVersion: null,
          chargingEnabled: false,
          preview: false,
          reason: 'ModelCross 返回了无效的价格目录项',
        };
      }
      const chargingEnabled = entry.charging_enabled === true;
      return {
        action: request.action,
        operationCode: request.operationCode,
        available: true,
        estimatedCredits: amount,
        priceVersion,
        chargingEnabled,
        preview: !chargingEnabled,
        ...(!chargingEnabled ? { reason: 'ModelCross 当前仅开放价格预览，真实扣费已关闭' } : {}),
      };
    });
  }

  async taskToken(accessToken: string, request: {
    credentialId: string;
    resourceId: string;
    allowedOperations: string[];
    allowedModels: string[];
    maxCost: number;
    idempotencyKey: string;
    ttlSeconds?: number;
  }): Promise<string> {
    if (!this.config.modelCross.taskTokenSecret) return accessToken;
    const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}/api/work/v1/task-token`, {
      method: 'POST', headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-ModelCross-Task-Secret': this.config.modelCross.taskTokenSecret,
      }, body: JSON.stringify({
        credential_id: request.credentialId,
        resource_id: request.resourceId,
        allowed_operations: request.allowedOperations,
        allowed_models: request.allowedModels,
        max_cost: request.maxCost,
        idempotency_key: request.idempotencyKey,
        ttl_seconds: Math.min(4 * 60 * 60, request.ttlSeconds ?? 4 * 60 * 60),
      }), signal: AbortSignal.timeout(15_000),
    });
    const payload = object(await safeJson(response));
    if (!response.ok) throw new Error(`ModelCross task-token returned HTTP ${response.status}`);
    const token = string(payload.access_token ?? object(payload.data).access_token);
    if (!token) throw new Error('ModelCross task-token response is incomplete');
    return token;
  }

  async musicProviderStatus(): Promise<ModelCrossMusicProviderStatus> {
    const internalSecret = this.config.modelCross.taskTokenSecret;
    if (!internalSecret) throw new Error('ModelCross music gateway status credential is unavailable');
    const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}/api/work/internal/suno/status`, {
      headers: {
        Accept: 'application/json',
        'X-ModelCross-Task-Secret': internalSecret,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const envelope = object(await safeJson(response));
    if (!response.ok) throw new Error(`ModelCross music gateway status returned HTTP ${response.status}`);
    const payload = object(envelope.data);
    const checkedAt = exactString(payload.checked_at);
    if (typeof payload.gateway_enabled !== 'boolean'
      || typeof payload.billing_enabled !== 'boolean'
      || typeof payload.provider_configured !== 'boolean'
      || typeof payload.provider_reachable !== 'boolean'
      || typeof payload.provider_authenticated !== 'boolean'
      || !checkedAt) {
      throw new Error('ModelCross music gateway status response is incomplete');
    }
    return {
      gatewayEnabled: payload.gateway_enabled,
      billingEnabled: payload.billing_enabled,
      providerConfigured: payload.provider_configured,
      providerReachable: payload.provider_reachable,
      providerAuthenticated: payload.provider_authenticated,
      errorCode: exactString(payload.error_code),
      checkedAt,
    };
  }

  async quote(accessToken: string, request: {
    operationCode: string; expectedItems: number; priceVersion?: string; fallbackCredits?: number;
  }): Promise<BillingQuote> {
    if (positiveInteger(request.expectedItems) === null) {
      throw new Error('ModelCross billing quote requires a positive expectedItems value');
    }
    if (!this.config.modelCross.billingLive) {
      return {
        operationCode: request.operationCode,
        priceVersion: 'music-2026-08-v1',
        estimatedCredits: request.fallbackCredits ?? 0,
        currency: 'credits',
        partialSuccessPolicy: 'per_take',
      };
    }
    const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}/api/work/v1/billing/quote`, {
      method: 'POST', headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
      }, body: JSON.stringify({
        operation_code: request.operationCode,
        ...(request.priceVersion ? { price_version: request.priceVersion } : {}),
      }), signal: AbortSignal.timeout(15_000),
    });
    const envelope = object(await safeJson(response));
    if (response.status !== 200) throw Object.assign(new Error(`ModelCross billing quote returned HTTP ${response.status}`), { status: response.status, payload: envelope });
    const payload = object(envelope.data ?? envelope);
    const operationCode = exactString(payload.operation_code);
    const priceVersion = exactString(payload.price_version);
    const estimatedCredits = positiveInteger(payload.amount);
    const productKey = exactString(payload.product_key);
    const resourceType = exactString(payload.resource_type);
    const totalItems = positiveInteger(payload.total_items);
    if (operationCode !== request.operationCode || !priceVersion || estimatedCredits === null
      || !productKey || !resourceType || totalItems === null || totalItems !== request.expectedItems
      || payload.credit_unit !== 'quota_unit' || payload.charging_enabled !== true
      || (request.priceVersion !== undefined && priceVersion !== request.priceVersion)) {
      throw new Error('ModelCross billing quote response is incomplete or mismatched');
    }
    return {
      operationCode,
      priceVersion,
      estimatedCredits,
      currency: 'credits',
      partialSuccessPolicy: parseBillingPolicy(payload.partial_success_policy, 'ModelCross billing quote'),
    };
  }

  async reserve(accessToken: string, request: {
    operationCode: string; resourceId: string; priceVersion: string; idempotencyKey: string;
    expectedItems: number;
  }, fallbackCredits: number): Promise<BillingReservation> {
    if (positiveInteger(request.expectedItems) === null) {
      throw new Error('ModelCross billing reserve requires a positive expectedItems value');
    }
    if (!this.config.modelCross.billingLive) {
      return {
        operationId: `disabled-${request.resourceId}`,
        reservationId: `disabled-${request.resourceId}`,
        operationCode: request.operationCode,
        priceVersion: request.priceVersion,
        estimatedCredits: fallbackCredits,
        currency: 'credits',
        partialSuccessPolicy: 'per_take',
        status: 'disabled',
      };
    }
    const payload = parseBillingOperation(await this.billingRequest(accessToken, '/api/work/v1/billing/reserve', {
      operation_code: request.operationCode,
      price_version: request.priceVersion,
      resource_id: request.resourceId,
    }, request.idempotencyKey, 201), 'ModelCross reserve');
    if (payload.operationCode !== request.operationCode || payload.resourceId !== request.resourceId
      || payload.priceVersion !== request.priceVersion || payload.status !== 'reserved'
      || payload.quotedAmount !== payload.reservedAmount || payload.capturedAmount !== 0
      || payload.releasedAmount !== 0 || payload.refundedAmount !== 0
      || payload.totalItems !== request.expectedItems || payload.successfulItems !== 0) {
      throw new Error('ModelCross reserve response is mismatched or has an invalid initial state');
    }
    return {
      operationId: payload.operationId,
      reservationId: payload.reservationId,
      operationCode: payload.operationCode,
      priceVersion: payload.priceVersion,
      estimatedCredits: payload.quotedAmount,
      currency: 'credits',
      partialSuccessPolicy: 'per_take',
      status: 'reserved',
      resourceId: payload.resourceId,
    };
  }

  /**
   * Recover a Reserve response after ModelCross committed it but the product
   * process exited before storing operation_id/reservation_id locally. The
   * product and owner are derived by ModelCross from the restricted token.
   */
  async lookupOperation(accessToken: string, request: {
    resourceId: string; idempotencyKey: string;
  }): Promise<BillingReservation | null> {
    if (!this.config.modelCross.billingLive) return null;
    const url = new URL(`${this.config.modelCross.baseUrl}/api/work/v1/billing/operations/lookup`);
    url.searchParams.set('resource_id', request.resourceId);
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Idempotency-Key': request.idempotencyKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = object(await safeJson(response));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw Object.assign(new Error(`ModelCross billing lookup returned HTTP ${response.status}`), {
        status: response.status, payload: envelope,
      });
    }
    const payload = parseBillingOperation(envelope.data ?? envelope, 'ModelCross billing lookup');
    if (payload.resourceId !== request.resourceId) throw new Error('ModelCross billing lookup response is mismatched');
    return {
      operationId: payload.operationId,
      reservationId: payload.reservationId,
      operationCode: payload.operationCode,
      priceVersion: payload.priceVersion,
      resourceId: payload.resourceId,
      estimatedCredits: payload.quotedAmount,
      capturedCredits: payload.capturedAmount,
      releasedCredits: payload.releasedAmount,
      refundedCredits: payload.refundedAmount,
      currency: 'credits',
      partialSuccessPolicy: 'per_take',
      status: payload.status,
    };
  }

  async settle(accessToken: string, path: 'capture' | 'release' | 'refund', request: Record<string, unknown>, idempotencyKey: string): Promise<Record<string, unknown>> {
    if (!this.config.modelCross.billingLive) return { status: 'disabled', settled_credits: 0 };
    const operationId = exactString(request.operation_id);
    if (!operationId) throw new Error('billing settlement requires operation_id');
    const successfulItems = path === 'capture'
      ? nonNegativeInteger(request.successful_items ?? request.succeeded_units)
      : null;
    if (path === 'capture' && successfulItems === null) {
      throw new Error('billing capture requires a non-negative integer successful_items');
    }
    const body = path === 'capture' ? { successful_items: successfulItems } : {};
    const payload = parseBillingOperation(await this.billingRequest(
      accessToken,
      `/api/work/v1/billing/operations/${encodeURIComponent(operationId)}/${path}`,
      body,
      idempotencyKey,
    ), `ModelCross billing ${path}`);
    const reservationId = exactString(request.reservation_id);
    const resourceId = exactString(request.resource_id);
    if (payload.operationId !== operationId
      || (reservationId !== null && payload.reservationId !== reservationId)
      || (resourceId !== null && payload.resourceId !== resourceId)) {
      throw new Error(`ModelCross billing ${path} response is mismatched`);
    }
    if (path === 'capture') {
      const expectedStatus = successfulItems === 0
        ? 'released'
        : successfulItems === payload.totalItems ? 'captured' : 'partially_captured';
      if (successfulItems! > payload.totalItems || payload.successfulItems !== successfulItems
        || payload.status !== expectedStatus) {
        throw new Error('ModelCross billing capture response has an invalid status or item count');
      }
    } else if (payload.status !== (path === 'release' ? 'released' : 'refunded')) {
      throw new Error(`ModelCross billing ${path} response has an invalid status`);
    }
    return payload.raw;
  }

  private async billingRequest(
    accessToken: string,
    path: string,
    body: unknown,
    idempotencyKey: string,
    expectedStatus = 200,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.config.modelCross.baseUrl}${path}`, {
      method: 'POST', headers: {
        Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    const payload = object(await safeJson(response));
    if (response.status !== expectedStatus) throw Object.assign(new Error(`ModelCross billing returned HTTP ${response.status}`), { status: response.status, payload });
    return object(payload.data ?? payload);
  }

  async aiJson(accessToken: string, input: {
    action: AiAssistAction; model: string; system: string; prompt: string; schema: Record<string, unknown>;
  }): Promise<ModelCrossAiResult> {
    const request = {
        model: input.model,
        // Music-assistant JSON is compact. Bounding output prevents the relay
        // from reserving a provider-sized default completion budget for a
        // short title, prompt or song-lyric response.
        max_output_tokens: input.action.startsWith('lyrics.') ? 2048 : 768,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: input.system }] },
          { role: 'user', content: [{ type: 'input_text', text: input.prompt }] },
        ],
        text: { format: { type: 'json_schema', name: 'museflow_assistant', strict: true, schema: input.schema } },
    };
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.config.modelCross.baseUrl}/v1/responses`, {
          method: 'POST', headers: {
            Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
          }, body: JSON.stringify(request), signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        lastError = error;
        if (attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      const payload = object(await safeJson(response));
      if (response.ok) {
        return { payload: parseJsonText(extractOutputText(payload)), requestId: response.headers.get('x-request-id') };
      }
      const providerError = string(object(payload.error).message ?? payload.message);
      const detail = providerError ? `: ${providerError.slice(0, 240)}` : '';
      lastError = Object.assign(new Error(`ModelCross AI returned HTTP ${response.status}${detail}`), { status: response.status });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= 2) throw lastError;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(30_000, retryAfter * 1000)
        : 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError instanceof Error ? lastError : new Error('ModelCross AI request failed');
  }
}
