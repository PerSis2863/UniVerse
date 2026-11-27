import { describe, expect, it } from 'vitest';
import * as cl from './dc-cool';
import { Lab } from './interp';
import { Graphics } from './plot';
import './sciences';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(code); return out; };
const base = { it: 10000, chip: 1000, fws: 32, tower: 4, cycles: 4 };

describe('data-centre cooling (M574)', () => {
  it("Stull's wet bulb", () => {
    expect(cl.wetBulb(20, 50)).toBeCloseTo(13.7, 0);
    expect(cl.wetBulb(30, 99)).toBeCloseTo(30, 0);
  });
  it('air cannot cool 130 kW racks; liquid and two-phase can, and use less power', () => {
    const air = cl.cooling('air', { ...base, rack: 130, dry: 25, wet: 18 }), liq = cl.cooling('liquid', { ...base, rack: 130, dry: 25, wet: 18 }), two = cl.cooling('twophase', { ...base, rack: 130, dry: 25, wet: 18 });
    expect(air.feasible).toBe(false); expect(liq.feasible).toBe(true); expect(two.feasible).toBe(true);
    expect(liq.ppue).toBeLessThan(air.ppue); expect(two.chipMax).toBeLessThan(liq.chipMax);
    expect(liq.chiller).toBe(0);                     // warm water: the tower is enough at an 18 °C wet bulb
    expect(air.chiller).toBeGreaterThan(0);          // 14 °C chilled water needs the chiller
    expect(liq.wue).toBeGreaterThan(1); expect(liq.wue).toBeLessThan(3);   // litres per kWh: typical evaporative
  });
  it('the comparison over hours counts chiller hours', () => {
    const r = cl.compare({ ...base, rack: 40 }, [5, 33], [2, 29]);
    expect(r.map((x) => x.chillerHours)).toEqual([1, 1, 1]);
  });
  it('a chiller is best at part load and in cool condenser water', () => {
    const full = cl.chiller(1000, 6, 1, 30), half = cl.chiller(1000, 6, 0.5, 30), cool = cl.chiller(1000, 6, 1, 20);
    expect(full.cop).toBeCloseTo(6, 9); expect(half.cop).toBeGreaterThan(full.cop); expect(cool.cop).toBeGreaterThan(full.cop);
  });
  it('affinity laws: variable speed saves most at low flow', () => {
    expect(cl.pumpPower(0.5, 1, 10, 'constant')).toBe(10);
    expect(cl.pumpPower(0.5, 1, 10, 'dpreset', 0)).toBeCloseTo(1.25, 9);   // cube law
    expect(cl.pumpPower(0.5, 1, 10, 'variable')).toBeGreaterThan(cl.pumpPower(0.5, 1, 10, 'dpreset'));
  });
  const t = Array.from({ length: 121 }, (_, i) => i * 30), loop = (o: Partial<cl.Loop>) => cl.loop(t, { it: t.map((x) => (x < 600 ? 80e3 : 130e3)), fws: t.map(() => 30), R0: 2.5e-4, C: 5e4, M: 200, UA: 2e4, mmax: 4.5, set: 42, kp: 0.1, ki: 0.01, pumps: 2, spare: 1, failAt: Infinity, fouling: 0, pfull: 1500, nmin: 0.25, fixed: false, tmax: 85, ...o });
  it('the PI speeds the pump up when the load rises and holds the coolant at its set point', () => {
    const r = loop({});
    expect(r.speed[120]).toBeGreaterThan(r.speed[10]);
    expect(r.Tl[120]).toBeCloseTo(42, 0);
    expect(r.Tc[120] - r.Tl[120]).toBeGreaterThan(20);
    expect(r.removed[120] / 130e3).toBeCloseTo(1, 1);
  });
  it('a pump failing without a spare overheats the chips; with a spare nothing happens; fouling warms the coolant', () => {
    const ok = loop({ failAt: 1200 }), bad = loop({ failAt: 1200, spare: 0 }), dirty = loop({ fouling: 0.6, fixed: true }), cleanFixed = loop({ fixed: true });
    expect(ok.peak).toBeCloseTo(loop({}).peak, 6);
    expect(bad.peak).toBeGreaterThan(ok.peak + 5);
    expect(dirty.Tl[120]).toBeGreaterThan(cleanFixed.Tl[120] + 2);
  });
  it('UA from temperatures and the fouling trend', () => {
    // counterflow with equal capacities: LMTD = the constant difference
    expect(cl.hxUA(45, 35, 30, 40, 2)).toBeCloseTo((2 * 4180 * 10) / 5, 6);
    const days = [0, 30, 60, 90, 120], ua = days.map((d) => 1 / (1 / 2e4 + 1e-7 * d));
    const f = cl.foulingTrend(days, ua, 0.8);
    expect(f.ua0).toBeCloseTo(2e4, 3);
    expect(f.cleanAt).toBeCloseTo((1 / (0.8 * 2e4) - 1 / 2e4) / 1e-7, 3);
  });
  it('speaks the language', () => {
    const out = run(`c = coolingCompare(5000, 120, 'Dry', [10 25 35]); r = coolingLoop(0:10:1800, 130e3, 'FailAt', 900, 'Pumps', [2 0]);
[P, cop] = chillerPower(1000, 6, [0.5 1], 30); f = foulingTrend(0:30:120, [2e4 1.9e4 1.8e4 1.72e4 1.65e4]);
fprintf('%d %d %.1f %d %.0f\\n', c.Feasible(1), c.Feasible(2), r.Peak, cop(1) > cop(2), f.CleanAt)`);
    const [fa, fl, peak, better, when] = out.trim().split(' ').map(Number);
    expect([fa, fl, better]).toEqual([0, 1, 1]); expect(peak).toBeGreaterThan(70); expect(when).toBeGreaterThan(120);
  });
});
