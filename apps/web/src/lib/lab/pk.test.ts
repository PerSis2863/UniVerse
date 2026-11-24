import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as pk from './pk';
import { rk45, rk4Grid } from './sci-num';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion pharmacokinetics (M493)', () => {
  const one: pk.PkModel = { cl: 5, v: 50, ka: 1.5, f: 0.8 };
  it('one compartment: bolus, infusion and oral against the textbook formulas', () => {
    const k = 0.1;
    expect(pk.single(one, { amount: 500, route: 'iv' }, 3)).toBeCloseTo(10 * Math.exp(-0.3), 12);
    expect(pk.halfLife(one)).toBeCloseTo(Math.LN2 / k, 12);
    // Infusion of 500 mg over 2 h: at the end R/CL (1 − e^(−kT)).
    expect(pk.single(one, { amount: 500, route: 'infusion', duration: 2 }, 2)).toBeCloseTo((250 / 5) * (1 - Math.exp(-0.2)), 12);
    // Oral: the peak at ln(ka/k)/(ka − k).
    const tmax = Math.log(1.5 / k) / (1.5 - k), at = (t: number) => pk.single(one, { amount: 500, route: 'oral' }, t);
    expect(at(tmax)).toBeGreaterThan(at(tmax - 0.01));
    expect(at(tmax)).toBeGreaterThan(at(tmax + 0.01));
    // The area under an oral dose is F·D/CL.
    const t = Array.from({ length: 4001 }, (_, i) => i * 0.05), c = t.map(at);
    expect(pk.nca(t, c, 500).aucInf).toBeCloseTo((0.8 * 500) / 5, 1);
  });
  it('two compartments match the equations solved step by step', () => {
    const m: pk.PkModel = { cl: 4, v: 20, q: 8, v2: 60 }, k10 = 0.2, k12 = 0.4, k21 = 8 / 60;
    const r = rk45((_, [a1, a2]) => [-(k10 + k12) * a1 + k21 * a2, k12 * a1 - k21 * a2], 0, 10, [500, 0], 1e-10, 1e-12);
    expect(pk.single(m, { amount: 500, route: 'iv' }, 10)).toBeCloseTo(r.y[r.y.length - 1][0] / 20, 6);
    const ms = pk.modes(m);
    expect(ms[0].l * ms[1].l).toBeCloseTo(k10 * k21, 12);
    expect(ms[0].l + ms[1].l).toBeCloseTo(k10 + k12 + k21, 12);
  });
  it('steady state: the mean is F·D/(CL·τ), the bolus accumulation 1/(1 − e^(−kτ))', () => {
    const s = pk.steadyState({ cl: 5, v: 50 }, { amount: 500, route: 'iv' }, 8);
    expect(s.max).toBeCloseTo(10 / (1 - Math.exp(-0.8)), 9);
    expect(s.min).toBeCloseTo((10 * Math.exp(-0.8)) / (1 - Math.exp(-0.8)), 9);
    expect(s.accumulation).toBeCloseTo(1 / (1 - Math.exp(-0.8)), 9);
    expect(pk.steadyState(one, { amount: 500, route: 'oral' }, 12).avg).toBeCloseTo((0.8 * 500) / 60, 12);
    // Superposition: many doses simulated reach the summed steady state.
    const late = pk.simulate({ cl: 5, v: 50 }, pk.schedule(500, 'iv', 8, 40), [39 * 8]);
    expect(late[0]).toBeCloseTo(s.max, 6);
  });
  it('the dosing window for a bolus: τ = ln(MTC/MEC)/k, dose = V (MTC − MEC)', () => {
    const w = pk.dosingWindow({ cl: 5, v: 50 }, 5, 20, 'iv')!;
    expect(w.tauMax).toBeCloseTo(Math.log(4) / 0.1, 3);
    expect(w.doseMax).toBeCloseTo(50 * 15, 1);
    expect(w.practical!.tau).toBe(12);
    expect(w.practical!.min).toBeGreaterThan(5);
    expect(w.practical!.max).toBeLessThan(20);
  });
  it('saturating elimination: linear at low levels, much higher at high doses', () => {
    const lin = pk.simulate({ cl: 25 / 400, v: 50 }, [{ at: 0, amount: 1, route: 'iv' }], [0, 5, 10]);
    const sat = pk.simulate({ cl: 0, v: 50, vmax: 25, km: 400 }, [{ at: 0, amount: 1, route: 'iv' }], [0, 5, 10]);
    sat.forEach((c, i) => expect(c).toBeCloseTo(lin[i], 6));
    const lo = pk.simulate({ cl: 0, v: 50, vmax: 25, km: 4 }, pk.schedule(200, 'oral', 12, 20, undefined), [234])[0];
    const hi = pk.simulate({ cl: 0, v: 50, vmax: 25, km: 4 }, pk.schedule(260, 'oral', 12, 20, undefined), [234])[0];
    expect(hi / lo).toBeGreaterThan(2);
  });
  it('in the language', () => {
    const r = run("m = pkModel('CL', 5, 'V', 50); h = m.HalfLife; [t, C] = pkSimulate(m, 500, 'Every', 8, 'Doses', 3, 'Hours', 24, 'Step', 1);\nw = pkDosingWindow(m, 5, 20); tau = w.MaxInterval; p = pkNCA(0:2:24, 10*exp(-0.1*(0:2:24)), 500); cl = p.CL;\npkSimulate(m, 500, 'Route', 'infusion', 'Duration', 2, 'Window', [5 20])");
    expect(r.d('h')[0]).toBeCloseTo(6.931, 3);
    expect(r.d('C')[8]).toBeCloseTo(10 * Math.exp(-0.8) + 10, 9);
    expect(r.d('tau')[0]).toBeCloseTo(13.86, 2);
    expect(r.d('cl')[0]).toBeCloseTo(5, 1);
    expect(r.graphics.figures.length).toBe(1);
  });
});

