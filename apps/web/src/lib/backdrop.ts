import { appById, type AppId } from './apps';

// Each app's own background (M129, the owner, 9 Nov 2026: "remove the river line… a good one for
// each app… when i switch to any app on the main page the background needs to change"). One canvas
// behind the page (src/components/AppBackdrop.tsx) shows a slow scene in the app's own colour:
//   · UniVersity: a night of study: maths and marking signs drifting up, sheets of paper rising (M171:
//     in place of the stars joined into constellations, the owner: "not important at all");
//   · Trace: a dotted globe turning, shipments arcing between places, a ring where each one lands;
//   · Relief: a map's contour lines drifting, requests for help pulsing, help travelling to them;
//   · Green: an aurora waving across the top, leaves drifting down, fireflies rising;
//   · Play: a neon floor running to the horizon, game-pad symbols floating above it.
// Switching apps is a transition (1 s): the old scene fades as it drifts towards you while the new one
// settles in from a little further away (only the fade with Reduce Motion); the first one arrives in
// 1.1 s, and the scenes' own motion eases in rather than starting with a jolt.
// Two layers: soft light (pools of colour, the aurora) drawn at a quarter of the size and stretched (a
// free blur that also works in Safari), then the sharp lines and dots at full size. Smooth and cheap: at
// most 2 M pixels (up to 1.5x), 30 frames a second, resting when the person leaves the page alone (M225); positions kept
// as fractions of the screen, so a phone's address bar coming and going never rebuilds a scene.

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;
type Rgb = readonly [number, number, number];

/** `strength` 0–1; `still`: Reduce Motion (only the fades move); `phone`: fewer things, fewer frames. */
export interface BackdropOpts { strength: number; still: boolean; phone: boolean }
/** The screen in CSS pixels, its pixel scale `s`, and the zoom `z` (with its offset) of the scene
 *  being drawn: scenes zoom a little while one app's scene gives way to the next. */
interface View { w: number; h: number; s: number; z: number; ox: number; oy: number; dark: boolean; phone: boolean }
interface Hue { base: Rgb; alt: Rgb }
interface Scene { soft(c: Ctx, t: number, a: number): void; sharp(c: Ctx, t: number, a: number): void }
type Make = (v: View, rnd: () => number, hue: Hue) => Scene;

const TAU = Math.PI * 2;
const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [10, 12, 16];
const rgb = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (c: Rgb, d: Rgb, k: number): Rgb => [0, 1, 2].map((i) => Math.round(c[i] + (d[i] - c[i]) * k)) as unknown as Rgb;
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Lines and dots: lighter on the dark page, deeper on the light one. */
const ink = (c: Rgb, dark: boolean) => (dark ? mix(c, WHITE, 0.3) : mix(c, INK, 0.25));
const wrap = (x: number, m: number) => ((x % m) + m) % m;

/** Each app's colour (src/lib/apps.ts) and a second one that sits well beside it. */
const ALT: Record<AppId, Rgb> = { campus: [56, 189, 248], trace: [167, 139, 250], relief: [251, 191, 36], green: [45, 212, 191], travel: [253, 186, 116], lab: [56, 189, 248] };
/** Green's fireflies. */
const FIREFLY: Rgb = [253, 230, 168];
/** M132: UniVersity wears the site's own accent (blue, lighter on the dark page since M212), as its buttons do. */
const CAMPUS = { dark: { base: [110, 162, 248] as Rgb, alt: [56, 189, 248] as Rgb }, light: { base: [37, 99, 235] as Rgb, alt: [56, 189, 248] as Rgb } };
const SEED: Record<AppId, number> = { campus: 11, trace: 23, relief: 37, green: 41, travel: 67, lab: 79 };

/** A small seeded random (mulberry32): a scene looks the same on every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise in 3D (value noise, two octaves), 0–1: the globe's land, the map's hills. */
function hash3(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (u: number) => u * u * (3 - 2 * u);
  const xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
  const l = (p: number, q: number, k: number) => p + (q - p) * k;
  const n = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), xf), l(n(0, 1, 0), n(1, 1, 0), xf), yf), l(l(n(0, 0, 1), n(1, 0, 1), xf), l(n(0, 1, 1), n(1, 1, 1), xf), yf), zf);
}
const fbm = (x: number, y: number, z: number, seed: number) => noise3(x, y, z, seed) * 0.65 + noise3(x * 2.1, y * 2.1, z * 2.1, seed + 7) * 0.35;

