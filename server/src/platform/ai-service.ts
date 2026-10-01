import { createHash, randomUUID } from 'node:crypto';
import type { PlatformConfig } from './config.js';
import { encryptSecret } from './crypto.js';
import { assertModelCrossIdempotencyKey } from './idempotency.js';
import { ModelCrossClient } from './modelcross-client.js';
import { PlatformEventBus } from './queue.js';
import { PlatformRepository } from './repository.js';
import type {
  AiAssistAction,
  AiAssistInput,
  AiAssistResult,
  AuthenticatedSession,
  MusicModelProfile,
} from './types.js';

export class ContentPolicyError extends Error {
  status = 422;
}

export class AiCapabilityUnavailableError extends Error {
  status = 503;
}

export interface AiOperationDefinition {
  action: AiAssistAction;
  operationCode: 'lyrics_generate' | 'lyrics_rewrite' | 'prompt_optimize';
  fallbackCredits: number;
  modelKind: 'lyrics' | 'fast';
  parameters: Record<string, unknown>;
}

export const AI_OPERATION_DEFINITIONS: readonly AiOperationDefinition[] = [
  {
    action: 'lyrics.generate', operationCode: 'lyrics_generate', fallbackCredits: 2, modelKind: 'lyrics',
    parameters: {
      language: { enum: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'], default: 'zh-CN' },
      length: { enum: ['short', 'medium', 'long'], default: 'medium' },
      structure: {
        enum: ['verse_chorus', 'verse_prechorus_chorus_bridge', 'freeform'],
        default: 'verse_prechorus_chorus_bridge',
      },
    },
  },
  {
    action: 'lyrics.continue', operationCode: 'lyrics_rewrite', fallbackCredits: 1, modelKind: 'lyrics',
    parameters: {
      outputMode: 'full_document',
      length: { enum: ['short', 'medium', 'long'], default: 'medium' },
      preserveSections: { type: 'boolean', default: true },
    },
  },
  {
    action: 'lyrics.rewrite', operationCode: 'lyrics_rewrite', fallbackCredits: 1, modelKind: 'lyrics',
    parameters: {
      rewriteStrength: { enum: ['light', 'balanced', 'strong'], default: 'balanced' },
      preserveSections: { type: 'boolean', default: true },
      preserveRhyme: { type: 'boolean', default: true },
    },
  },
  {
    action: 'lyrics.translate', operationCode: 'lyrics_rewrite', fallbackCredits: 1, modelKind: 'lyrics',
    parameters: {
      sourceLanguage: { enum: ['auto', 'zh-CN', 'en-US', 'ja-JP', 'ko-KR'], default: 'auto' },
      targetLanguage: { enum: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'], required: true },
      preserveSections: { type: 'boolean', default: true },
      preserveRhyme: { type: 'boolean', default: true },
    },
  },
  {
    action: 'title.suggest', operationCode: 'prompt_optimize', fallbackCredits: 1, modelKind: 'fast',
    parameters: { maximumField: 'targetModel.maxTitleLength' },
  },
  {
    action: 'style.suggest', operationCode: 'prompt_optimize', fallbackCredits: 1, modelKind: 'fast',
    parameters: { maxStyleTags: 12, maxNegativeTags: 12, maximumField: 'targetModel.maxStyleLength' },
  },
  {
    action: 'prompt.optimize', operationCode: 'prompt_optimize', fallbackCredits: 1, modelKind: 'fast',
    parameters: {
      length: { enum: ['short', 'medium', 'long'], default: 'medium' },
      maximumField: 'targetModel.maxDescriptionLength',
    },
  },
] as const;

const ACTIONS = AI_OPERATION_DEFINITIONS.map((definition) => definition.action);

const ACTION_INSTRUCTIONS: Record<AiAssistAction, string> = {
  'lyrics.generate': '把用户的零散要求整理成完整原创歌词，不把对话中的编号、犹豫或提问写进歌词。准确保留指定的人名和赠歌对象，让名字自然出现在歌词中；围绕用户给出的色彩、场景、触感、声音和节奏写具体画面，保持要求的情绪与速度，不擅自改成宏大或伤感叙事。使用短而可唱的句子和有记忆点的副歌，避免空泛套话。按 options 的长度和结构创作，至少包含清楚的 [Verse]、[Chorus]，可选 [Pre-Chorus]、[Bridge]；标题与风格标签也应呼应用户要求。',
  'lyrics.continue': '延续现有歌词的叙事、语言和韵律，补充新的段落，不重复已有句子。suggestion 必须返回包含原文和续写内容的完整歌词文档，不能只返回增量。',
  'lyrics.rewrite': '保留核心含义，改善押韵、音节长度、画面和副歌记忆点。',
  'lyrics.translate': '把歌词自然翻译为用户要求的语言，保留段落标记、可唱性和情绪，不做逐字硬译。',
  'title.suggest': '根据内容提出一个有辨识度且不侵权的短标题。',
  'style.suggest': '给出可用于音乐模型的风格标签和排除标签，不使用具体在世艺人姓名。',
  'prompt.optimize': '将零散灵感整理为清楚、具体、可控制的音乐生成描述。',
};

const definitionFor = (action: AiAssistAction): AiOperationDefinition => {
  const definition = AI_OPERATION_DEFINITIONS.find((entry) => entry.action === action);
  if (!definition) throw new Error(`AI operation definition is missing for ${action}`);
  return definition;
};

export const aiModelForAction = (config: PlatformConfig, action: AiAssistAction): string =>
  definitionFor(action).modelKind === 'lyrics'
    ? config.modelCross.lyricsModel
    : config.modelCross.fastModel;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestion', 'summary', 'title', 'styleTags', 'negativeTags'],
  properties: {
    suggestion: { type: 'string', minLength: 1, maxLength: 12000 },
    summary: { type: 'string', maxLength: 600 },
    title: { type: 'string', maxLength: 100 },
    styleTags: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 12 },
    negativeTags: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 12 },
  },
} as const;

