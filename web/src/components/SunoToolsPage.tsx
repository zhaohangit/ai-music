import { useEffect, useMemo, useState } from "react";
import {
  findOperation,
  operationGateReason,
  operationHasQuote,
} from "../lib/operations";
import { localizeCatalogText, useI18n } from "../i18n";
import type {
  AiAssistAction,
  MusicOperationProfile,
  SunoOperation,
  Track,
} from "../types";
import type { View } from "./Sidebar";
import {
  ArrowRight,
  Check,
  Clock,
  Cpu,
  Download,
  Extend,
  Library,
  Lock,
  Music,
  PenLine,
  Refresh,
  Remaster,
  Sliders,
  Sparkle,
  Wand,
} from "./Icons";

interface Props {
  tracks: Track[];
  operations: MusicOperationProfile[];
  loading: boolean;
  error: string | null;
  initialPrompt: string;
  initialTrackId?: string;
  onNavigate: (view: View) => void;
  onOpenTrack: (track: Track) => void;
  onUsePrompt: (prompt: string) => void;
  onOpenAi: (action: AiAssistAction) => void;
  onRetry: () => void;
}

interface ToolDefinition {
  action: SunoOperation;
  title: [string, string];
  description: [string, string];
  destination: "create" | "track";
  icon: typeof Music;
}

const CREATION_TOOLS: ToolDefinition[] = [
  {
    action: "generate",
    title: ["双版本音乐生成", "Two-version music generation"],
    description: [
      "从灵感或自定义歌词生成两个可独立继续创作的版本。",
      "Generate two independent versions from an idea or custom lyrics.",
    ],
    destination: "create",
    icon: Sparkle,
  },
  {
    action: "sound",
    title: ["AI 音效生成", "AI sound effects"],
    description: [
      "生成可循环或单次使用的环境、转场与拟声音效。",
      "Create ambient, transition and foley effects for looping or one-shot use.",
    ],
    destination: "create",
    icon: Music,
  },
  {
    action: "upload",
    title: ["参考音频导入", "Import reference audio"],
    description: [
      "上传私有音频到 OSS，并按当前账户权限导入 Provider。",
      "Upload private audio to OSS and import it into the Provider with this account’s access.",
    ],
    destination: "create",
    icon: Download,
  },
  {
    action: "upload_extend",
    title: ["参考音频续作", "Continue from reference audio"],
    description: [
      "基于已上传音频选择续作起点、方向与音频权重。",
      "Choose a continuation point, direction and audio weight from an uploaded track.",
    ],
    destination: "create",
    icon: Extend,
  },
];

const TRACK_TOOLS: ToolDefinition[] = [
  ...(["mp3", "m4a"] as const).map(format => ({ action: `download_${format}` as SunoOperation, title: [`${format.toUpperCase()} 下载`, `${format.toUpperCase()} download`] as [string,string], description: ["创建对应格式的音频下载任务，保存为私有资产。", "Prepare and persist a format-specific audio file."] as [string,string], destination: "track" as const, icon: Download })),
  {
    action: "extend",
    title: ["歌曲续写", "Extend track"],
    description: [
      "从现有作品的指定位置继续生成两个新版本。",
      "Generate two new versions from a selected point in an existing track.",
    ],
    destination: "track",
    icon: Extend,
  },
  {
    action: "cover",
    title: ["翻唱与重构", "Cover & rebuild"],
    description: [
      "保留歌曲核心内容，重新指定风格、人声与编排方向。",
      "Keep the song’s core while changing style, vocals and arrangement.",
    ],
    destination: "track",
    icon: Refresh,
  },
  {
    action: "remaster",
    title: ["高清重制", "Remaster"],
    description: [
      "对已完成作品执行 subtle、normal 或 high 强度重制。",
      "Remaster a completed track at subtle, normal or high intensity.",
    ],
    destination: "track",
    icon: Remaster,
  },
  {
    action: "whole_song",
    title: ["获取完整歌曲", "Get whole song"],
    description: [
      "将续作片段与来源作品整理为一首完整歌曲资产。",
      "Combine a continuation and its source into one complete song asset.",
    ],
    destination: "track",
    icon: Music,
  },
  {
    action: "crop",
    title: ["音频裁剪", "Crop audio"],
    description: [
      "按服务端动态时长边界截取作品片段。",
      "Trim a track using the server’s dynamic duration limits.",
    ],
    destination: "track",
    icon: Sliders,
  },
  {
    action: "speed",
    title: ["变速与保调", "Speed & preserve pitch"],
    description: [
      "按接口目录允许的倍率变速，并可选择保持音高。",
      "Change speed using catalog limits, with optional pitch preservation.",
    ],
    destination: "track",
    icon: Clock,
  },
  {
    action: "aligned_lyrics",
    title: ["逐字歌词", "Aligned lyrics"],
    description: [
      "生成可持久恢复、预览和下载的对齐歌词资产。",
      "Create aligned lyrics that can be restored, previewed and downloaded.",
    ],
    destination: "track",
    icon: PenLine,
  },
  {
    action: "video",
    title: ["Suno 音乐视频", "Suno music video"],
    description: [
      "为已完成歌曲提交视频生成与资产持久化作业。",
      "Submit a video-generation job and persist the result for a completed song.",
    ],
    destination: "track",
    icon: Cpu,
  },
  {
    action: "convert_wav",
    title: ["WAV 转换", "WAV conversion"],
    description: [
      "生成服务端持久化的 WAV 文件并提供受控下载。",
      "Create a server-persisted WAV file with a controlled download.",
    ],
    destination: "track",
    icon: Download,
  },
];

