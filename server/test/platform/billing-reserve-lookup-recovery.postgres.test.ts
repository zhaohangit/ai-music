import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import { encryptSecret } from '../../src/platform/crypto.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicService } from '../../src/platform/music-service.js';
import { MusicWorker } from '../../src/platform/music-worker.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import { IdempotencyConflictError, PlatformRepository } from '../../src/platform/repository.js';
import type { AuthenticatedSession, BillingReservation } from '../../src/platform/types.js';
import type { SunoClient } from '../../src/suno.js';
import type { GenerateRequest } from '../../src/types.js';
import { isolatedPostgres, platformUser, testConfig, type IsolatedPostgres } from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
let postgres: IsolatedPostgres;
let repository: PlatformRepository;

const requestBody: GenerateRequest = {
  mode: 'simple',
  title: 'Reserve lookup recovery',
  description: 'deterministic crash recovery fixture',
  style: '',
  lyrics: '',
  instrumental: true,
  model: 'chirp-bluejay',
  negativeTags: '',
  vocalGender: 'auto',
  styleWeight: 0.65,
  weirdness: 0.5,
};

const reservation = (input: Partial<BillingReservation> & Pick<BillingReservation, 'operationId' | 'reservationId'>): BillingReservation => ({
  operationCode: 'generation_pair',
  priceVersion: 'music-price-v9',
  estimatedCredits: 24,
  currency: 'credits',
  partialSuccessPolicy: 'per_take',
  status: 'reserved',
  ...input,
});

function workerFor(input: {
  lookupOperation?: ReturnType<typeof vi.fn>;
  settle?: ReturnType<typeof vi.fn>;
}) {
  const config = testConfig({
    BILLING_LIVE_ENABLED: 'true',
    MODELCROSS_TASK_TOKEN_SECRET: 'test-worker-task-token-secret',
  });
  const lookupOperation = input.lookupOperation ?? vi.fn(async () => null);
  const settle = input.settle ?? vi.fn(async () => ({ status: 'released', settled_credits: 0 }));
  const events = { publish: vi.fn(async () => undefined) };
  const worker = new MusicWorker(
    config,
    repository,
    { lookupOperation, settle } as unknown as ModelCrossClient,
    {} as SunoClient,
    { delete: vi.fn(async () => undefined) } as unknown as ObjectStorage,
    {} as PlatformQueue,
    events as unknown as PlatformEventBus,
  );
  return { config, worker, lookupOperation, settle, events };
}

async function createPendingMusic(
  config: ReturnType<typeof testConfig>,
  suffix: string,
  idempotencyKey = `music-lookup-${suffix}`,
) {
  const user = platformUser(`music-lookup-owner-${suffix}`);
  await repository.upsertIdentity(user);
  const created = await repository.createGenerationIntent({
    ownerSubject: user.subject,
    projectId: null,
    operation: 'generate',
    sourceTrackId: null,
    modelProfileId: 'chirp-bluejay',
    idempotencyKey,
    request: requestBody,
    estimatedCredits: 24,
    priceVersion: 'music-price-v9',
  });
  await repository.setGenerationCredential(
    user.subject,
    created.intent.id,
    encryptSecret('restricted-music-recovery-token', config.sessionSecret),
  );
  await postgres.database.query(
    `UPDATE generation_batches SET updated_at=NOW()-INTERVAL '11 minutes' WHERE id=$1`,
    [created.intent.id],
  );
  return { user, intent: created.intent, idempotencyKey };
}

async function createPendingAi(
  config: ReturnType<typeof testConfig>,
  suffix: string,
  idempotencyKey = `ai-lookup-${suffix}`,
) {
  const user = platformUser(`ai-lookup-owner-${suffix}`);
  await repository.upsertIdentity(user);
  const id = randomUUID();
  await repository.createAiRun({
    id,
    ownerSubject: user.subject,
    projectId: null,
    capabilityKey: 'lyrics.generate',
    modelAlias: 'mc-music-lyrics',
    promptVersion: 'test-v1',
    original: 'write an original chorus',
    estimatedCredits: 2,
    idempotencyKey,
    requestDigest: randomUUID().replaceAll('-', ''),
  });
  await repository.setAiRunCredential(
    id,
    user.subject,
    encryptSecret('restricted-ai-recovery-token', config.sessionSecret),
  );
  await postgres.database.query(
    `UPDATE ai_assistant_runs SET created_at=NOW()-INTERVAL '11 minutes' WHERE id=$1`,
    [id],
  );
  return { user, id, idempotencyKey };
}

