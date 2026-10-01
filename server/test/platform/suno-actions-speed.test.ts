import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import type { ObjectStorage } from '../../src/platform/object-storage.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import { SunoActionsService } from '../../src/platform/suno-actions-service.js';
import type { SunoClient } from '../../src/suno.js';
import type { AuthenticatedSession, GenerationIntent, PlatformTrack } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const session: AuthenticatedSession = {
  tokenHash: 'speed-session',
  user: platformUser('speed-owner'),
  clientId: 'museflow-test',
  accessToken: 'speed-access-token',
  refreshToken: 'speed-refresh-token',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
};

const source = {
  id: 'source-track', generationId: 'source-generation', groupId: 'source-generation', projectId: null,
  takeIndex: 0, title: 'Original title', mode: 'custom', operation: 'generate',
  description: '', style: 'Dream Pop', lyrics: '[Verse]\nSource lyrics', instrumental: false,
  model: 'chirp-bluejay', negativeTags: '', vocalGender: 'auto', styleWeight: 0.65, weirdness: 0.5,
  status: 'done', stage: 'done', progress: 1, eta: null, elapsed: null, error: null,
  file: null, coverFile: null, audioUrl: null, imageUrl: null, videoUrl: null,
  upstreamTaskId: 'source-task', customId: 'source-clip', providerRecordId: 101,
  duration: 120, format: 'mp3', pointsCost: 999, pointsRefunded: true, upstreamStatus: 'completed',
  createdAt: '2026-08-25T00:00:00.000Z', finishedAt: '2026-08-25T00:01:00.000Z',
  copyrightAudio: null, referenceAudioAvailable: false, referenceAudioDurationSeconds: null,
  audioAssetReady: true, coverAssetReady: true, billingStatus: 'captured', estimatedCredits: 20,
  settledCredits: 10,
} as PlatformTrack;

