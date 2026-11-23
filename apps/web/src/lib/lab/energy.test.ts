import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './energy-lab';
import * as en from './energy';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 5;
const gauss = () => { const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32); let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

describe('Hyperion energy (M425)', () => {
  it('a cell: charge counted exactly, the voltage drop I·R0 at once and I·(R0 + R1) once settled', () => {
    const c = en.DEFAULT_CELL, I = new Array(3600).fill(5), r = en.simulateCell(c, I, 1, 1);
    // 5 A for an hour from a 5 Ah cell: empty.
    expect(r.soc[3599]).toBeCloseTo(1 - 3599 / 3600, 6);
    expect(r.v[0]).toBeCloseTo(4.2 - 5 * c.r0, 9);
    // After many RC time constants (20 s) the RC voltage is I·R1.
    expect(r.v[200]).toBeCloseTo(en.ocv(r.soc[200]) - 5 * (c.r0 + c.r1), 3);
    const pk = en.pack(c, 96, 3);
    expect(pk.cell.capacity).toBe(15);
    expect(pk.cell.r0).toBeCloseTo((0.012 * 96) / 3, 12);
  });

  it('the Kalman filter finds the state of charge from a wrong first guess', () => {
    const c = en.DEFAULT_CELL, I = Array.from({ length: 1800 }, (_, k) => (Math.floor(k / 60) % 2 ? 10 : 2)), truth = en.simulateCell(c, I, 1, 0.8);
    const est = en.socEkf(c, I, truth.v.map((v) => v + 0.002 * gauss()), 1, 0.4);
    expect(Math.abs(est[1799] - truth.soc[1799])).toBeLessThan(0.02);
    expect(Math.abs(est[0] - truth.soc[0])).toBeGreaterThan(0.1);
  });

  it('a solar module: short-circuit and open-circuit ends, a sensible fill factor, less power when hot', () => {
    const r = en.pvCurve(en.DEFAULT_MODULE, 1000, 25);
    expect(r.isc).toBeCloseTo(9 * (1 - 0.25 / 300), 2);
    expect(r.voc).toBeCloseTo(37.5, 0);
    const ff = r.pmax / (r.voc * r.isc);
    expect(ff).toBeGreaterThan(0.7);
    expect(ff).toBeLessThan(0.85);
    expect(en.pvCurve(en.DEFAULT_MODULE, 1000, 60).pmax).toBeLessThan(r.pmax * 0.92);
    expect(en.pvCurve(en.DEFAULT_MODULE, 500, 25).isc).toBeCloseTo(r.isc / 2, 1);
  });

  it('a wind turbine: ½ρAC_p v³, held at rated, a year’s energy over Rayleigh winds', () => {
    const t = en.DEFAULT_TURBINE;
    expect(en.windPower(t, 8)).toBeCloseTo(0.5 * 1.225 * Math.PI * 50 ** 2 * 0.45 * 512, 6);
    expect(en.windPower(t, 15)).toBe(2.5e6);
    expect(en.windPower(t, 26)).toBe(0);
    const y = en.windYear(t, 2, 8);
    // A Rayleigh wind's mean is c·√π/2.
    expect(y.meanWind).toBeCloseTo((8 * Math.sqrt(Math.PI)) / 2, 6);
    expect(y.capacityFactor).toBeGreaterThan(0.3);
    expect(y.capacityFactor).toBeLessThan(0.6);
    expect(y.aepMWh).toBeCloseTo(y.capacityFactor * 2.5 * 8760, 6);
  });

  it('in the language', () => {
    const r = run("c = batteryCell('Capacity', 3);\np = batteryPack(c, 96, 2);\nI = 6*ones(1, 600);\n[v, z] = batterySimulate(p, I, 1, 0.9);\nest = socEstimate(p, I, v, 1, 0.5);\nm = pvCurve(pvModule) ; [V, Ip, P, mpp] = pvCurve(pvModule, 800, 40);\nw = windTurbine('Diameter', 120, 'RatedPower', 3e6);\n[e, cf] = windAEP(w, 2, 7.5);\npw = windPower(w, [2 10 30]);\nbatterySimulate(c, I, 1)");
    expect(r.d('v')[0]).toBeCloseTo(96 * (en.ocv(0.9) - 3 * 0.012), 6);
    expect(Math.abs(r.d('est').at(-1)! - r.d('z').at(-1)!)).toBeLessThan(0.03);
    expect(r.d('pw')[0]).toBe(0);
    expect(r.d('pw')[2]).toBe(0);
    expect(r.d('cf')[0]).toBeGreaterThan(0.2);
    expect(r.graphics.figures.length).toBe(1);
    expect(() => run("windTurbine('Cp', 0.7)")).toThrow(/Betz/);
  });
});

