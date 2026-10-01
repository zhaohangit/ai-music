import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Library } from './library.js';
import { SunoClient, SunoError, type NormalizedSunoTask } from './suno.js';
import type { Track, TrackStage } from './types.js';

type FetchLike = typeof fetch;
type AssetKind = 'audio' | 'cover';
const STAGE_ORDER: Record<Exclude<TrackStage, 'error'>, number> = {
  queued: 0,
  generating: 1,
  downloading: 2,
  done: 3,
};

function forwardStage(current: TrackStage, incoming: TrackStage): TrackStage {
  if (incoming === 'error' || current === 'error') return 'error';
  return STAGE_ORDER[incoming] >= STAGE_ORDER[current] ? incoming : current;
}

async function fetchTasksIndividually(
  client: SunoClient,
  ids: string[],
  concurrency = 4,
): Promise<NormalizedSunoTask[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const results: NormalizedSunoTask[] = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < unique.length) {
      const id = unique[cursor++]!;
      try {
        results.push(await client.task(id));
      } catch {
        // The caller decides whether a complete lack of results is fatal. A
        // partial response must not prevent healthy sibling tasks progressing.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return results;
}

const safeStoredFilename = (value: string | null): string | null =>
  value && path.basename(value) === value && value !== '.' && value !== '..' ? value : null;

async function removeCachedAsset(directory: string, filename: string | null): Promise<void> {
  const safe = safeStoredFilename(filename);
  if (safe) await fsp.rm(path.join(directory, safe), { force: true }).catch(() => undefined);
}

export interface DownloadAssetOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
}

function coverExtension(contentType: string, url: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  const ext = path.extname(new URL(url).pathname).toLowerCase().replace(/^\./, '');
  return ['png', 'webp', 'gif', 'jpg', 'jpeg'].includes(ext) ? ext : 'jpg';
}

/** Stream one authenticated-provider result URL into an atomic local file. */
export async function downloadRemoteAsset(
  url: string,
  directory: string,
  baseName: string,
  kind: AssetKind,
  options: DownloadAssetOptions = {},
): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('asset URL is invalid'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('asset URL must use http or https');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const maxBytes = options.maxBytes ?? (kind === 'audio' ? 128 * 1024 * 1024 : 20 * 1024 * 1024);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  let tmpPath: string | null = null;
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'MuseFlow/1.0' },
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new Error(`asset download timed out after ${timeoutMs}ms`);
      throw new Error(`asset download failed: ${(error as Error).message}`);
    }
    if (!response.ok || !response.body) {
      throw new Error(`asset download returned HTTP ${response.status}`);
    }

    const advertised = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertised) && advertised > maxBytes) {
      throw new Error(`asset is larger than ${maxBytes} bytes`);
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase().split(';', 1)[0]!.trim();
    const genericType = !contentType
      || contentType.includes('application/octet-stream')
      || contentType.includes('application/binary');
    if (!genericType && kind === 'audio' && contentType !== 'audio/mpeg' && contentType !== 'audio/mp3') {
      throw new Error(`asset returned unexpected content type ${contentType}`);
    }
    if (!genericType && kind === 'cover' && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) {
      throw new Error(`asset returned unexpected content type ${contentType}`);
    }

    const extension = kind === 'audio' ? 'mp3' : coverExtension(contentType, url);
    const filename = `${baseName}.${extension}`;
    const finalPath = path.join(directory, filename);
    tmpPath = `${finalPath}.${process.pid}.${randomUUID()}.part`;
    await fsp.mkdir(directory, { recursive: true });

    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes) callback(new Error(`asset is larger than ${maxBytes} bytes`));
        else callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      limiter,
      fs.createWriteStream(tmpPath, { mode: 0o600 }),
    );
    await fsp.rename(tmpPath, finalPath);
    tmpPath = null;
    return filename;
  } finally {
    clearTimeout(timer);
    if (tmpPath) await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
  }
}

export interface SunoPollerOptions {
  intervalMs?: number;
  assetTimeoutMs?: number;
  /** Consecutive partial-response misses before one opaque task is failed. */
  missingTaskThreshold?: number;
  fetchImpl?: FetchLike;
  log?: (message: string) => void;
}

