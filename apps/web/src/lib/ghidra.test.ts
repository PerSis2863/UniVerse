import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAMILIAR, familiar, makeGhidra, nextScores, write, type GhidraMeta } from './ghidra';

const dir = join(__dirname, '../../public/ai');
const meta = JSON.parse(readFileSync(join(dir, 'ghidra.json'), 'utf8')) as GhidraMeta;
const file = readFileSync(join(dir, 'ghidra.bin'));
const ghidra = makeGhidra(meta, file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

describe('Ghidra (M421)', () => {
  it('works out the same next-letter scores in the browser as the training script did', () => {
    const got = [...nextScores(ghidra, meta.check.prompt).slice(0, 8)];
    got.forEach((v, i) => expect(v).toBeCloseTo(meta.check.logits[i], 1));
  });

  it('knows which questions it was taught, so it can say when it does not know', () => {
    const taught = readFileSync(join(__dirname, '../../scripts/ai/ghidra-qa.txt'), 'utf8').trim().split('\n\n').flatMap((b) => b.split('\n')[0].slice(3).split('|').map((q) => q.trim()));
    for (const q of ['how can i join my course', 'Is relief an emergency service', 'whats green', 'how do i scan', 'Hello']) expect(familiar(q, taught)).toBeGreaterThanOrEqual(FAMILIAR);
    for (const q of ['what is the capital of france', 'write me a python program', 'what is 2+2', 'tell me a joke', 'how do i cook rice']) expect(familiar(q, taught)).toBeLessThan(FAMILIAR);
  });

  it('writes on in its own alphabet, stopping at the limit', async () => {
    let out = '';
    await write(ghidra, 'Once upon a time', (c) => { out += c; }, { max: 300 });
    expect(out.length).toBeLessThanOrEqual(300);
    expect([...out].every((c) => meta.chars.includes(c))).toBe(true);
  });
});
