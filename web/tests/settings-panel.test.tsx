import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { SettingsPanel } from '../src/components/SettingsPanel';
import { DEMO_MODELS } from '../src/fixtures';
import { SUNO_OPERATIONS } from './suno-fixture';

const AI_MODELS = [{
  id: 'gpt-5.4', displayName: 'GPT-5.4', provider: 'OpenAI' as const,
  description: '歌词创作模型', badge: '歌词推荐', enabled: true, reason: null,
  defaultForLyrics: true, defaultForFastTasks: false,
}];

describe('platform-managed model settings', () => {
  it('shows only read-only platform status and never renders provider credentials', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue({
      apiBaseUrl: 'https://internal-provider.invalid',
      apiKeySet: true,
      source: { apiBaseUrl: 'env', apiKey: 'env' },
      locked: { apiBaseUrl: true, apiKey: true },
      platformManaged: true,
      managedBy: 'deployment',
      providerConfigured: true,
      adminUrl: null,
    });
    vi.spyOn(api, 'health').mockResolvedValue({ provider: 'ModelCross Music Gateway', configured: true, upstreamReachable: true, ready: true, active: 1, queued: 2, balance: null, models: DEMO_MODELS.map((model) => model.id) });
    vi.spyOn(api, 'models').mockResolvedValue(DEMO_MODELS.map((model) => ({ ...model, estimatedCredits: { ...model.estimatedCredits, generatePair: 999 } })));
    vi.spyOn(api, 'aiModels').mockResolvedValue(AI_MODELS);
    vi.spyOn(api, 'musicOperations').mockResolvedValue(SUNO_OPERATIONS);
    const providerPoints = vi.spyOn(api, 'providerPoints');

    render(<SettingsPanel onSaved={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'ModelCross 托管的 Provider 与账户授权' })).toBeInTheDocument();
    expect(screen.getByText('授权已托管')).toBeInTheDocument();
    expect(screen.getByText(/永久 Provider 凭证、Base URL 与上游路由仅保存在 ModelCross 控制面/)).toBeInTheDocument();
    expect(screen.getByText(/MuseFlow 服务端通过短期、限作用域 task token 调用网关/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /打开 ModelCross 管理后台/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API Key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API Base URL/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存设置|测试连接/ })).not.toBeInTheDocument();
    expect(screen.queryByText('https://internal-provider.invalid')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('999');
    expect(screen.getAllByText('20')).toHaveLength(3);
    expect(providerPoints).not.toHaveBeenCalled();
  });

  it('exposes provider points diagnostics only to administrators and supports pagination', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue({ apiBaseUrl: '', apiKeySet: true, source: { apiBaseUrl: 'env', apiKey: 'env' }, locked: { apiBaseUrl: true, apiKey: true }, platformManaged: true, managedBy: 'deployment', providerConfigured: true, adminUrl: null });
    vi.spyOn(api, 'health').mockResolvedValue({ provider: 'ModelCross', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: null, models: [] });
    vi.spyOn(api, 'models').mockResolvedValue([]);
    vi.spyOn(api, 'aiModels').mockResolvedValue([]);
    vi.spyOn(api, 'musicOperations').mockResolvedValue([]);
    const providerPoints = vi.spyOn(api, 'providerPoints').mockResolvedValue({
      balance: 4321,
      logs: {
        list: [{ id: 'ledger-1', operation: 'music.generate', points: -20, created_at: '2026-08-26T00:00:00Z' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });
    const user = userEvent.setup();

    render(<SettingsPanel onSaved={vi.fn()} isAdmin />);

    expect(await screen.findByRole('heading', { name: 'Provider 商户 points 诊断' })).toBeInTheDocument();
    expect(screen.getByText('4,321')).toBeInTheDocument();
    expect(screen.getByText('music.generate')).toBeInTheDocument();
    expect(screen.getByText(/不是当前用户的 ModelCross 钱包/)).toBeInTheDocument();
    expect(providerPoints).toHaveBeenCalledWith(1, 20);

    const page = screen.getByRole('spinbutton', { name: '页码' });
    const pageSize = screen.getByRole('spinbutton', { name: '每页条数（1–100）' });
    await user.click(page);
    await user.keyboard('{Control>}a{/Control}2');
    await user.click(pageSize);
    await user.keyboard('{Control>}a{/Control}50');
    await user.click(screen.getByRole('button', { name: '查询流水' }));
    await waitFor(() => expect(providerPoints).toHaveBeenLastCalledWith(2, 50));
  });

  it('does not expose an admin link when the server omits adminUrl', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue({ apiBaseUrl: '', apiKeySet: true, source: { apiBaseUrl: 'env', apiKey: 'env' }, locked: { apiBaseUrl: true, apiKey: true }, platformManaged: true, managedBy: 'deployment', providerConfigured: true, adminUrl: null });
    vi.spyOn(api, 'health').mockResolvedValue({ provider: 'ModelCross', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: null, models: [] });
    vi.spyOn(api, 'models').mockResolvedValue(DEMO_MODELS);
    vi.spyOn(api, 'aiModels').mockResolvedValue(AI_MODELS);
    vi.spyOn(api, 'musicOperations').mockResolvedValue(SUNO_OPERATIONS);
    render(<SettingsPanel onSaved={vi.fn()} />);
    expect(await screen.findByText('管理入口仅对管理员开放')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ModelCross 管理后台/ })).not.toBeInTheDocument();
  });

  it('shows an honest retryable failure state instead of a permanent spinner or demo models', async () => {
    vi.spyOn(api, 'settings').mockRejectedValue(new Error('settings offline'));
    vi.spyOn(api, 'health').mockRejectedValue(new Error('health offline'));
    vi.spyOn(api, 'models').mockRejectedValue(new Error('models offline'));
    vi.spyOn(api, 'aiModels').mockRejectedValue(new Error('ai models offline'));
    vi.spyOn(api, 'musicOperations').mockRejectedValue(new Error('operations offline'));

    render(<SettingsPanel onSaved={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('平台设置、连接健康状态、模型目录、AI 辅助模型目录、动作与价格目录暂时无法读取');
    expect(alert).toHaveTextContent('未使用演示数据');
    expect(screen.queryByText('正在读取平台能力…')).not.toBeInTheDocument();
    expect(screen.queryByText(DEMO_MODELS[0].displayName)).not.toBeInTheDocument();
    expect(screen.getByText('模型目录暂时无法读取，请重试。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
  });

  it('recovers on retry and only notifies the parent after a complete successful refresh', async () => {
    const settings = {
      apiBaseUrl: '', apiKeySet: true, source: { apiBaseUrl: 'env' as const, apiKey: 'env' as const },
      locked: { apiBaseUrl: true, apiKey: true }, platformManaged: true, adminUrl: null,
    };
    const health = { provider: 'ModelCross', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: null, models: [] };
    vi.spyOn(api, 'settings').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(settings);
    vi.spyOn(api, 'health').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(health);
    vi.spyOn(api, 'models').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(DEMO_MODELS);
    vi.spyOn(api, 'aiModels').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(AI_MODELS);
    vi.spyOn(api, 'musicOperations').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(SUNO_OPERATIONS);
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(<SettingsPanel onSaved={onSaved} />);
    await screen.findByRole('alert');
    expect(onSaved).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText(DEMO_MODELS[0].displayName)).toBeInTheDocument();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not retain stale model authorization or report success when a manual refresh fails', async () => {
    const settings = {
      apiBaseUrl: '', apiKeySet: true, source: { apiBaseUrl: 'env' as const, apiKey: 'env' as const },
      locked: { apiBaseUrl: true, apiKey: true }, platformManaged: true, adminUrl: null,
    };
    const health = { provider: 'ModelCross', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: null, models: [] };
    vi.spyOn(api, 'settings').mockResolvedValueOnce(settings).mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(api, 'health').mockResolvedValueOnce(health).mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(api, 'models').mockResolvedValueOnce(DEMO_MODELS).mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(api, 'aiModels').mockResolvedValueOnce(AI_MODELS).mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(api, 'musicOperations').mockResolvedValue(SUNO_OPERATIONS);
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(<SettingsPanel onSaved={onSaved} />);
    expect(await screen.findByText(DEMO_MODELS[0].displayName)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /刷新状态/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读取');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByText(DEMO_MODELS[0].displayName)).not.toBeInTheDocument();
  });
});
