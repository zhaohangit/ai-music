import type { Track, TrackStage } from "../types";

export type PhaseId = TrackStage;

export const PHASES: ReadonlyArray<{
  id: TrackStage;
  label: string;
  labelEn: string;
}> = [
  { id: "queued", label: "已提交", labelEn: "Submitted" },
  { id: "generating", label: "创作中", labelEn: "Creating" },
  { id: "downloading", label: "保存作品", labelEn: "Saving track" },
  { id: "done", label: "已完成", labelEn: "Completed" },
];

export interface StageInfo {
  phase: TrackStage;
  label: string;
  labelEn: string;
  tone: "idle" | "active" | "success" | "error";
}

export function parseStage(track: Track): StageInfo {
  if (track.status === "error" || track.stage === "error") {
    return {
      phase: "error",
      label: "生成失败",
      labelEn: "Generation failed",
      tone: "error",
    };
  }
  if (track.status === "done" || track.stage === "done") {
    return {
      phase: "done",
      label: "作品已保存，可以播放",
      labelEn: "Track saved and ready to play",
      tone: "success",
    };
  }
  if (track.stage === "downloading") {
    return {
      phase: "downloading",
      label: "正在保存音频与封面",
      labelEn: "Saving audio and cover",
      tone: "active",
    };
  }
  if (track.stage === "generating" || track.status === "running") {
    return {
      phase: "generating",
      label: "Suno 正在谱曲与演唱",
      labelEn: "Suno is composing and singing",
      tone: "active",
    };
  }
  return {
    phase: "queued",
    label: "已进入 MXAPI 任务队列",
    labelEn: "Added to the MXAPI task queue",
    tone: "idle",
  };
}

export const phaseIndex = (phase: TrackStage) =>
  PHASES.findIndex((item) => item.id === phase);
