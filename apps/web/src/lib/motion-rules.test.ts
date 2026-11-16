import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// AGENTS.md §8: "name the properties (transition-[transform,opacity], not transition-all)". With
// `transition-all` a card also animates its width and height whenever the layout moves (the side menu
// folding, a window resize, a list re-flowing): layout work on every frame for no reason, and a wave
// of colour on a theme switch. M158 named them all (108 places); this keeps it that way. Use
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
  // M231: a bar that grows its width (or a part moved by `left` / `top`) re-lays out the page on every frame, so it
  // stutters while the page is busy (loading). Progress bars use <Fill> (components/ui/Fill.tsx), which slides.
  // Left: stacked bars whose parts share a row (Trace's market cells, consent tallies, a call's class pulse, an SVG chart), the
  // welcome tour's spotlight (shown once).
  it('progress bars slide instead of growing', () => {
    const ok = ['components/trace/map/MarketMap.tsx', 'components/guardian/ConsentFormsManager.tsx', 'components/studio/PlanTools.tsx', 'components/layout/WelcomeTour.tsx', 'components/call/ClassPulse.tsx', 'app/(dashboard)/student/grades/page.tsx'];
    const found = files(SRC).filter((f) => f.endsWith('.tsx') && !ok.includes(f.slice(SRC.length)))
      .filter((f) => /transition-\[(width|left|top)|initial=\{\{ width: 0 \}\}|animate=\{\{ (width|top|left): /.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length));
    expect(found).toEqual([]);
  });
});