const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim()).filter(Boolean).slice(0, 12)
  : [];

const boundedString = (value: unknown, name: string, maximum: number): string | undefined => {
  const normalized = string(value);
  if (!normalized) return undefined;
  if (normalized.length > maximum) {
    throw Object.assign(new Error(`${name} is too long`), { status: 400 });
  }
  return normalized;
};

const assertOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[], name: string): void => {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw Object.assign(new Error(`${name} contains unsupported field ${unexpected}`), { status: 400 });
};

function normalizeInput(raw: unknown): AiAssistInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('body must be an object'), { status: 400 });
  const body = raw as Record<string, unknown>;
  assertOnlyKeys(body, ['action', 'input', 'aiModelId', 'targetMusicModelId', 'context', 'options'], 'body');
  if (!ACTIONS.includes(body.action as AiAssistAction)) throw Object.assign(new Error('unsupported AI action'), { status: 400 });
  const input = typeof body.input === 'string' ? body.input : '';
  if (!input.trim()) throw Object.assign(new Error('input is required'), { status: 400 });
  if (input.length > 12_000) throw Object.assign(new Error('input is too long'), { status: 400 });
  const aiModelId = boundedString(body.aiModelId, 'aiModelId', 128);
  if (body.aiModelId !== undefined
    && (!aiModelId || /[\u0000-\u001f\u007f]/.test(aiModelId))) {
    throw Object.assign(new Error('aiModelId is invalid'), { status: 400 });
  }
  const contextObject = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : {};
  assertOnlyKeys(contextObject, [
    'title', 'style', 'language', 'targetLanguage', 'mood', 'projectId',
  ], 'context');
  const optionsObject = body.options && typeof body.options === 'object' && !Array.isArray(body.options)
    ? body.options as Record<string, unknown>
    : {};
  assertOnlyKeys(optionsObject, [
    'length', 'structure', 'rewriteStrength', 'preserveSections', 'preserveRhyme',
  ], 'options');
  const enumOption = <T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      throw Object.assign(new Error(`${name} is invalid`), { status: 400 });
    }
    return value as T;
  };
  const booleanOption = (value: unknown, name: string): boolean | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw Object.assign(new Error(`${name} must be boolean`), { status: 400 });
    return value;
  };
  const targetMusicModelId = boundedString(body.targetMusicModelId, 'targetMusicModelId', 100);
  const language = boundedString(contextObject.language, 'context.language', 32);
  const targetLanguage = boundedString(contextObject.targetLanguage, 'context.targetLanguage', 32);
  if (body.action === 'lyrics.translate' && !targetLanguage) {
    throw Object.assign(new Error('context.targetLanguage is required for lyrics.translate'), { status: 400 });
  }
  const normalizedOptions: NonNullable<AiAssistInput['options']> = {
    length: enumOption(optionsObject.length, ['short', 'medium', 'long'], 'options.length'),
    structure: enumOption(optionsObject.structure, [
      'verse_chorus', 'verse_prechorus_chorus_bridge', 'freeform',
    ], 'options.structure'),
    rewriteStrength: enumOption(optionsObject.rewriteStrength, [
      'light', 'balanced', 'strong',
    ], 'options.rewriteStrength'),
    preserveSections: booleanOption(optionsObject.preserveSections, 'options.preserveSections'),
    preserveRhyme: booleanOption(optionsObject.preserveRhyme, 'options.preserveRhyme'),
  };
  const allowedOptions: Record<AiAssistAction, ReadonlyArray<keyof NonNullable<AiAssistInput['options']>>> = {
    'lyrics.generate': ['length', 'structure'],
    'lyrics.continue': ['length', 'preserveSections'],
    'lyrics.rewrite': ['rewriteStrength', 'preserveSections', 'preserveRhyme'],
    'lyrics.translate': ['preserveSections', 'preserveRhyme'],
    'title.suggest': [],
    'style.suggest': [],
    'prompt.optimize': ['length'],
  };
  const unsupportedOption = Object.entries(normalizedOptions).find(([key, value]) =>
    value !== undefined && !allowedOptions[body.action as AiAssistAction].includes(
      key as keyof NonNullable<AiAssistInput['options']>,
    ));
  if (unsupportedOption) {
    throw Object.assign(new Error(`options.${unsupportedOption[0]} is not supported for ${String(body.action)}`), { status: 400 });
  }
  return {
    action: body.action as AiAssistAction,
    input,
    aiModelId,
    targetMusicModelId,
    context: {
      title: boundedString(contextObject.title, 'context.title', 100),
      style: boundedString(contextObject.style, 'context.style', 1000),
      language,
      targetLanguage,
      mood: boundedString(contextObject.mood, 'context.mood', 100),
      projectId: boundedString(contextObject.projectId, 'context.projectId', 100),
    },
    options: normalizedOptions,
  };
}

