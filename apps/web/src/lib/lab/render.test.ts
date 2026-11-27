import { describe, expect, it } from 'vitest';
import * as S from './scenario';
import { cameraImage, interpolateBox } from './render';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat, type Struct, type Cell } from './values';
import './machines-lab';

// M577: what the ego's camera sees, and the true labels that come with each picture.
const at = (cls: S.ActorClass, x: number, y: number): S.ActorSpec => ({ cls, position: [x, y] });

describe('Hyperion camera pictures (M577)', () => {
  it('puts a car in the left lane left of the middle, and a car on the right to the right', () => {
    const run = S.runScenario({ dt: 0.1, stop: 0.1, roads: [], actors: [at('car', 0, 0), at('car', 25, 3.5), at('car', 25, -3.5)], sensors: [] });
    const im = cameraImage(run, 0, 0, { width: 320, height: 180 });
    const left = im.labels.find((l) => l.truth === 1)!, right = im.labels.find((l) => l.truth === 2)!;
    expect(left.box[0] + left.box[2] / 2).toBeLessThan(160); expect(right.box[0] + right.box[2] / 2).toBeGreaterThan(160);
    expect(left.visible).toBeCloseTo(1, 5); expect(im.rgb.length).toBe(320 * 180 * 3);
  });
  it('a car partly behind a truck is only partly visible, and nothing behind the camera is labelled', () => {
    const run = S.runScenario({ dt: 0.1, stop: 0.1, roads: [], actors: [at('car', 0, 0), at('truck', 15, 0), at('car', 40, 5), at('car', -20, 0)], sensors: [] });
    const L = cameraImage(run, 0, 0).labels, hid = L.find((l) => l.truth === 2)!;
    expect(hid.visible).toBeGreaterThan(0); expect(hid.visible).toBeLessThan(0.8);
    expect(L.some((l) => l.truth === 3)).toBe(false);
  });
  it('interpolates a box between keyframes', () => {
    expect(interpolateBox([0, 0, 10, 10], [10, 20, 30, 10], 0, 10, 5)).toEqual([5, 10, 20, 10]);
  });
  it('cameraImage and scenarioGroundTruth in the language', () => {
    const l = new Lab({ out: () => {}, files: new FileStore(), graphics: new Graphics() });
    l.run(`s = drivingScenario('StopTime', 2);
s = road(s, [0 0; 200 0], 'Lanes', 2);
[s, ego] = vehicle(s, 'Position', [0 -1.8]); s = trajectory(s, ego, [0 -1.8; 200 -1.8], 10);
[s, lead] = vehicle(s, 'Position', [25 -1.8]); s = trajectory(s, lead, [25 -1.8; 200 -1.8], 10);
[img, lab] = cameraImage(s, 1, 'Size', [120 200]);
gt = scenarioGroundTruth(s, 'Times', 0:0.5:2, 'Size', [120 200]);`);
    const img = toMat(l.vars.get('img')!);
    expect([img.r, img.c, img.p]).toEqual([120, 200, 3]);
    expect(toMat((l.vars.get('lab') as Struct).f.get('Boxes')!).r).toBe(1);
    expect(((l.vars.get('gt') as Struct).f.get('Labels') as Cell).d.length).toBe(5);
    expect(() => l.run("cameraImage(s, 0, 'Zoom', 2)")).toThrow(/FieldOfView/);
  });
});