/**
 * Restart-safe polling coordinator for already-submitted MXAPI tasks.
 * The provider owns generation; this process only observes and materializes it.
 */
export class SunoPoller {
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private ticking = false;
  private failures = 0;
  private readonly intervalMs: number;
  private readonly assetTimeoutMs: number;
  private readonly missingTaskThreshold: number;
  private readonly fetchImpl: FetchLike;
  private readonly log: (message: string) => void;
  private readonly missingTaskPolls = new Map<string, number>();

  constructor(
    private readonly library: Library,
    private readonly client: SunoClient,
    private readonly tracksDir: string,
    private readonly coversDir: string,
    options: SunoPollerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 4000;
    this.assetTimeoutMs = options.assetTimeoutMs ?? 90_000;
    this.missingTaskThreshold = Math.max(2, options.missingTaskThreshold ?? 60);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.log = options.log ?? ((message) => console.log(`[suno] ${message}`));
  }

  get active(): number {
    return this.library.all().filter((track) => track.status === 'queued' || track.status === 'running').length;
  }

  get queued(): number {
    return this.library.all().filter((track) => track.status === 'queued').length;
  }

  async recover(): Promise<{ resumed: number; failed: number }> {
    const inFlight = this.inFlight();
    const missing = inFlight.filter((track) => !track.upstreamTaskId);
    if (missing.length) {
      await this.library.updateMany(missing.map((track) => ({
        id: track.id,
        patch: {
          status: 'error',
          stage: 'error',
          progress: 1,
          error: 'submission was interrupted before the upstream task id was persisted',
          finishedAt: new Date().toISOString(),
        },
      })));
    }
    return { resumed: inFlight.length - missing.length, failed: missing.length };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.schedule(0);
  }

