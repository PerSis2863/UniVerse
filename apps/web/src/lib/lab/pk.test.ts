import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as pk from './pk';
import { rk45 } from './sci-num';

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
