import { useEffect, useState } from "react";
import { mvApi, type MvProject } from "../mv-api";
import { Film, Refresh } from "./Icons";
import { useI18n } from "../i18n";
export function MvTasksPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<MvProject[]>([]),
    [error, setError] = useState("");
  const { language } = useI18n();
  const t = (a: string, b: string) => (language === "zh-CN" ? a : b);
  useEffect(() => {
    let gone = false;
    const load = () =>
      mvApi
        .list()
        .then((p) => {
          if (!gone) {
            setProjects(Array.isArray(p) ? p : []);
            setError("");
          }
        })
        .catch((e) => {
          if (!gone) setError(e.message);
        });
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <section
      className="surface-card p-4 mb-5"
      aria-label={t("MV 制作任务", "MV production tasks")}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Film width={17} />
          {t("MV 制作任务", "MV production tasks")}
        </h2>
        <button
          className="icon-btn"
          aria-label={t("刷新 MV 任务", "Refresh MV tasks")}
          onClick={() =>
            void mvApi
              .list()
              .then(setProjects)
              .catch((e) => setError(e.message))
          }
        >
          <Refresh width={14} />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger mt-3">
          {error}
        </p>
      )}
      {!projects.length && !error && (
        <p className="text-xs text-muted mt-3">
          {t(
            "创建 MV 后，分镜生成与合成进度会显示在这里。",
            "MV generation and rendering progress appears here.",
          )}
        </p>
      )}
      <div className="mv-task-list">
        {projects.slice(0, 20).map((p) => (
          <button key={p.id} onClick={() => onOpen(p.id)}>
            <b>{p.settings.title}</b>
            <span>
              {
                (
                  {
                    draft: t("待生成", "Draft"),
                    generating: t("生成镜头", "Generating"),
                    assembling: t("字幕与合成", "Rendering"),
                    completed: t("已完成", "Complete"),
                    failed: t("需要处理", "Needs attention"),
                    paused: t("已暂停", "Paused"),
                  } as Record<string, string>
                )[p.status]
              }{" "}
              · {p.shots.filter((s) => s.status === "ready").length}/
              {p.shots.length}
            </span>
            {p.error && <small>{p.error}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
