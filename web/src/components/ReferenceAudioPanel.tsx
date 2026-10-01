import { useMemo, useRef, useState } from "react";
import {
  audioUploadLimits,
  fileMatchesAudioLimits,
  findOperation,
  operationGateReason,
  operationHasQuote,
  referenceAudioParameterConfig,
} from "../lib/operations";
import type { MusicModelProfile, MusicOperationProfile } from "../types";
import { useI18n } from "../i18n";
import { Alert, Music, Shield, Spinner, Trash } from "./Icons";

export interface ReferenceAudioDraft {
  purpose: "import" | "extend";
  file: File | null;
  durationSeconds: number | null;
  inspecting: boolean;
  copyrightConfirmed: boolean;
  copyrightAudio: boolean;
  continueAt: number;
  audioWeight: number;
}

export const EMPTY_REFERENCE_AUDIO: ReferenceAudioDraft = {
  purpose: "extend",
  file: null,
  durationSeconds: null,
  inspecting: false,
  copyrightConfirmed: false,
  copyrightAudio: false,
  continueAt: 0,
  audioWeight: 0.65,
};

interface Props {
  value: ReferenceAudioDraft;
  operations: MusicOperationProfile[];
  targetModel?: MusicModelProfile;
  operationsError?: string | null;
  onChange: (value: ReferenceAudioDraft) => void;
  inspectDuration?: (file: File) => Promise<number>;
}

export const modelSupportsReferenceAudioWeight = (
  model: MusicModelProfile | undefined,
): boolean =>
  Boolean(model?.capabilities.styleWeight && model.capabilities.weirdness);

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

const formatDuration = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

