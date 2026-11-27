import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './stats-lab';

const run = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => [...toMat(lab.vars.get(n)!).d]; };

describe('Hyperion statistics in the language (M556)', () => {
  it('distributions elementwise, and the tests with MATLAB’s outputs', () => {
    const v = run(`
      q = tinv([0.975 0.995], 10);
      [h, p, ci, s] = ttest([5.1 4.9 5.6 5.8 6.0 5.5 5.3 5.7], 5, 'Tail', 'right');
      df = s.df;
      [p2, tbl] = anova1([1 4 7; 2 5 8; 3 6 9]);
      pk = kruskalwallis([1 2 3 4 5 6 7 8 9], [1 1 1 2 2 2 3 3 3]);
      [mu, sig] = normfit([2 4 4 4 5 5 7 9]);
      pd = fitdist([1 2 3 4 5 6]', 'Exponential'); m = pd.mu;
      rng(1); ci2 = bootci(500, @mean, [3 5 4 6 5 7 4 5 6 5]);`);
    expect(v('q')[0]).toBeCloseTo(2.2281388520, 8);
    expect(v('q')[1]).toBeCloseTo(3.1692726726, 8);
    expect(v('h')[0]).toBe(1);
    expect(v('df')[0]).toBe(7);
    expect(v('p2')[0]).toBeCloseTo(1 - 0.99897, 3);
    expect(v('pk')[0]).toBeCloseTo(Math.exp(-3.6), 9);
    expect(v('mu')[0]).toBe(5);
    expect(v('m')[0]).toBe(3.5);
    expect(v('ci2')[0]).toBeLessThan(5);
    expect(v('ci2')[1]).toBeGreaterThan(5);
  });
});
