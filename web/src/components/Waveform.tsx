import { useEffect, useRef, useState } from "react";
import { BUCKETS, loadPeaks } from "../lib/peaks";
import { useI18n } from "../i18n";

interface Props {
  url: string;
  progress: number; // 0..1
  onSeek: (frac: number) => void;
  height?: number;
}

const clamp = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function Waveform({ url, progress, onSeek, height = 40 }: Props) {
  const { language } = useI18n();
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    loadPeaks(url)
      .then((p) => alive && setPeaks(p))
      .catch(() => {
        if (alive) {
          setPeaks(null);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const seek = (event: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect?.width) return;
    onSeek(clamp((event.clientX - rect.left) / rect.width));
  };

  const seekWithKeyboard = (event: React.KeyboardEvent) => {
    const steps: Partial<Record<string, number>> = {
      ArrowLeft: -0.01,
      ArrowDown: -0.01,
      ArrowRight: 0.01,
      ArrowUp: 0.01,
      PageDown: -0.1,
      PageUp: 0.1,
    };
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onSeek(event.key === "Home" ? 0 : 1);
      return;
    }
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onSeek(clamp(progress + step));
  };

  const bars: (number | null)[] = peaks
    ? [
        ...peaks,
        ...Array.from(
          { length: Math.max(0, BUCKETS - peaks.length) },
          () => null,
        ),
      ]
    : Array.from({ length: BUCKETS }, () => 0.15);
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={language === "zh-CN" ? "播放进度" : "Playback progress"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp(progress) * 100)}
      aria-valuetext={`${Math.round(clamp(progress) * 100)}%`}
      aria-orientation="horizontal"
      onClick={seek}
      onKeyDown={seekWithKeyboard}
      className="relative w-full cursor-pointer select-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      style={{ height }}
      title={
        failed
          ? language === "zh-CN"
            ? "波形暂不可用，仍可点击或使用键盘调整播放进度"
            : "Waveform unavailable; you can still click or use the keyboard to seek"
          : undefined
      }
    >
      <div className="absolute inset-0 flex items-center gap-[1px]">
        {bars.map((v, i) => {
          const frac = i / bars.length;
          const played = frac <= progress;
          const pending = v === null;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-colors ${!peaks ? "bg-ink-600 animate-pulse" : pending ? "bg-ink-700" : played ? "bg-accent" : "bg-ink-500"}`}
              style={{ height: `${Math.max(8, (v ?? 0.1) * 100)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
