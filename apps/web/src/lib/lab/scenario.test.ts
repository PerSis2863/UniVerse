import { describe, expect, it } from 'vitest';
import * as S from './scenario';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat, type Struct, type Cell } from './values';
import './machines-lab';

// M573: driving scenarios: motion, what each sensor sees (and doesn't), lanes, collisions, OpenDRIVE both ways.
const road: S.RoadSpec = { centers: [[0, 0], [60, 0], [120, 20], [180, 60]], lanes: 2, laneWidth: 3.6 };
const ahead = (x: number, v: number): S.ActorSpec => ({ cls: 'car', position: [x, -1.8], waypoints: [[x, -1.8], [x + 200, -1.8]], speeds: [v] });

describe('Hyperion driving scenarios (M573)', () => {
  it('moves actors at their speeds and finds collisions', () => {
    const r = S.runScenario({ dt: 0.1, stop: 4, roads: [], actors: [ahead(0, 15), ahead(30, 5)], sensors: [] });
    expect(r.poses[0][10].x).toBeCloseTo(15, 1); expect(r.poses[1][10].x).toBeCloseTo(35, 1);
    // the gap of 30 − 4.7 m closes at 10 m/s: contact after about 2.53 s
    expect(r.collisions).toHaveLength(1); expect(r.collisions[0].t).toBeCloseTo(2.6, 1);
  });
  it('the camera sees the car ahead at its rear, with its speed relative to the ego, and the ego lane', () => {
    const r = S.runScenario({ dt: 0.1, stop: 1, roads: [road], actors: [ahead(0, 15), ahead(30, 10)], sensors: [{ kind: 'vision', falseAlarms: 0 }], seed: 2 });
    const d = r.detections.filter((x) => x.truth === 1);
    const meanX = d.reduce((s, x) => s + x.x - (r.poses[1][Math.round(x.t / 0.1)].x - r.poses[0][Math.round(x.t / 0.1)].x - 2.35), 0) / d.length;
    expect(d.length).toBeGreaterThan(6); expect(Math.abs(meanX)).toBeLessThan(0.3);
    expect(d.reduce((s, x) => s + x.vx, 0) / d.length).toBeCloseTo(-5, 0);
    expect(r.lanes[0].left![0]).toBeCloseTo(1.8, 1); expect(r.lanes[0].right![0]).toBeCloseTo(-1.8, 1);
  });
  it('a car hidden behind a truck isn’t seen, and a radar misses small targets far away more often', () => {
    const r = S.runScenario({ dt: 0.1, stop: 2, roads: [], actors: [ahead(0, 0), { cls: 'truck', position: [20, -1.8] }, { cls: 'car', position: [50, -1.8] }], sensors: [{ kind: 'vision', pd: 1, falseAlarms: 0 }] });
    expect(r.detections.some((x) => x.truth === 2)).toBe(false);
    expect(r.detections.some((x) => x.truth === 1)).toBe(true);
    const far = (cls: S.ActorClass, x: number) => S.runScenario({ dt: 0.1, stop: 20, roads: [], actors: [{ cls: 'car', position: [0, 0] }, { cls, position: [x, 0] }], sensors: [{ kind: 'radar', falseAlarms: 0 }], seed: 5 }).detections.length;
    expect(far('car', 30)).toBeGreaterThan(190); expect(far('pedestrian', 150)).toBeLessThan(far('car', 150));
  });
  it('the lidar returns the ground and the car ahead’s back face', () => {
    const r = S.runScenario({ dt: 0.1, stop: 0.1, roads: [], actors: [ahead(0, 0), { cls: 'car', position: [15, 0] }], sensors: [{ kind: 'lidar', channels: 16, azRes: 0.5, noise: 0 }], seed: 1 }, { cloudEvery: 1 });
    const pts = r.clouds[0].pts, car = pts.filter((p) => p[2] > 0.05);
    expect(pts.filter((p) => Math.abs(p[2]) < 1e-9).length).toBeGreaterThan(100); // the ground
    expect(Math.min(...car.map((p) => p[0]))).toBeCloseTo(15 - 2.35, 2); // its back face
  });
  it('OpenDRIVE out and back in gives the same road, odd lane counts too', () => {
    for (const lanes of [2, 3]) {
      const back = S.readOpenDRIVE(S.writeOpenDRIVE([{ ...road, lanes }]))[0], a = S.makeRoad({ ...road, lanes }), b = S.makeRoad(back);
      expect(back.lanes).toBe(lanes); expect(back.laneWidth).toBeCloseTo(3.6);
      expect(b.x.at(-1)).toBeCloseTo(a.x.at(-1)!, 2); expect(b.y.at(-1)).toBeCloseTo(a.y.at(-1)!, 2);
      expect(b.s.at(-1)).toBeCloseTo(a.s.at(-1)!, 0);
    }
    const arc = `<OpenDRIVE><road name="Bend" id="7" length="157.08"><planView><geometry s="0" x="0" y="0" hdg="0" length="157.0796"><arc curvature="0.01"/></geometry></planView><lanes><laneSection s="0"><left><lane id="1" type="driving"><width a="3.5"/></lane></left><right><lane id="-1" type="driving"><width a="3.5"/></lane></right></laneSection></lanes></road></OpenDRIVE>`;
    const bend = S.readOpenDRIVE(arc)[0];
    expect(bend.centers.at(-1)![0]).toBeCloseTo(100, 1); expect(bend.centers.at(-1)![1]).toBeCloseTo(100, 1); // a quarter circle of 100 m
  });
  it('the scenario functions in the language', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files, graphics: new Graphics() });
    l.run(`s = drivingScenario('StopTime', 3);
s = road(s, [0 0; 100 0; 200 30], 'Lanes', 3);
[s, ego] = vehicle(s, 'Position', [0 0]); s = trajectory(s, ego, [0 0; 200 30], 20);
[s, lead] = vehicle(s, 'Class', 'truck', 'Position', [40 0]); s = trajectory(s, lead, [40 0; 200 30], 12);
[s, p] = actor(s, 'Class', 'pedestrian', 'Position', [80 9]); s = trajectory(s, p, [80 9; 80 -9], 1.5);
s = addSensor(s, 'vision'); s = addSensor(s, 'radar', 'Mount', [3.7 0 0.2]); s = addSensor(s, 'lidar', 'Channels', 8);
r = runScenario(s); plotScenario(s, 1.5); writeOpenDRIVE(s, 'my.xodr'); s2 = readOpenDRIVE('my.xodr');
c = vehicle('Mass', 1500);`);
    const r = l.vars.get('r') as Struct;
    expect(toMat(r.f.get('Detections')!).c).toBe(11);
    expect(toMat(r.f.get('Detections')!).r).toBeGreaterThan(20);
    expect((r.f.get('PointClouds') as Cell).d.length).toBeGreaterThan(1);
    expect(toMat(l.vars.get('lead')!).d[0]).toBe(2);
    expect(((l.vars.get('s2') as Struct).f.get('Roads') as Cell).d.length).toBe(1);
    expect((l.vars.get('c') as Struct).f.has('DrivingScenario')).toBe(false); // the car's physical model still
    expect(() => l.run("s = addSensor(s, 'sonar')")).toThrow(/vision/);
  });
});
