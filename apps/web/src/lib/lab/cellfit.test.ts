import { describe, expect, it } from 'vitest';
import { ecmSim, hppcFit, hppcProfile, lookup, rcFit, sampleEcm } from './cellfit';

describe('cell characterisation by HPPC (M570)', () => {
  it('finds two RC pairs from the voltage they leave', () => {
    const t = Array.from({ length: 900 }, (_, k) => k), I = t.map((x) => (x < 300 ? 5 : 0));
    const lag = (tau: number) => { let v = 0; return t.map((_, k) => { const out = v; v = Math.exp(-1 / tau) * v + (1 - Math.exp(-1 / tau)) * I[k]; return out; }); };
    const a = lag(8), b = lag(150), y = t.map((_, k) => 0.004 * a[k] + 0.009 * b[k]);
    const f = rcFit(t, I, y, 2);
    expect(f.tau[0]).toBeCloseTo(8, 1);
    expect(f.tau[1]).toBeCloseTo(150, 0);
    expect(f.r[1]).toBeCloseTo(0.009, 5);
  });
  it('reads a simulated cell back from its HPPC test', () => {
    const truth = sampleEcm(2), I = hppcProfile(truth.capacity, { longRest: 1800 }), t = I.map((_, k) => k);
    const v = ecmSim(truth, I, 1).v;
    const fit = hppcFit(t, I, v, truth.capacity, 2);
    expect(fit.pulses).toBe(10);
    for (const z of [0.3, 0.6, 0.9]) {
      expect(lookup(fit.cell.soc, fit.cell.ocv, z)).toBeCloseTo(lookup(truth.soc, truth.ocv, z), 1);
      expect(lookup(fit.cell.soc, fit.cell.r0, z) / lookup(truth.soc, truth.r0, z)).toBeGreaterThan(0.9);
      expect(lookup(fit.cell.soc, fit.cell.r0, z) / lookup(truth.soc, truth.r0, z)).toBeLessThan(1.1);
    }
    // The fitted cell redoes the test within 10 mV.
    const again = ecmSim(fit.cell, I, 1).v, err = Math.sqrt(again.reduce((s, x, k) => s + (x - v[k]) ** 2, 0) / v.length);
    expect(err).toBeLessThan(0.01);
  });
});

import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './battsys-lab';
export const newLab = () => new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
describe('cell characterisation in the language (M570)', () => {
  it('a test, a simulation, a fit, and the plots', () => {
    const lab = newLab();
    lab.run(`c = ecmCell(2);
[t, I] = hppcTest(c.Capacity, 'LongRest', 1800);
[v, soc] = ecmSimulate(c, I, 1, 1);
f = hppcFit(t, I, v, c.Capacity, 2); n = f.Pulses; e = f.FitRMS; sz = size(f.R);
hppcFit(t, I, v, c.Capacity, 1);
mine = ecmCell('Capacity', 3, 'SOC', [0 1], 'OCV', [3 4.2], 'R0', [0.02 0.01], 'R', [0.01 0.01], 'Tau', [30 30]);
[v2, z2] = ecmSimulate(mine, 3 * ones(1, 3600), 1); z = z2(end);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d;
    expect(g('n')[0]).toBe(10);
    expect(g('e')[0]).toBeLessThan(0.005);
    expect([...g('sz')]).toEqual([2, 11]);
    expect(g('z')[0]).toBeCloseTo(1 - 3599 / 3600, 3);
    expect(() => lab.run("ecmCell('SOC', [1 0])")).toThrow(/must rise|don't match/);
  });
});