const PLANNED_TOOLS = [
  [
    ["5 轨音频分离", "5-stem separation"],
    "Stem Separator",
    [
      "当前 MXAPI / ModelCross 音乐合同未提供可执行端点。",
      "The MXAPI / ModelCross music contract has no executable endpoint yet.",
    ],
  ],
  [
    ["MIDI 乐谱提取", "MIDI extraction"],
    "MIDI Extractor",
    [
      "当前没有服务端任务、结果格式或计费合同。",
      "No server task, result format or billing contract is available yet.",
    ],
  ],
  [
    ["Web DAW 编排", "Browser DAW"],
    "Browser DAW",
    [
      "当前项目没有可持久化工程与混音后端。",
      "This project has no persistent project or mixing backend yet.",
    ],
  ],
] as const;

function CapabilityCard({
  definition,
  profile,
  selectedTrack,
  onNavigate,
  onOpenTrack,
}: {
  definition: ToolDefinition;
  profile?: MusicOperationProfile;
  selectedTrack: Track | null;
  onNavigate: (view: View) => void;
  onOpenTrack: (track: Track) => void;
}) {
  const { language } = useI18n();
  const text = (pair: [string, string]) =>
    language === "zh-CN" ? pair[0] : pair[1];
  const Icon = definition.icon;
  const unavailable = operationGateReason(profile);
  const quoted = operationHasQuote(profile);
  const executable = !unavailable;
  const outputCount = profile?.outputCount;
  const open = () => {
    if (definition.destination === "create") {
      onNavigate("create");
      return;
    }
    if (selectedTrack) onOpenTrack(selectedTrack);
    else onNavigate("create");
  };

  return (
    <article className="capability-card">
      <div className="flex items-start justify-between gap-3">
        <span className="feature-icon">
          <Icon width={19} height={19} />
        </span>
        <span
          className={`status-chip ${executable ? "tone-success" : "tone-warning"}`}
        >
          {executable ? (
            <Check width={11} height={11} />
          ) : (
            <Lock width={11} height={11} />
          )}
          {executable
            ? text(["当前可用", "Available"])
            : text(["暂不可用", "Unavailable"])}
        </span>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-main">
          {text(definition.title)}
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted">
          {text(definition.description)}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="capability-metric">
          <dt>{text(["预计积分", "Estimated credits"])}</dt>
          <dd>
            {quoted ? Number(profile?.estimatedCredits).toLocaleString() : "—"}
          </dd>
        </div>
        <div className="capability-metric">
          <dt>{text(["输出数量", "Output count"])}</dt>
          <dd>
            {Number.isFinite(outputCount)
              ? outputCount
              : text(["动态", "Dynamic"])}
          </dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-[var(--line)] pt-3">
        {executable ? (
          <button
            type="button"
            className="btn-ghost w-full justify-between border !border-[var(--line)]"
            onClick={open}
          >
            {definition.destination === "create"
              ? text(["打开创作工作台", "Open creation workbench"])
              : selectedTrack
                ? `${text(["处理「", "Process “"])}${selectedTrack.title || text(["未命名作品", "Untitled track"])}${text(["」", "”"])}`
                : text(["先创作一首作品", "Create a track first"])}
            <ArrowRight width={13} height={13} />
          </button>
        ) : (
          <p className="min-h-11 text-[11px] leading-5 text-muted">
            {unavailable
              ? localizeCatalogText(unavailable, language)
              : text([
                  "服务端尚未返回能力与价格目录。",
                  "The server has not returned a capability or pricing catalog yet.",
                ])}
          </p>
        )}
      </div>
    </article>
  );
}

