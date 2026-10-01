import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import multer from 'multer';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import type { SettingsStore } from '../settings.js';
import { SunoClient, SunoError } from '../suno.js';
import { ValidationError } from '../validate.js';
import {
  AI_OPERATION_DEFINITIONS,
  AiAssistantService,
  AiCapabilityUnavailableError,
  ContentPolicyError,
  aiModelForAction,
} from './ai-service.js';
import type { PlatformConfig } from './config.js';
import { assertModelCrossIdempotencyKey } from './idempotency.js';
import { ModelCrossClient } from './modelcross-client.js';
import { MusicService } from './music-service.js';
import {
  MXAPI_FIXED_OPERATION_REQUESTS,
  MXAPI_NON_MUSIC_CAPABILITIES,
} from './mxapi-capabilities.js';
import type { MvService } from './mv/service.js';
import { SunoActionsService } from './suno-actions-service.js';
import {
  AUDIO_UPLOAD_MAX_BYTES,
  AUDIO_UPLOAD_MIME_TYPES,
  MUSIC_OPERATION_DEFINITIONS,
} from './music-operations.js';
import { developmentFakeProviderAllowed } from './music-billing-gate.js';
import type { ObjectStorage } from './object-storage.js';
import { PlatformEventBus, type PlatformQueue } from './queue.js';
import {
  IdempotencyConflictError,
  PlatformRepository,
  ResourceNotFoundError,
  ResourceStateConflictError,
} from './repository.js';
import { safeAuthFailureCode, safeReturnTo, SessionManager } from './session.js';
import type { AccountSummary, AiModelProfile, AuthenticatedSession, MusicModelProfile, PlatformUser } from './types.js';

export interface PlatformAppDeps {
  config: PlatformConfig;
  repository: PlatformRepository;
  sessions: SessionManager;
  modelCross: ModelCrossClient;
  music: MusicService;
  sunoActions: SunoActionsService;
  mv?: MvService;
  ai: AiAssistantService;
  storage: ObjectStorage;
  queue: PlatformQueue;
  events: PlatformEventBus;
  suno: SunoClient;
  settings?: SettingsStore;
  staticDir?: string | null;
  log?: (event: Record<string, unknown>) => void;
}

type AuthenticatedHandler = (req: Request, res: Response, session: AuthenticatedSession) => Promise<unknown> | unknown;

const requestHash = (value: string | undefined): string | null => value
  ? createHash('sha256').update(value).digest('hex').slice(0, 32)
  : null;

const routeParam = (req: Request, name: string): string => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) throw new ValidationError(`route parameter ${name} is required`);
  return value;
};

const safeFilename = (title: string, extension: string): string => {
  const fallback = title.replace(/[\r\n"\\/]+/g, ' ').trim().slice(0, 80) || 'track';
  return `attachment; filename*=UTF-8''${encodeURIComponent(`${fallback}.${extension}`)}`;
};

/** Keep OAuth failure details inside the app's hash route without forwarding
 * provider-supplied descriptions or changing the validated origin. */
function authFailureRedirect(returnTo: string, errorCode: string): string {
  const target = safeReturnTo(returnTo);
  const hashIndex = target.indexOf('#');
  if (hashIndex < 0) {
    const queryIndex = target.indexOf('?');
    const path = queryIndex < 0 ? target : target.slice(0, queryIndex);
    const params = new URLSearchParams(queryIndex < 0 ? '' : target.slice(queryIndex + 1));
    params.set('auth_error', errorCode);
    return `${path}?${params.toString()}`;
  }
  const prefix = target.slice(0, hashIndex + 1);
  const fragment = target.slice(hashIndex + 1);
  const queryIndex = fragment.indexOf('?');
  const routePart = queryIndex < 0 ? fragment : fragment.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex < 0 ? '' : fragment.slice(queryIndex + 1));
  params.set('auth_error', errorCode);
  return `${prefix}${routePart}?${params.toString()}`;
}

const webAccount = (account: AccountSummary) => ({
  balance: account.balanceCredits + account.reservedCredits,
  availableBalance: account.balanceCredits,
  reservedBalance: account.reservedCredits,
  currency: 'credits' as const,
  subscription: account.subscription ? {
    name: account.subscription.name,
    status: ['active', 'trialing', 'past_due', 'canceled'].includes(account.subscription.status)
      ? account.subscription.status
      : 'active',
    renewsAt: account.subscription.renewsAt,
    includedCredits: account.subscription.remainingCredits,
  } : { name: '按量使用', status: 'none' as const, renewsAt: null, includedCredits: null },
  topUpUrl: account.walletUrl,
  ordersUrl: account.ordersUrl,
  accountUrl: account.accountUrl,
});

const demoAccount = (config: PlatformConfig): AccountSummary => ({
  balanceCredits: 1280,
  reservedCredits: 0,
  displayBalance: '1,280',
  unit: 'credits',
  subscription: {
    id: 'preview-pro', name: 'Creator Pro · 预览', status: 'active',
    remainingCredits: 800, renewsAt: new Date(Date.now() + 20 * 24 * 60 * 60_000).toISOString(),
  },
  entitlements: {
    'music.generate': true, 'music.extend': true, 'music.cover': true, 'music.remaster': true,
    'lyrics.generate': true, 'concurrency.max': 2, 'storage.bytes': 10 * 1024 ** 3,
  },
  walletUrl: config.modelCross.walletUrl,
  ordersUrl: config.modelCross.ordersUrl,
  accountUrl: config.modelCross.accountUrl,
  lastUsage: null,
});

function webModel(profile: MusicModelProfile) {
  const range = (value: { min: number; max: number; default: number } | undefined) => value
    ? { ...value, step: 0.05 }
    : null;
  return {
    id: profile.id,
    displayName: profile.displayName,
    provider: profile.provider,
    description: profile.description,
    badge: profile.badge,
    enabled: profile.enabled,
    estimatedCredits: {
      generatePair: profile.estimatedCredits,
      extendPair: profile.estimatedCredits,
      coverPair: Math.ceil(profile.estimatedCredits * 1.2),
      remasterPair: Math.ceil(profile.estimatedCredits * 1.2),
    },
    priceVersion: profile.priceVersion,
    capabilities: {
      simple: profile.capabilities.simple,
      custom: profile.capabilities.custom,
      instrumental: profile.capabilities.instrumental,
      negativeTags: profile.capabilities.negativeTags,
      vocalGender: profile.capabilities.vocalGender,
      styleWeight: range(profile.capabilities.styleWeight),
      weirdness: range(profile.capabilities.weirdness),
      operations: profile.capabilities.operations,
      maxTitleLength: profile.capabilities.maxTitle,
      maxDescriptionLength: profile.capabilities.maxDescription,
      maxStyleLength: profile.capabilities.maxStyle,
      maxLyricsLength: profile.capabilities.maxLyrics,
      maxNegativeTagsLength: profile.capabilities.maxStyle,
    },
  };
}

function aiModelProfile(config: PlatformConfig, id: string): Omit<AiModelProfile, 'enabled' | 'reason'> {
  const provider = id.startsWith('gemini-') ? 'Google'
    : id.startsWith('gpt-') ? 'OpenAI' : 'ModelCross';
  const displayName = id
    .replace(/^gpt-/, 'GPT-')
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-preview$/, '')
    .replace(/-sol$/, ' Sol')
    .replace(/-terra$/, ' Terra')
    .replace(/-luna$/, ' Luna')
    .replace(/-flash$/, ' Flash')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
  const defaultForLyrics = id === config.modelCross.lyricsModel;
  const defaultForFastTasks = id === config.modelCross.fastModel;
  return {
    id,
    displayName,
    provider,
    description: provider === 'Google'
      ? '响应更快，适合标题、风格标签和 Prompt 灵感扩写。'
      : provider === 'OpenAI'
        ? '结构与文字控制更稳，适合歌词创作、续写、翻译和深度润色。'
        : '由 ModelCross 统一路由的音乐创作辅助模型。',
    badge: defaultForLyrics && defaultForFastTasks ? '默认'
      : defaultForLyrics ? '歌词推荐'
        : defaultForFastTasks ? '快速推荐' : null,
    defaultForLyrics,
    defaultForFastTasks,
  };
}

