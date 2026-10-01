import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SunoContractPage } from '../src/components/SunoContractPage';
import { SUNO_V2_CONTRACT } from '../src/lib/suno-contract';
import type { MxapiCapabilityProfile } from '../src/types';

const capability = (overrides: Partial<MxapiCapabilityProfile> = {}): MxapiCapabilityProfile => ({
  id: 'nano-pro', category: 'NANO', title: 'Nano Banana Pro V2', description: '专业绘画',
  method: 'POST', path: '/api/v2/nano-pro', identifier: 'ai.gemini3pro.v2',
  operationCode: 'image_nano_pro_v2', pricingKind: 'fixed', providerPoints: 20,
  estimatedCredits: 80, fallbackCredits: 80, priceVersion: 'mxapi-v2-test', catalogAvailable: true,
  chargingEnabled: true, executable: false, implemented: false, markupMultiplier: 4,
  fields: [{ name: 'prompt', type: 'string', required: true, description: '绘图提示词' }],
  result: 'data.task_id / result.images[]', reason: '执行网关待接入', ...overrides,
});

describe('Suno MXAPI contract surface', () => {
  it('keeps all documented V2 endpoints and parameter names in the browser contract', () => {
    expect(SUNO_V2_CONTRACT).toHaveLength(16);
    const byId = Object.fromEntries(SUNO_V2_CONTRACT.map((endpoint) => [endpoint.id, endpoint]));
    expect(byId.generate.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      'gpt_description_prompt', 'prompt', 'tags', 'negative_tags', 'mv', 'title',
      'make_instrumental', 'task', 'continue_clip_id', 'continue_at', 'cover_clip_id',
      'metadata', 'metadata.create_mode', 'metadata.vocal_gender', 'metadata.control_sliders.style_weight',
      'metadata.control_sliders.weirdness_constraint', 'metadata.control_sliders.audio_weight',
      'metadata.can_control_sliders',
    ]));
    expect(byId.generate.fields.find((field) => field.name === 'mv')).toMatchObject({ required: false });
    expect(byId.generate.fields.find((field) => field.name === 'make_instrumental')).toMatchObject({ required: false });
    expect(byId.sound.fields.map((field) => field.name)).toEqual(['title', 'tags', 'mv', 'tempo', 'key', 'loop']);
    expect(byId.tasks.fields.map((field) => field.name)).toEqual(['ids', 'page', 'size']);
    expect(byId.speed.fields.map((field) => field.name)).toEqual(['clip_id', 'speed_multiplier', 'keep_pitch', 'title']);
    expect(byId.video.fields.map((field) => field.name)).toEqual(['task_id', 'suno_id']);
    expect(byId['convert-wav'].fields.map((field) => field.name)).toEqual(['suno_id']);
    expect(byId['download-mp3'].path).toBe('/api/v2/music/download-mp3');
    expect(byId['download-m4a'].fields.map(f => f.name)).toEqual(['suno_id']);
    expect(byId.upsample.result).toContain('task_ids');
    expect(byId['points-balance'].fields).toEqual([]);
    expect(byId['points-logs'].fields.map((field) => field.name)).toEqual(['page', 'pageSize']);
  });

  it('renders searchable endpoint cards and routes the user to a real UI entry', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SunoContractPage onNavigate={onNavigate} />);
    expect(screen.getByRole('heading', { name: '接口能力总览' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(16);
    expect(screen.getByText('metadata.control_sliders.audio_weight')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '搜索接口或参数' }), 'speed_multiplier');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /作品库 \/ 作品详情/ }));
    expect(onNavigate).toHaveBeenCalledWith('library');
    const search = screen.getByRole('textbox', { name: '搜索接口或参数' });
    await user.clear(search);
    await user.type(search, 'pageSize');
    await user.click(screen.getByRole('button', { name: '设置 / Provider 诊断' }));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('renders non-Suno families with four-times pricing and dynamic-price safeguards', async () => {
    const user = userEvent.setup();
    render(<SunoContractPage onNavigate={vi.fn()} capabilities={[
      capability(),
      capability({
        id: 'seedance-25', category: 'Seedance视频', title: 'Seedance 2.5',
        path: '/api/v2/video/seedance2-5', identifier: 'ai.video.seedance25', operationCode: null,
        pricingKind: 'dynamic', providerPoints: 0, estimatedCredits: null, fallbackCredits: null,
        priceVersion: null, catalogAvailable: false,
      }),
    ]} />);

    expect(screen.getByText('20 Provider 点 × 4 = 80 积分')).toBeInTheDocument();
    expect(screen.getByText('动态服务端报价 × 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'NANO' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('image_nano_pro_v2 · mxapi-v2-test')).toBeInTheDocument();
  });
});
