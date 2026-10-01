import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlatformDatabase } from '../../src/platform/database.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicWorker } from '../../src/platform/music-worker.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import { PlatformRepository } from '../../src/platform/repository.js';
import { SunoError, type NormalizedSunoTask, type SunoClient } from '../../src/suno.js';
import type { GenerateRequest } from '../../src/types.js';
import {
  isolatedPostgres,
  platformUser,
  testConfig,
  type IsolatedPostgres,
} from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);

const requestBody: GenerateRequest = {
  mode: 'simple',
  title: 'Worker hardening fixture',
  description: 'durable polling regression coverage',
  style: '',
  lyrics: '',
  instrumental: true,
  model: 'chirp-bluejay',
  negativeTags: '',
  vocalGender: 'auto',
  styleWeight: 0.65,
  weirdness: 0.5,
};

const normalized = (
  taskId: string,
  patch: Partial<NormalizedSunoTask> = {},
): NormalizedSunoTask => ({
  providerRecordId: null,
  taskId,
  upstreamStatus: 'processing',
  providerStatus: 1,
  status: 'running',
  stage: 'generating',
  progress: 0.5,
  customId: null,
  title: null,
  style: null,
  lyrics: null,
  instrumental: null,
  model: null,
  duration: 0,
  audioUrl: null,
  imageUrl: null,
  videoUrl: null,
  wavUrl: null,
  alignmentState: null,
  lyricAlignment: [],
  pointsCost: null,
  pointsRefunded: null,
  error: null,
  ...patch,
});

let postgres: IsolatedPostgres;
let repository: PlatformRepository;
let assetServer: http.Server;
let assetBaseUrl: string;

async function submittedGeneration(label: string) {
  const suffix = randomUUID();
  const user = platformUser(`${label}-${suffix}`);
  await repository.upsertIdentity(user);
  const created = await repository.createGenerationIntent({
    ownerSubject: user.subject,
    projectId: null,
    operation: 'generate',
    sourceTrackId: null,
    modelProfileId: requestBody.model,
    idempotencyKey: `${label}-${suffix}`,
    request: requestBody,
    estimatedCredits: 14,
    priceVersion: 'worker-hardening-v1',
  });
  await repository.setGenerationReservation(
    user.subject,
    created.intent.id,
    `disabled-operation-${suffix}`,
    `disabled-reservation-${suffix}`,
    'generation_single',
    'worker-hardening-v1',
    14,
    'disabled',
  );
  expect(await repository.claimGenerationProviderSubmission(user.subject, created.intent.id)).toBe('claimed');
  const upstreamTaskId = `${label}-provider-${suffix}`;
  const [track] = await repository.acceptGeneration(
    created.intent.id,
    user.subject,
    [upstreamTaskId],
    1,
  );
  return {
    user,
    generationId: created.intent.id,
    track: track!,
    upstreamTaskId,
    idempotencyKey: `${label}-${suffix}`,
  };
}

function workerFor(
  tasks: ReturnType<typeof vi.fn>,
  settle = vi.fn(async () => ({ status: 'disabled', settled_credits: 0 })),
  storage = {} as ObjectStorage,
) {
  const queue = { add: vi.fn(async () => undefined) };
  const events = { publish: vi.fn(async () => undefined) };
  const suno = { tasks, forCredential: vi.fn() };
  suno.forCredential.mockReturnValue(suno as unknown as SunoClient);
  const worker = new MusicWorker(
    testConfig({
      MUSIC_POLL_INTERVAL_MS: '500',
      WORKER_POLL_LEASE_MS: '30000',
      PROVIDER_RESULT_GRACE_MS: '5000',
    }),
    repository,
    { settle } as unknown as ModelCrossClient,
    suno as unknown as SunoClient,
    storage,
    queue as unknown as PlatformQueue,
    events as unknown as PlatformEventBus,
  );
  return { worker, queue, events, settle };
}

