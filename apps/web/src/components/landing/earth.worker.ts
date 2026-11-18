/// <reference lib="webworker" />
// M328: the landing's Earth on a background thread: the page hands over its canvas and says what changed (size, a
// drag, the app to face, on screen or resting); frames are drawn here, 30 a second at most, only while it moves.
import { bitmap, earthScene, type EarthScene, type Facing } from './earth-scene';

type Msg =
  | { t: 'init'; canvas: OffscreenCanvas; w: number; h: number; dpr: number; still: boolean; map: string; water: string }
  | { t: 'size'; w: number; h: number; dpr: number }
  | { t: 'drag'; dx: number; dy: number; px: number }
  | { t: 'release' }
  | { t: 'face'; face: Facing | null }
  | { t: 'run'; run: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const nextFrame: (cb: (ms: number) => void) => number = typeof scope.requestAnimationFrame === 'function'
  ? (cb) => scope.requestAnimationFrame(cb) : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

let earth: EarthScene | null = null, run = true, ticking = false, last = 0;
const queue: Msg[] = [];
const tick = (ms: number) => {
  ticking = false;
  if (!earth || !run) return;
  if (ms - last < 32) { ticking = true; nextFrame(tick); return; }
  const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
  last = ms;
  if (earth.frame(dt)) { ticking = true; nextFrame(tick); } else last = 0;
};
const wake = () => { if (!ticking && earth && run) { ticking = true; nextFrame(tick); } };
function handle(m: Msg) {
  if (!earth) { queue.push(m); return; }
  if (m.t === 'size') earth.size(m.w, m.h, m.dpr);
  else if (m.t === 'drag') earth.drag(m.dx, m.dy, m.px);
  else if (m.t === 'release') earth.release();
  else if (m.t === 'face') earth.face(m.face);
  else if (m.t === 'run') { run = m.run; if (!run) last = 0; }
  wake();
}
scope.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.t !== 'init') { handle(m); return; }
  try {
    const [map, water] = await Promise.all([bitmap(m.map), bitmap(m.water).catch(() => null)]);
    earth = earthScene({ canvas: m.canvas, w: m.w, h: m.h, dpr: m.dpr, still: m.still, map, water });
    for (const q of queue.splice(0)) handle(q);
    wake();
    scope.postMessage({ t: 'ready' });
  } catch { scope.postMessage({ t: 'failed' }); }
};
