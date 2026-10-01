export type TrackStatus = 'queued' | 'running' | 'done' | 'error';
export type TrackStage = 'queued' | 'generating' | 'downloading' | 'done' | 'error';
export type GenerateMode = 'simple' | 'custom';
/** MXAPI metadata.create_mode values; the UI mode toggle maps directly to them. */
export type SunoCreateMode = GenerateMode;
export type SunoControlSlider = 'style_weight' | 'weirdness_constraint' | 'audio_weight';
export type TrackOperation =
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
export type AssetOperation = 'aligned_lyrics' | 'video' | 'convert_wav' | 'download_mp3' | 'download_m4a';
export type SunoOperation = TrackOperation | AssetOperation | 'upload_single' | 'upload_copyright_single';
export type VocalGender = 'auto' | 'm' | 'f';

export type MxapiModel =
  | "chirp-hawk"
  | "chirp-hawk-wild"
  | "chirp-goose"
  | 'chirp-v3-0'
  | 'chirp-v3-5'
  | 'chirp-v4'
  | 'chirp-auk'
  | 'chirp-bluejay'
  | 'chirp-auk-turbo'
  | 'chirp-crow'
  | 'chirp-fenix';

export interface Track {
  id: string;
  groupId: string;
  projectId?: string | null;
  takeIndex: number;
  title: string;
  mode: GenerateMode;
  operation: TrackOperation;
  description: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  model: MxapiModel | string;
  negativeTags: string;
  vocalGender: VocalGender;
  /** Normalized to 0..1 by the server. */
  styleWeight: number;
  /** Normalized to 0..1 by the server. */
  weirdness: number;
  /** MXAPI /music/sound optional BPM. Null means the Provider chose its own tempo. */
  soundTempo?: number | null;
  /** MXAPI /music/sound free-form musical key. */
  soundKey?: string | null;
  /** Whether this sound effect was requested as a seamless loop. */
  soundLoop?: boolean | null;
  status: TrackStatus;
  /** Normalized to 0..1 by the server. */
  progress: number;
  stage: TrackStage;
  eta: number | null;
  elapsed: number | null;
  error: string | null;
  file: string | null;
  coverFile: string | null;
  /** Optional same-origin playback URL returned by the server. */
  audioUrl: string | null;
  /** Provider image URL used until the cover has been saved locally. */
  imageUrl: string | null;
  videoUrl: string | null;
  upstreamTaskId: string | null;
  upstreamStatus: string | null;
  customId: string | null;
  /** Server-owned provider task identifier. Never supplied by the browser. */
  providerRecordId?: string | number | null;
  /** Server-owned variant for imported reference-audio Tracks; never inferred by the browser. */
  copyrightAudio?: boolean | null;
  /** True only while the owner-scoped persisted reference upload is still ready. */
  referenceAudioAvailable?: boolean;
  /** Server-probed duration of that persisted upload, used for upload_extend bounds. */
  referenceAudioDurationSeconds?: number | null;
  /** Optional server-persisted asset hints. Downloads still use same-origin API routes. */
  wavUrl?: string | null;
  alignedLyricsUrl?: string | null;
  assetJobs?: AssetJob[];
  duration: number;
  format: 'mp3' | 'wav';
  /** Provider merchant-cost diagnostics. Never present these as the user's wallet charge. */
  pointsCost: number | null;
  pointsRefunded: boolean | null;
  /** Owner-scoped ModelCross batch billing projection returned by MuseFlow. */
  billingStatus?: string | null;
  estimatedCredits?: number | null;
  settledCredits?: number | null;
  createdAt: string;
  finishedAt: string | null;
  sourceTrackId?: string;
}

export interface Health {
  provider: string;
  configured: boolean;
  upstreamReachable: boolean;
  ready: boolean;
  active: number;
  queued: number;
  balance: number | null;
  models: string[];
  billingLive?: boolean;
  providerDirectBilling?: boolean;
  aiLive?: boolean;
  aiLocalLive?: boolean;
  error?: string;
}