integration('MusicWorker polling hardening on PostgreSQL', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    assetServer = http.createServer((request, response) => {
      if (request.headers['user-agent'] !== 'MuseFlow/1.0') {
        response.writeHead(403).end();
        return;
      }
      const body = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32, 1)]);
      response.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': body.length });
      response.end(body);
    });
    await new Promise<void>((resolve) => assetServer.listen(0, '127.0.0.1', resolve));
    assetBaseUrl = `http://127.0.0.1:${(assetServer.address() as AddressInfo).port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => assetServer?.close((error) => error ? reject(error) : resolve()));
    await postgres?.close();
  });

  it('atomically leases a pollable Provider task once and makes it recoverable after lease expiry', async () => {
    const fixture = await submittedGeneration('lease');
    const scopedUrl = new URL(process.env.TEST_DATABASE_URL!);
    scopedUrl.searchParams.set('options', `-c search_path=${postgres.schema}`);
    const concurrentDatabase = new PlatformDatabase(scopedUrl.toString());
    const concurrentRepository = new PlatformRepository(concurrentDatabase);

    try {
      const [left, right] = await Promise.all([
        concurrentRepository.listPollableTasks(1, fixture.generationId, 30_000),
        concurrentRepository.listPollableTasks(1, fixture.generationId, 30_000),
      ]);
      const claimed = [...left, ...right];
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({
        generationId: fixture.generationId,
        trackId: fixture.track.id,
        upstreamTaskId: fixture.upstreamTaskId,
      });
      expect(await concurrentRepository.listPollableTasks(1, fixture.generationId, 30_000)).toEqual([]);

      const leased = await concurrentDatabase.query<{ remaining_ms: string }>(`SELECT
        FLOOR(EXTRACT(EPOCH FROM (next_poll_at-NOW()))*1000)::text AS remaining_ms
        FROM provider_tasks WHERE id=$1`, [claimed[0]!.id]);
      expect(Number(leased.rows[0]?.remaining_ms)).toBeGreaterThan(25_000);

      await concurrentDatabase.query(
        `UPDATE provider_tasks SET next_poll_at=NOW()-INTERVAL '1 second' WHERE id=$1`,
        [claimed[0]!.id],
      );
      expect(await concurrentRepository.listPollableTasks(1, fixture.generationId, 30_000))
        .toEqual([expect.objectContaining({ id: claimed[0]!.id })]);
    } finally {
      await concurrentDatabase.close();
    }
  });

  it('fences stale Provider, upload-stage, and asset-job workers after lease takeover', async () => {
    const provider = await submittedGeneration('fencing-provider');
    const [oldProviderLease] = await repository.listPollableTasks(1, provider.generationId, 30_000);
    await postgres.database.query(`UPDATE provider_tasks SET next_poll_at=NOW()-INTERVAL '1 second'
      WHERE id=$1`, [oldProviderLease!.id]);
    const [newProviderLease] = await repository.listPollableTasks(1, provider.generationId, 30_000);
    expect(newProviderLease!.pollLeaseToken).not.toBe(oldProviderLease!.pollLeaseToken);
    expect(await repository.applyProviderResult(newProviderLease!, normalized(provider.upstreamTaskId, {
      status: 'error', stage: 'error', progress: 1, error: 'new worker terminal result',
    }), 500)).toBe(true);
    expect(await repository.applyProviderResult(oldProviderLease!, normalized(provider.upstreamTaskId), 500)).toBe(false);
    expect(await repository.markTaskPollFailure(oldProviderLease!, 'stale overwrite', 500, true)).toBe(false);
    expect(await repository.getTrack(provider.user.subject, provider.track.id)).toMatchObject({
      status: 'error', error: 'new worker terminal result',
    });

    const upload = await submittedGeneration('fencing-upload');
    const uploadStageId = randomUUID();
    await postgres.database.query(`INSERT INTO upload_extend_stages(
      id,generation_id,owner_subject,upstream_task_id,status,stage
    ) VALUES($1,$2,$3,$4,'queued','uploading')`, [
      uploadStageId, upload.generationId, upload.user.subject, `upload-stage-${uploadStageId}`,
    ]);
    const [oldUploadLease] = await repository.listPollableUploadExtendStages(1, upload.generationId, 30_000);
    await postgres.database.query(`UPDATE upload_extend_stages SET next_poll_at=NOW()-INTERVAL '1 second'
      WHERE id=$1`, [uploadStageId]);
    const [newUploadLease] = await repository.listPollableUploadExtendStages(1, upload.generationId, 30_000);
    expect(newUploadLease!.pollLeaseToken).not.toBe(oldUploadLease!.pollLeaseToken);
    expect(await repository.applyUploadExtendStageResult(newUploadLease!, normalized(newUploadLease!.upstreamTaskId, {
      upstreamStatus: 'completed', providerStatus: 3, progress: 1, customId: 'new-worker-clip',
    }), 500)).toBe('ready');
    expect(await repository.applyUploadExtendStageResult(oldUploadLease!, normalized(oldUploadLease!.upstreamTaskId), 500))
      .toBe('stale');
    expect(await repository.markUploadExtendStagePollFailure(oldUploadLease!, 'stale overwrite', 500, true)).toBe(false);
    const uploadState = await postgres.database.query<{ status: string; custom_id: string }>(
      'SELECT status,custom_id FROM upload_extend_stages WHERE id=$1', [uploadStageId],
    );
    expect(uploadState.rows[0]).toEqual({ status: 'continuation_ready', custom_id: 'new-worker-clip' });

    const asset = await submittedGeneration('fencing-asset');
    await postgres.database.query(`UPDATE tracks SET status='done',stage='done',progress=1 WHERE id=$1`, [asset.track.id]);
    const assetJobId = randomUUID();
    await repository.createTrackAssetJob({
      id: assetJobId,
      ownerSubject: asset.user.subject,
      trackId: asset.track.id,
      action: 'video',
      operationCode: 'video_single',
      idempotencyKey: `fencing-asset-${assetJobId}`,
      request: {},
      estimatedCredits: 8,
    });
    await repository.setTrackAssetJobReservation({
      id: assetJobId,
      ownerSubject: asset.user.subject,
      operationId: `disabled-operation-${assetJobId}`,
      reservationId: `disabled-reservation-${assetJobId}`,
      operationCode: 'video_single',
      priceVersion: 'worker-hardening-v1',
      reservedCredits: 8,
      status: 'disabled',
    });
    expect(await repository.claimTrackAssetProviderSubmission(asset.user.subject, assetJobId)).toBe('claimed');
    await repository.acceptTrackAssetJob(asset.user.subject, assetJobId, `asset-provider-${assetJobId}`);
    const [oldAssetLease] = await repository.listPollableTrackAssetJobs(1, assetJobId, 30_000);
    await postgres.database.query(`UPDATE track_asset_jobs SET next_poll_at=NOW()-INTERVAL '1 second'
      WHERE id=$1`, [assetJobId]);
    const [newAssetLease] = await repository.listPollableTrackAssetJobs(1, assetJobId, 30_000);
    expect(newAssetLease!.pollLeaseToken).not.toBe(oldAssetLease!.pollLeaseToken);
    expect(await repository.applyTrackAssetJobResult(newAssetLease!, normalized(newAssetLease!.upstreamTaskId, {
      status: 'error', stage: 'error', progress: 1, error: 'new asset worker terminal result',
    }), 500)).toBe(true);
    expect(await repository.applyTrackAssetJobResult(oldAssetLease!, normalized(oldAssetLease!.upstreamTaskId), 500))
      .toBe(false);
    expect(await repository.markTrackAssetJobPollFailure(oldAssetLease!, 'stale overwrite', 500, true)).toBe(false);
    expect(await repository.getTrackAssetJob(asset.user.subject, assetJobId)).toMatchObject({
      status: 'failed', error: 'new asset worker terminal result',
    });
  });

  it('polls only the requested generation and leaves other Provider tasks untouched', async () => {
    const target = await submittedGeneration('direct-generation-target');
    const other = await submittedGeneration('direct-generation-other');
    const tasks = vi.fn(async (ids: string[]) => ids.map((id) => normalized(id)));
    const runtime = workerFor(tasks);

    await runtime.worker.process({
      name: 'music.poll',
      data: { generationId: target.generationId },
      id: 'direct-generation',
      attemptsMade: 0,
    });

    expect(tasks).toHaveBeenCalledOnce();
    expect(tasks).toHaveBeenCalledWith([target.upstreamTaskId]);
    const attempts = await postgres.database.query<{ generation_id: string; attempts: number }>(`SELECT
      generation_id,attempts FROM provider_tasks WHERE generation_id IN($1,$2)`, [
      target.generationId, other.generationId,
    ]);
    expect(Object.fromEntries(attempts.rows.map((row) => [row.generation_id, row.attempts]))).toEqual({
      [target.generationId]: 1,
      [other.generationId]: 0,
    });
  });

  it('does not publish or settle when a delayed poll resumes after its lease was fenced', async () => {
    const fixture = await submittedGeneration('delayed-stale-worker');
    let releaseProvider!: (results: NormalizedSunoTask[]) => void;
    const tasks = vi.fn(() => new Promise<NormalizedSunoTask[]>((resolve) => {
      releaseProvider = resolve;
    }));
    const runtime = workerFor(tasks);
    const delayed = runtime.worker.process({
      name: 'music.poll',
      data: { generationId: fixture.generationId },
      id: 'delayed-stale-poll',
      attemptsMade: 0,
    });
    await vi.waitFor(() => expect(tasks).toHaveBeenCalledOnce());

    await postgres.database.query(`UPDATE provider_tasks SET next_poll_at=NOW()-INTERVAL '1 second'
      WHERE generation_id=$1`, [fixture.generationId]);
    const [takeover] = await repository.listPollableTasks(1, fixture.generationId, 30_000);
    expect(takeover).toBeDefined();
    expect(await repository.applyProviderResult(takeover!, normalized(fixture.upstreamTaskId, {
      status: 'error', stage: 'error', progress: 1, error: 'takeover won',
    }), 500)).toBe(true);

    releaseProvider([normalized(fixture.upstreamTaskId, {
      upstreamStatus: 'completed', providerStatus: 3, progress: 1,
      audioUrl: 'https://provider.example/stale.mp3',
    })]);
    await delayed;

    expect(runtime.events.publish).not.toHaveBeenCalled();
    expect(runtime.settle).not.toHaveBeenCalled();
    expect(await repository.getTrack(fixture.user.subject, fixture.track.id)).toMatchObject({
      status: 'error', error: 'takeover won',
    });
  });

  it('keeps Provider uploads lease-scoped and deletes an object whose lease loses before commit', async () => {
    const fixture = await submittedGeneration('materialization-fencing-provider');
    const result = normalized(fixture.upstreamTaskId, {
      upstreamStatus: 'completed', providerStatus: 3, progress: 1,
      audioUrl: `${assetBaseUrl}/completed.mp3`, customId: `clip-${fixture.track.id}`,
    });
    const objects = new Set<string>();
    const deleted: string[] = [];
    let staleKey = '';
    let winningKey = '';
    let intercepted = false;
    const storage = {
      put: vi.fn(async (key: string, body: Buffer, mimeType: string) => {
        objects.add(key);
        if (!intercepted) {
          intercepted = true;
          staleKey = key;
          await postgres.database.query(`UPDATE provider_tasks SET next_poll_at=NOW()-INTERVAL '1 second'
            WHERE generation_id=$1`, [fixture.generationId]);
          const [takeover] = await repository.listPollableTasks(1, fixture.generationId, 30_000);
          expect(takeover).toBeDefined();
          expect(staleKey).not.toContain(takeover!.pollLeaseToken);
          expect(await repository.applyProviderResult(takeover!, result, 30_000)).toBe(true);
          winningKey = staleKey.replace(
            /\/audio\/leases\/[^/]+\//,
            `/audio/leases/${takeover!.pollLeaseToken}/`,
          );
          objects.add(winningKey);
          expect(await repository.markTrackMaterialized(takeover!, result, [{
            id: randomUUID(), trackId: fixture.track.id, ownerSubject: fixture.user.subject, kind: 'audio',
            objectKey: winningKey, mimeType: 'audio/mpeg', byteSize: body.length,
            etag: 'winning-etag', checksumSha256: 'a'.repeat(64),
          }])).toBe(true);
        }
        return {
          key, byteSize: body.length, mimeType, etag: 'stale-etag', checksumSha256: 'b'.repeat(64),
        };
      }),
      delete: vi.fn(async (key: string) => {
        deleted.push(key);
        objects.delete(key);
      }),
    } as unknown as ObjectStorage;
    const tasks = vi.fn(async () => [result]);
    const runtime = workerFor(tasks, undefined, storage);

    await runtime.worker.process({
      name: 'music.poll', data: { generationId: fixture.generationId },
      id: 'materialization-fencing-provider', attemptsMade: 0,
    });

    expect(staleKey).toContain('/audio/leases/');
    expect(staleKey).not.toBe(winningKey);
    expect(deleted).toEqual([staleKey]);
    expect([...objects]).toEqual([winningKey]);
    expect(await repository.getAsset(fixture.user.subject, fixture.track.id, 'audio')).toMatchObject({
      objectKey: winningKey,
    });
    expect(runtime.events.publish).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'track.completed', resourceId: fixture.track.id,
    }));
  });

  it('deletes a stale asset-job object and does not settle or publish after lease takeover', async () => {
    const fixture = await submittedGeneration('materialization-fencing-asset');
    await postgres.database.query(`UPDATE tracks SET status='done',stage='done',progress=1 WHERE id=$1`, [fixture.track.id]);
    await postgres.database.query(`UPDATE provider_tasks SET status='done',stage='done',progress=1
      WHERE generation_id=$1`, [fixture.generationId]);
    const jobId = randomUUID();
    await repository.createTrackAssetJob({
      id: jobId, ownerSubject: fixture.user.subject, trackId: fixture.track.id,
      action: 'aligned_lyrics', operationCode: 'aligned_lyrics_single',
      idempotencyKey: `materialization-fencing-asset-${jobId}`, request: {}, estimatedCredits: 2,
    });
    await repository.setTrackAssetJobReservation({
      id: jobId, ownerSubject: fixture.user.subject,
      operationId: `disabled-operation-${jobId}`, reservationId: `disabled-reservation-${jobId}`,
      operationCode: 'aligned_lyrics_single', priceVersion: 'worker-hardening-v1',
      reservedCredits: 2, status: 'disabled',
    });
    expect(await repository.claimTrackAssetProviderSubmission(fixture.user.subject, jobId)).toBe('claimed');
    const upstreamTaskId = `aligned-provider-${jobId}`;
    await repository.acceptTrackAssetJob(fixture.user.subject, jobId, upstreamTaskId);
    const result = normalized(upstreamTaskId, {
      upstreamStatus: 'completed', providerStatus: 3, progress: 1,
      alignmentState: 'complete',
      lyricAlignment: [{ word: '夜', startS: 0, endS: 0.5, success: true, confidence: 0.99 }],
    });
    const objects = new Set<string>();
    const deleted: string[] = [];
    let staleKey = '';
    let winningKey = '';
    let intercepted = false;
    const storage = {
      put: vi.fn(async (key: string, body: Buffer, mimeType: string) => {
        objects.add(key);
        if (!intercepted) {
          intercepted = true;
          staleKey = key;
          await postgres.database.query(`UPDATE track_asset_jobs SET next_poll_at=NOW()-INTERVAL '1 second'
            WHERE id=$1`, [jobId]);
          const [takeover] = await repository.listPollableTrackAssetJobs(1, jobId, 30_000);
          expect(takeover).toBeDefined();
          expect(staleKey).not.toContain(takeover!.pollLeaseToken);
          expect(await repository.applyTrackAssetJobResult(takeover!, result, 30_000)).toBe(true);
          winningKey = staleKey.replace(/\/[^/]+\.json$/, `/${takeover!.pollLeaseToken}.json`);
          objects.add(winningKey);
          expect(await repository.completeTrackAssetJob({
            id: jobId, ownerSubject: fixture.user.subject, pollLeaseToken: takeover!.pollLeaseToken,
            result: { state: result.alignmentState, alignment: result.lyricAlignment },
            asset: {
              id: randomUUID(), trackId: fixture.track.id, ownerSubject: fixture.user.subject,
              kind: 'aligned_lyrics', objectKey: winningKey, mimeType: 'application/json',
              byteSize: body.length, etag: 'winning-etag', checksumSha256: 'c'.repeat(64),
            },
          })).toBe(true);
        }
        return {
          key, byteSize: body.length, mimeType, etag: 'stale-etag', checksumSha256: 'd'.repeat(64),
        };
      }),
      delete: vi.fn(async (key: string) => {
        deleted.push(key);
        objects.delete(key);
      }),
    } as unknown as ObjectStorage;
    const tasks = vi.fn(async () => [result]);
    const runtime = workerFor(tasks, undefined, storage);

    await runtime.worker.process({
      name: 'music.poll', data: { assetJobId: jobId },
      id: 'materialization-fencing-asset', attemptsMade: 0,
    });

    expect(staleKey).toContain(`/aligned-lyrics/${jobId}/`);
    expect(staleKey).not.toBe(winningKey);
    expect(deleted).toEqual([staleKey]);
    expect([...objects]).toEqual([winningKey]);
    expect(await repository.getAsset(fixture.user.subject, fixture.track.id, 'aligned_lyrics')).toMatchObject({
      objectKey: winningKey,
    });
    expect(runtime.settle).not.toHaveBeenCalled();
    expect(runtime.events.publish).not.toHaveBeenCalled();
  });

  it('polls only the requested asset job and does not scan generation or sibling asset tasks', async () => {
    const source = await submittedGeneration('direct-asset-source');
    await postgres.database.query(`UPDATE tracks SET status='done',stage='done',progress=1 WHERE id=$1`, [source.track.id]);
    await postgres.database.query(`UPDATE provider_tasks SET status='done',stage='done',progress=1 WHERE generation_id=$1`, [
      source.generationId,
    ]);

    const createAssetJob = async (action: 'video' | 'convert_wav') => {
      const id = randomUUID();
      await repository.createTrackAssetJob({
        id,
        ownerSubject: source.user.subject,
        trackId: source.track.id,
        action,
        operationCode: action,
        idempotencyKey: `${action}-${id}`,
        request: {},
        estimatedCredits: 2,
      });
      await repository.setTrackAssetJobReservation({
        id,
        ownerSubject: source.user.subject,
        operationId: `disabled-operation-${id}`,
        reservationId: `disabled-reservation-${id}`,
        operationCode: action,
        priceVersion: 'worker-hardening-v1',
        reservedCredits: 2,
        status: 'disabled',
      });
      expect(await repository.claimTrackAssetProviderSubmission(source.user.subject, id)).toBe('claimed');
      const upstreamTaskId = `${action}-provider-${id}`;
      await repository.acceptTrackAssetJob(source.user.subject, id, upstreamTaskId);
      return { id, upstreamTaskId };
    };
    const target = await createAssetJob('video');
    const other = await createAssetJob('convert_wav');
    const tasks = vi.fn(async (ids: string[]) => ids.map((id) => normalized(id)));
    const runtime = workerFor(tasks);

    await runtime.worker.process({
      name: 'music.poll',
      data: { assetJobId: target.id },
      id: 'direct-asset-job',
      attemptsMade: 0,
    });

    expect(tasks).toHaveBeenCalledOnce();
    expect(tasks).toHaveBeenCalledWith([target.upstreamTaskId]);
    const attempts = await postgres.database.query<{ id: string; attempts: number }>(`SELECT id,attempts
      FROM track_asset_jobs WHERE id IN($1,$2)`, [target.id, other.id]);
    expect(Object.fromEntries(attempts.rows.map((row) => [row.id, row.attempts]))).toEqual({
      [target.id]: 1,
      [other.id]: 0,
    });
  });

  it('persists Retry-After for a 429 without throwing the queue job', async () => {
    const fixture = await submittedGeneration('retry-after');
    const tasks = vi.fn(async () => {
      throw new SunoError('Provider rate limited the poll', 429, 123_000);
    });
    const runtime = workerFor(tasks);

    await expect(runtime.worker.process({
      name: 'music.poll',
      data: { generationId: fixture.generationId },
      id: 'retry-after-429',
      attemptsMade: 0,
    })).resolves.toBeUndefined();

    const persisted = await postgres.database.query<{
      attempts: number;
      last_error: string;
      remaining_ms: string;
    }>(`SELECT attempts,last_error,
      FLOOR(EXTRACT(EPOCH FROM (next_poll_at-NOW()))*1000)::text AS remaining_ms
      FROM provider_tasks WHERE generation_id=$1`, [fixture.generationId]);
    expect(persisted.rows[0]).toMatchObject({
      attempts: 1,
      last_error: 'Provider rate limited the poll',
    });
    expect(Number(persisted.rows[0]?.remaining_ms)).toBeGreaterThan(120_000);
    expect(Number(persisted.rows[0]?.remaining_ms)).toBeLessThanOrEqual(123_000);
  });

  it('persists Retry-After for a 503 before surfacing the transient queue failure', async () => {
    const fixture = await submittedGeneration('retry-after-unavailable');
    const tasks = vi.fn(async () => {
      throw new SunoError('Provider temporarily unavailable', 503, 91_000);
    });
    const runtime = workerFor(tasks);

    await expect(runtime.worker.process({
      name: 'music.poll',
      data: { generationId: fixture.generationId },
      id: 'retry-after-503',
      attemptsMade: 0,
    })).rejects.toMatchObject({ status: 503, retryAfterMs: 91_000 });

    const persisted = await postgres.database.query<{
      attempts: number;
      last_error: string;
      remaining_ms: string;
    }>(`SELECT attempts,last_error,
      FLOOR(EXTRACT(EPOCH FROM (next_poll_at-NOW()))*1000)::text AS remaining_ms
      FROM provider_tasks WHERE generation_id=$1`, [fixture.generationId]);
    expect(persisted.rows[0]).toMatchObject({
      attempts: 1,
      last_error: 'Provider temporarily unavailable',
    });
    expect(Number(persisted.rows[0]?.remaining_ms)).toBeGreaterThan(88_000);
    expect(Number(persisted.rows[0]?.remaining_ms)).toBeLessThanOrEqual(91_000);
  });

  it('fails and releases billing when a completed task remains without audio beyond the durable grace window', async () => {
    const fixture = await submittedGeneration('missing-audio');
    await postgres.database.query(`UPDATE generation_batches SET billing_status='reserved' WHERE id=$1`, [
      fixture.generationId,
    ]);
    await postgres.database.query(`UPDATE billing_operation_mirrors SET status='reserved' WHERE generation_id=$1`, [
      fixture.generationId,
    ]);
    const tasks = vi.fn(async (ids: string[]) => ids.map((id) => normalized(id, {
      upstreamStatus: 'completed',
      providerStatus: 3,
      progress: 1,
      stage: 'downloading',
    })));
    const runtime = workerFor(tasks);

    await runtime.worker.process({
      name: 'music.poll',
      data: { generationId: fixture.generationId },
      id: 'missing-audio-first',
      attemptsMade: 0,
    });
    const waiting = await postgres.database.query<{
      terminal_wait_started_at: Date | null;
      task_status: string;
      track_status: string;
    }>(`SELECT pt.terminal_wait_started_at,pt.status AS task_status,t.status AS track_status
      FROM provider_tasks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.generation_id=$1`, [fixture.generationId]);
    expect(waiting.rows[0]?.terminal_wait_started_at).toBeInstanceOf(Date);
    expect(waiting.rows[0]).toMatchObject({ task_status: 'running', track_status: 'running' });

    await postgres.database.query(`UPDATE provider_tasks SET
      terminal_wait_started_at=NOW()-INTERVAL '6 seconds',next_poll_at=NOW()
      WHERE generation_id=$1`, [fixture.generationId]);
    await runtime.worker.process({
      name: 'music.poll',
      data: { generationId: fixture.generationId },
      id: 'missing-audio-expired',
      attemptsMade: 1,
    });

    expect(await repository.getTrack(fixture.user.subject, fixture.track.id)).toMatchObject({
      status: 'error',
      stage: 'error',
      error: 'Provider completed without an audio result',
    });
    expect(await repository.getGeneration(fixture.user.subject, fixture.generationId)).toMatchObject({
      status: 'failed',
      billingStatus: 'disabled',
    });
    const mirror = await postgres.database.query<{ status: string }>(
      'SELECT status FROM billing_operation_mirrors WHERE generation_id=$1', [fixture.generationId],
    );
    expect(mirror.rows[0]?.status).toBe('disabled');
    expect(runtime.settle).toHaveBeenCalledOnce();
    expect(runtime.settle).toHaveBeenCalledWith('', 'release', expect.objectContaining({
      resource_id: fixture.generationId,
      reason: 'all_tracks_failed',
    }), fixture.idempotencyKey);
    expect(runtime.events.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'track.failed',
      resourceId: fixture.track.id,
    }));
  });
});
