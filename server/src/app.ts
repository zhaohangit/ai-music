import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { JsonStore, Library } from './library.js';
import { randomTitle } from './names.js';
import { SunoClient, SunoError, SUNO_MODELS } from './suno.js';
import type { SunoPoller } from './poller.js';
import { normalizeApiBaseUrl, type SettingsStore } from './settings.js';
import {
  type GenerateRequest,
  type MusicOperation,
  type Template,
  type Track,
} from './types.js';
import { normalizeGenerate, normalizeTrackAction, ValidationError } from './validate.js';

export interface AppDeps {
  library: Library;
  templates: JsonStore<Template>;
  settings: SettingsStore;
  client: SunoClient;
  poller: SunoPoller;
  tracksDir: string;
  coversDir: string;
  staticDir?: string | null;
  requestTimeoutMs?: number;
  healthCacheTtlMs?: number;
  log?: (message: string) => void;
}

const COVER_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

const safeDownloadName = (title: string, extension: string): string => {
  const fallback = title.replace(/[^\w -]+/g, '').trim().slice(0, 60) || 'track';
  return `attachment; filename="${fallback}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${title || 'track'}.${extension}`)}`;
};

function localAssetPath(directory: string, filename: string): string | null {
  if (!filename || path.basename(filename) !== filename) return null;
  const root = path.resolve(directory);
  const candidate = path.resolve(root, filename);
  return path.dirname(candidate) === root ? candidate : null;
}

function createdTracks(
  input: GenerateRequest,
  taskIds: string[],
  operation: MusicOperation,
  sourceTrackId?: string,
): Track[] {
  const groupId = randomUUID();
  const now = new Date().toISOString();
  return taskIds.map((upstreamTaskId, takeIndex) => ({
    id: randomUUID(),
    groupId,
    takeIndex,
    title: input.title,
    mode: input.mode,
    operation,
    description: input.description,
    style: input.style,
    lyrics: input.lyrics,
    instrumental: input.instrumental,
    model: input.model,
    negativeTags: input.negativeTags,
    vocalGender: input.vocalGender,
    styleWeight: input.styleWeight,
    weirdness: input.weirdness,
    status: 'queued',
    progress: 0,
    stage: 'queued',
    eta: null,
    elapsed: 0,
    error: null,
    file: null,
    coverFile: null,
    audioUrl: null,
    imageUrl: null,
    videoUrl: null,
    upstreamTaskId,
    customId: null,
    duration: 0,
    format: 'mp3',
    pointsCost: null,
    pointsRefunded: null,
    upstreamStatus: 'pending',
    createdAt: now,
    finishedAt: null,
    ...(sourceTrackId ? { sourceTrackId } : {}),
  }));
}

async function proxyStoredAsset(
  req: Request,
  res: Response,
  url: string,
  fallbackType: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(502).json({ error: 'stored asset URL is invalid' }); return; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(502).json({ error: 'stored asset URL is invalid' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(url, { headers, signal: controller.signal });
    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status || 502).json({ error: `asset upstream returned ${upstream.status}` });
      return;
    }

    const rawType = (upstream.headers.get('content-type') ?? '').toLowerCase();
    const contentType = rawType.split(';', 1)[0]!.trim();
    const genericType = !contentType
      || contentType === 'application/octet-stream'
      || contentType === 'application/binary';
    const allowedTypes = fallbackType === 'audio/mpeg'
      ? new Set(['audio/mpeg', 'audio/mp3'])
      : fallbackType === 'image/jpeg'
        ? new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
        : new Set(['video/mp4']);
    if (!genericType && !allowedTypes.has(contentType)) {
      controller.abort();
      res.status(502).json({ error: 'asset upstream returned an unexpected media type' });
      return;
    }
    const advertisedHeader = upstream.headers.get('content-length');
    const advertised = advertisedHeader === null ? null : Number(advertisedHeader);
    if (advertised !== null && Number.isFinite(advertised) && advertised > maxBytes) {
      controller.abort();
      res.status(502).json({ error: 'asset upstream response is too large' });
      return;
    }

    res.status(upstream.status);
    for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader('Content-Type', genericType ? fallbackType : contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes) callback(new Error(`asset proxy exceeded ${maxBytes} bytes`));
        else callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>),
      limiter,
      res,
    );
  } catch (error) {
    if (!res.headersSent) {
      const message = (error as Error).name === 'AbortError' ? 'asset proxy timed out' : 'asset proxy failed';
      res.status(502).json({ error: message });
    } else if (!res.destroyed) res.destroy();
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(deps: AppDeps) {
  const { library, templates, settings, client, poller, tracksDir, coversDir } = deps;
  const log = deps.log ?? ((message: string) => console.log(`[app] ${message}`));
  const requestTimeoutMs = deps.requestTimeoutMs ?? 30_000;
  const healthCacheTtlMs = Math.max(0, deps.healthCacheTtlMs ?? 30_000);
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  /**
   * The paid upstream submission has already succeeded by the time these
   * tracks exist. If the atomic disk write fails after addMany has inserted
   * them in memory, returning a generic 500 would invite a second paid
   * submission. Keep tracking the accepted tasks, wake the poller, and expose
   * a diagnostic header while later poll updates retry the full snapshot.
   */
  const acceptSubmittedTracks = async (tracks: Track[], res: Response): Promise<void> => {
    try {
      await library.addMany(tracks);
    } catch (error) {
      const retained = tracks.every((track) => library.get(track.id) !== undefined);
      if (!retained) throw error;
      res.setHeader('X-MuseFlow-Warning', 'local-persistence-failed');
      log(`submitted MXAPI tasks retained in memory after local persistence failed: ${(error as Error).message}`);
    }
    poller.wake();
  };

  interface UpstreamHealth {
    upstreamReachable: boolean;
    ready: boolean;
    balance: number | null;
    error?: string;
  }
  let healthCache: { expiresAt: number; value: UpstreamHealth } | null = null;
  let healthInFlight: Promise<UpstreamHealth> | null = null;
  let healthGeneration = 0;

  const cacheHealth = (value: UpstreamHealth, generation = healthGeneration): UpstreamHealth => {
    if (generation === healthGeneration) {
      healthCache = { expiresAt: Date.now() + healthCacheTtlMs, value };
    }
    return value;
  };
  const invalidateHealth = (): void => {
    healthGeneration += 1;
    healthCache = null;
    healthInFlight = null;
  };
  const upstreamHealth = async (): Promise<UpstreamHealth> => {
    if (healthCache && healthCache.expiresAt > Date.now()) return healthCache.value;
    if (healthInFlight) return healthInFlight;
    const generation = healthGeneration;
    const probe = client.balance()
      .then((balance) => cacheHealth({ upstreamReachable: true, ready: true, balance }, generation))
      .catch((error: unknown) => cacheHealth({
        upstreamReachable: false,
        ready: false,
        balance: null,
        error: (error as Error).message,
      }, generation));
    healthInFlight = probe;
    try {
      return await probe;
    } finally {
      if (healthInFlight === probe) healthInFlight = null;
    }
  };

  app.get('/api/health', async (_req, res) => {
    const base = {
      provider: 'mxapi-suno' as const,
      configured: client.configured,
      active: poller.active,
      queued: poller.queued,
      models: SUNO_MODELS,
    };
    if (!client.configured) {
      return res.json({ ...base, upstreamReachable: false, ready: false, balance: null, error: 'SUNO_API_KEY is not configured' });
    }
    res.json({ ...base, ...await upstreamHealth() });
  });

  app.get('/api/points', async (_req, res, next) => {
    try {
      const balance = await client.balance();
      cacheHealth({ upstreamReachable: true, ready: true, balance });
      res.json({ balance });
    } catch (error) {
      cacheHealth({ upstreamReachable: false, ready: false, balance: null, error: (error as Error).message });
      next(error);
    }
  });

  app.get('/api/library', (_req, res) => {
    res.json(library.all());
  });

  app.post('/api/generate', async (req, res, next) => {
    try {
      const normalized = normalizeGenerate(req.body);
      const input = { ...normalized, title: normalized.title || randomTitle() };
      const taskIds = await client.generate(input);
      const tracks = createdTracks(input, taskIds, 'generate');
      await acceptSubmittedTracks(tracks, res);
      res.status(201).json(tracks);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tracks/:id/actions', async (req, res, next) => {
    try {
      const source = library.get(req.params.id);
      if (!source) return res.status(404).json({ error: 'not found' });
      if (source.status !== 'done' || !source.customId) {
        throw new ValidationError('the source track must be complete and have a customId');
      }
      const action = normalizeTrackAction(req.body);
      const input: GenerateRequest = {
        mode: source.mode,
        title: source.title,
        description: source.description,
        style: source.style,
        lyrics: source.lyrics,
        instrumental: source.instrumental,
        model: source.model,
        negativeTags: source.negativeTags,
        vocalGender: source.vocalGender,
        styleWeight: source.styleWeight,
        weirdness: source.weirdness,
      };
      const taskIds = action.action === 'remaster'
        ? await client.remaster(source.customId, source.model, action.variation)
        : await client.generate(input, {
          operation: action.action,
          clipId: source.customId,
          continueAt: action.action === 'extend' ? action.continueAt ?? source.duration : undefined,
        });
      const tracks = createdTracks(input, taskIds, action.action, source.id);
      await acceptSubmittedTracks(tracks, res);
      res.status(201).json(tracks);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/tracks/:id', async (req, res, next) => {
    try {
      const removed = await library.remove(req.params.id);
      if (!removed) return res.status(404).json({ error: 'not found' });
      const audioPath = removed.file ? localAssetPath(tracksDir, removed.file) : null;
      const coverPath = removed.coverFile ? localAssetPath(coversDir, removed.coverFile) : null;
      if (audioPath) await fs.rm(audioPath, { force: true });
      if (coverPath) await fs.rm(coverPath, { force: true });
      res.json({ ok: true, remoteTaskMayContinue: removed.status === 'queued' || removed.status === 'running' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/tracks/:id/audio', async (req, res) => {
    const track = library.get(req.params.id);
    if (!track) return res.status(404).json({ error: 'not found' });
    if (track.file) {
      const file = localAssetPath(tracksDir, track.file);
      if (!file) return res.status(404).json({ error: 'file missing' });
      const download = req.query.download !== undefined;
      return res.sendFile(file, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Content-Type-Options': 'nosniff',
          ...(download ? { 'Content-Disposition': safeDownloadName(track.title, 'mp3') } : {}),
        },
      }, (error) => {
        if (!error) return;
        if (!res.headersSent) res.status(404).json({ error: 'file missing' });
        else if (!res.destroyed) res.destroy(error);
      });
    }
    if (!track.audioUrl) return res.status(404).json({ error: 'no audio' });
    if (req.query.download !== undefined) res.setHeader('Content-Disposition', safeDownloadName(track.title, 'mp3'));
    await proxyStoredAsset(req, res, track.audioUrl, 'audio/mpeg', requestTimeoutMs, 128 * 1024 * 1024);
  });

  app.get('/api/tracks/:id/cover', async (req, res) => {
    const track = library.get(req.params.id);
    if (!track) return res.status(404).json({ error: 'not found' });
    if (track.coverFile) {
      const file = localAssetPath(coversDir, track.coverFile);
      if (!file) return res.status(404).json({ error: 'cover missing' });
      const contentType = COVER_MIME[path.extname(track.coverFile).toLowerCase()] ?? 'image/jpeg';
      return res.sendFile(file, {
        headers: { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' },
      }, (error) => {
        if (!error) return;
        if (!res.headersSent) res.status(404).json({ error: 'cover missing' });
        else if (!res.destroyed) res.destroy(error);
      });
    }
    if (!track.imageUrl) return res.status(404).json({ error: 'no cover' });
    await proxyStoredAsset(req, res, track.imageUrl, 'image/jpeg', requestTimeoutMs, 20 * 1024 * 1024);
  });

  app.get('/api/tracks/:id/video', async (req, res) => {
    const track = library.get(req.params.id);
    if (!track) return res.status(404).json({ error: 'not found' });
    if (!track.videoUrl) return res.status(404).json({ error: 'no video' });
    await proxyStoredAsset(req, res, track.videoUrl, 'video/mp4', requestTimeoutMs, 512 * 1024 * 1024);
  });

  app.get('/api/settings', (_req, res) => {
    res.json(settings.publicView());
  });

  app.put('/api/settings', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const current = settings.effective();
      const requestedBaseUrl = body.apiBaseUrl === undefined
        ? current.apiBaseUrl
        : normalizeApiBaseUrl(body.apiBaseUrl);
      const baseUrlChanges = requestedBaseUrl !== current.apiBaseUrl;
      const configuredKeyChanges = client.configured && body.apiKey !== undefined;
      if (poller.active > 0 && (baseUrlChanges || configuredKeyChanges)) {
        throw new ValidationError('provider settings cannot be changed while music tasks are active');
      }
      await settings.update({ apiBaseUrl: body.apiBaseUrl, apiKey: body.apiKey });
      const effective = settings.effective();
      client.configure(effective.apiBaseUrl, effective.apiKey);
      invalidateHealth();
      log(`MXAPI reconfigured to ${effective.apiBaseUrl}${effective.apiKey ? ' (bearer set)' : ''}`);
      res.json(settings.publicView());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/settings/test', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const effective = settings.effective();
    const locked = settings.publicView().locked;
    let apiBaseUrl = effective.apiBaseUrl;
    let apiKey = effective.apiKey;
    try {
      if (body.apiBaseUrl !== undefined && !locked.apiBaseUrl) apiBaseUrl = normalizeApiBaseUrl(body.apiBaseUrl);
      if (new URL(apiBaseUrl).origin !== new URL(effective.apiBaseUrl).origin) {
        if (locked.apiKey) {
          throw new ValidationError('a different API origin cannot be tested while SUNO_API_KEY is set in the environment');
        }
        if (body.apiKey === undefined) {
          throw new ValidationError('apiKey must be entered when testing a different API origin');
        }
      }
      if (body.apiKey !== undefined && !locked.apiKey) {
        if (typeof body.apiKey !== 'string') throw new ValidationError('apiKey must be a string');
        apiKey = body.apiKey.trim() || null;
      }
      const candidate = new SunoClient(apiBaseUrl, apiKey, fetch, requestTimeoutMs);
      const balance = await candidate.balance();
      res.json({ ok: true, apiBaseUrl, balance });
    } catch (error) {
      res.json({ ok: false, apiBaseUrl, error: (error as Error).message });
    }
  });

  app.get('/api/templates', (_req, res) => {
    res.json(templates.all());
  });

  app.post('/api/templates', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) throw new ValidationError('name is required');
      if (name.length > 80) throw new ValidationError('name must be at most 80 characters');
      // `name` belongs to the local template envelope, not the Suno generate
      // contract.  Remove it before strict Provider-field validation so a
      // valid template cannot be rejected as an unknown music parameter.
      const { name: _templateName, ...generationBody } = body;
      const input = normalizeGenerate(generationBody);
      const existing = templates.all().find((template) => template.name.toLowerCase() === name.toLowerCase());
      const template: Template = {
        ...input,
        id: existing?.id ?? randomUUID(),
        name,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      if (existing) await templates.update(existing.id, template);
      else await templates.add(template);
      res.status(existing ? 200 : 201).json(template);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/templates/:id', async (req, res) => {
    const removed = await templates.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(deps.staticDir!, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof SunoError) return res.status(502).json({ error: error.message });
    if (error && typeof error === 'object' && 'type' in error && (error as { type: string }).type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid JSON' });
    }
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number((error as { status: unknown }).status);
      if (status === 413) return res.status(413).json({ error: 'request body is too large' });
      if (Number.isInteger(status) && status >= 400 && status < 500) {
        return res.status(status).json({ error: 'invalid request' });
      }
    }
    log(`unhandled: ${(error as Error).stack ?? error}`);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
