import { describe, expect, it } from 'vitest';
import { NIGHT_FLOORS, nightKeys, nightMaze } from './worlds';
import { NIGHT_CODE_FLOOR, NIGHT_FLOOR_NAMES, NIGHT_KEY_NAMES, NIGHT_SHADES, nightCode, nightEnding, nightLayout, nightNotes } from './night-story';

describe('Night Shift story', () => {
  it('lays out notes, the safe room, flares and Shades on cells of their own, the same for every player', () => {
    for (const seed of [1, 7, 42, 2026]) for (let f = 0; f < NIGHT_FLOORS; f++) {
      const m = nightMaze(seed, f), lay = nightLayout(seed, f, m), n = m.n;
      const cells = [...lay.notes, lay.safe, ...lay.flares, ...lay.shades];
      expect(new Set(cells).size).toBe(cells.length);
      for (const c of cells) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(n * n); expect([0, m.exit, ...m.keys]).not.toContain(c); }
      expect(lay.notes).toHaveLength(2);
      expect(lay.shades).toHaveLength(NIGHT_SHADES[f]);
      expect(nightLayout(seed, f, nightMaze(seed, f))).toEqual(lay);
    }
  });
  it('hides the stairwell code in the bursar’s memo and names every key', () => {
    const code = nightCode(9);
    expect(code).toMatch(/^[1-9]\d{3}$/);
    expect(nightCode(9)).toBe(code);
    const notes = nightNotes(code);
    expect(notes).toHaveLength(NIGHT_FLOORS);
    expect(notes[NIGHT_CODE_FLOOR].some((x) => x.body.includes(code.split('').join(' ')))).toBe(true);
    for (let f = 0; f < NIGHT_FLOORS; f++) { expect(NIGHT_KEY_NAMES[f]).toHaveLength(nightKeys(f)); expect(NIGHT_FLOOR_NAMES[f]).toBeTruthy(); }
    expect(nightEnding(6, 6).title).not.toBe(nightEnding(5, 6).title);
  });
});
