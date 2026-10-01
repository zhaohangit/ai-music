import { describe, expect, it } from 'vitest';
import {
  musicOperationBillingItemCount,
  musicOperationDefinition,
} from '../../src/platform/music-operations.js';

describe('music operation billing item counts', () => {
  it('bills asset-producing operations as one item while exposing zero new Tracks', () => {
    for (const action of ['aligned_lyrics', 'video', 'convert_wav'] as const) {
      const definition = musicOperationDefinition(action);
      expect(definition.outputCount).toBe(0);
      expect(musicOperationBillingItemCount(definition)).toBe(1);
    }
  });

  it('uses the generated Track count for single and paired music operations', () => {
    expect(musicOperationBillingItemCount(musicOperationDefinition('whole_song'))).toBe(1);
    expect(musicOperationBillingItemCount(musicOperationDefinition('generate'))).toBe(2);
  });
});
