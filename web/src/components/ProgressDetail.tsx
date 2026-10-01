import type { Track } from "../types";
import { fmtEtaLocalized, fmtTime } from "../lib/format";
import { PHASES, parseStage, phaseIndex } from "../lib/stage";
import { useI18n } from "../i18n";

export function ProgressDetail({ track }: { track: Track }) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const info = parseStage(track);
  const current = phaseIndex(info.phase);
  const percent = Math.round(
    Math.min(1, Math.max(0, track.progress || 0)) * 100,
  );
  const indeterminate = track.stage === "queued" && percent === 0;

  return (
    <div
      className="mt-3 space-y-2"
      aria-label={`${text("任务进度", "Task progress")} ${percent}%`}
    >
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="truncate text-zinc-300">
          {language === "zh-CN" ? info.label : info.labelEn}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-zinc-400">
          {indeterminate ? text("等待中", "Waiting") : `${percent}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700/90">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-violet-500 via-accent to-coral shadow-[0_0_16px_rgba(124,92,255,.55)] transition-[width] duration-700 ${indeterminate ? "animate-pulseBar w-[12%]" : ""}`}
          style={
            indeterminate ? undefined : { width: `${Math.max(3, percent)}%` }
          }
        />
      </div>
      <ol
        className="hidden items-center gap-1.5 text-[10px] text-muted sm:flex"
        aria-label={text("生成阶段", "Generation stages")}
      >
        {PHASES.map((phase, index) => {
          const passed = current >= 0 && index < current;
          const active = phase.id === info.phase;
          return (
            <li
              key={phase.id}
              className="flex min-w-0 flex-1 items-center gap-1.5"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-accent shadow-[0_0_8px_rgba(124,92,255,.8)]" : passed ? "bg-emerald-400" : "bg-ink-600"}`}
              />
              <span
                className={
                  active ? "text-zinc-300" : passed ? "text-muted" : ""
                }
              >
                {language === "zh-CN" ? phase.label : phase.labelEn}
              </span>
              {index < PHASES.length - 1 && (
                <span className="ml-auto h-px min-w-2 flex-1 bg-ink-700" />
              )}
            </li>
          );
        })}
      </ol>
      {(track.eta || track.elapsed) && (
        <div className="flex gap-3 text-[10px] tabular-nums text-muted">
          {typeof track.elapsed === "number" && track.elapsed > 0 && (
            <span>
              {text("已用", "Elapsed")} {fmtTime(track.elapsed)}
            </span>
          )}
          {typeof track.eta === "number" && track.eta > 0 && (
            <span>{fmtEtaLocalized(track.eta, language)}</span>
          )}
        </div>
      )}
    </div>
  );
}
