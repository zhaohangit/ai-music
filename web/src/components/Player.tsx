import { useEffect, useMemo, useRef, useState } from "react";
import { api, trackAudioUrl, trackCoverUrl } from "../api";
import { coverStyle } from "../lib/cover";
import { fmtTime } from "../lib/format";
import { isPlayable, modelLabel, type Track } from "../types";
import { useI18n } from "../i18n";
import {
  ChevronDown,
  ChevronUp,
  Download,
  External,
  FileAudio,
  Heart,
  Layers,
  ListMusic,
  Maximize,
  Next,
  Pause,
  Play,
  Prev,
  Repeat,
  Shuffle,
  Sliders,
  Volume,
  VolumeOff,
  X,
} from "./Icons";

interface Props {
  track: Track | null;
  /** All owner-scoped tracks used to populate the local playback queue. */
  tracks?: Track[];
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
  onSelectTrack?: (track: Track) => void;
  onOpenTrack?: (track: Track) => void;
  onOpenLyrics?: () => void;
  onOpenTools?: () => void;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

// Decorative transport chrome only. Playback position and duration still come
// from the owner-scoped audio asset; these bars simply preserve the visual
// rhythm of the reference player while metadata is loading.
const WAVEFORM = [
  28, 46, 35, 62, 42, 76, 54, 88, 58, 72, 48, 66, 36, 58, 44, 70, 52, 82, 40,
  64, 34, 55, 44, 73, 50, 68, 38, 58, 32, 48, 26, 40,
];

export function Player({
  track,
  tracks = [],
  playing,
  onPlayingChange,
  onPrev,
  onNext,
  onEnded,
  onSelectTrack,
  onOpenTrack,
  onOpenLyrics,
  onOpenTools,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  const playable = Boolean(track && isPlayable(track));
  const source = track && playable ? trackAudioUrl(track) : "";
  const coverUrl = useMemo(
    () => (track ? trackCoverUrl(track) : null),
    [track],
  );
  const queue = useMemo(() => {
    const available = tracks.filter(isPlayable);
    if (
      track &&
      !available.some((item) => item.id === track.id) &&
      isPlayable(track)
    )
      return [track, ...available];
    return available;
  }, [track, tracks]);
  const total = duration || track?.duration || 0;
  const progress = total ? clamp(time / total) : 0;
  const favorite = Boolean(track && favoriteIds.has(track.id));

  useEffect(() => setCoverFailed(false), [coverUrl]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.pause();
    setTime(0);
    setDuration(0);
    setError(null);
    if (!source) {
      element.removeAttribute("src");
      element.load();
      return;
    }
    element.src = source;
    element.load();
    if (playing)
      void element
        .play()
        .catch(() =>
          setError(
            text(
              "浏览器阻止了自动播放，请再次点击播放",
              "Autoplay was blocked. Click play again.",
            ),
          ),
        );
    // Source changes only when the selected track changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    const element = audio.current;
    if (!element || !source) return;
    if (playing)
      void element
        .play()
        .catch(() =>
          setError(
            text(
              "播放失败，请检查音频文件",
              "Playback failed. Check the audio file.",
            ),
          ),
        );
    else element.pause();
  }, [playing, source]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.volume = volume;
    element.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    if (!lyricsOpen && !queueOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setLyricsOpen(false);
      setQueueOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [lyricsOpen, queueOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const interactive = target?.closest(
        'button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role], [tabindex]:not([tabindex="-1"])',
      );
      if (interactive) return;
      if (event.code === "Space") {
        event.preventDefault();
        onPlayingChange(!playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPlayingChange, playing]);

  const seek = (fraction: number) => {
    const element = audio.current;
    if (!element || !total) return;
    element.currentTime = Math.min(total, Math.max(0, fraction * total));
    setTime(element.currentTime);
  };

  const toggleFavorite = () => {
    if (!track) return;
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
  };

  const handleEnded = () => {
    if (repeat && audio.current && source) {
      audio.current.currentTime = 0;
      setTime(0);
      void audio.current.play().catch(() => onPlayingChange(false));
      return;
    }
    if (!onSelectTrack && !shuffle) onEnded();
    else handleNext();
  };

  const handleNext = () => {
    if (!shuffle || !onSelectTrack || queue.length < 2 || !track) {
      onNext();
      return;
    }
    const candidates = queue.filter((item) => item.id !== track.id);
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    if (next) onSelectTrack(next);
  };

  const toggleLyrics = () => {
    setLyricsOpen((current) => !current);
    setQueueOpen(false);
  };
  const toggleQueue = () => {
    setQueueOpen((current) => !current);
    setLyricsOpen(false);
  };

  const lyricLines = useMemo(() => {
    if (!track || !track.lyrics) return [];
    return track.lyrics
      .split(/\r?\n/)
      .map((text, index) => ({ text, time: 0, index }))
      .filter((line) => line.text.trim());
  }, [track]);

  return (
    <footer
      className={`app-player ${track ? "app-player-has-track" : "app-player-empty"} ${collapsed ? "app-player-collapsed" : ""}`}
      aria-label={text("底部播放器", "Audio player")}
    >
      <audio
        ref={audio}
        preload="metadata"
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onDurationChange={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          )
        }
        onPlay={() => {
          setError(null);
          onPlayingChange(true);
        }}
        onPause={(event) => {
          if (!event.currentTarget.ended) onPlayingChange(false);
        }}
        onEnded={handleEnded}
        onError={() => {
          setError(
            text("音频暂时无法播放", "Audio is temporarily unavailable."),
          );
          onPlayingChange(false);
        }}
      />
      <div className="player-progress-indicator" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      {lyricsOpen && (
        <section
          className="player-drawer player-lyrics-drawer"
          aria-label={text("当前歌词", "Current lyrics")}
          role="dialog"
        >
          <div className="player-drawer-heading">
            <div>
              <span className="player-drawer-kicker">LYRICS</span>
              <strong>
                {track?.title || text("当前歌词", "Current lyrics")}
              </strong>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLyricsOpen(false)}
              aria-label={text("关闭歌词", "Close lyrics")}
            >
              <X width={15} height={15} />
            </button>
          </div>
          <div className="player-drawer-body">
            {lyricLines.length ? (
              lyricLines.map((line) => (
                <button
                  type="button"
                  key={line.index}
                  className="player-lyric-line"
                  onClick={() => seek(line.time)}
                >
                  {line.text}
                </button>
              ))
            ) : (
              <p className="text-xs leading-6 text-muted">
                {track?.instrumental
                  ? text(
                      "这是一首纯音乐作品。",
                      "This is an instrumental track.",
                    )
                  : text(
                      "这首作品暂未返回歌词。",
                      "Lyrics are not available for this track yet.",
                    )}
              </p>
            )}
          </div>
          {onOpenLyrics && (
            <button
              type="button"
              className="player-drawer-link"
              onClick={() => {
                setLyricsOpen(false);
                onOpenLyrics();
              }}
            >
              <span>
                {text("在歌词工作室中继续", "Continue in Lyrics Studio")}
              </span>
              <External width={13} height={13} />
            </button>
          )}
        </section>
      )}

      {queueOpen && (
        <section
          className="player-drawer player-queue-drawer"
          aria-label={text("播放队列", "Play queue")}
          role="dialog"
        >
          <div className="player-drawer-heading">
            <div>
              <span className="player-drawer-kicker">QUEUE</span>
              <strong>
                {text("播放队列", "Play queue")} <small>{queue.length}</small>
              </strong>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setQueueOpen(false)}
              aria-label={text("关闭播放队列", "Close play queue")}
            >
              <X width={15} height={15} />
            </button>
          </div>
          <div className="player-drawer-body player-queue-list">
            {queue.length ? (
              queue.map((item) => {
                const itemCover = trackCoverUrl(item);
                const isCurrent = item.id === track?.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`player-queue-item ${isCurrent ? "is-current" : ""}`}
                    onClick={() => {
                      onSelectTrack?.(item);
                      setQueueOpen(false);
                    }}
                  >
                    <span
                      className="player-queue-cover"
                      style={!itemCover ? coverStyle(item.id) : undefined}
                    >
                      {itemCover && <img src={itemCover} alt="" />}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <strong className="block truncate">
                        {item.title || text("未命名作品", "Untitled track")}
                      </strong>
                      <small className="mt-0.5 block truncate">
                        {item.style || modelLabel(item.model)}
                      </small>
                    </span>
                    <span className="player-queue-time">
                      {fmtTime(item.duration)}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-muted">
                {text(
                  "完成一首作品后，它会出现在播放队列。",
                  "Complete a track and it will appear in the play queue.",
                )}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="player-bar">
        <div className="player-track-meta">
          <button
            type="button"
            className="player-cover"
            disabled={!track}
            onClick={() => track && onOpenTrack?.(track)}
            aria-label={
              track
                ? `${text("查看作品：", "View track: ")}${track.title}`
                : text("暂无当前作品", "No current track")
            }
            style={
              track && (!coverUrl || coverFailed)
                ? coverStyle(track.id)
                : { background: "var(--surface-3)" }
            }
          >
            {track && coverUrl && !coverFailed && (
              <img src={coverUrl} alt="" onError={() => setCoverFailed(true)} />
            )}
            {track && (
              <span className="player-cover-overlay">
                <Maximize width={14} height={14} />
              </span>
            )}
          </button>
          <div className="player-track-copy">
            <strong className="truncate">
              {track?.title || text("选择一首作品", "Choose a track")}
            </strong>
            <span className="truncate">
              {error ||
                (track
                  ? `Gen Alloy · ${modelLabel(track.model)}`
                  : text(
                      "完成创作后即可播放",
                      "Create a track to start playback",
                    ))}
            </span>
          </div>
          <button
            type="button"
            className={`player-favorite ${favorite ? "is-favorite" : ""}`}
            onClick={toggleFavorite}
            disabled={!track}
            aria-pressed={favorite}
            aria-label={
              favorite
                ? text("取消收藏", "Remove from favorites")
                : text("收藏作品", "Add to favorites")
            }
            title={
              favorite
                ? text("取消收藏", "Remove from favorites")
                : text("收藏作品", "Add to favorites")
            }
          >
            <Heart width={17} height={17} />
          </button>
        </div>

        <div className="player-center">
          {!collapsed && (
            <div className="player-controls">
              <button
                type="button"
                className={`player-control ${shuffle ? "is-active" : ""}`}
                onClick={() => setShuffle((value) => !value)}
                disabled={!queue.length}
                aria-pressed={shuffle}
                aria-label={
                  shuffle
                    ? text("关闭随机播放", "Disable shuffle")
                    : text("开启随机播放", "Enable shuffle")
                }
                title={
                  shuffle
                    ? text("关闭随机播放", "Disable shuffle")
                    : text("开启随机播放", "Enable shuffle")
                }
              >
                <Shuffle width={15} height={15} />
              </button>
              <button
                type="button"
                className="player-control"
                onClick={onPrev}
                disabled={!track}
                aria-label={text("上一首", "Previous track")}
                title={text("上一首", "Previous track")}
              >
                <Prev width={16} height={16} />
              </button>
              <button
                type="button"
                className="player-play"
                onClick={() => onPlayingChange(!playing)}
                disabled={!playable}
                aria-label={
                  playing ? text("暂停", "Pause") : text("播放", "Play")
                }
              >
                {playing ? (
                  <Pause width={17} height={17} />
                ) : (
                  <Play width={17} height={17} className="translate-x-px" />
                )}
              </button>
              <button
                type="button"
                className="player-control"
                onClick={handleNext}
                disabled={!track}
                aria-label={text("下一首", "Next track")}
                title={text("下一首", "Next track")}
              >
                <Next width={16} height={16} />
              </button>
              <button
                type="button"
                className={`player-control ${repeat ? "is-active" : ""}`}
                onClick={() => setRepeat((value) => !value)}
                disabled={!queue.length}
                aria-pressed={repeat}
                aria-label={
                  repeat
                    ? text("关闭单曲循环", "Disable repeat")
                    : text("开启单曲循环", "Enable repeat")
                }
                title={
                  repeat
                    ? text("关闭单曲循环", "Disable repeat")
                    : text("开启单曲循环", "Enable repeat")
                }
              >
                <Repeat width={15} height={15} />
              </button>
            </div>
          )}
          <div className="player-progress-row">
            <span>{fmtTime(time)}</span>
            <div className="player-seek-wrap">
              <div className="player-waveform" aria-hidden="true">
                {WAVEFORM.map((height, index) => (
                  <span
                    key={index}
                    className={
                      progress > index / WAVEFORM.length ? "is-played" : ""
                    }
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <input
                className="player-seek"
                type="range"
                min={0}
                max={total || 0}
                step={0.5}
                value={Math.min(time, total || 0)}
                onChange={(event) =>
                  seek(Number(event.target.value) / (total || 1))
                }
                disabled={!source || !total}
                aria-label={text("播放进度", "Playback progress")}
              />
            </div>
            <span>{fmtTime(total)}</span>
          </div>
        </div>

        <div className="player-actions">
          <button
            type="button"
            className={`player-action ${lyricsOpen ? "is-active" : ""}`}
            onClick={toggleLyrics}
            disabled={!track}
            aria-pressed={lyricsOpen}
            aria-label={text("打开歌词", "Open lyrics")}
            title={text("打开歌词", "Open lyrics")}
          >
            <span className="player-action-glyph">≋</span>
            <span className="sr-only">{text("歌词", "Lyrics")}</span>
          </button>
          <button
            type="button"
            className="player-action"
            onClick={onOpenTools}
            disabled={!onOpenTools || !track}
            aria-label={text("打开音频工具", "Open audio tools")}
            title={text("打开音频工具", "Open audio tools")}
          >
            <Layers width={16} height={16} />
          </button>
          <button
            type="button"
            className="player-action"
            onClick={onOpenTools}
            disabled={!onOpenTools || !track}
            aria-label={text("打开导出工具", "Open export tools")}
            title={text("打开导出工具", "Open export tools")}
          >
            <FileAudio width={16} height={16} />
          </button>
          <button
            type="button"
            className="player-action"
            onClick={onOpenTools}
            disabled={!onOpenTools || !track}
            aria-label={text("打开制作工具", "Open production tools")}
            title={text("打开制作工具", "Open production tools")}
          >
            <Sliders width={16} height={16} />
          </button>
          <button
            type="button"
            className={`player-action ${queueOpen ? "is-active" : ""}`}
            onClick={toggleQueue}
            aria-pressed={queueOpen}
            aria-label={text("打开播放队列", "Open play queue")}
            title={text("打开播放队列", "Open play queue")}
          >
            <ListMusic width={16} height={16} />
          </button>
          <div className="player-volume">
            <button
              type="button"
              className="player-control"
              onClick={() => setMuted((value) => !value)}
              disabled={!playable}
              aria-label={
                muted ? text("取消静音", "Unmute") : text("静音", "Mute")
              }
              title={muted ? text("取消静音", "Unmute") : text("静音", "Mute")}
            >
              {muted || volume === 0 ? (
                <VolumeOff width={16} height={16} />
              ) : (
                <Volume width={16} height={16} />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              disabled={!playable}
              aria-label={text("音量", "Volume")}
            />
          </div>
          {track && playable ? (
            <a
              className="player-action"
              href={api.downloadUrl(track.id)}
              aria-label={text("下载音频", "Download audio")}
              title={text("下载音频", "Download audio")}
            >
              <Download width={16} height={16} />
            </a>
          ) : (
            <button
              type="button"
              className="player-action"
              disabled
              aria-label={text(
                "下载音频（暂不可用）",
                "Download audio (unavailable)",
              )}
              title={text("完成后可下载", "Available after completion")}
            >
              <Download width={16} height={16} />
            </button>
          )}
          <button
            type="button"
            className="player-collapse"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? text("展开播放器", "Expand player")
                : text("收起播放器", "Collapse player")
            }
            title={
              collapsed
                ? text("展开播放器", "Expand player")
                : text("收起播放器", "Collapse player")
            }
          >
            {collapsed ? (
              <ChevronUp width={15} height={15} />
            ) : (
              <ChevronDown width={15} height={15} />
            )}
          </button>
        </div>
      </div>
    </footer>
  );
}