/** Contour lines of a grid of values (marching squares): segments as x1, y1, x2, y2 in grid units. */
export function contours(field: ArrayLike<number>, cols: number, rows: number, level: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      // Corners: a top left, b top right, c bottom right, d bottom left.
      const a = field[j * cols + i], b = field[j * cols + i + 1], c = field[(j + 1) * cols + i + 1], d = field[(j + 1) * cols + i];
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      // Where the line crosses each edge: top, right, bottom, left.
      const T = [i + (level - a) / (b - a), j], R = [i + 1, j + (level - b) / (c - b)];
      const B = [i + (level - d) / (c - d), j + 1], L = [i, j + (level - a) / (d - a)];
      const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1: case 14: seg(L, B); break;
        case 2: case 13: seg(B, R); break;
        case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(T, R); break;
        case 5: seg(L, T); seg(B, R); break;
        case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(L, T); break;
        case 10: seg(T, R); seg(L, B); break;
      }
    }
  }
  return out;
}

/** A soft round pool of colour (drawn on the soft layer). */
function pool(c: Ctx, x: number, y: number, r: number, col: Rgb, a: number) {
  if (a <= 0.003 || r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.globalAlpha = 1;
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The two wide pools of the app's colours every scene sits in, drifting slowly. */
function wash(c: Ctx, v: View, t: number, a: number, hue: Hue, at: readonly [number, number, number, number]) {
  const k = (v.dark ? 0.3 : 0.16) * a, big = Math.max(v.w, v.h);
  pool(c, v.w * (at[0] + 0.04 * Math.sin(t * 0.05)), v.h * (at[1] + 0.03 * Math.cos(t * 0.04)), big * 0.6, hue.base, k);
  pool(c, v.w * (at[2] + 0.04 * Math.cos(t * 0.045)), v.h * (at[3] + 0.03 * Math.sin(t * 0.05)), big * 0.55, hue.alt, k * 0.75);
}

/** A rounded rectangle's outline as the current path. */
function rounded(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Draw in a turned frame centred on (x, y), then back to the page's frame. */
function turned(c: Ctx, v: View, x: number, y: number, angle: number, draw: () => void) {
  const k = v.s * v.z, cos = Math.cos(angle) * k, sin = Math.sin(angle) * k;
  c.setTransform(cos, sin, -sin, cos, x * k + v.ox, y * k + v.oy);
  draw();
  pageFrame(c, v);
}

/** The page's frame for the scene being drawn (with its zoom). */
const pageFrame = (c: Ctx, v: View) => c.setTransform(v.s * v.z, 0, 0, v.s * v.z, v.ox, v.oy);

// ── UniVersity: a night of study ──
const campus: Make = (v, rnd, hue) => {
  // The signs of a study night: written as if in chalk, each drifting up and turning a little.
  // Thin maths signs only (no solid stars or ticks): soft, like chalk half wiped away.
  const SIGNS = ['π', '∑', '√x', '∫', 'x²', 'Δ', '∞', 'λ', 'f(x)', 'θ', 'E=mc²', '∂', 'α', '≈', 'Ω', 'a+b', 'dy/dx', 'sin θ'];
  const n = v.phone ? 10 : 20;
  const signs = Array.from({ length: n }, (_, i) => {
    const z = 0.4 + rnd() * 0.6, size = Math.round((13 + 24 * z) * (v.phone ? 0.85 : 1));
    return { x: (i + rnd()) / n, y: rnd() * 1.2, z, text: SIGNS[Math.floor(rnd() * SIGNS.length)], font: `italic ${size}px "Instrument Serif", Georgia, serif`, r: (rnd() - 0.5) * 0.5, ph: rnd() * TAU, tw: 0.25 + rnd() * 0.5 };
  });
  const sheets = v.phone ? 4 : 7;
  const pages = Array.from({ length: sheets }, (_, i) => ({ x: (i + 0.3 + rnd() * 0.4) / sheets, y: rnd() * 1.3, z: 0.45 + rnd() * 0.55, size: 46 + rnd() * 60, r: (rnd() - 0.5) * 0.8, ph: rnd() * TAU }));
  const glows = Array.from({ length: 5 }, () => ({ x: rnd(), y: rnd(), r: 0.06 + rnd() * 0.08, ph: rnd() * TAU, alt: rnd() < 0.4 }));
  return {
    soft(c, t, a) {
      wash(c, v, t, a, hue, [0.15, 0.2, 0.85, 0.85]);
      const big = Math.max(v.w, v.h);
      for (const g of glows) pool(c, g.x * v.w, wrap(g.y - t * 0.006, 1.2) * v.h - 0.1 * v.h, g.r * big, g.alt ? hue.alt : hue.base, (v.dark ? 0.22 : 0.12) * a * (0.6 + 0.4 * Math.sin(t * 0.3 + g.ph)));
    },
    sharp(c, t, a) {
      const line = ink(hue.base, v.dark), chalk = v.dark ? mix(hue.base, WHITE, 0.7) : mix(hue.base, INK, 0.35);
      const fadeAt = v.h * 0.12;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = rgb(chalk);
      for (const g of signs) {
        const x = (g.x + 0.012 * Math.sin(t * 0.05 + g.ph)) * v.w, y = (wrap(g.y - t * 0.006 * (0.4 + g.z), 1.2) - 0.1) * v.h;
        const edge = Math.max(0, Math.min(1, y / fadeAt, (v.h - y) / fadeAt));
        if (!edge) continue;
        c.globalAlpha = a * edge * g.z * (v.dark ? 0.26 : 0.22) * (0.75 + 0.25 * Math.sin(t * g.tw + g.ph));
        c.font = g.font;
        turned(c, v, x, y, g.r + 0.12 * Math.sin(t * 0.07 + g.ph), () => c.fillText(g.text, 0, 0));
      }
      // Sheets of paper rising slowly, swaying a little.
      c.lineWidth = 1;
      for (const p of pages) {
        const x = (p.x + 0.015 * Math.sin(t * 0.12 + p.ph)) * v.w, y = (wrap(p.y - t * 0.008 * (0.5 + p.z), 1.3) - 0.15) * v.h;
        const w = p.size * p.z * (v.phone ? 0.8 : 1), h = w * 1.3;
        turned(c, v, x, y, p.r + 0.25 * Math.sin(t * 0.1 + p.ph), () => {
          rounded(c, -w / 2, -h / 2, w, h, Math.min(6, w * 0.08));
          c.fillStyle = rgb(line);
          c.globalAlpha = a * 0.05 * p.z;
          c.fill();
          c.strokeStyle = rgb(line);
          c.globalAlpha = a * 0.32 * p.z;
          c.stroke();
          c.globalAlpha = a * 0.22 * p.z;
          c.beginPath();
          for (let k = 0; k < 5; k++) {
            const ly = -h / 2 + h * (0.22 + k * 0.14);
            c.moveTo(-w / 2 + w * 0.16, ly);
            c.lineTo(w / 2 - w * (k === 4 ? 0.45 : 0.16), ly);
          }
          c.stroke();
        });
      }
    },
  };
};

// ── Trace: a dotted globe, shipments arcing between places ──
const trace: Make = (v, rnd, hue) => {
  const N = v.phone ? 3000 : 6000; // about 16 px apart: reads as a dotted globe
  const P = new Float32Array(N * 3), land: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) * 2) / N, r = Math.sqrt(1 - y * y), th = i * golden;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    if (fbm(x * 1.8 + 5, y * 1.8 + 5, z * 1.8 + 5, 19) > 0.52) land.push(i);
  }
  const isLand = new Uint8Array(N);
  for (const i of land) isLand[i] = 1;
  const arcs: { a: number; b: number; born: number; life: number }[] = [];
  const K = v.phone ? 3 : 5, tilt = -0.38, cp = Math.cos(tilt), sp = Math.sin(tilt);
  let ct = 1, st = 0, cx = 0, cy = 0, R = 1;
  const out = [0, 0, 0];
  /** Screen x, y and depth (1 facing us, below 0 behind) of a point on the turning globe. */
  const project = (x: number, y: number, z: number) => {
    const x1 = x * ct + z * st, z1 = -x * st + z * ct;
    out[0] = cx + x1 * R; out[1] = cy - (y * cp - z1 * sp) * R; out[2] = y * sp + z1 * cp;
    return out;
  };
  const depth = (i: number) => project(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])[2];
  const spawn = (t: number, early: boolean) => {
    let a = land[Math.floor(rnd() * land.length)];
    for (let k = 0; k < 20 && depth(a) < 0.35; k++) a = land[Math.floor(rnd() * land.length)];
    let b = a;
    for (let k = 0; k < 40; k++) {
      const c = land[Math.floor(rnd() * land.length)];
      const dot = P[a * 3] * P[c * 3] + P[a * 3 + 1] * P[c * 3 + 1] + P[a * 3 + 2] * P[c * 3 + 2];
      b = c;
      if (dot < Math.cos(0.35) && dot > Math.cos(1.1)) break;
    }
    const life = 4.5 + rnd() * 2;
    return { a, b, life, born: early ? t - rnd() * life : t };
  };
  /** A point on the arc from a to b, lifted off the ground in the middle. */
  const along = (a: number, b: number, s: number) => {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    const om = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))) || 1e-3;
    const p = Math.sin((1 - s) * om) / Math.sin(om), q = Math.sin(s * om) / Math.sin(om), lift = 1 + 0.2 * om * Math.sin(Math.PI * s);
    return project((ax * p + bx * q) * lift, (ay * p + by * q) * lift, (az * p + bz * q) * lift);
  };
  const place = () => {
    R = v.phone ? v.w * 0.62 : Math.min(v.h * 0.46, v.w * 0.32);
    cx = v.w * (v.phone ? 0.55 : 0.72);
    cy = v.h * (v.phone ? 0.82 : 0.58);
  };
  return {
    soft(c, t, a) {
      place();
      wash(c, v, t, a, hue, [0.12, 0.15, 0.8, 0.9]);
      pool(c, cx, cy, R * 1.3, hue.base, (v.dark ? 0.22 : 0.12) * a); // the globe's air
    },
    sharp(c, t, a) {
      place();
      ct = Math.cos(t * 0.06); st = Math.sin(t * 0.06);
      const dot = ink(hue.base, v.dark), bright = v.dark ? mix(hue.base, WHITE, 0.7) : mix(hue.base, INK, 0.4);
      // The rim, then the dots: land bright, sea faint, the far side darker.
      c.strokeStyle = rgb(dot);
      c.lineWidth = 1;
      c.globalAlpha = a * 0.2;
      c.beginPath();
      c.arc(cx, cy, R, 0, TAU);
      c.stroke();
      const sea = rgb(dot);
      const big = v.phone ? 1.5 : 1.8, ground = rgb(v.dark ? mix(hue.base, WHITE, 0.45) : mix(hue.base, INK, 0.3));
      for (let i = 0; i < N; i++) {
        const [x, y, z] = project(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        if (z <= 0) continue;
        const shade = 0.25 + 0.75 * z;
        if (isLand[i]) { c.fillStyle = ground; c.globalAlpha = a * shade; c.fillRect(x - big / 2, y - big / 2, big, big); }
        else if (i % 3 === 0) { c.fillStyle = sea; c.globalAlpha = a * 0.14 * shade; c.fillRect(x - 0.5, y - 0.5, 1, 1); }
      }
      // Shipments: an arc grows from one place to another, a bright head leading, a ring where it lands.
      while (arcs.length < K) arcs.push(spawn(t, true)); // the first ones already on their way
      c.strokeStyle = rgb(bright);
      c.fillStyle = rgb(bright);
      for (let k = 0; k < arcs.length; k++) {
        const arc = arcs[k], u = (t - arc.born) / arc.life;
        if (u >= 1 || u < 0) { arcs[k] = spawn(t, false); continue; }
        const head = Math.min(1, u / 0.55), tail = Math.max(0, (u - 0.45) / 0.55);
        c.lineWidth = 1.4;
        c.globalAlpha = a * 0.8;
        c.beginPath();
        let open = false;
        for (let s = 0; s <= 28; s++) {
          const [x, y, z] = along(arc.a, arc.b, tail + ((head - tail) * s) / 28);
          if (z < -0.05) { open = false; continue; }
          if (open) c.lineTo(x, y); else { c.moveTo(x, y); open = true; }
        }
        c.stroke();
        if (u < 0.55) {
          const [x, y, z] = along(arc.a, arc.b, head);
          if (z > -0.05) { c.globalAlpha = a; c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill(); }
        } else {
          const [x, y, z] = project(P[arc.b * 3], P[arc.b * 3 + 1], P[arc.b * 3 + 2]);
          const k2 = (u - 0.55) / 0.45;
          if (z > 0) { c.lineWidth = 1; c.globalAlpha = a * 0.8 * (1 - k2); c.beginPath(); c.arc(x, y, 3 + k2 * 16, 0, TAU); c.stroke(); }
        }
      }
    },
  };
};

