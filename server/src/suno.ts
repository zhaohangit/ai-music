import type {
  GenerateRequest,
  RemasterVariation,
  SoundGenerateRequest,
  SunoControlSlider,
  TrackStatus,
  TrackStage,
} from './types.js';
import { SUNO_MODEL_IDS } from './types.js';

export const SUNO_MODELS = [...SUNO_MODEL_IDS];

export class SunoError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'SunoError';
  }
}

export interface SunoGenerateOptions {
  operation?: 'generate' | 'extend' | 'upload_extend' | 'cover';
  clipId?: string;
  continueAt?: number;
  /** MXAPI documents this only for extend/cover operations based on uploaded audio. */
  audioWeight?: number;
  idempotencyKey?: string;
}

const ADVANCED_CONTROL_MODEL_IDS = new Set([
  'chirp-hawk', 'chirp-hawk-wild', 'chirp-goose',
  'chirp-fenix',
  'chirp-crow',
  'chirp-bluejay',
  'chirp-auk',
  'chirp-auk-turbo',
]);
const SOUND_MODEL_IDS = new Set(['chirp-crow', 'chirp-fenix']);

export const SUNO_SPEED_MULTIPLIERS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type SunoSpeedMultiplier = (typeof SUNO_SPEED_MULTIPLIERS)[number];

export interface SunoLyricAlignment {
  word: string;
  startS: number;
  endS: number;
  success: boolean | null;
  confidence: number | null;
}

export interface NormalizedSunoTask {
  /** MXAPI's numeric database record id, required by video/WAV follow-up calls. */
  providerRecordId: number | null;
  taskId: string;
  upstreamStatus: string | null;
  providerStatus: number | null;
  status: TrackStatus;
  stage: TrackStage;
  progress: number;
  customId: string | null;
  title: string | null;
  style: string | null;
  lyrics: string | null;
  instrumental: boolean | null;
  model: string | null;
  duration: number | null;
  audioUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  wavUrl: string | null;
  mp3Url?: string | null;
  m4aUrl?: string | null;
  alignmentState: string | null;
  lyricAlignment: SunoLyricAlignment[];
  pointsCost: number | null;
  pointsRefunded: boolean | null;
  error: string | null;
}

/**
 * Read-only merchant accounting data returned by MXAPI's V2 points APIs.
 * These values describe the deployment/provider account, never the signed-in
 * user's ModelCross wallet or a billable MuseFlow operation.
 */
export interface SunoPointsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SunoPointsLogs {
  list: JsonObject[];
  pagination: SunoPointsPagination;
}

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
const TASK_BATCH_SIZE = 10;

const asObject = (value: unknown): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const booleanValue = (value: unknown): boolean | null =>
  typeof value === 'boolean'
    ? value
    : value === 1 || value === '1' || value === 'true'
      ? true
      : value === 0 || value === '0' || value === 'false'
        ? false
        : null;

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function redactProviderMessage(value: string, apiKey: string | null): string {
  let safe = value.replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]');
  if (apiKey) safe = safe.split(apiKey).join('[redacted]');
  return safe.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) || 'request failed';
}

