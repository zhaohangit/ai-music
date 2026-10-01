import { createHash, randomUUID } from 'node:crypto';
import type { GenerateRequest, MusicOperation } from '../types.js';
import { SunoClient, SunoError, type SunoSpeedMultiplier } from '../suno.js';
import { ValidationError } from '../validate.js';
import { validateAudioUploadFile } from './audio-upload.js';
import { validateGenerateForProfile } from './catalog.js';
import { assertAllowedFields } from '../contract-validation.js';
import type { PlatformConfig } from './config.js';
import { encryptSecret } from './crypto.js';
import { assertModelCrossIdempotencyKey } from './idempotency.js';
import { requireAuthorizedMusicModel, requireMusicOperation } from './music-billing-gate.js';
import {
  musicOperationBillingItemCount,
  musicOperationDefinition,
  SPEED_MULTIPLIERS,
  type MusicOperationDefinition,
  type StableMusicAction,
} from './music-operations.js';
import { ownerStoragePrefix, type MusicSubmissionResult } from './music-service.js';
import { ModelCrossClient } from './modelcross-client.js';
import type { ObjectStorage } from './object-storage.js';
import { PlatformEventBus, type PlatformQueue } from './queue.js';
import {
  PlatformRepository,
  ResourceNotFoundError,
  ResourceStateConflictError,
} from './repository.js';
import type {
  AuthenticatedSession,
  GenerationIntent,
  MusicModelProfile,
  MusicOperationCatalogItem,
  PlatformTrack,
  ReferenceAudioUpload,
  TrackAssetAction,
  TrackAssetJob,
} from './types.js';

const finite = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`${field} must be a finite number`);
  return parsed;
};

const boundedText = (value: unknown, field: string, maximum: number, required = false): string => {
  if (typeof value !== 'string') {
    if (required) throw new ValidationError(`${field} is required`);
    return '';
  }
  const normalized = value.replace(/\0/g, '').trim();
  if (required && !normalized) throw new ValidationError(`${field} is required`);
  if (normalized.length > maximum) throw new ValidationError(`${field} must be at most ${maximum} characters`);
  return normalized;
};

const optionalText = (value: unknown, field: string): string => {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  return value.replace(/\0/g, '').trim();
};

const booleanField = (value: unknown, field: string, fallback?: boolean): boolean => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw new ValidationError(`${field} must be boolean`);
  return value;
};

const safeError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s"']+/gi, '[signed-url-redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 900) || 'operation failed';
};

const providerIdempotencyKey = (intentKey: string, phase: string): string =>
  `mf-${createHash('sha256').update(`${phase}\0${intentKey}`).digest('hex').slice(0, 48)}`;

const inheritedRequest = (source: PlatformTrack, title = source.title): GenerateRequest => ({
  mode: source.mode,
  title,
  description: source.description,
  style: source.style,
  lyrics: source.lyrics,
  instrumental: source.instrumental,
  model: source.model,
  negativeTags: source.negativeTags,
  vocalGender: source.vocalGender,
  styleWeight: source.styleWeight,
  weirdness: source.weirdness,
});

const optionalAudioWeight = (
  body: Record<string, unknown>,
  profile: MusicModelProfile,
): number | null => {
  const supported = Boolean(profile.capabilities.styleWeight && profile.capabilities.weirdness);
  if (!supported) {
    if (body.audioWeight !== undefined) {
      throw new ValidationError('audioWeight is not supported by the selected model');
    }
    return null;
  }
  const value = finite(body.audioWeight ?? 0.5, 'audioWeight');
  if (value < 0 || value > 1) throw new ValidationError('audioWeight must be between 0 and 1');
  return value;
};

export interface UploadedAudioFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export class SunoActionsService {
  constructor(
    private readonly config: PlatformConfig,
    private readonly repository: PlatformRepository,
    private readonly modelCross: ModelCrossClient,
    private readonly suno: SunoClient,
    private readonly storage: ObjectStorage,
    private readonly queue: PlatformQueue,
    private readonly events: PlatformEventBus,
  ) {}

  isDerivedTrackAction(rawBody: unknown): boolean {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return false;
    return ['upload_extend', 'whole_song', 'crop', 'speed']
      .includes(String((rawBody as Record<string, unknown>).action ?? ''));
  }

