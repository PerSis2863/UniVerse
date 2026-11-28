import { describe, expect, it } from 'vitest';
import * as S from './scenario';
import * as P from './pointcloud';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat, type Struct } from './values';
import './machines-lab';

// M574: point clouds from the scenario's lidar: the ground, the objects and their boxes, ICP, odometry and a map.
const parked: S.ActorSpec[] = [];
for (let x = 10; x < 160; x += 13) { parked.push({ cls: 'car', position: [x, 6], yaw: 0.1 * (x % 3) }); parked.push({ cls: 'truck', position: [x + 6, -7] }); }
const spec: S.ScenarioSpec = { dt: 0.1, stop: 3, roads: [], seed: 4, actors: [{ cls: 'car', position: [0, 0], waypoints: [[0, 0], [200, 0]], speeds: [10] }, ...parked], sensors: [{ kind: 'lidar', channels: 16, azRes: 0.4, noise: 0.02 }] };
const run = S.runScenario(spec, { cloudEvery: 5 });

describe('Hyperion point clouds (M574)', () => {
  it('finds the ground, the objects, and boxes that match the actors', () => {
    const down = P.voxelDown(run.clouds[0].pts as P.P3[], 0.2), g = P.ransacPlane(down, 0.15, { ref: [0, 0, 1], maxAngle: 10 });
    expect(g.normal[2]).toBeCloseTo(1, 3); expect(Math.abs(g.d)).toBeLessThan(0.02);
    const obj = g.outliers.map((i) => down[i]), c = P.cluster(obj, 0.8, 10);
    expect(c.count).toBeGreaterThanOrEqual(2);
    const boxes = [1, 2].map((k) => P.fitCuboid(obj.filter((_, i) => c.labels[i] === k)));
    const truck = boxes.find((b) => b[3] > 6)!, car = boxes.find((b) => b[3] < 6)!;
    expect(truck[0]).toBeCloseTo(16, 0); expect(truck[1]).toBeCloseTo(-7, 0); expect(truck[3]).toBeCloseTo(8.2, 0); expect(Math.abs(truck[6])).toBeLessThan(2);
    expect(car[0]).toBeCloseTo(10, 0); expect(car[4]).toBeCloseTo(1.8, 0); expect(car[6]).toBeCloseTo(5.7, -1);
  });
  it('ICP recovers a known turn and shift', () => {
    const fixed = P.voxelDown(run.clouds[0].pts as P.P3[], 0.3).filter((p) => p[2] > 0.2), a = 0.05;
    const T0: P.Rigid = { R: [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]], t: [0.8, -0.4, 0.05] };
    const inv: P.Rigid = { R: [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]], t: [0, 0, 0] };
    inv.t = P.apply({ R: inv.R, t: [0, 0, 0] }, T0.t).map((v) => -v) as P.P3;
    const moving = fixed.map((p) => P.apply(inv, p)), r = P.icp(moving, fixed, { inlierDist: 2, iterations: 60 });
    expect(r.T.t[0]).toBeCloseTo(0.8, 2); expect(r.T.t[1]).toBeCloseTo(-0.4, 2); expect(Math.atan2(r.T.R[1][0], r.T.R[0][0])).toBeCloseTo(a, 3);
  });
  it('lidar odometry follows the ego car to within 2% and builds a map', () => {
    const m = P.lidarMap(run.clouds.map((x) => x.pts as P.P3[]));
    const last = m.poses[m.poses.length - 1].t[0], truth = run.clouds[run.clouds.length - 1].t * 10;
    expect(Math.abs(last - truth) / truth).toBeLessThan(0.02);
    expect(m.map.length).toBeGreaterThan(500);
  });
  it('in the language, from a scenario’s lidar', () => {
    const l = new Lab({ out: () => {}, files: new FileStore(), graphics: new Graphics() });
    l.run(`s = drivingScenario('StopTime', 1.5);
[s, e] = vehicle(s, 'Position', [0 0]); s = trajectory(s, e, [0 0; 100 0], 10);
[s, c] = vehicle(s, 'Position', [15 4]); [s, t] = vehicle(s, 'Class', 'truck', 'Position', [25 -5]);
s = addSensor(s, 'lidar', 'Channels', 16, 'AzimuthResolution', 0.4);
r = runScenario(s, 'CloudEvery', 5);
pc = pointCloud(r.PointClouds{1}.Points); pc = pcdownsample(pc, 'gridAverage', 0.2);
[g, onGround, objects] = pcfitplane(pc, 0.15, [0 0 1], 10);
obj = pointCloud(pc.Location(objects, :)); [labels, n] = pcsegdist(obj, 0.8, 'NumClusterPoints', [10 Inf]);
box = pcfitcuboid(pointCloud(obj.Location(labels == 1, :)));
[map, poses] = pcmapbuild(r.PointClouds); pcshow(map);
[T, moved, err] = pcregistericp(obj, obj);`);
    expect(toMat(l.vars.get('n')!).d[0]).toBeGreaterThanOrEqual(2);
    expect(toMat(l.vars.get('box')!).d.length).toBe(7);
    expect(toMat((l.vars.get('T') as Struct).f.get('A')!).d[0]).toBeCloseTo(1, 6);
    expect(toMat(l.vars.get('poses')!).r).toBe(4);
  });
});
