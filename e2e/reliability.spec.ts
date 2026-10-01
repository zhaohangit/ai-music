import type { Page, Request as PlaywrightRequest } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, expectNoSeriousAxeViolations, navigateWorkspace, test } from './fixtures';

const MODEL = {
  id: 'chirp-fenix',
  displayName: 'Suno V5.5',
  provider: 'MXAPI',
  description: '服务端动态模型',
  badge: '推荐',
  enabled: true,
  estimatedCredits: { generatePair: 20, extendPair: 20, coverPair: 24, remasterPair: 24 },
  capabilities: {
    simple: true,
    custom: true,
    instrumental: true,
    negativeTags: true,
    vocalGender: true,
    styleWeight: { min: 0, max: 1, step: 0.01, default: 0.65 },
    weirdness: { min: 0, max: 1, step: 0.01, default: 0.5 },
    operations: ['generate', 'sound', 'extend', 'cover', 'remaster', 'upload', 'upload_extend', 'whole_song', 'crop', 'speed', 'aligned_lyrics', 'video', 'convert_wav'],
    maxTitleLength: 100,
    maxDescriptionLength: 1000,
    maxStyleLength: 1000,
    maxLyricsLength: 5000,
    maxNegativeTagsLength: 1000,
  },
};

const GENERATION_OVERRIDES = [
  'model', 'mode', 'title', 'description', 'style', 'lyrics', 'instrumental',
  'negativeTags', 'vocalGender', 'styleWeight', 'weirdness',
];

const SOUND_PARAMETERS = {
  title: { type: 'string', required: true, maxLength: 100, wireName: 'title' },
  tags: { type: 'string', required: true, maxLength: 1000, wireName: 'tags' },
  model: { type: 'string', required: true, enum: ['chirp-crow', 'chirp-fenix'], wireName: 'mv' },
  tempo: { type: 'number', required: false, default: 99, wireName: 'tempo' },
  key: { type: 'string', required: false, default: 'D', wireName: 'key' },
  loop: { type: 'boolean', required: false, default: true, wireName: 'loop' },
};

const OPERATION = (action: string, operationCode: string, estimatedCredits: number, parameters?: Record<string, unknown>) => ({
  action, operationCode, available: true, estimatedCredits, priceVersion: 'e2e-price-v1',
  chargingEnabled: false, preview: true, executable: true, previewExecutable: true, parameters: parameters ?? null,
});

const OPERATIONS = [
  OPERATION('generate', 'generation_pair', 20),
  {
    ...OPERATION('sound', 'sound_pair', 20, SOUND_PARAMETERS),
    outputCount: 2,
    modelIds: ['chirp-crow', 'chirp-fenix'],
  },
  OPERATION('extend', 'extend_pair', 20, { continueAt: { min: 0, max: 600, step: 1, default: 90 }, generationOverrides: GENERATION_OVERRIDES }),
  OPERATION('cover', 'cover_pair', 24, { generationOverrides: GENERATION_OVERRIDES }),
  OPERATION('remaster', 'remaster_pair', 24, { variation: { enum: ['subtle', 'normal', 'high'], modelIds: ['chirp-crow', 'chirp-fenix'], default: 'normal' } }),
  OPERATION('upload', 'upload_single', 5, { acceptedMimeTypes: ['audio/wav'], acceptedExtensions: ['.wav'], maxBytes: 10_485_760, maxDurationSeconds: 120 }),
  OPERATION('upload', 'upload_copyright_single', 20, { acceptedMimeTypes: ['audio/wav'], acceptedExtensions: ['.wav'], maxBytes: 10_485_760, maxDurationSeconds: 120 }),
  OPERATION('upload_extend', 'upload_extend_pair', 25, { continueAt: { min: 0, max: 600, step: 1, default: 0, maximumField: 'upload.duration' }, audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 }, generationOverrides: GENERATION_OVERRIDES }),
  OPERATION('upload_extend', 'upload_copyright_extend_pair', 40, { continueAt: { min: 0, max: 600, step: 1, default: 0, maximumField: 'upload.duration' }, audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 }, generationOverrides: GENERATION_OVERRIDES }),
  OPERATION('whole_song', 'whole_song_single', 12),
  OPERATION('crop', 'crop_single', 4, { startSeconds: { min: 0, default: 0 }, endSeconds: { exclusiveMinimumField: 'startSeconds', maximumField: 'track.duration' } }),
  OPERATION('speed', 'speed_single', 6, { multiplier: { enum: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], default: 1 }, keepPitch: { type: 'boolean', default: true }, title: { type: 'string', required: false } }),
  OPERATION('aligned_lyrics', 'aligned_lyrics_single', 3, { lyrics: { minLength: 1, maxLength: 5000 } }),
  OPERATION('video', 'video_single', 18),
  OPERATION('convert_wav', 'convert_wav_single', 5),
];

const AI_OPERATION = (action: string, operationCode: string, estimatedCredits: number) => ({
  action, operationCode, model: action.startsWith('lyrics.') ? 'gpt-lyrics' : 'gpt-fast',
  modelAuthorized: true, available: true, catalogAvailable: true,
  estimatedCredits, priceVersion: 'e2e-ai-price-v1', chargingEnabled: false,
  executable: true, previewExecutable: true,
  reason: '本地开发预览，不会调用真实 AI 或扣除积分', parameters: {},
});

const AI_OPERATIONS = [
  AI_OPERATION('lyrics.generate', 'lyrics_generate', 2),
  AI_OPERATION('lyrics.continue', 'lyrics_rewrite', 1),
  AI_OPERATION('lyrics.rewrite', 'lyrics_rewrite', 1),
  AI_OPERATION('lyrics.translate', 'lyrics_rewrite', 1),
  AI_OPERATION('title.suggest', 'prompt_optimize', 1),
  AI_OPERATION('style.suggest', 'prompt_optimize', 1),
  AI_OPERATION('prompt.optimize', 'prompt_optimize', 1),
];

const ACCOUNT = {
  balance: 1240,
  availableBalance: 1200,
  reservedBalance: 40,
  currency: 'credits',
  subscription: { name: 'Creator', status: 'active', renewsAt: null, includedCredits: 2000 },
  topUpUrl: 'https://modelcross.example/topup',
  ordersUrl: 'https://modelcross.example/orders',
  accountUrl: 'https://modelcross.example/account',
};

const AUTH_SESSION = {
  authenticated: true,
  demo: false,
  user: {
    id: 'e2e-user', subject: 'e2e-user', name: 'E2E User', email: 'e2e@example.test', role: 'user',
  },
  account: ACCOUNT,
};

const PROJECT = {
  id: 'server-project-1', title: '服务端真实项目', description: '只来自 API',
  trackCount: 1, status: 'active', updatedAt: '2026-08-25T00:00:00.000Z',
};

const DONE_TRACK = {
  id: 'done-track-1', groupId: 'batch-done', projectId: null, takeIndex: 0,
  title: '可继续创作的完成作品', mode: 'custom', operation: 'generate',
  description: '真实完成作品', style: 'Dream Pop', lyrics: '[Verse]\n测试歌词',
  instrumental: false, model: 'chirp-fenix', negativeTags: '', vocalGender: 'auto',
  styleWeight: 0.65, weirdness: 0.5, status: 'done', progress: 1, stage: 'done',
  eta: null, elapsed: 30, error: null, file: 'done-track-1.mp3', coverFile: null,
  audioUrl: null, imageUrl: null, videoUrl: null, upstreamTaskId: 'upstream-done',
  upstreamStatus: 'SUCCESS', customId: 'custom-done', providerRecordId: 119, duration: 128, format: 'mp3',
  // Provider merchant points are deliberately different from the owner-scoped
  // ModelCross projection so the UI test can prove they are never conflated.
  pointsCost: 999, pointsRefunded: true,
  billingStatus: 'captured', estimatedCredits: 20, settledCredits: 10,
  createdAt: '2026-08-25T00:00:00.000Z',
  finishedAt: '2026-08-25T00:02:00.000Z',
};