async function browserAudioDuration(file: File): Promise<number> {
  if (!URL.createObjectURL)
    throw new Error("Unable to read local audio metadata in this browser");
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () =>
        Number.isFinite(audio.duration) && audio.duration > 0
          ? resolve(audio.duration)
          : reject(new Error("Unable to detect the audio duration"));
      audio.onerror = () =>
        reject(
          new Error(
            "Unable to read the audio; check that the file is not corrupted",
          ),
        );
      audio.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ReferenceAudioPanel({
  value,
  operations,
  targetModel,
  operationsError = null,
  onChange,
  inspectDuration = browserAudioDuration,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [fileError, setFileError] = useState<string | null>(null);
  const inspectionId = useRef(0);
  const latestValue = useRef(value);
  latestValue.current = value;
  const uploadProfile = findOperation(operations, "upload", {
    copyrightAudio: value.copyrightAudio,
  });
  const extendProfile = findOperation(operations, "upload_extend", {
    copyrightAudio: value.copyrightAudio,
  });
  const activeProfile =
    value.purpose === "import" ? uploadProfile : extendProfile;
  const limits = audioUploadLimits(uploadProfile);
  const referenceParameters = referenceAudioParameterConfig(extendProfile);
  const supportsAudioWeight = modelSupportsReferenceAudioWeight(targetModel);
  const uploadConfigReady = Boolean(
    (limits.acceptedMimeTypes.length || limits.acceptedExtensions.length) &&
      limits.maxBytes &&
      limits.maxDurationSeconds,
  );
  const configReady =
    uploadConfigReady &&
    (value.purpose === "import" || Boolean(referenceParameters));
  const accept = [
    ...limits.acceptedMimeTypes,
    ...limits.acceptedExtensions,
  ].join(",");
  const maxContinueAt = value.durationSeconds
    ? Math.min(
        referenceParameters?.continueCatalogMax ?? value.durationSeconds,
        value.durationSeconds,
      )
    : (referenceParameters?.continueCatalogMax ?? 0);
  const displayedAudioWeight = value.file
    ? value.audioWeight
    : (referenceParameters?.audioWeightDefault ?? value.audioWeight);
  const priceReady = operationHasQuote(activeProfile);
  const totalPrice = priceReady
    ? Number(activeProfile?.estimatedCredits)
    : null;

  const limitsText = useMemo(() => {
    if (!configReady)
      return text(
        "上传限制暂未由服务端返回，文件选择已安全禁用。",
        "Upload limits are not available from the server; file selection is disabled safely.",
      );
    const format = limits.acceptedExtensions.length
      ? limits.acceptedExtensions
          .map((item) => item.slice(1).toLocaleUpperCase())
          .join(" / ")
      : limits.acceptedMimeTypes.join(" / ");
    return `${format} · ${text("最大", "max")} ${formatBytes(Number(limits.maxBytes))} · ${text("最长", "up to")} ${formatDuration(Number(limits.maxDurationSeconds))}`;
  }, [configReady, limits]);

  const patch = (next: Partial<ReferenceAudioDraft>) => {
    const merged = { ...latestValue.current, ...next };
    latestValue.current = merged;
    onChange(merged);
  };

  const changeCopyrightVariant = (copyrightAudio: boolean) => {
    const nextProfile = findOperation(operations, "upload_extend", {
      copyrightAudio,
    });
    const nextParameters = referenceAudioParameterConfig(nextProfile);
    const audioWeight =
      nextParameters &&
      (value.audioWeight < nextParameters.audioWeightMin ||
        value.audioWeight > nextParameters.audioWeightMax)
        ? nextParameters.audioWeightDefault
        : value.audioWeight;
    const maximumContinue = value.durationSeconds
      ? Math.min(
          nextParameters?.continueCatalogMax ?? value.durationSeconds,
          value.durationSeconds,
        )
      : (nextParameters?.continueCatalogMax ?? value.continueAt);
    const continueAt = nextParameters
      ? Math.min(
          maximumContinue,
          Math.max(nextParameters.continueMin, value.continueAt),
        )
      : value.continueAt;
    patch({ copyrightAudio, audioWeight, continueAt });
  };

  const changePurpose = (purpose: ReferenceAudioDraft["purpose"]) => {
    setFileError(null);
    if (purpose === "import") {
      patch({ purpose });
      return;
    }
    const nextParameters = referenceAudioParameterConfig(
      findOperation(operations, "upload_extend", {
        copyrightAudio: value.copyrightAudio,
      }),
    );
    const durationMaximum =
      value.durationSeconds ??
      nextParameters?.continueCatalogMax ??
      value.continueAt;
    patch({
      purpose,
      continueAt: nextParameters
        ? Math.min(
            nextParameters.continueCatalogMax ?? durationMaximum,
            durationMaximum,
            Math.max(nextParameters.continueMin, value.continueAt),
          )
        : value.continueAt,
      audioWeight: nextParameters
        ? Math.min(
            nextParameters.audioWeightMax,
            Math.max(nextParameters.audioWeightMin, value.audioWeight),
          )
        : value.audioWeight,
    });
  };

  const selectFile = async (file: File | undefined) => {
    const requestId = ++inspectionId.current;
    setFileError(null);
    if (!file) return;
    if (!configReady) {
      setFileError(
        text(
          "服务端上传能力配置不完整，暂不能选择文件",
          "Server upload configuration is incomplete; file selection is unavailable",
        ),
      );
      return;
    }
    if (!fileMatchesAudioLimits(file, limits)) {
      setFileError(
        `${text("不支持此文件类型。服务端当前允许：", "This file type is not supported. Allowed by the server: ")}${limitsText}`,
      );
      return;
    }
    if (limits.maxBytes && file.size > limits.maxBytes) {
      setFileError(
        `${text("文件大小", "File size")} ${formatBytes(file.size)} ${text("超过服务端限制", "exceeds the server limit")} ${formatBytes(limits.maxBytes)}`,
      );
      return;
    }
    patch({ file, durationSeconds: null, inspecting: true });
    try {
      const durationSeconds = await inspectDuration(file);
      if (requestId !== inspectionId.current) return;
      if (
        limits.maxDurationSeconds &&
        durationSeconds > limits.maxDurationSeconds
      ) {
        patch({ file, durationSeconds, inspecting: false });
        setFileError(
          `${text("音频时长", "Audio duration")} ${formatDuration(durationSeconds)} ${text("超过服务端限制", "exceeds the server limit")} ${formatDuration(limits.maxDurationSeconds)}`,
        );
        return;
      }
      const defaultContinue = referenceParameters?.continueDefault ?? 0;
      patch({
        file,
        durationSeconds,
        inspecting: false,
        continueAt: Math.min(
          referenceParameters?.continueCatalogMax ?? durationSeconds,
          durationSeconds,
          Math.max(referenceParameters?.continueMin ?? 0, defaultContinue),
        ),
        audioWeight:
          referenceParameters?.audioWeightDefault ?? value.audioWeight,
      });
    } catch (cause) {
      if (requestId !== inspectionId.current) return;
      patch({ file, durationSeconds: null, inspecting: false });
      setFileError(
        cause instanceof Error
          ? cause.message
          : text("无法读取音频元数据", "Unable to read audio metadata"),
      );
    }
  };

  const removeFile = () => {
    inspectionId.current += 1;
    setFileError(null);
    patch({
      file: null,
      durationSeconds: null,
      inspecting: false,
      continueAt: 0,
    });
  };

  const actionGate = operationGateReason(activeProfile);

  return (
    <section
      className="reference-audio-card"
      aria-labelledby="reference-audio-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">REFERENCE AUDIO</span>
          <h2
            id="reference-audio-title"
            className="mt-1.5 text-sm font-semibold text-main"
          >
            {text("上传参考音频", "Upload reference audio")}
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            {text(
              "文件只上传到 AI Music Studio 私有资产接口；Provider 接入与续作由服务端按所选动作执行。",
              "Files are uploaded only to the private AI Music Studio asset endpoint; Provider import and continuation run server-side according to the selected action.",
            )}
          </p>
        </div>
        <span className="feature-icon !h-9 !w-9">
          <Music width={17} height={17} />
        </span>
      </div>

      <div
        className="mt-4 segmented w-full"
        role="group"
        aria-label={text("参考音频处理方式", "Reference audio action")}
      >
        <button
          type="button"
          className={value.purpose === "import" ? "active flex-1" : "flex-1"}
          aria-pressed={value.purpose === "import"}
          onClick={() => changePurpose("import")}
        >
          {text("仅导入单曲", "Import track only")}
        </button>
        <button
          type="button"
          className={value.purpose === "extend" ? "active flex-1" : "flex-1"}
          aria-pressed={value.purpose === "extend"}
          onClick={() => changePurpose("extend")}
        >
          {text("上传并续作", "Upload & continue")}
        </button>
      </div>

      <div className="mt-4">
        <label
          className={`reference-audio-drop ${!configReady ? "is-disabled" : ""}`}
        >
          <input
            type="file"
            accept={accept || undefined}
            disabled={!configReady}
            onChange={(event) => {
              void selectFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
            aria-label={text("选择参考音频", "Choose reference audio")}
          />
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-soft">
            <Music width={18} height={18} />
          </span>
          <span className="min-w-0 flex-1">
            <strong>
              {value.file
                ? value.file.name
                : text("选择本地音频", "Choose local audio")}
            </strong>
            <small>
              {value.file
                ? `${formatBytes(value.file.size)}${value.durationSeconds ? ` · ${formatDuration(value.durationSeconds)}` : ""}`
                : limitsText}
            </small>
          </span>
          {value.inspecting ? (
            <Spinner width={16} height={16} />
          ) : (
            <span className="status-chip">{text("浏览", "Browse")}</span>
          )}
        </label>
        {value.file && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted hover:text-rose-300"
            onClick={removeFile}
          >
            <Trash width={12} height={12} /> {text("移除文件", "Remove file")}
          </button>
        )}
        {(fileError || operationsError || !configReady) && (
          <p
            className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-300"
            role="alert"
          >
            <Alert width={12} height={12} className="mt-0.5 shrink-0" />
            {fileError ||
              operationsError ||
              text(
                "服务端上传限制配置不完整",
                "Server upload limits are incomplete",
              )}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
        <label className="reference-check">
          <input
            type="checkbox"
            checked={value.copyrightConfirmed}
            onChange={(event) =>
              patch({ copyrightConfirmed: event.target.checked })
            }
          />
          <span>
            <strong>
              {text(
                "我确认拥有上传及生成所需的全部权利",
                "I confirm that I own all rights required for upload and generation",
              )}
            </strong>
            <small>
              {text(
                "这是强制权利声明；未确认时不会上传文件或创建任务。",
                "This rights declaration is required; no file or task is created until confirmed.",
              )}
            </small>
          </span>
        </label>
        <label className="reference-check reference-check-warning">
          <input
            type="checkbox"
            checked={value.copyrightAudio}
            onChange={(event) => changeCopyrightVariant(event.target.checked)}
          />
          <span>
            <strong>
              {text(
                "此素材需要 Provider 的版权音频处理",
                "This asset requires Provider copyright-audio processing",
              )}
            </strong>
            <small>
              {text(
                "这是独立的加价类型，不等同于上方权利确认；可能产生额外积分消耗和审核风险。",
                "This is a separate billable type, distinct from the rights confirmation above; it may add credits and review risk.",
              )}
            </small>
          </span>
        </label>
      </div>

      {value.purpose === "extend" && (
        <div className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
          <div>
            <label className="parameter-label" htmlFor="reference-continue-at">
              {text("续作起点（秒）", "Continuation point (seconds)")}
            </label>
            <input
              id="reference-continue-at"
              type="number"
              className="field"
              min={referenceParameters?.continueMin ?? 0}
              max={maxContinueAt}
              step={referenceParameters?.continueStep ?? "any"}
              disabled={!configReady || !value.durationSeconds}
              value={value.continueAt}
              onChange={(event) =>
                patch({
                  continueAt: Math.min(
                    maxContinueAt,
                    Math.max(
                      referenceParameters?.continueMin ?? 0,
                      Number(event.target.value),
                    ),
                  ),
                })
              }
            />
            <p className="mt-1.5 text-[10px] leading-4 text-muted">
              {text(
                "上限会同时受服务端能力与所选音频实际时长约束。",
                "The limit follows both server capability and the selected audio duration.",
              )}
            </p>
          </div>
          {supportsAudioWeight ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  className="parameter-label !mb-0"
                  htmlFor="reference-audio-weight"
                >
                  {text("参考音频权重", "Reference audio weight")}
                </label>
                <span className="font-mono text-xs text-accent-soft">
                  {Math.round(displayedAudioWeight * 100)}%
                </span>
              </div>
              <input
                id="reference-audio-weight"
                type="range"
                className="range-gradient w-full appearance-none"
                min={referenceParameters?.audioWeightMin ?? 0}
                max={referenceParameters?.audioWeightMax ?? 1}
                step={referenceParameters?.audioWeightStep ?? "any"}
                disabled={!configReady}
                value={displayedAudioWeight}
                onChange={(event) =>
                  patch({ audioWeight: Number(event.target.value) })
                }
              />
              <p className="mt-2 text-[10px] leading-4 text-muted">
                {text(
                  "越高越贴近参考素材；取值严格来自当前操作目录，并映射到 metadata.control_sliders.audio_weight。",
                  "Higher values follow the reference more closely; the range comes from the action catalog and maps to metadata.control_sliders.audio_weight.",
                )}
              </p>
            </div>
          ) : (
            <div className="action-explainer self-start">
              {text(
                "当前目标模型未同时声明风格强度与创意度 control sliders 能力，本次续作不会发送 audio_weight。",
                "The target model does not declare both style and creativity sliders; audio_weight will not be sent.",
              )}
            </div>
          )}
        </div>
      )}

      <div
        className={`mt-4 rounded-xl border p-3 ${value.copyrightAudio ? "border-amber-400/20 bg-amber-400/[0.055]" : "border-accent/15 bg-accent/[0.045]"}`}
      >
        <div className="flex items-start gap-2">
          <Shield
            width={15}
            height={15}
            className="mt-0.5 shrink-0 text-accent-soft"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <strong className="text-main">
                {text("ModelCross 动态预计价格", "ModelCross live estimate")}
              </strong>
              <strong className="text-main">
                {totalPrice === null
                  ? text("暂不可用", "Unavailable")
                  : `${totalPrice} ${text("积分", "credits")}`}
              </strong>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted">
              {value.purpose === "import"
                ? text(
                    `仅导入单曲动态报价${totalPrice === null ? "暂不可用" : `为 ${totalPrice} 积分`}，成功后可从作品详情继续创作。`,
                    `The import-only quote is ${totalPrice === null ? "unavailable" : `${totalPrice} credits`}; continue from the track details after success.`,
                  )
                : text(
                    `一体化 Provider 接入与双版本续作动态报价${totalPrice === null ? "暂不可用" : `为 ${totalPrice} 积分`}；不会重复叠加“仅导入”价格。`,
                    `The integrated Provider import and two-version continuation quote is ${totalPrice === null ? "unavailable" : `${totalPrice} credits`}; the import-only price is not added again.`,
                  )}{" "}
              {text(
                "最终以服务端价格版本与账单为准。",
                "Final usage follows the server price version and ledger.",
              )}
            </p>
            {(!priceReady || actionGate) && (
              <p className="mt-1 text-[10px] leading-4 text-amber-300">
                {actionGate ||
                  text(
                    "动态价格暂不可用，提交已禁用",
                    "Dynamic pricing is unavailable; submission is disabled",
                  )}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
