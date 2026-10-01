import { DEMO_MODELS } from '../src/fixtures';
import type { MusicModelProfile, MusicOperationProfile, SunoOperation } from '../src/types';

const profile = (
  action: SunoOperation,
  operationCode: string,
  estimatedCredits: number | null,
  parameters?: MusicOperationProfile['parameters'],
): MusicOperationProfile => ({
  action,
  operationCode,
  available: true,
  estimatedCredits,
  priceVersion: estimatedCredits === null ? null : 'test-price-v1',
  chargingEnabled: false,
  preview: true,
  executable: true,
  previewExecutable: true,
  parameters: parameters ?? null,
});

export const SUNO_OPERATIONS: MusicOperationProfile[] = [
  profile('generate', 'generation_pair', 20),
  {
    ...profile('sound', 'sound_pair', 20, {
      title: { type: 'string', required: true, maxLength: 100, wireName: 'title' },
      tags: { type: 'string', required: true, maxLength: 1000, wireName: 'tags' },
      model: { type: 'string', required: true, enum: ['chirp-crow', 'chirp-fenix'], wireName: 'mv' },
      tempo: { type: 'number', required: false, default: 99, wireName: 'tempo' },
      key: { type: 'string', required: false, default: 'D', wireName: 'key' },
      loop: { type: 'boolean', required: false, default: true, wireName: 'loop' },
    }),
    outputCount: 2,
    modelIds: ['chirp-crow', 'chirp-fenix'],
  },
  profile('extend', 'extend_pair', 20, { continueAt: { min: 0, max: 600, step: 1, default: 90 }, generationOverrides: ['model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness'] }),
  profile('cover', 'cover_pair', 24, {
    audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
    generationOverrides: ['model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness'],
  }),
  profile('remaster', 'remaster_pair', 24, { variation: { enum: ['subtle', 'normal', 'high'], modelIds: ['chirp-crow', 'chirp-fenix'], default: 'normal' } }),
  profile('upload', 'upload_single', 3, {
    acceptedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac'],
    acceptedExtensions: ['.mp3', '.wav', '.flac'],
    maxBytes: 52_428_800,
    maxDurationSeconds: 600,
  }),
  profile('upload', 'upload_copyright_single', 8, {
    acceptedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac'],
    acceptedExtensions: ['.mp3', '.wav', '.flac'],
    maxBytes: 52_428_800,
    maxDurationSeconds: 600,
  }),
  profile('upload_extend', 'upload_extend_pair', 25, {
    continueAt: { min: 0, max: 600, step: 1, default: 0, maximumField: 'upload.duration' },
    audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
    generationOverrides: ['model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness'],
  }),
  profile('upload_extend', 'upload_copyright_extend_pair', 40, {
    continueAt: { min: 0, max: 600, step: 1, default: 0, maximumField: 'upload.duration' },
    audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
    generationOverrides: ['model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness'],
  }),
  profile('whole_song', 'whole_song_single', 12),
  profile('crop', 'crop_single', 4, {
    startSeconds: { min: 0, default: 0 },
    endSeconds: { exclusiveMinimumField: 'startSeconds', maximumField: 'track.duration' },
  }),
  profile('speed', 'speed_single', 6, {
    multiplier: { enum: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], default: 1 },
    keepPitch: { type: 'boolean', default: true },
    title: { type: 'string', required: false },
  }),
  profile('aligned_lyrics', 'aligned_lyrics_single', 3, { lyrics: { minLength: 1, maxLength: 5000 } }),
  profile('video', 'video_single', 18),
  profile('convert_wav', 'convert_wav_single', 5),
];

export const SUNO_MODEL: MusicModelProfile = {
  ...DEMO_MODELS[0],
  capabilities: {
    ...DEMO_MODELS[0].capabilities,
    operations: [
      'generate', 'sound', 'extend', 'cover', 'upload', 'upload_extend', 'whole_song', 'crop', 'speed',
      'aligned_lyrics', 'video', 'convert_wav',
    ],
  },
};
