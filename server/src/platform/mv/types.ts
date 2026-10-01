export type MvStatus =
  | "draft"
  | "generating"
  | "assembling"
  | "completed"
  | "failed"
  | "paused";
export type ShotStatus =
  | "draft"
  | "queued"
  | "submitting"
  | "running"
  | "ready"
  | "failed"
  | "uncertain";
export interface VideoModel {
  id: string;
  name: string;
  family: "seedance" | "jimeng" | "grok" | "veo";
  endpoint: string;
  queryEndpoint: string;
  wireModel?: string;
  resolutions: string[];
  ratios: string[];
  minSeconds: number;
  maxSeconds: number;
  durations?: number[];
  referenceImage: boolean;
  referenceAudio: boolean;
  description: string;
  verified?: boolean;
  availability?: "configured" | "unverified" | "unavailable";
  availabilityReason?: string;
}
export interface MvSettings {
  trackId: string;
  title: string;
  concept: string;
  model: string;
  resolution: string;
  ratio: string;
  duration: number;
  shotSeconds: number;
  referenceId: string | null;
  performance: "story" | "singing" | "audio";
  subtitles: boolean;
  subtitleStyle: "clean" | "cinema";
  srt: string;
  audioGainDb: number;
  vocalStemId?: string | null;
  instrumentalStemId?: string | null;
  vocalGainDb?: number;
  instrumentalGainDb?: number;
  budgetPoints?: number | null;
  subtitleOffset?: number;
}
export interface MvShot {
  id: string;
  index: number;
  start: number;
  duration: number;
  generationSeconds: number;
  model: string;
  prompt: string;
  status: ShotStatus;
  providerTaskId: string | null;
  error: string | null;
  objectKey?: string;
  videoUrl?: string;
  providerUrl?: string;
  attempt?: number;
  versions?: MvShotVersion[];
  selectedVersionId?: string;
  sourceOffset?: number;
  sourceDuration?: number;
  estimatedPoints?: number | null;
  providerPoints?: number | null;
  accountedPoints?: number;
  pointsRefunded?: boolean;
  submittedAt?: string;
  pollFailures?: number;
  quality?: { freezeSeconds: number; warnings: string[]; reviewed?: boolean };
}
export interface MvProject {
  id: string;
  owner: string;
  settings: MvSettings;
  shots: MvShot[];
  status: MvStatus;
  revision: number;
  error: string | null;
  progress: number;
  outputKey?: string | null;
  subtitleKey?: string | null;
  alignmentJobId?: string | null;
  createdAt: string;
  updatedAt: string;
  videoUrl?: string | null;
  contentRevision?: number;
  outputRevision?: number;
  renderVersions?: MvRenderVersion[];
  archived?: boolean;
  pauseRequested?: boolean;
  retryAfter?: string | null;
  needsRender?: boolean;
  reservedPoints?: number;
  mixPreviewKey?: string | null;
  mixPreviewUrl?: string | null;
  published?: boolean;
  publishedAt?: string;
  publishedRevision?: number;
  publishedVideoKey?: string;
}
export interface MvCatalog {
  models: VideoModel[];
  canGenerate: boolean;
  reason: string | null;
  rendererReady: boolean;
  audioReferenceReady: boolean;
  billingMode: "provider-direct" | "unavailable";
  canLinkUncertain?: boolean;
  providerCheckedAt?: string;
  providerAuthenticated?: boolean;
  pricingNote?: string;
}
export interface MvReference {
  id: string;
  name: string;
  url: string;
}

export interface MvShotVersion {
  quality?: MvShot["quality"];
  id: string;
  attempt: number;
  objectKey?: string;
  videoUrl?: string;
  model: string;
  prompt: string;
  duration: number;
  createdAt: string;
  providerTaskId: string | null;
  estimatedPoints?: number | null;
  providerPoints?: number | null;
}
export interface MvRenderVersion {
  id: string;
  objectKey?: string;
  subtitleKey?: string;
  videoUrl?: string;
  subtitleUrl?: string;
  contentRevision: number;
  createdAt: string;
  duration: number;
}
export interface MvStem {
  id: string;
  kind: "vocals" | "instrumental";
  name: string;
  duration: number;
  url: string;
}
export interface MvQuote {
  estimatedPoints: number | null;
  remainingPoints: number | null;
  reservedPoints: number;
  shots: Array<{ id: string; points: number | null }>;
  source: string;
  note: string;
}
