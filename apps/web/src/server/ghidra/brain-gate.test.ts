import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SKILLS } from './skills';

// Ghidra, the one AI: every AI answer goes through Ghidra's brain, named by a skill. A file that calls Gemini itself
// (or names a skill that isn't in skills.ts) fails here.

const SRC = fileURLToPath(new URL('../..', import.meta.url));
/** The only files that may import ../gemini, and why. */
const ALLOWED: Record<string, string> = {
  'server/gemini.ts': 'Gemini itself',
  'server/ghidra/brain.ts': 'Ghidra’s brain',
  'app/api/ai/route.ts': 'the chat on every page streams Gemini through geminiFetch: the same SAFETY settings and quick thinking (it is Ghidra’s assistant skill)',
};

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== 'test-setup.ts' ? [join(dir, e.name)] : []));
}
const all = files(SRC).map((f) => [relative(SRC, f).split(sep).join('/'), readFileSync(f, 'utf8')] as const);

describe('Ghidra, the one AI', () => {
  it('nothing calls Gemini around Ghidra’s brain', () => {
    const bad = all.filter(([f, s]) => /from '(?:\.\.?\/)+gemini'|from '@\/server\/gemini'/.test(s) && !ALLOWED[f]).map(([f]) => f);
    expect(bad).toEqual([]);
  });
  it('the chat route uses only geminiFetch from gemini.ts (its safety settings and quick thinking)', () => {
    const s = all.find(([f]) => f === 'app/api/ai/route.ts')?.[1] ?? '';
    expect(s).toMatch(/import \{ geminiFetch \} from '@\/server\/gemini'/);
  });
  it('every skill a call names is in the list', () => {
    const named = all.flatMap(([, s]) => [...s.matchAll(/\bghidra(?:Json|JsonImage|Text|FileText|AudioText)(?:<[^(]*>)?\('([a-z-]+)'/g)].map((m) => m[1]));
    expect(named.length).toBeGreaterThan(50);
    expect(named.filter((k) => !(k in SKILLS))).toEqual([]);
  });
});
