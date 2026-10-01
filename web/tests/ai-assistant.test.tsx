import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { AiAssistant } from '../src/components/AiAssistant';
import { DEFAULT_FORM } from '../src/components/CreatePanel';
import type { AiAssistAction, AiAssistResult, AiModelProfile, AiOperationProfile } from '../src/types';

const AI_MODELS: AiModelProfile[] = [
  {
    id: 'gpt-lyrics', displayName: 'GPT Lyrics', provider: 'OpenAI',
    description: '歌词创作模型', badge: '歌词推荐', enabled: true, reason: null,
    defaultForLyrics: true, defaultForFastTasks: false,
  },
  {
    id: 'gpt-fast', displayName: 'Gemini Fast', provider: 'Google',
    description: '快速灵感模型', badge: '快速推荐', enabled: true, reason: null,
    defaultForLyrics: false, defaultForFastTasks: true,
  },
];

const operationCodeFor = (action: AiAssistAction) => action === 'lyrics.generate'
  ? 'lyrics_generate'
  : action.startsWith('lyrics.') ? 'lyrics_rewrite' : 'prompt_optimize';

function profile(action: AiAssistAction, overrides: Partial<AiOperationProfile> = {}): AiOperationProfile {
  return {
    action,
    operationCode: operationCodeFor(action),
    model: action.startsWith('lyrics.') ? 'gpt-lyrics' : 'gpt-fast',
    modelAuthorized: true,
    available: true,
    catalogAvailable: true,
    estimatedCredits: action === 'lyrics.generate' ? 2 : 1,
    priceVersion: 'ai-price-v7',
    chargingEnabled: true,
    executable: true,
    previewExecutable: false,
    ...overrides,
  };
}

