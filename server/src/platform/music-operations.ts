export type StableMusicAction =
  | 'generate'
  | 'sound'
  | 'extend'
  | 'cover'
  | 'remaster'
  | 'upload'
  | 'upload_extend'
  | 'whole_song'
  | 'crop'
  | 'speed'
  | 'aligned_lyrics'
  | 'video'
  | 'convert_wav'
  | 'download_mp3'
  | 'download_m4a';

export interface MusicOperationDefinition {
  action: StableMusicAction;
  operationCode: string;
  fallbackCredits: number;
  outputCount: 0 | 1 | 2;
  /** Billable result units when an operation produces an asset instead of a new Track. */
  billingItemCount?: 1 | 2;
  modelIds?: string[];
  variant?: 'standard' | 'copyright' | 'max';
  parameters?: Record<string, unknown>;
}

export const AUDIO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const AUDIO_UPLOAD_MAX_DURATION_SECONDS = 600;
export const AUDIO_UPLOAD_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
] as const;
export const AUDIO_UPLOAD_EXTENSIONS = ['.mp3', '.wav', '.flac'] as const;
export const SPEED_MULTIPLIERS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const GENERATION_OVERRIDE_FIELDS = [
  'model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental',
  'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
] as const;

/**
 * Product/billing identifiers are deliberately frozen here. Never derive a
 * code from a UI label or provider path: ModelCross catalog membership is the
 * authorization boundary for every paid provider mutation.
 */
