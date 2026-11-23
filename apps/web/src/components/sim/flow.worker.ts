/// <reference lib="webworker" />
import { Tunnel, type FlowSettings } from '@/lib/sim/flow';

// Hyperion Simulate → Fluids (M408): the wind tunnel runs here, step after step, off the page's thread. A frame (the
// chosen field, the tracer particles, the forces) goes to the page only when it has drawn the last one, so a slow
// screen never piles them up; the tunnel keeps running meanwhile.

export type FlowView = 'speed' | 'pressure' | 'vorticity';
export type ToFlow = { start: FlowSettings } | { view: FlowView } | { paused: boolean } | { drawn: true };
export interface FlowFrame { field: Float32Array; particles: Float32Array; steps: number; cd: number; cl: number; history: { cd: number[]; cl: number[]; every: number } }
export type FromFlow = { ready: { nx: number; ny: number; outline: [number, number][]; D: number; re: number } } | { frame: FlowFrame };

const P = 1400, EVERY = 10, KEEP = 600;
let t: Tunnel | null = null, view: FlowView = 'speed', paused = false, ready = true, timer: ReturnType<typeof setTimeout> | null = null;
let px = new Float32Array(P), py = new Float32Array(P), age = new Uint32Array(P);
const cdH: number[] = [], clH: number[] = [];
let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

function spawn(i: number, anywhere: boolean) {
  if (!t) return;
  for (let tries = 0; tries < 20; tries++) {
    const x = anywhere ? rnd() * t.nx : rnd() * 3, y = rnd() * t.ny;
    if (!t.solid[Math.floor(y) * t.nx + Math.floor(x)]) { px[i] = x; py[i] = y; age[i] = Math.floor(rnd() * 400); return; }
  }
}
function tick() {
  timer = null;
  if (!t || paused) return;
  const t0 = performance.now();
  let k = 0;
  while (performance.now() - t0 < 20) {
    t.step(); k++;
    if (t.steps % EVERY === 0) { cdH.push(t.cd); clH.push(t.cl); if (cdH.length > KEEP) { cdH.shift(); clH.shift(); } }
  }
  // The particles ride the flow (cells per step × the steps just run).
  for (let i = 0; i < P; i++) {
    const [vx, vy] = t.velocity(px[i], py[i]);
    px[i] += vx * k; py[i] += vy * k; age[i] += k;
    if (py[i] < 0) py[i] += t.ny; else if (py[i] >= t.ny) py[i] -= t.ny;
    const cx = Math.floor(px[i]), cy = Math.floor(py[i]);
    if (px[i] >= t.nx - 1 || px[i] < 0 || age[i] > 9000 || t.solid[cy * t.nx + cx]) spawn(i, false);
  }
  if (ready) {
    ready = false;
    const field = t.field(view), particles = new Float32Array(2 * P);
    for (let i = 0; i < P; i++) { particles[2 * i] = px[i]; particles[2 * i + 1] = py[i]; }
    postMessage({ frame: { field, particles, steps: t.steps, cd: t.cd, cl: t.cl, history: { cd: [...cdH], cl: [...clH], every: EVERY } } } satisfies FromFlow, [field.buffer, particles.buffer]);
  }
  timer = setTimeout(tick, 0);
}
const run = () => { if (!timer && !paused) timer = setTimeout(tick, 0); };

self.onmessage = (e: MessageEvent<ToFlow>) => {
  const m = e.data;
  if ('start' in m) {
    t = new Tunnel(m.start);
    px = new Float32Array(P); py = new Float32Array(P); age = new Uint32Array(P);
    for (let i = 0; i < P; i++) spawn(i, true);
    cdH.length = 0; clH.length = 0; ready = true;
    postMessage({ ready: { nx: t.nx, ny: t.ny, outline: t.outline, D: t.D, re: t.reActual } } satisfies FromFlow);
    run();
  } else if ('view' in m) view = m.view;
  else if ('paused' in m) { paused = m.paused; run(); }
  else if ('drawn' in m) ready = true;
};