// ── Relief: a map's contours, requests pulsing, help on its way ──
const relief: Make = (v, rnd, hue) => {
  const levels = 10, margin = 40;
  let map: { w: number; h: number; g: number; segs: number[][] } | null = null;
  const build = () => {
    const g = v.phone ? 26 : 30, h = v.h * 1.2;
    const cols = Math.ceil((v.w + margin * 2) / g) + 1, rows = Math.ceil((h + margin * 2) / g) + 1;
    const f = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) f[j * cols + i] = fbm((i * g) / 300, (j * g) / 300, 0.5, 37);
    map = { w: v.w, h, g, segs: Array.from({ length: levels }, (_, k) => contours(f, cols, rows, 0.3 + k * 0.045)) };
  };
  const pins = Array.from({ length: v.phone ? 4 : 7 }, (_, i) => ({ x: 0.08 + rnd() * 0.84, y: 0.12 + rnd() * 0.76, ph: rnd() * 3.2, need: i % 2 === 1 }));
  const routes = [[0, 1], [2, 3], [4, 5]].filter(([, q]) => q < pins.length);
  const curve = (p: { x: number; y: number }, q: { x: number; y: number }, s: number) => {
    const x0 = p.x * v.w, y0 = p.y * v.h, x1 = q.x * v.w, y1 = q.y * v.h;
    const mx = (x0 + x1) / 2 - (y1 - y0) * 0.25, my = (y0 + y1) / 2 + (x1 - x0) * 0.25;
    const u = 1 - s;
    return [u * u * x0 + 2 * u * s * mx + s * s * x1, u * u * y0 + 2 * u * s * my + s * s * y1, mx, my, x0, y0, x1, y1];
  };
  return {
    soft(c, t, a) {
      wash(c, v, t, a, hue, [0.2, 0.25, 0.85, 0.8]);
      for (const p of pins) pool(c, p.x * v.w, p.y * v.h, 46, p.need ? hue.base : hue.alt, (v.dark ? 0.4 : 0.22) * a);
    },
    sharp(c, t, a) {
      if (!map || map.w !== v.w || map.h < v.h) build();
      const { g, segs } = map!;
      const ox = -margin + 16 * Math.sin(t * 0.03), oy = -margin + 12 * Math.cos(t * 0.025);
      const line = ink(hue.base, v.dark);
      c.strokeStyle = rgb(line);
      for (let k = 0; k < levels; k++) {
        const index = k % 3 === 0; // every third line bolder, as on a real map
        c.lineWidth = index ? 1.2 : 0.7;
        c.globalAlpha = a * (index ? 0.26 : 0.14);
        c.beginPath();
        const s = segs[k];
        for (let i = 0; i < s.length; i += 4) { c.moveTo(ox + s[i] * g, oy + s[i + 1] * g); c.lineTo(ox + s[i + 2] * g, oy + s[i + 3] * g); }
        c.stroke();
      }
      // Help on its way: a dashed route moving from a helper to a request, a dot travelling along it.
      const warm = ink(hue.alt, v.dark);
      c.strokeStyle = rgb(warm);
      c.fillStyle = rgb(warm);
      c.lineWidth = 1.2;
      routes.forEach(([p, q], i) => {
        const [, , mx, my, x0, y0, x1, y1] = curve(pins[p], pins[q], 0);
        c.globalAlpha = a * 0.45;
        c.setLineDash([4, 7]);
        c.lineDashOffset = -t * 14;
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo(mx, my, x1, y1);
        c.stroke();
        c.setLineDash([]);
        const [x, y] = curve(pins[p], pins[q], wrap(t * 0.12 + i * 0.3, 1));
        c.globalAlpha = a * 0.9;
        c.beginPath();
        c.arc(x, y, 2.4, 0, TAU);
        c.fill();
      });
      // Requests and helpers: a dot, rings spreading from it.
      for (const p of pins) {
        const col = rgb(ink(p.need ? hue.base : hue.alt, v.dark)), x = p.x * v.w, y = p.y * v.h;
        c.strokeStyle = col;
        c.fillStyle = col;
        c.lineWidth = 1.2;
        for (const lag of [0, 1.6]) {
          const age = wrap(t + p.ph + lag, 3.2) / 3.2;
          c.globalAlpha = a * 0.6 * (1 - age) * (1 - age);
          c.beginPath();
          c.arc(x, y, 4 + age * 56, 0, TAU);
          c.stroke();
        }
        c.globalAlpha = a * 0.95;
        c.beginPath();
        c.arc(x, y, 3, 0, TAU);
        c.fill();
      }
    },
  };
};