const QUEUED_TRACK = {
  ...DONE_TRACK,
  id: 'queued-track-1', groupId: 'batch-queued', title: '仍在生成与结算', status: 'queued',
  progress: 0, stage: 'queued', elapsed: 0, file: null, upstreamTaskId: 'upstream-queued',
  upstreamStatus: 'queued', customId: null, duration: 0, pointsCost: null, pointsRefunded: false,
  billingStatus: 'reserved', settledCredits: null, finishedAt: null,
};

const modelVariant = (
  id: string,
  displayName: string,
  overrides: Partial<typeof MODEL.capabilities>,
) => ({
  ...MODEL,
  id,
  displayName,
  badge: null,
  capabilities: { ...MODEL.capabilities, ...overrides },
});

const V5_MODEL = modelVariant('chirp-crow', 'Suno V5', {
  operations: [...MODEL.capabilities.operations, 'remaster'],
});
const V4_MODEL = modelVariant('chirp-v4', 'Suno V4', {
  vocalGender: false,
  styleWeight: null as unknown as typeof MODEL.capabilities.styleWeight,
  weirdness: null as unknown as typeof MODEL.capabilities.weirdness,
  operations: [...MODEL.capabilities.operations.filter((operation) => operation !== 'sound'), 'remaster'],
});
const V35_MODEL = modelVariant('chirp-v3-5', 'Suno V3.5', {
  vocalGender: false,
  styleWeight: null as unknown as typeof MODEL.capabilities.styleWeight,
  weirdness: null as unknown as typeof MODEL.capabilities.weirdness,
  operations: MODEL.capabilities.operations.filter((operation) => operation !== 'sound' && operation !== 'remaster'),
});

const PROJECT_TRACK = {
  ...DONE_TRACK,
  id: 'project-track-1', groupId: 'batch-project', projectId: PROJECT.id, title: '项目内的真实作品',
};

const OTHER_PROJECT_TRACK = {
  ...DONE_TRACK,
  id: 'other-project-track-1', groupId: 'batch-other-project', projectId: 'other-project', title: '其他项目作品',
};

const STREAM_TASK = {
  id: 'stream-task-1', batchId: 'stream-batch-1', title: '实时推进任务', operation: 'generate',
  model: 'chirp-fenix', status: 'generating', progress: 0.35, estimatedCredits: 20,
  chargedCredits: null, createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:01:00.000Z',
};

const COMPLETED_STREAM_TASK = {
  ...STREAM_TASK,
  status: 'completed', progress: 1, chargedCredits: 20, updatedAt: '2026-08-25T01:05:00.000Z',
};

type MockReply = { body: unknown; status?: number; delayMs?: number };
type MockOverride = (request: PlaywrightRequest) => MockReply | undefined;
type MockPlatformOptions = { controlledEvents?: boolean };

async function installMockPlatform(page: Page, override?: MockOverride, options: MockPlatformOptions = {}): Promise<void> {
  if (options.controlledEvents) {
    await page.addInitScript(() => {
      type Listener = EventListenerOrEventListenerObject;
      const sources: ControlledEventSource[] = [];

      class ControlledEventSource {
        readonly url: string;
        onopen: ((event: Event) => unknown) | null = null;
        onerror: ((event: Event) => unknown) | null = null;
        private readonly listeners = new Map<string, Set<Listener>>();

        constructor(url: string | URL) {
          this.url = String(url);
          sources.push(this);
          window.setTimeout(() => this.onopen?.(new Event('open')), 0);
        }

        addEventListener(type: string, listener: Listener | null): void {
          if (!listener) return;
          const listeners = this.listeners.get(type) ?? new Set<Listener>();
          listeners.add(listener);
          this.listeners.set(type, listeners);
        }

        removeEventListener(type: string, listener: Listener | null): void {
          if (listener) this.listeners.get(type)?.delete(listener);
        }

        emit(type: string): void {
          const event = new MessageEvent(type, { data: '{}' });
          this.listeners.get(type)?.forEach((listener) => {
            if (typeof listener === 'function') listener.call(this, event);
            else listener.handleEvent(event);
          });
        }

        close(): void {
          const index = sources.indexOf(this);
          if (index >= 0) sources.splice(index, 1);
          this.listeners.clear();
        }
      }

      Object.defineProperty(window, 'EventSource', { configurable: true, value: ControlledEventSource });
      Object.defineProperty(window, '__emitMuseFlowEvent', {
        configurable: true,
        value: (type: string) => sources.forEach((source) => source.emit(type)),
      });
    });
  } else {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
    });
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const custom = override?.(request);
    if (custom) {
      if (custom.delayMs) await new Promise((resolve) => setTimeout(resolve, custom.delayMs));
      await route.fulfill({
        status: custom.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(custom.body),
      });
      return;
    }

    const { pathname } = new URL(request.url());
    const defaults: Record<string, unknown> = {
      '/api/mv/counts': { active: 0, attention: 0 },
      '/api/session': AUTH_SESSION,
      '/api/me': AUTH_SESSION,
      '/api/health': {
        provider: 'mxapi', configured: true, upstreamReachable: true, ready: true,
        active: 0, queued: 0, balance: 5000, billingLive: false, providerDirectBilling: false, models: [MODEL.id],
      },
      '/api/library': [],
      '/api/catalog/music-models': [MODEL],
      '/api/catalog/music-operations': OPERATIONS,
      '/api/catalog/ai-models': [
        {
          id: 'gpt-lyrics', displayName: 'GPT Music', provider: 'OpenAI', description: '歌词创作模型',
          badge: '歌词推荐', enabled: true, reason: null, defaultForLyrics: true, defaultForFastTasks: false,
        },
        {
          id: 'gpt-fast', displayName: 'Gemini Music', provider: 'Google', description: '快速灵感模型',
          badge: '快速推荐', enabled: true, reason: null, defaultForLyrics: false, defaultForFastTasks: true,
        },
      ],
      '/api/catalog/ai-operations': AI_OPERATIONS,
      '/api/projects': [],
      '/api/uploads': [],
      '/api/tasks': [],
      '/api/billing/summary': { account: ACCOUNT, monthSpent: 0, monthGeneratedTracks: 0, pendingReservations: 40 },
      '/api/billing/orders': [],
      '/api/auth/logout': { ok: true },
      '/api/settings': {
        apiBaseUrl: '', apiKeySet: false,
        source: { apiBaseUrl: 'none', apiKey: 'none' },
        locked: { apiBaseUrl: true, apiKey: true }, platformManaged: true, adminUrl: null,
      },
    };
    if (pathname in defaults) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(defaults[pathname]) });
      return;
    }
    if (/^\/api\/tracks\/[^/]+\/assets\/jobs$/.test(pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `unhandled ${request.method()} ${pathname}` }) });
  });
}