describe('SunoActionsService derived-operation contracts', () => {
  it('trims Speed titles, omits blank titles, and accepts titles longer than 100 characters', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === source.model)!;
    let intent: GenerationIntent;
    const createGenerationIntent = vi.fn(async (input: Parameters<PlatformRepository['createGenerationIntent']>[0]) => {
      intent = {
        id: 'speed-generation', ownerSubject: input.ownerSubject, projectId: input.projectId,
        operation: input.operation, sourceTrackId: input.sourceTrackId, modelProfileId: input.modelProfileId,
        status: 'draft', idempotencyKey: input.idempotencyKey, request: input.request,
        priceVersion: input.priceVersion, estimatedCredits: input.estimatedCredits,
        billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
        createdAt: new Date().toISOString(),
      };
      return { intent, replay: false };
    });
    const accepted = [{ ...source, id: 'speed-track', generationId: 'speed-generation', groupId: 'speed-generation', operation: 'speed' }] as PlatformTrack[];
    const repository = {
      getTrack: vi.fn(async () => source),
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent,
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptGeneration: vi.fn(async () => accepted),
      getGeneration: vi.fn(async () => ({ ...intent!, status: 'queued', billingStatus: 'disabled' })),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async (
        _token: string,
        requested: Array<{ action: string; operationCode: string; fallbackCredits: number }>,
      ) => requested.map((entry) => ({
        ...entry, available: true, estimatedCredits: entry.fallbackCredits,
        priceVersion: 'derived-preview-v1', chargingEnabled: false, preview: true,
      }))),
      reserve: vi.fn(async () => ({
        operationId: 'disabled-speed', reservationId: 'disabled-speed', operationCode: 'speed_single',
        priceVersion: 'speed-preview-v1', estimatedCredits: 4, currency: 'credits',
        partialSuccessPolicy: 'full_pair', status: 'disabled',
      })),
    };
    const speed = vi.fn(async () => 'speed-provider-task');
    const crop = vi.fn(async () => 'crop-provider-task');
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39999',
      speed,
      crop,
      forCredential: vi.fn(() => ({ speed, crop })),
    };
    const queue = { add: vi.fn(async () => undefined) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new SunoActionsService(
      testConfig({ ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true' }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      {} as ObjectStorage,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );

    const result = await service.trackAction(session, source.id, {
      action: 'speed', multiplier: 1, keepPitch: true, title: ' \t ',
    }, 'speed-optional-title');

    const longTitle = 'L'.repeat(101);
    const titledResult = await service.trackAction(session, source.id, {
      action: 'speed', multiplier: 1.25, keepPitch: false, title: `  ${longTitle}\n`,
    }, 'speed-long-title');

    expect(result).toMatchObject({ tracks: accepted, pending: false });
    expect(titledResult).toMatchObject({ tracks: accepted, pending: false });
    expect(createGenerationIntent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operation: 'speed',
      request: expect.objectContaining({ title: source.title }),
      submissionOptions: { multiplier: 1, keepPitch: true },
    }));
    expect(createGenerationIntent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operation: 'speed',
      request: expect.objectContaining({ title: longTitle }),
      submissionOptions: { multiplier: 1.25, keepPitch: false, title: longTitle },
    }));
    expect(modelCross.reserve).toHaveBeenCalledTimes(2);
    for (const call of modelCross.reserve.mock.calls) {
      expect(call).toEqual([
        session.accessToken,
        expect.objectContaining({ operationCode: 'speed_single', expectedItems: 1 }),
        4,
      ]);
    }
    expect(suno.speed).toHaveBeenNthCalledWith(1, source.customId, 1, {
      keepPitch: true,
      idempotencyKey: expect.stringMatching(/^mf-/),
    });
    expect((suno.speed as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).not.toHaveProperty('title');
    expect(suno.speed).toHaveBeenNthCalledWith(2, source.customId, 1.25, {
      keepPitch: false,
      title: longTitle,
      idempotencyKey: expect.stringMatching(/^mf-/),
    });
    await expect(service.trackAction(session, source.id, {
      action: 'speed', multiplier: 1, title: 123,
    }, 'speed-non-string-title')).rejects.toThrow(/title must be a string/);
    expect(suno.speed).toHaveBeenCalledTimes(2);
  });

  it('accepts a Crop whenever endSeconds is greater than startSeconds, without an extra 0.1-second delta', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === source.model)!;
    let intent: GenerationIntent;
    const createGenerationIntent = vi.fn(async (input: Parameters<PlatformRepository['createGenerationIntent']>[0]) => {
      intent = {
        id: 'crop-generation', ownerSubject: input.ownerSubject, projectId: input.projectId,
        operation: input.operation, sourceTrackId: input.sourceTrackId, modelProfileId: input.modelProfileId,
        status: 'draft', idempotencyKey: input.idempotencyKey, request: input.request,
        priceVersion: input.priceVersion, estimatedCredits: input.estimatedCredits,
        billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
        createdAt: new Date().toISOString(),
      };
      return { intent, replay: false };
    });
    const accepted = [{
      ...source, id: 'crop-track', generationId: 'crop-generation', groupId: 'crop-generation', operation: 'crop',
    }] as PlatformTrack[];
    const repository = {
      getTrack: vi.fn(async () => source),
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent,
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptGeneration: vi.fn(async () => accepted),
      getGeneration: vi.fn(async () => ({ ...intent!, status: 'queued', billingStatus: 'disabled' })),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'crop', operationCode: 'crop_single', available: true, estimatedCredits: 4,
        priceVersion: 'crop-preview-v1', chargingEnabled: false, preview: true,
      }]),
      reserve: vi.fn(async () => ({
        operationId: 'disabled-crop', reservationId: 'disabled-crop', operationCode: 'crop_single',
        priceVersion: 'crop-preview-v1', estimatedCredits: 4, currency: 'credits',
        partialSuccessPolicy: 'full_pair', status: 'disabled',
      })),
    };
    const crop = vi.fn(async () => 'crop-provider-task');
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39999',
      crop,
      forCredential: vi.fn(() => ({ crop })),
    };
    const service = new SunoActionsService(
      testConfig({ ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true' }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      {} as ObjectStorage,
      { add: vi.fn(async () => undefined) } as unknown as PlatformQueue,
      { publish: vi.fn(async () => undefined) } as unknown as PlatformEventBus,
    );

    const result = await service.trackAction(session, source.id, {
      action: 'crop', startSeconds: 10, endSeconds: 10.01,
    }, 'crop-small-positive-delta');

    expect(result).toMatchObject({ tracks: accepted, pending: false });
    expect(createGenerationIntent).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'crop',
      submissionOptions: { startSeconds: 10, endSeconds: 10.01 },
    }));
    expect(suno.crop).toHaveBeenCalledWith(
      source.customId, 10, 10.01, expect.stringMatching(/^mf-/),
    );
  });
});
