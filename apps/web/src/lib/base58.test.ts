import { describe, expect, it } from 'vitest';
import { base58Decode, base58Encode, fromMultibase, multibase } from './base58';

describe('base58 and multibase', () => {
  it('matches known values and round-trips', () => {
    expect(base58Encode(new TextEncoder().encode('Hello World!'))).toBe('2NEpo7TZRRrLZSi2U');
    expect(base58Encode(Uint8Array.from([0, 0, 1]))).toBe('112');
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256);
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
    expect(fromMultibase(multibase(bytes))).toEqual(bytes);
    expect(base58Decode('0OIl')).toBeNull();
  });

  it('writes an Ed25519 Multikey the way did:key does (z6Mk…)', () => {
    const key = Uint8Array.from([0xed, 0x01, ...new Array(32).fill(7)]);
    expect(multibase(key).startsWith('z6Mk')).toBe(true);
  });
});
