import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { findOperation, operationHasQuote } from "../lib/operations";
import {
  operationLabel,
  type AiModelProfile,
  type Health,
  type MusicModelProfile,
  type MusicOperationProfile,
  type ProviderPointsDiagnostics,
  type Settings,
} from "../types";
import { localizeCatalogText, useI18n } from "../i18n";
import {
  Alert,
  Check,
  External,
  History,
  Lock,
  Refresh,
  Shield,
  Sparkle,
  Spinner,
} from "./Icons";

interface PlatformState {
  settings: Settings;
  health: Health;
  models: MusicModelProfile[];
  aiModels: AiModelProfile[];
  operations: MusicOperationProfile[];
  loaded: {
    settings: boolean;
    health: boolean;
    models: boolean;
    aiModels: boolean;
    operations: boolean;
  };
}

const unavailableSettings: Settings = {
  apiBaseUrl: "",
  apiKeySet: false,
  source: { apiBaseUrl: "none", apiKey: "none" },
  locked: { apiBaseUrl: true, apiKey: true },
  platformManaged: true,
  managedBy: "deployment",
  providerConfigured: false,
  adminUrl: null,
};

const unavailableHealth: Health = {
  provider: "ModelCross",
  configured: false,
  upstreamReachable: false,
  ready: false,
  active: 0,
  queued: 0,
  balance: null,
  models: [],
};

