import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import { MusicService } from '../../src/platform/music-service.js';
import type { PlatformEventBus, PlatformQueue } from '../../src/platform/queue.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import type { SunoClient } from '../../src/suno.js';
import type { AuthenticatedSession, GenerationIntent, PlatformTrack } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const session: AuthenticatedSession = {
  tokenHash: 'session-safe-preview',
  user: platformUser('preview-owner'),
  clientId: 'museflow-test',
  accessToken: 'user-access-token-must-not-be-persisted',
  refreshToken: 'user-refresh-token',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
};

describe('music submission billing safety', () => {
  it('rejects a locally known model that is absent from the ModelCross user authorization set', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-bluejay')!;
    const repository = {
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent: vi.fn(),
    };
    const modelCross = {
      musicModelIds: vi.fn(async () => []),
      musicOperationCatalog: vi.fn(),
      quote: vi.fn(),
      reserve: vi.fn(),
    };
    const suno = {
      configured: true,
      url: 'https://public-provider.example.test',
      generate: vi.fn(),
    };
    const queue = { add: vi.fn() };
    const events = { publish: vi.fn() };
    const oidcSession = {
      ...session,
      tokenHash: 'oidc-unauthorized-model-session',
      accessToken: 'oidc-unauthorized-model-access-token',
    };
    const service = new MusicService(
      testConfig({
        AUTH_MODE: 'oidc',
        BILLING_LIVE_ENABLED: 'true',
        MODELCROSS_TASK_TOKEN_SECRET: 'oidc-test-task-token-secret',
      }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );

    await expect(service.submit(oidcSession, {
      mode: 'simple', title: 'Unauthorized', description: 'must stop before Provider', style: '', lyrics: '',
      instrumental: true, model: profile.id, negativeTags: '', vocalGender: 'auto',
      styleWeight: 0.65, weirdness: 0.5,
    }, 'unauthorized-model-key')).rejects.toMatchObject({
      status: 403,
      message: 'selected music model is not authorized for this ModelCross account',
    });

    expect(modelCross.musicModelIds).toHaveBeenCalledWith(oidcSession.accessToken);
    expect(modelCross.musicOperationCatalog).not.toHaveBeenCalled();
    expect(modelCross.quote).not.toHaveBeenCalled();
    expect(modelCross.reserve).not.toHaveBeenCalled();
    expect(repository.createGenerationIntent).not.toHaveBeenCalled();
    expect(suno.generate).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('fails closed without calling a public Provider when live billing is disabled', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-bluejay')!;
    const intent: GenerationIntent = {
      id: 'generation-preview-1', ownerSubject: session.user.subject, projectId: null,
      operation: 'generate', sourceTrackId: null, modelProfileId: profile.id, status: 'draft',
      idempotencyKey: 'preview-generation-key',
      request: {
        mode: 'simple', title: 'Preview', description: 'safe preview song', style: '', lyrics: '',
        instrumental: true, model: profile.id, negativeTags: '', vocalGender: 'auto',
        styleWeight: 0.65, weirdness: 0.5,
      },
      priceVersion: profile.priceVersion, estimatedCredits: profile.estimatedCredits,
      billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
      createdAt: new Date().toISOString(),
    };
    const repository = {
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent: vi.fn(async () => ({ intent, replay: false })),
      setGenerationCredential: vi.fn(async () => undefined),
      setGenerationReservation: vi.fn(async () => undefined),
      acceptGeneration: vi.fn(async () => []),
      getGeneration: vi.fn(async () => ({ ...intent, status: 'queued', billingStatus: 'disabled' })),
      generationCredential: vi.fn(async () => null),
      failGeneration: vi.fn(async () => undefined),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'generate', operationCode: 'generation_pair', available: true,
        estimatedCredits: 20, priceVersion: 'preview-v1', chargingEnabled: false, preview: true,
      }]),
      quote: vi.fn(async () => ({
        operationCode: 'generation_pair', priceVersion: profile.priceVersion,
        estimatedCredits: profile.estimatedCredits, currency: 'credits', partialSuccessPolicy: 'per_take',
      })),
      taskToken: vi.fn(async () => 'restricted-task-token'),
      reserve: vi.fn(async () => ({
        operationId: `disabled-${intent.id}`, reservationId: `disabled-${intent.id}`,
        operationCode: 'generation_pair', priceVersion: profile.priceVersion,
        estimatedCredits: profile.estimatedCredits, currency: 'credits', partialSuccessPolicy: 'per_take',
        status: 'disabled',
      })),
      settle: vi.fn(async () => ({ status: 'disabled' })),
    };
    const suno = {
      configured: true,
      url: 'https://public-provider.example.test',
      generate: vi.fn(async () => ['fake-task-a', 'fake-task-b']),
    };
    const queue = { add: vi.fn(async () => undefined) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new MusicService(
      testConfig({ MODELCROSS_TASK_TOKEN_SECRET: 'configured-but-billing-remains-off' }),
      repository as unknown as PlatformRepository,
      modelCross as unknown as ModelCrossClient,
      suno as unknown as SunoClient,
      queue as unknown as PlatformQueue,
      events as unknown as PlatformEventBus,
    );

    await expect(service.submit(session, intent.request, intent.idempotencyKey))
      .rejects.toThrow('charging is disabled');

    expect(modelCross.taskToken).not.toHaveBeenCalled();
    expect(modelCross.quote).not.toHaveBeenCalled();
    expect(modelCross.reserve).not.toHaveBeenCalled();
    expect(repository.createGenerationIntent).not.toHaveBeenCalled();
    expect(repository.setGenerationCredential).not.toHaveBeenCalled();
    expect(repository.setGenerationReservation).not.toHaveBeenCalled();
    expect(suno.generate).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('keeps an accepted two-track submission successful when both enqueue operations fail', async () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-bluejay')!;
    const intent: GenerationIntent = {
      id: 'generation-enqueue-failure-1', ownerSubject: session.user.subject, projectId: null,
      operation: 'generate', sourceTrackId: null, modelProfileId: profile.id, status: 'draft',
      idempotencyKey: 'enqueue-failure-generation-key',
      request: {
        mode: 'simple', title: 'Durable submission', description: 'queue outage must not erase accepted tracks',
        style: '', lyrics: '', instrumental: true, model: profile.id, negativeTags: '', vocalGender: 'auto',
        styleWeight: 0.65, weirdness: 0.5,
      },
      priceVersion: profile.priceVersion, estimatedCredits: profile.estimatedCredits,
      billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
      createdAt: new Date().toISOString(),
    };
    const acceptedTracks = [
      { id: 'accepted-track-a', generationId: intent.id },
      { id: 'accepted-track-b', generationId: intent.id },
    ] as unknown as Awaited<ReturnType<PlatformRepository['acceptGeneration']>>;
    const queuedGeneration = { ...intent, status: 'queued', billingStatus: 'disabled' };
    const repository = {
      getModelProfile: vi.fn(async () => profile),
      createGenerationIntent: vi.fn(async () => ({ intent, replay: false })),
      setGenerationCredential: vi.fn(async () => undefined),
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptGeneration: vi.fn(async () => acceptedTracks),
      markGenerationProviderSubmissionRejected: vi.fn(async () => 'rejected' as const),
      markGenerationProviderSubmissionUncertain: vi.fn(async () => 'uncertain' as const),
      getGeneration: vi.fn(async () => queuedGeneration),
      generationCredential: vi.fn(async () => null),
      failGeneration: vi.fn(async () => undefined),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'generate', operationCode: 'generation_pair', available: true,
        estimatedCredits: 20, priceVersion: 'preview-v1', chargingEnabled: false, preview: true,
      }]),
      quote: vi.fn(async () => ({
        operationCode: 'generation_pair', priceVersion: profile.priceVersion,
        estimatedCredits: profile.estimatedCredits, currency: 'credits', partialSuccessPolicy: 'per_take',
      })),
      taskToken: vi.fn(async () => 'restricted-task-token'),
      reserve: vi.fn(async () => ({
        operationId: `disabled-${intent.id}`, reservationId: `disabled-${intent.id}`,
        operationCode: 'generation_pair', priceVersion: profile.priceVersion,
        estimatedCredits: profile.estimatedCredits, currency: 'credits', partialSuccessPolicy: 'per_take',
        status: 'disabled',
      })),
      settle: vi.fn(async () => ({ status: 'disabled' })),
    };
    const taskIds = ['accepted-provider-task-a', 'accepted-provider-task-b'];
    const generate = vi.fn(async () => taskIds);
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39999',
      generate,
      forCredential: vi.fn(() => ({ generate })),
    };
    const queueError = new Error('queue unavailable after durable acceptance');
    const queue = { add: vi.fn(async () => { throw queueError; }) };
    const events = { publish: vi.fn(async () => undefined) };
    const service = new MusicService(
      testConfig({
        MODELCROSS_TASK_TOKEN_SECRET: 'configured-but-billing-remains-off',
        ALLOW_DEVELOPMENT_FAKE_PROVIDER: 'true',
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
        generation: queuedGeneration,
        tracks: acceptedTracks,
        replay: false,
        pending: false,
      });
      expect(repository.acceptGeneration).toHaveBeenCalledWith(intent.id, session.user.subject, taskIds);
      expect(repository.getGeneration).toHaveBeenCalledWith(session.user.subject, intent.id);
      expect(queue.add.mock.calls).toEqual([
        ['music.poll', { generationId: intent.id }, { jobId: `poll:${intent.id}` }],
        ['outbox.dispatch', {}, { jobId: `outbox:submit:${intent.id}` }],
      ]);
      expect(modelCross.settle).not.toHaveBeenCalled();
      expect(repository.generationCredential).not.toHaveBeenCalled();
      expect(repository.failGeneration).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledTimes(2);
      for (const [message] of consoleError.mock.calls) {
        expect(JSON.parse(String(message))).toMatchObject({
          level: 'error',
          event: 'generation.enqueue_failed',
          generationId: intent.id,
          error: queueError.message,
        });
      }
    } finally {
      consoleError.mockRestore();
    }
  });

  it('validates extend and cover overrides against the selected target model before Provider submission', async () => {
    const sourceProfile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-bluejay')!;
    const targetProfile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-fenix')!;
    const legacyProfile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-v4')!;
    const source = {
      id: 'source-cover-track', generationId: 'source-generation', projectId: 'project-cover',
      title: 'Original', mode: 'custom', description: '', style: 'indie pop', lyrics: '[Verse]\nOld words',
      instrumental: false, model: sourceProfile.id, negativeTags: '', vocalGender: 'auto',
      styleWeight: 0.65, weirdness: 0.5, status: 'done', customId: 'provider-clip-cover', duration: 187.5,
    } as PlatformTrack;
    const key = 'cover-with-overrides-key';
    const acceptedTracks = [{ id: 'cover-a' }, { id: 'cover-b' }] as PlatformTrack[];
    const createGenerationIntent = vi.fn(async (
      input: Parameters<PlatformRepository['createGenerationIntent']>[0],
    ) => {
      const intent: GenerationIntent = {
        id: 'cover-generation', ownerSubject: session.user.subject, projectId: input.projectId,
        operation: input.operation, sourceTrackId: input.sourceTrackId, modelProfileId: input.modelProfileId,
        status: 'draft', idempotencyKey: input.idempotencyKey, request: input.request,
        priceVersion: input.priceVersion, estimatedCredits: input.estimatedCredits,
        billingOperationId: null, billingReservationId: null, billingStatus: 'draft', error: null,
        createdAt: new Date().toISOString(),
      };
      return { intent, replay: false };
    });
    const repository = {
      getTrack: vi.fn(async () => source),
      getModelProfile: vi.fn(async (id: string) => id === targetProfile.id
        ? targetProfile
        : id === legacyProfile.id ? legacyProfile : sourceProfile),
      createGenerationIntent,
      setGenerationReservation: vi.fn(async () => undefined),
      claimGenerationProviderSubmission: vi.fn(async () => 'claimed' as const),
      acceptGeneration: vi.fn(async () => acceptedTracks),
      getGeneration: vi.fn(async (_owner: string, id: string) => ({
        id, ownerSubject: session.user.subject, projectId: source.projectId, operation: 'cover' as const,
        sourceTrackId: source.id, modelProfileId: targetProfile.id, status: 'queued', idempotencyKey: key,
        request: createGenerationIntent.mock.calls.at(-1)![0].request,
        priceVersion: 'cover-preview-v1', estimatedCredits: 24, billingOperationId: 'disabled-cover',
        billingReservationId: 'disabled-cover', billingStatus: 'disabled', error: null,
        createdAt: new Date().toISOString(),
      })),
      generationCredential: vi.fn(async () => null),
      failGeneration: vi.fn(async () => undefined),
    };
    const modelCross = {
      musicOperationCatalog: vi.fn(async () => [{
        action: 'cover', operationCode: 'cover_pair', available: true, estimatedCredits: 24,
        priceVersion: 'cover-preview-v1', chargingEnabled: false, preview: true,
      }]),
      quote: vi.fn(async () => ({
        operationCode: 'cover_pair', priceVersion: 'cover-preview-v1', estimatedCredits: 24,
        currency: 'credits', partialSuccessPolicy: 'per_take',
      })),
      reserve: vi.fn(async () => ({
        operationId: 'disabled-cover', reservationId: 'disabled-cover', operationCode: 'cover_pair',
        priceVersion: 'cover-preview-v1', estimatedCredits: 24, currency: 'credits',
        partialSuccessPolicy: 'per_take', status: 'disabled',
      })),
      settle: vi.fn(),
    };
    const generate = vi.fn(async () => ['cover-provider-a', 'cover-provider-b']);
    const suno = {
      configured: true,
      url: 'http://127.0.0.1:39999',
      generate,
      forCredential: vi.fn(() => ({ generate })),
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

    await expect(service.action(session, source.id, {
      action: 'cover', model: targetProfile.id, mode: 'custom', title: 'New V5.5 cover',
      description: '', style: 'cinematic dream pop', lyrics: '[Verse]\nCompletely new words',
      instrumental: false, negativeTags: 'spoken word', vocalGender: 'f',
      styleWeight: 0.8, weirdness: 0.35,
    }, key)).resolves.toMatchObject({ tracks: acceptedTracks, pending: false });

    const expectedRequest = {
      mode: 'custom', title: 'New V5.5 cover', description: '', style: 'cinematic dream pop',
      lyrics: '[Verse]\nCompletely new words', instrumental: false, model: targetProfile.id,
      negativeTags: 'spoken word', vocalGender: 'f', styleWeight: 0.8, weirdness: 0.35,
    };
    expect(repository.getModelProfile).toHaveBeenCalledWith(targetProfile.id);
    expect(createGenerationIntent).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'cover', sourceTrackId: source.id, modelProfileId: targetProfile.id,
      request: expectedRequest,
    }));
    expect(suno.generate).toHaveBeenCalledWith(expectedRequest, {
      operation: 'cover', clipId: source.customId, continueAt: undefined, idempotencyKey: key,
    });

    await expect(service.action(session, source.id, {
      action: 'cover', model: sourceProfile.id, mode: 'custom', style: 's'.repeat(201), lyrics: 'valid',
    }, 'cover-over-model-limit')).rejects.toThrow(/style must be at most 200 characters/);
    expect(suno.generate).toHaveBeenCalledTimes(1);

    Object.assign(source, { operation: 'upload', referenceAudioAvailable: true });
    await expect(service.action(session, source.id, {
      action: 'cover', model: legacyProfile.id, mode: 'custom', style: 'legacy cover', lyrics: 'valid',
      audioWeight: 0.5,
    }, 'legacy-cover-audio-weight')).rejects.toThrow('audioWeight is not supported by the selected model');
    expect(createGenerationIntent).toHaveBeenCalledTimes(1);
    expect(suno.generate).toHaveBeenCalledTimes(1);
  });
});
