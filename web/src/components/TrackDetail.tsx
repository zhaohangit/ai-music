import { useEffect, useMemo, useState } from "react";
import { api, trackCoverUrl } from "../api";
import {
  cropParameterConfig,
  findOperation,
  hasCompleteGenerationOverrides,
  modelAllowsOperation,
  operationGateReason,
  operationStringParameterConfig,
  referenceAudioParameterConfig,
  speedParameterConfig,
} from "../lib/operations";
import { billingPresentation } from "../lib/billing";
import { localizeCatalogText, useI18n } from "../i18n";
import { coverStyle } from "../lib/cover";
import { fmtTime } from "../lib/format";
import {
  isInflight,
  isPlayable,
  modelLabel,
  operationLabel,
  type AssetActionInput,
  type AssetJob,
  type AssetOperation,
  type MusicModelProfile,
  type MusicOperationProfile,
  type Track,
  type TrackActionInput,
} from "../types";
import {
  Album,
  Film,
  Clock,
  Copy,
  Cover,
  Download,
  Extend,
  Languages,
  Music,
  Pause,
  Play,
  Refresh,
  Remaster,
  Reuse,
  Sliders,
  Trash,
  X,
} from "./Icons";
import { ProgressDetail } from "./ProgressDetail";
import { AssetJobsPanel } from "./AssetJobsPanel";
import { SunoActionDialog, type DetailAction } from "./SunoActionDialog";

interface Props {
  track: Track;
  groupSize: number;
  active: boolean;
  playing: boolean;
  models: MusicModelProfile[];
  operations: MusicOperationProfile[];
  operationsError?: string | null;
  accountBalance: number | null;
  onClose: () => void;
  onPlay: (track: Track) => void;
  onDelete: (track: Track) => void;
  onReuse: (track: Track) => void;
  onRetry: (track: Track) => void;
  onAction: (track: Track, input: TrackActionInput) => Promise<void>;
  onCreateMv?: (track: Track) => void;
  onAssetAction: (track: Track, input: AssetActionInput) => Promise<AssetJob>;
}

const ASSET_ACTIONS: DetailAction[] = [
  "aligned_lyrics",
  "video",
  "convert_wav",
  "download_mp3",
  "download_m4a",
];
const isAssetAction = (action: DetailAction): action is AssetOperation =>
  ASSET_ACTIONS.includes(action);
const isAssetInput = (
  input: TrackActionInput | AssetActionInput,
): input is AssetActionInput => isAssetAction(input.action);

const ACTION_COPY: Record<
  DetailAction,
  { label: string; description: string }
> = {
  extend: { label: "续写", description: "从指定秒数继续创作" },
  cover: { label: "重新演绎", description: "保留旋律，改变演唱制作" },
  remaster: { label: "高清重制", description: "提升质感并控制变化程度" },
  upload_extend: { label: "参考续作", description: "继续上传音频来源作品" },
  whole_song: { label: "完整歌曲", description: "把片段扩展成完整结构" },
  crop: { label: "裁剪", description: "按起止秒数创建新版本" },
  speed: { label: "变速", description: "使用服务端允许的倍率" },
  aligned_lyrics: { label: "逐字歌词", description: "生成时间对齐歌词资产" },
  video: { label: "音乐视频", description: "生成可查看下载的视频" },
  download_mp3: { label: "MP3", description: "生成 MP3 下载资产" },
  download_m4a: { label: "M4A", description: "生成 M4A 下载资产" },
  convert_wav: { label: "WAV", description: "转换无损音频资产" },
};
const ACTION_COPY_EN: Record<
  DetailAction,
  { label: string; description: string }
> = {
  extend: { label: "Extend", description: "Continue from a selected second" },
  cover: {
    label: "Reimagine",
    description: "Keep the melody and change the production",
  },
  remaster: {
    label: "Remaster",
    description: "Improve detail with controlled variation",
  },
  upload_extend: {
    label: "Reference continuation",
    description: "Continue from the uploaded source track",
  },
  whole_song: {
    label: "Whole song",
    description: "Expand a clip into a complete structure",
  },
  crop: {
    label: "Crop",
    description: "Create a version from start and end seconds",
  },
  speed: { label: "Speed", description: "Use a server-approved multiplier" },
  aligned_lyrics: {
    label: "Aligned lyrics",
    description: "Create time-aligned lyrics",
  },
  video: {
    label: "Music video",
    description: "Generate a viewable, downloadable video",
  },
  download_mp3: { label: "MP3", description: "Prepare MP3 download" },
  download_m4a: { label: "M4A", description: "Prepare M4A download" },
  convert_wav: {
    label: "WAV",
    description: "Convert to a lossless audio asset",
  },
};

