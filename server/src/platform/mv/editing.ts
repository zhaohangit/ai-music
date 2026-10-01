import { randomUUID } from "node:crypto";
import { ValidationError } from "../../errors.js";
import { ResourceStateConflictError } from "../repository.js";
import { videoModel } from "./catalog.js";
import type { MvProject, MvShot, MvShotVersion } from "./types.js";

/** Upgrade saved projects without rewriting source media or losing existing cuts. */
export function normalizeProject<T extends MvProject>(p: T): T {
  p.contentRevision ??= 1;
  p.renderVersions ??= [];
  if (p.outputKey) {
    p.outputRevision ??= p.contentRevision;
    if (!p.renderVersions.some((v) => v.objectKey === p.outputKey))
      p.renderVersions.push({
        id: "original",
        objectKey: p.outputKey,
        subtitleKey: p.subtitleKey ?? undefined,
        contentRevision: p.outputRevision,
        createdAt: p.updatedAt,
        duration: p.settings.duration,
      });
  }
  p.shots.forEach((s) => {
    s.attempt ??= s.providerTaskId ? 1 : 0;
    s.sourceOffset ??= 0;
    s.versions ??= [];
    if (s.objectKey && !s.versions.some((v) => v.objectKey === s.objectKey))
      s.versions.push({
        id: `original-${s.id}`,
        attempt: s.attempt!,
        objectKey: s.objectKey,
        model: s.model,
        prompt: s.prompt,
        duration: s.sourceDuration ?? s.generationSeconds,
        createdAt: p.updatedAt,
        providerTaskId: s.providerTaskId,
      });
    s.selectedVersionId ??= s.versions.find(
      (v) => v.objectKey === s.objectKey,
    )?.id;
  });
  return p;
}
export function publicProject(p: MvProject): MvProject {
  normalizeProject(p);
  const shotUrl = (id: string, version?: string) =>
    `/api/mv/projects/${p.id}/shots/${id}/video${version ? `?version=${encodeURIComponent(version)}` : ""}`;
  return {
    ...p,
    owner: "",
    published: Boolean(p.publishedVideoKey) && p.publishedRevision === p.outputRevision,
    publishedVideoKey: undefined,
    outputKey: undefined,
    subtitleKey: undefined,
    mixPreviewKey: undefined,
    mixPreviewUrl: p.mixPreviewKey
      ? `/api/mv/projects/${p.id}/mix-preview`
      : null,
    videoUrl: p.outputKey ? `/api/mv/projects/${p.id}/video` : null,
    needsRender: !!p.outputKey && p.outputRevision !== p.contentRevision,
    renderVersions: p.renderVersions!.map(
      ({ objectKey, subtitleKey, ...v }) => ({
        ...v,
        videoUrl: `/api/mv/projects/${p.id}/video?version=${v.id}`,
        subtitleUrl: `/api/mv/projects/${p.id}/subtitles?version=${v.id}`,
      }),
    ),
    shots: p.shots.map(({ objectKey, providerUrl, ...s }) => ({
      ...s,
      videoUrl: objectKey ? shotUrl(s.id) : undefined,
      versions: s.versions?.map(({ objectKey, ...v }) => ({
        ...v,
        videoUrl: shotUrl(s.id, v.id),
      })),
    })),
  };
}
export function requireEditable(p: MvProject, revision: unknown): void {
  if (p.revision !== revision)
    throw new ResourceStateConflictError("项目版本已改变，请刷新后重试");
  if (!["draft", "failed", "completed", "paused"].includes(p.status))
    throw new ResourceStateConflictError(
      "请先暂停生成，等待已提交镜头返回后再编辑",
    );
}
export function renderFingerprint(p: MvProject): string {
  const s = p.settings;
  return JSON.stringify({
    shots: p.shots.map((v) => ({
      id: v.id,
      key: v.objectKey,
      offset: v.sourceOffset ?? 0,
      duration: v.duration,
    })),
    duration: s.duration,
    srt: s.srt,
    subtitles: s.subtitles,
    subtitleStyle: s.subtitleStyle,
    subtitleOffset: s.subtitleOffset ?? 0,
    audioGainDb: s.audioGainDb,
    vocals: s.vocalStemId ?? null,
    instrumental: s.instrumentalStemId ?? null,
    vocalGain: s.vocalGainDb ?? 0,
    instrumentalGain: s.instrumentalGainDb ?? 0,
  });
}
export function markChanged(p: MvProject): void {
  p.contentRevision = (p.contentRevision ?? 1) + 1;
  p.error = null;
  p.mixPreviewKey = null;
}
export function retime(p: MvProject): void {
  let start = 0;
  p.shots.forEach((s, i) => {
    s.index = i;
    s.start = Math.round(start * 1000) / 1000;
    start += s.duration;
  });
  p.settings.duration = Math.round(start * 1000) / 1000;
  if (start < 4 || start > 600)
    throw new ValidationError("时间线总时长必须在 4–600 秒之间");
}
export function generationDuration(modelId: string, seconds: number): number {
  const m = videoModel(modelId);
  const n =
    m.durations?.find((v) => v >= seconds) ??
    Math.max(m.minSeconds, Math.ceil(seconds));
  if (n > m.maxSeconds || (m.durations && !m.durations.includes(n)))
    throw new ValidationError("所选模型无法覆盖此镜头时长");
  return n;
}
export function editShots(p: MvProject, raw: unknown): void {
  if (
    !Array.isArray(raw) ||
    raw.some((s) => !s || typeof s !== "object") ||
    raw.length !== p.shots.length ||
    new Set(raw.map((s) => s.id)).size !== raw.length
  )
    throw new ValidationError("分镜列表必须包含全部镜头且不能重复");
  if(p.shots.some(s=>['running','submitting','uncertain'].includes(s.status))&&raw.some((input,i)=>{const old=p.shots[i];return input.id!==old.id||input.prompt!==old.prompt||input.model!==old.model||(input.duration??old.duration)!==old.duration||(input.sourceOffset??old.sourceOffset??0)!==(old.sourceOffset??0);}))throw new ResourceStateConflictError('还有未确认结束的任务，请先核对恢复，再修改时间线');
  const current = new Map(p.shots.map((s) => [s.id, s]));
  const next: MvShot[] = raw.map((input) => {
    const old = current.get(input.id);
    if (!old) throw new ValidationError("分镜不存在");
    const s = { ...old };
    if (
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 4000
    )
      throw new ValidationError("镜头描述为 1–4000 字");
    const m = videoModel(input.model);
    if (
      !m.resolutions.includes(p.settings.resolution) ||
      !m.ratios.includes(p.settings.ratio) ||
      (p.settings.performance === "audio" && !m.referenceAudio)
    )
      throw new ValidationError("镜头模型与项目设置不兼容");
    if(m.id==='grok-imagine-video-1.5'&&!p.settings.referenceId)throw new ValidationError('Grok 1.5 需要人物参考照片');
    const changed = input.prompt.trim() !== s.prompt || m.id !== s.model;
    // Editing a generated shot prepares the next take; the selected take remains intact until regeneration is requested.
    s.prompt = input.prompt.trim();
    s.model = m.id;
    const duration = input.duration ?? s.duration,
      offset = input.sourceOffset ?? s.sourceOffset ?? 0;
    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0.25 ||
      typeof offset !== "number" ||
      !Number.isFinite(offset) ||
      offset < 0
    )
      throw new ValidationError("裁剪起点或时长无效");
    const v = s.versions?.find((v) => v.id === s.selectedVersionId),
      available = s.sourceDuration ?? v?.duration ?? s.generationSeconds;
    if (s.status === "ready" && offset + duration > available + 0.04)
      throw new ValidationError("裁剪超出原镜头范围");
    s.duration = Math.round(duration * 1000) / 1000;
    s.sourceOffset = Math.round(offset * 1000) / 1000;
    if (changed || s.status !== "ready")
      s.generationSeconds = generationDuration(m.id, duration);
    return s;
  });
  p.shots = next;
  retime(p);
}
export function selectVersion(
  p: MvProject,
  shotId: string,
  versionId: string,
): void {
  const s = p.shots.find((s) => s.id === shotId),
    v = s?.versions?.find((v) => v.id === versionId);
  if (!s || !v?.objectKey) throw new ValidationError("镜头版本不存在");
  if (v.duration + 0.04 < s.duration)
    throw new ValidationError("此版本太短，无法覆盖当前镜头");
  Object.assign(s, {
    objectKey: v.objectKey,
    selectedVersionId: v.id,
    sourceOffset: 0,
    sourceDuration: v.duration,
    status: "ready",
    error: null,
    providerTaskId: v.providerTaskId,
    quality: v.quality,
  });
  markChanged(p);
}
export function splitShot(p: MvProject, id: string, at: number): void {
  const i = p.shots.findIndex((s) => s.id === id),
    s = p.shots[i];
  if (
    !s ||
    s.status !== "ready" ||
    !Number.isFinite(at) ||
    at < 0.25 ||
    s.duration - at < 0.25 ||
    p.shots.length >= 120
  )
    throw new ValidationError("请选择已完成镜头，切点两侧至少保留 0.25 秒");
  const clone: MvShot = {
    ...structuredClone(s),
    id: randomUUID(),
    duration: Math.round((s.duration - at) * 1000) / 1000,
    sourceOffset: (s.sourceOffset ?? 0) + at,
  };
  s.duration = at;
  p.shots.splice(i + 1, 0, clone);
  retime(p);
  markChanged(p);
}
export function saveShotVersion(
  shot: MvShot,
  key: string,
  duration: number,
): MvShotVersion {
  const v: MvShotVersion = {
    id: randomUUID(),
    attempt: shot.attempt ?? 1,
    objectKey: key,
    model: shot.model,
    prompt: shot.prompt,
    duration,
    createdAt: new Date().toISOString(),
    providerTaskId: shot.providerTaskId,
    estimatedPoints: shot.estimatedPoints,
    providerPoints: shot.providerPoints,
  };
  shot.versions ??= [];
  shot.versions.push(v);
  Object.assign(shot, {
    objectKey: key,
    selectedVersionId: v.id,
    sourceOffset: 0,
    sourceDuration: duration,
    status: "ready",
    error: null,
  });
  return v;
}