  async uploadReference(
    session: AuthenticatedSession,
    file: UploadedAudioFile | undefined,
    fields: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<{ upload: ReferenceAudioUpload; replay: boolean }> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    if (!file) throw new ValidationError('one audio file is required');
    const copyrightConfirmed = fields.copyrightConfirmed === 'true' || fields.copyrightConfirmed === true;
    if (!copyrightConfirmed) throw new ValidationError('copyrightConfirmed=true is required');
    const copyrightAudio = fields.copyrightAudio === 'true' || fields.copyrightAudio === true
      ? true
      : fields.copyrightAudio === undefined || fields.copyrightAudio === 'false' || fields.copyrightAudio === false
        ? false
        : (() => { throw new ValidationError('copyrightAudio must be true or false'); })();
    const validated = await validateAudioUploadFile({
      filePath: file.path,
      originalFilename: file.originalname,
      declaredMimeType: file.mimetype,
      byteSize: file.size,
    });
    const id = randomUUID();
    const objectKey = `users/${ownerStoragePrefix(session.user.subject)}/reference-audio/${id}/original${validated.extension}`;
    const registered = await this.repository.registerReferenceAudioUpload({
      id,
      ownerSubject: session.user.subject,
      objectKey,
      originalFilename: validated.originalFilename,
      mimeType: validated.mimeType,
      byteSize: validated.byteSize,
      durationSeconds: validated.durationSeconds,
      checksumSha256: validated.checksumSha256,
      copyrightConfirmed,
      copyrightAudio,
      idempotencyKey,
      maxTotalBytes: this.config.limits.maxReferenceAudioBytesPerUser,
    });
    if (registered.replay && registered.upload.status === 'ready') return registered;
    try {
      const stored = await this.storage.putFile(
        registered.upload.objectKey,
        file.path,
        validated.mimeType,
      );
      if (stored.byteSize !== validated.byteSize || stored.checksumSha256 !== validated.checksumSha256) {
        throw new Error('stored audio checksum or byte size mismatch');
      }
      return {
        upload: await this.repository.finishReferenceAudioUpload(
          session.user.subject,
          registered.upload.id,
          'ready',
        ),
        replay: registered.replay,
      };
    } catch (error) {
      await this.storage.delete(registered.upload.objectKey).catch(() => undefined);
      await this.repository.finishReferenceAudioUpload(
        session.user.subject,
        registered.upload.id,
        'failed',
        safeError(error),
      ).catch(() => undefined);
      throw error;
    }
  }

  async deleteReference(session: AuthenticatedSession, id: string): Promise<void> {
    if (!await this.repository.deleteReferenceAudio(session.user.subject, id)) {
      throw new ResourceNotFoundError('reference audio not found');
    }
    await this.queue.add('storage.reconcile', {}, { jobId: `storage:reference:${id}` });
  }

