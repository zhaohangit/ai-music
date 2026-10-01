import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { PlatformTask, SessionSummary, ThemeMode } from "../types";
import type { View } from "./Sidebar";
import { localizeCatalogText, useI18n } from "../i18n";
import {
  Bell,
  Chevron,
  Gear,
  Home,
  Languages,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Plus,
  Receipt,
  Refresh,
  Search,
  Sparkle,
  Sun,
  User,
} from "./Icons";

const COPY: Record<View, { title: string; subtitle: string }> = {
  mv: { title: "MV 工作室", subtitle: "参考人物、动态分镜、歌词字幕与成片" },
  explore: {
    title: "探索首页",
    subtitle: "从灵感开始，发现并继续你的音乐作品",
  },
  create: { title: "创作工作台", subtitle: "从灵感到双版本完整歌曲" },
  lyrics: { title: "歌词工作室", subtitle: "生成、润色、续写并管理歌词版本" },
  projects: { title: "项目与专辑", subtitle: "整理歌曲、草稿和完整创作脉络" },
  library: { title: "音乐资产库", subtitle: "播放、下载并继续打磨每一首作品" },
  tasks: { title: "任务调度中心", subtitle: "查看生成、资产处理与退款进度" },
  "suno-tools": {
    title: "制作工具",
    subtitle: "续写、翻唱、重制与更多歌曲处理能力",
  },
  "api-capabilities": {
    title: "接口能力",
    subtitle: "查看 MXAPI 全能力、参数与 ModelCross 4 倍价格映射",
  },
  billing: { title: "账单与 Credits", subtitle: "余额、套餐、充值与消费记录" },
  settings: { title: "系统与偏好", subtitle: "账户、偏好、模型连接与安全" },
};
const COPY_EN: Record<View, { title: string; subtitle: string }> = {
  mv: { title: "MV Studio", subtitle: "Character, motion, captions and final cut" },
  explore: {
    title: "Explore",
    subtitle: "Find inspiration and continue your music",
  },
  create: {
    title: "Creation Workbench",
    subtitle: "From an idea to two complete versions",
  },
  lyrics: {
    title: "Lyrics Studio",
    subtitle: "Generate, refine, continue and manage lyrics",
  },
  projects: {
    title: "Projects & albums",
    subtitle: "Organize songs, drafts and creative threads",
  },
  library: {
    title: "Music Library",
    subtitle: "Play, download and refine every track",
  },
  tasks: {
    title: "Task center",
    subtitle: "Track generation, assets and refunds",
  },
  "suno-tools": {
    title: "Production tools",
    subtitle: "Extend, cover, remaster and process tracks",
  },
  "api-capabilities": {
    title: "API capabilities",
    subtitle: "Browse MXAPI capabilities, parameters and 4× prices",
  },
  billing: {
    title: "Billing & Credits",
    subtitle: "Balance, plans, top-ups and usage",
  },
  settings: {
    title: "Settings & preferences",
    subtitle: "Account, preferences, model access and security",
  },
};

interface Props {
  view: View;
  session: SessionSummary;
  theme: ThemeMode;
  mobileMenuOpen: boolean;
  onMenu: () => void;
  onThemeToggle: () => void;
  onRefreshBalance?: () => void;
  onView: (view: View) => void;
  tasks?: PlatformTask[];
  onPublicHome: () => void;
  onLogout: () => void;
}

