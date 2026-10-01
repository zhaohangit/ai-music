import type { GenerateRequest, SoundGenerateRequest } from '../types.js';
import { ValidationError } from '../validate.js';
import { assertAllowedFields } from '../contract-validation.js';
import type { MusicModelCapabilities, MusicModelProfile } from './types.js';

const baseCapabilities = (overrides: Partial<MusicModelCapabilities> = {}): MusicModelCapabilities => ({
  simple: true,
  custom: true,
  instrumental: true,
  negativeTags: true,
  vocalGender: true,
  maxTitle: 80,
  maxDescription: 1000,
  maxStyle: 200,
  maxLyrics: 3000,
  operations: [
    'generate', 'extend', 'cover', 'remaster', 'upload', 'upload_extend',
    'whole_song', 'crop', 'speed',
    'aligned_lyrics', 'video', 'convert_wav', 'download_mp3', 'download_m4a',
  ],
  styleWeight: { min: 0, max: 1, default: 0.65 },
  weirdness: { min: 0, max: 1, default: 0.5 },
  ...overrides,
});

const withoutOperations = (
  operations: MusicModelCapabilities['operations'],
  removed: MusicModelCapabilities['operations'],
): MusicModelCapabilities['operations'] => operations.filter((operation) => !removed.includes(operation));

const legacyCapabilities = (
  overrides: Partial<MusicModelCapabilities> = {},
): MusicModelCapabilities => {
  const capabilities = baseCapabilities({
    vocalGender: false,
    styleWeight: undefined,
    weirdness: undefined,
    ...overrides,
  });
  return {
    ...capabilities,
    // The live MXAPI guide only documents metadata control sliders for V4.5+
    // and publishes no remaster model mapping for V3/V3.5.
    operations: withoutOperations(capabilities.operations, ['remaster']),
  };
};

export const DEFAULT_MUSIC_MODEL_PROFILES: MusicModelProfile[] = [
  ...([
    ['chirp-hawk', 'Suno V6', '当前标准模型，细腻人声与完整歌曲。'],
    ['chirp-hawk-wild', 'Suno V6 Wild', '更自由的创作变奏与旋律探索。'],
    ['chirp-goose', 'Suno V6 Mini', '轻量创作与快速试稿。'],
  ] as const).map(([id, displayName, description], i) => ({ id, displayName, description, provider: 'MXAPI · Suno', badge: i === 0 ? '最新' : null, enabled: true, sortOrder: i + 1, estimatedCredits: 20, priceVersion: 'music-2026-09-v1', capabilities: baseCapabilities({ maxTitle: 100, maxStyle: 1000, maxLyrics: 5000 }) })),
  {
    id: 'chirp-fenix', displayName: 'Suno V5.5', provider: 'MXAPI · Suno',
    description: 'V5.5 兼容入口；歌曲生成由上游重定向到 V6，音效仍使用此标识。', badge: '兼容', enabled: true,
    sortOrder: 10, estimatedCredits: 20, priceVersion: 'music-2026-08-v1',
    capabilities: baseCapabilities({
      maxTitle: 100, maxStyle: 1000, maxLyrics: 5000,
      // MXAPI V2 maps the V5.5 generation model to the chirp-flounder
      // upsample model. variation_category is valid for V5 and newer.
      operations: [...baseCapabilities().operations, 'sound'],
    }),
  },
  {
    id: 'chirp-crow', displayName: 'Suno V5', provider: 'MXAPI · Suno',
    description: '高品质完整歌曲，兼顾稳定性和创意。', badge: '高品质', enabled: true,
    sortOrder: 20, estimatedCredits: 18, priceVersion: 'music-2026-08-v1',
    capabilities: baseCapabilities({
      maxTitle: 100, maxStyle: 1000, maxLyrics: 5000,
      operations: [...baseCapabilities().operations, 'sound'],
    }),
  },
  {
    id: 'chirp-bluejay', displayName: 'Suno V4.5+', provider: 'MXAPI · Suno',
    description: '稳定均衡，适合日常快速创作。', badge: '推荐', enabled: true,
    sortOrder: 30, estimatedCredits: 14, priceVersion: 'music-2026-08-v1',
    capabilities: baseCapabilities(),
  },
  {
    id: 'chirp-auk-turbo', displayName: 'Suno V4.5 All', provider: 'MXAPI · Suno',
    description: 'V4.5 全能力版本，兼顾结构、风格与生成稳定性。', badge: '全能', enabled: true,
    sortOrder: 40, estimatedCredits: 10, priceVersion: 'music-2026-08-v1',
    capabilities: baseCapabilities(),
  },
  {
    id: 'chirp-auk', displayName: 'Suno V4.5', provider: 'MXAPI · Suno',
    description: '复杂提示词理解与歌曲结构表现良好。', badge: null, enabled: true,
    sortOrder: 50, estimatedCredits: 12, priceVersion: 'music-2026-08-v1',
    capabilities: baseCapabilities(),
  },
  {
    id: 'chirp-v4', displayName: 'Suno V4', provider: 'MXAPI · Suno',
    description: '经典稳定模型，兼容旧项目。', badge: null, enabled: true,
    sortOrder: 60, estimatedCredits: 8, priceVersion: 'music-2026-08-v1',
    capabilities: {
      ...baseCapabilities({ vocalGender: false, styleWeight: undefined, weirdness: undefined }),
    },
  },
  {
    id: 'chirp-v3-5', displayName: 'Suno V3.5', provider: 'MXAPI · Suno',
    description: '旧版兼容模型。', badge: '兼容', enabled: true,
    sortOrder: 70, estimatedCredits: 6, priceVersion: 'music-2026-08-v1',
    capabilities: legacyCapabilities(),
  },
  {
    id: 'chirp-v3-0', displayName: 'Suno V3', provider: 'MXAPI · Suno',
    description: '仅用于复现旧项目。', badge: '旧版', enabled: true,
    sortOrder: 80, estimatedCredits: 5, priceVersion: 'music-2026-08-v1',
    capabilities: legacyCapabilities(),
  },
];

