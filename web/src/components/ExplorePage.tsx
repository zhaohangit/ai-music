import { useMemo, useState } from "react";
import { trackCoverUrl } from "../api";
import { coverStyle } from "../lib/cover";
import { fmtTime } from "../lib/format";
import { operationHasQuote } from "../lib/operations";
import {
  isPlayable,
  type GenerationInput,
  type Health,
  type MusicModelProfile,
  type MusicOperationProfile,
  type Track,
} from "../types";
import { useI18n } from "../i18n";
import {
  Album,
  ArrowRight,
  Clock,
  Compass,
  Flame,
  Music,
  Pause,
  Play,
  Sparkle,
  Wand,
} from "./Icons";

interface Props {
  tracks: Track[];
  models: MusicModelProfile[];
  generationOperation?: MusicOperationProfile;
  health?: Health | null;
  accountBalance: number | null;
  activeId: string | null;
  selectedId: string | null;
  playing: boolean;
  onPlay: (track: Track) => void;
  onSelect: (track: Track) => void;
  onDelete: (track: Track) => void;
  onReuse: (track: Track) => void;
  onRetry: (track: Track) => void;
  onSubmit: (input: GenerationInput) => Promise<void>;
  onNavigateCreate: () => void;
  publicMode?: boolean;
  onLogin?: () => void;
}

