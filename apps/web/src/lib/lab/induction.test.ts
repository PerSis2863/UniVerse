import { describe, expect, it } from 'vitest';
import { IM4KW, inductionRun, RECT, rectifier3, torqueSpeed } from './induction';

const tail = (x: Float64Array, k = 2000) => x.slice(x.length - k).reduce((s, v) => s + v, 0) / k;
describe('induction motors and the rectifier (M566)', () => {
  it('the torque–speed curve has its peak between standstill and synchronous speed', () => {
    const s = Array.from({ length: 100 }, (_, i) => (i + 1) / 100), T = torqueSpeed(IM4KW, s);
    const k = T.indexOf(Math.max(...T));
    expect(k).toBeGreaterThan(3); expect(k).toBeLessThan(60);
    expect(Math.max(...T)).toBeGreaterThan(40); // a 4 kW machine's breakdown torque, roughly 2–3 times its rated 26 N·m
  });
  it('V/f brings it up to speed; FOC follows a speed step under load; the observer tracks the speed', () => {
    const vf = inductionRun(IM4KW, { mode: 'vf', speed: (t) => Math.min(1, t / 0.5) * 150, load: () => 5, tEnd: 1.2, dt: 2e-5 });
    expect(tail(vf.speed)).toBeGreaterThan(140); expect(tail(vf.speed)).toBeLessThan(151);
    const foc = inductionRun(IM4KW, { mode: 'foc', speed: (t) => (t < 0.3 ? 0 : 100), load: (t) => (t > 0.8 ? 20 : 0), tEnd: 1.2, dt: 2e-5 });
    expect(tail(foc.speed)).toBeCloseTo(100, 0);
    expect(tail(foc.torque)).toBeGreaterThan(19);
    expect(Math.abs(tail(foc.estimate) - tail(foc.speed))).toBeLessThan(5);
  });
  it('sensorless FOC runs on the observer\'s speed', () => {
    const r = inductionRun(IM4KW, { mode: 'sensorless', speed: (t) => (t < 0.2 ? 30 : 100), load: () => 5, tEnd: 1.2, dt: 2e-5 });
    expect(Math.abs(tail(r.speed) - 100)).toBeLessThan(5);
  });
  it('a six-pulse bridge: 6k ± 1 harmonics, no even or triple ones, about 600 V out', () => {
    const r = rectifier3({ ...RECT, Ld: 20e-3, cycles: 60 });
    expect(r.harmonics[4]).toBeGreaterThan(0.1); // the 5th
    expect(r.harmonics[6]).toBeGreaterThan(0.05); // the 7th
    expect(r.harmonics[2]).toBeLessThan(0.02); // the 3rd
    expect(r.harmonics[1]).toBeLessThan(0.02); // the 2nd
    expect(r.thd).toBeGreaterThan(0.2); expect(r.thd).toBeLessThan(0.4);
    expect(r.vmean).toBeGreaterThan(500); expect(r.vmean).toBeLessThan(560);
  });
});
