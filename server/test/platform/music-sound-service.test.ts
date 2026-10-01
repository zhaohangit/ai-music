import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicService } from '../../src/platform/music-service.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import type { SunoClient } from '../../src/suno.js';
import type { SoundGenerateRequest } from '../../src/types.js';
import type { AuthenticatedSession, GenerationIntent, PlatformTrack } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const session: AuthenticatedSession = {
  tokenHash: 'sound-session',
  user: platformUser('sound-owner'),
  clientId: 'museflow-test',
  accessToken: 'sound-access-token',
  refreshToken: 'sound-refresh-token',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
};

describe('sound submission service', () => {
  it('uses the dedicated ModelCross operation and Provider method for a two-output sound batch', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-crow')!;
    let intent: GenerationIntent;
    const createGenerationIntent = vi.fn(async (input: Parameters<PlatformRepository['createGenerationIntent']>[0]) => {
      intent = {
        id: 'sound-generation-1', ownerSubject: input.ownerSubject, projectId: input.projectId,
        operation: input.operation, sourceTrackId: input.sourceTrackId, modelProfileId: input.modelProfileId,
        status: 'draft', idempotencyKey: input.idempotencyKey, request: input.request,
        priceVersion: input.priceVersion, estimatedCredits: input.estimatedCredits,
        billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
        createdAt: new Date().toISOString(),
      };
      return { intent, replay: false };
    });
    const acceptedTracks = [
      { id: 'sound-track-a', generationId: 'sound-generation-1', operation: 'sound' },
      { id: 'sound-track-b', generationId: 'sound-generation-1', operation: 'sound' },
    ] as unknown as PlatformTrack[];
    const repository = {
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent,
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptGeneration: vi.fn(async () => acceptedTracks),
      getGeneration: vi.fn(async () => ({ ...intent!, status: 'queued', billingStatus: 'disabled' })),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'sound', operationCode: 'sound_pair', available: true, estimatedCredits: 20,
        priceVersion: 'sound-preview-v1', chargingEnabled: false, preview: true,
      }]),
      quote: vi.fn(async () => ({
        operationCode: 'sound_pair', priceVersion: 'sound-preview-v1', estimatedCredits: 20,
        currency: 'credits', partialSuccessPolicy: 'per_take',
      })),
      reserve: vi.fn(async () => ({
        operationId: 'disabled-sound', reservationId: 'disabled-sound', operationCode: 'sound_pair',
        priceVersion: 'sound-preview-v1', estimatedCredits: 20, currency: 'credits',
        partialSuccessPolicy: 'per_take', status: 'disabled',
      })),
    };
    const sound = vi.fn(async () => ['sound-provider-a', 'sound-provider-b']);
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39999',
      sound,
      generate: vi.fn(),
      forCredential: vi.fn(() => ({ sound })),
    };
    const queue = { add: vi.fn(async () => undefined) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new MusicService(
      testConfig({ ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true' }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );

    const result = await service.submit(session, {
      kind: 'sound', title: ' Rain ', tags: ' rain ambience ', model: 'chirp-crow',
      tempo: 99, key: ' D ', loop: false,
    }, 'sound-idempotency-key');

    const normalized: SoundGenerateRequest = {
      kind: 'sound', mode: 'custom', title: 'Rain', description: '', style: 'rain ambience', lyrics: '',
      instrumental: true, model: 'chirp-crow', negativeTags: '', vocalGender: 'auto',
      styleWeight: 0.5, weirdness: 0.5, soundTempo: 99, soundKey: 'D', soundLoop: false,
    };
    expect(result).toMatchObject({ tracks: acceptedTracks, pending: false, replay: false });
    expect(modelCross.musicOperationCatalog).toHaveBeenCalledWith(session.accessToken, [{
      action: 'sound', operationCode: 'sound_pair', fallbackCredits: 20,
    }]);
    expect(createGenerationIntent).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'sound', modelProfileId: 'chirp-crow', request: normalized,
      estimatedCredits: 20, priceVersion: 'sound-preview-v1',
    }));
    expect(modelCross.quote).toHaveBeenCalledWith(session.accessToken, {
      operationCode: 'sound_pair', expectedItems: 2, fallbackCredits: 20,
    });
    expect(modelCross.reserve).toHaveBeenCalledWith(
      session.accessToken,
      expect.objectContaining({ operationCode: 'sound_pair', expectedItems: 2 }),
      20,
    );
    expect(suno.sound).toHaveBeenCalledWith(normalized, 'sound-idempotency-key');
    expect(suno.generate).not.toHaveBeenCalled();
    expect(repository.acceptGeneration).toHaveBeenCalledWith(
      'sound-generation-1', session.user.subject, ['sound-provider-a', 'sound-provider-b'],
    );
  });

  it('rejects a non-sound model before catalog, billing, or Provider submission', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-bluejay')!;
    const repository = { getModelProfile: vi.fn(async () => profile), createGenerationIntent: vi.fn() };
    const modelCross = { musicOperationCatalog: vi.fn(), quote: vi.fn(), reserve: vi.fn() };
    const suno = { configured: true, url: 'http://127.0.0.1:39999', sound: vi.fn(), generate: vi.fn() };
    const service = new MusicService(
      testConfig({ ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true' }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      { add: vi.fn() } as unknown as PlatformQueue,
      { publish: vi.fn() } as unknown as PlatformEventBus,
    );

    await expect(service.submit(session, {
      kind: 'sound', title: 'Rain', tags: 'rain ambience', model: 'chirp-bluejay',
    }, 'unsupported-sound-model')).rejects.toThrow(/does not support sound generation/);
    expect(modelCross.musicOperationCatalog).not.toHaveBeenCalled();
    expect(repository.createGenerationIntent).not.toHaveBeenCalled();
    expect(suno.sound).not.toHaveBeenCalled();
  });
});
