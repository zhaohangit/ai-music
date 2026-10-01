import type {
  MusicModelProfile,
  MusicOperationProfile,
  OperationNumberParameter,
  OperationParameterCatalog,
  SunoOperation,
} from "../types";

export type CatalogOperationCode =
  | "generation_pair"
  | "generation_max_pair"
  | "sound_pair"
  | "extend_pair"
  | "cover_pair"
  | "remaster_pair"
  | "upload_single"
  | "upload_copyright_single"
  | "upload_extend_pair"
  | "upload_copyright_extend_pair"
  | "whole_song_single"
  | "crop_single"
  | "speed_single"
  | "aligned_lyrics_single"
  | "video_single"
  | "download_mp3_single"
  | "download_m4a_single"
  | "convert_wav_single";

export const GENERATION_OVERRIDE_FIELDS = [
  "model",
  "mode",
  "title",
  "description",
  "style",
  "lyrics",
  "instrumental",
  "negativeTags",
  "vocalGender",
  "styleWeight",
  "weirdness",
] as const;

export const operationCodeFor = (
  action: SunoOperation,
  options: { copyrightAudio?: boolean; maxMode?: boolean } = {},
): CatalogOperationCode => {
  if (action === "generate") return options.maxMode ? "generation_max_pair" : "generation_pair";
  if (action === "sound") return "sound_pair";
  if (action === "extend") return "extend_pair";
  if (action === "cover") return "cover_pair";
  if (action === "remaster") return "remaster_pair";
  if (
    action === "upload" ||
    action === "upload_single" ||
    action === "upload_copyright_single"
  ) {
    return options.copyrightAudio ? "upload_copyright_single" : "upload_single";
  }
  if (action === "upload_extend") {
    return options.copyrightAudio
      ? "upload_copyright_extend_pair"
      : "upload_extend_pair";
  }
  if (action === "whole_song") return "whole_song_single";
  if (action === "crop") return "crop_single";
  if (action === "speed") return "speed_single";
  if (action === "aligned_lyrics") return "aligned_lyrics_single";
  if (action === "video") return "video_single";
  if (action === "download_mp3") return "download_mp3_single";
  if (action === "download_m4a") return "download_m4a_single";
  return "convert_wav_single";
};

export function findOperation(
  catalog: readonly MusicOperationProfile[],
  action: SunoOperation,
  options: { copyrightAudio?: boolean; maxMode?: boolean } = {},
): MusicOperationProfile | undefined {
  const code = operationCodeFor(action, options);
  // operationCode is the billing/authorization boundary. Falling back to a shared action
  // can accidentally quote the standard upload variant for a copyright upload.
  return catalog.find((entry) => entry.operationCode === code);
}

export function operationParameters(
  profile: MusicOperationProfile | undefined,
): OperationParameterCatalog {
  return profile?.parameters ?? profile?.constraints ?? {};
}

export function operationHasQuote(
  profile: MusicOperationProfile | undefined,
): boolean {
  return Boolean(
    profile &&
      profile.available &&
      profile.operationCode.trim() &&
      Number.isFinite(profile.estimatedCredits) &&
      Number(profile.estimatedCredits) >= 0 &&
      profile.priceVersion?.trim(),
  );
}

export function operationGateReason(
  profile: MusicOperationProfile | undefined,
): string | null {
  if (!profile) return "服务端未返回此操作的能力与价格";
  if (!profile.available)
    return profile.reason?.trim() || "当前服务未开放此操作";
  if (profile.executable === false)
    return profile.reason?.trim() || "当前环境未开放此操作的执行权限";
  if (
    !profile.chargingEnabled &&
    profile.executable !== true &&
    profile.previewExecutable !== true
  ) {
    return profile.reason?.trim() || "当前仅可预览价格，服务端未开放执行";
  }
  if (!profile.operationCode?.trim()) return "服务端未返回稳定的计费操作编码";
  if (
    !Number.isFinite(profile.estimatedCredits) ||
    Number(profile.estimatedCredits) < 0
  ) {
    return "动态预计价格暂不可用，为避免错误扣费已禁用";
  }
  if (!profile.priceVersion?.trim())
    return "价格版本暂不可用，为避免错误扣费已禁用";
  return null;
}

export function hasCompleteGenerationOverrides(
  profile: MusicOperationProfile | undefined,
): boolean {
  const fields = operationParameters(profile).generationOverrides;
  if (!Array.isArray(fields)) return false;
  const supported = new Set(
    fields.filter((value): value is string => typeof value === "string"),
  );
  return GENERATION_OVERRIDE_FIELDS.every((field) => supported.has(field));
}