const boundedString = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (normalized.length > max) throw new ValidationError(`${field} must be at most ${max} characters for the selected model`);
  return normalized;
};

const boundedSlider = (value: unknown, field: string, capability: { min: number; max: number; default: number } | undefined): number => {
  if (!capability) return 0.5;
  if (value === undefined || value === null || value === '') return capability.default;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < capability.min || parsed > capability.max) {
    throw new ValidationError(`${field} must be between ${capability.min} and ${capability.max}`);
  }
  return parsed;
};

/**
 * Fail closed when the browser sends a field that is not part of the public
 * MuseFlow contract. Silently dropping a misspelled Provider parameter is
 * particularly dangerous for music controls: the request appears successful
 * while the user's selected setting never reaches Suno.
 */
export function validateGenerateForProfile(body: unknown, profile: MusicModelProfile): GenerateRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body must be an object');
  const input = body as Record<string, unknown>;
  assertAllowedFields(input, [
    'kind', 'projectId', 'mode', 'title', 'description', 'style', 'lyrics',
    'instrumental', 'model', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
    'outputCount', 'isMaxMode', 'augCreativity',
  ], 'generate');
  const mode = input.mode ?? 'simple';
  if (mode !== 'simple' && mode !== 'custom') throw new ValidationError('mode must be simple or custom');
  if (mode === 'simple' && !profile.capabilities.simple) throw new ValidationError('selected model does not support simple mode');
  if (mode === 'custom' && !profile.capabilities.custom) throw new ValidationError('selected model does not support custom mode');

  const title = boundedString(input.title, 'title', profile.capabilities.maxTitle);
  const description = boundedString(input.description, 'description', profile.capabilities.maxDescription);
  const style = boundedString(input.style, 'style', profile.capabilities.maxStyle);
  const lyrics = boundedString(input.lyrics, 'lyrics', profile.capabilities.maxLyrics);
  const negativeTags = profile.capabilities.negativeTags
    ? boundedString(input.negativeTags, 'negativeTags', profile.capabilities.maxStyle)
    : '';
  const instrumental = input.instrumental === true;
  if (instrumental && !profile.capabilities.instrumental) throw new ValidationError('selected model does not support instrumental mode');
  if (mode === 'simple' && !description) throw new ValidationError('description is required in simple mode');
  if (mode === 'custom' && !style) throw new ValidationError('style is required in custom mode');
  if (mode === 'custom' && !instrumental && !lyrics) throw new ValidationError('lyrics are required unless instrumental is enabled');

  let vocalGender: GenerateRequest['vocalGender'] = 'auto';
  if (profile.capabilities.vocalGender) {
    const candidate = input.vocalGender ?? 'auto';
    if (candidate !== 'auto' && candidate !== 'm' && candidate !== 'f') throw new ValidationError('vocalGender must be auto, m, or f');
    if (!instrumental) vocalGender = candidate;
  }
  if (input.isMaxMode !== undefined && typeof input.isMaxMode !== 'boolean') throw new ValidationError('isMaxMode must be boolean');
  if (input.augCreativity !== undefined && (typeof input.augCreativity !== 'number' || !Number.isFinite(input.augCreativity) || input.augCreativity < 0 || input.augCreativity > 4)) throw new ValidationError('augCreativity must be between 0 and 4');
  if ((input.isMaxMode || input.augCreativity !== undefined) && !profile.capabilities.styleWeight) throw new ValidationError('advanced controls require V4.5 or newer');
  const outputCount = input.outputCount === undefined ? undefined : input.outputCount;
  if (outputCount !== undefined && outputCount !== 1 && outputCount !== 2) throw new ValidationError('outputCount must be 1 or 2');
  return {
    mode, title, description, style, lyrics, instrumental, model: profile.id, negativeTags, vocalGender,
    styleWeight: boundedSlider(input.styleWeight, 'styleWeight', profile.capabilities.styleWeight),
    weirdness: boundedSlider(input.weirdness, 'weirdness', profile.capabilities.weirdness),
    ...(input.isMaxMode === undefined ? {} : { isMaxMode: input.isMaxMode as boolean }),
    ...(input.augCreativity === undefined ? {} : { augCreativity: input.augCreativity as number }),
    ...(outputCount === undefined ? {} : { outputCount }),
  };
}

