import {
  MvProductionPanels,
  MvShotEditor,
  MvReferenceLibrary,
} from "./MvProductionPanels";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, createIdempotencyKey } from "../api";
import {
  mvApi,
  type MvCatalog,
  type MvProject,
  type MvSettings,
  type MvReference,
} from "../mv-api";
import type { Track } from "../types";
import {
  Film,
  Music,
  Sparkle,
  Download,
  Refresh,
  Play,
  Check,
  Plus,
} from "./Icons";
import { useI18n } from "../i18n";
import { fmtTime } from "../lib/format";
const DEFAULTS: MvSettings = {
  trackId: "",
  title: "",
  concept:
    "清晨海岸与嫩绿色林间，光线清透柔和。人物从沉静走向舒展，像新叶经历风雨后重新生长。自然摄影，衣角和发丝随风，人物动作连贯，每个镜头有新的叙事。",
  model: "seedance-2.5",
  resolution: "720p",
  ratio: "16:9",
  duration: 240,
  shotSeconds: 12,
  referenceId: null,
  performance: "singing",
  subtitles: true,
  subtitleStyle: "clean",
  srt: "",
  audioGainDb: 0,
};
const statusCopy: Record<string, [string, string]> = {
  draft: ["待生成", "Draft"],
  queued: ["排队中", "Queued"],
  submitting: ["正在提交", "Submitting"],
  running: ["生成中", "Generating"],
  ready: ["已完成", "Ready"],
  failed: ["失败", "Failed"],
  paused: ["已暂停", "Paused"],
  uncertain: ["需核对任务", "Check submission"],
  generating: ["生成镜头", "Generating shots"],
  assembling: ["合成与字幕", "Rendering"],
  completed: ["成片就绪", "Complete"],
};
export function MvStudio({
  tracks,
  initialTrackId,
  onRefreshLibrary,
  initialProjectId,
  onProjectChange,
}: {
  tracks: Track[];
  initialTrackId?: string;
  initialProjectId?: string;
  onProjectChange?: (id: string | undefined) => void;
  onRefreshLibrary: () => void;
}) {
  const { language } = useI18n();
  const t = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const playable = useMemo(
    () => tracks.filter((v) => v.status === "done" && v.duration >= 4),
    [tracks],
  );
  const [catalog, setCatalog] = useState<MvCatalog | null>(null),
    [projects, setProjects] = useState<MvProject[]>([]),
    [project, setProject] = useState<MvProject | null>(null);
  const [settings, setSettings] = useState<MvSettings>(DEFAULTS),
    [reference, setReference] = useState<MvReference | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [tab, setTab] = useState<"setup" | "storyboard" | "history">("setup"),
    [previewShot, setPreviewShot] = useState<string | null>(null),
    [dirty, setDirty] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const createKey = useRef(createIdempotencyKey("mv"));
  const mounted = useRef(true);
  const current = settings;
  const model = catalog?.models.find((m) => m.id === current.model);
  const track = playable.find((v) => v.id === current.trackId);
  const working =
    project && ["generating", "assembling"].includes(project.status);
  const readyCount =
    project?.shots.filter((s) => s.status === "ready").length ?? 0;
  const label = (status: string) =>
    statusCopy[status]?.[language === "zh-CN" ? 0 : 1] ?? status;
  function useTrack(id: string) {
    createKey.current = createIdempotencyKey("mv");
    const song = playable.find((v) => v.id === id);
    setSettings((v) => ({
      ...v,
      trackId: id,
      title: song ? `${song.title} · MV` : "",
      duration: Math.min(240, song?.duration || 240),
    }));
  }
  useEffect(() => {
    mounted.current = true;
    Promise.all([mvApi.catalog(), mvApi.list()])
      .then(([c, p]) => {
        if (mounted.current) {
          setCatalog(c);
          setProjects(p);
        }
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!settings.trackId && playable.length)
      useTrack(
        initialTrackId && playable.some((v) => v.id === initialTrackId)
          ? initialTrackId
          : playable[0].id,
      );
  }, [playable, initialTrackId]);
  useEffect(() => {
    if (!project || !working) return;
    let stopped = false;
    const timer = setInterval(() => {
      mvApi
        .get(project.id)
        .then((p) => {
          if (stopped) return;
          setProject(p);
          if (p.status === "completed") {
            setPreviewShot(null);setPreviewVersion(null);
            onRefreshLibrary();
            void mvApi.list().then(setProjects);
          }
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [project?.id, working]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (initialProjectId && initialProjectId !== project?.id)
      void mvApi
        .get(initialProjectId)
        .then(loadProject)
        .catch((e) => setError(e.message));
  }, [initialProjectId]);
  const update = (patch: Partial<MvSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    createKey.current = createIdempotencyKey("mv");
  };
  async function run(name: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  const loadProject = (p: MvProject) => {
    onProjectChange?.(p.id);
    setProject(p);
    setSettings(p.settings);
    setReference(
      p.settings.referenceId
        ? {
            id: p.settings.referenceId,
            name: t("已保存的参考人物", "Saved reference"),
            url: `/api/mv/references/${p.settings.referenceId}`,
          }
        : null,
    );
    setDirty(false);
    setPreviewShot(null);
    setPreviewVersion(null);
    setTab("storyboard");
  };
  async function create() {
    await run("plan", async () => {
      const p = await mvApi.create(settings, createKey.current);
      setProjects((v) => [p, ...v.filter((x) => x.id !== p.id)]);
      loadProject(p);
    });
  }
  async function generate(shotId?: string, regenerate = false) {
    if (!project) return;
    await run(shotId || "generate", async () => {
      const saved = dirty ? await mvApi.edit(project) : project;
      setProject(saved);
      setDirty(false);
      setProject(await mvApi.generate(saved, shotId, regenerate));
    });
  }
  async function save() {
    if (project)
      await run("save", async () => {
        setProject(await mvApi.edit(project));
        setDirty(false);
      });
  }
  async function prepare(): Promise<MvProject> {
    if (!project) throw new Error("请选择项目");
    const p = dirty ? await mvApi.edit(project) : project;
    setProject(p);
    setDirty(false);
    return p;
  }
  async function renderFinal() {
    await run("render", async () =>
      setProject(await mvApi.render(await prepare())),
    );
  }
  const editProject = (p: MvProject) => {
    setProject(p);
    setDirty(true);
  };
  const replaceProject = (p: MvProject) => {
    setProject(p);
    setDirty(false);
  };
  function reorder(fromId: string, toId: string) {
    if (!project || working) return;
    const from = project.shots.findIndex((s) => s.id === fromId),
      to = project.shots.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const shots = [...project.shots];
    const [moved] = shots.splice(from, 1);
    shots.splice(to, 0, moved);
    let start = 0;
    editProject({
      ...project,
      shots: shots.map((shot, i) => {
        const result = { ...shot, index: i, start };
        start += shot.duration;
        return result;
      }),
    });
  }
  const preview =
    previewVersion ||
    project?.shots.find((s) => s.id === previewShot)?.versions?.find(v=>v.id===project.shots.find(s=>s.id===previewShot)?.selectedVersionId)?.videoUrl ||
    project?.shots.find((s) => s.id === previewShot)?.videoUrl ||
    (project?.videoUrl ? `${project.videoUrl}?render=${encodeURIComponent(project.renderVersions?.at(-1)?.id??String(project.outputRevision??0))}` : null) ||
    project?.shots.find((s) => s.videoUrl)?.videoUrl;
  const canPlan = Boolean(
    track &&
      model &&
      settings.title.trim() &&
      settings.concept.trim() &&
      (settings.performance === "story" || reference),
  );
  const activeSteps =
    project?.status === "completed"
      ? 4
      : project?.status === "assembling"
        ? 3
        : working
          ? 2
          : project
            ? 1
            : 0;
  return (
    <section className="mv-studio" aria-label={t("MV 工作室", "MV Studio")}>
      <header className="mv-heading">
        <div>
          <span className="eyebrow">MUSIC INTO MOTION</span>
          <h1>
            {t("MV 工作室", "MV Studio")} <span>BETA</span>
          </h1>
          <p>
            {t(
              "让歌声有画面，让照片中的人物走进故事。",
              "Turn your song into a story in motion.",
            )}
          </p>
        </div>
        <button
          className="btn-ghost"
          onClick={() => {
            setProject(null);
            onProjectChange?.(undefined);
            setSettings({ ...DEFAULTS });
            setReference(null);
            setPreviewVersion(null);
            setDirty(false);
            setPreviewShot(null);
            setTab("setup");
            createKey.current = createIdempotencyKey("mv");
          }}
          disabled={Boolean(busy)}
        >
          <Plus width={16} />
          {t("新建 MV", "New MV")}
        </button>
      </header>
      <div
        className="mv-process"
        role="region"
        tabIndex={0}
        aria-label={t("创作流程", "Production stages")}
      >
        {[
          t("歌曲与人物", "Song & character"),
          t("分镜脚本", "Storyboard"),
          t("动态镜头", "Motion"),
          t("字幕与合成", "Subtitles & render"),
          t("成片", "Final cut"),
        ].map((x, i) => (
          <div key={x} className={i <= activeSteps ? "active" : ""}>
            <span>
              {i < activeSteps ? (
                <Check width={13} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            {x}
          </div>
        ))}
      </div>
      <nav className="mv-tabs" aria-label={t("MV 工作区", "MV workspace")}>
        {(["setup", "storyboard", "history"] as const).map((v, i) => (
          <button key={v} onClick={() => setTab(v)} aria-pressed={tab === v}>
            {
              [
                t("创作设置", "Create"),
                t("分镜与预览", "Storyboard"),
                t("项目记录", "Projects"),
              ][i]
            }
            {v === "history" && <small>{projects.length}</small>}
          </button>
        ))}
      </nav>
      {error && (
        <div className="mv-notice mv-error" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            aria-label={t("关闭错误", "Dismiss error")}
          >
            ×
          </button>
        </div>
      )}
      {!catalog && !error && (
        <p role="status">{t("正在加载视频模型…", "Loading video models…")}</p>
      )}
      {catalog?.reason && <div className="mv-notice">{catalog.reason}</div>}
      {tab === "setup" && (
        <div className="mv-layout">
          <div className="mv-form">
            <section className="mv-card">
              <h2>
                <Music width={18} />
                {t("01 / 选择歌曲", "01 / Soundtrack")}
              </h2>
              <label>
                {t("源歌曲", "Song")}
                <select
                  aria-label={t("源歌曲", "Song")}
                  value={current.trackId}
                  onChange={(e) => useTrack(e.target.value)}
                >
                  <option value="">
                    {t("选择一首已完成歌曲", "Choose a completed song")}
                  </option>
                  {playable.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} · {fmtTime(v.duration)}
                    </option>
                  ))}
                </select>
              </label>
              {!playable.length && (
                <p className="mv-help">
                  {t(
                    "先在创作工作台生成歌曲，或导入参考音频。",
                    "Generate a song or import audio first.",
                  )}
                </p>
              )}
              {track && (
                <audio
                  className="mv-audio"
                  src={api.audioUrl(track.id)}
                  controls
                  preload="none"
                />
              )}
              <label>
                {t("MV 名称", "MV title")}
                <input
                  value={current.title}
                  maxLength={100}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <div className="mv-field-grid">
                <label>
                  {t("成片时长（秒）", "Duration (seconds)")}
                  <input
                    type="number"
                    min={4}
                    max={Math.min(600, track?.duration || 600)}
                    step="0.01"
                    value={current.duration}
                    onChange={(e) =>
                      update({ duration: Number(e.target.value) })
                    }
                  />
                </label>
                <button
                  className="btn-ghost mv-align-bottom"
                  disabled={!track}
                  onClick={() =>
                    update({ duration: Math.min(600, track!.duration) })
                  }
                >
                  {t("使用完整歌曲", "Use full song")}
                </button>
              </div>
            </section>
            <section className="mv-card">
              <h2>
                <Film width={18} />
                {t("02 / 参考人物", "02 / Character")}
              </h2>
              <label className={`mv-upload ${reference ? "has-image" : ""}`}>
                {reference ? (
                  <img
                    src={reference.url}
                    alt={t("人物参考照片", "Character reference")}
                  />
                ) : (
                  <Film width={28} />
                )}
                <span>
                  <b>
                    {reference
                      ? reference.name
                      : t("上传人物参考照片", "Upload a character photo")}
                  </b>
                  <small>JPG / PNG · ≤ 10 MB</small>
                </span>
                <input
                  aria-label={t("上传人物参考照片", "Upload character photo")}
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void run("upload", async () => {
                        const ref = await mvApi.upload(f);
                        setReference(ref);
                        update({ referenceId: ref.id });
                      });
                  }}
                />
              </label>
              {reference && (
                <button
                  className="mv-text-button"
                  onClick={() => {
                    setReference(null);
                    update({ referenceId: null, performance: "story" });
                  }}
                >
                  {t("移除参考人物", "Remove reference")}
                </button>
              )}
              <label>
                {t("表演方式", "Performance")}
                <select
                  aria-label={t("表演方式", "Performance")}
                  value={current.performance}
                  onChange={(e) =>
                    update({
                      performance: e.target.value as MvSettings["performance"],
                    })
                  }
                >
                  <option value="story">
                    {t(
                      "叙事动作 · 走动、转身、表情",
                      "Story · movement & expression",
                    )}
                  </option>
                  <option value="singing">
                    {t("人物演唱 · 动作与演唱口型", "Singing performance")}
                  </option>
                  <option
                    value="audio"
                    disabled={
                      !model?.referenceAudio || !catalog?.audioReferenceReady
                    }
                  >
                    {t(
                      "音频参考驱动 · 配合歌曲分段",
                      "Drive with song segments",
                    )}
                  </option>
                </select>
              </label>
              {!catalog?.audioReferenceReady && (
                <p className="mv-help">
                  {t(
                    "音频参考驱动需要视频服务可访问的签名存储；当前通道尚未就绪，可刷新状态。",
                    "Audio reference requires provider-accessible signed storage, which is not configured locally.",
                  )}
                </p>
              )}
              <p className="mv-help">
                {current.performance === "singing"
                  ? t(
                      "生成演唱动作和口型，未保证逐字唇形同步。",
                      "Singing motion; exact lip sync is not guaranteed.",
                    )
                  : current.performance === "audio"
                    ? t(
                        "把对应歌曲片段作为参考发送，口型效果仍需逐镜检查。",
                        "Uses each song segment as reference; review lip sync per shot.",
                      )
                    : t(
                        "保持人物外观，生成有连续动作的故事镜头。",
                        "Keep the character consistent across moving scenes.",
                      )}
              </p>
            </section>
            <MvReferenceLibrary
              run={run}
              onSelect={(r) => {
                setReference(r);
                update({ referenceId: r.id });
              }}
            />
          </div>
          <div className="mv-main">
            <div className="mv-vision">
              <div className="mv-vision-grid" />
              <span className="mv-frame-corner" />
              <div className="mv-vision-copy">
                <span className="mv-kicker">YOUR NEXT MUSIC FILM</span>
                <h2>
                  {t(
                    "把一首歌，\n拍成一个故事。",
                    "A song.\nA story in motion.",
                  )}
                </h2>
                <p>
                  {t(
                    "人物一致性 · 连续动作 · 歌词字幕",
                    "Character reference · Motion · Lyric captions",
                  )}
                </p>
              </div>
              {reference && (
                <img className="mv-vision-photo" src={reference.url} alt="" />
              )}
              <span className="mv-vision-spec">
                {current.ratio} <i /> {current.resolution.toUpperCase()} <i />{" "}
                {fmtTime(current.duration)}
              </span>
            </div>
            <section className="mv-card">
              <h2>
                <Sparkle width={18} />
                {t("03 / 导演设定", "03 / Direction")}
              </h2>
              <label>
                {t("画面与故事", "Visual direction")}
                <textarea
                  rows={4}
                  maxLength={2400}
                  value={current.concept}
                  onChange={(e) => update({ concept: e.target.value })}
                />
              </label>
              <div className="mv-presets">
                {[
                  [
                    t("清晨嫩绿", "Morning green"),
                    "清晨的嫩绿树林、湿润草木与斑驳晨光。参考人物走过林间和海岸，停下、抬头、转身、微笑，呼应重新生长的主题。柔和自然摄影，动作连贯。",
                  ],
                  [
                    t("海边叙事", "Coastal story"),
                    "白衣人物沿潮湿海岸行走，微风、浪花与远山。用手部细节、回望和正面演唱镜头交织成长的故事。",
                  ],
                  [
                    t("电影演唱", "Cinematic performance"),
                    "以人物演唱为主线，近景眼神、侧面转身、走动和手势交替；副歌镜头更开阔，主歌克制亲近。电影光影，保持人物一致。",
                  ],
                ].map(([name, concept]) => (
                  <button key={name} onClick={() => update({ concept })}>
                    {name}
                  </button>
                ))}
              </div>
              <label>
                {t("视频模型", "Video model")}
                <select
                  aria-label={t("视频模型", "Video model")}
                  value={current.model}
                  onChange={(e) => {
                    const m = catalog!.models.find(
                      (v) => v.id === e.target.value,
                    )!;
                    update({
                      model: m.id,
                      resolution: m.resolutions.includes(current.resolution)
                        ? current.resolution
                        : m.resolutions[0],
                      ratio: m.ratios.includes(current.ratio)
                        ? current.ratio
                        : m.ratios[0],
                      shotSeconds:
                        m.durations?.[0] ?? Math.min(12, m.maxSeconds),
                      performance:
                        current.performance === "audio" && !m.referenceAudio
                          ? "singing"
                          : current.performance,
                    });
                  }}
                >
                  {catalog?.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.availability === "unverified"
                        ? t(" · 待实测", " · unverified")
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mv-help">{model?.description}</p>
              <div className="mv-field-grid three">
                <label>
                  {t("分辨率", "Resolution")}
                  <select
                    aria-label={t("分辨率", "Resolution")}
                    value={current.resolution}
                    onChange={(e) => update({ resolution: e.target.value })}
                  >
                    {model?.resolutions.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("画幅", "Aspect ratio")}
                  <select
                    aria-label={t("画幅", "Aspect ratio")}
                    value={current.ratio}
                    onChange={(e) => update({ ratio: e.target.value })}
                  >
                    {model?.ratios.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("单镜头秒数", "Seconds / shot")}
                  {model?.durations ? (
                    <select
                      aria-label={t("单镜头秒数", "Seconds / shot")}
                      value={current.shotSeconds}
                      onChange={(e) =>
                        update({ shotSeconds: Number(e.target.value) })
                      }
                    >
                      {model.durations.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={t("单镜头秒数", "Seconds / shot")}
                      type="number"
                      min={model?.minSeconds || 4}
                      max={model?.maxSeconds || 30}
                      step="1"
                      value={current.shotSeconds}
                      onChange={(e) =>
                        update({ shotSeconds: Number(e.target.value) })
                      }
                    />
                  )}
                </label>
              </div>
            </section>
            <section className="mv-card">
              <h2>{t("04 / 字幕与声音", "04 / Captions & audio")}</h2>
              <label className="mv-check">
                <input
                  type="checkbox"
                  checked={current.subtitles}
                  onChange={(e) => update({ subtitles: e.target.checked })}
                />
                {t(
                  "烧录歌词字幕，并导出独立 SRT",
                  "Burn lyric captions and export SRT",
                )}
              </label>
              {current.subtitles && (
                <>
                  <div className="mv-field-grid">
                    <label>
                      {t("字幕样式", "Caption style")}
                      <select
                        aria-label={t("字幕样式", "Caption style")}
                        value={current.subtitleStyle}
                        onChange={(e) =>
                          update({
                            subtitleStyle: e.target.value as "clean" | "cinema",
                          })
                        }
                      >
                        <option value="clean">
                          {t("清晰白字 · 描边", "Clean white outline")}
                        </option>
                        <option value="cinema">
                          {t("电影字幕 · 小字号", "Cinema subtitles")}
                        </option>
                      </select>
                    </label>
                    <label>
                      {t(
                        "导入校对后的 SRT（可选）",
                        "Import corrected SRT (optional)",
                      )}
                      <input
                        type="file"
                        accept=".srt"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            void run("srt", async () => {
                              if (f.size > 80000)
                                throw new Error("SRT 文件过大");
                              update({ srt: await f.text() });
                            });
                        }}
                      />
                    </label>
                  </div>
                  <p className="mv-help">
                    {current.srt
                      ? t(
                          "已导入字幕，合成前将校验时间轴。",
                          "Imported captions will be validated.",
                        )
                      : t(
                          "自动使用歌曲的歌词对齐结果；生成新时间轴可能产生接口费用。",
                          "Uses aligned lyrics; creating alignment can incur an API charge.",
                        )}
                  </p>
                </>
              )}
              <label>
                {t("原曲整体音量", "Song gain")}{" "}
                <span>
                  {current.audioGainDb > 0 ? "+" : ""}
                  {current.audioGainDb} dB
                </span>
                <input
                  type="range"
                  min={-12}
                  max={6}
                  step={1}
                  value={current.audioGainDb}
                  onChange={(e) =>
                    update({ audioGainDb: Number(e.target.value) })
                  }
                />
              </label>
              <p className="mv-help">
                {t(
                  "使用原曲人声与伴奏比例；独立调整人声需要分轨音频。视频生成的环境音不混入成片。",
                  "Preserves the song mix. Independent vocal gain requires stems.",
                )}
              </p>
            </section>
            <div className="mv-action-bar">
              <div>
                <b>
                  {Math.ceil(current.duration / (current.shotSeconds || 12))}{" "}
                  {t("个独立动态镜头", "independent shots")}
                </b>
                <span>
                  {t(
                    "先编辑分镜，再开始生成",
                    "Review the storyboard before generation",
                  )}
                </span>
              </div>
              <button
                className="btn-primary"
                disabled={!canPlan || Boolean(busy)}
                onClick={() => void create()}
              >
                <Sparkle width={16} />
                {busy === "plan"
                  ? t("正在创建…", "Creating…")
                  : t("创建分镜脚本", "Create storyboard")}
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === "storyboard" &&
        (!project ? (
          <div className="mv-empty">
            <Film width={40} />
            <h2>{t("从歌曲开始你的第一支 MV", "Start with your song")}</h2>
            <p>
              {t(
                "选择歌曲、参考人物和模型后，即可创建可编辑分镜。",
                "Choose your song, reference and video model.",
              )}
            </p>
            <button className="btn-primary" onClick={() => setTab("setup")}>
              {t("设置 MV", "Set up MV")}
            </button>
          </div>
        ) : (
          <>
            <div className="mv-project-bar">
              <div>
                <h2>{project.settings.title}</h2>
                <span>
                  {label(project.status)} · {readyCount}/{project.shots.length}{" "}
                  {t("镜头完成", "shots ready")} ·{" "}
                  {fmtTime(project.settings.duration)}
                </span>
              </div>
              <div className="mv-inline-actions">
                <button
                  className="btn-ghost"
                  disabled={Boolean(busy) || !dirty || Boolean(working)}
                  onClick={() => void save()}
                >
                  {t("保存分镜", "Save storyboard")}
                </button>
                <button
                  className="btn-primary"
                  disabled={
                    Boolean(busy) ||
                    Boolean(working) ||
                    !catalog?.canGenerate ||
                    project.shots.every((s) => s.status === "ready")
                  }
                  onClick={() => void generate()}
                >
                  <Play width={15} />
                  {t("生成全部镜头", "Generate all shots")}
                </button>
              </div>
            </div>
            {project.needsRender && (
              <div className="mv-notice">
                {t(
                  "项目已修改，当前下载仍是上一版成片。请重新合成以应用字幕、镜头或混音修改。",
                  "Edits are saved. Re-render to apply them; downloads still use the previous cut.",
                )}
              </div>
            )}
            <div className="mv-inline-actions mv-render-actions">
              <button
                className="btn-primary"
                disabled={
                  Boolean(busy) ||
                  Boolean(working) ||
                  readyCount !== project.shots.length
                }
                onClick={() => void renderFinal()}
              >
                {project.videoUrl
                  ? t("重新合成 · 保留旧版", "Re-render · keep previous cut")
                  : t("合成成片", "Render final cut")}
              </button>
              <button
                className="btn-ghost"
                disabled={Boolean(busy) || Boolean(working)}
                onClick={() =>
                  void run("archive", async () => {
                    const p = await prepare();
                    await mvApi.archive(p, !p.archived);
                    setProject(null);
                    setProjects(await mvApi.list(archived));
                    setTab("history");
                  })
                }
              >
                {project.archived
                  ? t("恢复项目", "Restore project")
                  : t("归档项目", "Archive project")}
              </button>
              <button
                className="btn-ghost"
                disabled={Boolean(busy) || Boolean(working)}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "删除此 MV 项目及其私有素材？歌曲和已发布到歌曲的视频副本将保留。",
                        "Delete this MV project and its private media? The song and its published video copy remain.",
                      ),
                    )
                  )
                    void run("delete", async () => {
                      await mvApi.remove(project);
                      setProject(null);
                      setProjects(await mvApi.list(archived));
                      setTab("history");
                    });
                }}
              >
                {t("删除项目", "Delete project")}
              </button>
            </div>
            {catalog?.canGenerate && (
              <p className="mv-billing-note">
                {t(
                  "视频按镜头调用 API 账户计费，模型、分辨率和时长会影响费用。创建分镜不调用视频模型。",
                  "Generation is charged to the API account per shot; storyboarding is free of video calls.",
                )}
              </p>
            )}
            {project.error && (
              <div role="alert" className="mv-notice mv-error">
                {project.error}
              </div>
            )}
            <div className="mv-preview-layout">
              <div className="mv-preview">
                {preview ? (
                  <video
                    key={preview}
                    src={preview}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <div className="mv-preview-empty">
                    <Film width={40} />
                    <b>
                      {working
                        ? t("镜头正在生成", "Shots are generating")
                        : t(
                            "你的动态画面将在这里出现",
                            "Your motion preview appears here",
                          )}
                    </b>
                    <p>
                      {t(
                        "可以先生成一个镜头，检查人物和动作。",
                        "Generate one shot first to check character and movement.",
                      )}
                    </p>
                  </div>
                )}
              </div>
              <aside className="mv-preview-meta">
                <span className="eyebrow">PRODUCTION NOTES</span>
                <h3>
                  {t("一镜一镜，完成故事", "Build the story, shot by shot")}
                </h3>
                <p tabIndex={0}>{project.settings.concept}</p>
                <dl>
                  <dt>{t("画面", "Picture")}</dt>
                  <dd>
                    {project.settings.resolution} · {project.settings.ratio}
                  </dd>
                  <dt>{t("字幕", "Captions")}</dt>
                  <dd>
                    {project.settings.subtitles
                      ? t("歌词烧录 + SRT", "Burned in + SRT")
                      : t("关闭", "Off")}
                  </dd>
                  <dt>{t("演出", "Performance")}</dt>
                  <dd>
                    {project.settings.performance === "audio"
                      ? t("音频参考驱动", "Audio reference")
                      : project.settings.performance === "singing"
                        ? t("人物演唱", "Singing")
                        : t("人物叙事", "Story")}
                  </dd>
                </dl>
                <progress
                  aria-label={t("MV 完成进度", "MV progress")}
                  max={project.shots.length}
                  value={readyCount}
                />
                {project.videoUrl ? (
                  <>
                    <a
                      className="btn-primary"
                      href={`${project.videoUrl}?download=1`}
                    >
                      <Download width={16} />
                      {t("下载 MV", "Download MV")}
                    </a>
                    {project.settings.subtitles && (
                      <a
                        className="btn-ghost"
                        href={`/api/mv/projects/${project.id}/subtitles?download=1`}
                      >
                        {t("下载 SRT 字幕", "Download SRT")}
                      </a>
                    )}
                  </>
                ) : null}
              </aside>
            </div>
            <MvProductionPanels
              project={project}
              catalog={catalog}
              busy={Boolean(busy)}
              working={Boolean(working)}
              dirty={dirty}
              onEdit={editProject}
              onReplace={replaceProject}
              run={run}
              onPrepare={prepare}
              onPublished={p=>{replaceProject(p);onRefreshLibrary();}}
              onPreviewVersion={(url) => {
                setPreviewVersion(url);
                setPreviewShot(null);
              }}
            />
            <div
              className="mv-timeline"
              aria-label={t("镜头时间线", "Shot timeline")}
              role="list"
            >
              {project.shots.map((shot) => (
                <button
                  role="listitem"
                  key={shot.id}
                  draggable={!working}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", shot.id)
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorder(e.dataTransfer.getData("text/plain"), shot.id);
                  }}
                  onClick={() => {
                    setPreviewShot(shot.id);
                    setPreviewVersion(null);
                  }}
                  style={{ flexGrow: shot.duration }}
                >
                  <b>{String(shot.index + 1).padStart(2, "0")}</b>
                  <span>{fmtTime(shot.start)}</span>
                  <small>
                    {shot.duration.toFixed(1)}s · {label(shot.status)}
                  </small>
                </button>
              ))}
            </div>
            <div className="mv-shot-grid">
              {project.shots.map((shot) => (
                <article
                  key={shot.id}
                  className={`mv-shot status-${shot.status}`}
                >
                  <header>
                    <span className="mv-shot-number">
                      {String(shot.index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <b>
                        {fmtTime(shot.start)} —{" "}
                        {fmtTime(shot.start + shot.duration)}
                      </b>
                      <small>{shot.duration.toFixed(1)}s</small>
                    </div>
                    <span className="status-chip">{label(shot.status)}</span>
                  </header>
                  <label className="sr-only" htmlFor={`prompt-${shot.id}`}>
                    {t("分镜描述", "Shot direction")} {shot.index + 1}
                  </label>
                  <textarea
                    id={`prompt-${shot.id}`}
                    rows={5}
                    maxLength={4000}
                    value={shot.prompt}
                    disabled={Boolean(working) || Boolean(busy)}
                    onChange={(e) => {
                      setProject({
                        ...project,
                        shots: project.shots.map((s) =>
                          s.id === shot.id
                            ? { ...s, prompt: e.target.value }
                            : s,
                        ),
                      });
                      setDirty(true);
                    }}
                  />
                  <label className="sr-only" htmlFor={`model-${shot.id}`}>
                    {t("分镜模型", "Shot model")} {shot.index + 1}
                  </label>
                  <select
                    id={`model-${shot.id}`}
                    disabled={Boolean(working) || Boolean(busy)}
                    value={shot.model}
                    onChange={(e) => {
                      setProject({
                        ...project,
                        shots: project.shots.map((s) =>
                          s.id === shot.id
                            ? { ...s, model: e.target.value }
                            : s,
                        ),
                      });
                      setDirty(true);
                    }}
                  >
                    {catalog?.models
                      .filter(
                        (m) =>
                          m.maxSeconds >= shot.duration &&
                          m.resolutions.includes(project.settings.resolution) &&
                          m.ratios.includes(project.settings.ratio) &&
                          (project.settings.performance !== "audio" ||
                            m.referenceAudio),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  {shot.error && <p className="mv-shot-error">{shot.error}</p>}
                  <footer>
                    {shot.videoUrl ? (
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setPreviewShot(shot.id);
                          setPreviewVersion(null);
                        }}
                      >
                        <Play width={13} />
                        {t("预览镜头", "Preview shot")}
                      </button>
                    ) : (
                      <button
                        className="btn-ghost"
                        disabled={
                          Boolean(busy) ||
                          Boolean(working) ||
                          !catalog?.canGenerate ||
                          shot.status === "uncertain"
                        }
                        onClick={() => void generate(shot.id)}
                      >
                        {shot.status === "failed" ? (
                          <Refresh width={13} />
                        ) : (
                          <Sparkle width={13} />
                        )}{" "}
                        {shot.status === "failed"
                          ? t("重试此镜头", "Retry shot")
                          : t("生成此镜头", "Generate shot")}
                      </button>
                    )}
                    <small>
                      {shot.providerTaskId
                        ? t("任务已保存", "Task saved")
                        : t("独立生成", "Individual shot")}
                    </small>
                  </footer>
                  <MvShotEditor
                    project={project}
                    shot={shot}
                    index={shot.index}
                    catalog={catalog}
                    busy={Boolean(busy)}
                    working={Boolean(working)}
                    onEdit={editProject}
                    onReplace={replaceProject}
                    run={run}
                    onPrepare={prepare}
                    onRegenerate={() => void generate(shot.id, true)}
                  />
                </article>
              ))}
            </div>
            <details className="mv-card mv-subtitle-editor">
              <summary>{t("字幕校对 / SRT", "Edit captions / SRT")}</summary>
              <label>
                {t("字幕整体偏移（秒）", "Caption offset (seconds)")}
                <input
                  type="number"
                  min={-30}
                  max={30}
                  step={0.05}
                  value={project.settings.subtitleOffset ?? 0}
                  disabled={Boolean(working) || Boolean(busy)}
                  onChange={(e) =>
                    editProject({
                      ...project,
                      settings: {
                        ...project.settings,
                        subtitleOffset: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <textarea
                aria-label="SRT"
                rows={7}
                value={project.settings.srt}
                disabled={Boolean(working) || Boolean(busy)}
                placeholder={t(
                  "可粘贴已校对的 SRT 时间轴；留空使用歌曲对齐结果。",
                  "Paste corrected SRT; leave empty for aligned lyrics.",
                )}
                onChange={(e) => {
                  setProject({
                    ...project,
                    settings: { ...project.settings, srt: e.target.value },
                  });
                  setDirty(true);
                }}
              />
            </details>
          </>
        ))}
      {tab === "history" && (
        <div className="mv-history">
          <label className="mv-check">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                const value = e.target.checked;
                setArchived(value);
                void run("list", async () =>
                  setProjects(await mvApi.list(value)),
                );
              }}
            />
            {t("查看归档项目", "Show archived projects")}
          </label>
          {!projects.length ? (
            <div className="mv-empty">
              <Film width={35} />
              <h2>{t("还没有 MV 项目", "No MV projects yet")}</h2>
              <p>
                {t(
                  "创建分镜后，项目会保存到这里。",
                  "Your storyboards and renders will appear here.",
                )}
              </p>
            </div>
          ) : (
            projects.map((p) => (
              <button
                className="mv-history-item"
                key={p.id}
                onClick={() =>
                  void run("load", async () =>
                    loadProject(await mvApi.get(p.id)),
                  )
                }
              >
                <span className="mv-history-icon">
                  <Film />
                </span>
                <div>
                  <h3>{p.settings.title}</h3>
                  <p>
                    {p.settings.model} · {p.settings.resolution} ·{" "}
                    {fmtTime(p.settings.duration)} · {p.shots.length}{" "}
                    {t("镜头", "shots")}
                  </p>
                </div>
                <span className="status-chip">{label(p.status)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
