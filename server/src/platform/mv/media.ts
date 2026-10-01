import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { ObjectStorage } from "../object-storage.js";
import type { MvProject } from "./types.js";
import { ValidationError } from "../../errors.js";
export interface Caption {
  start: number;
  end: number;
  text: string;
}
const seconds = (v: string) => {
  const a = v.replace(",", ".").split(":").map(Number);
  return a[0] * 3600 + a[1] * 60 + a[2];
};
export function parseSrt(text: string, maxDuration = 600): Caption[] {
  if (text.length > 80000) throw new ValidationError("字幕文件过大");
  const captions = text
    .trim()
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const rows = block.split("\n");
      if (/^\d+$/.test(rows[0])) rows.shift();
      const m = rows
        .shift()
        ?.match(
          /^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})$/,
        );
      if (!m) throw new ValidationError("SRT 时间格式无效");
      const start = seconds(m[1]),
        end = seconds(m[2]),
        content = rows
          .join("\n")
          .replace(/<[^>]*>/g, "")
          .trim();
      if (
        !content ||
        content.length > 300 ||
        start < 0 ||
        end <= start ||
        end > maxDuration + 1
      )
        throw new ValidationError("SRT 字幕内容或时间范围无效");
      return { start, end, text: content };
    });
  if (!captions.length || captions.length > 1500)
    throw new ValidationError("SRT 字幕为空或条目过多");
  if (captions.some((c, i) => i > 0 && c.start < captions[i - 1].start))
    throw new ValidationError("字幕必须按时间排序");
  return captions;
}
export function alignmentCaptions(value: any, duration: number): Caption[] {
  const rows = Array.isArray(value?.alignment) ? value.alignment : [];
  const words: Caption[] = rows
    .filter((r: any) => r.success !== false)
    .map((r: any) => ({
      start: Number(r.startS ?? r.start_s ?? r.start),
      end: Number(r.endS ?? r.end_s ?? r.end),
      text: String(r.word ?? r.text ?? "").trim(),
    }))
    .filter(
      (r: Caption) =>
        Number.isFinite(r.start) &&
        Number.isFinite(r.end) &&
        r.start >= 0 &&
        r.start < duration &&
        r.end > r.start &&
        r.text &&
        !/^\[.*\]$/.test(r.text),
    )
    .map((r: Caption) => ({ ...r, end: Math.min(r.end, duration) }))
    .sort((a: Caption, b: Caption) => a.start - b.start);
  const captions: Caption[] = [];
  for (const word of words) {
    const prev = captions.at(-1),
      limit = /[\u3400-\u9fff]/.test(word.text) ? 26 : 60;
    if (
      prev &&
      word.start - prev.end < 0.7 &&
      word.end - prev.start <= 6 &&
      prev.text.length + word.text.length <= limit &&
      !/[\u3002\uff01\uff1f!?;]$/.test(prev.text)
    ) {
      const join =
        /[a-z0-9]$/i.test(prev.text) && /^[a-z0-9]/i.test(word.text) ? " " : "";
      prev.text += join + word.text;
      prev.end = Math.max(prev.end, word.end);
    } else captions.push({ ...word });
  }
  captions.forEach((c, i) => {
    if (captions[i + 1]) c.end = Math.min(c.end, captions[i + 1].start);
  });
  return captions.filter((c) => c.end > c.start);
}