describe('battery ageing and temperature (M433)', () => {
  it('cold raises the resistance (about twice at 0 °C), the cell warms to I²R/hA above the air', async () => {
    const bt = await import('./battery'), en = await import('./energy');
    const c0 = bt.cellAt(en.DEFAULT_CELL, 0), c25 = bt.cellAt(en.DEFAULT_CELL, 25);
    expect(c25.r0).toBeCloseTo(en.DEFAULT_CELL.r0, 12);
    expect(c0.r0 / c25.r0).toBeGreaterThan(1.9); expect(c0.r0 / c25.r0).toBeLessThan(2.1);
    expect(c0.capacity).toBeCloseTo(en.DEFAULT_CELL.capacity * 0.9, 9);
    // A steady 10 A for 3 hours (a full cell keeps going: the voltage isn't checked): the steady rise ≈ heat / hA.
    const r = bt.simulateThermal(en.DEFAULT_CELL, new Array(10800).fill(10), 1, 1, 25, 25);
    const heat = r.heat[r.heat.length - 1], rise = r.temp[r.temp.length - 1] - 25;
    expect(rise).toBeCloseTo(heat / bt.DEFAULT_THERMAL.hA, 0);
    expect(rise).toBeGreaterThan(20);
  });
  it('wear: Wang et al.’s cycling model, square-root calendar fade, warmer wears faster', async () => {
    const bt = await import('./battery'), en = await import('./energy');
    // By hand: 31630·exp(−(31700 − 185.15)/(R·298.15))·(1000·1·2.2)^0.55 = 6.6% after 1000 full cycles at C/2, 25 °C.
    expect(bt.cycleLoss(1000, 1, 0.5, 25)).toBeCloseTo(0.0656, 3);
    expect(bt.calendarLoss(1, 25, 0.5)).toBeCloseTo(0.0015 * Math.sqrt(365), 9);
    expect(bt.calendarLoss(4, 25) / bt.calendarLoss(1, 25)).toBeCloseTo(2, 9);
    expect(bt.cycleLoss(1000, 1, 1, 45)).toBeGreaterThan(2 * bt.cycleLoss(1000, 1, 1, 25));
    const aged = bt.ageCell(en.DEFAULT_CELL, { ...bt.DEFAULT_USE, cycles: 1500, years: 3 });
    expect(aged.soh).toBeCloseTo(1 - aged.cycleLoss - aged.calendarLoss, 12);
    expect(aged.cell.capacity).toBeCloseTo(en.DEFAULT_CELL.capacity * aged.soh, 12);
    const n = bt.cycleLife(en.DEFAULT_CELL, { dod: 0.8, cRate: 1, tempC: 25, storageSoc: 0.5 });
    expect(bt.ageCell(en.DEFAULT_CELL, { ...bt.DEFAULT_USE, cycles: n, years: n / 365 }).soh).toBeCloseTo(0.8, 6);
    expect(bt.cycleLife(en.DEFAULT_CELL, { dod: 0.8, cRate: 1, tempC: 40, storageSoc: 0.5 })).toBeLessThan(n);
  });
  it('in the language', () => {
    const r = run("c = batteryCell;\n[v, soc, T] = batterySimulate(c, 20*ones(1, 600), 1, 1, 'Ambient', 25);\nrise = T(end) - T(1);\n[v0] = batterySimulate(c, 20*ones(1, 10), 1, 1, 'Ambient', -10);\ncold = v0(1) < v(1);\na = batteryAge(c, 'Cycles', 1000, 'DoD', 1, 'CRate', 0.5, 'Temperature', 25);\nsoh = a.SOH; cap = a.Cell.Capacity;\n[n, yrs] = batteryLife(c, 'DoD', 0.8, 'CRate', 1);\nbatteryLife(c)\nfigure; batterySimulate(c, 20*ones(1, 300), 1, 1, 'Ambient', 0)");
    expect(r.d('rise')[0]).toBeGreaterThan(1);
    expect(r.d('cold')).toEqual([1]);
    expect(r.d('soh')[0]).toBeCloseTo(1 - 0.0656, 3);
    expect(r.d('cap')[0]).toBeCloseTo(5 * r.d('soh')[0], 9);
    expect(r.d('n')[0]).toBeGreaterThan(500); expect(r.d('yrs')[0]).toBeCloseTo(r.d('n')[0] / 365, 9);
    expect(r.graphics.figures.length).toBe(2);
    expect(() => run("batteryAge(batteryCell, 'DoD', 2)")).toThrow(/shares/);
  });
});