export const MUSIC_OPERATION_DEFINITIONS: readonly MusicOperationDefinition[] = [
  { action: 'generate', operationCode: 'generation_max_pair', fallbackCredits: 40, outputCount: 2, variant: 'max', parameters: { isMaxMode: true } },
  { action: 'generate', operationCode: 'generation_pair', fallbackCredits: 20, outputCount: 2 },
  {
    action: 'sound',
    operationCode: 'sound_pair',
    // Local preview/fail-safe estimate only. ModelCross's versioned catalog is
    // the authoritative price whenever this paid mutation is executable.
    fallbackCredits: 20,
    outputCount: 2,
    modelIds: ['chirp-crow', 'chirp-fenix'],
    parameters: {
      title: { type: 'string', required: true, maxLength: 100, wireName: 'title' },
      tags: { type: 'string', required: true, maxLength: 1000, wireName: 'tags' },
      model: { type: 'string', required: true, enum: ['chirp-crow', 'chirp-fenix'], wireName: 'mv' },
      tempo: { type: 'number', required: false, default: 99, wireName: 'tempo' },
      key: { type: 'string', required: false, default: 'D', wireName: 'key' },
      loop: { type: 'boolean', required: false, default: true, wireName: 'loop' },
    },
  },
  {
    action: 'extend', operationCode: 'extend_pair', fallbackCredits: 20, outputCount: 2,
    parameters: {
      continueAt: { min: 0, step: 1, maximumField: 'track.duration' },
      generationOverrides: GENERATION_OVERRIDE_FIELDS,
    },
  },
  {
    action: 'cover', operationCode: 'cover_pair', fallbackCredits: 24, outputCount: 2,
    parameters: {
      generationOverrides: GENERATION_OVERRIDE_FIELDS,
      audioWeight: {
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5,
        sourceOperation: 'upload',
        wireName: 'metadata.control_sliders.audio_weight',
      },
    },
  },
  {
    action: 'remaster', operationCode: 'remaster_pair', fallbackCredits: 24, outputCount: 2,
    parameters: {
      variation: {
        enum: ['subtle', 'normal', 'high'],
        // V5 uses chirp-carp and V5.5 uses chirp-flounder at the Provider
        // upsample endpoint. The public generation model ids remain crow/fenix.
        modelIds: ['chirp-crow', 'chirp-fenix'],
        default: 'normal',
      },
    },
  },
  {
    action: 'upload', operationCode: 'upload_single', fallbackCredits: 5, outputCount: 1,
    variant: 'standard',
    parameters: {
      acceptedMimeTypes: AUDIO_UPLOAD_MIME_TYPES,
      acceptedExtensions: AUDIO_UPLOAD_EXTENSIONS,
      maxBytes: AUDIO_UPLOAD_MAX_BYTES,
      maxDurationSeconds: AUDIO_UPLOAD_MAX_DURATION_SECONDS,
      copyrightConfirmedRequired: true,
      copyrightAudio: false,
    },
  },
  {
    action: 'upload', operationCode: 'upload_copyright_single', fallbackCredits: 20, outputCount: 1,
    variant: 'copyright',
    parameters: {
      acceptedMimeTypes: AUDIO_UPLOAD_MIME_TYPES,
      acceptedExtensions: AUDIO_UPLOAD_EXTENSIONS,
      maxBytes: AUDIO_UPLOAD_MAX_BYTES,
      maxDurationSeconds: AUDIO_UPLOAD_MAX_DURATION_SECONDS,
      copyrightConfirmedRequired: true,
      copyrightAudio: true,
    },
  },
  {
    action: 'upload_extend', operationCode: 'upload_extend_pair', fallbackCredits: 25, outputCount: 2,
    variant: 'standard',
    parameters: {
      continueAt: {
        min: 0,
        max: AUDIO_UPLOAD_MAX_DURATION_SECONDS,
        step: 1,
        default: 0,
        maximumField: 'upload.duration',
      },
      audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
      generationOverrides: GENERATION_OVERRIDE_FIELDS,
      copyrightAudio: false,
    },
  },
  {
    action: 'upload_extend', operationCode: 'upload_copyright_extend_pair', fallbackCredits: 40, outputCount: 2,
    variant: 'copyright',
    parameters: {
      continueAt: {
        min: 0,
        max: AUDIO_UPLOAD_MAX_DURATION_SECONDS,
        step: 1,
        default: 0,
        maximumField: 'upload.duration',
      },
      audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
      generationOverrides: GENERATION_OVERRIDE_FIELDS,
      copyrightAudio: true,
    },
  },
  { action: 'whole_song', operationCode: 'whole_song_single', fallbackCredits: 8, outputCount: 1 },
  {
    action: 'crop', operationCode: 'crop_single', fallbackCredits: 4, outputCount: 1,
    parameters: {
      // MXAPI documents only a non-negative start and end > start. Do not
      // invent a Provider-side 0.1-second increment or minimum duration.
      startSeconds: { min: 0, default: 0 },
      endSeconds: {
        exclusiveMinimumField: 'startSeconds',
        maximumField: 'track.duration',
      },
    },
  },
  {
    action: 'speed', operationCode: 'speed_single', fallbackCredits: 4, outputCount: 1,
    parameters: {
      multiplier: { enum: SPEED_MULTIPLIERS, default: 1 },
      keepPitch: { type: 'boolean', default: true },
      title: { type: 'string', required: false },
    },
  },
  {
    action: 'aligned_lyrics', operationCode: 'aligned_lyrics_single', fallbackCredits: 3,
    outputCount: 0, billingItemCount: 1,
    parameters: { lyrics: { minLength: 1, maxLength: 5000 } },
  },
  { action: 'video', operationCode: 'video_single', fallbackCredits: 8, outputCount: 0, billingItemCount: 1 },
  { action: 'download_mp3', operationCode: 'download_mp3_single', fallbackCredits: 4, outputCount: 0, billingItemCount: 1 },
  { action: 'download_m4a', operationCode: 'download_m4a_single', fallbackCredits: 4, outputCount: 0, billingItemCount: 1 },
  { action: 'convert_wav', operationCode: 'convert_wav_single', fallbackCredits: 5, outputCount: 0, billingItemCount: 1 },
] as const;

export function musicOperationBillingItemCount(definition: MusicOperationDefinition): 1 | 2 {
  const count = definition.billingItemCount ?? definition.outputCount;
  if (count !== 1 && count !== 2) {
    throw new Error(`music operation ${definition.operationCode} has no billable item count`);
  }
  return count;
}

export function musicOperationDefinition(
  action: StableMusicAction,
  copyrightAudio = false,
  maxMode = false,
): MusicOperationDefinition {
  const definition = MUSIC_OPERATION_DEFINITIONS.find((candidate) =>
    candidate.action === action
      && ((candidate.variant === undefined && !maxMode) || candidate.variant === (maxMode ? 'max' : copyrightAudio ? 'copyright' : 'standard')),
  );
  if (!definition) throw new Error(`unknown music operation: ${action}`);
  return definition;
}
