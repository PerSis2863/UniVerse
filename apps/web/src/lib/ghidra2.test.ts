import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { damp, makeGhidra2, scoresAfter, type Ghidra2Meta } from './ghidra2';

// M427: the browser's Ghidra 2 against the numbers the training script wrote. The model is added once it is trained
// (scripts/ai/ghidra2.py, or the rented graphics card's run, scripts/ai/ghidra2-gpu.md); until then there is nothing to check.
const dir = join(__dirname, '../../public/ai');
const has = existsSync(join(dir, 'ghidra2.json'));

describe.skipIf(!has)('Ghidra 2 (M427)', () => {
  const meta = has ? (JSON.parse(readFileSync(join(dir, 'ghidra2.json'), 'utf8')) as Ghidra2Meta) : null!;
  const buf = (name: string) => { const f = readFileSync(join(dir, name)); return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer; };
  const m = has ? makeGhidra2(meta, meta.parts ? meta.parts.map((_, i) => buf(`ghidra2-${i}.bin`)) : buf('ghidra2.bin')) : null!;

  it('splits text into the same word-pieces as the training script, and back', () => {
    expect(m.pieces.encode(meta.check.prompt)).toEqual(meta.check.ids);
    expect(m.pieces.encode(meta.check.text)).toEqual(meta.check.textIds);
    expect(m.pieces.decode(meta.check.textIds)).toBe(meta.check.text);
  });

  it('works out the same next-piece scores as the training script', () => {
    const got = [...scoresAfter(m, meta.check.ids).slice(0, 8)];
    got.forEach((v, i) => expect(v).toBeCloseTo(meta.check.logits[i], 1));
  });
});

describe('Ghidra 2’s repetition penalty (M428)', () => {
  it('lowers what it said lately, once each, whatever the sign', () => {
    const s = damp(new Float32Array([2.2, -1, 3, 0]), [0, 1, 0]);
    expect([...s].map((x) => +x.toFixed(3))).toEqual([2, -1.1, 3, 0]);
  });
});
