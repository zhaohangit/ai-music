import { mvApi } from "./mv-api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { I18nProvider, useI18n } from "./i18n";
import { DEMO_MODELS } from "./fixtures";
import { AiAssistant } from "./components/AiAssistant";
import {
  CreatePanel,
  DEFAULT_FORM,
  formFromTrack,
  ModelControlPanel,
  type FormState,
} from "./components/CreatePanel";
import {
  EMPTY_REFERENCE_AUDIO,
  type ReferenceAudioDraft,
} from "./components/ReferenceAudioPanel";
import { LandingPage } from "./components/LandingPage";
import { ExplorePage } from "./components/ExplorePage";
import { Player } from "./components/Player";
import { Search, X } from "./components/Icons";
import { MobileDock, Sidebar, type View } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { TrackDetail } from "./components/TrackDetail";
import { TrackFeed } from "./components/TrackFeed";
import {
  BillingPage,
  LyricsStudio,
  ProjectDialog,
  ProjectsPage,
  SettingsWorkspace,
  TasksPage,
} from "./components/WorkspacePages";
import type { TaskQuery } from "./components/WorkspacePages";
import { SunoContractPage } from "./components/SunoContractPage";
import { MvStudio } from "./components/MvStudio";
import { SunoToolsPage } from "./components/SunoToolsPage";
import { useHealth, useLibrary } from "./hooks/usePolling";
import {
  findOperation,
  operationGateReason,
  SOUND_MODEL_IDS,
} from "./lib/operations";
import {
  isInflight,
  isPendingGeneration,
  isPlayable,
  tracksFromGeneration,
  type AccountSummary,
  type AiAssistAction,
  type AiAssistResult,
  type AiModelProfile,
  type AiOperationProfile,
  type AssetActionInput,
  type AssetJob,
  type BillingOrder,
  type BillingSummary,
  type GenerateInput,
  type GenerationInput,
  type GenerationResult,
  type MusicModelProfile,
  type MusicOperationProfile,
  type MusicProject,
  type MxapiCapabilityProfile,
  type PlatformTask,
  type ReferenceAudioActionInput,
  type SessionSummary,
  type ThemeMode,
  type Track,
  type TrackActionInput,
} from "./types";

const LEGACY_FORM_KEY = "museflow.form.v2";
const LEGACY_DRAFT_KEY = "museflow.local-draft.v1";
const FORM_KEY_PREFIX = "museflow.form.v3";
const DRAFT_KEY_PREFIX = "museflow.local-draft.v2";
const THEME_KEY = "museflow.theme.v1";
const APP_VIEWS: View[] = [
  "explore",
  "create",
  "lyrics",
  "mv",
  "projects",
  "library",
  "tasks",
  "suno-tools",
  "api-capabilities",
  "billing",
  "settings",
];
const PUBLIC_WORKSPACE_ROUTES = new Set<"home" | View>(["home", "explore"]);

const formKeyFor = (scope: string) => `${FORM_KEY_PREFIX}.${scope}`;
const draftKeyFor = (scope: string) => `${DRAFT_KEY_PREFIX}.${scope}`;

function loadForm(key: string): FormState {
  try {
    const raw = localStorage.getItem(key);
    return raw
      ? { ...DEFAULT_FORM, ...(JSON.parse(raw) as Partial<FormState>) }
      : DEFAULT_FORM;
  } catch {
    return DEFAULT_FORM;
  }
}

function loadTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system")
    return stored;
  // Match the design稿's first-run behavior: respect the operating system's
  // appearance until the user explicitly chooses a theme in the workspace.
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
  )
    return "light";
  return "dark";
}

function loadDraftSavedAt(key: string): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null") as {
      savedAt?: unknown;
    } | null;
    return typeof value?.savedAt === "string" ? value.savedAt : null;
  } catch {
    return null;
  }
}

const errorMessage = (cause: unknown) =>
  cause instanceof Error && cause.message ? cause.message : "未知错误";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "ModelCross 登录已取消，你仍可留在当前工作区。",
  login_required: "ModelCross 登录已过期，请重新登录后继续。",
  consent_required: "需要完成 ModelCross 授权后才能进入工作区。",
  interaction_required: "ModelCross 需要你完成一次交互授权。",
  temporarily_unavailable: "ModelCross 暂时不可用，请稍后重试。",
  server_error: "ModelCross 登录服务发生错误，请稍后重试。",
  invalid_request:
    "登录请求无效，请从 Gen Alloy · AI Music Studio 重新发起登录。",
  authorization_failed: "ModelCross 登录未完成，请稍后重试。",
};

function consumeAuthError(): string | null {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return null;
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const code = params.get("auth_error");
  if (!code) return null;
  params.delete("auth_error");
  const routePart = hash.slice(0, queryIndex);
  const cleanHash = `${routePart}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${cleanHash}`,
  );
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.authorization_failed;
}

