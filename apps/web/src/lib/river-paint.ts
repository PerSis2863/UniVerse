// The river of light's drawing (M9/M10, see src/components/LightTrail.tsx for what it is and the
// owner's rules about it). No DOM and no React here, so the same code draws on the page or, where
// the browser can, on a background thread (src/components/river.worker.ts, M84): the river then
// never takes time from taps, typing or scrolling.
//
// M124 (the owner, 8 Nov 2026, with the "Relay" recording: "I want that river to look exactly the
// way I have shown you in the video"): fine fibres of light that wrap round a tight hairpin bend
// (packed into a narrow, white-hot band there) and spray apart as they leave it: the upper arm fans
// wide towards the top, the lower arm flares away below. Yellow-lime with a few pale cyan fibres, a
// soft halo round each, an olive glow round the bend, specks of light near it. Down the page the
// bends alternate sides, the river crossing the page between them. Light mode draws the same river
// in the light look's blues. It goes out of focus as the page scrolls (depth of field), so what's in
// front stays sharp.

const DARK = {
  fibres: ['#e3f58e', '#d2ec72', '#c4e45f', '#f4fbd0', '#b6db58', '#dcf08c', '#a8dcec', '#8ccfe6'],
  glow: [[246, 255, 200, 0.62], [190, 236, 70, 0.3], [110, 146, 30, 0.3]] as const,
  haze: [120, 160, 40, 0.26] as const, speck: '#f6ffd2', bokeh: '#dff58a',
};
const LIGHT = {
  fibres: ['#2563eb', '#3b7ef0', '#1d4fd7', '#5b8def', '#4f46e5', '#3a6fe6', '#0891b2', '#0e7490'],
  glow: [[59, 126, 240, 0.22], [79, 70, 229, 0.1], [37, 99, 235, 0.05]] as const,
  haze: [59, 126, 240, 0.08] as const, speck: '#2f5fd8', bokeh: '#93b9fa',
};

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Glow = readonly [number, number, number, number];
/** A 64 × 64 tile of grey noise for `grain` (a fixed pattern, so it never flickers). */
function makeGrain(like: Surface): CanvasPattern | null {
  const g = typeof OffscreenCanvas !== 'undefined' && like instanceof OffscreenCanvas ? new OffscreenCanvas(64, 64) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 64, height: 64 }) : null;
  const c = g?.getContext('2d') as Ctx2D | null | undefined;
  if (!g || !c) return null;
  const img = c.createImageData(64, 64);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed % 256;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return c.createPattern(g as CanvasImageSource, 'repeat');
}

