import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import { encryptSecret } from '../../src/platform/crypto.js';
import { PlatformDatabase } from '../../src/platform/database.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicService } from '../../src/platform/music-service.js';
import { MusicWorker } from '../../src/platform/music-worker.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import {
  IdempotencyConflictError,
  PlatformRepository,
  ResourceStateConflictError,
} from '../../src/platform/repository.js';
import { SunoError, type SunoClient } from '../../src/suno.js';
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
let postgres: IsolatedPostgres;
let repository: PlatformRepository;

const requestBody: GenerateRequest = {
  mode: 'simple',
  title: 'Exactly once boundary',
  description: 'a durable local ledger protects Provider mutations',
  style: '',
  lyrics: '',
  instrumental: true,
  model: 'chirp-bluejay',
  negativeTags: '',
  vocalGender: 'auto',
  styleWeight: 0.65,
  weirdness: 0.5,
};

const sessionFor = (subject: string): AuthenticatedSession => ({
  tokenHash: `session-${subject}`,
  user: platformUser(subject),
  clientId: 'museflow-ledger-test',
  accessToken: `access-${subject}`,
  refreshToken: `refresh-${subject}`,
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
});

function previewBilling() {
  const settle = vi.fn(async () => ({ status: 'disabled', settled_credits: 0 }));
  const modelCross = {
    musicOperationCatalog: vi.fn(async (
      _token: string,
      requested: Array<{ action: string; operationCode: string; fallbackCredits: number }>,
    ) => requested.map((entry) => ({
      ...entry,
      available: true,
      estimatedCredits: entry.fallbackCredits,
      priceVersion: 'ledger-preview-v1',
      chargingEnabled: false,
      preview: true,
    }))),
    quote: vi.fn(async () => ({
      operationCode: 'generation_pair',
      priceVersion: 'ledger-preview-v1',
      estimatedCredits: 20,
      currency: 'credits' as const,
      partialSuccessPolicy: 'per_take' as const,
    })),
    reserve: vi.fn(async (_token: string, input: { resourceId: string }) => ({
      operationId: `disabled-operation-${input.resourceId}`,
      reservationId: `disabled-reservation-${input.resourceId}`,
      operationCode: 'generation_pair',
      priceVersion: 'ledger-preview-v1',
      estimatedCredits: 20,
      currency: 'credits' as const,
      partialSuccessPolicy: 'per_take' as const,
      status: 'disabled' as const,
    })),
    settle,
  };
  return { modelCross: modelCross as unknown as ModelCrossClient, settle };
}

