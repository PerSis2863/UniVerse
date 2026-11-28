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
    expect(h.maxTemp).toBeLessThan(1500); // a cell that ran away carries no current (M573b)
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
  it('the plate drawn, and the gas and fire after venting (M573b)', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
    lab.run(`c = ecmCell(1); p = packBuild(c, 2, 3, 'Columns', 3, 'Coolant', [], 'Gas', [1 1.5 0.05 0]); p = packFault(p, 2, 'heater', 0, 40);
r = packSimulate(p, zeros(1, 2400), 1, 1); v = r.Vented(1); lf = r.TimeToLFL; L = numel(r.GasVolume);
s = packPlate(p, r); y = s.Y(4); packPlate(p, r, 600); packSimulate(p, zeros(1, 300), 1, 1);
q = packBuild(c, 2, 3, 'Columns', 3, 'Coolant', [], 'Fire', 0.1); q = packFault(q, 2, 'heater', 0, 40); f = packSimulate(q, zeros(1, 2400), 1, 1); w = max(f.HeatRelease); packPlate(q, f, 1500, '3d'); pr = max(f.Pressure(:));
z = packBuild(c, 2, 2, 'Vent', [2 1.5], 'Oxygen', 0.1, 'Gas', [1.5 1.5 0.2 0]);`);
    const g = (k: string) => toMat(lab.vars.get(k)!).d[0];
    expect(g('v')).toBe(2);
    expect(g('lf')).toBeGreaterThan(0);
    expect(g('y')).toBe(2);
    expect(g('w')).toBeGreaterThan(100);
    expect(g('pr')).toBeGreaterThan(5e5);
    expect(() => lab.run("packBuild(c, 2, 2, 'Fire', 2)")).toThrow(/0 \(no fire\) to 0.25/);
  });
});

import { mixLfl, NMC_GAS, plateLayout } from './pack';
describe('the plate and venting (M573b)', () => {
  it('lays cells out in snaking rows with grid neighbours', () => {
    const L = plateLayout(6, 3);
    expect([L.x, L.y]).toEqual([[0, 1, 2, 2, 1, 0], [0, 0, 0, 1, 1, 1]]);
    expect(L.nb[1].sort()).toEqual([0, 2, 4]);
    expect(plateLayout(4).nb[0]).toEqual([1]);
  });
  it("the mix's flammable limit by Le Chatelier", () => {
    const l = mixLfl(NMC_GAS.mix);
    expect(l).toBeGreaterThan(0.04);
    expect(l).toBeLessThan(0.08);
    expect(mixLfl({ H2: 1, CO: 0, CO2: 0, CH4: 0, C2H4: 0 })).toBeCloseTo(0.04, 6);
  });
  it('a vented cell fills a closed box past its LFL; airing or a fire changes that', () => {
    const base = { coolant: null, cols: 2, faults: [{ cell: 0, kind: 'heater' as const, at: 0, value: 40 }] };
    const shut = packSim(packSpec(cell, 2, 2, { ...base, gas: { ...NMC_GAS, volume: 0.05 } }), new Array(2400).fill(0), 1, 1);
    expect(shut.vented[0]).toBe(0);
    expect(shut.gas.at(-1)!).toBeGreaterThan(5);
    expect(shut.timeToLfl).toBeGreaterThan(shut.ventTime[0] - 1);
    const fire = packSim(packSpec(cell, 2, 2, { ...base, gas: { ...NMC_GAS, volume: 1, fire: 0.2 } }), new Array(2400).fill(0), 1, 1);
    expect(Number.isNaN(fire.timeToLfl)).toBe(true);
    expect(Math.max(...fire.hrr)).toBeGreaterThan(100);
    expect(fire.ventTime[1]).toBeLessThan(shut.ventTime[1] ?? Infinity);
  });
});

import { canPressure } from './pack';
describe('inside the can, the jet and the air (M573c)', () => {
  const heat = { coolant: null, cols: 2, faults: [{ cell: 0, kind: 'heater' as const, at: 0, value: 40 }] };
  it("the can's pressure from its gas and the electrolyte's vapour", () => {
    expect(canPressure(NMC_GAS, 0, 363)).toBeCloseTo(101_325, 0);
    expect(canPressure(NMC_GAS, 0, 453)).toBeGreaterThan(canPressure(NMC_GAS, 0, 400));
    expect(canPressure(NMC_GAS, 1e-3, 300) - canPressure(NMC_GAS, 0, 300)).toBeCloseTo((1e-3 * 8.314462618 * 300) / 2e-6, -3);
  });
  it('the pressure builds until the vent bursts, then a choked jet leaves', () => {
    const r = packSim(packSpec(cell, 2, 2, heat), new Array(2400).fill(0), 1, 1);
    const k = r.t.findIndex((t) => t >= r.ventTime[0]);
    expect(Math.max(...r.pressure[0].slice(0, k))).toBeLessThan(1e6 * 1.05);
    expect(Math.max(...r.pressure[0].slice(0, k))).toBeGreaterThan(3e5);
    expect(Math.max(...r.jetSpeed)).toBeGreaterThan(100);
    expect(Math.max(...r.jet[0])).toBeGreaterThan(0.05);
  });
  it('a fire in a small closed case runs out of oxygen and goes out; airing keeps it burning', () => {
    const shut = packSim(packSpec(cell, 2, 2, { ...heat, gas: { ...NMC_GAS, volume: 0.01, fire: 0.1 } }), new Array(2400).fill(0), 1, 1);
    expect(Number.isFinite(shut.fireOut)).toBe(true);
    expect(Math.min(...shut.oxygen)).toBeLessThan(0.12);
    expect(Number.isFinite(shut.timeToLfl)).toBe(true); // the gas gathers once the flames are out
    const big = (ach: number) => packSim(packSpec(cell, 2, 2, { ...heat, gas: { ...NMC_GAS, volume: 0.3, fire: 0.1, ach } }), new Array(2400).fill(0), 1, 1);
    const closed = big(0), aired = big(60);
    expect(Number.isNaN(aired.fireOut)).toBe(true);
    expect(Math.min(...aired.oxygen)).toBeGreaterThan(Math.min(...closed.oxygen));
  });
});
