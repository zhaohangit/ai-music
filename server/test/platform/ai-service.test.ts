import { describe, expect, it, vi } from 'vitest';
import {
  AiAssistantService,
  AiCapabilityUnavailableError,
  ContentPolicyError,
} from '../../src/platform/ai-service.js';
import { decryptSecret } from '../../src/platform/crypto.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import type { PlatformEventBus } from '../../src/platform/queue.js';
import type { PlatformRepository } from '../../src/platform/repository.js';
import type { AuthenticatedSession } from '../../src/platform/types.js';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import { platformUser, testConfig } from './helpers.js';

const session = (subject = 'writer-a'): AuthenticatedSession => ({
  tokenHash: `session-${subject}`,
  user: platformUser(subject),
  clientId: 'museflow-test',
  accessToken: `access-${subject}`,
  refreshToken: `refresh-${subject}`,
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3600_000),
});

function dependencies() {
  const repository = {
    replayAiRun: vi.fn(async () => null),
    createAiRun: vi.fn(async () => undefined),
    completeAiRun: vi.fn(async () => undefined),
    failAiRun: vi.fn(async () => undefined),
    setAiRunCredential: vi.fn(async () => undefined),
    setAiRunReservation: vi.fn(async () => undefined),
    settleAiRunBilling: vi.fn(async () => undefined),
    listModelProfiles: vi.fn(async () => DEFAULT_MUSIC_MODEL_PROFILES),
    acceptAiRevision: vi.fn(async () => ({ documentId: 'document-1', revisionId: 'revision-1' })),
  };
  const modelCross = {
    musicOperationCatalog: vi.fn(async (_accessToken: string, requested: Array<{
      action: string; operationCode: string; fallbackCredits: number;
    }>) => requested.map((entry) => ({
      ...entry,
      available: true,
      estimatedCredits: entry.fallbackCredits,
      priceVersion: 'ai-test-v1',
      chargingEnabled: true,
      preview: false,
    }))),
    musicModelIds: vi.fn(async () => ['mc-music-lyrics', 'mc-music-fast', 'chirp-v4']),
    quote: vi.fn(async (_accessToken: string, request: { operationCode: string }) => ({
      operationCode: request.operationCode,
      priceVersion: 'ai-test-v1',
      estimatedCredits: request.operationCode === 'lyrics_generate' ? 2 : 1,
      currency: 'credits' as const,
      partialSuccessPolicy: 'per_take' as const,
    })),
    taskToken: vi.fn(async () => 'task-bound-ai-credential'),
    reserve: vi.fn(async (_credential: string, request: { operationCode: string; resourceId: string; priceVersion: string }) => ({
      operationId: `operation-${request.resourceId}`,
      reservationId: `reservation-${request.resourceId}`,
      operationCode: request.operationCode,
      priceVersion: request.priceVersion,
      estimatedCredits: request.operationCode === 'lyrics_generate' ? 2 : 1,
      currency: 'credits' as const,
      partialSuccessPolicy: 'per_take' as const,
      status: 'reserved' as const,
    })),
    settle: vi.fn(async () => ({ captured_amount: 1 })),
    aiJson: vi.fn(async (_credential: string, input: { action: string; prompt: string }) => ({
      payload: {
        suggestion: input.action === 'lyrics.continue'
          ? `${JSON.parse(input.prompt).input}\n\n[Bridge]\nA genuinely new line`
          : '[Verse]\nA genuinely new line',
        summary: 'Improved cadence without replacing the source',
        title: 'Afterglow',
        styleTags: ['dream pop', 'cinematic'],
        negativeTags: ['harsh vocal'],
      },
      requestId: 'modelcross-request-1',
    })),
  };
  const events = { publish: vi.fn(async () => undefined) };
  return { repository, modelCross, events };
}

const liveConfig = () => testConfig({
  AUTH_MODE: 'oidc',
  BILLING_LIVE_ENABLED: 'true',
  AI_LIVE_ENABLED: 'true',
  MODELCROSS_AI_RELAY_TOKEN: 'modelcross-ai-relay-test-token',
  MODELCROSS_TASK_TOKEN_SECRET: 'test-task-token-secret-with-more-than-32-characters',
});