export function TrackDetail({
  track,
  groupSize,
  active,
  playing,
  models,
  operations,
  operationsError = null,
  accountBalance,
  onClose,
  onPlay,
  onDelete,
  onReuse,
  onRetry,
  onAction,
  onAssetAction,
  onCreateMv,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const coverUrl = useMemo(() => trackCoverUrl(track), [track]);
  const [coverFailed, setCoverFailed] = useState(false);
  const [action, setAction] = useState<DetailAction | null>(null);
  const [createdJob, setCreatedJob] = useState<AssetJob | null>(null);

  useEffect(() => setCoverFailed(false), [coverUrl]);
  useEffect(() => {
    setAction(null);
    setCreatedJob(null);
  }, [track.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !action) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, onClose]);

  const inflight = isInflight(track);
  const done = track.status === "done";
  const playable = isPlayable(track);
  const sound = track.operation === "sound";
  const model = models.find((item) => item.id === track.model);
  const billing = billingPresentation(track);
  const billingTone =
    billing.tone === "info"
      ? "tone-accent"
      : billing.tone === "neutral"
        ? ""
        : `tone-${billing.tone}`;

  const operationFor = (candidate: DetailAction) =>
    candidate === "upload_extend" && typeof track.copyrightAudio === "boolean"
      ? findOperation(operations, candidate, {
          copyrightAudio: track.copyrightAudio,
        })
      : findOperation(operations, candidate);

  const gateReason = (candidate: DetailAction): string | null => {
    if (!done) return "作品尚未完成";
    if (!track.customId) return "作品缺少 customId";
    if (operationsError) return operationsError;
    if (candidate === "upload_extend") {
      if (track.operation !== "upload")
        return "只有独立导入的参考音频作品可使用此操作";
      if (track.referenceAudioAvailable !== true)
        return track.referenceAudioAvailable === false
          ? "原始参考音频已不可用"
          : "服务端未确认原始参考音频可用";
      if (typeof track.copyrightAudio !== "boolean")
        return "作品缺少服务端可信的版权音频类型";
      if (
        !Number.isFinite(track.referenceAudioDurationSeconds) ||
        Number(track.referenceAudioDurationSeconds) <= 0
      )
        return "作品缺少服务端可信的参考音频时长";
    }
    const operation = operationFor(candidate);
    const catalogReason = operationGateReason(operation);
    if (catalogReason) return catalogReason;
    if (
      candidate === "extend" ||
      candidate === "cover" ||
      candidate === "upload_extend"
    ) {
      if (!hasCompleteGenerationOverrides(operation))
        return "服务端未声明完整的创作参数覆盖能力";
      if (
        !models.some(
          (candidateModel) =>
            candidateModel.enabled &&
            modelAllowsOperation(candidateModel, candidate, operation),
        )
      )
        return "没有已授权且支持此操作的目标模型";
    } else {
      if (!model) return "模型能力目录中找不到当前模型";
      if (!modelAllowsOperation(model, candidate, operation))
        return "当前模型能力不支持此操作";
    }
    if (accountBalance === null) return "账户可用余额暂不可用";
    if (
      operation?.estimatedCredits !== null &&
      accountBalance < Number(operation?.estimatedCredits)
    )
      return "可用积分不足";
    if (
      candidate === "video" &&
      !track.providerRecordId
    )
      return "作品缺少 providerRecordId";
    if (candidate === "aligned_lyrics") {
      if (!track.lyrics.trim()) return "当前作品没有可对齐的歌词";
      if (!operationStringParameterConfig(operation, "lyrics"))
        return "服务端未返回逐字歌词长度限制";
    }
    if (candidate === "crop") {
      if (!(track.duration > 0)) return "作品时长不可用";
      if (!cropParameterConfig(operation, track.duration))
        return "服务端未返回可解析的裁剪参数范围";
    }
    if (candidate === "speed" && !speedParameterConfig(operation))
      return "服务端未返回完整的变速参数配置";
    if (
      candidate === "upload_extend" &&
      !referenceAudioParameterConfig(operation)
    )
      return "服务端未返回完整的参考音频续作参数";
    return null;
  };

  const rows: Array<[string, string]> = [
    [text("模型", "Model"), modelLabel(track.model)],
    [
      text("类型", "Type"),
      localizeCatalogText(operationLabel(track.operation), language),
    ],
    [
      text("时长", "Duration"),
      track.duration > 0 ? fmtTime(track.duration) : "—",
    ],
    [text("格式", "Format"), track.format.toLocaleUpperCase()],
    ...(sound
      ? [
          [
            "BPM",
            typeof track.soundTempo === "number"
              ? String(track.soundTempo)
              : text("未指定", "Not set"),
          ] as [string, string],
          [
            text("调性", "Key"),
            track.soundKey?.trim() || text("未指定", "Not set"),
          ] as [string, string],
          [
            text("播放方式", "Playback"),
            typeof track.soundLoop === "boolean"
              ? track.soundLoop
                ? text("无缝循环", "Seamless loop")
                : text("单次播放", "One-shot")
              : text("未指定", "Not set"),
          ] as [string, string],
        ]
      : [
          [
            text("声线", "Voice"),
            track.instrumental
              ? text("纯音乐", "Instrumental")
              : track.vocalGender === "m"
                ? text("男声", "Male")
                : track.vocalGender === "f"
                  ? text("女声", "Female")
                  : text("自动", "Auto"),
          ] as [string, string],
          [
            text("风格强度", "Style strength"),
            `${Math.round(track.styleWeight * 100)}%`,
          ] as [string, string],
          [
            text("创意度", "Creativity"),
            `${Math.round(track.weirdness * 100)}%`,
          ] as [string, string],
        ]),
    [
      text("创建时间", "Created"),
      new Date(track.createdAt).toLocaleString(language),
    ],
    ...(track.finishedAt
      ? [
          [
            text("完成时间", "Completed"),
            new Date(track.finishedAt).toLocaleString(language),
          ] as [string, string],
        ]
      : []),
    [text("批次账单", "Batch billing"), billing.label],
  ];

  const copy = (value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "")
      void navigator.clipboard.writeText(String(value));
  };

  const openAction = (candidate: DetailAction) => {
    if (!gateReason(candidate)) setAction(candidate);
  };

  const submitAction = async (input: TrackActionInput | AssetActionInput) => {
    if (isAssetInput(input)) {
      const job = await onAssetAction(track, input);
      setCreatedJob(job);
    } else {
      await onAction(track, input);
    }
  };

  const actionButton = (candidate: DetailAction, Icon: typeof Extend) => {
    const reason = gateReason(candidate);
    const operation = operationFor(candidate);
    const copy =
      language === "zh-CN" ? ACTION_COPY[candidate] : ACTION_COPY_EN[candidate];
    return (
      <button
        type="button"
        className="suno-action-button"
        aria-label={copy.label}
        disabled={Boolean(reason)}
        title={reason || copy.description}
        onClick={() => openAction(candidate)}
      >
        <span className="suno-action-icon">
          <Icon width={16} height={16} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <strong>{copy.label}</strong>
          <small>
            {reason ||
              `${operation?.estimatedCredits} ${text("积分", "credits")} · ${copy.description}`}
          </small>
        </span>
      </button>
    );
  };

  const selectedOperation = action ? operationFor(action) : undefined;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm 2xl:hidden"
        onClick={onClose}
        aria-label={text("关闭作品详情", "Close track details")}
      />
      <aside
        className="track-detail fixed inset-y-0 right-0 z-40 flex w-full max-w-[430px] shrink-0 flex-col border-l border-[var(--line)] bg-[var(--surface-1)]/96 shadow-2xl backdrop-blur-xl 2xl:static 2xl:z-auto 2xl:w-[410px] 2xl:shadow-none"
        aria-label={text("作品详情", "Track details")}
      >
        <div className="flex h-[70px] shrink-0 items-center justify-between border-b border-[var(--line)] px-5">
          <div>
            <div className="label">{text("作品详情", "Track details")}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {groupSize > 1
                ? `${sound ? text("双音效版本", "Two sound-effect versions") : text("双版本", "Two versions")} · ${text("版本", "Take")} ${track.takeIndex + 1}`
                : localizeCatalogText(
                    operationLabel(track.operation),
                    language,
                  )}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={text("关闭详情", "Close details")}
            title={text("关闭（Esc）", "Close (Esc)")}
          >
            <X width={18} height={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div
            className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-3xl shadow-[0_24px_70px_rgba(0,0,0,.35)]"
            style={!coverUrl || coverFailed ? coverStyle(track.id) : undefined}
          >
            {coverUrl && !coverFailed && (
              <img
                src={coverUrl}
                alt={`${track.title} ${text("封面", "cover")}`}
                className="h-full w-full object-cover"
                onError={() => setCoverFailed(true)}
              />
            )}
            {playable && (
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center bg-black/15 text-white transition hover:bg-black/35"
                onClick={() => onPlay(track)}
                aria-label={
                  active && playing
                    ? text("暂停", "Pause")
                    : text("播放", "Play")
                }
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/35 shadow-xl backdrop-blur-md">
                  {active && playing ? (
                    <Pause width={28} height={28} />
                  ) : (
                    <Play width={28} height={28} />
                  )}
                </span>
              </button>
            )}
            {inflight && (
              <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white backdrop-blur">
                {Math.round(track.progress * 100)}%
              </span>
            )}
          </div>

          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold leading-tight text-main">
                  {track.title || text("未命名作品", "Untitled track")}
                </h2>
                <p className="mt-1.5 text-xs text-muted">
                  {modelLabel(track.model)} ·{" "}
                  {localizeCatalogText(
                    operationLabel(track.operation),
                    language,
                  )}{" "}
                  ·{" "}
                  {done
                    ? text("已完成", "Completed")
                    : track.status === "error"
                      ? text("失败", "Failed")
                      : text("生成中", "Generating")}
                </p>
              </div>
              <span
                className={`status-chip shrink-0 ${billingTone}`}
                title={billing.detail}
              >
                {billing.label}
              </span>
            </div>
          </div>

          {inflight && <ProgressDetail track={track} />}
          {track.status === "error" && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/8 px-3 py-2.5 text-xs leading-relaxed text-rose-300">
              {track.error || text("生成失败", "Generation failed")} ·{" "}
              {billing.detail}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {playable && (
              <a
                className="btn-primary flex-1"
                href={api.downloadUrl(track.id)}
              >
                <Download width={15} height={15} />{" "}
                {text("下载音频", "Download audio")}
              </a>
            )}
            <button
              type="button"
              className="btn-ghost flex-1 border !border-[var(--line)]"
              onClick={() => onReuse(track)}
            >
              <Reuse width={15} height={15} />{" "}
              {text("复用参数", "Reuse settings")}
            </button>
            {track.status === "error" && (
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                onClick={() => onRetry(track)}
              >
                <Refresh width={15} height={15} /> {text("重试", "Retry")}
              </button>
            )}
          </div>

          <section>
            <div className="mb-3">
              <h3 className="label">{text("继续创作", "Continue creating")}</h3>
              <p className="mt-1 text-[10px] leading-4 text-muted">
                {text(
                  "能力、标识、余额与 ModelCross 动态价格全部满足后才可提交。",
                  "Submission is available when capability, identifiers, balance and ModelCross live pricing are all valid.",
                )}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {actionButton("extend", Extend)}
              {track.operation === "upload" &&
                actionButton("upload_extend", Music)}
              {actionButton("whole_song", Music)}
              {actionButton("cover", Cover)}
              {actionButton("remaster", Remaster)}
            </div>
          </section>

          <section>
            <h3 className="label mb-3">
              {text("编辑与版本", "Edit & versions")}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {actionButton("crop", Sliders)}
              {actionButton("speed", Clock)}
            </div>
          </section>
          <section>
            <h3 className="label mb-3">
              {text("AI 与媒体资产", "AI & media assets")}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {actionButton("aligned_lyrics", Languages)}
              {actionButton("video", Album)}
              {done && onCreateMv && <button className="btn-primary" onClick={() => onCreateMv(track)}><Film width={17} />{text("创作人物 MV", "Create character MV")}</button>}
              {actionButton("convert_wav", Download)}
              {actionButton("download_mp3", Download)}
              {actionButton("download_m4a", Download)}
            </div>
          </section>

          {done && <AssetJobsPanel track={track} createdJob={createdJob} />}

          {(track.style || track.description) && (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="label">
                  {sound
                    ? text("音效风格与描述", "Sound style & description")
                    : text("风格与描述", "Style & description")}
                </h3>
                <button
                  type="button"
                  className="icon-btn -mr-2 -mt-2"
                  onClick={() => copy(track.style || track.description)}
                  aria-label={
                    sound
                      ? text("复制音效描述", "Copy sound description")
                      : text("复制风格描述", "Copy style description")
                  }
                >
                  <Copy width={14} height={14} />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-6 text-muted">
                {track.style || track.description}
              </p>
              {!sound && track.negativeTags && (
                <p className="mt-3 border-t border-[var(--line)] pt-3 text-[11px] text-subtle">
                  {text("排除：", "Exclude: ")}
                  {track.negativeTags}
                </p>
              )}
            </section>
          )}

          {!track.instrumental && track.lyrics && (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="label">{text("歌词", "Lyrics")}</h3>
                <button
                  type="button"
                  className="icon-btn -mr-2 -mt-2"
                  onClick={() => copy(track.lyrics)}
                  aria-label={text("复制歌词", "Copy lyrics")}
                >
                  <Copy width={14} height={14} />
                </button>
              </div>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-6 text-muted">
                {track.lyrics}
              </pre>
            </section>
          )}

          <section className="rounded-2xl border border-[var(--line)] bg-black/10 p-4">
            <h3 className="label mb-3">
              {text("生成信息", "Generation info")}
            </h3>
            <dl className="space-y-2 text-xs">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4"
                >
                  <dt className="text-subtle">{label}</dt>
                  <dd className="text-right tabular-nums text-muted">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {track.upstreamTaskId && (
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[9px] font-mono text-subtle hover:text-muted"
                onClick={() => copy(track.upstreamTaskId)}
              >
                <span className="truncate">task · {track.upstreamTaskId}</span>
                <Copy width={12} height={12} />
              </button>
            )}
            {track.customId && (
              <button
                type="button"
                className="mt-2 flex w-full items-center justify-between gap-2 text-[9px] font-mono text-subtle hover:text-muted"
                onClick={() => copy(track.customId)}
              >
                <span className="truncate">custom · {track.customId}</span>
                <Copy width={12} height={12} />
              </button>
            )}
            {track.providerRecordId && (
              <button
                type="button"
                className="mt-2 flex w-full items-center justify-between gap-2 text-[9px] font-mono text-subtle hover:text-muted"
                onClick={() => copy(track.providerRecordId)}
              >
                <span className="truncate">
                  provider · {track.providerRecordId}
                </span>
                <Copy width={12} height={12} />
              </button>
            )}
          </section>

          <button
            type="button"
            className="btn-ghost w-full border !border-rose-500/15 text-rose-400 hover:!bg-rose-500/8"
            disabled={inflight}
            title={
              inflight
                ? text(
                    "任务结算前不可删除",
                    "Cannot delete before task settlement",
                  )
                : undefined
            }
            onClick={() => onDelete(track)}
          >
            {inflight ? (
              <X width={15} height={15} />
            ) : (
              <Trash width={15} height={15} />
            )}{" "}
            {inflight
              ? text("结算后可删除", "Delete after settlement")
              : text("删除作品", "Delete track")}
          </button>
        </div>
      </aside>

      {action && selectedOperation && !gateReason(action) && (
        <SunoActionDialog
          action={action}
          track={track}
          model={model}
          models={models}
          operation={selectedOperation}
          accountBalance={accountBalance}
          onClose={() => setAction(null)}
          onSubmit={submitAction}
        />
      )}
    </>
  );
}
