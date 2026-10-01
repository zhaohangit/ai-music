import { useEffect, useRef, useState, type UIEvent } from "react";
import { operationHasQuote } from "../lib/operations";
import { localizeCatalogText, useI18n } from "../i18n";
import type {
  MusicModelProfile,
  MusicOperationProfile,
  SessionSummary,
  ThemeMode,
} from "../types";
import {
  Album,
  ArrowRight,
  Check,
  Crown,
  Menu,
  Moon,
  Music,
  Shield,
  Sparkle,
  Sun,
  Wand,
  X,
} from "./Icons";

interface Props {
  session: SessionSummary;
  models: MusicModelProfile[];
  generationOperation?: MusicOperationProfile;
  modelError?: string | null;
  pricingError?: string | null;
  theme: ThemeMode;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onThemeToggle: () => void;
  onEnter: () => void;
  onLogin: () => void;
}

const showcase = [
  ["夜航星", "Dream Pop · 3:42", "from-violet-500 via-indigo-500 to-cyan-400"],
  [
    "沿海公路",
    "Indie Rock · 4:08",
    "from-orange-500 via-rose-500 to-fuchsia-600",
  ],
  ["失重浪漫", "Synthwave · 3:26", "from-cyan-400 via-blue-600 to-violet-700"],
  [
    "凌晨三点的海",
    "Mandopop · 3:58",
    "from-emerald-400 via-teal-600 to-indigo-800",
  ],
] as const;
const SHOWCASE_EN: Record<string, string> = {
  夜航星: "Night Flight Star",
  沿海公路: "Coastal Highway",
  失重浪漫: "Weightless Romance",
  凌晨三点的海: "Sea at 3 AM",
  末班车之后: "After the Last Train",
};

const publicSections = [
  { id: "features", label: "功能" },
  { id: "showcase", label: "界面示例" },
  { id: "pricing", label: "模型估算" },
  { id: "trust", label: "安全" },
] as const;

