import { createHash } from 'node:crypto';
import type { GenerateRequest, SoundGenerateRequest } from '../types.js';
import { SunoClient, SunoError } from '../suno.js';
import { normalizeTrackAction, ValidationError } from '../validate.js';
import type { PlatformConfig } from './config.js';
import { encryptSecret } from './crypto.js';
import { PlatformEventBus, type PlatformQueue } from './queue.js';
import { ModelCrossClient } from './modelcross-client.js';
import { PlatformRepository, ResourceNotFoundError } from './repository.js';
import type { AuthenticatedSession, GenerationIntent, PlatformTrack } from './types.js';
import { validateGenerateForProfile, validateSoundForProfile } from './catalog.js';
import { assertModelCrossIdempotencyKey } from './idempotency.js';
import { requireAuthorizedMusicModel, requireMusicOperation } from './music-billing-gate.js';
import {
  musicOperationBillingItemCount,
  musicOperationDefinition,
  type MusicOperationDefinition,
} from './music-operations.js';


export interface MusicSubmissionResult {
  generation: GenerationIntent;
  tracks: PlatformTrack[];
  replay: boolean;
  pending: boolean;
}

export class MusicService {
  constructor(
    private readonly config: PlatformConfig,
    private readonly repository: PlatformRepository,
    private readonly modelCross: ModelCrossClient,
    private readonly suno: SunoClient,
    private readonly queue: PlatformQueue,
    private readonly events: PlatformEventBus,
  ) {}

