import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_MODEL_PROFILES, validateGenerateForProfile } from '../../src/platform/catalog.js';

describe('music model profile validation', () => {
  it('normalizes vocal gender to auto for instrumental generation', () => {
    const profile = DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === 'chirp-fenix')!;

    expect(validateGenerateForProfile({
      mode: 'custom', style: 'ambient score', instrumental: true, vocalGender: 'f',
    }, profile)).toMatchObject({
      instrumental: true,
      vocalGender: 'auto',
    });
  });
});
