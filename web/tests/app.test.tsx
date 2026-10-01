import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { DEMO_BILLING, DEMO_MODELS, DEMO_ORDERS, DEMO_PROJECTS, DEMO_SESSION } from '../src/fixtures';
import type { AiAssistResult, BillingSummary, SessionSummary, Track } from '../src/types';
import { SUNO_OPERATIONS } from './suno-fixture';
import { AI_OPERATIONS } from './ai-fixture';

const generatedTrack: Track = {
  id: 'track-new-a', groupId: 'batch-new', takeIndex: 0, title: '凌晨三点的海', mode: 'simple', operation: 'generate', description: '雨夜城市情歌', style: '', lyrics: '', instrumental: false, model: 'chirp-fenix', negativeTags: '', vocalGender: 'auto', styleWeight: .65, weirdness: .5, status: 'queued', progress: 0, stage: 'queued', eta: 120, elapsed: 0, error: null, file: null, coverFile: null, audioUrl: null, imageUrl: null, videoUrl: null, upstreamTaskId: 'upstream-a', upstreamStatus: 'queued', customId: null, duration: 0, format: 'mp3', pointsCost: 10, pointsRefunded: false, createdAt: new Date().toISOString(), finishedAt: null,
};

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function installApiMock(library: Track[] = [], overrides: {
  session?: SessionSummary;
  billing?: BillingSummary;
  aiBillingStatus?: NonNullable<AiAssistResult['billing']>['status'];
  aiActualCredits?: number;
} = {}) {
  const session = overrides.session ?? DEMO_SESSION;
  const billing = overrides.billing ?? DEMO_BILLING;
  const aiBillingStatus = overrides.aiBillingStatus ?? 'captured';
  const aiActualCredits = overrides.aiActualCredits ?? 1;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/session' || url === '/api/me') return response(session);
    if (url === '/api/health') return response({ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 5000, models: DEMO_MODELS.map((model) => model.id) });
    if (url === '/api/library') return response(library);
    if (url === '/api/catalog/music-models') return response(DEMO_MODELS);
    if (url === '/api/catalog/music-operations') return response(SUNO_OPERATIONS);
    if (url === '/api/catalog/ai-models') return response([
      {
        id: 'gpt-lyrics', displayName: 'GPT Music', provider: 'OpenAI',
        description: '歌词创作模型', badge: '歌词推荐', enabled: true, reason: null,
        defaultForLyrics: true, defaultForFastTasks: false,
      },
      {
        id: 'gpt-fast', displayName: 'Gemini Music', provider: 'Google',
        description: '快速灵感模型', badge: '快速推荐', enabled: true, reason: null,
        defaultForLyrics: false, defaultForFastTasks: true,
      },
    ]);
    if (url === '/api/catalog/ai-operations') return response(AI_OPERATIONS);
    if (url === '/api/projects') return init?.method === 'POST' ? response({ id: 'new-project', title: '新项目', trackCount: 0, status: 'active', updatedAt: new Date().toISOString() }) : response(DEMO_PROJECTS);
    if (url === '/api/tasks') return response([]);
    if (url === '/api/billing/summary' || url === '/api/billing/summary?refresh=1') return response(billing);
    if (url === '/api/billing/orders') return response(DEMO_ORDERS);
    if (url === '/api/generate') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      const first = body.kind === 'sound' ? {
        ...generatedTrack,
        operation: 'sound' as const,
        title: String(body.title || ''),
        style: String(body.tags || ''),
        description: '',
        lyrics: '',
        instrumental: true,
        model: String(body.model || 'chirp-fenix'),
        soundTempo: typeof body.tempo === 'number' ? body.tempo : null,
        soundKey: typeof body.key === 'string' ? body.key : null,
        soundLoop: typeof body.loop === 'boolean' ? body.loop : null,
      } : generatedTrack;
      return response([first, { ...first, id: 'track-new-b', takeIndex: 1, upstreamTaskId: 'upstream-b' }]);
    }
    if (url === '/api/ai/assist') {
      const body = JSON.parse(String(init?.body || '{}')) as { action?: string };
      if (body.action === 'title.suggest') return response({
        id: 'ai-title-1', action: 'title.suggest', original: '雨夜城市情歌', suggestion: '夜航微光',
        summary: '建议短标题', estimatedCredits: 1, actualCredits: aiActualCredits,
        title: '夜航微光', fields: { title: '夜航微光' },
        billing: { operationCode: 'prompt_optimize', priceVersion: 'test-ai-price-v1', estimatedCredits: 1, actualCredits: aiActualCredits, status: aiBillingStatus },
        outputMode: 'replacement', createdAt: new Date().toISOString(),
      });
      return response({
        id: 'ai-lyrics-1', action: 'lyrics.generate', original: '雨夜城市情歌', suggestion: '[Verse]\n结构化歌词',
        summary: '生成创作包', estimatedCredits: 2, actualCredits: 2,
        title: '结构化标题', styleTags: ['Dream Pop'], negativeTags: ['spoken word'],
        fields: { title: '结构化标题', lyrics: '[Verse]\n结构化歌词', style: 'Dream Pop', negativeTags: 'spoken word' },
        billing: { operationCode: 'lyrics_generate', priceVersion: 'test-ai-price-v1', estimatedCredits: 2, actualCredits: 2, status: 'captured' },
        outputMode: 'replacement', createdAt: new Date().toISOString(),
      });
    }
    if (/^\/api\/ai\/assist\/[^/]+\/accept$/.test(url)) return response({ documentId: 'document-app', revisionId: 'revision-app' }, 201);
    return response({ error: `unhandled ${url}` }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('MuseFlow application journey', () => {
  beforeEach(() => {
    window.location.hash = '';
    localStorage.clear();
    installApiMock();
  });

  it('moves from the public homepage into every core SaaS workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /让每一个想法/ })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /开始创作/ })[0]);
    expect(await screen.findByRole('heading', { name: '创作工作台' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '歌词工作室' }));
    expect(await screen.findByRole('heading', { name: '未命名歌词' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /项目与专辑/ }));
    expect(await screen.findByRole('heading', { level: 2, name: '项目与专辑' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '账单与 Credits' }));
    expect(await screen.findByText('积分包与订阅由 ModelCross 实时提供')).toBeInTheDocument();
    expect(screen.queryByText('选择积分包')).not.toBeInTheDocument();
  });

  it('refreshes shell balances from billing and never keeps the login snapshot', async () => {
    window.location.hash = '#/create';
    installApiMock([], {
      billing: {
        ...DEMO_BILLING,
        account: { ...DEMO_BILLING.account, availableBalance: 777 },
      },
    });
    render(<App />);

    expect(await screen.findByRole('button', { name: '可用积分 777，查看积分与订单' })).toBeInTheDocument();
    expect(screen.getByText('777 积分')).toBeInTheDocument();
    expect(screen.queryByText('1,240 积分')).not.toBeInTheDocument();
  });

  it('refreshes wallet balance and orders when the user returns from ModelCross', async () => {
    window.location.hash = '#/billing';
    const fetchMock = installApiMock();
    render(<App />);

    await screen.findByRole('heading', { name: '账单与 Credits' });
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/billing/summary')).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/billing/orders')).toHaveLength(1);
    });

    fireEvent.focus(window);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/billing/summary')).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/billing/summary?refresh=1')).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/billing/orders')).toHaveLength(2);
    });
  });

  it('submits a double-track generation through the secured API client', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/create';
    const fetchMock = installApiMock();
    render(<App />);
    const input = await screen.findByRole('textbox', { name: '描述你的音乐' });
    await user.type(input, '雨夜城市情歌');
    const submit = screen.getByRole('button', { name: /生成 2 首歌曲 · 20 积分/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    expect(await screen.findByText(/已提交 2 个创作任务/)).toBeInTheDocument();
    const generationCall = fetchMock.mock.calls.find(([url]) => url === '/api/generate');
    expect(generationCall).toBeDefined();
    expect(new Headers(generationCall?.[1]?.headers).get('Idempotency-Key')).toMatch(/^music-generate-/);
  });

  it('does not steal Command-K from a creation text field', async () => {
    window.location.hash = '#/create';
    render(<App />);
    const input = await screen.findByRole('textbox', { name: '描述你的音乐' });
    input.focus();

    fireEvent.keyDown(input, { key: 'k', metaKey: true });

    expect(input).toHaveFocus();
    expect(window.location.hash).toBe('#/create');
    expect(screen.getByRole('heading', { name: '创作工作台' })).toBeInTheDocument();
  });

  it('submits the dedicated sound contract and never mixes in song controls', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/create';
    const fetchMock = installApiMock();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: '音效' }));
    await user.type(screen.getByRole('textbox', { name: /音效标题/ }), 'Rain loop');
    await user.type(screen.getByRole('textbox', { name: /音效风格与描述/ }), 'cinematic rain ambience');
    await user.click(screen.getByRole('button', { name: /音效参数/ }));
    await user.type(screen.getByRole('spinbutton', { name: /BPM/ }), '96.5');
    await user.type(screen.getByRole('textbox', { name: /调性/ }), 'C minor');
    const submit = screen.getByRole('button', { name: '生成 2 个音效 · 20 积分' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await screen.findByText(/已提交 2 个音效任务/)).toBeInTheDocument();
    const generationCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/generate' && JSON.parse(String(init?.body || '{}')).kind === 'sound');
    expect(generationCall).toBeDefined();
    const init = generationCall?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^sound-generate-/);
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'sound', title: 'Rain loop', tags: 'cinematic rain ambience', model: 'chirp-fenix', tempo: 96.5, key: 'C minor', loop: true,
    });
    for (const field of ['mode', 'description', 'style', 'lyrics', 'instrumental', 'negativeTags', 'vocalGender', 'styleWeight', 'weirdness']) {
      expect(JSON.parse(String(init.body))).not.toHaveProperty(field);
    }
  });

  it('reuses and retries persisted sound parameters as sound requests', async () => {
    const user = userEvent.setup();
    const soundTrack: Track = {
      ...generatedTrack,
      id: 'sound-failed',
      groupId: 'sound-batch',
      title: 'Looping rain',
      operation: 'sound',
      style: 'steady rain ambience',
      description: '',
      lyrics: '',
      instrumental: true,
      model: 'chirp-crow',
      soundTempo: 92.5,
      soundKey: 'C minor',
      soundLoop: false,
      status: 'error',
      stage: 'error',
      error: 'provider timeout',
    };
    window.location.hash = '#/library';
    const fetchMock = installApiMock([soundTrack]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    expect(await screen.findByText('92.5 BPM')).toBeInTheDocument();
    expect(screen.getByText('C minor')).toBeInTheDocument();
    expect(screen.getByText('单次')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '复用参数' }));
    expect(await screen.findByRole('tab', { name: '音效' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: /音效标题/ })).toHaveValue('Looping rain');
    expect(screen.getByRole('textbox', { name: /音效风格与描述/ })).toHaveValue('steady rain ambience');
    await user.click(screen.getByRole('button', { name: /音效参数/ }));
    expect(screen.getByRole('spinbutton', { name: /BPM/ })).toHaveValue(92.5);
    expect(screen.getByRole('textbox', { name: /调性/ })).toHaveValue('C minor');
    expect(screen.getByRole('checkbox', { name: '无缝循环' })).not.toBeChecked();

    const library = screen.getByRole('button', { name: '音乐资产库' });
    await user.click(library);
    await waitFor(() => expect(library).toHaveAttribute('aria-current', 'page'));
    await user.click(await screen.findByRole('button', { name: '重新生成' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => (
      url === '/api/generate' && JSON.parse(String(init?.body || '{}')).kind === 'sound'
    ))).toBe(true));
    const generationCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/generate' && JSON.parse(String(init?.body || '{}')).kind === 'sound');
    expect(JSON.parse(String(generationCall?.[1]?.body))).toEqual({
      kind: 'sound', title: 'Looping rain', tags: 'steady rain ambience', model: 'chirp-crow', tempo: 92.5, key: 'C minor', loop: false,
    });
    expect(confirm).toHaveBeenCalled();
  });

  it('applies an AI title without changing the current creation mode', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/lyrics';
    installApiMock();
    render(<App />);

    await user.type(await screen.findByRole('textbox', { name: '目标风格' }), '雨夜城市 Dream Pop');
    await user.click(screen.getByRole('button', { name: /根据歌词建议标题/ }));
    await user.click(await screen.findByRole('button', { name: '生成建议' }));
    await user.click(await screen.findByRole('button', { name: '应用所选建议' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI 创作伙伴' })).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: '歌曲标题' })).toHaveValue('夜航微光');
    await user.click(screen.getByRole('button', { name: /创作工作台/ }));
    expect(await screen.findByRole('tab', { name: '灵感模式' })).toHaveAttribute('aria-selected', 'true');
  });

  it('labels a released AI reservation as released instead of a preview', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/lyrics';
    installApiMock([], { aiBillingStatus: 'released', aiActualCredits: 0 });
    render(<App />);

    await user.type(await screen.findByRole('textbox', { name: '目标风格' }), '雨夜城市 Dream Pop');
    await user.click(screen.getByRole('button', { name: /根据歌词建议标题/ }));
    await user.click(await screen.findByRole('button', { name: '生成建议' }));
    await user.click(await screen.findByRole('button', { name: '应用所选建议' }));

    expect(await screen.findByText('已应用 AI 建议（预留积分已释放），原始版本仍保留')).toBeInTheDocument();
    expect(screen.queryByText(/示例预览未扣积分/)).not.toBeInTheDocument();
  });

  it('applies only checked AI fields and preserves every unchecked editor field', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/create';
    const fetchMock = installApiMock();
    render(<App />);

    await user.type(await screen.findByRole('textbox', { name: '描述你的音乐' }), '雨夜城市情歌');
    await user.click(screen.getByRole('button', { name: /打开创作伙伴/ }));
    await user.click(await screen.findByRole('button', { name: '生成建议' }));
    await user.click(await screen.findByRole('checkbox', { name: /应用标题/ }));
    await user.click(screen.getByRole('checkbox', { name: /应用风格标签/ }));
    await user.click(screen.getByRole('button', { name: '应用所选建议' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI 创作伙伴' })).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: '自定义歌词' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: /歌名/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '音乐风格' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '歌词', exact: true })).toHaveValue('[Verse]\n结构化歌词');
    await user.click(screen.getByRole('button', { name: /人声与高级参数/ }));
    expect(screen.getByRole('textbox', { name: '排除风格' })).toHaveValue('spoken word');

    const acceptCall = fetchMock.mock.calls.find(([url]) => /^\/api\/ai\/assist\/[^/]+\/accept$/.test(String(url)));
    expect(JSON.parse(String(acceptCall?.[1]?.body))).toMatchObject({ appliedFields: ['lyrics', 'negativeTags'] });
  });
});
