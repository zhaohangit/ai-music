export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtEta(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "";
  if (sec < 60) return `约 ${Math.max(1, Math.round(sec))} 秒`;
  return `约 ${Math.round(sec / 60)} 分钟`;
}

export function fmtEtaLocalized(
  sec: number | null,
  language: "zh-CN" | "en-US",
): string {
  if (sec === null || !Number.isFinite(sec)) return "";
  if (language === "zh-CN") return fmtEta(sec);
  if (sec < 60) return `~${Math.max(1, Math.round(sec))} sec`;
  return `~${Math.round(sec / 60)} min`;
}

export function fmtAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "刚刚";
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function fmtAgoLocalized(
  iso: string,
  language: "zh-CN" | "en-US",
): string {
  if (language === "zh-CN") return fmtAgo(iso);
  const elapsed = (Date.now() - new Date(iso).getTime()) / 1000;
  if (elapsed < 60) return "just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString("en-US");
}
