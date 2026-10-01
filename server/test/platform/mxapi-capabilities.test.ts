import { describe, expect, it } from 'vitest';
import {
  MXAPI_FIXED_OPERATION_REQUESTS,
  MXAPI_NON_MUSIC_CAPABILITIES,
} from '../../src/platform/mxapi-capabilities.js';

describe('MXAPI non-music capability contract', () => {
  it('covers every visible V2 provider family and keeps documented parameter names', () => {
    expect(new Set(MXAPI_NON_MUSIC_CAPABILITIES.map((entry) => entry.category))).toEqual(new Set([
      'NANO', 'GPT', '即梦', 'Seedance视频', 'Grok', 'Veo', '商品套图', '系统通用',
    ]));
    const byId = Object.fromEntries(MXAPI_NON_MUSIC_CAPABILITIES.map((entry) => [entry.id, entry]));
    expect(byId['nano-pro'].fields.map((entry) => entry.name)).toEqual([
      'prompt', 'image_size', 'aspect_ratio', 'reference_images', 'header:X-Channel',
    ]);
    expect(byId['gpt-image-2'].fields.map((entry) => entry.name)).toEqual([
      'prompt', 'image_size', 'aspect_ratio', 'quality', 'resolution', 'reference_images', 'header:X-Channel',
    ]);
    expect(byId['seedance-25'].fields.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      'content', 'resolution', 'ratio', 'duration', 'generate_audio', 'camera_fixed', 'output_format',
    ]));
    expect(byId['grok-video'].fields.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      'prompt', 'model', 'aspect_ratio', 'video_length', 'resolution_name', 'refer_images',
    ]));
    expect(byId['veo-generate'].fields.map((entry) => entry.name)).toEqual([
      'model', 'prompt', 'aspectRatio', 'images', 'enableExtendImg', 'enableTranslation', 'header:X-Channel',
    ]);
  });

  it('publishes fixed prices at four times provider points and does not sell dynamic zero channels as free', () => {
    const byId = Object.fromEntries(MXAPI_NON_MUSIC_CAPABILITIES.map((entry) => [entry.id, entry]));
    for (const capability of MXAPI_NON_MUSIC_CAPABILITIES.filter((entry) => entry.pricingKind === 'fixed')) {
      expect(capability.fallbackCredits).toBe(capability.providerPoints! * 4);
      expect(MXAPI_FIXED_OPERATION_REQUESTS.some((entry) => entry.action === capability.id)).toBe(true);
    }
    for (const id of ['seedance-20', 'seedance-25', 'seedance-fast', 'seedance-mini', 'grok-video', 'grok-extend', 'veo-generate']) {
      expect(byId[id]).toMatchObject({ pricingKind: 'dynamic', fallbackCredits: null, implemented: false });
      expect(MXAPI_FIXED_OPERATION_REQUESTS.some((entry) => entry.action === id)).toBe(false);
    }
  });
});