// ── Green: an aurora, leaves drifting down, fireflies rising ──
const green: Make = (v, rnd, hue) => {
  const ribbons = [0, 1, 2].map((i) => ({ yb: 0.16 + i * 0.07, amp: 0.05 + rnd() * 0.03, k1: 1.5 + rnd(), k2: 3 + rnd() * 2, s1: 0.12 + rnd() * 0.08, s2: 0.07 + rnd() * 0.05, ph: rnd() * TAU, top: 0.16 + rnd() * 0.08, alt: i === 1 }));
  const leaves = Array.from({ length: v.phone ? 9 : 16 }, () => ({ x: rnd(), y: rnd() * 1.2, z: 0.4 + rnd() * 0.6, s: 10 + rnd() * 12, vy: 0.012 + rnd() * 0.01, sw: 0.3 + rnd() * 0.4, rs: (rnd() - 0.5) * 0.6, ph: rnd() * TAU, alt: rnd() < 0.35 }));
  const flies = Array.from({ length: v.phone ? 12 : 22 }, () => ({ x: rnd(), y: rnd(), z: 0.4 + rnd() * 0.6, ph: rnd() * TAU, tw: 0.8 + rnd() * 1.4 }));
  const STEPS = 40, ys = new Float32Array(STEPS + 1);
  return {
    soft(c, t, a) {
      wash(c, v, t, a, hue, [0.25, 0.1, 0.8, 0.95]);
      // Each curtain: bands stacked upward along its wave, bright at the foot and fading to nothing at
      // the top (the soft layer's stretch blends them), its height rippling along the way.
      const k = (v.dark ? 1 : 0.35) * a, bands = 7;
      for (const r of ribbons) {
        const yb = r.yb * v.h, A = r.amp * v.h, step = (r.top * v.h) / bands;
        for (let i = 0; i <= STEPS; i++) {
          const u = i / STEPS;
          ys[i] = yb + A * Math.sin(u * r.k1 * Math.PI + t * r.s1 + r.ph) + A * 0.5 * Math.sin(u * r.k2 * Math.PI - t * r.s2);
        }
        c.strokeStyle = rgb(r.alt ? hue.alt : hue.base);
        c.lineWidth = step * 1.6;
        for (let j = -1; j < bands; j++) {
          c.globalAlpha = k * (j < 0 ? 0.14 : 0.34 * (1 - j / bands) ** 1.6);
          c.beginPath();
          for (let i = 0; i <= STEPS; i++) {
            const u = i / STEPS, y = ys[i] - (j + 0.5) * step * (0.65 + 0.35 * Math.sin(u * 7 + t * 0.25 + r.ph));
            if (i) c.lineTo(u * v.w, y); else c.moveTo(0, y);
          }
          c.stroke();
        }
      }
    },
    sharp(c, t, a) {
      for (const l of leaves) {
        const x = (l.x + 0.035 * Math.sin(t * l.sw + l.ph)) * v.w, y = (wrap(l.y + t * l.vy * l.z, 1.2) - 0.1) * v.h;
        const s = l.s * (0.6 + l.z * 0.6), col = ink(l.alt ? hue.alt : hue.base, v.dark);
        turned(c, v, x, y, l.ph + t * l.rs + 0.5 * Math.sin(t * l.sw * 1.3 + l.ph), () => {
          c.beginPath();
          c.moveTo(0, -s);
          c.quadraticCurveTo(s * 0.62, -s * 0.15, 0, s);
          c.quadraticCurveTo(-s * 0.62, -s * 0.15, 0, -s);
          c.fillStyle = rgb(col);
          c.globalAlpha = a * (v.dark ? 0.34 : 0.3) * l.z;
          c.fill();
          c.strokeStyle = rgb(col);
          c.lineWidth = 0.8;
          c.globalAlpha = a * 0.55 * l.z;
          c.beginPath();
          c.moveTo(0, -s * 0.85);
          c.lineTo(0, s * 1.15);
          c.stroke();
        });
      }
      c.fillStyle = rgb(v.dark ? FIREFLY : mix(FIREFLY, INK, 0.45));
      for (const f of flies) {
        const x = (f.x + 0.012 * Math.sin(t * 0.5 + f.ph)) * v.w, y = wrap(f.y - t * 0.01 * f.z, 1) * v.h, r = 1 + f.z * 1.4;
        c.globalAlpha = a * f.z * (0.25 + 0.75 * Math.max(0, Math.sin(t * f.tw + f.ph)));
        c.fillRect(x - r / 2, y - r / 2, r, r);
      }
    },
  };
};

