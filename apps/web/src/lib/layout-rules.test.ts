import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// M289 (the owner: "do a lot more like this"): a grid given columns only from a breakpoint up (`grid sm:grid-cols-2`)
// is one `auto` column on a phone, and that column grows to its longest line that won't break (a `truncate`, a
// `whitespace-nowrap`): the card's text then runs past its edge and is cut off (the crawl found 74 on phones). Give it
// `grid-cols-1` too: one column that shrinks to the screen.
const SRC = new URL('../', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : files(p);
    return name.endsWith('.tsx') ? [p] : [];
  });

/** Class strings with `grid`, columns from a breakpoint up and none below it. */
function phoneGrids(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/className=(?:"|\{`|\{cn\(\s*['"`])([^"'`]*)/g)) {
    const t = m[1].split(/\s+/);
    if (t.includes('grid') && !t.some((x) => /^grid-cols-/.test(x)) && t.some((x) => /^[\w@[\]-]+:grid-cols-/.test(x))) out.push(m[1]);
  }
  return out;
}

describe('layout rules', () => {
  it('finds a grid with columns only on bigger screens', () => {
    expect(phoneGrids('<div className="grid gap-4 sm:grid-cols-2">')).toHaveLength(1);
    expect(phoneGrids('<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">')).toEqual([]);
    expect(phoneGrids('<div className={cn(\'grid gap-2 lg:grid-cols-3\', x)}>')).toHaveLength(1);
  });
  it('every grid with columns on bigger screens has its phone column', () => {
    const found = files(SRC).flatMap((f) => phoneGrids(readFileSync(f, 'utf8')).map((c) => `${f.slice(SRC.length)}: ${c}`));
    expect(found).toEqual([]);
  });
});
