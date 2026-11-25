import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ag from './agri';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion agriculture and energy production (M505)', () => {
  it('FAO-56 example 18 (Brussels, 6 July): ET0 3.9 mm/day', () => {
    // Tmax 21.5, Tmin 12.3, RHmax 84, RHmin 63, wind 2.078 m/s at 2 m, 9.25 h of sun, 50°48′N, 100 m.
    const r = ag.et0({ tmin: 12.3, tmax: 21.5, rhmin: 63, rhmax: 84, wind: 2.078, sunshine: 9.25, elev: 100, lat: 50.8, doy: 187 });
    expect(r.ra).toBeCloseTo(41.09, 1);
    expect(r.rs).toBeCloseTo(22.07, 1);
    expect(r.ea).toBeCloseTo(1.409, 2);
    expect(r.rn).toBeCloseTo(13.28, 1);
    expect(r.et0).toBeCloseTo(3.9, 1);
    expect(ag.extraterrestrial(50.8, 187).daylight).toBeCloseTo(16.1, 1);
  });
  it('the crop coefficient and the water balance', () => {
    const kc = ag.kcCurve([0.3, 1.15, 0.4], [20, 30, 40, 20]);
    expect(kc.length).toBe(110); expect(kc[0]).toBe(0.3); expect(kc[60]).toBe(1.15); expect(kc[109]).toBeCloseTo(0.4, 12);
    // No rain, 5 mm a day at Kc 1: irrigate the day depletion passes RAW = 60 mm, i.e. after 13 days.
    const w = ag.waterBalance(new Array(30).fill(5), new Array(30).fill(0), [1], 120, 0.5, true);
    expect(w.irrigation.findIndex((v) => v > 0)).toBe(12);
    expect(w.irrigation[12]).toBeCloseTo(65, 9);
    // Without irrigation the crop is stressed (Ks < 1) and water use falls.
    const dry = ag.waterBalance(new Array(60).fill(5), new Array(60).fill(0), [1], 120, 0.5, false);
    expect(dry.ks[40]).toBeLessThan(0.5); expect(Math.max(...dry.depletion)).toBeLessThanOrEqual(120);
    // Heavy rain on a full profile drains.
    expect(ag.waterBalance([2], [50], [1], 100).drainage[0]).toBe(48);
  });
  it('crop growth: warmer is faster, stress cuts the yield', () => {
    const n = 150, rs = new Array(n).fill(20);
    const warm = ag.cropGrowth(new Array(n).fill(18), new Array(n).fill(30), rs), cool = ag.cropGrowth(new Array(n).fill(12), new Array(n).fill(22), rs);
    expect(warm.maturityDay).toBeGreaterThan(0);
    expect(warm.maturityDay).toBeLessThan(cool.maturityDay < 0 ? Infinity : cool.maturityDay);
    const stressed = ag.cropGrowth(new Array(n).fill(18), new Array(n).fill(30), rs, { ks: new Array(n).fill(0.6) });
    expect(stressed.yield / warm.yield).toBeCloseTo(0.6, 9);
    expect(warm.yield).toBeGreaterThan(5); expect(warm.yield).toBeLessThan(25);
  });
  it('economic dispatch: Wood and Wollenberg example 3A; LCOE', () => {
    const r = ag.dispatch([7.92, 7.85, 7.97], [0.001562, 0.00194, 0.00482], [150, 100, 50], [600, 400, 200], 850)!;
    expect(r.lambda).toBeCloseTo(9.148, 3);
    expect(r.p[0]).toBeCloseTo(393.2, 1); expect(r.p[1]).toBeCloseTo(334.6, 1); expect(r.p[2]).toBeCloseTo(122.2, 1);
    expect(r.p.reduce((s, v) => s + v, 0)).toBeCloseTo(850, 6);
    expect(ag.dispatch([1], [1], [0], [10], 20)).toBeNull();
    // No discounting, no running cost: LCOE = capex / lifetime energy.
    expect(ag.lcoe(1000, 0, 100, 0, 10)).toBeCloseTo(1, 12);
    expect(ag.lcoe(1000, 0, 100, 0.07, 10)).toBeGreaterThan(1);
  });
  it('in the language', () => {
    const r = run("e = et0PM(12.3, 21.5, [63 84], 2.078, NaN, 100, 50.8, 187, 'Sunshine', 9.25); kc = kcCurve([0.3 1.15 0.4], [20 30 40 20]);\nw = soilWaterBalance(5*ones(1, 30), zeros(1, 30), 1); n = w.Events;\n[P, lam] = economicDispatch([7.92 7.85 7.97], [0.001562 0.00194 0.00482], [150 100 50], [600 400 200], 850);\nc = lcoe(1000, 0, 100, 0, 10);\nsoilWaterBalance(5*ones(1, 60), [zeros(1, 20) 30 zeros(1, 39)], kc(1:60), 'TAW', 120)\nfigure; cropGrowth(18*ones(1, 150), 30*ones(1, 150), 20*ones(1, 150))");
    expect(r.d('e')[0]).toBeCloseTo(3.9, 1);
    expect(r.d('kc').length).toBe(110);
    expect(r.d('n')[0]).toBe(2);
    expect(r.d('lam')[0]).toBeCloseTo(9.148, 3);
    expect(r.d('c')[0]).toBeCloseTo(1, 12);
    expect(r.graphics.figures.length).toBe(2);
  });
});
