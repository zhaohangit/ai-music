import { describe, it, expect } from "vitest";
import {
  createStoryboard,
  validateSettings,
  videoModel,
  videoPayload,
  VIDEO_MODELS,
} from "../../src/platform/mv/catalog.js";
import {
  parseSrt,
  toAss,
  alignmentCaptions,
} from "../../src/platform/mv/media.js";
import type { MvSettings } from "../../src/platform/mv/types.js";
const settings: MvSettings = {
  trackId: "track-a",
  title: "Green",
  concept: "A character walks and sings by the sea",
  model: "seedance-2.5",
  resolution: "720p",
  ratio: "16:9",
  duration: 289.56,
  shotSeconds: 12,
  referenceId: "photo",
  performance: "singing",
  subtitles: true,
  subtitleStyle: "clean",
  srt: "",
  audioGainDb: 0,
};
describe("MV production contracts", () => {
  it("covers the entire song once with independent shots, including the fractional tail", () => {
    const shots = createStoryboard(settings);
    expect(shots).toHaveLength(25);
    expect(new Set(shots.map((s) => s.id)).size).toBe(25);
    expect(shots.reduce((sum, s) => sum + s.duration, 0)).toBeCloseTo(
      settings.duration,
      5,
    );
    shots
      .slice(1)
      .forEach((s, i) =>
        expect(s.start).toBeCloseTo(shots[i].start + shots[i].duration, 5),
      );
    expect(shots.at(-1)?.duration).toBeCloseTo(1.56);
    expect(shots.at(-1)?.generationSeconds).toBe(12);
  });
  it("enforces model specific frame sizes, durations, audio references and source length", () => {
    expect(() =>
      validateSettings({ ...settings, duration: 400 }, 300),
    ).toThrow();
    expect(() =>
      validateSettings(
        { ...settings, model: "veo-3.1-fast", shotSeconds: 12 },
        300,
      ),
    ).toThrow();
    expect(() =>
      validateSettings(
        { ...settings, model: "seedance-2.0-mini", resolution: "1080p" },
        300,
      ),
    ).toThrow();
    expect(() =>
      validateSettings(
        { ...settings, model: "grok-imagine-video", performance: "audio" },
        300,
      ),
    ).toThrow();
    expect(() =>
      validateSettings({ ...settings, referenceId: null }, 300),
    ).toThrow();
    expect(VIDEO_MODELS).toHaveLength(12);
  });
  it("maps each model family to its documented wire fields", () => {
    const shot = createStoryboard(settings)[0];
    const seed = videoPayload(
      videoModel("seedance-2.5"),
      shot,
      settings,
      "https://ref/photo",
      "https://ref/audio",
    );
    expect(seed).toMatchObject({
      duration: 12,
      generate_audio: true,
      content: [
        { type: "text" },
        { type: "image_url", role: "reference_image" },
        { type: "audio_url", role: "reference_audio" },
      ],
    });
    const grok = videoPayload(
      videoModel("grok-imagine-video"),
      shot,
      settings,
      "https://ref/photo",
    );
    expect(grok).toMatchObject({
      video_length: "12",
      resolution_name: "720p",
      refer_images: ["https://ref/photo"],
    });
    expect(grok).not.toHaveProperty("content");
    const veo = videoPayload(
      videoModel("veo-3.1-fast"),
      { ...shot, generationSeconds: 8 },
      settings,
      "https://ref/photo",
    );
    expect(veo).toMatchObject({
      duration: "8",
      aspect_ratio: "16:9",
      reference_images: ["https://ref/photo"],
    });
  });
  it("uses real alignment timestamps and escapes ASS markup", () => {
    const captions = alignmentCaptions(
      {
        alignment: [
          { word: "嫩绿", startS: 1.2, endS: 2.4 },
          { word: "回信", startS: 3.3, endS: 4 },
        ],
      },
      3.5,
    );
    expect(captions).toEqual([
      { text: "嫩绿", start: 1.2, end: 2.4 },
      { text: "回信", start: 3.3, end: 3.5 },
    ]);
    const srt = "1\n00:00:01,200 --> 00:00:03,500\n{\\pos(0,0)}回信\n";
    const ass = toAss(parseSrt(srt), 1280, 720, "Noto Sans CJK SC", "clean");
    expect(ass).not.toContain("{\\pos");
    expect(ass).toContain("0:00:01.20,0:00:03.50");
    expect(() => parseSrt("1\n00:00:04,000 --> 00:00:01,000\nhello")).toThrow();
  });
});
