import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelCrossClient, ModelCrossTokenError } from '../../src/platform/modelcross-client.js';
import { startFakeModelCross, type FakeModelCross } from '../fakeModelCross.js';
import { testConfig } from './helpers.js';

let fake: FakeModelCross | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
});

async function liveClient(extraEnv: NodeJS.ProcessEnv = {}) {
  fake = await startFakeModelCross();
  const config = testConfig({
    AUTH_MODE: 'oidc',
    MODELCROSS_OIDC_ISSUER: fake.url,
    MODELCROSS_BASE_URL: fake.url,
    MODELCROSS_OIDC_REDIRECT_URI: 'http://127.0.0.1:8787/api/auth/callback',
    MODELCROSS_TASK_TOKEN_SECRET: 'task-token-service-secret',
    MODELCROSS_AI_RELAY_TOKEN: 'modelcross-ai-relay-test-token',
    BILLING_LIVE_ENABLED: 'true',
    AI_LIVE_ENABLED: 'true',
    ...extraEnv,
  });
  return { config, client: new ModelCrossClient(config) };
}

function stubbedBillingClient(body: unknown, status = 200): ModelCrossClient {
  const fetchImpl = vi.fn(async () => new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } },
  )) as unknown as typeof fetch;
  return new ModelCrossClient(testConfig({
    AUTH_MODE: 'oidc', BILLING_LIVE_ENABLED: 'true',
    MODELCROSS_TASK_TOKEN_SECRET: 'task-token-service-secret',
  }), fetchImpl);
}

const operationEnvelope = (overrides: Record<string, unknown> = {}) => ({ data: {
  operation_id: 'operation-1', reservation_id: 'reservation-1', product_key: 'museflow',
  operation_code: 'generation_pair', resource_type: 'generation_batch', resource_id: 'generation-1',
  price_version: 'music-price-v9', quoted_amount: 24, reserved_amount: 24, captured_amount: 0,
  released_amount: 0, refunded_amount: 0, total_items: 2, successful_items: 0,
  status: 'reserved', expires_at: 1_900_000_000, credits_available: 696, replayed: false,
  ...overrides,
} });

