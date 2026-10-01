import { describe, expect, it } from 'vitest';
import { normalizeGenerate, normalizeTrackAction, ValidationError } from '../src/validate.js';

describe('normalizeGenerate', () => {
  it('normalizes simple mode with stable Suno defaults', () => {
    expect(normalizeGenerate({ description: '  cinematic sunrise  ' })).toEqual({
      mode: 'simple', title: '', description: 'cinematic sunrise', style: '', lyrics: '', instrumental: false,
      model: 'chirp-bluejay', negativeTags: '', vocalGender: 'auto', styleWeight: 0.5, weirdness: 0.5,
    });
  });

  it('requires a description only in simple mode', () => {
    expect(() => normalizeGenerate({ mode: 'simple', description: ' ' })).toThrow(ValidationError);
    expect(() => normalizeGenerate({ mode: 'custom', description: 'unused', style: 'pop', lyrics: 'hello' })).not.toThrow();
  });

  it('validates custom mode lyrics but permits instrumental generation without them', () => {
    expect(() => normalizeGenerate({ mode: 'custom', style: '' })).toThrow(/style/);
    expect(() => normalizeGenerate({ mode: 'custom', style: 'jazz', lyrics: '' })).toThrow(/lyrics/);
    expect(normalizeGenerate({ mode: 'custom', style: 'jazz', instrumental: true }).instrumental).toBe(true);
  });

  it('normalizes vocal gender to auto when instrumental mode is enabled', () => {
    expect(normalizeGenerate({
      mode: 'custom', style: 'jazz', instrumental: true, vocalGender: 'f',
    })).toMatchObject({ instrumental: true, vocalGender: 'auto' });
  });

  it('only accepts documented model ids, genders, and normalized 0..1 sliders', () => {
    expect(() => normalizeGenerate({ description: 'x', model: 'V5_5' })).toThrow(/model/);
    expect(() => normalizeGenerate({ description: 'x', vocalGender: 'female' })).toThrow(/vocalGender/);
    expect(() => normalizeGenerate({ description: 'x', styleWeight: 50 })).toThrow(/styleWeight/);
    expect(() => normalizeGenerate({ description: 'x', weirdness: -0.1 })).toThrow(/weirdness/);
    expect(normalizeGenerate({ description: 'x', model: 'chirp-fenix', vocalGender: 'f', styleWeight: '0.7', weirdness: 0 })).toMatchObject({
      model: 'chirp-fenix', vocalGender: 'f', styleWeight: 0.7, weirdness: 0,
    });
  });

  it('accepts one or two requested song results and rejects other counts', () => {
    expect(normalizeGenerate({ description: 'x', outputCount: 1 }).outputCount).toBe(1);
    expect(normalizeGenerate({ description: 'x', outputCount: 2 }).outputCount).toBe(2);
    expect(() => normalizeGenerate({ description: 'x', outputCount: 3 })).toThrow(/outputCount/);
  });

  it('accepts exact model-specific limits and rejects overlong input without silently truncating it', () => {
    const old = normalizeGenerate({ mode: 'custom', style: 's'.repeat(200), lyrics: 'l'.repeat(3000), model: 'chirp-bluejay' });
    expect(old.style).toHaveLength(200);
    expect(old.lyrics).toHaveLength(3000);
    expect(() => normalizeGenerate({ mode: 'custom', style: 's'.repeat(201), lyrics: 'lyrics', model: 'chirp-bluejay' })).toThrow(/style/);
    expect(() => normalizeGenerate({ mode: 'custom', style: 'style', lyrics: 'l'.repeat(3001), model: 'chirp-bluejay' })).toThrow(/lyrics/);
    const v5 = normalizeGenerate({ mode: 'custom', style: 's'.repeat(1000), lyrics: 'l'.repeat(5000), model: 'chirp-fenix' });
    expect(v5.style).toHaveLength(1000);
    expect(v5.lyrics).toHaveLength(5000);
    expect(() => normalizeGenerate({ mode: 'custom', style: 's'.repeat(1001), lyrics: 'lyrics', model: 'chirp-fenix' })).toThrow(/style/);
    expect(() => normalizeGenerate({ mode: 'custom', style: 'style', lyrics: 'l'.repeat(5001), model: 'chirp-fenix' })).toThrow(/lyrics/);
  });
});

describe('normalizeTrackAction', () => {
  it.each(['extend', 'cover', 'remaster'] as const)('accepts %s', (action) => {
    expect(normalizeTrackAction({ action })).toEqual({ action, continueAt: undefined, variation: 'normal' });
  });

  it('normalizes the operation-specific extend position and remaster variation', () => {
    expect(normalizeTrackAction({ action: 'extend', continueAt: '42.5' })).toEqual({
      action: 'extend', continueAt: 42.5, variation: 'normal',
    });
    expect(normalizeTrackAction({ action: 'remaster', variation: 'high' })).toEqual({
      action: 'remaster', continueAt: undefined, variation: 'high',
    });
  });

  it('rejects unknown actions, negative positions, and unknown variations', () => {
    expect(() => normalizeTrackAction({ action: 'generate' })).toThrow(/action/);
    expect(() => normalizeTrackAction({ action: 'extend', continueAt: -1 })).toThrow(/continueAt/);
    expect(() => normalizeTrackAction({ action: 'remaster', variation: 'maximum' })).toThrow(/variation/);
    expect(() => normalizeTrackAction({ action: 'cover', continueAt: 10 })).toThrow(/only supported for extend/);
    expect(() => normalizeTrackAction({ action: 'cover', variation: 'high' })).toThrow(/only supported for remaster/);
    expect(() => normalizeTrackAction({ action: 'remaster', title: 'not documented' })).toThrow(/only supported for extend or cover/);
    expect(() => normalizeTrackAction({ action: 'cover', instrumental: 'yes' })).toThrow(/instrumental must be boolean/);
  });

  it('preserves documented extend and cover generation overrides for model-aware validation', () => {
    expect(normalizeTrackAction({
      action: 'cover', model: 'chirp-fenix', mode: 'custom', title: 'New cover',
      description: '', style: 'dream pop', lyrics: '[Verse]\nNew words', instrumental: false,
      negativeTags: 'spoken word', vocalGender: 'f', styleWeight: 0.8, weirdness: 0.35,
    })).toEqual({
      action: 'cover', continueAt: undefined, variation: 'normal', model: 'chirp-fenix',
      mode: 'custom', title: 'New cover', description: '', style: 'dream pop',
      lyrics: '[Verse]\nNew words', instrumental: false, negativeTags: 'spoken word',
      vocalGender: 'f', styleWeight: 0.8, weirdness: 0.35,
    });
  });

  it('clears inherited vocal gender when a derived action enables instrumental mode', () => {
    expect(normalizeTrackAction({ action: 'cover', instrumental: true })).toMatchObject({
      action: 'cover', instrumental: true, vocalGender: 'auto',
    });
    expect(normalizeTrackAction({
      action: 'extend', instrumental: true, vocalGender: 'f',
    })).toMatchObject({ action: 'extend', instrumental: true, vocalGender: 'auto' });
  });
});