test('session failure is explicit and reconnects without a demo identity', async ({ page }) => {
  let sessionAvailable = false;
  await installMockPlatform(page, (request) => {
    if (new URL(request.url()).pathname !== '/api/session') return undefined;
    return sessionAvailable
      ? { body: AUTH_SESSION }
      : { status: 503, body: { error: 'session service unavailable' } };
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '暂时无法进入 MuseFlow' })).toBeVisible();
  await expect(page.getByText(/无法确认登录状态：session service unavailable/)).toBeVisible();
  await expect(page.getByText('E2E User')).toHaveCount(0);
  sessionAvailable = true;
  await page.getByRole('button', { name: '重新连接' }).click();
  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Sound workbench follows the exact MXAPI fields and a ModelCross dynamic quote', async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  let idempotencyKey = '';
  const dynamicSoundOperations = OPERATIONS.map((entry) => entry.operationCode === 'sound_pair'
    ? { ...entry, estimatedCredits: 37, priceVersion: 'modelcross-sound-e2e-v7' }
    : entry);
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/catalog/music-models') return { body: [MODEL, V5_MODEL, V4_MODEL, V35_MODEL] };
    if (pathname === '/api/catalog/music-operations') return { body: dynamicSoundOperations };
    if (pathname === '/api/generate' && request.method() === 'POST') {
      payload = request.postDataJSON() as Record<string, unknown>;
      idempotencyKey = request.headers()['idempotency-key'] ?? '';
      return { status: 202, body: { generationId: 'sound-pending-e2e', status: 'submitting', tracks: [] } };
    }
    return undefined;
  });
  await page.goto('/#/create');
  await page.getByRole('tab', { name: '音效' }).click();

  const soundModels = page.getByRole('radiogroup', { name: '音效模型' });
  await expect(soundModels.getByRole('radio')).toHaveCount(2);
  await expect(soundModels.getByRole('radio', { name: /^Suno V5\.5(?:\s|$)/ })).toBeVisible();
  await expect(soundModels.getByRole('radio', { name: /^Suno V5(?:\s|$)/ })).toBeVisible();
  await expect(soundModels).not.toContainText('Suno V4');
  await expect(soundModels).not.toContainText('Suno V3.5');

  await page.getByRole('textbox', { name: /音效标题/ }).fill('雨夜转场');
  await page.getByRole('textbox', { name: /音效风格与描述/ }).fill('cinematic rain transition, deep impact, metallic tail');
  await page.getByRole('button', { name: /音效参数/ }).click();
  const tempo = page.getByRole('spinbutton', { name: /BPM/ });
  await expect(tempo).toHaveValue('');
  await expect(tempo).toHaveAttribute('placeholder', '99');
  await tempo.fill('127.5');
  const key = page.getByRole('textbox', { name: /调性/ });
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', 'D');
  await key.fill('D# minor');
  const loop = page.getByRole('checkbox', { name: '无缝循环' });
  await expect(loop).toBeChecked();
  // The visual switch thumb intentionally overlays the native input.
  await loop.uncheck({ force: true });

  await expect(page.getByText(/这里不会发送歌词、人声或歌曲高级参数/)).toBeVisible();
  await expect(page.getByText('标题 → title')).toBeVisible();
  await expect(page.getByText('描述 → tags')).toBeVisible();
  await expect(page.getByText('模型 → mv')).toBeVisible();
  await expect(page.getByText('BPM → tempo')).toBeVisible();
  await expect(page.getByText('调性 → key')).toBeVisible();
  await expect(page.getByText('循环 → loop')).toBeVisible();
  await expect(page.getByRole('slider', { name: '风格强度' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '创意度' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '参考音频权重' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '主唱声线' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '纯音乐' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '歌词', exact: true })).toHaveCount(0);

  const submit = page.getByRole('button', { name: '生成 2 个音效 · 37 积分' });
  await expect(submit).toBeEnabled();
  await expect(page.getByText('2 个独立音效版本')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await submit.click();

  await expect(page.getByText(/音效生成请求已受理.*安全预览.*不会实扣积分/)).toBeVisible();
  expect(idempotencyKey).toMatch(/^sound-generate-/);
  expect(payload).toEqual({
    kind: 'sound',
    title: '雨夜转场',
    tags: 'cinematic rain transition, deep impact, metallic tail',
    model: 'chirp-fenix',
    tempo: 127.5,
    key: 'D# minor',
    loop: false,
  });
  for (const forbidden of [
    'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender',
    'styleWeight', 'weirdness', 'mv', 'estimatedCredits', 'priceVersion',
  ]) expect(payload).not.toHaveProperty(forbidden);
  await expectNoHorizontalOverflow(page);
});

