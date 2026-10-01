import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import {
  isolatedPostgres,
  platformUser,
  testConfig,
  claimTestGenerationProviderSubmission,
  type IsolatedPostgres,
} from "./helpers.js";
import { PlatformRepository } from "../../src/platform/repository.js";
import { DEFAULT_MUSIC_MODEL_PROFILES } from "../../src/platform/catalog.js";
import { LocalObjectStorage } from "../../src/platform/object-storage.js";
import { MvService } from "../../src/platform/mv/service.js";
import type { MvProvider } from "../../src/platform/mv/provider.js";
import type { MvMedia } from "../../src/platform/mv/media.js";
import type { SunoActionsService } from "../../src/platform/suno-actions-service.js";
import type { AuthenticatedSession } from "../../src/platform/types.js";
import type { MvSettings } from "../../src/platform/mv/types.js";
const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
integration("MV durable ownership and submission", () => {
  let pg: IsolatedPostgres,
    repo: PlatformRepository,
    storage: LocalObjectStorage,
    dir: string,
    trackId: string,
    service: MvService;
  const user = platformUser(`mv-${randomUUID()}`),
    other = platformUser(`other-${randomUUID()}`);
  const session = { user } as AuthenticatedSession;
  const request = vi.fn();
  const provider = {
    configured: async () => true,
    request,
  } as unknown as MvProvider;
  const media = { ready: async () => true } as MvMedia;
  let settings: MvSettings;
  beforeAll(async () => {
    pg = await isolatedPostgres();
    repo = new PlatformRepository(pg.database);
    await repo.upsertIdentity(user);
    await repo.upsertIdentity(other);
    await repo.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mv-test-"));
    storage = new LocalObjectStorage(dir);
    const created = await repo.createGenerationIntent({
      ownerSubject: user.subject,
      projectId: null,
      operation: "generate",
      sourceTrackId: null,
      modelProfileId: "chirp-hawk",
      idempotencyKey: randomUUID(),
      request: {
        mode: "custom",
        title: "Test",
        description: "",
        style: "folk",
        lyrics: "hello",
        model: "chirp-hawk",
        instrumental: false,
        negativeTags: "",
        vocalGender: "auto",
        styleWeight: 0.5,
        weirdness: 0.5,
      },
      estimatedCredits: 20,
      priceVersion: "test",
    });
    await claimTestGenerationProviderSubmission(
      repo,
      user.subject,
      created.intent.id,
    );
    const [track] = await repo.acceptGeneration(
      created.intent.id,
      user.subject,
      ["mv-source-task"],
      1,
    );
    trackId = track.id;
    await pg.database.query(
      "UPDATE tracks SET status='done',duration=20,custom_id='mv-source-clip' WHERE id=$1",
      [trackId],
    );
    service = new MvService(
      testConfig(),
      repo,
      storage,
      provider,
      media,
      {} as SunoActionsService,
    );
    settings = {
      trackId,
      title: "Test MV",
      concept: "Walking by the sea",
      model: "seedance-2.5",
      resolution: "480p",
      ratio: "16:9",
      duration: 20,
      shotSeconds: 10,
      referenceId: null,
      performance: "story",
      subtitles: false,
      subtitleStyle: "clean",
      srt: "",
      audioGainDb: 0,
    };
  });
  afterAll(async () => {
    await service?.close();
    await storage?.close();
    await pg?.close();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });
  it("enforces ownership and digest-based idempotency", async () => {
    const key = randomUUID(),
      p = await service.create(user.subject, settings, key);
    expect((await service.create(user.subject, settings, key)).id).toBe(p.id);
    await expect(
      service.create(user.subject, { ...settings, title: "Different" }, key),
    ).rejects.toThrow();
    await expect(service.get(other.subject, p.id)).rejects.toThrow("MV 不存在");
    await expect(
      service.create(other.subject, settings, randomUUID()),
    ).rejects.toThrow();
    expect(p.owner).toBe("");
    expect(p.shots[0]).not.toHaveProperty("objectKey");
  });
  it("claims a submission once and refuses duplicate start while running", async () => {
    const p = await service.create(user.subject, settings, randomUUID());
    request.mockResolvedValue({ task_id: "upstream-mv", status: "pending" });
    await service.start(session, p.id, {
      revision: p.revision,
      shotId: p.shots[0].id,
    });
    await Promise.all([service.tick(), service.tick()]);
    expect(request).toHaveBeenCalledTimes(1);
    const saved = await service.get(user.subject, p.id);
    expect(saved.shots[0]).toMatchObject({
      status: "running",
      providerTaskId: "upstream-mv",
    });
    expect(saved.shots[1].status).toBe("draft");
    await expect(
      service.start(session, p.id, { revision: saved.revision }),
    ).rejects.toThrow();
    await pg.database.query(
      "UPDATE mv_projects SET status='draft' WHERE id=$1",
      [p.id],
    );
  });
  it("records an ambiguous paid submission and never automatically sends it again", async () => {
    request.mockReset().mockRejectedValue(new Error("network timeout"));
    const p = await service.create(user.subject, settings, randomUUID());
    await service.start(session, p.id, {
      revision: p.revision,
      shotId: p.shots[0].id,
    });
    await service.tick();
    const saved = await service.get(user.subject, p.id);
    expect(saved.shots[0].status).toBe("uncertain");
    expect(request).toHaveBeenCalledTimes(1);
    await pg.database.query(
      "UPDATE mv_projects SET next_poll_at=NOW() WHERE id=$1",
      [p.id],
    );
    await service.tick();
    expect(request).toHaveBeenCalledTimes(1);
    await expect(
      service.start(session, p.id, {
        revision: (await service.get(user.subject, p.id)).revision,
      }),
    ).rejects.toThrow("未知");
  });
});
