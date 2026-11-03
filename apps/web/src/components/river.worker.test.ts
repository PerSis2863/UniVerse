import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The river's background thread (M84): frames are asked for one at a time, and whether the river
// keeps moving is decided when a frame runs, so a "move" that arrives before the first frame (the
// page went idle while the thread was still starting) still sets it moving.
type Handler = (e: { data: unknown }) => void;
const opts = (still: boolean) => ({ tone: 'dark', hero: false, strength: 1, still, phone: false });

describe('the river on its background thread', () => {
  let frames: ((ms: number) => void)[] = [];
  let scope: { onmessage?: Handler };
  const run = (ms: number) => frames.splice(0).forEach((f) => f(ms));
  const send = (data: unknown) => scope.onmessage?.({ data });

  beforeEach(async () => {
    vi.resetModules();
    frames = [];
    // A 2D context (and paths, gradients) that takes any drawing call.
    const anything = (): object => new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) => (k in t ? t[k] : () => anything()),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    const ctx = anything();
    scope = { requestAnimationFrame: (cb: (ms: number) => void) => frames.push(cb), postMessage: vi.fn() } as typeof scope;
    vi.stubGlobal('self', scope);
    vi.stubGlobal('OffscreenCanvas', class { width = 1; height = 1; getContext() { return ctx; } });
    vi.stubGlobal('Path2D', function Path2D() { return anything(); });
    await import('./river.worker');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('starts moving when "move" comes before the first frame', () => {
    send({ t: 'init', canvas: new OffscreenCanvas(1, 1), opts: opts(false), w: 800, h: 600, dpr: 1, sy: 0, dark: true, move: false });
    send({ t: 'move' });
    run(16); run(32); run(48);
    expect(frames).toHaveLength(1); // still asking for the next frame: moving
  });

  it('with Reduce Motion: one frame, then one more only when something changes', () => {
    send({ t: 'init', canvas: new OffscreenCanvas(1, 1), opts: opts(true), w: 800, h: 600, dpr: 1, sy: 0, dark: true, move: true });
    run(16);
    expect(frames).toHaveLength(0);
    send({ t: 'scroll', sy: 300 });
    expect(frames).toHaveLength(1);
    run(32);
    expect(frames).toHaveLength(0);
  });
});
