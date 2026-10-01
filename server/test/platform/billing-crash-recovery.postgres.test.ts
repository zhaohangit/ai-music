import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../../src/platform/crypto.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicWorker } from '../../src/platform/music-worker.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import { PlatformRepository } from '../../src/platform/repository.js';
import type { SunoClient } from '../../src/suno.js';
import type { GenerateRequest } from '../../src/types.js';
import { isolatedPostgres, platformUser, testConfig, type IsolatedPostgres } from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
let postgres: IsolatedPostgres;
let repository: PlatformRepository;

const requestBody: GenerateRequest = {
  mode: 'simple', title: 'Crash recovery', description: 'billing recovery fixture', style: '', lyrics: '',
  instrumental: true, model: 'chirp-bluejay', negativeTags: '', vocalGender: 'auto',
  styleWeight: 0.65, weirdness: 0.5,
};

function workerFor(settle: ReturnType<typeof vi.fn>) {
  const config = testConfig({
    BILLING_LIVE_ENABLED: 'true',
    MODELCROSS_TASK_TOKEN_SECRET: 'test-worker-task-token-secret',
  });
  const events = { publish: vi.fn(async () => undefined) };
  const lookupOperation = vi.fn(async (_token: string, input: { resourceId: string }) => {
    const credential = await repository.generationCredential(input.resourceId);
    if (!credential?.operationId || !credential.reservationId) return null;
    return {
      operationId: credential.operationId,
      reservationId: credential.reservationId,
      operationCode: 'generation_pair',
      priceVersion: 'music-price-v9',
      resourceId: input.resourceId,
      estimatedCredits: 24,
      currency: 'credits' as const,
      partialSuccessPolicy: 'per_take' as const,
      status: 'reserved' as const,
    };
  });
  const worker = new MusicWorker(
    config,
    repository,
    { lookupOperation, settle } as unknown as ModelCrossClient,
    {} as SunoClient,
    { delete: vi.fn(async () => undefined) } as unknown as ObjectStorage,
    {} as PlatformQueue,
    events as unknown as PlatformEventBus,
  );
  return { config, worker, events, lookupOperation };
}

async function reservedThenCrashed(config: ReturnType<typeof testConfig>, suffix: string) {
  const user = platformUser(`billing-owner-${suffix}`);
  await repository.upsertIdentity(user);
  const idempotencyKey = `billing-recovery-${suffix}`;
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
    encryptSecret('restricted-worker-token', config.sessionSecret),
  );
  await repository.setGenerationReservation(
    user.subject,
    created.intent.id,
    `operation-${suffix}`,
    `reservation-${suffix}`,
    'generation_pair',
    'music-price-v9',
    24,
  );
  // This is the persisted state after reserve succeeded but provider submit or
  // the API process crashed before it could create any tracks.
  await repository.failGeneration(user.subject, created.intent.id, 'process exited after reserve', 'release_required');
  return { user, intent: created.intent, idempotencyKey };
}