export interface GenerateInput {
  projectId?: string | null;
  mode: GenerateMode;
  title: string;
  description: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  /** Server-issued model profile id; legacy known ids remain described by MxapiModel. */
  model: MxapiModel | string;
  negativeTags: string;
  vocalGender: VocalGender;
  styleWeight: number;
  weirdness: number;
  /** MXAPI returns two tasks per request; MuseFlow lets the user keep one or both. */
  outputCount?: 1 | 2;
  isMaxMode?: boolean;
  augCreativity?: number;
}

/** Exact browser contract for POST /api/v2/music/sound via MuseFlow's generation endpoint. */
export interface SoundGenerateInput {
  kind: 'sound';
  projectId?: string | null;
  title: string;
  tags: string;
  /** MXAPI currently documents sound generation for Suno V5 and V5.5 only. */
  model: 'chirp-crow' | 'chirp-fenix';
  /** Optional Provider BPM; MuseFlow deliberately does not invent a range or default. */
  tempo?: number;
  /** Optional free-form key; MuseFlow deliberately does not invent an enum or default. */
  key?: string;
  /** MuseFlow recommends true by default, but the Provider field remains user-controlled. */
  loop?: boolean;
}

export type GenerationInput = GenerateInput | SoundGenerateInput;

export interface TrackActionInput {
  action: Exclude<TrackOperation, 'generate' | 'sound' | 'upload'>;
  projectId?: string | null;
  continueAt?: number;
  variation?: 'subtle' | 'normal' | 'high';
  startSeconds?: number;
  endSeconds?: number;
  multiplier?: number;
  keepPitch?: boolean;
  title?: string;
  audioWeight?: number;
  model?: MxapiModel | string;
  mode?: GenerateMode;
  description?: string;
  style?: string;
  lyrics?: string;
  instrumental?: boolean;
  negativeTags?: string;
  vocalGender?: VocalGender;
  styleWeight?: number;
  weirdness?: number;
}

export interface AssetActionInput {
  action: AssetOperation;
  lyrics?: string;
}

export type AssetJobStatus = 'queued' | 'running' | 'processing' | 'completed' | 'failed';

