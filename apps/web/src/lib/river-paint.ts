// The river of light's drawing (M9/M10, see src/components/LightTrail.tsx for what it is and the
// owner's rules about it). No DOM and no React here, so the same code draws on the page or, where
// the browser can, on a background thread (src/components/river.worker.ts, M84): the river then
// never takes time from taps, typing or scrolling.

// The owner (24 Oct 2026): the light lines are hot pink with a little purple. M34 (25 Oct, the
// Karma look): kept, denser, thinner and sharper, with faster pulses that glow at their heads. M54
// made it half aqua; M56 (the owner, 31 Oct: "make the background line pink"): all Baby Pink again,
// from blush to orchid, with pink sparks and pink-white bends.
const DARK = { strands: ['#fe81d1', '#ff9fdc', '#ffc4ea', '#f468c6', '#e68ae6', '#ffb0de'], bands: ['#4a1d5e', '#8e2a72', '#a32c7b', '#5c2470', '#c23d8f'], pulse: '#ffffff', spark: '#ffd0ec' };
// M53: light mode in Bubblegum Pink and Galactic Violet.
// Light mode: pinks only since M91 (the owner kept pink as the one accent; the violets went with M53's palette).
const LIGHT = { strands: ['#c23d98', '#d24fa6', '#ec74ce', '#b2347f', '#a52d80', '#f28fd9'], bands: ['#f7b3e6', '#fbd2ef', '#fde6f6', '#f9c4e9', '#fdeaf6'], pulse: '#a52d80', spark: '#c23d98' };

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

/** Fixed for a river's life: the look, the landing's opening, Reduce Motion, a phone. */
export interface RiverOpts { tone: 'auto' | 'dark'; hero: boolean; strength: number; still: boolean; phone: boolean }
/** What changes while it runs: the scroll, the theme, the pointer (times on the drawing side's clock). */
export interface RiverState { sy: number; dark: boolean; px: number; py: number; pAt: number }

/** How often it draws while moving on its own: 60 a second on computers, 30 on phones. */
export const riverGap = (phone: boolean) => (phone ? 32 : 15);

/**
 * A river drawn into `cv` (the screen-sized canvas) with `soft` (a quarter-size canvas for the
 * out-of-focus bands). `born` is when it started, on the same clock as the `ms` passed to draw.
 */