export function SettingsPanel({
  onSaved,
  isAdmin = false,
}: {
  onSaved: () => void;
  isAdmin?: boolean;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [state, setState] = useState<PlatformState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerPoints, setProviderPoints] =
    useState<ProviderPointsDiagnostics | null>(null);
  const [providerPointsBusy, setProviderPointsBusy] = useState(false);
  const [providerPointsError, setProviderPointsError] = useState<string | null>(
    null,
  );
  const [providerPointsPage, setProviderPointsPage] = useState(1);
  const [providerPointsPageSize, setProviderPointsPageSize] = useState(20);

  const load = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        api.settings(),
        api.health(),
        api.models(),
        api.aiModels(),
        api.musicOperations(),
      ]);
      const [
        settingsResult,
        healthResult,
        modelsResult,
        aiModelsResult,
        operationsResult,
      ] = results;
      const unavailable: string[] = [];
      if (settingsResult.status === "rejected")
        unavailable.push(text("平台设置", "platform settings"));
      if (healthResult.status === "rejected")
        unavailable.push(text("连接健康状态", "connection health"));
      if (modelsResult.status === "rejected")
        unavailable.push(text("模型目录", "model catalog"));
      if (aiModelsResult.status === "rejected")
        unavailable.push(text("AI 辅助模型目录", "AI assistant model catalog"));
      if (operationsResult.status === "rejected")
        unavailable.push(
          text("动作与价格目录", "operation and pricing catalog"),
        );

      setState({
        settings:
          settingsResult.status === "fulfilled"
            ? settingsResult.value
            : unavailableSettings,
        health:
          healthResult.status === "fulfilled"
            ? healthResult.value
            : unavailableHealth,
        // An empty or failed catalogue must stay empty. Falling back to demo models would make
        // unavailable capabilities look authorized and could lead users to submit invalid jobs.
        models: modelsResult.status === "fulfilled" ? modelsResult.value : [],
        aiModels:
          aiModelsResult.status === "fulfilled" ? aiModelsResult.value : [],
        operations:
          operationsResult.status === "fulfilled" ? operationsResult.value : [],
        loaded: {
          settings: settingsResult.status === "fulfilled",
          health: healthResult.status === "fulfilled",
          models: modelsResult.status === "fulfilled",
          aiModels: aiModelsResult.status === "fulfilled",
          operations: operationsResult.status === "fulfilled",
        },
      });

      if (unavailable.length) {
        setError(
          `${unavailable.join(language === "zh-CN" ? "、" : ", ")}${text("暂时无法读取；页面未使用演示数据，请稍后重试。", " could not be read. Demo data was not used; try again later.")}`,
        );
        return false;
      }
      return true;
    } catch {
      setError(
        text(
          "暂时无法读取平台连接状态，请稍后重试。",
          "Unable to read platform connection state. Try again later.",
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadProviderPoints = useCallback(
    async (page: number, pageSize: number): Promise<boolean> => {
      if (!isAdmin) return true;
      const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
      const safePageSize =
        Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100
          ? pageSize
          : 20;
      setProviderPointsBusy(true);
      setProviderPointsError(null);
      try {
        const result = await api.providerPoints(safePage, safePageSize);
        setProviderPoints(result);
        setProviderPointsPage(result.logs.pagination.page || safePage);
        setProviderPointsPageSize(
          result.logs.pagination.pageSize || safePageSize,
        );
        return true;
      } catch (cause) {
        setProviderPointsError(
          cause instanceof Error
            ? cause.message
            : text(
                "Provider points 暂时无法读取",
                "Provider points are unavailable",
              ),
        );
        return false;
      } finally {
        setProviderPointsBusy(false);
      }
    },
    [isAdmin],
  );

  useEffect(() => {
    void load();
    if (isAdmin) void loadProviderPoints(1, 20);
  }, [isAdmin, load, loadProviderPoints]);

  if (!state) {
    if (error && !busy) {
      return (
        <div
          className="flex h-64 flex-col items-center justify-center gap-4 text-center"
          role="alert"
        >
          <div className="flex items-center gap-2 text-sm text-main">
            <Alert width={16} height={16} className="text-amber-500" /> {error}
          </div>
          <button
            type="button"
            className="btn-ghost border !border-[var(--line)] text-xs"
            onClick={() => void load()}
          >
            <Refresh width={14} height={14} /> {text("重试", "Retry")}
          </button>
        </div>
      );
    }
    return (
      <div
        className="flex h-64 items-center justify-center gap-2 text-sm text-muted"
        role="status"
      >
        <Spinner width={16} height={16} />{" "}
        {text("正在读取平台能力…", "Reading platform capabilities…")}
      </div>
    );
  }

  const { settings, health, models, aiModels, operations, loaded } = state;
  const generationOperation = findOperation(operations, "generate");
  const generationPrice = operationHasQuote(generationOperation)
    ? Number(generationOperation?.estimatedCredits)
    : null;
  const ready =
    loaded.health &&
    health.configured &&
    health.upstreamReachable &&
    health.ready;
  const refresh = async () => {
    const [coreOk] = await Promise.all([
      load(),
      isAdmin
        ? loadProviderPoints(providerPointsPage, providerPointsPageSize)
        : Promise.resolve(true),
    ]);
    if (coreOk) onSaved();
  };

  return (
    <div className="w-full space-y-5">
      <section className="surface-card overflow-hidden">
        <div className="relative border-b border-[var(--line)] px-5 py-5 md:px-6">
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="feature-icon">
                <Shield width={20} height={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-main">
                    {text(
                      "ModelCross 托管的 Provider 与账户授权",
                      "ModelCross-managed Provider and account access",
                    )}
                  </h2>
                  <span className="status-chip border-accent/20 bg-accent/[0.09] !text-main">
                    <Lock width={10} height={10} /> {text("只读", "Read only")}
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted">
                  {text(
                    "永久 Provider 凭证、Base URL 与上游路由仅保存在 ModelCross 控制面；MuseFlow 服务端通过短期、限作用域 task token 调用网关。ModelCross 同时提供登录身份、钱包、模型授权、报价与结算，浏览器不会接触任何 Provider 凭证。",
                    "Permanent Provider credentials, Base URLs and upstream routes stay in the ModelCross control plane. The MuseFlow server uses short-lived, scoped task tokens; the browser never sees Provider credentials. ModelCross also supplies identity, wallet, model access, quotes and settlement.",
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost border !border-[var(--line)] text-xs"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {busy ? (
                <Spinner width={14} height={14} />
              ) : (
                <Refresh width={14} height={14} />
              )}{" "}
              {text("刷新状态", "Refresh status")}
            </button>
          </div>
        </div>

        <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
          <StatusBlock
            label="ModelCross"
            value={
              !loaded.settings
                ? text("状态暂不可用", "Unavailable")
                : settings.platformManaged === false
                  ? text("兼容模式", "Compatibility mode")
                  : text("授权已托管", "Access managed")
            }
            ready={loaded.settings}
            icon={Shield}
            detail={text(
              "身份、钱包、模型授权与价格",
              "Identity, wallet, model access and pricing",
            )}
          />
          <StatusBlock
            label={text("ModelCross 音乐网关", "ModelCross music gateway")}
            value={
              !loaded.health
                ? text("状态暂不可用", "Unavailable")
                : ready
                  ? text("连接正常", "Connected")
                  : health.configured
                    ? text("暂不可用", "Unavailable")
                    : text("尚未配置", "Not configured")
            }
            ready={ready}
            icon={Sparkle}
            detail={`${health.provider || "Music Provider"} · short-lived task token · ${health.active} ${text("进行中", "active")}`}
          />
          <StatusBlock
            label={text("当前授权模型", "Authorized models")}
            value={
              !loaded.models
                ? text("目录暂不可用", "Catalog unavailable")
                : `${models.filter((model) => model.enabled).length} ${text("个可用", "available")}`
            }
            ready={loaded.models && models.some((model) => model.enabled)}
            icon={Check}
            detail={text(
              "按账户分组动态下发",
              "Assigned dynamically by account group",
            )}
          />
          <StatusBlock
            label={text("AI 辅助模型", "AI assistant models")}
            value={
              !loaded.aiModels
                ? text("目录暂不可用", "Catalog unavailable")
                : `${aiModels.filter((model) => model.enabled).length} ${text("个可用", "available")}`
            }
            ready={loaded.aiModels && aiModels.some((model) => model.enabled)}
            icon={Sparkle}
            detail={text(
              "歌词、标题、风格与 Prompt",
              "Lyrics, titles, styles and prompts",
            )}
          />
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-main">
              {text("AI 创作辅助模型", "AI creative assistant models")}
            </h2>
            <p className="mt-1 text-[10px] text-muted">
              {text(
                "辅助生成歌词、标题、风格和 Prompt，不替代上方的 Suno 音乐模型",
                "Generate lyrics, titles, styles and prompts without replacing the Suno model above",
              )}
            </p>
          </div>
          <span className="status-chip">
            {text("按账户授权", "Account-authorized")}
          </span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {aiModels.map((model) => (
            <article
              key={model.id}
              className={`rounded-xl border p-4 ${model.enabled ? "border-accent/20 bg-accent/[0.05]" : "border-[var(--line)] bg-[var(--surface-2)] opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-main">
                    {model.displayName}
                  </h3>
                  <p className="mt-1 text-[9px] text-muted">
                    {model.provider} · {model.id}
                  </p>
                </div>
                {model.badge && (
                  <span className="status-chip">
                    {localizeCatalogText(model.badge, language)}
                  </span>
                )}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-muted">
                {localizeCatalogText(model.description, language)}
              </p>
              <div
                className={`mt-3 text-[9px] font-semibold ${model.enabled ? "text-emerald-300" : "text-amber-300"}`}
              >
                {model.enabled
                  ? text("当前可用", "Available")
                  : model.reason || text("当前不可用", "Unavailable")}
              </div>
            </article>
          ))}
          {!aiModels.length && (
            <div className="col-span-full flex min-h-24 items-center justify-center text-center text-xs text-muted">
              {loaded.aiModels
                ? text(
                    "当前账户没有配置 AI 辅助模型。",
                    "No AI assistant models are configured for this account.",
                  )
                : text(
                    "AI 辅助模型目录暂时无法读取，请重试。",
                    "The AI assistant model catalog is unavailable. Try again.",
                  )}
            </div>
          )}
        </div>
      </section>

      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-main"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="rounded-lg border border-amber-500/30 px-2.5 py-1 font-semibold text-main transition hover:bg-amber-400/10"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? text("重试中…", "Retrying…") : text("重试", "Retry")}
          </button>
        </div>
      )}
      {health.error && !ready && (
        <div
          className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-[11px] leading-5 text-main"
          role="status"
        >
          <Alert
            width={14}
            height={14}
            className="mt-0.5 shrink-0 text-rose-500"
          />
          <span>{health.error}</span>
        </div>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-main">
              {text("音乐模型能力目录", "Music model capabilities")}
            </h2>
            <p className="mt-1 text-[10px] text-muted">
              {text(
                "只展示当前账户有权使用的模型、操作与预计积分",
                "Only models, operations and estimates available to this account are shown",
              )}
            </p>
          </div>
          <span className="status-chip">
            {text("服务端实时配置", "Server-configured")}
          </span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {models
            .filter((model) => model.enabled)
            .map((model) => (
              <article
                key={model.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent/[0.07] text-accent-soft">
                  <Sparkle width={17} height={17} />
                </span>
                <div className="min-w-48 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-main">
                      {model.displayName}
                    </h3>
                    {model.badge && (
                      <span className="status-chip border-accent/20 bg-accent/[0.09] !text-main">
                        {localizeCatalogText(model.badge, language)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-muted">
                    {localizeCatalogText(model.description, language)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {model.capabilities.operations.map((operation) => (
                    <span
                      key={operation}
                      className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-[9px] text-muted"
                    >
                      {operationLabel(operation)}
                    </span>
                  ))}
                </div>
                <div className="min-w-28 text-right">
                  {loaded.operations &&
                  generationPrice !== null &&
                  (!generationOperation?.modelIds?.length ||
                    generationOperation.modelIds.includes(model.id)) ? (
                    <>
                      <strong className="text-sm text-main">
                        {generationPrice}
                      </strong>
                      <span className="ml-1 text-[10px] text-muted">
                        {text("积分 / 双版本", "credits / two versions")}
                      </span>
                    </>
                  ) : (
                    <strong className="text-[10px] text-amber-300">
                      {text("动态估价不可用", "Dynamic quote unavailable")}
                    </strong>
                  )}
                </div>
              </article>
            ))}
          {!models.some((model) => model.enabled) && (
            <div className="flex min-h-28 items-center justify-center px-5 py-8 text-center text-xs text-muted">
              {loaded.models
                ? text(
                    "当前账户没有可用的音乐模型，请联系管理员检查用户组授权。",
                    "No music models are available for this account. Ask an administrator to check group access.",
                  )
                : text(
                    "模型目录暂时无法读取，请重试。",
                    "The model catalog is unavailable. Try again.",
                  )}
            </div>
          )}
        </div>
      </section>

      {isAdmin && (
        <ProviderPointsPanel
          diagnostics={providerPoints}
          busy={providerPointsBusy}
          error={providerPointsError}
          page={providerPointsPage}
          pageSize={providerPointsPageSize}
          onPageChange={setProviderPointsPage}
          onPageSizeChange={setProviderPointsPageSize}
          onLoad={() =>
            void loadProviderPoints(providerPointsPage, providerPointsPageSize)
          }
        />
      )}

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
          <div className="flex gap-3">
            <Shield
              width={17}
              height={17}
              className="mt-0.5 shrink-0 text-emerald-300"
            />
            <div>
              <h3 className="text-xs font-semibold text-main">
                {text(
                  "Provider、授权与定价边界",
                  "Provider, access and pricing boundary",
                )}
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                {text(
                  "永久 Provider 凭证和上游路由仅存在于 ModelCross 控制面；MuseFlow 使用短期且限定操作、模型与资源范围的 task token。浏览器只提交动作参数，不能指定 Provider、凭证、价格或扣费金额。",
                  "Permanent Provider credentials and upstream routes exist only in the ModelCross control plane. MuseFlow uses short-lived task tokens scoped to operations, models and resources; the browser submits action parameters only.",
                )}
              </p>
            </div>
          </div>
        </div>
        {settings.adminUrl ? (
          <a
            className="btn-ghost h-full min-h-20 border !border-[var(--line)] px-5"
            href={settings.adminUrl}
            target="_blank"
            rel="noreferrer"
          >
            <External width={15} height={15} />{" "}
            {text("打开 ModelCross 管理后台", "Open ModelCross admin")}
          </a>
        ) : (
          <div className="flex min-h-20 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-5 text-[10px] text-muted">
            <Lock width={13} height={13} />{" "}
            {text("管理入口仅对管理员开放", "Admin access only")}
          </div>
        )}
      </section>
    </div>
  );
}

function ProviderPointsPanel({
  diagnostics,
  busy,
  error,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onLoad,
}: {
  diagnostics: ProviderPointsDiagnostics | null;
  busy: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  onLoad: () => void;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const pagination = diagnostics?.logs.pagination;
  return (
    <section
      className="surface-card overflow-hidden"
      aria-labelledby="provider-points-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="provider-points-title"
              className="text-sm font-semibold text-main"
            >
              {text(
                "Provider 商户 points 诊断",
                "Provider merchant points diagnostics",
              )}
            </h2>
            <span className="status-chip border-amber-400/20 bg-amber-400/[0.08] !text-amber-200">
              <Lock width={10} height={10} />{" "}
              {text("管理员只读", "Admin read-only")}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-muted">
            {text(
              "这里读取部署侧 MXAPI 商户成本（/api/v2/points/balance 与 /api/v2/points/logs），不是当前用户的 ModelCross 钱包，不参与报价、预留或扣费。",
              "Reads deployment-side MXAPI merchant costs (/api/v2/points/balance and /api/v2/points/logs), not the current user’s ModelCross wallet; it does not affect quotes, reservations or charges.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost border !border-[var(--line)] text-xs"
          disabled={busy}
          onClick={onLoad}
        >
          {busy ? (
            <Spinner width={13} height={13} />
          ) : (
            <Refresh width={13} height={13} />
          )}{" "}
          {text("查询流水", "Load ledger")}
        </button>
      </div>
      <div className="grid gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="parameter-label">{text("页码", "Page")}</span>
          <input
            className="field"
            type="number"
            min={1}
            step={1}
            value={page}
            onChange={(event) =>
              onPageChange(Math.max(1, Number(event.target.value) || 1))
            }
          />
        </label>
        <label className="block">
          <span className="parameter-label">
            {text("每页条数（1–100）", "Rows per page (1–100)")}
          </span>
          <input
            className="field"
            type="number"
            min={1}
            max={100}
            step={1}
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(
                Math.min(100, Math.max(1, Number(event.target.value) || 1)),
              )
            }
          />
        </label>
        <div className="rounded-xl border border-accent/15 bg-accent/[0.07] px-4 py-3">
          <span className="block text-[9px] uppercase tracking-[.12em] text-muted">
            {text("商户剩余 points", "Merchant points remaining")}
          </span>
          <strong className="mt-1 block text-xl text-main">
            {diagnostics?.balance === null || diagnostics?.balance === undefined
              ? "—"
              : diagnostics.balance.toLocaleString()}
          </strong>
        </div>
      </div>
      {error && (
        <div
          className="m-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] text-rose-300"
          role="alert"
        >
          {text(
            "读取 Provider points 失败：",
            "Failed to read Provider points: ",
          )}
          {error}
        </div>
      )}
      {busy && !diagnostics && (
        <div
          className="flex items-center justify-center gap-2 p-8 text-xs text-muted"
          role="status"
        >
          <Spinner width={14} height={14} />{" "}
          {text(
            "正在读取商户余额与流水…",
            "Reading merchant balance and ledger…",
          )}
        </div>
      )}
      {!busy && !error && diagnostics && (
        <>
          {diagnostics.logs.list.length ? (
            <div className="divide-y divide-[var(--line)]">
              {diagnostics.logs.list.map((entry, index) => (
                <div
                  key={`${index}-${String(entry.id ?? entry.created_at ?? "")}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <span className="task-icon">
                    <History width={14} height={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-xs text-main">
                      {displayPointLogLabel(entry)}
                    </strong>
                    <small className="mt-1 block truncate text-[10px] text-muted">
                      {displayPointLogTime(entry)}
                      {displayPointLogAmount(entry)
                        ? ` · ${displayPointLogAmount(entry)}`
                        : ""}
                    </small>
                  </div>
                  <span className="status-chip">
                    {String(
                      entry.status ?? entry.type ?? text("记录", "Record"),
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted">
              {text(
                "当前页暂无 Provider points 流水",
                "No Provider points entries on this page",
              )}
            </div>
          )}
          {pagination && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-5 py-3 text-[10px] text-muted">
              <span>
                {text("第", "Page ")} {pagination.page} ·{" "}
                {text("每页", "Rows ")} {pagination.pageSize} ·{" "}
                {text("共", "Total ")} {pagination.total}
              </span>
              <span>
                {text("共", "Total ")} {pagination.totalPages}{" "}
                {text("页", "pages")}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function displayPointLogLabel(entry: Record<string, unknown>): string {
  const value =
    entry.description ?? entry.operation ?? entry.action ?? entry.type;
  return typeof value === "string" && value.trim() ? value : "points 流水";
}

function displayPointLogTime(entry: Record<string, unknown>): string {
  const value =
    entry.created_at ?? entry.createdAt ?? entry.timestamp ?? entry.id;
  return value === undefined || value === null ? "时间未知" : String(value);
}

function displayPointLogAmount(entry: Record<string, unknown>): string | null {
  const value = entry.points ?? entry.amount ?? entry.change ?? entry.cost;
  if (typeof value === "number" && Number.isFinite(value))
    return `${value > 0 ? "+" : ""}${value} points`;
  if (
    typeof value === "string" &&
    value.trim() &&
    /^[-+]?\d+(?:\.\d+)?$/.test(value.trim())
  )
    return `${value} points`;
  return null;
}

function StatusBlock({
  label,
  value,
  detail,
  ready,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  ready: boolean;
  icon: typeof Shield;
}) {
  return (
    <div className="flex items-start gap-3 bg-[var(--surface-1)] p-5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ready ? "bg-emerald-400/8 text-emerald-300" : "bg-amber-400/8 text-amber-300"}`}
      >
        <Icon width={15} height={15} />
      </span>
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-muted">
          {label}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-main">
          <span
            className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          {value}
        </div>
        <p className="mt-1 text-[9px] text-muted">{detail}</p>
      </div>
    </div>
  );
}
