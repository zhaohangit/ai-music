import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicService } from '../../src/platform/music-service.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import type { SunoClient } from '../../src/suno.js';
import type { AuthenticatedSession, GenerationIntent, PlatformTrack } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

describe('music durable-acceptance boundary', () => {
  it('returns the accepted tracks and never compensates when the auxiliary generation read fails', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-bluejay')!;
    const user = platformUser('durable-accept-owner');
    const session: AuthenticatedSession = {
      tokenHash: 'durable-accept-session',
      user,
      clientId: 'museflow-test',
      accessToken: 'owner-access-token',
      refreshToken: 'owner-refresh-token',
      idToken: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 3_600_000),
    };
    const intent: GenerationIntent = {
      id: 'durable-accept-generation',
      ownerSubject: user.subject,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: profile.id,
      status: 'draft',
      idempotencyKey: 'durable-accept-idempotency',
      request: {
        mode: 'simple',
        title: 'Durable acceptance',
        description: 'a committed generation must never be released by an auxiliary read failure',
        style: '',
        lyrics: '',
        instrumental: true,
        model: profile.id,
        negativeTags: '',
        vocalGender: 'auto',
        styleWeight: 0.65,
        weirdness: 0.5,
      },
      priceVersion: profile.priceVersion,
      estimatedCredits: profile.estimatedCredits,
      billingOperationId: null,
      billingReservationId: null,
      billingStatus: 'draft',
      error: null,
      createdAt: new Date().toISOString(),
    };
    const tracks = [
      { id: 'durable-track-a', generationId: intent.id },
      { id: 'durable-track-b', generationId: intent.id },
    ] as PlatformTrack[];
    const repository = {
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent: vi.fn(async () => ({ intent, replay: false })),
      setGenerationCredential: vi.fn(async () => undefined),
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptGeneration: vi.fn(async () => tracks),
      markGenerationProviderSubmissionRejected: vi.fn(async () => 'rejected' as const),
      markGenerationProviderSubmissionUncertain: vi.fn(async () => 'uncertain' as const),
      getGeneration: vi.fn(async () => { throw new Error('read replica temporarily unavailable'); }),
      generationCredential: vi.fn(async () => ({
        ciphertext: 'encrypted-worker-token',
        operationId: 'durable-operation',
        reservationId: 'durable-reservation',
        idempotencyKey: intent.idempotencyKey,
      })),
      failGeneration: vi.fn(async () => undefined),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'generate', operationCode: 'generation_pair', available: true,
        estimatedCredits: 20, priceVersion: profile.priceVersion, chargingEnabled: true, preview: false,
      }]),
      quote: vi.fn(async () => ({
        operationCode: 'generation_pair',
        priceVersion: profile.priceVersion,
        estimatedCredits: profile.estimatedCredits,
        currency: 'credits',
        partialSuccessPolicy: 'per_take',
      })),
      taskToken: vi.fn(async () => 'restricted-durable-worker-token'),
      reserve: vi.fn(async () => ({
        operationId: 'durable-operation',
        reservationId: 'durable-reservation',
        operationCode: 'generation_pair',
        priceVersion: profile.priceVersion,
        estimatedCredits: profile.estimatedCredits,
        currency: 'credits',
        partialSuccessPolicy: 'per_take',
        status: 'reserved',
      })),
      settle: vi.fn(async () => ({ status: 'released' })),
    };
    const generate = vi.fn(async () => ['provider-task-a', 'provider-task-b']);
    const suno = {
      configured: true,
      url: 'https://provider.example.test',
      generate,
      forCredential: vi.fn(() => ({ generate })),
    };
    const queue = { add: vi.fn(async () => undefined) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new MusicService(
      testConfig({
        BILLING_LIVE_ENABLED: 'true',
        MODELCROSS_TASK_TOKEN_SECRET: 'test-worker-task-token-secret',
      }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const result = await service.submit(session, intent.request, intent.idempotencyKey);

      expect(result).toEqual({
        generation: {
          ...intent,
          status: 'queued',
          billingOperationId: 'durable-operation',
          billingReservationId: 'durable-reservation',
          billingStatus: 'reserved',
        },
        tracks,
        replay: false,
        pending: false,
      });
      expect(repository.acceptGeneration).toHaveBeenCalledOnce();
      expect(repository.claimGenerationProviderSubmission).toHaveBeenCalledWith(user.subject, intent.id);
      expect(repository.getGeneration).toHaveBeenCalledOnce();
      expect(modelCross.settle).not.toHaveBeenCalled();
      expect(repository.generationCredential).not.toHaveBeenCalled();
      expect(repository.failGeneration).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledOnce();
      expect(JSON.parse(String(consoleError.mock.calls[0]?.[0]))).toEqual({
        level: 'error',
        event: 'generation.post_accept_read_failed',
        generationId: intent.id,
        error: 'read replica temporarily unavailable',
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
