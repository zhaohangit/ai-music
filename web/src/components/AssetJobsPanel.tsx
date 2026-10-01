import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  isAssetJobInflight,
  type AssetJob,
  type AssetOperation,
  type Track,
} from "../types";
import { useI18n } from "../i18n";
import { Alert, Check, Download, Eye, Refresh, Spinner } from "./Icons";

interface Props {
  track: Track;
  createdJob?: AssetJob | null;
}

const ACTION_LABEL: Record<AssetOperation, [string, string]> = {
  aligned_lyrics: ["逐字歌词", "Aligned lyrics"],
  video: ["音乐视频", "Music video"],
  download_mp3: ["MP3 下载", "MP3 download"],
  download_m4a: ["M4A 下载", "M4A download"],
  convert_wav: ["WAV 转换", "WAV conversion"],
};

const STATUS_LABEL: Record<AssetJob["status"], [string, string]> = {
  queued: ["排队中", "Queued"],
  running: ["处理中", "Processing"],
  processing: ["处理中", "Processing"],
  completed: ["已完成", "Completed"],
  failed: ["失败", "Failed"],
};

const mergeJob = (jobs: AssetJob[], job: AssetJob) => [
  job,
  ...jobs.filter((item) => item.id !== job.id),
];

function alignedPreview(result: unknown): string | null {
  if (typeof result === "string" && result.trim()) return result.trim();
  if (!result || typeof result !== "object" || Array.isArray(result))
    return null;
  const record = result as Record<string, unknown>;
  for (const key of ["alignedLyrics", "lyrics", "text"]) {
    if (typeof record[key] === "string" && record[key].trim())
      return record[key].trim();
  }
  return null;
}

