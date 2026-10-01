import { describe, expect, it } from 'vitest';
import { assertModelCrossIdempotencyKey } from '../../src/platform/idempotency.js';

describe('ModelCross idempotency keys', () => {
  it('accepts the exact visible-ASCII boundaries', () => {
    expect(() => assertModelCrossIdempotencyKey('a'.repeat(8))).not.toThrow();
    expect(() => assertModelCrossIdempotencyKey('a'.repeat(191))).not.toThrow();
    expect(() => assertModelCrossIdempotencyKey('safe-key_123!')).not.toThrow();
  });

  it('rejects short, oversized, whitespace, control, and non-ASCII keys', () => {
    for (const value of [
      '1234567',
      'a'.repeat(192),
      '中文幂等键',
      'emoji-key-🎵',
      ' padded-key',
      'padded-key ',
      'internal space',
      'control\u0007key',
      'control\u0085key',
      `delete-${String.fromCharCode(0x7f)}`,
    ]) {
      expect(() => assertModelCrossIdempotencyKey(value)).toThrow(/8-191 visible ASCII characters/);
    }
  });
});
