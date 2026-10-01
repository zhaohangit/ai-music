import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { SunoClient, SunoError, type NormalizedSunoTask } from '../suno.js';
import type { PlatformConfig } from './config.js';
import { decryptSecret } from './crypto.js';
import { ModelCrossClient } from './modelcross-client.js';
import { downloadAsset, downloadAssetToFile, type ObjectStorage } from './object-storage.js';
import { PlatformEventBus, type PlatformJob, type PlatformQueue } from './queue.js';
import {
  PlatformRepository,
  type PollableTrackAssetJob,
  type TrackAsset,
} from './repository.js';
import { ownerStoragePrefix } from './music-service.js';
import type { BillingReservation } from './types.js';

const extension = (kind: 'audio' | 'cover' | 'video' | 'wav', mimeType: string): string => {
  if (kind === 'audio') return mimeType === 'audio/mp4' ? 'm4a' : 'mp3';
  if (kind === 'video') return 'mp4';
  if (kind === 'wav') return 'wav';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

export class MusicWorker {
  private scheduler: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: PlatformConfig,
    private readonly repository: PlatformRepository,
    private readonly modelCross: ModelCrossClient,
    private readonly suno: SunoClient,
    private readonly storage: ObjectStorage,
    private readonly queue: PlatformQueue,
    private readonly events: PlatformEventBus,
  ) {}

  async start(): Promise<void> {
    await this.queue.start((job) => this.process(job));
    const initialSlot = Math.floor(Date.now() / this.config.queue.pollIntervalMs);
    await Promise.all([
      this.queue.add('music.poll-all', {}, { jobId: `poll-all:${initialSlot}` }),
      this.queue.add('outbox.dispatch', {}, { jobId: `outbox:${initialSlot}` }),
    ]);
    this.scheduler = setInterval(() => {
      const slot = Math.floor(Date.now() / this.config.queue.pollIntervalMs);
      void this.queue.add('music.poll-all', {}, { jobId: `poll-all:${slot}` }).catch((error) => this.log('queue.schedule.failed', error));
      void this.queue.add('outbox.dispatch', {}, { jobId: `outbox:${slot}` }).catch((error) => this.log('outbox.schedule.failed', error));
      if (slot % Math.max(1, Math.round(60_000 / this.config.queue.pollIntervalMs)) === 0) {
        void this.queue.add('storage.reconcile', {}, { jobId: `storage:${Math.floor(Date.now() / 60_000)}` });
        void this.queue.add('billing.reconcile', {}, { jobId: `billing:${Math.floor(Date.now() / 60_000)}` });
      }
    }, this.config.queue.pollIntervalMs);
    this.scheduler.unref?.();
  }

  private log(event: string, error?: unknown): void {
    console.log(JSON.stringify({
      level: error ? 'error' : 'info', event,
      ...(error ? { error: (error as Error).message } : {}),
      at: new Date().toISOString(),
    }));
  }

  async process(job: PlatformJob): Promise<void> {
    switch (job.name) {
      case 'music.poll': {
        const generationId = typeof job.data.generationId === 'string' && job.data.generationId
          ? job.data.generationId
          : null;
        const assetJobId = typeof job.data.assetJobId === 'string' && job.data.assetJobId
          ? job.data.assetJobId
          : null;
        if (generationId) {
          if (await this.pollTracks(generationId)) return;
          await this.pollUploadExtendStages(generationId);
        } else if (assetJobId) {
          await this.pollTrackAssetJobs(assetJobId);
        }
        return;
      }
      case 'music.poll-all':
        await this.poll();
        return;
      case 'storage.reconcile':
        await this.reconcileStorage();
        return;
      case 'billing.reconcile':
        await this.reconcileBilling();
        return;
      case 'outbox.dispatch':
        await this.dispatchOutbox();
        return;
    }
  }

  async poll(): Promise<void> {
    if (await this.pollTracks()) return;
    if (await this.pollUploadExtendStages()) return;
    await this.pollTrackAssetJobs();
  }

  private retryDelay(error: unknown, attempts: number): number {
    const exponential = Math.min(60_000, this.config.queue.pollIntervalMs * 2 ** Math.min(attempts, 5));
    const retryAfter = error instanceof SunoError && error.retryAfterMs !== null
      ? Math.min(24 * 60 * 60_000, Math.max(0, error.retryAfterMs))
      : 0;
    return Math.max(exponential, retryAfter);
  }

  private terminalWaitExpired(startedAt: Date | null): boolean {
    return startedAt !== null
      && Date.now() - startedAt.getTime() >= this.config.queue.providerResultGraceMs;
  }

  private async providerForGeneration(generationId: string): Promise<SunoClient> {
    const credential = await this.repository.generationCredential(generationId);
    const token = credential?.ciphertext
      ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
      : '';
    return this.suno.forCredential(token);
  }

  private async providerForAssetJob(jobId: string): Promise<SunoClient> {
    const credential = await this.repository.trackAssetJobCredential(jobId);
    const token = credential?.ciphertext
      ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
      : '';
    return this.suno.forCredential(token);
  }

  private async pollTracks(generationId: string | null = null): Promise<boolean> {
    const tasks = await this.repository.listPollableTasks(50, generationId, this.config.queue.pollLeaseMs);
    if (!tasks.length) return false;
    let results: NormalizedSunoTask[];
    try {
      results = [];
      const byGeneration = new Map<string, typeof tasks>();
      for (const task of tasks) {
        byGeneration.set(task.generationId, [...(byGeneration.get(task.generationId) ?? []), task]);
      }
      for (const [taskGenerationId, generationTasks] of byGeneration) {
        const provider = await this.providerForGeneration(taskGenerationId);
        results.push(...await provider.tasks(generationTasks.map((task) => task.upstreamTaskId)));
      }
    } catch (error) {
      await Promise.all(tasks.map((task) => this.repository.markTaskPollFailure(
        task,
        (error as Error).message.slice(0, 500),
        this.retryDelay(error, task.attempts),
        task.attempts >= 900,
      )));
      if (error instanceof SunoError && error.status === 429) return true;
      throw error;
    }
    const byId = new Map(results.map((result) => [result.taskId, result]));
    const touchedGenerations = new Set<string>();
    for (const task of tasks) {
      const result = byId.get(task.upstreamTaskId);
      if (!result) {
        await this.repository.markTaskPollFailure(task, 'provider task missing from response', this.config.queue.pollIntervalMs, task.attempts >= 900);
        continue;
      }
      const completedWithoutAudio = !result.audioUrl
        && (result.upstreamStatus === 'completed' || result.providerStatus === 3);
      const applied = await this.repository.applyProviderResult(
        task,
        result,
        result.audioUrl ? this.config.queue.pollLeaseMs : this.config.queue.pollIntervalMs,
      );
      if (!applied) continue;
      touchedGenerations.add(task.generationId);
      if (result.status === 'error') {
        await this.events.publish({
          type: 'track.failed', subject: task.ownerSubject, resourceId: task.trackId,
          payload: { generationId: task.generationId, trackId: task.trackId, error: result.error ?? 'provider failed' },
        }).catch((error) => this.log('track.failed.event_publish_failed', error));
        continue;
      }
      if (completedWithoutAudio && this.terminalWaitExpired(task.terminalWaitStartedAt)) {
        const error = 'Provider completed without an audio result';
        const failed = await this.repository.markTaskPollFailure(
          task, error, this.config.queue.pollIntervalMs, true, true,
        );
        if (!failed) continue;
        await this.events.publish({
          type: 'track.failed', subject: task.ownerSubject, resourceId: task.trackId,
          payload: { generationId: task.generationId, trackId: task.trackId, error },
        }).catch((publishError) => this.log('track.failed.event_publish_failed', publishError));
        continue;
      }
      if (result.audioUrl) {
        try {
          const materialized = await this.materialize(task, result);
          if (!materialized) continue;
        } catch (error) {
          await this.repository.markTaskPollFailure(task, `asset materialization failed: ${(error as Error).message}`, this.config.queue.pollIntervalMs, task.attempts >= 900);
        }
      }
    }
    for (const generationId of touchedGenerations) await this.finalizeIfTerminal(generationId);
    return false;
  }

  private async pollUploadExtendStages(generationId: string | null = null): Promise<boolean> {
    if (!generationId) await this.repository.markStaleUploadExtendContinuationsUncertain(50);
    const stages = await this.repository.listPollableUploadExtendStages(
      50, generationId, this.config.queue.pollLeaseMs,
    );
    if (stages.length) {
      let results: NormalizedSunoTask[];
      try {
        results = [];
        const byGeneration = new Map<string, typeof stages>();
        for (const stage of stages) {
          byGeneration.set(stage.generationId, [...(byGeneration.get(stage.generationId) ?? []), stage]);
        }
        for (const [stageGenerationId, generationStages] of byGeneration) {
          const provider = await this.providerForGeneration(stageGenerationId);
          results.push(...await provider.tasks(generationStages.map((stage) => stage.upstreamTaskId)));
        }
      } catch (error) {
        await Promise.all(stages.map((stage) => this.repository.markUploadExtendStagePollFailure(
          stage,
          (error as Error).message,
          this.retryDelay(error, stage.attempts),
          stage.attempts >= 900,
        )));
        if (error instanceof SunoError && error.status === 429) return true;
        throw error;
      }
      const byId = new Map(results.map((result) => [result.taskId, result]));
      for (const stage of stages) {
        const result = byId.get(stage.upstreamTaskId);
        if (!result) {
          await this.repository.markUploadExtendStagePollFailure(
            stage, 'Provider upload task missing from response', this.config.queue.pollIntervalMs, stage.attempts >= 900,
          );
          continue;
        }
        const completedWithoutClip = (result.upstreamStatus === 'completed' || result.providerStatus === 3)
          && !result.customId;
        const state = await this.repository.applyUploadExtendStageResult(
          stage, result, this.config.queue.pollIntervalMs,
        );
        if (state === 'stale') continue;
        if (completedWithoutClip && this.terminalWaitExpired(stage.terminalWaitStartedAt)) {
          const failed = await this.repository.markUploadExtendStagePollFailure(
            stage, 'Provider completed the reference upload without a clip id', this.config.queue.pollIntervalMs, true, true,
          );
          if (!failed) continue;
          await this.releaseFailedGeneration(stage.generationId, 'reference_upload_missing_clip_id');
          continue;
        }
        if (state === 'error') {
          await this.releaseFailedGeneration(stage.generationId, 'reference_upload_failed');
        } else if (state === 'ready') {
          await this.continueUploadExtend(stage.id, stage.pollLeaseToken);
        }
      }
    }
    for (const stageId of await this.repository.listRecoverableUploadExtendContinuations(50)) {
      await this.continueUploadExtend(stageId);
    }
    return false;
  }

  private async continueUploadExtend(stageId: string, pollLeaseToken: string | null = null): Promise<void> {
    const continuation = await this.repository.claimUploadExtendContinuation(stageId, pollLeaseToken);
    if (!continuation) return;
    try {
      const provider = await this.providerForGeneration(continuation.generation.id);
      const taskIds = await provider.generate(continuation.generation.request, {
        operation: 'upload_extend',
        clipId: continuation.customId,
        continueAt: continuation.continueAt,
        ...(continuation.audioWeight === null ? {} : { audioWeight: continuation.audioWeight }),
        idempotencyKey: `mf-${createHash('sha256')
          .update(`pipeline-extend\0${continuation.generation.idempotencyKey}`)
          .digest('hex').slice(0, 48)}`,
      });
      await this.repository.acceptGeneration(
        continuation.generation.id,
        continuation.generation.ownerSubject,
        taskIds,
        2,
        stageId,
      );
      await Promise.allSettled([
        this.queue.add('music.poll', { generationId: continuation.generation.id }, {
          jobId: `poll:${continuation.generation.id}`,
        }),
        this.queue.add('outbox.dispatch', {}, { jobId: `outbox:continuation:${continuation.generation.id}` }),
      ]);
      await this.events.publish({
        type: 'generation.continuation.submitted',
        subject: continuation.generation.ownerSubject,
        resourceId: continuation.generation.id,
        payload: { generationId: continuation.generation.id },
      }).catch((error) => this.log('generation.continuation.event_publish_failed', error));
    } catch (error) {
      const definiteProviderRejection = error instanceof SunoError
        && error.status !== null
        && error.status >= 400
        && error.status < 500
        && ![409, 429].includes(error.status);
      try {
        const state = await this.repository.failUploadExtendContinuation(
          stageId,
          (error as Error).message,
          definiteProviderRejection ? 'rejected' : 'uncertain',
        );
        if (state === 'accepted') {
          await Promise.allSettled([
            this.queue.add('music.poll', { generationId: continuation.generation.id }, {
              jobId: `poll:${continuation.generation.id}`,
            }),
            this.queue.add('outbox.dispatch', {}, {
              jobId: `outbox:continuation:${continuation.generation.id}`,
            }),
          ]);
          return;
        }
        if (state === 'rejected') {
          await this.releaseFailedGeneration(continuation.generation.id, 'continuation_provider_rejected');
        }
      } catch (ledgerError) {
        // If even the local acknowledgement fails, leave `started` durable.
        // A later stale scan will quarantine it; guessing here could create a
        // duplicate Provider task or release credits for a finished work.
        this.log('generation.continuation.ledger_failed', ledgerError);
      }
      this.log('generation.continuation.failed', error);
    }
  }

  private async pollTrackAssetJobs(assetJobId: string | null = null): Promise<boolean> {
    const jobs = await this.repository.listPollableTrackAssetJobs(50, assetJobId, this.config.queue.pollLeaseMs);
    if (!jobs.length) return false;
    let results: NormalizedSunoTask[];
    try {
      results = [];
      for (const job of jobs) {
        const provider = await this.providerForAssetJob(job.id);
        results.push(...await provider.tasks([job.upstreamTaskId]));
      }
    } catch (error) {
      await Promise.all(jobs.map((job) => this.repository.markTrackAssetJobPollFailure(
        job,
        (error as Error).message,
        this.retryDelay(error, job.attempts),
        job.attempts >= 900,
      )));
      if (error instanceof SunoError && error.status === 429) return true;
      throw error;
    }
    const byId = new Map(results.map((result) => [result.taskId, result]));
    for (const job of jobs) {
      const result = byId.get(job.upstreamTaskId);
      if (!result) {
        await this.repository.markTrackAssetJobPollFailure(
          job, 'Provider asset task missing from response', this.config.queue.pollIntervalMs, job.attempts >= 900,
        );
        continue;
      }
      const ready = job.action === 'aligned_lyrics'
        // MXAPI has returned both `aligned` and `complete` for a successfully
        // materialized alignment. The alignment array remains the required
        // evidence, so an arbitrary terminal-looking state cannot pass.
        ? ['aligned', 'complete'].includes(result.alignmentState?.toLowerCase() ?? '')
          && result.lyricAlignment.length > 0
        : job.action === 'video' ? Boolean(result.videoUrl) : job.action === 'download_mp3' ? Boolean(result.mp3Url) : job.action === 'download_m4a' ? Boolean(result.m4aUrl) : Boolean(result.wavUrl);
      const terminalResultMissing = !ready
        && (result.upstreamStatus === 'completed' || result.providerStatus === 3);
      const applied = await this.repository.applyTrackAssetJobResult(
        job,
        result,
        ready ? this.config.queue.pollLeaseMs : this.config.queue.pollIntervalMs,
        terminalResultMissing,
      );
      if (!applied) continue;
      if (result.status === 'error') {
        await this.settleTrackAssetJob(job.id, false);
        await this.events.publish({
          type: 'track.asset.failed', subject: job.ownerSubject, resourceId: job.id,
          payload: { jobId: job.id, trackId: job.trackId, action: job.action },
        }).catch((error) => this.log('track.asset.failed.event_publish_failed', error));
        continue;
      }
      if (!ready) {
        if (terminalResultMissing && this.terminalWaitExpired(job.terminalWaitStartedAt)) {
          const failed = await this.repository.markTrackAssetJobPollFailure(
            job, `Provider completed without a ${job.action} result`, this.config.queue.pollIntervalMs, true, true,
          );
          if (!failed) continue;
          await this.settleTrackAssetJob(job.id, false);
        }
        continue;
      }
      try {
        const materialized = await this.materializeTrackAssetJob(job, result);
        if (!materialized) continue;
        await this.settleTrackAssetJob(job.id, true);
        await Promise.allSettled([
          this.queue.add('outbox.dispatch', {}, { jobId: `outbox:asset-complete:${job.id}` }),
          this.events.publish({
            type: 'track.asset.completed', subject: job.ownerSubject, resourceId: job.id,
            payload: { jobId: job.id, trackId: job.trackId, action: job.action },
          }),
        ]);
      } catch (error) {
        await this.repository.markTrackAssetJobPollFailure(
          job,
          `asset materialization failed: ${(error as Error).message}`,
          this.config.queue.pollIntervalMs,
          job.attempts >= 900,
        );
      }
    }
    return false;
  }

  private async materializeTrackAssetJob(
    job: PollableTrackAssetJob,
    result: NormalizedSunoTask,
  ): Promise<boolean> {
    const prefix = `users/${ownerStoragePrefix(job.ownerSubject)}/tracks/${job.trackId}`;
    let stored: Awaited<ReturnType<ObjectStorage['put']>>;
    let kind: TrackAsset['kind'];
    let resultJson: Record<string, unknown>;
    if (job.action === 'aligned_lyrics') {
      kind = 'aligned_lyrics';
      resultJson = {
        state: result.alignmentState,
        alignment: result.lyricAlignment,
      };
      stored = await this.storage.put(
        `${prefix}/aligned-lyrics/${job.id}/${job.pollLeaseToken}.json`,
        Buffer.from(JSON.stringify(resultJson), 'utf8'),
        'application/json',
      );
    } else if (job.action === 'video') {
      kind = 'video';
      const downloaded = await downloadAssetToFile(result.videoUrl!, 'video', this.config.storage);
      try {
        stored = await this.storage.putFile(
          `${prefix}/video/${job.id}/${job.pollLeaseToken}.mp4`, downloaded.filePath, downloaded.mimeType,
        );
      } finally {
        await fs.rm(downloaded.temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      resultJson = { kind: 'video' };
    } else if (job.action === 'download_mp3' || job.action === 'download_m4a') {
      kind = job.action === 'download_mp3' ? 'mp3' : 'm4a';
      const downloaded = await downloadAssetToFile(kind === 'mp3' ? result.mp3Url! : result.m4aUrl!, 'audio', this.config.storage);
      try {
        stored = await this.storage.putFile(`${prefix}/${kind}/${job.id}/${job.pollLeaseToken}.${kind}`, downloaded.filePath, kind === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
      } finally { await fs.rm(downloaded.temporaryDirectory, { recursive: true, force: true }); }
      resultJson = { kind };
    } else {
      kind = 'wav';
      const downloaded = await downloadAssetToFile(result.wavUrl!, 'wav', this.config.storage);
      try {
        const handle = await fs.open(downloaded.filePath, 'r');
        const header = Buffer.alloc(12);
        try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
        if (downloaded.byteSize < 12
          || header.subarray(0, 4).toString('ascii') !== 'RIFF'
          || header.subarray(8, 12).toString('ascii') !== 'WAVE') {
          throw new Error('Provider WAV asset has an invalid RIFF/WAVE signature');
        }
        stored = await this.storage.putFile(
          `${prefix}/wav/${job.id}/${job.pollLeaseToken}.wav`, downloaded.filePath, 'audio/wav',
        );
      } finally {
        await fs.rm(downloaded.temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      resultJson = { kind: 'wav' };
    }
    const asset: TrackAsset = {
      id: randomUUID(), trackId: job.trackId, ownerSubject: job.ownerSubject, kind,
      objectKey: stored.key, mimeType: stored.mimeType, byteSize: stored.byteSize,
      etag: stored.etag, checksumSha256: stored.checksumSha256,
    };
    const completed = await this.repository.completeTrackAssetJob({
      id: job.id, ownerSubject: job.ownerSubject, result: resultJson, asset,
      pollLeaseToken: job.pollLeaseToken,
    });
    if (!completed) await this.storage.delete(stored.key).catch(() => undefined);
    return completed;
  }

  private async settleTrackAssetJob(jobId: string, succeeded: boolean): Promise<void> {
    const credential = await this.repository.trackAssetJobCredential(jobId);
    if (!credential) return;
    try {
      const token = credential.ciphertext
        ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
        : '';
      const response = await this.modelCross.settle(token, succeeded ? 'capture' : 'release', {
        operation_id: credential.operationId,
        reservation_id: credential.reservationId,
        resource_id: jobId,
        ...(succeeded ? { successful_items: 1 } : {}),
      }, credential.idempotencyKey);
      const actualCredits = succeeded
        ? Number(response.captured_amount ?? response.settled_credits ?? 0)
        : 0;
      await this.repository.settleTrackAssetJobBilling(
        jobId,
        credential.ownerSubject,
        this.config.modelCross.billingLive ? (succeeded ? 'captured' : 'released') : 'disabled',
        actualCredits,
      );
    } catch (error) {
      await this.repository.settleTrackAssetJobBilling(
        jobId, credential.ownerSubject, 'reconcile_required', 0, (error as Error).message,
      );
      this.log('track.asset.billing.failed', error);
    }
  }

  private async releaseFailedGeneration(generationId: string, reason: string): Promise<void> {
    const credential = await this.repository.generationCredential(generationId);
    if (!credential?.operationId || !credential.reservationId) {
      await this.repository.markBillingReconcileError(generationId, 'failed generation has no durable reservation identifiers');
      return;
    }
    try {
      const token = credential.ciphertext
        ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
        : '';
      await this.modelCross.settle(token, 'release', {
        operation_id: credential.operationId,
        reservation_id: credential.reservationId,
        resource_id: generationId,
        reason,
      }, credential.idempotencyKey);
      await this.repository.finalizeGeneration(
        generationId,
        'failed',
        this.config.modelCross.billingLive ? 'released' : 'disabled',
        0,
      );
    } catch (error) {
      await this.repository.markBillingReconcileError(generationId, (error as Error).message);
      this.log('generation.release.failed', error);
    }
  }

  private async materialize(
    task: Awaited<ReturnType<PlatformRepository['listPollableTasks']>>[number],
    result: NormalizedSunoTask,
  ): Promise<boolean> {
    const prefix = `users/${ownerStoragePrefix(task.ownerSubject)}/tracks/${task.trackId}`;
    const sources: Array<{ kind: 'audio' | 'cover' | 'video'; url: string }> = [];
    if (result.audioUrl) sources.push({ kind: 'audio', url: result.audioUrl });
    if (result.imageUrl) sources.push({ kind: 'cover', url: result.imageUrl });
    if (result.videoUrl) sources.push({ kind: 'video', url: result.videoUrl });
    let audioReady = false;
    const assets: TrackAsset[] = [];
    try {
      for (const source of sources) {
        let stored: Awaited<ReturnType<ObjectStorage['put']>>;
        if (source.kind === 'video') {
          const downloaded = await downloadAssetToFile(source.url, 'video', this.config.storage);
          try {
            const key = `${prefix}/video/leases/${task.pollLeaseToken}/original.${extension('video', downloaded.mimeType)}`;
            stored = await this.storage.putFile(key, downloaded.filePath, downloaded.mimeType);
          } finally {
            await fs.rm(downloaded.temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
          }
        } else {
          const downloaded = await downloadAsset(source.url, source.kind, this.config.storage);
          const key = `${prefix}/${source.kind}/leases/${task.pollLeaseToken}/original.${extension(source.kind, downloaded.mimeType)}`;
          stored = await this.storage.put(key, downloaded.body, downloaded.mimeType);
        }
        assets.push({
          id: randomUUID(), trackId: task.trackId, ownerSubject: task.ownerSubject, kind: source.kind,
          objectKey: stored.key, mimeType: stored.mimeType, byteSize: stored.byteSize,
          etag: stored.etag, checksumSha256: stored.checksumSha256,
        });
        if (source.kind === 'audio') audioReady = true;
      }
    } catch (error) {
      await Promise.allSettled(assets.map((asset) => this.storage.delete(asset.objectKey)));
      throw error;
    }
    if (!audioReady) {
      await Promise.allSettled(assets.map((asset) => this.storage.delete(asset.objectKey)));
      throw new Error('provider completed without an audio asset');
    }
    const materialized = await this.repository.markTrackMaterialized(task, result, assets);
    if (!materialized) {
      await Promise.allSettled(assets.map((asset) => this.storage.delete(asset.objectKey)));
      return false;
    }
    await this.events.publish({
      type: 'track.completed', subject: task.ownerSubject, resourceId: task.trackId,
      payload: { generationId: task.generationId, trackId: task.trackId },
    }).catch((error) => this.log('track.completed.event_publish_failed', error));
    return true;
  }

  private async finalizeIfTerminal(generationId: string): Promise<void> {
    const outcome = await this.repository.generationOutcome(generationId);
    if (!outcome || outcome.total === 0 || outcome.done + outcome.error < outcome.total) return;
    const status = outcome.done === outcome.total ? 'succeeded' : outcome.done === 0 ? 'failed' : 'partial';
    if (outcome.billingStatus === 'manual_review_required') {
      await this.repository.finalizeGeneration(generationId, status, outcome.billingStatus, 0);
      return;
    }
    if (['captured', 'partially_captured', 'released', 'refunded'].includes(outcome.billingStatus)) return;
    const credential = await this.repository.generationCredential(generationId);
    if (!credential) return;
    let billingStatus = this.config.modelCross.billingLive ? 'reconcile_required' : 'disabled';
    let settledCredits = 0;
    try {
      const token = credential.ciphertext
        ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
        : '';
      if (status === 'failed') {
        const response = await this.modelCross.settle(token, 'release', {
          operation_id: credential.operationId,
          reservation_id: credential.reservationId,
          resource_id: generationId,
          reason: 'all_tracks_failed',
        }, credential.idempotencyKey);
        billingStatus = this.config.modelCross.billingLive ? 'released' : 'disabled';
        settledCredits = Number(response.settled_credits ?? 0);
      } else {
        const response = await this.modelCross.settle(token, 'capture', {
          operation_id: credential.operationId,
          reservation_id: credential.reservationId,
          resource_id: generationId,
          succeeded_units: outcome.done,
          failed_units: outcome.error,
          model_profile_id: credential.modelProfileId,
        }, credential.idempotencyKey);
        const settledStatus = String(response.status ?? '');
        billingStatus = this.config.modelCross.billingLive
          ? settledStatus === 'partially_captured' ? 'partially_captured' : 'captured'
          : 'disabled';
        settledCredits = Number(response.captured_amount ?? response.settled_credits ?? response.captured_credits ?? 0);
      }
    } catch (error) {
      this.log('billing.finalize.failed', error);
      billingStatus = 'reconcile_required';
    }
    await this.repository.finalizeGeneration(generationId, status, billingStatus, settledCredits);
  }

  private async dispatchOutbox(): Promise<void> {
    for (const event of await this.repository.claimOutboxEvents()) {
      try {
        if (!event.ownerSubject) throw new Error('outbox event has no owner subject');
        await this.events.publish({
          id: event.id,
          type: event.eventType,
          subject: event.ownerSubject,
          resourceId: event.aggregateId,
          payload: event.payload,
        });
        await this.repository.finishOutboxEvent(event.id);
      } catch (error) {
        await this.repository.finishOutboxEvent(event.id, (error as Error).message);
      }
    }
  }

  private async reconcileStorage(): Promise<void> {
    for (const tombstone of await this.repository.pendingStorageTombstones()) {
      try {
        await this.storage.delete(tombstone.objectKey);
        await this.repository.finishStorageTombstone(tombstone.id);
      } catch (error) {
        await this.repository.finishStorageTombstone(tombstone.id, (error as Error).message);
      }
    }
  }

  private async reconcileBilling(): Promise<void> {
    // Scan the SQL source of truth, not Redis/provider queues. This recovers
    // both terminal track batches and reserve-before-submit process crashes.
    await this.repository.markStaleUploadExtendContinuationsUncertain(100);
    for (const candidate of await this.repository.listBillingReconcileGenerations()) {
      if (candidate.total > 0) {
        await this.finalizeIfTerminal(candidate.id);
        continue;
      }
      if (candidate.providerSubmissionState === 'started') {
        await this.repository.markGenerationProviderSubmissionUncertain(
          candidate.ownerSubject,
          candidate.id,
          'stale Provider submission has an unknown outcome; automatic release was not attempted',
        ).catch((error) => this.log('billing.reconcile.provider_ledger_failed', error));
        continue;
      }
      if (candidate.providerSubmissionState === 'uncertain'
        || candidate.providerSubmissionState === 'accepted') {
        await this.repository.markBillingReconcileError(
          candidate.id,
          candidate.providerSubmissionState === 'accepted'
            ? 'Provider acceptance is durable but task rows are incomplete; automatic release was not attempted'
            : 'Provider submission outcome is uncertain; automatic release was not attempted',
          'manual_review_required',
        );
        continue;
      }
      const credential = await this.repository.generationCredential(candidate.id);
      if (!credential) continue;
      try {
        const token = credential.ciphertext
          ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
          : '';
        if (this.config.modelCross.billingLive && !token) {
          throw new Error('billing recovery credential is missing');
        }

        if (candidate.status !== 'failed') {
          await this.repository.failGeneration(
            credential.ownerSubject,
            candidate.id,
            'recovering a stale Reserve before provider submission',
            'reconcile_required',
          );
        }
        const recovered = await this.modelCross.lookupOperation(token, {
          resourceId: candidate.id,
          idempotencyKey: credential.idempotencyKey,
        });
        if (!recovered) {
          if (credential.operationId || credential.reservationId) {
            throw new Error('billing lookup did not find the locally referenced operation');
          }
          await this.repository.finalizeGeneration(candidate.id, 'failed', 'not_reserved', 0);
          continue;
        }
        if ((credential.operationId && credential.operationId !== recovered.operationId)
          || (credential.reservationId && credential.reservationId !== recovered.reservationId)) {
          this.log('billing.reconcile.manual_review', new Error(
            'billing lookup identifiers do not match the locally referenced operation',
          ));
          await this.repository.markBillingReconcileError(
            candidate.id,
            'billing lookup identifiers do not match the locally referenced operation',
            'manual_review_required',
          );
          continue;
        }
        const manualReview = recovered.status === 'captured'
          || recovered.status === 'partially_captured'
          || recovered.status === 'refunded';
        let persistedStatus: BillingReservation['status'] | 'manual_review_required' = recovered.status;
        if (manualReview) persistedStatus = 'manual_review_required';
        else if (recovered.status === 'released' || recovered.status === 'disabled') persistedStatus = 'reconcile_required';
        await this.repository.setGenerationReservation(
          credential.ownerSubject,
          candidate.id,
          recovered.operationId,
          recovered.reservationId,
          recovered.operationCode,
          recovered.priceVersion,
          recovered.estimatedCredits,
          persistedStatus,
        );

        if (recovered.status === 'released') {
          await this.repository.finalizeGeneration(candidate.id, 'failed', 'released', 0);
          continue;
        }
        if (recovered.status === 'disabled') {
          await this.repository.finalizeGeneration(candidate.id, 'failed', 'disabled', 0);
          continue;
        }
        if (manualReview) {
          this.log('billing.reconcile.manual_review', new Error(
            `remote billing operation is already ${recovered.status}; automatic release was not attempted`,
          ));
          await this.repository.markBillingReconcileError(
            candidate.id,
            `remote billing operation is already ${recovered.status}; automatic release was not attempted`,
            'manual_review_required',
          );
          continue;
        }
        const response = await this.modelCross.settle(token, 'release', {
          operation_id: recovered.operationId,
          reservation_id: recovered.reservationId,
          resource_id: candidate.id,
          reason: 'submission_failed_or_worker_recovered',
        }, credential.idempotencyKey);
        await this.repository.finalizeGeneration(
          candidate.id,
          'failed',
          this.config.modelCross.billingLive ? 'released' : 'disabled',
          Number(response.settled_credits ?? 0),
        );
      } catch (error) {
        this.log('billing.reconcile.failed', error);
        await this.repository.markBillingReconcileError(candidate.id, (error as Error).message);
      }
    }
    for (const job of await this.repository.listTrackAssetBillingReconcileJobs()) {
      try {
        if (job.providerSubmissionState === 'started') {
          await this.repository.markTrackAssetProviderSubmissionUncertain(
            job.ownerSubject,
            job.id,
            'stale asset Provider submission has an unknown outcome; automatic release was not attempted',
          );
          continue;
        }
        if (job.providerSubmissionState === 'uncertain'
          || (job.providerSubmissionState === 'accepted' && !job.upstreamTaskId)) {
          await this.repository.settleTrackAssetJobBilling(
            job.id, job.ownerSubject, 'manual_review_required', 0,
            'asset Provider submission outcome requires review; automatic release was not attempted',
          );
          continue;
        }
        const credential = await this.repository.trackAssetJobCredential(job.id);
        if (!credential) continue;
        const token = credential.ciphertext
          ? decryptSecret(credential.ciphertext, this.config.sessionSecret)
          : '';
        if (credential.operationId && credential.reservationId) {
          if (job.jobStatus === 'succeeded') await this.settleTrackAssetJob(job.id, true);
          else if (job.jobStatus === 'failed') await this.settleTrackAssetJob(job.id, false);
          else {
            await this.repository.settleTrackAssetJobBilling(
              job.id, job.ownerSubject, 'manual_review_required', 0,
              'stale asset job may have reached the Provider; automatic release was not attempted',
            );
          }
          continue;
        }
        const recovered = await this.modelCross.lookupOperation(token, {
          resourceId: job.id,
          idempotencyKey: credential.idempotencyKey,
        });
        if (!recovered) {
          await this.repository.settleTrackAssetJobBilling(
            job.id, job.ownerSubject, 'not_reserved', 0,
            'Reserve was not committed before the asset job stopped',
          );
          continue;
        }
        await this.repository.setTrackAssetJobReservation({
          id: job.id,
          ownerSubject: job.ownerSubject,
          operationId: recovered.operationId,
          reservationId: recovered.reservationId,
          operationCode: recovered.operationCode,
          priceVersion: recovered.priceVersion,
          reservedCredits: recovered.estimatedCredits,
          status: recovered.status === 'partially_captured' ? 'manual_review_required' : recovered.status,
        });
        if (recovered.status === 'captured' && job.jobStatus === 'succeeded') {
          await this.repository.settleTrackAssetJobBilling(
            job.id, job.ownerSubject, 'captured', recovered.capturedCredits ?? 0,
          );
        } else if (recovered.status === 'released'
          || recovered.status === 'disabled'
          || recovered.status === 'refunded') {
          await this.repository.settleTrackAssetJobBilling(job.id, job.ownerSubject, recovered.status, 0);
        } else if (recovered.status === 'reserved' && job.jobStatus === 'succeeded') {
          await this.settleTrackAssetJob(job.id, true);
        } else if (recovered.status === 'reserved' && job.jobStatus === 'failed') {
          await this.settleTrackAssetJob(job.id, false);
        } else {
          await this.repository.settleTrackAssetJobBilling(
            job.id, job.ownerSubject, 'manual_review_required', 0,
            `remote asset billing is ${recovered.status} while local job is ${job.jobStatus}`,
          );
        }
      } catch (error) {
        this.log('track.asset.billing.reconcile.failed', error);
        await this.repository.settleTrackAssetJobBilling(
          job.id, job.ownerSubject, 'reconcile_required', 0, (error as Error).message,
        );
      }
    }
    for (const run of await this.repository.listAiBillingReconcileRuns()) {
      try {
        const token = decryptSecret(run.credentialCiphertext, this.config.sessionSecret);
        const recovered = await this.modelCross.lookupOperation(token, {
          resourceId: run.id,
          idempotencyKey: run.idempotencyKey,
        });
        if (!recovered) {
          if (run.operationId || run.reservationId) {
            throw new Error('billing lookup did not find the locally referenced AI operation');
          }
          await this.repository.settleAiRunBilling(
            run.id,
            run.ownerSubject,
            'not_reserved',
            0,
            'reserve was not committed before the AI run stopped',
          );
          continue;
        }
        if ((run.operationId && run.operationId !== recovered.operationId)
          || (run.reservationId && run.reservationId !== recovered.reservationId)) {
          this.log('ai.billing.manual_review', new Error(
            'billing lookup identifiers do not match the locally referenced AI operation',
          ));
          await this.repository.settleAiRunBilling(
            run.id,
            run.ownerSubject,
            'manual_review_required',
            0,
            'billing lookup identifiers do not match the locally referenced AI operation',
          );
          continue;
        }
        const capturedWithoutSuccess = recovered.status === 'captured' && run.runStatus !== 'succeeded';
        const manualReview = capturedWithoutSuccess || recovered.status === 'partially_captured';
        const remoteTerminal = recovered.status === 'captured'
          || recovered.status === 'released'
          || recovered.status === 'disabled'
          || recovered.status === 'refunded';
        let persistedStatus: BillingReservation['status'] | 'manual_review_required' = recovered.status;
        if (manualReview) persistedStatus = 'manual_review_required';
        else if (remoteTerminal) persistedStatus = 'reconcile_required';
        await this.repository.setAiRunReservation({
          id: run.id,
          ownerSubject: run.ownerSubject,
          operationCode: recovered.operationCode,
          idempotencyKey: run.idempotencyKey,
          operationId: recovered.operationId,
          reservationId: recovered.reservationId,
          priceVersion: recovered.priceVersion,
          reservedCredits: recovered.estimatedCredits,
          status: persistedStatus,
        });

        if (recovered.status === 'released' || recovered.status === 'disabled' || recovered.status === 'refunded') {
          await this.repository.settleAiRunBilling(
            run.id,
            run.ownerSubject,
            recovered.status,
            0,
            run.runStatus === 'succeeded' ? undefined : `remote AI reservation is already ${recovered.status}`,
          );
          continue;
        }
        if (recovered.status === 'captured') {
          if (capturedWithoutSuccess) {
            this.log('ai.billing.manual_review', new Error(
              'remote AI operation was captured but the local run did not succeed',
            ));
            await this.repository.settleAiRunBilling(
              run.id,
              run.ownerSubject,
              'manual_review_required',
              0,
              'remote AI operation was captured but the local run did not succeed',
            );
            continue;
          }
          await this.repository.settleAiRunBilling(
            run.id,
            run.ownerSubject,
            'captured',
            recovered.capturedCredits ?? 0,
          );
          continue;
        }
        if (recovered.status === 'partially_captured') {
          this.log('ai.billing.manual_review', new Error(
            'single-result AI operation is unexpectedly partially captured',
          ));
          await this.repository.settleAiRunBilling(
            run.id,
            run.ownerSubject,
            'manual_review_required',
            0,
            'single-result AI operation is unexpectedly partially captured',
          );
          continue;
        }
        const succeeded = run.runStatus === 'succeeded';
        const response = await this.modelCross.settle(token, succeeded ? 'capture' : 'release', {
          operation_id: recovered.operationId,
          reservation_id: recovered.reservationId,
          resource_id: run.id,
          ...(succeeded ? { successful_items: 1 } : {}),
        }, run.idempotencyKey);
        const credits = succeeded
          ? Number(response.captured_amount ?? response.settled_credits ?? 0)
          : 0;
        await this.repository.settleAiRunBilling(
          run.id,
          run.ownerSubject,
          succeeded ? 'captured' : 'released',
          credits,
          succeeded ? undefined : 'stale or failed AI run released by reconciliation',
        );
        await this.events.publish({
          type: `ai.billing.${succeeded ? 'captured' : 'released'}`,
          subject: run.ownerSubject,
          resourceId: run.id,
          payload: { id: run.id, credits },
        }).catch((error) => this.log('ai.billing.event_publish_failed', error));
      } catch (error) {
        this.log('ai.billing.reconcile.failed', error);
        await this.repository.settleAiRunBilling(
          run.id,
          run.ownerSubject,
          'reconcile_required',
          0,
          (error as Error).message,
        );
      }
    }
  }

  async stop(): Promise<void> {
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = null;
  }
}
