import { describe, expect, it } from 'vitest';
import {
  cropParameterConfig,
  findOperation,
  hasCompleteGenerationOverrides,
  operationStringParameterConfig,
  operationCodeFor,
  referenceAudioParameterConfig,
  remasterVariationConfig,
  speedParameterConfig,
  soundParameterConfig,
} from '../src/lib/operations';
import type { MusicOperationProfile, OperationParameterCatalog, SunoOperation } from '../src/types';

const operation = (
  action: SunoOperation,
  operationCode: string,
  parameters: OperationParameterCatalog,
): MusicOperationProfile => ({
  action,
  operationCode,
  available: true,
  estimatedCredits: 4,
  priceVersion: 'contract-v1',
  chargingEnabled: false,
  preview: true,
  executable: true,
  previewExecutable: true,
  parameters,
});

describe('production operation catalog normalization', () => {
  it('reads the server JSON-schema-like speed descriptors and their defaults', () => {
    const profile = operation('speed', 'speed_single', {
      multiplier: { enum: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], default: 1 },
      keepPitch: { type: 'boolean', default: false },
      title: { maxLength: 72 },
    });

    expect(speedParameterConfig(profile)).toEqual({
      values: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2],
      defaultMultiplier: 1,
      keepPitchDefault: false,
      maxTitleLength: 72,
    });
    expect(speedParameterConfig({
      ...profile,
      parameters: { ...profile.parameters, multiplier: { enum: [0.5, 1], default: 2 } },
    })).toBeNull();
    expect(speedParameterConfig({
      ...profile,
      parameters: { ...profile.parameters, title: undefined },
    })).toEqual({
      values: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2],
      defaultMultiplier: 1,
      keepPitchDefault: false,
    });
  });

  it('resolves only the documented crop field references and preserves fractional duration', () => {
    const profile = operation('crop', 'crop_single', {
      startSeconds: { min: 0 },
      endSeconds: {
        exclusiveMinimumField: 'startSeconds',
        maximumField: 'track.duration',
      },
    });

    expect(cropParameterConfig(profile, 120.8)).toEqual({
      min: 0,
      max: 120.8,
      startStep: 'any',
      endStep: 'any',
    });
    expect(cropParameterConfig({
      ...profile,
      parameters: {
        ...profile.parameters,
        endSeconds: { exclusiveMinimumField: 'startSeconds', maximumField: 'provider.duration' },
      },
    }, 120.8)).toBeNull();
    expect(cropParameterConfig({
      ...profile,
      parameters: {
        ...profile.parameters,
        endSeconds: { exclusiveMinimumField: 'startSeconds', maximumField: 'track.duration' },
      },
    }, 120.8)).toEqual({ min: 0, max: 120.8, startStep: 'any', endStep: 'any' });
  });

  it('treats absent numeric steps as continuous values for the server reference schema', () => {
    const profile = operation('upload_extend', 'upload_extend_pair', {
      continueAt: { min: 0, maximumField: 'upload.duration' },
      audioWeight: { min: 0, max: 1, default: 0.5 },
    });

    expect(referenceAudioParameterConfig(profile)).toEqual({
      continueMin: 0,
      continueCatalogMax: null,
      continueDefault: 0,
      continueStep: 'any',
      audioWeightMin: 0,
      audioWeightMax: 1,
      audioWeightDefault: 0.5,
      audioWeightStep: 'any',
    });
  });

  it('never falls back across a missing copyright billing variant', () => {
    const standard = operation('upload_extend', 'upload_extend_pair', {
      continueAt: { min: 0 },
      audioWeight: { min: 0, max: 1, default: 0.5 },
    });

    expect(findOperation([standard], 'upload_extend', { copyrightAudio: false })).toBe(standard);
    expect(findOperation([standard], 'upload_extend', { copyrightAudio: true })).toBeUndefined();
  });

  it('maps sound_pair as an independent billing boundary and rejects undocumented parameter drift', () => {
    const sound = {
      ...operation('sound', 'sound_pair', {
        title: { type: 'string', required: true, maxLength: 100, wireName: 'title' },
        tags: { type: 'string', required: true, maxLength: 1000, wireName: 'tags' },
        model: { type: 'string', required: true, enum: ['chirp-crow', 'chirp-fenix'], wireName: 'mv' },
        tempo: { type: 'number', required: false, default: 99, wireName: 'tempo' },
        key: { type: 'string', required: false, default: 'D', wireName: 'key' },
        loop: { type: 'boolean', required: false, default: true, wireName: 'loop' },
      }),
      outputCount: 2,
      modelIds: ['chirp-crow', 'chirp-fenix'],
    } satisfies MusicOperationProfile;

    expect(operationCodeFor('sound')).toBe('sound_pair');
    expect(findOperation([sound], 'sound')).toBe(sound);
    expect(soundParameterConfig(sound)).toEqual({
      modelIds: ['chirp-crow', 'chirp-fenix'],
      titleMaxLength: 100,
      tagsMaxLength: 1000,
      tempoDefault: 99,
      keyDefault: 'D',
      loopDefault: true,
    });
    expect(soundParameterConfig({ ...sound, outputCount: 1 })).toBeNull();
    expect(soundParameterConfig({ ...sound, modelIds: ['chirp-fenix'] })).toBeNull();
    expect(soundParameterConfig({
      ...sound,
      parameters: { ...sound.parameters, tempo: { type: 'number', required: false, min: 40, wireName: 'tempo' } },
    })).toBeNull();
    expect(soundParameterConfig({
      ...sound,
      parameters: { ...sound.parameters, key: { type: 'string', required: false, enum: ['D'], wireName: 'key' } },
    })).toBeNull();
  });

  it('reads generation override, remaster and aligned-lyrics capabilities without hardcoded fallbacks', () => {
    const overrides = ['model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness'];
    expect(hasCompleteGenerationOverrides(operation('extend', 'extend_pair', { generationOverrides: overrides }))).toBe(true);
    expect(hasCompleteGenerationOverrides(operation('upload_extend', 'upload_extend_pair', { generationOverrides: overrides }))).toBe(true);
    expect(hasCompleteGenerationOverrides(operation('extend', 'extend_pair', { generationOverrides: overrides.slice(1) }))).toBe(false);

    const remaster = operation('remaster', 'remaster_pair', {
      variation: { enum: ['subtle', 'normal', 'high'], modelIds: ['chirp-crow', 'chirp-fenix'], default: 'normal' },
    });
    expect(remasterVariationConfig(remaster)).toEqual({
      values: ['subtle', 'normal', 'high'], modelIds: ['chirp-crow', 'chirp-fenix'], defaultValue: 'normal',
    });
    expect(remasterVariationConfig(operation('remaster', 'remaster_pair', {}))).toBeNull();

    const aligned = operation('aligned_lyrics', 'aligned_lyrics_single', { lyrics: { minLength: 1, maxLength: 5000 } });
    expect(operationStringParameterConfig(aligned, 'lyrics')).toEqual({ minLength: 1, maxLength: 5000 });
    expect(operationStringParameterConfig(operation('aligned_lyrics', 'aligned_lyrics_single', {}), 'lyrics')).toBeNull();
  });
});
