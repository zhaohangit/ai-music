import type { SunoClient } from '../suno.js';
import type { PlatformConfig } from './config.js';
import type { ModelCrossClient } from './modelcross-client.js';
import type { MusicOperationDefinition } from './music-operations.js';
import { ResourceStateConflictError } from './repository.js';
import type { AuthenticatedSession, MusicOperationCatalogItem } from './types.js';
import { createHash } from 'node:crypto';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const modelAuthorizationCaches = new WeakMap<ModelCrossClient, Map<string, { expiresAt: number; ids: Set<string> }>>();

export class MusicModelAuthorizationError extends Error {
  status = 403;
}

export async function requireAuthorizedMusicModel(
  config: PlatformConfig,
  modelCross: ModelCrossClient,
  session: AuthenticatedSession,
  modelId: string,
): Promise<void> {
  if (config.authMode === 'development') return;
  let cache = modelAuthorizationCaches.get(modelCross);
  if (!cache) {
    cache = new Map();
    modelAuthorizationCaches.set(modelCross, cache);
  }
  const tokenDigest = createHash('sha256').update(session.accessToken).digest('hex').slice(0, 24);
  const key = `${session.user.subject}:${tokenDigest}`;
  let entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    entry = {
      ids: new Set(await modelCross.musicModelIds(session.accessToken)),
      expiresAt: Date.now() + 60_000,
    };
    cache.set(key, entry);
    if (cache.size > 1000) {
      for (const [candidate, value] of cache) {
        if (value.expiresAt <= Date.now()) cache.delete(candidate);
      }
    }
  }
  if (!entry.ids.has(modelId)) {
    throw new MusicModelAuthorizationError('selected music model is not authorized for this ModelCross account');
  }
}

export function developmentFakeProviderAllowed(config: PlatformConfig, suno: Pick<SunoClient, 'url'>): boolean {
  if (config.nodeEnv === 'production'
    || config.authMode !== 'development'
    || (!config.musicProvider.allowDevelopmentFakeProvider
      && !config.musicProvider.allowDevelopmentDirectProvider)) return false;
  try {
    const url = new URL(suno.url);
    if (config.musicProvider.allowDevelopmentDirectProvider) {
      return url.protocol === 'https:' && !LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
    }
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function requireMusicOperation(
  config: PlatformConfig,
  modelCross: ModelCrossClient,
  suno: SunoClient,
  session: AuthenticatedSession,
  definition: MusicOperationDefinition,
): Promise<MusicOperationCatalogItem> {
  if (!suno.configured) throw new ResourceStateConflictError('music provider is not configured');
  const items = await modelCross.musicOperationCatalog(session.accessToken, [{
    action: definition.action,
    operationCode: definition.operationCode,
    fallbackCredits: definition.fallbackCredits,
  }]);
  const item = items.find((candidate) => candidate.operationCode === definition.operationCode);
  if (!item || !item.available) {
    throw new ResourceStateConflictError(item?.reason || `music operation ${definition.operationCode} is unavailable`);
  }
  if (config.modelCross.billingLive && item.chargingEnabled) return item;
  if (developmentFakeProviderAllowed(config, suno) && item.preview) return item;
  throw new ResourceStateConflictError('paid music generation is unavailable while charging is disabled');
}
