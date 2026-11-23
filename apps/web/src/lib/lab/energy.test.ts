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
