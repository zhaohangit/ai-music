import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  isolatedPostgres,
  platformUser,
  testConfig,
  claimTestGenerationProviderSubmission,
  type IsolatedPostgres,
} from "./helpers.js";
import { PlatformRepository } from "../../src/platform/repository.js";
import { LocalObjectStorage } from "../../src/platform/object-storage.js";
import { MvService } from "../../src/platform/mv/service.js";
import { saveShotVersion } from "../../src/platform/mv/editing.js";
import { DEFAULT_MUSIC_MODEL_PROFILES } from "../../src/platform/catalog.js";
import type { MvProvider } from "../../src/platform/mv/provider.js";
import type { MvMedia } from "../../src/platform/mv/media.js";
import type { SunoActionsService } from "../../src/platform/suno-actions-service.js";
import type { AuthenticatedSession } from "../../src/platform/types.js";
import type { MvSettings, MvProject } from "../../src/platform/mv/types.js";
const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
integration("MV editing, regeneration, budgets and durable recovery", () => {
  let pg: IsolatedPostgres,
    repo: PlatformRepository,
    storage: LocalObjectStorage,
    service: MvService,
    root: string,
    settings: MvSettings;
  const user = platformUser("mv-repair-" + randomUUID(), ["admin"]),
    session = { user } as AuthenticatedSession;
  const request = vi.fn(async (route: string) =>
    route.includes("?")
      ? { status: "processing" }
      : { task_id: randomUUID(), status: "pending" },
  );
  const provider = {
    configured: async () => true,
    probe: async () => ({
      authenticated: true,
      remainingPoints: 1000000,
      checkedAt: "now",
      error: null,
    }),
    request,
  } as unknown as MvProvider;
  const media = {
    ready: async () => true,
    render: vi.fn(async () => {
      const dir = await fs.mkdtemp(path.join(root, "render-"));
      const file = path.join(dir, "final.mp4");
      await fs.writeFile(file, "test result");
      return {
        directory: dir,
        file,
        srt: "1\n00:00:01,000 --> 00:00:02,000\nHello\n",
      };
    }),
  } as unknown as MvMedia;
  beforeAll(async () => {
    pg = await isolatedPostgres();
    repo = new PlatformRepository(pg.database);
    await repo.upsertIdentity(user);
    await repo.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
    root = await fs.mkdtemp(path.join(os.tmpdir(), "mv-repair-"));
    storage = new LocalObjectStorage(path.join(root, "objects"));
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
        lyrics: "hello",
        style: "folk",
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
      [randomUUID()],
      1,
    );
    await pg.database.query(
      "UPDATE tracks SET status='done',duration=20,custom_id='clip' WHERE id=$1",
      [track.id],
    );
    const audio = await storage.put(
      "source/audio.mp3",
      Buffer.from("fixture"),
      "audio/mpeg",
    );
    await repo.upsertAsset({
      id: randomUUID(),
      trackId: track.id,
      ownerSubject: user.subject,
      kind: "audio",
      objectKey: audio.key,
      mimeType: audio.mimeType,
      byteSize: audio.byteSize,
      checksumSha256: audio.checksumSha256,
      etag: audio.etag,
    });
    settings = {
      trackId: track.id,
      title: "Repair",
      concept: "sea",
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
    service = new MvService(
      testConfig(),
      repo,
      storage,
      provider,
      media,
      {} as SunoActionsService,
    );
  });
  afterAll(async () => {
    await service?.close();
    await storage?.close();
    await pg?.close();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });
  const create = async () => {
    const p = await service.create(user.subject, settings, randomUUID());
    return service.get(user.subject, p.id);
  };
  const persist = async (p: MvProject) =>
    pg.database.query(
      "UPDATE mv_projects SET data=$1,status=$2,revision=$3,next_poll_at=NOW() WHERE id=$4",
      [JSON.stringify(p), p.status, p.revision, p.id],
    );
  const completed = async () => {
    const p = await create();
    for (const s of p.shots) {
      s.attempt = 1;
      s.providerTaskId = randomUUID();
      saveShotVersion(s, "take/" + s.id, 10);
    }
    p.status = "completed";
    p.outputKey = "old/final.mp4";
    await storage.put(p.outputKey,Buffer.from("old final"),"video/mp4");
    p.subtitleKey = "old/subs.srt";
    await persist(p);
    return service.get(user.subject, p.id);
  };
  it("saves caption changes, renders again and preserves the previous final cut", async () => {
    const p = await completed();
    const updated = await service.edit(user.subject, p.id, {
      revision: p.revision,
      shots: p.shots,
      srt: "1\n00:00:01,000 --> 00:00:02,000\nNew lyrics\n",
      subtitleOffset: 0.2,
    });
    expect(updated.needsRender).toBe(true);
    expect(updated.videoUrl).toBeTruthy();
    await service.assemble(user.subject, p.id, updated.revision);
    const calls = request.mock.calls.length;
    await service.tick("render");
    const result = await service.get(user.subject, p.id);
    expect(result.status).toBe("completed");
    expect(result.renderVersions).toHaveLength(2);
    expect(result.renderVersions?.[0].objectKey).toBe("old/final.mp4");
    expect(result.outputRevision).toBe(result.contentRevision);
    expect(request.mock.calls.length).toBe(calls);
    expect((await repo.getTrack(user.subject, settings.trackId))?.videoUrl).toBeNull();
  });
  it("creates a new attempt key for regeneration and retains the existing take", async () => {
    const p = await completed();
    const old = p.shots[0].selectedVersionId;
    await service.start(session, p.id, {
      revision: p.revision,
      shotId: p.shots[0].id,
      regenerate: true,
    });
    await service.tick("generation");
    const result = await service.get(user.subject, p.id);
    expect(result.shots[0].attempt).toBe(2);
    expect(result.shots[0].versions).toHaveLength(1);
    expect(result.shots[0].selectedVersionId).toBe(old);
    const call = request.mock.calls.find(
      (c) => c[0] === "/api/v2/video/seedance2-5",
    ) as unknown as unknown[];
    expect(call[2]).toBe(`mv-${p.shots[0].id}-2`);
    await pg.database.query(
      "UPDATE mv_projects SET status='paused' WHERE id=$1",
      [p.id],
    );
  });
  it("enforces submission budget before any upstream request", async () => {
    const p = await create();
    const updated = await service.edit(user.subject, p.id, {
      revision: p.revision,
      shots: p.shots,
      budgetPoints: 1,
    });
    const n = request.mock.calls.length;
    await expect(
      service.start(session, p.id, { revision: updated.revision }),
    ).rejects.toThrow("预算");
    expect(request.mock.calls).toHaveLength(n);
  });
  it("stops new submissions while retaining and polling already accepted tasks", async () => {
    const p = await create();
    await service.start(session, p.id, { revision: p.revision });
    await service.tick("generation");
    await service.pause(user.subject, p.id);
    const n = request.mock.calls.filter((c) => !c[0].includes("?")).length;
    await pg.database.query(
      "UPDATE mv_projects SET next_poll_at=NOW() WHERE id=$1",
      [p.id],
    );
    await service.tick("generation");
    expect(request.mock.calls.filter((c) => !c[0].includes("?"))).toHaveLength(
      n,
    );
    const result = await service.get(user.subject, p.id);
    expect(result.shots.filter((s) => s.status === "running")).toHaveLength(1);
    expect(result.shots.filter((s) => s.status === "queued")).toHaveLength(1);
    expect(result.pauseRequested).toBe(true);
    await pg.database.query(
      "UPDATE mv_projects SET status='paused' WHERE id=$1",
      [p.id],
    );
  });
  it("protects foreign references, archives/restores projects, and queues private media cleanup on delete", async () => {
    const p = await completed();
    await service.archive(user.subject, p.id, p.revision, true);
    expect((await service.list(user.subject)).some((v) => v.id === p.id)).toBe(
      false,
    );
    expect(
      (await service.list(user.subject, true)).some((v) => v.id === p.id),
    ).toBe(true);
    await service.archive(user.subject, p.id, p.revision, false);
    await service.deleteProject(user.subject, p.id, p.revision);
    await expect(service.get(user.subject, p.id)).rejects.toThrow("不存在");
    const tombstones = await pg.database.query(
      "SELECT object_key FROM storage_tombstones WHERE owner_subject=$1",
      [user.subject],
    );
    expect(tombstones.rows.some((r) => r.object_key === "old/final.mp4")).toBe(
      true,
    );
  });
  it("keeps a full-song caption source when trimming the MV and clips it during rendering", async () => {
    const p = await completed();
    const updated = await service.edit(user.subject, p.id, {
      revision: p.revision,
      shots: [{ ...p.shots[0], duration: 8 }, p.shots[1]],
      subtitles: true,
      srt: "1\n00:00:01,000 --> 00:00:02,000\nStart\n\n2\n00:00:19,000 --> 00:00:20,000\nTail\n",
    });
    expect(updated.settings.duration).toBe(18);
    await service.assemble(user.subject, p.id, updated.revision);
    await service.tick("render");
    const captions = vi.mocked(media.render).mock.calls.at(-1)![2];
    expect(captions).toEqual([{ start: 1, end: 2, text: "Start" }]);
  });
  it("prevents deleting source audio while a retained MV depends on it", async () => {
    await create();
    await expect(
      repo.deleteTrack(user.subject, settings.trackId),
    ).rejects.toThrow("MV");
  });

  it("does not mark the finished cut stale when only changing the submission budget", async () => {
    const p = await completed();
    const updated = await service.edit(user.subject, p.id, {
      revision: p.revision,
      shots: p.shots,
      budgetPoints: 100000,
    });
    expect(updated.needsRender).toBe(false);
    expect(updated.contentRevision).toBe(p.contentRevision);
  });
  it('a new render never silently replaces the song video until explicitly published',async()=>{
    const old=await storage.put('published/retained.mp4',Buffer.from('formal MV'),'video/mp4');
    await repo.upsertAsset({id:randomUUID(),trackId:settings.trackId,ownerSubject:user.subject,kind:'video',objectKey:old.key,mimeType:old.mimeType,byteSize:old.byteSize,checksumSha256:old.checksumSha256,etag:old.etag});
    const p=await completed();await service.assemble(user.subject,p.id,p.revision);await service.tick('render');
    expect((await repo.getAsset(user.subject,settings.trackId,'video'))?.checksumSha256).toBe(old.checksumSha256);
    await pg.database.query("UPDATE track_assets SET deleted_at=NOW() WHERE track_id=$1 AND kind='video'",[settings.trackId]);
  });

  it('publishes a completed project only when explicitly requested and copies into the track namespace',async()=>{
    await pg.database.query("UPDATE track_assets SET deleted_at=NOW() WHERE track_id=$1 AND kind='video'",[settings.trackId]);
    const p=await completed();const before=await repo.getAsset(user.subject,settings.trackId,'video');expect(before).toBeNull();
    const published=await service.publish(user.subject,p.id,p.revision,null);expect(published.published).toBe(true);expect(published.publishedRevision).toBe(p.outputRevision);
    const after=await repo.getAsset(user.subject,settings.trackId,'video');expect(after?.objectKey).toContain(`/tracks/${settings.trackId}/video/mv-published-`);expect(after?.objectKey).not.toContain(`/mv/${p.id}/`);
    const again=await service.get(user.subject,p.id);expect(again.outputKey).toBe(p.outputKey);expect(again.publishedVideoKey).toBe(after?.objectKey);
  });
  it('rejects publish while rendering or with a stale revision',async()=>{const p=await create();await expect(service.publish(user.subject,p.id,p.revision,null)).rejects.toThrow();await expect(service.publish(user.subject,p.id,p.revision+1,null)).rejects.toThrow();});

  it('rejects a stale publication token without changing the existing song video',async()=>{
    const p=await completed();const before=await repo.getAsset(user.subject,settings.trackId,'video');
    await expect(service.publish(user.subject,p.id,p.revision,'0'.repeat(64))).rejects.toThrow('视频入口');
    expect((await repo.getAsset(user.subject,settings.trackId,'video'))?.objectKey).toBe(before?.objectKey);
    const after=await service.get(user.subject,p.id);expect(after.revision).toBe(p.revision);
    expect((await storage.list(`users/`)).filter(k=>k.includes('mv-published-'))).toHaveLength(before?1:0);
  });

});
