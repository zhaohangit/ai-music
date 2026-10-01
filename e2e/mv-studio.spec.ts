import fs from "node:fs/promises";
import {
  expect,
  test,
  expectNoHorizontalOverflow,
  expectNoSeriousAxeViolations,
} from "./fixtures";
import {
  VIDEO_MODELS,
  createStoryboard,
} from "../server/src/platform/mv/catalog";
import { makeTrack } from "../web/tests/track-fixture";
import type { MvProject, MvSettings } from "../server/src/platform/mv/types";

test("MV studio: models, reference, storyboard, saved shots and responsive layout", async ({
  page,
}, testInfo) => {
  await page.request.post("/api/auth/dev-login", {
    data: { subject: `mv-ui-${Date.now()}`, name: "MV UI Test" },
  });
  const track = makeTrack({
    title: "嫩绿的回信｜王会杰",
    duration: 289.56,
    model: "chirp-hawk",
  });
  await page.route("**/api/library**", (r) => r.fulfill({ json: [track] }));
  const catalog = {
    models: VIDEO_MODELS,
    canGenerate: true,
    reason: null,
    rendererReady: true,
    audioReferenceReady: false,
    billingMode: "provider-direct",
  };
  let saved: MvProject | null = null;
  let submitted: string | undefined;
  // All paid UI actions terminate in this deterministic fake. No provider is called.
  await page.route("**/api/mv/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.pathname === "/api/mv/catalog")
      return route.fulfill({ json: catalog });
    if (url.pathname === "/api/mv/references" && method === "POST")
      return route.fulfill({
        status: 201,
        json: { id: "ref-ui", name: "参考人物.jpg", url: "/mv-fixture.jpg" },
      });
    if (url.pathname === "/api/mv/projects" && method === "GET")
      return route.fulfill({ json: saved ? [saved] : [] });
    if (url.pathname === "/api/mv/projects" && method === "POST") {
      const settings = route.request().postDataJSON() as MvSettings;
      saved = {
        id: "mv-ui-project",
        owner: "",
        settings,
        shots: createStoryboard(settings),
        status: "draft",
        revision: 1,
        error: null,
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return route.fulfill({ status: 201, json: saved });
    }
    if (url.pathname.endsWith("/generate")) {
      const body = route.request().postDataJSON();
      submitted = body.shotId;
      saved = {
        ...saved!,
        status: "generating",
        revision: saved!.revision + 1,
        shots: saved!.shots.map((s) =>
          s.id === submitted ? { ...s, status: "queued" } : s,
        ),
      };
      return route.fulfill({ status: 202, json: saved });
    }
    if (method === "PATCH") {
      const body = route.request().postDataJSON();
      saved = {
        ...saved!,
        revision: saved!.revision + 1,
        shots: saved!.shots.map((s) => ({
          ...s,
          ...body.shots.find((v: any) => v.id === s.id),
        })),
      };
    }
    return route.fulfill({ json: saved });
  });
  await page.route("**/mv-fixture.jpg", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.goto("/#/mv");
  await expect(
    page.getByRole("heading", { name: "MV 工作室 BETA" }),
  ).toBeVisible();
  await page
    .getByLabel("上传人物参考照片", { exact: true })
    .setInputFiles({
      name: "参考人物.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([255, 216, 255, 217]),
    });
  await expect(page.getByText("参考人物.jpg", { exact: true })).toBeVisible();
  const select = page.getByLabel("视频模型", { exact: true });
  await expect(select.locator("option")).toHaveCount(12);
  await select.selectOption("veo-3.1-fast");
  await expect(page.getByLabel("单镜头秒数", { exact: true })).toHaveValue("8");
  await select.selectOption("seedance-2.0-mini");
  await expect(
    page.getByLabel("分辨率", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await select.selectOption("seedance-2.5");
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await fs.mkdir("artifacts/mv-verification", { recursive: true });
  await page.screenshot({
    path: `artifacts/mv-verification/${testInfo.project.name}-setup.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "创建分镜脚本", exact: true }).click();
  await expect(page.locator(".mv-shot")).toHaveCount(20);
  await page
    .getByLabel("分镜描述 1", { exact: true })
    .fill("参考人物在晨光下转身，然后沿海岸行走，持续演唱。");
  await page.getByRole("button", { name: "保存分镜", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存分镜", exact: true }),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: `artifacts/mv-verification/${testInfo.project.name}-storyboard.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "生成此镜头", exact: true })
    .first()
    .click();
  await expect.poll(() => submitted).toBe(saved!.shots[0].id);
  expect(saved!.shots.filter((s) => s.status === "queued")).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "生成全部镜头", exact: true }),
  ).toBeDisabled();
});
