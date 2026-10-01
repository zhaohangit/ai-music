import { ValidationError } from "../../errors.js";
import type { MvSettings, MvShot, VideoModel } from "./types.js";
import { randomUUID } from "node:crypto";
const ratios = ["16:9", "9:16", "1:1", "4:3", "3:4"];
export const VIDEO_MODELS: VideoModel[] = [
  ...[
    [
      "seedance-2.5",
      "Seedance 2.5",
      "seedance2-5",
      30,
      ["480p", "720p", "1080p"],
      "人物参考与音频参考，最长 30 秒分镜。",
    ],
    [
      "seedance-2.0",
      "Seedance 2.0",
      "seedance2",
      15,
      ["480p", "720p", "1080p"],
      "多模态参考与人物动作。",
    ],
    [
      "seedance-2.0-fast",
      "Seedance 2.0 Fast",
      "seedance2-fast",
      15,
      ["480p", "720p"],
      "快速生成多模态分镜。",
    ],
    [
      "seedance-2.0-mini",
      "Seedance 2.0 Mini",
      "seedance2-mini",
      15,
      ["480p", "720p"],
      "轻量分镜预览。",
    ],
  ].map(
    ([id, name, route, maxSeconds, resolutions, description]) =>
      ({
        id,
        name,
        endpoint: `/api/v2/video/${route}`,
        queryEndpoint: "/api/v2/video/task",
        family: "seedance",
        minSeconds: 4,
        maxSeconds,
        resolutions,
        ratios,
        referenceImage: true,
        referenceAudio: true,
        description,
      }) as VideoModel,
  ),
  ...[
    ["jimeng-fast", "即梦 1.0 Fast", "doubao-seedance-1-0-pro-fast-251015"],
    ["jimeng-pro", "即梦 1.5 Pro", "doubao-seedance-1-5-pro-251215"],
  ].map(
    ([id, name, wireModel]) =>
      ({
        id,
        name,
        wireModel,
        family: "jimeng",
        endpoint: "/api/v2/video/generate",
        queryEndpoint: "/api/v2/video/task",
        minSeconds: 2,
        maxSeconds: 12,
        resolutions: ["480p", "720p", "1080p"],
        ratios,
        referenceImage: true,
        referenceAudio: false,
        description: "参考照片生成短镜头。",
      }) as VideoModel,
  ),
  ...["grok-imagine-video", "grok-imagine-video-1.5"].map(
    (id) =>
      ({
        id,
        name: id.endsWith("1.5") ? "Grok Imagine 1.5" : "Grok Imagine",
        wireModel: id,
        family: "grok",
        endpoint: "/api/v2/video/grok",
        queryEndpoint: "/api/v2/video/grok/task",
        minSeconds: 1,
        maxSeconds: 15,
        resolutions: id.endsWith("1.5")
          ? ["480p", "720p", "1080p"]
          : ["480p", "720p"],
        ratios,
        referenceImage: true,
        referenceAudio: false,
        description: "照片驱动的动作与场景变化。",
      }) as VideoModel,
  ),
  ...["veo-3.1-fast", "veo-3.1-quality", "veo-3.1-lite", "omni-flash"].map(
    (id) =>
      ({
        id,
        name:
          id === "omni-flash"
            ? "Omni Flash"
            : id.replace("veo-", "Veo ").replace("3.1-", "3.1 "),
        wireModel: id,
        family: "veo",
        endpoint: "/api/v2/veo/generate",
        queryEndpoint: "/api/v2/veo/task",
        minSeconds: id === "omni-flash" ? 4 : 8,
        maxSeconds: id === "omni-flash" ? 10 : 8,
        durations: id === "omni-flash" ? [4, 6, 8, 10] : [8],
        resolutions: ["720p", "1080p"],
        ratios: ["16:9", "9:16"],
        referenceImage: true,
        referenceAudio: false,
        description: "电影感图生视频，固定时长分镜。",
      }) as VideoModel,
  ),
];
export function videoModel(id: string): VideoModel {
  const model = VIDEO_MODELS.find((m) => m.id === id);
  if (!model) throw new ValidationError("请选择支持的视频模型");
  return model;
}
export function validateSettings(
  raw: unknown,
  trackDuration: number,
): MvSettings {
  if (!raw || typeof raw !== "object")
    throw new ValidationError("MV 设置不能为空");
  const b = raw as Record<string, unknown>;
  const text = (key: string, max: number, required = true) => {
    const v = typeof b[key] === "string" ? (b[key] as string).trim() : "";
    if ((required && !v) || v.length > max)
      throw new ValidationError(`${key} 长度无效`);
    return v;
  };
  const num = (key: string, min: number, max: number) => {
    const n = b[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
      throw new ValidationError(`${key} 必须在 ${min}–${max} 之间`);
    return n;
  };
  const model = videoModel(text("model", 80));
  const resolution = text("resolution", 16),
    ratio = text("ratio", 16);
  if (!model.resolutions.includes(resolution) || !model.ratios.includes(ratio))
    throw new ValidationError("模型不支持所选分辨率或画幅");
  const duration = num("duration", 4, Math.min(600, trackDuration));
  const shotSeconds = num("shotSeconds", model.minSeconds, model.maxSeconds);
  if (
    !Number.isInteger(shotSeconds) ||
    (model.durations && !model.durations.includes(shotSeconds))
  )
    throw new ValidationError("模型不支持所选镜头时长");
  if (Math.ceil(duration / shotSeconds) > 120)
    throw new ValidationError(
      "MV supports at most 120 shots; increase shot duration",
    );
  const performance = b.performance;
  if (!["story", "singing", "audio"].includes(String(performance)))
    throw new ValidationError("演出模式无效");
  if (performance === "audio" && !model.referenceAudio)
    throw new ValidationError("该模型不支持音频参考");
  const referenceId =
    typeof b.referenceId === "string" && b.referenceId ? b.referenceId : null;
  if (performance !== "story" && !referenceId)
    throw new ValidationError("人物演唱需要上传参考照片");
  if (model.id === "grok-imagine-video-1.5" && !referenceId)
    throw new ValidationError("Grok 1.5 需要一张参考图");
  if (typeof b.subtitles !== "boolean")
    throw new ValidationError("字幕设置无效");
  if (b.subtitleStyle !== "clean" && b.subtitleStyle !== "cinema")
    throw new ValidationError("字幕样式无效");
  return {
    trackId: text("trackId", 100),
    title: text("title", 100),
    concept: text("concept", 2400),
    model: model.id,
    resolution,
    ratio,
    duration,
    shotSeconds,
    referenceId,
    performance: performance as MvSettings["performance"],
    subtitles: b.subtitles,
    subtitleStyle: b.subtitleStyle,
    srt: text("srt", 80000, false),
    audioGainDb: num("audioGainDb", -12, 6),
  };
}
export function createStoryboard(
  s: MvSettings,
  alignment: Array<{ start: number; end: number; text: string }> = [],
): MvShot[] {
  const count = Math.ceil(s.duration / s.shotSeconds),
    scenes = [
      "环境中的中景开场。人物走入画面、抬头，镜头平稳跟随。",
      "人物正面半身，轻轻转头，眼神和手部动作自然连贯。",
      "侧面跟拍人物行走，衣服、发丝与环境随风持续运动。",
      "人物近景，眼神由沉静转向明亮，手指轻触身边的叶片。",
      "镜头绕人物缓慢移动，她转身回望，微笑并向前迈步。",
      "远景到中景，人物向光亮处行走，与场景产生真实互动。",
    ];
  const cuts = [0];
  if (alignment.length) {
    const candidates = [
      ...new Set(
        alignment
          .flatMap((c) => [c.start, c.end])
          .filter((t) => t > 0 && t < s.duration),
      ),
    ].sort((a, b) => a - b);
    while (cuts.at(-1)! < s.duration - 0.001) {
      const start = cuts.at(-1)!,
        desired = Math.min(start + s.shotSeconds, s.duration);
      const choices = candidates.filter(
        (t) => t >= start + s.shotSeconds * 0.6 && t <= start + s.shotSeconds,
      );
      const cut =
        desired === s.duration
          ? desired
          : (choices.sort(
              (a, b) => Math.abs(a - desired) - Math.abs(b - desired),
            )[0] ?? desired);
      cuts.push(Number(cut.toFixed(3)));
    }
  } else {
    for (let i = 1; i <= count; i++)
      cuts.push(Math.min(i * s.shotSeconds, s.duration));
  }
  const plannedCount = cuts.length - 1;
  return Array.from({ length: plannedCount }, (_, i) => {
    const start = cuts[i],
      duration = Number((cuts[i + 1] - start).toFixed(3));
    const performance =
      s.performance === "story"
        ? ""
        : s.performance === "audio"
          ? "结合参考音频的节奏、人声和换气演唱，尽可能同步口型。"
          : "在有歌词的段落自然演唱，嘴唇连续变化，随音乐轻摆。";
    const lines = alignment
      .filter((c) => c.start < start + duration && c.end > start)
      .map((c) => c.text)
      .join(" ")
      .slice(0, 300);
    const repeats = lines
      ? alignment.filter((c) => lines.includes(c.text) && c.start < start)
          .length
      : 0;
    const musicalDirection = alignment.length
      ? lines
        ? `此镜对应歌词：${lines}。${repeats > 0 ? "重复段落采用更开阔景别和增强表演情绪。" : "围绕歌词含义表达情绪。"}`
        : "此镜处于歌词间隙，以动作和环境过渡，人物不做无词演唱。"
      : "";
    return {
      id: randomUUID(),
      index: i,
      start,
      duration,
      generationSeconds: s.shotSeconds,
      model: s.model,
      prompt: `第 ${i + 1}/${plannedCount} 镜，歌曲 ${start.toFixed(1)}–${(start + duration).toFixed(1)} 秒。${s.concept}\n${musicalDirection} ${scenes[i % scenes.length]} ${lines || !alignment.length ? performance : ""}\n保持参考人物外观、发型、衣着一致；人物和环境有连续动作。真实摄影，柔和光线，完整画幅。禁止定格、照片慢推、拼贴、画面内文字、水印和重复上一镜头的动作。`,
      status: "draft",
      providerTaskId: null,
      error: null,
    };
  });
}
export function videoPayload(
  model: VideoModel,
  shot: MvShot,
  settings: MvSettings,
  image?: string,
  audio?: string,
): Record<string, unknown> {
  const content: Record<string, unknown>[] = [
    { type: "text", text: shot.prompt },
  ];
  if (image)
    content.push({
      type: "image_url",
      image_url: { url: image },
      ...(model.family === "seedance" ? { role: "reference_image" } : {}),
    });
  if (audio && model.referenceAudio)
    content.push({
      type: "audio_url",
      audio_url: { url: audio },
      role: "reference_audio",
    });
  if (model.family === "seedance")
    return {
      content,
      resolution: settings.resolution,
      ratio: settings.ratio,
      duration: shot.generationSeconds,
      generate_audio: Boolean(audio),
      ...(model.id === "seedance-2.5"
        ? { camera_fixed: false, output_format: "mp4" }
        : {}),
    };
  if (model.family === "jimeng") {
    content[0].text += ` --ratio ${settings.ratio} --rs ${settings.resolution} --dur ${shot.generationSeconds}`;
    return { model: model.wireModel, content };
  }
  if (model.family === "grok")
    return {
      model: model.wireModel,
      prompt: shot.prompt,
      aspect_ratio: settings.ratio,
      resolution_name: settings.resolution,
      video_length: String(shot.generationSeconds),
      refer_images: image ? [image] : [],
    };
  return {
    model: model.wireModel,
    prompt: shot.prompt,
    aspect_ratio: settings.ratio,
    resolution: settings.resolution,
    duration: String(shot.generationSeconds),
    reference_images: image ? [image] : [],
  };
}