// ── Travel: dashed routes arcing between places, paper planes flying them, clouds drifting (M202) ──
interface Route { a: { x: number; y: number }; b: { x: number; y: number }; lift: number; sp: number; ph: number; alt: boolean }
const travel: Make = (v, rnd, hue) => {
  const clouds = Array.from({ length: v.phone ? 4 : 7 }, () => ({ x: rnd(), y: 0.06 + rnd() * 0.5, z: 0.4 + rnd() * 0.6, w: 0.1 + rnd() * 0.12, vx: 0.004 + rnd() * 0.006 }));
  const routes: Route[] = Array.from({ length: v.phone ? 3 : 5 }, () => ({
    a: { x: 0.06 + rnd() * 0.4, y: 0.3 + rnd() * 0.6 }, b: { x: 0.54 + rnd() * 0.4, y: 0.25 + rnd() * 0.65 },
    lift: 0.12 + rnd() * 0.18, sp: 0.025 + rnd() * 0.025, ph: rnd(), alt: rnd() < 0.4,
  }));
  // A point a share `u` along a route's arc (a curve lifted above the straight line), and its heading.
  const at = (r: Route, u: number) => {
    const cx = (r.a.x + r.b.x) / 2, cy = Math.min(r.a.y, r.b.y) - r.lift, w = 1 - u;
    const x = w * w * r.a.x + 2 * w * u * cx + u * u * r.b.x, y = w * w * r.a.y + 2 * w * u * cy + u * u * r.b.y;
    const dx = 2 * w * (cx - r.a.x) + 2 * u * (r.b.x - cx), dy = 2 * w * (cy - r.a.y) + 2 * u * (r.b.y - cy);
    return { x: x * v.w, y: y * v.h, ang: Math.atan2(dy * v.h, dx * v.w) };
  };
  return {
    soft(c, t, a) {
      wash(c, v, t, a, hue, [0.3, 0.15, 0.75, 0.85]);
      c.fillStyle = rgb(v.dark ? mix(hue.base, WHITE, 0.55) : WHITE);
      for (const cl of clouds) {
        const x = (wrap(cl.x + t * cl.vx * cl.z, 1.3) - 0.15) * v.w, y = cl.y * v.h, w = cl.w * v.w;
        c.globalAlpha = a * (v.dark ? 0.06 : 0.3) * cl.z;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x + (i - 1.5) * w * 0.28, y - Math.sin(i * 1.3) * w * 0.08, w * 0.3, w * 0.15, 0, 0, TAU); c.fill(); }
      }
    },
    sharp(c, t, a) {
      for (const r of routes) {
        const col = rgb(ink(r.alt ? hue.alt : hue.base, v.dark));
        c.strokeStyle = col; c.fillStyle = col;
        c.setLineDash([4, 7]); c.lineWidth = 1.2; c.globalAlpha = a * 0.32;
        c.beginPath();
        for (let i = 0; i <= 36; i++) { const p = at(r, i / 36); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = a * 0.5;
        for (const e of [r.a, r.b]) { c.beginPath(); c.arc(e.x * v.w, e.y * v.h, 3, 0, TAU); c.fill(); }
        // The plane fades in as it leaves and out as it lands.
        const u = wrap(t * r.sp + r.ph, 1), p = at(r, u);
        turned(c, v, p.x, p.y, p.ang, () => {
          c.globalAlpha = a * 0.75 * Math.sin(Math.PI * u);
          c.beginPath(); c.moveTo(9, 0); c.lineTo(-7, -6); c.lineTo(-3, 0); c.lineTo(-7, 6); c.closePath(); c.fill();
        });
      }
    },
  };
};