describe('AI creation workflow', () => {
  it('keeps original lyrics separate from demo suggestions and persists the audit run', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig({ AI_LIVE_ENABLED: 'false' }),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const original = '[Verse]\n  the old line stays here  ';
    const result = await service.assist(session(), {
      action: 'lyrics.rewrite', input: original,
      context: { title: 'Existing title', style: 'indie pop', projectId: 'project-a' },
    });

    expect(result.original).toBe(original);
    expect(result.suggestion).toBe('[Verse]\nthe old line stays here');
    expect(result.suggestion).not.toBe(result.original);
    expect(result.summary).toContain('不会静默覆盖原文');
    expect(result).toMatchObject({
      outputMode: 'replacement',
      fields: { lyrics: '[Verse]\nthe old line stays here', title: 'Existing title', style: 'indie pop' },
      billing: {
        operationCode: 'lyrics_rewrite', estimatedCredits: 1, actualCredits: 0,
        status: 'preview',
      },
    });
    expect(result.createdAt).toEqual(expect.any(String));
    expect(deps.repository.createAiRun).toHaveBeenCalledWith(expect.objectContaining({
      id: result.id,
      ownerSubject: 'writer-a',
      projectId: 'project-a',
      capabilityKey: 'lyrics.rewrite',
      original,
      estimatedCredits: 1,
    }));
    expect(deps.repository.completeAiRun).toHaveBeenCalledWith(result.id, 'writer-a', {
      completed: result,
      requestId: null,
    });
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
    expect(deps.events.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ai.assist.completed', subject: 'writer-a', resourceId: result.id,
    }));
  });

  it('uses ModelCross structured output in live mode while preserving the submitted source', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const original = '[Chorus]\nKeep this source unchanged';
    const result = await service.assist(session('writer-live'), {
      action: 'lyrics.rewrite', input: original, context: { mood: 'hopeful' },
    });

    expect(result).toMatchObject({
      action: 'lyrics.rewrite',
      original,
      suggestion: '[Verse]\nA genuinely new line',
      summary: 'Improved cadence without replacing the source',
      title: 'Afterglow',
      styleTags: ['dream pop', 'cinematic'],
      negativeTags: ['harsh vocal'],
    });
    expect(deps.modelCross.aiJson).toHaveBeenCalledWith('modelcross-ai-relay-test-token', expect.objectContaining({
      action: 'lyrics.rewrite',
      model: 'mc-music-lyrics',
      schema: expect.objectContaining({ additionalProperties: false }),
      system: expect.stringContaining('禁止声称模仿具体在世艺人'),
    }));
    expect(deps.repository.completeAiRun).toHaveBeenCalledWith(result.id, 'writer-live', {
      completed: result,
      requestId: 'modelcross-request-1',
    });
    expect(deps.modelCross.musicOperationCatalog).toHaveBeenCalledWith('access-writer-live', [expect.objectContaining({
      action: 'lyrics.rewrite', operationCode: 'lyrics_rewrite', fallbackCredits: 1,
    })]);
    expect(deps.modelCross.musicModelIds).toHaveBeenCalledWith('access-writer-live');
    expect(deps.modelCross.quote).toHaveBeenCalledWith('access-writer-live', {
      operationCode: 'lyrics_rewrite', expectedItems: 1,
      priceVersion: 'ai-test-v1', fallbackCredits: 1,
    });
    expect(deps.modelCross.reserve).toHaveBeenCalledWith(
      'task-bound-ai-credential',
      expect.objectContaining({ operationCode: 'lyrics_rewrite', expectedItems: 1 }),
      1,
    );
    const persistedCredential = deps.repository.setAiRunCredential.mock.calls[0]?.[2];
    expect(persistedCredential).toEqual(expect.any(String));
    expect(decryptSecret(persistedCredential!, liveConfig().sessionSecret)).toBe('task-bound-ai-credential');
    expect(JSON.stringify(deps.repository.setAiRunCredential.mock.calls)).not.toContain('modelcross-ai-relay-test-token');
    expect(JSON.stringify(deps.repository.completeAiRun.mock.calls)).not.toContain('modelcross-ai-relay-test-token');
    expect(JSON.stringify(deps.events.publish.mock.calls)).not.toContain('modelcross-ai-relay-test-token');
    expect(JSON.stringify(result)).not.toContain('modelcross-ai-relay-test-token');
    expect(deps.modelCross.settle).toHaveBeenCalledWith(
      'task-bound-ai-credential',
      'capture',
      expect.objectContaining({ successful_items: 1 }),
      expect.any(String),
    );
  });

  it('passes a named dedication and sensory brief into live lyric generation', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const brief = '写给王会杰：清晨林间的嫩绿色，湿润草木感，清透柔和，节奏慢悠悠。';

    await service.assist(session('lyric-writer'), {
      action: 'lyrics.generate', input: brief,
      options: { length: 'medium', structure: 'verse_prechorus_chorus_bridge' },
    });

    expect(deps.modelCross.aiJson).toHaveBeenCalledWith(
      'modelcross-ai-relay-test-token',
      expect.objectContaining({
        action: 'lyrics.generate',
        system: expect.stringContaining('准确保留指定的人名和赠歌对象'),
        prompt: expect.stringContaining(brief),
      }),
    );
    expect(JSON.parse(deps.modelCross.aiJson.mock.calls[0][1].prompt)).toMatchObject({
      input: brief,
      options: { length: 'medium', structure: 'verse_prechorus_chorus_bridge' },
    });
  });

  it('uses an explicitly selected authorized AI model and binds it to the task grant', async () => {
    const deps = dependencies();
    const config = testConfig({
      AUTH_MODE: 'oidc',
      BILLING_LIVE_ENABLED: 'true',
      AI_LIVE_ENABLED: 'true',
      MODELCROSS_AI_RELAY_TOKEN: 'modelcross-ai-relay-test-token',
      MODELCROSS_TASK_TOKEN_SECRET: 'test-task-token-secret-with-more-than-32-characters',
      MODELCROSS_LYRICS_MODEL: 'mc-music-lyrics',
      MODELCROSS_FAST_MODEL: 'mc-music-fast',
      MODELCROSS_AI_MODELS: 'mc-music-lyrics,mc-music-fast,gpt-5.4',
    });
    deps.modelCross.musicModelIds.mockResolvedValue([
      'mc-music-lyrics', 'mc-music-fast', 'gpt-5.4', 'chirp-v4',
    ]);
    const service = new AiAssistantService(
      config,
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    const result = await service.assist(session('writer-selected-model'), {
      action: 'lyrics.generate', input: 'city rain', aiModelId: 'gpt-5.4',
    });

    expect(result.model).toBe('gpt-5.4');
    expect(deps.modelCross.aiJson).toHaveBeenCalledWith(
      'modelcross-ai-relay-test-token',
      expect.objectContaining({ model: 'gpt-5.4' }),
    );
    expect(deps.modelCross.taskToken).toHaveBeenCalledWith(
      'access-writer-selected-model',
      expect.objectContaining({ allowedModels: ['gpt-5.4'] }),
    );
  });

  it('rejects a browser-supplied AI model outside the curated server catalog', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session(), {
      action: 'lyrics.generate', input: 'city rain', aiModelId: 'untrusted-model',
    })).rejects.toThrow('未在 MuseFlow 模型目录中启用');
    expect(deps.modelCross.quote).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
  });

  it('never charges for preview AI when only the music billing gate is enabled', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig({
        BILLING_LIVE_ENABLED: 'true',
        AI_LIVE_ENABLED: 'false',
        MODELCROSS_TASK_TOKEN_SECRET: 'preview-must-not-use-this-task-token-secret',
      }),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const result = await service.assist(session(), {
      action: 'prompt.optimize', input: 'preview-only prompt',
    });
    expect(result.actualCredits).toBe(0);
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
    expect(deps.modelCross.quote).not.toHaveBeenCalled();
    expect(deps.modelCross.reserve).not.toHaveBeenCalled();
    expect(deps.modelCross.settle).not.toHaveBeenCalled();
  });

  it.each([
    ['lyrics.generate', 'lyrics_generate', 2, 'mc-music-lyrics'],
    ['lyrics.continue', 'lyrics_rewrite', 1, 'mc-music-lyrics'],
    ['lyrics.rewrite', 'lyrics_rewrite', 1, 'mc-music-lyrics'],
    ['lyrics.translate', 'lyrics_rewrite', 1, 'mc-music-lyrics'],
    ['title.suggest', 'prompt_optimize', 1, 'mc-music-fast'],
    ['style.suggest', 'prompt_optimize', 1, 'mc-music-fast'],
    ['prompt.optimize', 'prompt_optimize', 1, 'mc-music-fast'],
  ] as const)('maps %s to the authoritative %s operation', async (action, operationCode, credits, model) => {
    const deps = dependencies();
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const result = await service.assist(session(`mapping-${action}`), {
      action,
      input: action === 'lyrics.continue' ? '[Verse]\nOriginal' : 'original idea',
      context: action === 'lyrics.translate' ? { targetLanguage: 'en-US' } : undefined,
    });

    expect(result.billing).toMatchObject({ operationCode, estimatedCredits: credits, status: 'captured' });
    expect(deps.modelCross.taskToken).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      allowedOperations: [operationCode], allowedModels: [model], maxCost: credits,
    }));
  });

  it.each([
    '模仿 周杰伦 写一首一样的歌',
    '声音像 Taylor Swift and make it exact',
    'in the exact style of Living Artist with identical vocals',
  ])('blocks direct living-artist impersonation before creating or charging an AI run: %s', async (input) => {
    const deps = dependencies();
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    await expect(service.assist(session(), { action: 'style.suggest', input }))
      .rejects.toBeInstanceOf(ContentPolicyError);
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
  });

  it('marks a run failed when live AI violates the expected suggestion contract', async () => {
    const deps = dependencies();
    deps.modelCross.aiJson.mockResolvedValueOnce({
      payload: { suggestion: '', summary: 'missing output', title: '', styleTags: [], negativeTags: [] },
      requestId: 'bad-schema-request',
    });
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session(), { action: 'prompt.optimize', input: 'small idea' }))
      .rejects.toThrow('AI suggestion is empty');
    const createdRun = (deps.repository.createAiRun.mock.calls as unknown as Array<[{ id: string }]>)[0]?.[0];
    expect(createdRun).toBeDefined();
    const runId = createdRun!.id;
    expect(deps.repository.failAiRun).toHaveBeenCalledWith(runId, 'writer-a', 'AI suggestion is empty');
    expect(deps.repository.completeAiRun).not.toHaveBeenCalled();
    expect(deps.events.publish).not.toHaveBeenCalled();
  });

  it('fails closed in OIDC mode when AI is disabled instead of returning demo lyrics', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig({ AUTH_MODE: 'oidc', AI_LIVE_ENABLED: 'false', BILLING_LIVE_ENABLED: 'false' }),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('oidc-disabled'), {
      action: 'lyrics.generate', input: '雨夜离别',
    })).rejects.toBeInstanceOf(AiCapabilityUnavailableError);
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
  });

  it('replays a persisted success before consulting an unavailable ModelCross catalog', async () => {
    const deps = dependencies();
    const replay = {
      id: 'persisted-ai-result', action: 'prompt.optimize' as const,
      original: 'saved idea', suggestion: 'saved optimized idea', summary: 'saved result',
      estimatedCredits: 1, actualCredits: 1, outputMode: 'replacement' as const,
      fields: { prompt: 'saved optimized idea' },
      billing: {
        operationCode: 'prompt_optimize' as const, priceVersion: 'saved-v1',
        estimatedCredits: 1, actualCredits: 1, status: 'captured' as const,
      },
      createdAt: new Date().toISOString(),
    };
    deps.repository.replayAiRun.mockResolvedValueOnce(replay);
    deps.modelCross.musicOperationCatalog.mockRejectedValueOnce(new Error('ModelCross unavailable'));
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('replay-owner'), {
      action: 'prompt.optimize', input: 'saved idea',
    }, 'stable-replay-key')).resolves.toEqual(replay);
    expect(deps.modelCross.musicOperationCatalog).not.toHaveBeenCalled();
    expect(deps.modelCross.quote).not.toHaveBeenCalled();
    expect(deps.modelCross.reserve).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
  });

  it('replays an authoritative zero-charge result in OIDC mode after billing release', async () => {
    const deps = dependencies();
    const replay = {
      id: 'released-ai-result', action: 'prompt.optimize' as const,
      original: 'saved idea', suggestion: 'saved optimized idea', summary: 'saved result',
      estimatedCredits: 1, actualCredits: 0, outputMode: 'replacement' as const,
      fields: { prompt: 'saved optimized idea' },
      billing: {
        operationCode: 'prompt_optimize' as const, priceVersion: 'saved-v1',
        estimatedCredits: 1, actualCredits: 0, status: 'released' as const,
      },
      createdAt: new Date().toISOString(),
    };
    deps.repository.replayAiRun.mockResolvedValueOnce(replay);
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('released-replay-owner'), {
      action: 'prompt.optimize', input: 'saved idea',
    }, 'released-replay-key')).resolves.toEqual(replay);
    expect(deps.modelCross.musicOperationCatalog).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
  });

  it('does not replay a development preview result after switching to OIDC mode', async () => {
    const deps = dependencies();
    deps.repository.replayAiRun.mockResolvedValueOnce({
      id: 'preview-ai-result', action: 'prompt.optimize',
      original: 'saved idea', suggestion: 'preview optimized idea', summary: 'preview result',
      estimatedCredits: 1, actualCredits: 0, outputMode: 'replacement',
      fields: { prompt: 'preview optimized idea' },
      billing: {
        operationCode: 'prompt_optimize', priceVersion: 'museflow-development-preview-v1',
        estimatedCredits: 1, actualCredits: 0, status: 'preview',
      },
      createdAt: new Date().toISOString(),
    });
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('preview-replay-owner'), {
      action: 'prompt.optimize', input: 'saved idea',
    }, 'preview-replay-key')).rejects.toBeInstanceOf(AiCapabilityUnavailableError);
    expect(deps.modelCross.musicOperationCatalog).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
  });

  it('fails closed before persistence and billing when the configured AI model is not authorized', async () => {
    const deps = dependencies();
    deps.modelCross.musicModelIds.mockResolvedValueOnce(['some-other-model']);
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('model-denied'), {
      action: 'prompt.optimize', input: '雨夜城市流行曲',
    })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('未授权 AI 模型') });
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
    expect(deps.modelCross.quote).not.toHaveBeenCalled();
    expect(deps.modelCross.reserve).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
  });

  it('fails closed before persistence and billing when the platform Relay token lacks model access', async () => {
    const deps = dependencies();
    deps.modelCross.musicModelIds
      .mockResolvedValueOnce(['mc-music-lyrics', 'mc-music-fast', 'chirp-v4'])
      .mockResolvedValueOnce(['some-other-relay-model']);
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('relay-model-denied'), {
      action: 'prompt.optimize', input: '雨夜城市流行曲',
    })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('AI Relay 未授权模型') });
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
    expect(deps.modelCross.quote).not.toHaveBeenCalled();
    expect(deps.modelCross.reserve).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
  });

  it('fails closed when ModelCross exposes a price only as a non-chargeable preview', async () => {
    const deps = dependencies();
    deps.modelCross.musicOperationCatalog.mockImplementationOnce(async (_token, requested) => requested.map((entry) => ({
      ...entry,
      available: true,
      estimatedCredits: entry.fallbackCredits,
      priceVersion: 'preview-only-v1',
      chargingEnabled: false,
      preview: true,
      reason: '计费维护中',
    })));
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('catalog-disabled'), {
      action: 'title.suggest', input: '关于海边重逢的歌词',
    })).rejects.toMatchObject({ status: 503, message: '计费维护中' });
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
    expect(deps.modelCross.quote).not.toHaveBeenCalled();
    expect(deps.modelCross.aiJson).not.toHaveBeenCalled();
  });

  it('returns a full-document continuation so applying it never drops the original lyrics', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const original = '[Verse]\nThe original remains';
    const result = await service.assist(session(), { action: 'lyrics.continue', input: original });

    expect(result.outputMode).toBe('full_document');
    expect(result.suggestion).toContain(original);
    expect(result.fields.lyrics).toContain(original);
  });

  it('rejects and releases a live continuation that returns only a delta', async () => {
    const deps = dependencies();
    deps.modelCross.aiJson.mockResolvedValueOnce({
      payload: {
        suggestion: '[Bridge]\nOnly a new fragment', summary: 'delta only', title: '',
        styleTags: [], negativeTags: [],
      },
      requestId: 'delta-continuation',
    });
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('delta-owner'), {
      action: 'lyrics.continue', input: '[Verse]\nOriginal line', options: { preserveSections: true },
    })).rejects.toThrow('did not preserve the original lyrics document');
    expect(deps.modelCross.settle).toHaveBeenCalledWith(
      'task-bound-ai-credential', 'release', expect.any(Object), expect.any(String),
    );
  });

  it('releases a live reservation when AI output exceeds the selected Suno model limits', async () => {
    const deps = dependencies();
    deps.modelCross.aiJson.mockResolvedValueOnce({
      payload: {
        suggestion: 'x'.repeat(81), summary: 'too long for V4 title', title: '',
        styleTags: [], negativeTags: [],
      },
      requestId: 'over-limit-output',
    });
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    await expect(service.assist(session('limit-owner'), {
      action: 'title.suggest', input: 'a title idea', targetMusicModelId: 'chirp-v4',
    })).rejects.toThrow('Suno V4 title limit');
    expect(deps.modelCross.settle).toHaveBeenCalledWith(
      'task-bound-ai-credential', 'release', expect.any(Object), expect.any(String),
    );
    expect(deps.modelCross.aiJson).toHaveBeenCalledWith(
      'modelcross-ai-relay-test-token',
      expect.objectContaining({
        prompt: expect.stringContaining('"targetMusicModelId":"chirp-v4"'),
      }),
    );
    expect(deps.repository.failAiRun).toHaveBeenCalledOnce();
  });

  it('reports capture uncertainty without claiming that credits were charged', async () => {
    const deps = dependencies();
    deps.modelCross.settle.mockRejectedValueOnce(new Error('capture response lost'));
    const service = new AiAssistantService(
      liveConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );

    const result = await service.assist(session('capture-uncertain'), {
      action: 'prompt.optimize', input: 'a concise music idea',
    });

    expect(result.actualCredits).toBeUndefined();
    expect(result.billing.status).toBe('reconcile_required');
    expect(result.billing).not.toHaveProperty('actualCredits');
    expect(deps.repository.settleAiRunBilling).toHaveBeenCalledWith(
      result.id, 'capture-uncertain', 'reconcile_required', 0, 'capture response lost',
    );
  });

  it('accepts an AI suggestion only in the current owner scope', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    await expect(service.accept(session('owner-b'), {
      runId: 'run-9', projectId: 'project-9', kind: 'lyrics', title: 'Accepted draft',
    })).resolves.toEqual({ documentId: 'document-1', revisionId: 'revision-1' });
    expect(deps.repository.acceptAiRevision).toHaveBeenCalledWith(
      'owner-b', 'run-9', 'project-9', 'lyrics', 'Accepted draft', ['lyrics'],
    );
    await expect(service.accept(session('owner-b'), {
      runId: 'run-10', kind: 'style', title: 'Selected fields',
      appliedFields: ['style', 'negativeTags', 'style'],
    })).resolves.toEqual({ documentId: 'document-1', revisionId: 'revision-1' });
    expect(deps.repository.acceptAiRevision).toHaveBeenLastCalledWith(
      'owner-b', 'run-10', null, 'style', 'Selected fields', ['style', 'negativeTags'],
    );
    await expect(service.accept(session('owner-b'), {
      runId: 'run-9', kind: 'executable', title: 'Rejected',
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.accept(session('owner-b'), {
      runId: 'run-9', kind: 'lyrics', title: 'x'.repeat(101),
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.accept(session('owner-b'), {
      runId: 'run-9', kind: 'lyrics', appliedFields: [],
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.accept(session('owner-b'), {
      runId: 'run-9', kind: 'lyrics', appliedFields: ['providerCredential'],
    })).rejects.toMatchObject({ status: 400 });
  });

  it('honors the requested translation target language', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig({ AI_LIVE_ENABLED: 'false' }),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    const result = await service.assist(session(), {
      action: 'lyrics.translate', input: '[Verse]\n夜色落下来',
      context: { language: 'zh-CN', targetLanguage: 'en-US' },
    });
    expect(result.suggestion).toContain('[Translation draft: en-US]');
  });

  it('rejects unsupported, empty and oversized inputs before persistence', async () => {
    const deps = dependencies();
    const service = new AiAssistantService(
      testConfig(),
      deps.repository as unknown as PlatformRepository,
      deps.modelCross as unknown as ModelCrossClient,
      deps.events as unknown as PlatformEventBus,
    );
    await expect(service.assist(session(), { action: 'unknown', input: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(service.assist(session(), { action: 'lyrics.generate', input: '   ' })).rejects.toMatchObject({ status: 400 });
    await expect(service.assist(session(), { action: 'lyrics.generate', input: 'x'.repeat(12_001) })).rejects.toMatchObject({ status: 400 });
    await expect(service.assist(session(), {
      action: 'lyrics.translate', input: 'missing target language',
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.assist(session(), {
      action: 'lyrics.rewrite', input: 'x', options: { rewriteStrength: 'maximum' },
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.assist(session(), {
      action: 'lyrics.generate', input: 'x', context: { secretModel: 'client-controlled' },
    })).rejects.toMatchObject({ status: 400 });
    expect(deps.repository.createAiRun).not.toHaveBeenCalled();
  });
});