function stamp(n: number, ass = false) {
  const u = Math.round(n * (ass ? 100 : 1000)),
    scale = ass ? 100 : 1000;
  return `${String(Math.floor(u / (3600 * scale))).padStart(ass ? 1 : 2, "0")}:${String(Math.floor(u / (60 * scale)) % 60).padStart(2, "0")}:${String(Math.floor(u / scale) % 60).padStart(2, "0")}${ass ? "." : ","}${String(u % scale).padStart(ass ? 2 : 3, "0")}`;
}
export function toSrt(captions: Caption[]): string {
  return (
    captions
      .map(
        (c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`,
      )
      .join("\n\n") + "\n"
  );
}
export function toAss(
  captions: Caption[],
  width: number,
  height: number,
  font: string,
  style: string,
): string {
  const size = Math.round(height * (style === "cinema" ? 0.048 : 0.055));
  return (
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${font.replace(/[,\r\n]/g, "")},${size},&H00FFFFFF,&H000000FF,&H70000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,${Math.round(height * 0.07)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    captions
      .map(
        (c) =>
          `Dialogue: 0,${stamp(c.start, true)},${stamp(c.end, true)},Default,,0,0,0,,${c.text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, "\\N")}`,
      )
      .join("\n")
  );
}
export class MvMedia {
  constructor(
    private readonly env: NodeJS.ProcessEnv,
    private readonly storage: ObjectStorage,
  ) {}
  async temp(): Promise<string> {
    const root = path.resolve(
      this.env.MV_WORK_DIR || path.join(os.tmpdir(), "museflow-mv"),
    );
    await fs.mkdir(root, { recursive: true });
    return fs.mkdtemp(path.join(root, "render-"));
  }
  async run(
    tool: "ffmpeg" | "ffprobe",
    args: string[],
    cwd: string,
    timeout = 15 * 60_000,
  ): Promise<string> {
    const image = this.env.MV_FFMPEG_DOCKER_IMAGE;
    const containerName = `museflow-media-${randomUUID()}`;
    let command =
      tool === "ffmpeg"
        ? this.env.FFMPEG_PATH || tool
        : this.env.FFPROBE_PATH || tool;
    let argv = args;
    if (image) {
      command = this.env.DOCKER_PATH || "docker";
      argv = [
        "run",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--cpus",
        "2",
        "-v",
        `${cwd}:/work`,
        "-w",
        "/work",
        ...(this.env.MV_FONT_PATH
          ? ["-v", `${this.env.MV_FONT_PATH}:/fonts/Chinese.ttf:ro`]
          : []),
        "--entrypoint",
        tool,
        image,
        ...args,
      ];
    }
    return new Promise((resolve, reject) => {
      const child = spawn(command, argv, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        if (image) {
          const cleanup = spawn(
            this.env.DOCKER_PATH || "docker",
            ["rm", "--force", containerName],
            { stdio: "ignore" },
          );
          cleanup.on("error", () => undefined);
          const timeout = setTimeout(() => cleanup.kill("SIGKILL"), 10_000);
          timeout.unref();
          cleanup.on("close", () => clearTimeout(timeout));
        }
        reject(new Error("视频处理超时"));
      }, timeout);
      const read = (b: Buffer) => {
        log = (log + b.toString()).slice(-100000);
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve(log)
          : reject(new Error(`视频处理失败 (${code})：${log.slice(-800)}`));
      });
    });
  }
  async ready(): Promise<boolean> {
    const dir = await this.temp();
    try {
      const encoders = await this.run("ffmpeg", ["-encoders"], dir, 10_000);
      await this.run("ffprobe", ["-version"], dir, 10_000);
      return ["libx264", "aac", "libmp3lame"].every((codec) =>
        encoders.includes(codec),
      );
    } catch {
      return false;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  async copy(key: string, file: string): Promise<void> {
    const object = await this.storage.read(key);
    await pipeline(object.body, createWriteStream(file));
  }
  async probe(
    file: string,
    cwd: string,
  ): Promise<{ duration: number; width: number; height: number }> {
    const r = JSON.parse(
      await this.run(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=width,height",
          "-of",
          "json",
          file,
        ],
        cwd,
        30_000,
      ),
    );
    return {
      duration: Number(r.format.duration),
      width: r.streams.find((s: { width?: number }) => s.width)?.width || 0,
      height: r.streams.find((s: { height?: number }) => s.height)?.height || 0,
    };
  }
  async segment(
    audioKey: string,
    start: number,
    duration: number,
  ): Promise<{ directory: string; file: string }> {
    const directory = await this.temp();
    try {
      await this.copy(audioKey, path.join(directory, "song"));
      await this.run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          "song",
          "-ss",
          String(start),
          "-t",
          String(duration),
          "-vn",
          "-ar",
          "44100",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          "-af",
          "apad",
          "segment.mp3",
        ],
        directory,
      );
      return { directory, file: path.join(directory, "segment.mp3") };
    } catch (e) {
      await fs.rm(directory, { recursive: true, force: true });
      throw e;
    }
  }
  async inspectMotion(
    file: string,
    cwd: string,
  ): Promise<{ freezeSeconds: number; warnings: string[] }> {
    const log = await this.run(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        file,
        "-vf",
        "freezedetect=n=-50dB:d=3",
        "-an",
        "-f",
        "null",
        "-",
      ],
      cwd,
      120_000,
    );
    const durations = [...log.matchAll(/freeze_duration: ([0-9.]+)/g)].map(
      (m) => Number(m[1]),
    );
    const open = [...log.matchAll(/freeze_start: ([0-9.]+)/g)].at(-1),
      ends = [...log.matchAll(/freeze_end: ([0-9.]+)/g)];
    if (open && (!ends.length || Number(ends.at(-1)![1]) < Number(open[1]))) {
      const info = await this.probe(file, cwd);
      durations.push(Math.max(0, info.duration - Number(open[1])));
    }
    const freezeSeconds = Math.max(0, ...durations);
    return {
      freezeSeconds,
      warnings:
        freezeSeconds >= 3
          ? [`画面疑似持续静止 ${freezeSeconds.toFixed(1)} 秒，请预览确认`]
          : [],
    };
  }
  private async mixStems(
    project: MvProject,
    stems: { vocals: string; instrumental: string },
    directory: string,
  ): Promise<void> {
    await this.copy(stems.vocals, path.join(directory, "vocals"));
    await this.copy(stems.instrumental, path.join(directory, "instrumental"));
    const v = project.settings.vocalGainDb ?? 0,
      i = project.settings.instrumentalGainDb ?? 0;
    await this.run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        "vocals",
        "-i",
        "instrumental",
        "-filter_complex",
        `[0:a]volume=${v}dB[v];[1:a]volume=${i}dB[i];[v][i]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=0[m]`,
        "-map",
        "[m]",
        "-t",
        String(project.settings.duration),
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        "mix.wav",
      ],
      directory,
    );
    await fs.rename(
      path.join(directory, "mix.wav"),
      path.join(directory, "song"),
    );
  }
  async previewMix(
    project: MvProject,
    audioKey: string,
    stems: { vocals: string; instrumental: string },
    start: number,
  ): Promise<{ directory: string; file: string }> {
    const directory = await this.temp();
    try {
      await this.copy(audioKey, path.join(directory, "song"));
      await this.mixStems(project, stems, directory);
      await this.run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          "song",
          "-ss",
          String(start),
          "-t",
          String(Math.min(20, project.settings.duration - start)),
          "-af",
          `volume=${project.settings.audioGainDb}dB,alimiter=limit=0.95:level=0`,
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          "preview.mp3",
        ],
        directory,
      );
      return { directory, file: path.join(directory, "preview.mp3") };
    } catch (e) {
      await fs.rm(directory, { recursive: true, force: true });
      throw e;
    }
  }
  async render(
    project: MvProject,
    audioKey: string,
    captions: Caption[],
    stems?: { vocals: string; instrumental: string },
  ): Promise<{ directory: string; file: string; srt: string }> {
    const directory = await this.temp(),
      s = project.settings;
    try {
      await this.copy(audioKey, path.join(directory, "song"));
      if (stems) await this.mixStems(project, stems, directory);
      const edge = Number(s.resolution.replace("p", ""));
      const [rw, rh] = s.ratio.split(":").map(Number);
      const scale = edge / Math.min(rw, rh);
      const width = Math.round((rw * scale) / 2) * 2;
      const height = Math.round((rh * scale) / 2) * 2;
      for (const shot of project.shots) {
        if (shot.status !== "ready" || !shot.objectKey)
          throw new Error("仍有分镜未生成，不能合成");
        const input = `source-${shot.index}.mp4`,
          output = `clip-${shot.index}.mp4`;
        await this.copy(shot.objectKey, path.join(directory, input));
        const info = await this.probe(input, directory);
        if (info.duration + 0.15 < (shot.sourceOffset ?? 0) + shot.duration)
          throw new Error(`第 ${shot.index + 1} 镜时长不足，需要重新生成`);
        await this.run(
          "ffmpeg",
          [
            "-v",
            "error",
            "-ss",
            String(shot.sourceOffset ?? 0),
            "-i",
            input,
            "-t",
            String(shot.duration),
            "-an",
            "-vf",
            `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=24`,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            output,
          ],
          directory,
        );
      }
      await fs.writeFile(
        path.join(directory, "clips.txt"),
        project.shots.map((c) => `file 'clip-${c.index}.mp4'`).join("\n"),
      );
      const srt = toSrt(captions);
      await fs.writeFile(path.join(directory, "lyrics.srt"), srt);
      if (s.subtitles && !captions.length)
        throw new Error("歌词时间轴尚未就绪，未生成无字幕替代品");
      await fs.writeFile(
        path.join(directory, "lyrics.ass"),
        toAss(
          captions,
          width,
          height,
          this.env.MV_FONT_FAMILY || "Noto Sans CJK SC",
          s.subtitleStyle,
        ),
      );
      const log = await this.run(
        "ffmpeg",
        [
          "-v",
          "warning",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "clips.txt",
          "-i",
          "song",
          "-t",
          String(s.duration),
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          ...(s.subtitles
            ? ["-vf", "subtitles=lyrics.ass:fontsdir=/fonts"]
            : []),
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-b:a",
          "192k",
          "-af",
          `volume=${s.audioGainDb}dB,alimiter=limit=0.95`,
          "-movflags",
          "+faststart",
          "final.mp4",
        ],
        directory,
      );
      if (/Glyph.*not found|failed to find.*font/i.test(log))
        throw new Error("字幕字体缺少字符，请配置中文字体");
      const info = await this.probe("final.mp4", directory);
      if (Math.abs(info.duration - s.duration) > 0.3)
        throw new Error("成片时长校验失败");
      return { directory, file: path.join(directory, "final.mp4"), srt };
    } catch (e) {
      await fs.rm(directory, { recursive: true, force: true });
      throw e;
    }
  }
}