function result(action: AiAssistAction, overrides: Partial<AiAssistResult> = {}): AiAssistResult {
  return {
    id: 'ai-run-1',
    action,
    original: '原始内容',
    suggestion: '建议内容',
    summary: '改善结构和表达',
    estimatedCredits: action === 'lyrics.generate' ? 2 : 1,
    actualCredits: 1,
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function renderAssistant({
  action = 'lyrics.generate' as AiAssistAction,
  form = { ...DEFAULT_FORM, description: '雨夜情歌' },
  operations = [profile(action)],
  models = AI_MODELS,
  modelsError = null as string | null,
  operationsError = null as string | null,
  accountBalance = 100 as number | null,
  onApply = vi.fn(),
  onClose = vi.fn(),
  onActionChange = vi.fn(),
} = {}) {
  return {
    onApply,
    onClose,
    onActionChange,
    ...render(<AiAssistant action={action} form={form} models={models} modelsError={modelsError} operations={operations} operationsError={operationsError} accountBalance={accountBalance} onActionChange={onActionChange} onApply={onApply} onClose={onClose} />),
  };
}

describe('AI creation assistant', () => {
  it('uses the current inspiration brief for lyrics instead of old custom lyrics', async () => {
    const user = userEvent.setup();
    const brief = '写给王会杰，清晨林间的嫩绿色，清透柔和、慢悠悠';
    const assist = vi.spyOn(api, 'aiAssist').mockResolvedValue(result('lyrics.generate'));
    renderAssistant({
      form: { ...DEFAULT_FORM, mode: 'simple', description: brief, lyrics: '[Verse]\n旧歌词' },
    });

    expect(screen.getByRole('textbox', { name: '原始内容 / 创作要求' })).toHaveValue(brief);
    await user.click(screen.getByRole('button', { name: '生成建议' }));
    await waitFor(() => expect(assist).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lyrics.generate', input: brief }),
      expect.any(String),
    ));
  });

  it('uses the exact server quote and removes the old hard-coded 3-credit price', async () => {
    renderAssistant();
    expect(await screen.findByText('预计消耗 2 积分 · 生成前不会扣费')).toBeInTheDocument();
    expect(screen.queryByText('预计消耗 3 积分 · 生成前不会扣费')).not.toBeInTheDocument();
    expect(screen.getByTitle('生成完整歌词 · 2 积分')).toBeInTheDocument();
  });

  it.each([
    ['模型目录请求失败', { modelsError: 'AI 模型目录加载失败：offline' }],
    ['没有可用模型', { models: [] }],
    ['目录请求失败', { operationsError: 'AI 能力与价格目录加载失败：offline' }],
    ['动作缺失', { operations: [] }],
    ['目录不可用', { operations: [profile('lyrics.generate', { catalogAvailable: false, reason: '未配置目录' })] }],
    ['估价缺失', { operations: [profile('lyrics.generate', { estimatedCredits: null })] }],
    ['价格版本缺失', { operations: [profile('lyrics.generate', { priceVersion: null })] }],
    ['模型未授权', { operations: [profile('lyrics.generate', { modelAuthorized: false, reason: '模型未授权' })] }],
    ['动作不可用', { operations: [profile('lyrics.generate', { available: false, reason: '动作关闭' })] }],
    ['未授权执行', { operations: [profile('lyrics.generate', { executable: false, previewExecutable: false, reason: '计费写入关闭' })] }],
    ['余额未加载', { accountBalance: null }],
    ['余额不足', { accountBalance: 1 }],
  ])('fails closed when %s', async (_name, props) => {
    const assist = vi.spyOn(api, 'aiAssist');
    renderAssistant(props);
    const button = await screen.findByRole('button', { name: '生成建议' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('当前不可执行');
    expect(assist).not.toHaveBeenCalled();
  });

  it('matches authorization by exact action and never borrows a shared operation code', async () => {
    const assist = vi.spyOn(api, 'aiAssist');
    renderAssistant({
      action: 'lyrics.continue',
      form: { ...DEFAULT_FORM, lyrics: '[Verse]\n原歌词' },
      operations: [profile('lyrics.rewrite')],
    });
    expect(await screen.findByRole('button', { name: '生成建议' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('未返回此 AI 动作');
    expect(assist).not.toHaveBeenCalled();
  });

  it('blocks OIDC billing-off semantics and only enables an explicitly authorized development preview', async () => {
    const assist = vi.spyOn(api, 'aiAssist').mockResolvedValue(result('lyrics.generate', {
      suggestion: '[Verse]\n本地预览', actualCredits: 0,
      billing: {
        operationCode: 'lyrics_generate', priceVersion: 'museflow-development-preview-v1',
        estimatedCredits: 2, actualCredits: 0, status: 'preview',
      },
    }));
    const { rerender } = render(<AiAssistant action="lyrics.generate" form={{ ...DEFAULT_FORM, description: '预览主题' }} models={AI_MODELS} modelsError={null} operations={[profile('lyrics.generate', {
      chargingEnabled: false, available: false, executable: false, previewExecutable: false,
      reason: 'ModelCross 计费写入尚未启用，禁止发起真实 AI 调用',
    })]} operationsError={null} accountBalance={100} onActionChange={vi.fn()} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '生成建议' })).toBeDisabled();
    expect(assist).not.toHaveBeenCalled();

    rerender(<AiAssistant action="lyrics.generate" form={{ ...DEFAULT_FORM, description: '预览主题' }} models={AI_MODELS} modelsError={null} operations={[profile('lyrics.generate', {
      chargingEnabled: false, available: true, executable: true, previewExecutable: true,
      reason: '本地开发预览，不会调用真实 AI 或扣除积分',
    })]} operationsError={null} accountBalance={100} onActionChange={vi.fn()} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/本地开发预览，不调用真实 AI、不扣积分/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '生成建议' }));
    expect(await screen.findByText('本次消耗 0 积分 · 本地开发预览')).toBeInTheDocument();
    expect(assist).toHaveBeenCalledOnce();
  });

  it('reports an API failure without fabricating or applying a demo suggestion', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'aiAssist').mockRejectedValue(new Error('offline'));
    const accept = vi.spyOn(api, 'acceptAiAssist');
    const onApply = vi.fn();
    renderAssistant({ action: 'prompt.optimize', form: { ...DEFAULT_FORM, description: '雨夜情歌' }, operations: [profile('prompt.optimize')], onApply });

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    await waitFor(() => expect(screen.getByText(/AI 请求失败，未生成或应用任何示例内容/)).toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '建议版本' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /应用建议/ })).not.toBeInTheDocument();
  });

  it('rotates the idempotency key after a failed request and after payload changes', async () => {
    const user = userEvent.setup();
    const assist = vi.spyOn(api, 'aiAssist')
      .mockRejectedValueOnce(new Error('response lost'))
      .mockRejectedValueOnce(new Error('still unavailable'))
      .mockResolvedValueOnce(result('prompt.optimize'));
    renderAssistant({ action: 'prompt.optimize', operations: [profile('prompt.optimize')] });

    const generate = screen.getByRole('button', { name: '生成建议' });
    await user.click(generate);
    await screen.findByText(/response lost/);
    await user.click(generate);
    await screen.findByText(/still unavailable/);
    expect(assist.mock.calls[0][1]).not.toBe(assist.mock.calls[1][1]);

    await user.type(screen.getByRole('textbox', { name: '原始内容 / 创作要求' }), ' 新内容');
    await user.click(generate);
    await screen.findByText('建议内容');
    expect(assist.mock.calls[2][1]).not.toBe(assist.mock.calls[1][1]);
  });

  it('keeps a successful idempotency key for safe unchanged replay', async () => {
    const user = userEvent.setup();
    const assist = vi.spyOn(api, 'aiAssist')
      .mockResolvedValueOnce(result('prompt.optimize'))
      .mockResolvedValueOnce(result('prompt.optimize', { id: 'ai-run-2' }));
    renderAssistant({ action: 'prompt.optimize', operations: [profile('prompt.optimize')] });

    const generate = screen.getByRole('button', { name: '生成建议' });
    await user.click(generate);
    await screen.findByText('建议内容');
    await user.click(generate);
    await waitFor(() => expect(assist).toHaveBeenCalledTimes(2));
    expect(assist.mock.calls[0][1]).toBe(assist.mock.calls[1][1]);
  });

  it('sends user-selected source and target languages, target model, and action parameters', async () => {
    const user = userEvent.setup();
    const assist = vi.spyOn(api, 'aiAssist').mockResolvedValue(result('lyrics.translate'));
    renderAssistant({ action: 'lyrics.translate', form: { ...DEFAULT_FORM, model: 'chirp-v4', lyrics: '[Verse]\n雨夜' }, operations: [profile('lyrics.translate')] });

    await user.selectOptions(screen.getByRole('combobox', { name: '辅助大模型' }), 'gpt-fast');
    await user.selectOptions(screen.getByRole('combobox', { name: '原文语言' }), 'ja-JP');
    await user.selectOptions(screen.getByRole('combobox', { name: '目标语言' }), 'ko-KR');
    await user.click(screen.getByRole('checkbox', { name: '尽量保留押韵' }));
    await user.click(screen.getByRole('button', { name: '生成建议' }));

    await waitFor(() => expect(assist).toHaveBeenCalledOnce());
    expect(assist.mock.calls[0][0]).toMatchObject({
      action: 'lyrics.translate',
      input: '[Verse]\n雨夜',
      aiModelId: 'gpt-fast',
      targetMusicModelId: 'chirp-v4',
      context: { language: 'ja-JP', targetLanguage: 'ko-KR' },
      options: { preserveSections: true, preserveRhyme: false },
    });
    expect(assist.mock.calls[0][0]).not.toHaveProperty('estimatedCredits');
    expect(assist.mock.calls[0][0]).not.toHaveProperty('priceVersion');
  });

  it('previews structured title and tags before persisting and applying a live suggestion', async () => {
    const user = userEvent.setup();
    const structured = result('lyrics.rewrite', {
      original: '原始歌词', suggestion: '建议歌词', title: '夜航微光',
      styleTags: ['Dream Pop', 'cinematic'], negativeTags: ['spoken word'],
    });
    vi.spyOn(api, 'aiAssist').mockResolvedValue(structured);
    const accept = vi.spyOn(api, 'acceptAiAssist').mockResolvedValue({ documentId: 'document-1', revisionId: 'revision-1' });
    const onApply = vi.fn();
    renderAssistant({ action: 'lyrics.rewrite', form: { ...DEFAULT_FORM, lyrics: '原始歌词', title: '版本标题' }, operations: [profile('lyrics.rewrite')], onApply });

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    await screen.findByText('建议歌词');
    expect(screen.getByRole('checkbox', { name: /应用标题.*夜航微光/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /应用风格标签.*Dream Pop, cinematic/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /应用排除标签.*spoken word/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '应用所选建议' }));

    await waitFor(() => expect(accept).toHaveBeenCalledWith('ai-run-1', {
      kind: 'lyrics', title: '版本标题', appliedFields: ['title', 'lyrics', 'style', 'negativeTags'],
    }));
    expect(accept.mock.invocationCallOrder[0]).toBeLessThan(onApply.mock.invocationCallOrder[0]);
    expect(onApply).toHaveBeenCalledWith({ ...structured, appliedFields: ['title', 'lyrics', 'style', 'negativeTags'] });
  });

  it('never reports reserved or reconciliation-pending credits as already consumed', async () => {
    const user = userEvent.setup();
    const assist = vi.spyOn(api, 'aiAssist').mockResolvedValueOnce(result('prompt.optimize', {
      actualCredits: null,
      billing: {
        operationCode: 'prompt_optimize', priceVersion: 'ai-price-v7', estimatedCredits: 1,
        status: 'reserved',
      },
    })).mockResolvedValueOnce(result('prompt.optimize', {
      actualCredits: null,
      billing: {
        operationCode: 'prompt_optimize', priceVersion: 'ai-price-v7', estimatedCredits: 1,
        status: 'reconcile_required',
      },
    }));
    renderAssistant({ action: 'prompt.optimize', operations: [profile('prompt.optimize')] });

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    expect(await screen.findByText('已预留 1 积分 · 结算中')).toBeInTheDocument();
    expect(screen.queryByText('本次消耗 1 积分')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成建议' }));
    // The unchanged request intentionally reuses its key; the mock returns the server's later
    // reconciliation state to exercise honest billing copy.
    expect(await screen.findByText('结算待确认 · 请勿重复提交')).toBeInTheDocument();
    expect(screen.queryByText('本次消耗 1 积分')).not.toBeInTheDocument();
    expect(assist.mock.calls[0][1]).toBe(assist.mock.calls[1][1]);
  });

  it.each([
    ['released', '本次消耗 0 积分 · 预留已释放'],
    ['refunded', '本次消耗 0 积分 · 已退款'],
    ['disabled', '本次消耗 0 积分 · 计费已关闭'],
    ['not_reserved', '本次消耗 0 积分 · 未发生预扣'],
    ['manual_review_required', '结算需人工核对 · 请勿重复提交'],
  ] as const)('renders the authoritative %s AI billing state without calling it a development preview', async (status, label) => {
    vi.spyOn(api, 'aiAssist').mockResolvedValue(result('prompt.optimize', {
      actualCredits: status === 'manual_review_required' ? null : 0,
      billing: {
        operationCode: 'prompt_optimize', priceVersion: 'ai-price-terminal-v1', estimatedCredits: 1,
        actualCredits: status === 'manual_review_required' ? undefined : 0,
        status,
      },
    }));
    renderAssistant({ action: 'prompt.optimize', operations: [profile('prompt.optimize')] });

    await userEvent.click(screen.getByRole('button', { name: '生成建议' }));
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/本地开发预览/)).not.toBeInTheDocument();
  });

  it('records and applies only explicitly selected structured fields', async () => {
    const user = userEvent.setup();
    const structured = result('lyrics.generate', {
      suggestion: '[Verse]\n只应用歌词', title: '不应用的标题',
      styleTags: ['不应用的风格'], negativeTags: ['不应用的排除标签'],
    });
    vi.spyOn(api, 'aiAssist').mockResolvedValue(structured);
    const accept = vi.spyOn(api, 'acceptAiAssist').mockResolvedValue({ documentId: 'document-selective', revisionId: 'revision-selective' });
    const onApply = vi.fn();
    renderAssistant({ onApply });

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    await user.click(await screen.findByRole('checkbox', { name: /应用标题/ }));
    await user.click(screen.getByRole('checkbox', { name: /应用风格标签/ }));
    await user.click(screen.getByRole('checkbox', { name: /应用排除标签/ }));
    await user.click(screen.getByRole('button', { name: '应用所选建议' }));

    await waitFor(() => expect(accept).toHaveBeenCalledWith('ai-run-1', expect.objectContaining({ appliedFields: ['lyrics'] })));
    expect(onApply).toHaveBeenCalledWith({ ...structured, appliedFields: ['lyrics'] });
  });

  it('keeps the editor unchanged when revision persistence fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'aiAssist').mockResolvedValue(result('prompt.optimize'));
    vi.spyOn(api, 'acceptAiAssist').mockRejectedValue(new Error('database unavailable'));
    const onApply = vi.fn();
    renderAssistant({ action: 'prompt.optimize', operations: [profile('prompt.optimize')], onApply });

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    await screen.findByText('建议内容');
    await user.click(screen.getByRole('button', { name: '应用所选建议' }));

    expect(await screen.findByText(/建议版本保存失败/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('traps focus, restores the trigger, closes with Escape, and ignores Escape while busy', async () => {
    const user = userEvent.setup();
    let resolveAssist!: (value: AiAssistResult) => void;
    vi.spyOn(api, 'aiAssist').mockImplementation(() => new Promise((resolve) => { resolveAssist = resolve; }));

    function Harness() {
      const [action, setAction] = useState<AiAssistAction | null>(null);
      return <><button type="button" onClick={() => setAction('lyrics.generate')}>打开 AI</button><AiAssistant action={action} form={{ ...DEFAULT_FORM, description: '焦点测试' }} models={AI_MODELS} modelsError={null} operations={[profile('lyrics.generate')]} operationsError={null} accountBalance={100} onActionChange={setAction} onApply={vi.fn()} onClose={() => setAction(null)} /></>;
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '打开 AI' });
    trigger.focus();
    await user.click(trigger);
    const close = await screen.findByRole('button', { name: '关闭 AI 创作伙伴' });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '生成建议' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'AI 创作伙伴' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 请求处理中，暂时无法关闭' })).toBeDisabled();
    resolveAssist(result('lyrics.generate'));
    await screen.findByText('建议内容');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI 创作伙伴' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
