import {
  test,
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousAxeViolations,
} from "./fixtures";
import { makeTrack } from "../web/tests/track-fixture";
import {
  VIDEO_MODELS,
  createStoryboard,
} from "../server/src/platform/mv/catalog";
import type { MvProject, MvSettings } from "../server/src/platform/mv/types";

test("completed MV edits save before re-render; another take preserves prior preview", async ({
  page,
}) => {
  await page.request.post("/api/auth/dev-login", {
    data: { subject: `mv-edit-ui-${Date.now()}`, name: "MV Edit Test" },
  });
  await page.route("**/api/library**", (r) =>
    r.fulfill({
      json: [makeTrack({ title: "MV editing test", duration: 20 })],
    }),
  );
  const settings: MvSettings = {
    trackId: "track-1",
    title: "MV editing test",
    concept: "sea",
    model: "seedance-2.5",
    resolution: "480p",
    ratio: "16:9",
    duration: 20,
    shotSeconds: 10,
    referenceId: null,
    performance: "story",
    subtitles: true,
    subtitleStyle: "clean",
    srt: "1\n00:00:01,000 --> 00:00:03,000\nOriginal lyrics\n",
    audioGainDb: 0,
  };
  let p: MvProject = {
    id: "edit-ui-project",
    owner: "",
    settings,
    shots: createStoryboard(settings).map((s, i) => ({
      ...s,
      status: "ready",
      attempt: 1,
      sourceDuration: 10,
      versions: [
        {
          id: `take-${i}`,
          attempt: 1,
          model: s.model,
          prompt: s.prompt,
          duration: 10,
          createdAt: new Date().toISOString(),
          providerTaskId: null,
        },
      ],
      selectedVersionId: `take-${i}`,
    })),
    status: "completed",
    revision: 1,
    contentRevision: 1,
    outputRevision: 1,
    error: null,
    progress: 1,
    videoUrl: "/mock-final.mp4",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const writes: Array<{ path: string; body: any }> = [];
  // Every mutation is intercepted; no provider or saved user project is modified.
  await page.route("**/api/mv/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.pathname === "/api/mv/catalog")
      return route.fulfill({
        json: {
          models: VIDEO_MODELS,
          canGenerate: true,
          rendererReady: true,
          audioReferenceReady: true,
          billingMode: "provider-direct",
        },
      });
    if (url.pathname === "/api/mv/counts")
      return route.fulfill({ json: { active: 0, attention: 0 } });
    if (
      url.pathname.endsWith("/stems") ||
      url.pathname === "/api/mv/references"
    )
      return route.fulfill({ json: [] });
    if (url.pathname.endsWith("/quote"))
      return route.fulfill({
        json: {
          estimatedPoints: 0,
          remainingPoints: null,
          reservedPoints: 0,
          shots: [],
          source: "fixture",
          note: "estimate",
        },
      });
    if (url.pathname === "/api/mv/projects" && method === "GET")
      return route.fulfill({ json: [p] });
    if (method === "PATCH") {
      const body = route.request().postDataJSON();
      writes.push({ path: url.pathname, body });
      p = {
        ...p,
        revision: p.revision + 1,
        contentRevision: (p.contentRevision ?? 1) + 1,
        needsRender: true,
        settings: {
          ...p.settings,
          srt: body.srt,
          subtitleOffset: body.subtitleOffset,
        },
        shots: body.shots.map((s: any, i: number) => ({
          ...p.shots.find((v) => v.id === s.id),
          ...s,
          index: i,
          start: body.shots
            .slice(0, i)
            .reduce((n: number, v: any) => n + v.duration, 0),
        })),
      };
    }
    if (url.pathname.endsWith("/render")) {
      const body = route.request().postDataJSON();
      writes.push({ path: url.pathname, body });
      expect(body.revision).toBe(p.revision);
      p = { ...p, status: "assembling", revision: p.revision + 1 };
    }
    if (url.pathname.endsWith("/generate")) {
      const body = route.request().postDataJSON();
      writes.push({ path: url.pathname, body });
      p = { ...p, status: "generating", revision: p.revision + 1 };
    }
    return route.fulfill({ json: p });
  });
  await page.route("**/mock-final.mp4*", (r) =>
    r.fulfill({
      status: 200,
      contentType: "video/mp4",
      body: Buffer.from("test"),
    }),
  );
  await page.goto("/#/mv");
  await page.getByRole("button", { name: /项目记录/ }).click();
  await page.getByRole("button", { name: /MV editing test.*20/ }).click();
  await expect(
    page.getByRole("button", { name: "重新合成 · 保留旧版", exact: true }),
  ).toBeEnabled();
  await page.locator(".mv-subtitle-editor summary").click();
  await page
    .getByLabel("SRT", { exact: true })
    .fill("1\n00:00:01,000 --> 00:00:03,000\nCorrected lyrics\n");
  await page
    .getByRole("button", { name: "重新合成 · 保留旧版", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0].path).toBe("/api/mv/projects/edit-ui-project");
  expect(writes[0].body.srt).toContain("Corrected");
  expect(writes[1].path).toBe("/api/mv/projects/edit-ui-project/render");
  await expect(
    page.getByRole("link", { name: "下载 MV", exact: true }),
  ).toHaveAttribute("href", "/mock-final.mp4?download=1");
  p = { ...p, status: "completed", outputRevision: p.contentRevision };
  await page.reload();
  await page.getByRole("button", { name: /项目记录/ }).click();
  await page.getByRole("button", { name: /MV editing test.*20/ }).click();
  await page.getByRole("button", { name: "镜头 2 上移", exact: true }).click();
  await page.getByRole("button", { name: "保存分镜", exact: true }).click();
  await expect(page.getByLabel("镜头 1 素材版本", { exact: true })).toHaveValue(
    "take-1",
  );
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await page
    .getByRole("button", { name: "重新生成新版本", exact: true })
    .first()
    .click();
  await expect.poll(() => writes.at(-1)?.path.endsWith("/generate")).toBe(true);
  expect(writes.at(-1)?.body.regenerate).toBe(true);
  expect(writes.at(-1)?.body.shotId).toBe(p.shots[0].id);
});