export function AssetJobsPanel({ track, createdJob = null }: Props) {
  const { language } = useI18n();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [jobs, setJobs] = useState<AssetJob[]>(track.assetJobs ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const loaded = await api.assetJobs(track.id);
        setJobs(loaded);
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : text("资产作业同步失败", "Asset job sync failed"),
        );
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [track.id],
  );

  useEffect(() => {
    setJobs(track.assetJobs ?? []);
    setError(null);
    void load();
  }, [load, track.assetJobs, track.id]);

  useEffect(() => {
    if (createdJob?.trackId === track.id)
      setJobs((current) => mergeJob(current, createdJob));
  }, [createdJob, track.id]);

  useEffect(() => {
    const interval = window.setInterval(
      () => {
        void load(true);
      },
      jobs.some(isAssetJobInflight) ? 4_000 : 15_000,
    );
    if (typeof EventSource === "undefined")
      return () => window.clearInterval(interval);
    const source = new EventSource(api.eventsUrl);
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    const synchronize = () => {
      void load(true);
    };
    const events = [
      "track.asset.queued",
      "track.asset.completed",
      "track.asset.failed",
    ];
    events.forEach((event) => source.addEventListener(event, synchronize));
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => source.removeEventListener(event, synchronize));
      source.close();
      setStreamConnected(false);
    };
  }, [jobs.some(isAssetJobInflight), load]);

  const latestCompleted = useMemo(() => {
    const result = new Map<AssetOperation, AssetJob>();
    jobs.forEach((job) => {
      if (job.status === "completed" && !result.has(job.action))
        result.set(job.action, job);
    });
    return result;
  }, [jobs]);
  const alignment = latestCompleted.get("aligned_lyrics");
  const alignmentText = alignedPreview(alignment?.result);

  return (
    <section className="asset-jobs-panel" aria-labelledby="asset-jobs-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="asset-jobs-title" className="label">
            {text("持久资产作业", "Persistent asset jobs")}
          </h3>
          <p className="mt-1 text-[10px] leading-4 text-muted">
            {text(
              "刷新页面后仍从服务端恢复",
              "Jobs recover from the server after refresh",
            )}
            ；
            {streamConnected
              ? text("实时事件已连接", "Live events connected")
              : text("轮询同步中", "Polling for updates")}
            。
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          disabled={loading}
          onClick={() => void load()}
          aria-label={text("刷新资产作业", "Refresh asset jobs")}
          title={text("刷新资产作业", "Refresh asset jobs")}
        >
          {loading ? (
            <Spinner width={14} height={14} />
          ) : (
            <Refresh width={14} height={14} />
          )}
        </button>
      </div>

      {error && (
        <div
          className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[10px] leading-4 text-amber-200"
          role="alert"
        >
          <div className="flex items-start gap-1.5">
            <Alert width={12} height={12} className="mt-0.5 shrink-0" />
            <span>
              {text("资产作业同步失败：", "Asset job sync failed: ")}
              {error}
            </span>
          </div>
          <button
            type="button"
            className="mt-2 font-semibold underline underline-offset-2"
            onClick={() => void load()}
          >
            {text("重新同步", "Sync again")}
          </button>
        </div>
      )}

      {(latestCompleted.size > 0 || track.videoUrl) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(latestCompleted.has("video") || track.videoUrl) && (
            <>
              <a
                className="asset-link"
                href={api.videoUrl(track.id)}
                target="_blank"
                rel="noreferrer"
              >
                <Eye width={13} height={13} /> {text("查看视频", "View video")}
              </a>
              <a
                className="asset-link"
                href={api.videoUrl(track.id, true)}
                download
              >
                <Download width={13} height={13} />{" "}
                {text("下载视频", "Download video")}
              </a>
            </>
          )}
          {(["mp3", "m4a"] as const).map(format => latestCompleted.has(`download_${format}`) && <a key={format} className="asset-link" href={`/api/tracks/${encodeURIComponent(track.id)}/${format}?download=1`} download><Download width={13}/>{text("下载", "Download")} {format.toUpperCase()}</a>)}
          {latestCompleted.has("convert_wav") && (
            <a
              className="asset-link sm:col-span-2"
              href={api.wavUrl(track.id)}
              download
            >
              <Download width={13} height={13} />{" "}
              {text("下载 WAV", "Download WAV")}
            </a>
          )}
          {alignment && (
            <>
              <a
                className="asset-link"
                href={api.alignedLyricsUrl(track.id)}
                target="_blank"
                rel="noreferrer"
              >
                <Eye width={13} height={13} />{" "}
                {text("查看逐字歌词", "View aligned lyrics")}
              </a>
              <a
                className="asset-link"
                href={api.alignedLyricsUrl(track.id, true)}
                download
              >
                <Download width={13} height={13} />{" "}
                {text("下载逐字歌词", "Download aligned lyrics")}
              </a>
            </>
          )}
        </div>
      )}

      {alignmentText && (
        <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-black/10 p-3 font-sans text-[10px] leading-5 text-muted">
          {alignmentText}
        </pre>
      )}

      <div className="mt-3 space-y-2" aria-live="polite">
        {jobs.length
          ? jobs.map((job) => (
              <article key={job.id} className="asset-job-row">
                <span
                  className={`asset-job-icon ${job.status === "completed" ? "is-done" : job.status === "failed" ? "is-error" : ""}`}
                >
                  {job.status === "completed" ? (
                    <Check width={13} height={13} />
                  ) : job.status === "failed" ? (
                    <Alert width={13} height={13} />
                  ) : (
                    <Spinner width={13} height={13} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{text(...ACTION_LABEL[job.action])}</strong>
                    <span className="text-[9px] text-muted">
                      {text(...STATUS_LABEL[job.status])}
                    </span>
                  </div>
                  {isAssetJobInflight(job) && (
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-4)]"
                      role="progressbar"
                      aria-label={
                        language === "zh-CN"
                          ? `${text(...ACTION_LABEL[job.action])}进度`
                          : `${text(...ACTION_LABEL[job.action])} progress`
                      }
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        Math.max(0, Math.min(1, job.progress)) * 100,
                      )}
                    >
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-accent to-coral"
                        style={{
                          width: `${Math.max(4, Math.round(Math.max(0, Math.min(1, job.progress)) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  {job.error && (
                    <p className="mt-1.5 break-words text-[9px] leading-4 text-rose-300">
                      {job.error}
                    </p>
                  )}
                  <small className="mt-1 block truncate font-mono text-[8px] text-subtle">
                    {job.id} ·{" "}
                    {job.billingStatus ||
                      text("账单同步中", "Billing sync in progress")}
                  </small>
                </div>
              </article>
            ))
          : !loading &&
            !error && (
              <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-center text-[10px] leading-4 text-muted">
                {text(
                  "暂无资产作业。创建视频、WAV 或逐字歌词后会显示在这里。",
                  "No asset jobs yet. Video, WAV or aligned-lyrics jobs will appear here.",
                )}
              </p>
            )}
      </div>
    </section>
  );
}
