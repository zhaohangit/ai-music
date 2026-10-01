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
  Music,
  Pause,
  Play,
  Refresh,
  Reuse,
  Sparkle,
  Spinner,
  Trash,
  X,
} from "./Icons";
import { TrackCard } from "./TrackCard";

interface Props {
  tracks: Track[];
  activeId: string | null;
  selectedId: string | null;
  playing: boolean;
  onSelect: (track: Track) => void;
  onPlay: (track: Track) => void;
  onDelete: (track: Track) => void;
  onReuse: (track: Track) => void;
  onRetry: (track: Track) => void;
  emptyHint: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  variant?: "feed" | "library";
}

function LibraryTrackRow({
  track,
  active,
  selected,
  playing,
  ...handlers
}: {
  track: Track;
  active: boolean;
  selected: boolean;
  playing: boolean;
} & Pick<Props, "onSelect" | "onPlay" | "onDelete" | "onReuse" | "onRetry">) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const coverUrl = trackCoverUrl(track);
  const playable = isPlayable(track);
  const inflight = isInflight(track);
  const billing = billingPresentation(track);
  const statusLabel =
    track.status === "done"
      ? text("已完成", "Completed")
      : track.status === "running"
        ? text("生成中", "Generating")
        : track.status === "queued"
          ? text("排队中", "Queued")
          : text("失败", "Failed");
  const subtitle =
    track.style ||
    track.description ||
    (track.instrumental
      ? text("纯音乐", "Instrumental")
      : text("等待音乐描述", "Waiting for a music description"));
  return (
    <article
      className={`library-track-row ${selected ? "is-selected" : ""} ${active ? "is-active" : ""}`}
      aria-label={`${text("作品", "Track")} ${track.title}`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, a"))
          handlers.onSelect(track);
      }}
    >
      <button
        type="button"
        className="library-row-play"
        onClick={() => playable && handlers.onPlay(track)}
        disabled={!playable}
        aria-label={
          playable
            ? active && playing
              ? text("暂停", "Pause")
              : text("播放", "Play")
            : statusLabel
        }
        style={!coverUrl ? coverStyle(track.id) : undefined}
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
        <span>
          {track.status === "running" || track.status === "queued" ? (
            <Spinner width={16} height={16} />
          ) : track.status === "error" ? (
            <Alert width={16} height={16} />
          ) : active && playing ? (
            <Pause width={17} height={17} />
          ) : (
            <Play width={17} height={17} />
          )}
        </span>
      </button>
      <button
        type="button"
        className="library-row-title"
        onClick={() => handlers.onSelect(track)}
        aria-label={`${text("查看作品", "View track")} ${track.title}`}
      >
        <strong>{track.title || text("未命名作品", "Untitled track")}</strong>
        <small>{subtitle}</small>
        <span className="library-row-meta">
          <span>{modelLabel(track.model)}</span>
          <span>·</span>
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
          {inflight && (
            <>
              <span>·</span>
              <span>{Math.round(track.progress * 100)}%</span>
            </>
          )}
          <span>·</span>
          <span className="library-row-billing" title={billing.detail}>
            {billing.label}
          </span>
        </span>
      </button>
      <span className="library-row-duration">
        {track.duration > 0 ? fmtTime(track.duration) : "—"}
      </span>
      <span className="library-row-project">
        {track.projectId
          ? text("已归档项目", "In project")
          : text("未归档", "Unfiled")}
      </span>
      <span className="library-row-date">
        {fmtAgoLocalized(track.finishedAt || track.createdAt, language)}
      </span>
      <span
        className={`library-row-quality ${track.status === "done" ? "is-ready" : track.status === "error" ? "is-error" : ""}`}
      >
        {track.status === "done" ? track.format.toUpperCase() : statusLabel}
      </span>
      <div className="library-row-actions">
        <span className="sr-only">{text("作品操作", "Track actions")}</span>
        {track.status === "done" && (
          <a
            className="icon-btn"
            href={api.downloadUrl(track.id)}
            title={text("下载 MP3", "Download MP3")}
            aria-label={text("下载 MP3", "Download MP3")}
          >
            <Download width={14} height={14} />
          </a>
        )}
        <button
          type="button"
          className="icon-btn"
          title={text("复用参数", "Reuse settings")}
          aria-label={text("复用参数", "Reuse settings")}
          onClick={() => handlers.onReuse(track)}
        >
          <Reuse width={14} height={14} />
        </button>
        {track.status === "error" && (
          <button
            type="button"
            className="icon-btn"
            title={text("重新生成", "Regenerate")}
            aria-label={text("重新生成", "Regenerate")}
            onClick={() => handlers.onRetry(track)}
          >
            <Refresh width={14} height={14} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn hover:!text-rose-300"
          disabled={inflight}
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
          onClick={() => handlers.onDelete(track)}
        >
          {inflight ? (
            <X width={14} height={14} />
          ) : (
            <Trash width={14} height={14} />
          )}
        </button>
      </div>
    </article>
  );
}

export function TrackFeed({
  tracks,
  activeId,
  selectedId,
  playing,
  emptyHint,
  emptyActionLabel,
  onEmptyAction,
  variant = "feed",
  ...handlers
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  if (!tracks.length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-soft">
          <Music width={27} height={27} />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[var(--surface-1)] bg-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-400">
            {text("这里还很安静", "It is quiet here")}
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
            {emptyHint}
          </p>
        </div>
        {onEmptyAction && emptyActionLabel ? (
          <button type="button" className="btn-primary" onClick={onEmptyAction}>
            <Sparkle width={14} height={14} />
            {emptyActionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  const groups = new Map<string, Track[]>();
  tracks.forEach((track) =>
    groups.set(track.groupId, [...(groups.get(track.groupId) || []), track]),
  );

  return (
    <div className={variant === "library" ? "library-track-feed" : "space-y-5"}>
      {[...groups.entries()].map(([groupId, group]) => (
        <section
          key={groupId}
          className={`animate-enter ${variant === "library" ? "library-track-group" : ""}`}
        >
          {group.length > 1 && (
            <div className="mb-2.5 flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.14em] text-muted">
              <span className="h-px w-4 bg-accent/35" />
              {group[0].operation === "sound"
                ? text("双版本音效", "Two sound-effect versions")
                : text("双版本创作", "Two creative versions")}
              <span className="text-subtle">
                ·{" "}
                {new Date(group[0].createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
          <div
            className={
              variant === "library"
                ? "library-track-list"
                : `grid gap-3 ${group.length > 1 ? "grid-cols-1 min-[1180px]:grid-cols-2" : "grid-cols-1"}`
            }
          >
            {group.map((track) =>
              variant === "library" ? (
                <LibraryTrackRow
                  key={track.id}
                  track={track}
                  active={track.id === activeId}
                  selected={track.id === selectedId}
                  playing={playing && track.id === activeId}
                  {...handlers}
                />
              ) : (
                <TrackCard
                  key={track.id}
                  track={track}
                  groupSize={group.length}
                  active={track.id === activeId}
                  selected={track.id === selectedId}
                  playing={playing && track.id === activeId}
                  {...handlers}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