export interface AssetJob {
  id: string;
  trackId: string;
  action: AssetOperation;
  status: AssetJobStatus;
  /** Normalized to 0..1 by the server. */
  progress: number;
  billingStatus?: string | null;
  assetUrl?: string | null;
  result?: unknown;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface AudioUpload {
  id: string;
  status: 'storing' | 'ready' | 'failed' | 'deleted';
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  /** Server-probed and persisted duration; browser metadata is only an early UX check. */
  durationSeconds: number;
  checksumSha256: string;
  createdAt: string;
  copyrightConfirmed: boolean;
  copyrightAudio: boolean;
}

export interface ReferenceAudioGenerationInput extends GenerateInput {
  action: 'upload_extend';
  continueAt: number;
  audioWeight?: number;
}

/** Standalone Provider import. Copyright variant is fixed by the persisted multipart upload. */
export interface ReferenceAudioImportInput {
  action: 'upload';
  projectId?: string | null;
  model: MxapiModel | string;
  title?: string;
}

export type ReferenceAudioActionInput = ReferenceAudioImportInput | ReferenceAudioGenerationInput;

/**
 * The platform can accept a generation before provider tracks exist. 202 responses use this
 * shape; 200/201 responses remain a Track array for replay/backwards compatibility.
 */
export interface PendingGeneration {
  generationId: string;
  status: string;
  tracks: Track[];
}

export type GenerationResult = Track[] | PendingGeneration;

export function tracksFromGeneration(result: GenerationResult): Track[] {
  return Array.isArray(result) ? result : result.tracks;
}

export function isPendingGeneration(result: GenerationResult): result is PendingGeneration {
  return !Array.isArray(result);
}

export type SettingsSource = 'env' | 'settings' | 'default' | 'none';

export interface Settings {
  apiBaseUrl: string;
  apiKeySet: boolean;
  source: { apiBaseUrl: SettingsSource; apiKey: SettingsSource };
  locked: { apiBaseUrl: boolean; apiKey: boolean };
  /** Platform-managed deployments never expose provider credentials to this UI. */
  platformManaged?: boolean;
  /** Provider credentials and routing are owned by the MuseFlow deployment, not ModelCross. */
  managedBy?: 'deployment' | string;
  providerConfigured?: boolean;
  /** Optional ModelCross admin console URL, returned only for authorized administrators. */
  adminUrl?: string | null;
}

/** Read-only deployment-side MXAPI merchant points diagnostics. This is never the user's wallet. */
export interface ProviderPointsLogs {
  list: Record<string, unknown>[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ProviderPointsDiagnostics {
  balance: number | null;
  logs: ProviderPointsLogs;
}

export interface SettingsTestResult {
  ok: boolean;
  apiBaseUrl: string;
  provider?: string;
  balance?: number | null;
  error?: string;
}

export type ThemeMode = 'dark' | 'light' | 'system';

export interface UserProfile {
  id: string;
  subject: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: 'user' | 'admin';
}

export interface SubscriptionSummary {
  name: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  renewsAt?: string | null;
  includedCredits?: number | null;
}

export interface AccountSummary {
  balance: number;
  availableBalance: number;
  reservedBalance: number;
  currency: 'credits';
  subscription: SubscriptionSummary;
  topUpUrl?: string | null;
  ordersUrl?: string | null;
  accountUrl?: string | null;
}

export interface SessionSummary {
  authenticated: boolean;
  user: UserProfile | null;
  account: AccountSummary | null;
  /** True only when the platform API is unavailable and the UI uses preview data. */
  demo?: boolean;
}

export interface CapabilityRange {
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface OperationEnumOption<T extends string | number = string | number> {
  value: T;
  label?: string;
}

export interface OperationNumberParameter extends Partial<CapabilityRange> {
  type?: 'number' | string;
  required?: boolean;
  wireName?: string;
  /** JSON-schema-style enum used by the production operation catalog. */
  enum?: number[];
  values?: number[];
  options?: OperationEnumOption<number>[];
  /** The lower bound is another request field (for example crop end > start). */
  exclusiveMinimumField?: string;
  /** The upper bound is resolved from owned server data (for example track.duration). */
  maximumField?: string;
  /** Required distance from the field referenced by exclusiveMinimumField. */
  minimumDelta?: number;
}

export interface OperationBooleanParameter {
  type?: 'boolean' | string;
  default?: boolean;
  required?: boolean;
  wireName?: string;
}

export interface OperationStringParameter {
  type?: 'string' | string;
  default?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  wireName?: string;
}

export interface OperationParameterCatalog {
  acceptedMimeTypes?: string[];
  acceptedExtensions?: string[];
  maxBytes?: number;
  maxFileBytes?: number;
  maxDurationSeconds?: number;
  continueAt?: OperationNumberParameter;
  audioWeight?: OperationNumberParameter;
  startSeconds?: OperationNumberParameter;
  endSeconds?: OperationNumberParameter;
  multiplier?: OperationNumberParameter;
  speedMultipliers?: number[];
  keepPitch?: boolean | OperationBooleanParameter;
  title?: OperationStringParameter;
  tags?: OperationStringParameter;
  model?: OperationStringParameter;
  tempo?: OperationNumberParameter;
  key?: OperationStringParameter;
  loop?: boolean | OperationBooleanParameter;
  lyrics?: OperationStringParameter;
  /** Legacy flattened form retained for older platform catalog responses. */
  maxTitleLength?: number;
  [key: string]: unknown;
}

/**
 * Server-owned operation availability and quote. A missing quote or version is deliberately
 * represented as null so the UI can fail closed instead of assuming a free operation.
 */
export interface MusicOperationProfile {
  action: SunoOperation | string;
  operationCode: string;
  available: boolean;
  catalogAvailable?: boolean;
  estimatedCredits: number | null;
  priceVersion: string | null;
  chargingEnabled: boolean;
  preview: boolean;
  /** Explicit server decision that this operation may be submitted in the current environment. */
  executable?: boolean;
  /** Development/fake-provider only: allows execution while billing is in quote-preview mode. */
  previewExecutable?: boolean;
  billingMode?: "provider-direct" | "modelcross" | "preview";
  reason?: string | null;
  variant?: 'standard' | 'copyright' | string;
  outputCount?: number;
  modelIds?: string[];
  parameters?: OperationParameterCatalog | null;
  constraints?: OperationParameterCatalog | null;
}

export interface MusicModelCapabilities {
  simple: boolean;
  custom: boolean;
  instrumental: boolean;
  negativeTags: boolean;
  vocalGender: boolean;
  styleWeight?: CapabilityRange | null;
  weirdness?: CapabilityRange | null;
  operations: readonly SunoOperation[];
  maxTitleLength: number;
  maxDescriptionLength: number;
  maxStyleLength: number;
  maxLyricsLength: number;
  maxNegativeTagsLength: number;
}

export interface MusicModelProfile {
  id: string;
  displayName: string;
  provider: string;
  description: string;
  badge?: string | null;
  enabled: boolean;
  estimatedCredits: {
    generatePair: number;
    extendPair: number;
    coverPair: number;
    remasterPair: number;
  };
  capabilities: MusicModelCapabilities;
}

export interface MusicProject {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string | null;
  trackCount: number;
  status: 'active' | 'archived';
  updatedAt: string;
}

export type PlatformTaskStatus =
  | 'queued'
  | 'reserving'
  | 'submitting'
  | 'generating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunding'
  | 'refunded'
  | 'reconcile_required';

export interface PlatformTask {
  id: string;
  batchId: string;
  title: string;
  operation: TrackOperation;
  model: string;
  status: PlatformTaskStatus;
  progress: number;
  estimatedCredits: number;
  chargedCredits?: number | null;
  billingStatus?: string | null;
  refundCredits?: number | null;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  /** Opaque MXAPI task id; shown only inside the owner-scoped task center. */
  upstreamTaskId?: string | null;
  /** Numeric MXAPI record id used by video/WAV follow-up operations. */
  providerRecordId?: number | null;
  /** Exact operation-specific fields captured at submission time. */
  submissionOptions?: Record<string, unknown>;
}

export interface BillingSummary {
  account: AccountSummary;
  monthSpent: number;
  monthGeneratedTracks: number;
  pendingReservations: number;
}

export interface BillingOrder {
  id: string;
  kind: 'topup' | 'subscription' | 'refund' | 'usage';
  description: string;
  amount: number;
  amountMinor?: number | null;
  currency?: string | null;
  credits: number | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  createdAt: string;
}

export type AiAssistAction =
  | 'lyrics.generate'
  | 'lyrics.continue'
  | 'lyrics.rewrite'
  | 'lyrics.translate'
  | 'title.suggest'
  | 'style.suggest'
  | 'prompt.optimize';

export type AiAppliedField = 'title' | 'lyrics' | 'style' | 'negativeTags' | 'prompt';

export interface AiModelProfile {
  id: string;
  displayName: string;
  provider: 'OpenAI' | 'Google' | 'ModelCross';
  description: string;
  badge: string | null;
  enabled: boolean;
  reason: string | null;
  defaultForLyrics: boolean;
  defaultForFastTasks: boolean;
}

/**
 * Account-scoped AI authorization and quote returned by MuseFlow. The browser must match by
 * exact action: several actions intentionally share one ModelCross operation code, but that
 * does not make their authorization interchangeable.
 */
export interface AiOperationProfile {
  action: AiAssistAction;
  operationCode: string;
  model: string;
  modelAuthorized: boolean;
  available: boolean;
  catalogAvailable: boolean;
  estimatedCredits: number | null;
  priceVersion: string | null;
  chargingEnabled: boolean;
  executable: boolean;
  previewExecutable: boolean;
  localDirect?: boolean;
  parameters?: Record<string, unknown> | null;
  reason?: string | null;
}

export interface MxapiCapabilityField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  options?: string[];
}

export interface MxapiCapabilityProfile {
  id: string;
  category: 'NANO' | 'GPT' | '即梦' | 'Seedance视频' | 'Grok' | 'Veo' | '商品套图' | '系统通用';
  title: string;
  description: string;
  method: 'GET' | 'POST';
  path: string;
  identifier: string | null;
  operationCode: string | null;
  pricingKind: 'fixed' | 'dynamic' | 'free' | 'deprecated';
  providerPoints: number | null;
  estimatedCredits: number | null;
  fallbackCredits: number | null;
  priceVersion: string | null;
  catalogAvailable: boolean;
  chargingEnabled: boolean;
  executable: boolean;
  implemented: boolean;
  uiRoute?: "mv";
  markupMultiplier: number;
  fields: MxapiCapabilityField[];
  result: string;
  note?: string;
  reason?: string;
}

export interface AiAssistInput {
  action: AiAssistAction;
  input: string;
  aiModelId?: string;
  targetMusicModelId?: string;
  context?: {
    title?: string;
    style?: string;
    language?: string;
    targetLanguage?: string;
    mood?: string;
    projectId?: string;
  };
  options?: {
    length?: 'short' | 'medium' | 'long';
    structure?: 'verse_chorus' | 'verse_prechorus_chorus_bridge' | 'freeform';
    rewriteStrength?: 'light' | 'balanced' | 'strong';
    preserveSections?: boolean;
    preserveRhyme?: boolean;
  };
}

export interface AiAssistResult {
  id: string;
  action: AiAssistAction;
  model?: string;
  original: string;
  suggestion: string;
  summary: string;
  estimatedCredits: number;
  actualCredits?: number | null;
  outputMode?: 'replacement' | 'full_document';
  fields?: {
    title?: string;
    lyrics?: string;
    style?: string;
    negativeTags?: string;
    prompt?: string;
  };
  billing?: {
    operationCode: string;
    priceVersion: string;
    estimatedCredits: number;
    actualCredits?: number;
    status: 'preview' | 'reserved' | 'captured' | 'released' | 'refunded' | 'disabled'
      | 'not_reserved' | 'reconcile_required' | 'manual_review_required';
  };
  title?: string;
  styleTags?: string[];
  negativeTags?: string[];
  /** Browser-selected fields recorded when the user accepts a revision. */
  appliedFields?: AiAppliedField[];
  createdAt: string;
}

export const isInflight = (track: Track) => track.status === 'queued' || track.status === 'running';
export const isPlayable = (track: Track) => track.status === 'done' && Boolean(track.file || track.audioUrl);
export const isAssetJobInflight = (job: AssetJob) => ['queued', 'running', 'processing'].includes(job.status);

export const MODEL_OPTIONS: ReadonlyArray<{ value: MxapiModel; label: string; hint: string }> = [
  { value: 'chirp-hawk', label: 'Suno V6', hint: '当前标准模型' },
  { value: 'chirp-hawk-wild', label: 'Suno V6 Wild', hint: '自由变奏' },
  { value: 'chirp-goose', label: 'Suno V6 Mini', hint: '轻量创作' },
  { value: 'chirp-fenix', label: 'Suno V5.5', hint: '兼容入口，上游歌曲生成会重定向到 V6' },
  { value: 'chirp-crow', label: 'Suno V5', hint: '高品质完整歌曲' },
  { value: 'chirp-bluejay', label: 'Suno V4.5+', hint: '稳定、均衡，推荐日常创作' },
  { value: 'chirp-auk-turbo', label: 'Suno V4.5 All', hint: 'V4.5 全能力兼容模型' },
  { value: 'chirp-auk', label: 'Suno V4.5', hint: '复杂提示词理解更好' },
  { value: 'chirp-v4', label: 'Suno V4', hint: '清晰人声与兼容模式' },
  { value: 'chirp-v3-5', label: 'Suno V3.5', hint: '经典模型' },
  { value: 'chirp-v3-0', label: 'Suno V3', hint: '旧版兼容' },
];

export function modelLabel(model: string): string {
  return MODEL_OPTIONS.find((item) => item.value === model)?.label ?? model;
}

export function operationLabel(operation: SunoOperation): string {
  return ({
    generate: '原创',
    sound: '音效生成',
    extend: '续写',
    cover: '翻唱',
    remaster: '重制',
    upload: '参考音频',
    upload_extend: '参考音频续作',
    whole_song: '生成完整歌曲',
    crop: '裁剪',
    speed: '变速',
    aligned_lyrics: '逐字歌词',
    video: '音乐视频',
    download_mp3: "MP3 下载",
    download_m4a: "M4A 下载",
    convert_wav: 'WAV 转换',
    upload_single: '参考音频接入',
    upload_copyright_single: '版权音频接入',
  } as const)[operation] ?? operation;
}
