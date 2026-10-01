import type { AiAssistAction, AiOperationProfile } from '../src/types';

const codeFor = (action: AiAssistAction) => action === 'lyrics.generate'
  ? 'lyrics_generate'
  : action.startsWith('lyrics.') ? 'lyrics_rewrite' : 'prompt_optimize';

export const AI_OPERATIONS: AiOperationProfile[] = ([
  'lyrics.generate',
  'lyrics.continue',
  'lyrics.rewrite',
  'lyrics.translate',
  'title.suggest',
  'style.suggest',
  'prompt.optimize',
] as AiAssistAction[]).map((action) => ({
  action,
  operationCode: codeFor(action),
  model: action.startsWith('lyrics.') ? 'gpt-lyrics' : 'gpt-fast',
  modelAuthorized: true,
  available: true,
  catalogAvailable: true,
  estimatedCredits: action === 'lyrics.generate' ? 2 : 1,
  priceVersion: 'test-ai-price-v1',
  chargingEnabled: true,
  executable: true,
  previewExecutable: false,
  parameters: {},
}));