describe('Hyperion pharmacokinetics, the left-outs (M511)', () => {
  it('three compartments match the equations solved step by step; two through the general route match the closed form', () => {
    const m = { cl: 4, v: 20, q: 6, v2: 40, q3: 1, v3: 100 };
    const k10 = 0.2, k12 = 0.3, k21 = 0.15, k13 = 0.05, k31 = 0.01;
    const ode = rk4Grid((_, [a1, a2, a3]) => [-(k10 + k12 + k13) * a1 + k21 * a2 + k31 * a3, k12 * a1 - k21 * a2, k13 * a1 - k31 * a3], [0, 1, 10, 100], [100, 0, 0], 0.001);
    const c = pk.simulate(m, [{ at: 0, amount: 100, route: 'iv' }], [0, 1, 10, 100]);
    ode.y.forEach((y, i) => expect(c[i] / (y[0] / 20)).toBeCloseTo(1, 6));
    const two = pk.modes({ cl: 5, v: 50, q: 10, v2: 80 }), gen = pk.mammillary(50, 0.1, [[0.2, 0.125]]);
    gen.forEach((x, i) => { expect(x.l).toBeCloseTo(two[i].l, 10); expect(x.a).toBeCloseTo(two[i].a, 10); });
  });
  it('a lag time shifts a dose by mouth, also when elimination saturates', () => {
    const m = { cl: 5, v: 50, ka: 1 }, a = pk.simulate(m, [{ at: 0, amount: 100, route: 'oral' }], [3]), b = pk.simulate({ ...m, lag: 1 }, [{ at: 0, amount: 100, route: 'oral' }], [0.5, 4]);
    expect(b[0]).toBe(0); expect(b[1]).toBeCloseTo(a[0], 12);
    const s = { cl: 0, v: 50, vmax: 25, km: 4, ka: 1 }, sa = pk.simulate(s, [{ at: 0, amount: 100, route: 'oral' }], [3]), sb = pk.simulate({ ...s, lag: 1 }, [{ at: 0, amount: 100, route: 'oral' }], [4]);
    expect(sb[0]).toBeCloseTo(sa[0], 6);
  });
  it('effect: Emax at EC50 gives half; an effect site under a steady level rises as 1 − e^(−ke0 t)', () => {
    expect(pk.emax(2, { emax: 100, ec50: 2 })).toBe(50);
    expect(pk.emax(4, { emax: 100, ec50: 2, hill: 2, e0: 10 })).toBeCloseTo(90, 12);
    const t = Array.from({ length: 101 }, (_, i) => i / 10), ce = pk.effectSite(t, t.map(() => 5), 0.7);
    expect(ce[100]).toBeCloseTo(5 * (1 - Math.exp(-7)), 10);
    const ramp = pk.effectSite(t, t.map((x) => 2 * x), 1); // C = 2t: Ce = 2(t − 1 + e^−t)
    expect(ramp[50]).toBeCloseTo(2 * (5 - 1 + Math.exp(-5)), 10);
  });
  it('pkFit recovers a one- and a two-compartment model from their levels', () => {
    let seed = 99;
    const one = { cl: 3, v: 35, ka: 0.8, f: 0.9 }, doses = pk.schedule(400, 'oral', 12, 3), t = [1, 2, 4, 6, 8, 12.5, 14, 18, 24.5, 26, 30, 36];
    const f = pk.pkFit(t, pk.simulate(one, doses, t), doses, { f: 0.9 });
    expect(f.model.cl).toBeCloseTo(3, 3); expect(f.model.v).toBeCloseTo(35, 2); expect(f.model.ka).toBeCloseTo(0.8, 3);
    const two = { cl: 5, v: 20, q: 8, v2: 60 }, iv = [{ at: 0, amount: 500, route: 'iv' as const }], t2 = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 36, 48];
    const g = pk.pkFit(t2, pk.simulate(two, iv, t2).map((c) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return c * (1 + 0.04 * (seed / 2 ** 32 - 0.5)); }), iv, { compartments: 2 });
    expect(g.model.cl / 5).toBeCloseTo(1, 1); expect(g.model.v2! / 60).toBeCloseTo(1, 0);
    expect(g.ci.CL[0]).toBeLessThan(5); expect(g.ci.CL[1]).toBeGreaterThan(5);
  });
  it('in the language', () => {
    const r = run("m = pkModel('CL', 4, 'V', 20, 'Q', 6, 'V2', 40, 'Q3', 1, 'V3', 100, 'Lag', 0.5); n = m.Compartments;\n[t, C] = pkSimulate(pkModel('CL', 5, 'V', 50, 'ka', 1), 500, 'Route', 'oral', 'Hours', 24, 'Step', 0.5);\nE = pkEffect(t, C, 'EC50', 3, 'ke0', 0.4); f = pkFit(t(2:end), C(2:end), 500, 'Route', 'oral'); cl = f.CL; ci = f.CLCI;\npkFit(t(2:end), C(2:end), 500, 'Route', 'oral')\nfigure; pkEffect(t, C, 'EC50', 3, 'ke0', 0.4)");
    expect(r.d('n')[0]).toBe(3);
    expect(r.d('cl')[0]).toBeCloseTo(5, 4);
    expect(r.d('ci').length).toBe(2);
    expect(r.d('E').length).toBe(49);
    expect(r.out).toMatch(/CL = 5/);
    expect(r.graphics.figures.length).toBe(2);
  });
});

