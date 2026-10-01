import { apiRequest, createIdempotencyKey } from "./api";
export type {
  MvProject,
  MvSettings,
  MvShot,
  MvCatalog,
  MvReference,
  MvQuote,
  MvStem,
  VideoModel,
} from "../../server/src/platform/mv/types";
import type {
  MvProject,
  MvSettings,
  MvCatalog,
  MvReference,
  MvQuote,
  MvStem,
} from "../../server/src/platform/mv/types";
const body = (method: string, data: unknown, key?: string) => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {}),
  },
  body: JSON.stringify(data),
});
export const mvApi = {
  counts: () =>
    apiRequest<{ active: number; attention: number }>("/api/mv/counts"),
  catalog: () => apiRequest<MvCatalog>("/api/mv/catalog"),
  list: (archived = false) =>
    apiRequest<MvProject[]>(`/api/mv/projects${archived ? "?archived=1" : ""}`),
  get: (id: string) =>
    apiRequest<MvProject>(`/api/mv/projects/${encodeURIComponent(id)}`),
  create: (settings: MvSettings, key = createIdempotencyKey("mv")) =>
    apiRequest<MvProject>("/api/mv/projects", body("POST", settings, key)),
  edit: (project: MvProject) =>
    apiRequest<MvProject>(
      `/api/mv/projects/${project.id}`,
      body("PATCH", {
        revision: project.revision,
        shots: project.shots.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          model: s.model,
          duration: s.duration,
          sourceOffset: s.sourceOffset ?? 0,
        })),
        srt: project.settings.srt,
        subtitles: project.settings.subtitles,
        subtitleStyle: project.settings.subtitleStyle,
        subtitleOffset: project.settings.subtitleOffset ?? 0,
        budgetPoints: project.settings.budgetPoints ?? null,
        audioGainDb: project.settings.audioGainDb,
        vocalStemId: project.settings.vocalStemId ?? null,
        instrumentalStemId: project.settings.instrumentalStemId ?? null,
        vocalGainDb: project.settings.vocalGainDb ?? 0,
        instrumentalGainDb: project.settings.instrumentalGainDb ?? 0,
      }),
    ),
  generate: (project: MvProject, shotId?: string, regenerate = false) =>
    apiRequest<MvProject>(
      `/api/mv/projects/${project.id}/generate`,
      body("POST", { revision: project.revision, shotId, regenerate }),
    ),
  publication:(id:string)=>apiRequest<{expectedChecksum:string|null;hasExistingVideo:boolean;isCurrent:boolean}>(`/api/mv/projects/${id}/publication`),
  publish:(p:MvProject,expectedChecksum:string|null)=>apiRequest<MvProject>(`/api/mv/projects/${p.id}/publish`,body('POST',{revision:p.revision,expectedChecksum})),
  render: (project: MvProject) =>
    apiRequest<MvProject>(
      `/api/mv/projects/${project.id}/render`,
      body("POST", { revision: project.revision }),
    ),
  quote: (id: string, shotId?: string) =>
    apiRequest<MvQuote>(
      `/api/mv/projects/${id}/quote${shotId ? `?shotId=${encodeURIComponent(shotId)}` : ""}`,
    ),
  shotAction: (
    p: MvProject,
    input: { action: string; shotId: string; at?: number; versionId?: string },
  ) =>
    apiRequest<MvProject>(
      `/api/mv/projects/${p.id}/shot-actions`,
      body("POST", { ...input, revision: p.revision }),
    ),
  pause: (id: string) =>
    apiRequest<MvProject>(`/api/mv/projects/${id}/pause`, body("POST", {})),
  reconcile: (p: MvProject, shotId: string, taskId?: string) =>
    apiRequest<MvProject>(
      `/api/mv/projects/${p.id}/reconcile`,
      body("POST", { revision: p.revision, shotId, taskId }),
    ),
  archive: (p: MvProject, archived: boolean) =>
    apiRequest<{ ok: true }>(
      `/api/mv/projects/${p.id}/archive`,
      body("POST", { revision: p.revision, archived }),
    ),
  remove: (p: MvProject) =>
    apiRequest<{ ok: true }>(
      `/api/mv/projects/${p.id}?revision=${p.revision}`,
      { method: "DELETE" },
    ),
  references: () => apiRequest<MvReference[]>("/api/mv/references"),
  removeReference: (id: string) =>
    apiRequest<{ ok: true }>(`/api/mv/references/${id}`, { method: "DELETE" }),
  stems: (trackId: string) =>
    apiRequest<MvStem[]>(`/api/mv/tracks/${trackId}/stems`),
  uploadStem: (
    trackId: string,
    kind: "vocals" | "instrumental",
    file: File,
  ) => {
    const data = new FormData();
    data.append("kind", kind);
    data.append("audio", file);
    return apiRequest<MvStem>(`/api/mv/tracks/${trackId}/stems`, {
      method: "POST",
      body: data,
    });
  },
  previewMix: (p: MvProject, start = 0) =>
    apiRequest<MvProject>(
      `/api/mv/projects/${p.id}/mix-preview`,
      body("POST", { revision: p.revision, start }),
    ),
  upload: (file: File) => {
    const data = new FormData();
    data.append("image", file);
    return apiRequest<MvReference>("/api/mv/references", {
      method: "POST",
      body: data,
    });
  },
};
