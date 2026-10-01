import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppLanguage = "zh-CN" | "en-US";
type MessageValue =
  | string
  | ((values: Record<string, string | number>) => string);

const messages: Record<AppLanguage, Record<string, MessageValue>> = {
  "zh-CN": {
    "brand.studio": "AI Music Studio",
    "nav.createGroup": "创作",
    "nav.manageGroup": "管理",
    "nav.explore": "探索首页",
    "nav.create": "创作工作台",
    "nav.lyrics": "歌词工作室",
    "nav.mv": "MV 工作室",
    "nav.projects": "项目与专辑",
    "nav.library": "音乐资产库",
    "nav.tools": "制作工具",
    "nav.tasks": "任务调度中心",
    "nav.api": "接口能力",
    "nav.billing": "账单与 Credits",
    "nav.settings": "系统与偏好",
    "nav.startCreate": "开始创作",
    "nav.libraryCount": "当前作品库",
    "nav.inflight": "进行中任务",
    "nav.credits": "积分",
    "nav.topUp": "充值",
    "topbar.search": "搜索作品、歌词或风格",
    "topbar.language": "中文 / English",
    "topbar.dark": "深色模式",
    "topbar.light": "浅色模式",
    "topbar.balance": "积分",
    "topbar.billing": "账单",
    "topbar.activity": "任务通知",
    "topbar.activityOpen": "查看任务通知",
    "topbar.settings": "打开系统与偏好",
    "topbar.accountOpen": "打开账户菜单：{{name}}",
    "topbar.accountClose": "关闭账户菜单：{{name}}",
    "topbar.orders": "积分与订单",
    "topbar.profile": "个人设置",
    "topbar.home": "产品首页",
    "topbar.logout": "退出登录",
    "topbar.sync": "同步余额",
    "topbar.processing": "{{count}} 个任务处理中",
    "topbar.live": "实时",
    "topbar.completed": "已完成",
    "topbar.failed": "处理失败",
    "topbar.inProgress": "处理中",
    "topbar.activityHint": "在这里查看生成进度",
    "topbar.activityDescription":
      "任务完成、失败或退款后，状态会自动同步到任务中心。",
    "topbar.unnamedTask": "未命名任务",
    "create.title": "创作工作台",
    "create.subtitle": "选择创作模式并调整音频参数，快速生成高品质草稿工程",
    "create.promptTitle": "灵感与风格 Prompt",
    "create.promptSubtitle": "先写下想法，再决定使用灵感模式或自定义歌词。",
    "create.inspiration": "灵感模式",
    "create.customLyrics": "自定义歌词",
    "create.sound": "音效",
    "create.reference": "参考音频",
    "create.aiAssist": "AI 辅助",
    "create.songTitle": "歌名",
    "create.optional": "可选",
    "create.description": "描述你的音乐",
    "create.descriptionHint": "主题、情绪、风格和想象中的画面",
    "create.pureMusic": "纯音乐",
    "create.pureMusicHint": "关闭人声与歌词，专注配乐创作",
    "create.result": "创作结果",
    "create.resultHint": "同一灵感会生成两个独立版本，可分别播放和继续创作。",
    "create.modelTitle": "模型与生成参数",
    "create.modelSubtitle":
      "价格、权限与 Provider 状态由 ModelCross 实时返回。",
    "create.project": "归属项目",
    "create.output": "输出",
    "create.estimated": "预计消耗",
    "create.generate": "生成 2 首歌曲 · {{credits}} 积分",
    "create.saveDraft": "保存草稿",
    "library.title": "音乐资产库",
    "library.subtitle": "播放、下载并继续打磨每一首已生成作品。",
    "library.search": "搜索歌名、风格、歌词……",
    "library.all": "全部",
    "library.generating": "生成中",
    "library.done": "已完成",
    "library.failed": "失败",
    "library.start": "开始创作",
    "tasks.title": "任务调度中心",
    "tasks.subtitle": "实时监控 ModelCross 音乐生成与后处理任务",
    "tasks.inProgress": "进行中",
    "tasks.weekDone": "本周完成",
    "tasks.refund": "退款/待处理",
    "tasks.searchTitle": "按任务编号查找",
    "tasks.searchHint":
      "输入一个或多个任务编号，快速定位当前账户提交的生成记录。",
    "tasks.query": "查询",
    "tasks.refresh": "刷新",
    "tasks.all": "全部",
    "tasks.active": "进行中",
    "tasks.completed": "已完成",
    "tasks.attention": "异常与退款",
    "tasks.emptyTitle": "这个筛选下没有任务",
    "tasks.emptyHint": "生成任务、资产处理和积分退款都会出现在这里。",
    "tools.title": "制作工具",
    "tools.subtitle":
      "这里呈现当前账户真实可执行的音乐生成、歌曲处理和资产输出能力。",
    "tools.createSection": "生成与参考音频",
    "tools.trackSection": "继续创作与资产输出",
    "tools.prompt": "提示词扩展工具",
    "billing.title": "账单与 Credits",
    "billing.subtitle": "管理你的 ModelCross 余额、账单记录与充值",
    "settings.title": "系统与偏好",
    "settings.subtitle": "设置音频采样率、默认模型、主题外观及账户信息",
    "common.loading": "正在加载…",
    "common.retry": "重试",
    "common.close": "关闭",
    "common.cancel": "取消",
    "common.search": "搜索",
    "common.free": "免费",
    "common.current": "当前",
  },
  "en-US": {
    "brand.studio": "AI Music Studio",
    "nav.createGroup": "Create",
    "nav.manageGroup": "Manage",
    "nav.explore": "Explore",
    "nav.create": "Creation Workbench",
    "nav.lyrics": "Lyrics Studio",
    "nav.mv": "MV Studio",
    "nav.projects": "Projects & Albums",
    "nav.library": "Music Library",
    "nav.tools": "Production Tools",
    "nav.tasks": "Task Center",
    "nav.api": "API Capabilities",
    "nav.billing": "Billing & Credits",
    "nav.settings": "Settings & Preferences",
    "nav.startCreate": "Start creating",
    "nav.libraryCount": "Library",
    "nav.inflight": "Active tasks",
    "nav.credits": "Credits",
    "nav.topUp": "Top up",
    "topbar.search": "Search tracks, lyrics or styles",
    "topbar.language": "English / 中文",
    "topbar.dark": "Dark mode",
    "topbar.light": "Light mode",
    "topbar.balance": "Credits",
    "topbar.billing": "Billing",
    "topbar.activity": "Task notifications",
    "topbar.activityOpen": "View task notifications",
    "topbar.settings": "Open settings",
    "topbar.accountOpen": "Open account menu: {{name}}",
    "topbar.accountClose": "Close account menu: {{name}}",
    "topbar.orders": "Credits & orders",
    "topbar.profile": "Profile settings",
    "topbar.home": "Product home",
    "topbar.logout": "Sign out",
    "topbar.sync": "Sync balance",
    "topbar.processing": "{{count}} tasks processing",
    "topbar.live": "Live",
    "topbar.completed": "Completed",
    "topbar.failed": "Failed",
    "topbar.inProgress": "Processing",
    "topbar.activityHint": "Track generation progress here",
    "topbar.activityDescription":
      "Completed, failed and refunded tasks sync automatically to the task center.",
    "topbar.unnamedTask": "Unnamed task",
    "create.title": "Creation Workbench",
    "create.subtitle":
      "Choose a creation mode, tune audio parameters, and generate a polished draft.",
    "create.promptTitle": "Idea & style prompt",
    "create.promptSubtitle":
      "Start with an idea, then choose inspiration mode or custom lyrics.",
    "create.inspiration": "Inspiration",
    "create.customLyrics": "Custom lyrics",
    "create.sound": "Sound effect",
    "create.reference": "Reference audio",
    "create.aiAssist": "AI assist",
    "create.songTitle": "Song title",
    "create.optional": "Optional",
    "create.description": "Describe your music",
    "create.descriptionHint": "Theme, emotion, style and the scene you imagine",
    "create.pureMusic": "Instrumental",
    "create.pureMusicHint":
      "Turn off vocals and lyrics for an instrumental track",
    "create.result": "Creation results",
    "create.resultHint":
      "One idea creates two independent versions you can play and continue.",
    "create.modelTitle": "Model & generation settings",
    "create.modelSubtitle":
      "Prices, access and Provider status come live from ModelCross.",
    "create.project": "Project",
    "create.output": "Output",
    "create.estimated": "Estimated cost",
    "create.generate": "Generate 2 songs · {{credits}} credits",
    "create.saveDraft": "Save draft",
    "library.title": "Music Library",
    "library.subtitle":
      "Play, download and keep refining every generated track.",
    "library.search": "Search titles, styles or lyrics…",
    "library.all": "All",
    "library.generating": "Generating",
    "library.done": "Completed",
    "library.failed": "Failed",
    "library.start": "Start creating",
    "tasks.title": "Task Center",
    "tasks.subtitle":
      "Monitor ModelCross music generation and asset processing in real time.",
    "tasks.inProgress": "Active",
    "tasks.weekDone": "Completed this week",
    "tasks.refund": "Refunds / attention",
    "tasks.searchTitle": "Find by task ID",
    "tasks.searchHint":
      "Enter one or more task IDs to locate records submitted by this account.",
    "tasks.query": "Search",
    "tasks.refresh": "Refresh",
    "tasks.all": "All",
    "tasks.active": "Active",
    "tasks.completed": "Completed",
    "tasks.attention": "Attention & refunds",
    "tasks.emptyTitle": "No tasks in this view",
    "tasks.emptyHint":
      "Generation, asset processing and credit refunds appear here.",
    "tools.title": "Production Tools",
    "tools.subtitle":
      "Music generation, track processing and asset output available to this account.",
    "tools.createSection": "Generate & reference audio",
    "tools.trackSection": "Continue & export",
    "tools.prompt": "Prompt enhancer",
    "billing.title": "Billing & Credits",
    "billing.subtitle":
      "Manage your ModelCross balance, billing history and top-ups",
    "settings.title": "Settings & Preferences",
    "settings.subtitle":
      "Configure audio output, default models, appearance and account details",
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.search": "Search",
    "common.free": "Free",
    "common.current": "Current",
  },
};

