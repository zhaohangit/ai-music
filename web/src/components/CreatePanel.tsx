import { useMemo, useState } from "react";
import { localizeCatalogText, useI18n } from "../i18n";
import type {
  AiAssistAction,
  GenerateInput,
  GenerationInput,
  GenerateMode,
  Health,
  MusicModelProfile,
  MusicOperationProfile,
  MusicProject,
  MxapiModel,
  ReferenceAudioActionInput,
  Track,
  VocalGender,
} from "../types";
import { modelLabel } from "../types";
import {
  audioUploadLimits,
  fileMatchesAudioLimits,
  findOperation,
  modelAllowsOperation,
  operationGateReason,
  operationHasQuote,
  referenceAudioParameterConfig,
  SOUND_MODEL_IDS,
  SOUND_TAGS_MAX_LENGTH,
  SOUND_TITLE_MAX_LENGTH,
  soundParameterConfig,
} from "../lib/operations";
import { LyricsEditor } from "./LyricsEditor";
import {
  Check,
  Chevron,
  Music,
  PenLine,
  Play,
  Sparkle,
  Spinner,
  Wand,
} from "./Icons";
import {
  EMPTY_REFERENCE_AUDIO,
  modelSupportsReferenceAudioWeight,
  ReferenceAudioPanel,
  type ReferenceAudioDraft,
} from "./ReferenceAudioPanel";

const INSPIRATIONS = [
  ["城市夜雨", "雨夜城市中的梦幻华语流行，女声，温柔而有力量"],
  ["公路电影", "适合公路旅行的复古摇滚，热烈副歌与吉他独奏"],
  ["未来霓虹", "未来感电子舞曲，霓虹氛围，强劲低频与抓耳旋律"],
  ["深夜爵士", "安静的深夜爵士，钢琴与萨克斯，电影感叙事"],
] as const;

const SOUND_INSPIRATIONS = [
  [
    "雨幕环境",
    "steady rain ambience, soft window reflections, cinematic atmosphere",
  ],
  [
    "城市夜景",
    "neon city ambience, distant traffic, subtle pedestrian movement",
  ],
  [
    "电影冲击",
    "cinematic impact, deep sub bass hit, metallic tail, dramatic transition",
  ],
  [
    "自然晨林",
    "morning forest ambience, light breeze, leaves and distant birds",
  ],
] as const;

const COLLAPSED_MODEL_LIMIT = 4;

const STYLE_PRESETS = [
  [
    "Cyberpunk Synthwave",
    "Synthwave · 128 BPM",
    "cyberpunk synthwave, analog synth leads, nocturnal city, 128 bpm",
  ],
  [
    "Lo-Fi Chillhop",
    "Lo-Fi · 85 BPM",
    "lo-fi chillhop, warm rhodes piano, vinyl texture, 85 bpm",
  ],
  [
    "Melodic Techno",
    "Techno · 126 BPM",
    "melodic techno, driving bassline, spacious pads, 126 bpm",
  ],
  [
    "Japanese City Pop",
    "City Pop · 115 BPM",
    "1980s japanese city pop, funky bass, bright brass, 115 bpm",
  ],
] as const;

export interface FormState extends GenerateInput {
  source: "text" | "sound" | "reference_audio";
  soundTags: string;
  /** String state preserves an intentionally empty optional BPM field. */
  soundTempo: string;
  soundKey: string;
  soundLoop: boolean;
}

export const DEFAULT_FORM: FormState = {
  projectId: null,
  source: "text",
  mode: "simple",
  title: "",
  description: "",
  style: "",
  lyrics: "",
  instrumental: false,
  model: "chirp-hawk",
  negativeTags: "",
  vocalGender: "auto",
  styleWeight: 0.65,
  weirdness: 0.5,
  outputCount: 2,
  soundTags: "",
  soundTempo: "",
  soundKey: "",
  soundLoop: true,
};

function CharacterCount({
  value,
  maxLength,
}: {
  value: string;
  maxLength?: number;
}) {
  const overLimit = typeof maxLength === "number" && value.length > maxLength;
  return (
    <span className={`char-count ${overLimit ? "!text-rose-400" : ""}`}>
      {value.length}/{maxLength ?? "—"}
    </span>
  );
}

export function formFromTrack(track: Track): FormState {
  return {
    projectId: track.projectId ?? null,
    source: track.operation === "sound" ? "sound" : "text",
    mode: track.mode,
    title: track.title,
    description: track.description,
    style: track.style,
    lyrics: track.instrumental ? "" : track.lyrics,
    instrumental: track.instrumental,
    model: track.model as MxapiModel,
    negativeTags: track.negativeTags,
    vocalGender: track.vocalGender,
    styleWeight: track.styleWeight,
    weirdness: track.weirdness,
    outputCount: 2,
    soundTags: track.operation === "sound" ? track.style : "",
    soundTempo:
      track.operation === "sound" && typeof track.soundTempo === "number"
        ? String(track.soundTempo)
        : "",
    soundKey: track.operation === "sound" ? (track.soundKey ?? "") : "",
    soundLoop: track.operation !== "sound" || track.soundLoop !== false,
  };
}

interface CreateProps {
  form: FormState;
  models?: MusicModelProfile[];
  operations?: MusicOperationProfile[];
  operationsError?: string | null;
  referenceAudio?: ReferenceAudioDraft;
  onFormChange: (form: FormState) => void;
  onReferenceAudioChange?: (value: ReferenceAudioDraft) => void;
  onOpenAi: (action: AiAssistAction) => void;
}