test('legacy model UI hides undocumented sliders and V5.5 remaster exposes documented variation', async ({ page }) => {
  const v55RemasterTrack = {
    ...DONE_TRACK,
    id: 'v55-track-e2e',
    groupId: 'v55-batch-e2e',
    model: 'chirp-fenix',
    title: 'V5.5 完成作品',
  };
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/catalog/music-models') return { body: [MODEL, V4_MODEL, V35_MODEL] };
    if (pathname === '/api/library') return { body: [v55RemasterTrack] };
    return undefined;
  });
  await page.goto('/#/create');

  await page.getByRole('radio', { name: /^Suno V4(?:\s|$)/ }).click();
  await page.getByRole('button', { name: /人声与高级参数/ }).click();
  await expect(page.getByRole('group', { name: '主唱声线（当前不可用）', exact: true })).toBeVisible();
  await expect(page.getByText('当前 Suno V4 不支持独立指定主唱性别；请选择 Suno V4.5+ 模型。')).toBeVisible();
  await expect(page.getByRole('slider', { name: '风格强度' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '创意度' })).toHaveCount(0);
  await page.getByRole('radio', { name: /^Suno V3\.5(?:\s|$)/ }).click();
  await expect(page.getByRole('group', { name: '主唱声线（当前不可用）', exact: true })).toBeVisible();
  await expect(page.getByText('当前 Suno V3.5 不支持独立指定主唱性别；请选择 Suno V4.5+ 模型。')).toBeVisible();
  await expect(page.getByRole('slider', { name: '风格强度' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '创意度' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '作品库');
  await page.getByRole('button', { name: `查看作品 ${v55RemasterTrack.title}` }).click();
  const remaster = page.getByRole('button', { name: '高清重制' });
  await expect(remaster).toBeEnabled();
  await remaster.click();
  const remasterDialog = page.getByRole('dialog', { name: '高清重制' });
  await expect(remasterDialog).toBeVisible();
  await expect(remasterDialog.getByRole('combobox', { name: '变化程度' })).toHaveValue('normal');
  await remasterDialog.getByRole('combobox', { name: '变化程度' }).selectOption('high');
  await expect(remasterDialog.getByRole('combobox', { name: '变化程度' })).toHaveValue('high');
  await page.keyboard.press('Escape');
  await expect(remasterDialog).toBeHidden();
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test('Sound generation fails closed for missing quote, authorization, Provider, or billing permission', async ({ page }) => {
  type Scenario = 'missing-price' | 'missing-authorization' | 'missing-provider' | 'billing-blocked';
  let scenario: Scenario = 'missing-price';
  let generationPosts = 0;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/catalog/music-models') {
      return { body: scenario === 'missing-authorization' ? [V4_MODEL, V35_MODEL] : [MODEL, V5_MODEL] };
    }
    if (pathname === '/api/catalog/music-operations') {
      return { body: OPERATIONS.map((entry) => {
        if (entry.operationCode !== 'sound_pair') return entry;
        if (scenario === 'missing-price') return { ...entry, estimatedCredits: null, priceVersion: null };
        if (scenario === 'billing-blocked') return {
          ...entry,
          available: false,
          executable: false,
          previewExecutable: false,
          reason: 'ModelCross 未开放 sound_pair 的计费执行许可',
        };
        return entry;
      }) };
    }
    if (pathname === '/api/health' && scenario === 'missing-provider') {
      return { body: {
        provider: 'mxapi', configured: false, upstreamReachable: false, ready: false,
        active: 0, queued: 0, balance: null, billingLive: false, models: [],
      } };
    }
    if (pathname === '/api/generate' && request.method() === 'POST') {
      generationPosts += 1;
      return { status: 500, body: { error: 'must not be called' } };
    }
    return undefined;
  });

  const openSound = async () => {
    // A changing query forces a new document; navigating to the same hash alone
    // would retain the previous in-memory catalog in a single-page application.
    await page.goto(`/?e2e-sound-gate=${scenario}#/create`);
    await page.getByRole('tab', { name: '音效' }).click();
    const title = page.getByRole('textbox', { name: /音效标题/ });
    if (await title.isVisible()) await title.fill('Fail closed E2E');
    const tags = page.getByRole('textbox', { name: /音效风格与描述/ });
    if (await tags.isVisible()) await tags.fill('fail closed contract probe');
  };

  await openSound();
  const missingPrice = page.getByRole('button', { name: '生成 2 个音效 · — 积分' });
  await expect(missingPrice).toBeDisabled();
  await expect(page.getByText(/动态预计价格暂不可用.*已禁用/)).toBeVisible();

  scenario = 'missing-authorization';
  await openSound();
  await expect(page.getByRole('radiogroup', { name: '音效模型' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('当前没有已授权且支持音效生成的模型');
  await expect(page.getByRole('alert')).toContainText('音效生成需要已授权且支持该能力的 Suno V5 或 V5.5 模型');
  await expect(page.getByRole('button', { name: '生成 2 个音效 · 20 积分' })).toBeDisabled();

  scenario = 'missing-provider';
  await openSound();
  await expect(page.getByRole('button', { name: '生成 2 个音效 · 20 积分' })).toBeDisabled();
  await expect(page.getByText('尚未配置音乐 Provider', { exact: true })).toBeVisible();

  scenario = 'billing-blocked';
  await openSound();
  await expect(page.getByRole('button', { name: '生成 2 个音效 · — 积分' })).toBeDisabled();
  await expect(page.getByText(/音效生成不可用：ModelCross 未开放 sound_pair 的计费执行许可/)).toBeVisible();

  expect(generationPosts).toBe(0);
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test('user-visible track billing ignores MXAPI merchant points and uses ModelCross settlement', async ({ page }) => {
  await installMockPlatform(page, (request) => {
    if (new URL(request.url()).pathname === '/api/library') return { body: [DONE_TRACK] };
    return undefined;
  });
  await page.goto('/#/library');

  const card = page.getByRole('article', { name: `作品 ${DONE_TRACK.title}` });
  await expect(card).toContainText('已结算 10 积分');
  await expect(card).not.toContainText('999');
  await expect(card).not.toContainText('积分已退还');
  await page.getByRole('button', { name: `查看作品 ${DONE_TRACK.title}` }).click();
  const detail = page.getByRole('complementary', { name: '作品详情' });
  await expect(detail).toContainText('已结算 10 积分');
  await expect(detail).not.toContainText('999');
  await expect(detail).not.toContainText('积分消耗');
  await expect(detail).not.toContainText('积分已退还');
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test('AI development preview is server-authorized, retry-idempotent, selective, keyboard-safe, and responsive', async ({ page }) => {
  let attempts = 0;
  const keys: string[] = [];
  const payloads: Array<Record<string, unknown>> = [];
  let accepted: Record<string, unknown> | null = null;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/ai/assist' && request.method() === 'POST') {
      attempts += 1;
      keys.push(request.headers()['idempotency-key']);
      payloads.push(request.postDataJSON() as Record<string, unknown>);
      if (attempts === 1) return { status: 503, delayMs: 180, body: { error: 'response lost after submit' } };
      return { status: 201, body: {
        id: 'ai-e2e-preview', action: 'lyrics.generate', original: '雨夜城市创作包',
        suggestion: '[Verse]\n只应用结构化歌词', summary: '生成标题、歌词和制作标签',
        title: '不应用的标题', styleTags: ['不应用的风格'], negativeTags: ['spoken word'],
        fields: { title: '不应用的标题', lyrics: '[Verse]\n只应用结构化歌词', style: '不应用的风格', negativeTags: 'spoken word' },
        estimatedCredits: 2, actualCredits: 0, outputMode: 'replacement',
        billing: { operationCode: 'lyrics_generate', priceVersion: 'e2e-ai-price-v1', estimatedCredits: 2, actualCredits: 0, status: 'preview' },
        createdAt: '2026-08-25T00:00:00.000Z',
      } };
    }
    if (/^\/api\/ai\/assist\/[^/]+\/accept$/.test(pathname) && request.method() === 'POST') {
      accepted = request.postDataJSON() as Record<string, unknown>;
      return { status: 201, body: { documentId: 'ai-document-e2e', revisionId: 'ai-revision-e2e' } };
    }
    return undefined;
  });
  await page.goto('/#/create');
  await page.getByRole('textbox', { name: '描述你的音乐' }).fill('雨夜城市创作包');
  const trigger = page.getByRole('button', { name: /打开创作伙伴/ });

  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'AI 创作伙伴' });
  await expect(dialog.getByRole('button', { name: '关闭 AI 创作伙伴' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog.getByText('预计消耗 2 积分 · 生成前不会扣费')).toBeVisible();
  await expect(dialog.getByText(/本地开发预览，不调用真实 AI、不扣积分/)).toBeVisible();
  await dialog.getByRole('combobox', { name: '原文语言' }).selectOption('ja-JP');
  await dialog.getByRole('combobox', { name: '歌词长度' }).selectOption('long');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);

  await dialog.getByRole('button', { name: '生成建议' }).click();
  await expect(dialog.getByRole('button', { name: 'AI 请求处理中，暂时无法关闭' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/response lost after submit/)).toBeVisible();
  await dialog.getByRole('button', { name: '生成建议' }).click();
  await expect(dialog.getByText('本次消耗 0 积分 · 本地开发预览')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(payloads[1]).toMatchObject({
    action: 'lyrics.generate', targetMusicModelId: 'chirp-fenix',
    context: { language: 'ja-JP' }, options: { length: 'long' },
  });
  for (const field of ['estimatedCredits', 'priceVersion', 'modelAuthorized', 'executable']) {
    expect(payloads[1]).not.toHaveProperty(field);
  }

  await dialog.getByRole('checkbox', { name: /应用标题/ }).uncheck();
  await dialog.getByRole('checkbox', { name: /应用风格标签/ }).uncheck();
  await dialog.getByRole('button', { name: '应用所选建议' }).click();
  await expect(dialog).toBeHidden();
  expect(accepted).toMatchObject({ appliedFields: ['lyrics', 'negativeTags'] });
  await expect(page.getByRole('tab', { name: '自定义歌词' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: /歌名/ })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '音乐风格' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '歌词', exact: true })).toHaveValue('[Verse]\n只应用结构化歌词');
  await page.getByRole('button', { name: /人声与高级参数/ }).click();
  await expect(page.getByRole('textbox', { name: '排除风格' })).toHaveValue('spoken word');
  await expectNoHorizontalOverflow(page);
});

test('OIDC billing-off AI catalog fails closed without an AI POST', async ({ page }) => {
  let aiPosts = 0;
  const blocked = AI_OPERATIONS.map((entry) => ({
    ...entry, chargingEnabled: false, available: false, executable: false, previewExecutable: false,
    reason: 'ModelCross 计费写入尚未启用，禁止发起真实 AI 调用',
  }));
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/catalog/ai-operations') return { body: blocked };
    if (pathname === '/api/ai/assist') {
      aiPosts += 1;
      return { status: 500, body: { error: 'must not be called' } };
    }
    return undefined;
  });
  await page.goto('/#/create');
  await page.getByRole('textbox', { name: '描述你的音乐' }).fill('OIDC 禁止真实 AI');
  await page.getByRole('button', { name: /打开创作伙伴/ }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 创作伙伴' });
  await expect(dialog.getByRole('button', { name: '生成建议' })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('ModelCross 计费写入尚未启用，禁止发起真实 AI 调用');
  expect(aiPosts).toBe(0);
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test('private API errors have retry paths, no demo records, and remain responsive at 390px', async ({ page }) => {
  let projectsAvailable = false;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/projects') return projectsAvailable
      ? { body: [PROJECT] }
      : { status: 503, body: { error: 'projects unavailable' } };
    if (pathname === '/api/tasks') return { status: 503, body: { error: 'tasks unavailable' } };
    if (pathname === '/api/billing/summary') return { status: 503, body: { error: 'billing unavailable' } };
    if (pathname === '/api/billing/orders') return { status: 503, body: { error: 'orders unavailable' } };
    return undefined;
  });
  await page.goto('/#/projects');

  await expect(page.getByText('项目暂时不可用')).toBeVisible();
  await expect(page.getByText(/projects unavailable.*页面没有使用演示数据替代/)).toBeVisible();
  await expect(page.getByText('霓虹夜航')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  projectsAvailable = true;
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('heading', { name: PROJECT.title })).toBeVisible();
  await page.getByRole('button', { name: `${PROJECT.title} 更多操作` }).click();
  await expect(page.getByRole('menuitem', { name: '打开项目' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '任务中心');
  await expect(page.getByText('任务状态暂时无法同步')).toBeVisible();
  await expect(page.getByText(/tasks unavailable.*页面没有使用演示数据替代/)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '积分与订单');
  await expect(page.getByText('账户余额暂时不可用')).toBeVisible();
  await expect(page.getByText('订单与消费记录暂时不可用')).toBeVisible();
  await expect(page.getByText('积分充值 2,000')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择积分包' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '购买积分' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看可购买商品' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/¥\s*(?:29|99|259)/);
  await expectNoHorizontalOverflow(page);
});

test('project open filters the library and archive is persisted through the server action', async ({ page }) => {
  let archiveRequests = 0;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/projects' && request.method() === 'GET') return { body: [PROJECT] };
    if (pathname === '/api/library') return { body: [PROJECT_TRACK, OTHER_PROJECT_TRACK] };
    if (pathname === `/api/projects/${PROJECT.id}` && request.method() === 'DELETE') {
      archiveRequests += 1;
      return { body: { ok: true } };
    }
    return undefined;
  });
  await page.goto('/#/projects');

  const projectCard = page.locator('article').filter({ hasText: PROJECT.title });
  await projectCard.getByRole('button', { name: `${PROJECT.title} 更多操作` }).click();
  await page.getByRole('menuitem', { name: '打开项目' }).click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText(`项目：${PROJECT.title}`)).toBeVisible();
  await expect(page.getByRole('article', { name: `作品 ${PROJECT_TRACK.title}` })).toBeVisible();
  await expect(page.getByRole('article', { name: `作品 ${OTHER_PROJECT_TRACK.title}` })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await navigateWorkspace(page, '项目与专辑');
  await page.getByRole('button', { name: `${PROJECT.title} 更多操作` }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('menuitem', { name: '归档项目' }).click();

  await expect(page.getByText(`项目“${PROJECT.title}”已归档`)).toBeVisible();
  expect(archiveRequests).toBe(1);
  const archivedProjectCard = page.locator('article').filter({ hasText: PROJECT.title });
  await expect(archivedProjectCard.getByText('已归档', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `${PROJECT.title} 更多操作` }).click();
  await expect(page.getByRole('menuitem', { name: '已归档' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test('project creation failure preserves the dialog and device-local draft uses the signed-in namespace', async ({ page }) => {
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/projects' && request.method() === 'POST') {
      return { status: 500, body: { error: 'database unavailable' } };
    }
    return undefined;
  });
  await page.goto('/#/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '新建音乐项目' });
  const projectTitle = dialog.getByLabel('项目名称', { exact: true });
  const projectDescription = dialog.getByLabel('项目描述', { exact: true });
  await projectTitle.fill('失败后仍保留');
  await projectDescription.fill('这段输入不能消失');
  await dialog.getByRole('button', { name: '创建项目' }).click();

  await expect(dialog).toBeVisible();
  await expect(projectTitle).toHaveValue('失败后仍保留');
  await expect(projectDescription).toHaveValue('这段输入不能消失');
  await expect(dialog.getByText(/项目创建失败：database unavailable/)).toBeVisible();
  await expect(page.getByText(/项目“失败后仍保留”已创建/)).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('local-');
  await expectNoHorizontalOverflow(page);

  await dialog.getByRole('button', { name: '关闭' }).click();
  await navigateWorkspace(page, 'AI 歌词工作室');
  await page.getByRole('textbox', { name: '歌曲标题' }).fill('只属于当前用户');
  await page.getByRole('textbox', { name: '歌词', exact: true }).fill('[Verse]\n本机草稿');
  await page.getByRole('button', { name: '保存到此设备' }).click();
  await expect(page.getByText(/草稿已保存在此设备，不会同步到其他设备/)).toBeVisible();
  const storage = await page.evaluate(() => ({
    scoped: localStorage.getItem('museflow.local-draft.v2.e2e-user'),
    legacyForm: localStorage.getItem('museflow.form.v2'),
    legacyDraft: localStorage.getItem('museflow.local-draft.v1'),
  }));
  expect(storage.scoped).toContain('本机草稿');
  expect(storage.legacyForm).toBeNull();
  expect(storage.legacyDraft).toBeNull();
  await expectNoHorizontalOverflow(page);
});

test('generation and track actions accept 202 without fake tracks, while inflight deletion stays disabled', async ({ page }) => {
  let actionPayload: Record<string, unknown> | null = null;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/library') return { body: [QUEUED_TRACK, DONE_TRACK] };
    if (pathname === '/api/generate' && request.method() === 'POST') {
      return { status: 202, body: { generationId: 'generation-pending-e2e', status: 'submitting', tracks: [] } };
    }
    if (pathname === `/api/tracks/${DONE_TRACK.id}/actions` && request.method() === 'POST') {
      actionPayload = request.postDataJSON() as Record<string, unknown>;
      return { status: 202, body: { generationId: 'action-pending-e2e', status: 'submitting', tracks: [] } };
    }
    if (pathname === `/api/tracks/${DONE_TRACK.id}` && request.method() === 'DELETE') {
      return { status: 500, body: { error: 'storage unavailable' } };
    }
    return undefined;
  });
  await page.goto('/#/create');
  await page.getByRole('textbox', { name: '描述你的音乐' }).fill('E2E 等待入队作品');
  await page.getByRole('button', { name: /生成 2 首歌曲 · 20 积分/ }).click();
  await expect(page.getByText(/生成请求已受理，正在等待任务入队/)).toBeVisible();
  await expect(page.getByRole('article', { name: '作品 E2E 等待入队作品' })).toHaveCount(0);

  await navigateWorkspace(page, '任务中心');
  await expect(page.getByText('E2E 等待入队作品')).toBeVisible();
  await expect(page.getByText('提交中')).toBeVisible();
  await page.getByRole('button', { name: 'E2E 等待入队作品 详情' }).click();
  const pendingDetail = page.getByRole('dialog', { name: 'E2E 等待入队作品' });
  await expect(pendingDetail).toContainText('pending:generation-pending-e2e');
  await expectNoHorizontalOverflow(page);
  await pendingDetail.getByRole('button', { name: '关闭任务详情' }).click();

  await navigateWorkspace(page, '作品库');
  await expect(page.getByRole('button', { name: '任务结算前不可删除' })).toBeDisabled();
  await page.getByRole('button', { name: `查看作品 ${DONE_TRACK.title}` }).click();
  await page.getByRole('button', { name: '续写' }).click();
  const actionDialog = page.getByRole('dialog', { name: '续写歌曲' });
  await expect(actionDialog.getByRole('combobox', { name: '目标模型' })).toHaveValue('chirp-fenix');
  await actionDialog.getByRole('textbox', { name: /新版本标题/ }).fill(DONE_TRACK.title);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.getByText(/续写请求已受理，正在等待任务入队/)).toBeVisible();
  expect(actionPayload).toEqual({
    action: 'extend', continueAt: 118, model: 'chirp-fenix', mode: 'custom', title: DONE_TRACK.title,
    description: '', style: 'Dream Pop', lyrics: '[Verse]\n测试歌词', instrumental: false,
    negativeTags: '', vocalGender: 'auto', styleWeight: 0.65, weirdness: 0.5,
  });
  await page.getByRole('button', { name: '关闭详情' }).click();
  await navigateWorkspace(page, '任务中心');
  const actionTask = page.locator('.task-row').filter({ hasText: DONE_TRACK.title });
  await expect(actionTask).toBeVisible();
  await expect(actionTask.getByText('提交中')).toBeVisible();

  await navigateWorkspace(page, '作品库');
  const completedCard = page.getByRole('article', { name: `作品 ${DONE_TRACK.title}` });
  page.once('dialog', (browserDialog) => browserDialog.accept());
  await completedCard.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText(/删除失败，作品仍保留：storage unavailable/)).toBeVisible();
  await expect(completedCard).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('a controlled SSE event refreshes the real task status and detail timestamp', async ({ page }) => {
  let completed = false;
  let taskRequests = 0;
  await installMockPlatform(page, (request) => {
    if (new URL(request.url()).pathname !== '/api/tasks') return undefined;
    taskRequests += 1;
    return { body: [completed ? COMPLETED_STREAM_TASK : STREAM_TASK] };
  }, { controlledEvents: true });
  await page.goto('/#/tasks');

  await expect(page.getByText('实时事件已连接')).toBeVisible();
  const taskRow = page.locator('.task-row').filter({ hasText: STREAM_TASK.title });
  await expect(taskRow.getByText('生成中', { exact: true })).toBeVisible();
  await expect(taskRow.locator('[style*="width"]')).toHaveAttribute('style', /width:\s*35%/);
  const requestsBeforeEvent = taskRequests;

  completed = true;
  await page.evaluate(() => {
    (window as unknown as { __emitMuseFlowEvent: (type: string) => void }).__emitMuseFlowEvent('track.completed');
  });

  await expect.poll(() => taskRequests).toBeGreaterThan(requestsBeforeEvent);
  await expect(taskRow.getByText('已完成', { exact: true })).toBeVisible();
  await taskRow.getByRole('button', { name: `${STREAM_TASK.title} 详情` }).click();
  const detail = page.getByRole('dialog', { name: STREAM_TASK.title });
  await expect(detail).toContainText('100%');
  await expect(detail).toContainText('已完成');
  const formattedUpdate = await page.evaluate((iso) => new Date(iso).toLocaleString('zh-CN'), COMPLETED_STREAM_TASK.updatedAt);
  await expect(detail).toContainText(formattedUpdate);
  await expectNoHorizontalOverflow(page);
});

test('logout 500 keeps the authenticated session and workspace intact', async ({ page }) => {
  let logoutRequests = 0;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/auth/logout' && request.method() === 'POST') {
      logoutRequests += 1;
      return { status: 500, body: { error: 'logout unavailable' } };
    }
    return undefined;
  });
  await page.goto('/#/settings');

  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByText(/退出失败，当前会话仍然有效：logout unavailable/)).toBeVisible();
  expect(logoutRequests).toBe(1);
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { name: '系统与偏好', exact: true })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 1024) {
    await page.getByRole('button', { name: '打开主导航' }).click();
    const sidebar = page.getByRole('complementary', { name: '应用侧栏' });
    await expect(sidebar.getByText('E2E User', { exact: true })).toBeVisible();
    await sidebar.getByRole('button', { name: '关闭导航' }).click();
  } else {
    await expect(page.getByRole('button', { name: /E2E User/ })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toHaveCount(0);

  await navigateWorkspace(page, '作品库');
  await expect(page.getByRole('textbox', { name: '搜索作品' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('logout clears in-memory lyrics and a second subject cannot see the first subject draft', async ({ page, messages }) => {
  void messages;
  let activeSession = AUTH_SESSION;
  await installMockPlatform(page, (request) => {
    if (new URL(request.url()).pathname === '/api/session') return { body: activeSession };
    return undefined;
  });
  await page.goto('/#/lyrics');
  await page.getByRole('textbox', { name: '歌曲标题' }).fill('A 的私密标题');
  await page.getByRole('textbox', { name: '歌词', exact: true }).fill('A 的私密歌词');
  await page.getByRole('button', { name: '保存到此设备' }).click();
  await expect(page.getByText(/草稿已保存在此设备/)).toBeVisible();

  await navigateWorkspace(page, '设置');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: /让每一个想法/ })).toBeVisible();

  activeSession = {
    ...AUTH_SESSION,
    user: { ...AUTH_SESSION.user, id: 'account-b', subject: 'account-b', name: 'User B', email: 'b@example.test' },
  };
  await page.goto('/#/lyrics');
  await expect(page.getByRole('textbox', { name: '歌曲标题' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '歌词', exact: true })).toHaveValue('');
  await expect(page.getByText(/尚未手动保存/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('A 的私密');
  const isolated = await page.evaluate(() => ({
    a: localStorage.getItem('museflow.local-draft.v2.e2e-user'),
    b: localStorage.getItem('museflow.local-draft.v2.account-b'),
  }));
  expect(isolated.a).toContain('A 的私密歌词');
  expect(isolated.b).toBeNull();
  await expectNoHorizontalOverflow(page);
});

function silentWav(seconds = 1): Buffer {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const dataBytes = sampleRate * seconds * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

test('reference audio can be imported as one standalone Provider Track through same-origin APIs', async ({ page }) => {
  let multipartBody = '';
  let multipartIdempotency = '';
  let actionIdempotency = '';
  let actionPayload: Record<string, unknown> | null = null;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/uploads/audio' && request.method() === 'POST') {
      multipartBody = request.postDataBuffer()?.toString('utf8') ?? '';
      multipartIdempotency = request.headers()['idempotency-key'] ?? '';
      return { status: 201, body: {
        id: 'upload-import-e2e', status: 'ready', originalFilename: 'standalone.wav',
        mimeType: 'audio/wav', byteSize: silentWav().length, durationSeconds: 1,
        checksumSha256: 'import-e2e-checksum', copyrightConfirmed: true,
        copyrightAudio: false, createdAt: '2026-08-25T00:00:00.000Z',
      } };
    }
    if (pathname === '/api/uploads/upload-import-e2e/actions' && request.method() === 'POST') {
      actionPayload = request.postDataJSON() as Record<string, unknown>;
      actionIdempotency = request.headers()['idempotency-key'] ?? '';
      return { status: 202, body: { generationId: 'standalone-import-e2e', status: 'submitting', operation: 'upload', referenceAudioId: 'upload-import-e2e', tracks: [] } };
    }
    return undefined;
  });

  await page.goto('/#/create');
  await page.getByRole('tab', { name: '参考音频' }).click();
  await page.getByRole('button', { name: '仅导入单曲' }).click();
  await page.getByLabel('选择参考音频').setInputFiles({ name: 'standalone.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await page.getByRole('checkbox', { name: /我确认拥有上传及生成所需的全部权利/ }).check();
  await page.getByRole('textbox', { name: /歌名/ }).fill('独立导入 E2E');
  const submit = page.getByRole('button', { name: '仅导入单曲 · 5 积分' });
  await expect(submit).toBeEnabled();
  await expect(page.getByText('1 首 Provider 导入单曲')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await submit.click();

  await expect(page.getByText(/参考音频导入已受理/)).toBeVisible();
  expect(multipartIdempotency).toMatch(/^audio-upload-/);
  expect(actionIdempotency).toMatch(/^music-upload-/);
  expect(actionIdempotency).not.toMatch(/^music-upload-extend-/);
  expect(multipartBody).toContain('name="audio"; filename="standalone.wav"');
  expect(multipartBody).toContain('name="copyrightConfirmed"');
  expect(multipartBody).toContain('name="copyrightAudio"');
  expect(actionPayload).toEqual({ action: 'upload', model: 'chirp-fenix', title: '独立导入 E2E' });
  for (const field of ['copyrightAudio', 'copyrightConfirmed', 'continueAt', 'audioWeight', 'estimatedCredits', 'priceVersion', 'customId', 'providerRecordId']) {
    expect(actionPayload).not.toHaveProperty(field);
  }
  await expectNoHorizontalOverflow(page);
});

test('reference audio uses MuseFlow multipart storage then the quoted upload-extend pipeline', async ({ page }) => {
  let multipartBody = '';
  let actionPayload: Record<string, unknown> | null = null;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/uploads/audio' && request.method() === 'POST') {
      multipartBody = request.postDataBuffer()?.toString('utf8') ?? '';
      return { status: 201, body: {
        id: 'upload-e2e-1', status: 'ready', mimeType: 'audio/wav', byteSize: silentWav().length,
        durationSeconds: 1, checksumSha256: 'e2e-checksum', copyrightConfirmed: true,
        copyrightAudio: false, createdAt: '2026-08-25T00:00:00.000Z',
      } };
    }
    if (pathname === '/api/uploads/upload-e2e-1/actions' && request.method() === 'POST') {
      actionPayload = request.postDataJSON() as Record<string, unknown>;
      return { status: 202, body: { generationId: 'upload-extend-e2e', status: 'submitting', tracks: [] } };
    }
    return undefined;
  });
  await page.goto('/#/create');
  await page.getByRole('tab', { name: '参考音频' }).click();
  await page.getByLabel('选择参考音频').setInputFiles({ name: 'reference.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await expect(page.getByText(/reference\.wav/)).toBeVisible();
  await page.getByRole('checkbox', { name: /我确认拥有上传及生成所需的全部权利/ }).check();
  await page.getByRole('textbox', { name: '续作描述' }).fill('让结尾发展成更开阔的电影感副歌');
  const submit = page.getByRole('button', { name: '上传并续作 · 25 积分' });
  await expect(submit).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await submit.click();

  await expect(page.getByText(/参考音频续作已受理/)).toBeVisible();
  expect(multipartBody).toContain('name="audio"; filename="reference.wav"');
  expect(multipartBody).toContain('name="copyrightConfirmed"');
  expect(multipartBody).toContain('true');
  expect(multipartBody).toContain('name="copyrightAudio"');
  expect(actionPayload).toMatchObject({
    action: 'upload_extend', model: 'chirp-fenix', continueAt: 0, audioWeight: 0.5,
    description: '让结尾发展成更开阔的电影感副歌',
  });
  expect(actionPayload).not.toHaveProperty('copyrightAudio');
  expect(actionPayload).not.toHaveProperty('estimatedCredits');
  expect(actionPayload).not.toHaveProperty('customId');
  expect(actionPayload).not.toHaveProperty('providerRecordId');
  await expectNoHorizontalOverflow(page);
});

test('Suno dialogs are keyboard-operable and submit only documented speed parameters', async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/library') return { body: [DONE_TRACK] };
    if (pathname === `/api/tracks/${DONE_TRACK.id}/actions` && request.method() === 'POST') {
      payload = request.postDataJSON() as Record<string, unknown>;
      return { status: 202, body: { generationId: 'speed-e2e', status: 'submitting', tracks: [] } };
    }
    if (pathname === `/api/tracks/${DONE_TRACK.id}/assets/jobs`) {
      return { body: [
        { id: 'asset-video', trackId: DONE_TRACK.id, action: 'video', status: 'succeeded', progress: 1, billingStatus: 'captured' },
        { id: 'asset-wav', trackId: DONE_TRACK.id, action: 'convert_wav', status: 'succeeded', progress: 1, billingStatus: 'captured' },
        { id: 'asset-lyrics', trackId: DONE_TRACK.id, action: 'aligned_lyrics', status: 'succeeded', progress: 1, billingStatus: 'captured', result: { alignedLyrics: '[00:01.00] 测试歌词' } },
      ] };
    }
    return undefined;
  });
  await page.goto('/#/library');
  await page.getByRole('button', { name: `查看作品 ${DONE_TRACK.title}` }).click();
  const speed = page.getByRole('button', { name: '变速' });
  await expect(speed).toBeEnabled();
  await speed.click();
  const dialog = page.getByRole('dialog', { name: '调整播放速度' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('combobox', { name: '速度倍率' })).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: '速度倍率' })).toHaveValue('1');
  await expect(page.getByRole('link', { name: '下载 WAV' })).toHaveAttribute('href', `/api/tracks/${DONE_TRACK.id}/wav?download=1`);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(speed).toBeFocused();

  await speed.click();
  await page.getByRole('combobox', { name: '速度倍率' }).selectOption('1.5');
  await page.getByRole('checkbox', { name: /保持原音高/ }).uncheck();
  await page.getByRole('textbox', { name: '新版本标题' }).fill('E2E 变速版');
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.getByText(/变速请求已受理/)).toBeVisible();
  expect(payload).toEqual({ action: 'speed', multiplier: 1.5, keepPitch: false, title: 'E2E 变速版' });
  await expectNoHorizontalOverflow(page);
});