export function createPlatformApp(deps: PlatformAppDeps) {
  const config = deps.config;
  const app = express();
  const log = deps.log ?? ((event) => console.log(JSON.stringify({ ...event, at: new Date().toISOString() })));
  type ProviderProbe = {
    configured: boolean;
    reachable: boolean;
    authenticated: boolean;
    balance: number | null;
    checkedAt: string;
    latencyMs: number | null;
    errorCode: string | null;
  };
  let providerProbeCache: { value: ProviderProbe; expiresAt: number } | null = null;
  let providerProbeInFlight: Promise<ProviderProbe> | null = null;
  const resolveAiModels = async (session: AuthenticatedSession): Promise<AiModelProfile[]> => {
    if (config.authMode === 'development') {
      return config.modelCross.aiModels.map((id) => ({
        ...aiModelProfile(config, id), enabled: true, reason: null,
      }));
    }
    const [userModelIds, relayModelIds] = await Promise.all([
      deps.modelCross.musicModelIds(session.accessToken),
      config.modelCross.aiLive && config.modelCross.aiRelayToken
        ? deps.modelCross.musicModelIds(config.modelCross.aiRelayToken)
        : Promise.resolve<string[]>([]),
    ]);
    const userModels = new Set(userModelIds);
    const relayModels = new Set(relayModelIds);
    return config.modelCross.aiModels.map((id) => {
      const userAuthorized = userModels.has(id);
      const relayAuthorized = relayModels.has(id);
      const enabled = config.modelCross.aiLive && userAuthorized && relayAuthorized;
      const reason = !config.modelCross.aiLive ? 'AI 真实调用尚未启用'
        : !userAuthorized ? '当前账户未授权此模型'
          : !relayAuthorized ? 'MuseFlow AI Relay 未授权此模型' : null;
      return { ...aiModelProfile(config, id), enabled, reason };
    });
  };
  const probeProvider = async (force = false): Promise<ProviderProbe> => {
    if (!deps.suno.configured) {
      return {
        configured: false, reachable: false, authenticated: false, balance: null,
        checkedAt: new Date().toISOString(), latencyMs: null, errorCode: 'not_configured',
      };
    }
    if (!force && providerProbeCache && providerProbeCache.expiresAt > Date.now()) {
      return providerProbeCache.value;
    }
    if (providerProbeInFlight) return providerProbeInFlight;
    // The delegated gateway has no permanent Provider credential in MuseFlow.
    // ModelCross exposes only a secret-authenticated status contract here; the
    // merchant credential and balance never cross the control-plane boundary.
    if (deps.suno.delegated) {
      providerProbeInFlight = (async () => {
        const startedAt = Date.now();
        try {
          const status = await deps.modelCross.musicProviderStatus();
          return {
            configured: status.gatewayEnabled && status.billingEnabled && status.providerConfigured,
            reachable: status.providerReachable,
            authenticated: status.providerAuthenticated,
            balance: null,
            checkedAt: status.checkedAt,
            latencyMs: Date.now() - startedAt,
            errorCode: status.errorCode,
          } satisfies ProviderProbe;
        } catch {
          return {
            configured: false, reachable: false, authenticated: false, balance: null,
            checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt,
            errorCode: 'modelcross_gateway_status_unavailable',
          } satisfies ProviderProbe;
        }
      })();
      try {
        const value = await providerProbeInFlight;
        providerProbeCache = { value, expiresAt: Date.now() + 30_000 };
        return value;
      } finally {
        providerProbeInFlight = null;
      }
    }
    providerProbeInFlight = (async () => {
      const startedAt = Date.now();
      let timer: NodeJS.Timeout | null = null;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('provider probe timeout')), 5_000);
          timer.unref?.();
        });
        const balance = await Promise.race([deps.suno.balance(), timeout]);
        return {
          configured: true, reachable: true, authenticated: true, balance,
          checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt, errorCode: null,
        } satisfies ProviderProbe;
      } catch (error) {
        const status = error instanceof SunoError ? error.status : null;
        return {
          configured: true,
          reachable: status !== null,
          authenticated: false,
          balance: null,
          checkedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
          errorCode: status === 401 || status === 403
            ? 'provider_auth_failed'
            : (error as Error).message === 'provider probe timeout'
              ? 'provider_timeout'
              : status !== null ? `provider_http_${status}` : 'provider_unreachable',
        } satisfies ProviderProbe;
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    try {
      const value = await providerProbeInFlight;
      providerProbeCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    } finally {
      providerProbeInFlight = null;
    }
  };
  const probeWithTimeout = async <T>(work: Promise<T>, fallback: T, timeoutMs = 3_000): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        work,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), timeoutMs);
          timer.unref?.();
        }),
      ]);
    } catch {
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const readiness = async () => {
    const providerTimeout: ProviderProbe = {
      configured: deps.suno.configured,
      reachable: false,
      authenticated: false,
      balance: null,
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      errorCode: deps.suno.configured ? 'provider_timeout' : 'not_configured',
    };
    const [database, queue, events, storage, providerProbe] = await Promise.all([
      probeWithTimeout(deps.repository.database.ready(), false),
      probeWithTimeout(deps.queue.ready(), false),
      probeWithTimeout(deps.events.ready(), false),
      probeWithTimeout(deps.storage.list('healthcheck/').then(() => true), false),
      probeWithTimeout(probeProvider(), providerTimeout),
    ]);
    const dependencies = database && queue && events && storage;
    const providerReady = providerProbe.configured
      && providerProbe.reachable
      && providerProbe.authenticated;
    const ready = dependencies && providerReady;
    const previewProvider = developmentFakeProviderAllowed(config, deps.suno);
    return {
      database, queue, events, storage, providerProbe, dependencies, ready, previewProvider,
      musicMutations: ready && (config.modelCross.billingLive || previewProvider),
    };
  };
  app.set('trust proxy', config.nodeEnv === 'production' ? 1 : false);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));

  const audioMultipart = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, os.tmpdir()),
      filename: (_req, _file, callback) => callback(null, `museflow-audio-${randomUUID()}.part`),
    }),
    limits: {
      fileSize: AUDIO_UPLOAD_MAX_BYTES,
      files: 1,
      fields: 4,
      parts: 5,
      fieldSize: 1024,
    },
    fileFilter: (_req, file, callback) => callback(
      null,
      (AUDIO_UPLOAD_MIME_TYPES as readonly string[]).includes(file.mimetype.toLowerCase()),
    ),
  });
  const parseAudioMultipart = (req: Request, res: Response): Promise<void> => new Promise((resolve, reject) => {
    audioMultipart.single('audio')(req, res, (error) => error ? reject(error) : resolve());
  });

  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'museflow_' });
  const requestCount = new Counter({
    name: 'museflow_http_requests_total', help: 'MuseFlow HTTP requests',
    labelNames: ['method', 'route', 'status'], registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'museflow_http_request_duration_seconds', help: 'MuseFlow HTTP request duration',
    labelNames: ['method', 'route', 'status'], registers: [registry],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60],
  });
  app.use((req, res, next) => {
    const requestId = (req.get('x-request-id') || randomUUID()).slice(0, 128);
    res.locals.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route?.path ? String(req.route.path) : req.path.replace(/[0-9a-f-]{20,}/gi, ':id');
      const labels = { method: req.method, route, status: String(res.statusCode) };
      requestCount.inc(labels);
      requestDuration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
    });
    next();
  });

  if (config.nodeEnv === 'production') {
    const origin = new URL(config.publicUrl).origin;
    app.use('/api', (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      const supplied = req.get('origin');
      if (!supplied || supplied !== origin) return res.status(403).json({ error: 'cross-origin mutation rejected' });
      next();
    });
  }

  const accountCache = new Map<string, { expiresAt: number; value: AccountSummary }>();
  const accountFor = async (session: AuthenticatedSession, forceRefresh = false): Promise<{ value: AccountSummary; demo: boolean }> => {
    // The live-billing flag is a mutation kill switch, not an account-read
    // switch. OIDC deployments must continue showing the authoritative
    // ModelCross wallet/holds/subscription summary while debits are disabled
    // for staging or incident response.
    if (config.authMode === 'development') {
      return { value: demoAccount(config), demo: true };
    }
    const cached = accountCache.get(session.user.subject);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return { value: cached.value, demo: false };
    const value = await deps.modelCross.account(session.accessToken);
    accountCache.set(session.user.subject, { value, expiresAt: Date.now() + 10_000 });
    return { value, demo: false };
  };

  const authenticated = (handler: AuthenticatedHandler) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await deps.sessions.authenticate(req, res);
      if (!session) return res.status(401).json({ error: 'authentication required' });
      await handler(req, res, session);
    } catch (error) {
      next(error);
    }
  };

  const enforceRateLimit = async (
    res: Response,
    scope: string,
    principal: string,
    maximum: number,
    windowSeconds: number,
  ): Promise<boolean> => {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStartedAt = new Date(Math.floor(now / windowMs) * windowMs);
    const expiresAt = new Date(windowStartedAt.getTime() + windowMs * 2);
    const keyHash = createHash('sha256').update(`${scope}\0${principal}`).digest('hex');
    const count = await deps.repository.consumeRateLimit({ scope, keyHash, windowStartedAt, expiresAt });
    const remaining = Math.max(0, maximum - count);
    const retryAfter = Math.max(1, Math.ceil((windowStartedAt.getTime() + windowMs - now) / 1000));
    res.setHeader('X-RateLimit-Limit', String(maximum));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (count <= maximum) return true;
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'request rate limit exceeded', retryAfter, requestId: res.locals.requestId });
    return false;
  };

  const anonymousRateLimit = (scope: string, maximum: number, windowSeconds: number) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (await enforceRateLimit(res, scope, req.ip || 'unknown', maximum, windowSeconds)) next();
      } catch (error) { next(error); }
    };

  const limitedAuthenticated = (
    scope: string,
    maximum: number,
    windowSeconds: number,
    handler: AuthenticatedHandler,
  ) => authenticated(async (req, res, session) => {
    if (!await enforceRateLimit(res, scope, session.user.subject, maximum, windowSeconds)) return;
    await handler(req, res, session);
  });

  const administrator = (handler: AuthenticatedHandler) => authenticated(async (req, res, session) => {
    if (!session.user.roles.some((role) => role === 'admin' || role === 'root')) {
      res.status(403).json({ error: 'administrator role required' });
      return;
    }
    await handler(req, res, session);
  });

  const sessionResponse = async (session: AuthenticatedSession | null) => {
    if (!session) return { authenticated: false, user: null, account: null };
    const account = await accountFor(session);
    return {
      authenticated: true,
      user: {
        id: session.user.subject,
        subject: session.user.subject,
        name: session.user.displayName,
        email: session.user.email ?? '',
        avatarUrl: session.user.avatarUrl,
        role: session.user.roles.some((role) => role === 'admin' || role === 'root') ? 'admin' : 'user',
      },
      account: webAccount(account.value),
      demo: account.demo,
    };
  };

  app.get('/health/live', (_req, res) => res.json({ status: 'live', version: process.env.APP_VERSION ?? 'development' }));
  app.get('/health/ready', async (_req, res) => {
    const state = await readiness();
    res.status(state.ready ? 200 : 503).json({
      status: state.ready ? 'ready' : 'not_ready',
      checks: {
        database: state.database, queue: state.queue, events: state.events, storage: state.storage,
        provider: state.providerProbe.configured
          && state.providerProbe.reachable
          && state.providerProbe.authenticated,
        providerConfigured: state.providerProbe.configured,
        providerReachable: state.providerProbe.reachable,
        providerAuthenticated: state.providerProbe.authenticated,
        providerErrorCode: state.providerProbe.errorCode,
        musicMutations: state.musicMutations,
      },
      preview: state.previewProvider,
    });
  });
  app.get('/metrics', async (_req, res) => {
    res.type(registry.contentType).send(await registry.metrics());
  });
  app.get('/api/health', async (_req, res) => {
    const [counts, state, models] = await Promise.all([
      deps.repository.healthCounts(), readiness(), deps.repository.listModelProfiles(),
    ]);
    const providerProbe = state.providerProbe;
    res.json({
      provider: 'mxapi-suno', configured: providerProbe.configured,
      upstreamReachable: providerProbe.reachable, providerAuthenticated: providerProbe.authenticated,
      providerCheckedAt: providerProbe.checkedAt, providerLatencyMs: providerProbe.latencyMs,
      providerErrorCode: providerProbe.errorCode,
      ready: state.ready, active: counts.active, queued: counts.queued,
      // MXAPI remaining_points belongs to the deployment's Provider account,
      // not to the signed-in user's ModelCross wallet. Keep the public health
      // contract shape for older clients, but never expose the merchant cost
      // balance outside the administrator-only settings probe below.
      balance: null, models: models.map((profile) => profile.id),
      platform: true,
      billingLive: config.modelCross.billingLive,
      providerDirectBilling: config.musicProvider.allowDevelopmentDirectProvider && !config.modelCross.billingLive,
      aiLive: config.modelCross.aiLive,
      aiLocalLive: config.modelCross.aiLocalLive,
      musicMutationsExecutable: state.musicMutations,
      dependencies: {
        database: state.database, queue: state.queue, events: state.events, storage: state.storage,
      },
      preview: state.previewProvider,
      storage: config.storage.driver, queue: config.queue.driver,
      ...(!providerProbe.configured
        ? { error: 'music provider is not configured' }
        : !providerProbe.authenticated
          ? { error: 'music provider health check failed' }
          : {}),
    });
  });

  app.get('/api/auth/login', anonymousRateLimit('auth.login', config.nodeEnv === 'production' ? 20 : 200, 300), async (req, res, next) => {
    try {
      // A stale landing page or a bookmarked login URL should not force an
      // already-authenticated MuseFlow user through ModelCross again. This
      // also makes the return target deterministic for all login entrypoints.
      const existingSession = await deps.sessions.authenticate(req, res);
      if (existingSession) return res.redirect(302, safeReturnTo(req.query.returnTo));
      if (config.authMode === 'development') {
        const user: PlatformUser = {
          subject: 'dev-user-1', issuer: 'museflow-development', modelCrossUserId: '1',
          email: 'creator@museflow.local', emailVerified: true, displayName: 'MuseFlow Creator',
          avatarUrl: null, roles: ['admin'],
        };
        await deps.sessions.createDevelopmentSession(req, res, user);
        return res.redirect(302, safeReturnTo(req.query.returnTo));
      }
      res.redirect(302, await deps.sessions.beginLogin(req, res, req.query.returnTo));
    } catch (error) { next(error); }
  });
  app.post('/api/auth/login', anonymousRateLimit('auth.login', config.nodeEnv === 'production' ? 20 : 200, 300), async (req, res, next) => {
    try {
      const url = await deps.sessions.beginLogin(req, res, (req.body as { returnTo?: unknown })?.returnTo);
      res.json({ url });
    } catch (error) { next(error); }
  });
  app.get('/api/auth/callback', async (req, res, next) => {
    try {
      if (req.query.error !== undefined) {
        const failed = await deps.sessions.cancelLogin(req, res, req.query as Record<string, unknown>);
        return res.redirect(302, authFailureRedirect(failed.returnTo, safeAuthFailureCode(failed.errorCode)));
      }
      const completed = await deps.sessions.completeLogin(req, res, req.query as Record<string, unknown>);
      res.redirect(302, completed.returnTo);
    } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', async (req, res, next) => {
    try { await deps.sessions.logout(req, res); res.json({ ok: true }); } catch (error) { next(error); }
  });
  app.post('/api/auth/dev-login', anonymousRateLimit('auth.dev-login', 200, 300), async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const suffix = typeof body.subject === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.subject) ? body.subject : 'dev-user-1';
      const user: PlatformUser = {
        subject: suffix, issuer: 'museflow-development', modelCrossUserId: suffix,
        email: `${suffix}@museflow.local`, emailVerified: true,
        displayName: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : suffix,
        avatarUrl: null, roles: body.admin === true ? ['admin'] : [],
      };
      const session = await deps.sessions.createDevelopmentSession(req, res, user);
      res.json(await sessionResponse(session));
    } catch (error) { next(error); }
  });

  app.get(['/api/session', '/api/me'], async (req, res, next) => {
    try {
      const session = await deps.sessions.authenticate(req, res);
      try {
        res.json(await sessionResponse(session));
      } catch (error) {
        const status = error && typeof error === 'object' && 'status' in error
          ? Number((error as { status: unknown }).status)
          : 0;
        if (session && status === 401) {
          // A ModelCross access token can be revoked before its recorded
          // expiry (for example after a control-plane session rotation). Force
          // one atomic refresh before treating the browser session as invalid.
          try {
            const refreshed = await deps.sessions.authenticate(req, res, { forceRefresh: true });
            if (refreshed) {
              res.json(await sessionResponse(refreshed));
              return;
            }
          } catch (refreshError) {
            const refreshStatus = refreshError && typeof refreshError === 'object' && 'status' in refreshError
              ? Number((refreshError as { status: unknown }).status)
              : 0;
            if (refreshStatus !== 401) throw refreshError;
          }
          await deps.sessions.logout(req, res);
          res.json({ authenticated: false, user: null, account: null });
          return;
        }
        throw error;
      }
    } catch (error) { next(error); }
  });

  app.get('/api/catalog/music-models', async (req, res, next) => {
    try {
      let authorizedIds: Set<string> | null = null;
      if (config.authMode !== 'development') {
        const session = await deps.sessions.authenticate(req, res);
        if (!session) {
          res.status(401).json({ error: 'authentication required' });
          return;
        }
        // ModelCross is the owner-scoped model authorization boundary. Do not
        // expose every locally supported adapter model and wait for submit to
        // fail: the workbench catalog itself must be the strict intersection.
        try {
          authorizedIds = new Set(await deps.modelCross.musicModelIds(session.accessToken));
        } catch (error) {
          // ModelCross is the authorization source for this catalog. Keep
          // dependency failures distinct from an authorized empty result, but
          // never expose upstream error details to the browser.
          const status = error && typeof error === 'object' && 'status' in error
            ? Number((error as { status: unknown }).status)
            : NaN;
          if (Number.isInteger(status) && status >= 500) {
            res.status(502).json({
              error: 'music model catalog unavailable',
              requestId: res.locals.requestId,
            });
            return;
          }
          throw error;
        }
      }

      const profiles = await deps.repository.listModelProfiles();
      const visible = authorizedIds
        ? profiles.filter((profile) => authorizedIds.has(profile.id))
        : profiles;
      res.setHeader('Cache-Control', config.authMode === 'development'
        ? 'private, max-age=60'
        : 'private, no-store');
      res.json(visible.map(webModel));
    } catch (error) {
      // A failed ModelCross catalog read must not fall back to the complete
      // local adapter list, otherwise a revoked model would remain selectable.
      next(error);
    }
  });
  app.get('/api/catalog/music-operations', authenticated(async (_req, res, session) => {
    const definitions = MUSIC_OPERATION_DEFINITIONS.map((definition) => ({
      action: definition.action,
      operationCode: definition.operationCode,
      fallbackCredits: definition.fallbackCredits,
    }));
    const [catalog, providerProbe] = await Promise.all([
      deps.modelCross.musicOperationCatalog(session.accessToken, definitions),
      probeProvider(),
    ]);
    const uploadReachable = deps.storage.providerAccessible ? await deps.storage.providerAccessible() : config.storage.providerUploadUrlsReachable;
    const fakeExecutable = developmentFakeProviderAllowed(config, deps.suno) && providerProbe.authenticated;
    const byCode = new Map(catalog.map((entry) => [entry.operationCode, entry]));
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(MUSIC_OPERATION_DEFINITIONS.map((definition) => {
      const entry = byCode.get(definition.operationCode);
      const priced = Boolean(entry?.available);
      const liveExecutable = Boolean(
        priced && entry?.chargingEnabled && config.modelCross.billingLive && providerProbe.authenticated,
      );
      const uploadStorageReady = !['upload', 'upload_extend'].includes(definition.action)
        || uploadReachable;
      const executable = uploadStorageReady && (liveExecutable || (fakeExecutable && Boolean(entry?.preview)));
      const reason = !providerProbe.configured
        ? '音乐 Provider 尚未配置'
        : !providerProbe.authenticated
          ? '音乐 Provider 健康检查或鉴权未通过'
          : !uploadStorageReady
          ? '参考音频操作需要可访问的短期签名素材地址'
          : !priced
            ? entry?.reason ?? 'ModelCross 价格目录尚未配置此操作'
            : !config.modelCross.billingLive && !fakeExecutable
              ? 'MuseFlow 计费写入已关闭，禁止调用公网音乐 Provider'
              : !entry?.chargingEnabled && !fakeExecutable
                ? entry?.reason ?? 'ModelCross 未开放此操作的真实扣费'
                : entry?.reason;
      return {
        ...entry,
        action: definition.action,
        operationCode: definition.operationCode,
        available: executable,
        catalogAvailable: priced,
        estimatedCredits: entry?.estimatedCredits ?? null,
        priceVersion: entry?.priceVersion ?? null,
        chargingEnabled: Boolean(entry?.chargingEnabled && config.modelCross.billingLive),
        preview: Boolean(entry?.preview || !entry?.chargingEnabled),
        executable,
        previewExecutable: executable && !liveExecutable,
        billingMode: config.musicProvider.allowDevelopmentDirectProvider && !config.modelCross.billingLive ? 'provider-direct' : config.modelCross.billingLive ? 'modelcross' : 'preview',
        variant: definition.variant,
        outputCount: definition.outputCount,
        modelIds: definition.modelIds,
        parameters: definition.parameters,
        ...(config.musicProvider.allowDevelopmentDirectProvider && executable ? { reason: 'API 账户实际计费；开发报价不代表供应商最终费用' } : reason ? { reason } : {}),
      };
    }));
  }));
  app.get('/api/catalog/ai-models', authenticated(async (_req, res, session) => {
    const models = await resolveAiModels(session);
    res.setHeader('Cache-Control', config.authMode === 'development'
      ? 'private, max-age=30'
      : 'private, no-store');
    res.json(models);
  }));
  app.get('/api/catalog/ai-operations', authenticated(async (_req, res, session) => {
    const requested = AI_OPERATION_DEFINITIONS.map((definition) => ({
      action: definition.action,
      operationCode: definition.operationCode,
      fallbackCredits: definition.fallbackCredits,
    }));
    const [catalog, aiModels] = await Promise.all([
      deps.modelCross.musicOperationCatalog(session.accessToken, requested),
      resolveAiModels(session),
    ]);
    const byAction = new Map(catalog.map((entry) => [entry.action, entry]));
    const enabledAiModels = aiModels.filter((model) => model.enabled);
    const localDirect = config.authMode === 'development' && config.modelCross.aiLocalLive;
    const developmentPreview = config.authMode === 'development'
      && !config.modelCross.aiLive
      && !localDirect;

    res.setHeader('Cache-Control', config.authMode === 'development'
      ? 'private, max-age=30'
      : 'private, no-store');
    res.json(AI_OPERATION_DEFINITIONS.map((definition) => {
      const entry = byAction.get(definition.action);
      const preferredModel = aiModelForAction(config, definition.action);
      const model = enabledAiModels.some((profile) => profile.id === preferredModel)
        ? preferredModel
        : enabledAiModels[0]?.id ?? preferredModel;
      const modelAuthorized = enabledAiModels.length > 0;
      const catalogAvailable = Boolean(
        entry?.available && entry.estimatedCredits !== null && entry.priceVersion,
      );
      const liveExecutable = Boolean(
        config.authMode !== 'development'
        && config.modelCross.aiLive
        && config.modelCross.billingLive
        && entry?.chargingEnabled
        && catalogAvailable
        && modelAuthorized,
      );
      const previewExecutable = developmentPreview && catalogAvailable;
      const localDirectExecutable = localDirect && catalogAvailable && modelAuthorized;
      const executable = liveExecutable || previewExecutable || localDirectExecutable;
      const reason = localDirectExecutable
        ? '本地直连 ModelCross，不经过 MuseFlow Work Billing'
        : !catalogAvailable
        ? entry?.reason ?? 'ModelCross 价格目录尚未配置此 AI 操作'
        : previewExecutable
            ? '本地开发预览，不会调用真实 AI 或扣除积分'
            : !config.modelCross.aiLive
              ? 'AI 真实调用尚未启用'
              : !config.modelCross.billingLive
                ? 'ModelCross 计费写入尚未启用，禁止发起真实 AI 调用'
                : !modelAuthorized
                  ? '当前账户没有可用于音乐辅助创作的 AI 模型'
                : !entry?.chargingEnabled
                  ? entry?.reason ?? 'ModelCross 未开放此 AI 操作的真实扣费'
                  : entry?.reason;
      return {
        action: definition.action,
        operationCode: definition.operationCode,
        model,
        modelAuthorized,
        available: executable,
        catalogAvailable,
        estimatedCredits: localDirectExecutable ? 0 : entry?.estimatedCredits ?? null,
        priceVersion: localDirectExecutable ? 'modelcross-local-direct-v1' : entry?.priceVersion ?? null,
        chargingEnabled: Boolean(entry?.chargingEnabled && config.modelCross.billingLive),
        executable,
        previewExecutable,
        ...(localDirectExecutable ? { localDirect: true } : {}),
        parameters: definition.parameters,
        ...(reason ? { reason } : {}),
      };
    }));
  }));
  app.get('/api/catalog/mxapi-capabilities', administrator(async (_req, res, session) => {
    const catalog = await deps.modelCross.musicOperationCatalog(
      session.accessToken,
      MXAPI_FIXED_OPERATION_REQUESTS,
    );
    const byAction = new Map(catalog.map((entry) => [entry.action, entry]));
    const mvCatalog = deps.mv ? await deps.mv.catalog() : null;
    const isAdministrator = session.user.roles.some((role) => role === 'admin' || role === 'root');
    res.setHeader('Cache-Control', config.authMode === 'development'
      ? 'private, max-age=30'
      : 'private, no-store');
    res.json(MXAPI_NON_MUSIC_CAPABILITIES.map((capability) => {
      const entry = byAction.get(capability.id);
      if (mvCatalog && ['jimeng-video','seedance-20','seedance-25','seedance-fast','seedance-mini','grok-video','video-task','veo-task'].includes(capability.id)) {
        return { ...capability, implemented: true, executable: mvCatalog.canGenerate, uiRoute: 'mv', catalogAvailable: true,
          estimatedCredits: null, priceVersion: null, chargingEnabled: false, markupMultiplier: 4,
          reason: mvCatalog.canGenerate ? '已接入 MV 工作室；当前为本地 API 账户按镜头计费。' : mvCatalog.reason };
      }
      const estimatedCredits = entry?.estimatedCredits ?? capability.fallbackCredits;
      const catalogAvailable = capability.pricingKind === 'fixed'
        ? Boolean(entry?.available && entry.estimatedCredits !== null && entry.priceVersion)
        : capability.pricingKind === 'free';
      const executable = capability.implemented && isAdministrator;
      const reason = capability.pricingKind === 'deprecated'
        ? capability.note ?? 'MXAPI 文档已标记此接口下线'
        : capability.pricingKind === 'dynamic'
          ? 'MXAPI 按通道、模型、token、分辨率或时长动态结算；必须由 ModelCross 服务端报价后才能执行'
          : capability.pricingKind === 'fixed' && !catalogAvailable
            ? entry?.reason ?? 'ModelCross 尚未发布此能力的 4 倍售价目录'
            : !capability.implemented
              ? '接口文档和 4 倍价格已同步；ModelCross 执行网关与任务存储尚未接入'
              : !isAdministrator
                ? '该诊断能力仅管理员可执行'
                : null;
      return {
        ...capability,
        providerPoints: capability.pricingKind === 'fixed' && estimatedCredits !== null
          ? estimatedCredits / 4
          : capability.providerPoints,
        catalogAvailable,
        estimatedCredits,
        priceVersion: entry?.priceVersion ?? null,
        chargingEnabled: Boolean(entry?.chargingEnabled && config.modelCross.billingLive),
        executable,
        markupMultiplier: 4,
        ...(reason ? { reason } : {}),
      };
    }));
  }));
  app.get('/api/public/landing', async (_req, res) => {
    const models = await deps.repository.listModelProfiles();
    res.json({
      product: 'MuseFlow',
      capabilities: ['双版本音乐生成', 'AI 歌词工作室', 'Extend / Cover / Remaster', '项目与私有作品库'],
      prices: models.slice(0, 4).map((profile) => ({ model: profile.displayName, credits: profile.estimatedCredits, unit: '生成两首' })),
      showcase: [],
    });
  });

  const mvService = () => { if (!deps.mv) throw new ResourceStateConflictError('MV 服务未启用'); return deps.mv; };
  const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 } });
  app.get('/api/mv/catalog', authenticated(async (_req, res, session) => res.json(await mvService().catalog(session.user.roles.some(r => r === 'admin' || r === 'root')))));
  app.get('/api/mv/counts', authenticated(async(_req,res,session)=>res.json(await mvService().counts(session.user.subject))));
  app.get('/api/mv/projects', authenticated(async (req, res, session) => res.json(await mvService().list(session.user.subject,req.query.archived==='1',Math.max(1,Math.min(100,Number(req.query.limit)||100)),Math.max(0,Number(req.query.offset)||0)))));
  app.post('/api/mv/projects', limitedAuthenticated('mv.create', 20, 60, async (req, res, session) => {
    res.status(201).json(await mvService().create(session.user.subject, req.body, req.get('Idempotency-Key') ?? ''));
  }));
  app.get('/api/mv/projects/:id', authenticated(async (req, res, session) => {
    const mv = mvService(); res.json(mv.public(await mv.get(session.user.subject, routeParam(req, 'id'))));
  }));
  app.patch('/api/mv/projects/:id', limitedAuthenticated('mv.edit', 30, 60, async (req, res, session) => {
    res.json(await mvService().edit(session.user.subject, routeParam(req, 'id'), req.body));
  }));
  app.post('/api/mv/projects/:id/generate', limitedAuthenticated('mv.generate', 10, 60, async (req, res, session) => {
    res.status(202).json(await mvService().start(session, routeParam(req, 'id'), req.body));
  }));
  app.get('/api/mv/projects/:id/publication', authenticated(async(req,res,session)=>res.json(await mvService().publication(session.user.subject,routeParam(req,'id')))));
  app.post('/api/mv/projects/:id/publish', limitedAuthenticated('mv.publish',10,60,async(req,res,session)=>res.json(await mvService().publish(session.user.subject,routeParam(req,'id'),Number(req.body?.revision),req.body?.expectedChecksum))));
  app.post('/api/mv/projects/:id/render', limitedAuthenticated('mv.render', 10, 60, async (req, res, session) => {
    res.status(202).json(await mvService().assemble(session.user.subject, routeParam(req, 'id'), req.body.revision));
  }));
  app.get('/api/mv/projects/:id/quote', authenticated(async (req,res,session) => res.json(await mvService().quote(session.user.subject,routeParam(req,'id'),typeof req.query.shotId==='string'?req.query.shotId:undefined))));
  app.post('/api/mv/projects/:id/shot-actions', limitedAuthenticated('mv.shot.edit',30,60,async(req,res,session)=>res.json(await mvService().shotAction(session.user.subject,routeParam(req,'id'),req.body??{}))));
  app.post('/api/mv/projects/:id/pause', authenticated(async(req,res,session)=>res.json(await mvService().pause(session.user.subject,routeParam(req,'id')))));
  app.post('/api/mv/projects/:id/reconcile', limitedAuthenticated('mv.reconcile',10,60,async(req,res,session)=>res.json(await mvService().reconcile(session,routeParam(req,'id'),req.body??{}))));
  app.post('/api/mv/projects/:id/archive', authenticated(async(req,res,session)=>{if(typeof req.body.archived!=='boolean')throw new ValidationError('archived must be boolean');await mvService().archive(session.user.subject,routeParam(req,'id'),req.body.revision,req.body.archived);res.json({ok:true});}));
  app.delete('/api/mv/projects/:id', authenticated(async(req,res,session)=>{await mvService().deleteProject(session.user.subject,routeParam(req,'id'),Number(req.query.revision));res.json({ok:true});}));
  app.get('/api/mv/references', authenticated(async(_req,res,session)=>res.json(await mvService().references(session.user.subject))));
  app.delete('/api/mv/references/:id', authenticated(async(req,res,session)=>{await mvService().deleteReference(session.user.subject,routeParam(req,'id'));res.json({ok:true});}));
  app.get('/api/mv/tracks/:trackId/stems', authenticated(async(req,res,session)=>res.json(await mvService().listStems(session.user.subject,routeParam(req,'trackId')))));
  app.post('/api/mv/tracks/:trackId/stems', limitedAuthenticated('mv.stems',10,3600,async(req,res,session)=>{
    await parseAudioMultipart(req,res);const file=req.file;
    try{if(!file)throw new ValidationError('请选择 MP3 / WAV / FLAC 分轨文件');await fs.chmod(file.path,0o600);res.status(201).json(await mvService().uploadStem(session.user.subject,routeParam(req,'trackId'),String(req.body.kind),file));}finally{if(file?.path)await fs.rm(file.path,{force:true});}
  }));
  app.post('/api/mv/projects/:id/mix-preview',limitedAuthenticated('mv.mix',10,60,async(req,res,session)=>res.json(await mvService().previewMix(session.user.subject,routeParam(req,'id'),req.body??{}))));
  app.post('/api/mv/references', limitedAuthenticated('mv.upload', 20, 3600, async (req, res, session) => {
    await new Promise<void>((resolve, reject) => imageUpload.single('image')(req, res, e => e ? reject(e) : resolve()));
    if (!req.file) throw new ValidationError('请选择参考照片');
    res.status(201).json(await mvService().upload(session.user.subject, req.file.buffer, req.file.originalname));
  }));
  const sendMvObject = async (req: Request, res: Response, key: string, filename?: string) => {
    const file = await deps.storage.read(key, req.headers.range);
    res.status(file.contentRange ? 206 : 200).setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.byteSize !== null) res.setHeader('Content-Length', String(file.byteSize));
    if (file.contentRange) res.setHeader('Content-Range', file.contentRange);
    if (file.acceptRanges) res.setHeader('Accept-Ranges', file.acceptRanges);
    if (filename && req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    await pipeline(file.body, res);
  };
  app.get('/api/mv/stems/:id',authenticated(async(req,res,session)=>{const s=await mvService().stem(session.user.subject,routeParam(req,'id'));await sendMvObject(req,res,s.object_key,s.name);}));
  app.get('/api/mv/projects/:id/mix-preview',authenticated(async(req,res,session)=>{const p=await mvService().get(session.user.subject,routeParam(req,'id'));if(!p.mixPreviewKey)throw new ResourceNotFoundError('试听片段尚未生成');await sendMvObject(req,res,p.mixPreviewKey,'mix-preview.mp3');}));
  app.get('/api/mv/references/:id', authenticated(async (req, res, session) => {
    const ref = await mvService().reference(session.user.subject, routeParam(req, 'id')); await sendMvObject(req, res, ref.object_key);
  }));
  app.get('/api/mv/projects/:id/shots/:shotId/video', authenticated(async (req, res, session) => {
    const p = await mvService().get(session.user.subject, routeParam(req, 'id'));
    const shot = p.shots.find(s => s.id === routeParam(req, 'shotId'));
    const shotKey=typeof req.query.version==='string'?shot?.versions?.find(v=>v.id===req.query.version)?.objectKey:shot?.objectKey;
    if (!shotKey) throw new ResourceNotFoundError('镜头或版本不存在');
    await sendMvObject(req, res, shotKey, `shot-${(shot?.index??0) + 1}.mp4`);
  }));
  for (const kind of ['video', 'subtitles'] as const) app.get(`/api/mv/projects/:id/${kind}`, authenticated(async (req, res, session) => {
    const p = await mvService().get(session.user.subject, routeParam(req, 'id'));
    const version=typeof req.query.version==='string'?p.renderVersions?.find(v=>v.id===req.query.version):null;
    const key=typeof req.query.version==='string'?(kind==='video'?version?.objectKey:version?.subtitleKey):kind === 'video' ? p.outputKey : p.subtitleKey;
    if (!key) throw new ResourceNotFoundError('成片尚未生成');
    await sendMvObject(req, res, key, `${p.settings.title}.${kind === 'video' ? 'mp4' : 'srt'}`);
  }));

  app.get('/api/projects', authenticated(async (_req, res, session) => {
    const projects = await deps.repository.listProjects(session.user.subject);
    res.json(projects.map((project) => ({
      id: project.id, title: project.name, description: project.description,
      coverUrl: project.coverObjectKey ? `/api/projects/${project.id}/cover` : null,
      trackCount: project.trackCount, status: project.status, updatedAt: project.updatedAt,
    })));
  }));
  app.post('/api/projects', authenticated(async (req, res, session) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!title || title.length > 100 || description.length > 1000) throw new ValidationError('project title or description is invalid');
    const idempotencyKey = req.get('Idempotency-Key') ?? '';
    assertModelCrossIdempotencyKey(idempotencyKey);
    const created = await deps.repository.createProjectIdempotent(session.user.subject, title, description, idempotencyKey);
    const project = created.project;
    if (!created.replay) {
      await deps.repository.audit({
        ownerSubject: session.user.subject, actorSubject: session.user.subject, action: 'project.create',
        resourceType: 'music_project', resourceId: project.id, requestId: res.locals.requestId,
        ipHash: requestHash(req.ip), userAgentHash: requestHash(req.get('user-agent')),
      });
    }
    res.setHeader('Idempotent-Replay', created.replay ? 'true' : 'false');
    res.status(created.replay ? 200 : 201).json({
      id: project.id, title: project.name, description: project.description, coverUrl: null,
      trackCount: 0, status: project.status, updatedAt: project.updatedAt,
    });
  }));
  app.delete('/api/projects/:id', authenticated(async (req, res, session) => {
    const archived = await deps.repository.archiveProject(session.user.subject, routeParam(req, 'id'));
    if (!archived) throw new ResourceNotFoundError('project not found');
    res.json({ ok: true });
  }));

  app.get('/api/library', authenticated(async (req, res, session) => {
    res.json(await deps.repository.listTracks(session.user.subject, {
      projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      offset: typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined,
    }));
  }));
  app.post('/api/generate', limitedAuthenticated('music.generate', 30, 60, async (req, res, session) => {
    const result = await deps.music.submit(session, req.body, req.get('Idempotency-Key') ?? '');
    res.setHeader('Idempotent-Replay', result.replay ? 'true' : 'false');
    if (result.pending) res.status(202).json({ generationId: result.generation.id, status: result.generation.status, tracks: [] });
    else res.status(result.replay ? 200 : 201).json(result.tracks);
  }));
  app.post('/api/uploads/audio', limitedAuthenticated('music.upload', 10, 3600, async (req, res, session) => {
    await parseAudioMultipart(req, res);
    const file = req.file;
    try {
      if (file?.path) await fs.chmod(file.path, 0o600);
      const result = await deps.sunoActions.uploadReference(
        session,
        file ? {
          path: file.path,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        } : undefined,
        (req.body ?? {}) as Record<string, unknown>,
        req.get('Idempotency-Key') ?? '',
      );
      res.setHeader('Idempotent-Replay', result.replay ? 'true' : 'false');
      res.status(result.replay ? 200 : 201).json({
        id: result.upload.id,
        status: result.upload.status,
        originalFilename: result.upload.originalFilename,
        mimeType: result.upload.mimeType,
        byteSize: result.upload.byteSize,
        durationSeconds: result.upload.durationSeconds,
        checksumSha256: result.upload.checksumSha256,
        copyrightConfirmed: result.upload.copyrightConfirmed,
        copyrightAudio: result.upload.copyrightAudio,
        createdAt: result.upload.createdAt,
      });
    } finally {
      if (file?.path) await fs.rm(file.path, { force: true }).catch(() => undefined);
    }
  }));
  app.get('/api/uploads', authenticated(async (req, res, session) => {
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 200) {
      throw new ValidationError('limit must be an integer between 1 and 200');
    }
    const uploads = await deps.repository.listReferenceAudio(session.user.subject, rawLimit);
    res.json(uploads.map((upload) => ({
      id: upload.id, status: upload.status, originalFilename: upload.originalFilename,
      mimeType: upload.mimeType, byteSize: upload.byteSize, durationSeconds: upload.durationSeconds,
      checksumSha256: upload.checksumSha256, copyrightConfirmed: upload.copyrightConfirmed,
      copyrightAudio: upload.copyrightAudio, createdAt: upload.createdAt,
    })));
  }));
  app.get('/api/uploads/:id', authenticated(async (req, res, session) => {
    const upload = await deps.repository.getReferenceAudio(session.user.subject, routeParam(req, 'id'));
    if (!upload) throw new ResourceNotFoundError('reference audio not found');
    res.json({
      id: upload.id, status: upload.status, originalFilename: upload.originalFilename,
      mimeType: upload.mimeType, byteSize: upload.byteSize, durationSeconds: upload.durationSeconds,
      checksumSha256: upload.checksumSha256,
      copyrightConfirmed: upload.copyrightConfirmed, copyrightAudio: upload.copyrightAudio,
      createdAt: upload.createdAt,
    });
  }));
  app.delete('/api/uploads/:id', authenticated(async (req, res, session) => {
    await deps.sunoActions.deleteReference(session, routeParam(req, 'id'));
    res.json({ ok: true });
  }));
  app.post('/api/uploads/:id/actions', limitedAuthenticated('music.upload.action', 20, 60, async (req, res, session) => {
    const result = await deps.sunoActions.referenceAction(
      session, routeParam(req, 'id'), req.body, req.get('Idempotency-Key') ?? '',
    );
    res.setHeader('Idempotent-Replay', result.replay ? 'true' : 'false');
    if (result.pending) {
      res.status(202).json({
        generationId: result.generation.id,
        status: result.generation.status,
        operation: result.generation.operation,
        referenceAudioId: result.generation.referenceAudioId,
        tracks: result.tracks,
      });
    } else res.status(result.replay ? 200 : 201).json(result.tracks);
  }));
  app.post('/api/tracks/:id/actions', limitedAuthenticated('music.action', 30, 60, async (req, res, session) => {
    const result = deps.sunoActions.isDerivedTrackAction(req.body)
      ? await deps.sunoActions.trackAction(session, routeParam(req, 'id'), req.body, req.get('Idempotency-Key') ?? '')
      : await deps.music.action(session, routeParam(req, 'id'), req.body, req.get('Idempotency-Key') ?? '');
    res.setHeader('Idempotent-Replay', result.replay ? 'true' : 'false');
    if (result.pending) res.status(202).json({ generationId: result.generation.id, status: result.generation.status, tracks: [] });
    else res.status(result.replay ? 200 : 201).json(result.tracks);
  }));
  app.post('/api/tracks/:id/assets', limitedAuthenticated('music.asset.action', 30, 60, async (req, res, session) => {
    const result = await deps.sunoActions.assetAction(
      session, routeParam(req, 'id'), req.body, req.get('Idempotency-Key') ?? '',
    );
    res.setHeader('Idempotent-Replay', result.replay ? 'true' : 'false');
    res.status(result.replay ? 200 : result.job.status === 'queued' ? 202 : 201).json(result.job);
  }));
  app.get('/api/tracks/:id/assets/jobs', authenticated(async (req, res, session) => {
    const trackId = routeParam(req, 'id');
    if (!await deps.repository.getTrack(session.user.subject, trackId)) throw new ResourceNotFoundError('track not found');
    res.json(await deps.repository.listTrackAssetJobs(session.user.subject, trackId));
  }));
  app.get('/api/asset-jobs/:id', authenticated(async (req, res, session) => {
    const job = await deps.repository.getTrackAssetJob(session.user.subject, routeParam(req, 'id'));
    if (!job) throw new ResourceNotFoundError('track asset job not found');
    res.json(job);
  }));
  app.delete('/api/tracks/:id', authenticated(async (req, res, session) => {
    const trackId = routeParam(req, 'id');
    const assets = await deps.repository.deleteTrack(session.user.subject, trackId);
    if (!assets) throw new ResourceNotFoundError('track not found');
    await deps.queue.add('storage.reconcile', {}, { jobId: `storage:delete:${trackId}` });
    res.json({ ok: true, assetCount: assets.length, remoteTaskMayContinue: true });
  }));

  const assetRoute = (kind: 'audio' | 'cover' | 'video' | 'wav' | 'mp3' | 'm4a' | 'aligned_lyrics') => authenticated(async (req, res, session) => {
    const trackId = routeParam(req, 'id');
    const asset = await deps.repository.getAsset(session.user.subject, trackId, kind);
    if (!asset) throw new ResourceNotFoundError(`${kind} asset not found`);
    const extension = asset.mimeType === 'audio/mp4'
      ? 'm4a'
      : path.extname(asset.objectKey).replace(/^\./, '') || 'bin';
    const downloadName = req.query.download !== undefined
      ? safeFilename((await deps.repository.getTrack(session.user.subject, trackId))?.title ?? 'track', extension)
      : null;
    const object = await deps.storage.read(asset.objectKey, req.get('range'));
    res.status(object.contentRange ? 206 : 200);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie, Authorization');
    res.setHeader('Content-Type', object.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (object.byteSize !== null) res.setHeader('Content-Length', String(object.byteSize));
    if (object.contentRange) res.setHeader('Content-Range', object.contentRange);
    if (object.acceptRanges) res.setHeader('Accept-Ranges', object.acceptRanges);
    if (object.etag) res.setHeader('ETag', object.etag);
    if (downloadName) res.setHeader('Content-Disposition', downloadName);
    await pipeline(object.body, res);
  });
  app.get('/api/tracks/:id/audio', assetRoute('audio'));
  app.get('/api/tracks/:id/cover', assetRoute('cover'));
  app.get('/api/tracks/:id/video', assetRoute('video'));
  app.get('/api/tracks/:id/wav', assetRoute('wav'));
  app.get('/api/tracks/:id/mp3', assetRoute('mp3'));
  app.get('/api/tracks/:id/m4a', assetRoute('m4a'));
  app.get('/api/tracks/:id/aligned-lyrics', assetRoute('aligned_lyrics'));

  app.get('/api/tasks', authenticated(async (req, res, session) => {
    const singularId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const rawIds = typeof req.query.ids === 'string' ? req.query.ids : singularId;
    const hasPagedQuery = req.query.page !== undefined || req.query.size !== undefined || rawIds.length > 0;
    const parsePositive = (value: unknown, field: string, fallback: number): number => {
      if (value === undefined) return fallback;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
        throw new ValidationError(`${field} must be an integer between 1 and 200`);
      }
      return parsed;
    };
    const page = hasPagedQuery ? parsePositive(req.query.page, 'page', 1) : 1;
    const size = hasPagedQuery ? parsePositive(req.query.size, 'size', 10) : Math.min(
      200,
      Math.max(1, typeof req.query.limit === 'string' ? Number(req.query.limit) || 100 : 100),
    );
    const ids = rawIds ? rawIds.split(',').map((value) => value.trim()).filter(Boolean) : [];
    if (ids.length > 200) throw new ValidationError('ids supports at most 200 task ids');
    const tasks = await deps.repository.listTasks(
      session.user.subject,
      size,
      { upstreamTaskIds: ids, offset: hasPagedQuery ? (page - 1) * size : 0 },
    );
    res.setHeader('X-Task-Page', String(page));
    res.setHeader('X-Task-Size', String(size));
    res.setHeader('X-Task-Count', String(tasks.length));
    res.json(tasks.map((task) => {
      const status = ['reconcile_required', 'manual_review_required'].includes(String(task.billingStatus))
        ? 'reconcile_required'
        : task.billingStatus === 'refunding' ? 'refunding'
          : task.billingStatus === 'refunded' ? 'refunded'
            : task.status === 'done' || task.status === 'succeeded' ? 'completed'
              : task.status === 'error' || task.status === 'failed' ? 'failed'
                : task.stage === 'queued' ? 'queued'
                  : 'generating';
      return {
        id: task.id,
        batchId: task.generationId,
        title: task.title,
        operation: task.operation,
        model: task.model,
        status,
        progress: task.progress,
        estimatedCredits: task.estimatedCredits ?? 0,
        chargedCredits: task.settledCredits ?? null,
        billingStatus: task.billingStatus ?? null,
        refundCredits: null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        error: task.error,
        upstreamTaskId: task.upstreamTaskId ?? null,
        providerRecordId: task.providerRecordId ?? null,
        submissionOptions: task.submissionOptions ?? {},
        taskType: task.taskType ?? 'generation',
      };
    }));
  }));

  app.get('/api/billing/summary', authenticated(async (req, res, session) => {
    const [account, stats] = await Promise.all([
      accountFor(session, req.query.refresh === '1'),
      deps.repository.billingStats(session.user.subject),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ account: webAccount(account.value), ...stats, demo: account.demo });
  }));
  app.get('/api/billing/orders', authenticated(async (_req, res, session) => {
    res.json(await deps.repository.listPaymentOrders(session.user.subject));
  }));
  app.get('/api/billing/topup', authenticated(async (_req, res, session) => {
    const account = await accountFor(session);
    res.redirect(302, account.value.walletUrl);
  }));

  app.post('/api/ai/assist', limitedAuthenticated('ai.assist', 60, 60, async (req, res, session) => {
    const idempotencyKey = req.get('Idempotency-Key') ?? '';
    const result = await deps.ai.assist(session, req.body, idempotencyKey);
    res.status(201).json(result);
  }));
  app.post('/api/ai/assist/:id/accept', authenticated(async (req, res, session) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    res.status(201).json(await deps.ai.accept(session, {
      runId: routeParam(req, 'id'),
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      appliedFields: body.appliedFields,
    }));
  }));

  app.get('/api/events', limitedAuthenticated('events.connect', 30, 60, async (req, res, session) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    const unsubscribe = deps.events.subscribe((event) => {
      if (event.subject !== session.user.subject || res.destroyed) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15_000);
    heartbeat.unref?.();
    req.once('close', () => { clearInterval(heartbeat); unsubscribe(); });
  }));

  app.post('/api/content/reports', limitedAuthenticated('content.report', 10, 3600, async (req, res, session) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!category || category.length > 80) throw new ValidationError('report category is required');
    const trackId = typeof body.trackId === 'string' ? body.trackId : null;
    if (trackId && !await deps.repository.getTrack(session.user.subject, trackId)) {
      throw new ResourceNotFoundError('track not found');
    }
    await deps.repository.database.query(`INSERT INTO content_reports(id,owner_subject,track_id,category,details)
      VALUES($1,$2,$3,$4,$5)`, [
      randomUUID(), session.user.subject, trackId,
      category, typeof body.details === 'string' ? body.details.trim().slice(0, 4000) : '',
    ]);
    res.status(201).json({ ok: true });
  }));

  app.post('/api/admin/reconcile', administrator(async (_req, res) => {
    await Promise.all([
      deps.queue.add('billing.reconcile', {}, { jobId: `admin:billing:${Date.now()}` }),
      deps.queue.add('storage.reconcile', {}, { jobId: `admin:storage:${Date.now()}` }),
      deps.queue.add('music.poll-all', {}, { jobId: `admin:poll:${Date.now()}` }),
    ]);
    res.status(202).json({ ok: true });
  }));

  app.get('/api/settings', authenticated(async (_req, res) => {
    res.json({
      apiBaseUrl: '',
      apiKeySet: deps.suno.configured && !deps.suno.delegated,
      source: {
        apiBaseUrl: deps.suno.delegated ? 'modelcross_gateway' : 'none',
        apiKey: deps.suno.delegated ? 'modelcross' : deps.suno.configured ? 'env' : 'none',
      },
      locked: { apiBaseUrl: true, apiKey: true },
      platformManaged: true,
      managedBy: 'modelcross',
      adminUrl: null,
      providerConfigured: deps.suno.configured,
    });
  }));
  app.put('/api/settings', authenticated(async (_req, res) => {
    res.status(403).json({ error: 'provider credentials are managed by the ModelCross control plane' });
  }));
  app.post('/api/settings/test', administrator(async (_req, res, session) => {
    const provider = deps.suno.delegated
      ? deps.suno.forCredential(session.accessToken)
      : deps.suno;
    const startedAt = Date.now();
    let probe: ProviderProbe;
    try {
      const balance = await provider.balance();
      probe = {
        configured: true, reachable: true, authenticated: true, balance,
        checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt, errorCode: null,
      };
    } catch (error) {
      const status = error instanceof SunoError ? error.status : null;
      probe = {
        configured: deps.suno.configured, reachable: status !== null, authenticated: false, balance: null,
        checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt,
        errorCode: status === 401 || status === 403
          ? 'provider_auth_failed'
          : status !== null ? `provider_http_${status}` : 'provider_unreachable',
      };
    }
    res.json({
      ok: probe.authenticated,
      provider: 'MXAPI / Suno',
      configured: probe.configured,
      reachable: probe.reachable,
      authenticated: probe.authenticated,
      balance: probe.balance,
      checkedAt: probe.checkedAt,
      latencyMs: probe.latencyMs,
      errorCode: probe.errorCode,
      ...(!probe.configured
        ? { error: 'music provider is not configured in ModelCross' }
        : !probe.authenticated
          ? { error: 'music provider health check failed' }
          : {}),
    });
  }));

  /**
   * Provider merchant diagnostics. This is intentionally administrator-only:
   * MXAPI points are deployment costs, not the signed-in user's ModelCross
   * wallet. Keep the response shape separate from all billing routes.
   */
  app.get('/api/admin/provider/points', administrator(async (req, res, session) => {
    const parsePositiveInteger = (value: unknown, fallback: number, maximum?: number): number => {
      const raw = Array.isArray(value) ? value[0] : value;
      if (raw === undefined || raw === '') return fallback;
      if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
        throw Object.assign(new Error('provider points pagination must be an integer'), { status: 400 });
      }
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
        throw Object.assign(new Error(maximum === undefined
          ? 'provider points page must be a positive integer'
          : `provider points pageSize must be between 1 and ${maximum}`), { status: 400 });
      }
      return parsed;
    };
    const page = parsePositiveInteger(req.query.page, 1);
    const pageSize = parsePositiveInteger(req.query.pageSize, 20, 100);
    const provider = deps.suno.delegated
      ? deps.suno.forCredential(session.accessToken)
      : deps.suno;
    const [balance, logs] = await Promise.all([
      provider.balance(),
      provider.pointsLogs(page, pageSize),
    ]);
    res.json({ balance, logs });
  }));

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir, { immutable: config.nodeEnv === 'production', maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
    app.get(/^(?!\/api\/|\/health\/|\/metrics$).*/, (_req, res) => res.sendFile(path.join(deps.staticDir!, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: error.code === 'LIMIT_FILE_SIZE' ? 'file exceeds the upload size limit' : 'invalid multipart upload',
        requestId: res.locals.requestId,
      });
    }
    const known = error instanceof ValidationError
      || error instanceof IdempotencyConflictError
      || error instanceof ResourceNotFoundError
      || error instanceof ResourceStateConflictError
      || error instanceof ContentPolicyError
      || error instanceof AiCapabilityUnavailableError;
    if (known) {
      const status = 'status' in error && typeof error.status === 'number' ? error.status : 400;
      return res.status(status).json({ error: error.message, requestId: res.locals.requestId });
    }
    if (error instanceof SunoError) return res.status(502).json({ error: 'music provider request failed', requestId: res.locals.requestId });
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number((error as { status: unknown }).status);
      if (Number.isInteger(status) && status >= 400 && status < 500) {
        const message = 'message' in error && typeof error.message === 'string' ? error.message : 'invalid request';
        return res.status(status).json({ error: message, requestId: res.locals.requestId });
      }
    }
    log({
      level: 'error', event: 'http.unhandled', requestId: res.locals.requestId,
      method: req.method, path: req.path, error: (error as Error).stack ?? String(error),
    });
    if (!res.headersSent) res.status(500).json({ error: 'internal error', requestId: res.locals.requestId });
    else if (!res.destroyed) res.destroy();
  });
  return app;
}
