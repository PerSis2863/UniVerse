import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as dr from './driving';
import { CAR_DEFAULT as car } from './vehicle';

describe('Hyperion automated driving (M487)', () => {
  it('roads are built from their curvature: a quarter circle ends where it should', () => {
    const r = dr.roadFrom(() => 1 / 50, (Math.PI / 2) * 50, 'arc');
    expect(r.x.at(-1)!).toBeCloseTo(50, 0); expect(r.y.at(-1)!).toBeCloseTo(50, 0); expect(r.h.at(-1)!).toBeCloseTo(Math.PI / 2, 1);
    const w = dr.locate(r, 0, 1, 0.1);
    expect(w.e).toBeCloseTo(1, 6); expect(w.he).toBeCloseTo(0.1, 6);
  });
  it('the LQR gains are positive and steady; each keeper brings an offset car back to the centre', () => {
    const K = dr.lqrGains(car, 25);
    expect(K.every((k) => k > 0)).toBe(true);
    for (const k of ['stanley', 'purepursuit', 'lqr'] as const) {
      const run = dr.laneKeep(car, dr.ROADS.straight(), k, 25, { e0: 0.8 });
      expect(Math.abs(run.e.at(-1)!)).toBeLessThan(0.02);
    }
  });
  it('on bends the curvature fed forward keeps LQR closest to the centre', () => {
    const r = dr.ROADS.scurve(), err = (k: dr.Keeper) => dr.laneKeep(car, r, k, 25).maxE;
    expect(err('lqr')).toBeLessThan(0.2);
    expect(err('lqr')).toBeLessThan(err('stanley'));
    expect(err('lqr')).toBeLessThan(err('purepursuit'));
    expect(dr.laneKeep(car, r, 'lqr', 25).left).toBe(false);
  });
  it('adaptive cruise keeps its time gap; emergency braking saves a driver who does nothing', () => {
    const f = dr.followSim(car, () => 20, 60, { set: 30, gap0: 80, timeGap: 1.8 });
    expect(f.vx.at(-1)!).toBeCloseTo(20, 0); expect(f.gap.at(-1)!).toBeCloseTo(5 + 1.8 * 20, 0);
    const stop = (t: number) => (t < 5 ? 20 : Math.max(0, 20 - 8 * (t - 5)));
    expect(dr.followSim(car, stop, 15, { set: 25, gap0: 40, v0: 25, acc: false, aeb: false }).crashed).toBe(true);
    const saved = dr.followSim(car, stop, 15, { set: 25, gap0: 40, v0: 25, acc: false });
    expect(saved.crashed).toBe(false); expect(saved.aeb.some(Boolean)).toBe(true);
    // With ACC on, it slows early enough that the emergency brake isn't needed.
    const calm = dr.followSim(car, (t) => (t < 10 ? 25 : t < 14 ? 25 - 5 * (t - 10) : 5), 30, { set: 30, gap0: 80 });
    expect(calm.crashed).toBe(false); expect(calm.aeb.some(Boolean)).toBe(false);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("c = vehicle(); r = roadPath('scurve'); [run, info] = laneKeep(c, r, 'Controller', 'lqr', 'Speed', 25); e = info.MaxError; K = lqrLateral(c, 25); q = roadPath(@(s) 0.01, 100); [f, fi] = accFollow(c, 20, 60, 'Gap', 80); g = f.Gap(end); figure; laneKeep(c, 'lanechange', 'Controller', 'stanley'); figure; accFollow(c, @(t) 25 - 15*(t > 10), 30);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('e')[0]).toBeLessThan(0.2); expect(d('K')).toHaveLength(4); expect(d('g')[0]).toBeCloseTo(41, 0);
  });
});
