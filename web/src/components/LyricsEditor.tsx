import { useRef } from "react";
import { useI18n } from "../i18n";

const TAGS = [
  ["Intro", "前奏"],
  ["Verse", "主歌"],
  ["Pre-Chorus", "预副歌"],
  ["Chorus", "副歌"],
  ["Bridge", "桥段"],
  ["Outro", "尾奏"],
] as const;

export function LyricsEditor({
  value,
  onChange,
  rows = 10,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    const element = ref.current;
    const token = `[${tag}]`;
    if (!element)
      return onChange(value ? `${value}\n${token}\n` : `${token}\n`);
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before.length && !before.endsWith("\n") ? "\n" : "";
    const suffix = "\n";
    const next = `${before}${prefix}${token}${suffix}${after}`;
    onChange(next);
    const caret = before.length + prefix.length + token.length + suffix.length;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-1.5"
        aria-label={text("插入歌词段落标记", "Insert lyric section marker")}
      >
        {TAGS.map(([tag, label]) => (
          <button
            key={tag}
            type="button"
            className="chip"
            onClick={() => insertTag(tag)}
            title={`${text("插入", "Insert")} ${language === "zh-CN" ? label : tag}`}
          >
            [{tag}]
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field resize-y font-mono text-[13px] leading-relaxed"
        placeholder={text(
          "[Verse]\n写下第一段主歌……\n\n[Chorus]\n写下令人难忘的副歌……",
          "[Verse]\nWrite the first verse…\n\n[Chorus]\nWrite a memorable chorus…",
        )}
        maxLength={maxLength}
        aria-label={text("歌词", "Lyrics")}
      />
      <div
        className={`text-right text-[10px] tabular-nums ${maxLength && value.length > maxLength ? "text-rose-400" : "text-muted"}`}
      >
        {value.length} / {maxLength ?? "—"}
      </div>
    </div>
  );
}

const STRUCTURE_TYPES = [
  "Intro",
  "Verse 1",
  "Verse 2",
  "Pre-Chorus",
  "Chorus",
  "Bridge",
  "Drop",
  "Outro",
] as const;
type StructureType = (typeof STRUCTURE_TYPES)[number];
type LyricsSection = { type: StructureType; lines: string[] };

function parseSections(value: string): LyricsSection[] {
  const lines = value.split(/\r?\n/);
  const sections: LyricsSection[] = [];
  let current: LyricsSection = { type: "Verse 1", lines: [] };
  const commit = () => {
    if (current.lines.length || sections.length === 0) sections.push(current);
  };
  for (const line of lines) {
    const tag = line.trim().match(/^\[([^\]]+)\]$/)?.[1];
    if (tag) {
      commit();
      const normalized =
        STRUCTURE_TYPES.find(
          (type) => type.toLocaleLowerCase() === tag.toLocaleLowerCase(),
        ) ?? "Verse 1";
      current = { type: normalized, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  commit();
  return sections.map((section) => ({
    ...section,
    lines: section.lines.length ? section.lines : [""],
  }));
}

function serializeSections(sections: LyricsSection[]): string {
  return sections
    .map(
      (section) => `[${section.type}]\n${section.lines.join("\n").trimEnd()}`,
    )
    .join("\n\n")
    .replace(/\n+$/, "");
}

/**
 * Structured editor used by the Lyrics Studio only.  The canonical value is
 * still the same tagged string consumed by the generation API, so the
 * creation page and local draft storage keep their existing contract.
 */
export function StructuredLyricsEditor({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const sections = parseSections(value);
  const update = (next: LyricsSection[]) => onChange(serializeSections(next));
  const updateLine = (
    sectionIndex: number,
    lineIndex: number,
    line: string,
  ) => {
    update(
      sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              lines: section.lines.map((item, itemIndex) =>
                itemIndex === lineIndex ? line : item,
              ),
            }
          : section,
      ),
    );
  };
  const addLine = (sectionIndex: number) =>
    update(
      sections.map((section, index) =>
        index === sectionIndex
          ? { ...section, lines: [...section.lines, ""] }
          : section,
      ),
    );
  const addSection = () =>
    update([...sections, { type: "Verse 2", lines: [""] }]);
  const removeSection = (sectionIndex: number) =>
    update(
      sections.length === 1
        ? [{ type: "Verse 1", lines: [""] }]
        : sections.filter((_, index) => index !== sectionIndex),
    );
  const changeType = (sectionIndex: number, type: StructureType) =>
    update(
      sections.map((section, index) =>
        index === sectionIndex ? { ...section, type } : section,
      ),
    );

  return (
    <div className="structured-lyrics-editor">
      {/* Keep one canonical textbox for keyboard users and existing form integrations. */}
      <textarea
        aria-label={text("歌词", "Lyrics")}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="lyrics-canonical-input"
        tabIndex={-1}
      />
      <div className="space-y-4">
        {sections.map((section, sectionIndex) => (
          <section
            key={`${section.type}-${sectionIndex}`}
            className="lyrics-section-card"
          >
            <div className="lyrics-section-heading">
              <div className="flex min-w-0 items-center gap-2">
                <span className="lyrics-section-dot" />
                <select
                  aria-label={`${text("第", "Section ")}${sectionIndex + 1}${text("段类型", " type")}`}
                  className="lyrics-section-select"
                  value={section.type}
                  onChange={(event) =>
                    changeType(
                      sectionIndex,
                      event.target.value as StructureType,
                    )
                  }
                >
                  {STRUCTURE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <span className="lyrics-line-count">
                  {section.lines.length} {text("行", "lines")}
                </span>
              </div>
              <button
                type="button"
                className="icon-btn lyrics-section-delete"
                onClick={() => removeSection(sectionIndex)}
                aria-label={`${text("删除第", "Delete section ")}${sectionIndex + 1}${text("段", "")}`}
                title={text("删除段落", "Delete section")}
              >
                ×
              </button>
            </div>
            <div className="space-y-2">
              {section.lines.map((line, lineIndex) => (
                <label
                  key={`${sectionIndex}-${lineIndex}`}
                  className="lyrics-line-row"
                >
                  <span>{lineIndex + 1}</span>
                  <input
                    aria-label={`${section.type} ${text("第", "")}${lineIndex + 1}${text("行", " line")}`}
                    value={line}
                    onChange={(event) =>
                      updateLine(sectionIndex, lineIndex, event.target.value)
                    }
                    placeholder={text("输入歌词", "Enter lyrics")}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="lyrics-add-line"
              onClick={() => addLine(sectionIndex)}
            >
              ＋ {text("添加一行", "Add line")}
            </button>
          </section>
        ))}
      </div>
      <button type="button" className="lyrics-add-section" onClick={addSection}>
        ＋ {text("添加段落", "Add section")}
      </button>
      <div
        className={`text-right text-[10px] tabular-nums ${maxLength && value.length > maxLength ? "text-rose-400" : "text-muted"}`}
      >
        {value.length} / {maxLength ?? "—"}
      </div>
    </div>
  );
}
