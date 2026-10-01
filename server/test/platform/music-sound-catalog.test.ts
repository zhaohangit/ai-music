import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_MODEL_PROFILES,
  validateSoundForProfile,
} from '../../src/platform/catalog.js';

const profile = (id: string) => DEFAULT_MUSIC_MODEL_PROFILES.find((item) => item.id === id)!;

describe('MXAPI sound request validation', () => {
  it('normalizes the documented fields without inventing tempo or key ranges', () => {
    expect(validateSoundForProfile({
      kind: 'sound', title: ' Rain ', tags: ' rain, roof ', model: 'chirp-crow',
      tempo: -12.5, key: ' D ', loop: false,
    }, profile('chirp-crow'))).toEqual({
      kind: 'sound', mode: 'custom', title: 'Rain', description: '', style: 'rain, roof', lyrics: '',
      instrumental: true, model: 'chirp-crow', negativeTags: '', vocalGender: 'auto',
      styleWeight: 0.5, weirdness: 0.5, soundTempo: -12.5, soundKey: 'D', soundLoop: false,
    });

    expect(validateSoundForProfile({
      kind: 'sound', title: 'Impact', tags: 'cinematic impact', model: 'chirp-fenix',
    }, profile('chirp-fenix'))).toMatchObject({
      soundTempo: null, soundKey: '', soundLoop: null,
    });
  });

  it('enforces required 100/1000 string limits and exact value types', () => {
    const valid = { kind: 'sound', title: 'x', tags: 'rain', model: 'chirp-crow' };
    expect(() => validateSoundForProfile({ ...valid, title: ' ' }, profile('chirp-crow'))).toThrow(/title is required/);
    expect(() => validateSoundForProfile({ ...valid, tags: '' }, profile('chirp-crow'))).toThrow(/tags are required/);
    expect(() => validateSoundForProfile({ ...valid, title: 'x'.repeat(101) }, profile('chirp-crow'))).toThrow(/at most 100/);
    expect(() => validateSoundForProfile({ ...valid, tags: 'x'.repeat(1001) }, profile('chirp-crow'))).toThrow(/at most 1000/);
    expect(() => validateSoundForProfile({ ...valid, tempo: '99' }, profile('chirp-crow'))).toThrow(/finite number/);
    expect(() => validateSoundForProfile({ ...valid, tempo: Number.POSITIVE_INFINITY }, profile('chirp-crow'))).toThrow(/finite number/);
    expect(() => validateSoundForProfile({ ...valid, key: 4 }, profile('chirp-crow'))).toThrow(/key must be a string/);
    expect(() => validateSoundForProfile({ ...valid, loop: 1 }, profile('chirp-crow'))).toThrow(/loop must be boolean/);

    expect(validateSoundForProfile({ ...valid, title: 'x'.repeat(100), tags: 'x'.repeat(1000) }, profile('chirp-crow')))
      .toMatchObject({ title: 'x'.repeat(100), style: 'x'.repeat(1000) });
  });

  it('allows sound only on the two documented model ids', () => {
    for (const id of ['chirp-crow', 'chirp-fenix']) {
      expect(profile(id).capabilities.operations).toContain('sound');
    }
    for (const id of ['chirp-bluejay', 'chirp-auk', 'chirp-auk-turbo', 'chirp-v4', 'chirp-v3-5', 'chirp-v3-0']) {
      expect(profile(id).capabilities.operations).not.toContain('sound');
      expect(() => validateSoundForProfile({ title: 'Rain', tags: 'rain' }, profile(id)))
        .toThrow(/does not support sound generation/);
    }
  });
});