export function makeRiver(cv: Surface, ctx: Ctx2D, soft: Surface, sctx: Ctx2D, opts: RiverOpts, born: number) {
  const { tone, hero, strength, still, phone } = opts;
  const N = still ? 40 : phone ? 44 : 84; // the fewer the strands, the less to paint each frame (M56: 120 → 84)
  // Denser in the middle of the bundle, like fibres.
  const strands = Array.from({ length: N }, (_, i) => {
    const u = (i / (N - 1)) * 2 - 1;
    const o = Math.sign(u) * Math.pow(Math.abs(u), 1.5) * 0.5;
    return { o, colour: i % 6, alpha: 0.21 + 0.63 * (1 - Math.abs(o) * 1.6), width: 0.35 + ((i * 13) % 9) / 14, speed: 0.5 + ((i * 37) % 10) / 10, phase: i * 1.37, wob: 120 + ((i * 29) % 70), pulse: i % 2 === 0 };
  });
  type Strand = (typeof strands)[number];
  const bands = [-0.9, -0.35, 0.1, 0.55, 1.0].map((o, i) => ({ o, width: [150, 90, 200, 70, 120][i], alpha: [0.1, 0.14, 0.08, 0.16, 0.1][i], colour: i, phase: i * 2.1, speed: 0.18 + i * 0.05 }));
  const sparks = Array.from({ length: phone ? 60 : 150 }, (_, i) => ({ s: (i * 7) % N, base: (i * 137) % 1000, v: 34 + ((i * 29) % 60), r: 0.6 + ((i * 17) % 14) / 10 }));
  let W = 0, H = 0;
  // The soft bands move slowly: repaint them every third frame (or after a scroll) and reuse them.
  let softFrame = 0, softAt = NaN;
  // The pointer (or finger): the strands part round it and it glows (M11). `pv` eases in and out.
  let pv = 0;
  let ys = new Float32Array(0), cs = new Float32Array(0), ss = new Float32Array(0);

  /** The screen's size in CSS pixels and the device's pixel ratio (capped: ≤2.2 M pixels drawn). */
  const resize = (w: number, h: number, ratio: number) => {
    W = w; H = h;
    const dpr = Math.min(1.5, ratio || 1, Math.sqrt(2.2e6 / Math.max(1, W * H)));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    soft.width = Math.max(1, Math.round(W / 4)); soft.height = Math.max(1, Math.round(H / 4));
    sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    const most = Math.ceil((H + 160) / 12) + 2;
    ys = new Float32Array(most); cs = new Float32Array(most); ss = new Float32Array(most);
  };

  const draw = (ms: number, s: RiverState) => {
    const { sy, px, py, pAt } = s;
    const t = still ? 8 : ms / 1000;
    const dark = tone === 'dark' || s.dark;
    const pal = dark ? DARK : LIGHT;
    const k = (dark ? 1 : 0.85) * strength;
    const P = Math.max(1100, H * 1.55); // one full swing, left to right and back
    const wide = W >= 1024;
    // The path, in page coordinates. On the landing page the first bend sits in the hero's gap
    // (a narrower swing to start with, growing to the full width further down).
    const knot = H * 0.46;
    const phi = hero ? -Math.PI / 2 - (2 * Math.PI * knot) / P : 0.6;
    const ramp = (y: number) => (hero ? Math.min(1, Math.max(0, (y - knot) / (H * 1.1))) : 1);
    const theta = (y: number) => (2 * Math.PI * y) / P + phi;
    const centre = (y: number) => {
      const r = ramp(y);
      const c = hero && wide ? 0.63 - 0.13 * r : 0.5;
      const A = hero && wide ? 0.15 + 0.2 * r : W < 640 ? 0.3 : 0.36;
      return W * (c + A * Math.sin(theta(y)) + 0.018 * Math.sin(t * 0.35 + y / 650) + 0.008 * Math.sin(t * 0.9 + y / 260));
    };
    const spread = (y: number) => W * (0.01 + 0.08 * Math.abs(Math.cos(theta(y))));
    // On arrival (landing page), the river pours in from the top over ~1.8 s.
    const grow = hero && !still ? Math.min(1, (ms - born) / 1800) : 1;
    const eased = 1 - Math.pow(1 - grow, 3);
    const y0 = sy - 80;
    const y1 = Math.min(sy + H + 80, hero && grow < 1 ? -80 + eased * (H * 1.25) : Infinity);
    ctx.clearRect(0, 0, W, H);
    if (y1 <= y0) return;
    // The heights in view, with the river's middle and width at each: worked out once a frame and
    // shared by every strand and band (most of the drawing's arithmetic).
    const step = phone ? 16 : 12;
    let n = 0;
    for (let y = y0; y <= y1 && n < ys.length; y += step, n++) { ys[n] = y; cs[n] = centre(y); ss[n] = spread(y); }
    const trace = (c: Ctx2D, x: (j: number) => number) => {
      c.beginPath();
      c.moveTo(x(0), ys[0] - sy);
      for (let j = 1; j < n; j++) c.lineTo(x(j), ys[j] - sy);
      c.stroke();
    };
    pv += ((ms - pAt < 2500 ? 1 : 0) - pv) * 0.08;
    const near = pv > 0.01;
    // Strands near the pointer lean away from it, smoothly (no jump at its centre), like hair.
    const part = (x: number, y: number) => {
      if (!near) return 0;
      const dy = y - sy - py, dx = x - px;
      if (dy > 420 || dy < -420) return 0;
      return pv * 70 * Math.exp(-(dy * dy) / 45000) * (dx / 130) * Math.exp(-(dx * dx) / 33800);
    };
    const lean = (st: Strand, y: number) => Math.sin(y / st.wob + t * st.speed + st.phase) * (4 + 10 * Math.abs(st.o));
    // A strand's x at any height (pulses and sparks), and at the j-th height in view (the strands).
    const strandX = (st: Strand, y: number) => {
      const x = centre(y) + st.o * 2 * spread(y) + lean(st, y);
      return x + part(x, y);
    };
    const strandAt = (st: Strand) => (j: number) => {
      const x = cs[j] + st.o * 2 * ss[j] + lean(st, ys[j]);
      return x + part(x, ys[j]);
    };

    // 1 · The soft bands (a quarter-size canvas, stretched: soft-focus light).
    const repaint = still || softAt !== sy || grow < 1 || softFrame++ % 3 === 0;
    if (repaint) {
      softAt = sy;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, soft.width, soft.height);
      sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
      sctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      sctx.lineCap = 'round';
      sctx.lineJoin = 'round';
      for (const b of bands) {
        sctx.strokeStyle = pal.bands[b.colour];
        sctx.globalAlpha = b.alpha * k * (0.4 + 0.6 * eased) * (hero ? 1 : 0.7);
        sctx.lineWidth = b.width * (phone ? 0.6 : 1);
        trace(sctx, (j) => cs[j] + b.o * ss[j] * 1.3 + Math.sin(t * b.speed + b.phase + ys[j] / 520) * 46);
      }
      // A glow where the pointer touches the river.
      if (near && Math.abs(px - centre(sy + py)) < spread(sy + py) + 220) {
        const g = sctx.createRadialGradient(px, py, 0, px, py, 180);
        g.addColorStop(0, dark ? 'rgba(255,192,230,0.35)' : 'rgba(236,116,206,0.14)');
        g.addColorStop(1, 'rgba(43,53,104,0)');
        sctx.globalAlpha = pv * k;
        sctx.fillStyle = g;
        sctx.fillRect(px - 180, py - 180, 360, 360);
      }
      // A white-hot glow at each bend in view (bends are where the swing turns: theta = π/2 + nπ).
      for (let b = Math.floor(((2 * Math.PI * (y0 - 300)) / P + phi - Math.PI / 2) / Math.PI); ; b++) {
        const yb = ((Math.PI / 2 + b * Math.PI - phi) * P) / (2 * Math.PI);
        if (yb > y1 + 300) break;
        const bx = centre(yb), by = yb - sy, r = Math.min(W, H) * 0.3;
        const g = sctx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, dark ? 'rgba(255,240,250,0.5)' : 'rgba(236,116,206,0.18)');
        g.addColorStop(0.25, dark ? 'rgba(254,129,209,0.24)' : 'rgba(194,61,152,0.1)');
        g.addColorStop(1, 'rgba(43,53,104,0)');
        sctx.globalAlpha = k;
        sctx.fillStyle = g;
        sctx.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(soft, 0, 0, W, H);

    // 2 · The fine strands. Bright in the hero; further down (and in the app) mostly the soft glow,
    // so text in front stays easy to read.
    const sharp = hero ? 1 - 0.5 * ramp(sy + H * 0.5) : phone ? 0.7 : 0.85;
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    // Square ends and corners: the same look on lines this thin, and cheaper to paint.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    for (const st of strands) {
      ctx.strokeStyle = pal.strands[st.colour];
      ctx.globalAlpha = st.alpha * k * sharp;
      ctx.lineWidth = st.width;
      trace(ctx, strandAt(st));
    }
    // 3 · Pulses: short bright dashes running down every other strand, each with a soft glow round
    // it (a wide faint pass, then the bright core). Only the dashes themselves are drawn, all in one
    // path (dashing every whole strand was most of the river's cost). Anchored to the page, so they
    // don't slide when you scroll.
    if (!still) {
      const dashes = new Path2D();
      for (const st of strands) {
        if (!st.pulse) continue;
        const len = 18 + (st.phase % 16), period = len + 150 + (st.wob % 90);
        const run = (t * 220 * st.speed + st.phase * 40) % period;
        for (let head = Math.floor((y0 - run) / period) * period + run; head - len < y1; head += period) {
          const a = Math.max(y0, head - len), e = Math.min(y1, head);
          if (e <= a) continue;
          dashes.moveTo(strandX(st, a), a - sy);
          dashes.lineTo(strandX(st, (a + e) / 2), (a + e) / 2 - sy);
          dashes.lineTo(strandX(st, e), e - sy);
        }
      }
      ctx.strokeStyle = pal.pulse;
      ctx.lineCap = 'round';
      if (!phone) {
        ctx.globalAlpha = 0.16 * k * sharp;
        ctx.lineWidth = 4.2;
        ctx.stroke(dashes);
      }
      ctx.globalAlpha = 0.8 * k * sharp;
      ctx.lineWidth = 1.3;
      ctx.stroke(dashes);
    }
    // 4 · Sparks drifting down the strands, twinkling (three brightnesses, one fill each).
    const glints = [new Path2D(), new Path2D(), new Path2D()];
    for (const sp of sparks) {
      const ys1 = ((sp.base + t * sp.v) % (H + 120)) - 60;
      const y = sy + ys1;
      if (y < y0 || y > y1) continue;
      const x = strandX(strands[sp.s], y);
      const tw = Math.abs(Math.sin(t * 2.3 + sp.s));
      const g = glints[tw < 0.33 ? 0 : tw < 0.66 ? 1 : 2];
      g.moveTo(x + sp.r, ys1);
      g.arc(x, ys1, sp.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = pal.spark;
    glints.forEach((g, i) => { ctx.globalAlpha = (0.4 + 0.3 * i) * k; ctx.fill(g); });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  return { resize, draw };
}
