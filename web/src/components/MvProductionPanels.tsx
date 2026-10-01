import { useEffect, useState } from "react";
import {
  mvApi,
  type MvProject,
  type MvQuote,
  type MvStem,
  type MvShot,
  type MvCatalog,
  type MvReference,
} from "../mv-api";
import { api } from "../api";
import { Refresh, Music, Download, Film } from "./Icons";
import { useI18n } from "../i18n";
type Run = (label: string, fn: () => Promise<void>) => Promise<void>;
export function MvProductionPanels({
  project,
  catalog,
  busy,
  working,
  dirty,
  onEdit,
  onReplace,
  run,
  onPrepare,
  onPreviewVersion,
  onPublished,
}: {
  project: MvProject;
  catalog: MvCatalog | null;
  busy: boolean;
  working: boolean;
  dirty: boolean;
  onEdit: (p: MvProject) => void;
  onReplace: (p: MvProject) => void;
  run: Run;
  onPrepare: () => Promise<MvProject>;
  onPreviewVersion: (url: string) => void;
  onPublished: (p: MvProject) => void;
}) {
  const { language } = useI18n();
  const t = (a: string, b: string) => (language === "zh-CN" ? a : b);
  const [quote, setQuote] = useState<MvQuote | null>(null),
    [quoteError, setQuoteError] = useState(""),
    [stems, setStems] = useState<MvStem[]>([]),
    [start, setStart] = useState(0);
  useEffect(() => {
    let ignore = false;
    void mvApi
      .quote(project.id)
      .then((v) => {
        if (!ignore) {
          setQuote(v);
          setQuoteError("");
        }
      })
      .catch((e) => {
        if (!ignore) setQuoteError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [project.id, project.revision]);
  useEffect(() => {
    let ignore = false;
    void mvApi
      .stems(project.settings.trackId)
      .then((v) => {
        if (!ignore) setStems(Array.isArray(v) ? v : []);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [project.settings.trackId]);
  const patch = (v: Partial<MvProject["settings"]>) =>
    onEdit({ ...project, settings: { ...project.settings, ...v } });
  return (
    <div className="mv-production-panels">
      <section className="mv-card">
        <h2>{t("费用与任务", "Budget & tasks")}</h2>
        <div className="mv-quote-grid">
          <div>
            <span>{t("剩余镜头估算", "Remaining estimate")}</span>
            <strong>
              {quote?.estimatedPoints == null
                ? "—"
                : quote.estimatedPoints.toLocaleString()}{" "}
              <small>{t("API 点数", "API points")}</small>
            </strong>
          </div>
          <div>
            <span>
              {t("新增请求费用 / 预估占用", "New request costs / estimates")}
            </span>
            <strong>
              {(project.reservedPoints ?? 0).toLocaleString()}{" "}
              <small>{t("API 点数", "API points")}</small>
            </strong>
          </div>
        </div>
        {quote?.shots?.length ? <details><summary>{t('逐镜费用估算（含新版本）','Per-shot estimates (including new takes)')}</summary><div className="mv-cost-breakdown">{quote.shots.map(q=><div key={q.id}><span>{t('镜头','Shot')} {(project.shots.find(s=>s.id===q.id)?.index??0)+1}</span><span>{q.points??'—'} {t('API 点数','API points')}</span></div>)}</div></details> : null}
        <label>
          {t("总提交预算（API 点数）", "Submission budget (API points)")}
          <input
            aria-label={t("总提交预算", "Submission budget")}
            type="number"
            min={1}
            step={1}
            disabled={working}
            value={project.settings.budgetPoints ?? ""}
            placeholder={t("不设额外上限", "No extra limit")}
            onChange={(e) =>
              patch({
                budgetPoints:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <p className="mv-help">
          {quote?.note ??
            catalog?.pricingNote ??
            t(
              "估算不等于最终结算。每个镜头单独调用供应商。",
              "Estimates are not final settlement. Each shot is a provider request.",
            )}
        </p>
        {quoteError && <p className="mv-shot-error">{quoteError}</p>}
        <p className="mv-help">
          {dirty
            ? t(
                "费用估算对应已保存的分镜，请先保存修改。",
                "Estimate covers saved shots; save your changes first.",
              )
            : quote?.source}
        </p>
        {working && project.status === "generating" && (
          <button
            className="btn-ghost"
            disabled={busy || project.pauseRequested}
            onClick={() =>
              void run("pause", async () =>
                onReplace(await mvApi.pause(project.id)),
              )
            }
          >
            {project.pauseRequested
              ? t("等待已提交镜头返回", "Waiting for submitted shots")
              : t("停止提交后续镜头", "Stop new submissions")}
          </button>
        )}
        {project.pauseRequested && (
          <p className="mv-help">
            {t(
              "已提交到供应商的任务会继续，返回的素材仍会保存。",
              "Already submitted jobs continue and their results will be saved.",
            )}
          </p>
        )}
      </section>
      <details
        className="mv-card"
        open={Boolean(
          project.settings.vocalStemId || project.settings.instrumentalStemId,
        )}
      >
        <summary>
          <Music width={16} />
          {t("独立人声 / 伴奏混音", "Vocal & instrumental mix")}
        </summary>
        <p className="mv-help">
          {t(
            "导入与原曲对齐的完整分轨，两条音轨均从 0 秒开始。导入文件和本地试听不调用生成模型。",
            "Import full-length stems aligned to the original at 0 seconds. Local mixing does not call a generation model.",
          )}
        </p>
        {(["vocals", "instrumental"] as const).map((kind) => {
          const key = kind === "vocals" ? "vocalStemId" : "instrumentalStemId",
            gain = kind === "vocals" ? "vocalGainDb" : "instrumentalGainDb";
          return (
            <div key={kind} className="mv-stem-row">
              <label>
                {kind === "vocals"
                  ? t("人声分轨", "Vocal stem")
                  : t("伴奏分轨", "Instrumental stem")}
                <select
                  aria-label={
                    kind === "vocals"
                      ? t("人声分轨", "Vocal stem")
                      : t("伴奏分轨", "Instrumental stem")
                  }
                  value={project.settings[key] ?? ""}
                  disabled={working}
                  onChange={(e) => patch({ [key]: e.target.value || null })}
                >
                  <option value="">{t("未选择", "Not selected")}</option>
                  {stems
                    .filter((s) => s.kind === kind)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <input
                aria-label={
                  kind === "vocals"
                    ? t("上传人声分轨", "Upload vocal stem")
                    : t("上传伴奏分轨", "Upload instrumental stem")
                }
                type="file"
                accept=".wav,.mp3,.flac"
                disabled={working || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void run("stem-upload", async () => {
                      const uploaded = await mvApi.uploadStem(
                        project.settings.trackId,
                        kind,
                        f,
                      );
                      setStems((v) => [uploaded, ...v]);
                      patch({ [key]: uploaded.id });
                    });
                }}
              />
              <label>
                {kind === "vocals"
                  ? t("人声音量", "Vocal gain")
                  : t("伴奏音量", "Instrumental gain")}{" "}
                · {project.settings[gain] ?? 0} dB
                <input
                  aria-label={
                    kind === "vocals"
                      ? t("人声音量", "Vocal gain")
                      : t("伴奏音量", "Instrumental gain")
                  }
                  type="range"
                  min={-24}
                  max={12}
                  step={0.5}
                  disabled={working || !project.settings[key]}
                  value={project.settings[gain] ?? 0}
                  onChange={(e) => patch({ [gain]: Number(e.target.value) })}
                />
              </label>
            </div>
          );
        })}
        <button
          className="btn-ghost"
          disabled={
            working ||
            !project.settings.vocalStemId ||
            !project.settings.instrumentalStemId
          }
          onClick={() => patch({ vocalGainDb: 3, instrumentalGainDb: -4 })}
        >
          {t("应用人声突出预设", "Apply vocal-forward preset")}
        </button>
        <button
          className="btn-ghost"
          disabled={working}
          onClick={() => patch({ vocalStemId: null, instrumentalStemId: null })}
        >
          {t("使用原曲混音", "Use original mix")}
        </button>
        <div className="mv-field-grid">
          <label>
            {t("试听起点（秒）", "Preview start (seconds)")}
            <input
              type="number"
              min={0}
              max={Math.max(0, project.settings.duration - 1)}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>
          <button
            className="btn-primary mv-align-bottom"
            disabled={
              busy ||
              working ||
              !project.settings.vocalStemId ||
              !project.settings.instrumentalStemId
            }
            onClick={() =>
              void run("mix-preview", async () =>
                onReplace(await mvApi.previewMix(await onPrepare(), start)),
              )
            }
          >
            {t("生成 20 秒混音试听", "Preview 20-second mix")}
          </button>
        </div>
        <label>
          {t("原曲", "Original")}
          <audio
            className="mv-audio"
            controls
            preload="none"
            src={api.audioUrl(project.settings.trackId)}
          />
        </label>
        {project.mixPreviewUrl && (
          <label>
            {t("当前混音试听", "Current mix preview")}
            <audio
              className="mv-audio"
              controls
              preload="none"
              src={project.mixPreviewUrl}
            />
          </label>
        )}
      </details>
      {!!project.renderVersions?.length && (
        <details className="mv-card">
          <summary>
            {t("成片版本", "Render versions")} · {project.renderVersions.length}
          </summary>
          {project.videoUrl&&<button className="btn-primary" disabled={busy||working||dirty||project.needsRender} onClick={()=>void run('publish',async()=>{const state=await mvApi.publication(project.id);if(state.isCurrent)return;if(state.hasExistingVideo&&!window.confirm(t('将此成片设为歌曲 MV？这会替换歌曲详情的视频入口，历史 MV 项目仍保留。','Replace the song video with this cut? Existing MV projects are retained.')))return;onPublished(await mvApi.publish(project,state.expectedChecksum));})}>{t('发布为歌曲 MV','Publish as song MV')}</button>}
  {project.published&&<p className="mv-help">{t('此版本已发布过，历史成片仍保留。','This version has been published; render history is retained.')}</p>}
  <div className="mv-render-versions">
            {[...project.renderVersions].reverse().map((v, i) => (
              <div key={v.id}>
                <button
                  className="btn-ghost"
                  onClick={() => v.videoUrl && onPreviewVersion(v.videoUrl)}
                >
                  <Film width={14} />
                  {t("版本", "Version")} {project.renderVersions!.length - i} ·{" "}
                  {new Date(v.createdAt).toLocaleString()}
                </button>
                <a href={`${v.videoUrl}&download=1`} className="btn-ghost">
                  <Download width={14} />
                  {t("下载", "Download")}
                </a>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
export function MvShotEditor({
  project,
  shot,
  index,
  busy,
  working,
  catalog,
  onEdit,
  onReplace,
  run,
  onPrepare,
  onRegenerate,
}: {
  project: MvProject;
  shot: MvShot;
  index: number;
  busy: boolean;
  working: boolean;
  catalog: MvCatalog | null;
  onEdit: (p: MvProject) => void;
  onReplace: (p: MvProject) => void;
  run: Run;
  onPrepare: () => Promise<MvProject>;
  onRegenerate: () => void;
}) {
  const { language } = useI18n();
  const t = (a: string, b: string) => (language === "zh-CN" ? a : b);
  const [split, setSplit] = useState(Number((shot.duration / 2).toFixed(2))),
    [taskId, setTaskId] = useState("");
  const setShot = (patch: Partial<MvShot>) => {
    const next = {
      ...project,
      shots: project.shots.map((s) =>
        s.id === shot.id ? { ...s, ...patch } : s,
      ),
    };
    let start = 0;
    next.shots = next.shots.map((s, i) => {
      const out = { ...s, index: i, start };
      start += s.duration;
      return out;
    });
    next.settings = { ...next.settings, duration: Number(start.toFixed(3)) };
    onEdit(next);
  };
  const move = (direction: number) => {
    const to = index + direction;
    if (to < 0 || to >= project.shots.length) return;
    const arr = [...project.shots];
    [arr[index], arr[to]] = [arr[to], arr[index]];
    let start = 0;
    onEdit({
      ...project,
      shots: arr.map((s, i) => {
        const next = { ...s, index: i, start };
        start += s.duration;
        return next;
      }),
    });
  };
  return (
    <div className="mv-shot-editing">
      <div className="mv-inline-actions">
        <button
          className="btn-ghost"
          aria-label={`${t("镜头", "Shot")} ${index + 1} ${t("上移", "move up")}`}
          disabled={working || busy || index === 0}
          onClick={() => move(-1)}
        >
          ↑ {t("上移", "Up")}
        </button>
        <button
          className="btn-ghost"
          aria-label={`${t("镜头", "Shot")} ${index + 1} ${t("下移", "move down")}`}
          disabled={working || busy || index === project.shots.length - 1}
          onClick={() => move(1)}
        >
          ↓ {t("下移", "Down")}
        </button>
      </div>
      {shot.versions?.length ? (
        <label>
          {t("素材版本", "Take")}
          <select
            aria-label={`${t("镜头", "Shot")} ${index + 1} ${t("素材版本", "take")}`}
            value={shot.selectedVersionId ?? ""}
            disabled={working || busy}
            onChange={(e) =>
              void run("select-take", async () =>
                onReplace(
                  await mvApi.shotAction(await onPrepare(), {
                    action: "select-version",
                    shotId: shot.id,
                    versionId: e.target.value,
                  }),
                ),
              )
            }
          >
            {shot.versions.map((v, i) => (
              <option key={v.id} value={v.id}>
                {t("版本", "Take")} {i + 1} · {v.model} ·{" "}
                {v.duration.toFixed(1)}s
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mv-field-grid">
        <label>
          {t("素材起点（秒）", "Source start")}
          <input
            aria-label={`${t("镜头", "Shot")} ${index + 1} ${t("素材起点", "source start")}`}
            type="number"
            min={0}
            step={0.05}
            disabled={working || shot.status !== "ready"}
            value={shot.sourceOffset ?? 0}
            onChange={(e) => setShot({ sourceOffset: Number(e.target.value) })}
          />
        </label>
        <label>
          {t("时长（秒）", "Duration")}
          <input
            aria-label={`${t("镜头", "Shot")} ${index + 1} ${t("时长", "duration")}`}
            type="number"
            min={0.25}
            step={0.05}
            disabled={working}
            value={shot.duration}
            onChange={(e) => setShot({ duration: Number(e.target.value) })}
          />
        </label>
      </div>
      {shot.status === "ready" && (
        <>
          <div className="mv-field-grid">
            <label>
              {t("拆分位置（秒）", "Split at")}
              <input
                aria-label={`${t("镜头", "Shot")} ${index + 1} ${t("拆分位置", "split at")}`}
                type="number"
                min={0.25}
                max={shot.duration - 0.25}
                step={0.05}
                value={split}
                disabled={working}
                onChange={(e) => setSplit(Number(e.target.value))}
              />
            </label>
            <button
              className="btn-ghost mv-align-bottom"
              disabled={working || busy}
              onClick={() =>
                void run("split", async () =>
                  onReplace(
                    await mvApi.shotAction(await onPrepare(), {
                      action: "split",
                      shotId: shot.id,
                      at: split,
                    }),
                  ),
                )
              }
            >
              {t("拆分镜头", "Split shot")}
            </button>
          </div>
          <button
            className="btn-ghost"
            disabled={working || busy || !catalog?.canGenerate}
            onClick={onRegenerate}
          >
            <Refresh width={13} />
            {t("重新生成新版本", "Generate another take")}
          </button>
        </>
      )}
      {!!shot.quality?.warnings.length && (
        <div className="mv-shot-error">
          {shot.quality.warnings.join("；")}
          {!shot.quality.reviewed && (
            <button
              className="btn-ghost"
              disabled={working || busy}
              onClick={() =>
                void run("quality", async () =>
                  onReplace(
                    await mvApi.shotAction(await onPrepare(), {
                      action: "accept-quality",
                      shotId: shot.id,
                    }),
                  ),
                )
              }
            >
              {t("已预览，接受此镜头", "Reviewed, accept shot")}
            </button>
          )}
        </div>
      )}
      {!working &&
        (["uncertain", "running"].includes(shot.status) ||
          (shot.providerTaskId && shot.status === "failed")) && (
          <div className="mv-reconcile">
            {shot.status === "uncertain" &&
              !shot.providerTaskId &&
              catalog?.canLinkUncertain && (
                <label>
                  {t("管理员关联上游任务 ID", "Link provider task ID")}
                  <input
                    aria-label={t("上游任务 ID", "Provider task ID")}
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                    placeholder={t(
                      "在供应商后台核对后填写",
                      "Confirm in the provider dashboard",
                    )}
                  />
                </label>
              )}
            <button
              className="btn-ghost"
              disabled={
                busy ||
                (!shot.providerTaskId &&
                  (!catalog?.canLinkUncertain || !taskId))
              }
              onClick={() =>
                void run("reconcile", async () =>
                  onReplace(
                    await mvApi.reconcile(
                      await onPrepare(),
                      shot.id,
                      taskId || undefined,
                    ),
                  ),
                )
              }
            >
              {t("重新查询 / 核对任务", "Query / reconcile task")}
            </button>
            <p className="mv-help">
              {t(
                "只查询已有任务，不创建新生成请求。",
                "Queries an existing task without starting a new generation.",
              )}
            </p>
          </div>
        )}
    </div>
  );
}
export function MvReferenceLibrary({
  onSelect,
  run,
}: {
  onSelect: (r: MvReference) => void;
  run: Run;
}) {
  const [items, setItems] = useState<MvReference[]>([]);
  useEffect(() => {
    void mvApi
      .references()
      .then((v) => setItems(Array.isArray(v) ? v : []))
      .catch(() => {});
  }, []);
  return (
    <details className="mv-card">
      <summary>参考人物素材库 · {items.length}</summary>
      <div className="mv-reference-grid">
        {items.map((r) => (
          <div key={r.id}>
            <button onClick={() => onSelect(r)}>
              <img src={r.url} alt={r.name} />
              <span>{r.name}</span>
            </button>
            <button
              className="mv-text-button"
              onClick={() =>
                void run("delete-reference", async () => {
                  await mvApi.removeReference(r.id);
                  setItems((v) => v.filter((x) => x.id !== r.id));
                })
              }
            >
              删除未使用照片
            </button>
          </div>
        ))}
      </div>
      {!items.length && (
        <p className="mv-help">
          上传的照片会保存在这里，已被项目使用的照片受到保护。
        </p>
      )}
    </details>
  );
}
