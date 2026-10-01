import { useEffect, useMemo, useState } from "react";
import { api, trackCoverUrl } from "../api";
import { coverStyle } from "../lib/cover";
import { fmtAgoLocalized, fmtTime } from "../lib/format";
import { billingPresentation } from "../lib/billing";
import {
  isInflight,
  isPlayable,
  modelLabel,
  operationLabel,
  type Track,
} from "../types";
import { localizeCatalogText, useI18n } from "../i18n";
import {
  Alert,
  Download,
  Pause,
  Play,
  Refresh,
  Reuse,
  Spinner,
  Trash,
  X,
} from "./Icons";
import { ProgressDetail } from "./ProgressDetail";

interface Props {
  track: Track;
  groupSize: number;
  active: boolean;
  playing: boolean;
  selected: boolean;
  onSelect: (track: Track) => void;
  onPlay: (track: Track) => void;
  onDelete: (track: Track) => void;
  onReuse: (track: Track) => void;
  onRetry: (track: Track) => void;
}

const STATUS = {
  queued: {
    label: "排队中",
    className: "border-zinc-500/20 bg-zinc-500/8 text-zinc-400",
  },
  running: {
    label: "创作中",
    className: "border-accent/25 bg-accent/10 text-accent-soft",
  },
  done: {
    label: "已完成",
    className: "border-emerald-400/20 bg-emerald-400/8 text-emerald-300",
  },
  error: {
    label: "失败",
    className: "border-rose-400/20 bg-rose-400/8 text-rose-300",
  },
} as const;

