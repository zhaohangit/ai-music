import { useEffect, useRef, useState } from "react";
import type { SessionSummary } from "../types";
import { localizeCatalogText, useI18n } from "../i18n";
import {
  Folder,
  Film,
  Gear,
  Library,
  ListTodo,
  Menu,
  Music,
  Compass,
  Cpu,
  PenLine,
  Receipt,
  Sparkle,
  X,
} from "./Icons";

export type View =
  | "explore"
  | "create"
  | "mv"
  | "lyrics"
  | "projects"
  | "library"
  | "tasks"
  | "billing"
  | "settings"
  | "suno-tools"
  | "api-capabilities";

interface Props {
  view: View;
  onChange: (view: View) => void;
  counts: { inflight: number; total: number };
  session: SessionSummary;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface MobileDockProps {
  view: View;
  inflight: number;
  onChange: (view: View) => void;
  onMore: () => void;
}

const primaryItems = [
  ["explore", "nav.explore", Compass],
  ["create", "nav.create", Sparkle],
  ["lyrics", "nav.lyrics", PenLine],
  ["mv", "nav.mv", Film],
  ["projects", "nav.projects", Folder],
  ["library", "nav.library", Library],
] as const;

const manageItems = [
  ["suno-tools", "nav.tools", Music],
  ["tasks", "nav.tasks", ListTodo],
  ["api-capabilities", "nav.api", Cpu],
  ["billing", "nav.billing", Receipt],
  ["settings", "nav.settings", Gear],
] as const;

const MOBILE_SIDEBAR_QUERY = "(max-width: 1023px)";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sidebar({
  view,
  onChange,
  counts,
  session,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const { language, t } = useI18n();
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeHandlerRef = useRef(onMobileClose);
  const [mobileViewport, setMobileViewport] = useState(
    () => window.matchMedia(MOBILE_SIDEBAR_QUERY).matches,
  );
  closeHandlerRef.current = onMobileClose;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileViewport || !mobileOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeHandlerRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      const focusable = [
        ...sidebar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ].filter(
        (element) =>
          !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sidebar.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sidebar.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      const previousFocus = previousFocusRef.current;
      window.requestAnimationFrame(
        () => previousFocus?.isConnected && previousFocus.focus(),
      );
    };
  }, [mobileOpen, mobileViewport]);

  const navigate = (next: View) => {
    onChange(next);
    onMobileClose?.();
  };

  const item = ([value, labelKey, Icon]:
    | (typeof primaryItems)[number]
    | (typeof manageItems)[number]) => {
    const badge = value === "tasks" ? counts.inflight : undefined;
    return (
      <button
        key={value}
        type="button"
        onClick={() => navigate(value)}
        aria-current={view === value ? "page" : undefined}
        className={`nav-item ${view === value ? "nav-item-active" : ""}`}
      >
        <Icon width={18} height={18} aria-hidden="true" />
        <span className="flex-1 text-left">{t(labelKey)}</span>
        {badge ? (
          <span
            className="nav-badge"
            aria-label={`${badge} ${language === "zh-CN" ? "个进行中任务" : "active tasks"}`}
          >
            {badge}
          </span>
        ) : null}
      </button>
    );
  };