/** A bell-shaped falloff in 24 small steps: with only a few, each change of slope shows as a ring. */
const BELL = Array.from({ length: 24 }, (_, i) => { const x = i / 23, e = Math.exp(-4.5); return [x, (Math.exp(-4.5 * x * x) - e) / (1 - e)] as const; });
/** A round glow with a smooth (bell-shaped) falloff. */
function glowAt(c: Ctx2D, x: number, y: number, r: number, [cr, cg, cb, a]: Glow) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, f] of BELL) g.addColorStop(at, `rgba(${cr},${cg},${cb},${(a * f).toFixed(4)})`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
type Surface = HTMLCanvasElement | OffscreenCanvas;

/** Fixed for a river's life: the look, the landing's opening, Reduce Motion, a phone. */
export interface RiverOpts { tone: 'auto' | 'dark'; hero: boolean; strength: number; still: boolean; phone: boolean }
/** What changes while it runs: the scroll, the theme, the pointer (times on the drawing side's clock). */
export interface RiverState { sy: number; dark: boolean; px: number; py: number; pAt: number }

/** How often it draws while moving on its own: 60 a second on computers, 30 on phones. */
export const riverGap = (phone: boolean) => (phone ? 32 : 15);

/**
 * A river drawn into `cv` (the screen-sized canvas) with `soft` (a quarter-size canvas for the
 * out-of-focus light). `born` is when it started, on the same clock as the `ms` passed to draw.
 */
export function makeRiver(cv: Surface, ctx: Ctx2D, soft: Surface, sctx: Ctx2D, opts: RiverOpts, born: number) {
  const { tone, hero, strength, still, phone } = opts;
  const N = still ? 44 : phone ? 40 : 64;
  // The fibres, as in the recording: mostly fine, faint green strands, a few bright white-lime ones a
  // little thicker, pale cyan strands scattered through the bundle, and about a quarter out of focus
  // behind the rest (depth). They all follow the river's path (roughly their order from the bend
  // outwards, each opening a little wider than the one outside it), and each moves in its own way
  // along it (below), so they cross gently and shimmer like separate strands.
  const hash = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const gaps = Array.from({ length: N }, (_, i) => 0.45 + hash(i, 1) * 1.1);
  const total = gaps.reduce((a, g) => a + g, 0);
  let run = 0;
  const fibres = Array.from({ length: N }, (_, i) => {
    const w = i === 0 ? 0 : (run += gaps[i]) / total;
    const bright = hash(i, 2) > 0.84, cyan = !bright && hash(i, 3) < 0.15;
    const level = hash(i, 4);
    return {
      dx: w * 58 - 4,
      up: 0.33 + 0.77 * w + (hash(i, 5) - 0.5) * 0.06, down: 0.9 + 3.6 * w + (hash(i, 6) - 0.5) * 0.2,
      colour: bright ? 3 : cyan ? 6 + (i % 2) : [0, 1, 2, 4, 5][i % 5],
      alpha: bright ? 0.85 : (0.16 + 0.42 * level * level) * (1 - 0.3 * w) + (cyan ? 0.12 : 0),
      width: bright ? 1.3 + hash(i, 7) * 0.4 : 0.5 + hash(i, 7) * 0.45,
      far: !bright && hash(i, 8) < 0.25,
      // Its own motion (the owner: "each fibre follows its own way of motion but follows the lines"):
      // a sway of its own size, wavelength, speed and timing, and a slow breath of its spread.
      amp: 4 + hash(i, 9) * 11, wave: 170 + hash(i, 10) * 260, speed: 0.35 + hash(i, 11) * 0.85, phase: hash(i, 12) * 6.283,
      breath: 0.25 + hash(i, 13) * 0.5,
    };
  });
  type Fibre = (typeof fibres)[number];
  // Specks near each bend (where on the arm, how far off it, how bright), and faint bokeh further out.
  const specks = Array.from({ length: phone ? 60 : 160 }, (_, i) => ({ f: (i * 7) % N, d: 0.03 + ((i * 61) % 100) / 260, off: (((i * 31) % 100) / 100 - 0.5) * 40, up: i % 4 !== 0, r: 0.5 + ((i * 17) % 10) / 9, tw: i * 0.83 }));
  const bokeh = Array.from({ length: phone ? 6 : 12 }, (_, i) => ({ d: 0.08 + ((i * 41) % 100) / 220, off: (((i * 67) % 100) / 100 - 0.5) * 160, up: i % 3 !== 0, r: 6 + ((i * 23) % 9), a: 0.06 + ((i * 11) % 7) / 60 }));
  // A fine grain laid over the soft light once it's drawn: an 8-bit gradient stretched 4× showed rings
  // on black; the grain breaks the steps up (the recording has the same faint grain).
  const grain = makeGrain(soft);
  let W = 0, H = 0;
  // The soft light moves slowly: repaint it every other frame (or after a scroll) and reuse it.
  let softFrame = 0, softAt = NaN;
  // The pointer (or finger): the fibres part round it and it glows (M11). `pv` eases in and out.
  let pv = 0;
  // Per height in view: which bend comes before it, how far it is from that bend and the next (raised
  // to the arms' power), and how far along it is between them: shared by every fibre.
  let ys = new Float32Array(0), seg = new Int16Array(0), pd = new Float32Array(0), pu = new Float32Array(0), bl = new Float32Array(0), rp = new Float32Array(0);

  /** The screen's size in CSS pixels and the device's pixel ratio (M124: up to 2×, ≤4.2 M pixels, so the fine lines are crisp). */
  const resize = (w: number, h: number, ratio: number) => {
    W = w; H = h;
    const dpr = Math.min(2, ratio || 1, Math.sqrt(4.2e6 / Math.max(1, W * H)));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    soft.width = Math.max(1, Math.round(W / 4)); soft.height = Math.max(1, Math.round(H / 4));
    sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    const most = Math.ceil((H + 160) / 8) + 2;
    ys = new Float32Array(most); seg = new Int16Array(most); pd = new Float32Array(most); pu = new Float32Array(most); bl = new Float32Array(most); rp = new Float32Array(most);
  };

  const draw = (ms: number, s: RiverState) => {
    const { sy, px, py, pAt } = s;
    const t = still ? 8 : ms / 1000;
    const dark = tone === 'dark' || s.dark;
    const pal = dark ? DARK : LIGHT;
    const k = (dark ? 1 : 0.7) * strength;
    const wide = W >= 1024;
    // The bends, in page coordinates: the first beside the hero's paragraph (as in the recording),
    // then one every D further down, alternating sides; even ones open to the right.
    const D = H * 1.7;
    const Y0 = H * (hero ? 0.684 : 0.55);
    const leftX = W * (wide ? 0.345 : phone ? 0.2 : 0.28), rightX = W - leftX;
    const bendY = (b: number) => Y0 + b * D;
    const bendX = (b: number) => (b % 2 === 0 ? leftX : rightX) + Math.sin(t * 0.35 + b) * 8;
    const dir = (b: number) => (b % 2 === 0 ? 1 : -1);
    // The arms, fitted to the recording (a 1766 × 1222 frame): each a fan that widens with the distance
    // from the bend. The fibres on the outside of the U stay steep; the inner ones turn tighter: on the
    // upper arm they lean out as they rise (power 1.4), on the lower arm they sweep out almost flat to
    // the side (power 1.6, opening up to five times wider). The tip is a round U (its outer edge
    // upright at the turn): near the bend each arm is eased in by d² / (d² + R²). In pixels.
    const tipUp = H * 0.08, tipDown = H * 0.05;
    const armUp = (d: number) => { const e = Math.max(0, d); return Math.min(W * 2, W * Math.pow(e / H, 1.4) * ((e * e) / (e * e + tipUp * tipUp))); };
    const armDown = (d: number) => { const e = Math.max(0, d); return Math.min(W * 2, W * Math.pow(e / H, 1.6) * ((e * e) / (e * e + tipDown * tipDown))); };
    // On arrival (landing page), the river pours in from the top over ~1.8 s.
    const grow = hero && !still ? Math.min(1, (ms - born) / 1800) : 1;
    const eased = 1 - Math.pow(1 - grow, 3);
    const y0 = sy - 80;
    const y1 = Math.min(sy + H + 80, hero && grow < 1 ? -80 + eased * (H * 1.3) : Infinity);
    ctx.clearRect(0, 0, W, H);
    if (y1 <= y0) return;
    // M124 · Depth of field: sharp at the top of a page, out of focus a screen further down. The
    // fibres move from the sharp canvas into the quarter-size one (stretched: a soft blur) as the page
    // scrolls; no filter, so it costs no more per frame.
    const focus = Math.max(0, Math.min(1, 1 - sy / (H * 0.8)));
    const step = phone ? 12 : 8;
    let n = 0;
    for (let y = y0; y <= y1 && n < ys.length; y += step, n++) {
      const b = Math.floor((y - Y0) / D); // -1 above the first bend
      ys[n] = y; seg[n] = b;
      pd[n] = b < 0 ? 0 : armDown(y - bendY(b));
      pu[n] = armUp(bendY(b + 1) - y);
      const f = b < 0 ? 1 : Math.min(1, Math.max(0, (y - bendY(b)) / D));
      bl[n] = b < 0 ? 1 : f * f * (3 - 2 * f);
    }
    // Every fibre follows the river's path but moves in its own way: its own sway and breath (above),
    // growing with the distance from the bend (rp: 0 at the bend, 1 a fifth of a screen away), so the
    // bend stays tight while the arms shimmer like separate strands.
    for (let j = 0; j < n; j++) rp[j] = Math.min(1, (pu[j] + pd[j]) / (H * 0.2));
    // A fibre's x at the j-th height: leaving the bend before, arriving at the bend after, blended.
    const fx = (fb: Fibre, j: number) => {
      const b = seg[j];
      const br = 1 + 0.045 * Math.sin(t * fb.breath + fb.phase);
      const own = fb.amp * rp[j] * Math.sin(ys[j] / fb.wave + t * fb.speed + fb.phase);
      const next = bendX(b + 1) + dir(b + 1) * (fb.dx + fb.up * br * pu[j] + own);
      if (b < 0) return next;
      const prev = bendX(b) + dir(b) * (fb.dx + fb.down * br * pd[j] + own);
      return prev + (next - prev) * bl[j];
    };
    pv += ((ms - pAt < 2500 ? 1 : 0) - pv) * 0.08;
    const near = pv > 0.01;
    // Fibres near the pointer lean away from it, smoothly (no jump at its centre), like hair.
    const part = (x: number, y: number) => {
      if (!near) return 0;
      const dy = y - sy - py, dx = x - px;
      if (dy > 360 || dy < -360) return 0;
      return pv * 40 * Math.exp(-(dy * dy) / 36000) * (dx / 120) * Math.exp(-(dx * dx) / 30000);
    };
    // One smooth curve per fibre (the owner: "not smooth"): through the midpoints of the sampled
    // points, each point a control point, so there are no corners however tight the bend.
    const trace = (c: Ctx2D, fb: Fibre) => {
      c.beginPath();
      let x = fx(fb, 0), px0 = x + part(x, ys[0]), py0 = ys[0] - sy;
      c.moveTo(px0, py0);
      for (let j = 1; j < n; j++) {
        x = fx(fb, j);
        const px1 = x + part(x, ys[j]), py1 = ys[j] - sy;
        c.quadraticCurveTo(px0, py0, (px0 + px1) / 2, (py0 + py1) / 2);
        px0 = px1; py0 = py1;
      }
      c.lineTo(px0, py0);
      c.stroke();
    };
    // A point on a fibre's arm next to bend b, d pixels along it (up or down).
    const armPoint = (fb: Fibre, b: number, d: number, up: boolean) => [bendX(b) + dir(b) * (fb.dx + (up ? fb.up * armUp(d) : fb.down * armDown(d))), bendY(b) + (up ? -d : d)] as const;
    const blend = dark ? 'lighter' : 'source-over';
    const fade = k * (0.4 + 0.6 * eased) * (hero ? 1 : 0.75);
    const firstBend = Math.max(0, Math.floor((y0 - H * 0.6 - Y0) / D));
    const bendsInView: number[] = [];
    for (let b = firstBend; bendY(b) < y1 + H * 0.6; b++) bendsInView.push(b);

    // 1 · The soft light (a quarter-size canvas, stretched): the olive glow round each bend, a halo
    // round the fibres, faint bokeh, and the fibres themselves once the page has scrolled them out of focus.
    const repaint = still || softAt !== sy || grow < 1 || softFrame++ % 2 === 0;
    if (repaint) {
      softAt = sy;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, soft.width, soft.height);
      sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
      sctx.globalCompositeOperation = blend;
      for (const b of bendsInView) {
        // The glow sits just outside the bend, where the fibres are packed tightest.
        const gx = bendX(b) + dir(b) * 18, gy = bendY(b) - sy;
        sctx.globalAlpha = fade;
        for (const [r, c] of [[Math.min(W, H) * 0.78, 2], [Math.min(W, H) * 0.3, 1], [Math.min(W, H) * 0.09, 0]] as const) glowAt(sctx, gx, gy, r, pal.glow[c]);
        // …and along the upper arm, where the recording's light spreads out with the fibres.
        const [ax, ay] = armPoint(fibres[N >> 1], b, H * 0.32, true);
        glowAt(sctx, ax, ay - sy, Math.min(W, H) * 0.5, pal.glow[2]);
      }
      if (hero && dark && sy < H * 1.5) {
        // The recording's olive haze behind the top right.
        sctx.globalAlpha = fade;
        glowAt(sctx, W * 0.8, H * 0.18 - sy, Math.max(W, H) * 0.55, pal.haze);
      }
      sctx.lineCap = 'butt';
      sctx.lineJoin = 'round';
      // A faint halo round every other fibre (the owner: crisp lines, not blurred); the fibres
      // themselves join in here once the page has scrolled them out of focus.
      for (let i = 0; i < N; i++) {
        const fb = fibres[i];
        // Behind the rest (always soft), a faint halo round the bright strands, and every other fibre
        // once the page has scrolled them out of focus.
        const halo = true, blurred = focus < 1 && i % 2 === 0;
        sctx.strokeStyle = pal.fibres[fb.colour];
        sctx.globalAlpha = fb.alpha * fade * (fb.far ? 0.5 : halo ? (fb.width > 1.2 ? 0.2 : 0.09) : 0) + (blurred ? fb.alpha * fade * (1 - focus) * (dark ? 0.5 : 0.4) : 0);
        sctx.lineWidth = fb.far ? 2.5 + fb.width * 2 : 3 + fb.width * 2 + (1 - focus) * 4;
        trace(sctx, fb);
      }
      for (const bk of bokeh) for (const b of bendsInView) {
        const [x, y] = armPoint(fibres[(bk.r * 7) % N], b, bk.d * H, bk.up);
        sctx.globalAlpha = bk.a * fade;
        sctx.fillStyle = pal.bokeh;
        sctx.beginPath();
        sctx.arc(x + bk.off * dir(b), y - sy, bk.r, 0, Math.PI * 2);
        sctx.fill();
      }
      if (near) {
        sctx.globalAlpha = pv * k;
        glowAt(sctx, px, py, 170, pal.glow[1]);
      }
    }
    if (repaint && grain) {
      // Only over what's lit (source-atop): the black stays black.
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = 'source-atop';
      sctx.globalAlpha = dark ? 0.07 : 0.05;
      sctx.fillStyle = grain;
      sctx.fillRect(0, 0, soft.width, soft.height);
      sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(soft, 0, 0, W, H);

    // 2 · The fibres in focus. Bright in the hero; in the app a little quieter, so text in front stays
    // easy to read.
    const sharp = (hero ? 1 : phone ? 0.5 : 0.6) * focus * (0.4 + 0.6 * eased);
    if (sharp > 0.02) {
      ctx.globalCompositeOperation = blend;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      for (const fb of fibres) {
        if (fb.far) continue;
        ctx.strokeStyle = pal.fibres[fb.colour];
        ctx.globalAlpha = fb.alpha * k * sharp;
        ctx.lineWidth = fb.width;
        trace(ctx, fb);
      }
      // 3 · Specks of light near each bend, twinkling, drifting slowly along the arms.
      const lit = [new Path2D(), new Path2D(), new Path2D()];
      for (const sp of specks) for (const b of bendsInView) {
        const d = (sp.d + (still ? 0 : (t * 0.012 + sp.tw) % 0.12)) * H;
        const [x, y] = armPoint(fibres[sp.f], b, d, sp.up);
        const yy = y - sy;
        if (yy < -20 || yy > H + 20) continue;
        const xx = x + sp.off * dir(b);
        const g = lit[Math.floor((Math.sin(t * 2.2 + sp.tw) + 1) * 1.49)];
        g.moveTo(xx + sp.r, yy);
        g.arc(xx, yy, sp.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = pal.speck;
      lit.forEach((g, i) => { ctx.globalAlpha = (0.25 + 0.3 * i) * k * sharp; ctx.fill(g); });
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  return { resize, draw };
}
