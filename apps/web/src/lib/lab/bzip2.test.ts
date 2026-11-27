import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { bunzip2 } from './bzip2';

// M579: our bzip2 decoder against the bzip2 program (where the machine has it) and a fixed stream.
const has = (() => { try { execFileSync('bzip2', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const bz = (b: Uint8Array, level = 9) => new Uint8Array(execFileSync('bzip2', ['-c', `-${level}`], { input: b, maxBuffer: 1 << 28 }));
const rand = (n: number, seed: number) => { let s = seed; return Uint8Array.from({ length: n }, () => { s = (s * 1103515245 + 12345) >>> 0; return s >>> 24; }); };
const text = (n: number) => new TextEncoder().encode(Array.from({ length: n }, (_, i) => `t=${i} x=${(i * 0.37).toFixed(2)} lane ${i % 3}\n`).join(''));

describe('Hyperion bzip2 (M579)', () => {
  it('a fixed stream', () => {
    const f = Uint8Array.from(Buffer.from('425a6839314159265359faeb410b000005518000104000064490802000212a6998820c988fb06c317a40406c5c2ee48a70a121f5d68216', 'hex'));
    expect(new TextDecoder().decode(bunzip2(f))).toBe('hello hello hello hello world\n');
  });
  it.runIf(has)('matches the bzip2 program on text, noise, long runs and several blocks', () => {
    const cases = [text(3), text(20000), rand(5000, 3), new Uint8Array(70000).fill(65), Uint8Array.from({ length: 250000 }, (_, i) => (i * 7) % 13 === 0 ? 0 : i & 255), rand(300000, 9)];
    for (const c of cases) for (const lv of [1, 9]) expect(Buffer.from(bunzip2(bz(c, lv))).equals(Buffer.from(c))).toBe(true);
    expect(new TextDecoder().decode(bunzip2(new Uint8Array([...bz(text(2)), ...bz(text(4))])))).toBe(new TextDecoder().decode(text(2)) + new TextDecoder().decode(text(4)));
  });
});
