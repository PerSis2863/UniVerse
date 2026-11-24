import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as rl from './rail';

describe('Hyperion railways (M491)', () => {
  it('a level run: full power, the limit, braking at the service rate into the station', () => {
    const t = rl.TRAINS.metro, r: rl.Route = { name: 't', dwell: 0, stations: [0, 2000], sections: [{ length: 2000, grade: 0, radius: 0, limit: 80 / 3.6 }] };
    const x = rl.railRun(t, r);
    expect(Math.max(...x.v)).toBeCloseTo(80 / 3.6, 1);
    expect(x.v.at(-1)).toBe(0);
    // The last braking stretch: v² = 2·b·d.
    const k = x.s.findIndex((s) => s >= 1900);
    expect(x.v[k] ** 2 / (2 * (2000 - x.s[k]))).toBeCloseTo(t.brake, 1);
    // The time is at least distance over the limit.
    expect(x.time).toBeGreaterThan(2000 / (80 / 3.6));
  });
  it('coasting saves energy for a little time; a climb costs energy; a too-steep hill stalls a heavy train', () => {
    const t = rl.TRAINS.metro, r = rl.ROUTES.metro(), fast = rl.railRun(t, r), eco = rl.railRun(t, r, { coast: 0.1 });
    expect(eco.energyKwh).toBeLessThan(0.85 * fast.energyKwh); expect(eco.time).toBeLessThan(1.15 * fast.time); expect(eco.time).toBeGreaterThan(fast.time);
    expect(fast.arrivals).toHaveLength(r.stations.length - 1);
    const flat: rl.Route = { name: 'f', dwell: 0, stations: [0, 5000], sections: [{ length: 5000, grade: 0, radius: 0, limit: 22 }] }, up = { ...flat, sections: [{ ...flat.sections[0], grade: 15 }] };
    expect(rl.railRun(t, up).energyKwh).toBeGreaterThan(rl.railRun(t, flat).energyKwh);
    const stuck = rl.railRun(rl.TRAINS.freight, rl.ROUTES.mountain());
    expect(Number.isNaN(stuck.stalled)).toBe(false); expect(stuck.time).toBe(Infinity);
    expect(rl.curveRes(400)).toBeCloseTo(650 / 345, 9);
  });
  it('headway: moving block lets trains follow closer than fixed blocks', () => {
    const t = rl.TRAINS.intercity, fixed = rl.headway(t, 200 / 3.6), moving = rl.headway(t, 200 / 3.6, { moving: true });
    expect(moving.headway).toBeLessThan(fixed.headway);
    expect(fixed.brakeDist).toBeCloseTo((200 / 3.6) ** 2 / (2 * t.brake), 6);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("t = trainModel('metro'); r = railRoute('metro'); [x, info] = trainRun(t, r, 'Coast', 0.1); m = info.Minutes; mine = railRoute([1000 0 0 80; 500 10 400 60], [0 1500]); [y, yi] = trainRun(t, mine); [h, n] = railHeadway(trainModel('intercity'), 200, 'Moving', 1); figure; trainRun(trainModel('intercity'), 'intercity'); vmax = t.MaxSpeed;");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('m')[0]).toBeGreaterThan(7); expect(d('vmax')[0]).toBeCloseTo(80, 9); expect(d('n')[0]).toBeGreaterThan(30);
  });
});
