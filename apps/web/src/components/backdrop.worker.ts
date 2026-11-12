/// <reference lib="webworker" />
// The app's background drawn on a background thread (M129, after M84's river): the page hands its
// canvas over (transferControlToOffscreen) and tells this worker the size, the theme, the app and
// when to rest; every frame is drawn here (src/lib/backdrop.ts), so it never takes time from the
// page's taps, typing or scrolling.
import { backdropLoop, makeBackdrop, type BackdropOpts } from '@/lib/backdrop';
import type { AppId } from '@/lib/apps';

type Msg =
  | { t: 'init'; canvas: OffscreenCanvas; opts: BackdropOpts; w: number; h: number; dpr: number; dark: boolean; app: AppId; move: boolean; rest: boolean }
  | { t: 'size'; w: number; h: number; dpr: number }
  | { t: 'dark'; dark: boolean }
  | { t: 'app'; app: AppId }
  | { t: 'rest'; rest: boolean }
  | { t: 'move' };

const scope = self as unknown as DedicatedWorkerGlobalScope;
// Frames in step with the screen where workers have them (Chrome, Firefox, newer Safari); a timer otherwise.
const timer = typeof scope.requestAnimationFrame !== 'function';
const raf = (cb: (ms: number) => void) => (timer ? (setTimeout(() => cb(performance.now()), 16) as unknown as number) : scope.requestAnimationFrame(cb));
const caf = (id: number) => (timer ? clearTimeout(id) : scope.cancelAnimationFrame(id));

let loop: ReturnType<typeof backdropLoop> | null = null;

scope.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.t === 'init') {
    const ctx = m.canvas.getContext('2d');
    const soft = new OffscreenCanvas(1, 1);
    const sctx = soft.getContext('2d');
    if (!ctx || !sctx) { scope.postMessage({ t: 'unsupported' }); return; }
    const b = makeBackdrop(m.canvas, ctx, soft, sctx, m.opts);
    b.resize(m.w, m.h, m.dpr);
    b.scene(m.app, performance.now());
    loop = backdropLoop(b, m.opts, m.dark, raf, caf);
    loop.rest(m.rest);
    if (m.move) loop.move();
    return;
  }
  if (!loop) return;
  switch (m.t) {
    case 'size': loop.size(m.w, m.h, m.dpr); break;
    case 'dark': loop.dark(m.dark); break;
    case 'app': loop.app(m.app, performance.now()); break;
    case 'rest': loop.rest(m.rest); break;
    case 'move': loop.move(); break;
  }
};