/** M376: Lab: faint graph paper with a few curves drifting along it, like plots being drawn. */
const lab: Make = (v, rnd, hue) => {
  const curves = Array.from({ length: v.phone ? 2 : 4 }, () => ({ y: 0.2 + rnd() * 0.6, amp: 0.04 + rnd() * 0.08, k: 2 + rnd() * 5, sp: 0.03 + rnd() * 0.05, ph: rnd() * TAU, alt: rnd() < 0.4, damp: rnd() < 0.5 }));
  return {
    soft(c, t, a) { wash(c, v, t, a, hue, [0.25, 0.2, 0.75, 0.8]); },
    sharp(c, t, a) {
      const step = v.phone ? 36 : 44, line = rgb(ink(hue.base, v.dark));
      c.strokeStyle = line; c.lineWidth = 0.6; c.globalAlpha = a * (v.dark ? 0.06 : 0.08);
      c.beginPath();
      for (let x = 0; x <= v.w; x += step) { c.moveTo(x, 0); c.lineTo(x, v.h); }
      for (let y = 0; y <= v.h; y += step) { c.moveTo(0, y); c.lineTo(v.w, y); }
      c.stroke();
      for (const cv of curves) {
        c.strokeStyle = rgb(ink(cv.alt ? hue.alt : hue.base, v.dark)); c.lineWidth = 1.4; c.globalAlpha = a * 0.28;
        c.beginPath();
        for (let i = 0; i <= 120; i++) {
          const u = i / 120, x = u * v.w, env = cv.damp ? Math.exp(-1.6 * u) : 1;
          const y = (cv.y + cv.amp * env * Math.sin(cv.k * TAU * u - t * cv.sp * TAU + cv.ph)) * v.h;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.stroke();
      }
    },
  };
};

const SCENES: Record<AppId, Make> = { campus, trace, relief, green, travel, lab };

export type Backdrop = ReturnType<typeof makeBackdrop>;

/** The painter: one canvas, a scene per app, a transition between them. */
export function makeBackdrop(cv: Surface, ctx: Ctx, soft: Surface, sctx: Ctx, opts: BackdropOpts) {
  const v: View = { w: 1, h: 1, s: 1, z: 1, ox: 0, oy: 0, dark: true, phone: opts.phone };
  type Live = { id: AppId; scene: Scene };
  let cur: Live | null = null, prev: Live | null = null, from = 0, span = 1100, last = -1, pace = 0;
  // Reduce Motion: one moment of each scene, held (only the fades between them move).
  let clock = opts.still ? 40 : 0;
  /** One scene at its opacity and zoom (round the middle of the screen). */
  const layer = (live: Live | null, a: number, z: number, part: 'soft' | 'sharp') => {
    if (!live || a <= 0.002) return;
    const zoom = opts.still ? 1 : z;
    if (part === 'soft') {
      const sx = soft.width / v.w, sy = soft.height / v.h;
      sctx.setTransform(sx * zoom, 0, 0, sy * zoom, (sx * (1 - zoom) * v.w) / 2, (sy * (1 - zoom) * v.h) / 2);
      live.scene.soft(sctx, clock, a * opts.strength);
      return;
    }
    v.z = zoom; v.ox = (v.s * (1 - zoom) * v.w) / 2; v.oy = (v.s * (1 - zoom) * v.h) / 2;
    pageFrame(ctx, v);
    live.scene.sharp(ctx, clock, a * opts.strength);
    v.z = 1; v.ox = 0; v.oy = 0;
  };
  return {
    resize(w: number, h: number, dpr: number) {
      v.w = Math.max(1, w); v.h = Math.max(1, h);
      // M225: 1.5x and 2 M pixels at most: a soft scene behind the cards needs no more (it was 2.5x, 3.5 M).
      v.s = Math.min(dpr, 1.5, Math.sqrt(2e6 / (v.w * v.h)));
      cv.width = Math.round(v.w * v.s); cv.height = Math.round(v.h * v.s);
      soft.width = Math.ceil(v.w / 4); soft.height = Math.ceil(v.h / 4);
    },
    scene(id: AppId, ms: number) {
      if (cur?.id === id) return;
      // Switched again mid-way: whichever of the two shows more is the one giving way.
      prev = prev && (ms - from) / span < 0.5 ? prev : cur;
      const hue: Hue = id === 'campus' ? { get base() { return (v.dark ? CAMPUS.dark : CAMPUS.light).base; }, get alt() { return (v.dark ? CAMPUS.dark : CAMPUS.light).alt; } } : { base: hex(appById(id).color), alt: ALT[id] };
      cur = { id, scene: SCENES[id](v, rng(SEED[id]), hue) };
      span = prev ? 1000 : 1100;
      from = ms;
    },
    /** One frame; true while a transition is still running (another frame wanted). `moving`: the
     *  scenes' own motion eases in (and out) instead of starting with a jolt. */
    draw(ms: number, dark: boolean, moving = true) {
      const dt = last >= 0 ? Math.min(Math.max(ms - last, 0), 100) : 0;
      last = ms;
      pace += ((moving ? 1 : 0) - pace) * Math.min(1, dt / 450);
      if (!opts.still) clock += (dt / 1000) * pace;
      v.dark = dark;
      // The switch: the old scene fades as it drifts towards you, the new one settles in from a
      // little further away; opacity eases in and out, the zoom comes to rest gently.
      const k = Math.min(1, Math.max(0, (ms - from) / span));
      const fade = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2, settle = 1 - (1 - k) ** 3;
      if (k >= 1) prev = null;
      const near = 1 + 0.06 * settle, far = (prev ? 0.94 : 0.97) + (prev ? 0.06 : 0.03) * settle;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalAlpha = 1;
      sctx.clearRect(0, 0, soft.width, soft.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cv.width, cv.height);
      layer(prev, 1 - fade, near, 'soft');
      layer(cur, fade, far, 'soft');
      ctx.globalAlpha = 1;
      ctx.drawImage(soft, 0, 0, cv.width, cv.height);
      layer(prev, 1 - fade, near, 'sharp');
      layer(cur, fade, far, 'sharp');
      return k < 1;
    },
  };
}

/** The frame loop, the same on the background thread and on the page. Moving starts with `move()`
 *  (in the app once the page has loaded); `rest(true)` while nobody needs it moving. 30 a second (M225). */
export function backdropLoop(b: Backdrop, opts: BackdropOpts, dark: boolean, raf: (cb: (ms: number) => void) => number, caf: (id: number) => void) {
  let frame = 0, last = 0, resting = false, moving = false;
  // M225: 30 a second (M136 drew every frame the screen gives, up to 120: the scenes drift slowly, so half or a
  // quarter of the redraws look the same and leave the computer free for the page).
  const gap = 1000 / 30 - 2;
  const tick = (ms: number) => {
    frame = 0;
    if (resting) return;
    if (opts.still || !moving) { if (b.draw(ms, dark, false)) frame = raf(tick); return; }
    if (ms - last >= gap) { last = ms; b.draw(ms, dark); }
    frame = raf(tick);
  };
  const kick = () => { if (!frame && !resting) frame = raf(tick); };
  return {
    kick,
    size(w: number, h: number, dpr: number) { b.resize(w, h, dpr); kick(); },
    dark(on: boolean) { dark = on; kick(); },
    app(id: AppId, ms: number) { b.scene(id, ms); kick(); },
    rest(on: boolean) { resting = on; if (on && frame) { caf(frame); frame = 0; } kick(); },
    move() { moving = true; kick(); },
    stop() { resting = true; if (frame) caf(frame); frame = 0; },
  };
}
