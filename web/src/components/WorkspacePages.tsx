import { MvTasksPanel } from "./MvTasksPanel";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import type {
  AccountSummary,
  AiAssistAction,
  AudioUpload,
  BillingOrder,
  BillingSummary,
  MusicModelProfile,
  MusicProject,
  PlatformTask,
  ThemeMode,
  UserProfile,
} from "../types";
import { localizeCatalogText, useI18n } from "../i18n";
import { fmtAgoLocalized } from "../lib/format";
import { modelLabel, operationLabel } from "../types";
import type { FormState } from "./CreatePanel";
import { StructuredLyricsEditor } from "./LyricsEditor";
import { SettingsPanel } from "./SettingsPanel";
import {
  Album,
  ArrowRight,
  Check,
  Chevron,
  Clock,
  Copy,
  Crown,
  External,
  Folder,
  Gear,
  History,
  Languages,
  ListTodo,
  Lock,
  More,
  Music,
  PenLine,
  Plus,
  Receipt,
  Refresh,
  Shield,
  Sparkle,
  Spinner,
  Trash,
  User,
  Wand,
  X,
} from "./Icons";

function DataError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: string;
  onRetry: () => void;
}) {
  const { language } = useI18n();
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.065] px-4 py-3"
      role="alert"
    >
      <div>
        <strong className="text-xs text-rose-300">{title}</strong>
        <p className="mt-1 text-[11px] text-rose-200/80">
          {error}
          {language === "zh-CN"
            ? "。页面没有使用演示数据替代。"
            : ". Demo data is not used as a replacement."}
        </p>
      </div>
      <button
        type="button"
        className="btn-ghost border !border-rose-400/20 text-xs"
        onClick={onRetry}
      >
        {language === "zh-CN" ? "重试" : "Retry"}
      </button>
    </div>
  );
}

function formatMinorCurrency(
  amountMinor: number,
  currency: string,
): string | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !currency.trim())
    return null;
  const code = currency.trim().toUpperCase();
  try {
    const formatter = new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: code,
    });
    const fractionDigits =
      formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountMinor / 10 ** fractionDigits);
  } catch {
    return `${code} ${amountMinor.toLocaleString()}`;
  }
}

function BillingOrderValue({ order }: { order: BillingOrder }) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const credits =
    typeof order.credits === "number" && Number.isFinite(order.credits)
      ? order.credits
      : null;
  if (credits !== null)
    return (
      <div className="w-24 text-right">
        <strong className={credits < 0 ? "text-rose-400" : "text-emerald-400"}>
          {credits > 0 ? "+" : ""}
          {credits.toLocaleString()}
        </strong>
        <small>{text("积分", "credits")}</small>
      </div>
    );
  const payment =
    typeof order.amountMinor === "number" && order.currency
      ? formatMinorCurrency(order.amountMinor, order.currency)
      : null;
  return (
    <div className="w-24 text-right">
      <strong className="text-main">
        {payment ?? text("待同步", "Pending sync")}
      </strong>
      <small>{text("支付金额", "Payment")}</small>
    </div>
  );
}

/** Shared page chrome for workspace routes.  The topbar keeps global controls;
 * each route owns its content title so the hierarchy remains visible when the
 * page is opened directly or the topbar is collapsed on small screens. */
function WorkspacePageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: typeof Gear;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-page-header">
      <div className="flex min-w-0 items-center gap-3">
        <span className="workspace-page-icon">
          <Icon width={19} height={19} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-main">
            {title}
          </h1>
          <p className="mt-1 truncate text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {actions ? <div className="workspace-page-actions">{actions}</div> : null}
    </header>
  );
}

