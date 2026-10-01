import {
  SUNO_MODEL_IDS,
  type GenerateRequest,
  type RemasterVariation,
  type TrackActionRequest,
  type VocalGender,
} from './types.js';
import { assertAllowedFields } from './contract-validation.js';
export { ValidationError } from './errors.js';
import { ValidationError } from './errors.js';

const DEFAULT_MODEL = 'chirp-bluejay';
const REMASTER_VARIATIONS = ['subtle', 'normal', 'high'] as const;

function stringValue(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new ValidationError(`${name} must be at most ${max} characters for the selected model`);
  }
  return normalized;
}

function slider(value: unknown, name: string, fallback = 0.5): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new ValidationError(`${name} must be a number between 0 and 1`);
  }
  return n;
}

function vocalGender(value: unknown): VocalGender {
  const gender = value === undefined || value === null || value === '' ? 'auto' : value;
  if (gender !== 'auto' && gender !== 'm' && gender !== 'f') {
    throw new ValidationError('vocalGender must be auto, m, or f');
  }
  return gender;
}

export function normalizeGenerate(body: unknown): GenerateRequest {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be an object');
  const b = body as Record<string, unknown>;
  assertAllowedFields(b, [
    'kind', 'projectId', 'mode', 'title', 'description', 'style', 'lyrics',
    'instrumental', 'model', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
    'outputCount', 'isMaxMode', 'augCreativity',
  ], 'generate');

  const mode = b.mode === undefined ? 'simple' : b.mode;
  if (mode !== 'simple' && mode !== 'custom') {
    throw new ValidationError('mode must be simple or custom');
  }

  const model = typeof b.model === 'string' && b.model ? b.model : DEFAULT_MODEL;
  if (!(SUNO_MODEL_IDS as readonly string[]).includes(model)) {
    throw new ValidationError(`model must be one of ${SUNO_MODEL_IDS.join(', ')}`);
  }

  const isV5 = ['chirp-fenix','chirp-crow','chirp-hawk','chirp-hawk-wild','chirp-goose'].includes(model);
  const title = stringValue(b.title, 'title', isV5 ? 100 : 80);
  const description = stringValue(b.description, 'description', 1000);
  const style = stringValue(b.style, 'style', isV5 ? 1000 : 200);
  const lyrics = stringValue(b.lyrics, 'lyrics', isV5 ? 5000 : 3000);
  const negativeTags = stringValue(b.negativeTags, 'negativeTags', isV5 ? 1000 : 200);
  const instrumental = b.instrumental === true;
  const requestedVocalGender = vocalGender(b.vocalGender);
  if (b.isMaxMode !== undefined && typeof b.isMaxMode !== 'boolean') throw new ValidationError('isMaxMode must be boolean');
  if (b.augCreativity !== undefined && (typeof b.augCreativity !== 'number' || !Number.isFinite(b.augCreativity) || b.augCreativity < 0 || b.augCreativity > 4)) throw new ValidationError('augCreativity must be between 0 and 4');
  const outputCount = b.outputCount === undefined ? undefined : b.outputCount;
  if (outputCount !== undefined && outputCount !== 1 && outputCount !== 2) throw new ValidationError('outputCount must be 1 or 2');

  if (mode === 'simple' && !description) {
    throw new ValidationError('description is required in simple mode');
  }
  if (mode === 'custom' && !style) {
    throw new ValidationError('style is required in custom mode');
  }
  if (mode === 'custom' && !instrumental && !lyrics) {
    throw new ValidationError('lyrics are required in custom mode unless instrumental is enabled');
  }

  return {
    mode,
    title,
    description,
    style,
    lyrics,
    instrumental,
    model,
    negativeTags,
    vocalGender: instrumental ? 'auto' : requestedVocalGender,
    styleWeight: slider(b.styleWeight, 'styleWeight'),
    weirdness: slider(b.weirdness, 'weirdness'),
    ...(b.isMaxMode === undefined ? {} : { isMaxMode: b.isMaxMode as boolean }),
    ...(b.augCreativity === undefined ? {} : { augCreativity: b.augCreativity as number }),
    ...(outputCount === undefined ? {} : { outputCount }),
  };
}

