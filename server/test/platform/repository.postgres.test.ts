import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import {
  ConcurrencyLimitError,
  IdempotencyConflictError,
  PlatformRepository,
  ResourceNotFoundError,
  ResourceStateConflictError,
} from '../../src/platform/repository.js';
import type { AiAssistResult } from '../../src/platform/types.js';
import type { NormalizedSunoTask } from '../../src/suno.js';
import type { GenerateRequest, SoundGenerateRequest } from '../../src/types.js';
import {
  claimTestGenerationProviderSubmission,
  isolatedPostgres,
  platformUser,
  type IsolatedPostgres,
} from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
let postgres: IsolatedPostgres;
let repository: PlatformRepository;

const requestBody = (title = 'Night Signal'): GenerateRequest => ({
  mode: 'simple', title, description: 'cinematic synth pop at midnight', style: '', lyrics: '',
  instrumental: false, model: 'chirp-bluejay', negativeTags: 'harsh vocal', vocalGender: 'f',
  styleWeight: 0.65, weirdness: 0.4,
});

integration('PlatformRepository on PostgreSQL 16', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('applies migrations once, detects changed checksums, rolls transactions back, and reports readiness', async () => {
    expect(await postgres.database.ready()).toBe(true);
    expect(await postgres.database.migrate()).toEqual([]);

    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'museflow-migration-checksum-'));
    try {
      const migration = path.join(temporary, '999_test_guard.sql');
      await fs.writeFile(migration, 'CREATE TABLE checksum_guard(id TEXT PRIMARY KEY);\n');
      expect(await postgres.database.migrate(temporary)).toEqual(['999_test_guard.sql']);
      expect(await postgres.database.migrate(temporary)).toEqual([]);
      await fs.writeFile(migration, 'CREATE TABLE checksum_guard(id TEXT PRIMARY KEY, changed TEXT);\n');
      await expect(postgres.database.migrate(temporary)).rejects.toThrow('migration checksum changed after apply');
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }

    await postgres.database.query('CREATE TABLE rollback_guard(id TEXT PRIMARY KEY)');
    await expect(postgres.database.transaction(async (client) => {
      await client.query('INSERT INTO rollback_guard(id) VALUES($1)', ['should-rollback']);
      throw new Error('simulated crash');
    })).rejects.toThrow('simulated crash');
    expect((await postgres.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM rollback_guard')).rows[0]?.count)
      .toBe('0');
  });

  it('isolates identities and projects by the immutable OIDC subject', async () => {
    const suffix = randomUUID();
    const ownerA = platformUser(`owner-a-${suffix}`);
    const ownerB = platformUser(`owner-b-${suffix}`);
    await repository.upsertIdentity(ownerA);
    await repository.upsertIdentity(ownerB);
    const project = await repository.createProject(ownerA.subject, 'Private album', 'Owner A only');

    expect(await repository.listProjects(ownerA.subject)).toEqual([expect.objectContaining({
      id: project.id, ownerSubject: ownerA.subject, name: 'Private album', trackCount: 0,
    })]);
    expect(await repository.listProjects(ownerB.subject)).toEqual([]);
    expect(await repository.archiveProject(ownerB.subject, project.id)).toBe(false);
    expect((await repository.listProjects(ownerA.subject))[0]?.status).toBe('active');
    expect(await repository.archiveProject(ownerA.subject, project.id)).toBe(true);
    expect(await repository.listProjects(ownerA.subject)).toEqual([]);
  });

  it('keeps top-up money in minor currency units and isolates orders by owner', async () => {
    const suffix = randomUUID();
    const ownerA = platformUser(`payment-a-${suffix}`);
    const ownerB = platformUser(`payment-b-${suffix}`);
    await repository.upsertIdentity(ownerA);
    await repository.upsertIdentity(ownerB);
    const createdAtA = new Date('2026-08-25T08:30:00.000Z');
    const createdAtB = new Date('2026-08-25T08:31:00.000Z');
    await postgres.database.query(`INSERT INTO payment_order_mirrors(
      id,owner_subject,remote_order_id,provider,amount_minor,currency,status,created_at,updated_at
    ) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$8),
      ($9,$10,$11,$12,$13,$14,$15,$16,$16)`, [
      `payment-a-${suffix}`, ownerA.subject, `remote-a-${suffix}`, 'modelcross-cny', 12_345, 'CNY', 'paid', createdAtA,
      `payment-b-${suffix}`, ownerB.subject, `remote-b-${suffix}`, 'modelcross-usd', 678, 'USD', 'paid', createdAtB,
    ]);

    expect(await repository.listPaymentOrders(ownerA.subject)).toEqual([{
      id: `payment-a-${suffix}`,
      kind: 'topup',
      description: 'modelcross-cny 充值',
      amount: 12_345,
      amountMinor: 12_345,
      credits: null,
      status: 'paid',
      createdAt: createdAtA.toISOString(),
      currency: 'CNY',
    }]);
    expect(await repository.listPaymentOrders(ownerB.subject)).toEqual([{
      id: `payment-b-${suffix}`,
      kind: 'topup',
      description: 'modelcross-usd 充值',
      amount: 678,
      amountMinor: 678,
      credits: null,
      status: 'paid',
      createdAt: createdAtB.toISOString(),
      currency: 'USD',
    }]);
  });

  it('replays identical requests, conflicts on changed payloads, and allows the same key for another owner', async () => {
    const suffix = randomUUID();
    const ownerA = platformUser(`idem-a-${suffix}`);
    const ownerB = platformUser(`idem-b-${suffix}`);
    await repository.upsertIdentity(ownerA);
    await repository.upsertIdentity(ownerB);
    const project = await repository.createProject(ownerA.subject, 'Idempotent album', '');
    const idempotencyKey = `generate-${suffix}`;
    const input = {
      ownerSubject: ownerA.subject,
      projectId: project.id,
      operation: 'generate' as const,
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey,
      request: requestBody(),
      estimatedCredits: 14,
      priceVersion: 'music-2026-08-v1',
    };

    const first = await repository.createGenerationIntent(input);
    const replay = await repository.createGenerationIntent(input);
    expect(first.replay).toBe(false);
    expect(replay.replay).toBe(true);
    expect(replay.intent.id).toBe(first.intent.id);

    await expect(repository.createGenerationIntent({
      ...input, request: requestBody('Different title'),
    })).rejects.toBeInstanceOf(IdempotencyConflictError);

    const otherOwner = await repository.createGenerationIntent({
      ...input, ownerSubject: ownerB.subject, projectId: null,
    });
    expect(otherOwner.replay).toBe(false);
    expect(otherOwner.intent.id).not.toBe(first.intent.id);

    await expect(repository.createGenerationIntent({
      ...input, ownerSubject: ownerB.subject, projectId: project.id, idempotencyKey: `${idempotencyKey}-foreign-project`,
    })).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('persists optional sound controls and includes each one in the idempotency contract', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`sound-owner-${suffix}`);
    await repository.upsertIdentity(owner);
    const idempotencyKey = `sound-${suffix}`;
    const soundRequest: SoundGenerateRequest = {
      kind: 'sound', mode: 'custom', title: 'Rain', description: '', style: 'rain ambience', lyrics: '',
      instrumental: true, model: 'chirp-crow', negativeTags: '', vocalGender: 'auto',
      styleWeight: 0.5, weirdness: 0.5, soundTempo: 99, soundKey: 'D', soundLoop: true,
    };
    const input = {
      ownerSubject: owner.subject,
      projectId: null,
      operation: 'sound' as const,
      sourceTrackId: null,
      modelProfileId: 'chirp-crow',
      idempotencyKey,
      request: soundRequest,
      estimatedCredits: 20,
      priceVersion: 'sound-preview-v1',
    };

    const created = await repository.createGenerationIntent(input);
    expect((await repository.createGenerationIntent(input)).intent.id).toBe(created.intent.id);
    for (const request of [
      { ...soundRequest, soundTempo: 100 },
      { ...soundRequest, soundKey: 'E' },
      { ...soundRequest, soundLoop: false },
    ]) {
      await expect(repository.createGenerationIntent({ ...input, request }))
        .rejects.toBeInstanceOf(IdempotencyConflictError);
    }

    await claimTestGenerationProviderSubmission(repository, owner.subject, created.intent.id);
    const tracks = await repository.acceptGeneration(created.intent.id, owner.subject, [
      `sound-provider-a-${suffix}`, `sound-provider-b-${suffix}`,
    ]);
    expect(tracks).toHaveLength(2);
    expect(tracks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'sound', title: 'Rain', style: 'rain ambience', model: 'chirp-crow',
        soundTempo: 99, soundKey: 'D', soundLoop: true,
      }),
    ]));
  });

  it('keeps generated tracks, provider ids and private assets invisible across users', async () => {
    const suffix = randomUUID();
    const ownerA = platformUser(`track-a-${suffix}`);
    const ownerB = platformUser(`track-b-${suffix}`);
    await repository.upsertIdentity(ownerA);
    await repository.upsertIdentity(ownerB);
    const created = await repository.createGenerationIntent({
      ownerSubject: ownerA.subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey: `track-generate-${suffix}`,
      request: requestBody(),
      estimatedCredits: 14,
      priceVersion: 'music-2026-08-v1',
    });
    await claimTestGenerationProviderSubmission(repository, ownerA.subject, created.intent.id);
    const tracks = await repository.acceptGeneration(
      created.intent.id,
      ownerA.subject,
      [`provider-a-${suffix}`, `provider-b-${suffix}`],
    );
    expect(tracks).toHaveLength(2);
    expect(tracks[0]?.id).not.toBe(tracks[0]?.upstreamTaskId);
    expect(tracks[0]?.upstreamTaskId).toBe(`provider-a-${suffix}`);
    expect(await repository.tracksForGeneration(ownerB.subject, created.intent.id)).toEqual([]);
    expect(await repository.getGeneration(ownerB.subject, created.intent.id)).toBeNull();
    expect(await repository.getTrack(ownerB.subject, tracks[0]!.id)).toBeNull();

    const audioAsset = {
      id: randomUUID(), trackId: tracks[0]!.id, ownerSubject: ownerA.subject, kind: 'audio',
      objectKey: `users/${ownerA.subject}/tracks/${tracks[0]!.id}/audio/original.mp3`,
      mimeType: 'audio/mpeg', byteSize: 100, etag: 'etag-a', checksumSha256: 'a'.repeat(64),
    } as const;
    await repository.upsertAsset(audioAsset);
    expect(await repository.getAsset(ownerA.subject, tracks[0]!.id, 'audio')).toMatchObject({
      ownerSubject: ownerA.subject, trackId: tracks[0]!.id, kind: 'audio',
    });
    expect(await repository.getAsset(ownerB.subject, tracks[0]!.id, 'audio')).toBeNull();

    const providerTask = (await repository.listPollableTasks()).find((task) => task.trackId === tracks[0]!.id);
    expect(providerTask).toBeDefined();
    const materialized: NormalizedSunoTask = {
      providerRecordId: 998_877,
      taskId: tracks[0]!.upstreamTaskId!,
      upstreamStatus: 'completed',
      providerStatus: 3,
      status: 'done',
      stage: 'done',
      progress: 1,
      customId: `clip-${suffix}`,
      title: null,
      style: null,
      lyrics: null,
      instrumental: null,
      model: null,
      duration: 123,
      audioUrl: null,
      imageUrl: null,
      videoUrl: null,
      wavUrl: null,
      alignmentState: null,
      lyricAlignment: [],
      pointsCost: null,
      pointsRefunded: null,
      error: null,
    };
    await repository.markTrackMaterialized(providerTask!, materialized, [audioAsset]);
    expect(await repository.getTrack(ownerA.subject, tracks[0]!.id)).toMatchObject({
      status: 'done',
      duration: 123,
      customId: `clip-${suffix}`,
      providerRecordId: 998_877,
    });

    expect(await repository.deleteTrack(ownerB.subject, tracks[0]!.id)).toBeNull();
    expect(await repository.getTrack(ownerA.subject, tracks[0]!.id)).not.toBeNull();

    await expect(repository.deleteTrack(ownerA.subject, tracks[0]!.id))
      .rejects.toBeInstanceOf(ResourceStateConflictError);
    await repository.finalizeGeneration(created.intent.id, 'succeeded', 'disabled', 0);

    const deletedAssets = await repository.deleteTrack(ownerA.subject, tracks[0]!.id);
    expect(deletedAssets).toHaveLength(1);
    expect(await repository.getTrack(ownerA.subject, tracks[0]!.id)).toBeNull();
    expect(await repository.pendingStorageTombstones()).toContainEqual(expect.objectContaining({
      ownerSubject: ownerA.subject,
      objectKey: `users/${ownerA.subject}/tracks/${tracks[0]!.id}/audio/original.mp3`,
    }));
  });

  it('rejects AI run links to a project owned by another OIDC subject', async () => {
    const suffix = randomUUID();
    const ownerA = platformUser(`ai-project-a-${suffix}`);
    const ownerB = platformUser(`ai-project-b-${suffix}`);
    await repository.upsertIdentity(ownerA);
    await repository.upsertIdentity(ownerB);
    const foreignProject = await repository.createProject(ownerA.subject, 'Owner A project', 'private');

    await expect(repository.createAiRun({
      id: randomUUID(), ownerSubject: ownerB.subject, projectId: foreignProject.id,
      capabilityKey: 'lyrics.generate', modelAlias: 'mc-music-lyrics', promptVersion: 'test-v1',
      original: 'private song idea', estimatedCredits: 2,
      idempotencyKey: `ai-project-${suffix}`, requestDigest: 'b'.repeat(64),
    })).rejects.toBeInstanceOf(ResourceNotFoundError);

    const count = await postgres.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count
      FROM ai_assistant_runs WHERE owner_subject=$1`, [ownerB.subject]);
    expect(count.rows[0]?.count).toBe('0');
  });

  it('replays authoritative AI billing after captured and released reconciliation', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`ai-billing-replay-${suffix}`);
    await repository.upsertIdentity(owner);

    const createCompletedRun = async (
      label: string,
      operationCode: AiAssistResult['billing']['operationCode'],
      estimatedCredits: number,
    ) => {
      const id = randomUUID();
      const idempotencyKey = `ai-billing-${label}-${suffix}`;
      const requestDigest = label.repeat(64).slice(0, 64);
      await repository.createAiRun({
        id,
        ownerSubject: owner.subject,
        projectId: null,
        capabilityKey: 'prompt.optimize',
        modelAlias: 'mc-music-fast',
        promptVersion: 'test-v1',
        original: `${label} source`,
        estimatedCredits,
        idempotencyKey,
        requestDigest,
      });
      await repository.setAiRunReservation({
        id,
        ownerSubject: owner.subject,
        operationCode,
        idempotencyKey,
        operationId: `operation-${id}`,
        reservationId: `reservation-${id}`,
        priceVersion: 'ai-billing-test-v1',
        reservedCredits: estimatedCredits,
        status: 'reserved',
      });
      const completed: AiAssistResult = {
        id,
        action: 'prompt.optimize',
        original: `${label} source`,
        suggestion: `${label} optimized`,
        summary: `${label} summary`,
        estimatedCredits,
        outputMode: 'replacement',
        fields: { prompt: `${label} optimized` },
        billing: {
          operationCode,
          priceVersion: 'ai-billing-test-v1',
          estimatedCredits,
          status: 'reconcile_required',
        },
        createdAt: new Date().toISOString(),
      };
      await repository.completeAiRun(id, owner.subject, { completed, requestId: `request-${id}` });
      await repository.settleAiRunBilling(id, owner.subject, 'reconcile_required', 0, 'capture response lost');
      return { id, idempotencyKey, requestDigest, completed };
    };

    const captured = await createCompletedRun('captured', 'prompt_optimize', 2);
    await repository.settleAiRunBilling(captured.id, owner.subject, 'captured', 2);
    const capturedReplay = await repository.replayAiRun(
      owner.subject,
      captured.idempotencyKey,
      captured.requestDigest,
    );
    expect(capturedReplay).toMatchObject({
      actualCredits: 2,
      billing: { status: 'captured', actualCredits: 2 },
    });
    const capturedCopies = await postgres.database.query<{
      billing_status: string;
      actual_credits: string;
      result_json: AiAssistResult;
      response_json: AiAssistResult;
    }>(`SELECT a.billing_status,a.actual_credits::text,a.result_json,i.response_json
      FROM ai_assistant_runs a JOIN idempotency_keys i
        ON i.owner_subject=a.owner_subject AND i.scope='ai.assist' AND i.resource_id=a.id
      WHERE a.id=$1`, [captured.id]);
    expect(capturedCopies.rows[0]).toMatchObject({
      billing_status: 'captured',
      actual_credits: '2',
      result_json: { actualCredits: 2, billing: { status: 'captured', actualCredits: 2 } },
      response_json: { actualCredits: 2, billing: { status: 'captured', actualCredits: 2 } },
    });
    expect(capturedCopies.rows[0]?.response_json).toEqual(capturedCopies.rows[0]?.result_json);

    const released = await createCompletedRun('released', 'prompt_optimize', 1);
    await repository.settleAiRunBilling(released.id, owner.subject, 'released', 0, 'AI request failed safely');
    const createReplay = await repository.createAiRun({
      id: randomUUID(),
      ownerSubject: owner.subject,
      projectId: null,
      capabilityKey: 'prompt.optimize',
      modelAlias: 'mc-music-fast',
      promptVersion: 'test-v1',
      original: 'released source',
      estimatedCredits: 1,
      idempotencyKey: released.idempotencyKey,
      requestDigest: released.requestDigest,
    });
    expect(createReplay).toMatchObject({
      actualCredits: 0,
      billing: { status: 'released', actualCredits: 0 },
    });
    const releasedCopies = await postgres.database.query<{
      billing_status: string;
      actual_credits: string;
      result_json: AiAssistResult;
      response_json: AiAssistResult;
    }>(`SELECT a.billing_status,a.actual_credits::text,a.result_json,i.response_json
      FROM ai_assistant_runs a JOIN idempotency_keys i
        ON i.owner_subject=a.owner_subject AND i.scope='ai.assist' AND i.resource_id=a.id
      WHERE a.id=$1`, [released.id]);
    expect(releasedCopies.rows[0]).toMatchObject({
      billing_status: 'released',
      actual_credits: '0',
      result_json: { actualCredits: 0, billing: { status: 'released', actualCredits: 0 } },
      response_json: { actualCredits: 0, billing: { status: 'released', actualCredits: 0 } },
    });
    expect(releasedCopies.rows[0]?.response_json).toEqual(releasedCopies.rows[0]?.result_json);
  });

  it('projects ModelCross settled credits independently from MXAPI merchant points', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`billing-projection-${suffix}`);
    await repository.upsertIdentity(owner);
    const created = await repository.createGenerationIntent({
      ownerSubject: owner.subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey: `billing-projection-${suffix}`,
      request: requestBody('Billing projection'),
      estimatedCredits: 20,
      priceVersion: 'account-price-v20',
    });
    await repository.setGenerationReservation(
      owner.subject,
      created.intent.id,
      `operation-${suffix}`,
      `reservation-${suffix}`,
      'generate_pair',
      'account-price-v20',
      20,
      'reserved',
    );
    await claimTestGenerationProviderSubmission(repository, owner.subject, created.intent.id);
    const [track] = await repository.acceptGeneration(
      created.intent.id,
      owner.subject,
      [`provider-billing-a-${suffix}`, `provider-billing-b-${suffix}`],
    );
    await postgres.database.query('UPDATE tracks SET points_cost=999,points_refunded=TRUE WHERE generation_id=$1', [
      created.intent.id,
    ]);
    await repository.finalizeGeneration(created.intent.id, 'succeeded', 'captured', 10);

    expect(await repository.getTrack(owner.subject, track!.id)).toMatchObject({
      billingStatus: 'captured',
      estimatedCredits: 20,
      settledCredits: 10,
      pointsCost: null,
      pointsRefunded: null,
    });
    expect((await postgres.database.query<{ points_cost: string; points_refunded: boolean }>(
      'SELECT points_cost::text,points_refunded FROM tracks WHERE id=$1', [track!.id],
    )).rows[0]).toEqual({ points_cost: '999', points_refunded: true });
  });

  it('increments rate limits per hashed principal and fixed window', async () => {
    const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const expiresAt = new Date(windowStartedAt.getTime() + 120_000);
    const input = {
      scope: 'test.generate', keyHash: randomUUID(), windowStartedAt, expiresAt,
    };
    const counts: number[] = [];
    for (let index = 0; index < 4; index += 1) counts.push(await repository.consumeRateLimit(input));
    expect(counts).toEqual([1, 2, 3, 4]);
    expect(await repository.consumeRateLimit({ ...input, keyHash: randomUUID() })).toBe(1);
    expect(await repository.consumeRateLimit({
      ...input,
      windowStartedAt: new Date(windowStartedAt.getTime() + 60_000),
      expiresAt: new Date(expiresAt.getTime() + 60_000),
    })).toBe(1);
  });

  it('enforces per-owner generation and AI concurrency before creating durable work', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`concurrency-${suffix}`);
    await repository.upsertIdentity(owner);
    const firstGeneration = await repository.createGenerationIntent({
      ownerSubject: owner.subject, projectId: null, operation: 'generate', sourceTrackId: null,
      modelProfileId: 'chirp-bluejay', idempotencyKey: `concurrency-music-a-${suffix}`,
      request: requestBody('Concurrency A'), estimatedCredits: 14, priceVersion: 'music-2026-08-v1',
      maxConcurrent: 1,
    });
    await expect(repository.createGenerationIntent({
      ownerSubject: owner.subject, projectId: null, operation: 'generate', sourceTrackId: null,
      modelProfileId: 'chirp-bluejay', idempotencyKey: `concurrency-music-b-${suffix}`,
      request: requestBody('Concurrency B'), estimatedCredits: 14, priceVersion: 'music-2026-08-v1',
      maxConcurrent: 1,
    })).rejects.toBeInstanceOf(ConcurrencyLimitError);
    await repository.finalizeGeneration(firstGeneration.intent.id, 'failed', 'not_reserved', 0);
    await expect(repository.createGenerationIntent({
      ownerSubject: owner.subject, projectId: null, operation: 'generate', sourceTrackId: null,
      modelProfileId: 'chirp-bluejay', idempotencyKey: `concurrency-music-b-${suffix}`,
      request: requestBody('Concurrency B'), estimatedCredits: 14, priceVersion: 'music-2026-08-v1',
      maxConcurrent: 1,
    })).resolves.toMatchObject({ replay: false });

    const firstAiId = randomUUID();
    await repository.createAiRun({
      id: firstAiId, ownerSubject: owner.subject, projectId: null,
      capabilityKey: 'lyrics.generate', modelAlias: 'mc-music-lyrics', promptVersion: 'test-v1',
      original: 'first AI input', estimatedCredits: 2, idempotencyKey: `concurrency-ai-a-${suffix}`,
      requestDigest: 'c'.repeat(64), maxConcurrent: 1,
    });
    await expect(repository.createAiRun({
      id: randomUUID(), ownerSubject: owner.subject, projectId: null,
      capabilityKey: 'lyrics.generate', modelAlias: 'mc-music-lyrics', promptVersion: 'test-v1',
      original: 'second AI input', estimatedCredits: 2, idempotencyKey: `concurrency-ai-b-${suffix}`,
      requestDigest: 'd'.repeat(64), maxConcurrent: 1,
    })).rejects.toBeInstanceOf(ConcurrencyLimitError);
    await repository.failAiRun(firstAiId, owner.subject, 'test completion');
    await expect(repository.createAiRun({
      id: randomUUID(), ownerSubject: owner.subject, projectId: null,
      capabilityKey: 'lyrics.generate', modelAlias: 'mc-music-lyrics', promptVersion: 'test-v1',
      original: 'second AI input', estimatedCredits: 2, idempotencyKey: `concurrency-ai-b-${suffix}`,
      requestDigest: 'd'.repeat(64), maxConcurrent: 1,
    })).resolves.toBeNull();
  });
});
