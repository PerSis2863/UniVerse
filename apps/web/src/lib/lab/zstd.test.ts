import { describe, expect, it } from 'vitest';
import * as zlib from 'node:zlib';
import { zstd } from './zstd';

// M579: our zstd decoder against Node's own encoder (the reference library) on text, numbers, noise and repeats.
const enc = (zlib as { zstdCompressSync?: (b: Uint8Array, o?: object) => Uint8Array }).zstdCompressSync;
const K = zlib.constants as unknown as Record<string, number>;
const rand = (n: number, seed: number) => { let s = seed; return Uint8Array.from({ length: n }, () => { s = (s * 1103515245 + 12345) >>> 0; return s >>> 24; }); };
const text = (n: number) => new TextEncoder().encode(Array.from({ length: n }, (_, i) => `row ${i}: speed ${(i * 0.37).toFixed(2)} m/s, lane ${i % 3}, ok\n`).join(''));

describe('Hyperion zstd (M579)', () => {
  it('a fixed frame: hello ×4 world', () => {
    const f = Uint8Array.from(Buffer.from('28b52ffd201d8d00005868656c6c6f20776f726c640100f14a11', 'hex'));
    expect(new TextDecoder().decode(zstd(f))).toBe('hello hello hello hello world');
  });
  it.runIf(!!enc)('matches the reference encoder at several levels and sizes', () => {
    const floats = new Uint8Array(new Float32Array(Array.from({ length: 60000 }, (_, i) => Math.sin(i / 50) * 10)).buffer);
    const cases = [new Uint8Array(0), text(5), text(3000), text(40000), rand(1000, 1), rand(300000, 7), floats, new Uint8Array(200000).fill(7), Uint8Array.from({ length: 150000 }, (_, i) => (i % 251) ^ (i >> 9))];
    for (const level of [1, 3, 9, 19]) for (const c of cases) {
      const z = enc!(c, { params: { [K.ZSTD_c_compressionLevel ?? 100]: level, [K.ZSTD_c_checksumFlag ?? 201]: 1 } });
      expect(Buffer.from(zstd(z)).equals(Buffer.from(c))).toBe(true);
    }
    // two frames in a row
    expect(new TextDecoder().decode(zstd(Buffer.concat([enc!(text(10)), enc!(text(20))])))).toBe(new TextDecoder().decode(text(10)) + new TextDecoder().decode(text(20)));
  });
});