  async submit(session: AuthenticatedSession, rawBody: unknown, idempotencyKey: string): Promise<MusicSubmissionResult> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) throw new ValidationError('body must be an object');
    const body = rawBody as Record<string, unknown>;
    if (body.kind !== undefined && body.kind !== 'sound') {
      throw new ValidationError('kind must be sound when provided');
    }
    const operation: 'generate' | 'sound' = body.kind === 'sound' ? 'sound' : 'generate';
    const modelId = typeof body.model === 'string' && body.model
      ? body.model
      : operation === 'sound' ? 'chirp-crow' : 'chirp-bluejay';
    const profile = await this.repository.getModelProfile(modelId);
    if (!profile) throw new ValidationError('selected music model is unavailable');
    await requireAuthorizedMusicModel(this.config, this.modelCross, session, profile.id);
    if (!profile.capabilities.operations.includes(operation)) {
      throw new ValidationError(`selected model does not support ${operation === 'sound' ? 'sound generation' : 'generation'}`);
    }
    const definition = musicOperationDefinition(operation, false, operation === 'generate' && body.isMaxMode === true);
    const catalog = await requireMusicOperation(this.config, this.modelCross, this.suno, session, definition);
    const request: GenerateRequest | SoundGenerateRequest = operation === 'sound'
      ? validateSoundForProfile(body, profile)
      : validateGenerateForProfile(body, profile);
    const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null;
    const created = await this.repository.createGenerationIntent({
      ownerSubject: session.user.subject,
      projectId,
      operation,
      sourceTrackId: null,
      modelProfileId: profile.id,
      idempotencyKey,
      request,
      estimatedCredits: catalog.estimatedCredits ?? definition.fallbackCredits,
      priceVersion: catalog.priceVersion ?? profile.priceVersion,
      maxConcurrent: this.config.limits.maxConcurrentGenerations,
    });
    if (created.replay) {
      const tracks = await this.repository.tracksForGeneration(session.user.subject, created.intent.id);
      if (tracks.length || !['draft', 'submitting'].includes(created.intent.status)) {
        return { generation: created.intent, tracks, replay: true, pending: tracks.length === 0 };
      }
    }
    const submitUpstream = operation === 'sound'
      ? (credential: string) => this.suno.forCredential(credential)
        .sound(request as SoundGenerateRequest, created.intent.idempotencyKey)
      : (credential: string) => this.suno.forCredential(credential)
        .generate(request, { idempotencyKey: created.intent.idempotencyKey });
    return this.submitIntent(
      session,
      created.intent,
      request,
      definition,
      catalog.estimatedCredits ?? definition.fallbackCredits,
      submitUpstream,
      created.replay,
    );
  }

  async action(session: AuthenticatedSession, sourceTrackId: string, rawBody: unknown, idempotencyKey: string): Promise<MusicSubmissionResult> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    const source = await this.repository.getTrack(session.user.subject, sourceTrackId);
    if (!source) throw new ResourceNotFoundError('track not found');
    if (source.status !== 'done' || !source.customId) throw new ValidationError('source track must be complete');
    const action = normalizeTrackAction(rawBody);
    if (action.audioWeight !== undefined
      && (action.action !== 'cover' || source.operation !== 'upload' || !source.referenceAudioAvailable)) {
      throw new ValidationError('audioWeight is only available when covering a retained uploaded-audio Track');
    }
    const targetModelId = action.action === 'remaster' ? source.model : action.model ?? source.model;
    const profile = await this.repository.getModelProfile(targetModelId);
    if (!profile || !profile.capabilities.operations.includes(action.action)) throw new ValidationError('selected model does not support this operation');
    if (action.audioWeight !== undefined) {
      if (!profile.capabilities.styleWeight || !profile.capabilities.weirdness) {
        throw new ValidationError('audioWeight is not supported by the selected model');
      }
      if (!Number.isFinite(action.audioWeight) || action.audioWeight < 0 || action.audioWeight > 1) {
        throw new ValidationError('audioWeight must be between 0 and 1');
      }
    }
    await requireAuthorizedMusicModel(this.config, this.modelCross, session, profile.id);
    const definition = musicOperationDefinition(action.action);
    const catalog = await requireMusicOperation(this.config, this.modelCross, this.suno, session, definition);
    const inherited: GenerateRequest = {
      mode: source.mode, title: source.title, description: source.description, style: source.style,
      lyrics: source.lyrics, instrumental: source.instrumental, model: source.model,
      negativeTags: source.negativeTags, vocalGender: source.vocalGender,
      styleWeight: source.styleWeight, weirdness: source.weirdness,
    };
    // MXAPI extend and cover accept the same generation controls as a new song. Merge only the
    // normalized public override fields, then validate the complete request against the selected
    // target model so a model switch cannot retain values outside its capability limits.
    const request = action.action === 'extend' || action.action === 'cover'
      ? validateGenerateForProfile({
        ...inherited,
        ...Object.fromEntries(Object.entries(action).filter(([key]) => !['action', 'projectId', 'continueAt', 'variation', 'audioWeight'].includes(key))),
        model: profile.id,
      }, profile)
      : inherited;
    const continueAt = action.action === 'extend' ? action.continueAt ?? source.duration : undefined;
    if (action.action === 'extend' && source.duration > 0 && Number(continueAt) > source.duration) {
      throw new ValidationError('continueAt exceeds source Track duration');
    }
    const submissionOptions = action.action === 'extend'
      ? { continueAt }
      : action.action === 'remaster'
        ? { variation: action.variation }
        : action.audioWeight === undefined ? {} : { audioWeight: action.audioWeight };
    const created = await this.repository.createGenerationIntent({
      ownerSubject: session.user.subject,
      projectId: source.projectId,
      operation: action.action,
      sourceTrackId,
      modelProfileId: profile.id,
      idempotencyKey,
      request,
      submissionOptions,
      estimatedCredits: catalog.estimatedCredits ?? definition.fallbackCredits,
      priceVersion: catalog.priceVersion ?? profile.priceVersion,
      maxConcurrent: this.config.limits.maxConcurrentGenerations,
    });
    if (created.replay) {
      const tracks = await this.repository.tracksForGeneration(session.user.subject, created.intent.id);
      if (tracks.length || !['draft', 'submitting'].includes(created.intent.status)) {
        return { generation: created.intent, tracks, replay: true, pending: tracks.length === 0 };
      }
    }
    const generateOperation: 'extend' | 'cover' = action.action === 'extend' ? 'extend' : 'cover';
    const submit = action.action === 'remaster'
      ? (credential: string) => this.suno.forCredential(credential)
        .remaster(source.customId!, source.model, action.variation, created.intent.idempotencyKey)
      : (credential: string) => this.suno.forCredential(credential).generate(request, {
        operation: generateOperation,
        clipId: source.customId!,
        continueAt,
        audioWeight: action.audioWeight,
        idempotencyKey: created.intent.idempotencyKey,
      });
    return this.submitIntent(
      session,
      created.intent,
      request,
      definition,
      catalog.estimatedCredits ?? definition.fallbackCredits,
      submit,
      created.replay,
    );
  }

  private async submitIntent(
    session: AuthenticatedSession,
    intent: GenerationIntent,
    request: GenerateRequest | SoundGenerateRequest,
    definition: MusicOperationDefinition,
    fallbackCredits: number,
    submitUpstream: (credential: string) => Promise<string[]>,
    replay = false,
  ): Promise<MusicSubmissionResult> {
    const opCode = definition.operationCode;
    const expectedItems = musicOperationBillingItemCount(definition);
    let credential = session.accessToken;
    let tracks: PlatformTrack[];
    let acceptedReservation: Awaited<ReturnType<ModelCrossClient['reserve']>>;
    let providerSubmissionClaimed = false;
    try {
      const quote = await this.modelCross.quote(session.accessToken, {
        operationCode: opCode,
        expectedItems,
        fallbackCredits,
      });
      if (this.config.modelCross.billingLive) {
        credential = await this.modelCross.taskToken(session.accessToken, {
          credentialId: intent.id,
          resourceId: intent.id,
          allowedOperations: [opCode, 'music_task_read'],
          allowedModels: [intent.modelProfileId],
          maxCost: Math.max(quote.estimatedCredits, 1),
          idempotencyKey: intent.idempotencyKey,
        });
        await this.repository.setGenerationCredential(
          session.user.subject,
          intent.id,
          encryptSecret(credential, this.config.sessionSecret),
        );
      }
      const reservation = await this.modelCross.reserve(credential, {
        operationCode: opCode,
        resourceId: intent.id,
        priceVersion: quote.priceVersion,
        idempotencyKey: intent.idempotencyKey,
        expectedItems,
      }, quote.estimatedCredits || fallbackCredits);
      await this.repository.setGenerationReservation(
        session.user.subject,
        intent.id,
        reservation.operationId,
        reservation.reservationId,
        reservation.operationCode,
        reservation.priceVersion,
        reservation.estimatedCredits,
        reservation.status,
      );
      const claim = await this.repository.claimGenerationProviderSubmission(
        session.user.subject,
        intent.id,
      );
      if (claim !== 'claimed') {
        return this.currentSubmission(intent, true);
      }
      providerSubmissionClaimed = true;
      const taskIds = await submitUpstream(credential);
      const acceptedTracks = await this.repository.acceptGeneration(intent.id, session.user.subject, taskIds);
      const requestedOutputCount = request.outputCount === 1 ? 1 : 2;
      tracks = acceptedTracks.slice(0, requestedOutputCount);
      acceptedReservation = reservation;
    } catch (error) {
      const state = await this.repository.generationCredential(intent.id);
      const definiteProviderRejection = error instanceof SunoError
        && error.status !== null
        && error.status >= 400
        && error.status < 500
        && ![409, 429].includes(error.status);
      if (providerSubmissionClaimed) {
        const submissionState = definiteProviderRejection
          ? await this.repository.markGenerationProviderSubmissionRejected(
            session.user.subject,
            intent.id,
            (error as Error).message,
          )
          : await this.repository.markGenerationProviderSubmissionUncertain(
            session.user.subject,
            intent.id,
            `${(error as Error).message}; Provider submission outcome requires review`,
          );
        if (submissionState === 'accepted') {
          // The SQL COMMIT may have succeeded even if its acknowledgement was
          // lost.  The accepted ledger is authoritative: recover the durable
          // result and continue scheduling instead of downgrading or releasing.
          await Promise.allSettled([
            Promise.resolve().then(() => this.queue.add(
              'music.poll', { generationId: intent.id }, { jobId: `poll:${intent.id}` },
            )),
            Promise.resolve().then(() => this.queue.add(
              'outbox.dispatch', {}, { jobId: `outbox:submit:${intent.id}` },
            )),
          ]);
          return this.currentSubmission(intent, replay);
        }
        if (submissionState !== 'rejected') {
          // Timeout/transport errors and a task id followed by a SQL failure
          // are indistinguishable from a committed Provider mutation.  The
          // durable ledger therefore forbids both retry and automatic Release.
          await this.events.publish({
            type: 'generation.failed', subject: session.user.subject, resourceId: intent.id,
            payload: { generationId: intent.id, error: 'submission outcome requires review' },
          }).catch(() => undefined);
          throw error;
        }
      }
      if (state?.reservationId) {
        try {
          await this.modelCross.settle(credential, 'release', {
            operation_id: state.operationId,
            reservation_id: state.reservationId,
            resource_id: intent.id,
            reason: 'upstream_submission_failed',
          }, intent.idempotencyKey);
          await this.repository.failGeneration(
            session.user.subject,
            intent.id,
            (error as Error).message,
            this.config.modelCross.billingLive ? 'released' : 'disabled',
          );
        } catch (releaseError) {
          await this.repository.failGeneration(
            session.user.subject,
            intent.id,
            `${(error as Error).message}; release pending: ${(releaseError as Error).message}`,
            'reconcile_required',
          );
        }
      } else {
        // Once the restricted credential has been durably saved, a Reserve
        // request may have committed remotely even if its response never made
        // it back into our SQL transaction. Only the owner-scoped lookup can
        // prove that no hold exists; the API request must not guess here.
        const reserveMayHaveCommitted = this.config.modelCross.billingLive && Boolean(state?.ciphertext);
        await this.repository.failGeneration(
          session.user.subject,
          intent.id,
          (error as Error).message,
          reserveMayHaveCommitted ? 'reconcile_required' : 'not_reserved',
        );
      }
      await this.events.publish({
        type: 'generation.failed', subject: session.user.subject, resourceId: intent.id,
        payload: { generationId: intent.id, error: 'submission failed' },
      }).catch(() => undefined);
      throw error;
    }

    // acceptGeneration commits the tracks, provider task ids and outbox event
    // as one transaction. From this point onward the upstream work is durable;
    // auxiliary reads or queue nudges must never enter the release/fail path.
    const scheduled = await Promise.allSettled([
      Promise.resolve().then(() => this.queue.add(
        'music.poll',
        { generationId: intent.id },
        { jobId: `poll:${intent.id}` },
      )),
      Promise.resolve().then(() => this.queue.add(
        'outbox.dispatch',
        {},
        { jobId: `outbox:submit:${intent.id}` },
      )),
    ]);
    for (const result of scheduled) {
      if (result.status === 'rejected') {
        console.error(JSON.stringify({
          level: 'error', event: 'generation.enqueue_failed', generationId: intent.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }));
      }
    }
    const fallbackGeneration: GenerationIntent = {
      ...intent,
      status: 'queued',
      priceVersion: acceptedReservation.priceVersion,
      estimatedCredits: acceptedReservation.estimatedCredits,
      billingOperationId: acceptedReservation.operationId,
      billingReservationId: acceptedReservation.reservationId,
      billingStatus: acceptedReservation.status,
    };
    const generation = await this.repository.getGeneration(session.user.subject, intent.id).catch((error) => {
      console.error(JSON.stringify({
        level: 'error', event: 'generation.post_accept_read_failed', generationId: intent.id,
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }) ?? fallbackGeneration;
    return { generation, tracks, replay, pending: false };
  }

  private async currentSubmission(intent: GenerationIntent, replay: boolean): Promise<MusicSubmissionResult> {
    const tracks = await this.repository.tracksForGeneration(intent.ownerSubject, intent.id);
    const generation = await this.repository.getGeneration(intent.ownerSubject, intent.id) ?? intent;
    return { generation, tracks, replay, pending: tracks.length === 0 };
  }
}

export const ownerStoragePrefix = (subject: string): string => createHash('sha256').update(subject).digest('hex').slice(0, 32);
