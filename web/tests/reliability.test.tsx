import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { api } from '../src/api';
import { DEMO_BILLING, DEMO_MODELS, DEMO_PROJECTS, DEMO_SESSION } from '../src/fixtures';
import type { PlatformTask, SessionSummary, Track } from '../src/types';
import { makeTrack } from './track-fixture';
import { SUNO_MODEL, SUNO_OPERATIONS } from './suno-fixture';
import { AI_OPERATIONS } from './ai-fixture';

const AUTH_SESSION: SessionSummary = {
  ...DEMO_SESSION,
  demo: false,
  account: DEMO_SESSION.account ? {
    ...DEMO_SESSION.account,
    topUpUrl: 'https://modelcross.example/topup',
    ordersUrl: 'https://modelcross.example/orders',
    accountUrl: 'https://modelcross.example/account',
  } : null,
};

const TASK: PlatformTask = {
  id: 'task-live-1',
  batchId: 'batch-live-1',
  title: '真实任务标题',
  operation: 'generate',
  model: 'chirp-fenix',
  status: 'generating',
  progress: 0.42,
  estimatedCredits: 20,
  chargedCredits: null,
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:01:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type ApiOverride = (url: string, init?: RequestInit) => Response | undefined;

function installApiMock(override?: ApiOverride, tracks: Track[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const overridden = override?.(url, init);
    if (overridden) return overridden;
    if (url === '/api/session' || url === '/api/me') return response(AUTH_SESSION);
    if (url === '/api/health') return response({
      provider: 'mxapi', configured: true, upstreamReachable: true, ready: true,
      active: 0, queued: 0, balance: 5000, billingLive: false,
      models: [SUNO_MODEL.id, ...DEMO_MODELS.slice(1).map((model) => model.id)],
    });
    if (url === '/api/library') return response(tracks);
    if (url === '/api/catalog/music-models') return response([SUNO_MODEL, ...DEMO_MODELS.slice(1)]);
    if (url === '/api/catalog/music-operations') return response(SUNO_OPERATIONS);
    if (url === '/api/catalog/ai-operations') return response(AI_OPERATIONS);
    if (/^\/api\/tracks\/[^/]+\/assets\/jobs$/.test(url)) return response([]);
    if (url === '/api/projects') return response([]);
    if (url === '/api/tasks') return response([]);
    if (url === '/api/billing/summary') return response({ ...DEMO_BILLING, account: AUTH_SESSION.account });
    if (url === '/api/billing/orders') return response([]);
    return response({ error: `unhandled ${init?.method || 'GET'} ${url}` }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('authenticated workspace reliability contracts', () => {
  beforeEach(() => {
    window.location.hash = '';
    localStorage.clear();
    api.resetAuthRequired();
  });

  it('does not inject a demo identity when the session API fails', async () => {
    const fetchMock = installApiMock((url) => url === '/api/session'
      ? response({ error: 'session unavailable' }, 503)
      : undefined);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '暂时无法进入 MuseFlow' })).toBeInTheDocument();
    expect(screen.getByText(/无法确认登录状态：session unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新连接' })).toBeInTheDocument();
    expect(screen.queryByText('音乐创作者')).not.toBeInTheDocument();
    expect(screen.queryByText('霓虹夜航')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/projects')).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/billing/orders')).toBe(false);
  });

  it('preserves a protected deep link while starting unified authentication', async () => {
    window.location.hash = '#/billing';
    const replace = vi.spyOn(api, 'replaceWithLogin').mockImplementation(() => undefined);
    installApiMock((url) => url === '/api/session'
      ? response({ authenticated: false, user: null, account: null })
      : undefined);

    render(<App />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/#/billing'));
    expect(window.location.hash).toBe('#/billing');
  });

  it('rechecks an expired runtime session once and returns to the current route through OIDC', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/billing?tab=usage';
    const replace = vi.spyOn(api, 'replaceWithLogin').mockImplementation(() => undefined);
    let sessionCalls = 0;
    let billingCalls = 0;
    installApiMock((url) => {
      if (url === '/api/session') {
        sessionCalls += 1;
        return response(sessionCalls === 1
          ? AUTH_SESSION
          : { authenticated: false, user: null, account: null });
      }
      if (url.startsWith('/api/billing/summary')) {
        billingCalls += 1;
        return billingCalls === 1
          ? response({ ...DEMO_BILLING, account: AUTH_SESSION.account })
          : response({ error: 'session expired' }, 401);
      }
      return undefined;
    });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '刷新余额' }));

    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith('/#/billing?tab=usage');
    expect(sessionCalls).toBe(2);
    expect(window.location.hash).toBe('#/billing?tab=usage');
  });

  it('shows a safe visible message when ModelCross authorization is cancelled', async () => {
    window.location.hash = '#/create?auth_error=access_denied';
    installApiMock();

    render(<App />);

    expect(await screen.findByText('ModelCross 登录已取消，你仍可留在当前工作区。')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/create');
    expect(document.body).not.toHaveTextContent('error_description');
  });

  it('does not immediately restart OIDC after a cancelled protected-route login', async () => {
    window.location.hash = '#/billing?auth_error=access_denied';
    const replace = vi.spyOn(api, 'replaceWithLogin').mockImplementation(() => undefined);
    installApiMock((url) => url === '/api/session'
      ? response({ authenticated: false, user: null, account: null })
      : undefined);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '暂时无法进入 MuseFlow' })).toBeInTheDocument();
    expect(screen.getByText('ModelCross 登录已取消，你仍可留在当前工作区。')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '重新连接' })).toBeEnabled();
  });

  it('clears a stale account-scoped model catalog when the identity changes and refresh fails', async () => {
    const user = userEvent.setup();
    const formerModel = { ...SUNO_MODEL, id: 'former-private-model', displayName: '旧账户私有模型' };
    let modelAttempts = 0;
    installApiMock((url) => {
      if (url === '/api/catalog/music-models') {
        modelAttempts += 1;
        return modelAttempts === 1
          ? response([formerModel])
          : response({ error: 'new identity catalog unavailable' }, 503);
      }
      if (url === '/api/auth/logout') return response({ ok: true });
      return undefined;
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: '旧账户私有模型' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /开始创作/ })[0]);
    await user.click(await screen.findByRole('button', { name: '系统与偏好' }));
    await user.click(screen.getByRole('button', { name: '退出登录' }));

    await waitFor(() => expect(modelAttempts).toBe(2));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '旧账户私有模型' })).not.toBeInTheDocument());
    expect(screen.getByText('账户动态报价')).toBeInTheDocument();
    expect(screen.getAllByText('登录查看账户价格').length).toBeGreaterThan(0);
    expect(screen.queryByText(/(?:演示预计|预计) \d+ 积分/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suno V5.5' })).toBeInTheDocument();
  });

  it('shows private-resource failures explicitly and never replaces them with demo records', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/projects';
    installApiMock((url) => {
      if (url === '/api/projects') return response({ error: 'projects offline' }, 503);
      if (url === '/api/tasks') return response({ error: 'tasks offline' }, 503);
      if (url === '/api/billing/summary') return response({ error: 'billing offline' }, 503);
      if (url === '/api/billing/orders') return response({ error: 'orders offline' }, 503);
      return undefined;
    });

    render(<App />);

    expect(await screen.findByText('项目暂时不可用')).toBeInTheDocument();
    expect(screen.getByText(/projects offline.*页面没有使用演示数据替代/)).toBeInTheDocument();
    expect(screen.queryByText(DEMO_PROJECTS[0].title)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '任务调度中心' }));
    expect(await screen.findByText('任务状态暂时无法同步')).toBeInTheDocument();
    expect(screen.getByText(/tasks offline.*页面没有使用演示数据替代/)).toBeInTheDocument();
    expect(screen.queryByText('凌晨三点的海')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '账单与 Credits' }));
    expect(await screen.findByText('账户余额暂时不可用')).toBeInTheDocument();
    expect(screen.getByText('订单与消费记录暂时不可用')).toBeInTheDocument();
    expect(screen.getByText(/orders offline.*页面没有使用演示数据替代/)).toBeInTheDocument();
    expect(screen.queryByText('积分充值 2,000')).not.toBeInTheDocument();
  });

  it('retries a failed project request and only renders the server result', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    window.location.hash = '#/projects';
    installApiMock((url) => {
      if (url !== '/api/projects') return undefined;
      attempts += 1;
      return attempts === 1
        ? response({ error: 'temporary project outage' }, 503)
        : response([DEMO_PROJECTS[0]]);
    });

    render(<App />);
    expect(await screen.findByText('项目暂时不可用')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByRole('heading', { name: DEMO_PROJECTS[0].title })).toBeInTheDocument();
    expect(screen.queryByText('项目暂时不可用')).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('keeps a failed project form open and never creates a local placeholder or success toast', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/projects';
    installApiMock((url, init) => url === '/api/projects' && init?.method === 'POST'
      ? response({ error: 'database unavailable' }, 500)
      : undefined);

    render(<App />);
    await screen.findByRole('heading', { level: 2, name: '项目与专辑', exact: true });
    await user.click(screen.getAllByRole('button', { name: '新建项目', exact: true })[0]);
    const dialog = screen.getByRole('dialog', { name: '新建音乐项目' });
    const title = screen.getByRole('textbox', { name: '项目名称' });
    await user.type(title, '不应丢失的项目');
    await user.type(screen.getByRole('textbox', { name: '项目描述' }), '保留这段输入');
    await user.click(screen.getByRole('button', { name: '创建项目' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('项目创建失败：database unavailable');
    expect(dialog).toBeInTheDocument();
    expect(title).toHaveValue('不应丢失的项目');
    expect(screen.getByRole('textbox', { name: '项目描述' })).toHaveValue('保留这段输入');
    expect(screen.queryByText(/项目“不应丢失的项目”已创建/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('local-');
  });

  it('represents an HTTP 202 generation as a pending task without fabricating a track', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/create';
    installApiMock((url) => url === '/api/generate'
      ? response({ generationId: 'generation-pending-1', status: 'submitting', tracks: [] }, 202)
      : undefined);

    render(<App />);
    const prompt = await screen.findByRole('textbox', { name: '描述你的音乐' });
    await user.type(prompt, '等待入队的测试歌曲');
    const submit = screen.getByRole('button', { name: /生成 2 首歌曲 · 20 积分/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await screen.findByText(/生成请求已受理，正在等待任务入队/)).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /作品 等待入队的测试歌曲/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^任务调度中心/ }));
    expect(await screen.findByText('等待入队的测试歌曲')).toBeInTheDocument();
    expect(screen.getByText('提交中')).toBeInTheDocument();
    expect(screen.queryByText('generation-pending-1')).not.toBeInTheDocument();
  });

  it('accepts an HTTP 202 track action and exposes its pending task', async () => {
    const user = userEvent.setup();
    const track = makeTrack();
    window.location.hash = '#/library';
    const fetchMock = installApiMock((url) => url === `/api/tracks/${track.id}/actions`
      ? response({ generationId: 'action-pending-1', status: 'submitting', tracks: [] }, 202)
      : undefined, [track]);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: `查看作品 ${track.title}` }));
    await user.click(screen.getByRole('button', { name: '续写' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '目标模型' }), 'chirp-auk-turbo');
    const title = screen.getByRole('textbox', { name: /新版本标题/ });
    await user.clear(title);
    await user.type(title, '目标模型续写版');
    await user.click(screen.getByRole('button', { name: '确认创建' }));

    expect(await screen.findByText(/续写请求已受理，正在等待任务入队/)).toBeInTheDocument();
    const actionCall = fetchMock.mock.calls.find(([url]) => url === `/api/tracks/${track.id}/actions`);
    expect(JSON.parse(String(actionCall?.[1]?.body))).toEqual({
      action: 'extend',
      continueAt: 110,
      model: 'chirp-auk-turbo',
      mode: 'custom',
      title: '目标模型续写版',
      description: '',
      style: 'Dream Pop',
      lyrics: '[Verse]\n测试歌词',
      instrumental: false,
      negativeTags: '',
      vocalGender: 'auto',
      styleWeight: 0.65,
      weirdness: 0.5,
    });
    await user.click(screen.getByRole('button', { name: /^任务调度中心/ }));
    expect(await screen.findByText('目标模型续写版')).toBeInTheDocument();
    expect(screen.getByText(/Suno V4.5 All/)).toBeInTheDocument();
    expect(screen.getByText('提交中')).toBeInTheDocument();
  });

  it('keeps the authenticated workspace when logout fails', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    installApiMock((url) => url === '/api/auth/logout'
      ? response({ error: 'logout unavailable' }, 500)
      : undefined);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '退出登录' }));

    expect(await screen.findByText(/退出失败，当前会话仍然有效：logout unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '系统与偏好', exact: true })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/settings');
  });

  it('keeps a completed track when deletion fails and disables deletion before settlement', async () => {
    const user = userEvent.setup();
    const completed = makeTrack({ id: 'completed-track', title: '删除失败仍保留' });
    window.location.hash = '#/library';
    const fetchMock = installApiMock((url, init) => url === `/api/tracks/${completed.id}` && init?.method === 'DELETE'
      ? response({ error: 'storage unavailable' }, 500)
      : undefined, [completed]);
    vi.mocked(window.confirm).mockReturnValue(true);

    const { unmount } = render(<App />);
    const card = await screen.findByRole('article', { name: `作品 ${completed.title}` });
    await user.click(screen.getByRole('button', { name: '删除', exact: true }));
    expect(await screen.findByText(/删除失败，作品仍保留：storage unavailable/)).toBeInTheDocument();
    expect(card).toBeInTheDocument();
    unmount();

    window.location.hash = '#/library';
    const inflight = makeTrack({ id: 'queued-track', title: '尚未结算', status: 'queued', stage: 'queued', progress: 0, file: null, customId: null, finishedAt: null });
    installApiMock(undefined, [inflight]);
    render(<App />);
    const disabledDelete = await screen.findByRole('button', { name: '任务结算前不可删除' });
    expect(disabledDelete).toBeDisabled();
    await user.click(disabledDelete);
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/api/tracks/') && init?.method === 'DELETE')).toHaveLength(1);
  });

  it('persists an explicit device-local draft with version, timestamp, and form data', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/lyrics';
    installApiMock();
    render(<App />);

    await user.type(await screen.findByRole('textbox', { name: '歌曲标题' }), '本地草稿标题');
    await user.type(screen.getByRole('textbox', { name: '歌词', exact: true }), '[Verse]\n只在本机保存');
    await user.click(screen.getByRole('button', { name: '保存到此设备' }));

    expect(await screen.findByText(/草稿已保存在此设备，不会同步到其他设备/)).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('museflow.local-draft.v2.preview-user') || 'null') as {
      version: number; savedAt: string; form: { title: string; lyrics: string };
    };
    expect(stored.version).toBe(1);
    expect(Number.isNaN(Date.parse(stored.savedAt))).toBe(false);
    expect(stored.form.title).toBe('本地草稿标题');
    expect(stored.form.lyrics).toContain('只在本机保存');
    expect(screen.getByLabelText('已保存的本地草稿')).toHaveTextContent('不会跨设备同步');
  });

  it('namespaces lyrics by subject and does not expose user A content after logout and user B login', async () => {
    const user = userEvent.setup();
    const sessionFor = (subject: string, name: string): SessionSummary => ({
      ...AUTH_SESSION,
      user: AUTH_SESSION.user ? { ...AUTH_SESSION.user, id: subject, subject, name, email: `${subject}@example.test` } : null,
    });
    let activeSession = sessionFor('account-a', '用户 A');
    window.location.hash = '#/lyrics';
    installApiMock((url) => {
      if (url === '/api/session') return response(activeSession);
      if (url === '/api/auth/logout') return response({ ok: true });
      return undefined;
    });

    const first = render(<App />);
    await user.type(await screen.findByRole('textbox', { name: '歌曲标题' }), 'A 的私密标题');
    await user.type(screen.getByRole('textbox', { name: '歌词', exact: true }), 'A 的私密歌词');
    await user.click(screen.getByRole('button', { name: '保存到此设备' }));
    await screen.findByText(/草稿已保存在此设备/);
    expect(localStorage.getItem('museflow.local-draft.v2.account-a')).toContain('A 的私密歌词');

    await user.click(screen.getByRole('button', { name: '系统与偏好' }));
    await user.click(await screen.findByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('heading', { level: 1, name: /让每一个想法/ })).toBeInTheDocument();
    first.unmount();

    activeSession = sessionFor('account-b', '用户 B');
    window.location.hash = '#/lyrics';
    render(<App />);

    expect(await screen.findByRole('textbox', { name: '歌曲标题' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '歌词', exact: true })).toHaveValue('');
    expect(screen.getByText(/尚未手动保存/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('A 的私密标题');
    expect(document.body.textContent).not.toContain('A 的私密歌词');
    expect(localStorage.getItem('museflow.local-draft.v2.account-b')).toBeNull();
    expect(localStorage.getItem('museflow.form.v2')).toBeNull();
    expect(localStorage.getItem('museflow.local-draft.v1')).toBeNull();
  });

  it('opens real task details and never renders hard-coded purchasable prices', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/tasks';
    installApiMock((url) => url === '/api/tasks' ? response([TASK]) : undefined);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `${TASK.title} 详情` }));
    const details = screen.getByRole('dialog', { name: TASK.title });
    expect(details).toHaveTextContent(TASK.id);
    expect(details).toHaveTextContent(TASK.batchId);
    expect(details).toHaveTextContent('42%');

    await user.click(screen.getByRole('button', { name: '账单与 Credits' }));
    expect(await screen.findByText('积分包与订阅由 ModelCross 实时提供')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[¥￥]\s*(?:29|99|259)/);
    expect(screen.queryByRole('button', { name: '选择积分包' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '购买积分' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看可购买商品' })).toBeInTheDocument();
  });
});
