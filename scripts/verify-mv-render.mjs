// Exercises real OrbStack/FFmpeg assembly using synthetic audio and moving test patterns.
// It never constructs an API provider or submits a generation request.
import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { MvMedia, parseSrt } from "../server/dist/platform/mv/media.js";
import { LocalObjectStorage } from "../server/dist/platform/object-storage.js";
const root = path.resolve("artifacts/mv-verification");
await fs.mkdir(root, { recursive: true });
const local = await fs
  .readFile(".env.mv.local", "utf8")
  .then(parseEnv)
  .catch(() => ({}));
const storage = new LocalObjectStorage(path.join(root, "test-objects"));
const media = new MvMedia({ ...process.env, ...local }, storage);
const source = await media.temp();
try {
  await media.run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=854x480:rate=24",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "source.mp4",
    ],
    source,
  );
  await media.run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:sample_rate=48000:duration=4",
      "-c:a",
      "aac",
      "song.m4a",
    ],
    source,
  );
  await storage.putFile(
    "test/shot.mp4",
    path.join(source, "source.mp4"),
    "video/mp4",
  );
  await storage.putFile(
    "test/audio.m4a",
    path.join(source, "song.m4a"),
    "audio/mp4",
  );
  const shots = [0, 1].map((i) => ({
    id: `test-${i}`,
    index: i,
    start: i * 2,
    duration: 2,
    generationSeconds: 4,
    model: "seedance-2.5",
    prompt: "Synthetic moving pattern",
    status: "ready",
    providerTaskId: null,
    error: null,
    objectKey: "test/shot.mp4",
  }));
  const settings = {
    trackId: "test",
    title: "字幕合成验收",
    concept: "synthetic",
    model: "seedance-2.5",
    resolution: "480p",
    ratio: "16:9",
    duration: 4,
    shotSeconds: 4,
    referenceId: null,
    performance: "story",
    subtitles: true,
    subtitleStyle: "clean",
    srt: "",
    audioGainDb: 0,
  };
  const project = {
    id: "verification",
    owner: "verification",
    settings,
    shots,
    status: "assembling",
    revision: 1,
    error: null,
    progress: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const captions = parseSrt(
    "1\n00:00:00,200 --> 00:00:01,800\n嫩绿的回信 · 动态镜头\n\n2\n00:00:02,200 --> 00:00:03,800\n人物、歌声与歌词字幕\n",
  );
  const result = await media.render(project, "test/audio.m4a", captions);
  try {
    await fs.copyFile(
      result.file,
      path.join(root, "mv-render-verification.mp4"),
    );
    await fs.writeFile(
      path.join(root, "mv-render-verification.srt"),
      result.srt,
    );
    await media.run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        "1",
        "-i",
        "final.mp4",
        "-frames:v",
        "1",
        "check.jpg",
      ],
      result.directory,
    );
    await fs.copyFile(
      path.join(result.directory, "check.jpg"),
      path.join(root, "mv-render-verification.jpg"),
    );
    const info = await media.probe("final.mp4", result.directory);
    if (
      info.width !== 854 ||
      info.height !== 480 ||
      Math.abs(info.duration - 4) > 0.15
    )
      throw new Error(
        "Output does not match requested dimensions and duration",
      );
    console.log(
      JSON.stringify({
        verified: true,
        ...info,
        subtitles: captions.length,
        providerCalls: 0,
      }),
    );
  } finally {
    await fs.rm(result.directory, { recursive: true, force: true });
  }
  await media.run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000:duration=4",
      "-c:a",
      "pcm_s16le",
      "instrumental.wav",
    ],
    source,
  );
  await storage.putFile(
    "test/vocals.m4a",
    path.join(source, "song.m4a"),
    "audio/mp4",
  );
  await storage.putFile(
    "test/instrumental.wav",
    path.join(source, "instrumental.wav"),
    "audio/wav",
  );
  const mix = await media.previewMix(
    {
      ...project,
      settings: { ...settings, vocalGainDb: 6, instrumentalGainDb: -6 },
    },
    "test/audio.m4a",
    { vocals: "test/vocals.m4a", instrumental: "test/instrumental.wav" },
    0,
  );
  try {
    await media.run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        "preview.mp3",
        "-ss",
        "0.5",
        "-t",
        "2",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "f32le",
        "samples.raw",
      ],
      mix.directory,
    );
    const raw = await fs.readFile(path.join(mix.directory, "samples.raw"));
    const n = raw.length / 4;
    function amplitude(f) {
      let x = 0,
        y = 0;
      for (let i = 0; i < n; i++) {
        const v = raw.readFloatLE(i * 4),
          angle = (2 * Math.PI * f * i) / 48000;
        x += v * Math.cos(angle);
        y += v * Math.sin(angle);
      }
      return (2 * Math.hypot(x, y)) / n;
    }
    const difference = 20 * Math.log10(amplitude(330) / amplitude(660));
    if (difference < 10 || difference > 14)
      throw new Error("Independent vocal/instrumental gain was not applied");
    await fs.copyFile(
      mix.file,
      path.join(root, "independent-mix-verification.mp3"),
    );
    console.log(
      JSON.stringify({
        independentStemMix: true,
        measuredVocalAdvantageDb: Number(difference.toFixed(2)),
        expectedDb: 12,
        providerCalls: 0,
      }),
    );
  } finally {
    await fs.rm(mix.directory, { recursive: true, force: true });
  }
  const portrait = await media.render(
    { ...project, settings: { ...settings, ratio: "9:16" } },
    "test/audio.m4a",
    captions,
  );
  try {
    const info = await media.probe("final.mp4", portrait.directory);
    if (info.width !== 480 || info.height !== 854)
      throw new Error("Portrait render has incorrect dimensions");
    await fs.copyFile(
      portrait.file,
      path.join(root, "mv-render-portrait-verification.mp4"),
    );
    console.log(
      JSON.stringify({
        verified: true,
        orientation: "portrait",
        ...info,
        providerCalls: 0,
      }),
    );
  } finally {
    await fs.rm(portrait.directory, { recursive: true, force: true });
  }
} finally {
  await storage.close();
  await fs.rm(source, { recursive: true, force: true });
}
