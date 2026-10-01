import axe from 'axe-core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackDetail } from '../src/components/TrackDetail';
import type { AssetJob, MusicModelProfile, MusicOperationProfile } from '../src/types';
import { makeTrack } from './track-fixture';
import { SUNO_MODEL, SUNO_OPERATIONS } from './suno-fixture';

const completedJob = (action: AssetJob['action']): AssetJob => ({
  id: `job-${action}`,
  trackId: 'track-1',
  action,
  status: 'queued',
  progress: 0,
  billingStatus: 'reserved',
});

const callbacks = () => ({
  onClose: vi.fn(),
  onPlay: vi.fn(),
  onDelete: vi.fn(),
  onReuse: vi.fn(),
  onRetry: vi.fn(),
  onAction: vi.fn().mockResolvedValue(undefined),
  onAssetAction: vi.fn(async (_track, input) => completedJob(input.action)),
});

const renderDetail = (
  track = makeTrack(),
  handlers = callbacks(),
  operations: MusicOperationProfile[] = SUNO_OPERATIONS,
  models: MusicModelProfile[] = [SUNO_MODEL],
) => {
  const view = render(<TrackDetail track={track} groupSize={2} active={false} playing={false} models={models} operations={operations} accountBalance={1_000} {...handlers} />);
  return { ...view, handlers };
};