export function normalizeTrackAction(body: unknown): TrackActionRequest {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be an object');
  const b = body as Record<string, unknown>;
  assertAllowedFields(b, [
    'action', 'projectId', 'continueAt', 'variation', 'model', 'mode', 'title',
    'description', 'style', 'lyrics', 'instrumental', 'negativeTags',
    'vocalGender', 'styleWeight', 'weirdness', 'audioWeight',
  ], 'track action');
  if (b.action !== 'extend' && b.action !== 'cover' && b.action !== 'remaster') {
    throw new ValidationError('action must be extend, cover, or remaster');
  }

  let continueAt: number | undefined;
  if (b.continueAt !== undefined && b.continueAt !== null && b.continueAt !== '') {
    if (b.action !== 'extend') throw new ValidationError('continueAt is only supported for extend');
    continueAt = Number(b.continueAt);
    if (!Number.isFinite(continueAt) || continueAt < 0) {
      throw new ValidationError('continueAt must be a non-negative number');
    }
  }

  if (b.action !== 'remaster' && b.variation !== undefined && b.variation !== '') {
    throw new ValidationError('variation is only supported for remaster');
  }
  const variation = b.variation === undefined || b.variation === '' ? 'normal' : b.variation;
  if (!(REMASTER_VARIATIONS as readonly unknown[]).includes(variation)) {
    throw new ValidationError(`variation must be one of ${REMASTER_VARIATIONS.join(', ')}`);
  }

  const overrideFields = [
    'model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental',
    'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
  ] as const;
  if (b.action === 'remaster' && overrideFields.some((field) => b[field] !== undefined)) {
    throw new ValidationError('generation overrides are only supported for extend or cover');
  }

  const overrides: Partial<GenerateRequest> = {};
  if (b.model !== undefined) {
    if (typeof b.model !== 'string' || !b.model.trim()) throw new ValidationError('model must be a non-empty string');
    overrides.model = b.model.trim();
  }
  if (b.mode !== undefined) {
    if (b.mode !== 'simple' && b.mode !== 'custom') throw new ValidationError('mode must be simple or custom');
    overrides.mode = b.mode;
  }
  for (const field of ['title', 'description', 'style', 'lyrics', 'negativeTags'] as const) {
    if (b[field] !== undefined) {
      if (typeof b[field] !== 'string') throw new ValidationError(`${field} must be a string`);
      overrides[field] = b[field];
    }
  }
  if (b.instrumental !== undefined) {
    if (typeof b.instrumental !== 'boolean') throw new ValidationError('instrumental must be boolean');
    overrides.instrumental = b.instrumental;
  }
  if (b.vocalGender !== undefined) overrides.vocalGender = vocalGender(b.vocalGender);
  if (overrides.instrumental === true) overrides.vocalGender = 'auto';
  if (b.styleWeight !== undefined) overrides.styleWeight = slider(b.styleWeight, 'styleWeight');
  if (b.weirdness !== undefined) overrides.weirdness = slider(b.weirdness, 'weirdness');

  let audioWeight: number | undefined;
  if (b.audioWeight !== undefined && b.audioWeight !== null && b.audioWeight !== '') {
    if (b.action !== 'cover') {
      throw new ValidationError('audioWeight is only supported for uploaded-audio cover');
    }
    audioWeight = Number(b.audioWeight);
    if (!Number.isFinite(audioWeight) || audioWeight < 0 || audioWeight > 1) {
      throw new ValidationError('audioWeight must be a number between 0 and 1');
    }
  }

  return {
    action: b.action,
    continueAt,
    variation: variation as RemasterVariation,
    ...(audioWeight === undefined ? {} : { audioWeight }),
    ...overrides,
  };
}