function serviceFor(
  targetRepository: PlatformRepository,
  generate: ReturnType<typeof vi.fn>,
  billing = previewBilling(),
) {
  const queue = { add: vi.fn(async () => undefined) };
  const events = { publish: vi.fn(async () => undefined) };
  const suno = {
    configured: true,
    url: 'http://127.0.0.1:39996',
    generate,
    forCredential: vi.fn(),
  };
  suno.forCredential.mockReturnValue(suno as unknown as SunoClient);
  const service = new MusicService(
    testConfig({ ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true' }),
    targetRepository,
    billing.modelCross,
    suno as unknown as SunoClient,
    queue as unknown as PlatformQueue,
    events as unknown as PlatformEventBus,
  );
  return { service, billing, queue, events, suno };
}

integration('durable Provider submission ledger on PostgreSQL', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('allows only one Provider POST for concurrent identical generation requests', async () => {
    const scopedUrl = new URL(process.env.TEST_DATABASE_URL!);
    scopedUrl.searchParams.set('options', `-c search_path=${postgres.schema}`);
    const concurrentDatabase = new PlatformDatabase(scopedUrl.toString());
    const concurrentRepository = new PlatformRepository(concurrentDatabase);
    const subject = `concurrent-ledger-${randomUUID()}`;
    const session = sessionFor(subject);
    await concurrentRepository.upsertIdentity(session.user);

    let resolveProvider!: (taskIds: string[]) => void;
    const generate = vi.fn(() => new Promise<string[]>((resolve) => {
      resolveProvider = resolve;
    }));
    const runtime = serviceFor(concurrentRepository, generate);
    const key = `concurrent-generation-${randomUUID()}`;

    try {
      const first = runtime.service.submit(session, requestBody, key);
      await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());

      const replay = await runtime.service.submit(session, requestBody, key);
      expect(replay).toMatchObject({ replay: true, pending: true, tracks: [] });
      expect(generate).toHaveBeenCalledOnce();

      resolveProvider(['concurrent-provider-a', 'concurrent-provider-b']);
      const accepted = await first;
      expect(accepted.tracks).toHaveLength(2);
      expect(generate).toHaveBeenCalledOnce();

      const ledger = await concurrentDatabase.query<{
        provider_submission_state: string;
        task_count: string;
      }>(`SELECT g.provider_submission_state,COUNT(pt.id)::text AS task_count
        FROM generation_batches g LEFT JOIN provider_tasks pt ON pt.generation_id=g.id
        WHERE g.id=$1 GROUP BY g.id`, [accepted.generation.id]);
      expect(ledger.rows[0]).toEqual({ provider_submission_state: 'accepted', task_count: '2' });
    } finally {
      await concurrentDatabase.close();
    }
  });

  it('quarantines a stale started generation on replay without another Provider call or Release', async () => {
    const subject = `crash-window-${randomUUID()}`;
    const session = sessionFor(subject);
    await repository.upsertIdentity(session.user);
    const key = `crash-window-${randomUUID()}`;
    const created = await repository.createGenerationIntent({
      ownerSubject: subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: requestBody.model,
      idempotencyKey: key,
      request: requestBody,
      estimatedCredits: 20,
      priceVersion: 'ledger-preview-v1',
    });
    await repository.setGenerationReservation(
      subject,
      created.intent.id,
      `disabled-operation-${created.intent.id}`,
      `disabled-reservation-${created.intent.id}`,
      'generation_pair',
      'ledger-preview-v1',
      20,
      'disabled',
    );
    expect(await repository.claimGenerationProviderSubmission(subject, created.intent.id)).toBe('claimed');
    await postgres.database.query(`UPDATE generation_batches SET
      provider_submission_started_at=NOW()-INTERVAL '11 minutes',
      updated_at=NOW()-INTERVAL '11 minutes' WHERE id=$1`, [created.intent.id]);

    const generate = vi.fn(async () => ['must-not-run-a', 'must-not-run-b']);
    const runtime = serviceFor(repository, generate);
    const replay = await runtime.service.submit(session, requestBody, key);

    expect(replay).toMatchObject({ replay: true, pending: true, tracks: [] });
    expect(generate).not.toHaveBeenCalled();
    expect(runtime.billing.settle).not.toHaveBeenCalled();
    const ledger = await postgres.database.query<{
      provider_submission_state: string;
      status: string;
      billing_status: string;
    }>(`SELECT provider_submission_state,status,billing_status FROM generation_batches WHERE id=$1`, [
      created.intent.id,
    ]);
    expect(ledger.rows[0]).toEqual({
      provider_submission_state: 'uncertain',
      status: 'failed',
      billing_status: 'manual_review_required',
    });
  });

  it('never releases a stale started generation during billing reconciliation', async () => {
    const subject = `stale-billing-${randomUUID()}`;
    const user = platformUser(subject);
    await repository.upsertIdentity(user);
    const created = await repository.createGenerationIntent({
      ownerSubject: subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: requestBody.model,
      idempotencyKey: `stale-billing-${randomUUID()}`,
      request: requestBody,
      estimatedCredits: 20,
      priceVersion: 'ledger-live-v1',
    });
    const config = testConfig({
      BILLING_LIVE_ENABLED: 'true',
      MODELCROSS_TASK_TOKEN_SECRET: 'provider-ledger-worker-token-secret',
    });
    await repository.setGenerationCredential(
      subject,
      created.intent.id,
      encryptSecret('restricted-ledger-token', config.sessionSecret),
    );
    await repository.setGenerationReservation(
      subject,
      created.intent.id,
      `operation-${created.intent.id}`,
      `reservation-${created.intent.id}`,
      'generation_pair',
      'ledger-live-v1',
      20,
      'reserved',
    );
    expect(await repository.claimGenerationProviderSubmission(subject, created.intent.id)).toBe('claimed');
    await postgres.database.query(`UPDATE generation_batches SET
      provider_submission_started_at=NOW()-INTERVAL '11 minutes',
      updated_at=NOW()-INTERVAL '11 minutes' WHERE id=$1`, [created.intent.id]);

    const settle = vi.fn(async () => ({ status: 'released' }));
    const lookupOperation = vi.fn(async () => ({ status: 'reserved' }));
    const worker = new MusicWorker(
      config,
      repository,
      { settle, lookupOperation } as unknown as ModelCrossClient,
      {} as SunoClient,
      { delete: vi.fn(async () => undefined) } as unknown as ObjectStorage,
      {} as PlatformQueue,
      { publish: vi.fn(async () => undefined) } as unknown as PlatformEventBus,
    );
    await worker.process({ name: 'billing.reconcile', data: {}, id: 'stale-ledger-reconcile', attemptsMade: 0 });

    expect(lookupOperation).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect((await postgres.database.query<{
      provider_submission_state: string;
      billing_status: string;
    }>('SELECT provider_submission_state,billing_status FROM generation_batches WHERE id=$1', [created.intent.id])).rows[0])
      .toEqual({ provider_submission_state: 'uncertain', billing_status: 'manual_review_required' });
  });

  it('does not resubmit a stale upload-extend continuation', async () => {
    const subject = `continuation-stale-${randomUUID()}`;
    const user = platformUser(subject);
    await repository.upsertIdentity(user);
    const referenceAudioId = randomUUID();
    await repository.registerReferenceAudioUpload({
      id: referenceAudioId,
      ownerSubject: subject,
      objectKey: `users/ledger/reference/${referenceAudioId}.wav`,
      originalFilename: 'continuation.wav',
      mimeType: 'audio/wav',
      byteSize: 1024,
      durationSeconds: 30,
      checksumSha256: 'c'.repeat(64),
      copyrightConfirmed: true,
      copyrightAudio: false,
      idempotencyKey: `continuation-upload-${randomUUID()}`,
      maxTotalBytes: 10_000,
    });
    await repository.finishReferenceAudioUpload(subject, referenceAudioId, 'ready');
    const generation = await repository.createGenerationIntent({
      ownerSubject: subject,
      projectId: null,
      operation: 'upload_extend',
      sourceTrackId: null,
      referenceAudioId,
      modelProfileId: requestBody.model,
      idempotencyKey: `continuation-stale-${randomUUID()}`,
      request: requestBody,
      submissionOptions: { continueAt: 12, audioWeight: 0.5 },
      estimatedCredits: 25,
      priceVersion: 'ledger-preview-v1',
    });
    await repository.setGenerationReservation(
      subject,
      generation.intent.id,
      `disabled-operation-${generation.intent.id}`,
      `disabled-reservation-${generation.intent.id}`,
      'upload_extend_pair',
      'ledger-preview-v1',
      25,
      'disabled',
    );
    expect(await repository.claimGenerationProviderSubmission(subject, generation.intent.id)).toBe('claimed');
    await repository.acceptUploadExtendStage(
      generation.intent.id, subject, referenceAudioId, 'upload-stage-task', 12, 0.5,
    );
    await postgres.database.query(`UPDATE upload_extend_stages SET
      status='continuation_submitting',stage='continuation',custom_id='uploaded-clip',
      continuation_submission_state='started',
      continuation_submission_started_at=NOW()-INTERVAL '11 minutes',
      updated_at=NOW()-INTERVAL '11 minutes'
      WHERE generation_id=$1`, [generation.intent.id]);

    const generate = vi.fn(async () => ['duplicate-a', 'duplicate-b']);
    const tasks = vi.fn(async () => []);
    const suno = { tasks, generate, forCredential: vi.fn() };
    suno.forCredential.mockReturnValue(suno as unknown as SunoClient);
    const worker = new MusicWorker(
      testConfig(),
      repository,
      {} as ModelCrossClient,
      suno as unknown as SunoClient,
      {} as ObjectStorage,
      {} as PlatformQueue,
      {} as PlatformEventBus,
    );
    await worker.poll();

    expect(generate).not.toHaveBeenCalled();
    const state = await postgres.database.query<{
      continuation_submission_state: string;
      stage_status: string;
      generation_billing_status: string;
    }>(`SELECT s.continuation_submission_state,s.status AS stage_status,
        g.billing_status AS generation_billing_status
      FROM upload_extend_stages s JOIN generation_batches g ON g.id=s.generation_id
      WHERE s.generation_id=$1`, [generation.intent.id]);
    expect(state.rows[0]).toEqual({
      continuation_submission_state: 'uncertain',
      stage_status: 'manual_review_required',
      generation_billing_status: 'manual_review_required',
    });
  });

  it('persists a nullable legacy upload weight and omits it from the continuation Provider request', async () => {
    const subject = `continuation-legacy-${randomUUID()}`;
    await repository.upsertIdentity(platformUser(subject));
    const referenceAudioId = randomUUID();
    await repository.registerReferenceAudioUpload({
      id: referenceAudioId,
      ownerSubject: subject,
      objectKey: `users/ledger/reference/${referenceAudioId}.wav`,
      originalFilename: 'legacy-continuation.wav',
      mimeType: 'audio/wav',
      byteSize: 1024,
      durationSeconds: 30,
      checksumSha256: 'd'.repeat(64),
      copyrightConfirmed: true,
      copyrightAudio: false,
      idempotencyKey: `legacy-continuation-upload-${randomUUID()}`,
      maxTotalBytes: 10_000,
    });
    await repository.finishReferenceAudioUpload(subject, referenceAudioId, 'ready');
    const legacyRequest = {
      ...requestBody,
      model: 'chirp-v4',
      styleWeight: 0.5,
      weirdness: 0.5,
    };
    const generation = await repository.createGenerationIntent({
      ownerSubject: subject,
      projectId: null,
      operation: 'upload_extend',
      sourceTrackId: null,
      referenceAudioId,
      modelProfileId: legacyRequest.model,
      idempotencyKey: `continuation-legacy-${randomUUID()}`,
      request: legacyRequest,
      submissionOptions: { continueAt: 12 },
      estimatedCredits: 20,
      priceVersion: 'ledger-preview-v1',
    });
    // Provider submission is intentionally guarded by the durable billing
    // boundary, even when live charging is disabled in this test fixture.
    await repository.setGenerationReservation(
      subject,
      generation.intent.id,
      `disabled-operation-${generation.intent.id}`,
      `disabled-reservation-${generation.intent.id}`,
      'upload_extend_pair',
      'ledger-preview-v1',
      20,
      'disabled',
    );
    expect(await repository.claimGenerationProviderSubmission(subject, generation.intent.id)).toBe('claimed');
    await repository.acceptUploadExtendStage(
      generation.intent.id, subject, referenceAudioId, 'legacy-upload-stage-task', 12, null,
    );
    await postgres.database.query(`UPDATE upload_extend_stages SET
      status='continuation_ready',stage='continuation',custom_id='legacy-uploaded-clip',
      continuation_submission_state='not_started',next_poll_at=NOW(),updated_at=NOW()
      WHERE generation_id=$1`, [generation.intent.id]);

    const generate = vi.fn(async () => ['legacy-continuation-a', 'legacy-continuation-b']);
    const tasks = vi.fn(async () => []);
    const suno = { tasks, generate, forCredential: vi.fn() };
    suno.forCredential.mockReturnValue(suno as unknown as SunoClient);
    const queue = { add: vi.fn(async () => undefined) } as unknown as PlatformQueue;
    const events = { publish: vi.fn(async () => undefined) } as unknown as PlatformEventBus;
    const worker = new MusicWorker(
      testConfig(),
      repository,
      {} as ModelCrossClient,
      suno as unknown as SunoClient,
      {} as ObjectStorage,
      queue,
      events,
    );
    await worker.poll();

    expect(generate).toHaveBeenCalledWith(legacyRequest, expect.objectContaining({
      operation: 'upload_extend',
      clipId: 'legacy-uploaded-clip',
      continueAt: 12,
    }));
    expect((generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).not.toHaveProperty('audioWeight');
    expect((await postgres.database.query<{ audio_weight: number | null }>(
      'SELECT audio_weight FROM upload_extend_stages WHERE generation_id=$1', [generation.intent.id],
    )).rows[0]?.audio_weight).toBeNull();
  });

  it('persists an explicit 422 rejection before releasing the disabled reservation once', async () => {
    const subject = `explicit-rejection-${randomUUID()}`;
    const session = sessionFor(subject);
    await repository.upsertIdentity(session.user);
    const generate = vi.fn(async () => {
      throw new SunoError('Provider rejected the request', 422);
    });
    const runtime = serviceFor(repository, generate);
    const key = `explicit-rejection-${randomUUID()}`;

    await expect(runtime.service.submit(session, requestBody, key)).rejects.toMatchObject({ status: 422 });
    expect(generate).toHaveBeenCalledOnce();
    expect(runtime.billing.settle).toHaveBeenCalledOnce();
    expect(runtime.billing.settle).toHaveBeenCalledWith(
      session.accessToken,
      'release',
      expect.objectContaining({ reason: 'upstream_submission_failed' }),
      key,
    );
    const ledger = await postgres.database.query<{
      provider_submission_state: string;
      billing_status: string;
    }>(`SELECT provider_submission_state,billing_status FROM generation_batches
      WHERE owner_subject=$1 AND idempotency_key=$2`, [subject, key]);
    expect(ledger.rows[0]).toEqual({ provider_submission_state: 'rejected', billing_status: 'disabled' });
  });

  it('quarantines task ids when SQL acceptance rolls back and replay never calls Provider again', async () => {
    const subject = `acceptance-rollback-${randomUUID()}`;
    const session = sessionFor(subject);
    await repository.upsertIdentity(session.user);
    const generate = vi.fn(async () => ['returned-task-a', 'returned-task-b']);
    const runtime = serviceFor(repository, generate);
    const key = `acceptance-rollback-${randomUUID()}`;
    const acceptance = vi.spyOn(repository, 'acceptGeneration')
      .mockRejectedValueOnce(new Error('simulated acceptance transaction rollback'));

    await expect(runtime.service.submit(session, requestBody, key))
      .rejects.toThrow('simulated acceptance transaction rollback');
    const replay = await runtime.service.submit(session, requestBody, key);

    expect(replay).toMatchObject({ replay: true, pending: true, tracks: [] });
    expect(generate).toHaveBeenCalledOnce();
    expect(runtime.billing.settle).not.toHaveBeenCalled();
    expect(acceptance).toHaveBeenCalledOnce();
    const ledger = await postgres.database.query<{
      provider_submission_state: string;
      billing_status: string;
      task_count: string;
    }>(`SELECT g.provider_submission_state,g.billing_status,COUNT(pt.id)::text AS task_count
      FROM generation_batches g LEFT JOIN provider_tasks pt ON pt.generation_id=g.id
      WHERE g.owner_subject=$1 AND g.idempotency_key=$2 GROUP BY g.id`, [subject, key]);
    expect(ledger.rows[0]).toEqual({
      provider_submission_state: 'uncertain',
      billing_status: 'manual_review_required',
      task_count: '0',
    });
  });

  it('rejects changed Provider-only parameters and conflicting acceptance task ids', async () => {
    const subject = `digest-and-acceptance-${randomUUID()}`;
    const user = platformUser(subject);
    await repository.upsertIdentity(user);
    const key = `provider-options-${randomUUID()}`;
    const input = {
      ownerSubject: subject,
      projectId: null,
      operation: 'extend' as const,
      sourceTrackId: null,
      modelProfileId: requestBody.model,
      idempotencyKey: key,
      request: requestBody,
      submissionOptions: { continueAt: 12 },
      estimatedCredits: 20,
      priceVersion: 'ledger-preview-v1',
    };
    const created = await repository.createGenerationIntent(input);
    await expect(repository.createGenerationIntent({
      ...input,
      submissionOptions: { continueAt: 13 },
    })).rejects.toBeInstanceOf(IdempotencyConflictError);

    await claimTestGenerationProviderSubmission(repository, subject, created.intent.id);
    await repository.acceptGeneration(created.intent.id, subject, ['stable-a', 'stable-b']);
    await expect(repository.acceptGeneration(created.intent.id, subject, ['stable-a', 'stable-b']))
      .resolves.toHaveLength(2);
    expect((await postgres.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count
      FROM outbox_events WHERE aggregate_id=$1 AND event_type='generation.submitted'`, [created.intent.id])).rows[0]?.count)
      .toBe('1');
    await expect(repository.acceptGeneration(created.intent.id, subject, ['different-a', 'different-b']))
      .rejects.toBeInstanceOf(ResourceStateConflictError);
  });
});