test('a standalone imported Track can later use its exact persisted upload-extend variant', async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  const importedTrack = {
    ...DONE_TRACK,
    id: 'imported-track-1', groupId: 'import-batch-1', operation: 'upload',
    copyrightAudio: true, referenceAudioAvailable: true, referenceAudioDurationSeconds: 90.5,
    duration: 128,
  };
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/library') return { body: [importedTrack] };
    if (pathname === `/api/tracks/${importedTrack.id}/actions` && request.method() === 'POST') {
      payload = request.postDataJSON() as Record<string, unknown>;
      return { status: 202, body: { generationId: 'import-later-extend', status: 'submitting', tracks: [] } };
    }
    if (pathname === `/api/tracks/${importedTrack.id}/assets/jobs`) return { body: [] };
    return undefined;
  });

  await page.goto('/#/library');
  await page.getByRole('button', { name: `查看作品 ${importedTrack.title}` }).click();
  const trigger = page.getByRole('button', { name: '参考续作' });
  await expect(trigger).toBeEnabled();
  await expect(trigger).toContainText('40 积分');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '参考音频续作' });
  const continueAt = dialog.getByRole('spinbutton', { name: '续作起点（秒）' });
  await expect(continueAt).toHaveAttribute('max', '90.5');
  await continueAt.fill('80');
  await dialog.getByRole('slider', { name: '参考音频权重' }).fill('0.75');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await dialog.getByRole('button', { name: '确认创建' }).click();

  await expect(page.getByText(/参考音频续作请求已受理/)).toBeVisible();
  expect(payload).toMatchObject({
    action: 'upload_extend', model: 'chirp-fenix', mode: 'custom', continueAt: 80,
    audioWeight: 0.75, style: 'Dream Pop', lyrics: '[Verse]\n测试歌词',
  });
  for (const field of ['copyrightAudio', 'estimatedCredits', 'priceVersion', 'customId', 'providerRecordId']) {
    expect(payload).not.toHaveProperty(field);
  }
  await expectNoHorizontalOverflow(page);
});

