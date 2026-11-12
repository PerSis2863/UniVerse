import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// AGENTS.md §8: "name the properties (transition-[transform,opacity], not transition-all)". With
// `transition-all` a card also animates its width and height whenever the layout moves (the side menu
// folding, a window resize, a list re-flowing): layout work on every frame for no reason, and a wave
// of colour on a theme switch. M129 named them all (108 places); this keeps it that way. Use
// `transition` (colours, shadow, opacity, transform) or name what changes, e.g. `transition-[width]`.
const SRC = new URL('../', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : files(p);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

describe('motion rules', () => {
  it('no transition animates every property', () => {
    const found = files(SRC).filter((file) => /\btransition-all\b|transition(-property)?:\s*all\b/.test(readFileSync(file, 'utf8'))).map((file) => file.slice(SRC.length));
    expect(found).toEqual([]);
  });
});
