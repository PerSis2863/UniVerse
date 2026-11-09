import { describe, expect, it } from 'vitest';
import { backdropLoop, contours, makeBackdrop, type BackdropOpts } from './backdrop';
import { APPS } from './apps';

// Each app's background (M129): the map's contour lines, every scene drawing in both themes, the fade
// between apps, and the frame loop (moving, held for Reduce Motion, resting).

/** A 2D context (and gradients) that takes any drawing call and counts them. */
function fakeCanvas() {
  let calls = 0;
  const anything = (): object => new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => { calls++; return anything(); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { cv: { width: 1, height: 1 } as unknown as OffscreenCanvas, ctx: anything() as OffscreenCanvasRenderingContext2D, calls: () => calls };
}

const paint = (opts: BackdropOpts) => {
  const main = fakeCanvas(), soft = fakeCanvas();
  const b = makeBackdrop(main.cv, main.ctx, soft.cv, soft.ctx, opts);
  b.resize(1280, 800, 2);
  return { b, main };
};

describe('the contour lines of the Relief map', () => {
  it('rings a single hill halfway to its neighbours', () => {
    const f = new Float32Array(25);
    f[12] = 1; // the middle of a 5 × 5 grid
    const s = contours(f, 5, 5, 0.5);
    expect(s).toHaveLength(16); // four segments, one per cell round the hill
    for (let i = 0; i < s.length; i += 2) expect(Math.hypot(s[i] - 2, s[i + 1] - 2)).toBeCloseTo(0.5);
  });
});

describe('the scenes', () => {
  it('every app draws, dark and light, on a computer and a phone', () => {
    for (const phone of [false, true]) {
      const { b, main } = paint({ strength: 1, still: false, phone });
      for (const app of APPS) {
        b.scene(app.id, 0);
        for (const [ms, dark] of [[16, true], [2000, false], [4000, true]] as const) expect(() => b.draw(ms, dark)).not.toThrow();
      }
      expect(main.calls()).toBeGreaterThan(100);
    }
  });

  it('arrives, then holds; a switch is a transition again', () => {
    const { b } = paint({ strength: 1, still: false, phone: false });
    b.scene('trace', 0);
    expect(b.draw(400, true)).toBe(true); // arriving (1.1 s)
    expect(b.draw(1200, true)).toBe(false);
    b.scene('green', 1200);
    expect(b.draw(1500, true)).toBe(true); // the switch (1 s)
    expect(b.draw(2300, true)).toBe(false);
  });
});

describe('the frame loop', () => {
  const setup = (still: boolean) => {
    const frames: ((ms: number) => void)[] = [];
    const { b } = paint({ strength: 1, still, phone: false });
    b.scene('campus', 0);
    const loop = backdropLoop(b, { strength: 1, still, phone: false }, true, (cb) => frames.push(cb), () => { frames.length = 0; });
    const run = (ms: number) => frames.splice(0).forEach((f) => f(ms));
    return { loop, frames, run };
  };

  it('keeps moving once told to', () => {
    const { loop, frames, run } = setup(false);
    loop.move();
    run(1000); run(1016); run(1032);
    expect(frames).toHaveLength(1);
  });

  it('with Reduce Motion: frames only while a transition runs', () => {
    const { loop, frames, run } = setup(true);
    loop.move();
    run(500);
    expect(frames).toHaveLength(1); // still arriving
    run(1200);
    expect(frames).toHaveLength(0); // arrived: held
    loop.app('play', 1200);
    run(1500);
    expect(frames).toHaveLength(1);
  });

  it('rests while nobody needs it moving, and carries on after', () => {
    const { loop, frames, run } = setup(false);
    loop.move();
    loop.rest(true);
    expect(frames).toHaveLength(0);
    run(16);
    loop.rest(false);
    expect(frames).toHaveLength(1);
  });
});
