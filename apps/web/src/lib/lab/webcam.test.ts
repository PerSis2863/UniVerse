import { afterEach, describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import { waits } from './wait';
import './webcam-lab';

afterEach(() => { waits.page = null; });
const run = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return lab; };

describe('Hyperion: the webcam (M555)', () => {
  it('lists the cameras, picks one, and a snapshot is rows × columns × 3 uint8 like imread', () => {
    const asked: unknown[] = [];
    waits.page = (kind, body) => {
      asked.push([kind, body]);
      const b = body as { op: string; w: number; h: number };
      if (b.op === 'list') return ['Front camera', 'USB camera'];
      // A 4 × 2 picture: red on top, blue below.
      const rgb = new Uint8Array(4 * 2 * 3);
      for (let i = 0; i < 8; i++) rgb.set(i < 4 ? [255, 0, 0] : [0, 0, 255], i * 3);
      return { w: 4, h: 2, rgb };
    };
    const lab = run("names = webcamlist; cam = webcam('usb'); img = snapshot(cam); r = img(1, 1, 1); b = img(2, 3, 3); sz = size(img); k = class(img);");
    expect(toMat(lab.vars.get('sz')!).d).toEqual(Float64Array.from([2, 4, 3]));
    expect(toMat(lab.vars.get('r')!).d[0]).toBe(255);
    expect(toMat(lab.vars.get('b')!).d[0]).toBe(255);
    expect(lab.vars.get('k')).toMatchObject({ v: 'uint8' });
    expect(asked.at(-1)).toEqual(['camera', { op: 'snap', name: 'USB camera', w: 640, h: 480 }]);
  });
  it('says plainly when there is no camera, or the page can’t wait', () => {
    waits.page = () => [];
    expect(() => run('cam = webcam;')).toThrow(/No camera/);
    waits.page = null;
    expect(() => run('cam = webcam;')).toThrow(/browser that can wait/);
  });
});
