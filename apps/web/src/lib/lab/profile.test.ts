import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { compared, hotLines, Profiler, timeText } from './profile';
import { lintScript } from './lint';
import { HELP } from './help';

// M400: a run timed line by line, and the slowest lines with a way to speed them up.
const profile = (src: string) => {
  let t = 0;
  // A clock that moves a set amount per statement: each line's share is then exact.
  const prof = new Profiler(src, () => (t += 1));
  const lab = new Lab({ out: () => {}, trace: (at) => prof.step(at), fnTimer: prof });
  lab.run(src);
  return prof.finish();
};

describe('Hyperion Time it (M400)', () => {
  it('counts every line’s passes and gives each its time', () => {
    const p = profile('s = 0;\nfor k = 1:4\n  s = s + k;\nend\ndisp(s)');
    const by = new Map(p.lines.map((l) => [l.line, l]));
    expect(by.get(1)?.count).toBe(1);
    expect(by.get(2)?.count).toBe(4);
    expect(by.get(3)?.count).toBe(4);
    expect(by.get(5)?.count).toBe(1);
    expect(p.total).toBeGreaterThan(0);
    expect(p.lines.reduce((s, l) => s + l.ms, 0)).toBeLessThanOrEqual(p.total);
  });
  it('gives the slow lines a tip that fits them', () => {
    const src = 'for k = 1:2000\n  sq(k) = k^2;\nend\nfor k = 1:3\n  y = k\nend';
    const p = profile(src), problems = lintScript(src, (n) => HELP.has(n)).problems;
    const hot = hotLines(src, p, problems);
    expect(hot[0].line === 1 || hot[0].line === 2).toBe(true);
    expect(hot.find((h) => h.line === 2)?.tip).toMatch(/grows an array/);
    expect(hot.find((h) => h.line === 1)?.tip).toMatch(/runs 2,000 times/);
  });
  it('breaks the time down by function, own time and with what it calls (M401)', () => {
    const p = profile('y = twice(3);\nz = sum([1 2 3]);\nfunction r = twice(a)\n  r = 2*a + abs(-a);\nend');
    const fn = new Map((p.fns ?? []).map((f) => [f.name, f]));
    expect(fn.get('twice')?.calls).toBe(1);
    expect(fn.get('abs')?.calls).toBe(1);
    expect(fn.get('sum')?.calls).toBe(1);
    // twice's own time leaves out abs's; its total includes it.
    expect(fn.get('twice')!.total).toBeGreaterThanOrEqual(fn.get('twice')!.self + fn.get('abs')!.total);
  });
  it('compares a run with the one before', () => {
    expect(compared(210, 1940)).toEqual({ text: '9.2× faster', better: true });
    expect(compared(3000, 1000)).toEqual({ text: '3.0× slower', better: false });
    expect(compared(1000, 1050).text).toBe('about the same');
    expect(compared(10, 1000).text).toBe('100× faster');
  });
  it('writes times for people', () => {
    expect(timeText(0.4)).toBe('0.40 ms');
    expect(timeText(120.4)).toBe('120 ms');
    expect(timeText(1234)).toBe('1.23 s');
  });
});