export function TrackCard({
  track,
  groupSize,
  active,
  playing,
  selected,
  onSelect,
  onPlay,
  onDelete,
  onReuse,
  onRetry,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const coverUrl = useMemo(() => trackCoverUrl(track), [track]);
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [coverUrl]);

  const inflight = isInflight(track);
  const playable = isPlayable(track);
  const status = STATUS[track.status];
  const statusLabel =
    track.status === "queued"
      ? text("排队中", "Queued")
      : track.status === "running"
        ? text("创作中", "Creating")
        : track.status === "done"
          ? text("已完成", "Completed")
          : text("失败", "Failed");
  const subtitle =
    track.style ||
    track.description ||
    (track.instrumental
      ? text("纯音乐", "Instrumental")
      : text("等待音乐描述", "Waiting for a music description"));
  const billing = billingPresentation(track);
  const billingTone =
    billing.tone === "info"
      ? "tone-accent"
      : billing.tone === "neutral"
        ? ""
        : `tone-${billing.tone}`;

  return (
    <article
      aria-label={`${text("作品", "Track")} ${track.title}`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, a"))
          onSelect(track);
      }}
      className={`track-card group relative overflow-hidden rounded-2xl border p-3.5 transition duration-200 focus-visible:outline-none ${
        selected
          ? "border-accent/50 bg-accent/[0.075] shadow-[0_14px_40px_rgba(30,20,70,.25)]"
          : active
            ? "border-accent/25 bg-white/[0.055]"
            : "border-white/[0.065] bg-white/[0.032] hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex gap-3.5">
        <button
          type="button"
          onClick={() => playable && onPlay(track)}
          disabled={!playable}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl text-white shadow-lg disabled:cursor-default"
          style={!coverUrl || coverFailed ? coverStyle(track.id) : undefined}
          aria-label={
            playable
              ? active && playing
                ? text("暂停", "Pause")
                : text("播放", "Play")
              : statusLabel
          }
        >
          {coverUrl && !coverFailed && (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          )}
          <span
            className={`absolute inset-0 flex items-center justify-center bg-black/35 transition ${playable ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-100"}`}
          >
            {track.status === "running" ? (
              <Spinner width={22} height={22} />
            ) : track.status === "error" ? (
              <Alert width={21} height={21} className="text-rose-200" />
            ) : playable ? (
              active && playing ? (
                <Pause width={23} height={23} />
              ) : (
                <Play width={23} height={23} />
              )
            ) : null}
          </span>
          {groupSize > 1 && (
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-medium backdrop-blur">
              {text("版本", "Take")} {track.takeIndex + 1}
            </span>
          )}
        </button>

        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelect(track)}
          aria-label={`${text("查看作品", "View track")} ${track.title}`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-zinc-100">
                  {track.title || text("未命名作品", "Untitled track")}
                </h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${status.className}`}
                >
                  {statusLabel}
                </span>
              </div>
              <p
                className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted"
                title={subtitle}
              >
                {subtitle}
              </p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[9px] text-muted">
            <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-muted">
              {modelLabel(track.model)}
            </span>
            <span>
              {localizeCatalogText(operationLabel(track.operation), language)}
            </span>
            {track.operation === "sound" &&
              typeof track.soundTempo === "number" && (
                <>
                  <span>·</span>
                  <span>{track.soundTempo} BPM</span>
                </>
              )}
            {track.operation === "sound" && track.soundKey && (
              <>
                <span>·</span>
                <span>{track.soundKey}</span>
              </>
            )}
            {track.operation === "sound" &&
              typeof track.soundLoop === "boolean" && (
                <>
                  <span>·</span>
                  <span>
                    {track.soundLoop
                      ? text("循环", "Loop")
                      : text("单次", "One-shot")}
                  </span>
                </>
              )}
            {track.duration > 0 && (
              <>
                <span>·</span>
                <span>{fmtTime(track.duration)}</span>
              </>
            )}
            <span>·</span>
            <span>
              {fmtAgoLocalized(track.finishedAt || track.createdAt, language)}
            </span>
          </div>
        </button>
      </div>

      {inflight && <ProgressDetail track={track} />}

      {track.status === "error" && (
        <div className="mt-3 rounded-xl border border-rose-500/18 bg-rose-500/[0.055] px-3 py-2 text-[11px] leading-relaxed text-rose-300">
          {track.error ||
            text("生成失败，请稍后重试", "Generation failed. Try again later.")}
          <span className="ml-2 font-medium text-muted">{billing.detail}</span>
        </div>
      )}

      <div className="mt-3 flex items-center border-t border-white/[0.055] pt-2.5">
        <span
          className={`status-chip mr-auto ${billingTone}`}
          title={billing.detail}
        >
          {billing.label}
        </span>
        <div className="flex items-center gap-0.5 opacity-80 transition group-hover:opacity-100 group-focus-within:opacity-100">
          {track.status === "done" && (
            <a
              className="icon-btn"
              href={api.downloadUrl(track.id)}
              title={text("下载 MP3", "Download MP3")}
              aria-label={text("下载 MP3", "Download MP3")}
            >
              <Download width={15} height={15} />
            </a>
          )}
          <button
            type="button"
            className="icon-btn"
            title={text("复用参数", "Reuse settings")}
            aria-label={text("复用参数", "Reuse settings")}
            onClick={() => onReuse(track)}
          >
            <Reuse width={15} height={15} />
          </button>
          {track.status === "error" && (
            <button
              type="button"
              className="icon-btn"
              title={text(
                "重新生成（会再次消耗积分）",
                "Regenerate (uses credits again)",
              )}
              aria-label={text("重新生成", "Regenerate")}
              onClick={() => onRetry(track)}
            >
              <Refresh width={15} height={15} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn hover:!text-rose-300"
            title={
              inflight
                ? text(
                    "任务结算前不可删除",
                    "Cannot delete before task settlement",
                  )
                : text("删除", "Delete")
            }
            aria-label={
              inflight
                ? text(
                    "任务结算前不可删除",
                    "Cannot delete before task settlement",
                  )
                : text("删除", "Delete")
            }
            disabled={inflight}
            onClick={() => onDelete(track)}
          >
            {inflight ? (
              <X width={15} height={15} />
            ) : (
              <Trash width={15} height={15} />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
