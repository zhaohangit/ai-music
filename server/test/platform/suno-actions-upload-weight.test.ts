import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import { SunoActionsService } from '../../src/platform/suno-actions-service.js';
import type { SunoClient } from '../../src/suno.js';
import type { AuthenticatedSession, GenerationIntent, ReferenceAudioUpload } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const session: AuthenticatedSession = {
  tokenHash: 'legacy-upload-session',
  user: platformUser('legacy-upload-owner'),
  clientId: 'museflow-test',
  accessToken: 'legacy-upload-access-token',
  refreshToken: 'legacy-upload-refresh-token',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
};

const upload: ReferenceAudioUpload = {
  id: 'reference-upload',
  ownerSubject: session.user.subject,
  objectKey: 'users/test/reference-upload/original.mp3',
  originalFilename: 'legacy-reference.mp3',
  mimeType: 'audio/mpeg',
  byteSize: 1024,
  durationSeconds: 90,
  checksumSha256: 'a'.repeat(64),
  copyrightConfirmed: true,
  copyrightAudio: false,
  status: 'ready',
  error: null,
  createdAt: '2026-08-25T00:00:00.000Z',
};

describe('SunoActionsService conditional upload_extend audio weight', () => {
  it('persists NULL and omits audioWeight for a legacy model, while rejecting a forged weight', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-v4')!;
    let intent: GenerationIntent;
    const createGenerationIntent = vi.fn(async (input: Parameters<PlatformRepository['createGenerationIntent']>[0]) => {
      intent = {
        id: 'legacy-upload-generation', ownerSubject: input.ownerSubject, projectId: input.projectId,
        operation: input.operation, sourceTrackId: input.sourceTrackId,
        referenceAudioId: input.referenceAudioId, modelProfileId: input.modelProfileId,
        status: 'draft', idempotencyKey: input.idempotencyKey, request: input.request,
        priceVersion: input.priceVersion, estimatedCredits: input.estimatedCredits,
        billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
        createdAt: new Date().toISOString(),
      };
      return { intent, replay: false };
    });
    const repository = {
      getReferenceAudio: vi.fn(async () => upload),
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent,
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptUploadExtendStage: vi.fn(async () => undefined),
      getGeneration: vi.fn(async () => ({ ...intent!, status: 'queued', billingStatus: 'disabled' })),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'upload_extend', operationCode: 'upload_extend_pair', available: true,
        estimatedCredits: 20, priceVersion: 'upload-preview-v1', chargingEnabled: false, preview: true,
      }]),
      reserve: vi.fn(async () => ({
        operationId: 'disabled-upload', reservationId: 'disabled-upload', operationCode: 'upload_extend_pair',
        priceVersion: 'upload-preview-v1', estimatedCredits: 20, currency: 'credits',
        partialSuccessPolicy: 'per_take', status: 'disabled',
      })),
    };
    const uploadAudio = vi.fn(async () => 'provider-upload-task');
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39999',
      uploadAudio,
      forCredential: vi.fn(() => ({ uploadAudio })),
    };
    const storage = {
      signedGetUrl: vi.fn(async () => 'https://private-storage.example.test/reference.mp3?X-Amz-Signature=test'),
    };
    const queue = { add: vi.fn(async () => undefined) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new SunoActionsService(
      testConfig({
        ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true',
        STORAGE_DRIVER: 's3',
        S3_ENDPOINT: 'https://private-storage.example.test',
        S3_ACCESS_KEY_ID: 'unit-test-access-key',
        S3_SECRET_ACCESS_KEY: 'unit-test-secret-key',
        PROVIDER_UPLOAD_URLS_REACHABLE: 'true',
      }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      storage as unknown as ObjectStorage,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );
    const request = {
      action: 'upload_extend', model: profile.id, mode: 'simple', title: 'Legacy continuation',
      description: 'continue the reference', style: '', lyrics: '', instrumental: false,
      negativeTags: '', vocalGender: 'auto', styleWeight: 0.5, weirdness: 0.5,
      continueAt: 12,
    };

    const result = await service.referenceAction(session, upload.id, request, 'legacy-upload-without-weight');

    expect(result).toMatchObject({ pending: true, tracks: [] });
    expect(createGenerationIntent).toHaveBeenCalledWith(expect.objectContaining({
      modelProfileId: profile.id,
      submissionOptions: { continueAt: 12 },
    }));
    expect(repository.acceptUploadExtendStage).toHaveBeenCalledWith(
      'legacy-upload-generation', session.user.subject, upload.id, 'provider-upload-task', 12, null,
    );

    await expect(service.referenceAction(session, upload.id, {
      ...request,
      audioWeight: 0.5,
    }, 'legacy-upload-forged-weight')).rejects.toThrow('audioWeight is not supported by the selected model');
    expect(suno.uploadAudio).toHaveBeenCalledTimes(1);
  });
});
