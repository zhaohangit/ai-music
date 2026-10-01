export type TrackStatus = 'queued' | 'running' | 'done' | 'error';
export type TrackStage = 'queued' | 'generating' | 'downloading' | 'done' | 'error';
export type MusicMode = 'simple' | 'custom';
/** The values accepted by MXAPI's metadata.create_mode field. */
export type SunoCreateMode = MusicMode;
export type SunoControlSlider = 'style_weight' | 'weirdness_constraint' | 'audio_weight';
export type MusicOperation =
  | 'generate'
  | 'sound'
  | 'extend'
  | 'cover'
  | 'remaster'
  | 'upload'
  | 'upload_extend'
  | 'whole_song'
  | 'crop'
  | 'speed';
export type VocalGender = 'auto' | 'm' | 'f';
export type RemasterVariation = 'subtle' | 'normal' | 'high';

/**
 * Public track contract shared with the web app.
 *
 * `id` is always our local id. `upstreamTaskId` is the opaque MXAPI task id
 * used for polling, while `customId` is the Suno clip id used by follow-up
 * operations. Those identifiers are deliberately kept separate.
 */
export interface Track {
  id: string;
  groupId: string;
  takeIndex: number;
  title: string;
  mode: MusicMode;
  operation: MusicOperation;
  description: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  model: string;
  negativeTags: string;
  vocalGender: VocalGender;
  styleWeight: number;
  weirdness: number;
  /** MXAPI sound-only parameters; null for ordinary songs. */
  soundTempo?: number | null;
  soundKey?: string | null;
  soundLoop?: boolean | null;
  status: TrackStatus;
  /** Normalized to 0..1 regardless of the upstream representation. */
  progress: number;
  stage: TrackStage;
  eta: null;
  elapsed: number | null;
  error: string | null;
  /** Relative path below DATA_DIR/tracks, never an upstream URL. */
  file: string | null;
  /** Relative path below DATA_DIR/covers, never an upstream URL. */
  coverFile: string | null;
  /** Remote fallbacks are retained when local materialization fails. */
  audioUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  upstreamTaskId: string | null;
  customId: string | null;
  /** MXAPI's numeric task-row id. Required by video and WAV actions. */
  providerRecordId?: number | null;
  duration: number;
  format: 'mp3';
  pointsCost: number | null;
  pointsRefunded: boolean | null;
  upstreamStatus: string | null;
  createdAt: string;
  finishedAt: string | null;
  sourceTrackId?: string;
}

export interface GenerateRequest {
  mode: MusicMode;
  title: string;
  description: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  model: string;
  negativeTags: string;
  vocalGender: VocalGender;
  styleWeight: number;
  weirdness: number;
  /** User-visible number of results to keep from MXAPI's two-task response. */
  outputCount?: 1 | 2;
  isMaxMode?: boolean;
  augCreativity?: number;
}

/**
 * Advanced metadata sent to V4.5+ MXAPI generation models. The
 * `can_control_sliders` list is derived by the server from the actual wire
 * controls; it is not an independently editable browser setting.
 */
export interface SunoGenerateMetadata {
  create_mode: SunoCreateMode;
  vocal_gender?: Exclude<VocalGender, 'auto'>;
  control_sliders: Partial<Record<SunoControlSlider, number>>;
  can_control_sliders: SunoControlSlider[];
}

/** Normalized request persisted for POST /api/v2/music/sound. */
export interface SoundGenerateRequest extends GenerateRequest {
  kind: 'sound';
  soundTempo: number | null;
  soundKey: string;
  soundLoop: boolean | null;
}

export interface TrackActionRequest {
  action: 'extend' | 'cover' | 'remaster';
  continueAt?: number;
  variation: RemasterVariation;
  /** Optional generation overrides supported by MXAPI extend and cover. */
  model?: string;
  mode?: MusicMode;
  title?: string;
  description?: string;
  style?: string;
  lyrics?: string;
  instrumental?: boolean;
  negativeTags?: string;
  vocalGender?: VocalGender;
  styleWeight?: number;
  weirdness?: number;
  startSeconds?: number;
  endSeconds?: number;
  multiplier?: number;
  keepPitch?: boolean;
  audioWeight?: number;
}

export interface Template extends GenerateRequest {
  id: string;
  name: string;
  createdAt: string;
}

export const FORMATS = ['mp3'] as const;

export const SUNO_MODEL_IDS = [
  'chirp-hawk', 'chirp-hawk-wild', 'chirp-goose',
  'chirp-fenix',
  'chirp-crow',
  'chirp-bluejay',
  'chirp-auk',
  'chirp-auk-turbo',
  'chirp-v4',
  'chirp-v3-5',
  'chirp-v3-0',
] as const;

export type SunoModelId = (typeof SUNO_MODEL_IDS)[number];
