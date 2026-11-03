/// <reference lib="webworker" />
// The river of light on a background thread (M84, the owner: "ultra smoothness"): the page hands its
// canvas over (transferControlToOffscreen) and tells this worker the size, the scroll, the theme and
// the pointer; every frame is drawn here, so the river never takes time from the page's taps,
// typing or scrolling. The drawing is the same code as on the page (src/lib/river-paint.ts).
import { makeRiver, riverGap, type RiverOpts, type RiverState } from '@/lib/river-paint';

type Msg =
  | { t: 'init'; canvas: OffscreenCanvas; opts: RiverOpts; w: number; h: number; dpr: number; sy: number; dark: boolean; move: boolean }
  | { t: 'size'; w: number; h: number; dpr: number }
  | { t: 'scroll'; sy: number }
  | { t: 'pointer'; x: number; y: number }
  | { t: 'leave' }
  | { t: 'dark'; dark: boolean }
  | { t: 'hidden'; hidden: boolean }
  | { t: 'move' };

const scope = self as unknown as DedicatedWorkerGlobalScope;
// Frames in step with the screen where workers have them (Chrome, Firefox, newer Safari); a timer otherwise.
const nextFrame: (cb: (ms: number) => void) => number = typeof scope.requestAnimationFrame === 'function'
  ? (cb) => scope.requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

let river: ReturnType<typeof makeRiver> | null = null;
let opts: RiverOpts | null = null;
const state: RiverState = { sy: 0, dark: true, px: -9999, py: -9999, pAt: -1e9 };
let frame = 0, last = 0, hidden = false, moving = false;

/** One frame; while moving (not with Reduce Motion) it asks for the next. Whether it moves is decided
 *  when the frame runs, so "move" arriving before the first frame still starts the loop. */
const tick = (ms: number) => {
  frame = 0;
  if (!river || !opts || hidden) return;
  if (opts.still || !moving) { river.draw(ms, state); return; }
  if (ms - last >= riverGap(opts.phone)) { last = ms; river.draw(ms, state); }
  frame = nextFrame(tick);
};
const kick = () => { if (river && !frame) frame = nextFrame(tick); };

scope.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  switch (m.t) {
    case 'init': {
      const ctx = m.canvas.getContext('2d');
      const soft = new OffscreenCanvas(1, 1);
      const sctx = soft.getContext('2d');
      if (!ctx || !sctx) { scope.postMessage({ t: 'unsupported' }); return; }
      opts = m.opts;
      river = makeRiver(m.canvas, ctx, soft, sctx, m.opts, performance.now());
      river.resize(m.w, m.h, m.dpr);
      state.sy = m.sy; state.dark = m.dark;
      moving = m.move;
      kick();
      break;
    }
    case 'size': river?.resize(m.w, m.h, m.dpr); kick(); break;
    case 'scroll': state.sy = m.sy; kick(); break;
    case 'pointer': state.px = m.x; state.py = m.y; state.pAt = performance.now(); break;
    case 'leave': state.pAt = -1e9; break;
    case 'dark': state.dark = m.dark; kick(); break;
    case 'hidden': hidden = m.hidden; if (!hidden) kick(); break;
    case 'move': moving = true; kick(); break;
  }
};