describe('ModelCross OIDC and work API contract', () => {
  it('builds an authorization-code + PKCE request and caches issuer discovery', async () => {
    const { client, config } = await liveClient();
    const first = new URL(await client.authorizationUrl({
      state: 'opaque-state', nonce: 'opaque-nonce', codeChallenge: 'sha256-challenge',
    }));
    const second = new URL(await client.authorizationUrl({
      state: 'second-state', nonce: 'second-nonce', codeChallenge: 'second-challenge',
    }));

    expect(first.origin).toBe(fake!.url);
    expect(first.pathname).toBe('/authorize');
    expect(Object.fromEntries(first.searchParams)).toMatchObject({
      client_id: config.oidc.clientId,
      redirect_uri: config.oidc.redirectUri,
      response_type: 'code',
      state: 'opaque-state',
      nonce: 'opaque-nonce',
      code_challenge: 'sha256-challenge',
      code_challenge_method: 'S256',
    });
    expect(first.searchParams.get('scope')).toContain('modelcross.work.billing');
    expect(second.searchParams.get('state')).toBe('second-state');
    expect(fake!.requests.filter((entry) => entry.path === '/.well-known/openid-configuration')).toHaveLength(1);
  });

  it('exchanges and rotates tokens with HTTP Basic client authentication', async () => {
    const { client, config } = await liveClient();
    const exchanged = await client.exchangeCode('valid-code', 'pkce-verifier');
    const refreshed = await client.refresh(exchanged.refreshToken);

    expect(exchanged).toMatchObject({
      accessToken: 'access-from-code', refreshToken: 'refresh-from-code', expiresIn: 900,
    });
    expect(refreshed).toMatchObject({
      accessToken: 'access-refreshed', refreshToken: 'refresh-rotated', expiresIn: 600,
    });
    const tokenRequests = fake!.requests.filter((entry) => entry.path === '/token');
    expect(tokenRequests).toHaveLength(2);
    const expectedBasic = `Basic ${Buffer.from(`${config.oidc.clientId}:${config.oidc.clientSecret}`).toString('base64')}`;
    expect(tokenRequests[0]).toMatchObject({
      method: 'POST',
      headers: { authorization: expectedBasic },
      body: {
        grant_type: 'authorization_code', code: 'valid-code', code_verifier: 'pkce-verifier',
        redirect_uri: config.oidc.redirectUri,
      },
    });
    expect(tokenRequests[1]).toMatchObject({
      headers: { authorization: expectedBasic },
      body: { grant_type: 'refresh_token', refresh_token: 'refresh-from-code' },
    });
    expect(tokenRequests[0]?.body).not.toHaveProperty('client_id');
    expect(tokenRequests[1]?.body).not.toHaveProperty('client_id');
  });

  it('classifies an invalid refresh credential without treating transient failures as equivalent', async () => {
    const { client } = await liveClient();

    await expect(client.refresh('revoked-refresh-token')).rejects.toMatchObject({
      name: 'ModelCrossTokenError',
      status: 400,
      oauthError: 'invalid_grant',
      invalidRefreshCredential: true,
    } satisfies Partial<ModelCrossTokenError>);
  });

  it('verifies RS256 issuer/audience/nonce and maps stable OIDC claims', async () => {
    const { client } = await liveClient();
    const idToken = await fake!.signIdToken({
      sub: 'subject-9', nonce: 'nonce-9', user_id: '9', role: 'admin',
      email: 'nine@example.test', email_verified: true, preferred_username: 'Nine',
    });
    const claims = await client.verifyIdToken(idToken, 'nonce-9');
    expect(client.userFromClaims(claims)).toEqual({
      subject: 'subject-9', issuer: fake!.url, modelCrossUserId: '9',
      email: 'nine@example.test', emailVerified: true, displayName: 'ModelCross Creator',
      avatarUrl: null, roles: ['creator'],
    });
    await expect(client.verifyIdToken(idToken, 'wrong-nonce')).rejects.toThrow('OIDC nonce mismatch');
  });

  it('binds standard UserInfo without a non-standard iss claim to the discovered issuer', async () => {
    const { client } = await liveClient();

    await expect(client.userinfo('access-from-code')).resolves.toMatchObject({
      subject: 'mc-user-42', issuer: fake!.url, modelCrossUserId: '42',
      email: 'creator@example.test', displayName: 'ModelCross Creator', roles: ['creator'],
    });
    expect(fake!.requests.at(-1)).toMatchObject({
      path: '/userinfo', headers: { authorization: 'Bearer access-from-code' },
    });
  });

  it('maps ModelCross 1:100 display credits instead of exposing raw quota units', async () => {
    const { client } = await liveClient();
    const account = await client.account('access-from-code');

    expect(account).toMatchObject({
      balanceCredits: 720,
      reservedCredits: 80,
      unit: 'credits',
      subscription: {
        id: 'creator-pro', name: 'Creator Pro', status: 'active', remainingCredits: 500,
      },
    });
    expect(account.subscription?.renewsAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(fake!.requests.at(-1)).toMatchObject({
      path: '/api/work/v1/account', headers: { authorization: 'Bearer access-from-code' },
    });
    expect(fake!.requests.some((entry) => entry.path === '/api/work/v2/account')).toBe(true);
  });

  it('fails closed when the authoritative account response omits wallet balances', async () => {
    const missingAvailable = stubbedBillingClient({ data: { credits: { reserved: 0 } } });
    const missingReserved = stubbedBillingClient({ data: { credits: { available: 0 } } });

    await expect(missingAvailable.account('access-token'))
      .rejects.toThrow('missing credits.available');
    await expect(missingReserved.account('access-token'))
      .rejects.toThrow('missing credits.reserved');
  });

  it('reads the owner-scoped model and music price catalogs without local fallbacks', async () => {
    const { client } = await liveClient();

    await expect(client.musicModelIds('access-from-code')).resolves.toEqual([
      'chirp-fenix',
      'chirp-bluejay',
    ]);
    await expect(client.musicOperationCatalog('access-from-code', [
      { action: 'generate', operationCode: 'generation_pair', fallbackCredits: 999 },
      { action: 'video', operationCode: 'video_single', fallbackCredits: 999 },
      { action: 'speed', operationCode: 'speed_single', fallbackCredits: 999 },
    ])).resolves.toEqual([
      {
        action: 'generate', operationCode: 'generation_pair', available: true,
        estimatedCredits: 24, priceVersion: 'music-price-v9', chargingEnabled: true, preview: false,
      },
      {
        action: 'video', operationCode: 'video_single', available: true,
        estimatedCredits: 8, priceVersion: 'music-price-v9', chargingEnabled: false, preview: true,
        reason: 'ModelCross 当前仅开放价格预览，真实扣费已关闭',
      },
      {
        action: 'speed', operationCode: 'speed_single', available: false,
        estimatedCredits: null, priceVersion: null, chargingEnabled: false, preview: false,
        reason: 'ModelCross 价格目录尚未配置此操作',
      },
    ]);

    expect(fake!.requests.find((entry) => entry.path === '/v1/models')).toMatchObject({
      headers: { authorization: 'Bearer access-from-code' },
    });
    expect(fake!.requests.find((entry) => entry.path === '/api/work/v1/billing/catalog')).toMatchObject({
      headers: { authorization: 'Bearer access-from-code' },
    });
  });

  it('distinguishes an authorized empty model catalog from upstream contract failures', async () => {
    const empty = stubbedBillingClient({ object: 'list', data: [] });
    await expect(empty.musicModelIds('access-token')).resolves.toEqual([]);

    const rejected = stubbedBillingClient({
      success: false,
      message: 'failed to resolve the current ModelCross group',
    });
    await expect(rejected.musicModelIds('access-token'))
      .rejects.toThrow('failed to resolve the current ModelCross group');

    const missingData = stubbedBillingClient({ object: 'list' });
    await expect(missingData.musicModelIds('access-token'))
      .rejects.toThrow('response is incomplete or invalid');

    const malformedEntry = stubbedBillingClient({
      object: 'list',
      data: [{ object: 'model' }],
    });
    await expect(malformedEntry.musicModelIds('access-token'))
      .rejects.toThrow('entry 0 is invalid');
  });

  it('coalesces concurrent model catalog reads, retries transient failures, and briefly caches success', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'database temporarily unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        object: 'list',
        data: [{ id: 'gpt-5.4' }, { id: 'gemini-3-flash-preview' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    const client = new ModelCrossClient(testConfig({ AUTH_MODE: 'oidc' }), fetchImpl);

    const [first, concurrent] = await Promise.all([
      client.musicModelIds('shared-access-token'),
      client.musicModelIds('shared-access-token'),
    ]);
    const cached = await client.musicModelIds('shared-access-token');

    expect(first).toEqual(['gpt-5.4', 'gemini-3-flash-preview']);
    expect(concurrent).toEqual(first);
    expect(cached).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses restricted task grants and the authoritative quote/reserve/settlement paths', async () => {
    const { client } = await liveClient();
    const workerToken = await client.taskToken('user-access', {
      credentialId: 'cred-1', resourceId: 'generation-1',
      allowedOperations: ['generation_pair'], allowedModels: ['chirp-fenix'],
      maxCost: 24, idempotencyKey: 'idem-1', ttlSeconds: 99_999,
    });
    const quote = await client.quote(workerToken, { operationCode: 'generation_pair', expectedItems: 2 });
    const reservation = await client.reserve(workerToken, {
      operationCode: 'generation_pair', resourceId: 'generation-1',
      priceVersion: quote.priceVersion, idempotencyKey: 'idem-1', expectedItems: 2,
    }, 999);
    const recovered = await client.lookupOperation(workerToken, {
      resourceId: 'generation-1', idempotencyKey: 'idem-1',
    });
    const missing = await client.lookupOperation(workerToken, {
      resourceId: 'missing-resource', idempotencyKey: 'idem-missing',
    });
    const captured = await client.settle(workerToken, 'capture', {
      operation_id: reservation.operationId,
      reservation_id: reservation.reservationId,
      succeeded_units: 1,
      failed_units: 1,
    }, 'idem-1');
    await client.settle(workerToken, 'release', { operation_id: reservation.operationId }, 'idem-1');

    expect(workerToken).toBe('restricted-worker-token');
    expect(quote).toMatchObject({ priceVersion: 'music-price-v9', estimatedCredits: 24, currency: 'credits' });
    expect(reservation).toMatchObject({ operationId: 'operation-1', reservationId: 'reservation-1', estimatedCredits: 24 });
    expect(recovered).toMatchObject({
      operationId: 'operation-1', reservationId: 'reservation-1', resourceId: 'generation-1',
      operationCode: 'generation_pair', estimatedCredits: 24, status: 'reserved',
    });
    expect(missing).toBeNull();
    expect(captured).toMatchObject({ status: 'partially_captured', captured_amount: 12 });

    const taskGrant = fake!.requests.find((entry) => entry.path === '/api/work/v1/task-token')!;
    expect(taskGrant.headers).toMatchObject({
      authorization: 'Bearer user-access',
      'x-modelcross-task-secret': 'task-token-service-secret',
    });
    expect(taskGrant.body).toEqual({
      credential_id: 'cred-1', resource_id: 'generation-1',
      allowed_operations: ['generation_pair'], allowed_models: ['chirp-fenix'],
      max_cost: 24, idempotency_key: 'idem-1', ttl_seconds: 14_400,
    });

    expect(fake!.requests.find((entry) => entry.path === '/api/work/v1/billing/quote')?.body)
      .toEqual({ operation_code: 'generation_pair' });
    expect(fake!.requests.find((entry) => entry.path === '/api/work/v1/billing/reserve')).toMatchObject({
      headers: { 'idempotency-key': 'idem-1' },
      body: { operation_code: 'generation_pair', price_version: 'music-price-v9', resource_id: 'generation-1' },
    });
    expect(fake!.requests.find((entry) => entry.path === '/api/work/v1/billing/operations/lookup?resource_id=generation-1')).toMatchObject({
      method: 'GET', headers: { authorization: 'Bearer restricted-worker-token', 'idempotency-key': 'idem-1' },
    });
    expect(fake!.requests.find((entry) => entry.path === '/api/work/v1/billing/operations/operation-1/capture')).toMatchObject({
      headers: { 'idempotency-key': 'idem-1' }, body: { successful_items: 1 },
    });
    expect(fake!.requests.find((entry) => entry.path === '/api/work/v1/billing/operations/operation-1/release')).toMatchObject({
      headers: { 'idempotency-key': 'idem-1' }, body: {},
    });
  });

  it('rejects malformed successful billing envelopes instead of accepting terminal state', async () => {
    const invalidQuote = stubbedBillingClient({ data: {
      product_key: 'museflow', operation_code: 'generation_pair', resource_type: 'generation_batch',
      price_version: 'music-price-v9', amount: '24', credit_unit: 'quota_unit', total_items: 2,
      partial_success_policy: 'pro_rata', charging_enabled: true,
    } });
    await expect(invalidQuote.quote('token', { operationCode: 'generation_pair', expectedItems: 2 }))
      .rejects.toThrow('incomplete or mismatched');

    const invalidReserve = stubbedBillingClient(operationEnvelope({ status: undefined }), 201);
    await expect(invalidReserve.reserve('token', {
      operationCode: 'generation_pair', resourceId: 'generation-1',
      priceVersion: 'music-price-v9', idempotencyKey: 'valid-key-1', expectedItems: 2,
    }, 24)).rejects.toThrow('incomplete or invalid');

    const mismatchedSettlement = stubbedBillingClient(operationEnvelope({
      operation_id: 'another-operation', reserved_amount: 0, captured_amount: 24,
      successful_items: 2, status: 'captured',
    }));
    await expect(mismatchedSettlement.settle('token', 'capture', {
      operation_id: 'operation-1', reservation_id: 'reservation-1',
      resource_id: 'generation-1', successful_items: 2,
    }, 'valid-key-1')).rejects.toThrow('response is mismatched');

    const invalidJson = stubbedBillingClient('<html>upstream error</html>');
    await expect(invalidJson.quote('token', { operationCode: 'generation_pair', expectedItems: 2 }))
      .rejects.toThrow('incomplete or mismatched');
  });

  it('fails closed when quote or reserve item counts differ from the local operation contract', async () => {
    const mismatchedQuote = stubbedBillingClient({ data: {
      product_key: 'museflow', operation_code: 'generation_pair', resource_type: 'generation_batch',
      price_version: 'music-price-v9', amount: 24, credit_unit: 'quota_unit', total_items: 1,
      partial_success_policy: 'pro_rata', charging_enabled: true,
    } });
    await expect(mismatchedQuote.quote('token', {
      operationCode: 'generation_pair', expectedItems: 2,
    })).rejects.toThrow('incomplete or mismatched');

    const mismatchedReserve = stubbedBillingClient(operationEnvelope({ total_items: 1 }), 201);
    await expect(mismatchedReserve.reserve('token', {
      operationCode: 'generation_pair', resourceId: 'generation-1',
      priceVersion: 'music-price-v9', idempotencyKey: 'valid-key-1', expectedItems: 2,
    }, 24)).rejects.toThrow('mismatched or has an invalid initial state');
  });

  it('preserves actionable ModelCross billing error statuses', async () => {
    for (const status of [402, 409, 429, 503]) {
      const client = stubbedBillingClient({ error: { code: `http_${status}` } }, status);
      await expect(client.reserve('token', {
        operationCode: 'generation_pair', resourceId: 'generation-1',
        priceVersion: 'music-price-v9', idempotencyKey: 'valid-key-1', expectedItems: 2,
      }, 24)).rejects.toMatchObject({ status });
    }
  });

  it('requires the documented HTTP status and strict capture item count', async () => {
    const wrongStatus = stubbedBillingClient(operationEnvelope(), 200);
    await expect(wrongStatus.reserve('token', {
      operationCode: 'generation_pair', resourceId: 'generation-1',
      priceVersion: 'music-price-v9', idempotencyKey: 'valid-key-1', expectedItems: 2,
    }, 24)).rejects.toMatchObject({ status: 200 });

    const capture = stubbedBillingClient(operationEnvelope({
      reserved_amount: 0, captured_amount: 12, released_amount: 12,
      successful_items: 1, status: 'partially_captured',
    }));
    await expect(capture.settle('token', 'capture', {
      operation_id: 'operation-1', successful_items: null,
    }, 'valid-key-1')).rejects.toThrow('non-negative integer');
  });

  it('requests strict JSON-schema AI output through the shared ModelCross gateway', async () => {
    const { client } = await liveClient();
    const result = await client.aiJson('worker-access', {
      action: 'lyrics.rewrite', model: 'mc-music-lyrics', system: 'original only',
      prompt: JSON.stringify({ input: 'old lyrics' }),
      schema: { type: 'object', required: ['suggestion'] },
    });
    expect(result).toMatchObject({
      payload: { suggestion: '[Verse]\nNew original line', title: 'New Light' },
      requestId: 'fake-ai-request-1',
    });
    const call = fake!.requests.find((entry) => entry.path === '/v1/responses')!;
    expect(call.headers.authorization).toBe('Bearer worker-access');
    expect(call.body).toMatchObject({
      model: 'mc-music-lyrics',
      max_output_tokens: 2048,
      text: { format: { type: 'json_schema', name: 'museflow_assistant', strict: true } },
    });
  });

  it('retries transient ModelCross AI throttling and preserves the successful request id', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output_text: JSON.stringify({ suggestion: 'retry-success', summary: 'ok' }),
      }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'retry-request-1' } })) as unknown as typeof fetch;
    const client = new ModelCrossClient(testConfig({
      AUTH_MODE: 'oidc', MODELCROSS_BASE_URL: 'http://modelcross.test',
      BILLING_LIVE_ENABLED: 'true', AI_LIVE_ENABLED: 'true',
      MODELCROSS_AI_RELAY_TOKEN: 'relay-token-for-test',
      MODELCROSS_TASK_TOKEN_SECRET: 'task-token-service-secret',
    }), fetchImpl);
    await expect(client.aiJson('relay-token', {
      action: 'prompt.optimize', model: 'mc-music-fast', system: 'system', prompt: 'prompt', schema: { type: 'object' },
    })).resolves.toMatchObject({ payload: { suggestion: 'retry-success' }, requestId: 'retry-request-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps billing and task-token calls offline when live flags/secrets are disabled', async () => {
    const fetchImpl = vi.fn(() => { throw new Error('network must not be used'); }) as unknown as typeof fetch;
    const client = new ModelCrossClient(testConfig(), fetchImpl);
    await expect(client.taskToken('user-token', {
      credentialId: 'credential', resourceId: 'resource', allowedOperations: ['generation_pair'],
      allowedModels: ['chirp-fenix'], maxCost: 10, idempotencyKey: 'offline-idem',
    })).resolves.toBe('user-token');
    await expect(client.quote('user-token', {
      operationCode: 'generation_pair', expectedItems: 2, fallbackCredits: 14,
    }))
      .resolves.toMatchObject({ estimatedCredits: 14 });
    await expect(client.reserve('user-token', {
      operationCode: 'generation_pair', resourceId: 'resource', priceVersion: 'v1',
      idempotencyKey: 'offline-idem', expectedItems: 2,
    }, 14)).resolves.toMatchObject({ status: 'disabled', estimatedCredits: 14 });
    await expect(client.settle('user-token', 'release', { operation_id: 'operation' }, 'offline-idem'))
      .resolves.toEqual({ status: 'disabled', settled_credits: 0 });
    await expect(client.musicModelIds('user-token')).resolves.toEqual([]);
    await expect(client.musicOperationCatalog('user-token', [
      { action: 'generate', operationCode: 'generation_pair', fallbackCredits: 20 },
    ])).resolves.toEqual([{
      action: 'generate', operationCode: 'generation_pair', available: true,
      estimatedCredits: 20, priceVersion: 'museflow-development-preview-v1',
      chargingEnabled: false, preview: true,
      reason: '本地开发预览价格，不会发起真实扣费',
    }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-positive expected item count before any live or offline billing call', async () => {
    const fetchImpl = vi.fn(() => { throw new Error('network must not be used'); }) as unknown as typeof fetch;
    const client = new ModelCrossClient(testConfig(), fetchImpl);
    await expect(client.quote('user-token', {
      operationCode: 'video_single', expectedItems: 0, fallbackCredits: 8,
    })).rejects.toThrow('positive expectedItems');
    await expect(client.reserve('user-token', {
      operationCode: 'video_single', resourceId: 'asset-1', priceVersion: 'v1',
      idempotencyKey: 'offline-idem', expectedItems: 0,
    }, 8)).rejects.toThrow('positive expectedItems');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