test('crop resolves its dynamic track-duration bound without truncating fractional seconds', async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  const fractionalTrack = { ...DONE_TRACK, duration: 128.75 };
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/library') return { body: [fractionalTrack] };
    if (pathname === `/api/tracks/${fractionalTrack.id}/actions` && request.method() === 'POST') {
      payload = request.postDataJSON() as Record<string, unknown>;
      return { status: 202, body: { generationId: 'crop-e2e', status: 'submitting', tracks: [] } };
    }
    return undefined;
  });
  await page.goto('/#/library');
  await page.getByRole('button', { name: `查看作品 ${fractionalTrack.title}` }).click();
  await page.getByRole('button', { name: '裁剪' }).click();
  // Use stable ids so a controlled-input rerender cannot leave an accessibility locator bound
  // to the wrong number field while values are being replaced.
  const start = page.locator('#crop-start');
  const end = page.locator('#crop-end');
  await expect(start).toHaveAccessibleName('开始秒数');
  await expect(end).toHaveAccessibleName('结束秒数');
  await expect(end).toHaveValue('128.75');
  await expect(end).toHaveAttribute('max', '128.75');
  await expect(end).toHaveAttribute('step', 'any');
  await start.clear();
  await start.fill('10.2');
  await expect(start).toHaveValue('10.2');
  await end.clear();
  await expect(end).not.toHaveValue('128.75');
  await end.fill('45.7');
  await expect(end).toHaveValue('45.7');
  await expect(page.getByText(/仅保留 10\.2–45\.7 秒/)).toBeVisible();
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.getByText(/裁剪请求已受理/)).toBeVisible();
  expect(payload).toEqual({ action: 'crop', startSeconds: 10.2, endSeconds: 45.7 });
  await expectNoHorizontalOverflow(page);
});