const SOUND_MODEL_IDS = new Set(['chirp-crow', 'chirp-fenix']);

/** Normalize the exact request contract published for POST /api/v2/music/sound. */
export function validateSoundForProfile(body: unknown, profile: MusicModelProfile): SoundGenerateRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body must be an object');
  if (!SOUND_MODEL_IDS.has(profile.id) || !profile.capabilities.operations.includes('sound')) {
    throw new ValidationError('selected model does not support sound generation');
  }
  const input = body as Record<string, unknown>;
  assertAllowedFields(input, ['kind', 'projectId', 'title', 'tags', 'model', 'tempo', 'key', 'loop'], 'sound');
  const title = boundedString(input.title, 'title', 100);
  const tags = boundedString(input.tags, 'tags', 1000);
  if (!title) throw new ValidationError('title is required for sound generation');
  if (!tags) throw new ValidationError('tags are required for sound generation');

  let soundTempo: number | null = null;
  if (input.tempo !== undefined && input.tempo !== null) {
    if (typeof input.tempo !== 'number' || !Number.isFinite(input.tempo)) {
      throw new ValidationError('tempo must be a finite number');
    }
    soundTempo = input.tempo;
  }

  let soundKey = '';
  if (input.key !== undefined && input.key !== null) {
    if (typeof input.key !== 'string') throw new ValidationError('key must be a string');
    soundKey = input.key.trim();
  }

  let soundLoop: boolean | null = null;
  if (input.loop !== undefined && input.loop !== null) {
    if (typeof input.loop !== 'boolean') throw new ValidationError('loop must be boolean');
    soundLoop = input.loop;
  }

  return {
    kind: 'sound',
    mode: 'custom',
    title,
    description: '',
    style: tags,
    lyrics: '',
    instrumental: true,
    model: profile.id,
    negativeTags: '',
    vocalGender: 'auto',
    // Tracks retain a complete normalized generation shape, but these values
    // are deliberately never mapped into the Sound Provider request.
    styleWeight: 0.5,
    weirdness: 0.5,
    soundTempo,
    soundKey,
    soundLoop,
  };
}