integration('owner-scoped Reserve lookup recovery on PostgreSQL', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('leaves an ambiguous Reserve failure for lookup instead of claiming that no hold exists', async () => {
    const suffix = randomUUID();
    const user = platformUser(`ambiguous-reserve-owner-${suffix}`);
    await repository.upsertIdentity(user);
    const config = testConfig({
      BILLING_LIVE_ENABLED: 'true',
      MODELCROSS_TASK_TOKEN_SECRET: 'test-worker-task-token-secret',
    });
    const session: AuthenticatedSession = {
      tokenHash: `session-${suffix}`,
      user,
      clientId: 'museflow-test',
      accessToken: 'owner-access-token',
      refreshToken: 'owner-refresh-token',
      idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'generate', operationCode: 'generation_pair', available: true,
        estimatedCredits: 24, priceVersion: 'music-price-v9', chargingEnabled: true, preview: false,
      }]),
      quote: vi.fn(async () => ({
        operationCode: 'generation_pair',
        priceVersion: 'music-price-v9',
        estimatedCredits: 24,
        currency: 'credits',
        partialSuccessPolicy: 'per_take',
      })),
      taskToken: vi.fn(async () => 'restricted-ambiguous-reserve-token'),
      reserve: vi.fn(async () => { throw new Error('connection closed after Reserve commit'); }),
      settle: vi.fn(async () => ({ status: 'released' })),
    };
    const suno = {
      configured: true,
      url: 'https://provider.example.test',
      generate: vi.fn(async () => ['must-not-run-a', 'must-not-run-b']),
    };
    const queue = { add: vi.fn(async () => undefined) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new MusicService(
      config,
      repository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );
    const idempotencyKey = `ambiguous-reserve-${suffix}`;

    await expect(service.submit(session, requestBody, idempotencyKey))
      .rejects.toThrow('connection closed after Reserve commit');

    const generation = await postgres.database.query<{
      id: string;
      status: string;
      billing_status: string;
      billing_credential_ciphertext: string | null;
      billing_operation_id: string | null;
    }>(`SELECT id,status,billing_status,billing_credential_ciphertext,billing_operation_id
        FROM generation_batches WHERE owner_subject=$1 AND idempotency_key=$2`, [user.subject, idempotencyKey]);
    expect(generation.rows[0]).toMatchObject({
      status: 'failed',
      billing_status: 'reconcile_required',
      billing_operation_id: null,
    });
    expect(generation.rows[0]?.billing_credential_ciphertext).not.toContain('restricted-ambiguous-reserve-token');
    expect(modelCross.settle).not.toHaveBeenCalled();
    expect(suno.generate).not.toHaveBeenCalled();
    await repository.finalizeGeneration(generation.rows[0]!.id, 'failed', 'not_reserved', 0);
  });

  it('recovers and releases a music hold when the API exited before saving Reserve identifiers', async () => {
    const lookupOperation = vi.fn(async (_token: string, request: { resourceId: string }) => reservation({
      operationId: 'recovered-music-operation',
      reservationId: 'recovered-music-reservation',
      resourceId: request.resourceId,
    }));
    const settle = vi.fn(async () => ({ status: 'released', settled_credits: 0 }));
    const runtime = workerFor({ lookupOperation, settle });
    const crashed = await createPendingMusic(runtime.config, randomUUID());

    expect(await repository.generationCredential(crashed.intent.id)).toMatchObject({
      operationId: null,
      reservationId: null,
    });
    expect(await repository.getGeneration(crashed.user.subject, crashed.intent.id)).toMatchObject({
      status: 'submitting',
      billingStatus: 'reserve_pending',
    });

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'music-lookup-1', attemptsMade: 0 });

    expect(lookupOperation).toHaveBeenCalledOnce();
    expect(lookupOperation).toHaveBeenCalledWith('restricted-music-recovery-token', {
      resourceId: crashed.intent.id,
      idempotencyKey: crashed.idempotencyKey,
    });
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(
      'restricted-music-recovery-token',
      'release',
      expect.objectContaining({
        operation_id: 'recovered-music-operation',
        reservation_id: 'recovered-music-reservation',
        resource_id: crashed.intent.id,
      }),
      crashed.idempotencyKey,
    );
    expect(await repository.getGeneration(crashed.user.subject, crashed.intent.id)).toMatchObject({
      status: 'failed',
      billingOperationId: 'recovered-music-operation',
      billingReservationId: 'recovered-music-reservation',
      billingStatus: 'released',
    });
    const mirror = await postgres.database.query<{
      idempotency_key: string;
      generation_id: string;
      ai_run_id: string | null;
      status: string;
    }>(`SELECT idempotency_key,generation_id,ai_run_id,status
        FROM billing_operation_mirrors WHERE generation_id=$1`, [crashed.intent.id]);
    expect(mirror.rows[0]).toEqual({
      idempotency_key: `music:${crashed.idempotencyKey}`,
      generation_id: crashed.intent.id,
      ai_run_id: null,
      status: 'released',
    });

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'music-lookup-2', attemptsMade: 0 });
    expect(lookupOperation).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledOnce();
    await runtime.worker.stop();
  });

  it('recovers and releases an AI hold when the process exited before saving its mirror', async () => {
    const lookupOperation = vi.fn(async (_token: string, request: { resourceId: string }) => reservation({
      operationId: 'recovered-ai-operation',
      reservationId: 'recovered-ai-reservation',
      operationCode: 'lyrics_generation',
      estimatedCredits: 2,
      resourceId: request.resourceId,
    }));
    const settle = vi.fn(async () => ({ status: 'released', settled_credits: 0 }));
    const runtime = workerFor({ lookupOperation, settle });
    const crashed = await createPendingAi(runtime.config, randomUUID());

    const pending = await postgres.database.query<{
      billing_status: string;
      mirror_count: string;
    }>(`SELECT a.billing_status,
          (SELECT COUNT(*)::text FROM billing_operation_mirrors b WHERE b.ai_run_id=a.id) AS mirror_count
        FROM ai_assistant_runs a WHERE a.id=$1`, [crashed.id]);
    expect(pending.rows[0]).toEqual({ billing_status: 'reserve_pending', mirror_count: '0' });

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'ai-lookup-1', attemptsMade: 0 });

    expect(lookupOperation).toHaveBeenCalledWith('restricted-ai-recovery-token', {
      resourceId: crashed.id,
      idempotencyKey: crashed.idempotencyKey,
    });
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(
      'restricted-ai-recovery-token',
      'release',
      expect.objectContaining({
        operation_id: 'recovered-ai-operation',
        reservation_id: 'recovered-ai-reservation',
        resource_id: crashed.id,
      }),
      crashed.idempotencyKey,
    );
    const recovered = await postgres.database.query<{
      status: string;
      billing_status: string;
      idempotency_key: string;
      remote_operation_id: string;
      remote_reservation_id: string;
    }>(`SELECT a.status,a.billing_status,b.idempotency_key,b.remote_operation_id,b.remote_reservation_id
        FROM ai_assistant_runs a JOIN billing_operation_mirrors b ON b.ai_run_id=a.id
        WHERE a.id=$1`, [crashed.id]);
    expect(recovered.rows[0]).toEqual({
      status: 'failed',
      billing_status: 'released',
      idempotency_key: `ai:${crashed.idempotencyKey}`,
      remote_operation_id: 'recovered-ai-operation',
      remote_reservation_id: 'recovered-ai-reservation',
    });

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'ai-lookup-2', attemptsMade: 0 });
    expect(lookupOperation).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledOnce();
    await runtime.worker.stop();
  });

  it('marks a missing remote Reserve as not_reserved without calling Release', async () => {
    const lookupOperation = vi.fn(async () => null);
    const settle = vi.fn(async () => ({ status: 'released' }));
    const runtime = workerFor({ lookupOperation, settle });
    const music = await createPendingMusic(runtime.config, randomUUID());
    const ai = await createPendingAi(runtime.config, randomUUID());

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'lookup-miss-1', attemptsMade: 0 });

    expect(lookupOperation).toHaveBeenCalledTimes(2);
    expect(settle).not.toHaveBeenCalled();
    expect(await repository.getGeneration(music.user.subject, music.intent.id)).toMatchObject({
      status: 'failed',
      billingStatus: 'not_reserved',
    });
    const aiState = await postgres.database.query<{ status: string; billing_status: string }>(
      'SELECT status,billing_status FROM ai_assistant_runs WHERE id=$1',
      [ai.id],
    );
    expect(aiState.rows[0]).toEqual({ status: 'failed', billing_status: 'not_reserved' });
    await runtime.worker.stop();
  });

  it('syncs a completed AI capture and quarantines captured music instead of attempting an illegal Release', async () => {
    const settle = vi.fn(async () => ({ status: 'released' }));
    const runtime = workerFor({ settle });
    const music = await createPendingMusic(runtime.config, randomUUID());
    const ai = await createPendingAi(runtime.config, randomUUID());
    await postgres.database.query(
      `UPDATE ai_assistant_runs SET status='succeeded',finished_at=NOW() WHERE id=$1`,
      [ai.id],
    );
    runtime.lookupOperation.mockImplementation(async (_token: string, request: { resourceId: string }) => {
      if (request.resourceId === music.intent.id) {
        return reservation({
          operationId: 'already-captured-music-operation',
          reservationId: 'already-captured-music-reservation',
          resourceId: request.resourceId,
          status: 'captured',
          capturedCredits: 24,
        });
      }
      return reservation({
        operationId: 'already-captured-ai-operation',
        reservationId: 'already-captured-ai-reservation',
        operationCode: 'lyrics_generation',
        estimatedCredits: 2,
        resourceId: request.resourceId,
        status: 'captured',
        capturedCredits: 2,
      });
    });

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'terminal-sync-1', attemptsMade: 0 });

    expect(settle).not.toHaveBeenCalled();
    expect(await repository.getGeneration(music.user.subject, music.intent.id)).toMatchObject({
      status: 'failed',
      billingStatus: 'manual_review_required',
      error: 'remote billing operation is already captured; automatic release was not attempted',
    });
    const aiState = await postgres.database.query<{
      status: string;
      billing_status: string;
      actual_credits: string;
    }>('SELECT status,billing_status,actual_credits::text FROM ai_assistant_runs WHERE id=$1', [ai.id]);
    expect(aiState.rows[0]).toEqual({
      status: 'succeeded',
      billing_status: 'captured',
      actual_credits: '2',
    });

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'terminal-sync-2', attemptsMade: 0 });
    expect(runtime.lookupOperation).toHaveBeenCalledTimes(2);
    expect(settle).not.toHaveBeenCalled();
    await runtime.worker.stop();
  });

  it('keeps music and AI retry keys in separate namespaces and rejects resource rebinding', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`mirror-owner-${suffix}`);
    await repository.upsertIdentity(owner);
    const sharedKey = `shared-${suffix}`;
    const music = await repository.createGenerationIntent({
      ownerSubject: owner.subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey: `ai:${sharedKey}`,
      request: requestBody,
      estimatedCredits: 24,
      priceVersion: 'music-price-v9',
    });
    const aiId = randomUUID();
    await repository.createAiRun({
      id: aiId,
      ownerSubject: owner.subject,
      projectId: null,
      capabilityKey: 'lyrics.generate',
      modelAlias: 'mc-music-lyrics',
      promptVersion: 'test-v1',
      original: 'shared key namespace test',
      estimatedCredits: 2,
      idempotencyKey: sharedKey,
      requestDigest: randomUUID().replaceAll('-', ''),
    });
    await repository.setGenerationReservation(
      owner.subject,
      music.intent.id,
      `music-operation-${suffix}`,
      `music-reservation-${suffix}`,
      'generation_pair',
      'music-price-v9',
      24,
    );
    await repository.setAiRunReservation({
      id: aiId,
      ownerSubject: owner.subject,
      operationCode: 'lyrics_generation',
      idempotencyKey: sharedKey,
      operationId: `ai-operation-${suffix}`,
      reservationId: `ai-reservation-${suffix}`,
      priceVersion: 'ai-price-v2',
      reservedCredits: 2,
      status: 'reserved',
    });

    const mirrors = await postgres.database.query<{
      idempotency_key: string;
      generation_id: string | null;
      ai_run_id: string | null;
    }>(`SELECT idempotency_key,generation_id,ai_run_id FROM billing_operation_mirrors
        WHERE owner_subject=$1 AND idempotency_key IN($2,$3) ORDER BY idempotency_key`, [
      owner.subject,
      `music:ai:${sharedKey}`,
      `ai:${sharedKey}`,
    ]);
    expect(mirrors.rows).toEqual([
      { idempotency_key: `ai:${sharedKey}`, generation_id: null, ai_run_id: aiId },
      { idempotency_key: `music:ai:${sharedKey}`, generation_id: music.intent.id, ai_run_id: null },
    ]);

    const targetKey = `conflict-${suffix}`;
    const target = await repository.createGenerationIntent({
      ownerSubject: owner.subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey: targetKey,
      request: { ...requestBody, title: 'Conflict target' },
      estimatedCredits: 24,
      priceVersion: 'music-price-v9',
    });
    await postgres.database.query(`INSERT INTO billing_operation_mirrors(
      id,owner_subject,generation_id,remote_operation_id,remote_reservation_id,operation_code,
      idempotency_key,price_version,reserved_credits,status
    ) VALUES($1,$2,$3,$4,$5,'generation_pair',$6,'music-price-v9',24,'reserved')`, [
      randomUUID(), owner.subject, music.intent.id, 'bound-operation', 'bound-reservation', `music:${targetKey}`,
    ]);

    await expect(repository.setGenerationReservation(
      owner.subject,
      target.intent.id,
      'attacker-operation',
      'attacker-reservation',
      'generation_pair',
      'music-price-v9',
      24,
    )).rejects.toBeInstanceOf(IdempotencyConflictError);
    const binding = await postgres.database.query<{
      generation_id: string;
      remote_operation_id: string;
    }>('SELECT generation_id,remote_operation_id FROM billing_operation_mirrors WHERE owner_subject=$1 AND idempotency_key=$2', [
      owner.subject, `music:${targetKey}`,
    ]);
    expect(binding.rows[0]).toEqual({ generation_id: music.intent.id, remote_operation_id: 'bound-operation' });
    expect(await repository.generationCredential(target.intent.id)).toMatchObject({
      operationId: null,
      reservationId: null,
    });

    const aiConflictKey = `ai-conflict-${suffix}`;
    const aiConflictTarget = randomUUID();
    await repository.createAiRun({
      id: aiConflictTarget,
      ownerSubject: owner.subject,
      projectId: null,
      capabilityKey: 'prompt.optimize',
      modelAlias: 'mc-music-fast',
      promptVersion: 'test-v1',
      original: 'AI mirror conflict target',
      estimatedCredits: 1,
      idempotencyKey: aiConflictKey,
      requestDigest: randomUUID().replaceAll('-', ''),
    });
    await postgres.database.query(`INSERT INTO billing_operation_mirrors(
      id,owner_subject,ai_run_id,remote_operation_id,remote_reservation_id,operation_code,
      idempotency_key,price_version,reserved_credits,status
    ) VALUES($1,$2,$3,'bound-ai-operation','bound-ai-reservation','lyrics_generation',$4,'ai-price-v2',2,'reserved')`, [
      randomUUID(), owner.subject, aiId, `ai:${aiConflictKey}`,
    ]);
    await expect(repository.setAiRunReservation({
      id: aiConflictTarget,
      ownerSubject: owner.subject,
      operationCode: 'prompt_optimize',
      idempotencyKey: aiConflictKey,
      operationId: 'attacker-ai-operation',
      reservationId: 'attacker-ai-reservation',
      priceVersion: 'ai-price-v2',
      reservedCredits: 1,
      status: 'reserved',
    })).rejects.toBeInstanceOf(IdempotencyConflictError);
    const aiBinding = await postgres.database.query<{ ai_run_id: string; remote_operation_id: string }>(
      `SELECT ai_run_id,remote_operation_id FROM billing_operation_mirrors
       WHERE owner_subject=$1 AND idempotency_key=$2`,
      [owner.subject, `ai:${aiConflictKey}`],
    );
    expect(aiBinding.rows[0]).toEqual({ ai_run_id: aiId, remote_operation_id: 'bound-ai-operation' });
    const aiTarget = await postgres.database.query<{ billing_status: string }>(
      'SELECT billing_status FROM ai_assistant_runs WHERE id=$1',
      [aiConflictTarget],
    );
    expect(aiTarget.rows[0]?.billing_status).toBe('draft');
  });

  it('migrates both legacy collision directions without losing the authoritative music reservation', async () => {
    const migrationPostgres = await isolatedPostgres();
    try {
      const migrationRepository = new PlatformRepository(migrationPostgres.database);
      const suffix = randomUUID();
      const owner = platformUser(`legacy-mirror-owner-${suffix}`);
      await migrationRepository.upsertIdentity(owner);

      const createMusic = async (key: string, title: string) => migrationRepository.createGenerationIntent({
        ownerSubject: owner.subject,
        projectId: null,
        operation: 'generate',
        sourceTrackId: null,
        modelProfileId: 'chirp-bluejay',
        idempotencyKey: key,
        request: { ...requestBody, title },
        estimatedCredits: 24,
        priceVersion: 'music-price-v9',
        maxConcurrent: 10,
      });
      const createAi = async (key: string) => {
        const id = randomUUID();
        await migrationRepository.createAiRun({
          id,
          ownerSubject: owner.subject,
          projectId: null,
          capabilityKey: 'lyrics.generate',
          modelAlias: 'mc-music-lyrics',
          promptVersion: 'test-v1',
          original: `legacy ${key}`,
          estimatedCredits: 2,
          idempotencyKey: key,
          requestDigest: randomUUID().replaceAll('-', ''),
          maxConcurrent: 10,
        });
        await migrationPostgres.database.query(
          `UPDATE ai_assistant_runs SET billing_status='reserved' WHERE id=$1`,
          [id],
        );
        return id;
      };

      const plainMusic = await createMusic(`plain-music-${suffix}`, 'Plain legacy music');
      const plainAiKey = `plain-ai-${suffix}`;
      const plainAi = await createAi(plainAiKey);
      const aiFirstKey = `ai-first-${suffix}`;
      const aiFirstMusic = await createMusic(`ai:${aiFirstKey}`, 'AI first collision');
      const aiFirstRun = await createAi(aiFirstKey);
      const musicFirstKey = `music-first-${suffix}`;
      const musicFirstMusic = await createMusic(`ai:${musicFirstKey}`, 'Music first collision');
      const musicFirstRun = await createAi(musicFirstKey);

      const generations = [
        [plainMusic.intent.id, `plain-music-operation-${suffix}`, `plain-music-reservation-${suffix}`],
        [aiFirstMusic.intent.id, `ai-first-music-operation-${suffix}`, `ai-first-music-reservation-${suffix}`],
        [musicFirstMusic.intent.id, `music-first-music-operation-${suffix}`, `music-first-music-reservation-${suffix}`],
      ];
      for (const [id, operationId, reservationId] of generations) {
        await migrationPostgres.database.query(`UPDATE generation_batches
          SET billing_operation_id=$2,billing_reservation_id=$3,billing_status='reserved'
          WHERE id=$1`, [id, operationId, reservationId]);
      }

      const insertMirror = async (input: {
        generationId?: string;
        aiRunId?: string;
        key: string;
        operationId: string;
        reservationId: string;
        operationCode: string;
      }) => migrationPostgres.database.query(`INSERT INTO billing_operation_mirrors(
        id,owner_subject,generation_id,ai_run_id,remote_operation_id,remote_reservation_id,
        operation_code,idempotency_key,price_version,reserved_credits,status
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'legacy-v1',24,'reserved')`, [
        randomUUID(), owner.subject, input.generationId ?? null, input.aiRunId ?? null,
        input.operationId, input.reservationId, input.operationCode, input.key,
      ]);

      await insertMirror({
        generationId: plainMusic.intent.id,
        key: plainMusic.intent.idempotencyKey,
        operationId: `plain-music-operation-${suffix}`,
        reservationId: `plain-music-reservation-${suffix}`,
        operationCode: 'generation_pair',
      });
      await insertMirror({
        aiRunId: plainAi,
        key: `ai:${plainAiKey}`,
        operationId: `plain-ai-operation-${suffix}`,
        reservationId: `plain-ai-reservation-${suffix}`,
        operationCode: 'lyrics_generation',
      });
      // AI existed first; legacy music recovery overwrote its remote fields
      // while the mirror remained associated with the AI run.
      await insertMirror({
        aiRunId: aiFirstRun,
        key: `ai:${aiFirstKey}`,
        operationId: `ai-first-music-operation-${suffix}`,
        reservationId: `ai-first-music-reservation-${suffix}`,
        operationCode: 'generation_pair',
      });
      // Music existed first; legacy AI recovery overwrote its remote fields
      // while the mirror remained associated with the generation.
      await insertMirror({
        generationId: musicFirstMusic.intent.id,
        key: `ai:${musicFirstKey}`,
        operationId: `music-first-ai-operation-${suffix}`,
        reservationId: `music-first-ai-reservation-${suffix}`,
        operationCode: 'lyrics_generation',
      });

      await migrationPostgres.database.query(
        `DELETE FROM schema_migrations WHERE name='005_billing_recovery_namespace.sql'`,
      );
      expect(await migrationPostgres.database.migrate()).toEqual(['005_billing_recovery_namespace.sql']);

      const migrated = await migrationPostgres.database.query<{
        idempotency_key: string;
        generation_id: string | null;
        ai_run_id: string | null;
        remote_operation_id: string | null;
        status: string;
      }>(`SELECT idempotency_key,generation_id,ai_run_id,remote_operation_id,status
          FROM billing_operation_mirrors WHERE owner_subject=$1 ORDER BY idempotency_key`, [owner.subject]);
      expect(migrated.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          idempotency_key: `music:${plainMusic.intent.idempotencyKey}`,
          generation_id: plainMusic.intent.id,
          remote_operation_id: `plain-music-operation-${suffix}`,
        }),
        expect.objectContaining({
          idempotency_key: `ai:${plainAiKey}`,
          ai_run_id: plainAi,
          remote_operation_id: `plain-ai-operation-${suffix}`,
          status: 'reserved',
        }),
        expect.objectContaining({
          idempotency_key: `ai:${aiFirstKey}`,
          ai_run_id: aiFirstRun,
          remote_operation_id: null,
          status: 'reconcile_required',
        }),
        expect.objectContaining({
          idempotency_key: `music:ai:${aiFirstKey}`,
          generation_id: aiFirstMusic.intent.id,
          ai_run_id: null,
          remote_operation_id: `ai-first-music-operation-${suffix}`,
        }),
        expect.objectContaining({
          idempotency_key: `music:ai:${musicFirstKey}`,
          generation_id: musicFirstMusic.intent.id,
          ai_run_id: null,
          remote_operation_id: `music-first-music-operation-${suffix}`,
        }),
      ]));
      expect(migrated.rows).not.toContainEqual(expect.objectContaining({
        idempotency_key: `ai:${musicFirstKey}`,
      }));
      const aiRecovery = await migrationPostgres.database.query<{ id: string; billing_status: string }>(
        `SELECT id,billing_status FROM ai_assistant_runs WHERE id IN($1,$2) ORDER BY id`,
        [aiFirstRun, musicFirstRun],
      );
      expect(aiRecovery.rows).toEqual([
        { id: aiFirstRun, billing_status: 'reconcile_required' },
        { id: musicFirstRun, billing_status: 'reconcile_required' },
      ].sort((left, right) => left.id.localeCompare(right.id)));
    } finally {
      await migrationPostgres.close();
    }
  }, 30_000);
});
