import { describe, expect, it } from 'vitest';
import { ecmSim, sampleEcm, type EcmCell } from './cellfit';
import { coulombCount, socFilter, sohFilter } from './socest';

/** A repeatable drive: pulses of discharge and regeneration, rests, then a charge to 90%, for `hours` (counting the
 * true capacity so the cell never runs flat or overfull). */
function drive(cap: number, hours: number, trueCap = cap, z0 = 0.9) {
  let s = 7, z = z0;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647), I: number[] = [], push = (i: number) => { I.push(i); z -= i / (3600 * trueCap); };
  while (I.length < hours * 3600) {
    for (let k = 0; k < 2400 && z > 0.15; k++) {
      if (k === 1200) for (let j = 0; j < 600; j++) push(0); // parked for ten minutes
      push(k % 300 < 200 ? cap * (0.3 + 2 * rnd()) * (rnd() < 0.15 ? -0.6 : 1) : 0);
    }
    while (z < 0.9) push(-cap * 0.8);
    for (let k = 0; k < 300; k++) push(0);
  }
  return I.slice(0, hours * 3600);
}
const noise = (v: number[], sd: number) => { let s = 3; return v.map((x) => { s = (s * 48271) % 2147483647; const u = s / 2147483647; s = (s * 48271) % 2147483647; const w = s / 2147483647; return x + sd * Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * w); }); };

describe('SOC and SOH estimation (M571)', () => {
  const cell = sampleEcm(2), I = drive(cell.capacity, 3), truth = ecmSim(cell, I, 1, 0.9), v = noise(truth.v, 0.003);
  it('Coulomb counting keeps a wrong start; the filters find the truth', () => {
    const cc = coulombCount(I, 1, cell.capacity, 0.5);
    expect(Math.abs(cc.at(-1)! - truth.soc.at(-1)!)).toBeCloseTo(0.4, 2); // the wrong start stays
    for (const filter of ['ekf', 'ukf'] as const) {
      const r = socFilter(cell, I, v, 1, { filter, soc0: 0.5 });
      const late = r.soc.slice(3600).map((z, k) => Math.abs(z - truth.soc[3600 + k]));
      expect(Math.max(...late)).toBeLessThan(0.03);
      expect(r.spread.at(-1)!).toBeLessThan(0.05);
    }
  });
  it('the adaptive filter follows an aged cell: more resistance, less capacity', () => {
    const aged: EcmCell = { ...cell, capacity: cell.capacity * 0.85, r0: cell.r0.map((r) => r * 1.5) };
    const I8 = drive(cell.capacity, 8, aged.capacity), ta = ecmSim(aged, I8, 1, 0.9), va = noise(ta.v, 0.002);
    const r = sohFilter(cell, I8, va, 1, { soc0: 0.6 });
    expect(r.r0Growth.at(-1)!).toBeGreaterThan(1.4);
    expect(r.r0Growth.at(-1)!).toBeLessThan(1.6);
    expect(r.soh).toBeGreaterThan(0.81);
    expect(r.soh).toBeLessThan(0.89);
    expect(Math.abs(r.soc.at(-1)! - ta.soc.at(-1)!)).toBeLessThan(0.03);
  });
});

import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './battsys-lab';
describe('SOC and SOH in the language (M571)', () => {
  it('counts, filters, reads a rest and estimates health', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`c = ecmCell(1);
I = [2*ones(1, 1800) zeros(1, 1200) 3*ones(1, 1800) zeros(1, 1200) -2*ones(1, 1800) zeros(1, 1200)];
[v, z] = ecmSimulate(c, I, 1, 0.9);
cc = socCoulomb(I, 1, 5, 0.9); d = max(abs(cc - z));
[k, s] = socKalman(c, I, v, 1, 'Filter', 'ukf', 'SOC0', 0.5); e = abs(k(end) - z(end));
r = ocvSOC(c, v(3000)); er = abs(r - z(3000));
h = sohEstimate(c, I, v, 1, 'SOC0', 0.6); soh = h.SOH;
socKalman(c, I, v, 1); sohEstimate(c, I, v, 1);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d[0];
    expect(g('d')).toBeLessThan(1e-9);
    expect(g('e')).toBeLessThan(0.02);
    expect(g('er')).toBeLessThan(0.01);
    expect(g('soh')).toBeGreaterThan(0.95);
    expect(g('soh')).toBeLessThan(1.05);
  });
});
