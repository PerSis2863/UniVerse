import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as cp from './car-path';

describe('Hyperion car-style route planning (M483b)', () => {
  it('Dubins: straight ahead is a straight line; a U-turn is half a circle each side of nothing; random poses always join', () => {
    expect(cp.dubins([0, 0, 0], [10, 0, 0], 1)!.length).toBeCloseTo(10, 12);
    // Turning round to come back 2R to the side: exactly half a circle (πR).
    const u = cp.dubins([0, 0, 0], [0, 4, Math.PI], 2)!;
    expect(u.length).toBeCloseTo(2 * Math.PI, 9); expect(u.word.startsWith('L')).toBe(true);
    let seed = 3;
    const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    for (let k = 0; k < 300; k++) {
      const a: cp.Pose = [r() * 20, r() * 20, r() * 6 - 3], b: cp.Pose = [r() * 20, r() * 20, r() * 6 - 3], d = cp.dubins(a, b, 2)!;
      expect(d).not.toBeNull();
      // Never shorter than the straight line, and the end of the drive is the goal (checked inside too).
      expect(d.length).toBeGreaterThanOrEqual(Math.hypot(b[0] - a[0], b[1] - a[1]) - 1e-9);
    }
  });
  it('Hybrid A* backs a car into the empty bay of a car park', { timeout: 30_000 }, () => {
    const g = cp.parkingMap(), clear = cp.clearance(g), goal: cp.Pose = [18.9, 3.2, Math.PI / 2];
    const p = cp.hybridAstar(g, [3, 10, 0], goal);
    expect(p.found).toBe(true);
    expect(p.reverse.some(Boolean)).toBe(true); // it has to reverse in
    expect(p.poses.every((q) => cp.carFree(g, q, cp.CAR, clear))).toBe(true);
    const end = p.poses.at(-1)!;
    expect(Math.hypot(end[0] - goal[0], end[1] - goal[1])).toBeLessThan(0.6);
    // Without reversing (and with no room to turn round in the bay) it may not get in head-first the other way.
    expect(cp.carFree(g, [18.9, 3.2, -Math.PI / 2], cp.CAR, clear)).toBe(false);
  });
  it('in the language', { timeout: 30_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[P, L, w] = dubinsPath([0 0 0], [10 0 0], 2); [map, res] = robotMap('parking'); [Q, info] = hybridAstar(map, [3 10 0], [18.9 3.2 pi/2], 'Resolution', res); f = info.Found; back = any(Q(:, 4) < 0);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('L')[0]).toBeCloseTo(10, 9);
    expect(d('f')).toEqual([1]); expect(d('back')).toEqual([1]);
  });
});