export function modelAllowsOperation(
  model: MusicModelProfile | undefined,
  action: SunoOperation,
  profile?: MusicOperationProfile,
): boolean {
  if (!model?.enabled) return false;
  if (profile?.modelIds?.length && !profile.modelIds.includes(model.id))
    return false;
  const operations = model.capabilities.operations.map(String);
  return (
    operations.includes(action) ||
    Boolean(profile && operations.includes(profile.operationCode))
  );
}

export function speedMultiplierValues(
  profile: MusicOperationProfile | undefined,
): number[] {
  const parameters = operationParameters(profile);
  const values =
    parameters.speedMultipliers ??
    parameters.multiplier?.enum ??
    parameters.multiplier?.values ??
    parameters.multiplier?.options?.map((option) => option.value);
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(values.filter((value) => Number.isFinite(value) && value > 0)),
  ].sort((a, b) => a - b);
}

const finiteNumber = (value: unknown): number | null =>
  Number.isFinite(value) ? Number(value) : null;
const positiveStep = (
  parameter: OperationNumberParameter | undefined,
): number | "any" => {
  const step = finiteNumber(parameter?.step);
  return step !== null && step > 0 ? step : "any";
};

export interface SpeedParameterConfig {
  values: number[];
  defaultMultiplier: number;
  keepPitchDefault: boolean;
  /** MXAPI documents Speed title as an optional string without a max length. */
  maxTitleLength?: number;
}

export interface StringParameterConfig {
  minLength: number;
  maxLength: number;
}

export const SOUND_MODEL_IDS = ["chirp-crow", "chirp-fenix"] as const;
export const SOUND_TITLE_MAX_LENGTH = 100;
export const SOUND_TAGS_MAX_LENGTH = 1000;

export interface SoundParameterConfig {
  modelIds: Array<(typeof SOUND_MODEL_IDS)[number]>;
  titleMaxLength: typeof SOUND_TITLE_MAX_LENGTH;
  tagsMaxLength: typeof SOUND_TAGS_MAX_LENGTH;
  tempoDefault: number;
  keyDefault: string;
  loopDefault: boolean;
}

const sameStringSet = (
  values: readonly string[],
  expected: readonly string[],
) =>
  values.length === expected.length &&
  expected.every((value) => values.includes(value));

/**
 * Read the live MXAPI /music/sound contract without filling gaps with UI assumptions.
 * Any drift disables submission until the server catalog and browser agree again.
 */
export function soundParameterConfig(
  profile: MusicOperationProfile | undefined,
): SoundParameterConfig | null {
  if (
    !profile ||
    profile.operationCode !== "sound_pair" ||
    profile.outputCount !== 2
  )
    return null;
  const parameters = operationParameters(profile);
  const { title, tags, model, tempo, key, loop } = parameters;
  const loopParameter = typeof loop === "object" && loop !== null ? loop : null;
  const profileModels = profile.modelIds ?? [];
  const modelValues = model?.enum ?? [];
  if (
    title?.type !== "string" ||
    title.required !== true ||
    title.maxLength !== SOUND_TITLE_MAX_LENGTH ||
    title.wireName !== "title" ||
    tags?.type !== "string" ||
    tags.required !== true ||
    tags.maxLength !== SOUND_TAGS_MAX_LENGTH ||
    tags.wireName !== "tags" ||
    model?.type !== "string" ||
    model.required !== true ||
    model.wireName !== "mv" ||
    !sameStringSet(modelValues, SOUND_MODEL_IDS) ||
    !sameStringSet(profileModels, SOUND_MODEL_IDS) ||
    tempo?.type !== "number" ||
    tempo.required !== false ||
    tempo.wireName !== "tempo" ||
    tempo.min !== undefined ||
    tempo.max !== undefined ||
    tempo.default !== 99 ||
    tempo.enum !== undefined ||
    tempo.values !== undefined ||
    tempo.options !== undefined ||
    key?.type !== "string" ||
    key.required !== false ||
    key.wireName !== "key" ||
    key.default !== "D" ||
    key.enum !== undefined ||
    !loopParameter ||
    loopParameter.type !== "boolean" ||
    loopParameter.required !== false ||
    loopParameter.default !== true ||
    loopParameter.wireName !== "loop"
  )
    return null;
  return {
    modelIds: [...SOUND_MODEL_IDS],
    titleMaxLength: SOUND_TITLE_MAX_LENGTH,
    tagsMaxLength: SOUND_TAGS_MAX_LENGTH,
    tempoDefault: 99,
    keyDefault: "D",
    loopDefault: true,
  };
}

