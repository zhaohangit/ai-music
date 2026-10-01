import type {
  AiAssistInput,
  AiAssistResult,
  AiAppliedField,
  AiModelProfile,
  AiOperationProfile,
  AssetActionInput,
  AssetJob,
  AudioUpload,
  BillingOrder,
  BillingSummary,
  GenerationInput,
  GenerationResult,
  Health,
  MusicModelProfile,
  MusicOperationProfile,
  MusicProject,
  MxapiCapabilityProfile,
  PlatformTask,
  ProviderPointsDiagnostics,
  ReferenceAudioActionInput,
  SessionSummary,
  Settings,
  Track,
  TrackActionInput,
} from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const AUTH_REQUIRED_EVENT = 'museflow:auth-required';
let authRequiredPending = false;

function shouldNotifyAuthRequired(url: string): boolean {
  return url !== '/api/session'
    && url !== '/api/me'
    && !url.startsWith('/api/auth/');
}

function notifyAuthRequired(url: string): void {
  if (authRequiredPending || typeof window === 'undefined') return;
  authRequiredPending = true;
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { url } }));
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`.trim();
    try {
      const body = await res.json() as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = text.slice(0, 240);
    }
    throw new ApiError(message || '请求失败', res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', ...init });
  if (response.status === 401 && shouldNotifyAuthRequired(url)) notifyAuthRequired(url);
  return json<T>(response);
};
const loginUrl = (returnTo = '/#/create') => `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

type RawAssetJob = Omit<AssetJob, 'status'> & { status: string };

/** Keep the UI on one lifecycle even though PostgreSQL exposes its more detailed worker states. */
export function normalizeAssetJob(job: RawAssetJob): AssetJob {
  const status = (() => {
    if (['draft', 'submitting', 'queued'].includes(job.status)) return 'queued' as const;
    if (job.status === 'running') return 'running' as const;
    if (job.status === 'processing') return 'processing' as const;
    if (job.status === 'succeeded' || job.status === 'completed') return 'completed' as const;
    return 'failed' as const;
  })();
  const unknownStatus = !['draft', 'submitting', 'queued', 'running', 'processing', 'succeeded', 'completed', 'failed'].includes(job.status);
  return {
    ...job,
    status,
    error: unknownStatus && !job.error ? `服务端返回未知资产作业状态：${job.status || '空值'}` : job.error,
  };
}

const normalizeTrackAssetJobs = (track: Track): Track => track.assetJobs
  ? { ...track, assetJobs: track.assetJobs.map((job) => normalizeAssetJob(job as RawAssetJob)) }
  : track;

/** MXAPI documents chirp-auk-turbo as the v4.5-all model; normalize stale catalogs at the UI edge. */
export function normalizeMusicModelProfile(model: MusicModelProfile): MusicModelProfile {
  if (model.id !== 'chirp-auk-turbo') return model;
  return {
    ...model,
    displayName: 'Suno V4.5 All',
  };
}