export function LandingPage({
  session,
  models,
  generationOperation,
  modelError = null,
  pricingError = null,
  theme,
  menuOpen,
  onMenuOpenChange,
  onThemeToggle,
  onEnter,
  onLogin,
}: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const sectionLabel: Record<(typeof publicSections)[number]["id"], string> = {
    features: text("功能", "Features"),
    showcase: text("界面示例", "Showcase"),
    pricing: text("模型估算", "Model pricing"),
    trust: text("安全", "Security"),
  };
  const pricedModels = models.filter((model) => model.enabled).slice(0, 3);
  const requiresAccountPrice = !session.authenticated;
  const dynamicGenerationPrice =
    session.authenticated && operationHasQuote(generationOperation)
      ? Number(generationOperation?.estimatedCredits)
      : null;
  const priceText = (model: MusicModelProfile | undefined) => {
    if (requiresAccountPrice)
      return text("登录查看账户价格", "Sign in to view account pricing");
    const allowedForModel =
      !generationOperation?.modelIds?.length ||
      Boolean(model && generationOperation.modelIds.includes(model.id));
    return dynamicGenerationPrice !== null && allowedForModel
      ? `${text("预计", "Est.")} ${dynamicGenerationPrice} ${text("积分", "credits")}`
      : text("动态估价不可用", "Dynamic quote unavailable");
  };
  const heroPriceText = priceText(pricedModels[0]);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<
    "top" | (typeof publicSections)[number]["id"]
  >("top");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menuOpen) return;
      onMenuOpenChange(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, onMenuOpenChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() =>
      firstMenuLinkRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  useEffect(() => {
    const scrollToPublicHash = (behavior: ScrollBehavior) => {
      const sectionId = window.location.hash.slice(1);
      if (!publicSections.some(({ id }) => id === sectionId)) return;
      const root = scrollRootRef.current;
      const section = document.getElementById(sectionId);
      if (!root || !section) return;
      const top =
        root.scrollTop +
        section.getBoundingClientRect().top -
        root.getBoundingClientRect().top;
      root.scrollTo?.({ top: Math.max(0, top), behavior });
      section.focus({ preventScroll: true });
    };
    const onHashChange = () =>
      scrollToPublicHash(
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      );
    const frame = window.requestAnimationFrame(() =>
      scrollToPublicHash("auto"),
    );
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    const scrollable = Math.max(1, maxScrollTop);
    setScrollProgress(Math.min(1, Math.max(0, root.scrollTop / scrollable)));

    if (root.scrollTop < 80) {
      setActiveSection("top");
      return;
    }
    if (maxScrollTop > 0 && root.scrollTop >= maxScrollTop - 2) {
      setActiveSection("trust");
      return;
    }
    const marker = root.scrollTop + Math.min(180, root.clientHeight * 0.28);
    let next: (typeof publicSections)[number]["id"] = "features";
    publicSections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element && element.offsetTop <= marker) next = section.id;
    });
    setActiveSection(next);
  };

  const scrollToTop = () => {
    if (publicSections.some(({ id }) => window.location.hash === `#${id}`)) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    setActiveSection("top");
    scrollRootRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      ref={scrollRootRef}
      className="landing h-full overflow-y-auto bg-[var(--app-bg)] text-main"
      data-testid="landing-scroll"
      onScroll={handleScroll}
    >
      <a
        href="#main-content"
        className="skip-link"
        onClick={() => mainContentRef.current?.focus({ preventScroll: true })}
      >
        {text("跳到主要内容", "Skip to main content")}
      </a>
      <header
        className={`landing-header ${scrollProgress > 0.01 ? "landing-header-scrolled" : ""}`}
      >
        <button
          type="button"
          className="flex items-center gap-2.5"
          onClick={scrollToTop}
          aria-label={text("MuseFlow 首页", "Gen Alloy home")}
        >
          <span className="brand-mark">
            <Music width={18} height={18} />
          </span>
          <span className="brand-word text-base">Gen Alloy</span>
        </button>
        <nav
          className="hidden items-center gap-7 text-sm text-muted md:flex"
          aria-label={text("公开导航", "Public navigation")}
        >
          {publicSections.map(({ id }) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeSection === id ? "active" : ""}
              aria-current={activeSection === id ? "location" : undefined}
            >
              {sectionLabel[id]}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="icon-btn"
            onClick={onThemeToggle}
            aria-label={
              theme === "light"
                ? text("切换深色主题", "Switch to dark theme")
                : text("切换浅色主题", "Switch to light theme")
            }
          >
            {theme === "light" ? (
              <Moon width={17} height={17} />
            ) : (
              <Sun width={17} height={17} />
            )}
          </button>
          <button
            type="button"
            className="btn-ghost hidden sm:inline-flex"
            onClick={session.authenticated ? onEnter : onLogin}
          >
            {session.authenticated
              ? text("进入工作台", "Open workbench")
              : text("登录", "Sign in")}
          </button>
          <button
            type="button"
            className="btn-primary hidden sm:inline-flex"
            onClick={onEnter}
          >
            {session.authenticated
              ? text("继续创作", "Continue creating")
              : text("免费开始", "Start free")}{" "}
            <ArrowRight width={15} height={15} />
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-btn md:hidden"
            onClick={() => onMenuOpenChange(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-public-nav"
            aria-label={
              menuOpen
                ? text("关闭导航", "Close navigation")
                : text("打开导航", "Open navigation")
            }
          >
            {menuOpen ? (
              <X width={19} height={19} />
            ) : (
              <Menu width={19} height={19} />
            )}
          </button>
        </div>
        <span className="landing-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${scrollProgress})` }} />
        </span>
      </header>

      {menuOpen && (
        <nav
          id="mobile-public-nav"
          className="mobile-public-nav md:hidden"
          aria-label={text("移动端公开导航", "Mobile public navigation")}
        >
          {publicSections.map(({ id }, index) => (
            <a
              ref={index === 0 ? firstMenuLinkRef : undefined}
              key={id}
              href={`#${id}`}
              onClick={() => onMenuOpenChange(false)}
              className={activeSection === id ? "active" : ""}
              aria-current={activeSection === id ? "location" : undefined}
            >
              <span>0{index + 1}</span>
              {sectionLabel[id]}
              <ArrowRight width={14} height={14} />
            </a>
          ))}
          <button
            type="button"
            className="btn-primary mt-2 w-full"
            onClick={() => {
              onMenuOpenChange(false);
              onEnter();
            }}
          >
            {session.authenticated
              ? text("继续创作", "Continue creating")
              : text("登录并开始创作", "Sign in to start creating")}{" "}
            <ArrowRight width={15} height={15} />
          </button>
        </nav>
      )}

      <main ref={mainContentRef} id="main-content" tabIndex={-1}>
        <section className="hero-section">
          <div className="relative z-10 mx-auto max-w-5xl px-5 text-center">
            <div className="hero-kicker">
              <Sparkle width={14} height={14} />{" "}
              {text(
                "从一句灵感，到一首完整歌曲",
                "From one idea to a complete song",
              )}
            </div>
            <h1 className="mt-7 text-balance text-5xl font-semibold tracking-normal sm:text-6xl lg:text-[78px] lg:leading-[1.02]">
              {text("让每一个想法，", "Give every idea")}
              <br />
              <span className="gradient-text">
                {text("都有自己的声音", "its own voice")}
              </span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-balance text-base leading-8 text-muted sm:text-lg">
              {text(
                "AI 歌词、风格优化与 Suno 音乐生成汇聚在同一个专业工作台。无需理解模型参数，也能创作、管理并继续打磨每一首作品。",
                "AI lyrics, style refinement and Suno generation come together in one professional workbench. Create, manage and refine every track without learning model parameters.",
              )}
            </p>
            <div className="hero-actions mt-9 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="btn-primary min-w-40 px-6 py-3"
                onClick={onEnter}
              >
                <Wand width={17} height={17} />{" "}
                {text("开始创作", "Start creating")}
              </button>
              <a
                href="#showcase"
                className="btn-ghost min-w-36 border !border-[var(--line)] px-6 py-3"
              >
                <Album width={14} height={14} />{" "}
                {text("查看界面示例", "View the showcase")}
              </a>
            </div>
            <div className="hero-proof mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-subtle">
              <span className="inline-flex items-center gap-1">
                <Check width={12} height={12} className="text-emerald-400" />{" "}
                {text(
                  "新用户可预览完整流程",
                  "New users can preview the full flow",
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <Check width={12} height={12} className="text-emerald-400" />{" "}
                {text(
                  "生成前显示预计积分",
                  "Estimated credits are shown before generation",
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <Check width={12} height={12} className="text-emerald-400" />{" "}
                {text("失败自动退款", "Failed jobs are refunded automatically")}
              </span>
            </div>
            <a
              href="#features"
              className="hero-scroll-hint"
              aria-label={text(
                "向下查看完整创作流程",
                "Explore the full creation flow below",
              )}
            >
              <span>
                {text("向下探索完整创作流程", "Explore the full creation flow")}
              </span>
              <ArrowRight width={14} height={14} />
            </a>
          </div>

          <div
            className="hero-studio"
            aria-label={text(
              "Gen Alloy 创作台预览",
              "Gen Alloy workbench preview",
            )}
          >
            <div className="hero-studio-bar">
              <span />
              <span />
              <span />
              <strong>Gen Alloy · AI Music Studio</strong>
              <b>
                <i /> {text("产品交互预览", "Product interaction preview")}
              </b>
            </div>
            <div className="hero-studio-body">
              <div className="hero-preview-nav">
                <span className="brand-mark !h-8 !w-8">
                  <Music width={14} height={14} />
                </span>
                {[1, 2, 3, 4, 5].map((item) => (
                  <i key={item} className={item === 1 ? "active" : ""} />
                ))}
              </div>
              <div className="hero-preview-form">
                <small>SONG IDEA</small>
                <div className="hero-preview-title">
                  {text(
                    "凌晨三点，错过末班车的城市情歌",
                    "A city love song at 3 AM after missing the last train",
                  )}
                </div>
                <div className="mt-5 h-20 rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-3 text-left text-[10px] leading-5 text-muted">
                  {text(
                    "华语 Dream Pop，温柔女声，雨夜霓虹，副歌层层推进，电影感合成器……",
                    "Mandarin Dream Pop, soft female vocals, rainy neon, a rising chorus and cinematic synths…",
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <b>{text("AI 优化", "AI refine")}</b>
                  <b>{text("歌词建议", "Lyrics suggestions")}</b>
                </div>
                <span className="hero-preview-submit" aria-hidden="true">
                  {text("生成 2 首歌曲", "Generate 2 songs")} · {heroPriceText}
                </span>
              </div>
              <div className="hero-preview-result">
                <small>GENERATIONS</small>
                {[
                  [
                    text("凌晨三点的海", "Sea at 3 AM"),
                    text("版本 A · 03:58", "Version A · 03:58"),
                  ],
                  [
                    text("末班车之后", "After the Last Train"),
                    text("版本 B · 03:41", "Version B · 03:41"),
                  ],
                ].map(([title, meta], index) => (
                  <div key={title} className="hero-song-card">
                    <span
                      className={`bg-gradient-to-br ${index ? showcase[1][2] : showcase[0][2]}`}
                    >
                      <Music width={13} height={13} />
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <small>{meta}</small>
                    </div>
                    <i>{index ? text("完成", "Done") : "86%"}</i>
                  </div>
                ))}
              </div>
              <div className="hero-preview-model">
                <small>MODEL & SETTINGS</small>
                <div className="hero-preview-model-title">
                  {pricedModels[0]?.displayName ||
                    text("动态模型", "Live model")}
                </div>
                <p>
                  {text("旗舰品质 · 推荐", "Flagship quality · recommended")}
                </p>
                <hr />
                <small>
                  {requiresAccountPrice
                    ? text("MODELCROSS 账户报价", "MODELCROSS ACCOUNT PRICING")
                    : text("动态预计消耗", "LIVE ESTIMATE")}
                </small>
                <strong>{heroPriceText}</strong>
                <div className="mt-5 h-1.5 rounded-full bg-[var(--surface-4)]">
                  <span className="block h-full w-2/3 rounded-full bg-gradient-to-r from-accent to-coral" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="landing-section" tabIndex={-1}>
          <div className="section-heading">
            <span>{text("完整创作流程", "Complete creation flow")}</span>
            <h2>
              {text(
                "不只生成，更懂得如何完成一首歌",
                "More than generation: finish the whole song",
              )}
            </h2>
            <p>
              {text(
                "从灵感、歌词到生成、版本管理和继续创作，所有环节都留在一个连贯的工作空间。",
                "From ideas and lyrics to generation, versioning and continuation, every step stays in one connected workspace.",
              )}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                Wand,
                text("AI 创作伙伴", "AI creative partner"),
                text(
                  "生成歌词、续写副歌、重塑押韵、翻译以及风格扩写。每次建议都先预览，再由你决定是否应用。",
                  "Generate lyrics, continue choruses, refine rhymes, translate and expand styles. Preview every suggestion before applying it.",
                ),
              ],
              [
                Music,
                text("双版本音乐生成", "Two-version music generation"),
                text(
                  "一次提交获得两个独立版本。实时查看排队、生成、资产处理与退款状态。",
                  "Get two independent versions from one submission and track queueing, generation, asset processing and refunds live.",
                ),
              ],
              [
                Album,
                text("项目化作品管理", "Project-based organization"),
                text(
                  "把歌曲归入项目与专辑，保留参数、歌词版本和派生关系，随时续写、翻唱或高清重制。",
                  "Organize tracks into projects and albums while keeping settings, lyric versions and derivations for future extensions, covers or remasters.",
                ),
              ],
            ].map(([Icon, title, copy], index) => (
              <article key={String(title)} className="feature-card">
                <span className="feature-number">0{index + 1}</span>
                <span className="feature-icon">
                  <Icon width={22} height={22} />
                </span>
                <h3>{String(title)}</h3>
                <p>{String(copy)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="showcase" className="landing-section" tabIndex={-1}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="section-heading !mx-0 !text-left">
              <span>
                {text(
                  "公开界面预览 · 演示内容",
                  "Public preview · demo content",
                )}
              </span>
              <h2>
                {text(
                  "看看作品管理完成后的样子",
                  "See the finished library experience",
                )}
              </h2>
              <p>
                {text(
                  "以下标题和封面仅用于展示界面布局，不是可播放或公开发布的真实用户作品。",
                  "These titles and covers illustrate the layout only; they are not playable or public user tracks.",
                )}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost border !border-[var(--line)]"
              onClick={onEnter}
            >
              {text("登录后查看自己的作品库", "Sign in to view your library")}{" "}
              <ArrowRight width={14} height={14} />
            </button>
          </div>
          <div className="mt-9 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {showcase.map(([title, meta, gradient], index) => (
              <article key={title} className="group showcase-card">
                <div
                  className={`showcase-cover bg-gradient-to-br ${gradient}`}
                  aria-hidden="true"
                >
                  <span className="cover-noise" />
                  <span className="showcase-mark">
                    <Music width={18} height={18} />
                  </span>
                  <em>0{index + 1}</em>
                </div>
                <h3>{text(title, SHOWCASE_EN[title] ?? title)}</h3>
                <p>{meta}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="landing-section" tabIndex={-1}>
          <div className="section-heading">
            <span>
              {requiresAccountPrice
                ? text("账户动态报价", "Account pricing")
                : text("动态模型目录", "Live model catalog")}
            </span>
            <h2>
              {text(
                "生成前展示预计积分",
                "See estimated credits before generation",
              )}
            </h2>
            <p>
              {requiresAccountPrice
                ? text(
                    "音乐生成一次返回两个独立版本。登录后会按当前账户、模型权限与价格版本读取 ModelCross 服务端报价，匿名页面不展示缓存或演示价格。",
                    "Each generation returns two independent versions. After sign-in, ModelCross quotes are read for this account, its model access and active price version; anonymous pages never show cached or demo prices.",
                  )
                : text(
                    "这里仅展示 ModelCross 动作目录返回的双版本生成动态估价，不出售积分包；可购买商品、币种和价格只在统一钱包实时呈现。",
                    "This section shows only the live two-version estimate from the ModelCross operation catalog. Credit packs, currencies and purchase prices are shown in the unified wallet.",
                  )}
            </p>
          </div>
          {modelError && session.authenticated && (
            <div
              className="mx-auto mb-4 max-w-3xl rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-center text-xs text-rose-300"
              role="alert"
            >
              {modelError}
              {text(
                "。未使用演示模型替代。",
                ". Demo models were not used as a replacement.",
              )}
            </div>
          )}
          {pricingError && session.authenticated && (
            <div
              className="mx-auto mb-4 max-w-3xl rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-center text-xs text-rose-300"
              role="alert"
            >
              {pricingError}
              {text(
                "。未使用缓存或演示价格替代。",
                ". Cached or demo prices were not used as a replacement.",
              )}
            </div>
          )}
          {pricedModels.length ? (
            <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
              {pricedModels.map((model, index) => (
                <article
                  key={model.id}
                  className={`pricing-card ${index === 0 ? "pricing-card-featured" : ""}`}
                >
                  {index === 0 && (
                    <span className="pricing-popular">
                      <Crown width={12} height={12} />{" "}
                      {text("当前推荐", "Recommended")}
                    </span>
                  )}
                  <h3>{model.displayName}</h3>
                  <div className="price">{priceText(model)}</div>
                  <p>
                    <strong>{text("一次生成", "One generation")}</strong> ·{" "}
                    {text("两个独立版本", "two independent versions")}
                  </p>
                  <ul>
                    <li>
                      <Check width={14} height={14} />{" "}
                      {localizeCatalogText(model.description, language)}
                    </li>
                    <li>
                      <Check width={14} height={14} />{" "}
                      {text("支持：", "Supports: ")}
                      {model.capabilities.operations
                        .map((operation) =>
                          localizeCatalogText(operation, language),
                        )
                        .join(" / ")}
                    </li>
                    <li>
                      <Check width={14} height={14} />{" "}
                      {text(
                        "最终消费以服务端价格版本与账单为准",
                        "Final usage follows the server price version and billing",
                      )}
                    </li>
                  </ul>
                  <button
                    type="button"
                    className={
                      index === 0
                        ? "btn-primary w-full"
                        : "btn-ghost w-full border !border-[var(--line)]"
                    }
                    onClick={onEnter}
                  >
                    {session.authenticated
                      ? text("进入创作台", "Open workbench")
                      : text(
                          "登录查看账户价格",
                          "Sign in to view account pricing",
                        )}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl rounded-3xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] p-8 text-center">
              <h3 className="text-sm font-semibold text-main">
                {text("模型估算暂不可用", "Model pricing unavailable")}
              </h3>
              <p className="mt-2 text-xs text-muted">
                {text(
                  "登录后可在工作台重新加载动态模型目录；页面不会编造价格或可购买商品。",
                  "Sign in to reload the live model catalog from the workbench; no prices or products are fabricated.",
                )}
              </p>
              <button
                type="button"
                className="btn-primary mt-4"
                onClick={session.authenticated ? onEnter : onLogin}
              >
                {session.authenticated
                  ? text("返回工作台", "Back to workbench")
                  : text("登录", "Sign in")}
              </button>
            </div>
          )}
        </section>

        <section id="trust" className="landing-section pb-24" tabIndex={-1}>
          <div className="trust-banner">
            <span className="feature-icon">
              <Shield width={24} height={24} />
            </span>
            <div>
              <h2>
                {text(
                  "你的创作与资产，始终由你掌控",
                  "You stay in control of your work and assets",
                )}
              </h2>
              <p>
                {text(
                  "统一账号、服务端会话、私有对象存储、幂等扣费与可追踪任务。供应商密钥不会进入浏览器，音频访问由用户身份隔离。",
                  "Unified identity, server sessions, private object storage, idempotent billing and traceable tasks. Provider keys never enter the browser, and audio access is isolated by user identity.",
                )}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost shrink-0 border !border-[var(--line)]"
              onClick={onEnter}
            >
              {text("了解工作台", "Learn about the workbench")}{" "}
              <ArrowRight width={14} height={14} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--line)] px-5 py-8 text-xs text-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5">
          <span>© 2026 Gen Alloy · AI Music Studio</span>
          <span>
            {text(
              "账户、支付条款、隐私与退款政策由 ModelCross 账户中心统一提供",
              "Accounts, payment terms, privacy and refunds are provided by the ModelCross account center",
            )}
          </span>
          <span className="inline-flex items-center gap-3">
            Music generation powered by configured providers{" "}
            <button
              type="button"
              className="footer-top-button"
              onClick={scrollToTop}
              aria-label={text("返回页面顶部", "Back to top")}
            >
              <ArrowRight width={13} height={13} />
            </button>
          </span>
        </div>
      </footer>
    </div>
  );
}