test('preview-only or missing dynamic prices fail closed before any Suno request', async ({ page }) => {
  let actionRequests = 0;
  let generationRequests = 0;
  let uploadRequests = 0;
  const previewOnly = OPERATIONS.map((entry) => entry.operationCode === 'whole_song_single' || entry.operationCode === 'generation_pair' || entry.operationCode === 'upload_single'
    ? { ...entry, chargingEnabled: false, preview: true, executable: undefined, previewExecutable: undefined, reason: 'OIDC 环境已关闭真实计费' }
    : entry.operationCode === 'crop_single'
      ? { ...entry, estimatedCredits: null, priceVersion: null }
      : entry.operationCode === 'speed_single'
        ? { ...entry, parameters: { multiplier: { enum: [0.5, 1], default: 2 }, keepPitch: { type: 'boolean', default: true }, title: { maxLength: 100 } } }
      : entry);
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/library') return { body: [DONE_TRACK] };
    if (pathname === '/api/catalog/music-operations') return { body: previewOnly };
    if (pathname === `/api/tracks/${DONE_TRACK.id}/actions`) {
      actionRequests += 1;
      return { status: 500, body: { error: 'must not be called' } };
    }
    if (pathname === '/api/generate') {
      generationRequests += 1;
      return { status: 500, body: { error: 'must not be called' } };
    }
    if (pathname === '/api/uploads/audio') {
      uploadRequests += 1;
      return { status: 500, body: { error: 'must not be called' } };
    }
    return undefined;
  });
  await page.goto('/#/library');
  await page.getByRole('button', { name: `查看作品 ${DONE_TRACK.title}` }).click();
  const whole = page.getByRole('button', { name: '完整歌曲' });
  const crop = page.getByRole('button', { name: '裁剪' });
  const speed = page.getByRole('button', { name: '变速' });
  await expect(whole).toBeDisabled();
  await expect(whole).toHaveAttribute('title', 'OIDC 环境已关闭真实计费');
  await expect(crop).toBeDisabled();
  await expect(crop).toHaveAttribute('title', /动态预计价格暂不可用/);
  await expect(speed).toBeDisabled();
  await expect(speed).toHaveAttribute('title', '服务端未返回完整的变速参数配置');
  expect(actionRequests).toBe(0);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: '关闭详情' }).click();
  await navigateWorkspace(page, '创作工作台');
  await page.getByRole('textbox', { name: '描述你的音乐' }).fill('OIDC 不应提交公网 Provider');
  const generate = page.getByRole('button', { name: '生成 2 首歌曲 · 20 积分' });
  await expect(generate).toBeDisabled();
  await expect(page.getByText(/音乐生成不可用：OIDC 环境已关闭真实计费/)).toBeVisible();
  expect(generationRequests).toBe(0);
  await page.getByRole('tab', { name: '参考音频' }).click();
  await page.getByRole('button', { name: '仅导入单曲' }).click();
  await page.getByLabel('选择参考音频').setInputFiles({ name: 'oidc-preview.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await page.getByRole('checkbox', { name: /我确认拥有上传及生成所需的全部权利/ }).check();
  const importOnly = page.getByRole('button', { name: '仅导入单曲 · 5 积分' });
  await expect(importOnly).toBeDisabled();
  await expect(page.getByText(/参考音频导入不可用：OIDC 环境已关闭真实计费/)).toBeVisible();
  expect(uploadRequests).toBe(0);
  await expectNoHorizontalOverflow(page);
});

