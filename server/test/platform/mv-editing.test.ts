import { describe, it, expect } from "vitest";
import {
  createStoryboard,
  validateSettings,
  videoModel,
} from "../../src/platform/mv/catalog.js";
import {
  normalizeProject,
  publicProject,
  editShots,
  splitShot,
  selectVersion,
  saveShotVersion,
  markChanged,
} from "../../src/platform/mv/editing.js";
import { estimateShot } from "../../src/platform/mv/pricing.js";
import type { MvProject, MvSettings } from "../../src/platform/mv/types.js";
const settings: MvSettings = {
  trackId: "a",
  title: "a",
  concept: "walk",
  model: "seedance-2.5",
  resolution: "480p",
  ratio: "16:9",
  duration: 20,
  shotSeconds: 10,
  referenceId: null,
  performance: "story",
  subtitles: true,
  subtitleStyle: "clean",
  srt: "",
  audioGainDb: 0,
};
const project = (): MvProject =>
  normalizeProject({
    id: "p",
    owner: "owner",
    settings: { ...settings },
    shots: createStoryboard(settings),
    status: "draft",
    revision: 1,
    error: null,
    progress: 0,
    createdAt: "2026-09-29T00:00:00Z",
    updatedAt: "2026-09-29T00:00:00Z",
  });
describe("MV non-destructive editing", () => {
  it("preserves old renders and strips all private keys from public versions", () => {
    const p = project();
    p.outputKey = "private/final.mp4";
    p.subtitleKey = "private/subs.srt";
    p.shots[0].objectKey = "private/take.mp4";
    p.shots[0].status = "ready";
    normalizeProject(p);
    markChanged(p);
    const out = publicProject(p);
    expect(out.needsRender).toBe(true);
    expect(out.renderVersions).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("private/");
    expect(out.shots[0].versions![0].videoUrl).toContain("?version=");
  });
  it("reorders and trims by source offset, then splits without copying or losing source media", () => {
    const p = project();
    p.shots.forEach((s) => saveShotVersion(s, `private/${s.id}`, 12));
    editShots(p, [
      { ...p.shots[1], duration: 8, sourceOffset: 2 },
      { ...p.shots[0] },
    ]);
    expect(p.shots.map((s) => s.start)).toEqual([0, 8]);
    expect(p.settings.duration).toBe(18);
    splitShot(p, p.shots[0].id, 3);
    expect(p.shots.map((s) => [s.start, s.duration, s.sourceOffset])).toEqual([
      [0, 3, 2],
      [3, 5, 5],
      [8, 10, 0],
    ]);
    expect(p.shots[0].objectKey).toBe(p.shots[1].objectKey);
  });
  it("retains take history and can restore a previous take after a failed regeneration", () => {
    const p = project(),
      s = p.shots[0];
    const a = saveShotVersion(s, "private/take-a", 10);
    s.attempt = 2;
    saveShotVersion(s, "private/take-b", 10);
    s.status = "failed";
    selectVersion(p, s.id, a.id);
    expect(s.status).toBe("ready");
    expect(s.objectKey).toBe("private/take-a");
    expect(s.versions).toHaveLength(2);
  });
  it("rejects duplicate shots, source overruns, unsupported Grok resolution and excessive lengths", () => {
    const p = project();
    expect(() => editShots(p, [p.shots[0], p.shots[0]])).toThrow();
    saveShotVersion(p.shots[0], "key", 10);
    expect(() =>
      editShots(p, [{ ...p.shots[0], sourceOffset: 4 }, p.shots[1]]),
    ).toThrow();
    expect(videoModel("grok-imagine-video").resolutions).not.toContain("1080p");
    expect(() =>
      validateSettings(
        { ...settings, model: "grok-imagine-video", resolution: "1080p" },
        20,
      ),
    ).toThrow();
  });
  it("produces positive non-zero estimates without promising zero-priced dynamic generation", () => {
    const s = createStoryboard(settings)[0];
    expect(estimateShot(settings, s)).toBeGreaterThan(600);
    expect(
      estimateShot(
        { ...settings, resolution: "1080p" },
        { ...s, model: "grok-imagine-video" },
      ),
    ).toBeNull();
    expect(
      estimateShot(settings, {
        ...s,
        model: "veo-3.1-fast",
        generationSeconds: 8,
      }),
    ).toBe(115);
  });
  it("uses available lyric phrase boundaries and adds lyric context without inventing timestamps", () => {
    const shots = createStoryboard(
      { ...settings, shotSeconds: 10, duration: 20 },
      [
        { start: 1, end: 8, text: "New leaves" },
        { start: 9, end: 17, text: "New leaves" },
      ],
    );
    expect(shots[0].duration).toBe(9);
    expect(shots[0].prompt).toContain("New leaves");
    expect(shots.reduce((n, s) => n + s.duration, 0)).toBeCloseTo(20);
    expect(shots.at(-1)!.start + shots.at(-1)!.duration).toBe(20);
  });
  it('locks a paused timeline until its running or unknown provider task has been reconciled',()=>{
    const p=project();p.status='paused';p.shots[0].status='running';expect(()=>editShots(p,[{...p.shots[0],prompt:'changed'},p.shots[1]])).toThrow('任务');
    expect(()=>editShots(p,p.shots.map(s=>({...s})))).not.toThrow();
  });

});