  async referenceAction(
    session: AuthenticatedSession,
    referenceAudioId: string,
    rawBody: unknown,
    idempotencyKey: string,
  ): Promise<MusicSubmissionResult> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) throw new ValidationError('body must be an object');
    const body = rawBody as Record<string, unknown>;
    assertAllowedFields(body, [
      'action', 'projectId', 'model', 'mode', 'title', 'description', 'style', 'lyrics',
      'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
      'continueAt', 'audioWeight',
    ], 'reference audio action');
    if (body.action !== 'upload' && body.action !== 'upload_extend') {
      throw new ValidationError('action must be upload or upload_extend');
    }
    const upload = await this.repository.getReferenceAudio(session.user.subject, referenceAudioId);
    if (!upload || upload.status !== 'ready') throw new ResourceNotFoundError('ready reference audio not found');
    if (body.action === 'upload_extend' && upload.durationSeconds <= 0) {
      throw new ResourceStateConflictError('reference audio has no trusted duration and must be uploaded again');
    }
    if (!(this.storage.providerAccessible ? await this.storage.providerAccessible() : this.config.storage.providerUploadUrlsReachable)) {
      throw new ResourceStateConflictError('reference audio Provider actions require a Provider-reachable signed S3 URL');
    }
    const signedUrl = await this.storage.signedGetUrl(upload.objectKey, { expiresIn: Math.min(3600, Math.max(1800, this.config.storage.signedUrlTtlSeconds)) });
    if (!signedUrl) {
      throw new ResourceStateConflictError('reference audio Provider actions require reachable private storage with signed GET URLs');
    }

    const modelId = typeof body.model === 'string' && body.model ? body.model : 'chirp-bluejay';
    const profile = await this.repository.getModelProfile(modelId);
    if (!profile) throw new ValidationError('selected music model is unavailable');
    await requireAuthorizedMusicModel(this.config, this.modelCross, session, profile.id);
    const action = body.action;
    const definition = musicOperationDefinition(action, upload.copyrightAudio);
    const catalog = await requireMusicOperation(this.config, this.modelCross, this.suno, session, definition);
    const generationBody = Object.fromEntries(
      Object.entries(body).filter(([key]) => !['action', 'projectId', 'continueAt', 'audioWeight'].includes(key)),
    );
    const request: GenerateRequest = action === 'upload'
      ? {
        mode: 'simple',
        title: boundedText(body.title, 'title', profile.capabilities.maxTitle)
          || upload.originalFilename.replace(/\.[^.]+$/, '').slice(0, profile.capabilities.maxTitle),
        description: 'Imported private reference audio',
        style: '', lyrics: '', instrumental: true, model: profile.id, negativeTags: '', vocalGender: 'auto',
        styleWeight: profile.capabilities.styleWeight?.default ?? 0.5,
        weirdness: profile.capabilities.weirdness?.default ?? 0.5,
      }
      : validateGenerateForProfile(generationBody, profile);
    if (!profile.capabilities.operations.includes(action)) {
      throw new ValidationError('selected model does not support this operation');
    }
    const continueAt = action === 'upload_extend' ? finite(body.continueAt ?? 0, 'continueAt') : 0;
    if (continueAt < 0 || continueAt > upload.durationSeconds) {
      throw new ValidationError('continueAt must be within the uploaded audio duration');
    }
    const audioWeight = action === 'upload_extend' ? optionalAudioWeight(body, profile) : null;

    const created = await this.repository.createGenerationIntent({
      ownerSubject: session.user.subject,
      projectId: typeof body.projectId === 'string' && body.projectId ? body.projectId : null,
      operation: action,
      sourceTrackId: null,
      referenceAudioId,
      modelProfileId: profile.id,
      idempotencyKey,
      request,
      submissionOptions: action === 'upload_extend'
        ? { continueAt, ...(audioWeight === null ? {} : { audioWeight }) }
        : {},
      estimatedCredits: catalog.estimatedCredits ?? definition.fallbackCredits,
      priceVersion: catalog.priceVersion ?? 'unavailable',
      maxConcurrent: this.config.limits.maxConcurrentGenerations,
    });
    const replay = await this.replayGeneration(created.intent, created.replay);
    if (replay) return replay;
    if (action === 'upload') {
      return this.submitGenerationIntent({
        session, intent: created.intent, definition, catalog, request, expectedTaskCount: 1,
        submit: async (credential) => [await this.suno.forCredential(credential).uploadAudio(
          signedUrl,
          upload.copyrightAudio,
          providerIdempotencyKey(idempotencyKey, 'upload'),
        )],
        replay: created.replay,
      });
    }
    return this.submitUploadExtendPipeline({
      session, intent: created.intent, definition, catalog, request, upload,
      signedUrl, continueAt, audioWeight, replay: created.replay,
    });
  }

  async trackAction(
    session: AuthenticatedSession,
    sourceTrackId: string,
    rawBody: unknown,
    idempotencyKey: string,
  ): Promise<MusicSubmissionResult> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) throw new ValidationError('body must be an object');
    const body = rawBody as Record<string, unknown>;
    const action = String(body.action ?? '') as StableMusicAction;
    assertAllowedFields(body, [
      'action', 'projectId', 'model', 'mode', 'title', 'description', 'style', 'lyrics',
      'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
      'continueAt', 'audioWeight', 'startSeconds', 'endSeconds', 'multiplier',
      'keepPitch',
    ], 'derived track action');
    if (!['upload_extend', 'whole_song', 'crop', 'speed'].includes(action)) {
      throw new ValidationError('unsupported derived track action');
    }
    const source = await this.repository.getTrack(session.user.subject, sourceTrackId);
    if (!source) throw new ResourceNotFoundError('track not found');
    if (source.status !== 'done' || !source.customId) {
      throw new ResourceStateConflictError('source track must be complete and have a Provider clip id');
    }
    const profile = await this.repository.getModelProfile(
      typeof body.model === 'string' && body.model ? body.model : source.model,
    );
    if (!profile || !profile.capabilities.operations.includes(action as MusicOperation)) {
      throw new ValidationError('selected model does not support this operation');
    }
    await requireAuthorizedMusicModel(this.config, this.modelCross, session, profile.id);
    let copyrightAudio = false;
    let referenceUpload: ReferenceAudioUpload | null = null;
    if (action === 'upload_extend') {
      if (source.operation !== 'upload') throw new ResourceStateConflictError('upload_extend requires an imported reference-audio Track');
      const generation = await this.repository.getGeneration(session.user.subject, source.generationId);
      if (!generation?.referenceAudioId) throw new ResourceStateConflictError('source Track has no durable reference-audio record');
      const upload = await this.repository.getReferenceAudio(session.user.subject, generation.referenceAudioId);
      if (!upload) throw new ResourceStateConflictError('source reference audio is no longer available');
      if (upload.durationSeconds <= 0) {
        throw new ResourceStateConflictError('source reference audio has no trusted duration and must be uploaded again');
      }
      referenceUpload = upload;
      copyrightAudio = upload.copyrightAudio;
    }
    const definition = musicOperationDefinition(action, copyrightAudio);
    const catalog = await requireMusicOperation(this.config, this.modelCross, this.suno, session, definition);
    let request = inheritedRequest(source);
    let submit: (credential: string) => Promise<string[]>;
    let expectedTaskCount: 1 | 2 = 1;
    let submissionOptions: Record<string, unknown> = {};
    if (action === 'upload_extend') {
      const generationBody = Object.fromEntries(
        Object.entries(body).filter(([key]) => !['action', 'projectId', 'continueAt', 'audioWeight'].includes(key)),
      );
      request = validateGenerateForProfile(generationBody, profile);
      const continueAt = finite(body.continueAt ?? source.duration, 'continueAt');
      if (continueAt < 0 || !referenceUpload || continueAt > referenceUpload.durationSeconds) {
        throw new ValidationError('continueAt must be within the uploaded audio duration');
      }
      const audioWeight = optionalAudioWeight(body, profile);
      expectedTaskCount = 2;
      submissionOptions = { continueAt, ...(audioWeight === null ? {} : { audioWeight }) };
      submit = (credential) => this.suno.forCredential(credential).generate(request, {
        operation: 'upload_extend', clipId: source.customId!, continueAt,
        ...(audioWeight === null ? {} : { audioWeight }),
        idempotencyKey: providerIdempotencyKey(idempotencyKey, 'upload-extend'),
      });
    } else if (action === 'whole_song') {
      submit = async (credential) => [await this.suno.forCredential(credential).wholeSong(
        source.customId!, providerIdempotencyKey(idempotencyKey, 'whole-song'),
      )];
    } else if (action === 'crop') {
      const start = finite(body.startSeconds, 'startSeconds');
      const end = finite(body.endSeconds, 'endSeconds');
      if (start < 0 || end <= start) throw new ValidationError('crop requires 0 <= startSeconds < endSeconds');
      if (source.duration > 0 && end > source.duration) throw new ValidationError('crop endSeconds exceeds source Track duration');
      submissionOptions = { startSeconds: start, endSeconds: end };
      submit = async (credential) => [await this.suno.forCredential(credential).crop(
        source.customId!, start, end, providerIdempotencyKey(idempotencyKey, 'crop'),
      )];
    } else {
      const multiplier = finite(body.multiplier, 'multiplier');
      if (!(SPEED_MULTIPLIERS as readonly number[]).includes(multiplier)) {
        throw new ValidationError(`multiplier must be one of ${SPEED_MULTIPLIERS.join(', ')}`);
      }
      const keepPitch = booleanField(body.keepPitch, 'keepPitch', true);
      const requestedTitle = optionalText(body.title, 'title');
      request = inheritedRequest(source, requestedTitle || source.title);
      submissionOptions = { multiplier, keepPitch, ...(requestedTitle ? { title: requestedTitle } : {}) };
      submit = async (credential) => [await this.suno.forCredential(credential).speed(source.customId!, multiplier as SunoSpeedMultiplier, {
        keepPitch,
        ...(requestedTitle ? { title: requestedTitle } : {}),
        idempotencyKey: providerIdempotencyKey(idempotencyKey, 'speed'),
      })];
    }
    const created = await this.repository.createGenerationIntent({
      ownerSubject: session.user.subject,
      projectId: source.projectId,
      operation: action as MusicOperation,
      sourceTrackId,
      modelProfileId: profile.id,
      idempotencyKey,
      request,
      submissionOptions,
      estimatedCredits: catalog.estimatedCredits ?? definition.fallbackCredits,
      priceVersion: catalog.priceVersion ?? 'unavailable',
      maxConcurrent: this.config.limits.maxConcurrentGenerations,
    });
    const replay = await this.replayGeneration(created.intent, created.replay);
    if (replay) return replay;
    return this.submitGenerationIntent({
      session, intent: created.intent, definition, catalog, request,
      expectedTaskCount, submit, replay: created.replay,
    });
  }

  async assetAction(
    session: AuthenticatedSession,
    trackId: string,
    rawBody: unknown,
    idempotencyKey: string,
  ): Promise<{ job: TrackAssetJob; replay: boolean }> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) throw new ValidationError('body must be an object');
    const body = rawBody as Record<string, unknown>;
    const action = String(body.action ?? '') as TrackAssetAction;
    assertAllowedFields(body, ['action', 'lyrics'], 'asset action');
    if (!['aligned_lyrics', 'video', 'convert_wav', 'download_mp3', 'download_m4a'].includes(action)) {
      throw new ValidationError('asset action must be aligned_lyrics, video, or convert_wav');
    }
    const source = await this.repository.getTrack(session.user.subject, trackId);
    if (!source) throw new ResourceNotFoundError('track not found');
    if (source.status !== 'done' || !source.customId) {
      throw new ResourceStateConflictError('source track must be complete and have a Provider clip id');
    }
    await requireAuthorizedMusicModel(this.config, this.modelCross, session, source.model);
    if (action === 'video'
      && (!Number.isInteger(source.providerRecordId) || (source.providerRecordId ?? 0) <= 0)) {
      throw new ResourceStateConflictError(`${action} requires a persisted numeric Provider record id; this historical Track cannot use the action`);
    }
    const request: Record<string, unknown> = action === 'aligned_lyrics'
      ? { lyrics: boundedText(body.lyrics, 'lyrics', 5000, true) }
      : {};
    const definition = musicOperationDefinition(action);
    const catalog = await requireMusicOperation(this.config, this.modelCross, this.suno, session, definition);
    const created = await this.repository.createTrackAssetJob({
      id: randomUUID(), ownerSubject: session.user.subject, trackId, action,
      operationCode: definition.operationCode, idempotencyKey, request,
      estimatedCredits: catalog.estimatedCredits ?? definition.fallbackCredits,
      maxConcurrent: Math.max(2, this.config.limits.maxConcurrentGenerations * 2),
    });
    if (created.replay && !['draft', 'submitting'].includes(created.job.status)) return created;
    const job = await this.submitAssetJob({
      session, source, job: created.job, definition, catalog, request,
    });
    return { job, replay: created.replay };
  }

  private async replayGeneration(intent: GenerationIntent, replay: boolean): Promise<MusicSubmissionResult | null> {
    if (!replay) return null;
    const tracks = await this.repository.tracksForGeneration(intent.ownerSubject, intent.id);
    if (tracks.length || !['draft', 'submitting'].includes(intent.status)) {
      return { generation: intent, tracks, replay: true, pending: tracks.length === 0 };
    }
    return null;
  }

  private async billingReservation(
    session: AuthenticatedSession,
    resource: { id: string; idempotencyKey: string; modelId: string },
    definition: MusicOperationDefinition,
    catalog: MusicOperationCatalogItem,
    persistCredential: (ciphertext: string) => Promise<void>,
    persistReservation: (reservation: Awaited<ReturnType<ModelCrossClient['reserve']>>) => Promise<void>,
  ) {
    const expectedItems = musicOperationBillingItemCount(definition);
    const quote = this.config.modelCross.billingLive
      ? await this.modelCross.quote(session.accessToken, {
        operationCode: definition.operationCode,
        expectedItems,
        priceVersion: catalog.priceVersion ?? undefined,
        fallbackCredits: definition.fallbackCredits,
      })
      : {
        operationCode: definition.operationCode,
        priceVersion: catalog.priceVersion ?? 'museflow-development-preview-v1',
        estimatedCredits: catalog.estimatedCredits ?? definition.fallbackCredits,
        currency: 'credits' as const,
        partialSuccessPolicy: expectedItems === 2 ? 'per_take' as const : 'full_pair' as const,
      };
    let credential = session.accessToken;
    if (this.config.modelCross.billingLive) {
      credential = await this.modelCross.taskToken(session.accessToken, {
        credentialId: resource.id,
        resourceId: resource.id,
        allowedOperations: [definition.operationCode, 'music_task_read'],
        allowedModels: [resource.modelId],
        maxCost: Math.max(quote.estimatedCredits, 1),
        idempotencyKey: resource.idempotencyKey,
      });
      await persistCredential(encryptSecret(credential, this.config.sessionSecret));
    }
    const reservation = await this.modelCross.reserve(credential, {
      operationCode: definition.operationCode,
      resourceId: resource.id,
      priceVersion: quote.priceVersion,
      idempotencyKey: resource.idempotencyKey,
      expectedItems,
    }, quote.estimatedCredits);
    await persistReservation(reservation);
    return { credential, reservation };
  }

  private async submitGenerationIntent(input: {
    session: AuthenticatedSession;
    intent: GenerationIntent;
    definition: MusicOperationDefinition;
    catalog: MusicOperationCatalogItem;
    request: GenerateRequest;
    expectedTaskCount: 1 | 2;
    submit: (credential: string) => Promise<string[]>;
    replay: boolean;
  }): Promise<MusicSubmissionResult> {
    let credential = input.session.accessToken;
    let reservation: Awaited<ReturnType<ModelCrossClient['reserve']>> | null = null;
    let providerSubmissionClaimed = false;
    let tracks: PlatformTrack[] = [];
    try {
      const prepared = await this.billingReservation(
        input.session,
        { id: input.intent.id, idempotencyKey: input.intent.idempotencyKey, modelId: input.intent.modelProfileId },
        input.definition,
        input.catalog,
        (ciphertext) => this.repository.setGenerationCredential(input.session.user.subject, input.intent.id, ciphertext),
        (accepted) => this.repository.setGenerationReservation(
          input.session.user.subject, input.intent.id, accepted.operationId, accepted.reservationId,
          accepted.operationCode, accepted.priceVersion, accepted.estimatedCredits, accepted.status,
        ),
      );
      credential = prepared.credential;
      reservation = prepared.reservation;
      const claim = await this.repository.claimGenerationProviderSubmission(
        input.session.user.subject,
        input.intent.id,
      );
      if (claim !== 'claimed') return this.currentGenerationSubmission(input.intent, true);
      providerSubmissionClaimed = true;
      const taskIds = await input.submit(credential);
      tracks = await this.repository.acceptGeneration(
        input.intent.id, input.session.user.subject, taskIds, input.expectedTaskCount,
      );
    } catch (error) {
      const outcome = await this.handleGenerationSubmissionFailure({
        session: input.session, intent: input.intent, credential, reservation,
        error, providerSubmissionClaimed,
      });
      if (outcome === 'accepted') {
        await this.scheduleGeneration(input.intent.id);
        return this.currentGenerationSubmission(input.intent, input.replay);
      }
      throw error;
    }
    await this.scheduleGeneration(input.intent.id);
    const generation = await this.repository.getGeneration(input.session.user.subject, input.intent.id)
      ?? { ...input.intent, status: 'queued', billingStatus: reservation!.status };
    return { generation, tracks, replay: input.replay, pending: false };
  }

  private async submitUploadExtendPipeline(input: {
    session: AuthenticatedSession;
    intent: GenerationIntent;
    definition: MusicOperationDefinition;
    catalog: MusicOperationCatalogItem;
    request: GenerateRequest;
    upload: ReferenceAudioUpload;
    signedUrl: string;
    continueAt: number;
    audioWeight: number | null;
    replay: boolean;
  }): Promise<MusicSubmissionResult> {
    let credential = input.session.accessToken;
    let reservation: Awaited<ReturnType<ModelCrossClient['reserve']>> | null = null;
    let providerSubmissionClaimed = false;
    try {
      const prepared = await this.billingReservation(
        input.session,
        { id: input.intent.id, idempotencyKey: input.intent.idempotencyKey, modelId: input.intent.modelProfileId },
        input.definition,
        input.catalog,
        (ciphertext) => this.repository.setGenerationCredential(input.session.user.subject, input.intent.id, ciphertext),
        (accepted) => this.repository.setGenerationReservation(
          input.session.user.subject, input.intent.id, accepted.operationId, accepted.reservationId,
          accepted.operationCode, accepted.priceVersion, accepted.estimatedCredits, accepted.status,
        ),
      );
      credential = prepared.credential;
      reservation = prepared.reservation;
      const claim = await this.repository.claimGenerationProviderSubmission(
        input.session.user.subject,
        input.intent.id,
      );
      if (claim !== 'claimed') return this.currentGenerationSubmission(input.intent, true);
      providerSubmissionClaimed = true;
      const uploadTaskId = await this.suno.forCredential(credential).uploadAudio(
        input.signedUrl,
        input.upload.copyrightAudio,
        providerIdempotencyKey(input.intent.idempotencyKey, 'pipeline-upload'),
      );
      await this.repository.acceptUploadExtendStage(
        input.intent.id, input.session.user.subject, input.upload.id, uploadTaskId,
        input.continueAt, input.audioWeight,
      );
    } catch (error) {
      const outcome = await this.handleGenerationSubmissionFailure({
        session: input.session, intent: input.intent, credential, reservation,
        error, providerSubmissionClaimed,
      });
      if (outcome === 'accepted') {
        await this.scheduleGeneration(input.intent.id);
        return this.currentGenerationSubmission(input.intent, input.replay);
      }
      throw error;
    }
    await this.scheduleGeneration(input.intent.id);
    const generation = await this.repository.getGeneration(input.session.user.subject, input.intent.id)
      ?? { ...input.intent, status: 'queued', billingStatus: reservation!.status };
    return { generation, tracks: [], replay: input.replay, pending: true };
  }

  private async handleGenerationSubmissionFailure(input: {
    session: AuthenticatedSession;
    intent: GenerationIntent;
    credential: string;
    reservation: Awaited<ReturnType<ModelCrossClient['reserve']>> | null;
    error: unknown;
    providerSubmissionClaimed: boolean;
  }): Promise<'accepted' | 'failed'> {
    const message = safeError(input.error);
    const definiteProviderRejection = input.error instanceof SunoError
      && input.error.status !== null
      && input.error.status >= 400
      && input.error.status < 500
      && ![409, 429].includes(input.error.status);
    if (input.providerSubmissionClaimed) {
      const submissionState = definiteProviderRejection
        ? await this.repository.markGenerationProviderSubmissionRejected(
          input.session.user.subject, input.intent.id, message,
        )
        : await this.repository.markGenerationProviderSubmissionUncertain(
          input.session.user.subject, input.intent.id,
          `${message}; Provider submission outcome requires review`,
        );
      if (submissionState === 'accepted') return 'accepted';
      if (submissionState !== 'rejected') {
        await this.events.publish({
          type: 'generation.failed', subject: input.session.user.subject, resourceId: input.intent.id,
          payload: { generationId: input.intent.id, error: 'submission outcome requires review' },
        }).catch(() => undefined);
        return 'failed';
      }
    }
    if (input.reservation) {
      try {
        await this.modelCross.settle(input.credential, 'release', {
          operation_id: input.reservation.operationId,
          reservation_id: input.reservation.reservationId,
          resource_id: input.intent.id,
          reason: 'provider_rejected_submission',
        }, input.intent.idempotencyKey);
        await this.repository.failGeneration(
          input.session.user.subject, input.intent.id, message,
          this.config.modelCross.billingLive ? 'released' : 'disabled',
        );
      } catch (releaseError) {
        await this.repository.failGeneration(
          input.session.user.subject, input.intent.id,
          `${message}; release pending: ${safeError(releaseError)}`,
          'reconcile_required',
        );
      }
    } else {
      const state = await this.repository.generationCredential(input.intent.id);
      await this.repository.failGeneration(
        input.session.user.subject, input.intent.id, message,
        this.config.modelCross.billingLive && Boolean(state?.ciphertext) ? 'reconcile_required' : 'not_reserved',
      );
    }
    await this.events.publish({
      type: 'generation.failed', subject: input.session.user.subject, resourceId: input.intent.id,
      payload: { generationId: input.intent.id, error: 'submission failed' },
    }).catch(() => undefined);
    return 'failed';
  }

  private async currentGenerationSubmission(
    intent: GenerationIntent,
    replay: boolean,
  ): Promise<MusicSubmissionResult> {
    const tracks = await this.repository.tracksForGeneration(intent.ownerSubject, intent.id);
    const generation = await this.repository.getGeneration(intent.ownerSubject, intent.id) ?? intent;
    return { generation, tracks, replay, pending: tracks.length === 0 };
  }

  private async scheduleGeneration(generationId: string): Promise<void> {
    await Promise.allSettled([
      Promise.resolve().then(() => this.queue.add('music.poll', { generationId }, { jobId: `poll:${generationId}` })),
      Promise.resolve().then(() => this.queue.add('outbox.dispatch', {}, { jobId: `outbox:submit:${generationId}` })),
    ]);
  }

  private async submitAssetJob(input: {
    session: AuthenticatedSession;
    source: PlatformTrack;
    job: TrackAssetJob;
    definition: MusicOperationDefinition;
    catalog: MusicOperationCatalogItem;
    request: Record<string, unknown>;
  }): Promise<TrackAssetJob> {
    let credential = input.session.accessToken;
    let reservation: Awaited<ReturnType<ModelCrossClient['reserve']>> | null = null;
    let providerSubmissionClaimed = false;
    try {
      const prepared = await this.billingReservation(
        input.session,
        { id: input.job.id, idempotencyKey: input.job.idempotencyKey, modelId: input.source.model },
        input.definition,
        input.catalog,
        (ciphertext) => this.repository.setTrackAssetJobCredential(input.session.user.subject, input.job.id, ciphertext),
        (accepted) => this.repository.setTrackAssetJobReservation({
          id: input.job.id, ownerSubject: input.session.user.subject,
          operationId: accepted.operationId, reservationId: accepted.reservationId,
          operationCode: accepted.operationCode, priceVersion: accepted.priceVersion,
          reservedCredits: accepted.estimatedCredits, status: accepted.status,
        }),
      );
      credential = prepared.credential;
      reservation = prepared.reservation;
      const claim = await this.repository.claimTrackAssetProviderSubmission(
        input.session.user.subject,
        input.job.id,
      );
      if (claim !== 'claimed') {
        return await this.repository.getTrackAssetJob(input.session.user.subject, input.job.id) ?? input.job;
      }
      providerSubmissionClaimed = true;
      const providerKey = providerIdempotencyKey(input.job.id, input.job.action);
      const provider = this.suno.forCredential(credential);
      const taskId = input.job.action === 'aligned_lyrics'
        ? await provider.alignedLyrics(String(input.request.lyrics), input.source.customId!, providerKey)
        : input.job.action === 'video'
          ? await provider.musicVideo(input.source.providerRecordId!, input.source.customId!, providerKey)
          : input.job.action === 'download_mp3' || input.job.action === 'download_m4a'
            ? await provider.downloadAudio(input.job.action === 'download_mp3' ? 'mp3' : 'm4a', input.source.customId!, providerKey)
          : await provider.downloadAudio('wav', input.source.customId!, providerKey);
      const accepted = await this.repository.acceptTrackAssetJob(input.session.user.subject, input.job.id, taskId);
      await Promise.allSettled([
        this.queue.add('music.poll', { assetJobId: input.job.id }, { jobId: `asset-poll:${input.job.id}` }),
        this.queue.add('outbox.dispatch', {}, { jobId: `outbox:asset:${input.job.id}` }),
      ]);
      await this.events.publish({
        type: 'track.asset.queued', subject: input.session.user.subject, resourceId: input.job.id,
        payload: { jobId: input.job.id, trackId: input.source.id, action: input.job.action },
      }).catch(() => undefined);
      return accepted;
    } catch (error) {
      const message = safeError(error);
      const definiteProviderRejection = error instanceof SunoError && error.status !== null
        && error.status >= 400 && error.status < 500 && ![409, 429].includes(error.status);
      if (providerSubmissionClaimed) {
        const submissionState = definiteProviderRejection
          ? await this.repository.markTrackAssetProviderSubmissionRejected(
            input.session.user.subject, input.job.id, message,
          )
          : await this.repository.markTrackAssetProviderSubmissionUncertain(
            input.session.user.subject, input.job.id,
            `${message}; Provider submission outcome requires review`,
          );
        if (submissionState === 'accepted') {
          const accepted = await this.repository.getTrackAssetJob(input.session.user.subject, input.job.id);
          if (!accepted) throw new ResourceNotFoundError('durably accepted track asset job not found');
          await Promise.allSettled([
            this.queue.add('music.poll', { assetJobId: input.job.id }, { jobId: `asset-poll:${input.job.id}` }),
            this.queue.add('outbox.dispatch', {}, { jobId: `outbox:asset:${input.job.id}` }),
          ]);
          return accepted;
        }
        if (submissionState !== 'rejected') throw error;
      }
      if (reservation) {
        try {
          await this.modelCross.settle(credential, 'release', {
            operation_id: reservation.operationId,
            reservation_id: reservation.reservationId,
            resource_id: input.job.id,
          }, input.job.idempotencyKey);
          await this.repository.failTrackAssetJob(
            input.session.user.subject, input.job.id, message,
            this.config.modelCross.billingLive ? 'released' : 'disabled',
          );
        } catch (releaseError) {
          await this.repository.failTrackAssetJob(
            input.session.user.subject, input.job.id,
            `${message}; release pending: ${safeError(releaseError)}`, 'reconcile_required',
          );
        }
      } else {
        const state = await this.repository.trackAssetJobCredential(input.job.id);
        await this.repository.failTrackAssetJob(
          input.session.user.subject, input.job.id, message,
          this.config.modelCross.billingLive && Boolean(state?.ciphertext) ? 'reconcile_required' : 'not_reserved',
        );
      }
      throw error;
    }
  }
}