integration('billing crash recovery on PostgreSQL', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('releases a reserve-before-submit crash exactly once and records the terminal SQL state', async () => {
    const settle = vi.fn(async () => ({ status: 'released', settled_credits: 0 }));
    const runtime = workerFor(settle);
    const suffix = randomUUID();
    const crashed = await reservedThenCrashed(runtime.config, suffix);

    expect(await repository.listBillingReconcileGenerations()).toContainEqual(expect.objectContaining({
      id: crashed.intent.id, status: 'failed', total: 0,
    }));
    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'reconcile-1', attemptsMade: 0 });

    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(
      'restricted-worker-token',
      'release',
      expect.objectContaining({
        operation_id: `operation-${suffix}`,
        reservation_id: `reservation-${suffix}`,
        resource_id: crashed.intent.id,
        reason: 'submission_failed_or_worker_recovered',
      }),
      crashed.idempotencyKey,
    );
    expect(await repository.getGeneration(crashed.user.subject, crashed.intent.id)).toMatchObject({
      status: 'failed', billingStatus: 'released',
    });
    const mirror = await postgres.database.query<{ status: string; settled_credits: string }>(
      'SELECT status,settled_credits::text FROM billing_operation_mirrors WHERE generation_id=$1',
      [crashed.intent.id],
    );
    expect(mirror.rows[0]).toEqual({ status: 'released', settled_credits: '0' });
    expect(await repository.listPaymentOrders(crashed.user.subject)).toContainEqual(expect.objectContaining({
      kind: 'usage',
      description: '双版本音乐生成（预留已释放）',
      credits: 0,
      status: 'refunded',
    }));
    expect(await repository.listBillingReconcileGenerations()).not.toContainEqual(expect.objectContaining({ id: crashed.intent.id }));

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'reconcile-2', attemptsMade: 0 });
    expect(settle).toHaveBeenCalledOnce();
    await runtime.worker.stop();
  });

  it('keeps a failed settlement retryable and succeeds on the next idempotent reconciliation', async () => {
    const settle = vi.fn()
      .mockRejectedValueOnce(new Error('ModelCross temporarily unavailable'))
      .mockResolvedValueOnce({ status: 'released', settled_credits: 0 });
    const runtime = workerFor(settle);
    const suffix = randomUUID();
    const crashed = await reservedThenCrashed(runtime.config, suffix);

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'retry-1', attemptsMade: 0 });
    expect(await repository.getGeneration(crashed.user.subject, crashed.intent.id)).toMatchObject({
      billingStatus: 'reconcile_required',
      error: 'ModelCross temporarily unavailable',
    });
    expect(await repository.listBillingReconcileGenerations()).toContainEqual(expect.objectContaining({ id: crashed.intent.id }));

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'retry-2', attemptsMade: 1 });
    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle.mock.calls[0]?.[3]).toBe(crashed.idempotencyKey);
    expect(settle.mock.calls[1]?.[3]).toBe(crashed.idempotencyKey);
    expect(await repository.getGeneration(crashed.user.subject, crashed.intent.id)).toMatchObject({
      status: 'failed', billingStatus: 'released',
    });
    await runtime.worker.stop();
  });

  it('persists a partial batch capture as a terminal partial settlement', async () => {
    const settle = vi.fn(async () => ({
      status: 'partially_captured', captured_amount: 12, settled_credits: 12,
    }));
    const runtime = workerFor(settle);
    const suffix = randomUUID();
    const user = platformUser(`partial-billing-owner-${suffix}`);
    await repository.upsertIdentity(user);
    const idempotencyKey = `partial-billing-${suffix}`;
    const created = await repository.createGenerationIntent({
      ownerSubject: user.subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: requestBody.model,
      idempotencyKey,
      request: requestBody,
      estimatedCredits: 24,
      priceVersion: 'music-price-v9',
    });
    await repository.setGenerationCredential(
      user.subject,
      created.intent.id,
      encryptSecret('restricted-partial-token', runtime.config.sessionSecret),
    );
    await repository.setGenerationReservation(
      user.subject,
      created.intent.id,
      `partial-operation-${suffix}`,
      `partial-reservation-${suffix}`,
      'generation_pair',
      'music-price-v9',
      24,
    );
    expect(await repository.claimGenerationProviderSubmission(user.subject, created.intent.id)).toBe('claimed');
    const tracks = await repository.acceptGeneration(
      created.intent.id,
      user.subject,
      [`partial-success-${suffix}`, `partial-failure-${suffix}`],
      2,
    );
    await postgres.database.query(`UPDATE tracks SET status='done',stage='done',progress=1,finished_at=NOW()
      WHERE id=$1`, [tracks[0]!.id]);
    await postgres.database.query(`UPDATE tracks SET status='error',stage='error',progress=1,error='provider failed',finished_at=NOW()
      WHERE id=$1`, [tracks[1]!.id]);
    await postgres.database.query(`UPDATE provider_tasks SET status=CASE WHEN track_id=$2 THEN 'done' ELSE 'error' END,
      stage=CASE WHEN track_id=$2 THEN 'done' ELSE 'error' END,progress=1 WHERE generation_id=$1`, [
      created.intent.id, tracks[0]!.id,
    ]);

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'partial-reconcile-1', attemptsMade: 0 });

    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(
      'restricted-partial-token',
      'capture',
      expect.objectContaining({
        resource_id: created.intent.id,
        succeeded_units: 1,
        failed_units: 1,
      }),
      idempotencyKey,
    );
    expect(await repository.getGeneration(user.subject, created.intent.id)).toMatchObject({
      status: 'partial', billingStatus: 'partially_captured',
    });
    const mirror = await postgres.database.query<{ status: string; settled_credits: string }>(
      'SELECT status,settled_credits::text FROM billing_operation_mirrors WHERE generation_id=$1',
      [created.intent.id],
    );
    expect(mirror.rows[0]).toEqual({ status: 'partially_captured', settled_credits: '12' });
    expect(await repository.listPaymentOrders(user.subject)).toContainEqual(expect.objectContaining({
      description: '双版本音乐生成（部分成功）', credits: -12, status: 'paid',
    }));

    await runtime.worker.process({ name: 'billing.reconcile', data: {}, id: 'partial-reconcile-2', attemptsMade: 1 });
    expect(settle).toHaveBeenCalledOnce();
    await runtime.worker.stop();
  });
});