function mergeTagText(current: string, suggested: string): string {
  const values = [...current.split(","), ...suggested.split(",")]
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

type ResourceKey =
  | "models"
  | "operations"
  | "aiModels"
  | "aiOperations"
  | "mxapiCapabilities"
  | "projects"
  | "tasks"
  | "billing"
  | "orders";
type ResourceErrors = Record<ResourceKey, string | null>;
type ResourceLoading = Record<ResourceKey, boolean>;
const EMPTY_ERRORS: ResourceErrors = {
  models: null,
  operations: null,
  aiModels: null,
  aiOperations: null,
  mxapiCapabilities: null,
  projects: null,
  tasks: null,
  billing: null,
  orders: null,
};
const EMPTY_LOADING: ResourceLoading = {
  models: false,
  operations: false,
  aiModels: false,
  aiOperations: false,
  mxapiCapabilities: false,
  projects: false,
  tasks: false,
  billing: false,
  orders: false,
};

function readRoute(): "home" | View {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return APP_VIEWS.includes(value as View) ? (value as View) : "home";
}

function currentReturnTo(): string {
  return (
    `${window.location.pathname}${window.location.search}${window.location.hash}` ||
    "/#/create"
  );
}

type LibraryFilter = "all" | "inflight" | "done" | "error";

function AppShell() {
  const { language, t } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [route, setRoute] = useState<"home" | View>(readRoute);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const canViewApiCapabilities = session?.user?.role === "admin";
  const loginRedirectStartedRef = useRef(false);
  const authFailureRef = useRef<string | null>(null);
  const [models, setModels] = useState<MusicModelProfile[]>([]);
  const [operations, setOperations] = useState<MusicOperationProfile[]>([]);
  const [aiModels, setAiModels] = useState<AiModelProfile[]>([]);
  const [aiOperations, setAiOperations] = useState<AiOperationProfile[]>([]);
  const [mvActiveCount, setMvActiveCount] = useState(0);
  const [mvProjectId, setMvProjectId] = useState<string | undefined>();
  const [mvTrackId, setMvTrackId] = useState<string | undefined>();
  const [mxapiCapabilities, setMxapiCapabilities] = useState<
    MxapiCapabilityProfile[]
  >([]);
  const aiModelsRequestRef = useRef(0);
  const aiOperationsRequestRef = useRef(0);
  const [projects, setProjects] = useState<MusicProject[]>([]);
  const [tasks, setTasks] = useState<PlatformTask[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [resourceErrors, setResourceErrors] =
    useState<ResourceErrors>(EMPTY_ERRORS);
  const [resourceLoading, setResourceLoading] =
    useState<ResourceLoading>(EMPTY_LOADING);
  const [taskStreamConnected, setTaskStreamConnected] = useState(false);
  const [tasksUpdatedAt, setTasksUpdatedAt] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [publicMenu, setPublicMenu] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({ ...DEFAULT_FORM }));
  const [referenceAudio, setReferenceAudio] = useState<ReferenceAudioDraft>(
    () => ({ ...EMPTY_REFERENCE_AUDIO }),
  );
  const [query, setQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<AiAssistAction | null>(null);
  const [projectDialog, setProjectDialog] = useState(false);
  const [libraryProject, setLibraryProject] = useState<MusicProject | null>(
    null,
  );
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hydratedStorageScope, setHydratedStorageScope] = useState<
    string | null
  >(null);

  const storageScope =
    session?.authenticated && session.user?.subject
      ? encodeURIComponent(session.user.subject)
      : null;

  useEffect(()=>{setMvActiveCount(0);if(!storageScope)return;let ignore=false;const load=async()=>{try{const counts=await mvApi.counts();if(!ignore)setMvActiveCount(Number.isSafeInteger(counts.active)?counts.active:0);}catch{}};void load();const timer=setInterval(()=>void load(),10000);return()=>{ignore=true;clearInterval(timer);};},[storageScope]);
  const health = useHealth();
  const {
    tracks,
    error: libraryError,
    refresh,
    setTracks,
  } = useLibrary(Boolean(session?.authenticated));

  const setResourceBusy = useCallback((key: ResourceKey, value: boolean) => {
    setResourceLoading((current) => ({ ...current, [key]: value }));
  }, []);
  const setResourceError = useCallback(
    (key: ResourceKey, value: string | null) => {
      setResourceErrors((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const loadModels = useCallback(async () => {
    setResourceBusy("models", true);
    try {
      setModels(await api.models());
      setResourceError("models", null);
    } catch (cause) {
      // Entitlements are account-scoped. Never keep a previously authorized catalog after
      // a user/session change or a failed refresh, because those models may no longer belong
      // to the current account.
      setModels([]);
      setResourceError(
        "models",
        `${text("模型目录加载失败：", "Model catalog failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      setResourceBusy("models", false);
    }
  }, [setResourceBusy, setResourceError]);

  const loadProjects = useCallback(async () => {
    setResourceBusy("projects", true);
    try {
      setProjects(await api.projects());
      setResourceError("projects", null);
    } catch (cause) {
      setResourceError(
        "projects",
        `${text("项目加载失败：", "Projects failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      setResourceBusy("projects", false);
    }
  }, [setResourceBusy, setResourceError]);

  const loadOperations = useCallback(async () => {
    setResourceBusy("operations", true);
    try {
      setOperations(await api.musicOperations());
      setResourceError("operations", null);
    } catch (cause) {
      setOperations([]);
      setResourceError(
        "operations",
        `${text("动作与价格目录加载失败：", "Operation and pricing catalog failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      setResourceBusy("operations", false);
    }
  }, [setResourceBusy, setResourceError]);

  const loadAiOperations = useCallback(async () => {
    const request = ++aiOperationsRequestRef.current;
    setResourceBusy("aiOperations", true);
    try {
      const loaded = await api.aiOperations();
      if (request !== aiOperationsRequestRef.current) return;
      setAiOperations(loaded);
      setResourceError("aiOperations", null);
    } catch (cause) {
      if (request !== aiOperationsRequestRef.current) return;
      // AI model authorization and quotes are account-scoped. A failed identity refresh must
      // never leave a previous account's executable catalog in memory.
      setAiOperations([]);
      setResourceError(
        "aiOperations",
        `${text("AI 能力与价格目录加载失败：", "AI capability and pricing catalog failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      if (request === aiOperationsRequestRef.current)
        setResourceBusy("aiOperations", false);
    }
  }, [setResourceBusy, setResourceError]);

  const loadAiModels = useCallback(async () => {
    const request = ++aiModelsRequestRef.current;
    setResourceBusy("aiModels", true);
    try {
      const loaded = await api.aiModels();
      if (request !== aiModelsRequestRef.current) return;
      setAiModels(loaded);
      setResourceError("aiModels", null);
    } catch (cause) {
      if (request !== aiModelsRequestRef.current) return;
      setAiModels([]);
      setResourceError(
        "aiModels",
        `${text("AI 模型目录加载失败：", "AI model catalog failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      if (request === aiModelsRequestRef.current)
        setResourceBusy("aiModels", false);
    }
  }, [setResourceBusy, setResourceError]);

  const loadMxapiCapabilities = useCallback(async () => {
    setResourceBusy("mxapiCapabilities", true);
    try {
      setMxapiCapabilities(await api.mxapiCapabilities());
      setResourceError("mxapiCapabilities", null);
    } catch (cause) {
      setMxapiCapabilities([]);
      setResourceError(
        "mxapiCapabilities",
        `${text("MXAPI 能力与价格目录加载失败：", "MXAPI capability and pricing catalog failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      setResourceBusy("mxapiCapabilities", false);
    }
  }, [setResourceBusy, setResourceError]);

  const loadTasks = useCallback(
    async (taskQuery: TaskQuery = {}) => {
      setResourceBusy("tasks", true);
      try {
        const loaded = await api.tasks(taskQuery);
        const scoped =
          Boolean(taskQuery.id?.trim() || taskQuery.ids?.trim()) ||
          taskQuery.page !== undefined ||
          taskQuery.size !== undefined;
        setTasks((current) => {
          // A documented ids/page/size query is an explicit view and should not be
          // polluted by a previous page.  The default live refresh keeps locally
          // accepted 202 tasks visible until PostgreSQL exposes them.
          if (scoped) return loaded;
          const acceptedButNotVisible = current.filter(
            (task) =>
              task.id.startsWith("pending:") &&
              !loaded.some((item) => item.batchId === task.batchId),
          );
          return [...acceptedButNotVisible, ...loaded];
        });
        setTasksUpdatedAt(new Date().toISOString());
        setResourceError("tasks", null);
      } catch (cause) {
        setResourceError(
          "tasks",
          `${text("任务同步失败：", "Task sync failed: ")}${errorMessage(cause)}`,
        );
      } finally {
        setResourceBusy("tasks", false);
      }
    },
    [setResourceBusy, setResourceError],
  );

  const queryTasks = useCallback(
    (taskQuery: TaskQuery) => {
      void loadTasks(taskQuery);
    },
    [loadTasks],
  );

  const loadBilling = useCallback(
    async (forceRefresh = false) => {
      setResourceBusy("billing", true);
      try {
        setBilling(await api.billingSummary(forceRefresh));
        setResourceError("billing", null);
      } catch (cause) {
        setResourceError(
          "billing",
          `${text("余额与用量加载失败：", "Balance and usage failed to load: ")}${errorMessage(cause)}`,
        );
      } finally {
        setResourceBusy("billing", false);
      }
    },
    [setResourceBusy, setResourceError],
  );

  const loadOrders = useCallback(async () => {
    setResourceBusy("orders", true);
    try {
      setOrders(await api.billingOrders());
      setResourceError("orders", null);
    } catch (cause) {
      setResourceError(
        "orders",
        `${text("订单与消费记录加载失败：", "Orders and usage records failed to load: ")}${errorMessage(cause)}`,
      );
    } finally {
      setResourceBusy("orders", false);
    }
  }, [setResourceBusy, setResourceError]);

  const refreshBilling = useCallback(async () => {
    await Promise.all([loadBilling(true), loadOrders()]);
  }, [loadBilling, loadOrders]);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const loaded = await api.session();
      const requestedRoute = readRoute();
      if (!loaded.authenticated && authFailureRef.current) {
        // An OAuth cancellation/error has already returned to the app. Keep the
        // user on a safe, actionable error surface instead of immediately
        // starting the same authorization flow again.
        loginRedirectStartedRef.current = false;
        setSession(null);
        setSessionError(authFailureRef.current);
        api.resetAuthRequired();
        return;
      }
      if (
        !loaded.authenticated &&
        !PUBLIC_WORKSPACE_ROUTES.has(requestedRoute)
      ) {
        // Drop the expired account from memory before redirecting so resource
        // polling cannot keep issuing requests with a dead session.
        setSession(loaded);
        setSessionError(null);
        if (!loginRedirectStartedRef.current) {
          loginRedirectStartedRef.current = true;
          api.replaceWithLogin(currentReturnTo());
        }
        return;
      }
      loginRedirectStartedRef.current = false;
      setSession(loaded);
      setSessionError(null);
      if (requestedRoute === "api-capabilities" && loaded.user?.role !== "admin") {
        setRoute("explore");
        window.location.hash = "/explore";
      }
      api.resetAuthRequired();
    } catch (cause) {
      setSession(null);
      setSessionError(`无法确认登录状态：${errorMessage(cause)}`);
      api.resetAuthRequired();
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      const next = readRoute();
      if (next === "api-capabilities" && !canViewApiCapabilities) {
        setRoute("explore");
        window.location.hash = "/explore";
        return;
      }
      setRoute(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [canViewApiCapabilities]);

  useEffect(() => {
    const message = consumeAuthError();
    if (message) {
      authFailureRef.current = message;
      setToast(message);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(
    () =>
      api.onAuthRequired(() => {
        if (!loginRedirectStartedRef.current) void loadSession();
      }),
    [loadSession],
  );

  useEffect(() => {
    if (!session) return;
    void loadModels();
    if (!session.authenticated) {
      aiModelsRequestRef.current += 1;
      aiOperationsRequestRef.current += 1;
      setOperations([]);
      setAiModels([]);
      setAiOperations([]);
      setMxapiCapabilities([]);
      setResourceLoading((current) => ({
        ...current,
        aiModels: false,
        aiOperations: false,
        mxapiCapabilities: false,
      }));
      setProjects([]);
      setTasks([]);
      setBilling(null);
      setOrders([]);
      setResourceErrors((current) => ({
        ...current,
        operations: null,
        aiModels: null,
        aiOperations: null,
        mxapiCapabilities: null,
        projects: null,
        tasks: null,
        billing: null,
        orders: null,
      }));
      return;
    }
    if (!canViewApiCapabilities) {
      setMxapiCapabilities([]);
      setResourceError("mxapiCapabilities", null);
      setResourceBusy("mxapiCapabilities", false);
    }
    void Promise.all([
      loadOperations(),
      loadAiModels(),
      loadAiOperations(),
      ...(canViewApiCapabilities ? [loadMxapiCapabilities()] : []),
      loadProjects(),
      loadTasks(),
      loadBilling(),
      loadOrders(),
    ]);
  }, [
    loadAiModels,
    loadAiOperations,
    loadBilling,
    loadModels,
    loadMxapiCapabilities,
    loadOperations,
    loadOrders,
    loadProjects,
    loadTasks,
    canViewApiCapabilities,
    session,
  ]);

  useEffect(() => {
    if (!session?.authenticated) return;
    const poll = window.setInterval(() => {
      void loadTasks();
    }, 10_000);
    if (typeof EventSource === "undefined")
      return () => window.clearInterval(poll);

    const source = new EventSource(api.eventsUrl);
    source.onopen = () => setTaskStreamConnected(true);
    source.onerror = () => setTaskStreamConnected(false);
    const synchronize = () => {
      void loadTasks();
      void refresh();
      void loadBilling();
      void loadOrders();
    };
    const eventNames = [
      "generation.submitted",
      "generation.succeeded",
      "generation.partial",
      "generation.failed",
      "track.completed",
      "track.failed",
      "ai.assist.completed",
      "ai.billing.captured",
      "ai.billing.released",
      "track.asset.queued",
      "track.asset.completed",
      "track.asset.failed",
    ];
    eventNames.forEach((name) => source.addEventListener(name, synchronize));
    return () => {
      window.clearInterval(poll);
      eventNames.forEach((name) =>
        source.removeEventListener(name, synchronize),
      );
      source.close();
      setTaskStreamConnected(false);
    };
  }, [loadBilling, loadOrders, loadTasks, refresh, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated) return;
    let lastRefreshAt = 0;
    const refreshAfterWalletReturn = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRefreshAt < 750) return;
      lastRefreshAt = now;
      void refreshBilling();
    };
    window.addEventListener("focus", refreshAfterWalletReturn);
    document.addEventListener("visibilitychange", refreshAfterWalletReturn);
    return () => {
      window.removeEventListener("focus", refreshAfterWalletReturn);
      document.removeEventListener(
        "visibilitychange",
        refreshAfterWalletReturn,
      );
    };
  }, [refreshBilling, session?.authenticated]);

  useEffect(() => {
    // Global draft keys cannot be attributed safely after an upgrade: assigning them to the
    // currently signed-in account could expose the previous browser user's lyrics.
    localStorage.removeItem(LEGACY_FORM_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    if (!storageScope) {
      setForm({ ...DEFAULT_FORM });
      setDraftSavedAt(null);
      setHydratedStorageScope(null);
      setMvProjectId(undefined);setMvTrackId(undefined);setAiAction(null);setProjectDialog(false);
      return;
    }
    setMvProjectId(undefined);setMvTrackId(undefined);
    setForm(loadForm(formKeyFor(storageScope)));
    setDraftSavedAt(loadDraftSavedAt(draftKeyFor(storageScope)));
    setHydratedStorageScope(storageScope);
  }, [storageScope]);
  useEffect(() => {
    if (!storageScope || hydratedStorageScope !== storageScope) return;
    localStorage.setItem(formKeyFor(storageScope), JSON.stringify(form));
  }, [form, hydratedStorageScope, storageScope]);
  // A stored default can disappear from this account's catalog. Keep every
  // consumer (generation and AI assistance) on the same authorized selection.
  useEffect(() => {
    if (!storageScope || hydratedStorageScope !== storageScope || resourceLoading.models) return;
    const usable = models.filter(model => model.enabled &&
      (form.source !== "sound" || SOUND_MODEL_IDS.includes(model.id as (typeof SOUND_MODEL_IDS)[number])));
    if (!usable.length || usable.some(model => model.id === form.model)) return;
    setForm(current => ({ ...current, model: usable[0].id,
      ...(!usable[0].capabilities.styleWeight ? { isMaxMode: false, augCreativity: undefined } : {}) }));
  }, [models, storageScope, hydratedStorageScope, resourceLoading.models, form.source, form.model]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedId && !aiAction)
        setSelectedId(null);
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = Boolean(
        target &&
          (target.matches("input, textarea, select") ||
            target.closest('[contenteditable]:not([contenteditable="false"])')),
      );
      if (
        !editing &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        setRoute("library");
        window.location.hash = "/library";
        requestAnimationFrame(() =>
          document.getElementById("library-search")?.focus(),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiAction, selectedId]);

  const currentSession = session;
  const account: AccountSummary | null =
    billing?.account ?? currentSession?.account ?? null;
  const displaySession = useMemo<SessionSummary | null>(
    () => (currentSession ? { ...currentSession, account } : null),
    [account, currentSession],
  );
  const active = useMemo(
    () => tracks.find((track) => track.id === activeId) ?? null,
    [tracks, activeId],
  );
  const selected = useMemo(
    () => tracks.find((track) => track.id === selectedId) ?? null,
    [tracks, selectedId],
  );
  const playableTracks = useMemo(() => tracks.filter(isPlayable), [tracks]);
  const inflight = useMemo(() => tracks.filter(isInflight).length, [tracks]);
  const visibleTracks = useMemo(() => {
    let list = tracks;
    if (libraryProject)
      list = list.filter((track) => track.projectId === libraryProject.id);
    if (libraryFilter === "inflight") list = list.filter(isInflight);
    else if (libraryFilter !== "all")
      list = list.filter((track) => track.status === libraryFilter);
    if (query.trim()) {
      const keyword = query.trim().toLocaleLowerCase();
      list = list.filter((track) =>
        [track.title, track.description, track.style, track.lyrics].some(
          (value) => value?.toLocaleLowerCase().includes(keyword),
        ),
      );
    }
    return list;
  }, [libraryFilter, libraryProject, query, tracks]);

  const navigate = (view: View) => {
    if (view === "api-capabilities" && !canViewApiCapabilities) {
      setToast(
        text(
          "接口能力仅对管理员开放",
          "API capabilities are available to administrators only",
        ),
      );
      return;
    }
    setRoute(view);
    window.location.hash = `/${view}`;
    setSelectedId(null);
    setMobileNav(false);
  };

  const goHome = () => {
    setRoute("home");
    window.location.hash = "";
    setSelectedId(null);
  };

  const enter = () => {
    if (currentSession?.authenticated) navigate("create");
    else window.location.assign(api.loginUrl("/#/create"));
  };

  const toggleTheme = () =>
    setTheme((current) => (current === "light" ? "dark" : "light"));

  const saveDraft = () => {
    try {
      if (!storageScope || hydratedStorageScope !== storageScope) {
        setToast(
          text(
            "登录身份尚未就绪，草稿未保存，请稍后重试",
            "Your sign-in is not ready. The draft was not saved; try again shortly.",
          ),
        );
        return;
      }
      const savedAt = new Date().toISOString();
      localStorage.setItem(formKeyFor(storageScope), JSON.stringify(form));
      localStorage.setItem(
        draftKeyFor(storageScope),
        JSON.stringify({ version: 1, savedAt, form }),
      );
      setDraftSavedAt(savedAt);
      setToast(
        text(
          "草稿已保存在此设备，不会同步到其他设备",
          "Draft saved on this device; it is not synced to other devices.",
        ),
      );
    } catch (cause) {
      setToast(
        `${text("本地草稿保存失败：", "Failed to save the local draft: ")}${errorMessage(cause)}`,
      );
    }
  };

  const openProject = (project: MusicProject) => {
    setLibraryProject(project);
    navigate("library");
    setToast(
      `${text("正在查看项目“", "Viewing tracks in “")}${project.title}${text("”的作品", "”")}`,
    );
  };

  const archiveProject = async (project: MusicProject) => {
    if (
      !window.confirm(
        `${text("确认归档项目“", "Archive project “")}${project.title}${text("”？项目内容不会被删除。", "”? Its contents will not be deleted.")}`,
      )
    )
      return;
    try {
      await api.archiveProject(project.id);
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id ? { ...item, status: "archived" } : item,
        ),
      );
      if (libraryProject?.id === project.id) setLibraryProject(null);
      setToast(
        `${text("项目“", "Project “")}${project.title}${text("”已归档", "” archived")}`,
      );
    } catch (cause) {
      setToast(
        `${text("项目归档失败：", "Failed to archive project: ")}${errorMessage(cause)}`,
      );
    }
  };

  const mergeCreated = useCallback(
    (created: Track[]) => {
      setTracks((previous) => [
        ...created,
        ...previous.filter(
          (track) => !created.some((item) => item.id === track.id),
        ),
      ]);
    },
    [setTracks],
  );

  const mergeGenerationTasks = useCallback(
    (
      result: GenerationResult,
      context: {
        title: string;
        operation: PlatformTask["operation"];
        model: string;
        estimatedCredits: number;
        outputCount?: 1 | 2;
      },
    ) => {
      const allCreated = tracksFromGeneration(result);
      // MXAPI currently submits two upstream tasks for one generate request.
      // The workbench lets the user keep one or both; hidden sibling tasks are
      // still tracked server-side for honest provider reconciliation.
      const created = context.outputCount === 1 && context.operation === "generate"
        ? allCreated.slice(0, 1)
        : allCreated;
      if (created.length) {
        mergeCreated(created);
        const createdTasks = created.map<PlatformTask>((track) => ({
          id: track.id,
          batchId: track.groupId,
          title: track.title,
          operation: track.operation,
          model: track.model,
          status: track.status === "queued" ? "queued" : "generating",
          progress: track.progress,
          estimatedCredits:
            typeof track.estimatedCredits === "number" &&
            Number.isFinite(track.estimatedCredits)
              ? track.estimatedCredits
              : context.estimatedCredits,
          chargedCredits: null,
          createdAt: track.createdAt,
          updatedAt: track.createdAt,
        }));
        setTasks((current) => [
          ...createdTasks,
          ...current.filter(
            (task) => !createdTasks.some((item) => item.id === task.id),
          ),
        ]);
      }
      if (isPendingGeneration(result)) {
        const now = new Date().toISOString();
        const pending: PlatformTask = {
          id: `pending:${result.generationId}`,
          batchId: result.generationId,
          title: context.title || text("等待任务入队", "Waiting for queue"),
          operation: context.operation,
          model: context.model,
          status: "submitting",
          progress: 0,
          estimatedCredits: context.estimatedCredits,
          chargedCredits: null,
          createdAt: now,
          updatedAt: now,
        };
        setTasks((current) => [
          pending,
          ...current.filter((task) => task.id !== pending.id),
        ]);
      }
      return created;
    },
    [mergeCreated],
  );

  const submit = useCallback(
    async (input: GenerationInput) => {
      const sound = "kind" in input && input.kind === "sound";
      const action = sound ? "sound" : "generate";
      const generateProfile = findOperation(operations, action, { maxMode: "isMaxMode" in input && input.isMaxMode === true });
      const unavailable = operationGateReason(generateProfile);
      if (unavailable) throw new Error(unavailable);
      const result = await api.generate(input);
      const estimate = Number(generateProfile?.estimatedCredits);
      const created = mergeGenerationTasks(result, {
        title:
          input.title || ("kind" in input ? input.tags : input.description),
        operation: action,
        model: input.model,
        estimatedCredits: estimate,
        outputCount: sound ? undefined : ("outputCount" in input ? input.outputCount : undefined),
      });
      const safeBilling = health?.providerDirectBilling ? text("按 API 账户实际计费", "Billed to API account") : health?.billingLive
        ? text(
            "积分预留与结算由服务端幂等处理",
            "Credits are reserved and settled idempotently by the server.",
          )
        : text(
            "安全预览，不会实扣积分",
            "Safe preview; no credits are charged.",
          );
      const subject = sound
        ? text("音效", "sound effects")
        : text("创作", "creation");
      setToast(
        isPendingGeneration(result) || created.length === 0
          ? language === "zh-CN"
            ? sound
              ? `音效生成请求已受理，已提交 2 个音效任务；${safeBilling}`
              : `已提交 ${"outputCount" in input ? input.outputCount ?? 2 : 2} 个创作任务；生成请求已受理，正在等待任务入队；${safeBilling}`
            : sound
              ? `Sound generation request accepted; submitted 2 sound-effect tasks; ${safeBilling}`
              : `Submitted ${"outputCount" in input ? input.outputCount ?? 2 : 2} creation tasks; request accepted and waiting in queue; ${safeBilling}`
          : language === "zh-CN"
            ? `已提交 ${created.length} 个${subject}任务；${safeBilling}`
            : `Submitted ${created.length} ${subject} task(s); ${safeBilling}`,
      );
      void refresh();
      void loadTasks();
    },
    [health?.billingLive, loadTasks, mergeGenerationTasks, operations, refresh],
  );

  const submitReference = useCallback(
    async (
      file: File,
      input: ReferenceAudioActionInput,
      copyrightAudio: boolean,
    ) => {
      const operation = findOperation(operations, input.action, {
        copyrightAudio,
      });
      const unavailable = operationGateReason(operation);
      if (unavailable) throw new Error(unavailable);
      const uploaded = await api.uploadAudio(file, {
        copyrightConfirmed: true,
        copyrightAudio,
      });
      if (uploaded.status !== "ready")
        throw new Error(
          text(
            "参考音频已接收，但尚未达到可创建状态，请稍后重试",
            "Reference audio was received but is not ready to create yet. Try again shortly.",
          ),
        );
      if (
        !Number.isFinite(uploaded.durationSeconds) ||
        uploaded.durationSeconds <= 0
      )
        throw new Error(
          text(
            "服务端未返回可信的参考音频时长",
            "The server did not return a valid reference-audio duration.",
          ),
        );
      if (
        uploaded.copyrightConfirmed !== true ||
        uploaded.copyrightAudio !== copyrightAudio
      )
        throw new Error(
          text(
            "服务端持久化的版权声明与本次上传不一致",
            "The persisted copyright declaration does not match this upload.",
          ),
        );
      if (
        input.action === "upload_extend" &&
        input.continueAt > uploaded.durationSeconds
      )
        throw new Error(
          text(
            "续作起点超过服务端探测到的音频时长",
            "The continuation point exceeds the duration detected by the server.",
          ),
        );
      const result = await api.uploadAudioAction(uploaded.id, input);
      const estimate = Number(operation?.estimatedCredits);
      const created = mergeGenerationTasks(result, {
        title:
          input.title ||
          (input.action === "upload_extend" ? input.description : "") ||
          file.name,
        operation: input.action,
        model: input.model,
        estimatedCredits: estimate,
      });
      setReferenceAudio({ ...EMPTY_REFERENCE_AUDIO });
      const safeBilling = health?.providerDirectBilling ? text("按 API 账户实际计费", "Billed to API account") : health?.billingLive
        ? text(
            "积分预留与结算由服务端幂等处理",
            "Credits are reserved and settled idempotently by the server.",
          )
        : text(
            "安全预览，不会实扣积分",
            "Safe preview; no credits are charged.",
          );
      const label =
        input.action === "upload"
          ? text("参考音频导入", "Reference audio import")
          : text("参考音频续作", "Reference audio continuation");
      setToast(
        isPendingGeneration(result) || created.length === 0
          ? `${label}${text("已受理，正在等待任务入队；", " accepted and waiting in queue; ")}${safeBilling}`
          : `${text("已提交 ", "Submitted ")}${created.length} ${label}${text("任务；", " task(s); ")}${safeBilling}`,
      );
      void refresh();
      void loadTasks();
    },
    [health?.billingLive, loadTasks, mergeGenerationTasks, operations, refresh],
  );

  const play = (track: Track) => {
    if (!isPlayable(track)) return;
    if (track.id === activeId) setPlaying((current) => !current);
    else {
      setActiveId(track.id);
      setPlaying(true);
    }
  };

  const step = (direction: 1 | -1) => {
    if (!playableTracks.length) return;
    const current = playableTracks.findIndex((track) => track.id === activeId);
    const next =
      playableTracks[
        (current + direction + playableTracks.length) % playableTracks.length
      ];
    setActiveId(next.id);
    setPlaying(true);
  };

  const remove = async (track: Track) => {
    if (isInflight(track)) {
      setToast(
        text(
          "任务仍在生成或结算中，暂不可删除；请等待任务进入完成或失败终态。",
          "This task is still generating or settling. Wait for a completed or failed state before deleting it.",
        ),
      );
      return;
    }
    if (
      !window.confirm(
        `${text("确认删除“", "Delete “")}${track.title || text("未命名作品", "Untitled track")}${text("”？音频与封面也会进入异步清理。", "”? Audio and cover assets will be cleaned up asynchronously.")}`,
      )
    )
      return;
    try {
      await api.deleteTrack(track.id);
      setTracks((previous) => previous.filter((item) => item.id !== track.id));
      if (track.id === activeId) {
        setActiveId(null);
        setPlaying(false);
      }
      if (track.id === selectedId) setSelectedId(null);
      setToast(text("作品已移入清理队列", "Track moved to the cleanup queue."));
      void refresh();
    } catch (cause) {
      setToast(
        `${text("删除失败，作品仍保留：", "Delete failed; the track was kept: ")}${errorMessage(cause)}`,
      );
    }
  };

  const reuse = (track: Track) => {
    setForm(formFromTrack(track));
    navigate("create");
    setToast(text("创作参数已完整回填", "Creation settings restored."));
  };

  const retry = (track: Track) => {
    if (
      !window.confirm(
        text(
          "重新生成会创建新的计费操作并再次预留积分，确认继续？",
          "Regenerating creates a new billable operation and reserves credits again. Continue?",
        ),
      )
    )
      return;
    if (track.operation === "sound") {
      if (
        !SOUND_MODEL_IDS.includes(
          track.model as (typeof SOUND_MODEL_IDS)[number],
        )
      ) {
        setToast(
          text(
            "原音效使用的模型已不在 MXAPI 音效模型合同中，无法直接重试",
            "The original sound model is not in the MXAPI sound contract, so it cannot be retried directly.",
          ),
        );
        return;
      }
      void submit({
        kind: "sound",
        ...(track.projectId ? { projectId: track.projectId } : {}),
        title: track.title,
        tags: track.style,
        model: track.model as (typeof SOUND_MODEL_IDS)[number],
        ...(typeof track.soundTempo === "number"
          ? { tempo: track.soundTempo }
          : {}),
        ...(track.soundKey?.trim() ? { key: track.soundKey.trim() } : {}),
        ...(typeof track.soundLoop === "boolean"
          ? { loop: track.soundLoop }
          : {}),
      }).catch((cause) =>
        setToast(
          `${text("提交失败：", "Submission failed: ")}${(cause as Error).message}`,
        ),
      );
      return;
    }
    void submit({
      ...(track.projectId ? { projectId: track.projectId } : {}),
      mode: track.mode,
      title: track.title,
      description: track.description,
      style: track.style,
      lyrics: track.lyrics,
      instrumental: track.instrumental,
      model: track.model as GenerateInput["model"],
      negativeTags: track.negativeTags,
      vocalGender: track.vocalGender,
      styleWeight: track.styleWeight,
      weirdness: track.weirdness,
    }).catch((cause) =>
      setToast(
        `${text("提交失败：", "Submission failed: ")}${(cause as Error).message}`,
      ),
    );
  };

  const runAction = async (track: Track, input: TrackActionInput) => {
    if (
      input.action === "upload_extend" &&
      typeof track.copyrightAudio !== "boolean"
    ) {
      throw new Error(
        text(
          "作品缺少服务端可信的版权音频类型",
          "The track is missing a server-trusted copyright-audio type.",
        ),
      );
    }
    const operation = findOperation(operations, input.action, {
      copyrightAudio:
        input.action === "upload_extend"
          ? track.copyrightAudio === true
          : false,
    });
    const unavailable = operationGateReason(operation);
    if (unavailable) throw new Error(unavailable);
    const result = await api.trackAction(track.id, input);
    const created = mergeGenerationTasks(result, {
      title: input.title?.trim() || track.title,
      operation: input.action,
      model: input.model || track.model,
      estimatedCredits: Number(operation?.estimatedCredits),
    });
    if (created[0]) setSelectedId(created[0].id);
    const label = (
      {
        extend: text("续写", "Extend"),
        cover: text("翻唱", "Cover"),
        remaster: text("高清重制", "Remaster"),
        upload_extend: text("参考音频续作", "Reference continuation"),
        whole_song: text("完整歌曲", "Whole song"),
        crop: text("裁剪", "Crop"),
        speed: text("变速", "Speed"),
      } as const
    )[input.action];
    setToast(
      isPendingGeneration(result) || created.length === 0
        ? `${label}${text("请求已受理，正在等待任务入队", " request accepted and waiting in queue")}`
        : `${label}${text("任务已提交，扣费操作受幂等保护", " submitted; billing is idempotency-protected")}`,
    );
    void refresh();
    void loadTasks();
  };

  const runAssetAction = async (
    track: Track,
    input: AssetActionInput,
  ): Promise<AssetJob> => {
    const operation = findOperation(operations, input.action);
    const unavailable = operationGateReason(operation);
    if (unavailable) throw new Error(unavailable);
    const job = await api.assetAction(track.id, input);
    setToast(
      `${input.action === "aligned_lyrics" ? text("逐字歌词", "Aligned lyrics") : input.action === "video" ? text("音乐视频", "Music video") : "WAV"} ${text("作业已提交，状态将自动同步", "job submitted; status will sync automatically")}`,
    );
    void loadTasks();
    void loadBilling();
    return job;
  };

  const applyAi = (result: AiAssistResult) => {
    setForm((current) => {
      const next = { ...current };
      const selected = result.appliedFields
        ? new Set(result.appliedFields)
        : null;
      const applies = (
        field: "title" | "lyrics" | "style" | "negativeTags" | "prompt",
      ) => !selected || selected.has(field);
      const structuredTitle =
        result.title?.trim() || result.fields?.title?.trim();
      const structuredStyle =
        result.styleTags
          ?.map((value) => value.trim())
          .filter(Boolean)
          .join(", ") || result.fields?.style?.trim();
      const structuredNegativeTags =
        result.negativeTags
          ?.map((value) => value.trim())
          .filter(Boolean)
          .join(", ") || result.fields?.negativeTags?.trim();

      if (result.action === "title.suggest" && applies("title")) {
        next.title = structuredTitle || result.suggestion;
      } else if (result.action === "style.suggest" && applies("style")) {
        next.style = structuredStyle || result.suggestion;
        next.mode = "custom";
      } else if (result.action === "prompt.optimize" && applies("prompt")) {
        next.description = result.fields?.prompt?.trim() || result.suggestion;
        next.mode = "simple";
      } else if (result.action.startsWith("lyrics.") && applies("lyrics")) {
        next.lyrics = result.fields?.lyrics?.trim() || result.suggestion;
        next.mode = "custom";
        next.instrumental = false;
      }

      // Structured fields can accompany every action (for example lyrics.generate may also
      // return a title and production tags). Only returned fields are applied.
      if (
        structuredTitle &&
        result.action !== "title.suggest" &&
        applies("title")
      )
        next.title = structuredTitle;
      if (
        structuredStyle &&
        result.action !== "style.suggest" &&
        applies("style")
      ) {
        next.style = mergeTagText(current.style, structuredStyle);
      }
      if (structuredNegativeTags && applies("negativeTags")) {
        next.negativeTags = mergeTagText(
          current.negativeTags,
          structuredNegativeTags,
        );
      }
      return next;
    });
    setAiAction(null);
    const zeroChargeNote =
      result.billing?.status === "preview"
        ? text("（示例预览未扣积分）", " (preview; no credits charged)")
        : result.billing?.status === "released"
          ? text("（预留积分已释放）", " (reserved credits released)")
          : result.billing?.status === "refunded"
            ? text("（积分已退款）", " (credits refunded)")
            : result.billing?.status === "disabled"
              ? text("（计费已关闭）", " (billing disabled)")
              : result.billing?.status === "not_reserved"
                ? text("（未发生积分预扣）", " (no credit reservation)")
                : !result.billing && result.actualCredits === 0
                  ? text("（本次未扣积分）", " (no credits charged)")
                  : "";
    setToast(
      `${text("已应用 AI 建议", "AI suggestion applied")}${zeroChargeNote}${text("，原始版本仍保留", "; the original version is preserved")}`,
    );
  };

  const logout = async () => {
    // `demo` describes preview account/billing data, not a disposable browser
    // identity. Any authenticated session still has a server-side HttpOnly
    // cookie that must be revoked or a reload would silently log back in.
    try {
      if (currentSession?.authenticated) await api.logout();
    } catch (cause) {
      setToast(
        `${text("退出失败，当前会话仍然有效：", "Sign-out failed; your session is still active: ")}${errorMessage(cause)}`,
      );
      return;
    }
    setSession({ authenticated: false, user: null, account: null });
    aiModelsRequestRef.current += 1;
    aiOperationsRequestRef.current += 1;
    setAiModels([]);
    setAiOperations([]);
    setMxapiCapabilities([]);
    setProjects([]);
    setTasks([]);
    setBilling(null);
    setOrders([]);
    setLibraryProject(null);
    setForm({ ...DEFAULT_FORM });
    setReferenceAudio({ ...EMPTY_REFERENCE_AUDIO });
    setDraftSavedAt(null);
    setHydratedStorageScope(null);
    goHome();
    setToast(
      text(
        "已退出 Gen Alloy · AI Music Studio 当前会话",
        "Signed out of the current Gen Alloy · AI Music Studio session",
      ),
    );
  };

  const feed = (
    <TrackFeed
      variant={route === "library" ? "library" : "feed"}
      tracks={route === "library" ? visibleTracks : tracks}
      activeId={activeId}
      selectedId={selectedId}
      playing={playing}
      onSelect={(track) =>
        setSelectedId((current) => (current === track.id ? null : track.id))
      }
      onPlay={play}
      onDelete={(track) => void remove(track)}
      onReuse={reuse}
      onRetry={retry}
      emptyHint={
        route === "library"
          ? text(
              "调整搜索或筛选条件，或者去创作页生成第一组作品。",
              "Adjust the filters or create your first set of tracks from the workbench.",
            )
          : form.source === "sound"
            ? text(
                "在左侧描述音效，Gen Alloy 会在这里呈现两个可独立使用的音效版本。",
                "Describe a sound effect on the left and Gen Alloy will show two independent versions here.",
              )
            : text(
                "在左侧写下灵感，Gen Alloy 会在这里呈现两个可独立继续创作的版本。",
                "Write an idea on the left and Gen Alloy will show two independent versions you can continue here.",
              )
      }
      emptyActionLabel={route === "library" ? t("library.start") : undefined}
      onEmptyAction={route === "library" ? () => navigate("create") : undefined}
    />
  );

  if (!currentSession && sessionLoading)
    return (
      <div className="flex h-full items-center justify-center bg-[var(--app-bg)] text-sm text-muted">
        <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-accent" />
        {text(
          "正在确认 Gen Alloy 登录状态…",
          "Checking Gen Alloy sign-in status…",
        )}
      </div>
    );

  if (!currentSession)
    return (
      <main className="flex min-h-full items-center justify-center bg-[var(--app-bg)] p-5">
        <section className="surface-card max-w-lg p-7 text-center" role="alert">
          <h1
            aria-label={text(
              "暂时无法进入 MuseFlow",
              "Gen Alloy · AI Music Studio is temporarily unavailable",
            )}
            className="text-xl font-semibold text-main"
          >
            {text(
              "暂时无法进入 MuseFlow",
              "Gen Alloy · AI Music Studio is temporarily unavailable",
            )}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {sessionError ||
              text(
                "登录状态加载失败。为保护账户数据，页面没有切换到演示用户。",
                "Sign-in status could not be loaded. Demo users are not substituted to protect account data.",
              )}
          </p>
          <button
            type="button"
            className="btn-primary mt-5"
            disabled={sessionLoading}
            onClick={() => {
              authFailureRef.current = null;
              void loadSession();
            }}
          >
            {sessionLoading
              ? text("正在重试…", "Retrying…")
              : text("重新连接", "Reconnect")}
          </button>
        </section>
      </main>
    );

  if (route === "home")
    return (
      <LandingPage
        session={displaySession ?? currentSession}
        models={
          models.length
            ? models
            : currentSession.authenticated
              ? []
              : DEMO_MODELS
        }
        generationOperation={
          currentSession.authenticated
            ? findOperation(operations, "generate")
            : undefined
        }
        modelError={resourceErrors.models}
        pricingError={resourceErrors.operations}
        theme={theme}
        menuOpen={publicMenu}
        onMenuOpenChange={setPublicMenu}
        onThemeToggle={toggleTheme}
        onEnter={enter}
        onLogin={() => window.location.assign(api.loginUrl("/#/create"))}
      />
    );

  return (
    <div className="app-shell">
      <a href="#app-main" className="skip-link">
        {text("跳到主要内容", "Skip to main content")}
      </a>
      <Sidebar
        view={route}
        onChange={navigate}
        counts={{
          inflight: mvActiveCount + Math.max(
            inflight,
            tasks.filter(
              (task) =>
                !["completed", "failed", "refunded"].includes(task.status),
            ).length,
          ),
          total: tracks.length,
        }}
        session={displaySession ?? currentSession}
        mobileOpen={mobileNav}
        onMobileClose={() => setMobileNav(false)}
      />
      <div className="app-content min-w-0 flex-1">
        <Topbar
          view={route}
          session={displaySession ?? currentSession}
          theme={theme}
          mobileMenuOpen={mobileNav}
          onMenu={() => setMobileNav(true)}
          onThemeToggle={toggleTheme}
          onRefreshBalance={() => void refreshBilling()}
          onView={navigate}
          tasks={tasks}
          onPublicHome={goHome}
          onLogout={() => void logout()}
        />
        <main id="app-main" className="app-main" tabIndex={-1}>
          {route === "explore" && (
            <ExplorePage
              tracks={tracks}
              models={
                models.length
                  ? models
                  : currentSession.authenticated
                    ? []
                    : DEMO_MODELS
              }
              generationOperation={findOperation(operations, "generate")}
              health={health}
              accountBalance={account?.availableBalance ?? null}
              activeId={activeId}
              selectedId={selectedId}
              playing={playing}
              onPlay={play}
              onSelect={(track) =>
                setSelectedId((current) =>
                  current === track.id ? null : track.id,
                )
              }
              onDelete={(track) => void remove(track)}
              onReuse={reuse}
              onRetry={retry}
              onSubmit={submit}
              onNavigateCreate={() =>
                currentSession.authenticated
                  ? navigate("create")
                  : window.location.assign(api.loginUrl("/#/create"))
              }
              publicMode={!currentSession.authenticated}
              onLogin={() => window.location.assign(api.loginUrl("/#/create"))}
            />
          )}
          {route === "create" && (
            <div className="creation-page">
              <header className="creation-page-header">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="creation-page-number">1</span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-main">
                      {t("create.title")}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {t("create.subtitle")}
                    </p>
                  </div>
                </div>
                <div className="creation-page-actions">
                  <span className="status-chip hidden sm:inline-flex">
                    {draftSavedAt
                      ? `${text("草稿已保存", "Draft saved")} · ${new Date(draftSavedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}`
                      : text(
                          "草稿仅保存在此设备",
                          "Draft stays on this device",
                        )}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost border !border-[var(--line)]"
                    onClick={saveDraft}
                  >
                    {t("create.saveDraft")}
                  </button>
                </div>
              </header>
              <div className="creation-grid">
                <section
                  className="creation-left"
                  aria-label={text("创作输入", "Creation input")}
                >
                  <CreatePanel
                    form={form}
                    models={models}
                    operations={operations}
                    operationsError={resourceErrors.operations}
                    referenceAudio={referenceAudio}
                    onReferenceAudioChange={setReferenceAudio}
                    onFormChange={setForm}
                    onOpenAi={setAiAction}
                  />
                </section>
                <section
                  className="creation-results"
                  aria-labelledby="creation-results-title"
                >
                  <div className="result-heading">
                    <div>
                      <h2 id="creation-results-title">
                        {form.source === "sound"
                          ? text("音效结果", "Sound results")
                          : t("create.result")}
                      </h2>
                      <p>
                        {form.source === "sound"
                          ? text(
                              "一次生成两个独立音效版本，可分别试听、下载和复用参数。",
                              "Generate two independent sound-effect versions to preview, download and reuse.",
                            )
                          : t("create.resultHint")}
                      </p>
                    </div>
                    {inflight > 0 && (
                      <span className="status-chip tone-accent">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft" />{" "}
                        {inflight} {text("进行中", "in progress")}
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 xl:p-5">
                    {feed}
                  </div>
                </section>
                <aside
                  className="creation-right"
                  aria-label={text(
                    "模型与生成参数",
                    "Model and generation settings",
                  )}
                >
                  <ModelControlPanel
                    health={health}
                    form={form}
                    models={models}
                    projects={projects}
                    modelsLoading={resourceLoading.models}
                    operations={operations}
                    operationsError={resourceErrors.operations}
                    referenceAudio={referenceAudio}
                    modelsError={resourceErrors.models}
                    previewTrack={playableTracks[0] ?? null}
                    onPreviewPlay={play}
                    onRetryModels={() => {
                      void loadModels();
                      void loadOperations();
                    }}
                    accountBalance={account?.availableBalance ?? null}
                    onFormChange={setForm}
                    onSubmit={submit}
                    onSubmitReference={submitReference}
                  />
                </aside>
              </div>
            </div>
          )}
          {route === "mv" && <MvStudio key={storageScope ?? "anonymous"} onProjectChange={setMvProjectId} initialProjectId={mvProjectId} tracks={tracks} initialTrackId={mvTrackId ?? activeId ?? undefined} onRefreshLibrary={() => void refresh()} />}
          {route === "lyrics" && (
            <LyricsStudio
              form={form}
              onFormChange={setForm}
              onOpenAi={setAiAction}
              onCreateSong={() => navigate("create")}
              onSaveDraft={saveDraft}
              draftSavedAt={draftSavedAt}
            />
          )}
          {route === "projects" && (
            <ProjectsPage
              projects={projects}
              error={resourceErrors.projects}
              loading={resourceLoading.projects}
              onRetry={() => void loadProjects()}
              onOpenCreate={() => setProjectDialog(true)}
              onOpenProject={openProject}
              onArchiveProject={(project) => void archiveProject(project)}
            />
          )}
          {route === "library" && (
            <div className="library-page flex h-full min-h-0 flex-col">
              <div className="library-page-heading">
                <div>
                  <span className="eyebrow">
                    {language === "zh-CN" ? "浏览与管理" : "Browse & manage"}
                  </span>
                  <h2 className="mt-1 text-lg font-semibold text-main">
                    {t("library.title")}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {t("library.subtitle")}
                  </p>
                </div>
                <span className="status-chip hidden sm:inline-flex">
                  {visibleTracks.length}{" "}
                  {language === "zh-CN" ? "首作品" : "tracks"}
                </span>
              </div>
              <div className="library-toolbar">
                {libraryProject && (
                  <span className="status-chip tone-accent max-w-full">
                    <span className="truncate">
                      {language === "zh-CN" ? "项目：" : "Project: "}
                      {libraryProject.title}
                    </span>
                    <button
                      type="button"
                      className="ml-1"
                      onClick={() => setLibraryProject(null)}
                      aria-label={
                        language === "zh-CN"
                          ? "清除项目筛选"
                          : "Clear project filter"
                      }
                    >
                      <X width={11} height={11} />
                    </button>
                  </span>
                )}
                <label className="relative min-w-56 flex-1 md:max-w-md">
                  <Search
                    width={15}
                    height={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    id="library-search"
                    className="field pl-9"
                    placeholder={t("library.search")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={
                      language === "zh-CN" ? "搜索作品" : "Search tracks"
                    }
                  />
                  {query && (
                    <button
                      type="button"
                      className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setQuery("")}
                      aria-label={
                        language === "zh-CN" ? "清空搜索" : "Clear search"
                      }
                    >
                      <X width={14} height={14} />
                    </button>
                  )}
                </label>
                <div
                  className="segmented"
                  role="group"
                  aria-label={
                    language === "zh-CN" ? "状态筛选" : "Status filter"
                  }
                >
                  {(
                    [
                      ["all", t("library.all")],
                      ["inflight", t("library.generating")],
                      ["done", t("library.done")],
                      ["error", t("library.failed")],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLibraryFilter(value)}
                      aria-pressed={libraryFilter === value}
                      className={libraryFilter === value ? "active" : ""}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="hidden text-[10px] text-muted xl:block">
                  <kbd>⌘ K</kbd>{" "}
                  {language === "zh-CN" ? "快速搜索" : "Quick search"} ·{" "}
                  {visibleTracks.length}{" "}
                  {language === "zh-CN" ? "首作品" : "tracks"}
                </span>
              </div>
              <section className="page-scroll p-5 lg:p-7">
                {libraryError && (
                  <div
                    className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3"
                    role="alert"
                  >
                    <span className="text-xs text-amber-200">
                      {language === "zh-CN"
                        ? `作品库同步失败：${libraryError}。当前不会显示演示作品。`
                        : `Library sync failed: ${libraryError}. Demo records are not shown.`}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost border !border-amber-400/20 text-xs"
                      onClick={() => void refresh()}
                    >
                      {t("common.retry")}
                    </button>
                  </div>
                )}
                {visibleTracks.length > 0 && (
                  <div className="library-table-header" aria-hidden="true">
                    <span aria-hidden="true" />
                    <span>{language === "zh-CN" ? "标题" : "Title"}</span>
                    <span>{language === "zh-CN" ? "时长" : "Duration"}</span>
                    <span>{language === "zh-CN" ? "项目" : "Project"}</span>
                    <span>{language === "zh-CN" ? "生成日期" : "Created"}</span>
                    <span>{language === "zh-CN" ? "音质" : "Format"}</span>
                    <span>{language === "zh-CN" ? "操作" : "Actions"}</span>
                  </div>
                )}
                {feed}
              </section>
            </div>
          )}
          {route === "tasks" && (
            <TasksPage
              tasks={tasks}
              onOpenMv={id => {setMvProjectId(id);navigate("mv");}}
              error={resourceErrors.tasks}
              loading={resourceLoading.tasks}
              onRetry={() => void loadTasks()}
              onRefresh={() => {
                void loadTasks();
                void refresh();
              }}
              onQuery={queryTasks}
              streamConnected={taskStreamConnected}
              updatedAt={tasksUpdatedAt}
            />
          )}
          {route === "suno-tools" && (
            <SunoToolsPage
              tracks={tracks}
              operations={operations}
              loading={resourceLoading.operations}
              error={resourceErrors.operations}
              initialPrompt={form.description}
              initialTrackId={activeId ?? undefined}
              onNavigate={navigate}
              onOpenTrack={(track) => {
                navigate("library");
                requestAnimationFrame(() => setSelectedId(track.id));
              }}
              onUsePrompt={(prompt) =>
                setForm((current) => ({
                  ...current,
                  source: "text",
                  mode: "simple",
                  description: prompt,
                }))
              }
              onOpenAi={setAiAction}
              onRetry={() => void loadOperations()}
            />
          )}
          {route === "api-capabilities" && (
            <SunoContractPage
              capabilities={mxapiCapabilities}
              error={resourceErrors.mxapiCapabilities}
              loading={resourceLoading.mxapiCapabilities}
              onRetry={() => void loadMxapiCapabilities()}
              onNavigate={navigate}
            />
          )}
          {route === "billing" && (
            <BillingPage
              summary={billing}
              orders={orders}
              account={account}
              summaryError={resourceErrors.billing}
              ordersError={resourceErrors.orders}
              loadingSummary={resourceLoading.billing}
              loadingOrders={resourceLoading.orders}
              onRetrySummary={() => void loadBilling()}
              onRetryOrders={() => void loadOrders()}
              onRefresh={() => void refreshBilling()}
            />
          )}
          {route === "settings" && (
            <SettingsWorkspace
              account={account}
              user={currentSession.user}
              theme={theme}
              models={models}
              onThemeChange={setTheme}
              onDefaultModelChange={(model) =>
                setForm((current) => ({ ...current, model }))
              }
              onLogout={() => void logout()}
              onRefresh={() => void refresh()}
              isAdmin={currentSession.user?.role === "admin"}
            />
          )}
        </main>
      </div>

      {selected && !["settings", "billing", "tasks", "mv"].includes(route) && (
        <TrackDetail
          track={selected}
          groupSize={
            tracks.filter((track) => track.groupId === selected.groupId).length
          }
          active={selected.id === activeId}
          playing={playing && selected.id === activeId}
          models={models}
          operations={operations}
          operationsError={resourceErrors.operations}
          accountBalance={account?.availableBalance ?? null}
          onClose={() => setSelectedId(null)}
          onPlay={play}
          onDelete={(track) => void remove(track)}
          onReuse={reuse}
          onRetry={retry}
          onAction={runAction}
          onCreateMv={(track) => { setMvProjectId(undefined); setMvTrackId(track.id); setSelectedId(null); navigate("mv"); }}
          onAssetAction={runAssetAction}
        />
      )}
      <Player
        track={active}
        tracks={playableTracks}
        playing={playing}
        onPlayingChange={setPlaying}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onEnded={() => step(1)}
        onSelectTrack={play}
        onOpenTrack={(track) => {
          navigate("library");
          requestAnimationFrame(() => setSelectedId(track.id));
        }}
        onOpenLyrics={() => navigate("lyrics")}
        onOpenTools={() => navigate("suno-tools")}
      />
      <MobileDock
        view={route}
        inflight={inflight}
        onChange={navigate}
        onMore={() => setMobileNav(true)}
      />
      <AiAssistant
        action={aiAction}
        form={form}
        models={aiModels}
        modelsError={resourceErrors.aiModels}
        operations={aiOperations}
        operationsError={resourceErrors.aiOperations}
        accountBalance={account?.availableBalance ?? null}
        onActionChange={setAiAction}
        onApply={applyAi}
        onClose={() => setAiAction(null)}
      />
      <ProjectDialog
        open={projectDialog}
        onClose={() => setProjectDialog(false)}
        onCreated={(project) => {
          setProjects((current) => [project, ...current]);
          setToast(`项目“${project.title}”已创建`);
        }}
      />

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span>{toast}</span>
          <button
            type="button"
            className="icon-btn -mr-2"
            onClick={() => setToast(null)}
            aria-label={text("关闭提示", "Dismiss message")}
          >
            <X width={14} height={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
