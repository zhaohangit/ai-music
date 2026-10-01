import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, createIdempotencyKey } from "../api";
import { localizeCatalogText, useI18n } from "../i18n";
import type {
  AiAppliedField,
  AiAssistAction,
  AiAssistInput,
  AiAssistResult,
  AiModelProfile,
  AiOperationProfile,
} from "../types";
import type { FormState } from "./CreatePanel";
import {
  ArrowRight,
  Check,
  History,
  Languages,
  PenLine,
  Quote,
  Sparkle,
  Spinner,
  Wand,
  X,
} from "./Icons";

interface Props {
  action: AiAssistAction | null;
  form: FormState;
  models: AiModelProfile[];
  modelsError: string | null;
  operations: AiOperationProfile[];
  operationsError: string | null;
  accountBalance: number | null;
  onActionChange: (action: AiAssistAction) => void;
  onApply: (result: AiAssistResult) => void;
  onClose: () => void;
}

const ACTIONS: Array<{
  value: AiAssistAction;
  label: string;
  short: string;
  Icon: typeof Sparkle;
}> = [
  {
    value: "lyrics.generate",
    label: "生成完整歌词",
    short: "生成",
    Icon: Sparkle,
  },
  {
    value: "lyrics.continue",
    label: "续写当前歌词",
    short: "续写",
    Icon: PenLine,
  },
  { value: "lyrics.rewrite", label: "润色与押韵", short: "润色", Icon: Wand },
  {
    value: "lyrics.translate",
    label: "翻译歌词",
    short: "翻译",
    Icon: Languages,
  },
  { value: "title.suggest", label: "建议歌曲标题", short: "标题", Icon: Quote },
  { value: "style.suggest", label: "扩写音乐风格", short: "风格", Icon: Wand },
  {
    value: "prompt.optimize",
    label: "优化歌曲描述",
    short: "Prompt",
    Icon: Sparkle,
  },
];
const ACTION_LABEL_EN: Record<AiAssistAction, string> = {
  "lyrics.generate": "Generate full lyrics",
  "lyrics.continue": "Continue current lyrics",
  "lyrics.rewrite": "Refine & rhyme",
  "lyrics.translate": "Translate lyrics",
  "title.suggest": "Suggest a song title",
  "style.suggest": "Expand music style",
  "prompt.optimize": "Optimize song description",
};
const ACTION_SHORT_EN: Record<AiAssistAction, string> = {
  "lyrics.generate": "Generate",
  "lyrics.continue": "Continue",
  "lyrics.rewrite": "Refine",
  "lyrics.translate": "Translate",
  "title.suggest": "Title",
  "style.suggest": "Style",
  "prompt.optimize": "Prompt",
};

const LANGUAGES = [
  ["auto", "自动识别"],
  ["zh-CN", "简体中文"],
  ["en-US", "English"],
  ["ja-JP", "日本語"],
  ["ko-KR", "한국어"],
] as const;
const LANGUAGE_LABELS_EN: Record<Language, string> = {
  auto: "Auto-detect",
  "zh-CN": "Simplified Chinese",
  "en-US": "English",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
};

type Language = (typeof LANGUAGES)[number][0];
type RequestIdentity = { fingerprint: string; key: string };

const sourceFor = (action: AiAssistAction, form: FormState) => {
  if (action === "lyrics.generate" && form.mode === "simple")
    return form.description.trim() ? form.description : form.lyrics;
  if (action === "title.suggest")
    return form.lyrics || form.description || form.style;
  if (action === "style.suggest")
    return form.description || form.lyrics || form.style;
  if (action === "prompt.optimize")
    return form.description || form.style || form.lyrics;
  return form.lyrics || form.description;
};

function quoteIsValid(
  profile: AiOperationProfile | undefined,
): profile is AiOperationProfile & {
  estimatedCredits: number;
  priceVersion: string;
} {
  return Boolean(
    profile &&
      Number.isFinite(profile.estimatedCredits) &&
      Number(profile.estimatedCredits) >= 0 &&
      profile.priceVersion?.trim(),
  );
}

