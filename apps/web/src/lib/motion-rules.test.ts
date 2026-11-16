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
  // M231: framer-motion's endless loops run on the page's thread every frame; a CSS @keyframes loop runs on the
  // graphics chip (and pauses while scrolling, html[data-scrolling]).
  it('endless loops are CSS', () => {
    expect(files(SRC).filter((f) => f.endsWith('.tsx') && /repeat:\s*(Infinity|Number\.POSITIVE_INFINITY)/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length))).toEqual([]);
  });
  // M231: every button already sinks when pressed (globals.css, "Motion system"); framer-motion's whileTap scale
  // shrank 39 of them a second time, from the page's thread. A deeper press is `active:scale-[0.9]` (it replaces it).
  it('one press animation per button', () => {
    expect(files(SRC).filter((f) => f.endsWith('.tsx') && /whileTap=\{\{\s*scale/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length))).toEqual([]);
  });
  // M231: a CSS animation of a blur, a shadow, a background's position or a size repaints (or re-lays out) every
  // frame; transform and opacity are run by the graphics chip. Left as they are: the owner console's flow card
  // (flow-on, flow-row), a hidden message's specks (ink-drift), one-off reveals by clipping (deck-draw, chat-portal).
  it('CSS animations move and fade only', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
    const ok = new Set(['flow-on', 'flow-row', 'ink-drift', 'deck-draw', 'chat-portal', 'chat-portal-rtl']);
    const heavy = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
      .filter(([, name, body]) => !ok.has(name) && /(^|[\s{;])(filter|box-shadow|background(-position|-color)?|width|height|top|left|margin[\w-]*|padding[\w-]*)\s*:/.test(body))
      .map(([, name]) => name);
    expect(heavy).toEqual([]);
  });
});
