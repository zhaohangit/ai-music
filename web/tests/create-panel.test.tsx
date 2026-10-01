import axe from 'axe-core';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreatePanel, DEFAULT_FORM, formFromTrack, ModelControlPanel } from '../src/components/CreatePanel';
import { EMPTY_REFERENCE_AUDIO, ReferenceAudioPanel } from '../src/components/ReferenceAudioPanel';
import { DEMO_MODELS } from '../src/fixtures';
import type { MusicModelProfile } from '../src/types';
import { SUNO_MODEL, SUNO_OPERATIONS } from './suno-fixture';
import { makeTrack } from './track-fixture';

function openAdvancedParameters() {
  const trigger = screen.getByRole('button', { name: /人声与高级参数|音效参数/ });
  if (trigger.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger);
  return trigger;
}

describe('creation workspace', () => {
  it('switches modes and exposes AI tools without overwriting input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onAi = vi.fn();
    const { rerender } = render(<CreatePanel form={DEFAULT_FORM} onFormChange={onChange} onOpenAi={onAi} />);

    await user.click(screen.getByRole('button', { name: '城市夜雨' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('雨夜城市') }));

    const custom = { ...DEFAULT_FORM, mode: 'custom' as const, style: 'Dream Pop', lyrics: '[Verse]\n海风' };
    rerender(<CreatePanel form={custom} onFormChange={onChange} onOpenAi={onAi} />);
    await user.click(screen.getByRole('button', { name: /AI 润色/ }));
    expect(onAi).toHaveBeenCalledWith('lyrics.rewrite');
  });

  it('renders capability-driven parameters and submits an exact estimate', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ModelControlPanel health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2000, models: DEMO_MODELS.map((item) => item.id) }} form={{ ...DEFAULT_FORM, description: '雨夜城市情歌' }} models={DEMO_MODELS} operations={SUNO_OPERATIONS} accountBalance={1280} onFormChange={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getAllByText('20', { selector: '.model-price' })).toHaveLength(DEMO_MODELS.filter((model) => model.enabled).length);
    openAdvancedParameters();
    expect(screen.getByRole('slider', { name: '风格强度' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /生成 2 首歌曲 · 20 积分/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: '雨夜城市情歌', model: 'chirp-fenix' }));
  });

  it('keeps optional parameters collapsed by default and exposes a readable summary', () => {
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, vocalGender: 'f', styleWeight: 0.7, weirdness: 0.4 }}
      models={[SUNO_MODEL]}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    const trigger = screen.getByRole('button', { name: /人声与高级参数.*女声.*风格 70%.*创意 40%/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('slider', { name: '风格强度' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('slider', { name: '风格强度' })).toBeInTheDocument();
  });

  it('keeps a long model catalog compact while preserving access to every model', async () => {
    const user = userEvent.setup();
    const models = [
      ['chirp-fenix', 'Suno V5.5'],
      ['chirp-crow', 'Suno V5'],
      ['chirp-auk', 'Suno V4.5+'],
      ['chirp-auk-turbo', 'Suno V4.5 All'],
      ['chirp-v4-5', 'Suno V4.5'],
      ['chirp-v4', 'Suno V4'],
    ].map(([id, displayName]) => ({ ...SUNO_MODEL, id, displayName })) as MusicModelProfile[];

    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: models.map((model) => model.id) }}
      form={DEFAULT_FORM}
      models={models}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    const disclosure = screen.getByRole('button', { name: '查看全部 6 个模型' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(disclosure);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: /^Suno V4(?:\s|$)/ })).toBeInTheDocument();
  });

  it('keeps vocal gender discoverable and updates it for a capable model', async () => {
    const user = userEvent.setup();
    const onFormChange = vi.fn();
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={DEFAULT_FORM}
      models={[SUNO_MODEL]}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={onFormChange}
      onSubmit={vi.fn()}
    />);

    openAdvancedParameters();
    expect(screen.getByRole('group', { name: '主唱声线' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自动' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '女声' }));
    expect(onFormChange).toHaveBeenCalledWith({ ...DEFAULT_FORM, vocalGender: 'f' });
  });

  it('explains that vocal gender needs an authorized capable model', () => {
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 0, models: [] }}
      form={DEFAULT_FORM}
      models={[]}
      operations={SUNO_OPERATIONS}
      accountBalance={0}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    openAdvancedParameters();
    expect(screen.getByRole('group', { name: '主唱声线（当前不可用）' })).toBeInTheDocument();
    expect(screen.getByText('当前账号需先获得支持主唱声线的 Suno V4.5+ 模型权限。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '女声' })).toBeDisabled();
  });

  it('explains why vocal gender is unavailable in instrumental mode', () => {
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, instrumental: true }}
      models={[SUNO_MODEL]}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    openAdvancedParameters();
    expect(screen.getByRole('group', { name: '主唱声线（当前不可用）' })).toBeInTheDocument();
    expect(screen.getByText('纯音乐模式不包含主唱；关闭纯音乐后即可选择。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '男声' })).toBeDisabled();
  });

  it('normalizes instrumental submissions to automatic vocal gender', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, description: '电影感纯音乐', instrumental: true, vocalGender: 'f' }}
      models={[SUNO_MODEL]}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={onSubmit}
    />);

    await user.click(screen.getByRole('button', { name: '生成 2 首歌曲 · 20 积分' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      instrumental: true,
      lyrics: '',
      vocalGender: 'auto',
    }));
  });

  it('explains when the selected model cannot control vocal gender', () => {
    const unsupportedModel: MusicModelProfile = {
      ...SUNO_MODEL,
      displayName: 'Suno V4',
      capabilities: { ...SUNO_MODEL.capabilities, vocalGender: false },
    };
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [unsupportedModel.id] }}
      form={DEFAULT_FORM}
      models={[unsupportedModel]}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    openAdvancedParameters();
    expect(screen.getByRole('group', { name: '主唱声线（当前不可用）' })).toBeInTheDocument();
    expect(screen.getByText('当前 Suno V4 不支持独立指定主唱性别；请选择 Suno V4.5+ 模型。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自动' })).toBeDisabled();
  });

  it('renders an independent sound composer with the exact documented text limits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CreatePanel form={{ ...DEFAULT_FORM, source: 'sound' }} models={DEMO_MODELS} operations={SUNO_OPERATIONS} onFormChange={onChange} onOpenAi={vi.fn()} />);

    expect(screen.getByRole('tab', { name: '音效' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: /音效标题/ })).toHaveAttribute('maxlength', '100');
    expect(screen.getByRole('textbox', { name: /音效风格与描述/ })).toHaveAttribute('maxlength', '1000');
    expect(screen.queryByRole('textbox', { name: '歌词' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '纯音乐' })).not.toBeInTheDocument();
    expect(screen.getByText('标题 → title')).toBeInTheDocument();
    expect(screen.getByText('模型 → mv')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '电影冲击' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source: 'sound', soundTags: expect.stringContaining('cinematic impact') }));
  });

  it('shows the live MXAPI sound defaults before submission', () => {
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: DEMO_MODELS.map((item) => item.id) }}
      form={{ ...DEFAULT_FORM, source: 'sound' }}
      models={DEMO_MODELS}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    openAdvancedParameters();
    expect(screen.getByRole('spinbutton', { name: /BPM/ })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: /BPM/ })).toHaveAttribute('placeholder', '99');
    expect(screen.getByRole('textbox', { name: /调性/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /调性/ })).toHaveAttribute('placeholder', 'D');
    expect(screen.getByRole('checkbox', { name: '无缝循环' })).toBeChecked();
    expect(screen.getByText(/tempo · 文档默认 99/)).toBeInTheDocument();
    expect(screen.getByText(/key · 文档默认 D/)).toBeInTheDocument();
  });

  it('submits only the six MXAPI sound fields and filters models to V5 / V5.5', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: DEMO_MODELS.map((item) => item.id) }}
      form={{
        ...DEFAULT_FORM,
        source: 'sound',
        title: 'Rain transition',
        soundTags: 'cinematic rain, soft window reflections',
        soundTempo: '128.5',
        soundKey: 'F# minor',
        soundLoop: false,
        lyrics: '绝不能发送的歌词',
        negativeTags: '绝不能发送的排除标签',
        styleWeight: 0.99,
        weirdness: 0.88,
      }}
      models={DEMO_MODELS}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={onSubmit}
    />);

    openAdvancedParameters();
    expect(screen.getByRole('radiogroup', { name: '音效模型' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Suno V5.5/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Suno V5 稳定/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Suno V4.5 All/ })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /BPM/ })).not.toHaveAttribute('min');
    expect(screen.getByRole('spinbutton', { name: /BPM/ })).not.toHaveAttribute('max');
    expect(screen.getByRole('textbox', { name: /调性/ })).not.toHaveAttribute('list');
    expect(screen.getByText(/MXAPI 文档默认开启/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '生成 2 个音效 · 20 积分' }));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'sound',
      title: 'Rain transition',
      tags: 'cinematic rain, soft window reflections',
      model: 'chirp-fenix',
      tempo: 128.5,
      key: 'F# minor',
      loop: false,
    });
  });

  it('omits blank optional sound fields and fails closed for contract, quote and authorization drift', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const common = {
      health: { provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: DEMO_MODELS.map((item) => item.id) },
      form: { ...DEFAULT_FORM, source: 'sound' as const, title: 'Dry hit', soundTags: 'short cinematic impact', soundTempo: '', soundKey: '', soundLoop: true },
      models: DEMO_MODELS,
      accountBalance: 1_280,
      onFormChange: vi.fn(),
      onSubmit,
    };
    const first = render(<ModelControlPanel {...common} operations={SUNO_OPERATIONS} />);
    await user.click(screen.getByRole('button', { name: '生成 2 个音效 · 20 积分' }));
    expect(onSubmit).toHaveBeenLastCalledWith({ kind: 'sound', title: 'Dry hit', tags: 'short cinematic impact', model: 'chirp-fenix', loop: true });
    first.unmount();

    const missingPrice = SUNO_OPERATIONS.map((item) => item.operationCode === 'sound_pair' ? { ...item, estimatedCredits: null, priceVersion: null } : item);
    const second = render(<ModelControlPanel {...common} operations={missingPrice} />);
    expect(screen.getByRole('button', { name: '生成 2 个音效 · — 积分' })).toBeDisabled();
    expect(screen.getByText(/动态预计价格暂不可用/)).toBeInTheDocument();
    second.unmount();

    const driftedContract = SUNO_OPERATIONS.map((item) => item.operationCode === 'sound_pair'
      ? { ...item, parameters: { ...item.parameters, tempo: { type: 'number', required: false, min: 40, max: 240, wireName: 'tempo' }, key: { type: 'string', required: false, enum: ['D'], wireName: 'key' } } }
      : item);
    const third = render(<ModelControlPanel {...common} operations={driftedContract} />);
    expect(screen.getByRole('button', { name: '生成 2 个音效 · 20 积分' })).toBeDisabled();
    expect(screen.getByText(/音效参数合同不完整/)).toBeInTheDocument();
    third.unmount();

    render(<ModelControlPanel {...common} models={[DEMO_MODELS[2]]} operations={SUNO_OPERATIONS} />);
    expect(screen.getByRole('button', { name: '生成 2 个音效 · 20 积分' })).toBeDisabled();
    expect(screen.getByText(/没有已授权且支持音效生成/)).toBeInTheDocument();
  });

  it('restores all persisted sound parameters when reusing an effect', () => {
    expect(formFromTrack(makeTrack({
      operation: 'sound',
      title: 'Looping rain',
      style: 'steady rain ambience',
      model: 'chirp-crow',
      soundTempo: 92.5,
      soundKey: 'C minor',
      soundLoop: false,
    }))).toMatchObject({
      source: 'sound',
      title: 'Looping rain',
      soundTags: 'steady rain ambience',
      model: 'chirp-crow',
      soundTempo: '92.5',
      soundKey: 'C minor',
      soundLoop: false,
    });
  });

  it('fails closed for ordinary generation when OIDC billing preview is not executable', () => {
    const previewOnly = SUNO_OPERATIONS.map((item) => item.operationCode === 'generation_pair'
      ? {
        ...item,
        chargingEnabled: false,
        preview: true,
        executable: undefined,
        previewExecutable: undefined,
        reason: 'OIDC 环境已关闭真实计费',
      }
      : item);
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, billingLive: false, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, description: '不应提交到公网 Provider' }}
      models={[SUNO_MODEL]}
      operations={previewOnly}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);
    expect(screen.getByRole('button', { name: '生成 2 首歌曲 · 20 积分' })).toBeDisabled();
    expect(screen.getByText(/音乐生成不可用：OIDC 环境已关闭真实计费/)).toBeInTheDocument();
  });

  it('distinguishes Provider configuration from an empty ModelCross authorization', () => {
    const common = {
      form: DEFAULT_FORM,
      models: [],
      accountBalance: 0,
      onFormChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    const provider = render(<ModelControlPanel
      {...common}
      health={{ provider: 'mxapi', configured: false, upstreamReachable: false, ready: false, active: 0, queued: 0, balance: null, billingLive: false, models: [] }}
    />);
    expect(screen.getByText('音乐 Provider 尚未配置')).toBeInTheDocument();
    expect(screen.getByText('未配置')).toBeInTheDocument();
    expect(screen.getByText('当前账号未授权')).toBeInTheDocument();
    expect(screen.getByText('预览模式，不实扣')).toBeInTheDocument();
    provider.unmount();

    render(<ModelControlPanel
      {...common}
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 0, billingLive: true, models: [] }}
    />);
    expect(screen.getByText('当前 ModelCross 账号没有音乐模型权限')).toBeInTheDocument();
    expect(screen.getByText('连接正常')).toBeInTheDocument();
    expect(screen.getByText('真实计费已启用')).toBeInTheDocument();
  });

  it('keeps catalog loading and catalog failure as separate empty states', () => {
    const common = {
      health: { provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 0, models: [] },
      form: DEFAULT_FORM,
      models: [],
      accountBalance: 0,
      onFormChange: vi.fn(),
      onSubmit: vi.fn(),
      onRetryModels: vi.fn(),
    };
    const loading = render(<ModelControlPanel {...common} modelsLoading />);
    expect(screen.getByText('正在同步模型权限')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新加载模型' })).not.toBeInTheDocument();
    loading.unmount();

    render(<ModelControlPanel {...common} modelsError="模型目录加载失败：music model catalog unavailable" />);
    expect(screen.getByText('模型目录加载失败', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/music model catalog unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新加载模型' })).toBeInTheDocument();
  });

  it('has no detectable axe violations in the composer controls', async () => {
    const { container } = render(<CreatePanel form={{ ...DEFAULT_FORM, mode: 'custom', style: '流行', lyrics: '[Verse]\n歌词' }} onFormChange={vi.fn()} onOpenAi={vi.fn()} />);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('submits a reference-audio continuation only with a server quote and validated rights', async () => {
    const user = userEvent.setup();
    const file = new File(['valid-audio'], 'reference.mp3', { type: 'audio/mpeg' });
    const onSubmitReference = vi.fn().mockResolvedValue(undefined);
    const referenceAudio = {
      ...EMPTY_REFERENCE_AUDIO,
      file,
      durationSeconds: 90,
      copyrightConfirmed: true,
      continueAt: 30,
      audioWeight: 0.75,
    };
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, source: 'reference_audio', description: '把副歌继续推向更开阔的尾奏' }}
      models={[SUNO_MODEL]}
      operations={SUNO_OPERATIONS}
      referenceAudio={referenceAudio}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
      onSubmitReference={onSubmitReference}
    />);

    await user.click(screen.getByRole('button', { name: '上传并续作 · 25 积分' }));
    expect(onSubmitReference).toHaveBeenCalledWith(file, expect.objectContaining({
      action: 'upload_extend', model: 'chirp-fenix', continueAt: 30, audioWeight: 0.75,
      description: '把副歌继续推向更开阔的尾奏',
    }), false);
  });

  it('hides, skips validation and omits upload audio_weight for a target model without both control sliders', async () => {
    const user = userEvent.setup();
    const v4: MusicModelProfile = {
      ...SUNO_MODEL,
      id: 'chirp-v4',
      displayName: 'Suno V4',
      capabilities: {
        ...SUNO_MODEL.capabilities,
        styleWeight: null,
        weirdness: null,
      },
    };
    const composer = render(<CreatePanel
      form={{ ...DEFAULT_FORM, source: 'reference_audio', model: v4.id }}
      models={[v4]}
      operations={SUNO_OPERATIONS}
      onFormChange={vi.fn()}
      onOpenAi={vi.fn()}
    />);
    expect(screen.queryByRole('slider', { name: '参考音频权重' })).not.toBeInTheDocument();
    expect(screen.getByText(/本次续作不会发送 audio_weight/)).toBeInTheDocument();
    composer.unmount();

    const file = new File(['valid-audio'], 'reference.mp3', { type: 'audio/mpeg' });
    const onSubmitReference = vi.fn().mockResolvedValue(undefined);
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [v4.id] }}
      form={{ ...DEFAULT_FORM, source: 'reference_audio', model: v4.id, description: '继续发展为开阔尾奏' }}
      models={[v4]}
      operations={SUNO_OPERATIONS}
      referenceAudio={{
        ...EMPTY_REFERENCE_AUDIO,
        file,
        durationSeconds: 90,
        copyrightConfirmed: true,
        continueAt: 30,
        audioWeight: 999,
      }}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
      onSubmitReference={onSubmitReference}
    />);

    const submit = screen.getByRole('button', { name: '上传并续作 · 25 积分' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(onSubmitReference).toHaveBeenCalled());
    const payload = onSubmitReference.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ action: 'upload_extend', model: 'chirp-v4', continueAt: 30 });
    expect(payload).not.toHaveProperty('audioWeight');
  });

  it('submits standalone import as one exact upload action without requiring continuation copy', async () => {
    const user = userEvent.setup();
    const file = new File(['valid-audio'], 'reference.mp3', { type: 'audio/mpeg' });
    const onSubmitReference = vi.fn().mockResolvedValue(undefined);
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, source: 'reference_audio', title: '独立导入素材', description: '' }}
      models={[SUNO_MODEL]}
      operations={SUNO_OPERATIONS}
      referenceAudio={{ ...EMPTY_REFERENCE_AUDIO, purpose: 'import', file, durationSeconds: 90, copyrightConfirmed: true }}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
      onSubmitReference={onSubmitReference}
    />);

    const submit = screen.getByRole('button', { name: '仅导入单曲 · 3 积分' });
    expect(submit).toBeEnabled();
    expect(screen.getByText('1 首 Provider 导入单曲')).toBeInTheDocument();
    openAdvancedParameters();
    expect(screen.getByRole('group', { name: '主唱声线（当前不可用）' })).toBeInTheDocument();
    expect(screen.getByText('仅导入参考音频不会生成主唱；选择“上传并续作”后可设置。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '女声' })).toBeDisabled();
    await user.click(submit);
    expect(onSubmitReference).toHaveBeenCalledWith(file, {
      action: 'upload', model: 'chirp-fenix', title: '独立导入素材',
    }, false);
  });

  it('uses the exact copyright standalone quote and never borrows the standard variant', () => {
    const file = new File(['valid-audio'], 'reference.mp3', { type: 'audio/mpeg' });
    const common = {
      health: { provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] },
      form: { ...DEFAULT_FORM, source: 'reference_audio' as const },
      models: [SUNO_MODEL], accountBalance: 1_280, onFormChange: vi.fn(), onSubmit: vi.fn(), onSubmitReference: vi.fn(),
      referenceAudio: { ...EMPTY_REFERENCE_AUDIO, purpose: 'import' as const, file, durationSeconds: 90, copyrightConfirmed: true, copyrightAudio: true },
    };
    const first = render(<ModelControlPanel {...common} operations={SUNO_OPERATIONS} />);
    expect(screen.getByRole('button', { name: '仅导入单曲 · 8 积分' })).toBeEnabled();
    first.unmount();

    render(<ModelControlPanel {...common} operations={SUNO_OPERATIONS.filter((item) => item.operationCode !== 'upload_copyright_single')} />);
    expect(screen.getByRole('button', { name: '仅导入单曲 · — 积分' })).toBeDisabled();
    expect(screen.getByText(/服务端未返回此操作的能力与价格/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /仅导入单曲 · 3 积分/ })).not.toBeInTheDocument();
  });

  it('uses the selected model title limit and disables an already over-limit title', () => {
    const v4 = { ...SUNO_MODEL, id: 'chirp-v4', displayName: 'Suno V4', capabilities: { ...SUNO_MODEL.capabilities, maxTitleLength: 80 } };
    const title = '长'.repeat(81);
    const { rerender } = render(<CreatePanel form={{ ...DEFAULT_FORM, mode: 'custom', model: v4.id, title, style: '流行', instrumental: true }} models={[v4]} onFormChange={vi.fn()} onOpenAi={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /歌名/ })).toHaveAttribute('maxlength', '80');

    rerender(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [v4.id] }}
      form={{ ...DEFAULT_FORM, model: v4.id, title, description: '测试生成' }}
      models={[v4]}
      operations={SUNO_OPERATIONS}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
    />);
    expect(screen.getByRole('button', { name: '生成 2 首歌曲 · 20 积分' })).toBeDisabled();
    expect(screen.getByText('歌名超过当前模型允许的 80 个字符')).toBeInTheDocument();
  });

  it('binds Simple and Custom editor limits to the selected model capabilities', () => {
    const v45All = {
      ...SUNO_MODEL,
      id: 'chirp-auk-turbo',
      displayName: 'Suno V4.5 All',
      capabilities: {
        ...SUNO_MODEL.capabilities,
        maxTitleLength: 80,
        maxDescriptionLength: 1000,
        maxStyleLength: 200,
        maxLyricsLength: 3000,
        maxNegativeTagsLength: 200,
      },
    };
    const view = render(<CreatePanel form={{ ...DEFAULT_FORM, model: v45All.id }} models={[v45All]} onFormChange={vi.fn()} onOpenAi={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /歌名/ })).toHaveAttribute('maxlength', '80');
    expect(screen.getByRole('textbox', { name: '描述你的音乐' })).toHaveAttribute('maxlength', '1000');

    view.rerender(<CreatePanel form={{ ...DEFAULT_FORM, mode: 'custom', model: v45All.id, style: 'Dream Pop', lyrics: '歌词' }} models={[v45All]} onFormChange={vi.fn()} onOpenAi={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: '音乐风格' })).toHaveAttribute('maxlength', '200');
    expect(screen.getByRole('textbox', { name: '歌词' })).toHaveAttribute('maxlength', '3000');
  });

  it('fails closed for every model-bounded generation text field after a model switch', () => {
    const v45All = {
      ...SUNO_MODEL,
      id: 'chirp-auk-turbo',
      displayName: 'Suno V4.5 All',
      capabilities: {
        ...SUNO_MODEL.capabilities,
        maxTitleLength: 80,
        maxDescriptionLength: 1000,
        maxStyleLength: 200,
        maxLyricsLength: 3000,
        maxNegativeTagsLength: 200,
      },
    };
    const common = {
      health: { provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [v45All.id] },
      models: [v45All], operations: SUNO_OPERATIONS, accountBalance: 1_280,
      onFormChange: vi.fn(), onSubmit: vi.fn(),
    };
    const view = render(<ModelControlPanel {...common} form={{ ...DEFAULT_FORM, model: v45All.id, description: '长'.repeat(1001) }} />);
    expect(screen.getByText('歌曲描述超过当前模型允许的 1000 个字符')).toBeInTheDocument();

    view.rerender(<ModelControlPanel {...common} form={{ ...DEFAULT_FORM, mode: 'custom', model: v45All.id, style: '长'.repeat(201), lyrics: '歌词' }} />);
    expect(screen.getByText('音乐风格超过当前模型允许的 200 个字符')).toBeInTheDocument();

    view.rerender(<ModelControlPanel {...common} form={{ ...DEFAULT_FORM, mode: 'custom', model: v45All.id, style: '流行', lyrics: '长'.repeat(3001) }} />);
    expect(screen.getByText('歌词超过当前模型允许的 3000 个字符')).toBeInTheDocument();

    view.rerender(<ModelControlPanel {...common} form={{ ...DEFAULT_FORM, mode: 'custom', model: v45All.id, style: '流行', lyrics: '歌词', negativeTags: '长'.repeat(201) }} />);
    expect(screen.getByText('排除风格超过当前模型允许的 200 个字符')).toBeInTheDocument();
    openAdvancedParameters();
    expect(screen.getByRole('textbox', { name: '排除风格' })).toHaveAttribute('maxlength', '200');
  });

  it('fails closed when a reference-audio price is missing', () => {
    const file = new File(['valid-audio'], 'reference.mp3', { type: 'audio/mpeg' });
    const missingPrice = SUNO_OPERATIONS.map((item) => item.operationCode === 'upload_extend_pair'
      ? { ...item, estimatedCredits: null, priceVersion: null }
      : item);
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, source: 'reference_audio', description: '续作方向' }}
      models={[SUNO_MODEL]}
      operations={missingPrice}
      referenceAudio={{ ...EMPTY_REFERENCE_AUDIO, file, durationSeconds: 90, copyrightConfirmed: true, continueAt: 30 }}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
      onSubmitReference={vi.fn()}
    />);
    expect(screen.getByRole('button', { name: '上传并续作 · — 积分' })).toBeDisabled();
    expect(screen.getByText(/动态预计价格暂不可用/)).toBeInTheDocument();
  });

  it('fails closed instead of borrowing the standard quote when the copyright variant is missing', () => {
    const file = new File(['valid-audio'], 'reference.mp3', { type: 'audio/mpeg' });
    const missingCopyrightVariant = SUNO_OPERATIONS.filter((item) => item.operationCode !== 'upload_copyright_extend_pair');
    render(<ModelControlPanel
      health={{ provider: 'mxapi', configured: true, upstreamReachable: true, ready: true, active: 0, queued: 0, balance: 2_000, models: [SUNO_MODEL.id] }}
      form={{ ...DEFAULT_FORM, source: 'reference_audio', description: '版权素材续作' }}
      models={[SUNO_MODEL]}
      operations={missingCopyrightVariant}
      referenceAudio={{ ...EMPTY_REFERENCE_AUDIO, file, durationSeconds: 90, copyrightConfirmed: true, copyrightAudio: true, continueAt: 30 }}
      accountBalance={1_280}
      onFormChange={vi.fn()}
      onSubmit={vi.fn()}
      onSubmitReference={vi.fn()}
    />);
    const submit = screen.getByRole('button', { name: '上传并续作 · — 积分' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/服务端未返回此操作的能力与价格/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /25 积分/ })).not.toBeInTheDocument();
  });

  it('validates file type, size and duration from the operation catalog', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const operations = SUNO_OPERATIONS.map((item) => item.operationCode === 'upload_single'
      ? { ...item, parameters: { ...item.parameters, maxBytes: 4, maxDurationSeconds: 5 } }
      : item);
    const onChange = vi.fn();
    render(<ReferenceAudioPanel value={EMPTY_REFERENCE_AUDIO} operations={operations} onChange={onChange} inspectDuration={vi.fn().mockResolvedValue(8)} />);
    await user.upload(screen.getByLabelText('选择参考音频'), new File(['12345'], 'large.mp3', { type: 'audio/mpeg' }));
    expect(await screen.findByText(/文件大小 .* 超过服务端限制/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText('选择参考音频'), new File(['1'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/不支持此文件类型/)).toBeInTheDocument();

    const audio = new File(['123'], 'short.mp3', { type: 'audio/mpeg' });
    await user.upload(screen.getByLabelText('选择参考音频'), audio);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ file: audio, inspecting: true }));
    expect(await screen.findByText(/音频时长 .* 超过服务端限制/)).toBeInTheDocument();
  });

  it('applies the dynamic operation audio-weight range for a capable target model', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onChange = vi.fn();
    const operations = SUNO_OPERATIONS.map((item) => item.operationCode === 'upload_extend_pair'
      ? {
        ...item,
        parameters: {
          ...item.parameters,
          audioWeight: { min: 0.2, max: 0.8, step: 0.1, default: 0.6 },
        },
      }
      : item);
    render(<ReferenceAudioPanel
      value={EMPTY_REFERENCE_AUDIO}
      operations={operations}
      targetModel={SUNO_MODEL}
      onChange={onChange}
      inspectDuration={vi.fn().mockResolvedValue(12.75)}
    />);
    const slider = screen.getByRole('slider', { name: '参考音频权重' });
    expect(slider).toHaveAttribute('min', '0.2');
    expect(slider).toHaveAttribute('max', '0.8');
    expect(slider).toHaveAttribute('step', '0.1');
    expect(slider).toHaveValue('0.6');
    await user.upload(screen.getByLabelText('选择参考音频'), new File(['audio'], 'reference.mp3', { type: 'audio/mpeg' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      durationSeconds: 12.75,
      continueAt: 0,
      audioWeight: 0.6,
      inspecting: false,
    }));
  });

  it('preserves rights confirmation changed while audio metadata is still loading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    let resolveDuration: (seconds: number) => void = () => undefined;
    const inspectDuration = vi.fn(() => new Promise<number>((resolve) => {
      resolveDuration = resolve;
    }));
    const Harness = () => {
      const [value, setValue] = useState(EMPTY_REFERENCE_AUDIO);
      return <ReferenceAudioPanel
        value={value}
        operations={SUNO_OPERATIONS}
        onChange={setValue}
        inspectDuration={inspectDuration}
      />;
    };
    render(<Harness />);

    await user.upload(
      screen.getByLabelText('选择参考音频'),
      new File(['audio'], 'reference.mp3', { type: 'audio/mpeg' }),
    );
    const confirmation = screen.getByRole('checkbox', { name: /我确认拥有上传及生成所需的全部权利/ });
    await user.click(confirmation);
    expect(confirmation).toBeChecked();

    resolveDuration(8);
    await waitFor(() => expect(screen.getByText(/0:08/)).toBeInTheDocument());
    expect(confirmation).toBeChecked();
  });

  it('disables file selection when the server omits its enforceable duration limit', () => {
    const missingDuration = SUNO_OPERATIONS.map((item) => item.operationCode === 'upload_single'
      ? { ...item, parameters: { ...item.parameters, maxDurationSeconds: undefined } }
      : item);
    render(<ReferenceAudioPanel value={EMPTY_REFERENCE_AUDIO} operations={missingDuration} onChange={vi.fn()} />);
    expect(screen.getByLabelText('选择参考音频')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('服务端上传限制配置不完整');
  });

  it('has no serious or critical axe violations in the reference-audio panel', async () => {
    const { container } = render(<ReferenceAudioPanel value={EMPTY_REFERENCE_AUDIO} operations={SUNO_OPERATIONS} onChange={vi.fn()} />);
    const results = await axe.run(container);
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  });
});