function enforcePolicy(input: AiAssistInput): void {
  const impersonation = /(?:模仿|仿照|一模一样|声音像|in the (?:exact )?style of|sound exactly like)\s*[\p{L}\p{N}·.' -]{2,40}/iu;
  if (impersonation.test(input.input)) {
    throw new ContentPolicyError('不能直接模仿具体在世艺人；请改为描述流派、年代、情绪、乐器和演唱特征。');
  }
}

type AiSuggestion = Pick<
  AiAssistResult,
  'action' | 'original' | 'suggestion' | 'summary' | 'title' | 'styleTags' | 'negativeTags'
>;

function demoResult(input: AiAssistInput): AiSuggestion {
  const contextStyle = input.context?.style ? `，风格为 ${input.context.style}` : '';
  switch (input.action) {
    case 'lyrics.generate':
      return {
        action: input.action, original: input.input,
        suggestion: `[Verse 1]\n城市把黄昏折进车窗\n我把没说的话留给远方\n灯火沿着雨线慢慢摇晃\n这一程仍有你的回响\n\n[Pre-Chorus]\n如果时间愿意放慢一秒\n让我记住心跳的坐标\n\n[Chorus]\n我在夜航里追一束微光\n越过沉默也越过迷惘\n就算故事还没有终章\n也要把名字唱成星芒`,
        summary: `围绕“${input.input.slice(0, 30)}”生成了主歌、预副歌和记忆点副歌${contextStyle}。`,
        title: input.context?.title || '夜航微光', styleTags: input.context?.style ? [input.context.style] : ['Mandopop', 'cinematic', 'emotional'],
        negativeTags: ['harsh vocal', 'atonal'],
      };
    case 'lyrics.continue':
      return {
        action: input.action, original: input.input,
        suggestion: `${input.input}\n\n[Bridge]\n让告别不只是散场\n让遗憾也学会发光\n\n[Final Chorus]\n我在夜航里守住微光\n终于敢回头拥抱过往`,
        summary: '新增 Bridge 和 Final Chorus，并保持原有段落与叙事方向。',
        title: input.context?.title || '', styleTags: input.context?.style ? [input.context.style] : [], negativeTags: [],
      };
    case 'lyrics.rewrite':
      return {
        action: input.action, original: input.input,
        suggestion: input.input.split('\n').map((line) => line.trim()).filter(Boolean).join('\n'),
        summary: '统一了行长和段落节奏；演示模式不会静默覆盖原文，请确认后应用。',
        title: input.context?.title || '', styleTags: input.context?.style ? [input.context.style] : [], negativeTags: [],
      };
    case 'lyrics.translate':
      return {
        action: input.action, original: input.input,
        suggestion: `[Translation draft: ${input.context?.targetLanguage || 'English'}]\n${input.input}`,
        summary: '已生成保留段落标记的可唱翻译草稿；启用 ModelCross AI 后将返回真实翻译。',
        title: input.context?.title || '', styleTags: [], negativeTags: [],
      };
    case 'title.suggest':
      return { action: input.action, original: input.input, suggestion: '夜航微光', summary: '标题提取了夜色、旅程和希望三个意象。', title: '夜航微光', styleTags: [], negativeTags: [] };
    case 'style.suggest':
      return {
        action: input.action, original: input.input,
        suggestion: 'Mandopop, dream pop, cinematic synth, warm female vocal, memorable chorus',
        summary: '用流派、编制、情绪和演唱特征表达风格，避免使用具体艺人姓名。',
        title: '', styleTags: ['Mandopop', 'dream pop', 'cinematic synth', 'warm vocal'],
        negativeTags: ['metal', 'harsh vocal', 'atonal'],
      };
    case 'prompt.optimize':
      return {
        action: input.action, original: input.input,
        suggestion: `创作一首${input.context?.language || '华语'}流行歌曲，主题是${input.input}。${input.context?.mood ? `情绪为${input.context.mood}。` : ''}${input.context?.style ? `采用${input.context.style}。` : ''}副歌需要简洁、有记忆点，编曲从克制主歌逐步推进到开阔副歌。`,
        summary: '补齐了语言、结构、情绪推进和副歌目标。', title: '', styleTags: input.context?.style ? [input.context.style] : [], negativeTags: [],
      };
  }
}

function validateSuggestionResult(
  input: AiAssistInput,
  result: AiSuggestion,
  targetProfile: MusicModelProfile | null,
): void {
  if (!result.suggestion.trim()) throw new Error('AI suggestion is empty');
  if (result.suggestion.length > 12_000) throw new Error('AI suggestion exceeds the global output limit');
  if (result.summary.length > 600) throw new Error('AI summary exceeds the output limit');
  if ((result.title?.length ?? 0) > 100) throw new Error('AI title exceeds the global output limit');
  for (const tag of [...(result.styleTags ?? []), ...(result.negativeTags ?? [])]) {
    if (tag.length > 100) throw new Error('AI style tag exceeds the output limit');
  }
  if (!targetProfile) return;
  const limits = targetProfile.capabilities;
  if ((result.title?.length ?? 0) > limits.maxTitle) {
    throw new Error(`AI title exceeds ${targetProfile.displayName} title limit`);
  }
  if (input.action === 'title.suggest' && result.suggestion.length > limits.maxTitle) {
    throw new Error(`AI title suggestion exceeds ${targetProfile.displayName} title limit`);
  }
  if (input.action.startsWith('lyrics.') && result.suggestion.length > limits.maxLyrics) {
    throw new Error(`AI lyrics exceed ${targetProfile.displayName} lyrics limit`);
  }
  if (input.action === 'style.suggest') {
    const style = result.styleTags?.length ? result.styleTags.join(', ') : result.suggestion;
    if (style.length > limits.maxStyle) throw new Error(`AI style exceeds ${targetProfile.displayName} style limit`);
  }
  if ((result.negativeTags ?? []).join(', ').length > limits.maxStyle) {
    throw new Error(`AI negative tags exceed ${targetProfile.displayName} style limit`);
  }
  if (input.action === 'prompt.optimize' && result.suggestion.length > limits.maxDescription) {
    throw new Error(`AI prompt exceeds ${targetProfile.displayName} description limit`);
  }
}

function validateContinuationPreservesSource(input: AiAssistInput, result: AiSuggestion): void {
  if (input.action !== 'lyrics.continue') return;
  const normalizedSource = input.input.replace(/\r\n/g, '\n').trim();
  const normalizedSuggestion = result.suggestion.replace(/\r\n/g, '\n');
  if (!normalizedSuggestion.includes(normalizedSource)) {
    throw new Error('AI continuation did not preserve the original lyrics document');
  }
}

function structuredFields(input: AiAssistInput, result: AiSuggestion): AiAssistResult['fields'] {
  const style = result.styleTags?.length ? result.styleTags.join(', ') : undefined;
  const negativeTags = result.negativeTags?.length ? result.negativeTags.join(', ') : undefined;
  if (input.action.startsWith('lyrics.')) {
    return {
      lyrics: result.suggestion,
      ...(result.title ? { title: result.title } : {}),
      ...(style ? { style } : {}),
      ...(negativeTags ? { negativeTags } : {}),
    };
  }
  if (input.action === 'title.suggest') return { title: result.title || result.suggestion };
  if (input.action === 'style.suggest') {
    return { style: style || result.suggestion, ...(negativeTags ? { negativeTags } : {}) };
  }
  return { prompt: result.suggestion };
}

export class AiAssistantService {
  constructor(
    private readonly config: PlatformConfig,
    private readonly repository: PlatformRepository,
    private readonly modelCross: ModelCrossClient,
    private readonly events: PlatformEventBus,
  ) {}

  async assist(session: AuthenticatedSession, raw: unknown, idempotencyKey: string = randomUUID()): Promise<AiAssistResult> {
    assertModelCrossIdempotencyKey(idempotencyKey);
    const input = normalizeInput(raw);
    enforcePolicy(input);
    const requestDigest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const persistedReplay = await this.repository.replayAiRun(
      session.user.subject,
      idempotencyKey,
      requestDigest,
    );
    if (persistedReplay) {
      const replayBilling = (persistedReplay as Partial<AiAssistResult>).billing;
      if (this.config.authMode !== 'development'
        && (!replayBilling || replayBilling.status === 'preview')) {
        throw new AiCapabilityUnavailableError('OIDC 环境禁止回放本地开发 AI 预览结果');
      }
      return persistedReplay;
    }
    const definition = definitionFor(input.action);
    const model = input.aiModelId || aiModelForAction(this.config, input.action);
    if (!this.config.modelCross.aiModels.includes(model)) {
      throw Object.assign(new Error(`AI 模型 ${model} 未在 MuseFlow 模型目录中启用`), { status: 400 });
    }
    const localDirect = this.config.authMode === 'development' && this.config.modelCross.aiLocalLive;
    const developmentPreview = this.config.authMode === 'development'
      && !this.config.modelCross.aiLive
      && !localDirect;
    let targetProfile: MusicModelProfile | null = null;
    if (input.targetMusicModelId) {
      const profiles = await this.repository.listModelProfiles();
      targetProfile = profiles.find((profile) => profile.id === input.targetMusicModelId && profile.enabled) ?? null;
      if (!targetProfile) {
        throw Object.assign(new Error('targetMusicModelId is not supported by MuseFlow'), { status: 400 });
      }
    }

    let estimatedCredits = definition.fallbackCredits;
    let liveQuote: Awaited<ReturnType<ModelCrossClient['quote']>> | null = null;
    let aiRelayToken: string | null = null;
    if (!developmentPreview) {
      if (!this.config.modelCross.aiLive && !localDirect) {
        throw new AiCapabilityUnavailableError('AI 能力尚未启用；当前登录环境不会返回演示内容');
      }
      if (this.config.modelCross.aiLive && !this.config.modelCross.billingLive) {
        throw new AiCapabilityUnavailableError('ModelCross 计费写入尚未启用，禁止发起真实 AI 调用');
      }
      aiRelayToken = this.config.modelCross.aiRelayToken;
      if (!aiRelayToken) throw new AiCapabilityUnavailableError('ModelCross AI Relay 凭据未配置');
      if (this.config.modelCross.aiLive) {
        const [catalog, authorizedModelIds, relayAuthorizedModelIds] = await Promise.all([
          this.modelCross.musicOperationCatalog(session.accessToken, [{
            action: definition.action,
            operationCode: definition.operationCode,
            fallbackCredits: definition.fallbackCredits,
          }]),
          this.modelCross.musicModelIds(session.accessToken),
          this.modelCross.musicModelIds(aiRelayToken),
        ]);
        const catalogItem = catalog[0];
        if (!catalogItem?.available || catalogItem.estimatedCredits === null || !catalogItem.priceVersion) {
          throw new AiCapabilityUnavailableError(catalogItem?.reason ?? 'ModelCross 价格目录尚未配置此 AI 操作');
        }
        if (!catalogItem.chargingEnabled) {
          throw new AiCapabilityUnavailableError(catalogItem.reason ?? 'ModelCross 尚未开放此 AI 操作的真实扣费');
        }
        if (!authorizedModelIds.includes(model)) {
          throw new AiCapabilityUnavailableError(`当前 ModelCross 账户未授权 AI 模型 ${model}`);
        }
        if (!relayAuthorizedModelIds.includes(model)) {
          throw new AiCapabilityUnavailableError(`MuseFlow AI Relay 未授权模型 ${model}`);
        }
        if (input.targetMusicModelId && !authorizedModelIds.includes(input.targetMusicModelId)) {
          throw new AiCapabilityUnavailableError(`当前 ModelCross 账户未授权目标音乐模型 ${input.targetMusicModelId}`);
        }
        liveQuote = await this.modelCross.quote(session.accessToken, {
          operationCode: definition.operationCode,
          expectedItems: 1,
          priceVersion: catalogItem.priceVersion,
          fallbackCredits: catalogItem.estimatedCredits,
        });
        if (liveQuote.operationCode !== definition.operationCode
          || !Number.isFinite(liveQuote.estimatedCredits)
          || liveQuote.estimatedCredits < 0
          || !liveQuote.priceVersion
          || liveQuote.priceVersion === 'unknown'
          || liveQuote.priceVersion !== catalogItem.priceVersion
          || liveQuote.estimatedCredits !== catalogItem.estimatedCredits) {
          throw new AiCapabilityUnavailableError('ModelCross 返回了不一致的 AI 报价');
        }
        estimatedCredits = liveQuote.estimatedCredits;
      } else {
        estimatedCredits = 0;
      }
    }

    const id = randomUUID();
    const promptVersion = 'museflow-ai-v1';
    const replay = await this.repository.createAiRun({
      id, ownerSubject: session.user.subject, projectId: input.context?.projectId ?? null,
      capabilityKey: input.action, modelAlias: model, promptVersion, original: input.input, estimatedCredits,
      idempotencyKey,
      requestDigest,
      maxConcurrent: this.config.limits.maxConcurrentAiRuns,
    });
    if (replay) return replay;
    let billingCredential = session.accessToken;
    let reservation: { operationId: string; reservationId: string } | null = null;
    try {
      // Work Billing reservations are only created for the production-style live
      // path. Local direct mode intentionally sends no reservation or settlement.
      if (liveQuote) {
        const operationCode = definition.operationCode;
        billingCredential = await this.modelCross.taskToken(session.accessToken, {
          credentialId: id,
          resourceId: id,
          allowedOperations: [operationCode],
          allowedModels: [model],
          maxCost: Math.max(liveQuote.estimatedCredits, 1),
          idempotencyKey,
          // The token is resource-, operation-, model- and cost-bound. Keep it
          // alive for the maximum supported recovery window so a delayed SQL
          // reconciler can still release an otherwise orphaned reservation.
          ttlSeconds: 4 * 60 * 60,
        });
        await this.repository.setAiRunCredential(
          id,
          session.user.subject,
          encryptSecret(billingCredential, this.config.sessionSecret),
        );
        const reserved = await this.modelCross.reserve(billingCredential, {
          operationCode,
          resourceId: id,
          priceVersion: liveQuote.priceVersion,
          idempotencyKey,
          expectedItems: 1,
        }, liveQuote.estimatedCredits);
        reservation = { operationId: reserved.operationId, reservationId: reserved.reservationId };
        await this.repository.setAiRunReservation({
          id, ownerSubject: session.user.subject, operationCode, idempotencyKey,
          operationId: reserved.operationId, reservationId: reserved.reservationId,
          priceVersion: reserved.priceVersion, reservedCredits: reserved.estimatedCredits,
          status: reserved.status,
        });
      }
      let result: AiSuggestion;
      let requestId: string | null = null;
      if (liveQuote || localDirect) {
        if (!aiRelayToken) throw new AiCapabilityUnavailableError('ModelCross AI Relay 凭据未配置');
        const response = await this.modelCross.aiJson(aiRelayToken, {
          action: input.action,
          model,
          schema: SCHEMA,
          system: `你是 MuseFlow 的原创音乐创作助手。${ACTION_INSTRUCTIONS[input.action]}\n禁止声称模仿具体在世艺人，改用流派、年代、情绪、乐器和演唱特征。输出必须是指定 JSON。`,
          prompt: JSON.stringify({
            input: input.input,
            context: input.context ?? {},
            options: input.options ?? {},
            targetMusicModelId: input.targetMusicModelId ?? null,
            ...(targetProfile ? {
              targetMusicModelLimits: {
                maxTitle: targetProfile.capabilities.maxTitle,
                maxDescription: targetProfile.capabilities.maxDescription,
                maxStyle: targetProfile.capabilities.maxStyle,
                maxLyrics: targetProfile.capabilities.maxLyrics,
              },
            } : {}),
          }),
        });
        result = {
          action: input.action,
          original: input.input,
          suggestion: string(response.payload.suggestion),
          summary: string(response.payload.summary),
          title: string(response.payload.title) || undefined,
          styleTags: stringArray(response.payload.styleTags),
          negativeTags: stringArray(response.payload.negativeTags),
        };
        requestId = response.requestId;
      } else {
        result = demoResult(input);
      }
      validateSuggestionResult(input, result, targetProfile);
      validateContinuationPreservesSource(input, result);
      const completed: AiAssistResult = {
        id,
        model,
        estimatedCredits,
        ...(!liveQuote ? { actualCredits: 0 } : {}),
        outputMode: input.action === 'lyrics.continue' ? 'full_document' : 'replacement',
        fields: structuredFields(input, result),
        billing: {
          operationCode: definition.operationCode,
          priceVersion: liveQuote?.priceVersion
            ?? (localDirect ? 'modelcross-local-direct-v1' : 'museflow-development-preview-v1'),
          estimatedCredits,
          ...(!liveQuote ? { actualCredits: 0 } : {}),
          status: liveQuote ? 'reserved' : localDirect ? 'not_reserved' : 'preview',
        },
        createdAt: new Date().toISOString(),
        ...result,
      };
      await this.repository.completeAiRun(id, session.user.subject, { completed, requestId });
      if (reservation) {
        try {
          const settled = await this.modelCross.settle(billingCredential, 'capture', {
            operation_id: reservation.operationId,
            reservation_id: reservation.reservationId,
            successful_items: 1,
          }, idempotencyKey);
          const actualCredits = Number(settled.captured_amount ?? settled.settled_credits ?? estimatedCredits);
          completed.actualCredits = actualCredits;
          completed.billing.actualCredits = actualCredits;
          completed.billing.status = 'captured';
          await this.repository.settleAiRunBilling(id, session.user.subject, 'captured', actualCredits);
          await this.repository.completeAiRun(id, session.user.subject, { completed, requestId });
        } catch (error) {
          completed.billing.status = 'reconcile_required';
          await this.repository.settleAiRunBilling(
            id,
            session.user.subject,
            'reconcile_required',
            0,
            (error as Error).message,
          ).catch((mirrorError) => console.error(JSON.stringify({
            level: 'error', event: 'ai.billing.mirror_reconcile_failed', id,
            error: (mirrorError as Error).message,
          })));
          await this.repository.completeAiRun(id, session.user.subject, { completed, requestId })
            .catch((resultError) => console.error(JSON.stringify({
              level: 'error', event: 'ai.result.reconcile_status_persist_failed', id,
              error: (resultError as Error).message,
            })));
        }
      }
      await this.events.publish({
        type: 'ai.assist.completed', subject: session.user.subject, resourceId: id,
        payload: { id, action: input.action, estimatedCredits },
      }).catch((eventError) => console.error(JSON.stringify({
        level: 'error', event: 'ai.assist.event_publish_failed', id, error: (eventError as Error).message,
      })));
      return completed;
    } catch (error) {
      if (reservation) {
        try {
          await this.modelCross.settle(billingCredential, 'release', {
            operation_id: reservation.operationId,
            reservation_id: reservation.reservationId,
          }, idempotencyKey);
          await this.repository.settleAiRunBilling(id, session.user.subject, 'released', 0, (error as Error).message);
        } catch (releaseError) {
          await this.repository.settleAiRunBilling(
            id,
            session.user.subject,
            'reconcile_required',
            0,
            `${(error as Error).message}; release pending: ${(releaseError as Error).message}`,
          ).catch((mirrorError) => console.error(JSON.stringify({
            level: 'error', event: 'ai.billing.release_reconcile_failed', id,
            error: (mirrorError as Error).message,
          })));
        }
      }
      await this.repository.failAiRun(id, session.user.subject, (error as Error).message);
      throw error;
    }
  }

  async accept(session: AuthenticatedSession, input: {
    runId: string;
    projectId?: string;
    kind?: string;
    title?: string;
    appliedFields?: unknown;
  }) {
    const allowedKinds = new Set(['lyrics', 'prompt', 'style', 'title']);
    const allowedFields = new Set(['title', 'lyrics', 'style', 'negativeTags', 'prompt']);
    const kind = input.kind || 'lyrics';
    const title = (input.title || 'AI 创作版本').trim();
    if (!allowedKinds.has(kind)) throw Object.assign(new Error('unsupported revision kind'), { status: 400 });
    if (!title || title.length > 100) throw Object.assign(new Error('revision title is invalid'), { status: 400 });
    const fallbackField = kind === 'lyrics' ? 'lyrics' : kind === 'prompt' ? 'prompt' : kind;
    const appliedFields = input.appliedFields === undefined
      ? [fallbackField]
      : Array.isArray(input.appliedFields)
        ? [...new Set(input.appliedFields)]
        : [];
    if (!appliedFields.length
      || appliedFields.length > allowedFields.size
      || appliedFields.some((field) => typeof field !== 'string' || !allowedFields.has(field))) {
      throw Object.assign(new Error('appliedFields must contain one or more supported AI result fields'), { status: 400 });
    }
    return this.repository.acceptAiRevision(
      session.user.subject,
      input.runId,
      input.projectId ?? null,
      kind,
      title,
      appliedFields as string[],
    );
  }
}