test('a missing copyright operation variant cannot fall back to the cheaper standard quote', async ({ page }) => {
  let uploadRequests = 0;
  const missingCopyright = OPERATIONS.filter((entry) => entry.operationCode !== 'upload_copyright_extend_pair');
  await installMockPlatform(page, (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/catalog/music-operations') return { body: missingCopyright };
    if (pathname.startsWith('/api/uploads/')) {
      uploadRequests += 1;
      return { status: 500, body: { error: 'must not be called' } };
    }
    return undefined;
  });
  await page.goto('/#/create');
  await page.getByRole('tab', { name: '参考音频' }).click();
  await page.getByRole('checkbox', { name: /此素材需要 Provider 的版权音频处理/ }).check();
  const submit = page.getByRole('button', { name: '上传并续作 · — 积分' });
  await expect(submit).toBeDisabled();
  await expect(page.getByText('服务端未返回此操作的能力与价格', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /上传并续作 · 25 积分/ })).toHaveCount(0);
  await page.getByRole('button', { name: '仅导入单曲' }).click();
  await expect(page.getByRole('button', { name: '仅导入单曲 · 20 积分' })).toBeVisible();
  await expect(page.getByRole('button', { name: /仅导入单曲 · 5 积分/ })).toHaveCount(0);
  expect(uploadRequests).toBe(0);
  await expectNoHorizontalOverflow(page);
});
