import type { Health } from "../types";
import { useI18n } from "../i18n";

export function HealthPill({ health }: { health: Health | null }) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  let dot = "bg-zinc-500";
  let label = text("正在连接", "Connecting");
  let pulse = true;

  if (health) {
    pulse = false;
    if (!health.configured) {
      dot = "bg-amber-400";
      label = text("请配置 API Key", "Configure an API key");
    } else if (!health.upstreamReachable) {
      dot = "bg-rose-500";
      label = text("MXAPI 连接异常", "MXAPI connection error");
    } else if (!health.ready) {
      dot = "bg-amber-400";
      label = text("服务准备中", "Service starting");
      pulse = true;
    } else if (health.active || health.queued) {
      dot = "bg-accent";
      label = `${health.active} ${text("首创作中", "creating")}${health.queued ? ` · ${health.queued} ${text("排队", "queued")}` : ""}`;
      pulse = true;
    } else {
      dot = "bg-emerald-400";
      label = text("MXAPI 已连接", "MXAPI connected");
    }
  }

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-xs text-zinc-300 backdrop-blur"
      title={health?.error ?? "Suno via MXAPI"}
    >
      <span
        className={`h-2 w-2 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
