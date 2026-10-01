import http, { type IncomingHttpHeaders, type Server } from 'node:http';
import { once } from 'node:events';
import { generateKeyPair, exportJWK, SignJWT, type JWTPayload } from 'jose';

export interface FakeModelCrossRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface FakeModelCrossOptions {
  clientId?: string;
  clientSecret?: string;
  account?: Record<string, unknown>;
  aiPayload?: Record<string, unknown>;
  discoveryIssuer?: string;
  musicModels?: string[];
  billingCatalog?: Array<Record<string, unknown>>;
}

export interface FakeModelCross {
  url: string;
  requests: FakeModelCrossRequest[];
  signIdToken(claims?: JWTPayload): Promise<string>;
  close(): Promise<void>;
}

async function readBody(request: http.IncomingMessage): Promise<{ raw: string; json: unknown }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error('request body too large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return { raw, json: null };
  const contentType = request.headers['content-type'] ?? '';
  if (contentType.includes('application/json')) {
    try { return { raw, json: JSON.parse(raw) as unknown }; } catch { return { raw, json: null }; }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return { raw, json: Object.fromEntries(new URLSearchParams(raw)) };
  }
  return { raw, json: raw };
}

const sendJson = (response: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
};

export async function startFakeModelCross(options: FakeModelCrossOptions = {}): Promise<FakeModelCross> {
  const clientId = options.clientId ?? 'museflow-test';
  const clientSecret = options.clientSecret ?? 'modelcross-test-client-secret';
  const expectedBasic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { kid: 'fake-modelcross-rs256', alg: 'RS256', use: 'sig' });
  const requests: FakeModelCrossRequest[] = [];
  let url = '';

  const signIdToken = async (claims: JWTPayload = {}): Promise<string> => new SignJWT({
    user_id: '42',
    email: 'creator@example.test',
    email_verified: true,
    name: 'ModelCross Creator',
    roles: ['creator'],
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'fake-modelcross-rs256', typ: 'JWT' })
    .setIssuer(url)
    .setAudience(clientId)
    .setSubject(typeof claims.sub === 'string' ? claims.sub : 'mc-user-42')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);

  const server: Server = http.createServer((request, response) => {
    void (async () => {
      const parsed = new URL(request.url ?? '/', 'http://fake-modelcross.local');
      const body = await readBody(request);
      requests.push({
        method: request.method ?? 'GET',
        path: `${parsed.pathname}${parsed.search}`,
        headers: request.headers,
        body: body.json,
      });

      if (parsed.pathname === '/.well-known/openid-configuration') {
        const issuer = options.discoveryIssuer ?? url;
        return sendJson(response, 200, {
          issuer,
          authorization_endpoint: `${url}/authorize`,
          token_endpoint: `${url}/token`,
          userinfo_endpoint: `${url}/userinfo`,
          jwks_uri: `${url}/jwks`,
          end_session_endpoint: `${url}/logout`,
        });
      }
      if (parsed.pathname === '/jwks') return sendJson(response, 200, { keys: [publicJwk] });

      if (parsed.pathname === '/token') {
        if (request.headers.authorization !== expectedBasic) return sendJson(response, 401, { error: 'invalid_client' });
        const form = body.json as Record<string, unknown>;
        if (form.grant_type === 'authorization_code') {
          if (form.code !== 'valid-code' || typeof form.code_verifier !== 'string') return sendJson(response, 400, { error: 'invalid_grant' });
          return sendJson(response, 200, {
            access_token: 'access-from-code',
            refresh_token: 'refresh-from-code',
            id_token: await signIdToken({ nonce: 'expected-nonce' }),
            expires_in: 900,
            refresh_expires_in: 86400,
            scope: 'openid profile modelcross.work modelcross.work.billing',
          });
        }
        if (form.grant_type === 'refresh_token') {
          if (form.refresh_token !== 'refresh-from-code') return sendJson(response, 400, { error: 'invalid_grant' });
          return sendJson(response, 200, {
            access_token: 'access-refreshed',
            refresh_token: 'refresh-rotated',
            id_token: await signIdToken(),
            expires_in: 600,
            refresh_expires_in: 7200,
            scope: 'openid modelcross.work modelcross.work.billing',
          });
        }
        return sendJson(response, 400, { error: 'unsupported_grant_type' });
      }

      if (parsed.pathname === '/userinfo') {
        if (request.headers.authorization !== 'Bearer access-from-code') return sendJson(response, 401, { error: 'invalid_token' });
        return sendJson(response, 200, {
          // Real ModelCross follows the OIDC UserInfo contract: `sub` is
          // required, while `iss` is not part of this response.
          sub: 'mc-user-42', user_id: '42', email: 'creator@example.test',
          email_verified: true, name: 'ModelCross Creator', roles: ['creator'],
        });
      }

      if (parsed.pathname === '/api/work/v2/account') {
        if (!request.headers.authorization?.startsWith('Bearer ')) return sendJson(response, 401, { error: 'unauthorized' });
        return sendJson(response, 200, { data: options.account ?? {
          credits: {
            unit: 'quota_unit', available: 3_600_000, reserved: 400_000,
            display_unit: 'credit', credits_per_usd: 100,
            available_credits: 720, reserved_credits: 80,
          },
          entitlements: [{
            id: 'creator-pro', type: 'subscription', name: 'Creator Pro', status: 'active',
            remaining: 2_500_000, remaining_credits: 500, renews_at: 1_800_000_000,
          }],
        } });
      }

      if (parsed.pathname === '/api/work/v1/account') {
        if (!request.headers.authorization?.startsWith('Bearer ')) return sendJson(response, 401, { error: 'unauthorized' });
        return sendJson(response, 200, { data: {
          balance: 7.2,
          currency: 'USD',
          subscription: {
            name: 'Creator Pro', status: 'active', quota_remaining: 5,
            expires_at: 1_800_000_000,
          },
        } });
      }

      if (parsed.pathname === '/v1/models' && request.method === 'GET') {
        if (!request.headers.authorization?.startsWith('Bearer ')) return sendJson(response, 401, { error: 'unauthorized' });
        return sendJson(response, 200, {
          object: 'list',
          data: (options.musicModels ?? ['chirp-fenix', 'chirp-bluejay']).map((id) => ({ id, object: 'model' })),
        });
      }

      if (parsed.pathname === '/api/work/v1/billing/catalog' && request.method === 'GET') {
        if (!request.headers.authorization?.startsWith('Bearer ')) return sendJson(response, 401, { error: 'unauthorized' });
        return sendJson(response, 200, { data: options.billingCatalog ?? [
          {
            product_key: 'museflow', operation_code: 'generation_pair', display_name: 'Generate two songs',
            resource_type: 'generation_batch', price_version: 'music-price-v9', amount: 24,
            total_items: 2, partial_success_policy: 'pro_rata', charging_enabled: true,
          },
          {
            product_key: 'museflow', operation_code: 'video_single', display_name: 'Create music video',
            resource_type: 'track_asset_job', price_version: 'music-price-v9', amount: 8,
            total_items: 1, partial_success_policy: 'pro_rata', charging_enabled: false,
          },
        ] });
      }

      if (parsed.pathname === '/api/work/v1/task-token' && request.method === 'POST') {
        if (request.headers['x-modelcross-task-secret'] !== 'task-token-service-secret') return sendJson(response, 403, { error: 'forbidden' });
        return sendJson(response, 200, { data: { access_token: 'restricted-worker-token' } });
      }

      if (parsed.pathname === '/api/work/v1/billing/quote' && request.method === 'POST') {
        return sendJson(response, 200, { data: {
          product_key: 'museflow',
          operation_code: (body.json as Record<string, unknown>).operation_code,
          display_name: 'Generate two songs', resource_type: 'generation_batch',
          price_version: 'music-price-v9', amount: 24, credit_unit: 'quota_unit',
          total_items: 2, partial_success_policy: 'pro_rata', charging_enabled: true,
        } });
      }

      if (parsed.pathname === '/api/work/v1/billing/reserve' && request.method === 'POST') {
        if (!request.headers['idempotency-key']) return sendJson(response, 400, { error: 'idempotency_required' });
        return sendJson(response, 201, { data: {
          operation_id: 'operation-1', reservation_id: 'reservation-1',
          product_key: 'museflow', resource_type: 'generation_batch',
          operation_code: (body.json as Record<string, unknown>).operation_code,
          resource_id: (body.json as Record<string, unknown>).resource_id,
          price_version: (body.json as Record<string, unknown>).price_version,
          quoted_amount: 24, reserved_amount: 24, captured_amount: 0,
          released_amount: 0, refunded_amount: 0, total_items: 2, successful_items: 0,
          status: 'reserved', expires_at: 1_900_000_000, credits_available: 696, replayed: false,
        } });
      }

      if (parsed.pathname === '/api/work/v1/billing/operations/lookup' && request.method === 'GET') {
        if (!request.headers['idempotency-key']) return sendJson(response, 400, { error: 'idempotency_required' });
        const resourceId = parsed.searchParams.get('resource_id');
        if (resourceId === 'missing-resource') return sendJson(response, 404, { error: 'billing_operation_not_found' });
        return sendJson(response, 200, { data: {
          operation_id: 'operation-1', reservation_id: 'reservation-1',
          product_key: 'museflow', operation_code: 'generation_pair', resource_type: 'generation_batch',
          resource_id: resourceId, price_version: 'music-price-v9', quoted_amount: 24,
          reserved_amount: 24, captured_amount: 0, released_amount: 0, refunded_amount: 0,
          total_items: 2, successful_items: 0, status: 'reserved', expires_at: 1_900_000_000,
          credits_available: 696, replayed: true,
        } });
      }

      const settlement = /^\/api\/work\/v1\/billing\/operations\/([^/]+)\/(capture|release|refund)$/.exec(parsed.pathname);
      if (settlement && request.method === 'POST') {
        if (!request.headers['idempotency-key']) return sendJson(response, 400, { error: 'idempotency_required' });
        const action = settlement[2]!;
        const successfulItems = action === 'capture'
          ? Number((body.json as Record<string, unknown>).successful_items)
          : 0;
        const capturedAmount = action === 'capture' ? successfulItems * 12 : action === 'refund' ? 12 : 0;
        const status = action === 'capture'
          ? successfulItems === 0 ? 'released' : successfulItems === 2 ? 'captured' : 'partially_captured'
          : action === 'release' ? 'released' : 'refunded';
        return sendJson(response, 200, { data: {
          operation_id: decodeURIComponent(settlement[1]!), reservation_id: 'reservation-1',
          product_key: 'museflow', operation_code: 'generation_pair', resource_type: 'generation_batch',
          resource_id: 'generation-1', price_version: 'music-price-v9', quoted_amount: 24,
          reserved_amount: 0, captured_amount: capturedAmount,
          released_amount: action === 'release' ? 24 : action === 'capture' ? 24 - capturedAmount : 12,
          refunded_amount: action === 'refund' ? capturedAmount : 0,
          total_items: 2, successful_items: successfulItems, status,
          expires_at: 1_900_000_000, credits_available: 708, replayed: false,
        } });
      }

      if (parsed.pathname === '/v1/responses' && request.method === 'POST') {
        const payload = options.aiPayload ?? {
          suggestion: '[Verse]\nNew original line', summary: 'Improved structure', title: 'New Light',
          styleTags: ['dream pop'], negativeTags: ['harsh vocal'],
        };
        return sendJson(response, 200, { output_text: JSON.stringify(payload) }, { 'X-Request-ID': 'fake-ai-request-1' });
      }

      sendJson(response, 404, { error: 'not_found' });
    })().catch((error: unknown) => sendJson(response, 500, { error: (error as Error).message }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake ModelCross did not expose a TCP address');
  url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    requests,
    signIdToken,
    async close(): Promise<void> {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close');
    },
  };
}
