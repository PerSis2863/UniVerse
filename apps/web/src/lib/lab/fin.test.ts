import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as fn from './fin';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 21;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('Hyperion finance, pricing (M501)', () => {
  it('the normal distribution to many digits', () => {
    expect(fn.ncdf(0)).toBe(0.5);
    expect(fn.ncdf(1)).toBeCloseTo(0.8413447460685429, 14);
    expect(fn.ncdf(-2)).toBeCloseTo(0.022750131948179195, 15);
    expect(fn.ncdf(-8) / 6.22096057427178e-16).toBeCloseTo(1, 7); // the far tail by a continued fraction
  });
  it('Black–Scholes against Hull’s worked example, parity and the Greeks by finite differences', () => {
    // Hull: S 42, K 40, r 10%, σ 20%, 6 months: call 4.76, put 0.81.
    const g = fn.bs(42, 40, 0.1, 0.5, 0.2);
    expect(g.call).toBeCloseTo(4.76, 2); expect(g.put).toBeCloseTo(0.81, 2);
    const q = 0.03, b = fn.bs(100, 95, 0.05, 1.3, 0.25, q);
    expect(b.call - b.put).toBeCloseTo(100 * Math.exp(-q * 1.3) - 95 * Math.exp(-0.05 * 1.3), 10);
    const h = 1e-4, f = (S: number, s = 0.25, T = 1.3, r = 0.05) => fn.bs(S, 95, r, T, s, q).call;
    expect(b.deltaC).toBeCloseTo((f(100 + h) - f(100 - h)) / (2 * h), 6);
    expect(b.gamma).toBeCloseTo((f(100 + 1e-2) - 2 * f(100) + f(100 - 1e-2)) / 1e-4, 4);
    expect(b.vega).toBeCloseTo((f(100, 0.25 + h) - f(100, 0.25 - h)) / (2 * h), 5);
    expect(b.thetaC).toBeCloseTo(-(f(100, 0.25, 1.3 + h) - f(100, 0.25, 1.3 - h)) / (2 * h), 5);
    expect(b.rhoC).toBeCloseTo((f(100, 0.25, 1.3, 0.05 + h) - f(100, 0.25, 1.3, 0.05 - h)) / (2 * h), 4);
    expect(fn.impliedVol(b.put, 100, 95, 0.05, 1.3, q, true)).toBeCloseTo(0.25, 10);
    expect(fn.impliedVol(200, 100, 95, 0.05, 1.3)).toBeNaN();
  });
  it('the binomial tree converges to Black–Scholes; an American put is worth more', () => {
    const eu = fn.crr(50, 52, 0.05, 2, 0.3, 1000, false, false).price, am = fn.crr(50, 52, 0.05, 2, 0.3, 1000, false, true).price;
    expect(eu).toBeCloseTo(fn.bs(50, 52, 0.05, 2, 0.3).put, 2);
    // Hull's two-step American put example (S 50, K 52, r 5%, σ 30%, 2 years): 7.43 on a two-step tree.
    expect(fn.crr(50, 52, 0.05, 2, 0.3, 2, false, true).price).toBeCloseTo(7.43, 2);
    expect(am).toBeGreaterThan(eu);
    // No dividends: an American call is never exercised early.
    expect(fn.crr(50, 52, 0.05, 2, 0.3, 500, true, true).price).toBeCloseTo(fn.crr(50, 52, 0.05, 2, 0.3, 500, true, false).price, 10);
  });
  it('Monte Carlo agrees with Black–Scholes; Asian and barrier options are cheaper', () => {
    const mc = fn.monteCarlo(100, 100, 0.05, 1, 0.2, 200_000, rand), exact = fn.bs(100, 100, 0.05, 1, 0.2).call;
    expect(Math.abs(mc.price - exact)).toBeLessThan(4 * mc.se);
    const asian = fn.monteCarlo(100, 100, 0.05, 1, 0.2, 20_000, rand, { payoff: 'asian', steps: 50 });
    const barrier = fn.monteCarlo(100, 100, 0.05, 1, 0.2, 20_000, rand, { payoff: 'barrier', barrier: 130, steps: 100 });
    expect(asian.price).toBeLessThan(exact); expect(barrier.price).toBeLessThan(exact);
  });
  it('bonds: price, yield, duration and convexity; bootstrapping; Nelson–Siegel', () => {
    // A par bond: coupon = yield gives 100.
    expect(fn.bondPrice(100, 0.06, 10, 0.06, 2)).toBeCloseTo(100, 10);
    expect(fn.bondYield(fn.bondPrice(100, 0.05, 7, 0.0631, 2), 100, 0.05, 7, 2)).toBeCloseTo(0.0631, 10);
    // A zero-coupon bond's Macaulay duration is its maturity; duration and convexity predict a 1% move.
    expect(fn.bondRisk(100, 0, 5, 0.04, 1).macaulay).toBeCloseTo(5, 10);
    const r = fn.bondRisk(100, 0.05, 10, 0.05, 2), dy = 0.01, actual = fn.bondPrice(100, 0.05, 10, 0.06, 2) - r.price;
    expect(r.price * (-r.modified * dy + 0.5 * r.convexity * dy * dy)).toBeCloseTo(actual, 1);
    const b = fn.bootstrap([0.02, 0.03, 0.035], 1);
    expect(b.zero[0]).toBeCloseTo(0.02, 12);
    // Each par bond prices back to 1 with the discount factors.
    [0.02, 0.03, 0.035].forEach((c, k) => expect(b.df.slice(0, k + 1).reduce((s, d) => s + c * d, 0) + b.df[k]).toBeCloseTo(1, 12));
    const t = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30], truth = [0.04, -0.015, 0.01, 1.8];
    const fit = fn.fitNelsonSiegel(t, t.map((s) => fn.nelsonSiegel(truth, s)));
    expect(fit.rmse).toBeLessThan(1e-6);
  });
  it('in the language', () => {
    const r = run("[c, p] = blsprice(42, 40, 0.1, 0.5, 0.2); v = blsimpv(42, 40, 0.1, 0.5, c); [dc, dp] = blsdelta([40 42 44], 40, 0.1, 0.5, 0.2);\n[A, V] = binprice(50, 52, 0.05, 2, 1, 0.3, 0); am = V(1, 1);\nrng(1); [m, se] = mcOptionPrice(42, 40, 0.1, 0.5, 0.2, 'Paths', 50000);\nP = bondPrice(100, 0.06, 10, 0.06); [mac, md, cv] = bondDuration(100, 0.05, 10, 0.05);\nzeroCurve([0.02 0.03 0.035 0.04])");
    expect(r.d('c')[0]).toBeCloseTo(4.76, 2);
    expect(r.d('v')[0]).toBeCloseTo(0.2, 10);
    expect(r.d('dc').length).toBe(3);
    expect(r.d('am')[0]).toBeCloseTo(7.43, 2);
    expect(Math.abs(r.d('m')[0] - r.d('c')[0])).toBeLessThan(4 * r.d('se')[0]);
    expect(r.d('P')[0]).toBeCloseTo(100, 9);
    expect(r.graphics.figures.length).toBe(1);
  });
});
