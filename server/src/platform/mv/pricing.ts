import type { MvSettings, MvShot } from "./types.js";
/** Audited API Test reference rates, not a supplier quote or a settlement guarantee. */
export const PRICING_SOURCE =
  "MXAPI API Test · 2026-09-29 · 标准文档费率（不计临时优惠）";
export const PRICING_NOTE =
  "按文档费率估算，实际按供应商用量结算；提交预算限制后续请求，不能约束供应商的最终结算差额。";
const dims20: Record<string, Record<string, [number, number]>> = {
  "480p": {
    "16:9": [864, 496],
    "9:16": [496, 864],
    "1:1": [640, 640],
    "4:3": [752, 560],
    "3:4": [560, 752],
  },
  "720p": {
    "16:9": [1280, 720],
    "9:16": [720, 1280],
    "1:1": [960, 960],
    "4:3": [1112, 834],
    "3:4": [834, 1112],
  },
  "1080p": {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1440, 1440],
    "4:3": [1664, 1248],
    "3:4": [1248, 1664],
  },
};
export function estimateShot(
  s: MvSettings,
  shot: Pick<MvShot, "model" | "generationSeconds">,
): number | null {
  const { model } = shot,
    seconds = shot.generationSeconds;
  if (model.startsWith("seedance-")) {
    // For 2.5 use a conservative pixel envelope: the larger published 2.0 grid
    // avoids presenting a lower estimate for non-16:9 output shapes.
    const dims = dims20[s.resolution]?.[s.ratio];
    if (!dims) return null;
    const rate =
      model === "seedance-2.5"
        ? 0.00007
        : model === "seedance-2.0-fast"
          ? 0.000037
          : model === "seedance-2.0-mini"
            ? 0.000023
            : s.resolution === "1080p"
              ? 0.000051
              : 0.000046;
    return Math.ceil(
      (((seconds + 1 / 24) * dims[0] * dims[1] * 24) / 1024) * rate * 100,
    );
  }
  if (model === "grok-imagine-video" || model === "grok-imagine-video-1.5") {
    const rate = (
      (model.endsWith("1.5")
        ? { "480p": 40, "720p": 70, "1080p": 120 }
        : { "480p": 25, "720p": 35 }) as Record<string, number>
    )[s.resolution];
    return rate ? Math.ceil(rate * seconds) : null;
  }
  if (model.startsWith("jimeng-")) {
    const rate = (
      { "480p": 0.037, "720p": 0.086, "1080p": 0.185 } as Record<string, number>
    )[s.resolution];
    return rate ? Math.ceil(rate * seconds * 100) : null;
  }
  if (model === "omni-flash")
    return (
      ({ 4: 200, 6: 240, 8: 280, 10: 320 } as Record<number, number>)[
        seconds
      ] ?? null
    );
  return (
    (
      {
        "veo-3.1-fast": 115,
        "veo-3.1-quality": 800,
        "veo-3.1-lite": 60,
      } as Record<string, number>
    )[model] ?? null
  );
}