  stop(): void {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Promptly pick up tasks created after the poller became idle. */
  wake(): void {
    if (!this.started) return;
    this.schedule(0);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    let nextDelay = this.intervalMs;
    try {
      const tracks = this.inFlight().filter((track) => track.upstreamTaskId);
      if (!tracks.length) {
        this.failures = 0;
        return;
      }

      const ids = tracks.map((track) => track.upstreamTaskId!);
      let results: NormalizedSunoTask[];
      let batchQuerySucceeded = false;
      try {
        results = await this.client.tasks(ids);
        batchQuerySucceeded = true;
      } catch (error) {
        if (error instanceof SunoError && (error.status === 401 || error.status === 403 || error.status === 429)) throw error;
        results = await fetchTasksIndividually(this.client, ids);
        if (!results.length) throw error;
      }

      const returnedIds = new Set(results.map((result) => result.taskId).filter(Boolean));
      const missingIds = [...new Set(ids)].filter((id) => !returnedIds.has(id));
      if (missingIds.length) {
        results.push(...await fetchTasksIndividually(this.client, missingIds));
      }
      // A successful batch response with zero matching records is an
      // observable per-task miss, not a transport outage. Count it below so
      // a permanently deleted/unknown task eventually becomes actionable.
      if (!results.length && !batchQuerySucceeded) {
        throw new SunoError('MXAPI returned no matching task records');
      }

      const byId = new Map(results.map((result) => [result.taskId, result]));
      const changes: Array<{ id: string; patch: Partial<Track> }> = [];
      const completed: Array<{ id: string; result: NormalizedSunoTask }> = [];
      const now = Date.now();

      for (const track of tracks) {
        const result = byId.get(track.upstreamTaskId!);
        if (!result) {
          const misses = (this.missingTaskPolls.get(track.id) ?? 0) + 1;
          this.missingTaskPolls.set(track.id, misses);
          if (misses >= this.missingTaskThreshold) {
            this.missingTaskPolls.delete(track.id);
            changes.push({ id: track.id, patch: {
              status: 'error',
              stage: 'error',
              progress: 1,
              upstreamStatus: 'missing',
              error: `MXAPI task ${track.upstreamTaskId} was absent from ${misses} consecutive queries`,
              finishedAt: new Date().toISOString(),
            } });
          }
          continue;
        }
        this.missingTaskPolls.delete(track.id);
        const startedAt = Date.parse(track.createdAt);
        const elapsed = Number.isFinite(startedAt) ? Math.max(0, (now - startedAt) / 1000) : track.elapsed;
        const common: Partial<Track> = {
          elapsed,
          progress: Math.max(track.progress, result.progress),
          upstreamStatus: result.upstreamStatus,
          customId: result.customId ?? track.customId,
          title: result.title ?? track.title,
          style: result.style ?? track.style,
          lyrics: result.lyrics ?? track.lyrics,
          instrumental: result.instrumental ?? track.instrumental,
          model: result.model ?? track.model,
          duration: result.duration ?? track.duration,
          audioUrl: result.audioUrl ?? track.audioUrl,
          imageUrl: result.imageUrl ?? track.imageUrl,
          videoUrl: result.videoUrl ?? track.videoUrl,
          pointsCost: result.pointsCost ?? track.pointsCost,
          pointsRefunded: result.pointsRefunded ?? track.pointsRefunded,
        };

        if (result.status === 'error') {
          changes.push({ id: track.id, patch: {
            ...common,
            status: 'error', stage: 'error', progress: 1,
            error: result.error ?? 'music generation failed',
            finishedAt: new Date().toISOString(),
          } });
        } else if (result.stage === 'downloading') {
          changes.push({ id: track.id, patch: {
            ...common,
            status: 'running', stage: 'downloading', progress: 1, error: null,
          } });
          completed.push({ id: track.id, result });
        } else {
          const stage = forwardStage(track.stage, result.stage);
          changes.push({ id: track.id, patch: {
            ...common,
            status: stage === 'queued' ? 'queued' : 'running',
            stage,
            error: null,
          } });
        }
      }

      await this.library.updateMany(changes);
      await Promise.all(completed.map(({ id, result }) => this.materialize(id, result)));
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      const retryAfter = error instanceof SunoError ? error.retryAfterMs : null;
      nextDelay = retryAfter ?? Math.min(60_000, this.intervalMs * 2 ** Math.min(5, this.failures));
      this.log(`poll failed: ${(error as Error).message}; retrying in ${nextDelay}ms`);
    } finally {
      this.ticking = false;
      if (this.started && this.active) this.schedule(nextDelay);
    }
  }

  private inFlight(): Track[] {
    return this.library.all().filter((track) => track.status === 'queued' || track.status === 'running');
  }

  private schedule(delay: number): void {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
    this.timer.unref?.();
  }

  private async materialize(id: string, result: NormalizedSunoTask): Promise<void> {
    const track = this.library.get(id);
    if (!track || track.status === 'done' || track.status === 'error') return;
    const audioUrl = result.audioUrl ?? track.audioUrl;
    const imageUrl = result.imageUrl ?? track.imageUrl;
    if (!audioUrl) return; // completed metadata may appear before CDN assets are ready

    let file = safeStoredFilename(track.file);
    let coverFile = safeStoredFilename(track.coverFile);
    if (!file) {
      try {
        file = await downloadRemoteAsset(audioUrl, this.tracksDir, id, 'audio', {
          fetchImpl: this.fetchImpl,
          timeoutMs: this.assetTimeoutMs,
        });
      } catch (error) {
        // The local route can stream the retained provider URL. Do not turn a
        // successfully generated song into a failed task because caching failed.
        this.log(`audio cache failed for ${id}: ${(error as Error).message}`);
      }
    }
    if (!coverFile && imageUrl) {
      try {
        coverFile = await downloadRemoteAsset(imageUrl, this.coversDir, id, 'cover', {
          fetchImpl: this.fetchImpl,
          timeoutMs: this.assetTimeoutMs,
        });
      } catch (error) {
        this.log(`cover cache failed for ${id}: ${(error as Error).message}`);
      }
    }

    if (!this.library.get(id)) {
      await removeCachedAsset(this.tracksDir, file);
      await removeCachedAsset(this.coversDir, coverFile);
      return;
    }
    const updated = await this.library.update(id, {
      file,
      coverFile,
      audioUrl,
      imageUrl,
      videoUrl: result.videoUrl ?? track.videoUrl,
      customId: result.customId ?? track.customId,
      status: 'done',
      stage: 'done',
      progress: 1,
      error: null,
      finishedAt: new Date().toISOString(),
    });
    if (!updated) {
      await removeCachedAsset(this.tracksDir, file);
      await removeCachedAsset(this.coversDir, coverFile);
    }
  }
}