// Catalog data is returned by ModelCross and therefore cannot be translated
// with a static JSX key at each call site.  Keep the provider-owned labels in
// one small map so model cards, operation cards and status badges use the same
// wording in both languages.
const catalogTranslations: Record<string, string> = {
  旗舰: "Flagship",
  高品质: "High quality",
  推荐: "Recommended",
  全能: "All-round",
  兼容: "Compatible",
  旧版: "Legacy",
  "细节、人声与结构表现最佳，适合正式作品。":
    "Best detail, vocals and structure for finished releases.",
  "高品质完整歌曲，兼顾稳定性和创意。":
    "High-quality complete songs with a balance of speed and creativity.",
  "稳定均衡，适合日常快速创作。": "Stable and balanced for everyday creation.",
  "V4.5 全能力版本，兼顾结构、风格与生成稳定性。":
    "Full V4.5 capability with balanced structure, style and stability.",
  "复杂提示词理解与歌曲结构表现良好。":
    "Strong understanding of complex prompts and song structure.",
  "经典稳定模型，兼容旧项目。": "Classic stable model for legacy projects.",
  "旧版兼容模型。": "Legacy-compatible model.",
  "仅用于复现旧项目。": "For reproducing legacy projects only.",
  生成: "Generate",
  原创: "Original",
  双版本生成: "Two-version generation",
  续写: "Extend",
  翻唱: "Cover",
  重制: "Remaster",
  高清重制: "Remaster",
  参考音频: "Reference audio",
  参考音频接入: "Reference audio import",
  版权音频接入: "Copyright-audio import",
  参考音频续作: "Reference continuation",
  完整歌曲: "Whole song",
  生成完整歌曲: "Whole song",
  裁剪: "Crop",
  变速: "Speed",
  逐字歌词: "Aligned lyrics",
  音乐视频: "Music video",
  "WAV 转换": "WAV conversion",
  音效生成: "Sound-effect generation",
  音效: "Sound effect",
  处理中: "Processing",
  生成中: "Generating",
  排队中: "Queued",
  已完成: "Completed",
  失败: "Failed",
  退款中: "Refunding",
  已退款: "Refunded",
  待对账: "Reconciliation needed",
  预扣中: "Reserving credits",
  提交中: "Submitting",
  资产处理中: "Processing assets",
  预览: "Preview",
  "音乐 Provider 尚未配置": "Music Provider is not configured",
  "服务端尚未返回能力与价格目录。":
    "The server has not returned a capability or pricing catalog yet.",
  当前模型不支持此操作: "The current model does not support this operation",
  "服务端未返回此 AI 动作的授权与价格目录":
    "The server has not returned access and pricing for this AI action",
  "ModelCross 价格目录尚未配置此 AI 动作":
    "The ModelCross pricing catalog has not configured this AI action",
  "服务端未返回有效的 AI 动态估价":
    "The server did not return a valid AI dynamic quote",
  "服务端未返回 AI 价格版本": "The server did not return an AI price version",
  账户可用余额尚未加载: "Account balance has not loaded yet",
  "此 AI 动作当前不可用": "This AI action is currently unavailable",
  "服务端未授权执行此 AI 动作": "The server has not authorized this AI action",
  "真实 AI 扣费未启用，已阻止请求":
    "Live AI billing is not enabled; the request was blocked",
  动作目录加载失败: "Operation catalog failed to load",
  音效生成不可用: "Sound generation is unavailable",
  音乐生成不可用: "Music generation is unavailable",
  "服务端返回的音效参数合同不完整或与 MXAPI 文档不一致":
    "The server sound parameter contract is incomplete or differs from the MXAPI docs",
  "当前没有可用的音乐模型，请刷新后重试":
    "No music model is available; refresh and try again",
  "当前没有已授权且支持音效生成的 Suno V5 / V5.5 模型":
    "No authorized Suno V5 / V5.5 model supports sound generation",
  当前模型没有音效生成授权:
    "The current model is not authorized for sound generation",
  请填写音效标题: "Enter a sound title",
  请填写音效风格与描述: "Enter a sound style and description",
  "BPM 必须是有效数字，留空则不向 Provider 发送 tempo":
    "BPM must be a valid number; leave blank to omit tempo from the Provider request",
  循环参数必须是明确的布尔值: "The loop parameter must be an explicit boolean",
  "账户余额暂不可用，请刷新账户信息":
    "Account balance is unavailable; refresh account information",
  "可用积分不足，请先充值": "Not enough credits; top up first",
  请先描述你想听到的歌曲: "Describe the song you want to hear first",
  自定义模式需要填写音乐风格: "Custom mode requires a music style",
  "请填写歌词，或开启纯音乐": "Enter lyrics or enable instrumental mode",
  参考音频提交接口尚未就绪:
    "The reference-audio submission endpoint is not ready",
  请选择参考音频文件: "Choose a reference-audio file",
  请先确认拥有上传及生成所需的全部权利:
    "Confirm that you own all rights required for upload and generation",
  正在读取参考音频时长: "Reading reference-audio duration",
  参考音频时长尚未验证: "Reference-audio duration has not been verified",
  服务端上传限制配置不完整: "Server upload-limit configuration is incomplete",
  参考音频类型不在服务端允许范围内:
    "This reference-audio type is not allowed by the server",
  参考音频大小超过服务端限制: "Reference-audio size exceeds the server limit",
  参考音频时长超过服务端限制:
    "Reference-audio duration exceeds the server limit",
  服务端未返回完整的参考音频参数范围:
    "The server did not return complete reference-audio parameter ranges",
  续作起点超出当前能力或音频时长范围:
    "The continuation point is outside the capability or audio-duration range",
  歌词推荐: "Lyrics pick",
  快速推荐: "Fast pick",
  "由 ModelCross 统一路由的音乐创作辅助模型。":
    "Music-creation assistant routed by ModelCross.",
};