  const initials = session.user?.name?.slice(0, 1).toLocaleUpperCase() || "M";
  const subscription = session.account?.subscription;
  const canViewApiCapabilities = session.user?.role === "admin";
  const visibleManageItems = manageItems.filter(
    ([value]) => value !== "api-capabilities" || canViewApiCapabilities,
  );
  const mobileHidden = mobileViewport && !mobileOpen;

  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          type="button"
          aria-label={
            language === "zh-CN" ? "关闭导航遮罩" : "Close navigation overlay"
          }
          onClick={onMobileClose}
        />
      )}
      <aside
        ref={sidebarRef}
        id="app-sidebar"
        className={`app-sidebar ${mobileOpen ? "app-sidebar-open" : ""}`}
        aria-label={language === "zh-CN" ? "应用侧栏" : "Application sidebar"}
        aria-hidden={mobileHidden || undefined}
        inert={mobileHidden || undefined}
      >
        <div className="flex h-[72px] items-center gap-3 px-4">
          <button
            type="button"
            className="brand-mark"
            onClick={() => navigate("explore")}
            aria-label={
              language === "zh-CN" ? "MuseFlow 创作首页" : "Gen Alloy home"
            }
          >
            <Music width={19} height={19} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="brand-word">Gen Alloy</div>
            <div className="text-[10px] tracking-wide text-muted">
              AI Music Studio
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-btn lg:hidden"
            onClick={onMobileClose}
            aria-label={language === "zh-CN" ? "关闭导航" : "Close navigation"}
          >
            <X width={17} height={17} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            className="btn-primary w-full justify-center"
            onClick={() => navigate("create")}
          >
            <Sparkle width={15} height={15} />
            <span>{t("nav.startCreate")}</span>
          </button>
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
          aria-label={language === "zh-CN" ? "主导航" : "Main navigation"}
        >
          <div className="nav-section-label !text-muted">
            {t("nav.createGroup")}
          </div>
          <div className="space-y-1">{primaryItems.map(item)}</div>
          <div className="nav-section-label mt-6 !text-muted">
            {t("nav.manageGroup")}
          </div>
          <div className="space-y-1">{visibleManageItems.map(item)}</div>
        </nav>

        <div className="m-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="mb-3 flex items-center justify-between text-[11px]">
            <span className="text-muted">{t("nav.libraryCount")}</span>
            <span className="font-semibold text-main">
              {counts.total} {language === "zh-CN" ? "首" : "tracks"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-3)] px-2.5 py-2 text-[10px]">
            <span className="text-muted">{t("nav.inflight")}</span>
            <strong className="tabular-nums text-main">
              {counts.inflight}
            </strong>
          </div>
          <div className="mt-2 text-[10px] leading-4 text-muted">
            {subscription?.includedCredits
              ? language === "zh-CN"
                ? `${subscription.name} 每账期包含 ${subscription.includedCredits.toLocaleString()} 积分，实际余额与用量以订单页为准。`
                : `${localizeCatalogText(subscription.name, language)} includes ${subscription.includedCredits.toLocaleString()} credits per cycle. Balance and usage follow the orders page.`
              : language === "zh-CN"
                ? "积分余额、套餐额度与账期以“积分与订单”页为准。"
                : "Balance, plan allowance and cycle details are available on the credits and orders page."}
          </div>
        </div>

        <button
          type="button"
          className="m-3 mt-0 flex items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-[var(--surface-2)]"
          onClick={() => navigate("billing")}
          aria-label={
            language === "zh-CN" ? "查看账户与积分" : "View account and credits"
          }
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-main">
              {session.user?.name || (language === "zh-CN" ? "访客" : "Guest")}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
              <Sparkle width={10} height={10} />{" "}
              {session.account
                ? `${session.account.availableBalance.toLocaleString()} ${t("nav.credits")}`
                : language === "zh-CN"
                  ? "余额待同步"
                  : "Balance pending"}
            </span>
          </span>
        </button>
      </aside>
    </>
  );
}

export function MobileDock({
  view,
  inflight,
  onChange,
  onMore,
}: MobileDockProps) {
  const { language, t } = useI18n();
  const [mobileViewport, setMobileViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(MOBILE_SIDEBAR_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Keep the desktop DOM free of duplicate navigation controls.  CSS hides the
  // dock visually on large screens, but removing it from the accessibility tree
  // as well prevents screen readers and keyboard users from seeing two copies
  // of every route.
  if (!mobileViewport) return null;

  const items = [
    ["explore", "nav.explore", Compass],
    ["create", "nav.create", Sparkle],
    ["library", "nav.library", Library],
    ["tasks", "nav.tasks", ListTodo],
  ] as const;

  return (
    <nav
      className="mobile-dock"
      aria-label={language === "zh-CN" ? "移动端主导航" : "Mobile navigation"}
    >
      {items.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          className={view === value ? "active" : ""}
          aria-current={view === value ? "page" : undefined}
          onClick={() => onChange(value)}
        >
          <span className="mobile-dock-icon">
            <Icon width={20} height={20} />
            {value === "tasks" && inflight > 0 ? (
              <i
                aria-label={`${inflight} ${language === "zh-CN" ? "个进行中任务" : "active tasks"}`}
              >
                {Math.min(inflight, 9)}
              </i>
            ) : null}
          </span>
          <span>{t(label)}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-label={
          language === "zh-CN" ? "打开全部导航" : "Open all navigation"
        }
      >
        <span className="mobile-dock-icon">
          <Menu width={20} height={20} />
        </span>
        <span>{t("nav.manageGroup")}</span>
      </button>
    </nav>
  );
}