export function SunoToolsPage({
  tracks,
  operations,
  loading,
  error,
  initialPrompt,
  initialTrackId,
  onNavigate,
  onOpenTrack,
  onUsePrompt,
  onOpenAi,
  onRetry,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [trackId, setTrackId] = useState(initialTrackId || tracks[0]?.id || "");
  const [prompt, setPrompt] = useState(initialPrompt);
  useEffect(() => {
    if (
      initialTrackId &&
      tracks.some((track) => track.id === initialTrackId) &&
      trackId !== initialTrackId
    ) {
      setTrackId(initialTrackId);
      return;
    }
    if (tracks.some((track) => track.id === trackId)) return;
    setTrackId(tracks[0]?.id ?? "");
  }, [initialTrackId, trackId, tracks]);

  const selectedTrack = useMemo(
    () => tracks.find((track) => track.id === trackId) ?? null,
    [trackId, tracks],
  );
  const openAi = () => {
    if (!prompt.trim()) return;
    onUsePrompt(prompt.trim());
    onNavigate("create");
    requestAnimationFrame(() => onOpenAi("prompt.optimize"));
  };
  const usePrompt = () => {
    if (!prompt.trim()) return;
    onUsePrompt(prompt.trim());
    onNavigate("create");
  };

  return (
    <div className="page-scroll">
      <div className="mx-auto w-full max-w-[1320px] space-y-7 p-5 lg:p-7">
        <section className="surface-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div><span className="eyebrow">MUSIC VIDEO</span><h2 className="mt-2 font-semibold">{text("MV 工作室", "MV Studio")}</h2><p className="mt-1 text-xs text-muted">{text("参考照片、可选视频模型、动态分镜、歌词字幕与整曲合成。", "Character photos, video models, dynamic shots and lyric captions.")}</p></div>
          <button className="btn-primary" onClick={() => onNavigate("mv")}>{text("创作 MV", "Create MV")}<ArrowRight width={16}/></button>
        </section>
        <section className="tools-page-header">
          <div className="min-w-0">
            <span className="eyebrow">SUNO + MODELCROSS</span>
            <h1 className="mt-2 text-2xl font-semibold text-main">
              {text("制作工具", "Production tools")}
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-muted">
              {text(
                "这里呈现当前账户真实可执行的音乐生成、歌曲处理和资产输出能力。状态、预计积分与价格版本都来自服务端目录。",
                "Explore the music generation, track processing and asset output capabilities available to this account. Status, estimates and price versions come from the server catalog.",
              )}
            </p>
          </div>
          <label className="min-w-64 text-xs text-muted" htmlFor="tools-track">
            {text("当前处理曲目", "Track to process")}
            <select
              id="tools-track"
              className="field mt-2"
              value={trackId}
              disabled={!tracks.length}
              onChange={(event) => setTrackId(event.target.value)}
            >
              {tracks.length ? (
                tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title || text("未命名作品", "Untitled track")} ·{" "}
                    {track.status === "done"
                      ? text("已完成", "Completed")
                      : track.status}
                  </option>
                ))
              ) : (
                <option value="">
                  {text(
                    "作品库暂无可选曲目",
                    "No tracks available in the library",
                  )}
                </option>
              )}
            </select>
          </label>
        </section>

        {error && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-xs text-warning"
            role="alert"
          >
            <span>
              {text(
                "制作能力目录同步失败：",
                "Production catalog sync failed: ",
              )}
              {error}
            </span>
            <button
              type="button"
              className="btn-ghost border !border-[var(--line)]"
              onClick={onRetry}
            >
              {text("重新同步", "Sync again")}
            </button>
          </div>
        )}
        {loading && (
          <div className="status-chip">
            <Refresh width={12} height={12} className="animate-spin" />{" "}
            {text(
              "正在同步制作能力与价格",
              "Syncing production capabilities and prices",
            )}
          </div>
        )}

        <section aria-labelledby="creation-tools-title">
          <div className="mb-4">
            <span className="eyebrow">
              {text("从灵感开始", "Start with an idea")}
            </span>
            <h2
              id="creation-tools-title"
              className="mt-1 text-lg font-semibold text-main"
            >
              {text("生成与参考音频", "Generation & reference audio")}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {CREATION_TOOLS.map((definition) => (
              <CapabilityCard
                key={definition.action}
                definition={definition}
                profile={findOperation(operations, definition.action)}
                selectedTrack={selectedTrack}
                onNavigate={onNavigate}
                onOpenTrack={onOpenTrack}
              />
            ))}
          </div>
        </section>

        <section
          className="surface-card p-5 sm:p-6"
          aria-labelledby="prompt-expander-title"
        >
          <div className="flex items-start gap-3">
            <span className="feature-icon">
              <Wand width={19} height={19} />
            </span>
            <div>
              <h2
                id="prompt-expander-title"
                className="text-sm font-semibold text-main"
              >
                {text("提示词扩展工具", "Prompt enhancer")}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                {text(
                  "先写一句音乐想法，再带到创作台或交给当前 ModelCross 大语言模型扩写；AI 计费仍使用统一钱包。",
                  "Write a music idea, then take it to the workbench or expand it with the selected ModelCross language model. AI usage is billed from the shared wallet.",
                )}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <textarea
              className="field min-h-24 flex-1 resize-y"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={text(
                "例如：雨夜城市里的华语 Dream Pop，温柔女声，副歌逐渐打开……",
                "e.g. Mandarin Dream Pop in a rainy city, soft female vocals and a chorus that opens gradually…",
              )}
            />
            <div className="grid shrink-0 gap-2 sm:w-44">
              <button
                type="button"
                className="btn-primary"
                disabled={!prompt.trim()}
                onClick={openAi}
              >
                <Sparkle width={14} height={14} />{" "}
                {text("AI 扩写", "Expand with AI")}
              </button>
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                disabled={!prompt.trim()}
                onClick={usePrompt}
              >
                {text("直接使用", "Use as is")}{" "}
                <ArrowRight width={13} height={13} />
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="track-tools-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="eyebrow">
                {text("基于已有作品", "Use an existing track")}
              </span>
              <h2
                id="track-tools-title"
                className="mt-1 text-lg font-semibold text-main"
              >
                {text("继续创作与资产输出", "Continue & export")}
              </h2>
            </div>
            {!selectedTrack && (
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                onClick={() => onNavigate("library")}
              >
                <Library width={14} height={14} />{" "}
                {text("查看作品库", "Open library")}
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {TRACK_TOOLS.map((definition) => (
              <CapabilityCard
                key={definition.action}
                definition={definition}
                profile={findOperation(operations, definition.action)}
                selectedTrack={selectedTrack}
                onNavigate={onNavigate}
                onOpenTrack={onOpenTrack}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="planned-tools-title">
          <div className="mb-4">
            <span className="eyebrow">
              {text("设计稿中的扩展工具", "Extensions from the design")}
            </span>
            <h2
              id="planned-tools-title"
              className="mt-1 text-lg font-semibold text-main"
            >
              {text("等待接口合同", "Awaiting an API contract")}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              {text(
                "保留这些入口的位置，但在后端存在真实任务、存储格式与计费合同前不会伪装成可执行功能。",
                "These entry points remain visible, but are not presented as executable until real tasks, storage and billing contracts exist.",
              )}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANNED_TOOLS.map(([title, code, description]) => (
              <article key={code} className="surface-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="feature-icon">
                    <Sliders width={18} height={18} />
                  </span>
                  <span className="status-chip">
                    <Lock width={11} height={11} />{" "}
                    {text("未接入", "Not connected")}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-main">
                  {language === "zh-CN" ? title[0] : title[1]}
                </h3>
                <code className="mt-2 block text-[11px] text-muted">
                  {code}
                </code>
                <p className="mt-3 text-xs leading-5 text-muted">
                  {language === "zh-CN" ? description[0] : description[1]}
                </p>
                <button
                  type="button"
                  className="btn-ghost mt-4 w-full border !border-[var(--line)]"
                  disabled
                >
                  {text("等待服务端能力", "Waiting for server capability")}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
