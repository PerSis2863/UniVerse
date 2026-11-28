import { describe, expect, it } from 'vitest';
import * as F from './fusion';
import * as S from './scenario';
import { scenarioTracks } from './scenario-track';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat, type Struct } from './values';
import './machines-lab';

// M575: the Hungarian method, tracking (camera, radar, both), GOSPA, the IMU filters, detection scores.
const spec: S.ScenarioSpec = { dt: 0.1, stop: 10, roads: [], seed: 3, actors: [
  { cls: 'car', position: [0, 0], waypoints: [[0, 0], [400, 0]], speeds: [20] },
  { cls: 'car', position: [30, 0], waypoints: [[30, 0], [400, 0]], speeds: [18] },
  { cls: 'truck', position: [40, -3.6], waypoints: [[40, -3.6], [400, -3.6]], speeds: [19] },
  { cls: 'car', position: [20, 3.6], waypoints: [[20, 3.6], [400, 3.6]], speeds: [21] }],
  sensors: [{ kind: 'vision', mount: [1.9, 0, 1.1], fov: 60 }, { kind: 'radar', mount: [3.7, 0, 0.2], fov: 40 }] };
const tracked = (which: number[]) => { const sp = { ...spec, sensors: which.map((i) => spec.sensors[i]) }; return scenarioTracks(sp, S.runScenario(sp)); };

describe('Hyperion sensor fusion and tracking (M575)', () => {
  it('assigns by the Hungarian method, leaving out what can’t be paired', () => {
    expect(F.hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]])).toEqual([1, 0, 2]);
    expect(F.hungarian([[1, Infinity], [Infinity, Infinity]])).toEqual([0, -1]);
    expect(F.hungarian([[5, 1], [1, 5], [2, 2]])).toEqual([1, 0, -1]);
  });
  it('tracks every car the sensors see, at its speed, and fusion places them best', () => {
    const cam = tracked([0]), rad = tracked([1]), both = tracked([0, 1]);
    // at 8 s all three are in view (by 10 s the car ahead, now close, hides the other two)
    const last = both.steps[80].tracks.filter((x) => x.confirmed);
    expect(last).toHaveLength(3);
    expect(last.map((x) => Math.round(Math.hypot(x.vx, x.vy))).sort((a, b) => a - b)).toEqual([18, 19, 21]);
    const loc = (r: typeof cam) => r.gospa.reduce((s, g) => s + g.loc, 0) / r.gospa.length;
    expect(loc(both)).toBeLessThan(loc(cam)); expect(loc(both)).toBeLessThan(loc(rad));
    for (const r of [cam, rad, both]) expect(r.mean).toBeLessThan(1.2);
  });
  it('GOSPA and OSPA count misses and false tracks', () => {
    expect(F.gospa([[0, 0]], [[0, 0]]).gospa).toBe(0);
    const g = F.gospa([[0, 0], [100, 100]], [[0, 1], [50, 50]], 5, 2);
    expect(g.missed).toBe(1); expect(g.false).toBe(1); expect(g.localization).toBeCloseTo(1);
    expect(g.gospa).toBeCloseTo(Math.sqrt(1 + 25), 6);
    expect(F.ospa([], [[0, 0]], 5)).toBe(5);
  });
  it('the IMU filters follow the orientation, the magnetometer holding the heading', () => {
    const fs = 100, eul = Array.from({ length: 1000 }, (_, k) => { const t = k / fs; return [0.5 * Math.sin(0.5 * t), 0.2 * Math.sin(0.7 * t), 0.3 * Math.sin(0.3 * t)]; });
    const im = F.imuReadings(eul, fs, { bias: [0.002, -0.001, 0.003] }), q0 = F.eulerToQuat(eul[0][0], eul[0][1], eul[0][2]);
    const worst = (Q: F.Quat[], i: number) => Math.max(...Q.slice(200).map((q, k) => Math.abs(Math.atan2(Math.sin(F.quatToEuler(q)[i] - eul[k + 200][i]), Math.cos(F.quatToEuler(q)[i] - eul[k + 200][i]))))) * 180 / Math.PI;
    const six = F.madgwick(im.acc, im.gyr, fs, { q0 }), nine = F.madgwick(im.acc, im.gyr, fs, { mag: im.mag, q0 });
    expect(worst(six, 1)).toBeLessThan(1); expect(worst(six, 2)).toBeLessThan(1);
    expect(worst(nine, 0)).toBeLessThan(1); expect(worst(nine, 0)).toBeLessThan(worst(six, 0));
  });
  it('scores a detector: overlap and average precision', () => {
    expect(F.iou([0, 0, 10, 10], [5, 0, 10, 10])).toBeCloseTo(1 / 3);
    const r = F.averagePrecision([{ img: 1, box: [0, 0, 10, 10], score: 0.9 }, { img: 1, box: [50, 50, 10, 10], score: 0.8 }, { img: 1, box: [20, 0, 10, 10], score: 0.3 }], [{ img: 1, box: [1, 1, 10, 10] }, { img: 1, box: [20, 1, 10, 10] }]);
    expect(r.ap).toBeCloseTo(0.5 + 0.5 * (2 / 3), 6);
  });
  it('in the language', () => {
    const l = new Lab({ out: () => {}, files: new FileStore(), graphics: new Graphics() });
    l.run(`s = drivingScenario('StopTime', 4);
[s, e] = vehicle(s, 'Position', [0 0]); s = trajectory(s, e, [0 0; 300 0], 20);
[s, c] = vehicle(s, 'Position', [30 0]); s = trajectory(s, c, [30 0; 300 0], 18);
s = addSensor(s, 'vision', 'Mount', [1.9 0 1.1]); s = addSensor(s, 'radar', 'Mount', [3.7 0 0.2]);
t = trackScenario(s); trackScenario(s);
[d, loc, missed, fa] = gospa([0 0; 10 0], [0 1], 5);
eul = [linspace(0, 30, 200)' zeros(200, 2)]; [acc, gyr, mag] = imuReadings(eul, 100);
[q, e1] = imufilter(acc, gyr, 100); [q2, e2] = ahrsfilter(acc, gyr, mag, 100);
o = bboxOverlapRatio([0 0 10 10; 0 0 5 5], [5 0 10 10]); ap = evaluateDetectionPrecision([1 0 0 10 10 0.9], [1 1 1 10 10]);`);
    expect(toMat((l.vars.get('t') as Struct).f.get('MeanGOSPA')!).d[0]).toBeLessThan(2);
    expect(toMat(l.vars.get('fa')!).d[0]).toBe(1);
    expect(toMat(l.vars.get('e2')!).d[199]).toBeCloseTo(30, 0); // the yaw after turning 30°
    expect(toMat(l.vars.get('o')!).r).toBe(2);
    expect(toMat(l.vars.get('ap')!).d[0]).toBeCloseTo(1);
  });
});
