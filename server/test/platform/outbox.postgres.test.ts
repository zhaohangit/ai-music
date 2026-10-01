import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicWorker } from '../../src/platform/music-worker.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import { PlatformRepository } from '../../src/platform/repository.js';
import type { SunoClient } from '../../src/suno.js';
import type { GenerateRequest } from '../../src/types.js';
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

const request: GenerateRequest = {
  mode: 'simple', title: 'Outbox song', description: 'transactional outbox fixture', style: '', lyrics: '',
  instrumental: true, model: 'chirp-bluejay', negativeTags: '', vocalGender: 'auto',
  styleWeight: 0.65, weirdness: 0.5,
};

function workerFor(publish: ReturnType<typeof vi.fn>) {
  return new MusicWorker(
    testConfig(),
    repository,
    {} as ModelCrossClient,
    {} as SunoClient,
    { delete: vi.fn(async () => undefined) } as unknown as ObjectStorage,
    {} as PlatformQueue,
    { publish } as unknown as PlatformEventBus,
  );
}

async function submittedGeneration(suffix: string) {
  const user = platformUser(`outbox-owner-${suffix}`);
  await repository.upsertIdentity(user);
  const created = await repository.createGenerationIntent({
    ownerSubject: user.subject,
    projectId: null,
    operation: 'generate',
    sourceTrackId: null,
    modelProfileId: 'chirp-bluejay',
    idempotencyKey: `outbox-${suffix}`,
    request,
    estimatedCredits: 14,
    priceVersion: 'music-2026-08-v1',
  });
  await claimTestGenerationProviderSubmission(repository, user.subject, created.intent.id);
  await repository.acceptGeneration(created.intent.id, user.subject, [`provider-a-${suffix}`, `provider-b-${suffix}`]);
  return { user, generationId: created.intent.id };
}

integration('transactional outbox on PostgreSQL', () => {
  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('leases an event once across competing workers and publishes its stable id', async () => {
    const fixture = await submittedGeneration(randomUUID());
    const [left, right] = await Promise.all([
      repository.claimOutboxEvents(1),
      repository.claimOutboxEvents(1),
    ]);
    expect([...left, ...right]).toHaveLength(1);
    const event = [...left, ...right][0]!;
    expect(event).toMatchObject({
      aggregateId: fixture.generationId,
      eventType: 'generation.submitted',
      ownerSubject: fixture.user.subject,
      attempts: 1,
    });
    await repository.finishOutboxEvent(event.id);
    expect((await postgres.database.query<{ processed_at: Date | null }>(
      'SELECT processed_at FROM outbox_events WHERE id=$1', [event.id],
    )).rows[0]?.processed_at).toBeInstanceOf(Date);
  });

  it('keeps failed publication retryable and acknowledges it after recovery', async () => {
    const fixture = await submittedGeneration(randomUUID());
    const publish = vi.fn()
      .mockRejectedValueOnce(new Error('Redis temporarily unavailable'))
      .mockResolvedValueOnce(undefined);
    const worker = workerFor(publish);

    await worker.process({ name: 'outbox.dispatch', data: {}, id: 'outbox-first', attemptsMade: 0 });
    const failed = await postgres.database.query<{ id: string; processed_at: Date | null; last_error: string; attempts: number }>(
      'SELECT id,processed_at,last_error,attempts FROM outbox_events WHERE aggregate_id=$1', [fixture.generationId],
    );
    expect(failed.rows[0]).toMatchObject({ processed_at: null, last_error: 'Redis temporarily unavailable', attempts: 1 });

    await postgres.database.query('UPDATE outbox_events SET available_at=NOW() WHERE id=$1', [failed.rows[0]!.id]);
    await worker.process({ name: 'outbox.dispatch', data: {}, id: 'outbox-retry', attemptsMade: 1 });

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({
      id: failed.rows[0]!.id,
      type: 'generation.submitted',
      subject: fixture.user.subject,
      resourceId: fixture.generationId,
    }));
    const completed = await postgres.database.query<{ processed_at: Date | null; attempts: number }>(
      'SELECT processed_at,attempts FROM outbox_events WHERE id=$1', [failed.rows[0]!.id],
    );
    expect(completed.rows[0]?.processed_at).toBeInstanceOf(Date);
    expect(completed.rows[0]?.attempts).toBe(2);
  });
});