async function limitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const advertised = finiteNumber(response.headers.get('content-length'));
  if (advertised !== null && advertised > maxBytes) {
    throw new SunoError(`MXAPI response exceeded ${maxBytes} bytes`, response.status);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SunoError(`MXAPI response exceeded ${maxBytes} bytes`, response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export function normalizeProgress(value: unknown): number {
  if (typeof value === 'string') {
    const number = Number(value.replace(/%$/, '').trim());
    if (!Number.isFinite(number)) return 0;
    return Math.min(1, Math.max(0, value.includes('%') || number > 1 ? number / 100 : number));
  }
  const number = finiteNumber(value);
  if (number === null) return 0;
  return Math.min(1, Math.max(0, number > 1 ? number / 100 : number));
}

function parseExtend(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject).filter((item) => Object.keys(item).length > 0);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(asObject).filter((item) => Object.keys(item).length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseExtendedObject(value: unknown): JsonObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return asObject(JSON.parse(value) as unknown);
  } catch {
    return {};
  }
}

/**
 * MXAPI may expose a placeholder `fileInfo.mp3Url` (for example
 * `/api/forbidden`) while the actual playable MP3 is present in the Suno
 * `media_urls` list or the clip's `audio_url`. Prefer a concrete media URL
 * and ignore known placeholder responses so the worker can materialize the
 * completed task instead of permanently retrying a non-audio endpoint.
 */
function playableAudioUrl(fileInfo: JsonObject, clip: JsonObject): string | null {
  const mediaUrls = Array.isArray(clip.media_urls) ? clip.media_urls : [];
  for (const entry of mediaUrls) {
    const item = asObject(entry);
    const url = nonEmptyString(item.url);
    const contentType = nonEmptyString(item.content_type)?.toLowerCase() ?? '';
    if (url && (/mp3|mpeg|audio/.test(contentType) || /\.mp3(?:[?#]|$)/i.test(url))) return url;
  }
  const clipAudio = nonEmptyString(clip.audio_url);
  if (clipAudio) return clipAudio;
  const fileAudio = nonEmptyString(fileInfo.mp3Url ?? fileInfo.mp3_url);
  if (!fileAudio) return null;
  try {
    const parsed = new URL(fileAudio);
    if (parsed.pathname.toLowerCase().includes('/api/forbidden')) return null;
  } catch {
    return null;
  }
  return fileAudio;
}

function parseLyricAlignment(value: unknown): SunoLyricAlignment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = asObject(entry);
    const word = nonEmptyString(item.word);
    const startS = finiteNumber(item.start_s);
    const endS = finiteNumber(item.end_s);
    if (word === null || startS === null || endS === null) return [];
    return [{
      word,
      startS,
      endS,
      success: booleanValue(item.success),
      confidence: finiteNumber(item.p_align),
    }];
  });
}

function requiredId(value: unknown, field: string): string {
  const id = nonEmptyString(value);
  if (!id) throw new SunoError(`${field} is required`);
  return id;
}

function requiredProviderRecordId(value: unknown): number {
  const id = finiteNumber(value);
  if (id === null || !Number.isInteger(id) || id <= 0) {
    throw new SunoError('task_id must be a positive integer MXAPI record id');
  }
  return id;
}

function localState(outer: string | null, provider: number | null): Pick<NormalizedSunoTask, 'status' | 'stage'> {
  if (outer === 'failed' || provider === 4) return { status: 'error', stage: 'error' };
  if (outer === 'completed' || provider === 3) return { status: 'running', stage: 'downloading' };
  if (outer === 'processing' || provider === 2) return { status: 'running', stage: 'generating' };
  return { status: 'queued', stage: 'queued' };
}

/** Normalize the official `data` task object. */
export function normalizeSunoTask(value: unknown, fallbackTaskId = ''): NormalizedSunoTask {
  const data = asObject(value);
  const result = asObject(data.result);
  const fileInfo = asObject(result.fileInfo ?? result.file_info);
  const customId = nonEmptyString(result.custom_id ?? result.customId);
  const clips = parseExtend(result.extend);
  const extendedObject = parseExtendedObject(result.extend);
  // Once MXAPI gives us a custom_id, only that exact clip belongs to this
  // task. Falling back to the first array entry can attach the sibling song
  // from the same two-result batch to this track.
  const clip = customId
    ? clips.find((item) => nonEmptyString(item.id) === customId) ?? {}
    : clips[0] ?? {};
  const metadata = asObject(clip.metadata);
  const outerStatus = nonEmptyString(data.status)?.toLowerCase() ?? null;
  const providerStatus = finiteNumber(result.status);
  const state = localState(outerStatus, providerStatus);

  const progress = state.stage === 'downloading'
    ? 1
    : normalizeProgress(result.progress ?? data.progress);
  const error = nonEmptyString(data.error)
    ?? nonEmptyString(result.error)
    ?? nonEmptyString(result.errormsg)
    ?? nonEmptyString(result.errormsgEn)
    ?? nonEmptyString(metadata.error_message);

  return {
    providerRecordId: (() => {
      const id = finiteNumber(data.id);
      return id !== null && Number.isInteger(id) && id > 0 ? id : null;
    })(),
    taskId: nonEmptyString(data.task_id ?? data.taskId) ?? fallbackTaskId,
    upstreamStatus: outerStatus,
    providerStatus,
    status: state.status,
    stage: state.stage,
    progress,
    customId,
    title: nonEmptyString(clip.title),
    style: nonEmptyString(metadata.tags) ?? nonEmptyString(clip.display_tags),
    lyrics: nonEmptyString(metadata.prompt) ?? nonEmptyString(clip.text),
    instrumental: booleanValue(metadata.make_instrumental),
    model: nonEmptyString(clip.model_name) ?? nonEmptyString(clip.major_model_version),
    duration: finiteNumber(fileInfo.duration) ?? finiteNumber(metadata.duration),
    audioUrl: playableAudioUrl(fileInfo, clip),
    imageUrl: nonEmptyString(fileInfo.cosUrl ?? fileInfo.cos_url ?? fileInfo.thumbImg)
      ?? nonEmptyString(clip.image_url)
      ?? nonEmptyString(clip.image_large_url),
    videoUrl: nonEmptyString(fileInfo.mp4Url ?? fileInfo.mp4_url)
      ?? nonEmptyString(clip.video_url)
      ?? nonEmptyString(extendedObject.video_url),
    wavUrl: nonEmptyString(extendedObject.wav_file_url),
    mp3Url: nonEmptyString(extendedObject.download_url ?? extendedObject.mp3_file_url ?? extendedObject.mp3_url),
    m4aUrl: nonEmptyString(extendedObject.audio_url ?? extendedObject.m4a_file_url ?? extendedObject.m4a_url),
    alignmentState: nonEmptyString(extendedObject.state),
    lyricAlignment: parseLyricAlignment(extendedObject.alignment),
    pointsCost: finiteNumber(data.points_cost ?? result.points_cost),
    pointsRefunded: booleanValue(data.points_refunded ?? data.refunded ?? result.points_refunded ?? result.refunded),
    error,
  };
}

export function mapGeneratePayload(input: GenerateRequest, options: SunoGenerateOptions = {}): JsonObject {
  const operation = options.operation ?? 'generate';
  if (!['generate', 'extend', 'upload_extend', 'cover'].includes(operation)) {
    throw new SunoError('generate operation is invalid');
  }
  if (options.audioWeight !== undefined && operation !== 'upload_extend' && operation !== 'cover') {
    throw new SunoError('audioWeight is only supported for upload_extend or uploaded-audio cover');
  }
  const supportsAdvancedControls = ADVANCED_CONTROL_MODEL_IDS.has(input.model);
  if (options.audioWeight !== undefined && !supportsAdvancedControls) {
    throw new SunoError('audioWeight requires a V4.5 or newer generation model');
  }
  if (options.audioWeight !== undefined
    && (!Number.isFinite(options.audioWeight) || options.audioWeight < 0 || options.audioWeight > 1)) {
    throw new SunoError('audioWeight must be a number between 0 and 1');
  }
  const controlSliders: JsonObject = {};
  const canControlSliders: SunoControlSlider[] = ['style_weight', 'weirdness_constraint'];
  const metadata: JsonObject = {};
  if (supportsAdvancedControls) {
    // MXAPI's advanced envelope carries the same simple/custom mode selected
    // in the MuseFlow form. Legacy models reject the entire metadata object.
    metadata.create_mode = input.mode;
    if (input.isMaxMode !== undefined) metadata.is_max_mode = input.isMaxMode;
    if (input.augCreativity !== undefined) {
      if (!Number.isFinite(input.augCreativity) || input.augCreativity < 0 || input.augCreativity > 4) throw new SunoError('augCreativity must be 0–4');
      controlSliders.aug_creativity = input.augCreativity;
    }
    controlSliders.style_weight = input.styleWeight;
    controlSliders.weirdness_constraint = input.weirdness;
    metadata.control_sliders = controlSliders;
    metadata.can_control_sliders = canControlSliders;
  }
  if (supportsAdvancedControls && !input.instrumental && input.vocalGender !== 'auto') {
    metadata.vocal_gender = input.vocalGender;
  }

  const payload: JsonObject = {
    mv: input.model,
    title: input.title,
    make_instrumental: input.instrumental,
    ...(supportsAdvancedControls ? { metadata } : {}),
  };
  if (input.negativeTags) payload.negative_tags = input.negativeTags;
  if (input.mode === 'simple') payload.gpt_description_prompt = input.description;
  else {
    payload.prompt = input.lyrics;
    payload.tags = input.style;
  }

  if (operation === 'extend' || operation === 'upload_extend') {
    if (!options.clipId) throw new SunoError('extend requires a custom clip id');
    if (options.continueAt === undefined || !Number.isFinite(options.continueAt) || options.continueAt < 0) {
      throw new SunoError('extend requires a non-negative continueAt value');
    }
    payload.task = operation;
    payload.continue_clip_id = options.clipId;
    payload.continue_at = options.continueAt;
  } else if (operation === 'cover') {
    if (!options.clipId) throw new SunoError('cover requires a custom clip id');
    payload.task = 'cover';
    payload.cover_clip_id = options.clipId;
  }
  if (options.audioWeight !== undefined) {
    controlSliders.audio_weight = options.audioWeight;
    canControlSliders.push('audio_weight');
  }
  return payload;
}

/** Map only the fields published by MXAPI for POST /api/v2/music/sound. */
export function mapSoundPayload(input: SoundGenerateRequest): JsonObject {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const tags = typeof input.style === 'string' ? input.style.trim() : '';
  if (!title || title.length > 100) throw new SunoError('sound title is required and must be at most 100 characters');
  if (!tags || tags.length > 1000) throw new SunoError('sound tags are required and must be at most 1000 characters');
  if (!SOUND_MODEL_IDS.has(input.model)) throw new SunoError('sound mv must be chirp-crow or chirp-fenix');
  if (input.soundTempo !== null && !Number.isFinite(input.soundTempo)) {
    throw new SunoError('sound tempo must be a finite number');
  }
  if (typeof input.soundKey !== 'string') throw new SunoError('sound key must be a string');
  if (input.soundLoop !== null && typeof input.soundLoop !== 'boolean') {
    throw new SunoError('sound loop must be boolean');
  }
  const key = input.soundKey.trim();
  return {
    title,
    tags,
    mv: input.model,
    ...(input.soundTempo === null ? {} : { tempo: input.soundTempo }),
    ...(key ? { key } : {}),
    ...(input.soundLoop === null ? {} : { loop: input.soundLoop }),
  };
}

/** Map generation-model names to the separate model ids expected by Remaster. */
export function remasterModelFor(model: string): string {
  switch (model) {
    // The live V2 guide maps Suno V5.5 (the generation model exposed as
    // chirp-fenix) to the separate upsample model chirp-flounder.
    case 'chirp-fenix': return 'chirp-flounder';
    case 'chirp-hawk':
    case 'chirp-hawk-wild':
    case 'chirp-goose':
    case 'chirp-crow': return 'chirp-carp';
    case 'chirp-bluejay':
    case 'chirp-auk':
    case 'chirp-auk-turbo': return 'chirp-bass';
    case 'chirp-v4': return 'chirp-up';
    default: throw new SunoError(`remaster is unsupported for generation model ${model}`);
  }
}

export class SunoClient {
  constructor(
    private baseUrl: string,
    private apiKey: string | null,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 15_000,
    private readonly delegatedCredentials = false,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  configure(baseUrl: string, apiKey: string | null): void {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  get configured(): boolean { return !!this.apiKey || this.delegatedCredentials; }
  get delegated(): boolean { return this.delegatedCredentials; }
  get url(): string { return this.baseUrl; }

  withCredential(apiKey: string): SunoClient {
    const credential = apiKey.trim();
    if (!credential) throw new SunoError('ModelCross task credential is required', 401);
    return new SunoClient(this.baseUrl, credential, this.fetchImpl, this.timeoutMs, this.delegatedCredentials);
  }

  forCredential(apiKey: string): SunoClient {
    return this.delegatedCredentials ? this.withCredential(apiKey) : this;
  }

  async generate(input: GenerateRequest, options: SunoGenerateOptions = {}): Promise<string[]> {
    const payload = mapGeneratePayload(input, options);
    const envelope = await this.request('/api/v2/music/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    return this.taskIds(envelope);
  }

  async sound(input: SoundGenerateRequest, idempotencyKey?: string): Promise<string[]> {
    const payload = mapSoundPayload(input);
    const envelope = await this.request('/api/v2/music/sound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    return this.taskIds(envelope);
  }

  async remaster(clipId: string, model: string, variation: RemasterVariation, idempotencyKey?: string): Promise<string[]> {
    const normalizedClipId = requiredId(clipId, 'remaster clip_id');
    const modelName = remasterModelFor(model);
    if (!['subtle', 'normal', 'high'].includes(variation)) {
      throw new SunoError('remaster variation must be subtle, normal, or high');
    }
    const payload: JsonObject = {
      clip_id: normalizedClipId,
      model_name: modelName,
      // MXAPI documents variation_category for V5 and newer remaster models.
      // Keep it off the V4/V4.5 payloads, where the field is rejected.
      ...(['chirp-carp', 'chirp-flounder'].includes(modelName) ? { variation_category: variation } : {}),
    };
    const envelope = await this.request('/api/v2/music/upsample', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    return this.taskIds(envelope);
  }

  async uploadAudio(audioUrl: string, copyrightAudio = false, idempotencyKey?: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(audioUrl);
    } catch {
      throw new SunoError('upload requires a valid audio URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new SunoError('upload audio URL must use http or https without credentials');
    }
    if (typeof copyrightAudio !== 'boolean') throw new SunoError('copyrightAudio must be boolean');
    return this.submitSingle('/api/v2/music/upload', {
      audio_url: parsed.toString(),
      copyrightAudio,
    }, idempotencyKey);
  }

  async wholeSong(clipId: string, idempotencyKey?: string): Promise<string> {
    return this.submitSingle('/api/v2/music/whole-song', { clip_id: requiredId(clipId, 'whole-song clip_id') }, idempotencyKey);
  }

  async alignedLyrics(lyrics: string, sunoId: string, idempotencyKey?: string): Promise<string> {
    const normalizedLyrics = nonEmptyString(lyrics);
    if (!normalizedLyrics) throw new SunoError('aligned-lyrics requires non-empty lyrics');
    return this.submitSingle('/api/v2/music/aligned-lyrics', {
      lyrics: normalizedLyrics,
      suno_id: requiredId(sunoId, 'aligned-lyrics suno_id'),
    }, idempotencyKey);
  }

  async musicVideo(providerRecordId: number, sunoId: string, idempotencyKey?: string): Promise<string> {
    return this.submitSingle('/api/v2/music/video', {
      task_id: requiredProviderRecordId(providerRecordId),
      suno_id: requiredId(sunoId, 'music-video suno_id'),
    }, idempotencyKey);
  }

  async convertWav(providerRecordId: number, sunoId: string, idempotencyKey?: string): Promise<string> {
    return this.submitSingle('/api/v2/music/convert-wav', {task_id: requiredProviderRecordId(providerRecordId), suno_id: requiredId(sunoId, 'convert-wav suno_id')}, idempotencyKey);
  }

  async downloadAudio(format: 'wav' | 'mp3' | 'm4a', sunoId: string, idempotencyKey?: string): Promise<string> {
    return this.submitSingle(`/api/v2/music/download-${format}`, { suno_id: requiredId(sunoId, 'download suno_id') }, idempotencyKey);
  }

  async crop(clipId: string, startSeconds: number, endSeconds: number, idempotencyKey?: string): Promise<string> {
    if (!Number.isFinite(startSeconds) || startSeconds < 0) throw new SunoError('crop start must be a non-negative number');
    if (!Number.isFinite(endSeconds) || endSeconds <= startSeconds) throw new SunoError('crop end must be greater than crop start');
    return this.submitSingle('/api/v2/music/crop', {
      clip_id: requiredId(clipId, 'crop clip_id'),
      crop_start_s: startSeconds,
      crop_end_s: endSeconds,
    }, idempotencyKey);
  }

  async speed(
    clipId: string,
    multiplier: SunoSpeedMultiplier,
    options: { keepPitch?: boolean; title?: string; idempotencyKey?: string } = {},
  ): Promise<string> {
    if (!(SUNO_SPEED_MULTIPLIERS as readonly number[]).includes(multiplier)) {
      throw new SunoError(`speed multiplier must be one of ${SUNO_SPEED_MULTIPLIERS.join(', ')}`);
    }
    if (options.keepPitch !== undefined && typeof options.keepPitch !== 'boolean') {
      throw new SunoError('keepPitch must be boolean');
    }
    const title = nonEmptyString(options.title);
    return this.submitSingle('/api/v2/music/speed', {
      clip_id: requiredId(clipId, 'speed clip_id'),
      speed_multiplier: multiplier,
      keep_pitch: options.keepPitch ?? true,
      ...(title ? { title } : {}),
    }, options.idempotencyKey);
  }

  async task(taskId: string): Promise<NormalizedSunoTask> {
    const envelope = await this.request(`/api/v2/music/task?id=${encodeURIComponent(taskId)}`);
    return normalizeSunoTask(asObject(envelope).data, taskId);
  }

  async tasks(taskIds: string[]): Promise<NormalizedSunoTask[]> {
    const unique = [...new Set(taskIds.filter(Boolean))];
    if (!unique.length) return [];
    const normalized: NormalizedSunoTask[] = [];
    for (let offset = 0; offset < unique.length; offset += TASK_BATCH_SIZE) {
      const batch = unique.slice(offset, offset + TASK_BATCH_SIZE);
      const query = new URLSearchParams({ ids: batch.join(','), page: '1', size: String(TASK_BATCH_SIZE) });
      const envelope = await this.request(`/api/v2/music/tasks?${query.toString()}`);
      const data = asObject(asObject(envelope).data);
      const items = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.list)
          ? data.list
          : [];
      normalized.push(...items.map((item) => normalizeSunoTask(item)));
    }
    return normalized;
  }

  async balance(): Promise<number | null> {
    // The live V2 API-test contract exposes provider merchant balance here.
    // This is deliberately kept separate from ModelCross's user wallet.
    const envelope = await this.request('/api/v2/points/balance');
    const data = asObject(asObject(envelope).data);
    return finiteNumber(data.remaining_points ?? data.balance);
  }

  /** Read the provider merchant's paginated V2 points ledger for diagnostics. */
  async pointsLogs(page = 1, pageSize = 20): Promise<SunoPointsLogs> {
    if (!Number.isInteger(page) || page < 1) {
      throw new SunoError('points logs page must be a positive integer');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new SunoError('points logs pageSize must be an integer between 1 and 100');
    }
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const envelope = await this.request(`/api/v2/points/logs?${query.toString()}`);
    const data = asObject(asObject(envelope).data);
    const rawPagination = asObject(data.pagination);
    const numberOr = (value: unknown, fallback: number, minimum = 0): number => {
      const parsed = finiteNumber(value);
      return parsed !== null && Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
    };
    const returnedPage = numberOr(rawPagination.page, page, 1);
    const returnedPageSize = numberOr(rawPagination.pageSize, pageSize, 1);
    const list = Array.isArray(data.list)
      ? data.list.map(asObject).filter((entry) => Object.keys(entry).length > 0)
      : [];
    const total = numberOr(rawPagination.total, list.length);
    return {
      list,
      pagination: {
        page: returnedPage,
        pageSize: returnedPageSize,
        total,
        totalPages: numberOr(rawPagination.totalPages, total ? Math.ceil(total / returnedPageSize) : 0),
      },
    };
  }

  private taskIds(envelope: unknown): string[] {
    const data = asObject(asObject(envelope).data);
    const ids = Array.isArray(data.task_ids)
      ? [...new Set(data.task_ids.map(nonEmptyString).filter((id): id is string => id !== null))]
      : [];
    if (ids.length !== 2) {
      throw new SunoError(`MXAPI returned ${ids.length} task ids; expected exactly 2`);
    }
    return ids;
  }

  private async submitSingle(path: string, payload: JsonObject, idempotencyKey?: string): Promise<string> {
    const envelope = await this.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = asObject(asObject(envelope).data);
    const taskId = nonEmptyString(data.task_id ?? data.taskId);
    if (!taskId) throw new SunoError('MXAPI returned no task_id');
    return taskId;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.apiKey) throw new SunoError('SUNO_API_KEY is not configured', 401);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            ...init.headers,
          },
          signal: controller.signal,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new SunoError(`MXAPI request timed out after ${this.timeoutMs}ms`);
        }
        throw new SunoError(`MXAPI is unreachable: ${(error as Error).message}`);
      }

      let text: string;
      try {
        text = await limitedResponseText(response, MAX_JSON_RESPONSE_BYTES);
      } catch (error) {
        if (error instanceof SunoError) throw error;
        if ((error as Error).name === 'AbortError') {
          throw new SunoError(`MXAPI request timed out after ${this.timeoutMs}ms`);
        }
        throw new SunoError(`MXAPI response could not be read (${response.status})`, response.status);
      }

      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new SunoError(`MXAPI returned invalid JSON (${response.status})`, response.status);
      }
      const object = asObject(body);
      const code = finiteNumber(object.code);
      if (!response.ok || code !== 200) {
        const rawMessage = nonEmptyString(object.message) ?? nonEmptyString(object.error) ?? 'request failed';
        const errorStatus = response.ok && code !== null ? code : response.status;
        throw new SunoError(
          `MXAPI ${errorStatus}: ${redactProviderMessage(rawMessage, this.apiKey)}`,
          errorStatus,
          retryAfterMs(response.headers.get('retry-after')),
        );
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}
