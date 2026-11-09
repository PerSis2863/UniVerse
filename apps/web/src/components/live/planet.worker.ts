/// <reference lib="webworker" />
// The planet on a background thread (M85, the owner: "ultra smoothness"): the planets you only look
// at (the hub's, the landing's) hand their canvas here, the page says what changed (size, places,
// land, pointer, on screen or not) and every frame is drawn here with the page's own code
// (planet-paint.ts), so thousands of dots a frame never take time from taps, typing or scrolling.
import { drawPlanet, landLookup, letGo, nearestPlace, turnBy, planetLinks, planetPoints, planetState, type Place, type PlanetProps } from './planet-paint';

type Msg =
  | { t: 'init'; canvas: OffscreenCanvas; still: boolean; gap: number; pings: boolean; places: Place[]; arcs?: [number, number][]; bits: Uint8Array | null; font: string; turnable?: boolean }
  // M131: the landing's globe, turned by hand: a drag, a zoom, a place to face, the chosen, a click.
  | { t: 'drag'; dx: number; dy: number; mouse: boolean }
  | { t: 'release' }
  | { t: 'zoom'; by: number }
  | { t: 'focus'; focus: { lat: number; lon: number } | null }
  | { t: 'selected'; selected: number[] }
  | { t: 'pick'; x: number; y: number }
  | { t: 'size'; w: number; h: number; dpr: number }
  | { t: 'places'; places: Place[]; arcs?: [number, number][] }
  | { t: 'land'; bits: Uint8Array }
  | { t: 'pointer'; x: number; y: number }
  | { t: 'leave' }
  | { t: 'seen'; seen: boolean }
  | { t: 'hidden'; hidden: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope & { fonts?: FontFaceSet };
// Frames in step with the screen where workers have them; a timer otherwise.
const nextFrame: (cb: (ms: number) => void) => number = typeof scope.requestAnimationFrame === 'function'
  ? (cb) => scope.requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

let cv: OffscreenCanvas | null = null, ctx: OffscreenCanvasRenderingContext2D | null = null;
const s = planetState();
const props: PlanetProps = { pts: [], links: [], land: null, interactive: false, focus: null, pings: true };
let w = 0, h = 0, dpr = 1, still = false, seen = false, hidden = false, raf = 0, start = 0, gap = 0, drawn = 0;
let pointer: { x: number; y: number } | null = null;

// As on the page (useLiveCanvas): frames only while on screen and the tab is open; one with Reduce Motion.
const frame = (ms: number) => {
  raf = 0;
  if (!ctx || !w || !h) return;
  if (!start) start = ms;
  // `gap`: a pause between frames (0 since M136: every frame the screen gives, phones too).
  if (gap && !still && drawn && ms - drawn < gap) { if (seen && !hidden) raf = nextFrame(frame); return; }
  drawn = ms;
  ctx.clearRect(0, 0, w, h);
  drawPlanet(s, { ctx, w, h, t: still ? 30 : (ms - start) / 1000, pointer, still }, props, dpr);
  if (!still && seen && !hidden) raf = nextFrame(frame);
};
const kick = () => { if (!raf && ctx) raf = nextFrame(frame); };
const size = (nw: number, nh: number, ratio: number) => {
  w = nw; h = nh; dpr = ratio;
  if (!cv || !ctx) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
const show = (places: Place[], arcs?: [number, number][]) => { props.pts = planetPoints(places); props.links = planetLinks(places, arcs); };

scope.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  switch (m.t) {
    case 'init': {
      if (!scope.fonts || typeof FontFace === 'undefined') { scope.postMessage({ t: 'unsupported' }); return; }
      cv = m.canvas; still = m.still; gap = m.gap; props.pings = m.pings; props.turnable = !!m.turnable;
      show(m.places, m.arcs);
      if (m.bits) props.land = landLookup(m.bits);
      // The names are in Inter, and a background thread has its own fonts: load the page's file
      // before the first frame (a canvas that drew with a stand-in font could keep it), 2 s at most.
      const face = new FontFace('Inter', `url(${m.font})`, { weight: '100 900' });
      const fonts = scope.fonts;
      fonts.add(face);
      Promise.race([face.load().then(() => fonts.ready), new Promise((r) => setTimeout(r, 2000))]).catch(() => undefined).then(() => setTimeout(() => {
        ctx = cv?.getContext('2d') ?? null;
        if (!ctx) { scope.postMessage({ t: 'unsupported' }); return; }
        size(w, h, dpr);
        kick();
      }, 0));
      break;
    }
    case 'size': size(m.w, m.h, m.dpr); kick(); break;
    case 'places': show(m.places, m.arcs); if (still) kick(); break;
    case 'land': props.land = landLookup(m.bits); kick(); break;
    case 'pointer': pointer = { x: m.x, y: m.y }; if (still) kick(); break;
    case 'leave': pointer = null; if (still) kick(); break;
    case 'seen': seen = m.seen; if (seen) kick(); break;
    case 'hidden': hidden = m.hidden; if (!hidden) kick(); break;
    case 'drag': turnBy(s, m.dx, m.dy, m.mouse, performance.now()); kick(); break;
    case 'release': letGo(s, performance.now()); kick(); break;
    case 'zoom': s.tz = Math.max(1, Math.min(2.6, s.tz * m.by)); kick(); break;
    case 'focus': props.focus = m.focus; kick(); break;
    case 'selected': props.selected = m.selected; kick(); break;
    case 'pick': scope.postMessage({ t: 'picked', i: nearestPlace(s.xy, m.x, m.y) }); break;
  }
};
