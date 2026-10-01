import { useEffect, useMemo, useRef, useState } from "react";
import {
  audioWeightParameterConfig,
  cropParameterConfig,
  hasCompleteGenerationOverrides,
  modelAllowsOperation,
  operationParameters,
  operationStringParameterConfig,
  referenceAudioParameterConfig,
  remasterVariationConfig,
  speedParameterConfig,
} from "../lib/operations";
import type {
  AssetActionInput,
  AssetOperation,
  GenerateMode,
  MusicModelProfile,
  MusicOperationProfile,
  Track,
  TrackActionInput,
} from "../types";
import { useI18n } from "../i18n";
import { Alert, Spinner, X } from "./Icons";
import { modelSupportsReferenceAudioWeight } from "./ReferenceAudioPanel";

export type DetailAction = TrackActionInput["action"] | AssetOperation;

interface Props {
  action: DetailAction;
  track: Track;
  model?: MusicModelProfile;
  models?: MusicModelProfile[];
  operation: MusicOperationProfile;
  accountBalance: number | null;
  onClose: () => void;
  onSubmit: (input: TrackActionInput | AssetActionInput) => Promise<void>;
}

const ACTION_TITLE: Record<DetailAction, string> = {
  extend: "续写歌曲",
  cover: "重新演绎",
  remaster: "高清重制",
  upload_extend: "参考音频续作",
  whole_song: "生成完整歌曲",
  crop: "裁剪歌曲",
  speed: "调整播放速度",
  aligned_lyrics: "生成逐字对齐歌词",
  video: "生成音乐视频",
  download_mp3: "生成 MP3 下载文件",
  download_m4a: "生成 M4A 下载文件",
  convert_wav: "转换无损 WAV",
};
const ACTION_TITLE_EN: Record<DetailAction, string> = {
  extend: "Extend track",
  cover: "Reimagine track",
  remaster: "Remaster",
  upload_extend: "Continue from reference audio",
  whole_song: "Generate whole song",
  crop: "Crop track",
  speed: "Adjust speed",
  aligned_lyrics: "Generate aligned lyrics",
  video: "Generate music video",
  download_mp3: "Prepare MP3 download",
  download_m4a: "Prepare M4A download",
  convert_wav: "Convert to lossless WAV",
};

const VARIATION_LABEL = {
  subtle: "轻微 · 尽量保持原作",
  normal: "标准 · 推荐",
  high: "明显 · 更强的重制变化",
} as const;
const VARIATION_LABEL_EN = {
  subtle: "Subtle · preserve the original",
  normal: "Standard · recommended",
  high: "Strong · more variation",
} as const;

const isAssetAction = (action: DetailAction): action is AssetOperation =>
  ["aligned_lyrics", "video", "convert_wav", "download_mp3", "download_m4a"].includes(action);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
type NumericFieldValue = number | "";

const ACTION_ERROR_EN: Record<string, string> = {
  账户可用余额暂不可用: "Account balance is unavailable",
  动态预计价格暂不可用: "Dynamic pricing is unavailable",
  "可用积分不足，请先充值": "Not enough credits. Top up first.",
  服务端未声明完整的创作参数覆盖能力:
    "The server did not declare complete creation override support",
  模型能力目录中找不到可用于此操作的模型:
    "No model in the capability catalog can perform this operation",
  当前模型不支持灵感模式: "The current model does not support inspiration mode",
  当前模型不支持自定义歌词模式:
    "The current model does not support custom lyrics mode",
  请填写音乐风格: "Enter a music style",
  "请填写歌词，或开启纯音乐": "Enter lyrics or enable instrumental mode",
  当前模型不支持纯音乐生成:
    "The current model does not support instrumental generation",
  请选择服务端允许的变速倍率: "Choose a speed multiplier allowed by the server",
  变化程度不在当前操作目录允许范围内:
    "This variation is outside the action catalog range",
  服务端未返回逐字歌词长度限制:
    "The server did not return aligned-lyrics length limits",
  逐字对齐歌词不能为空: "Aligned lyrics cannot be empty",
};
const localizedActionError = (
  value: string | null,
  language: "zh-CN" | "en-US",
) => {
  if (!value || language === "zh-CN") return value;
  const exact = ACTION_ERROR_EN[value];
  if (exact) return exact;
  const maxChars = value.match(/^(.+)超过 (\d+) 个字符$/);
  if (maxChars) return `${maxChars[1]} exceeds ${maxChars[2]} characters`;
  const range = value.match(/^续作起点必须位于 (.+) 秒$/);
  if (range) return `Continuation point must be between ${range[1]} seconds`;
  return value;
};