export type RemasterVariation = "subtle" | "normal" | "high";

export interface RemasterVariationConfig {
  values: RemasterVariation[];
  modelIds: string[];
  defaultValue: RemasterVariation;
}

/** Read a bounded string parameter without inventing a Provider-side limit. */
export function operationStringParameterConfig(
  profile: MusicOperationProfile | undefined,
  key: "title" | "lyrics",
): StringParameterConfig | null {
  const parameter = operationParameters(profile)[key];
  const minLength = finiteNumber(parameter?.minLength);
  const maxLength = finiteNumber(parameter?.maxLength);
  if (
    minLength === null ||
    maxLength === null ||
    minLength < 0 ||
    maxLength < Math.max(1, minLength)
  )
    return null;
  return { minLength: Math.floor(minLength), maxLength: Math.floor(maxLength) };
}

/** Variation is an MXAPI V5+ parameter and is declared by the operation catalog. */
export function remasterVariationConfig(
  profile: MusicOperationProfile | undefined,
): RemasterVariationConfig | null {
  const raw = operationParameters(profile).variation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parameter = raw as {
    enum?: unknown;
    modelIds?: unknown;
    default?: unknown;
  };
  const allowed = new Set<RemasterVariation>(["subtle", "normal", "high"]);
  const values = Array.isArray(parameter.enum)
    ? parameter.enum.filter(
        (value): value is RemasterVariation =>
          typeof value === "string" && allowed.has(value as RemasterVariation),
      )
    : [];
  const modelIds = Array.isArray(parameter.modelIds)
    ? parameter.modelIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  const defaultValue =
    typeof parameter.default === "string" &&
    allowed.has(parameter.default as RemasterVariation)
      ? (parameter.default as RemasterVariation)
      : null;
  if (
    !values.length ||
    !modelIds.length ||
    !defaultValue ||
    !values.includes(defaultValue)
  )
    return null;
  return {
    values: [...new Set(values)],
    modelIds: [...new Set(modelIds)],
    defaultValue,
  };
}

/** Normalize the production JSON-schema-like speed catalog and the former flattened form. */
export function speedParameterConfig(
  profile: MusicOperationProfile | undefined,
): SpeedParameterConfig | null {
  const parameters = operationParameters(profile);
  const values = speedMultiplierValues(profile);
  const configuredDefault = finiteNumber(parameters.multiplier?.default);
  const defaultMultiplier =
    configuredDefault !== null && values.includes(configuredDefault)
      ? configuredDefault
      : null;
  const keepPitchDefault =
    typeof parameters.keepPitch === "boolean"
      ? parameters.keepPitch
      : typeof parameters.keepPitch?.default === "boolean"
        ? parameters.keepPitch.default
        : null;
  const rawTitleLimit =
    parameters.title?.maxLength ?? parameters.maxTitleLength;
  const titleLimit =
    rawTitleLimit === undefined ? null : finiteNumber(rawTitleLimit);
  if (
    !values.length ||
    defaultMultiplier === null ||
    keepPitchDefault === null ||
    (rawTitleLimit !== undefined && (titleLimit === null || titleLimit < 1))
  ) {
    return null;
  }
  return {
    values,
    defaultMultiplier,
    keepPitchDefault,
    ...(titleLimit === null ? {} : { maxTitleLength: Math.floor(titleLimit) }),
  };
}

export interface CropParameterConfig {
  min: number;
  max: number;
  startStep: number | "any";
  endStep: number | "any";
}

/** Resolve server-owned dynamic bounds without inventing a numeric Provider limit. */
export function cropParameterConfig(
  profile: MusicOperationProfile | undefined,
  trackDuration: number,
): CropParameterConfig | null {
  if (!Number.isFinite(trackDuration) || trackDuration <= 0) return null;
  const parameters = operationParameters(profile);
  const start = parameters.startSeconds;
  const end = parameters.endSeconds;
  const min = finiteNumber(start?.min);
  if (min === null || min < 0 || !end) return null;
  if (end.exclusiveMinimumField !== "startSeconds") return null;
  const explicitMax = finiteNumber(end.max);
  const dynamicMax =
    end.maximumField === "track.duration" ? trackDuration : null;
  if (explicitMax === null && dynamicMax === null) return null;
  const max = Math.min(trackDuration, explicitMax ?? dynamicMax!);
  if (!(max > min)) return null;
  return {
    min,
    max,
    startStep: positiveStep(start),
    endStep: positiveStep(end),
  };
}