export function localizeCatalogText(
  value: string | null | undefined,
  language: AppLanguage,
): string {
  if (!value) return "";
  if (language === "zh-CN") return value;
  return catalogTranslations[value] ?? value.replaceAll("预览", "Preview");
}

interface I18nContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const LANGUAGE_STORAGE_KEY = "genalloy.language";
const LANGUAGE_CHANGE_EVENT = "genalloy:language-change";

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh-CN" || value === "en-US";
}

function readStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "zh-CN";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en-US"
    ? "en-US"
    : "zh-CN";
}

function translate(
  language: AppLanguage,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const raw = messages[language][key] ?? messages["zh-CN"][key] ?? key;
  const text = typeof raw === "function" ? raw(values) : raw;
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(values[name] ?? ""),
  );
}

// Components such as the top bar are also rendered in isolation by the UI
// preview and test harness.  A real provider is still used by the application,
// but a safe Chinese fallback keeps those isolated renders functional instead
// of throwing before the language control can be interacted with.
const fallbackI18n: I18nContextValue = {
  language: "zh-CN",
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  t: (key, values) => translate("zh-CN", key, values),
};

const I18nContext = createContext<I18nContextValue>(fallbackI18n);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] =
    useState<AppLanguage>(readStoredLanguage);
  const setLanguage = (next: AppLanguage) => setLanguageState(next);
  const toggleLanguage = () =>
    setLanguageState((current) => (current === "zh-CN" ? "en-US" : "zh-CN"));

  // SettingsWorkspace predates the shared provider and emits this event when
  // its language buttons are used.  Listening here makes both entry points
  // update the same source of truth and keeps every mounted page in sync.
  useEffect(() => {
    const syncExternalLanguage = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isAppLanguage(next)) setLanguageState(next);
    };
    window.addEventListener(LANGUAGE_CHANGE_EVENT, syncExternalLanguage);
    return () =>
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, syncExternalLanguage);
  }, []);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    window.dispatchEvent(
      new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: language }),
    );
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t: (key, values = {}) => translate(language, key, values),
    }),
    [language],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