export function Topbar({
  view,
  session,
  theme,
  mobileMenuOpen,
  onMenu,
  onThemeToggle,
  onRefreshBalance,
  onView,
  onPublicHome,
  onLogout,
  tasks = [],
}: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { language, t, toggleLanguage } = useI18n();
  const wrapper = useRef<HTMLDivElement>(null);
  const notificationWrapper = useRef<HTMLDivElement>(null);
  const notificationTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialMenuFocus = useRef<"first" | "last" | null>(null);
  const account = session.account;
  const balance = account?.availableBalance;
  const balanceText = balance === undefined ? "—" : balance.toLocaleString();
  const initials = session.user?.name?.slice(0, 1).toLocaleUpperCase() || "M";
  const activeTaskCount = tasks.filter(
    (task) =>
      !["completed", "failed", "refunded", "cancelled"].includes(task.status),
  ).length;
  const recentTasks = tasks.slice(0, 3);

  useEffect(() => {
    if (!profileOpen && !notificationsOpen) return;
    const focusFrame =
      profileOpen && initialMenuFocus.current
        ? requestAnimationFrame(() => {
            const items =
              menuRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              );
            if (!items?.length) return;
            items[
              initialMenuFocus.current === "last" ? items.length - 1 : 0
            ]?.focus();
            initialMenuFocus.current = null;
          })
        : 0;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapper.current?.contains(target)) setProfileOpen(false);
      if (!notificationWrapper.current?.contains(target))
        setNotificationsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (profileOpen) {
        setProfileOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        requestAnimationFrame(() => notificationTriggerRef.current?.focus());
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      if (focusFrame) cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen, notificationsOpen]);

  const openProfile = (focus: "first" | "last") => {
    initialMenuFocus.current = focus;
    setProfileOpen(true);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? []),
    ];
    if (event.key === "Tab") {
      setProfileOpen(false);
      return;
    }
    if (
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
      !items.length
    )
      return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="icon-btn lg:hidden"
        onClick={onMenu}
        aria-label={
          language === "zh-CN" ? "打开主导航" : "Open main navigation"
        }
        aria-expanded={mobileMenuOpen}
        aria-controls="app-sidebar"
      >
        <Menu width={19} height={19} />
      </button>
      <span className="sr-only" aria-hidden="true">
        {(language === "zh-CN" ? COPY : COPY_EN)[view].title} ·{" "}
        {(language === "zh-CN" ? COPY : COPY_EN)[view].subtitle}
      </span>
      <button
        type="button"
        className="topbar-search hidden md:inline-flex"
        onClick={() => {
          onView("library");
          requestAnimationFrame(() =>
            document.getElementById("library-search")?.focus(),
          );
        }}
        aria-label={`${t("topbar.search")}（⌘ K）`}
      >
        <Search width={15} height={15} />
        <span>{t("topbar.search")}</span>
        <kbd>⌘ K</kbd>
      </button>
      <button
        type="button"
        className="topbar-language hidden lg:inline-flex"
        onClick={toggleLanguage}
        aria-label={
          language === "zh-CN" ? "Switch to English" : "切换为简体中文"
        }
        title={
          language === "zh-CN"
            ? "Switch to English"
            : "Switch to Simplified Chinese"
        }
      >
        <Languages width={14} height={14} />
        <span>{t("topbar.language")}</span>
      </button>
      <button
        type="button"
        className="topbar-theme-toggle hidden sm:inline-flex"
        onClick={onThemeToggle}
        aria-label={theme === "light" ? t("topbar.dark") : t("topbar.light")}
        title={theme === "light" ? t("topbar.dark") : t("topbar.light")}
      >
        {theme === "light" ? (
          <Sun width={16} height={16} />
        ) : (
          <Moon width={16} height={16} />
        )}
        <span className="hidden lg:inline">
          {theme === "light" ? t("topbar.light") : t("topbar.dark")}
        </span>
      </button>
      {activeTaskCount > 0 && (
        <button
          type="button"
          className="topbar-task-status hidden xl:inline-flex"
          onClick={() => onView("tasks")}
          aria-label={
            language === "zh-CN"
              ? `查看 ${activeTaskCount} 个进行中任务`
              : `View ${activeTaskCount} active tasks`
          }
        >
          <span className="topbar-task-dot" />
          {t("topbar.processing", { count: activeTaskCount })}
        </button>
      )}
      <div className="balance-pill">
        <button
          type="button"
          className="balance-main"
          onClick={() => onView("billing")}
          aria-label={
            balance === undefined
              ? language === "zh-CN"
                ? "可用积分待同步，查看积分与订单"
                : "Balance pending; open credits and orders"
              : language === "zh-CN"
                ? `可用积分 ${balance}，查看积分与订单`
                : `Available credits ${balance}; open credits and orders`
          }
        >
          <Sparkle width={13} height={13} />
          <span className="hidden text-main sm:inline">
            {t("topbar.balance")}
          </span>
          <strong>{balanceText}</strong>
          <span className="balance-divider" />
          <span className="balance-action">{t("topbar.billing")}</span>
        </button>
        {onRefreshBalance ? (
          <button
            type="button"
            className="balance-refresh icon-btn"
            onClick={onRefreshBalance}
            aria-label={t("topbar.sync")}
            title={t("topbar.sync")}
          >
            <Refresh width={13} height={13} />
          </button>
        ) : null}
      </div>
      {account?.topUpUrl ? (
        <button
          type="button"
          className="topbar-topup hidden lg:inline-flex"
          onClick={() => onView("billing")}
        >
          <Plus width={13} height={13} /> {t("nav.topUp")}
        </button>
      ) : null}
      <div className="relative" ref={notificationWrapper}>
        <button
          ref={notificationTriggerRef}
          type="button"
          className={`icon-btn hidden sm:inline-flex ${notificationsOpen ? "is-open" : ""}`}
          onClick={() => {
            setNotificationsOpen((value) => !value);
            setProfileOpen(false);
          }}
          aria-label={t("topbar.activityOpen")}
          aria-expanded={notificationsOpen}
          aria-haspopup="menu"
          aria-controls="notification-menu"
          title={t("topbar.activityOpen")}
        >
          <Bell width={17} height={17} />
          {activeTaskCount > 0 && (
            <span
              className="notification-dot"
              aria-label={`${activeTaskCount} active tasks`}
            />
          )}
        </button>
        {notificationsOpen && (
          <div id="notification-menu" className="notification-menu" role="menu">
            <div className="notification-menu-heading">
              <div>
                <span className="notification-kicker">ACTIVITY</span>
                <strong>{t("topbar.activity")}</strong>
              </div>
              <span className="notification-count">{t("topbar.live")}</span>
            </div>
            {recentTasks.length ? (
              <div className="notification-task-list">
                {recentTasks.map((task) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={task.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      onView("tasks");
                    }}
                  >
                    <span
                      className={`notification-task-status ${task.status === "completed" ? "is-done" : task.status === "failed" ? "is-failed" : ""}`}
                    />
                    <span className="min-w-0 flex-1 text-left">
                      <strong className="block truncate">
                        {task.title || t("topbar.unnamedTask")}
                      </strong>
                      <small className="mt-0.5 block truncate">
                        {task.status === "completed"
                          ? t("topbar.completed")
                          : task.status === "failed"
                            ? t("topbar.failed")
                            : `${Math.round(task.progress * 100)}% · ${t("topbar.inProgress")}`}
                      </small>
                    </span>
                    <Chevron width={12} height={12} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="notification-empty">
                <span className="notification-empty-icon">
                  <ListTodo width={17} height={17} />
                </span>
                <strong>{t("topbar.activityHint")}</strong>
                <p>{t("topbar.activityDescription")}</p>
              </div>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setNotificationsOpen(false);
                onView("tasks");
              }}
            >
              <ListTodo width={14} height={14} /> {t("nav.tasks")}{" "}
              <Chevron width={12} height={12} />
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="icon-btn hidden sm:inline-flex"
        onClick={() => onView("settings")}
        aria-label={t("topbar.settings")}
        title={t("nav.settings")}
      >
        <Gear width={17} height={17} />
      </button>
      <div className="relative" ref={wrapper}>
        <button
          ref={triggerRef}
          type="button"
          className="profile-trigger"
          onClick={() => {
            setNotificationsOpen(false);
            if (profileOpen) {
              setProfileOpen(false);
            } else {
              openProfile("first");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setNotificationsOpen(false);
              openProfile(event.key === "ArrowUp" ? "last" : "first");
            }
          }}
          aria-label={
            profileOpen
              ? t("topbar.accountClose", {
                  name: session.user?.name || "Guest",
                })
              : t("topbar.accountOpen", { name: session.user?.name || "Guest" })
          }
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          aria-controls="profile-menu"
        >
          <span className="profile-avatar">{initials}</span>
          <span className="hidden max-w-24 truncate text-xs font-semibold text-main xl:inline">
            {session.user?.name || "Guest"}
          </span>
          <Chevron
            width={12}
            height={12}
            className={`hidden text-muted transition sm:block ${profileOpen ? "rotate-90" : ""}`}
          />
        </button>
        {profileOpen && (
          <div
            ref={menuRef}
            id="profile-menu"
            className="profile-menu"
            role="menu"
            onKeyDown={handleMenuKeyDown}
          >
            <div className="border-b border-[var(--line)] px-3 py-3">
              <div className="truncate text-xs font-semibold text-main">
                {session.user?.name}
              </div>
              <div className="mt-1 truncate text-[10px] text-muted">
                {session.user?.email}
              </div>
              <span className="mt-2 inline-flex rounded-md bg-accent/10 px-2 py-1 text-[9px] font-medium text-accent-soft">
                {account?.subscription.name
                  ? localizeCatalogText(account.subscription.name, language)
                  : t("common.free")}
              </span>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onView("billing");
                setProfileOpen(false);
              }}
            >
              <Receipt width={14} height={14} /> {t("topbar.orders")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onView("settings");
                setProfileOpen(false);
              }}
            >
              <User width={14} height={14} /> {t("topbar.profile")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPublicHome();
                setProfileOpen(false);
              }}
            >
              <Home width={14} height={14} /> {t("topbar.home")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="!text-rose-400"
              onClick={() => {
                setProfileOpen(false);
                onLogout();
              }}
            >
              <LogOut width={14} height={14} /> {t("topbar.logout")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
