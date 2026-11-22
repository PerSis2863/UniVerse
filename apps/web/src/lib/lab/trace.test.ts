import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { MAX_STEPS, Recorder, printedUpTo, varsAt } from './trace';

const record = (src: string) => {
  const graphics = new Graphics(), rec = new Recorder(src, graphics);
  graphics.onChange = () => rec.figureChanged();
  const host = { out: (t: string) => rec.write(t), graphics, trace: (at: number, vars: Map<string, never>, depth: number) => rec.step(at, vars, depth) };
  const lab = new Lab(host);
  lab.run(src);
  rec.finish();
  return rec;
};

describe('Hyperion: watch it run (M393)', () => {
  it('records each step: its line, what changed, what it printed', () => {
    const rec = record('s = 0;\nfor k = 1:3\n  s = s + k\nend\nplot(1:s)');
    expect(rec.steps.map((s) => s.line)).toEqual([1, 2, 3, 2, 3, 2, 3, 5]);
    expect([rec.steps[1].changed.includes('k'), rec.steps[2].changed]).toEqual([true, ['s']]);
    expect(varsAt(rec.steps, 6)).toContainEqual(['s', '6']);
    expect(rec.steps[3].changed).toEqual(['k']);
    expect(printedUpTo(rec.steps, 4)).toBe('s = 1\ns = 3\n');
    expect(rec.figs).toHaveLength(1);
    expect(rec.steps[7].fig).toBe(0);
    expect(rec.steps[6].fig).toBe(-1);
  });
  it('follows calls into functions and stops recording long runs', () => {
    const rec = record('y = sq(4);\nfunction r = sq(x)\n  r = x^2;\nend');
    expect(rec.steps.map((s) => [s.line, s.depth])).toEqual([[1, 0], [3, 1]]);
    expect(varsAt(rec.steps, 1)).toEqual([['r', '16'], ['x', '4']]);
    const long = record('t = 0; for k = 1:10000, t = t + 1; end');
    expect([long.full, long.steps.length]).toEqual([true, MAX_STEPS]);
  });
});
