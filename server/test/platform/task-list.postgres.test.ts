import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformRepository } from '../../src/platform/repository.js';
import type { GenerateRequest, MusicOperation } from '../../src/types.js';
import {
  claimTestGenerationProviderSubmission,
  isolatedPostgres,
  platformUser,
  type IsolatedPostgres,
} from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);

const requestBody = (title: string): GenerateRequest => ({
  mode: 'simple',
  title,
  description: 'task pagination fixture',
  style: '',
  lyrics: '',
  instrumental: false,
  model: 'chirp-bluejay',
  negativeTags: '',
  vocalGender: 'auto',
  styleWeight: 0.5,
  weirdness: 0.5,
});

integration('owner-scoped mixed task pagination', () => {
  let postgres: IsolatedPostgres;
  let repository: PlatformRepository;

  beforeAll(async () => {
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
  }, 30_000);

  afterAll(async () => {
    await postgres?.close();
  });

  it('returns exact globally ordered pages with complete task metadata and owner isolation', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`tasks-owner-${suffix}`);
    const foreignOwner = platformUser(`tasks-foreign-${suffix}`);
    await repository.upsertIdentity(owner);
    await repository.upsertIdentity(foreignOwner);

    type SeededTask = {
      id: string;
      upstreamTaskId: string;
      createdAt: string;
      taskType: 'generation' | 'track_asset' | 'reference_upload_stage';
      generationId: string;
    };
    const seeded: SeededTask[] = [];

    const createIntent = async (
      ownerSubject: string,
      label: string,
      operation: MusicOperation,
      submissionOptions: Record<string, unknown>,
    ) => (await repository.createGenerationIntent({
      ownerSubject,
      projectId: null,
      operation,
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey: `task-list-${label}-${suffix}`,
      request: requestBody(`Task ${label}`),
      submissionOptions,
      estimatedCredits: 12,
      priceVersion: 'task-list-v1',
      maxConcurrent: 100,
    })).intent;

    const seedOwner = async (
      ownerSubject: string,
      label: string,
      count: number,
      baseTimestamp: number,
      collect: boolean,
    ) => {
      for (let index = 0; index < count; index += 1) {
        const generation = await createIntent(
          ownerSubject,
          `${label}-generation-${index}`,
          'generate',
          { seedTag: `${label}-${index}` },
        );
        await claimTestGenerationProviderSubmission(repository, ownerSubject, generation.id);
        const generationUpstreamId = `${label}-generation-upstream-${index}-${suffix}`;
        const [track] = await repository.acceptGeneration(
          generation.id,
          ownerSubject,
          [generationUpstreamId],
          1,
        );
        const generationAt = new Date(baseTimestamp + index * 3_000);
        const providerTask = await postgres.database.query<{ id: string }>(`UPDATE provider_tasks SET
          provider_record_id=$2,created_at=$3,updated_at=$3 WHERE upstream_task_id=$1 RETURNING id`, [
          generationUpstreamId,
          1_000 + index,
          generationAt,
        ]);
        await postgres.database.query(`UPDATE tracks SET status='done',stage='done',progress=1,
          custom_id=$2,provider_record_id=$3 WHERE id=$1`, [track!.id, `${label}-clip-${index}`, 1_000 + index]);
        if (collect) seeded.push({
          id: providerTask.rows[0]!.id,
          upstreamTaskId: generationUpstreamId,
          createdAt: generationAt.toISOString(),
          taskType: 'generation',
          generationId: generation.id,
        });

        const assetId = randomUUID();
        await repository.createTrackAssetJob({
          id: assetId,
          ownerSubject,
          trackId: track!.id,
          action: 'aligned_lyrics',
          operationCode: 'aligned_lyrics_single',
          idempotencyKey: `task-list-${label}-asset-${index}-${suffix}`,
          request: { lyrics: `${label} lyrics ${index}` },
          estimatedCredits: 3,
          maxConcurrent: 100,
        });
        const assetUpstreamId = `${label}-asset-upstream-${index}-${suffix}`;
        const assetAt = new Date(baseTimestamp + index * 3_000 + 1_000);
        await postgres.database.query(`UPDATE track_asset_jobs SET status='queued',progress=.25,
          upstream_task_id=$2,provider_record_id=$3,actual_credits=3,billing_status='captured',
          created_at=$4,updated_at=$4 WHERE id=$1`, [assetId, assetUpstreamId, 2_000 + index, assetAt]);
        if (collect) seeded.push({
          id: assetId,
          upstreamTaskId: assetUpstreamId,
          createdAt: assetAt.toISOString(),
          taskType: 'track_asset',
          generationId: generation.id,
        });

        const uploadGeneration = await createIntent(
          ownerSubject,
          `${label}-upload-${index}`,
          'upload_extend',
          { continueAt: index, audioWeight: 0.7 },
        );
        await repository.setGenerationReservation(
          ownerSubject,
          uploadGeneration.id,
          `${label}-operation-${index}-${suffix}`,
          `${label}-reservation-${index}-${suffix}`,
          'upload_extend_pair',
          'task-list-v1',
          12,
          'reserved',
        );
        await postgres.database.query(`UPDATE billing_operation_mirrors SET
          settled_credits=6,status='captured',updated_at=NOW() WHERE generation_id=$1`, [uploadGeneration.id]);
        await postgres.database.query(`UPDATE generation_batches SET billing_status='captured' WHERE id=$1`, [uploadGeneration.id]);
        const uploadId = randomUUID();
        const uploadUpstreamId = `${label}-upload-upstream-${index}-${suffix}`;
        const uploadAt = new Date(baseTimestamp + index * 3_000 + 2_000);
        await postgres.database.query(`INSERT INTO upload_extend_stages(
          id,generation_id,owner_subject,upstream_task_id,provider_record_id,continue_at,audio_weight,
          status,stage,progress,created_at,updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,.7,'running','uploading',.5,$7,$7)`, [
          uploadId,
          uploadGeneration.id,
          ownerSubject,
          uploadUpstreamId,
          3_000 + index,
          index,
          uploadAt,
        ]);
        if (collect) seeded.push({
          id: uploadId,
          upstreamTaskId: uploadUpstreamId,
          createdAt: uploadAt.toISOString(),
          taskType: 'reference_upload_stage',
          generationId: uploadGeneration.id,
        });
      }
    };

    const baseTimestamp = Date.parse('2026-08-20T00:00:00.000Z');
    await seedOwner(owner.subject, 'owned', 12, baseTimestamp, true);
    await seedOwner(foreignOwner.subject, 'foreign', 1, baseTimestamp + 120_000, false);

    const expected = [...seeded].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const pages = await Promise.all([
      repository.listTasks(owner.subject, 10, { offset: 0 }),
      repository.listTasks(owner.subject, 10, { offset: 10 }),
      repository.listTasks(owner.subject, 10, { offset: 20 }),
      repository.listTasks(owner.subject, 10, { offset: 30 }),
    ]);
    expect(pages.map((page) => page.length)).toEqual([10, 10, 10, 6]);
    expect(pages.flat().map((task) => task.id)).toEqual(expected.map((task) => task.id));
    expect(pages.flat().every((task) => !String(task.upstreamTaskId).startsWith('foreign-'))).toBe(true);

    const generationSeed = expected.find((task) => task.taskType === 'generation')!;
    const assetSeed = expected.find((task) => task.taskType === 'track_asset')!;
    const uploadSeed = expected.find((task) => task.taskType === 'reference_upload_stage')!;
    const byId = new Map(pages.flat().map((task) => [task.id, task]));
    expect(byId.get(generationSeed.id)).toMatchObject({
      taskType: 'generation',
      generationId: generationSeed.generationId,
      upstreamTaskId: generationSeed.upstreamTaskId,
      submissionOptions: { seedTag: expect.any(String) },
    });
    expect(byId.get(assetSeed.id)).toMatchObject({
      taskType: 'track_asset',
      generationId: assetSeed.generationId,
      upstreamTaskId: assetSeed.upstreamTaskId,
      providerRecordId: expect.any(Number),
      submissionOptions: { lyrics: expect.any(String) },
      settledCredits: 3,
    });
    expect(byId.get(uploadSeed.id)).toMatchObject({
      taskType: 'reference_upload_stage',
      generationId: uploadSeed.generationId,
      upstreamTaskId: uploadSeed.upstreamTaskId,
      providerRecordId: expect.any(Number),
      submissionOptions: { continueAt: expect.any(Number), audioWeight: 0.7 },
      settledCredits: 6,
    });

    const oldestByType = (taskType: SeededTask['taskType']) => seeded
      .filter((task) => task.taskType === taskType)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]!;
    const requested = [
      oldestByType('generation'),
      oldestByType('track_asset'),
      oldestByType('reference_upload_stage'),
    ];
    const filtered = await repository.listTasks(owner.subject, 3, {
      upstreamTaskIds: requested.map((task) => task.upstreamTaskId),
    });
    expect(filtered.map((task) => task.id).sort()).toEqual(requested.map((task) => task.id).sort());
    expect(await repository.listTasks(foreignOwner.subject, 10)).toHaveLength(3);
  }, 60_000);

  it('apportions generation credits across provider tasks and preserves batch totals', async () => {
    const suffix = randomUUID();
    const owner = platformUser(`task-billing-${suffix}`);
    await repository.upsertIdentity(owner);

    const createPair = async (label: string, estimated: number, settled: number, successfulTakeIndexes: number[]) => {
      const generation = (await repository.createGenerationIntent({
        ownerSubject: owner.subject,
        projectId: null,
        operation: 'generate',
        sourceTrackId: null,
        modelProfileId: 'chirp-bluejay',
        idempotencyKey: `task-billing-${label}-${suffix}`,
        request: requestBody(`Billing ${label}`),
        submissionOptions: {},
        estimatedCredits: estimated,
        priceVersion: 'task-billing-v1',
        maxConcurrent: 100,
      })).intent;
      await repository.setGenerationReservation(
        owner.subject,
        generation.id,
        `billing-operation-${label}-${suffix}`,
        `billing-reservation-${label}-${suffix}`,
        'generation_pair',
        'task-billing-v1',
        estimated,
      );
      await claimTestGenerationProviderSubmission(repository, owner.subject, generation.id);
      const upstreamTaskIds = [0, 1].map((takeIndex) => `${label}-${takeIndex}-${suffix}`);
      const tracks = await repository.acceptGeneration(generation.id, owner.subject, upstreamTaskIds, 2);
      await postgres.database.query(`UPDATE provider_tasks SET status=CASE WHEN upstream_task_id=ANY($2::text[])
        THEN 'done' ELSE 'error' END,stage=CASE WHEN upstream_task_id=ANY($2::text[])
        THEN 'done' ELSE 'error' END,progress=1 WHERE generation_id=$1`, [
        generation.id,
        successfulTakeIndexes.map((takeIndex) => upstreamTaskIds[takeIndex]),
      ]);
      await postgres.database.query(`UPDATE tracks SET status=CASE WHEN take_index=ANY($2::int[])
        THEN 'done' ELSE 'error' END,stage=CASE WHEN take_index=ANY($2::int[])
        THEN 'done' ELSE 'error' END,progress=1 WHERE generation_id=$1`, [
        generation.id,
        successfulTakeIndexes,
      ]);
      await postgres.database.query(`UPDATE billing_operation_mirrors SET settled_credits=$2,status='captured',updated_at=NOW()
        WHERE generation_id=$1`, [generation.id, settled]);
      return { generationId: generation.id, upstreamTaskIds, tracks };
    };

    const full = await createPair('full', 321, 321, [0, 1]);
    const partial = await createPair('partial', 320, 11, [1]);
    const tasks = await repository.listTasks(owner.subject, 200);
    const generationTasks = tasks.filter((task) => task.taskType === 'generation');
    const byUpstreamTaskId = new Map(generationTasks.map((task) => [task.upstreamTaskId, task]));

    expect(byUpstreamTaskId.get(full.upstreamTaskIds[0])).toMatchObject({ estimatedCredits: 161, settledCredits: 161 });
    expect(byUpstreamTaskId.get(full.upstreamTaskIds[1])).toMatchObject({ estimatedCredits: 160, settledCredits: 160 });
    expect(byUpstreamTaskId.get(partial.upstreamTaskIds[0])).toMatchObject({ estimatedCredits: 160, settledCredits: 0 });
    expect(byUpstreamTaskId.get(partial.upstreamTaskIds[1])).toMatchObject({ estimatedCredits: 160, settledCredits: 11 });

    const fullTasks = generationTasks.filter((task) => task.generationId === full.generationId);
    const partialTasks = generationTasks.filter((task) => task.generationId === partial.generationId);
    expect(fullTasks.reduce((sum, task) => sum + Number(task.estimatedCredits), 0)).toBe(321);
    expect(fullTasks.reduce((sum, task) => sum + Number(task.settledCredits), 0)).toBe(321);
    expect(partialTasks.reduce((sum, task) => sum + Number(task.estimatedCredits), 0)).toBe(320);
    expect(partialTasks.reduce((sum, task) => sum + Number(task.settledCredits), 0)).toBe(11);

    const filtered = await repository.listTasks(owner.subject, 1, {
      upstreamTaskIds: [full.upstreamTaskIds[0]],
    });
    expect(filtered[0]).toMatchObject({ estimatedCredits: 161, settledCredits: 161 });
  }, 60_000);
});
