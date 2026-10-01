import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicWorker } from '../../src/platform/music-worker.js';
import { LocalObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import { PlatformRepository, ResourceStateConflictError } from '../../src/platform/repository.js';
import { SunoActionsService } from '../../src/platform/suno-actions-service.js';
import type { NormalizedSunoTask, SunoClient } from '../../src/suno.js';
import type { GenerateRequest } from '../../src/types.js';
import type { AuthenticatedSession } from '../../src/platform/types.js';
import {
  claimTestGenerationProviderSubmission,
  isolatedPostgres,
  platformUser,
  testConfig,
  type IsolatedPostgres,
} from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);

class SignedLocalStorage extends LocalObjectStorage {
  async signedGetUrl(key: string): Promise<string> {
    return `https://private-storage.example.test/${encodeURIComponent(key)}?X-Amz-Signature=must-not-persist`;
  }
}

const requestBody: GenerateRequest = {
  mode: 'custom',
  title: 'Reference continuation',
  description: '',
  style: 'cinematic synth pop',
  lyrics: '[Verse]\nA durable reference continues',
  instrumental: false,
  model: 'chirp-bluejay',
  negativeTags: 'noise',
  vocalGender: 'auto',
  styleWeight: 0.7,
  weirdness: 0.4,
};

const normalized = (taskId: string, patch: Partial<NormalizedSunoTask> = {}): NormalizedSunoTask => ({
  providerRecordId: 7001,
  taskId,
  upstreamStatus: 'completed',
  providerStatus: 3,
  status: 'running',
  stage: 'downloading',
  progress: 1,
  customId: `clip-${taskId}`,
  title: null,
  style: null,
  lyrics: null,
  instrumental: null,
  model: null,
  duration: 120,
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
let objectRoot = '';

integration('Suno product actions with durable PostgreSQL state', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
    objectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'museflow-suno-actions-'));
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
    if (objectRoot) await fs.rm(objectRoot, { recursive: true, force: true });
  });

  it('persists providerRecordId for single-Track derived generations', async () => {
    const user = platformUser(`provider-record-${randomUUID()}`);
    await repository.upsertIdentity(user);
    const intent = await repository.createGenerationIntent({
      ownerSubject: user.subject,
      projectId: null,
      operation: 'whole_song',
      sourceTrackId: null,
      modelProfileId: requestBody.model,
      idempotencyKey: `whole-song-${randomUUID()}`,
      request: requestBody,
      estimatedCredits: 8,
      priceVersion: 'test-v1',
    });
    await claimTestGenerationProviderSubmission(repository, user.subject, intent.intent.id);
    const [track] = await repository.acceptGeneration(intent.intent.id, user.subject, ['whole-task'], 1);
    const [task] = await repository.listPollableTasks();
    await repository.applyProviderResult(task!, normalized('whole-task', {
      providerRecordId: 998877,
      customId: 'whole-clip',
    }), 1000);

    expect(await repository.getTrack(user.subject, track!.id)).toMatchObject({
      operation: 'whole_song',
      providerRecordId: 998877,
      customId: 'whole-clip',
    });
    const provider = await postgres.database.query<{ provider_record_id: string }>(
      'SELECT provider_record_id::text FROM provider_tasks WHERE track_id=$1', [track!.id],
    );
    expect(provider.rows[0]?.provider_record_id).toBe('998877');
  });

  it('exposes the trusted copyright variant only for an owner-scoped imported Track', async () => {
    const user = platformUser(`import-variant-${randomUUID()}`);
    await repository.upsertIdentity(user);
    const uploadId = randomUUID();
    const registered = await repository.registerReferenceAudioUpload({
      id: uploadId,
      ownerSubject: user.subject,
      objectKey: `users/test/reference/${uploadId}.wav`,
      originalFilename: 'rights-managed.wav',
      mimeType: 'audio/wav',
      byteSize: 2048,
      durationSeconds: 30,
      checksumSha256: 'd'.repeat(64),
      copyrightConfirmed: true,
      copyrightAudio: true,
      idempotencyKey: `import-upload-${randomUUID()}`,
      maxTotalBytes: 10_000,
    });
    await repository.finishReferenceAudioUpload(user.subject, registered.upload.id, 'ready');
    const generation = await repository.createGenerationIntent({
      ownerSubject: user.subject,
      projectId: null,
      operation: 'upload',
      sourceTrackId: null,
      referenceAudioId: uploadId,
      modelProfileId: requestBody.model,
      idempotencyKey: `import-action-${randomUUID()}`,
      request: requestBody,
      estimatedCredits: 20,
      priceVersion: 'test-v1',
    });
    await claimTestGenerationProviderSubmission(repository, user.subject, generation.intent.id);
    const [track] = await repository.acceptGeneration(generation.intent.id, user.subject, ['import-task'], 1);

    expect(await repository.getTrack(user.subject, track!.id)).toMatchObject({
      operation: 'upload',
      copyrightAudio: true,
      referenceAudioAvailable: true,
      referenceAudioDurationSeconds: 30,
    });
  });

  it('runs one-request upload→upload_extend as a recoverable two-stage generation without persisting the signed URL', async () => {
    const user = platformUser(`pipeline-${randomUUID()}`);
    await repository.upsertIdentity(user);
    const uploadId = randomUUID();
    const registered = await repository.registerReferenceAudioUpload({
      id: uploadId,
      ownerSubject: user.subject,
      objectKey: `users/test/reference/${uploadId}.mp3`,
      originalFilename: 'reference.mp3',
      mimeType: 'audio/mpeg',
      byteSize: 1024,
      durationSeconds: 120,
      checksumSha256: 'a'.repeat(64),
      copyrightConfirmed: true,
      copyrightAudio: false,
      idempotencyKey: `upload-${randomUUID()}`,
      maxTotalBytes: 10_000,
    });
    await repository.finishReferenceAudioUpload(user.subject, registered.upload.id, 'ready');

    const config = testConfig({
      STORAGE_DRIVER: 's3',
      S3_ACCESS_KEY_ID: 'test-access',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true',
    });
    const taskResults = new Map<string, NormalizedSunoTask>();
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39998',
      uploadAudio: vi.fn(async () => 'reference-upload-task'),
      generate: vi.fn(async () => ['continued-task-a', 'continued-task-b']),
      tasks: vi.fn(async (ids: string[]) => ids.flatMap((id) => taskResults.get(id) ?? [])),
      forCredential: vi.fn(),
    };
    suno.forCredential.mockReturnValue(suno as unknown as SunoClient);
    const modelCross = {
      musicOperationCatalog: vi.fn(async (_token: string, requested: Array<{ action: string; operationCode: string; fallbackCredits: number }>) =>
        requested.map((entry) => ({
          ...entry, available: true, estimatedCredits: entry.fallbackCredits,
          priceVersion: 'preview-test-v1', chargingEnabled: false, preview: true,
        }))),
      reserve: vi.fn(async (_token: string, input: { operationCode: string; resourceId: string; priceVersion: string }, credits: number) => ({
        operationId: `disabled-${input.resourceId}`,
        reservationId: `disabled-${input.resourceId}`,
        operationCode: input.operationCode,
        priceVersion: input.priceVersion,
        estimatedCredits: credits,
        currency: 'credits',
        partialSuccessPolicy: 'per_take',
        status: 'disabled',
      })),
      settle: vi.fn(async () => ({ status: 'disabled', settled_credits: 0 })),
    } as unknown as ModelCrossClient;
    const storage = new SignedLocalStorage(objectRoot);
    const queue = { add: vi.fn(async () => undefined) } as unknown as PlatformQueue;
    const events = { publish: vi.fn(async () => undefined) } as unknown as PlatformEventBus;
    const service = new SunoActionsService(config, repository, modelCross, suno, storage, queue, events);
    const session: AuthenticatedSession = {
      tokenHash: 'pipeline-session', user, clientId: 'test', accessToken: 'preview-token',
      refreshToken: 'refresh', idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    expect((await repository.getReferenceAudio(user.subject, uploadId))?.durationSeconds).toBe(120);
    await expect(service.referenceAction(session, uploadId, {
      action: 'upload_extend',
      ...requestBody,
      continueAt: 120.001,
      audioWeight: 0.65,
    }, `pipeline-out-of-range-${randomUUID()}`)).rejects.toThrow(/uploaded audio duration/);
    expect(suno.uploadAudio).not.toHaveBeenCalled();

    const key = `pipeline-action-${randomUUID()}`;
    const submitted = await service.referenceAction(session, uploadId, {
      action: 'upload_extend',
      ...requestBody,
      continueAt: 12.5,
      audioWeight: 0.65,
    }, key);

    expect(submitted.pending).toBe(true);
    expect(submitted.tracks).toEqual([]);
    expect(submitted.generation).toMatchObject({
      operation: 'upload_extend', referenceAudioId: uploadId, billingStatus: 'disabled',
    });
    expect((suno.uploadAudio as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.stringContaining('X-Amz-Signature=must-not-persist'), false, expect.stringMatching(/^mf-/),
    );
    const stored = await postgres.database.query<{
      operation_code: string; request_json: Record<string, unknown>; continue_at: number; audio_weight: number;
    }>(`SELECT b.operation_code,g.request_json,s.continue_at,s.audio_weight
      FROM generation_batches g JOIN upload_extend_stages s ON s.generation_id=g.id
      JOIN billing_operation_mirrors b ON b.generation_id=g.id WHERE g.id=$1`, [submitted.generation.id]);
    expect(stored.rows[0]).toMatchObject({
      operation_code: 'upload_extend_pair', continue_at: 12.5, audio_weight: 0.65,
    });
    expect(JSON.stringify(stored.rows[0])).not.toContain('X-Amz-Signature');

    taskResults.set('reference-upload-task', normalized('reference-upload-task', {
      providerRecordId: 8801,
      customId: 'uploaded-reference-clip',
    }));
    const worker = new MusicWorker(config, repository, modelCross, suno, storage, queue, events);
    await worker.process({
      name: 'music.poll', data: { generationId: submitted.generation.id }, id: 'pipeline-poll', attemptsMade: 0,
    });

    expect((suno.generate as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      requestBody,
      expect.objectContaining({
        operation: 'upload_extend', clipId: 'uploaded-reference-clip',
        continueAt: 12.5, audioWeight: 0.65,
      }),
    );
    const tracks = await repository.tracksForGeneration(user.subject, submitted.generation.id);
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.operation)).toEqual(['upload_extend', 'upload_extend']);
  });

  it('persists aligned lyrics as an attached private asset job and rejects video without a numeric record id', async () => {
    const user = platformUser(`asset-job-${randomUUID()}`);
    await repository.upsertIdentity(user);
    const generation = await repository.createGenerationIntent({
      ownerSubject: user.subject, projectId: null, operation: 'generate', sourceTrackId: null,
      modelProfileId: requestBody.model, idempotencyKey: `asset-source-${randomUUID()}`,
      request: requestBody, estimatedCredits: 20, priceVersion: 'test-v1',
    });
    await claimTestGenerationProviderSubmission(repository, user.subject, generation.intent.id);
    const tracks = await repository.acceptGeneration(
      generation.intent.id, user.subject, ['asset-source-a', 'asset-source-b'], 2,
    );
    await postgres.database.query(`UPDATE tracks SET status='done',stage='done',progress=1,
      custom_id=CASE WHEN id=$1 THEN 'asset-clip-a' ELSE 'asset-clip-b' END,
      provider_record_id=CASE WHEN id=$1 THEN 4242 ELSE NULL END,finished_at=NOW()
      WHERE generation_id=$2`, [tracks[0]!.id, generation.intent.id]);
    await postgres.database.query(`UPDATE provider_tasks SET status='done',stage='done',progress=1,
      custom_id=CASE WHEN track_id=$1 THEN 'asset-clip-a' ELSE 'asset-clip-b' END,
      provider_record_id=CASE WHEN track_id=$1 THEN 4242 ELSE NULL END WHERE generation_id=$2`, [
      tracks[0]!.id, generation.intent.id,
    ]);
    await repository.finalizeGeneration(generation.intent.id, 'succeeded', 'disabled', 0);

    const config = testConfig({ ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true' });
    const taskResults = new Map<string, NormalizedSunoTask>();
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39997',
      alignedLyrics: vi.fn(async () => 'alignment-task'),
      musicVideo: vi.fn(async () => 'video-task'),
      convertWav: vi.fn(async () => 'wav-task'),
      tasks: vi.fn(async (ids: string[]) => ids.flatMap((id) => taskResults.get(id) ?? [])),
      forCredential: vi.fn(),
    };
    suno.forCredential.mockReturnValue(suno as unknown as SunoClient);
    const modelCross = {
      musicOperationCatalog: vi.fn(async (_token: string, requested: Array<{ action: string; operationCode: string; fallbackCredits: number }>) =>
        requested.map((entry) => ({ ...entry, available: true, estimatedCredits: entry.fallbackCredits,
          priceVersion: 'preview-v1', chargingEnabled: false, preview: true }))),
      reserve: vi.fn(async (_token: string, input: { operationCode: string; resourceId: string; priceVersion: string }, credits: number) => ({
        operationId: `disabled-${input.resourceId}`, reservationId: `disabled-${input.resourceId}`,
        operationCode: input.operationCode, priceVersion: input.priceVersion, estimatedCredits: credits,
        currency: 'credits', partialSuccessPolicy: 'full_pair', status: 'disabled',
      })),
      settle: vi.fn(async () => ({ status: 'disabled', settled_credits: 0 })),
    } as unknown as ModelCrossClient;
    const storage = new SignedLocalStorage(objectRoot);
    const queue = { add: vi.fn(async () => undefined) } as unknown as PlatformQueue;
    const events = { publish: vi.fn(async () => undefined) } as unknown as PlatformEventBus;
    const service = new SunoActionsService(config, repository, modelCross, suno, storage, queue, events);
    const session: AuthenticatedSession = {
      tokenHash: 'asset-session', user, clientId: 'test', accessToken: 'preview-token',
      refreshToken: 'refresh', idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };

    const submitted = await service.assetAction(session, tracks[0]!.id, {
      action: 'aligned_lyrics', lyrics: 'A durable lyric',
    }, `alignment-${randomUUID()}`);
    expect(submitted.job).toMatchObject({
      action: 'aligned_lyrics', operationCode: 'aligned_lyrics_single', status: 'queued', billingStatus: 'disabled',
    });
    taskResults.set('alignment-task', normalized('alignment-task', {
      alignmentState: 'processing',
      lyricAlignment: [{ word: 'durable', startS: 0.1, endS: 0.8, success: true, confidence: 0.99 }],
    }));
    const worker = new MusicWorker(config, repository, modelCross, suno, storage, queue, events);
    await worker.process({
      name: 'music.poll', data: { assetJobId: submitted.job.id }, id: 'asset-poll', attemptsMade: 0,
    });
    expect(await repository.getTrackAssetJob(user.subject, submitted.job.id)).toMatchObject({
      status: 'running', billingStatus: 'disabled', assetKind: null,
    });

    taskResults.set('alignment-task', normalized('alignment-task', {
      alignmentState: 'aligned',
      lyricAlignment: [{ word: 'durable', startS: 0.1, endS: 0.8, success: true, confidence: 0.99 }],
    }));
    await postgres.database.query(`UPDATE track_asset_jobs SET next_poll_at=NOW()
      WHERE id=$1`, [submitted.job.id]);
    await worker.process({
      name: 'music.poll', data: { assetJobId: submitted.job.id }, id: 'asset-poll-aligned', attemptsMade: 0,
    });

    expect(await repository.getTrackAssetJob(user.subject, submitted.job.id)).toMatchObject({
      status: 'succeeded', billingStatus: 'disabled', assetKind: 'aligned_lyrics',
    });
    const alignment = await repository.getAsset(user.subject, tracks[0]!.id, 'aligned_lyrics');
    expect(alignment?.mimeType).toBe('application/json');
    const object = await storage.read(alignment!.objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toMatchObject({
      state: 'aligned', alignment: [{ word: 'durable' }],
    });

    await expect(service.assetAction(session, tracks[1]!.id, { action: 'video' }, `video-${randomUUID()}`))
      .rejects.toBeInstanceOf(ResourceStateConflictError);
    expect((suno.musicVideo as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('enforces reference-audio quota under the owner-scoped SQL lock and preserves idempotent replays', async () => {
    const user = platformUser(`quota-${randomUUID()}`);
    await repository.upsertIdentity(user);
    const key = `quota-upload-${randomUUID()}`;
    const first = await repository.registerReferenceAudioUpload({
      id: randomUUID(), ownerSubject: user.subject, objectKey: `quota/${randomUUID()}`,
      originalFilename: 'quota.mp3', mimeType: 'audio/mpeg', byteSize: 40, durationSeconds: 1,
      checksumSha256: 'b'.repeat(64), copyrightConfirmed: true, copyrightAudio: false,
      idempotencyKey: key, maxTotalBytes: 50,
    });
    const replay = await repository.registerReferenceAudioUpload({
      id: randomUUID(), ownerSubject: user.subject, objectKey: `quota/${randomUUID()}`,
      originalFilename: 'quota.mp3', mimeType: 'audio/mpeg', byteSize: 40, durationSeconds: 1,
      checksumSha256: 'b'.repeat(64), copyrightConfirmed: true, copyrightAudio: false,
      idempotencyKey: key, maxTotalBytes: 50,
    });
    expect(replay.replay).toBe(true);
    expect(replay.upload.id).toBe(first.upload.id);
    await expect(repository.registerReferenceAudioUpload({
      id: randomUUID(), ownerSubject: user.subject, objectKey: `quota/${randomUUID()}`,
      originalFilename: 'quota-2.mp3', mimeType: 'audio/mpeg', byteSize: 20, durationSeconds: 1,
      checksumSha256: 'c'.repeat(64), copyrightConfirmed: true, copyrightAudio: false,
      idempotencyKey: `quota-upload-2-${randomUUID()}`, maxTotalBytes: 50,
    })).rejects.toThrow('quota exceeded');
  });
});
