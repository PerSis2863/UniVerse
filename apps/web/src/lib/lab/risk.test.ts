import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as rk from './risk';
import { FileStore } from './files';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 99;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const gauss = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

describe('Hyperion portfolios and risk (M502)', () => {
  const mu = [0.08, 0.12, 0.15], C = [[0.04, 0.006, 0.01], [0.006, 0.09, 0.018], [0.01, 0.018, 0.16]];
  it('the least-risk portfolio matches the closed form; long-only stays at or above zero', () => {
    // Shorts allowed: w = C⁻¹1 / 1'C⁻¹1.
    const w = rk.minRisk(mu, C, undefined, false)!;
    const g = (v: number[]) => C.map((r) => r.reduce((s, c, j) => s + c * v[j], 0));
    const grad = g(w);
    expect(Math.max(...grad) - Math.min(...grad)).toBeLessThan(1e-12); // equal marginal risk at the optimum
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    const f = rk.frontier(mu, C, 15, true);
    f.forEach((p) => { expect(Math.min(...p.w)).toBeGreaterThanOrEqual(0); expect(p.w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9); });
    for (let k = 1; k < f.length; k++) { expect(f[k].ret).toBeGreaterThan(f[k - 1].ret); expect(f[k].risk).toBeGreaterThanOrEqual(f[k - 1].risk - 1e-12); }
    // A target only one asset can reach long-only forces a corner.
    const corner = rk.minRisk(mu, C, 0.149, true)!;
    expect(corner[2]).toBeGreaterThan(0.9);
  });
  it('the tangency portfolio: with two assets and shorts, the closed form w ∝ C⁻¹(μ − rf)', () => {
    const m2 = [0.1, 0.15], C2 = [[0.04, 0.01], [0.01, 0.09]], rf = 0.03, ex = [0.07, 0.12];
    const det = 0.04 * 0.09 - 0.0001, inv = [[0.09 / det, -0.01 / det], [-0.01 / det, 0.04 / det]], raw = inv.map((r) => r[0] * ex[0] + r[1] * ex[1]), s = raw[0] + raw[1];
    const t = rk.maxSharpe(m2, C2, rf, false);
    expect(t.w[0]).toBeCloseTo(raw[0] / s, 4);
    expect(t.sharpe).toBeCloseTo(Math.sqrt(ex[0] * raw[0] + ex[1] * raw[1]), 6); // √((μ−rf)'C⁻¹(μ−rf))
  });
  it('VaR and ES: normal returns agree with the formula; historical close to it', () => {
    const r = Array.from({ length: 200_000 }, () => 0.0005 + 0.01 * gauss());
    const n = rk.var_(r, 0.99, 'normal'), h = rk.var_(r, 0.99, 'historical');
    expect(n.var).toBeCloseTo(-0.0005 + 2.3263479 * 0.01, 3);
    expect(n.es).toBeCloseTo(-0.0005 + (0.01 * Math.exp(-(2.3263479 ** 2) / 2)) / (Math.sqrt(2 * Math.PI) * 0.01), 3);
    expect(h.var).toBeCloseTo(n.var, 3); expect(h.es).toBeCloseTo(n.es, 3);
    expect(rk.ninv(0.975)).toBeCloseTo(1.959963984540054, 12);
    // Kupiec: 2.5 failures expected in 250 days at 99%; 10 is a reject, 3 is fine.
    expect(rk.kupiec(10, 250, 0.99).p).toBeLessThan(0.01);
    expect(rk.kupiec(3, 250, 0.99).p).toBeGreaterThan(0.5);
  });
  it('GARCH(1,1) recovers its parameters', () => {
    const r = rk.garchSim(8000, 2e-6, 0.08, 0.9, rand), g = rk.garchFit(r);
    expect(g.alpha).toBeCloseTo(0.08, 1); expect(g.beta).toBeCloseTo(0.9, 1);
    expect(g.alpha + g.beta).toBeLessThan(1);
    expect(g.longRun).toBeCloseTo(Math.sqrt(2e-6 / 0.02), 2);
  });
  it('returns, drawdowns, a back-test and a carbon stress', () => {
    rk.toReturns([100, 110, 99]).forEach((v, i) => expect(v).toBeCloseTo([0.1, -0.1][i], 12));
    expect(rk.toPrices(rk.toReturns([100, 110, 99], true), 100, true)[2]).toBeCloseTo(99, 10);
    expect(rk.maxDrawdown([100, 120, 90, 130, 104])).toEqual({ dd: 0.25, from: 1, to: 2 });
    // A steady rise: the strategy is in the market after the long average fills, never out again.
    const p = Array.from({ length: 400 }, (_, i) => 100 * 1.001 ** i), b = rk.backtestMA(p, 10, 50, 0);
    expect(b.trades).toBe(1);
    expect(b.equity[399]).toBeCloseTo(1.001 ** (399 - 49), 9); // in from day 50 on day 49’s averages
    const c = rk.carbonStress([100e6, 50e6], [100_000, 0], 80, 0.25, 0.08);
    expect(c.loss[0]).toBeCloseTo((100_000 * 80 * 0.75) / 0.08, 6);
    expect(c.portfolio).toBeCloseTo(75e6 / 150e6, 9);
  });
  it('in the language', () => {
    const r = run("R = tick2ret([100; 110; 99]); [m, C] = ewstats([0.01 0.02; 0.03 -0.01; -0.02 0.04]);\n[risk, ret] = portstats([0.08 0.12], [0.04 0.01; 0.01 0.09], [0.5 0.5; 1 0]); [dd, idx] = maxdrawdown([100 120 90 130]);\nv = portvrisk(0.001, 0.02, 0.01, 1e6); rng(2); x = 0.01*randn(1000, 1); [VaR, ES] = valueAtRisk(x, 0.99, 'Method', 'normal'); t = varBacktest(x, VaR, 0.99);\nefficientFrontier([0.08 0.12 0.15], [0.04 0.006 0.01; 0.006 0.09 0.018; 0.01 0.018 0.16])\n[w, sr] = maxSharpe([0.08 0.12 0.15], [0.04 0.006 0.01; 0.006 0.09 0.018; 0.01 0.018 0.16], 0.02);");
    r.d('R').forEach((v, i) => expect(v).toBeCloseTo([0.1, -0.1][i], 12));
    expect(r.d('risk')[1]).toBeCloseTo(0.2, 12);
    expect(r.d('dd')[0]).toBeCloseTo(0.25, 12);
    expect(r.d('idx')).toEqual([2, 3]);
    expect(r.d('v')[0]).toBeCloseTo((2.3263479 * 0.02 - 0.001) * 1e6, 0);
    expect(r.d('w').reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
    expect(r.graphics.figures.length).toBe(1);
  });
});

describe('Hyperion climate scenarios (M509)', () => {
  // A made-up file in the IAMC layout NGFS's explorer downloads (numbers invented for the test).
  const CSV = 'Model,Scenario,Region,Variable,Unit,2025,2030,2040,2050\nM1,Net Zero 2050,World,Price|Carbon,US$2010/t CO2,10,150,300,600\nM1,Current Policies,World,Price|Carbon,US$2010/t CO2,5,8,10,12\nM1,Net Zero 2050,World,Emissions|CO2,Mt CO2/yr,38000,25000,9000,\n';
  it('reads and filters an IAMC file', () => {
    const rows = CSV.trim().split('\n').map((l) => l.split(','));
    const all = rk.readIamc(rows);
    expect(all.length).toBe(3);
    expect(all[2].values[3]).toBeNaN();
    const fs = new FileStore(); fs.putText('ngfs.csv', CSV);
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: fs });
    lab.run("s = ngfsRead('ngfs.csv', 'Variable', 'price|carbon'); n = numel(s.Scenario); y = s.Years; v = s.Values(2, :);");
    expect(toMat(lab.vars.get('n')!).d[0]).toBe(2);
    expect([...toMat(lab.vars.get('v')!).d]).toEqual([5, 8, 10, 12]);
    expect(() => lab.run("ngfsRead('ngfs.csv', 'Region', 'Mars')")).toThrow(/No series/);
  });
  it('a flat price path gives carbonStress’s answer; prices rise in straight lines', () => {
    const flat = rk.carbonStressPath([1e6], [100], [2026, 2050], [50, 50], { rate: 0.08 });
    expect(flat.loss[0]).toBeCloseTo(rk.carbonStress([1e6], [100], 50, 0, 0.08).loss[0], 6);
    const p = rk.yearly([2030, 2050], [100, 500], 2026);
    expect([p.year[0], p.price[0], p.price[4], p.price[14]]).toEqual([2026, 0, 100, 300]);
    // Falling emissions cut the loss; a higher path costs more.
    const lo = rk.carbonStressPath([1e7], [1000], [2030, 2050], [100, 500], { start: 2026 }), hi = rk.carbonStressPath([1e7], [1000], [2030, 2050], [260, 1250], { start: 2026 });
    const cut = rk.carbonStressPath([1e7], [1000], [2030, 2050], [100, 500], { start: 2026, decline: 0.05 });
    expect(hi.loss[0]).toBeGreaterThan(lo.loss[0]);
    expect(cut.loss[0]).toBeLessThan(lo.loss[0]);
  });
  it('carries NGFS’s stated Net Zero 2050 range with its source', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run('h = ngfsHeadline; lo = h.Low; hi = h.High;');
    expect([...toMat(lab.vars.get('lo')!).d]).toEqual([100, 500]);
    expect([...toMat(lab.vars.get('hi')!).d]).toEqual([260, 1250]);
    expect(rk.NGFS_NZ2050.source).toMatch(/licen/i);
  });
});
