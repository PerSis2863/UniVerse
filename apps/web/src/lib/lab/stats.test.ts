import { describe, expect, it } from 'vitest';
import * as st from './stats';

describe('Hyperion statistics (M556): distributions against printed tables', () => {
  it('special functions', () => {
    expect(st.gammaln(10)).toBeCloseTo(Math.log(362880), 12);
    expect(st.gammaln(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    expect(st.gammainc(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(st.betainc(0.5, 2, 3)).toBeCloseTo(0.6875, 12);
    expect(st.normcdf(1.959963984540054)).toBeCloseTo(0.975, 12);
  });
  it('critical values: t, χ², F, normal', () => {
    expect(st.tinv(0.975, 10)).toBeCloseTo(2.228138851986, 9);
    expect(st.tinv(0.95, 1)).toBeCloseTo(6.313751514675, 8);
    expect(st.chi2inv(0.95, 2)).toBeCloseTo(5.991464547108, 9);
    expect(st.chi2inv(0.99, 10)).toBeCloseTo(23.209251158954, 8);
    expect(st.finv(0.95, 2, 10)).toBeCloseTo(4.102821015130, 8);
    expect(st.norminv(0.975)).toBeCloseTo(1.959963984540, 10);
    expect(st.binocdf(3, 10, 0.5)).toBeCloseTo(176 / 1024, 12);
    expect(st.poisscdf(2, 3)).toBeCloseTo(Math.exp(-3) * (1 + 3 + 4.5), 12);
  });
});

describe('Hyperion statistics (M556): the tests', () => {
  it('t-tests', () => {
    const x = [5.1, 4.9, 5.6, 5.8, 6.0, 5.5, 5.3, 5.7];
    const r = st.ttest(x, 5);
    expect(r.tstat).toBeCloseTo((5.4875 - 5) / (Math.sqrt(x.reduce((s, v) => s + (v - 5.4875) ** 2, 0) / 7) / Math.sqrt(8)), 10);
    expect(r.p).toBeCloseTo(2 * (1 - st.tcdf(r.tstat, 7)), 12);
    expect(r.h).toBe(1);
    // Welch: two groups of different spread.
    const a = [19.1, 20.3, 18.7, 21.2, 20.0], b = [22.5, 25.1, 21.7, 26.3, 23.9, 24.4];
    const w = st.ttest2(a, b, 0.05, 'both', false), e = st.ttest2(a, b);
    expect(e.df).toBe(9);
    expect(w.df).toBeLessThan(9);
    expect(w.p).toBeLessThan(0.01);
  });
  it('rank tests: exact rank-sum and signed-rank, and Kruskal–Wallis', () => {
    // 1..3 against 4..6: the most extreme of 20 arrangements on each side.
    expect(st.ranksum([1, 2, 3], [4, 5, 6]).p).toBeCloseTo(0.1, 12);
    // Five positive differences: 2/32.
    expect(st.signrank([1, 2, 3, 4, 5]).p).toBeCloseTo(0.0625, 12);
    const kw = st.kruskalwallis([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(kw.H).toBeCloseTo(7.2, 12);
    expect(kw.p).toBeCloseTo(Math.exp(-3.6), 10);
  });
  it('ANOVA one-way and two-way', () => {
    const r = st.anova1([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(r.F).toBeCloseTo(27, 10);
    expect(r.table[1][1]).toBeCloseTo(6, 12);
    // Two-way, one per cell: rows add 0, 1, 2 and columns 0, 10 → both factors exact, error 0.
    const t = st.anova2([[1, 11.2], [2.1, 12], [3, 12.9]]);
    expect(t.table[0][4]).toBeGreaterThan(1000);
  });
  it('fits and the bootstrap', () => {
    const f = st.normfit([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(f.mu).toBe(5);
    expect(f.sigma).toBeCloseTo(Math.sqrt(32 / 7), 12);
    const g = st.fitdist([1, 2, 3, 4, 5, 6], 'gamma');
    expect(g.params[0] * g.params[1]).toBeCloseTo(3.5, 8);
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const data = Array.from({ length: 40 }, (_, i) => Math.sin(i) * 3 + 10);
    const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    const ci = st.bootci(data, mean, 2000, rand);
    expect(ci[0]).toBeLessThan(mean(data));
    expect(ci[1]).toBeGreaterThan(mean(data));
    const c = st.chi2gof(Array.from({ length: 200 }, (_, i) => st.norminv((i + 0.5) / 200)));
    expect(c.h).toBe(0);
  });
});