export function ExplorePage({
  tracks,
  models,
  generationOperation,
  health = null,
  accountBalance,
  activeId,
  selectedId,
  playing,
  onPlay,
  onSelect,
  onDelete,
  onReuse,
  onRetry,
  onSubmit,
  onNavigateCreate,
  publicMode = false,
  onLogin,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(
    models.find((model) => model.enabled)?.id ?? "",
  );
  const [tab, setTab] = useState<
    "recommended" | "trending" | "latest" | "playlists" | "active"
  >("recommended");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const enabledModels = useMemo(
    () => models.filter((model) => model.enabled),
    [models],
  );
  const selectedModel =
    enabledModels.find((model) => model.id === modelId) ?? enabledModels[0];
  const quote = operationHasQuote(generationOperation)
    ? Number(generationOperation?.estimatedCredits)
    : null;
  const serviceReady = Boolean(
    health?.configured && health.upstreamReachable && health.ready,
  );
  const serviceLabel = publicMode
    ? text("只读预览 · 登录后生成", "Read-only preview · sign in to generate")
    : !health
      ? text("正在连接 ModelCross", "Connecting to ModelCross")
      : serviceReady
        ? text(
            "ModelCross 已连接 · 可开始创作",
            "ModelCross connected · ready to create",
          )
        : text(
            "ModelCross 未连接 · 暂不可用",
            "ModelCross unavailable · try again later",
          );
  const visibleTracks = useMemo(() => {
    if (tab === "active")
      return tracks.filter((track) =>
        ["queued", "running"].includes(track.status),
      );
    if (tab === "trending")
      return [...tracks].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    if (tab === "latest")
      return [...tracks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return tracks;
  }, [tab, tracks]);

  const inspirations = [
    [
      text("赛博朋克", "Cyberpunk"),
      "cyberpunk synthwave, analog synth leads, nocturnal city, 128 bpm",
    ],
    [
      text("雨夜 Lo-Fi", "Rainy-night Lo-Fi"),
      "lo-fi chillhop, warm rhodes piano, vinyl crackle, 78 bpm",
    ],
    [
      text("电影配乐", "Cinematic score"),
      "cinematic orchestral, intimate piano, dramatic crescendo, 90 bpm",
    ],
    [
      text("夏日 City Pop", "Summer City Pop"),
      "80s city pop, funky bass, bright brass, summer night, 116 bpm",
    ],
    [
      text("轻柔女声", "Soft female vocal"),
      "expressive female vocal, dream pop, soft guitar, wide harmonies",
    ],
    [
      text("纯音乐", "Instrumental"),
      "instrumental melodic techno, atmospheric pads, deep bass, 126 bpm",
    ],
  ] as const;
  const inspirationShelves = [
    [
      text("赛博霓虹夜行", "Neon night ride"),
      "Synthwave · Electronic",
      "from-violet-500 to-cyan-500",
    ],
    [
      text("雨夜咖啡厅", "Rainy cafe"),
      "Lo-Fi · Chillhop",
      "from-slate-500 to-indigo-700",
    ],
    [
      text("电影交响画卷", "Cinematic panorama"),
      "Cinematic · Orchestral",
      "from-amber-500 to-rose-600",
    ],
    [
      text("未来低音电音", "Future bass"),
      "Future Bass · EDM",
      "from-cyan-500 to-blue-700",
    ],
  ] as const;

  const renderTrackCard = (track: Track) => {
    const coverUrl = trackCoverUrl(track);
    const playable = isPlayable(track);
    return (
      <article
        key={track.id}
        className={`explore-track-card group ${selectedId === track.id ? "explore-track-card-selected" : ""}`}
      >
        <button
          type="button"
          className="explore-track-cover"
          style={!coverUrl ? coverStyle(track.id) : undefined}
          onClick={() => playable && onPlay(track)}
          aria-label={
            playable
              ? `${playing && activeId === track.id ? text("暂停", "Pause") : text("播放", "Play")} ${track.title || text("未命名作品", "Untitled track")}`
              : `${track.title || text("未命名作品", "Untitled track")} ${text("尚未完成", "is not ready yet")}`
          }
        >
          {coverUrl && (
            <img
              src={coverUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}
          <span className="explore-track-overlay">
            {playing && activeId === track.id ? (
              <Pause width={19} height={19} />
            ) : playable ? (
              <Play width={19} height={19} />
            ) : (
              <Clock width={18} height={18} />
            )}
          </span>
          <span className="explore-track-status">
            {track.status === "done"
              ? text("完成", "Done")
              : track.status === "error"
                ? text("失败", "Failed")
                : `${Math.round(track.progress * 100)}%`}
          </span>
        </button>
        <div className="mt-3 flex min-w-0 items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => onSelect(track)}
          >
            <h3 className="truncate text-sm font-semibold text-main group-hover:text-accent">
              {track.title || text("未命名作品", "Untitled track")}
            </h3>
            <p className="mt-1 truncate text-xs text-muted">
              {track.style ||
                track.description ||
                (track.instrumental
                  ? text("纯音乐", "Instrumental")
                  : "AI Music Studio")}
            </p>
          </button>
          <button
            type="button"
            className="icon-btn !min-h-9 !min-w-9"
            onClick={() => onReuse(track)}
            aria-label={`${text("复用", "Reuse")} ${track.title || text("未命名作品", "Untitled track")} ${text("参数", "settings")}`}
          >
            <Wand width={14} height={14} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-subtle">
          <span>{track.model}</span>
          <span>{track.duration > 0 ? fmtTime(track.duration) : "—"}</span>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1 border-t border-[var(--line)] pt-2">
          <button
            type="button"
            className="icon-btn !min-h-9 !min-w-9"
            onClick={() => onDelete(track)}
            aria-label={`${text("删除", "Delete")} ${track.title || text("未命名作品", "Untitled track")}`}
          >
            ×
          </button>
          {track.status === "error" && (
            <button
              type="button"
              className="icon-btn !min-h-9 !min-w-9"
              onClick={() => onRetry(track)}
              aria-label={`${text("重试", "Retry")} ${track.title || text("未命名作品", "Untitled track")}`}
            >
              <ArrowRight width={14} height={14} />
            </button>
          )}
        </div>
      </article>
    );
  };

  const appendInspiration = (value: string) =>
    setPrompt((current) =>
      current.trim() ? `${current.trim()}, ${value}` : value,
    );
  const submit = async () => {
    if (!prompt.trim() || !selectedModel) return;
    if (publicMode) {
      onLogin?.();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        mode: "simple",
        title: "",
        description: prompt.trim(),
        style: "",
        lyrics: "",
        instrumental: false,
        model: selectedModel.id,
        negativeTags: "",
        vocalGender: "auto",
        styleWeight: 0.65,
        weirdness: 0.5,
      });
      setPrompt("");
    } catch (cause) {
      setSubmitError(
        cause instanceof Error
          ? cause.message
          : text("提交失败，请稍后重试", "Submission failed. Try again later."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-scroll explore-page">
      <div className="mx-auto w-full max-w-[1320px] space-y-4 p-4 sm:p-5 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className={`status-chip ${serviceReady ? "tone-success" : "tone-warning"}`}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />{" "}
            {serviceLabel}
          </div>
          <span className="hidden text-xs text-muted sm:inline">
            {text("输入灵感，开始创作", "Enter an idea and start creating")}
          </span>
        </div>

        <section className="explore-hero surface-card overflow-hidden p-5 sm:p-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-main sm:text-4xl">
              {text("今天想听见什么？", "What do you want to hear today?")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted">
              {text(
                "输入你脑海中的风格、情绪或律动，即刻开启 AI 音乐创作。",
                "Describe a style, mood or rhythm and start creating AI music instantly.",
              )}
            </p>
          </div>
          <div className="mt-1 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <textarea
              aria-label={text("描述你的音乐灵感", "Describe your music idea")}
              className="field min-h-24 resize-y border-0 bg-transparent p-2 text-base leading-7 shadow-none focus:ring-0"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={text(
                "描述你想听的音乐风格、乐器、情绪或故事（例如：80年代赛博朋克、清亮女声、128 BPM、Lo-Fi 雨夜咖啡馆……）",
                "Describe the style, instruments, mood or story you want to hear (e.g. 80s cyberpunk, bright vocals, 128 BPM, a lo-fi rainy cafe…)",
              )}
              maxLength={2000}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {inspirations.map(([label, value]) => (
                <button
                  type="button"
                  className="idea-chip"
                  key={label}
                  onClick={() => appendInspiration(value)}
                >
                  <Sparkle width={12} height={12} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <label htmlFor="explore-model" className="font-medium">
                  {text("模型", "Model")}
                </label>
                <select
                  id="explore-model"
                  className="field !min-h-10 !w-auto !py-2 text-xs"
                  value={selectedModel?.id ?? ""}
                  onChange={(event) => setModelId(event.target.value)}
                  disabled={!enabledModels.length}
                >
                  {enabledModels.length ? (
                    enabledModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                      </option>
                    ))
                  ) : (
                    <option value="">
                      {text("暂无已授权模型", "No authorized models")}
                    </option>
                  )}
                </select>
                <span className="status-chip">
                  <Sparkle width={11} height={11} />{" "}
                  {publicMode
                    ? text("登录后读取报价", "Sign in to view pricing")
                    : quote !== null
                      ? `${text("预计", "Est.")} ${quote} ${text("积分", "credits")}`
                      : text("价格同步中", "Syncing price")}
                </span>
                {accountBalance !== null && (
                  <span className="text-subtle">
                    {text("余额", "Balance")} {accountBalance.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={onNavigateCreate}
                >
                  <Wand width={14} height={14} />{" "}
                  {text("高级参数", "Advanced settings")}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    !prompt.trim() ||
                    !selectedModel ||
                    submitting ||
                    (!publicMode && !serviceReady)
                  }
                  onClick={() => void submit()}
                >
                  <Play width={14} height={14} />{" "}
                  {publicMode
                    ? text("登录后生成", "Sign in to generate")
                    : submitting
                      ? text("提交中…", "Submitting…")
                      : text("生成双版本", "Generate two versions")}
                </button>
              </div>
            </div>
            {submitError && (
              <p
                className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-300"
                role="alert"
              >
                {submitError}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="explore-feed-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="eyebrow">
                {text("你的创作流", "Your creative feed")}
              </span>
              <h2
                id="explore-feed-title"
                className="mt-1 text-xl font-semibold text-main"
              >
                {tab === "trending"
                  ? text("热门作品", "Trending tracks")
                  : tab === "latest"
                    ? text("最新作品", "Latest tracks")
                    : tab === "active"
                      ? text("进行中的任务", "Active tasks")
                      : text("社区与精选作品", "Community picks")}
              </h2>
            </div>
            <div
              className="segmented"
              role="tablist"
              aria-label={text("探索分类", "Explore categories")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "recommended"}
                className={tab === "recommended" ? "active" : ""}
                onClick={() => setTab("recommended")}
              >
                <Compass width={13} height={13} /> {text("推荐", "Recommended")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "trending"}
                className={tab === "trending" ? "active" : ""}
                onClick={() => setTab("trending")}
              >
                <Flame width={13} height={13} /> {text("热门", "Trending")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "latest"}
                className={tab === "latest" ? "active" : ""}
                onClick={() => setTab("latest")}
              >
                <Clock width={13} height={13} /> {text("最新", "Latest")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "playlists"}
                className={tab === "playlists" ? "active" : ""}
                onClick={() => setTab("playlists")}
              >
                <Album width={13} height={13} />{" "}
                {text("灵感集", "Inspiration sets")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "active"}
                className={tab === "active" ? "active" : ""}
                onClick={() => setTab("active")}
              >
                {text("进行中", "Active")}
              </button>
            </div>
          </div>
          {tab === "playlists" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {inspirationShelves.map(([title, genre, gradient]) => (
                <button
                  type="button"
                  key={title}
                  className="explore-shelf-card"
                  onClick={() => {
                    setPrompt(`${genre}, `);
                    setTab("recommended");
                  }}
                >
                  <span
                    className={`explore-shelf-cover bg-gradient-to-br ${gradient}`}
                  >
                    <span className="cover-noise" />
                    <Album width={25} height={25} />
                  </span>
                  <span className="mt-3 block truncate text-left text-sm font-semibold text-main">
                    {title}
                  </span>
                  <span className="mt-1 block text-left text-xs text-muted">
                    {genre}
                  </span>
                  <span className="mt-3 block text-left text-[11px] text-accent">
                    {text("应用这组灵感 →", "Use this inspiration →")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {tab === "recommended" && (
                <section aria-labelledby="explore-shelves-title">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Album width={15} height={15} className="text-accent" />
                      <h2
                        id="explore-shelves-title"
                        className="text-base font-semibold text-main"
                      >
                        {text("风格与主题歌单", "Style & theme playlists")}
                      </h2>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent"
                      onClick={() => setTab("playlists")}
                    >
                      {text("查看全部", "View all")}{" "}
                      <ArrowRight
                        width={13}
                        height={13}
                        className="ml-1 inline"
                      />
                    </button>
                  </div>
                  <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                    {inspirationShelves.map(([title, genre, gradient]) => (
                      <button
                        type="button"
                        key={title}
                        className="explore-shelf-card min-w-[220px] snap-start p-3"
                        onClick={() => {
                          setPrompt(`${genre}, `);
                          setTab("recommended");
                        }}
                      >
                        <span
                          className={`explore-shelf-cover bg-gradient-to-br ${gradient}`}
                        >
                          <span className="cover-noise" />
                          <Album width={22} height={22} />
                        </span>
                        <span className="mt-2 block truncate text-left text-sm font-semibold text-main">
                          {title}
                        </span>
                        <span className="mt-1 block truncate text-left text-xs text-muted">
                          {genre}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {visibleTracks.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {visibleTracks.map(renderTrackCard)}
                </div>
              ) : (
                <div className="empty-state !min-h-64">
                  <span className="feature-icon">
                    <Music width={22} height={22} />
                  </span>
                  <h2>
                    {tab === "active"
                      ? text("当前没有进行中的任务", "No active tasks")
                      : text("还没有作品", "No tracks yet")}
                  </h2>
                  <p>
                    {tab === "active"
                      ? text(
                          "提交一条灵感后，进度会实时出现在这里。",
                          "Submit an idea and its progress will appear here.",
                        )
                      : text(
                          "先输入一句灵感，生成你的第一首歌。",
                          "Enter an idea to generate your first track.",
                        )}
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={onNavigateCreate}
                  >
                    {text("打开创作工作台", "Open creation workbench")}{" "}
                    <ArrowRight width={14} height={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
