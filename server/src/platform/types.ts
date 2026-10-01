import type { GenerateRequest, MusicOperation, SoundGenerateRequest, Track } from '../types.js';

export interface PlatformUser {
  subject: string;
  issuer: string;
  modelCrossUserId: string | null;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
}

export interface AuthenticatedSession {
  tokenHash: string;
  user: PlatformUser;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface AccountSummary {
  balanceCredits: number;
  reservedCredits: number;
  displayBalance: string;
  unit: 'credits';
  subscription: null | {
    id: string;
    name: string;
    status: string;
    remainingCredits: number;
    renewsAt: string | null;
  };
  entitlements: Record<string, boolean | number | string | string[]>;
  walletUrl: string;
  ordersUrl: string;
  accountUrl: string;
  lastUsage?: { credits: number; operation: string; at: string } | null;
}

export interface MusicModelCapabilities {
  simple: boolean;
  custom: boolean;
  instrumental: boolean;
  negativeTags: boolean;
  vocalGender: boolean;
  maxTitle: number;
  maxDescription: number;
  maxStyle: number;
  maxLyrics: number;
  /** Provider actions supported by this adapter/model, including Track assets. */
  operations: Array<MusicOperation | TrackAssetAction>;
  styleWeight?: { min: number; max: number; default: number };
  weirdness?: { min: number; max: number; default: number };
}

export interface MusicModelProfile {
  id: string;
  displayName: string;
  provider: string;
  description: string;
  badge: string | null;
  enabled: boolean;
  sortOrder: number;
  estimatedCredits: number;
  priceVersion: string;
  capabilities: MusicModelCapabilities;
}

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

export interface MusicProject {
  id: string;
  workspaceId: string;
  ownerSubject: string;
  name: string;
  description: string;
  coverObjectKey: string | null;
  status: string;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationIntent {
  id: string;
  ownerSubject: string;
  projectId: string | null;
  operation: MusicOperation;
  sourceTrackId: string | null;
  referenceAudioId?: string | null;
  modelProfileId: string;
  status: string;
  idempotencyKey: string;
  request: GenerateRequest | SoundGenerateRequest;
  /** Exact operation-specific fields sent alongside the normalized request. */
  submissionOptions?: Record<string, unknown>;
  priceVersion: string | null;
  estimatedCredits: number;
  billingOperationId: string | null;
  billingReservationId: string | null;
  billingStatus: string;
  error: string | null;
  createdAt: string;
}

export interface PlatformTrack extends Track {
  generationId: string;
  projectId: string | null;
  /** Trusted upload variant for an imported Provider Track; null otherwise. */
  copyrightAudio: boolean | null;
  /** Whether its private reference object is still available for continuation. */
  referenceAudioAvailable: boolean;
  /** Trusted uploaded-audio duration for an imported Provider Track; null otherwise. */
  referenceAudioDurationSeconds: number | null;
  audioAssetReady: boolean;
  coverAssetReady: boolean;
  billingStatus: string;
  estimatedCredits: number;
  /** Owner-visible ModelCross batch settlement; never MXAPI merchant points_cost. */
  settledCredits: number | null;
}

export type ProviderSubmissionState = 'not_started' | 'started' | 'accepted' | 'rejected' | 'uncertain';
export type ProviderSubmissionClaim = 'claimed' | 'already_started' | 'accepted' | 'rejected' | 'uncertain';

export interface PollableProviderTask {
  id: string;
  generationId: string;
  trackId: string;
  ownerSubject: string;
  upstreamTaskId: string;
  attempts: number;
  terminalWaitStartedAt: Date | null;
  pollLeaseToken: string;
}

export interface ReferenceAudioUpload {
  id: string;
  ownerSubject: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number;
  checksumSha256: string;
  copyrightConfirmed: boolean;
  copyrightAudio: boolean;
  status: 'storing' | 'ready' | 'failed' | 'deleted';
  error: string | null;
  createdAt: string;
}

export type TrackAssetAction = 'aligned_lyrics' | 'video' | 'convert_wav' | 'download_mp3' | 'download_m4a';

export interface TrackAssetJob {
  id: string;
  trackId: string;
  ownerSubject: string;
  action: TrackAssetAction;
  operationCode: string;
  idempotencyKey: string;
  status: string;
  progress: number;
  upstreamTaskId: string | null;
  providerRecordId: number | null;
  result: Record<string, unknown> | null;
  assetKind: string | null;
  assetUrl: string | null;
  priceVersion: string | null;
  estimatedCredits: number;
  actualCredits: number | null;
  billingStatus: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface MusicOperationCatalogItem {
  action: string;
  operationCode: string;
  available: boolean;
  estimatedCredits: number | null;
  priceVersion: string | null;
  chargingEnabled: boolean;
  preview: boolean;
  executable?: boolean;
  previewExecutable?: boolean;
  localDirect?: boolean;
  reason?: string;
  variant?: 'standard' | 'copyright';
  outputCount?: number;
  parameters?: Record<string, unknown>;
}

export type AiAssistAction =
  | 'lyrics.generate'
  | 'lyrics.continue'
  | 'lyrics.rewrite'
  | 'lyrics.translate'
  | 'title.suggest'
  | 'style.suggest'
  | 'prompt.optimize';

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
  actualCredits?: number;
  outputMode: 'replacement' | 'full_document';
  fields: {
    title?: string;
    lyrics?: string;
    style?: string;
    negativeTags?: string;
    prompt?: string;
  };
  billing: {
    operationCode: 'lyrics_generate' | 'lyrics_rewrite' | 'prompt_optimize';
    priceVersion: string;
    estimatedCredits: number;
    actualCredits?: number;
    status: 'preview' | 'reserved' | 'captured' | 'released' | 'refunded' | 'disabled'
      | 'not_reserved' | 'reconcile_required' | 'manual_review_required';
  };
  title?: string;
  styleTags?: string[];
  negativeTags?: string[];
  createdAt: string;
}

export interface BillingQuote {
  operationId?: string;
  operationCode: string;
  priceVersion: string;
  estimatedCredits: number;
  currency: 'credits';
  partialSuccessPolicy: 'per_take' | 'full_pair';
}

export interface BillingReservation extends BillingQuote {
  operationId: string;
  reservationId: string;
  status: 'reserved' | 'disabled' | 'captured' | 'partially_captured' | 'released' | 'refunded' | 'reconcile_required';
  resourceId?: string;
  capturedCredits?: number;
  releasedCredits?: number;
  refundedCredits?: number;
}