export function aiOperationGateReason(
  profile: AiOperationProfile | undefined,
  operationsError: string | null,
  accountBalance: number | null,
): string | null {
  if (operationsError) return operationsError;
  if (!profile) return "服务端未返回此 AI 动作的授权与价格目录";
  if (!profile.catalogAvailable)
    return profile.reason || "ModelCross 价格目录尚未配置此 AI 动作";
  if (
    !Number.isFinite(profile.estimatedCredits) ||
    Number(profile.estimatedCredits) < 0
  ) {
    return "服务端未返回有效的 AI 动态估价";
  }
  if (!profile.priceVersion?.trim()) return "服务端未返回 AI 价格版本";
  if (!profile.modelAuthorized)
    return profile.reason || `当前账户未授权 AI 模型 ${profile.model}`;
  if (!profile.available) return profile.reason || "此 AI 动作当前不可用";
  const preview = profile.previewExecutable === true || profile.localDirect === true;
  if (profile.executable !== true && !preview)
    return profile.reason || "服务端未授权执行此 AI 动作";
  if (!preview && profile.chargingEnabled !== true) {
    return profile.reason || "真实 AI 扣费未启用，已阻止请求";
  }
  if (!Number.isFinite(accountBalance) || Number(accountBalance) < 0)
    return "账户可用余额尚未加载";
  if (!preview && Number(accountBalance) < Number(profile.estimatedCredits)) {
    return `可用余额不足：需要 ${profile.estimatedCredits} 积分，当前 ${accountBalance} 积分`;
  }
  return null;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

const FIELD_LABELS: Record<AiAppliedField, string> = {
  title: "标题",
  lyrics: "歌词",
  style: "风格标签",
  negativeTags: "排除标签",
  prompt: "歌曲描述",
};
const FIELD_LABELS_EN: Record<AiAppliedField, string> = {
  title: "title",
  lyrics: "lyrics",
  style: "style tags",
  negativeTags: "exclusion tags",
  prompt: "song description",
};

function suggestionFields(
  result: AiAssistResult,
): Array<{ field: AiAppliedField; value: string }> {
  const values: Partial<Record<AiAppliedField, string>> = {
    title:
      result.title?.trim() ||
      result.fields?.title?.trim() ||
      (result.action === "title.suggest" ? result.suggestion.trim() : ""),
    lyrics:
      result.fields?.lyrics?.trim() ||
      (result.action.startsWith("lyrics.") ? result.suggestion.trim() : ""),
    style:
      result.styleTags
        ?.map((value) => value.trim())
        .filter(Boolean)
        .join(", ") ||
      result.fields?.style?.trim() ||
      (result.action === "style.suggest" ? result.suggestion.trim() : ""),
    negativeTags:
      result.negativeTags
        ?.map((value) => value.trim())
        .filter(Boolean)
        .join(", ") || result.fields?.negativeTags?.trim(),
    prompt:
      result.fields?.prompt?.trim() ||
      (result.action === "prompt.optimize" ? result.suggestion.trim() : ""),
  };
  return (
    ["title", "lyrics", "style", "negativeTags", "prompt"] as const
  ).flatMap((field) =>
    values[field] ? [{ field, value: values[field] as string }] : [],
  );
}

function billingLabel(
  result: AiAssistResult,
  language: "zh-CN" | "en-US",
): string {
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const status = result.billing?.status;
  if (status === "reconcile_required")
    return text(
      "结算待确认 · 请勿重复提交",
      "Settlement pending confirmation · do not resubmit",
    );
  if (status === "manual_review_required")
    return text(
      "结算需人工核对 · 请勿重复提交",
      "Settlement requires review · do not resubmit",
    );
  if (status === "reserved")
    return text(
      `已预留 ${result.billing?.estimatedCredits ?? result.estimatedCredits} 积分 · 结算中`,
      `${result.billing?.estimatedCredits ?? result.estimatedCredits} credits reserved · settling`,
    );
  if (status === "preview")
    return text(
      "本次消耗 0 积分 · 本地开发预览",
      "0 credits used · local preview",
    );
  if (status === "released")
    return text(
      "本次消耗 0 积分 · 预留已释放",
      "0 credits used · reservation released",
    );
  if (status === "refunded")
    return text("本次消耗 0 积分 · 已退款", "0 credits used · refunded");
  if (status === "disabled")
    return text(
      "本次消耗 0 积分 · 计费已关闭",
      "0 credits used · billing disabled",
    );
  if (status === "not_reserved")
    return text(
      "本次消耗 0 积分 · 未发生预扣",
      "0 credits used · no reservation",
    );
  const actual = result.actualCredits ?? result.billing?.actualCredits;
  if (status === "captured") {
    return Number.isFinite(actual)
      ? text(`本次消耗 ${actual} 积分`, `${actual} credits used`)
      : text(
          "结算已完成 · 具体积分以账单为准",
          "Settled · see billing for exact credits",
        );
  }
  return Number.isFinite(actual)
    ? text(`本次消耗 ${actual} 积分`, `${actual} credits used`)
    : text("实际扣费以积分账单为准", "Actual usage follows the credit ledger");
}

export function AiAssistant({
  action,
  form,
  models,
  modelsError,
  operations,
  operationsError,
  accountBalance,
  onActionChange,
  onApply,
  onClose,
}: Props) {
  const { language: appLanguage } = useI18n();
  const text = (zh: string, en: string) => (appLanguage === "zh-CN" ? zh : en);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>("auto");
  const [targetLanguage, setTargetLanguage] =
    useState<Exclude<Language, "auto">>("en-US");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [structure, setStructure] = useState<
    "verse_chorus" | "verse_prechorus_chorus_bridge" | "freeform"
  >("verse_prechorus_chorus_bridge");
  const [rewriteStrength, setRewriteStrength] = useState<
    "light" | "balanced" | "strong"
  >("balanced");
  const [preserveSections, setPreserveSections] = useState(true);
  const [preserveRhyme, setPreserveRhyme] = useState(true);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [selectedFields, setSelectedFields] = useState<AiAppliedField[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const requestIdentityRef = useRef<RequestIdentity | null>(null);
  const open = action !== null;
  const selected = useMemo(
    () => ACTIONS.find((item) => item.value === action) ?? ACTIONS[0],
    [action],
  );
  // Authorization is deliberately matched by exact action, never by the shared operationCode.
  const operation = useMemo(
    () => operations.find((item) => item.action === action),
    [action, operations],
  );
  const enabledModels = useMemo(
    () => models.filter((model) => model.enabled),
    [models],
  );
  const preferredModelId = operation?.model || enabledModels[0]?.id || "";
  const selectedModel =
    enabledModels.find((model) => model.id === selectedModelId) ?? null;
  const modelGateReason =
    modelsError ||
    (!enabledModels.length
      ? text(
          "当前账户没有可用的 AI 辅助模型",
          "No AI assistant models are available for this account",
        )
      : null) ||
    (!selectedModel
      ? text(
          "请选择可用的 AI 辅助模型",
          "Choose an available AI assistant model",
        )
      : null);
  const gateReason =
    modelGateReason ||
    aiOperationGateReason(operation, operationsError, accountBalance);
  const previewExecutable = operation?.previewExecutable === true;
  const localDirect = operation?.localDirect === true;
  const quotedCredits = quoteIsValid(operation)
    ? operation.estimatedCredits
    : null;

  useEffect(() => {
    if (!action) return;
    setInput(sourceFor(action, form));
    setResult(null);
    setSelectedFields([]);
    setError(null);
    requestIdentityRef.current = null;
  }, [action, form]);

  useEffect(() => {
    if (!action || !enabledModels.length) return;
    setSelectedModelId((current) =>
      enabledModels.some((model) => model.id === current)
        ? current
        : enabledModels.some((model) => model.id === preferredModelId)
          ? preferredModelId
          : enabledModels[0].id,
    );
  }, [action, enabledModels, preferredModelId]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      requestAnimationFrame(
        () => previousFocus?.isConnected && previousFocus.focus(),
      );
    };
  }, [open]);

  useEffect(() => {
    if (!action) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = focusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
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
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [action, busy, onClose]);

  if (!action) return null;

  const fields = result ? suggestionFields(result) : [];

  const resetRequestIdentity = () => {
    requestIdentityRef.current = null;
    setResult(null);
    setSelectedFields([]);
    setError(null);
  };

  const generate = async () => {
    const source = input.trim();
    const unavailable = aiOperationGateReason(
      operation,
      operationsError,
      accountBalance,
    );
    if (!source || unavailable || busy) return;
    const options: AiAssistInput["options"] =
      action === "lyrics.generate"
        ? { length, structure }
        : action === "lyrics.continue"
          ? { length, preserveSections }
          : action === "lyrics.rewrite"
            ? { rewriteStrength, preserveSections, preserveRhyme }
            : action === "lyrics.translate"
              ? { preserveSections, preserveRhyme }
              : action === "prompt.optimize"
                ? { length }
                : undefined;
    const payload: AiAssistInput = {
      action,
      input: source,
      aiModelId: selectedModel?.id,
      targetMusicModelId: form.model,
      context: {
        title: form.title || undefined,
        style: form.style || undefined,
        language,
        targetLanguage:
          action === "lyrics.translate" ? targetLanguage : undefined,
      },
      ...(options ? { options } : {}),
    };
    const fingerprint = JSON.stringify(payload);
    const identity =
      requestIdentityRef.current?.fingerprint === fingerprint
        ? requestIdentityRef.current
        : { fingerprint, key: createIdempotencyKey(`ai-${action}`) };
    requestIdentityRef.current = identity;
    setBusy(true);
    setError(null);
    setResult(null);
    setSelectedFields([]);
    try {
      const generated = await api.aiAssist(payload, identity.key);
      setResult(generated);
      setSelectedFields(suggestionFields(generated).map(({ field }) => field));
    } catch (cause) {
      // A transient 5xx can mean the server committed the request but the
      // response was lost. Keep its idempotency key for a safe retry; a
      // definitive client/auth/policy error gets a fresh key instead.
      if (!(cause instanceof ApiError && cause.status >= 500))
        requestIdentityRef.current = null;
      setError(
        `${text("AI 请求失败，未生成或应用任何示例内容，请重试。", "AI request failed; nothing was generated or applied. Try again. ")}${(cause as Error).message ? `(${(cause as Error).message})` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result || busy || !selectedFields.length) return;
    setBusy(true);
    setError(null);
    try {
      const kind = result.action.startsWith("lyrics.")
        ? "lyrics"
        : result.action === "title.suggest"
          ? "title"
          : result.action === "style.suggest"
            ? "style"
            : "prompt";
      await api.acceptAiAssist(result.id, {
        kind,
        title:
          form.title ||
          result.title ||
          text("AI 创作版本", "AI creation version"),
        appliedFields: selectedFields,
      });
      onApply({ ...result, appliedFields: selectedFields });
    } catch (cause) {
      setError(
        `${text("建议版本保存失败，尚未覆盖当前内容，请重试。", "Failed to save the suggestion; current content is unchanged. Try again.")} (${(cause as Error).message})`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        aria-describedby="ai-assistant-description"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="feature-icon !h-9 !w-9 shrink-0">
              <Sparkle width={17} height={17} />
            </span>
            <div className="min-w-0">
              <h2
                id="ai-assistant-title"
                className="text-base font-semibold text-main"
              >
                {text("AI 创作伙伴", "AI creative partner")}
              </h2>
              <p
                id="ai-assistant-description"
                className="mt-1 text-[11px] text-muted"
              >
                {text(
                  "建议不会覆盖原文，确认后才会应用",
                  "Suggestions never overwrite the original until you confirm.",
                )}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-btn shrink-0"
            disabled={busy}
            onClick={onClose}
            aria-label={
              busy
                ? text(
                    "AI 请求处理中，暂时无法关闭",
                    "AI request in progress; cannot close",
                  )
                : text("关闭 AI 创作伙伴", "Close AI creative partner")
            }
          >
            <X width={18} height={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[180px_minmax(0,1fr)]">
          <nav
            className="border-b border-[var(--line)] bg-[var(--surface-2)] p-3 md:border-b-0 md:border-r"
            aria-label={text("AI 能力", "AI capabilities")}
          >
            <div className="grid grid-cols-4 gap-1 md:block md:space-y-1">
              {ACTIONS.map(({ value, short, label, Icon }) => {
                const profile = operations.find(
                  (item) => item.action === value,
                );
                const credits = quoteIsValid(profile)
                  ? profile.estimatedCredits
                  : null;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    onClick={() => onActionChange(value)}
                    aria-current={action === value ? "page" : undefined}
                    className={`ai-action-item ${action === value ? "active" : ""}`}
                    title={`${appLanguage === "zh-CN" ? label : ACTION_LABEL_EN[value]} · ${credits === null ? text("动态估价不可用", "Dynamic quote unavailable") : `${credits} ${text("积分", "credits")}`}`}
                  >
                    <Icon width={14} height={14} />
                    <span>
                      {appLanguage === "zh-CN" ? short : ACTION_SHORT_EN[value]}
                    </span>
                    <small className="hidden md:inline">{credits ?? "—"}</small>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 hidden rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-3 text-[10px] leading-4 text-muted md:block">
              <History width={13} height={13} className="mb-2" />
              {text(
                "所有建议会保存为独立版本，方便回看与恢复。",
                "Every suggestion is saved as a separate version for review and restore.",
              )}
            </div>
          </nav>

          <div className="min-h-0 overflow-y-auto p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-main">
                  {appLanguage === "zh-CN"
                    ? selected.label
                    : ACTION_LABEL_EN[selected.value]}
                </h3>
                <p className="mt-1 text-[11px] text-muted">
                  {localDirect
                    ? text(
                        "本地直连 ModelCross · 不经过积分账单",
                        "Direct local ModelCross · outside the credit ledger",
                      )
                    : quotedCredits === null
                    ? text("动态估价不可用", "Dynamic quote unavailable")
                    : `${text("预计消耗", "Estimated")} ${quotedCredits} ${text("积分 · 生成前不会扣费", "credits · charged after generation")}`}
                </p>
              </div>
              <span className="status-chip">
                <Sparkle width={11} height={11} />{" "}
                {text("结构化输出", "Structured output")}
              </span>
            </div>

            {localDirect && !gateReason && (
              <div
                className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[10px] leading-5 text-amber-200"
                role="status"
              >
                {text(
                  "本地直连 ModelCross，使用服务端配置的 gpt-6-astra；不会经过 MuseFlow Work Billing。",
                  "Direct local ModelCross mode uses the server-configured gpt-6-astra and bypasses MuseFlow Work Billing.",
                )}
              </div>
            )}
            {previewExecutable && !localDirect && !gateReason && (
              <div
                className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-[10px] leading-5 text-sky-200"
                role="status"
              >
                {text(
                  "本地开发预览，不调用真实 AI、不扣积分。此模式只在服务端明确授权时开放。",
                  "Local preview: no real AI call and no credits charged. Available only when explicitly authorized by the server.",
                )}
              </div>
            )}
            {gateReason && (
              <div
                className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[10px] leading-5 text-amber-200"
                role="alert"
              >
                {text("当前不可执行：", "Unavailable: ")}
                {localizeCatalogText(gateReason, appLanguage)}
                {operation?.reason && gateReason !== operation.reason
                  ? `${text("。服务端说明：", ". Server note: ")}${localizeCatalogText(operation.reason, appLanguage)}`
                  : ""}
              </div>
            )}

            <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <label
                className="block text-[10px] font-semibold text-muted"
                htmlFor="ai-model"
              >
                {text("辅助大模型", "Assistant model")}
              </label>
              <select
                id="ai-model"
                className="field mt-1"
                value={selectedModelId}
                disabled={busy || !enabledModels.length}
                onChange={(event) => {
                  setSelectedModelId(event.target.value);
                  resetRequestIdentity();
                }}
              >
                {!enabledModels.length && (
                  <option value="">
                    {text("暂无可用模型", "No models available")}
                  </option>
                )}
                {enabledModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} · {model.provider}
                    {model.badge
                      ? ` · ${localizeCatalogText(model.badge, appLanguage)}`
                      : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[10px] leading-4 text-muted">
                {selectedModel
                  ? localizeCatalogText(selectedModel.description, appLanguage)
                  : text(
                      "用于歌词、标题、风格和 Prompt 辅助；最终歌曲仍由创作页选择的 Suno 模型生成。",
                      "Used for lyrics, titles, styles and prompts; the final song is still generated by the Suno model selected on the workbench.",
                    )}
              </p>
            </div>

            <div
              className={`mb-4 grid gap-3 ${action === "lyrics.translate" ? "sm:grid-cols-2" : ""}`}
            >
              <label
                className="block text-[10px] font-semibold text-muted"
                htmlFor="ai-language"
              >
                {text("原文语言", "Source language")}
                <select
                  id="ai-language"
                  className="field mt-1"
                  value={language}
                  disabled={busy}
                  onChange={(event) => {
                    setLanguage(event.target.value as Language);
                    resetRequestIdentity();
                  }}
                >
                  {LANGUAGES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {appLanguage === "zh-CN"
                        ? label
                        : LANGUAGE_LABELS_EN[value]}
                    </option>
                  ))}
                </select>
              </label>
              {action === "lyrics.translate" && (
                <label
                  className="block text-[10px] font-semibold text-muted"
                  htmlFor="ai-target-language"
                >
                  {text("目标语言", "Target language")}
                  <select
                    id="ai-target-language"
                    className="field mt-1"
                    value={targetLanguage}
                    disabled={busy}
                    onChange={(event) => {
                      setTargetLanguage(
                        event.target.value as Exclude<Language, "auto">,
                      );
                      resetRequestIdentity();
                    }}
                  >
                    {LANGUAGES.filter(([value]) => value !== "auto").map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {appLanguage === "zh-CN"
                            ? label
                            : LANGUAGE_LABELS_EN[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}
            </div>

            {["lyrics.generate", "lyrics.continue", "prompt.optimize"].includes(
              action,
            ) && (
              <div
                className={`mb-4 grid gap-3 ${action === "lyrics.generate" ? "sm:grid-cols-2" : ""}`}
              >
                <label
                  className="block text-[10px] font-semibold text-muted"
                  htmlFor="ai-length"
                >
                  {action === "prompt.optimize"
                    ? text("描述长度", "Description length")
                    : text("歌词长度", "Lyrics length")}
                  <select
                    id="ai-length"
                    className="field mt-1"
                    value={length}
                    disabled={busy}
                    onChange={(event) => {
                      setLength(event.target.value as typeof length);
                      resetRequestIdentity();
                    }}
                  >
                    <option value="short">{text("短", "Short")}</option>
                    <option value="medium">{text("中等", "Medium")}</option>
                    <option value="long">{text("长", "Long")}</option>
                  </select>
                </label>
                {action === "lyrics.generate" && (
                  <label
                    className="block text-[10px] font-semibold text-muted"
                    htmlFor="ai-structure"
                  >
                    {text("歌曲结构", "Song structure")}
                    <select
                      id="ai-structure"
                      className="field mt-1"
                      value={structure}
                      disabled={busy}
                      onChange={(event) => {
                        setStructure(event.target.value as typeof structure);
                        resetRequestIdentity();
                      }}
                    >
                      <option value="verse_chorus">
                        {text("主歌 + 副歌", "Verse + chorus")}
                      </option>
                      <option value="verse_prechorus_chorus_bridge">
                        {text(
                          "主歌 + 预副歌 + 副歌 + 桥段",
                          "Verse + pre-chorus + chorus + bridge",
                        )}
                      </option>
                      <option value="freeform">
                        {text("自由结构", "Free form")}
                      </option>
                    </select>
                  </label>
                )}
              </div>
            )}

            {action.startsWith("lyrics.") && action !== "lyrics.generate" && (
              <fieldset
                className="mb-4 rounded-xl border border-[var(--line)] p-3"
                disabled={busy}
              >
                <legend className="px-1 text-[10px] font-semibold text-muted">
                  {text("处理参数", "Processing options")}
                </legend>
                {action === "lyrics.rewrite" && (
                  <label
                    className="block text-[10px] font-semibold text-muted"
                    htmlFor="ai-rewrite-strength"
                  >
                    {text("改写强度", "Rewrite strength")}
                    <select
                      id="ai-rewrite-strength"
                      className="field mt-1"
                      value={rewriteStrength}
                      onChange={(event) => {
                        setRewriteStrength(
                          event.target.value as typeof rewriteStrength,
                        );
                        resetRequestIdentity();
                      }}
                    >
                      <option value="light">{text("轻度", "Light")}</option>
                      <option value="balanced">
                        {text("平衡", "Balanced")}
                      </option>
                      <option value="strong">{text("深度", "Strong")}</option>
                    </select>
                  </label>
                )}
                <div
                  className={`${action === "lyrics.rewrite" ? "mt-3 " : ""}flex flex-wrap gap-4 text-[10px] text-muted`}
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={preserveSections}
                      onChange={(event) => {
                        setPreserveSections(event.target.checked);
                        resetRequestIdentity();
                      }}
                    />
                    {text("保留段落结构", "Preserve sections")}
                  </label>
                  {action !== "lyrics.continue" && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preserveRhyme}
                        onChange={(event) => {
                          setPreserveRhyme(event.target.checked);
                          resetRequestIdentity();
                        }}
                      />
                      {text("尽量保留押韵", "Preserve rhyme where possible")}
                    </label>
                  )}
                </div>
              </fieldset>
            )}

            <label className="parameter-label" htmlFor="ai-source">
              {text("原始内容 / 创作要求", "Source content / creative brief")}
            </label>
            <textarea
              id="ai-source"
              className="field min-h-36 resize-y text-xs leading-6"
              value={input}
              disabled={busy}
              onChange={(event) => {
                setInput(event.target.value);
                resetRequestIdentity();
              }}
              placeholder={
                action === "lyrics.generate"
                  ? text(
                      "写给谁？描述主题、色彩、场景、声音与希望表达的情绪……",
                      "Who is it for? Describe the theme, colors, setting, sound and emotion…",
                    )
                  : text(
                      "输入需要处理的歌词或描述……",
                      "Enter lyrics or a description to process…",
                    )
              }
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[10px] text-muted">
                {accountBalance === null
                  ? text("可用余额加载中", "Available balance is loading")
                  : `${text("可用余额", "Available balance")} ${accountBalance} ${text("积分", "credits")}`}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !input.trim() || Boolean(gateReason)}
                onClick={() => void generate()}
              >
                {busy ? (
                  <Spinner width={15} height={15} />
                ) : (
                  <Sparkle width={15} height={15} />
                )}
                {busy
                  ? text("正在创作…", "Creating…")
                  : text("生成建议", "Generate suggestion")}
              </button>
            </div>

            {error && (
              <div
                className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[10px] leading-5 text-amber-200"
                role="alert"
              >
                {error}
              </div>
            )}
            {result && (
              <section
                className="mt-5 animate-enter"
                aria-labelledby="suggestion-title"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 id="suggestion-title" className="parameter-label !mb-0">
                    {text("建议版本", "Suggested version")}
                  </h3>
                  <span className="text-[10px] text-muted">
                    {result.model ? `${result.model} · ` : ""}
                    {billingLabel(result, appLanguage)}
                  </span>
                </div>
                <div className="suggestion-card">
                  <div className="mb-3 flex items-start gap-2 border-b border-[var(--line)] pb-3 text-[11px] text-muted">
                    <Wand
                      width={14}
                      height={14}
                      className="mt-0.5 shrink-0 text-accent-soft"
                    />
                    <span>{result.summary}</span>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="sr-only">
                      {text(
                        "选择要应用的 AI 建议字段",
                        "Choose AI suggestion fields to apply",
                      )}
                    </legend>
                    {fields.map(({ field, value }) => (
                      <label
                        key={field}
                        className={`block rounded-xl border p-3 transition ${selectedFields.includes(field) ? "border-accent/30 bg-accent/[0.06]" : "border-[var(--line)] bg-[var(--surface-2)] opacity-70"}`}
                      >
                        <span className="flex items-center gap-2 text-[11px] font-semibold text-main">
                          <input
                            type="checkbox"
                            checked={selectedFields.includes(field)}
                            disabled={busy}
                            onChange={(event) =>
                              setSelectedFields((current) =>
                                event.target.checked
                                  ? [...current, field]
                                  : current.filter((value) => value !== field),
                              )
                            }
                          />
                          {text("应用", "Apply ")}
                          {appLanguage === "zh-CN"
                            ? FIELD_LABELS[field]
                            : FIELD_LABELS_EN[field]}
                        </span>
                        <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs font-normal leading-6 text-main">
                          {value}
                        </pre>
                        {field === "style" && (
                          <span className="mt-1 block text-[9px] font-normal text-muted">
                            {text(
                              "应用风格后将切换到自定义模式",
                              "Applying the style switches to custom mode",
                            )}
                          </span>
                        )}
                        {field === "prompt" && (
                          <span className="mt-1 block text-[9px] font-normal text-muted">
                            {text(
                              "应用歌曲描述后将切换到灵感模式",
                              "Applying the description switches to inspiration mode",
                            )}
                          </span>
                        )}
                      </label>
                    ))}
                  </fieldset>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`text-[10px] ${selectedFields.length ? "text-muted" : "text-amber-300"}`}
                  >
                    {selectedFields.length
                      ? text(
                          "只会应用已勾选字段，原文仍保留在历史版本中",
                          "Only checked fields will be applied; the original remains in history",
                        )
                      : text(
                          "至少选择一个要应用的字段",
                          "Select at least one field to apply",
                        )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost border !border-[var(--line)]"
                      disabled={busy}
                      onClick={() => {
                        setResult(null);
                        setSelectedFields([]);
                      }}
                    >
                      {text("放弃", "Discard")}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || !selectedFields.length}
                      onClick={() => void apply()}
                    >
                      {busy ? (
                        <Spinner width={15} height={15} />
                      ) : (
                        <Check width={15} height={15} />
                      )}{" "}
                      {busy
                        ? text("正在保存…", "Saving…")
                        : text(
                            "应用所选建议",
                            "Apply selected suggestions",
                          )}{" "}
                      <ArrowRight width={13} height={13} />
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