export function createIdempotencyKey(scope = 'web'): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}-${id}`;
}

const jsonInit = (
  method: string,
  body: unknown,
  idempotencyScope?: string,
  stableIdempotencyKey?: string,
): RequestInit => ({
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(stableIdempotencyKey
      ? { 'Idempotency-Key': stableIdempotencyKey }
      : idempotencyScope ? { 'Idempotency-Key': createIdempotencyKey(idempotencyScope) } : {}),
  },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>('/api/health'),
  library: (projectId?: string) => request<Track[]>(projectId ? `/api/library?projectId=${encodeURIComponent(projectId)}` : '/api/library').then((tracks) => tracks.map(normalizeTrackAssetJobs)),
  generate: (input: GenerationInput) => request<GenerationResult>('/api/generate', jsonInit('POST', input, 'kind' in input && input.kind === 'sound' ? 'sound-generate' : 'music-generate')),
  deleteTrack: (id: string) => request<{ ok: true }>(`/api/tracks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  trackAction: (id: string, input: TrackActionInput) =>
    request<GenerationResult>(`/api/tracks/${encodeURIComponent(id)}/actions`, jsonInit('POST', input, `music-${input.action}`)),
  uploadAudio: (file: File, input: { copyrightConfirmed: true; copyrightAudio: boolean }) => {
    const body = new FormData();
    body.append('audio', file, file.name);
    body.append('copyrightConfirmed', String(input.copyrightConfirmed));
    body.append('copyrightAudio', String(input.copyrightAudio));
    return request<AudioUpload>('/api/uploads/audio', {
      method: 'POST',
      headers: { 'Idempotency-Key': createIdempotencyKey('audio-upload') },
      body,
    });
  },
  uploadAudioAction: (uploadId: string, input: ReferenceAudioActionInput) =>
    request<GenerationResult>(
      `/api/uploads/${encodeURIComponent(uploadId)}/actions`,
      // The copyright/billing variant is persisted with the owner-scoped upload. The browser
      // must not be able to switch it after the multipart attestation has been accepted.
      jsonInit('POST', input, input.action === 'upload' ? 'music-upload' : 'music-upload-extend'),
    ),
  referenceAudios: (limit = 100) => request<AudioUpload[]>(`/api/uploads?limit=${encodeURIComponent(String(limit))}`),
  referenceAudio: (id: string) => request<AudioUpload>(`/api/uploads/${encodeURIComponent(id)}`),
  deleteReferenceAudio: (id: string) => request<{ ok: true }>(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assetAction: (trackId: string, input: AssetActionInput) =>
    request<RawAssetJob>(
      `/api/tracks/${encodeURIComponent(trackId)}/assets`,
      jsonInit('POST', input, `asset-${input.action}`),
    ).then(normalizeAssetJob),
  assetJobs: (trackId: string) => request<RawAssetJob[]>(`/api/tracks/${encodeURIComponent(trackId)}/assets/jobs`).then((jobs) => jobs.map(normalizeAssetJob)),
  assetJob: (jobId: string) => request<RawAssetJob>(`/api/asset-jobs/${encodeURIComponent(jobId)}`).then(normalizeAssetJob),

  session: () => request<SessionSummary>('/api/session'),
  me: () => request<SessionSummary>('/api/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  loginUrl,
  replaceWithLogin: (returnTo = '/#/create') => window.location.replace(loginUrl(returnTo)),
  onAuthRequired: (listener: () => void) => {
    window.addEventListener(AUTH_REQUIRED_EVENT, listener);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
  },
  resetAuthRequired: () => { authRequiredPending = false; },
  models: () => request<MusicModelProfile[]>('/api/catalog/music-models')
    .then((models) => models.map(normalizeMusicModelProfile)),
  musicOperations: () => request<MusicOperationProfile[]>('/api/catalog/music-operations'),
  aiModels: () => request<AiModelProfile[]>('/api/catalog/ai-models'),
  aiOperations: () => request<AiOperationProfile[]>('/api/catalog/ai-operations'),
  mxapiCapabilities: () => request<MxapiCapabilityProfile[]>('/api/catalog/mxapi-capabilities'),
  projects: () => request<MusicProject[]>('/api/projects'),
  createProject: (input: { title: string; description?: string }) =>
    request<MusicProject>('/api/projects', jsonInit('POST', input, 'project-create')),
  archiveProject: (id: string) => request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  tasks: (options: { id?: string; ids?: string; page?: number; size?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.id?.trim()) params.set('id', options.id.trim());
    if (options.ids?.trim()) params.set('ids', options.ids.trim());
    if (options.page !== undefined) params.set('page', String(options.page));
    if (options.size !== undefined) params.set('size', String(options.size));
    const query = params.toString();
    return request<PlatformTask[]>(`/api/tasks${query ? `?${query}` : ''}`);
  },
  billingSummary: (refresh = false) => request<BillingSummary>(`/api/billing/summary${refresh ? '?refresh=1' : ''}`),
  billingOrders: () => request<BillingOrder[]>('/api/billing/orders'),
  aiAssist: (input: AiAssistInput, idempotencyKey?: string) => request<AiAssistResult>(
    '/api/ai/assist',
    jsonInit('POST', input, `ai-${input.action}`, idempotencyKey),
  ),
  acceptAiAssist: (id: string, input: { projectId?: string; kind?: 'lyrics' | 'prompt' | 'style' | 'title'; title?: string; appliedFields?: AiAppliedField[] }) =>
    request<{ documentId: string; revisionId: string }>(`/api/ai/assist/${encodeURIComponent(id)}/accept`, jsonInit('POST', input)),

  settings: () => request<Settings>('/api/settings'),
  /** Administrator-only deployment merchant diagnostics; distinct from the user's wallet. */
  providerPoints: (page = 1, pageSize = 20) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<ProviderPointsDiagnostics>(`/api/admin/provider/points?${params.toString()}`);
  },

  eventsUrl: '/api/events',

  audioUrl: (id: string) => `/api/tracks/${encodeURIComponent(id)}/audio`,
  downloadUrl: (id: string) => `/api/tracks/${encodeURIComponent(id)}/audio?download=1`,
  coverUrl: (id: string) => `/api/tracks/${encodeURIComponent(id)}/cover`,
  videoUrl: (id: string, download = false) => `/api/tracks/${encodeURIComponent(id)}/video${download ? '?download=1' : ''}`,
  wavUrl: (id: string, download = true) => `/api/tracks/${encodeURIComponent(id)}/wav${download ? '?download=1' : ''}`,
  alignedLyricsUrl: (id: string, download = false) => `/api/tracks/${encodeURIComponent(id)}/aligned-lyrics${download ? '?download=1' : ''}`,
};

export function trackAudioUrl(track: Track): string {
  return track.file || track.audioUrl ? api.audioUrl(track.id) : '';
}

export function trackCoverUrl(track: Track): string | null {
  return track.coverFile || track.imageUrl ? api.coverUrl(track.id) : null;
}

export { request as apiRequest };