export function SunoActionDialog({
  action,
  track,
  model,
  models = [],
  operation,
  accountBalance,
  onClose,
  onSubmit,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const parameters = operationParameters(operation);
  const durationMax =
    track.duration > 0 && Number.isFinite(track.duration)
      ? Math.floor(track.duration)
      : 0;
  const uploadExtendConfig = useMemo(
    () => referenceAudioParameterConfig(operation),
    [operation],
  );
  const coverAudioWeightConfig = useMemo(
    () => audioWeightParameterConfig(operation),
    [operation],
  );
  const referenceDuration = Number(track.referenceAudioDurationSeconds);
  const standardContinueMin = Number(parameters.continueAt?.min ?? 0);
  const standardContinueMax = Math.min(
    durationMax,
    Number(parameters.continueAt?.max ?? durationMax),
  );
  const continueMin =
    action === "upload_extend"
      ? (uploadExtendConfig?.continueMin ?? 0)
      : standardContinueMin;
  const continueMax =
    action === "upload_extend"
      ? Math.min(
          uploadExtendConfig?.continueCatalogMax ?? referenceDuration,
          referenceDuration,
        )
      : standardContinueMax;
  const cropConfig = useMemo(
    () => cropParameterConfig(operation, track.duration),
    [operation, track.duration],
  );
  const speedConfig = useMemo(
    () => speedParameterConfig(operation),
    [operation],
  );
  const alignedLyricsConfig = useMemo(
    () => operationStringParameterConfig(operation, "lyrics"),
    [operation],
  );
  const remasterConfig = useMemo(
    () => remasterVariationConfig(operation),
    [operation],
  );
  const overrideAction =
    action === "extend" || action === "cover" || action === "upload_extend";
  const selectableModels = useMemo(() => {
    const candidates = models.length ? models : model ? [model] : [];
    return candidates.filter(
      (candidate) =>
        candidate.enabled && modelAllowsOperation(candidate, action, operation),
    );
  }, [action, model, models, operation]);
  const [targetModelId, setTargetModelId] = useState(model?.id ?? track.model);
  const targetModel =
    selectableModels.find((candidate) => candidate.id === targetModelId) ??
    selectableModels[0] ??
    (model?.enabled ? model : undefined);
  const cropMin = cropConfig?.min ?? 0;
  const cropMax = cropConfig?.max ?? 0;
  const speedValues = speedConfig?.values ?? [];
  const [continueAt, setContinueAt] = useState(
    action === "upload_extend"
      ? clamp(
          uploadExtendConfig?.continueDefault ?? 0,
          continueMin,
          continueMax,
        )
      : clamp(Math.floor(track.duration || 0) - 10, continueMin, continueMax),
  );
  const [audioWeight, setAudioWeight] = useState(
    uploadExtendConfig?.audioWeightDefault ??
      coverAudioWeightConfig?.defaultValue ??
      0,
  );
  const [mode, setMode] = useState<GenerateMode>(track.mode);
  const [description, setDescription] = useState(track.description);
  const [style, setStyle] = useState(track.style);
  const [instrumental, setInstrumental] = useState(track.instrumental);
  const [negativeTags, setNegativeTags] = useState(track.negativeTags);
  const [vocalGender, setVocalGender] = useState(track.vocalGender);
  const [styleWeight, setStyleWeight] = useState(track.styleWeight);
  const [weirdness, setWeirdness] = useState(track.weirdness);
  const [variation, setVariation] = useState<"subtle" | "normal" | "high">(
    remasterConfig?.defaultValue ?? "normal",
  );
  // Keep an empty string while a user is replacing a value. Converting `''` to
  // Number immediately would clamp it back to the previous bound and make the
  // field impossible to edit with keyboard select-all/delete workflows.
  const [cropStart, setCropStart] = useState<NumericFieldValue>(cropMin);
  const [cropEnd, setCropEnd] = useState<NumericFieldValue>(cropMax);
  const [multiplier, setMultiplier] = useState(
    speedConfig?.defaultMultiplier ?? 0,
  );
  const [keepPitch, setKeepPitch] = useState(
    speedConfig?.keepPitchDefault ?? false,
  );
  const titleLimit =
    action === "speed"
      ? speedConfig?.maxTitleLength
      : targetModel?.capabilities.maxTitleLength;
  const initialTitle =
    action === "upload_extend"
      ? track.title
        ? `${track.title} · 续作`
        : "参考音频续作"
      : action === "extend"
        ? track.title
          ? `${track.title} · 续写`
          : "续写版本"
        : action === "cover"
          ? track.title
            ? `${track.title} · 重新演绎`
            : "重新演绎版本"
          : track.title
            ? `${track.title} · 变速版`
            : "变速版本";
  const [title, setTitle] = useState(
    titleLimit === undefined ? initialTitle : initialTitle.slice(0, titleLimit),
  );
  const [lyrics, setLyrics] = useState(track.lyrics);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const supportsRemasterVariation = Boolean(
    model && remasterConfig?.modelIds.includes(model.id),
  );
  const uploadedAudioCover =
    action === "cover" &&
    track.operation === "upload" &&
    track.referenceAudioAvailable === true;
  const supportsCoverAudioWeight =
    uploadedAudioCover && modelSupportsReferenceAudioWeight(targetModel);
  const supportsUploadExtendAudioWeight =
    action === "upload_extend" &&
    modelSupportsReferenceAudioWeight(targetModel);
  const vocalGenderUnavailableReason = instrumental
    ? text(
        "纯音乐模式不包含主唱；关闭纯音乐后即可选择。",
        "Instrumental mode has no lead vocal; turn it off to choose a voice.",
      )
    : targetModel && !targetModel.capabilities.vocalGender
      ? text(
          `当前 ${targetModel.displayName} 不支持独立指定主唱性别。`,
          `${targetModel.displayName} does not support an explicit vocal gender.`,
        )
      : null;

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const first =
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      closeRef.current;
    requestAnimationFrame(() => first?.focus());
    return () => {
      requestAnimationFrame(() => previous?.focus());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [busy, onClose]);

  const validationMessage = useMemo(() => {
    if (accountBalance === null) return "账户可用余额暂不可用";
    if (
      operation.estimatedCredits === null ||
      !Number.isFinite(operation.estimatedCredits)
    )
      return "动态预计价格暂不可用";
    if (accountBalance < operation.estimatedCredits)
      return "可用积分不足，请先充值";
    if (overrideAction && !hasCompleteGenerationOverrides(operation))
      return "服务端未声明完整的创作参数覆盖能力";
    if (overrideAction) {
      if (!targetModel) return "模型能力目录中找不到可用于此操作的模型";
      if (
        action === "extend" &&
        (continueAt < continueMin || continueAt > continueMax)
      )
        return `续作起点必须位于 ${continueMin}–${continueMax} 秒`;
      if (action === "upload_extend") {
        if (
          !uploadExtendConfig ||
          !Number.isFinite(referenceDuration) ||
          referenceDuration <= 0
        )
          return "参考音频续作参数或可信时长不可用";
        if (continueAt < continueMin || continueAt > continueMax)
          return `续作起点必须位于 ${continueMin}–${continueMax} 秒`;
        if (
          supportsUploadExtendAudioWeight &&
          (audioWeight < uploadExtendConfig.audioWeightMin ||
            audioWeight > uploadExtendConfig.audioWeightMax)
        )
          return "参考音频权重超出服务端能力范围";
      }
      if (action === "cover" && supportsCoverAudioWeight) {
        if (!coverAudioWeightConfig)
          return "服务端未返回上传音频翻唱的参考权重范围";
        if (
          audioWeight < coverAudioWeightConfig.min ||
          audioWeight > coverAudioWeightConfig.max
        )
          return "参考音频权重超出服务端能力范围";
      }
      if (
        !Number.isFinite(targetModel.capabilities.maxTitleLength) ||
        targetModel.capabilities.maxTitleLength < 1
      )
        return "模型标题长度能力不可用";
      if (title.trim().length > targetModel.capabilities.maxTitleLength)
        return `歌名超过当前模型允许的 ${targetModel.capabilities.maxTitleLength} 个字符`;
      if (mode === "simple") {
        if (!targetModel.capabilities.simple) return "当前模型不支持灵感模式";
        if (!description.trim())
          return action === "cover" ? "请填写重新演绎方向" : "请填写续作描述";
        if (
          description.trim().length >
          targetModel.capabilities.maxDescriptionLength
        )
          return `歌曲描述超过 ${targetModel.capabilities.maxDescriptionLength} 个字符`;
      } else {
        if (!targetModel.capabilities.custom)
          return "当前模型不支持自定义歌词模式";
        if (!style.trim()) return "请填写音乐风格";
        if (style.trim().length > targetModel.capabilities.maxStyleLength)
          return `音乐风格超过 ${targetModel.capabilities.maxStyleLength} 个字符`;
        if (!instrumental && !lyrics.trim()) return "请填写歌词，或开启纯音乐";
        if (
          !instrumental &&
          lyrics.trim().length > targetModel.capabilities.maxLyricsLength
        )
          return `歌词超过 ${targetModel.capabilities.maxLyricsLength} 个字符`;
      }
      if (instrumental && !targetModel.capabilities.instrumental)
        return "当前模型不支持纯音乐生成";
      if (
        targetModel.capabilities.negativeTags &&
        negativeTags.trim().length >
          targetModel.capabilities.maxNegativeTagsLength
      )
        return `排除风格超过 ${targetModel.capabilities.maxNegativeTagsLength} 个字符`;
      const styleRange = targetModel.capabilities.styleWeight;
      if (
        styleRange &&
        (styleWeight < styleRange.min || styleWeight > styleRange.max)
      )
        return "风格强度超出模型能力范围";
      const weirdnessRange = targetModel.capabilities.weirdness;
      if (
        weirdnessRange &&
        (weirdness < weirdnessRange.min || weirdness > weirdnessRange.max)
      )
        return "创意度超出模型能力范围";
    }
    if (
      action === "crop" &&
      (!cropConfig ||
        typeof cropStart !== "number" ||
        typeof cropEnd !== "number" ||
        cropEnd <= cropStart ||
        cropStart < cropMin ||
        cropEnd > cropMax)
    )
      return `裁剪片段结束时间必须大于开始时间，且必须位于 ${cropMin}–${cropMax} 秒内`;
    if (action === "speed") {
      if (!speedConfig || !speedValues.includes(multiplier))
        return "请选择服务端允许的变速倍率";
      if (
        speedConfig.maxTitleLength !== undefined &&
        title.trim().length > speedConfig.maxTitleLength
      )
        return `变速版本标题不能超过 ${speedConfig.maxTitleLength} 个字符`;
    }
    if (
      action === "remaster" &&
      supportsRemasterVariation &&
      !remasterConfig?.values.includes(variation)
    )
      return "变化程度不在当前操作目录允许范围内";
    if (action === "aligned_lyrics") {
      if (!alignedLyricsConfig) return "服务端未返回逐字歌词长度限制";
      if (lyrics.trim().length < alignedLyricsConfig.minLength)
        return "逐字对齐歌词不能为空";
      if (lyrics.trim().length > alignedLyricsConfig.maxLength)
        return `逐字对齐歌词超过 ${alignedLyricsConfig.maxLength} 个字符`;
    }
    return null;
  }, [
    accountBalance,
    action,
    alignedLyricsConfig,
    audioWeight,
    continueAt,
    continueMax,
    continueMin,
    coverAudioWeightConfig,
    cropConfig,
    cropEnd,
    cropMax,
    cropMin,
    cropStart,
    description,
    instrumental,
    lyrics,
    mode,
    multiplier,
    negativeTags,
    operation.estimatedCredits,
    overrideAction,
    referenceDuration,
    remasterConfig,
    speedConfig,
    speedValues,
    style,
    styleWeight,
    supportsCoverAudioWeight,
    supportsRemasterVariation,
    supportsUploadExtendAudioWeight,
    targetModel,
    title,
    uploadExtendConfig,
    variation,
    weirdness,
  ]);

  const generationOverrides = (): Omit<TrackActionInput, "action"> => {
    if (!targetModel) return {};
    return {
      model: targetModel.id,
      mode,
      title: title.trim(),
      description: mode === "simple" ? description.trim() : "",
      style: mode === "custom" ? style.trim() : "",
      lyrics: mode === "custom" && !instrumental ? lyrics.trim() : "",
      instrumental,
      ...(targetModel.capabilities.negativeTags
        ? { negativeTags: negativeTags.trim() }
        : {}),
      ...(!instrumental && targetModel.capabilities.vocalGender
        ? { vocalGender }
        : {}),
      ...(targetModel.capabilities.styleWeight ? { styleWeight } : {}),
      ...(targetModel.capabilities.weirdness ? { weirdness } : {}),
    };
  };

  const submit = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    let input: TrackActionInput | AssetActionInput;
    if (action === "extend")
      input = {
        action,
        continueAt: clamp(continueAt, continueMin, continueMax),
        ...generationOverrides(),
      };
    else if (action === "cover")
      input = {
        action,
        ...(supportsCoverAudioWeight ? { audioWeight } : {}),
        ...generationOverrides(),
      };
    else if (action === "upload_extend")
      input = {
        action,
        continueAt: clamp(continueAt, continueMin, continueMax),
        ...(supportsUploadExtendAudioWeight ? { audioWeight } : {}),
        ...generationOverrides(),
      };
    else if (action === "remaster")
      input = supportsRemasterVariation ? { action, variation } : { action };
    else if (action === "crop")
      input = {
        action,
        startSeconds: cropStart as number,
        endSeconds: cropEnd as number,
      };
    else if (action === "speed")
      input = {
        action,
        multiplier,
        keepPitch,
        ...(title.trim() ? { title: title.trim() } : {}),
      };
    else if (action === "aligned_lyrics")
      input = { action, lyrics: lyrics.trim() };
    else input = { action } as TrackActionInput | AssetActionInput;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : text("提交失败，请稍后重试", "Submission failed. Try again later."),
      );
    } finally {
      setBusy(false);
    }
  };

  const renderGenerationOverrides = (
    prefix: string,
    showModelSelector: boolean,
  ) => (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-main">
            {text("创作参数覆盖", "Creation overrides")}
          </h3>
          <p className="mt-1 text-[10px] leading-4 text-muted">
            {text(
              "默认继承原作品；你可以在提交前调整，长度与选项跟随目标模型。",
              "Inherited from the original by default; adjust before submission. Limits follow the target model.",
            )}
          </p>
        </div>
        <span className="status-chip">
          {targetModel?.displayName ?? text("模型不可用", "Model unavailable")}
        </span>
      </div>
      {showModelSelector && (
        <div>
          <label className="parameter-label" htmlFor={`${prefix}-model`}>
            {text("目标模型", "Target model")}
          </label>
          <select
            data-autofocus={action === "cover" ? "" : undefined}
            id={`${prefix}-model`}
            className="field"
            value={targetModel?.id ?? ""}
            onChange={(event) => setTargetModelId(event.target.value)}
          >
            {selectableModels.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="parameter-label !mb-0" htmlFor={`${prefix}-title`}>
            {text("新版本标题", "New title")}{" "}
            <span className="font-normal text-subtle">
              {text("可选", "Optional")}
            </span>
          </label>
          <span
            className={`char-count ${titleLimit && title.length > titleLimit ? "!text-rose-400" : ""}`}
          >
            {title.length}/{titleLimit ?? "—"}
          </span>
        </div>
        <input
          id={`${prefix}-title`}
          className="field"
          maxLength={titleLimit}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div>
        <div className="parameter-label">
          {text("生成模式", "Generation mode")}
        </div>
        <div
          className="segmented w-full"
          role="group"
          aria-label={`${language === "zh-CN" ? ACTION_TITLE[action] : ACTION_TITLE_EN[action]} ${text("生成模式", "generation mode")}`}
        >
          <button
            type="button"
            disabled={!targetModel?.capabilities.simple}
            className={mode === "simple" ? "active flex-1" : "flex-1"}
            aria-pressed={mode === "simple"}
            onClick={() => setMode("simple")}
          >
            {text("灵感模式", "Inspiration")}
          </button>
          <button
            type="button"
            disabled={!targetModel?.capabilities.custom}
            className={mode === "custom" ? "active flex-1" : "flex-1"}
            aria-pressed={mode === "custom"}
            onClick={() => setMode("custom")}
          >
            {text("自定义歌词", "Custom lyrics")}
          </button>
        </div>
      </div>
      {mode === "simple" ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              className="parameter-label !mb-0"
              htmlFor={`${prefix}-description`}
            >
              {text("歌曲描述", "Song description")}
            </label>
            <span className="char-count">
              {description.length}/
              {targetModel?.capabilities.maxDescriptionLength ?? "—"}
            </span>
          </div>
          <textarea
            id={`${prefix}-description`}
            className="field min-h-28 resize-y leading-6"
            maxLength={targetModel?.capabilities.maxDescriptionLength}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              action === "cover"
                ? text(
                    "描述希望如何重新演唱、编曲与制作",
                    "Describe the new vocal, arrangement and production direction",
                  )
                : text(
                    "描述从续作起点之后的情绪、结构与制作方向",
                    "Describe the emotion, structure and production after the continuation point",
                  )
            }
          />
        </div>
      ) : (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                className="parameter-label !mb-0"
                htmlFor={`${prefix}-style`}
              >
                {text("音乐风格", "Music style")}
              </label>
              <span className="char-count">
                {style.length}/{targetModel?.capabilities.maxStyleLength ?? "—"}
              </span>
            </div>
            <textarea
              id={`${prefix}-style`}
              className="field min-h-24 resize-y leading-6"
              maxLength={targetModel?.capabilities.maxStyleLength}
              value={style}
              onChange={(event) => setStyle(event.target.value)}
            />
          </div>
          {!instrumental && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  className="parameter-label !mb-0"
                  htmlFor={`${prefix}-lyrics`}
                >
                  {text("歌词", "Lyrics")}
                </label>
                <span className="char-count">
                  {lyrics.length}/
                  {targetModel?.capabilities.maxLyricsLength ?? "—"}
                </span>
              </div>
              <textarea
                id={`${prefix}-lyrics`}
                className="field min-h-40 resize-y font-mono text-[12px] leading-6"
                maxLength={targetModel?.capabilities.maxLyricsLength}
                value={lyrics}
                onChange={(event) => setLyrics(event.target.value)}
              />
            </div>
          )}
        </>
      )}
      {targetModel?.capabilities.instrumental && (
        <label className="reference-check">
          <input
            type="checkbox"
            checked={instrumental}
            onChange={(event) => setInstrumental(event.target.checked)}
          />
          <span>
            <strong>{text("纯音乐", "Instrumental")}</strong>
            <small>
              {text(
                "开启后不向 Provider 提交人声与歌词。",
                "When enabled, vocals and lyrics are not sent to the Provider.",
              )}
            </small>
          </span>
        </label>
      )}
      {targetModel?.capabilities.negativeTags && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              className="parameter-label !mb-0"
              htmlFor={`${prefix}-negative-tags`}
            >
              {text("排除风格", "Exclude styles")}
            </label>
            <span className="char-count">
              {negativeTags.length}/
              {targetModel.capabilities.maxNegativeTagsLength}
            </span>
          </div>
          <input
            id={`${prefix}-negative-tags`}
            className="field"
            maxLength={targetModel.capabilities.maxNegativeTagsLength}
            value={negativeTags}
            onChange={(event) => setNegativeTags(event.target.value)}
            placeholder={text(
              "例如：spoken word、重金属、强烈 Auto-Tune",
              "e.g. spoken word, heavy metal, heavy Auto-Tune",
            )}
          />
        </div>
      )}
      {vocalGenderUnavailableReason ? (
        <div>
          <div className="parameter-label">
            {text("主唱声线", "Lead vocal")}
          </div>
          <div
            className="grid grid-cols-3 gap-1.5"
            role="group"
            aria-label={text(
              "主唱声线（当前不可用）",
              "Lead vocal (unavailable)",
            )}
          >
            <button type="button" className="parameter-option" disabled>
              {text("自动", "Auto")}
            </button>
            <button type="button" className="parameter-option" disabled>
              {text("女声", "Female")}
            </button>
            <button type="button" className="parameter-option" disabled>
              {text("男声", "Male")}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted">
            {vocalGenderUnavailableReason}
          </p>
        </div>
      ) : targetModel?.capabilities.vocalGender ? (
        <div>
          <label className="parameter-label" htmlFor={`${prefix}-vocal-gender`}>
            {text("主唱声线", "Lead vocal")}
          </label>
          <select
            id={`${prefix}-vocal-gender`}
            className="field"
            value={vocalGender}
            onChange={(event) =>
              setVocalGender(event.target.value as typeof vocalGender)
            }
          >
            <option value="auto">{text("自动", "Auto")}</option>
            <option value="f">{text("女声", "Female")}</option>
            <option value="m">{text("男声", "Male")}</option>
          </select>
        </div>
      ) : null}
      {targetModel?.capabilities.styleWeight && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              className="parameter-label !mb-0"
              htmlFor={`${prefix}-style-weight`}
            >
              {text("风格强度", "Style strength")}
            </label>
            <span className="font-mono text-xs text-accent-soft">
              {Math.round(styleWeight * 100)}%
            </span>
          </div>
          <input
            id={`${prefix}-style-weight`}
            type="range"
            className="range-gradient w-full appearance-none"
            min={targetModel.capabilities.styleWeight.min}
            max={targetModel.capabilities.styleWeight.max}
            step={targetModel.capabilities.styleWeight.step}
            value={styleWeight}
            onChange={(event) => setStyleWeight(Number(event.target.value))}
          />
        </div>
      )}
      {targetModel?.capabilities.weirdness && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              className="parameter-label !mb-0"
              htmlFor={`${prefix}-weirdness`}
            >
              {text("创意度", "Creativity")}
            </label>
            <span className="font-mono text-xs text-coral">
              {Math.round(weirdness * 100)}%
            </span>
          </div>
          <input
            id={`${prefix}-weirdness`}
            type="range"
            className="range-gradient w-full appearance-none"
            min={targetModel.capabilities.weirdness.min}
            max={targetModel.capabilities.weirdness.max}
            step={targetModel.capabilities.weirdness.step}
            value={weirdness}
            onChange={(event) => setWeirdness(Number(event.target.value))}
          />
        </div>
      )}
    </div>
  );

  return (
    <div
      className="dialog-backdrop !z-[75]"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <div
        ref={dialogRef}
        className="suno-action-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suno-action-title"
        aria-describedby="suno-action-description"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow">SUNO ACTION</span>
            <h2
              id="suno-action-title"
              className="mt-2 text-lg font-semibold text-main"
            >
              {language === "zh-CN"
                ? ACTION_TITLE[action]
                : ACTION_TITLE_EN[action]}
            </h2>
            <p
              id="suno-action-description"
              className="mt-1 break-words text-xs leading-5 text-muted"
            >
              {text(
                `基于“${track.title || "未命名作品"}”创建服务端持久任务。`,
                `Create a persistent server task from “${track.title || "Untitled track"}”.`,
              )}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            disabled={busy}
            onClick={onClose}
            aria-label={text("关闭操作对话框", "Close action dialog")}
          >
            <X width={17} height={17} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {action === "extend" && (
            <div className="space-y-4">
              <div>
                <label className="parameter-label" htmlFor="continue-at">
                  {text("从第几秒继续", "Continue from second")}
                </label>
                <input
                  data-autofocus
                  id="continue-at"
                  type="number"
                  min={continueMin}
                  max={continueMax}
                  step={Number(parameters.continueAt?.step ?? 1)}
                  className="field"
                  value={continueAt}
                  onChange={(event) =>
                    setContinueAt(
                      clamp(
                        Number(event.target.value),
                        continueMin,
                        continueMax,
                      ),
                    )
                  }
                />
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  {text("服务端允许范围：", "Server range: ")}
                  {continueMin}–{continueMax} {text("秒。", "seconds.")}
                </p>
              </div>
              {renderGenerationOverrides("extend", true)}
            </div>
          )}
          {action === "upload_extend" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="parameter-label"
                    htmlFor="upload-continue-at"
                  >
                    {text("续作起点（秒）", "Continuation point (seconds)")}
                  </label>
                  <input
                    data-autofocus
                    id="upload-continue-at"
                    type="number"
                    className="field"
                    min={continueMin}
                    max={continueMax}
                    step={uploadExtendConfig?.continueStep ?? "any"}
                    value={continueAt}
                    onChange={(event) =>
                      setContinueAt(
                        clamp(
                          Number(event.target.value),
                          continueMin,
                          continueMax,
                        ),
                      )
                    }
                  />
                  <p className="mt-2 text-[10px] leading-4 text-muted">
                    {text("可信上传时长上限：", "Verified upload limit: ")}
                    {continueMax} {text("秒", "seconds")}
                  </p>
                </div>
                {supportsUploadExtendAudioWeight ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label
                        className="parameter-label !mb-0"
                        htmlFor="upload-audio-weight"
                      >
                        参考音频权重
                      </label>
                      <span className="font-mono text-xs text-accent-soft">
                        {Math.round(audioWeight * 100)}%
                      </span>
                    </div>
                    <input
                      id="upload-audio-weight"
                      type="range"
                      className="range-gradient w-full appearance-none"
                      min={uploadExtendConfig?.audioWeightMin ?? 0}
                      max={uploadExtendConfig?.audioWeightMax ?? 1}
                      step={uploadExtendConfig?.audioWeightStep ?? "any"}
                      value={audioWeight}
                      onChange={(event) =>
                        setAudioWeight(Number(event.target.value))
                      }
                    />
                    <p className="mt-2 text-[10px] leading-4 text-muted">
                      {text(
                        "取值严格来自当前操作目录，并映射到 metadata.control_sliders.audio_weight。",
                        "The range comes from the action catalog and maps to metadata.control_sliders.audio_weight.",
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
              {renderGenerationOverrides("upload-extend", true)}
            </div>
          )}
          {action === "cover" && (
            <div className="space-y-4">
              <div className="action-explainer">
                {text(
                  "保留原曲核心旋律，并按下面的目标模型、演唱与制作参数重新演绎。",
                  "Keep the core melody and reimagine it with the target model, vocal and production settings below.",
                )}
              </div>
              {supportsCoverAudioWeight && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label
                      className="parameter-label !mb-0"
                      htmlFor="cover-audio-weight"
                    >
                      参考音频权重
                    </label>
                    <span className="font-mono text-xs text-accent-soft">
                      {Math.round(audioWeight * 100)}%
                    </span>
                  </div>
                  <input
                    data-autofocus
                    id="cover-audio-weight"
                    type="range"
                    className="range-gradient w-full appearance-none"
                    min={coverAudioWeightConfig?.min ?? 0}
                    max={coverAudioWeightConfig?.max ?? 1}
                    step={coverAudioWeightConfig?.step ?? "any"}
                    value={audioWeight}
                    onChange={(event) =>
                      setAudioWeight(Number(event.target.value))
                    }
                  />
                  <p className="mt-2 text-[11px] leading-5 text-muted">
                    {text(
                      "映射到 metadata.control_sliders.audio_weight，仅保留的上传音频和声明了高级 control sliders 的 V4.5+ 目标模型可用。",
                      "Maps to metadata.control_sliders.audio_weight and is available only for uploaded audio with a V4.5+ target model that declares advanced sliders.",
                    )}
                  </p>
                </div>
              )}
              {uploadedAudioCover && !supportsCoverAudioWeight && (
                <div className="action-explainer">
                  {text(
                    "当前目标模型未声明 V4.5+ control sliders 能力，本次不会发送 audio_weight。",
                    "The target model does not declare V4.5+ sliders; audio_weight will not be sent.",
                  )}
                </div>
              )}
              {renderGenerationOverrides("cover", true)}
            </div>
          )}
          {action === "remaster" &&
            (supportsRemasterVariation ? (
              <div>
                <label className="parameter-label" htmlFor="variation">
                  {text("变化程度", "Variation")}
                </label>
                <select
                  data-autofocus
                  id="variation"
                  className="field"
                  value={variation}
                  onChange={(event) =>
                    setVariation(event.target.value as typeof variation)
                  }
                >
                  {remasterConfig?.values.map((value) => (
                    <option key={value} value={value}>
                      {language === "zh-CN"
                        ? VARIATION_LABEL[value]
                        : VARIATION_LABEL_EN[value]}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  {text(
                    "Suno V5 支持将变化程度映射为 variation_category。",
                    "Suno V5 maps this choice to variation_category.",
                  )}
                </p>
              </div>
            ) : (
              <div className="action-explainer" data-autofocus tabIndex={-1}>
                {text(
                  "当前模型使用固定重制强度；AI Music Studio 不会发送仅 Suno V5 支持的变化程度参数。",
                  "This model uses a fixed remaster intensity; AI Music Studio will not send the V5-only variation parameter.",
                )}
              </div>
            ))}
          {action === "whole_song" && (
            <div className="action-explainer" data-autofocus tabIndex={-1}>
              {text(
                "把当前片段扩展为结构完整的歌曲。输出会作为新的作品持久保存，不覆盖原作。",
                "Expand the current clip into a complete song. The result is saved as a new track and does not overwrite the original.",
              )}
            </div>
          )}
          {action === "crop" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="parameter-label" htmlFor="crop-start">
                  {text("开始秒数", "Start seconds")}
                </label>
                <input
                  data-autofocus
                  id="crop-start"
                  type="number"
                  className="field"
                  min={cropMin}
                  max={cropMax}
                  step={cropConfig?.startStep ?? "any"}
                  value={cropStart}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setCropStart(
                      raw === "" ? "" : clamp(Number(raw), cropMin, cropMax),
                    );
                  }}
                />
              </div>
              <div>
                <label className="parameter-label" htmlFor="crop-end">
                  {text("结束秒数", "End seconds")}
                </label>
                <input
                  id="crop-end"
                  type="number"
                  className="field"
                  min={typeof cropStart === "number" ? cropStart : cropMin}
                  max={cropMax}
                  step={cropConfig?.endStep ?? "any"}
                  value={cropEnd}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setCropEnd(
                      raw === ""
                        ? ""
                        : clamp(
                            Number(raw),
                            typeof cropStart === "number" ? cropStart : cropMin,
                            cropMax,
                          ),
                    );
                  }}
                />
              </div>
              <p className="sm:col-span-2 text-[11px] leading-5 text-muted">
                {text("仅保留", "Keep only")}{" "}
                {typeof cropStart === "number" ? cropStart : "—"}–
                {typeof cropEnd === "number" ? cropEnd : "—"}{" "}
                {text("秒，共", "seconds,")}{" "}
                {typeof cropStart === "number" && typeof cropEnd === "number"
                  ? Math.max(0, cropEnd - cropStart)
                  : "—"}{" "}
                {text(
                  "秒；结束时间必须大于开始时间，原作不会被覆盖。",
                  "seconds; the end must be after the start and the original is not overwritten.",
                )}
              </p>
            </div>
          )}
          {action === "speed" && (
            <div className="space-y-4">
              <div>
                <label className="parameter-label" htmlFor="speed-multiplier">
                  {text("速度倍率", "Speed multiplier")}
                </label>
                <select
                  data-autofocus
                  id="speed-multiplier"
                  className="field"
                  value={multiplier}
                  onChange={(event) =>
                    setMultiplier(Number(event.target.value))
                  }
                >
                  {speedValues.map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  {text(
                    "选项来自服务端当前文档化能力，不会发送任意倍率。",
                    "Options come from the documented server capability; arbitrary multipliers are not sent.",
                  )}
                </p>
              </div>
              <label className="reference-check">
                <input
                  type="checkbox"
                  checked={keepPitch}
                  onChange={(event) => setKeepPitch(event.target.checked)}
                />
                <span>
                  <strong>{text("保持原音高", "Preserve pitch")}</strong>
                  <small>
                    {text(
                      "改变速度时尽量避免人声与乐器整体变调。",
                      "Avoid shifting vocals and instruments when changing speed.",
                    )}
                  </small>
                </span>
              </label>
              <div>
                <label className="parameter-label" htmlFor="speed-title">
                  {text("新版本标题", "New title")}{" "}
                  <span className="font-normal text-subtle">
                    {text("可选", "Optional")}
                  </span>
                </label>
                <input
                  id="speed-title"
                  className="field"
                  value={title}
                  maxLength={speedConfig?.maxTitleLength}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={text(
                    "留空则由 Provider 生成标题",
                    "Leave blank for a Provider-generated title",
                  )}
                />
              </div>
            </div>
          )}
          {action === "aligned_lyrics" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  className="parameter-label !mb-0"
                  htmlFor="aligned-lyrics"
                >
                  {text("需要逐字对齐的歌词", "Lyrics to align word by word")}
                </label>
                <span
                  className={`char-count ${alignedLyricsConfig && lyrics.length > alignedLyricsConfig.maxLength ? "!text-rose-400" : ""}`}
                >
                  {lyrics.length}/{alignedLyricsConfig?.maxLength ?? "—"}
                </span>
              </div>
              <textarea
                data-autofocus
                id="aligned-lyrics"
                className="field min-h-48 resize-y leading-6"
                value={lyrics}
                minLength={alignedLyricsConfig?.minLength}
                maxLength={alignedLyricsConfig?.maxLength}
                onChange={(event) => setLyrics(event.target.value)}
              />
              <p className="mt-2 text-[11px] leading-5 text-muted">
                {text(
                  "长度限制来自当前操作目录；完成后可从持久资产作业中查看或下载服务端返回的对齐结果。",
                  "Length limits come from the action catalog; view or download the aligned result from persistent asset jobs when complete.",
                )}
              </p>
            </div>
          )}
          {action === "video" && (
            <div className="action-explainer" data-autofocus tabIndex={-1}>
              {text(
                "将当前作品转换为音乐视频。完成后通过 AI Music Studio 同源资产接口查看或下载。",
                "Convert this track to a music video. View or download it through the AI Music Studio asset endpoint when complete.",
              )}
            </div>
          )}
          {action === "convert_wav" && (
            <div className="action-explainer" data-autofocus tabIndex={-1}>
              {text(
                "生成 WAV 资产。完成后通过 AI Music Studio 同源下载接口获取，不会暴露 Provider 地址。",
                "Generate a WAV asset. Retrieve it through the AI Music Studio download endpoint without exposing the Provider URL.",
              )}
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.055] px-3.5 py-3 text-[11px] leading-5 text-amber-200/80">
          <div className="flex items-start gap-2">
            <Alert width={14} height={14} className="mt-0.5 shrink-0" />
            <div>
              <strong className="text-amber-100">
                {text("动态预计", "Estimated")} {operation.estimatedCredits}{" "}
                {text("积分", "credits")}
              </strong>
              <p className="mt-1">
                价格版本 {operation.priceVersion} ·{" "}
                {operation.billingMode === "provider-direct"
                  ? text("API 账户实际计费；此处不扣 ModelCross 钱包", "Billed to the provider API account, outside the ModelCross wallet")
                  : operation.preview
                  ? text("预览计价，不实扣", "Preview pricing; no charge")
                  : operation.chargingEnabled
                    ? text(
                        "提交后由服务端幂等预留与结算",
                        "Server reserves and settles idempotently after submission",
                      )
                    : text("当前计费关闭", "Billing is disabled")}
                {text(
                  "。最终以账单为准。",
                  ". Final usage follows the ledger.",
                )}
              </p>
            </div>
          </div>
        </div>

        {(error || validationMessage) && (
          <div
            className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs leading-5 text-rose-300"
            role="alert"
          >
            {error
              ? localizedActionError(error, language)
              : localizedActionError(validationMessage, language)}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            {text("取消", "Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || Boolean(validationMessage)}
            onClick={() => void submit()}
          >
            {busy && <Spinner width={15} height={15} />}
            {busy
              ? text("提交中…", "Submitting…")
              : isAssetAction(action)
                ? text("确认创建资产", "Create asset")
                : text("确认创建", "Create")}
          </button>
        </div>
      </div>
    </div>
  );
}