export interface ReferenceAudioParameterConfig {
  continueMin: number;
  continueCatalogMax: number | null;
  continueDefault: number;
  continueStep: number | "any";
  audioWeightMin: number;
  audioWeightMax: number;
  audioWeightDefault: number;
  audioWeightStep: number | "any";
}

export interface AudioWeightParameterConfig {
  min: number;
  max: number;
  defaultValue: number;
  step: number | "any";
}

/** Read the documented metadata.control_sliders.audio_weight contract. */
export function audioWeightParameterConfig(
  profile: MusicOperationProfile | undefined,
): AudioWeightParameterConfig | null {
  const parameter = operationParameters(profile).audioWeight;
  const min = finiteNumber(parameter?.min);
  const max = finiteNumber(parameter?.max);
  const defaultValue = finiteNumber(parameter?.default);
  if (
    min === null ||
    max === null ||
    defaultValue === null ||
    !(max > min) ||
    defaultValue < min ||
    defaultValue > max
  )
    return null;
  return { min, max, defaultValue, step: positiveStep(parameter) };
}

/**
 * Reference-audio upper time bounds are tightened to the locally inspected file duration.
 * A missing numeric step means any finite value, matching the server validator instead of
 * silently inventing a Provider increment.
 */
export function referenceAudioParameterConfig(
  profile: MusicOperationProfile | undefined,
): ReferenceAudioParameterConfig | null {
  const parameters = operationParameters(profile);
  const continueAt = parameters.continueAt;
  const audioWeight = parameters.audioWeight;
  const continueMin = finiteNumber(continueAt?.min);
  const continueCatalogMax = finiteNumber(continueAt?.max);
  const audioWeightMin = finiteNumber(audioWeight?.min);
  const audioWeightMax = finiteNumber(audioWeight?.max);
  const configuredContinueDefault =
    finiteNumber(continueAt?.default) ?? continueMin;
  const configuredWeightDefault = finiteNumber(audioWeight?.default);
  if (
    continueMin === null ||
    continueMin < 0 ||
    (continueAt?.maximumField &&
      continueAt.maximumField !== "upload.duration") ||
    (continueCatalogMax !== null && continueCatalogMax < continueMin) ||
    audioWeightMin === null ||
    audioWeightMax === null ||
    !(audioWeightMax > audioWeightMin) ||
    configuredContinueDefault === null ||
    configuredContinueDefault < continueMin ||
    (continueCatalogMax !== null &&
      configuredContinueDefault > continueCatalogMax) ||
    configuredWeightDefault === null ||
    configuredWeightDefault < audioWeightMin ||
    configuredWeightDefault > audioWeightMax
  )
    return null;
  return {
    continueMin,
    continueCatalogMax,
    continueDefault: configuredContinueDefault,
    continueStep: positiveStep(continueAt),
    audioWeightMin,
    audioWeightMax,
    audioWeightDefault: configuredWeightDefault,
    audioWeightStep: positiveStep(audioWeight),
  };
}

export interface AudioUploadLimits {
  acceptedMimeTypes: string[];
  acceptedExtensions: string[];
  maxBytes: number | null;
  maxDurationSeconds: number | null;
}

export function audioUploadLimits(
  profile: MusicOperationProfile | undefined,
): AudioUploadLimits {
  const parameters = operationParameters(profile);
  const acceptedMimeTypes = Array.isArray(parameters.acceptedMimeTypes)
    ? parameters.acceptedMimeTypes.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  const acceptedExtensions = Array.isArray(parameters.acceptedExtensions)
    ? parameters.acceptedExtensions
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        .map((value) =>
          value.startsWith(".")
            ? value.toLocaleLowerCase()
            : `.${value.toLocaleLowerCase()}`,
        )
    : [];
  const bytes = parameters.maxBytes ?? parameters.maxFileBytes;
  return {
    acceptedMimeTypes,
    acceptedExtensions,
    maxBytes:
      Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : null,
    maxDurationSeconds:
      Number.isFinite(parameters.maxDurationSeconds) &&
      Number(parameters.maxDurationSeconds) > 0
        ? Number(parameters.maxDurationSeconds)
        : null,
  };
}

export function fileMatchesAudioLimits(
  file: File,
  limits: AudioUploadLimits,
): boolean {
  const extension = `.${file.name.split(".").pop()?.toLocaleLowerCase() ?? ""}`;
  const mimeMatch = Boolean(
    file.type &&
      limits.acceptedMimeTypes.includes(file.type.toLocaleLowerCase()),
  );
  const extensionMatch = limits.acceptedExtensions.includes(extension);
  return mimeMatch || extensionMatch;
}