export function CreatePanel({
  form,
  models = [],
  operations = [],
  operationsError = null,
  referenceAudio = EMPTY_REFERENCE_AUDIO,
  onFormChange,
  onReferenceAudioChange,
  onOpenAi,
}: CreateProps) {
  const { language, t } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    onFormChange({ ...form, [key]: value });
  const setMode = (mode: GenerateMode) =>
    onFormChange({ ...form, source: "text", mode });
  const selectedModel =
    models.find((model) => model.enabled && model.id === form.model) ??
    models.find((model) => model.enabled);
  const maxTitleLength = selectedModel?.capabilities.maxTitleLength;
  const maxDescriptionLength = selectedModel?.capabilities.maxDescriptionLength;
  const maxStyleLength = selectedModel?.capabilities.maxStyleLength;
  const maxLyricsLength = selectedModel?.capabilities.maxLyricsLength;

  return (
    <div className="composer-column h-full min-h-0 overflow-y-auto p-4 xl:p-5">
      <div className="creation-step-heading">
        <span className="creation-step-number">1</span>
        <div>
          <h2>
            {form.source === "sound"
              ? text("音效提示与参数", "Sound prompt & settings")
              : t("create.promptTitle")}
          </h2>
          <p>
            {form.source === "sound"
              ? text(
                  "描述声源、空间和使用场景。",
                  "Describe the source, space and intended scene.",
                )
              : t("create.promptSubtitle")}
          </p>
        </div>
      </div>
      <div className="composer-toolbar mb-5">
        <div
          className="segmented create-mode-tabs"
          role="tablist"
          aria-label={text("创作模式", "Creation mode")}
        >
          {(["simple", "custom"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={form.source === "text" && form.mode === mode}
              onClick={() => setMode(mode)}
              className={
                form.source === "text" && form.mode === mode ? "active" : ""
              }
            >
              {mode === "simple"
                ? t("create.inspiration")
                : t("create.customLyrics")}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={form.source === "sound"}
            onClick={() => set("source", "sound")}
            className={form.source === "sound" ? "active" : ""}
          >
            {t("create.sound")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={form.source === "reference_audio"}
            onClick={() => set("source", "reference_audio")}
            className={form.source === "reference_audio" ? "active" : ""}
          >
            {t("create.reference")}
          </button>
        </div>
        <button
          type="button"
          className="status-chip status-chip-ai transition hover:border-accent/40 hover:bg-accent/15"
          onClick={() =>
            onOpenAi(
              form.source === "sound"
                ? "prompt.optimize"
                : form.mode === "custom"
                  ? "lyrics.generate"
                  : "prompt.optimize",
            )
          }
        >
          <Sparkle width={11} height={11} /> {t("create.aiAssist")}
        </button>
      </div>

      {form.source === "reference_audio" ? (
        <div className="animate-enter space-y-5">
          <ReferenceAudioPanel
            value={referenceAudio}
            operations={operations}
            targetModel={selectedModel}
            operationsError={operationsError}
            onChange={onReferenceAudioChange ?? (() => undefined)}
          />
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
            {referenceAudio.purpose === "extend" ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="field-title">
                    {text("续作创作方向", "Continuation direction")}
                  </h2>
                  <p className="field-help">
                    {text(
                      "参考音频只提供音乐上下文，标题、描述、风格和歌词仍由你掌控。",
                      "Reference audio provides context only; you control the title, description, style and lyrics.",
                    )}
                  </p>
                </div>
                <div
                  className="segmented"
                  role="group"
                  aria-label={text(
                    "参考音频续作模式",
                    "Reference continuation mode",
                  )}
                >
                  <button
                    type="button"
                    className={form.mode === "simple" ? "active" : ""}
                    aria-pressed={form.mode === "simple"}
                    onClick={() => set("mode", "simple")}
                  >
                    {text("灵感续作", "Inspired continuation")}
                  </button>
                  <button
                    type="button"
                    className={form.mode === "custom" ? "active" : ""}
                    aria-pressed={form.mode === "custom"}
                    onClick={() => set("mode", "custom")}
                  >
                    {t("create.customLyrics")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <h2 className="field-title">
                  {text("导入作品信息", "Imported track details")}
                </h2>
                <p className="field-help">
                  {text(
                    "仅创建一首 Provider 导入作品，不生成续作；成功后可从作品详情继续创作。",
                    "Import one Provider track without generating a continuation; continue from its details after upload.",
                  )}
                </p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="field-title" htmlFor="reference-song-title">
                    {t("create.songTitle")}{" "}
                    <span className="font-normal text-subtle">
                      {t("create.optional")}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="ai-inline-button"
                    onClick={() => onOpenAi("title.suggest")}
                  >
                    <Sparkle width={12} height={12} />{" "}
                    {text("AI 标题", "AI title")}
                  </button>
                </div>
                <input
                  id="reference-song-title"
                  className="field"
                  value={form.title}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder={
                    referenceAudio.purpose === "import"
                      ? text(
                          "留空则使用音频文件名",
                          "Leave blank to use the audio filename",
                        )
                      : text("给续作起一个名字", "Name this continuation")
                  }
                  maxLength={maxTitleLength}
                />
                <div className="mt-1 text-right">
                  <CharacterCount
                    value={form.title}
                    maxLength={maxTitleLength}
                  />
                </div>
              </div>
              {referenceAudio.purpose === "extend" &&
                (form.mode === "simple" ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label
                        className="field-title"
                        htmlFor="reference-description"
                      >
                        {text("续作描述", "Continuation description")}
                      </label>
                      <span className="flex items-center gap-2">
                        <CharacterCount
                          value={form.description}
                          maxLength={maxDescriptionLength}
                        />
                        <button
                          type="button"
                          className="ai-inline-button"
                          onClick={() => onOpenAi("prompt.optimize")}
                        >
                          <Wand width={12} height={12} />{" "}
                          {text("AI 优化", "AI refine")}
                        </button>
                      </span>
                    </div>
                    <textarea
                      id="reference-description"
                      className="field min-h-28 resize-y leading-6"
                      value={form.description}
                      onChange={(event) =>
                        set("description", event.target.value)
                      }
                      placeholder={text(
                        "希望参考音频从续作起点之后如何发展……",
                        "How should the reference track develop after the continuation point?",
                      )}
                      maxLength={maxDescriptionLength}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label
                          className="field-title"
                          htmlFor="reference-style"
                        >
                          {text("音乐风格", "Music style")}
                        </label>
                        <span className="flex items-center gap-2">
                          <CharacterCount
                            value={form.style}
                            maxLength={maxStyleLength}
                          />
                          <button
                            type="button"
                            className="ai-inline-button"
                            onClick={() => onOpenAi("style.suggest")}
                          >
                            <Wand width={12} height={12} />{" "}
                            {text("风格扩写", "Expand style")}
                          </button>
                        </span>
                      </div>
                      <textarea
                        id="reference-style"
                        rows={3}
                        className="field resize-y leading-relaxed"
                        value={form.style}
                        onChange={(event) => set("style", event.target.value)}
                        placeholder={text(
                          "描述续作段落的制作、节奏与人声方向",
                          "Describe the production, rhythm and vocal direction for the continuation",
                        )}
                        maxLength={maxStyleLength}
                      />
                    </div>
                    {!form.instrumental && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="field-title">
                            {text("续作歌词", "Continuation lyrics")}
                          </span>
                          <button
                            type="button"
                            className="ai-inline-button"
                            onClick={() =>
                              onOpenAi(
                                form.lyrics
                                  ? "lyrics.rewrite"
                                  : "lyrics.generate",
                              )
                            }
                          >
                            <PenLine width={12} height={12} />{" "}
                            {form.lyrics
                              ? text("AI 润色", "AI refine")
                              : text("AI 生成", "AI generate")}
                          </button>
                        </div>
                        <LyricsEditor
                          value={form.lyrics}
                          onChange={(value) => set("lyrics", value)}
                          rows={8}
                          maxLength={maxLyricsLength}
                        />
                      </div>
                    )}
                  </>
                ))}
            </div>
          </section>
        </div>
      ) : form.source === "sound" ? (
        <div className="animate-enter space-y-5">
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 sm:p-5">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                <Sparkle width={17} height={17} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-main">
                  {text(
                    "设计一个可直接使用的音效",
                    "Design a ready-to-use sound effect",
                  )}
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {text(
                    "独立调用 MXAPI 音效接口，一次返回两个版本。这里不会发送歌词、人声或歌曲高级参数。",
                    "Calls the MXAPI sound-effect endpoint and returns two versions. Lyrics, vocals and song-only parameters are not sent.",
                  )}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="field-title" htmlFor="sound-title">
                    {text("音效标题", "Sound title")}{" "}
                    <span className="text-rose-300">
                      {text("必填", "Required")}
                    </span>
                  </label>
                  <CharacterCount
                    value={form.title}
                    maxLength={SOUND_TITLE_MAX_LENGTH}
                  />
                </div>
                <input
                  id="sound-title"
                  className="field"
                  value={form.title}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder={text(
                    "例如：雨夜窗边",
                    "e.g. Rain on a window at night",
                  )}
                  maxLength={SOUND_TITLE_MAX_LENGTH}
                  autoComplete="off"
                />
              </div>
              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <label className="field-title" htmlFor="sound-tags">
                      {text("音效风格与描述", "Sound style & description")}{" "}
                      <span className="text-rose-300">
                        {text("必填", "Required")}
                      </span>
                    </label>
                    <p className="field-help">
                      {text(
                        "可描述声源、空间、质感、节奏和使用场景",
                        "Describe the source, space, texture, rhythm and intended scene",
                      )}
                    </p>
                  </div>
                  <CharacterCount
                    value={form.soundTags}
                    maxLength={SOUND_TAGS_MAX_LENGTH}
                  />
                </div>
                <textarea
                  id="sound-tags"
                  className="field min-h-44 resize-y text-[14px] leading-7"
                  rows={7}
                  value={form.soundTags}
                  onChange={(event) => set("soundTags", event.target.value)}
                  placeholder="e.g. steady rain ambience, soft window reflections, cinematic atmosphere"
                  maxLength={SOUND_TAGS_MAX_LENGTH}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SOUND_INSPIRATIONS.map(([label, tags]) => (
                  <button
                    key={label}
                    type="button"
                    className="idea-chip min-w-0"
                    onClick={() => set("soundTags", tags)}
                  >
                    <Sparkle width={11} height={11} />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[11px] leading-5 text-muted">
            <div className="mb-2 font-semibold text-main">
              {text("接口字段映射", "API field mapping")}
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] sm:grid-cols-3">
              <span>{text("标题", "Title")} → title</span>
              <span>{text("描述", "Description")} → tags</span>
              <span>{text("模型", "Model")} → mv</span>
              <span>BPM → tempo</span>
              <span>{text("调性", "Key")} → key</span>
              <span>{text("循环", "Loop")} → loop</span>
            </div>
          </section>
        </div>
      ) : form.mode === "simple" ? (
        <section
          className="animate-enter space-y-5"
          aria-labelledby="idea-label"
        >
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="field-title" htmlFor="simple-song-title">
                {t("create.songTitle")}{" "}
                <span className="font-normal text-subtle">
                  {t("create.optional")}
                </span>
              </label>
              <span className="flex items-center gap-2">
                <CharacterCount value={form.title} maxLength={maxTitleLength} />
                <button
                  type="button"
                  className="ai-inline-button"
                  onClick={() => onOpenAi("title.suggest")}
                >
                  <Sparkle width={12} height={12} />{" "}
                  {language === "zh-CN" ? "AI 标题" : "AI title"}
                </button>
              </span>
            </div>
            <input
              id="simple-song-title"
              className="field"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={
                language === "zh-CN" ? "给这次灵感一个名字" : "Name this idea"
              }
              maxLength={maxTitleLength}
            />
          </div>
          <div>
            <div className="mb-2 flex items-end justify-between gap-4">
              <div>
                <h2 id="idea-label" className="field-title">
                  {t("create.description")}
                </h2>
                <p className="field-help">{t("create.descriptionHint")}</p>
              </div>
              <CharacterCount
                value={form.description}
                maxLength={maxDescriptionLength}
              />
            </div>
            <div className="relative">
              <textarea
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                rows={10}
                maxLength={maxDescriptionLength}
                className="field min-h-52 resize-y pr-11 text-[15px] leading-7"
                placeholder={
                  language === "zh-CN"
                    ? "例如：一首关于错过末班车的华语流行歌。雨夜霓虹、温柔女声，副歌有逐渐拉开的电影感……"
                    : "Example: a Mandarin pop song about missing the last train, rainy neon, warm vocals and a cinematic chorus…"
                }
                aria-labelledby="idea-label"
              />
              <button
                type="button"
                className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent-soft transition hover:bg-accent/20"
                onClick={() => onOpenAi("prompt.optimize")}
                aria-label={text(
                  "使用 AI 优化歌曲描述",
                  "Use AI to refine the song description",
                )}
                title={text("AI 优化", "AI refine")}
              >
                <Wand width={15} height={15} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {INSPIRATIONS.map(([label, idea]) => (
                <button
                  key={label}
                  type="button"
                  className="idea-chip"
                  onClick={() => set("description", idea)}
                >
                  <Sparkle width={11} height={11} />
                  <span>
                    {text(
                      label,
                      label === "城市夜雨"
                        ? "Rainy city night"
                        : label === "公路电影"
                          ? "Road movie"
                          : label === "未来霓虹"
                            ? "Future neon"
                            : "Late-night jazz",
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="animate-enter space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="field-title" htmlFor="song-title">
                {t("create.songTitle")}{" "}
                <span className="font-normal text-subtle">
                  {t("create.optional")}
                </span>
              </label>
              <span className="flex items-center gap-2">
                <CharacterCount value={form.title} maxLength={maxTitleLength} />
                <button
                  type="button"
                  className="ai-inline-button"
                  onClick={() => onOpenAi("title.suggest")}
                >
                  <Sparkle width={12} height={12} />{" "}
                  {text("AI 标题", "AI title")}
                </button>
              </span>
            </div>
            <input
              id="song-title"
              className="field"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={text("给作品起一个名字", "Name this track")}
              maxLength={maxTitleLength}
            />
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="field-title" htmlFor="song-style">
                {text("音乐风格", "Music style")}
              </label>
              <span className="flex items-center gap-2">
                <CharacterCount value={form.style} maxLength={maxStyleLength} />
                <button
                  type="button"
                  className="ai-inline-button"
                  onClick={() => onOpenAi("style.suggest")}
                >
                  <Wand width={12} height={12} />{" "}
                  {text("风格扩写", "Expand style")}
                </button>
              </span>
            </div>
            <textarea
              id="song-style"
              rows={4}
              className="field resize-y leading-relaxed"
              value={form.style}
              onChange={(event) => set("style", event.target.value)}
              placeholder={text(
                "华语流行、Dream Pop、女声、温暖合成器、逐渐推进的鼓点……",
                "Mandarin pop, Dream Pop, female vocal, warm synths and a gradual drum build…",
              )}
              maxLength={maxStyleLength}
            />
          </section>
          {!form.instrumental && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <span className="field-title">{text("歌词", "Lyrics")}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="ai-inline-button"
                    onClick={() =>
                      onOpenAi(
                        form.lyrics ? "lyrics.rewrite" : "lyrics.generate",
                      )
                    }
                  >
                    <PenLine width={12} height={12} />{" "}
                    {form.lyrics
                      ? text("AI 润色", "AI refine")
                      : text("AI 生成", "AI generate")}
                  </button>
                  <button
                    type="button"
                    className="ai-inline-button"
                    disabled={!form.lyrics.trim()}
                    onClick={() => onOpenAi("lyrics.continue")}
                  >
                    <Sparkle width={12} height={12} />{" "}
                    {text("续写", "Continue")}
                  </button>
                </div>
              </div>
              <LyricsEditor
                value={form.lyrics}
                onChange={(value) => set("lyrics", value)}
                rows={12}
                maxLength={maxLyricsLength}
              />
            </section>
          )}
        </div>
      )}

      {form.source !== "sound" &&
        (form.source !== "reference_audio" ||
          referenceAudio.purpose === "extend") && (
          <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-main">
                  {t("create.pureMusic")}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {t("create.pureMusicHint")}
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.instrumental}
                  onChange={(event) =>
                    set("instrumental", event.target.checked)
                  }
                  aria-label={t("create.pureMusic")}
                />
                <span />
              </label>
            </div>
          </section>
        )}

      {form.source !== "sound" &&
        (form.source !== "reference_audio" ||
          referenceAudio.purpose === "extend") && (
          <section className="mt-5 rounded-2xl border border-accent/15 bg-accent/[0.055] p-4">
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">
                <Wand width={15} height={15} />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-main">
                  {text(
                    "让 AI 帮你完成创作包",
                    "Let AI build your creation pack",
                  )}
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {text(
                    "一次生成标题、歌词、风格和排除标签，应用前可逐项预览。",
                    "Generate a title, lyrics, style and exclusions in one pass, then review each field before applying.",
                  )}
                </p>
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-accent-soft hover:text-main"
                  onClick={() => onOpenAi("lyrics.generate")}
                >
                  {text("打开创作伙伴 →", "Open creative partner →")}
                </button>
              </div>
            </div>
          </section>
        )}
    </div>
  );
}

interface ModelProps {
  health: Health | null;
  form: FormState;
  models: MusicModelProfile[];
  projects?: MusicProject[];
  modelsLoading?: boolean;
  operations?: MusicOperationProfile[];
  operationsError?: string | null;
  referenceAudio?: ReferenceAudioDraft;
  accountBalance: number | null;
  modelsError?: string | null;
  previewTrack?: Track | null;
  onPreviewPlay?: (track: Track) => void;
  onRetryModels?: () => void;
  onFormChange: (form: FormState) => void;
  onSubmit: (input: GenerationInput) => Promise<void>;
  onSubmitReference?: (
    file: File,
    input: ReferenceAudioActionInput,
    copyrightAudio: boolean,
  ) => Promise<void>;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function ModelControlPanel({
  health,
  form,
  models,
  projects = [],
  modelsLoading = false,
  operations = [],
  operationsError = null,
  referenceAudio = EMPTY_REFERENCE_AUDIO,
  accountBalance,
  modelsError = null,
  previewTrack = null,
  onPreviewPlay,
  onRetryModels,
  onFormChange,
  onSubmit,
  onSubmitReference,
}: ModelProps) {
  const { language, t } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [advanced, setAdvanced] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    onFormChange({ ...form, [key]: value });
  const applyStylePreset = (prompt: string) =>
    onFormChange({
      ...form,
      style: prompt,
      description:
        form.mode === "simple" && !form.description.trim()
          ? prompt
          : form.description,
    });
  const referenceMode = form.source === "reference_audio";
  const soundMode = form.source === "sound";
  const generateProfile = findOperation(operations, "generate", { maxMode: form.isMaxMode === true });
  const soundProfile = findOperation(operations, "sound");
  const soundParameters = soundParameterConfig(soundProfile);
  const availableModels = models.filter(
    (model) =>
      model.enabled &&
      (!soundMode ||
        (SOUND_MODEL_IDS.includes(
          model.id as (typeof SOUND_MODEL_IDS)[number],
        ) &&
          modelAllowsOperation(model, "sound", soundProfile))),
  );
  const selected =
    availableModels.find((model) => model.id === form.model) ??
    availableModels[0];
  const collapsedModels = (() => {
    if (availableModels.length <= COLLAPSED_MODEL_LIMIT) return availableModels;
    const firstModels = availableModels.slice(0, COLLAPSED_MODEL_LIMIT);
    if (!selected || firstModels.some((model) => model.id === selected.id))
      return firstModels;
    return [...firstModels.slice(0, COLLAPSED_MODEL_LIMIT - 1), selected];
  })();
  const visibleModels = showAllModels ? availableModels : collapsedModels;
  const capabilities = selected?.capabilities;
  const supportsReferenceAudioWeight =
    modelSupportsReferenceAudioWeight(selected);
  const uploadProfile = findOperation(operations, "upload", {
    copyrightAudio: referenceAudio.copyrightAudio,
  });
  const extendProfile = findOperation(operations, "upload_extend", {
    copyrightAudio: referenceAudio.copyrightAudio,
  });
  const referenceProfile =
    referenceAudio.purpose === "import" ? uploadProfile : extendProfile;
  const referenceAction =
    referenceAudio.purpose === "import" ? "upload" : "upload_extend";
  const uploadLimits = audioUploadLimits(uploadProfile);
  const referenceParameters = referenceAudioParameterConfig(extendProfile);
  const referenceQuoteReady = operationHasQuote(referenceProfile);
  const referencePrice = referenceQuoteReady
    ? Number(referenceProfile?.estimatedCredits)
    : null;
  const generateQuoteReady = operationHasQuote(generateProfile);
  const generatePrice = generateQuoteReady
    ? Number(generateProfile?.estimatedCredits)
    : null;
  const soundQuoteReady = operationHasQuote(soundProfile);
  const soundPrice = soundQuoteReady
    ? Number(soundProfile?.estimatedCredits)
    : null;
  const price = referenceMode
    ? referencePrice
    : soundMode
      ? soundPrice
      : generatePrice;
  const online = Boolean(
    selected && health?.configured && health.upstreamReachable && health.ready,
  );
  const emptyModelState = (() => {
    if (modelsLoading)
      return {
        title: text("正在同步模型权限", "Syncing model access"),
        detail: text(
          "正在从 ModelCross 读取当前账号的模型授权。",
          "Reading this account’s model access from ModelCross.",
        ),
      };
    if (modelsError)
      return {
        title: text("模型目录加载失败", "Model catalog failed to load"),
        detail: modelsError,
      };
    if (!health)
      return {
        title: text("正在连接创作服务", "Connecting to the creation service"),
        detail: text(
          "正在读取 Provider、模型权限与计费状态。",
          "Reading Provider status, model access and billing.",
        ),
      };
    if (!health.configured)
      return {
        title: text(
          "音乐 Provider 尚未配置",
          "Music Provider is not configured",
        ),
        detail: text(
          "部署侧尚未配置 Suno Provider，当前无法提交生成任务。",
          "The deployment has no Suno Provider configured, so generation cannot be submitted.",
        ),
      };
    if (!health.upstreamReachable || !health.ready)
      return {
        title: text("音乐 Provider 暂不可用", "Music Provider unavailable"),
        detail:
          health.error ||
          text(
            "Provider 健康检查未通过，请稍后重试。",
            "The Provider health check failed. Try again later.",
          ),
      };
    if (!models.length)
      return {
        title: text(
          "当前 ModelCross 账号没有音乐模型权限",
          "No music model access for this ModelCross account",
        ),
        detail: text(
          "模型授权由 ModelCross 创作分组管理；AI Music Studio 不会使用本地模型绕过权限。",
          "Model access is managed by ModelCross creation groups; AI Music Studio never bypasses it with local models.",
        ),
      };
    return {
      title: text(
        "当前没有已授权且支持音效生成的模型",
        "No authorized model supports sound generation",
      ),
      detail: text(
        "音效生成需要已授权且支持该能力的 Suno V5 或 V5.5 模型。",
        "Sound generation requires an authorized Suno V5 or V5.5 model with this capability.",
      ),
    };
  })();
  const providerStatus = !health
    ? text("同步中", "Syncing")
    : !health.configured
      ? text("未配置", "Not configured")
      : health.upstreamReachable && health.ready
        ? text("连接正常", "Connected")
        : text("暂不可用", "Unavailable");
  const modelStatus = modelsLoading
    ? text("同步中", "Syncing")
    : modelsError
      ? text("加载失败", "Load failed")
      : models.length
        ? `${models.length} ${text("个已授权", "authorized")}`
        : text("当前账号未授权", "Not authorized for this account");
  const billingStatus = !health
    ? text("同步中", "Syncing")
    : health.billingLive
      ? text("真实计费已启用", "Live billing enabled")
      : health?.providerDirectBilling ? text("使用 API 账户计费", "Billed to API account") : text("预览模式，不实扣", "Preview mode; no charge");
  const vocalGenderUnavailableReason =
    referenceMode && referenceAudio.purpose === "import"
      ? text(
          "仅导入参考音频不会生成主唱；选择“上传并续作”后可设置。",
          "Importing reference audio does not create vocals; choose “Upload & continue” to configure them.",
        )
      : !selected
        ? text(
            "当前账号需先获得支持主唱声线的 Suno V4.5+ 模型权限。",
            "This account needs access to a Suno V4.5+ model with vocal controls.",
          )
        : form.instrumental
          ? text(
              "纯音乐模式不包含主唱；关闭纯音乐后即可选择。",
              "Instrumental mode has no lead vocal; turn it off to choose a voice.",
            )
          : !capabilities?.vocalGender
            ? text(
                `当前 ${selected.displayName} 不支持独立指定主唱性别；请选择 Suno V4.5+ 模型。`,
                `${selected.displayName} does not support an explicit vocal gender; choose a Suno V4.5+ model.`,
              )
            : null;
  const advancedSummary = soundMode
    ? `${form.soundTempo.trim() ? `${form.soundTempo} BPM` : text("默认 BPM", "Default BPM")} · ${form.soundKey.trim() || text("默认调性", "Default key")} · ${form.soundLoop ? text("循环", "Loop") : text("单次", "One-shot")}`
    : `${vocalGenderUnavailableReason || form.vocalGender === "auto" ? text("声线自动", "Voice: auto") : form.vocalGender === "f" ? text("女声", "Female vocal") : text("男声", "Male vocal")} · ${text("风格", "Style")} ${Math.round(form.styleWeight * 100)}% · ${text("创意", "Creativity")} ${Math.round(form.weirdness * 100)}%`;

  const validationMessage = useMemo(() => {
    if (operationsError) return `动作目录加载失败：${operationsError}`;
    if (soundMode) {
      const soundGate = operationGateReason(soundProfile);
      if (soundGate) return `音效生成不可用：${soundGate}`;
      if (!soundParameters)
        return "服务端返回的音效参数合同不完整或与 MXAPI 文档不一致";
      if (!selected)
        return (
          modelsError || "当前没有已授权且支持音效生成的 Suno V5 / V5.5 模型"
        );
      if (
        !soundParameters.modelIds.includes(
          selected.id as (typeof SOUND_MODEL_IDS)[number],
        ) ||
        !modelAllowsOperation(selected, "sound", soundProfile)
      )
        return "当前模型没有音效生成授权";
      if (!form.title.trim()) return "请填写音效标题";
      if (form.title.trim().length > soundParameters.titleMaxLength)
        return `音效标题不能超过 ${soundParameters.titleMaxLength} 个字符`;
      if (!form.soundTags.trim()) return "请填写音效风格与描述";
      if (form.soundTags.trim().length > soundParameters.tagsMaxLength)
        return `音效风格与描述不能超过 ${soundParameters.tagsMaxLength} 个字符`;
      if (form.soundTempo.trim() && !Number.isFinite(Number(form.soundTempo)))
        return "BPM 必须是有效数字，留空则不向 Provider 发送 tempo";
      if (typeof form.soundLoop !== "boolean")
        return "循环参数必须是明确的布尔值";
      if (price === null || !Number.isFinite(price))
        return "动态预计价格暂不可用，为避免错误扣费已禁用";
      if (accountBalance === null) return "账户余额暂不可用，请刷新账户信息";
      if (accountBalance < price) return "可用积分不足，请先充值";
      return null;
    }
    if (!selected) return modelsError || "当前没有可用的音乐模型，请刷新后重试";
    if (
      !Number.isFinite(selected.capabilities.maxTitleLength) ||
      selected.capabilities.maxTitleLength < 1
    )
      return "服务端未返回有效的模型标题长度能力";
    if (form.title.trim().length > selected.capabilities.maxTitleLength)
      return `歌名超过当前模型允许的 ${selected.capabilities.maxTitleLength} 个字符`;
    const generationFieldsUsed =
      !referenceMode || referenceAudio.purpose === "extend";
    if (generationFieldsUsed && form.mode === "simple") {
      if (
        !Number.isFinite(selected.capabilities.maxDescriptionLength) ||
        selected.capabilities.maxDescriptionLength < 1
      )
        return "服务端未返回有效的歌曲描述长度能力";
      if (
        form.description.trim().length >
        selected.capabilities.maxDescriptionLength
      )
        return `歌曲描述超过当前模型允许的 ${selected.capabilities.maxDescriptionLength} 个字符`;
    }
    if (generationFieldsUsed && form.mode === "custom") {
      if (
        !Number.isFinite(selected.capabilities.maxStyleLength) ||
        selected.capabilities.maxStyleLength < 1
      )
        return "服务端未返回有效的音乐风格长度能力";
      if (form.style.trim().length > selected.capabilities.maxStyleLength)
        return `音乐风格超过当前模型允许的 ${selected.capabilities.maxStyleLength} 个字符`;
      if (
        !Number.isFinite(selected.capabilities.maxLyricsLength) ||
        selected.capabilities.maxLyricsLength < 1
      )
        return "服务端未返回有效的歌词长度能力";
      if (
        !form.instrumental &&
        form.lyrics.trim().length > selected.capabilities.maxLyricsLength
      )
        return `歌词超过当前模型允许的 ${selected.capabilities.maxLyricsLength} 个字符`;
    }
    if (generationFieldsUsed && selected.capabilities.negativeTags) {
      if (
        !Number.isFinite(selected.capabilities.maxNegativeTagsLength) ||
        selected.capabilities.maxNegativeTagsLength < 1
      )
        return "服务端未返回有效的排除风格长度能力";
      if (
        form.negativeTags.trim().length >
        selected.capabilities.maxNegativeTagsLength
      )
        return `排除风格超过当前模型允许的 ${selected.capabilities.maxNegativeTagsLength} 个字符`;
    }
    if (
      generationFieldsUsed &&
      form.instrumental &&
      !selected.capabilities.instrumental
    )
      return "当前模型不支持纯音乐生成";
    if (referenceMode) {
      if (!modelAllowsOperation(selected, referenceAction, referenceProfile))
        return referenceAudio.purpose === "import"
          ? "当前模型不支持参考音频导入"
          : "当前模型不支持参考音频续作";
      const referenceGate = operationGateReason(referenceProfile);
      if (referenceGate)
        return `${referenceAudio.purpose === "import" ? "参考音频导入" : "参考音频续作"}不可用：${referenceGate}`;
      if (!referenceAudio.file) return "请选择参考音频文件";
      if (!referenceAudio.copyrightConfirmed)
        return "请先确认拥有上传及生成所需的全部权利";
      if (referenceAudio.inspecting) return "正在读取参考音频时长";
      if (!referenceAudio.durationSeconds) return "参考音频时长尚未验证";
      if (
        !(
          uploadLimits.acceptedMimeTypes.length ||
          uploadLimits.acceptedExtensions.length
        ) ||
        !uploadLimits.maxBytes ||
        !uploadLimits.maxDurationSeconds
      )
        return "服务端上传限制配置不完整";
      if (!fileMatchesAudioLimits(referenceAudio.file, uploadLimits))
        return "参考音频类型不在服务端允许范围内";
      if (referenceAudio.file.size > uploadLimits.maxBytes)
        return "参考音频大小超过服务端限制";
      if (referenceAudio.durationSeconds > uploadLimits.maxDurationSeconds)
        return "参考音频时长超过服务端限制";
      if (referenceAudio.purpose === "extend") {
        if (!referenceParameters) return "服务端未返回完整的参考音频参数范围";
        const maximumContinueAt = Math.min(
          referenceParameters.continueCatalogMax ??
            referenceAudio.durationSeconds,
          referenceAudio.durationSeconds,
        );
        if (
          referenceAudio.continueAt < referenceParameters.continueMin ||
          referenceAudio.continueAt > maximumContinueAt
        )
          return "续作起点超出当前能力或音频时长范围";
        if (
          supportsReferenceAudioWeight &&
          (referenceAudio.audioWeight < referenceParameters.audioWeightMin ||
            referenceAudio.audioWeight > referenceParameters.audioWeightMax)
        )
          return "参考音频权重超出服务端能力范围";
      }
      if (!onSubmitReference) return "参考音频提交接口尚未就绪";
    } else {
      if (!modelAllowsOperation(selected, "generate", generateProfile))
        return "当前模型不支持双版本音乐生成";
      const generateGate = operationGateReason(generateProfile);
      if (generateGate) return `音乐生成不可用：${generateGate}`;
    }
    if (
      (!referenceMode || referenceAudio.purpose === "extend") &&
      form.mode === "simple" &&
      !form.description.trim()
    )
      return "请先描述你想听到的歌曲";
    if (
      (!referenceMode || referenceAudio.purpose === "extend") &&
      form.mode === "custom" &&
      !form.style.trim()
    )
      return "自定义模式需要填写音乐风格";
    if (
      (!referenceMode || referenceAudio.purpose === "extend") &&
      form.mode === "custom" &&
      !form.instrumental &&
      !form.lyrics.trim()
    )
      return "请填写歌词，或开启纯音乐";
    if (price === null || !Number.isFinite(price))
      return "动态预计价格暂不可用，为避免错误扣费已禁用";
    if (accountBalance === null) return "账户余额暂不可用，请刷新账户信息";
    if (accountBalance < price) return "可用积分不足，请先充值";
    return null;
  }, [
    accountBalance,
    form.description,
    form.instrumental,
    form.lyrics,
    form.mode,
    form.negativeTags,
    form.soundLoop,
    form.soundTags,
    form.soundTempo,
    form.style,
    form.title,
    generateProfile,
    modelsError,
    onSubmitReference,
    operationsError,
    price,
    referenceAction,
    referenceAudio,
    referenceMode,
    referenceParameters,
    referenceProfile,
    selected,
    soundMode,
    soundParameters,
    soundProfile,
    supportsReferenceAudioWeight,
    uploadLimits,
  ]);

  const submit = async () => {
    if (validationMessage) return setError(validationMessage);
    setError(null);
    setSubmitting(true);
    try {
      if (soundMode) {
        if (
          !selected ||
          !SOUND_MODEL_IDS.includes(
            selected.id as (typeof SOUND_MODEL_IDS)[number],
          )
        )
          throw new Error("音效模型选择无效");
        const tempo = form.soundTempo.trim();
        await onSubmit({
          kind: "sound",
          ...(form.projectId ? { projectId: form.projectId } : {}),
          title: form.title.trim(),
          tags: form.soundTags.trim(),
          model: selected.id as (typeof SOUND_MODEL_IDS)[number],
          ...(tempo ? { tempo: Number(tempo) } : {}),
          ...(form.soundKey.trim() ? { key: form.soundKey.trim() } : {}),
          loop: form.soundLoop,
        });
        return;
      }
      const input: GenerateInput = {
        ...(form.projectId ? { projectId: form.projectId } : {}),
        mode: form.mode,
        model: selected?.id ?? form.model,
        title: form.title.trim(),
        description: form.description.trim(),
        style: form.style.trim(),
        lyrics: form.instrumental ? "" : form.lyrics.trim(),
        instrumental: form.instrumental,
        negativeTags: form.negativeTags.trim(),
        vocalGender: vocalGenderUnavailableReason ? "auto" : form.vocalGender,
        styleWeight: clamp(form.styleWeight),
        weirdness: clamp(form.weirdness),
        ...(!referenceMode && form.isMaxMode ? { isMaxMode: true } : {}),
        ...(!referenceMode && form.augCreativity !== undefined ? { augCreativity: form.augCreativity } : {}),
        ...(!referenceMode ? { outputCount: form.outputCount ?? 2 } : {}),
      };
      if (referenceMode) {
        if (!referenceAudio.file || !onSubmitReference)
          throw new Error("参考音频提交条件不完整");
        const referenceInput: ReferenceAudioActionInput =
          referenceAudio.purpose === "import"
            ? {
                action: "upload",
                ...(form.projectId ? { projectId: form.projectId } : {}),
                model: input.model,
                title: input.title,
              }
            : {
                ...input,
                action: "upload_extend",
                continueAt: referenceAudio.continueAt,
                ...(supportsReferenceAudioWeight
                  ? { audioWeight: referenceAudio.audioWeight }
                  : {}),
              };
        await onSubmitReference(
          referenceAudio.file,
          referenceInput,
          referenceAudio.copyrightAudio,
        );
      } else {
        await onSubmit(input);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const genderOption = (value: VocalGender, label: string) => (
    <button
      type="button"
      onClick={() => set("vocalGender", value)}
      aria-pressed={form.vocalGender === value}
      className={`parameter-option ${form.vocalGender === value ? "active" : ""}`}
    >
      {form.vocalGender === value && <Check width={11} height={11} />}
      {label}
    </button>
  );

  return (
    <div className="model-column flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 xl:p-5">
        <section
          className="creation-preview-card"
          aria-labelledby="creation-preview-title"
        >
          <div className="creation-context-heading">
            <span className="creation-context-icon">
              <Play width={13} height={13} />
            </span>
            <h2 id="creation-preview-title">{text("试听预览", "Preview")}</h2>
            <span>
              {previewTrack
                ? text("已连接", "Connected")
                : text("暂无可预览作品", "No preview available")}
            </span>
          </div>
          {previewTrack ? (
            <div className="creation-preview-track">
              <div className="creation-preview-cover">
                <Music width={17} height={17} />
              </div>
              <div className="min-w-0 flex-1">
                <strong>
                  {previewTrack.title || text("未命名作品", "Untitled track")}
                </strong>
                <small>{modelLabel(previewTrack.model)}</small>
              </div>
              {onPreviewPlay && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onPreviewPlay(previewTrack)}
                  aria-label={`${text("播放", "Play")} ${previewTrack.title || text("未命名作品", "Untitled track")}`}
                >
                  <Play width={14} height={14} />
                </button>
              )}
            </div>
          ) : (
            <p className="creation-preview-empty">
              {text(
                "完成一次生成后，最近的可播放作品会出现在这里。",
                "Your latest playable track will appear here after generation.",
              )}
            </p>
          )}
        </section>
        <section
          className="creation-presets-card"
          aria-labelledby="creation-presets-title"
        >
          <div className="creation-context-heading">
            <span className="creation-context-icon preset">
              <Sparkle width={13} height={13} />
            </span>
            <h2 id="creation-presets-title">
              {text("热门风格预设", "Popular style presets")}
            </h2>
            <span>{text("点击即可载入", "Click to load")}</span>
          </div>
          <div className="creation-preset-list">
            {STYLE_PRESETS.map(([label, detail, prompt]) => (
              <button
                key={label}
                type="button"
                className="creation-preset"
                onClick={() => applyStylePreset(prompt)}
              >
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <span className="creation-preset-apply">
                  {text("载入", "Load")}
                </span>
              </button>
            ))}
          </div>
        </section>
        <div className="creation-step-heading">
          <span className="creation-step-number">2</span>
          <div>
            <h2>{t("create.modelTitle")}</h2>
            <p>{t("create.modelSubtitle")}</p>
          </div>
        </div>
        <section className="control-section">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="field-title !mb-0" htmlFor="generation-project">
              {text("归属项目", "Project")}
            </label>
            <span className="text-[10px] text-muted">
              {t("create.optional")}
            </span>
          </div>
          <select
            id="generation-project"
            className="field"
            value={form.projectId ?? ""}
            onChange={(event) => set("projectId", event.target.value || null)}
          >
            <option value="">
              {text("不归入项目（稍后整理）", "No project (organize later)")}
            </option>
            {projects
              .filter((project) => project.status !== "archived")
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title} · {project.trackCount} {text("首", "tracks")}
                </option>
              ))}
          </select>
          <p className="mt-2 text-[10px] leading-4 text-muted">
            {text(
              "项目归属会随生成意图服务端落库，并可在作品库按项目筛选。",
              "The project is stored with the generation request and can be used to filter the library.",
            )}
          </p>
        </section>
        <section className="control-section">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="field-title">
              {soundMode
                ? text("音效模型", "Sound model")
                : text("生成模型", "Generation model")}
            </h2>
            <span className="text-[11px] text-muted">
              {text("动态能力", "Live capability")}
            </span>
          </div>
          {availableModels.length ? (
            <>
              <div
                id="generation-model-list"
                className="space-y-2"
                role="radiogroup"
                aria-label={
                  soundMode
                    ? text("音效模型", "Sound model")
                    : text("生成模型", "Generation model")
                }
              >
                {visibleModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="radio"
                    aria-checked={selected?.id === model.id}
                    className={`model-option ${selected?.id === model.id ? "active" : ""}`}
                    onClick={() => onFormChange({ ...form, model: model.id as MxapiModel, ...(!model.capabilities.styleWeight ? { isMaxMode: false, augCreativity: undefined } : {}) })}
                  >
                    <span className="model-dot">
                      {selected?.id === model.id && <span />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <strong>{model.displayName}</strong>
                        {model.badge && (
                          <em>{localizeCatalogText(model.badge, language)}</em>
                        )}
                      </span>
                      <small>
                        {localizeCatalogText(model.description, language)}
                      </small>
                    </span>
                    <span className="model-price">{price ?? "—"}</span>
                  </button>
                ))}
              </div>
              {availableModels.length > COLLAPSED_MODEL_LIMIT && (
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold text-muted transition hover:bg-[var(--surface-2)] hover:text-main"
                  aria-expanded={showAllModels}
                  aria-controls="generation-model-list"
                  onClick={() => setShowAllModels((value) => !value)}
                >
                  {showAllModels
                    ? text("收起模型列表", "Show fewer models")
                    : `${text("查看全部", "View all")} ${availableModels.length} ${text("个模型", "models")}`}
                  <Chevron
                    width={13}
                    height={13}
                    className={`transition ${showAllModels ? "-rotate-90" : "rotate-90"}`}
                  />
                </button>
              )}
            </>
          ) : (
            <div
              className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] leading-5 text-amber-100"
              role="alert"
            >
              <strong className="block text-xs text-amber-50">
                {emptyModelState.title}
              </strong>
              <p className="mt-1 text-amber-100/80">{emptyModelState.detail}</p>
              <dl className="mt-3 space-y-1 border-t border-amber-300/15 pt-2 text-[10px]">
                <div className="flex justify-between gap-3">
                  <dt>Provider</dt>
                  <dd className="text-right font-medium">{providerStatus}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{text("模型权限", "Model access")}</dt>
                  <dd className="text-right font-medium">{modelStatus}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{text("积分计费", "Credit billing")}</dt>
                  <dd className="text-right font-medium">{billingStatus}</dd>
                </div>
              </dl>
              {onRetryModels && !modelsLoading && (
                <button
                  type="button"
                  className="mt-2 font-semibold underline underline-offset-2"
                  onClick={onRetryModels}
                >
                  {text("重新加载模型", "Reload models")}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="control-section">
          <button
            type="button"
            className="control-disclosure"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
            aria-controls="generation-advanced-controls"
          >
            <span>
              <span className="field-title">
                {soundMode
                  ? text("音效参数", "Sound settings")
                  : text("人声与高级参数", "Vocals & advanced settings")}
              </span>
              <span className="control-summary">
                {advanced
                  ? soundMode
                    ? text("完全对应 MXAPI 字段", "Exact MXAPI fields")
                    : text(
                        "声线与模型能力动态呈现",
                        "Voice and model capabilities",
                      )
                  : advancedSummary}
              </span>
            </span>
            <Chevron
              width={15}
              height={15}
              className={`shrink-0 text-muted transition ${advanced ? "rotate-90" : ""}`}
            />
          </button>
          <div id="generation-advanced-controls">
            {advanced && (
              <div className="mt-4 animate-enter space-y-5">
                {soundMode ? (
                  <>
                    <div className="grid min-w-0 grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <label
                          className="parameter-label"
                          htmlFor="sound-tempo"
                        >
                          BPM{" "}
                          <span className="font-normal text-subtle">
                            {t("create.optional")}
                          </span>
                        </label>
                        <input
                          id="sound-tempo"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          className="field min-w-0 !py-2 text-xs"
                          value={form.soundTempo}
                          onChange={(event) =>
                            set("soundTempo", event.target.value)
                          }
                          placeholder={String(
                            soundParameters?.tempoDefault ?? 99,
                          )}
                        />
                        <p className="mt-1.5 text-[10px] leading-4 text-muted">
                          tempo · {text("文档默认", "Document default")}{" "}
                          {soundParameters?.tempoDefault ?? 99}，
                          {text("未限定范围", "no range specified")}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <label className="parameter-label" htmlFor="sound-key">
                          {text("调性", "Key")}{" "}
                          <span className="font-normal text-subtle">
                            {t("create.optional")}
                          </span>
                        </label>
                        <input
                          id="sound-key"
                          className="field min-w-0 !py-2 text-xs"
                          value={form.soundKey}
                          onChange={(event) =>
                            set("soundKey", event.target.value)
                          }
                          placeholder={soundParameters?.keyDefault ?? "D"}
                          autoComplete="off"
                        />
                        <p className="mt-1.5 text-[10px] leading-4 text-muted">
                          key · {text("文档默认", "Document default")}{" "}
                          {soundParameters?.keyDefault ?? "D"}，
                          {text("未限定枚举", "no enum specified")}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <label
                            className="text-xs font-semibold text-main"
                            htmlFor="sound-loop"
                          >
                            {text("无缝循环", "Seamless loop")}
                          </label>
                          <p className="mt-1 text-[10px] leading-4 text-muted">
                            {text(
                              "开启后会尽量让音频首尾自然衔接，适合持续播放的场景。MXAPI 文档默认开启。",
                              "When enabled, the start and end blend for continuous playback. Enabled by default in the MXAPI contract.",
                            )}
                          </p>
                        </div>
                        <label className="switch shrink-0">
                          <input
                            id="sound-loop"
                            type="checkbox"
                            checked={form.soundLoop}
                            onChange={(event) =>
                              set("soundLoop", event.target.checked)
                            }
                          />
                          <span />
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="parameter-label">
                        {text("主唱声线", "Lead vocal")}
                      </div>
                      {vocalGenderUnavailableReason ? (
                        <>
                          <div
                            className="grid grid-cols-3 gap-1.5"
                            role="group"
                            aria-label={text(
                              "主唱声线（当前不可用）",
                              "Lead vocal (unavailable)",
                            )}
                          >
                            <button
                              type="button"
                              className="parameter-option"
                              disabled
                            >
                              {text("自动", "Auto")}
                            </button>
                            <button
                              type="button"
                              className="parameter-option"
                              disabled
                            >
                              {text("女声", "Female")}
                            </button>
                            <button
                              type="button"
                              className="parameter-option"
                              disabled
                            >
                              {text("男声", "Male")}
                            </button>
                          </div>
                          <p className="mt-2 text-[10px] leading-4 text-muted">
                            {vocalGenderUnavailableReason}
                          </p>
                        </>
                      ) : (
                        <div
                          className="grid grid-cols-3 gap-1.5"
                          role="group"
                          aria-label={text("主唱声线", "Lead vocal")}
                        >
                          {genderOption("auto", text("自动", "Auto"))}
                          {genderOption("f", text("女声", "Female"))}
                          {genderOption("m", text("男声", "Male"))}
                        </div>
                      )}
                    </div>
                    {capabilities?.negativeTags && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label
                            className="parameter-label !mb-0"
                            htmlFor="negative-tags"
                          >
                            {text("排除风格", "Exclude styles")}
                          </label>
                          <CharacterCount
                            value={form.negativeTags}
                            maxLength={capabilities.maxNegativeTagsLength}
                          />
                        </div>
                        <input
                          id="negative-tags"
                          className="field !py-2 text-xs"
                          value={form.negativeTags}
                          onChange={(event) =>
                            set("negativeTags", event.target.value)
                          }
                          placeholder={text(
                            "重金属、说唱、强烈 Auto-Tune",
                            "Heavy metal, rap, heavy Auto-Tune",
                          )}
                          maxLength={capabilities.maxNegativeTagsLength}
                        />
                      </div>
                    )}
                    {capabilities?.styleWeight && (
                      <ParameterRange
                        label={text("风格强度", "Style strength")}
                        value={form.styleWeight}
                        range={capabilities.styleWeight}
                        onChange={(value) => set("styleWeight", value)}
                        hint={text(
                          "越高越严格遵循风格描述",
                          "Higher values follow the style description more closely",
                        )}
                      />
                    )}
                    {!referenceMode && capabilities?.weirdness && <div className="space-y-3 rounded-xl border border-[var(--line)] p-3">
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.isMaxMode ?? false} onChange={e => set("isMaxMode", e.target.checked)} />{text("Max 模式 · 上游双倍费用", "Max mode · double provider cost")}</label>
                      <label className="block text-xs">{text("创造力增强（0–4）", "Enhanced creativity (0–4)")}<input className="input mt-2" type="number" min={0} max={4} step={0.1} value={form.augCreativity ?? ""} placeholder={text("默认", "Default")} onChange={e => set("augCreativity", e.target.value === "" ? undefined : Number(e.target.value))}/></label>
                    </div>}
                    {capabilities?.weirdness && (
                      <ParameterRange
                        label={text("创意度", "Creativity")}
                        value={form.weirdness}
                        range={capabilities.weirdness}
                        onChange={(value) => set("weirdness", value)}
                        hint={text(
                          "越高越可能出现意外旋律与编排",
                          "Higher values allow more unexpected melodies and arrangements",
                        )}
                        coral
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted">{t("create.output")}</span>
            <strong className="text-right text-main">
              {referenceMode
                ? referenceAudio.purpose === "import"
                  ? text("1 首 Provider 导入单曲", "1 imported Provider track")
                  : text(
                      "私有接入 + 2 个续作版本",
                      "Private upload + 2 continuations",
                    )
                : soundMode
                  ? text("2 个独立音效版本", "2 independent sound effects")
                  : text(`${form.outputCount ?? 2} 个独立版本`, `${form.outputCount ?? 2} independent versions`)}
            </strong>
          </div>
          {!referenceMode && !soundMode && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2.5">
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-main">{text("生成数量", "Number of songs")}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted">{text("MXAPI 单次请求固定返回两个任务，可选择保留 1 首或 2 首。", "MXAPI returns two tasks per request; keep one or both results.")}</span>
              </div>
              <div className="segmented shrink-0" role="group" aria-label={text("生成数量", "Number of songs")}>
                {[1, 2].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={(form.outputCount ?? 2) === count ? "active" : ""}
                    aria-pressed={(form.outputCount ?? 2) === count}
                    onClick={() => set("outputCount", count as 1 | 2)}
                  >
                    {count} {text("首", "song")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!referenceMode && !soundMode && (form.outputCount ?? 2) === 1 && (
            <p className="mt-2 text-[10px] leading-4 text-muted">{text("提示：Suno/MXAPI 接口仍会创建双任务；选择 1 首只会在 MuseFlow 中保留第一个结果，预计积分按接口双任务报价显示。", "Note: Suno/MXAPI still creates two upstream tasks. Choosing 1 keeps only the first result in MuseFlow; the estimate remains the pair price.")}</p>
          )}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted">{t("create.estimated")}</span>
            <strong className="text-base text-main">
              {price === null ? "—" : price}{" "}
              <small className="font-normal text-muted">
                {t("nav.credits")}
              </small>
            </strong>
          </div>
          <div className="mt-3 border-t border-[var(--line)] pt-3 text-[10px] leading-4 text-muted">
            {health?.providerDirectBilling ? text("本地直连：生成将消耗 API 账户额度。页面积分为开发报价，不代表上游实际费用。", "Local provider billing: generation consumes API account credits; development estimates are not provider costs.") : health?.billingLive
              ? text(
                  "生成时先预留积分；失败会自动释放或退款，最终消费以账单记录为准。",
                  "Credits are reserved before generation; failures are released or refunded. Final usage follows billing.",
                )
              : text(
                  "安全预览模式：仅展示预计积分，不会发起真实预扣或结算。",
                  "Preview mode: estimated credits only; no real reservation or settlement.",
                )}
          </div>
        </section>
        {error && (
          <div
            className="rounded-xl border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-[11px] leading-5 text-rose-300"
            role="alert"
          >
            {localizeCatalogText(error, language)}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-1)] p-4">
        <button
          type="button"
          className="btn-primary w-full py-3"
          disabled={submitting || !online || Boolean(validationMessage)}
          onClick={() => void submit()}
        >
          {submitting ? (
            <Spinner width={16} height={16} />
          ) : (
            <Sparkle width={16} height={16} />
          )}
          {submitting
            ? text("正在安全提交…", "Submitting securely…")
            : referenceMode
              ? referenceAudio.purpose === "import"
                ? `${text("仅导入单曲", "Import track")} · ${price ?? "—"} ${t("nav.credits")}`
                : `${text("上传并续作", "Upload & continue")} · ${price ?? "—"} ${t("nav.credits")}`
              : soundMode
                ? `${text("生成 2 个音效", "Generate 2 sound effects")} · ${price ?? "—"} ${t("nav.credits")}`
              : `${text(`生成 ${form.outputCount ?? 2} 首歌曲`, `Generate ${form.outputCount ?? 2} songs`)} · ${price ?? "—"} ${t("nav.credits")}`}
        </button>
        <div className="mt-2.5 flex justify-between gap-2 text-[10px] text-muted">
          <span>
            {!health
              ? text("正在连接生成服务…", "Connecting to generation service…")
              : !health.configured
                ? text(
                    "尚未配置音乐 Provider",
                    "Music Provider is not configured",
                  )
                : !online
                  ? text("服务暂不可用", "Service unavailable")
                  : localizeCatalogText(validationMessage, language) ||
                    (health.providerDirectBilling ? text("API 账户实际计费", "Billed to API account") : health.billingLive
                      ? text(
                          "已启用幂等扣费保护",
                          "Idempotent billing protection enabled",
                        )
                      : text(
                          "预计积分预览 · 不实扣",
                          "Estimated credits preview · no charge",
                        ))}
          </span>
          <span className="shrink-0">
            {text("余额", "Balance")}{" "}
            {accountBalance === null ? "—" : accountBalance.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function ParameterRange({
  label,
  value,
  range,
  onChange,
  hint,
  coral = false,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  onChange: (value: number) => void;
  hint: string;
  coral?: boolean;
}) {
  const percentage = Math.round(
    ((value - range.min) / Math.max(0.0001, range.max - range.min)) * 100,
  );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="parameter-label !mb-0">{label}</span>
        <span
          className={`font-mono text-xs ${coral ? "text-coral-strong" : "text-accent-strong"}`}
        >
          {percentage}%
        </span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range-gradient w-full appearance-none"
        aria-label={label}
      />
      <p className="mt-2 text-[11px] text-muted">{hint}</p>
    </div>
  );
}