describe('TrackDetail Suno actions', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('presents sound effects with BPM, free-form key and loop metadata instead of song sliders', () => {
    renderDetail(makeTrack({
      operation: 'sound',
      title: 'Looping rain',
      style: 'steady rain ambience',
      lyrics: '',
      instrumental: true,
      soundTempo: 92.5,
      soundKey: 'C minor',
      soundLoop: true,
    }));

    expect(screen.getAllByText('音效生成').length).toBeGreaterThan(0);
    expect(screen.getByText('双音效版本 · 版本 1')).toBeInTheDocument();
    expect(screen.getByText('音效风格与描述')).toBeInTheDocument();
    const generation = screen.getByRole('heading', { name: '生成信息' }).closest('section');
    expect(generation).not.toBeNull();
    expect(within(generation!).getByText('92.5')).toBeInTheDocument();
    expect(within(generation!).getByText('C minor')).toBeInTheDocument();
    expect(within(generation!).getByText('无缝循环')).toBeInTheDocument();
    expect(within(generation!).queryByText('风格强度')).not.toBeInTheDocument();
    expect(within(generation!).queryByText('声线')).not.toBeInTheDocument();
  });

  it('shows only the ModelCross batch billing projection, never Provider merchant points', () => {
    renderDetail(makeTrack({
      billingStatus: 'captured',
      estimatedCredits: 20,
      settledCredits: 10,
      pointsCost: 999,
      pointsRefunded: true,
    }));

    expect(screen.getAllByText('已结算 10 积分').length).toBeGreaterThan(0);
    expect(screen.queryByText('积分消耗')).not.toBeInTheDocument();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
    expect(screen.queryByText(/积分已退还/)).not.toBeInTheDocument();
  });

  it('clamps the extend point to the known track duration before submission', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack({ duration: 120.8 });
    renderDetail(track, handlers);

    await user.click(screen.getByRole('button', { name: '续写' }));
    const input = screen.getByRole('spinbutton', { name: '从第几秒继续' });
    fireEvent.change(input, { target: { value: '999' } });

    expect(input).toHaveValue(120);
    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, {
      action: 'extend',
      continueAt: 120,
      model: 'chirp-fenix',
      mode: 'custom',
      title: '测试歌曲 · 续写',
      description: '',
      style: 'Dream Pop',
      lyrics: '[Verse]\n测试歌词',
      instrumental: false,
      negativeTags: '',
      vocalGender: 'auto',
      styleWeight: 0.65,
      weirdness: 0.5,
    }));
  });

  it('submits Cover overrides with the selected target model and its dynamic limits', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const v45All: MusicModelProfile = {
      ...SUNO_MODEL,
      id: 'chirp-auk-turbo',
      displayName: 'Suno V4.5 All',
      capabilities: {
        ...SUNO_MODEL.capabilities,
        maxTitleLength: 80,
        maxStyleLength: 200,
        maxLyricsLength: 3000,
        maxNegativeTagsLength: 200,
      },
    };
    const track = makeTrack();
    renderDetail(track, handlers, SUNO_OPERATIONS, [SUNO_MODEL, v45All]);

    await user.click(screen.getByRole('button', { name: '重新演绎' }));
    const model = screen.getByRole('combobox', { name: '目标模型' });
    expect(model).toHaveTextContent('Suno V4.5 All');
    await user.selectOptions(model, 'chirp-auk-turbo');
    const title = screen.getByRole('textbox', { name: /新版本标题/ });
    expect(title).toHaveAttribute('maxlength', '80');
    await user.clear(title);
    await user.type(title, 'V4.5 全能力重新演绎');
    await user.selectOptions(screen.getByRole('combobox', { name: '主唱声线' }), 'f');
    await user.click(screen.getByRole('button', { name: '确认创建' }));

    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, {
      action: 'cover',
      model: 'chirp-auk-turbo',
      mode: 'custom',
      title: 'V4.5 全能力重新演绎',
      description: '',
      style: 'Dream Pop',
      lyrics: '[Verse]\n测试歌词',
      instrumental: false,
      negativeTags: '',
      vocalGender: 'f',
      styleWeight: 0.65,
      weirdness: 0.5,
    }));
  });

  it('keeps vocal controls visible but disabled for instrumental actions and omits vocalGender', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack({ instrumental: true, lyrics: '', vocalGender: 'f' });
    renderDetail(track, handlers);

    await user.click(screen.getByRole('button', { name: '重新演绎' }));
    expect(screen.getByRole('group', { name: '主唱声线（当前不可用）' })).toBeInTheDocument();
    expect(screen.getByText('纯音乐模式不包含主唱；关闭纯音乐后即可选择。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '女声' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(handlers.onAction).toHaveBeenCalled());
    const payload = handlers.onAction.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ action: 'cover', instrumental: true, lyrics: '' });
    expect(payload).not.toHaveProperty('vocalGender');
  });

  it('explains unsupported target-model voice controls and omits inherited vocalGender', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const unsupportedModel: MusicModelProfile = {
      ...SUNO_MODEL,
      id: 'chirp-v4',
      displayName: 'Suno V4',
      capabilities: { ...SUNO_MODEL.capabilities, vocalGender: false },
    };
    const track = makeTrack({ model: unsupportedModel.id, vocalGender: 'f' });
    renderDetail(track, handlers, SUNO_OPERATIONS, [unsupportedModel]);

    await user.click(screen.getByRole('button', { name: '重新演绎' }));
    expect(screen.getByRole('group', { name: '主唱声线（当前不可用）' })).toBeInTheDocument();
    expect(screen.getByText('当前 Suno V4 不支持独立指定主唱性别。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '男声' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(handlers.onAction).toHaveBeenCalled());
    const payload = handlers.onAction.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ action: 'cover', model: 'chirp-v4', instrumental: false });
    expect(payload).not.toHaveProperty('vocalGender');
  });

  it('hides and omits uploaded-cover audio_weight when the target model lacks V4.5+ sliders', async () => {
    const handlers = callbacks();
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
    const uploaded = makeTrack({ operation: 'upload', referenceAudioAvailable: true });
    renderDetail(uploaded, handlers, SUNO_OPERATIONS, [SUNO_MODEL, v4]);

    await user.click(screen.getByRole('button', { name: '重新演绎' }));
    expect(screen.getByRole('slider', { name: '参考音频权重' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: '目标模型' }), 'chirp-v4');
    expect(screen.queryByRole('slider', { name: '参考音频权重' })).not.toBeInTheDocument();
    expect(screen.getByText(/不会发送 audio_weight/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认创建' }));

    await waitFor(() => expect(handlers.onAction).toHaveBeenCalled());
    const payload = handlers.onAction.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ action: 'cover', model: 'chirp-v4' });
    expect(payload).not.toHaveProperty('audioWeight');
    expect(payload).not.toHaveProperty('styleWeight');
    expect(payload).not.toHaveProperty('weirdness');
  });

  it('only sends remaster variation for models declared by the operation catalog', async () => {
    const user = userEvent.setup();
    const blocked = renderDetail();
    const blockedTrigger = screen.getByRole('button', { name: '高清重制' });
    expect(blockedTrigger).toBeDisabled();
    expect(blockedTrigger).toHaveAttribute('title', '当前模型能力不支持此操作');
    blocked.unmount();

    const v5Model: MusicModelProfile = {
      ...SUNO_MODEL,
      id: 'chirp-crow',
      displayName: 'Suno V5',
      capabilities: {
        ...SUNO_MODEL.capabilities,
        operations: [...SUNO_MODEL.capabilities.operations, 'remaster'],
      },
    };
    const v5Track = makeTrack({ model: v5Model.id });
    const v5Handlers = callbacks();
    const first = renderDetail(v5Track, v5Handlers, SUNO_OPERATIONS, [v5Model]);
    await user.click(screen.getByRole('button', { name: '高清重制' }));
    expect(screen.getByText('Suno V5 支持将变化程度映射为 variation_category。')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: '变化程度' }), 'high');
    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(v5Handlers.onAction).toHaveBeenCalledWith(v5Track, { action: 'remaster', variation: 'high' }));
    first.unmount();

    const oldModel: MusicModelProfile = {
      ...SUNO_MODEL,
      id: 'chirp-auk-turbo',
      displayName: 'Suno V4.5 All',
      capabilities: {
        ...SUNO_MODEL.capabilities,
        operations: [...SUNO_MODEL.capabilities.operations, 'remaster'],
      },
    };
    const oldTrack = makeTrack({ model: oldModel.id });
    const oldHandlers = callbacks();
    renderDetail(oldTrack, oldHandlers, SUNO_OPERATIONS, [oldModel]);
    await user.click(screen.getByRole('button', { name: '高清重制' }));
    expect(screen.queryByRole('combobox', { name: '变化程度' })).not.toBeInTheDocument();
    expect(screen.getByText(/固定重制强度/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(oldHandlers.onAction).toHaveBeenCalledWith(oldTrack, { action: 'remaster' }));
  });

  it('submits whole-song, crop and speed with exact documented payloads', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack({ duration: 120 });
    renderDetail(track, handlers);

    await user.click(screen.getByRole('button', { name: '完整歌曲' }));
    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, { action: 'whole_song' }));

    await user.click(screen.getByRole('button', { name: '裁剪' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: '开始秒数' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: '结束秒数' }), { target: { value: '45' } });
    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, { action: 'crop', startSeconds: 10, endSeconds: 45 }));

    await user.click(screen.getByRole('button', { name: '变速' }));
    expect(screen.getByRole('combobox', { name: '速度倍率' })).toHaveValue('1');
    expect(screen.getByRole('checkbox', { name: /保持原音高/ })).toBeChecked();
    await user.selectOptions(screen.getByRole('combobox', { name: '速度倍率' }), '1.5');
    await user.click(screen.getByRole('checkbox', { name: /保持原音高/ }));
    await user.clear(screen.getByRole('textbox', { name: /新版本标题/ }));
    await user.type(screen.getByRole('textbox', { name: /新版本标题/ }), '夜航慢速版');
    await user.click(screen.getByRole('button', { name: '确认创建' }));
    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, {
      action: 'speed', multiplier: 1.5, keepPitch: false, title: '夜航慢速版',
    }));
  });

  it('treats the documented Speed title as optional and omits it when blank', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack();
    renderDetail(track, handlers);

    await user.click(screen.getByRole('button', { name: '变速' }));
    const title = screen.getByRole('textbox', { name: /新版本标题/ });
    expect(title).toHaveAccessibleName('新版本标题 可选');
    await user.clear(title);
    const submit = screen.getByRole('button', { name: '确认创建' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, {
      action: 'speed', multiplier: 1, keepPitch: true,
    }));
    expect(handlers.onAction.mock.calls[0][1]).not.toHaveProperty('title');
  });

  it('continues an imported Track with the persisted variant and trusted upload duration', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack({
      operation: 'upload',
      copyrightAudio: true,
      referenceAudioAvailable: true,
      referenceAudioDurationSeconds: 90.5,
      duration: 120.8,
    });
    const v45All: MusicModelProfile = {
      ...SUNO_MODEL,
      id: 'chirp-auk-turbo',
      displayName: 'Suno V4.5 All',
      capabilities: { ...SUNO_MODEL.capabilities, maxTitleLength: 80 },
    };
    renderDetail(track, handlers, SUNO_OPERATIONS, [SUNO_MODEL, v45All]);

    const trigger = screen.getByRole('button', { name: '参考续作' });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent('40 积分');
    await user.click(trigger);
    const continueAt = screen.getByRole('spinbutton', { name: '续作起点（秒）' });
    expect(continueAt).toHaveAttribute('max', '90.5');
    const targetModel = screen.getByRole('combobox', { name: '目标模型' });
    await user.selectOptions(targetModel, v45All.id);
    expect(screen.getByRole('textbox', { name: /新版本标题/ })).toHaveAttribute('maxlength', '80');
    fireEvent.change(continueAt, { target: { value: '88' } });
    const audioWeight = screen.getByRole('slider', { name: '参考音频权重' });
    expect(audioWeight).toHaveAttribute('min', '0');
    expect(audioWeight).toHaveAttribute('max', '1');
    expect(audioWeight).toHaveAttribute('step', '0.05');
    fireEvent.change(audioWeight, { target: { value: '0.75' } });
    await user.click(screen.getByRole('button', { name: '确认创建' }));

    await waitFor(() => expect(handlers.onAction).toHaveBeenCalledWith(track, expect.objectContaining({
      action: 'upload_extend',
      model: 'chirp-auk-turbo',
      mode: 'custom',
      continueAt: 88,
      audioWeight: 0.75,
      style: 'Dream Pop',
      lyrics: '[Verse]\n测试歌词',
    })));
    const payload = handlers.onAction.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('copyrightAudio');
    expect(payload).not.toHaveProperty('estimatedCredits');
    expect(payload).not.toHaveProperty('priceVersion');
    expect(payload).not.toHaveProperty('customId');
    expect(payload).not.toHaveProperty('providerRecordId');
  });

  it('keeps imported Track continuation available but omits audio_weight for V4 and older targets', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack({
      operation: 'upload',
      copyrightAudio: false,
      referenceAudioAvailable: true,
      referenceAudioDurationSeconds: 90,
    });
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
    renderDetail(track, handlers, SUNO_OPERATIONS, [SUNO_MODEL, v4]);

    await user.click(screen.getByRole('button', { name: '参考续作' }));
    expect(screen.getByRole('slider', { name: '参考音频权重' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: '目标模型' }), v4.id);
    expect(screen.queryByRole('slider', { name: '参考音频权重' })).not.toBeInTheDocument();
    expect(screen.getByText(/本次续作不会发送 audio_weight/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: '续作起点（秒）' }), { target: { value: '30' } });
    const submit = screen.getByRole('button', { name: '确认创建' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(handlers.onAction).toHaveBeenCalled());
    const payload = handlers.onAction.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ action: 'upload_extend', model: 'chirp-v4', continueAt: 30 });
    expect(payload).not.toHaveProperty('audioWeight');
    expect(payload).not.toHaveProperty('styleWeight');
    expect(payload).not.toHaveProperty('weirdness');
  });

  it('fails imported Track continuation closed when durable reference metadata or the exact variant is missing', () => {
    const imported = makeTrack({
      operation: 'upload', copyrightAudio: true, referenceAudioAvailable: true,
      referenceAudioDurationSeconds: 90,
    });
    const { rerender } = renderDetail(imported, callbacks(), SUNO_OPERATIONS.filter((item) => item.operationCode !== 'upload_copyright_extend_pair'));
    let trigger = screen.getByRole('button', { name: '参考续作' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', '服务端未返回此操作的能力与价格');
    expect(trigger).not.toHaveTextContent('25 积分');

    rerender(<TrackDetail track={{ ...imported, copyrightAudio: undefined }} groupSize={1} active={false} playing={false} models={[SUNO_MODEL]} operations={SUNO_OPERATIONS} accountBalance={1_000} {...callbacks()} />);
    trigger = screen.getByRole('button', { name: '参考续作' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', '作品缺少服务端可信的版权音频类型');

    rerender(<TrackDetail track={{ ...imported, referenceAudioAvailable: false }} groupSize={1} active={false} playing={false} models={[SUNO_MODEL]} operations={SUNO_OPERATIONS} accountBalance={1_000} {...callbacks()} />);
    trigger = screen.getByRole('button', { name: '参考续作' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', '原始参考音频已不可用');

    rerender(<TrackDetail track={{ ...imported, referenceAudioDurationSeconds: null }} groupSize={1} active={false} playing={false} models={[SUNO_MODEL]} operations={SUNO_OPERATIONS} accountBalance={1_000} {...callbacks()} />);
    trigger = screen.getByRole('button', { name: '参考续作' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', '作品缺少服务端可信的参考音频时长');
  });

  it('preserves fractional track duration and fails closed for unknown crop fields', async () => {
    const user = userEvent.setup();
    const track = makeTrack({ duration: 120.8 });
    const { rerender } = renderDetail(track);

    await user.click(screen.getByRole('button', { name: '裁剪' }));
    const end = screen.getByRole('spinbutton', { name: '结束秒数' });
    expect(end).toHaveValue(120.8);
    expect(end).toHaveAttribute('max', '120.8');
    expect(end).toHaveAttribute('step', 'any');
    await user.keyboard('{Escape}');

    const invalid = SUNO_OPERATIONS.map((item) => item.operationCode === 'crop_single'
      ? {
        ...item,
        parameters: {
          startSeconds: { min: 0 },
          endSeconds: { exclusiveMinimumField: 'startSeconds', maximumField: 'provider.duration' },
        },
      }
      : item);
    rerender(<TrackDetail track={track} groupSize={1} active={false} playing={false} models={[SUNO_MODEL]} operations={invalid} accountBalance={1_000} {...callbacks()} />);
    expect(screen.getByRole('button', { name: '裁剪' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '裁剪' })).toHaveAttribute('title', '服务端未返回可解析的裁剪参数范围');
  });

  it('uses nested speed defaults and title limits from the production catalog', async () => {
    const user = userEvent.setup();
    const speedDefaults = SUNO_OPERATIONS.map((item) => item.operationCode === 'speed_single'
      ? {
        ...item,
        parameters: {
          multiplier: { enum: [0.5, 1, 1.5], default: 1.5 },
          keepPitch: { type: 'boolean', default: false },
          title: { maxLength: 8 },
        },
      }
      : item);
    renderDetail(makeTrack({ title: '一个非常非常长的作品标题' }), callbacks(), speedDefaults);

    await user.click(screen.getByRole('button', { name: '变速' }));
    expect(screen.getByRole('combobox', { name: '速度倍率' })).toHaveValue('1.5');
    expect(screen.getByRole('checkbox', { name: /保持原音高/ })).not.toBeChecked();
    const title = screen.getByRole('textbox', { name: /新版本标题/ });
    expect(title).toHaveAttribute('maxlength', '8');
    expect((title as HTMLInputElement).value).toHaveLength(8);
  });

  it('submits asset jobs and keeps Provider identifiers out of browser payloads', async () => {
    const handlers = callbacks();
    const user = userEvent.setup();
    const track = makeTrack({ providerRecordId: 8921 });
    renderDetail(track, handlers);

    await user.click(screen.getByRole('button', { name: '逐字歌词' }));
    const lyrics = screen.getByRole('textbox', { name: '需要逐字对齐的歌词' });
    expect(lyrics).toHaveAttribute('maxlength', '5000');
    expect(lyrics).toHaveAttribute('minlength', '1');
    fireEvent.change(lyrics, { target: { value: '长'.repeat(5001) } });
    expect(screen.getByRole('button', { name: '确认创建资产' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('逐字对齐歌词超过 5000 个字符');
    fireEvent.change(lyrics, { target: { value: '[Verse]\n新的歌词' } });
    await user.click(screen.getByRole('button', { name: '确认创建资产' }));
    await waitFor(() => expect(handlers.onAssetAction).toHaveBeenCalledWith(track, { action: 'aligned_lyrics', lyrics: '[Verse]\n新的歌词' }));

    await user.click(screen.getByRole('button', { name: '音乐视频' }));
    await user.click(screen.getByRole('button', { name: '确认创建资产' }));
    await waitFor(() => expect(handlers.onAssetAction).toHaveBeenCalledWith(track, { action: 'video' }));
    expect(handlers.onAssetAction.mock.calls.flatMap((call) => Object.keys(call[1]))).not.toContain('providerRecordId');
    expect(handlers.onAssetAction.mock.calls.flatMap((call) => Object.keys(call[1]))).not.toContain('customId');
  });

  it('fails closed for missing price, providerRecordId and lyrics', () => {
    const noCropPrice = SUNO_OPERATIONS.map((item) => item.action === 'crop'
      ? { ...item, estimatedCredits: null, priceVersion: null }
      : item);
    const { rerender } = renderDetail(makeTrack({ providerRecordId: null, lyrics: '' }), callbacks(), noCropPrice);

    expect(screen.getByRole('button', { name: '裁剪' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '裁剪' })).toHaveAttribute('title', expect.stringContaining('动态预计价格'));
    expect(screen.getByRole('button', { name: '音乐视频' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '音乐视频' })).toHaveAttribute('title', '作品缺少 providerRecordId');
    expect(screen.getByRole('button', { name: 'WAV' })).not.toBeDisabled(); // Current download-wav requires custom_id only.
    expect(screen.getByRole('button', { name: '逐字歌词' })).toHaveAttribute('title', '当前作品没有可对齐的歌词');

    rerender(<TrackDetail track={makeTrack()} groupSize={1} active={false} playing={false} models={[SUNO_MODEL]} operations={[]} accountBalance={1_000} {...callbacks()} />);
    expect(screen.getByRole('button', { name: '完整歌曲' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '完整歌曲' })).toHaveAttribute('title', '服务端未返回此操作的能力与价格');
  });

  it('does not treat a preview quote as executable unless the server explicitly allows it', () => {
    const previewOnly = SUNO_OPERATIONS.map((item) => item.operationCode === 'whole_song_single'
      ? { ...item, executable: undefined, previewExecutable: undefined, chargingEnabled: false, preview: true, reason: 'OIDC 环境已关闭真实计费' }
      : item);
    renderDetail(makeTrack(), callbacks(), previewOnly);
    const button = screen.getByRole('button', { name: '完整歌曲' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'OIDC 环境已关闭真实计费');
  });

  it('moves focus into the modal, closes on Escape and restores the trigger', async () => {
    const user = userEvent.setup();
    renderDetail();
    const trigger = screen.getByRole('button', { name: '变速' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '调整播放速度' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: '速度倍率' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '调整播放速度' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('has no serious or critical axe violations in the detail and Suno dialog', async () => {
    const user = userEvent.setup();
    const { container } = renderDetail();
    await user.click(screen.getByRole('button', { name: '变速' }));
    const results = await axe.run(container);
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  });

  it('does not offer a download for a completed record that has no audio asset', () => {
    renderDetail(makeTrack({ file: null, audioUrl: null }));
    expect(screen.queryByRole('link', { name: /下载音频/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '播放' })).not.toBeInTheDocument();
  });
});
