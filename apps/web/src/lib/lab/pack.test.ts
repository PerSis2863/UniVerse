import { describe, expect, it } from 'vitest';
import { sampleEcm } from './cellfit';
import { arcTest, packAge, packSim, packSpec } from './pack';

const cell = sampleEcm(2);
describe('battery packs (M573)', () => {
  it('parallel cells share the current by their resistance; the series voltages add', () => {
    const sp = packSpec(cell, 3, 2, { spread: { capacity: 0, r0: 0.3, soc: 0 }, seed: 5 });
    const r = packSim(sp, new Array(600).fill(10), 1, 0.8);
    const i0 = r.cellI[0][1], i1 = r.cellI[1][1];
    expect(i0 + i1).toBeCloseTo(10, 6);
    expect(Math.sign(i0 - i1)).toBe(Math.sign(r.r0[1] - r.r0[0]));
    expect(r.v[1]).toBeCloseTo(r.cellV[0][1] + r.cellV[2][1] + r.cellV[4][1], 6);
  });
  it('the coolant warms along the plate, so the far cells run warmer', () => {
    const sp = packSpec(cell, 8, 1, { spread: { capacity: 0, r0: 0, soc: 0 }, coolant: { inlet: 25, flow: 0.002, cp: 3400 } });
    const r = packSim(sp, new Array(1800).fill(15), 1, 0.9);
    expect(r.temp[7].at(-1)!).toBeGreaterThan(r.temp[0].at(-1)! + 0.05);
    expect(r.coolantOut.at(-1)!).toBeGreaterThan(25);
  });
  it('an internal short discharges and heats its cell; a heater sets off runaway that spreads', () => {
    const sp = packSpec(cell, 4, 1, { spread: { capacity: 0, r0: 0, soc: 0 }, faults: [{ cell: 1, kind: 'short', at: 60, value: 0.5 }] });
    const r = packSim(sp, new Array(1200).fill(0), 1, 0.8);
    expect(r.soc[1].at(-1)!).toBeLessThan(r.soc[0].at(-1)! - 0.01);
    expect(r.temp[1].at(-1)!).toBeGreaterThan(r.temp[0].at(-1)! + 1);
    const hot = packSpec(cell, 4, 1, { coolant: null, faults: [{ cell: 1, kind: 'heater', at: 0, value: 40 }] });
    const h = packSim(hot, new Array(3600).fill(0), 1, 1);
    expect(h.runaway).toContain(1);
    expect(h.runaway.length).toBeGreaterThan(1);
    expect(h.maxTemp).toBeGreaterThan(500);
  });
  it("an ARC test finds the onset near 150 °C and the runaway's peak", () => {
    const a = arcTest();
    expect(a.onset).toBeGreaterThan(120);
    expect(a.onset).toBeLessThan(175);
    expect(a.maxTemp).toBeGreaterThan(700);
    expect(a.peakRate).toBeGreaterThan(1);
  });
  it('warmer cells age faster; the weakest group sets the pack', () => {
    const sp = packSpec(cell, 6, 2, { coolant: { inlet: 25, flow: 0.001, cp: 3400 } });
    const I = [...new Array(1800).fill(10), ...new Array(1800).fill(-8)], r = packSim(sp, I, 1, 0.9), a = packAge(sp, r, 1000);
    expect(a.soh.every((h) => h > 0.5 && h < 1)).toBe(true);
    expect(a.packCapacity).toBe(Math.min(...a.groupCapacity));
    expect(a.soh[11]).toBeLessThan(a.soh[0]);
  });
});

import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './battsys-lab';
describe('packs in the language (M573)', () => {
  it('builds, faults, runs, ages and an ARC test', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`c = ecmCell(1); p = packBuild(c, 4, 2, 'Coolant', [25 0.005]); p = packFault(p, 3, 'short', 10, 0.3);
r = packSimulate(p, 8*ones(1, 900), 1, 0.9); n = size(r.Temperature, 1); hot = r.MaxTemperature;
g = packAging(p, r, 500); w = g.WeakestGroup;
packSimulate(p, 8*ones(1, 300), 1, 0.9);
a = arcTest(); on = a.Onset;`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d[0];
    expect(g('n')).toBe(8);
    expect(g('hot')).toBeGreaterThan(25);
    expect(g('w')).toBe(2);
    expect(g('on')).toBeGreaterThan(120);
    expect(() => lab.run("packFault(p, 99, 'short', 0, 1)")).toThrow(/cell 1 to 8/);
  });
});