export function LyricsStudio({
  form,
  onFormChange,
  onOpenAi,
  onCreateSong,
  onSaveDraft,
  draftSavedAt,
}: {
  form: FormState;
  onFormChange: (form: FormState) => void;
  onOpenAi: (action: AiAssistAction) => void;
  onCreateSong: () => void;
  onSaveDraft: () => void;
  draftSavedAt: string | null;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const ago = (iso: string) => fmtAgoLocalized(iso, language);
  const [rhymeWord, setRhymeWord] = useState("光芒");
  const [subject, setSubject] = useState("城市霓虹与失落记忆");
  const [genre, setGenre] = useState("Synthwave / Electronic Pop");
  const [mood, setMood] = useState("忧郁深邃");
  const [rhymeScheme, setRhymeScheme] = useState("AABB 双韵");
  const rhymeWords = [
    "飞翔",
    "屏障",
    "乐章",
    "回响",
    "流淌",
    "迷茫",
    "坚强",
    "期望",
  ];
  const copyAll = async () => {
    try {
      await navigator.clipboard?.writeText(form.lyrics);
    } catch {
      // Clipboard permissions may be unavailable in an embedded preview.
    }
  };
  return (
    <div className="page-scroll">
      <WorkspacePageHeader
        icon={PenLine}
        title={text("歌词工作室", "Lyrics Studio")}
        subtitle={text(
          "段落结构编辑、韵脚检查、多语种对照与歌词润色",
          "Edit sections, check rhymes, compare languages and refine lyrics",
        )}
        actions={
          <>
            <button
              type="button"
              className="btn-ghost border !border-[var(--line)]"
              onClick={onSaveDraft}
            >
              <Check width={14} height={14} /> {text("保存草稿", "Save draft")}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onCreateSong}
            >
              <Sparkle width={14} height={14} />{" "}
              {text("发送到创作页", "Send to workbench")}{" "}
              <ArrowRight width={13} height={13} />
            </button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-[1500px] p-4 lg:p-6">
        <section className="lyrics-template-strip surface-card mb-5 flex min-w-0 items-center gap-3 overflow-x-auto px-4 py-3">
          <span className="shrink-0 text-[11px] font-semibold text-muted">
            {text("经典结构模板", "Classic structure templates")}
          </span>
          {["赛博夜影", "雨后咖啡屋", "无垠追光", "城市失落记忆"].map(
            (template) => (
              <button
                key={template}
                type="button"
                className="template-chip shrink-0"
                onClick={() =>
                  onFormChange({
                    ...form,
                    title: form.title || template,
                    style: form.style || template,
                  })
                }
              >
                {text(
                  template,
                  (
                    {
                      赛博夜影: "Neon after dark",
                      雨后咖啡屋: "Cafe after rain",
                      无垠追光: "Endless light",
                      城市失落记忆: "Lost city memories",
                    } as Record<string, string>
                  )[template],
                )}
              </button>
            ),
          )}
        </section>
        <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
          <section className="surface-card min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-5">
              <div>
                <span className="eyebrow">LYRICS DOCUMENT</span>
                <h2 className="mt-2 text-xl font-semibold text-main">
                  {form.title || text("未命名歌词", "Untitled lyrics")}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {text(
                    "AI 修改确认后会保留服务端版本；手动草稿仅保存在当前设备。",
                    "Confirmed AI edits are kept as server versions; manual drafts stay on this device.",
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost border !border-[var(--line)]"
                  onClick={onSaveDraft}
                >
                  <Check width={14} height={14} />{" "}
                  {text("保存到此设备", "Save on this device")}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onCreateSong}
                >
                  <Sparkle width={14} height={14} />{" "}
                  {text("用这份歌词创作", "Create with these lyrics")}
                </button>
              </div>
            </div>
            <div
              className="lyrics-editor-toolbar border-b border-[var(--line)] p-4"
              role="toolbar"
              aria-label={text("歌词编辑工具", "Lyrics editing tools")}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="icon-btn border border-[var(--line)]"
                  disabled
                  aria-label={text("撤销编辑", "Undo edit")}
                  title={text("撤销编辑", "Undo edit")}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="icon-btn border border-[var(--line)]"
                  disabled
                  aria-label={text("重做编辑", "Redo edit")}
                  title={text("重做编辑", "Redo edit")}
                >
                  ↷
                </button>
                <span className="status-chip tone-success ml-1">
                  <Check width={11} height={11} />{" "}
                  {draftSavedAt
                    ? text("已保存", "Saved")
                    : text("未保存", "Unsaved")}
                </span>
              </div>
              <span className="toolbar-divider hidden sm:block" />
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                onClick={() => onOpenAi("lyrics.rewrite")}
              >
                <Sparkle width={13} height={13} />{" "}
                {text("优化押韵", "Refine rhyme")}
              </button>
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                onClick={() => onOpenAi("lyrics.continue")}
              >
                <Wand width={13} height={13} />{" "}
                {text("扩写副歌", "Expand chorus")}
              </button>
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                onClick={() => onOpenAi("lyrics.translate")}
              >
                <Languages width={13} height={13} />{" "}
                {text("中英对照翻译", "Chinese / English translation")}
              </button>
              <button
                type="button"
                className="btn-ghost border !border-[var(--line)]"
                onClick={() => void copyAll()}
              >
                <Copy width={13} height={13} /> {text("复制全部", "Copy all")}
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="lyrics-title" className="parameter-label">
                    {text("歌曲标题", "Song title")}
                  </label>
                  <input
                    id="lyrics-title"
                    className="field"
                    value={form.title}
                    onChange={(event) =>
                      onFormChange({ ...form, title: event.target.value })
                    }
                    placeholder={text("给歌词起一个名字", "Name these lyrics")}
                  />
                </div>
                <div>
                  <label htmlFor="lyrics-style" className="parameter-label">
                    {text("目标风格", "Target style")}
                  </label>
                  <input
                    id="lyrics-style"
                    className="field"
                    value={form.style}
                    onChange={(event) =>
                      onFormChange({ ...form, style: event.target.value })
                    }
                    placeholder={text(
                      "华语流行、女声、电影感……",
                      "Mandarin pop, female vocal, cinematic…",
                    )}
                  />
                </div>
              </div>
              <StructuredLyricsEditor
                value={form.lyrics}
                onChange={(lyrics) =>
                  onFormChange({
                    ...form,
                    lyrics,
                    mode: "custom",
                    instrumental: false,
                  })
                }
                maxLength={5000}
              />
            </div>
          </section>
          <aside className="space-y-5">
            <section className="surface-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="feature-icon !h-8 !w-8">
                  <Sparkle width={14} height={14} />
                </span>
                <h2 className="field-title">
                  {text("韵脚与近义词库", "Rhymes & synonyms")}
                </h2>
              </div>
              <div className="flex gap-2">
                <input
                  className="field min-w-0 !py-2 text-xs"
                  aria-label={text("押韵词", "Rhyme word")}
                  value={rhymeWord}
                  onChange={(event) => setRhymeWord(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost border !border-amber-400/30 !text-amber-600"
                  onClick={() => undefined}
                >
                  {text("检索", "Search")}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted">
                {text("同韵词推荐", "Suggested rhymes")} ({rhymeWords.length}):
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rhymeWords.map((word) => (
                  <button
                    type="button"
                    className="chip"
                    key={word}
                    onClick={() => void navigator.clipboard?.writeText(word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </section>
            <section className="surface-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="feature-icon !h-8 !w-8">
                  <Album width={14} height={14} />
                </span>
                <h2 className="field-title">
                  {text("风格与结构设置", "Style & structure")}
                </h2>
              </div>
              <label className="field-help !mt-0" htmlFor="lyrics-subject">
                {text("主题与叙事", "Theme & narrative")}
                <input
                  id="lyrics-subject"
                  className="field mt-2 !py-2 text-xs"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label className="field-help block" htmlFor="lyrics-genre">
                {text("曲风定位", "Genre direction")}
                <input
                  id="lyrics-genre"
                  className="field mt-2 !py-2 text-xs"
                  value={genre}
                  onChange={(event) => setGenre(event.target.value)}
                />
              </label>
              <label className="field-help block" htmlFor="lyrics-mood">
                {text("情绪氛围", "Mood")}
                <select
                  id="lyrics-mood"
                  className="field mt-2 !py-2 text-xs"
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                >
                  <option>{text("忧郁深邃", "Deep melancholy")}</option>
                  <option>{text("热烈激情", "Passionate")}</option>
                  <option>{text("温暖治愈", "Warm & healing")}</option>
                  <option>{text("狂放霸气", "Bold & fierce")}</option>
                </select>
              </label>
              <label className="field-help block" htmlFor="lyrics-rhyme-scheme">
                {text("押韵结构", "Rhyme scheme")}
                <select
                  id="lyrics-rhyme-scheme"
                  className="field mt-2 !py-2 text-xs"
                  value={rhymeScheme}
                  onChange={(event) => setRhymeScheme(event.target.value)}
                >
                  <option>{text("AABB 双韵", "AABB")}</option>
                  <option>{text("ABAB 交替", "ABAB")}</option>
                  <option>{text("自由押韵", "Free rhyme")}</option>
                </select>
              </label>
            </section>
            <section className="surface-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="field-title">
                  {text("AI 歌词工具", "AI lyric tools")}
                </h2>
                <span className="status-chip status-chip-ai">
                  <Sparkle width={10} height={10} /> {text("可预览", "Preview")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  [
                    "lyrics.generate",
                    text("生成歌词", "Generate lyrics"),
                    text("从主题开始", "Start from a theme"),
                    Sparkle,
                  ],
                  [
                    "lyrics.continue",
                    text("续写段落", "Continue a section"),
                    text("保持上下文", "Keep context"),
                    PenLine,
                  ],
                  [
                    "lyrics.rewrite",
                    text("润色押韵", "Refine rhyme"),
                    text("增强记忆点", "Improve memorability"),
                    Wand,
                  ],
                  [
                    "lyrics.translate",
                    text("翻译歌词", "Translate lyrics"),
                    text("保留可唱性", "Keep it singable"),
                    ArrowRight,
                  ],
                ].map(([action, title, desc, Icon]) => (
                  <button
                    key={String(action)}
                    type="button"
                    className="tool-tile"
                    onClick={() => onOpenAi(action as AiAssistAction)}
                  >
                    <Icon width={16} height={16} />
                    <strong>{String(title)}</strong>
                    <small>{String(desc)}</small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-2 flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-main hover:border-accent/30"
                onClick={() => onOpenAi("title.suggest")}
              >
                <span className="flex items-center gap-2">
                  <Sparkle
                    width={13}
                    height={13}
                    className="text-accent-soft"
                  />{" "}
                  {text("根据歌词建议标题", "Suggest a title from lyrics")}
                </span>
                <ArrowRight width={13} height={13} />
              </button>
            </section>
            <section className="surface-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="field-title">
                  {text("本地草稿", "Local draft")}
                </h2>
                <History width={14} height={14} className="text-muted" />
              </div>
              {draftSavedAt ? (
                <div
                  className="revision-row active"
                  aria-label={text("已保存的本地草稿", "Saved local draft")}
                >
                  <span className="revision-dot" />
                  <span className="min-w-0 flex-1">
                    <strong>
                      {text("当前设备草稿", "Draft on this device")}
                    </strong>
                    <small>
                      {form.lyrics.length}{" "}
                      {text(
                        "字符 · 不会跨设备同步",
                        "characters · not synced across devices",
                      )}
                    </small>
                  </span>
                  <time>{ago(draftSavedAt)}</time>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-[11px] leading-5 text-muted">
                  {text(
                    "尚未手动保存。点击“保存到此设备”后会记录保存时间；浏览器清理站点数据时草稿也会被删除。",
                    "Nothing has been saved manually. Save on this device to record the time; clearing site data also removes the draft.",
                  )}
                </p>
              )}
            </section>
            <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.055] p-4 text-[11px] leading-5 text-emerald-200/80">
              <Shield width={15} height={15} className="mb-2" />
              {text(
                "AI 建议只会处理当前文档内容；原文、建议和你的应用选择都会保留审计记录。",
                "AI suggestions process only the current document; the original, suggestion and your choices are retained in the audit trail.",
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage({
  projects,
  error,
  loading,
  onRetry,
  onOpenCreate,
  onOpenProject,
  onArchiveProject,
}: {
  projects: MusicProject[];
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  onOpenCreate: () => void;
  onOpenProject: (project: MusicProject) => void;
  onArchiveProject: (project: MusicProject) => void;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const ago = (iso: string) => fmtAgoLocalized(iso, language);
  const colors = [
    "from-violet-500 to-indigo-800",
    "from-orange-400 to-rose-700",
    "from-cyan-400 to-blue-800",
    "from-emerald-400 to-teal-800",
  ];
  return (
    <div className="page-scroll">
      <div className="mx-auto max-w-[1500px] p-5 lg:p-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">
              {text("整理你的音乐", "Organize your music")}
            </span>
            <h2 className="mt-2 text-2xl font-semibold text-main">
              {text("项目与专辑", "Projects & albums")}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {text(
                "把灵感、歌词和不同生成版本整理成完整作品。",
                "Bring ideas, lyrics and generated versions together into complete works.",
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <span className="status-chip">
                <Spinner width={11} height={11} /> {text("同步中", "Syncing")}
              </span>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenCreate}
            >
              <Plus width={15} height={15} /> {text("新建项目", "New project")}
            </button>
          </div>
        </div>
        {error && (
          <DataError
            title={text(
              "项目暂时不可用",
              "Projects are temporarily unavailable",
            )}
            error={error}
            onRetry={onRetry}
          />
        )}
        {projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => (
              <article key={project.id} className="project-card relative">
                <div
                  className={`project-cover bg-gradient-to-br ${colors[index % colors.length]}`}
                >
                  <span className="cover-noise" />
                  <Album width={35} height={35} />
                  <button
                    type="button"
                    aria-label={`${project.title} ${text("更多操作", "More actions")}`}
                    aria-expanded={menuProjectId === project.id}
                    onClick={() =>
                      setMenuProjectId((current) =>
                        current === project.id ? null : project.id,
                      )
                    }
                  >
                    <More width={17} height={17} />
                  </button>
                  {menuProjectId === project.id && (
                    <div
                      role="menu"
                      className="absolute right-3 top-12 z-10 min-w-32 rounded-xl border border-white/15 bg-slate-950/95 p-1 text-left text-xs text-white shadow-2xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full rounded-lg px-3 py-2 hover:bg-white/10"
                        onClick={() => {
                          setMenuProjectId(null);
                          onOpenProject(project);
                        }}
                      >
                        {text("打开项目", "Open project")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={project.status === "archived"}
                        className="block w-full rounded-lg px-3 py-2 text-rose-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          setMenuProjectId(null);
                          onArchiveProject(project);
                        }}
                      >
                        {project.status === "archived"
                          ? text("已归档", "Archived")
                          : text("归档项目", "Archive project")}
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-main">
                        {project.title}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted">
                        {project.description ||
                          text(
                            "尚未添加项目描述",
                            "No project description yet",
                          )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="status-chip">
                        {project.trackCount} {text("首", "tracks")}
                      </span>
                      {project.status === "archived" && (
                        <span className="text-[9px] text-muted">
                          {text("已归档", "Archived")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[10px] text-muted">
                    <span>
                      {text("更新于", "Updated")} {ago(project.updatedAt)}
                    </span>
                    <button
                      type="button"
                      className="font-semibold text-accent-soft"
                      onClick={() => onOpenProject(project)}
                    >
                      {text("打开项目 →", "Open project →")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !error && <EmptyProject onCreate={onOpenCreate} />
        )}
        <section className="mt-8 rounded-3xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="feature-icon">
                <Folder width={21} height={21} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-main">
                  {text("还不确定怎么整理？", "Not sure how to organize?")}
                </h3>
                <p className="mt-1 text-[11px] text-muted">
                  {text(
                    "从“灵感收集箱”开始，生成完成后再移动到正式专辑。",
                    "Start with an inspiration inbox, then move finished tracks into an album.",
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost border !border-[var(--line)]"
              onClick={onOpenCreate}
            >
              {text("创建灵感收集箱", "Create inspiration inbox")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyProject({ onCreate }: { onCreate: () => void }) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  return (
    <div className="empty-state">
      <span className="feature-icon !h-14 !w-14">
        <Folder width={25} height={25} />
      </span>
      <h2>{text("创建第一个音乐项目", "Create your first music project")}</h2>
      <p>
        {text(
          "项目可以收纳歌词、双版本生成、封面以及续写和重制作品。",
          "Projects hold lyrics, two-version generations, covers, continuations and remasters.",
        )}
      </p>
      <button type="button" className="btn-primary" onClick={onCreate}>
        <Plus width={15} height={15} /> {text("新建项目", "New project")}
      </button>
    </div>
  );
}

export function ProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: MusicProject) => void;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeHandlerRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeHandlerRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError(null);
    const frame = requestAnimationFrame(() => ref.current?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busyRef.current) return;
        event.preventDefault();
        closeHandlerRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key);
      const previousFocus = previousFocusRef.current;
      requestAnimationFrame(
        () => previousFocus?.isConnected && previousFocus.focus(),
      );
    };
  }, [open]);
  if (!open) return null;
  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({
        title: title.trim(),
        description: description.trim(),
      });
      onCreated(project);
      setTitle("");
      setDescription("");
      onClose();
    } catch (cause) {
      setError(
        `${text("项目创建失败：", "Project creation failed: ")}${cause instanceof Error ? cause.message : text("请稍后重试", "try again later")}`,
      );
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        ref={dialogRef}
        className="small-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        aria-busy={busy}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="project-dialog-title"
              className="text-lg font-semibold text-main"
            >
              {text("新建音乐项目", "New music project")}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {text(
                "创建成功后才会加入项目列表；失败不会生成本地占位项目。",
                "Only successful projects are added to the list; failures never create local placeholders.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            disabled={busy}
            onClick={close}
            aria-label={text("关闭", "Close")}
          >
            <X width={17} height={17} />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <label className="parameter-label" htmlFor="project-title">
              {text("项目名称", "Project name")}
            </label>
            <input
              ref={ref}
              id="project-title"
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={text(
                "例如：霓虹夜航 EP",
                "e.g. Neon night flight EP",
              )}
              maxLength={80}
            />
          </div>
          <div>
            <label className="parameter-label" htmlFor="project-description">
              {text("项目描述", "Project description")}
            </label>
            <textarea
              id="project-description"
              className="field resize-y"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={text(
                "记录概念、风格与创作目标……",
                "Describe the concept, style and creative goal…",
              )}
              maxLength={1000}
            />
          </div>
          {error && (
            <div
              className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] leading-5 text-rose-300"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={close}
          >
            {text("取消", "Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!title.trim() || busy}
            onClick={() => void create()}
          >
            {busy && <Spinner width={14} height={14} />}{" "}
            {busy
              ? text("正在创建…", "Creating…")
              : text("创建项目", "Create project")}
          </button>
        </div>
      </div>
    </div>
  );
}

const TASK_STATUS: Record<
  PlatformTask["status"],
  { label: string; tone: string }
> = {
  queued: { label: "排队中", tone: "neutral" },
  reserving: { label: "预扣中", tone: "warning" },
  submitting: { label: "提交中", tone: "warning" },
  generating: { label: "生成中", tone: "accent" },
  processing: { label: "资产处理中", tone: "accent" },
  completed: { label: "已完成", tone: "success" },
  failed: { label: "失败", tone: "danger" },
  refunding: { label: "退款中", tone: "warning" },
  refunded: { label: "已退款", tone: "success" },
  reconcile_required: { label: "待对账", tone: "danger" },
};
const ACTIVE_TASK_STATUSES: PlatformTask["status"][] = [
  "queued",
  "reserving",
  "submitting",
  "generating",
  "processing",
  "refunding",
];
const TASK_STATUS_EN: Record<PlatformTask["status"], string> = {
  queued: "Queued",
  reserving: "Reserving credits",
  submitting: "Submitting",
  generating: "Generating",
  processing: "Processing assets",
  completed: "Completed",
  failed: "Failed",
  refunding: "Refunding",
  refunded: "Refunded",
  reconcile_required: "Reconciliation needed",
};

export interface TaskQuery {
  id?: string;
  ids?: string;
  page?: number;
  size?: number;
}

export function TasksPage({
  tasks,
  error,
  loading,
  onRetry,
  onRefresh,
  onQuery,
  streamConnected,
  updatedAt,
  onOpenMv,
}: {
  tasks: PlatformTask[];
  onOpenMv?: (id:string) => void;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onQuery?: (query: TaskQuery) => void;
  streamConnected: boolean;
  updatedAt: string | null;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const statusLabel = (status: PlatformTask["status"]) =>
    language === "zh-CN" ? TASK_STATUS[status].label : TASK_STATUS_EN[status];
  const ago = (iso: string) => fmtAgoLocalized(iso, language);
  const [filter, setFilter] = useState<
    "all" | "active" | "completed" | "attention"
  >("all");
  const [selected, setSelected] = useState<PlatformTask | null>(null);
  const [taskIds, setTaskIds] = useState("");
  const [page, setPage] = useState("1");
  const [size, setSize] = useState("10");
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);
  const filtered = tasks.filter(
    (task) =>
      filter === "all" ||
      (filter === "active"
        ? ACTIVE_TASK_STATUSES.includes(task.status)
        : filter === "completed"
          ? task.status === "completed"
          : ["failed", "refunded", "reconcile_required"].includes(task.status)),
  );
  const active = tasks.filter((task) =>
    ACTIVE_TASK_STATUSES.includes(task.status),
  ).length;
  const activeTasks = tasks
    .filter((task) => ACTIVE_TASK_STATUSES.includes(task.status))
    .slice(0, 4);
  const submitQuery = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPage = Math.max(
      1,
      Math.min(200, Number.parseInt(page, 10) || 1),
    );
    const parsedSize = Math.max(
      1,
      Math.min(200, Number.parseInt(size, 10) || 10),
    );
    setPage(String(parsedPage));
    setSize(String(parsedSize));
    const requested = taskIds.trim();
    onQuery?.({
      ...(requested.includes(",")
        ? { ids: requested }
        : requested
          ? { id: requested }
          : {}),
      page: parsedPage,
      size: parsedSize,
    });
  };

  return (
    <>
      <div className="page-scroll">
        <WorkspacePageHeader
          icon={ListTodo}
          title={text("任务调度中心", "Task center")}
          subtitle={text(
            "实时监控 ModelCross 音乐生成与后处理任务",
            "Monitor ModelCross music generation and asset processing in real time",
          )}
        />
        <div className="mx-auto max-w-[1450px] p-5 lg:p-7">
          {error && (
            <DataError
              title="任务状态暂时无法同步"
              error={error}
              onRetry={onRetry}
            />
          )}
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {[
              [
                text("进行中", "Active"),
                active,
                text("任务会自动继续处理", "Tasks continue automatically"),
              ],
              [
                text("本周完成", "Completed this week"),
                tasks.filter((task) => task.status === "completed").length,
                text("已保存到作品库", "Saved to your library"),
              ],
              [
                text("退款/待处理", "Refunds / attention"),
                tasks.filter((task) =>
                  ["refunded", "refunding", "reconcile_required"].includes(
                    task.status,
                  ),
                ).length,
                text(
                  "异常订单会自动核对",
                  "Exceptions are reconciled automatically",
                ),
              ],
            ].map(([label, value, detail]) => (
              <div key={String(label)} className="stat-card">
                <span>{String(label)}</span>
                <strong>{String(value)}</strong>
                <small>{String(detail)}</small>
              </div>
            ))}
          </div>

          {(activeTasks.length > 1 ||
            (filter === "active" && activeTasks.length > 0)) && (
            <section
              className="tasks-active-section"
              aria-labelledby="active-tasks-title"
            >
              <div className="tasks-section-heading">
                <div>
                  <span className="eyebrow">
                    {text("实时处理中", "Live processing")}
                  </span>
                  <h2 id="active-tasks-title">
                    {text("进行中的任务", "Active tasks")}{" "}
                    <small>{active}</small>
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn-ghost border !border-[var(--line)] text-xs"
                  onClick={() => setFilter("active")}
                >
                  {text("查看全部", "View all")}
                </button>
              </div>
              <div className="tasks-active-grid">
                {activeTasks.map((task) => {
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className="task-progress-card"
                      onClick={() => setSelected(task)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="status-chip">
                          {localizeCatalogText(
                            operationLabel(task.operation),
                            language,
                          )}
                        </span>
                        <span className="task-progress-status">
                          <span />
                          {statusLabel(task.status)}
                        </span>
                      </div>
                      <strong className="mt-3 block truncate text-left text-sm text-main">
                        {task.title || text("未命名任务", "Unnamed task")} ·{" "}
                        {statusLabel(task.status)}
                      </strong>
                      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-muted">
                        <span>{Math.round(task.progress * 100)}%</span>
                        <span>
                          {task.estimatedCredits
                            ? `${text("预计", "Est.")} ${task.estimatedCredits} ${text("积分", "credits")}`
                            : text("等待估价", "Waiting for quote")}
                        </span>
                      </div>
                      <div className="task-progress-track">
                        <span
                          style={{
                            width: `${Math.max(4, Math.min(100, Math.round(task.progress * 100)))}%`,
                          }}
                        />
                      </div>
                      <span className="mt-3 block text-right text-[11px] font-semibold text-accent-soft">
                        {text("查看详情", "View details")}{" "}
                        <ArrowRight
                          width={12}
                          height={12}
                          className="ml-1 inline"
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {onOpenMv && <MvTasksPanel onOpen={onOpenMv}/>}
          <section className="surface-card mb-5 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="eyebrow">
                  {text("精确查找", "Find exactly")}
                </span>
                <h2 className="mt-1 text-sm font-semibold text-main">
                  {text("按任务编号查找", "Find by task ID")}
                </h2>
                <p className="mt-1 text-[10px] leading-5 text-muted">
                  {text(
                    "输入一个或多个任务编号，快速定位当前账户提交的生成记录。",
                    "Enter one or more task IDs to locate records submitted by this account.",
                  )}
                </p>
              </div>
              <span className="status-chip">
                {text("默认显示 10 条", "Showing 10 by default")}
              </span>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_90px_auto]"
              onSubmit={submitQuery}
            >
              <div>
                <label className="parameter-label" htmlFor="task-query-ids">
                  {text("任务编号", "Task IDs")}
                </label>
                <input
                  id="task-query-ids"
                  className="field !py-2 text-xs"
                  value={taskIds}
                  onChange={(event) => setTaskIds(event.target.value)}
                  placeholder={text(
                    "可选，多个编号用逗号分隔",
                    "Optional; separate multiple IDs with commas",
                  )}
                />
              </div>
              <div>
                <label className="parameter-label" htmlFor="task-query-page">
                  {text("页码", "Page")}
                </label>
                <input
                  id="task-query-page"
                  className="field !py-2 text-xs"
                  type="number"
                  min="1"
                  max="200"
                  value={page}
                  onChange={(event) => setPage(event.target.value)}
                />
              </div>
              <div>
                <label className="parameter-label" htmlFor="task-query-size">
                  {text("每页数量", "Page size")}
                </label>
                <input
                  id="task-query-size"
                  className="field !py-2 text-xs"
                  type="number"
                  min="1"
                  max="200"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn-primary self-end !py-2"
                disabled={loading}
              >
                {text("查询", "Search")}
              </button>
            </form>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div className="segmented">
                {(
                  [
                    ["all", text("全部", "All")],
                    ["active", text("进行中", "Active")],
                    ["completed", text("已完成", "Completed")],
                    ["attention", text("异常与退款", "Attention & refunds")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={filter === value ? "active" : ""}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`status-chip ${streamConnected ? "tone-success" : ""}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${streamConnected ? "bg-emerald-400" : "bg-amber-400"}`}
                  />{" "}
                  {streamConnected
                    ? text("实时事件已连接", "Live events connected")
                    : text("轮询刷新", "Polling refresh")}
                </span>
                <button
                  type="button"
                  className="btn-ghost border !border-[var(--line)] text-xs"
                  disabled={loading}
                  onClick={onRefresh}
                >
                  {loading ? (
                    <Spinner width={12} height={12} />
                  ) : (
                    <History width={12} height={12} />
                  )}{" "}
                  {text("刷新", "Refresh")}
                </button>
              </div>
              <span className="w-full text-right text-[10px] text-muted">
                {text(
                  "任务状态以服务端记录为准",
                  "Task status follows the server record",
                )}
                {updatedAt
                  ? ` · ${text("更新于", "Updated")} ${ago(updatedAt)}`
                  : ""}
              </span>
            </div>
            {filtered.length ? (
              <div className="divide-y divide-[var(--line)]">
                {filtered.map((task) => {
                  const status = TASK_STATUS[task.status];
                  return (
                    <article key={task.id} className="task-row">
                      <span className="task-icon">
                        <ListTodo width={17} height={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3>
                            {task.title || text("未命名任务", "Unnamed task")}
                          </h3>
                          <span className={`status-chip tone-${status.tone}`}>
                            {statusLabel(task.status)}
                          </span>
                          {task.billingStatus === "partially_captured" && (
                            <span className="status-chip tone-warning">
                              {text(
                                "按成功结果结算",
                                "Settled by successful results",
                              )}
                            </span>
                          )}
                        </div>
                        <p>
                          {operationLabel(task.operation)} ·{" "}
                          {modelLabel(task.model)} · {ago(task.createdAt)}
                          {task.upstreamTaskId
                            ? ` · Provider task_id ${task.upstreamTaskId}`
                            : ""}
                        </p>
                        {ACTIVE_TASK_STATUSES.includes(task.status) && (
                          <div className="mt-2 h-1.5 max-w-lg overflow-hidden rounded-full bg-[var(--surface-4)]">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-accent to-coral transition-all"
                              style={{
                                width: `${Math.max(4, Math.round(task.progress * 100))}%`,
                              }}
                            />
                          </div>
                        )}
                        {task.error && (
                          <p className="!mt-2 !text-rose-400">{task.error}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <strong className="text-xs text-main">
                          {task.status === "refunded"
                            ? `+${task.refundCredits ?? task.estimatedCredits}`
                            : task.chargedCredits !== null &&
                                task.chargedCredits !== undefined
                              ? `-${task.chargedCredits}`
                              : `${task.estimatedCredits} ${text("预估", "estimated")}`}
                        </strong>
                        <small className="mt-1 block text-[10px] text-muted">
                          {text("积分", "credits")}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${task.title || text("未命名任务", "Unnamed task")} ${text("详情", "details")}`}
                        onClick={() => setSelected(task)}
                      >
                        <More width={16} height={16} />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              !error && (
                <div className="empty-state !min-h-80">
                  <span className="feature-icon">
                    <Clock width={22} height={22} />
                  </span>
                  <h2>{text("这个筛选下没有任务", "No tasks in this view")}</h2>
                  <p>
                    {text(
                      "生成任务、资产处理和积分退款都会出现在这里。",
                      "Generation, asset processing and credit refunds appear here.",
                    )}
                  </p>
                </div>
              )
            )}
          </section>
        </div>
      </div>

      {selected && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelected(null)
          }
        >
          <section
            className="small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="eyebrow">
                  {text("任务详情", "Task details")}
                </span>
                <h2
                  id="task-detail-title"
                  className="mt-2 text-lg font-semibold text-main"
                >
                  {selected.title || text("未命名任务", "Unnamed task")}
                </h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={text("关闭任务详情", "Close task details")}
                onClick={() => setSelected(null)}
              >
                <X width={17} height={17} />
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted">状态</dt>
                <dd className="mt-1 font-semibold text-main">
                  {statusLabel(selected.status)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{text("进度", "Progress")}</dt>
                <dd className="mt-1 font-semibold text-main">
                  {Math.round(selected.progress * 100)}%
                </dd>
              </div>
              <div>
                <dt className="text-muted">
                  {text("操作 / 模型", "Operation / model")}
                </dt>
                <dd className="mt-1 text-main">
                  {localizeCatalogText(
                    operationLabel(selected.operation),
                    language,
                  )}{" "}
                  · {modelLabel(selected.model)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">
                  {text("预计 / 实际积分", "Estimated / actual credits")}
                </dt>
                <dd className="mt-1 text-main">
                  {selected.estimatedCredits} /{" "}
                  {selected.chargedCredits ??
                    text("待结算", "Pending settlement")}
                </dd>
                {selected.billingStatus === "partially_captured" && (
                  <small className="mt-1 block text-amber-400">
                    {text(
                      "按成功结果完成结算",
                      "Settled by successful results",
                    )}
                  </small>
                )}
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">MuseFlow 任务 ID</dt>
                <dd className="mt-1 break-all font-mono text-[10px] text-main">
                  {selected.id}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">批次 ID</dt>
                <dd className="mt-1 break-all font-mono text-[10px] text-main">
                  {selected.batchId}
                </dd>
              </div>
              {selected.upstreamTaskId && (
                <div className="sm:col-span-2">
                  <dt className="text-muted">Provider task_id</dt>
                  <dd className="mt-1 break-all font-mono text-[10px] text-main">
                    {selected.upstreamTaskId}
                  </dd>
                </div>
              )}
              {selected.providerRecordId && (
                <div>
                  <dt className="text-muted">Provider record id</dt>
                  <dd className="mt-1 font-mono text-[10px] text-main">
                    {selected.providerRecordId}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted">{text("创建时间", "Created")}</dt>
                <dd className="mt-1 text-main">
                  {new Date(selected.createdAt).toLocaleString("zh-CN")}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{text("更新时间", "Updated")}</dt>
                <dd className="mt-1 text-main">
                  {new Date(selected.updatedAt).toLocaleString("zh-CN")}
                </dd>
              </div>
              {selected.submissionOptions &&
                Object.keys(selected.submissionOptions).length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted">
                      {text(
                        "操作参数（服务端已保存）",
                        "Operation parameters (saved on server)",
                      )}
                    </dt>
                    <dd className="mt-1 break-all rounded-xl bg-black/10 p-3 font-mono text-[10px] text-muted">
                      {JSON.stringify(selected.submissionOptions)}
                    </dd>
                  </div>
                )}
              {selected.error && (
                <div className="sm:col-span-2">
                  <dt className="text-rose-400">{text("错误", "Error")}</dt>
                  <dd className="mt-1 rounded-xl bg-rose-400/[0.07] p-3 text-rose-300">
                    {selected.error}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}

function TopUpDialog({
  open,
  url,
  onClose,
}: {
  open: boolean;
  url: string | null;
  onClose: () => void;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeHandlerRef = useRef(onClose);
  closeHandlerRef.current = onClose;

  useEffect(() => {
    if (!open || !url) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const billingScroll = document.querySelector<HTMLElement>(
      ".billing-page-scroll",
    );
    const shellWasInert = appShell?.hasAttribute("inert") ?? false;
    const previousScrollOverflow = billingScroll?.style.overflow ?? "";
    appShell?.setAttribute("inert", "");
    if (billingScroll) billingScroll.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandlerRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key);
      if (appShell && !shellWasInert) appShell.removeAttribute("inert");
      if (billingScroll) billingScroll.style.overflow = previousScrollOverflow;
      const previousFocus = previousFocusRef.current;
      requestAnimationFrame(
        () => previousFocus?.isConnected && previousFocus.focus(),
      );
    };
  }, [open, url]);

  if (!open || !url) return null;
  return createPortal(
    <div
      className="dialog-backdrop !z-[120]"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="small-dialog topup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-dialog-title"
        aria-describedby="topup-dialog-description"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">MODELCROSS WALLET</span>
            <h2
              id="topup-dialog-title"
              className="mt-2 text-lg font-semibold text-main"
            >
              {text("前往统一钱包充值", "Top up in the unified wallet")}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn modal-close-button"
            onClick={onClose}
            aria-label={text("关闭充值入口", "Close top-up dialog")}
          >
            <X width={18} height={18} />
          </button>
        </div>
        <p
          id="topup-dialog-description"
          className="mt-4 text-xs leading-6 text-muted"
        >
          {text(
            "充值、支付方式和商品价格由 ModelCross 提供。推荐在新标签页打开，AI Music Studio 会保留当前工作区；充值完成后关闭该标签即可返回。",
            "Top-ups, payment methods and product prices are provided by ModelCross. We recommend opening a new tab so AI Music Studio stays in place; close it when finished to return.",
          )}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <a
            className="btn-primary justify-center"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
          >
            <External width={14} height={14} />{" "}
            {text("新标签页打开", "Open new tab")}
          </a>
          <a
            className="btn-ghost justify-center border !border-[var(--line)]"
            href={url}
            onClick={onClose}
          >
            {text("当前页打开", "Open here")}{" "}
            <ArrowRight width={13} height={13} />
          </a>
        </div>
        <button
          type="button"
          aria-label={text("留在 MuseFlow", "Stay in AI Music Studio")}
          className="mt-3 w-full py-2 text-xs font-semibold text-muted transition hover:text-main"
          onClick={onClose}
        >
          {text("留在 AI Music Studio", "Stay in AI Music Studio")}
        </button>
      </section>
    </div>,
    document.body,
  );
}

type BillingPageProps = {
  summary: BillingSummary | null;
  orders: BillingOrder[];
  account: AccountSummary | null;
  summaryError: string | null;
  ordersError: string | null;
  loadingSummary: boolean;
  loadingOrders: boolean;
  onRetrySummary: () => void;
  onRetryOrders: () => void;
  onRefresh: () => void;
  openTopUpSignal?: number;
};

function BillingPageContent({
  summary,
  orders,
  account,
  summaryError,
  ordersError,
  loadingSummary,
  loadingOrders,
  onRetrySummary,
  onRetryOrders,
  onRefresh,
  openTopUpSignal = 0,
}: BillingPageProps) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const openTopUp = () => account?.topUpUrl && setTopUpOpen(true);
  useEffect(() => {
    if (openTopUpSignal > 0 && account?.topUpUrl) setTopUpOpen(true);
  }, [account?.topUpUrl, openTopUpSignal]);
  return (
    <>
      <div className="page-scroll billing-page-scroll">
        <div className="mx-auto max-w-[1350px] space-y-5 p-5 lg:p-7">
          {summaryError && (
            <DataError
              title={text(
                "账户余额暂时不可用",
                "Account balance temporarily unavailable",
              )}
              error={summaryError}
              onRetry={onRetrySummary}
            />
          )}
          {account ? (
            <section className="billing-hero">
              <div>
                <div className="billing-wallet-status">
                  <span className="status-chip tone-success">
                    ModelCross Wallet Active
                  </span>
                  <span>
                    {text("实时同步统一钱包", "Unified wallet synced live")}
                  </span>
                </div>
                <h2 className="billing-wallet-title">
                  {text(
                    "ModelCross 官方统一积分与算力钱包",
                    "ModelCross unified credits & compute wallet",
                  )}
                </h2>
                <span className="eyebrow !text-violet-100/70">
                  {text("当前可用积分", "Available credits")}
                </span>
                <div className="mt-3 flex items-baseline gap-2">
                  <strong>{account.availableBalance.toLocaleString()}</strong>
                  <span>{text("积分", "credits")}</span>
                </div>
                <p>
                  {text("已预留", "Reserved")}{" "}
                  {account.reservedBalance.toLocaleString()}
                  {summary
                    ? ` · ${text("本月已使用", "Used this month")} ${summary.monthSpent.toLocaleString()} · ${text("生成", "generated")} ${summary.monthGeneratedTracks} ${text("首", "tracks")}`
                    : ` · ${text("本月用量暂不可用", "Monthly usage unavailable")}`}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {account.topUpUrl ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-violet-900 shadow-lg transition hover:-translate-y-0.5"
                      onClick={openTopUp}
                    >
                      <Plus width={15} height={15} />{" "}
                      {text("前往 ModelCross 充值", "Top up in ModelCross")}
                    </button>
                  ) : (
                    <span className="status-chip">
                      {text(
                        "当前账户未提供充值入口",
                        "No top-up entry is available for this account",
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
                    disabled={loadingSummary}
                    onClick={onRefresh}
                  >
                    {loadingSummary ? (
                      <Spinner width={14} height={14} />
                    ) : (
                      <Refresh width={14} height={14} />
                    )}{" "}
                    {text("同步用量", "Sync usage")}
                  </button>
                </div>
              </div>
              <div className="billing-plan">
                <Crown width={18} height={18} />
                <span>
                  <small>{text("当前套餐", "Current plan")}</small>
                  <strong>
                    {localizeCatalogText(account.subscription.name, language)}
                  </strong>
                  <em>
                    {account.subscription.status === "active"
                      ? `${text("续订于", "Renews")} ${account.subscription.renewsAt ? new Date(account.subscription.renewsAt).toLocaleDateString(language) : text("下个账期", "next cycle")}`
                      : text("未订阅", "Not subscribed")}
                  </em>
                </span>
              </div>
            </section>
          ) : (
            <section className="surface-card p-6 text-center">
              <Spinner width={18} height={18} className="mx-auto text-muted" />
              <h2 className="mt-3 text-sm font-semibold text-main">
                {text(
                  "账户信息尚未加载",
                  "Account information is still loading",
                )}
              </h2>
              <p className="mt-2 text-xs text-muted">
                {text(
                  "余额、套餐和购买能力不会使用硬编码或演示数据代替。",
                  "Balance, plans and purchase options are never replaced with hardcoded demo data.",
                )}
              </p>
            </section>
          )}
          <section className="surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-start gap-3">
                <span className="feature-icon">
                  <Sparkle width={18} height={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-main">
                    {text(
                      "积分包与订阅由 ModelCross 实时提供",
                      "Credit packs and subscriptions are provided live by ModelCross",
                    )}
                  </h2>
                  <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">
                    {text(
                      "AI Music Studio 不缓存或硬编码可购买价格。打开前可选择保留当前工作区或在当前页继续。",
                      "AI Music Studio does not cache or hardcode purchase prices. Choose a new tab or continue in this workspace.",
                    )}
                  </p>
                </div>
              </div>
              {account?.topUpUrl ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openTopUp}
                >
                  {text("查看可购买商品", "View available products")}{" "}
                  <External width={13} height={13} />
                </button>
              ) : (
                <span className="status-chip">
                  <Lock width={10} height={10} />{" "}
                  {text("入口暂不可用", "Entry unavailable")}
                </span>
              )}
            </div>
          </section>
          <details className="surface-card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span>
                <strong className="block text-xs font-semibold text-main">
                  {text(
                    "积分接口与参数边界",
                    "Credit API & parameter boundaries",
                  )}
                </strong>
                <small className="mt-1 block text-[10px] text-muted">
                  {text(
                    "区分用户钱包与 Provider 商户成本",
                    "Separate user wallet credits from Provider merchant costs",
                  )}
                </small>
              </span>
              <Chevron width={14} height={14} className="text-muted" />
            </summary>
            <div className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] md:grid-cols-2">
              <div className="bg-[var(--surface-1)] p-5">
                <strong className="text-xs text-main">
                  {text("ModelCross 用户钱包", "ModelCross user wallet")}
                </strong>
                <p className="mt-2 text-[10px] leading-5 text-muted">
                  {text(
                    "可用积分、已预留、套餐和账单均为当前登录账户的只读数据。充值在统一钱包完成，浏览器不能提交余额、价格或扣费金额。",
                    "Available credits, reservations, plans and billing are read-only data for the signed-in account. Top-ups happen in the unified wallet; the browser cannot submit balances, prices or charges.",
                  )}
                </p>
              </div>
              <div className="bg-[var(--surface-1)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs text-main">
                    MXAPI points-balance / logs
                  </strong>
                  <a
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-soft"
                    href="https://open.mxapi.org/api-test?id=points-balance"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {text("查看文档", "View docs")}{" "}
                    <External width={10} height={10} />
                  </a>
                </div>
                <code className="mt-2 block text-[10px] text-main">
                  GET /api/v2/points/balance
                </code>
                <code className="mt-1 block text-[10px] text-main">
                  GET /api/v2/points/logs?page=1&amp;pageSize=20
                </code>
                <p className="mt-2 text-[10px] leading-5 text-muted">
                  {text(
                    "balance 没有 Path、Query 或 Body 参数；logs 支持 page（从 1 开始）和 pageSize（1–100）。Authorization 由服务端自动携带。返回的 points 是部署商户余额与流水，仅用于管理员诊断，不作为用户积分展示或扣费依据。",
                    "balance has no Path, Query or Body parameters; logs accepts page (starting at 1) and pageSize (1–100). Authorization is attached server-side. Returned points are merchant balance and ledger data for administrator diagnostics only, never user credits or billing.",
                  )}
                </p>
              </div>
            </div>
          </details>
          <section className="surface-card overflow-hidden">
            {ordersError && (
              <div className="p-4">
                <DataError
                  title={text(
                    "订单与消费记录暂时不可用",
                    "Orders and usage records temporarily unavailable",
                  )}
                  error={ordersError}
                  onRetry={onRetryOrders}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-main">
                  {text("订单与消费明细", "Orders & usage details")}
                </h2>
                <p className="mt-1 text-[10px] text-muted">
                  {text(
                    "音乐和 AI 用量镜像可追踪；充值、订阅与支付订单请在 ModelCross 查看",
                    "Music and AI usage mirrors are traceable; view top-ups, subscriptions and payment orders in ModelCross",
                  )}
                  {loadingOrders ? text(" · 正在同步", " · syncing") : ""}
                </p>
              </div>
              {account?.ordersUrl ? (
                <a
                  className="btn-ghost border !border-[var(--line)] text-xs"
                  href={account.ordersUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <External width={13} height={13} />{" "}
                  {text(
                    "查看 ModelCross 完整账单",
                    "View full ModelCross billing",
                  )}
                </a>
              ) : null}
            </div>
            {orders.length ? (
              <div className="divide-y divide-[var(--line)]">
                {orders.map((order) => (
                  <div key={order.id} className="order-row">
                    <span className="task-icon">
                      <Receipt width={16} height={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong>{order.description}</strong>
                      <small>
                        {new Date(order.createdAt).toLocaleString("zh-CN")} ·{" "}
                        {order.id}
                      </small>
                    </div>
                    <span
                      className={`status-chip ${order.status === "paid" ? "tone-success" : order.status === "failed" ? "tone-danger" : ""}`}
                    >
                      {
                        (
                          {
                            paid: text("已完成", "Completed"),
                            pending: text("处理中", "Processing"),
                            failed: text("失败", "Failed"),
                            refunded: text("已退款", "Refunded"),
                          } as const
                        )[order.status]
                      }
                    </span>
                    <BillingOrderValue order={order} />
                  </div>
                ))}
              </div>
            ) : (
              !ordersError && (
                <div className="p-8 text-center text-xs text-muted">
                  {loadingOrders
                    ? text(
                        "正在加载订单与消费记录…",
                        "Loading orders and usage…",
                      )
                    : text("暂无订单或消费记录", "No orders or usage records")}
                </div>
              )
            )}
          </section>
          {loadingSummary && (
            <span className="sr-only" role="status">
              {text("正在刷新余额与用量", "Refreshing balance and usage")}
            </span>
          )}
        </div>
      </div>
      <TopUpDialog
        open={topUpOpen}
        url={account?.topUpUrl ?? null}
        onClose={() => setTopUpOpen(false)}
      />
    </>
  );
}

export function BillingPage(props: BillingPageProps) {
  const { language } = useI18n();
  const [openTopUpSignal, setOpenTopUpSignal] = useState(0);
  return (
    <div className="billing-workspace-shell">
      <WorkspacePageHeader
        icon={Receipt}
        title={language === "zh-CN" ? "账单与 Credits" : "Billing & Credits"}
        subtitle={
          language === "zh-CN"
            ? "管理你的 ModelCross 余额、账单记录与充值"
            : "Manage your ModelCross balance, billing history and top-ups"
        }
        actions={
          <>
            <button
              type="button"
              className="btn-ghost border !border-[var(--line)]"
              disabled={props.loadingSummary}
              onClick={props.onRefresh}
            >
              {props.loadingSummary ? (
                <Spinner width={14} height={14} />
              ) : (
                <Refresh width={14} height={14} />
              )}{" "}
              {language === "zh-CN" ? "刷新余额" : "Refresh balance"}
            </button>
            {props.account?.topUpUrl ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setOpenTopUpSignal((value) => value + 1)}
              >
                <Plus width={14} height={14} />{" "}
                {language === "zh-CN" ? "快速充值" : "Quick top-up"}
              </button>
            ) : null}
          </>
        }
      />
      <BillingPageContent {...props} openTopUpSignal={openTopUpSignal} />
    </div>
  );
}

type SettingsWorkspaceProps = {
  account: AccountSummary | null;
  user?: UserProfile | null;
  theme: ThemeMode;
  models?: MusicModelProfile[];
  onThemeChange: (theme: ThemeMode) => void;
  onDefaultModelChange?: (model: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  isAdmin?: boolean;
};

function SettingsWorkspaceContent({
  account,
  user = null,
  theme,
  models = [],
  onThemeChange,
  onDefaultModelChange,
  onLogout,
  onRefresh,
  isAdmin = false,
}: SettingsWorkspaceProps) {
  const [tab, setTab] = useState<"account" | "preferences" | "provider">(
    "account",
  );
  const [defaultModel, setDefaultModel] = useState(
    () => localStorage.getItem("genalloy.default-model") || "",
  );
  const [exportFormat, setExportFormat] = useState(
    () => localStorage.getItem("genalloy.export-format") || "wav",
  );
  const [normalize, setNormalize] = useState(
    () => localStorage.getItem("genalloy.normalize") !== "false",
  );
  const { language, setLanguage } = useI18n();
  const enabledModels = models.filter((model) => model.enabled);
  const userInitial =
    (user?.name || "G").trim().slice(0, 1).toLocaleUpperCase() || "G";
  const selectDefaultModel = (model: string) => {
    setDefaultModel(model);
    localStorage.setItem("genalloy.default-model", model);
    onDefaultModelChange?.(model);
  };
  const setFormat = (format: string) => {
    setExportFormat(format);
    localStorage.setItem("genalloy.export-format", format);
  };
  const setNormalizeValue = (value: boolean) => {
    setNormalize(value);
    localStorage.setItem("genalloy.normalize", String(value));
  };
  const setLanguageValue = (value: "zh-CN" | "en-US") => {
    setLanguage(value);
  };
  return (
    <div className="page-scroll">
      <div className="mx-auto max-w-4xl p-5 lg:p-7">
        <section
          className="settings-profile-card surface-card"
          aria-labelledby="settings-profile-title"
        >
          <div className="settings-card-heading">
            <User width={15} height={15} />
            <h2 id="settings-profile-title">
              {language === "zh-CN" ? "创作者资料" : "Creator profile"}
            </h2>
            <span>
              {language === "zh-CN"
                ? "ModelCross 统一账户"
                : "ModelCross unified account"}
            </span>
          </div>
          <div className="settings-profile-body">
            <div className="settings-avatar" aria-hidden="true">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                userInitial
              )}
            </div>
            <div className="settings-profile-fields">
              <label htmlFor="settings-profile-name">
                {language === "zh-CN" ? "用户昵称" : "Display name"}
                <input
                  id="settings-profile-name"
                  className="field"
                  value={
                    user?.name ||
                    (language === "zh-CN"
                      ? "账户信息待同步"
                      : "Account data pending")
                  }
                  readOnly
                />
              </label>
              <label htmlFor="settings-profile-email">
                {language === "zh-CN" ? "绑定邮箱" : "Email"}
                <input
                  id="settings-profile-email"
                  className="field font-mono"
                  value={
                    user?.email ||
                    (language === "zh-CN"
                      ? "账户信息待同步"
                      : "Account data pending")
                  }
                  readOnly
                />
              </label>
              <div className="settings-profile-meta">
                <span>
                  {account?.subscription.name
                    ? localizeCatalogText(account.subscription.name, language)
                    : language === "zh-CN"
                      ? "未订阅"
                      : "Not subscribed"}
                </span>
                <small>
                  {language === "zh-CN"
                    ? "身份、昵称和套餐由 ModelCross 账户中心管理"
                    : "Identity, display name and plan are managed by the ModelCross account center"}
                </small>
              </div>
            </div>
          </div>
        </section>
        <section
          className="settings-audio-card surface-card"
          aria-labelledby="settings-audio-title"
        >
          <div className="settings-card-heading">
            <Music width={15} height={15} />
            <h2 id="settings-audio-title">
              {language === "zh-CN" ? "音频输出配置" : "Audio output settings"}
            </h2>
            <span>
              {language === "zh-CN" ? "保存到当前设备" : "Saved on this device"}
            </span>
          </div>
          <div className="settings-audio-fields">
            <label htmlFor="settings-audio-default-model">
              {language === "zh-CN" ? "默认模型" : "Default model"}
              <select
                id="settings-audio-default-model"
                className="field"
                value={defaultModel}
                disabled={!enabledModels.length}
                onChange={(event) => selectDefaultModel(event.target.value)}
              >
                <option value="">
                  {language === "zh-CN"
                    ? "跟随创作页选择"
                    : "Use the workbench selection"}
                </option>
                {enabledModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
              <small>
                {enabledModels.length
                  ? language === "zh-CN"
                    ? "使用 ModelCross 当前账号已授权模型。"
                    : "Uses a model authorized for this ModelCross account."
                  : language === "zh-CN"
                    ? "模型目录尚未同步，暂不改变当前选择。"
                    : "The model catalog is not synced; the current selection is unchanged."}
              </small>
            </label>
            <label htmlFor="settings-audio-export-format">
              {language === "zh-CN" ? "默认导出格式" : "Default export format"}
              <select
                id="settings-audio-export-format"
                className="field"
                value={exportFormat}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="wav">WAV 24-bit · 48 kHz</option>
                <option value="flac">FLAC 24-bit</option>
                <option value="mp3">MP3 · 320 kbps</option>
              </select>
              <small>
                {language === "zh-CN"
                  ? "实际可用资产格式仍以服务端操作能力为准。"
                  : "Available asset formats are still determined by server capabilities."}
              </small>
            </label>
          </div>
          <div className="settings-toggle-row">
            <div>
              <strong>
                {language === "zh-CN"
                  ? "自动响度标准化（-14 LUFS）"
                  : "Automatic loudness normalization (-14 LUFS)"}
              </strong>
              <small>
                {language === "zh-CN"
                  ? "仅影响本地播放，不修改原始音频资产。"
                  : "Affects local playback only; original audio assets are unchanged."}
              </small>
            </div>
            <label
              className="switch"
              aria-label={
                language === "zh-CN"
                  ? "自动响度标准化"
                  : "Automatic loudness normalization"
              }
            >
              <input
                type="checkbox"
                aria-label={
                  language === "zh-CN"
                    ? "自动响度标准化"
                    : "Automatic loudness normalization"
                }
                checked={normalize}
                onChange={(event) => setNormalizeValue(event.target.checked)}
              />
              <span />
            </label>
          </div>
        </section>
        <div
          className="mb-5 segmented w-fit"
          role="group"
          aria-label={language === "zh-CN" ? "设置分类" : "Settings categories"}
        >
          {(
            [
              [
                "account",
                language === "zh-CN" ? "账户与安全" : "Account & security",
              ],
              [
                "preferences",
                language === "zh-CN" ? "创作偏好" : "Creation preferences",
              ],
              [
                "provider",
                language === "zh-CN" ? "模型连接" : "Model connection",
              ],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "provider" ? (
          <SettingsPanel onSaved={onRefresh} isAdmin={isAdmin} />
        ) : tab === "preferences" ? (
          <div className="space-y-5">
            <section className="surface-card p-5">
              <h2 className="text-sm font-semibold text-main">
                {language === "zh-CN" ? "界面主题" : "Appearance"}
              </h2>
              <p className="mt-1 text-[11px] text-muted">
                {language === "zh-CN"
                  ? "选择适合当前工作环境的显示方式。"
                  : "Choose the appearance that fits your workspace."}
              </p>
              <div className="mt-4 grid max-w-lg grid-cols-3 gap-2">
                {(["dark", "light", "system"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`parameter-option py-3 ${theme === value ? "active" : ""}`}
                    aria-pressed={theme === value}
                    onClick={() => onThemeChange(value)}
                  >
                    {theme === value && <Check width={12} height={12} />}
                    {
                      (
                        {
                          dark: language === "zh-CN" ? "深色" : "Dark",
                          light: language === "zh-CN" ? "浅色" : "Light",
                          system: language === "zh-CN" ? "跟随系统" : "System",
                        } as const
                      )[value]
                    }
                  </button>
                ))}
              </div>
            </section>
            <section className="surface-card p-5">
              <h2 className="text-sm font-semibold text-main">
                {language === "zh-CN" ? "界面语言" : "Language"}
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                {language === "zh-CN"
                  ? "切换后会同步顶部快捷入口；账户、账单和模型数据仍由 ModelCross 返回。"
                  : "The top-bar shortcuts update immediately; account, billing and model data still come from ModelCross."}
              </p>
              <div className="mt-4 grid max-w-lg grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`parameter-option py-3 ${language === "zh-CN" ? "active" : ""}`}
                  aria-pressed={language === "zh-CN"}
                  onClick={() => setLanguageValue("zh-CN")}
                >
                  {language === "zh-CN" ? "简体中文" : "Simplified Chinese"}
                </button>
                <button
                  type="button"
                  className={`parameter-option py-3 ${language === "en-US" ? "active" : ""}`}
                  aria-pressed={language === "en-US"}
                  onClick={() => setLanguageValue("en-US")}
                >
                  English
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="surface-card divide-y divide-[var(--line)]">
              <SettingRow
                icon={User}
                title={language === "zh-CN" ? "统一账户" : "Unified account"}
                detail={
                  language === "zh-CN"
                    ? "登录、邮箱、OAuth 与 Passkey 由 ModelCross 管理"
                    : "Sign-in, email, OAuth and Passkeys are managed by ModelCross"
                }
                action={language === "zh-CN" ? "管理账户" : "Manage account"}
                href={account?.accountUrl}
              />
              <SettingRow
                icon={Shield}
                title={
                  language === "zh-CN"
                    ? "登录与会话安全"
                    : "Sign-in & session security"
                }
                detail="HttpOnly Session · Revocable refresh token · PKCE"
                action={language === "zh-CN" ? "安全设置" : "Security settings"}
                href={account?.accountUrl}
              />
              <SettingRow
                icon={Receipt}
                title={
                  language === "zh-CN" ? "钱包与订阅" : "Wallet & subscription"
                }
                detail={
                  language === "zh-CN"
                    ? "充值、套餐、发票与支付方式"
                    : "Top-ups, plans, invoices and payment methods"
                }
                action={language === "zh-CN" ? "管理钱包" : "Manage wallet"}
                href={account?.topUpUrl}
              />
            </section>
            <ReferenceAudioManager />
            <section className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xs font-semibold text-main">
                    {language === "zh-CN"
                      ? "退出当前设备"
                      : "Sign out this device"}
                  </h2>
                  <p className="mt-1 text-[11px] text-muted">
                    {language === "zh-CN"
                      ? "只清除 AI Music Studio 当前会话，不影响其他 ModelCross 应用。"
                      : "Clears this AI Music Studio session only and does not affect other ModelCross apps."}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost border !border-rose-500/20 text-rose-400"
                  onClick={onLogout}
                >
                  {language === "zh-CN" ? "退出登录" : "Sign out"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const { language } = useI18n();
  return (
    <div className="settings-workspace-shell">
      <WorkspacePageHeader
        icon={Gear}
        title={language === "zh-CN" ? "系统与偏好" : "Settings & preferences"}
        subtitle={
          language === "zh-CN"
            ? "设置音频采样率、默认模型、主题外观及账户信息"
            : "Configure audio output, default models, appearance and account details"
        }
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={props.onRefresh}
          >
            <Check width={14} height={14} />{" "}
            {language === "zh-CN" ? "保存设置" : "Save settings"}
          </button>
        }
      />
      <SettingsWorkspaceContent {...props} />
    </div>
  );
}

function SettingRow({
  icon: Icon,
  title,
  detail,
  action,
  href,
}: {
  icon: typeof Gear;
  title: string;
  detail: string;
  action?: string;
  href?: string | null;
}) {
  const { language } = useI18n();
  return (
    <div className="flex items-center gap-4 p-5">
      <span className="task-icon">
        <Icon width={17} height={17} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold text-main">{title}</h3>
        <p className="mt-1 text-[11px] text-muted">{detail}</p>
      </div>
      {action &&
        (href ? (
          <a
            className="btn-ghost border !border-[var(--line)] text-xs"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {action} <External width={12} height={12} />
          </a>
        ) : (
          <span className="status-chip">
            <Lock width={10} height={10} />{" "}
            {language === "zh-CN" ? "暂不可用" : "Unavailable"}
          </span>
        ))}
    </div>
  );
}

/** Owner-scoped reference upload inventory.  The Provider never receives this
 * list directly; it is only a management surface for private MuseFlow assets. */
export function ReferenceAudioManager() {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [uploads, setUploads] = useState<AudioUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setUploads(await api.referenceAudios());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text("参考音频列表暂不可用", "Reference audio list is unavailable"),
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const remove = async (upload: AudioUpload) => {
    if (
      !window.confirm(
        `${text("确认删除“", "Delete “")}${upload.originalFilename}${text("”？正在使用中的任务会被服务端拒绝。", "”? Active tasks using it will be rejected by the server.")}`,
      )
    )
      return;
    setDeleting(upload.id);
    try {
      await api.deleteReferenceAudio(upload.id);
      setUploads((current) => current.filter((item) => item.id !== upload.id));
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text(
              "删除失败，原始音频仍保留",
              "Delete failed; the original audio was kept",
            ),
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section
      className="surface-card overflow-hidden"
      aria-labelledby="reference-audio-manager-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <h2
            id="reference-audio-manager-title"
            className="text-sm font-semibold text-main"
          >
            {text("私有参考音频", "Private reference audio")}
          </h2>
          <p className="mt-1 text-[10px] leading-5 text-muted">
            {text(
              "对应 Suno upload / upload_extend；仅当前账号可见，删除会进入 OSS 清理队列。",
              "Maps to Suno upload / upload_extend; visible only to this account, with deletion queued for OSS cleanup.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost border !border-[var(--line)] text-xs"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <Spinner width={12} height={12} />
          ) : (
            <Refresh width={12} height={12} />
          )}{" "}
          {text("刷新", "Refresh")}
        </button>
      </div>
      {error && (
        <div
          className="m-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] text-rose-300"
          role="alert"
        >
          {error}
        </div>
      )}
      {uploads.length ? (
        <div className="divide-y divide-[var(--line)]">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3"
            >
              <span className="task-icon">
                <Music width={15} height={15} />
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs text-main">
                  {upload.originalFilename}
                </strong>
                <small className="mt-1 block text-[10px] text-muted">
                  {Math.round(upload.durationSeconds)} 秒 ·{" "}
                  {(upload.byteSize / 1024 / 1024).toFixed(1)} MiB ·{" "}
                  {upload.copyrightAudio
                    ? text("版权音频类型", "Copyright audio")
                    : text("普通音频", "Standard audio")}{" "}
                  · {upload.status}
                </small>
              </div>
              <button
                type="button"
                className="btn-ghost border !border-rose-500/20 text-xs text-rose-300"
                disabled={deleting === upload.id}
                onClick={() => void remove(upload)}
              >
                {deleting === upload.id ? (
                  <Spinner width={12} height={12} />
                ) : (
                  <Trash width={12} height={12} />
                )}{" "}
                {text("删除", "Delete")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <div className="p-7 text-center text-xs text-muted">
            {text(
              "暂无已保存的参考音频。你可以在创作工作台的“参考音频”模式上传。",
              "No saved reference audio. Upload one from the “Reference audio” mode in the workbench.",
            )}
          </div>
        )
      )}
    </section>
  );
}
