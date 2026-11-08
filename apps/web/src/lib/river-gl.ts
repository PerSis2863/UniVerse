// M125 · The river of light on the graphics chip (WebGL 2). The owner (8 Nov 2026), with the Relay
// recording again: "my claude agent made these lines which is so bad and it doesn't look same at all
// … keep the green colour brightness light", then "do whatever you want or install whatever you can
// but I need the same result". What the 2D canvas couldn't do and the recording has:
//   · every fibre is a soft filament of light (a bell-shaped cross-section), not a hard 1-pixel wire;
//     the out-of-focus ones are wide, soft bands (depth of field) mixed in with the sharp ones;
//   · light adds up in a high-range buffer and is tone-mapped at the end, so where the fibres pack
//     together at the bend they glow white-lime instead of clipping into a hard white knot;
//   · a quarter-size glow layer (a halo round every fibre, the olive glow round each bend) for bloom;
//   · as many fibres as the recording (30: counted row by row on its frames) with gaps
//     between them; each bowed a little from the bend on and moving its own way, with light running
//     along it up or down (the owner's follow-ups); lime with pale blue ones on the inner side;
//     glitter drifting along them and soft bokeh discs round the river.
// The shape is measured on the recording's frames and laid over them (see `fibreX`): a full, round
// C at the bend, then an S down the page, not a trumpet. Everything is computed on the chip from
// fixed per-fibre numbers: nothing is uploaded per frame but a few uniforms.
// No DOM and no React, so it runs on the page or on the background thread (river.worker.ts). Where
// WebGL 2 isn't there, the 2D painter (river-paint.ts) draws instead.
import type { RiverOpts, RiverState } from './river-paint';

type Surface = HTMLCanvasElement | OffscreenCanvas;
type RGB = readonly [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// Fibre colours 0–5 lime and yellow-green (5 the white-lime of the brightest), 6–8 the sky blues (M126:
// as saturated as the recording's, where they read as blue lines among the lime, not grey-green).
const DARK = {
  fibres: ['#c4ec3e', '#b2e030', '#d0f055', '#a4d62e', '#d9f36a', '#ebfaae', '#5cb2ea', '#4a9fe0', '#7ec6f2'].map(hex),
  glow: [[0.9, 1, 0.62, 0.8], [0.72, 0.9, 0.3, 0.46], [0.36, 0.5, 0.1, 0.2]] as const,
  haze: [0.42, 0.56, 0.14, 0.1] as const, speck: hex('#f4ffd0'), bokeh: [hex('#d8f27c'), hex('#6fbbee')],
};
const LIGHT = {
  fibres: ['#2563eb', '#3b7ef0', '#1d4fd7', '#5b8def', '#4f46e5', '#3a6fe6', '#0891b2', '#0e7490', '#38bdf8'].map(hex),
  glow: [[0.23, 0.49, 0.94, 0.16], [0.31, 0.27, 0.9, 0.07], [0.15, 0.39, 0.92, 0.05]] as const,
  haze: [0.23, 0.49, 0.94, 0.05] as const, speck: hex('#2f5fd8'), bokeh: [hex('#93b9fa'), hex('#7dd3fc')],
};

// The river's path, shared by the fibres and the glitter (pixels of the page; `u_S` is the size the
// shape scales with, about the screen's height).
const PATH = `
uniform vec2 u_view; uniform float u_sy, u_t, u_S, u_S2, u_twist, u_lx2; uniform vec4 u_bend; uniform vec3 u_ptr;
// The river's flow clock: seconds, running all the time and a little faster while the page scrolls.
uniform float u_flow;
// The river belongs to the page: the screen shows it from u_vs (the page's scroll, gliding) down.
uniform float u_vs;
vec2 toScreen(vec2 p) { return vec2(p.x, p.y - u_vs); }
float bY(float b) { return u_bend.x + b * u_bend.y; }
float sideOf(float b) { return mod(b, 2.0) < 0.5 ? 1.0 : -1.0; }
// The first bend beside the hero's words (u_bend.z); the ones after it out at the screen's edges: the
// left one (u_lx2) and the right one (u_bend.w), as the owner asked.
float bX(float b) { return (sideOf(b) > 0.0 ? (b < 0.5 ? u_bend.z : u_lx2) : u_bend.w) + sin(u_t * 0.35 + b) * 8.0; }
// Each arm opens round from the bend and levels off (m·u^q / (1 + u^q), u the distance over l), at a
// size sc (q = 2 near the tip keeps every bend a smooth, round C: a lower power makes a point there).
float arm(float d, float m, float l, float q, float sc) { float u = pow(max(d, 0.0) / (l * sc), q); return m * sc * u / (1.0 + u); }
// Every bend has the same shape (the owner: "whenever the lines take left or right, follow that
// pattern again"), the first one's, mirrored for bends that open the other way. Consecutive bends turn
// opposite ways, so the inside of one is the outside of the next: a fibre's rank across a bend
// (0 outside … 1 inside) is w at even bends and 1 − w at odd ones, and fibres never cross over.
float rankAt(float b, float w) { return mod(b, 2.0) < 0.5 ? w : 1.0 - w; }
// Rank across the bundle → even rank far out (most fibres bunch in the middle near the bend).
float evenRank(float wr) { float c = 2.0 * wr - 1.0; return 0.5 + 0.5 * sign(c) * pow(abs(c), 1.0 / 1.7); }
// The arm above the first bend (the top of the page), d up from its tip, measured on the recording:
// the fibres leave the bend in a wide, round C (a tip about 70 px round, as in the recording), rise, the inner ones run
// out almost sideways (leaving a dark gap), and at d0 the bundle swings over to the top right (a smooth
// step, each fibre reaching its own way across). As the page scrolls the swing eases and rises out of
// view, as in the recording.
float topArm(float d, float wr, vec4 j, float ct, float st) {
  float H = u_view.y, t = evenRank(wr), spread = smoothstep(0.1 * H, 0.6 * H, d);
  float m = mix(0.12 + 0.4 * wr * wr + (j.z - 0.5) * 0.015, 0.04 + 0.32 * t + (j.x - 0.5) * 0.03, spread);
  m = 0.2 + (m - 0.2) * ct + (j.w - 0.5) * 0.32 * st;
  float dx = 0.025 + (0.05 * wr - 0.025) * ct + (j.w - 0.5) * 0.04 * st;
  float d0 = 0.45 * H + 0.3 * u_sy * u_twist;
  float swing = (0.45 + 0.5 * t) * u_S * (1.0 - 0.5 * u_twist * smoothstep(0.0, 0.35 * H, u_sy)) / (1.0 + exp(-(d - d0) / (0.06 * H)));
  float sw = 2.6 * smoothstep(0.6, 0.95, wr) * d * d / (d + 0.05 * H);
  return dx * u_S + arm(d, m, 0.2 - 0.05 * wr, 2.0, u_S) + swing + sw;
}
// An arm of a bend, d from its tip, at size sc: a round C sweeping out into an even fan. Below every
// bend, and above every bend after the first (the river between two bends is one bend's arm meeting
// the next one's, mirrored, so it flows smoothly from one into the other).
float bendArm(float d, float wr, vec4 j, float ct, float st, float sc, out float z) {
  float H = u_view.y, t = evenRank(wr), spread = smoothstep(0.1 * H, 0.6 * H, d);
  float m = mix(0.5 + 0.3 * wr + (j.y - 0.5) * 0.03, 0.34 + 0.6 * t + (j.x - 0.5) * 0.05, spread);
  float l = (0.32 - 0.1 * wr) * mix(1.0, 1.1 - 0.3 * t, spread);
  float dD = m - 0.64;
  m = 0.64 + dD * ct + (j.w - 0.5) * 0.6 * st;
  float dx = 0.025 + (0.05 * wr - 0.025) * ct + (j.w - 0.5) * 0.04 * st;
  z = -dD / 0.3 * st + (j.w - 0.5) * 2.0 * ct;
  return dx * sc + arm(d, m, l, 2.0, sc);
}
// f0: four numbers of the fibre's own (jitter, depth across the ribbon); f1: sway size, wavelength,
// speed (either way), timing; f2.x: its rank across the first bend; f3: colour, -, its own bow from
// the bend and the bow's length. z: how near the viewer it is as the ribbon turns (-1 … 1).
// The first bend is drawn at the recording's size (u_S); the ones after it a little smaller (u_S2), so
// a bend's fan meets the next bend's on the page, the bends alternating sides.
float fibreX(float y, vec4 f0, vec4 f1, vec4 f2, vec4 f3, out float z) {
  float b = floor((y - u_bend.x) / u_bend.y);
  float br = 1.0 + 0.045 * sin(u_t * (0.25 + 0.5 * fract(f1.w * 1.37)) + f1.w);
  float dn = bY(b + 1.0) - y, dp = b < 0.0 ? 1e6 : y - bY(b);
  // The owner: the fibres leave each bend packed in one bright band, each already moving and bending
  // its own way (gently: they start parallel), drift apart towards the middle and spread out by the
  // end; so a fibre's own sway and bow grow with the distance from the nearer bend (softened where
  // the two distances meet halfway: a plain min puts a kink in every fibre there).
  float H = u_view.y, dist = min(dn, dp) - 0.06 * H * log(1.0 + exp(-abs(dn - dp) / (0.06 * H)));
  float spread = smoothstep(0.1 * H, 0.6 * H, dist);
  float own = f1.x * (0.3 + 0.8 * spread) * smoothstep(0.0, 0.25 * H, dist) * sin(y / f1.y + u_flow * f1.z + f1.w)
    + f3.z * u_S * (1.0 - cos(dist / (f3.w * u_S))) * (1.0 + 0.3 * sin(u_t * f1.z * 0.4 + f1.w));
  // In 3D: the ribbon turns a little as the page scrolls, more further along it, so the fan narrows
  // and widens and fibres pass in front of and behind each other (never so far that it pinches).
  float th = u_twist * 0.45 * sin(u_sy / H * 0.9 + dist / H * 0.7);
  float ct = cos(th), st = sin(th), zl, zu;
  float nx = bX(b + 1.0) + sideOf(b + 1.0) * br * (b < 0.0 ? topArm(dn, rankAt(b + 1.0, f2.x), f0, ct, st) : bendArm(dn, rankAt(b + 1.0, f2.x), f0, ct, st, u_S2, zu));
  if (b < 0.0) { z = (f0.w - 0.5) * 2.0 * ct * min(1.0, abs(th) * 3.0); return nx + own; }
  float px = bX(b) + sideOf(b) * br * bendArm(dp, rankAt(b, f2.x), f0, ct, st, b < 0.5 ? u_S : u_S2, zl);
  // Over to the next bend in the middle of the way, where both arms run straight.
  float f = smoothstep(0.3, 0.7, dp / u_bend.y);
  z = mix(zl, zu, f) * min(1.0, abs(th) * 3.0);
  return mix(px, nx, f) + own;
}
// Fibres near the pointer lean away from it, like hair.
float part(float x, float y) {
  if (u_ptr.z < 0.01) return 0.0;
  float dy = y - u_ptr.y, dx = x - u_ptr.x;
  return u_ptr.z * 40.0 * exp(-dy * dy / 36000.0) * (dx / 120.0) * exp(-dx * dx / 30000.0);
}
vec4 clip(vec2 p) { return vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0); }
`;

const STRAND_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_v;
layout(location = 1) in vec4 a_f0;
layout(location = 2) in vec4 a_f1;
layout(location = 3) in vec4 a_f2;
layout(location = 4) in vec4 a_f3;
${PATH}
uniform float u_y0, u_step, u_y1, u_blur, u_alpha, u_halo;
uniform vec3 u_pal[9];
out float v_d; out float v_s; out vec3 v_c; out float v_a; out float v_h;
void main() {
  float y = u_y0 + a_v.x * u_step;
  float z, z2, z0;
  float x = fibreX(y, a_f0, a_f1, a_f2, a_f3, z); x += part(x, y);
  float x2 = fibreX(y + 2.0, a_f0, a_f1, a_f2, a_f3, z2); x2 += part(x2, y + 2.0);
  float x0 = fibreX(y - 2.0, a_f0, a_f1, a_f2, a_f3, z0); x0 += part(x0, y - 2.0);
  vec2 p1 = toScreen(vec2(x, y)), p2 = toScreen(vec2(x2, y + 2.0)), tg = normalize(p2 - p1);
  // How tight the curve is here (its radius on screen): a soft, wide fibre is kept narrower than the
  // radius, or its strip folds over itself round a tight bend and shows a streak.
  float turn = acos(clamp(dot(normalize(p1 - toScreen(vec2(x0, y - 2.0))), tg), -1.0, 1.0));
  float radius = length(p2 - p1) / max(turn, 1e-4);
  // Turned away (behind): softer and dimmer; turned towards the viewer: brighter. Close to a bend a
  // little softer too, so the packed fibres melt into one glowing band there, as in the recording.
  float bb = floor((y - u_bend.x) / u_bend.y);
  float nearBend = min(abs(y - bY(bb)), abs(bY(bb + 1.0) - y));
  float w = a_f2.y, blur = a_f2.z + max(0.0, -z) * 1.6 + 1.1 * exp(-nearBend / (u_view.y * 0.1)) + u_blur;
  float s0 = sqrt(0.25 * w * w + blur * blur + 0.16), r4 = max(0.6, radius * 0.3);
  float s = s0 * r4 / (s0 + r4) + 0.4 * min(s0, 0.6);
  float hw = 3.0 * max(s, u_halo > 0.0 ? min(3.2, r4) : 0.0) + 1.5;
  gl_Position = clip(p1 + vec2(tg.y, -tg.x) * a_v.y * hw);
  // Brightest by the bends, fading along the arms; drawn in from the top on arrival.
  float near = nearBend;
  // Drawing in on arrival: each fibre's tip a little ahead or behind (u_y1 is how far the lines have
  // come), a soft glowing tip, nothing beyond it.
  float ahead = u_y1 - fract(a_f1.w * 2.3) * 0.12 * u_view.y - y;
  float drawn = clamp(ahead / 50.0, 0.0, 1.0) * (1.0 + (u_y1 < 1e8 ? 2.2 * exp(-pow((ahead - 30.0) / 45.0, 2.0)) : 0.0));
  float lit = a_f2.w * (0.62 + 0.3 * exp(-near / (u_view.y * 0.42)) + 1.4 * exp(-near / (u_view.y * 0.05))) * drawn * u_alpha;
  // Light running along it, each fibre its own way and pace, from the bend on.
  // Light running down it all the time (faster while the page scrolls: u_flow), as in the pink river
  // the owner liked: a soft swell on every fibre, and on every other one short bright dashes, brightest
  // at the head, travelling down the river (their glow comes from the soft layer).
  float run = 0.78 + 0.22 * sin(y / (a_f1.y * 0.8) - u_flow * abs(a_f1.z) * 2.6 + a_f1.w * 3.0);
  float per = 300.0 + 260.0 * fract(a_f1.w * 1.7), vpx = 150.0 + 130.0 * fract(a_f1.w * 3.1);
  float sd = fract((y - u_flow * vpx) / per + a_f1.w);
  float dash = step(0.5, fract(a_f1.w * 0.77)) * smoothstep(0.0, 0.11, sd) * (1.0 - smoothstep(0.11, 0.13, sd));
  lit *= run * (1.0 + 2.6 * dash) * clamp(1.0 + 0.3 * z, 0.6, 1.4);
  v_d = a_v.y * hw; v_s = s; v_c = u_pal[int(a_f3.x)];
  v_a = lit * w / (s * 2.5066); v_h = lit * u_halo;
}`;
const STRAND_FS = `#version 300 es
precision highp float;
in float v_d; in float v_s; in vec3 v_c; in float v_a; in float v_h;
out vec4 o;
void main() {
  float i = v_a * exp(-0.5 * v_d * v_d / (v_s * v_s)) + v_h * exp(-0.5 * v_d * v_d / 10.0);
  o = vec4(v_c * i, i);
}`;

// Glitter and bokeh: points riding on a fibre near bend u_b.
const DOT_VS = `#version 300 es
precision highp float;
layout(location = 1) in vec4 a_f0;
layout(location = 2) in vec4 a_f1;
layout(location = 3) in vec4 a_f2;
layout(location = 4) in vec4 a_f3;
layout(location = 5) in vec4 a_p;
layout(location = 6) in vec4 a_q;
${PATH}
uniform float u_b, u_dpr, u_alpha, u_y1;
uniform vec3 u_dot[3];
out vec3 v_c; out float v_a; out float v_k;
void main() {
  float ph = fract(u_flow * a_q.w + a_p.w);
  float d = (a_p.x + ph * 0.14) * u_view.y;
  float y = a_q.x > 0.5 ? bY(u_b) - d : bY(u_b) + d;
  float z;
  float x = fibreX(y, a_f0, a_f1, a_f2, a_f3, z); x += part(x, y) + sideOf(u_b) * a_p.y * (0.3 + 2.5 * d / u_view.y);
  gl_Position = clip(toScreen(vec2(x, y)));
  gl_PointSize = a_p.z * u_dpr;
  float tw = a_q.y < 0.5 ? 0.55 + 0.45 * sin(u_t * 2.2 + a_p.w * 40.0) : 1.0;
  v_a = a_q.z * tw * sin(3.14159 * ph) * u_alpha * clamp((u_y1 - y) / 140.0, 0.0, 1.0);
  v_k = a_q.y; v_c = u_dot[int(a_q.y + 0.5) == 0 ? 0 : (a_p.w > 0.5 ? 2 : 1)];
}`;
const DOT_FS = `#version 300 es
precision highp float;
in vec3 v_c; in float v_a; in float v_k;
out vec4 o;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float i = v_k < 0.5 ? exp(-r * r * 3.0) : smoothstep(1.0, 0.82, r) * (0.65 + 0.35 * smoothstep(0.55, 0.92, r));
  o = vec4(v_c * i * v_a, i * v_a);
}`;

// A round glow with a bell-shaped falloff (the bends' glow, the haze, the pointer).
const BLOB_VS = `#version 300 es
precision highp float;
uniform vec2 u_view; uniform vec3 u_at;
out vec2 v_uv;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  v_uv = c;
  vec2 p = u_at.xy + c * u_at.z;
  gl_Position = vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0);
}`;
const BLOB_FS = `#version 300 es
precision highp float;
in vec2 v_uv; uniform vec4 u_col;
out vec4 o;
void main() {
  float r2 = dot(v_uv, v_uv);
  float i = max(0.0, (exp(-4.5 * r2) - 0.0111) / 0.9889) * u_col.a;
  o = vec4(u_col.rgb * i, i);
}`;

// Both layers onto the page: tone-mapped light on the dark look, ink density on the light one, with
// a fine grain so the soft gradients never show steps.
const COMP_VS = `#version 300 es
out vec2 v_uv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const COMP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_main, u_glow; uniform float u_gain, u_dark, u_t;
out vec4 o;
void main() {
  vec4 c = (texture(u_main, v_uv) + texture(u_glow, v_uv)) * u_gain;
  float n = fract(sin(dot(gl_FragCoord.xy + u_t, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  if (u_dark > 0.5) {
    // Keep the hue as light piles up (the recording's band stays yellow-lime); only the hottest
    // spot, right at the bend, goes towards white.
    float L = max(c.r, max(c.g, c.b));
    vec3 m = c.rgb * (1.0 - exp(-L * 1.35)) / max(L, 1e-4);
    m = mix(m, vec3(max(m.r, max(m.g, m.b))), smoothstep(1.2, 4.5, L) * 0.65);
    float a = max(m.r, max(m.g, m.b));
    m = clamp(m + n * 0.012 * step(0.004, a), 0.0, 1.0);
    o = vec4(m, max(a, max(m.r, max(m.g, m.b))));
  } else {
    float a = 1.0 - exp(-c.a * 0.9);
    vec3 col = c.rgb / max(c.a, 1e-4);
    a = clamp(a + n * 0.01 * step(0.004, a), 0.0, 1.0);
    o = vec4(col * a, a);
  }
}`;

const hash = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/** The fibres, fixed for a river's life (16 numbers each, as the shader reads them). */
export function riverFibres(n: number): Float32Array {
  const out = new Float32Array(n * 16);
  // Most fibres in the middle of the bundle (they leave the bend packed in one bright band), a few
  // fainter ones on either side; still in order, with a little jitter, so neighbours never pile up.
  for (let i = 0; i < n; i++) {
    const c = Math.min(1, Math.max(-1, (2 * (i + 0.5 + (hash(i, 2) - 0.5) * 0.6)) / n - 1));
    const w = 0.5 + 0.5 * Math.sign(c) * Math.pow(Math.abs(c), 1.7), edge = 1 - 0.45 * c * c;
    const r = hash(i, 3);
    const bright = r > 0.86, far = !bright && r < 0.18;
    const blue = !bright && hash(i, 4) < 0.2 + 0.25 * w;
    const level = hash(i, 5);
    const o = i * 16;
    // Four numbers of its own (small differences in reach; its depth across the ribbon). The bends'
    // shapes come from its rank (below), the same at every bend (the shader: topArm and bendArm).
    out.set([hash(i, 6), hash(i, 7), hash(i, 19), hash(i, 20)], o);
    // Its own sway: size, wavelength, speed (running up or down the fibre) and timing.
    out.set([6 + hash(i, 8) * 18, 130 + hash(i, 9) * 320, (0.35 + hash(i, 10) * 0.8) * (hash(i, 11) < 0.5 ? -1 : 1), hash(i, 12) * 6.283], o + 4);
    // Its rank across the first bend; width, blur (the out-of-focus ones) and brightness.
    out.set([
      w,
      bright ? 1.2 + hash(i, 14) * 0.4 : far ? 2 + hash(i, 14) * 2 : 0.6 + hash(i, 14) * 0.5,
      far ? 2.5 + hash(i, 15) * 4.5 : 0,
      (bright ? 1 : far ? 0.35 + level * 0.3 : (0.22 + 0.6 * level * level) * (1 - 0.2 * w) + (blue ? 0.3 : 0)) * edge,
    ], o + 8);
    out[o + 12] = bright ? 5 : blue ? 6 + (i % 3) : [0, 1, 2, 3, 4][i % 5];
    out[o + 14] = (0.004 + hash(i, 16) * 0.009) * (hash(i, 17) < 0.5 ? -1 : 1);
    out[o + 15] = 0.1 + hash(i, 18) * 0.12;
  }
  return out;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src); gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * How sharp the river is at a scroll position (1 sharp): it belongs to the page, as the pink river did
 * (the owner, after a flying camera: "this is totally different … the lines travel like the pink
 * background lines earlier"), sharp at the top and a little softer further down, never so soft that
 * the travelling lines blur away.
 */
export function riverFocus(sy: number, H: number) {
  return 1 - 0.4 * smooth(0.3, 1.5, Math.max(0, sy) / H);
}

/** A river drawn with WebGL 2 into `cv`, or null where the browser can't (the 2D painter then draws). */
export function makeRiverGL(cv: Surface, opts: RiverOpts, born: number) {
  const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const { tone, hero, strength, still, phone } = opts;
  const strand = compile(gl, STRAND_VS, STRAND_FS), dot = compile(gl, DOT_VS, DOT_FS), blob = compile(gl, BLOB_VS, BLOB_FS), comp = compile(gl, COMP_VS, COMP_FS);
  if (!strand || !dot || !blob || !comp) return null;
  // Light adds up beyond 1 (white-hot where fibres pack) where the chip can draw into half floats.
  const hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  const gain = hdr ? 1 : 4;

  const N = still ? 28 : phone ? 26 : 30;
  const fibres = riverFibres(N);
  // Glitter along the arms near each bend, and soft bokeh round the river: 24 numbers each (the
  // fibre it rides on (16), then where, how far off, size, timing; up or down, kind, brightness, drift).
  const nSpeck = phone ? 320 : 950, nBokeh = phone ? 14 : 36;
  const dots = new Float32Array((nSpeck + nBokeh) * 24);
  for (let i = 0; i < nSpeck + nBokeh; i++) {
    const bk = i >= nSpeck, f = Math.floor(hash(i, 20) * N), o = i * 24;
    dots.set(fibres.subarray(f * 16, f * 16 + 16), o);
    dots.set([0.01 + Math.pow(hash(i, 21), bk ? 1 : 1.6) * (bk ? 0.55 : 0.6), (hash(i, 22) - 0.5) * (bk ? 90 : 50), bk ? 6 + hash(i, 23) * 14 : 2.2 + hash(i, 23) * 3, hash(i, 24)], o + 16);
    dots.set([hash(i, 25) < 0.5 ? 1 : 0, bk ? 1 : 0, bk ? 0.12 + hash(i, 26) * 0.2 : 0.7 + hash(i, 26) * 1.1, still ? 0 : bk ? 0.004 : 0.012 + hash(i, 27) * 0.02], o + 20);
  }

  const fibreBuf = gl.createBuffer(), stripBuf = gl.createBuffer(), dotBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fibreBuf); gl.bufferData(gl.ARRAY_BUFFER, fibres, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.bufferData(gl.ARRAY_BUFFER, dots, gl.STATIC_DRAW);
  const strandVao = gl.createVertexArray(), dotVao = gl.createVertexArray(), emptyVao = gl.createVertexArray();
  gl.bindVertexArray(strandVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fibreBuf);
  for (let l = 1; l <= 4; l++) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 64, (l - 1) * 16); gl.vertexAttribDivisor(l, 1); }
  gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(dotVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf);
  for (const [l, at] of [[1, 0], [2, 4], [3, 8], [4, 12], [5, 16], [6, 20]] as const) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 96, at * 4); }
  gl.bindVertexArray(null);

  const loc = (p: WebGLProgram) => {
    const cache = new Map<string, WebGLUniformLocation | null>();
    return (name: string) => { if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name)); return cache.get(name) ?? null; };
  };
  const U = { strand: loc(strand), dot: loc(dot), blob: loc(blob), comp: loc(comp) };

  // Two layers: the fibres at full size, the glow at a quarter (stretched: a free blur).
  const layer = () => ({ tex: gl.createTexture(), fbo: gl.createFramebuffer(), w: 0, h: 0 });
  const main = layer(), glow = layer();
  const sizeLayer = (l: ReturnType<typeof layer>, w: number, h: number) => {
    l.w = w; l.h = h;
    gl.bindTexture(gl.TEXTURE_2D, l.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, l.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, l.tex, 0);
  };

  let W = 0, H = 0, dpr = 1, samples = 0;
  const step = phone ? 9 : 6;
  let pv = 0;
  // The scroll the river is drawn at (gliding after the page's), and when the last frame was drawn.
  let glide = 0, lastMs = -1e9, prevGlide = 0, boost = 0, flow = 8;

  const resize = (w: number, h: number, ratio: number) => {
    W = w; H = h;
    dpr = Math.min(2, ratio || 1, Math.sqrt(4.2e6 / Math.max(1, W * H)));
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    sizeLayer(main, cv.width, cv.height);
    sizeLayer(glow, Math.max(1, Math.round(W / 4)), Math.max(1, Math.round(H / 4)));
    samples = Math.ceil((H + 520) / step) + 2;
    const strip = new Float32Array(samples * 4);
    for (let i = 0; i < samples; i++) strip.set([i, -1, i, 1], i * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf); gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
  };

  const draw = (ms: number, s: RiverState) => {
    if (gl.isContextLost() || !W) return false;
    const { sy, px, py, pAt } = s;
    const t = still ? 8 : ms / 1000;
    const dark = tone === 'dark' || s.dark;
    const pal = dark ? DARK : LIGHT;
    const k = (dark ? 1 : 0.75) * strength;
    const wide = W >= 1024;
    // The bends, in page pixels: the first beside the hero's paragraph, then one every D further down,
    // alternating sides (even ones open to the right), each the first one's pattern. The ones after the
    // first bend out at the screen's edges, right and left (the owner: "from the end side of right and
    // left, not from the middle like at the start"). The first is drawn at the recording's size (S); the
    // ones after it at S2, so that one bend's fan meets the next one's (two arms of reach 0.34–0.94
    // meet when the bends are 1.28 apart, at their size).
    const D = H * 1.7, Y0 = H * (hero ? 0.684 : 0.55);
    const S = Math.min(H, W * 0.9);
    const leftX = W * (wide ? 0.345 : phone ? 0.2 : 0.28);
    const edge = phone ? 0.08 : 0.1, leftX2 = W * edge, rightX = W * (1 - edge);
    const S2 = (rightX - leftX2) / 1.28;
    const bendY = (b: number) => Y0 + b * D;
    const bendX = (b: number) => (b % 2 === 0 ? (b === 0 ? leftX : leftX2) : rightX) + Math.sin(t * 0.35 + b) * 8;
    const dir = (b: number) => (b % 2 === 0 ? 1 : -1);
    // On arrival (the landing page) the lines draw themselves in along the river, as in the recording:
    // from the top right, down through the bend and out along the fan, in under a second (eased in and
    // out), each fibre's tip a little ahead or behind the others and glowing; the bend lights up as
    // they reach it. `front` is how far down the page they have come (none: all drawn).
    const grow = hero && !still ? Math.min(1, (ms - born) / 900) : 1;
    const eased = grow < 0.5 ? 4 * grow * grow * grow : 1 - Math.pow(2 - 2 * grow, 3) / 2;
    const front = grow < 1 ? -0.15 * H + eased * 1.6 * H : 1e9;
    const lit = (y: number) => (front > 1e8 ? 1 : smooth(y - 0.12 * H, y + 0.12 * H, front));
    // The scroll glides to where the page is (a wheel or trackpad moves it in jumps), so the river
    // moves ultra smoothly; it lands exactly, and jumps straight there when frames aren't running.
    const dt = ms - lastMs;
    lastMs = ms;
    glide = still || !(dt > 0 && dt < 120) || Math.abs(sy - glide) < 0.3 ? sy : glide + (sy - glide) * (1 - Math.exp(-dt / 70));
    // The flow clock: on all the time, up to twice as fast while the page scrolls (eased in and out).
    const speed = dt > 0 && dt < 120 ? Math.abs(glide - prevGlide) / dt : 0;
    prevGlide = glide;
    boost += (Math.min(1, (speed * 1000) / H) - boost) * (1 - Math.exp(-Math.max(0, dt) / 300));
    if (dt > 0 && dt < 120) flow += (dt / 1000) * (1 + boost);
    const vs = glide, focus = riverFocus(glide, H);
    const toScr = (x: number, y: number) => [x, y - vs] as const;
    // What's in view, with a wide margin: soft fibres are up to ~250 px wide and their cut ends mustn't show.
    const y0 = vs - 260;
    const y1 = vs + H + 260;
    const count = Math.max(2, Math.min(samples, Math.ceil((y1 - y0) / step) + 2));
    const fade = k * (0.4 + 0.6 * eased) * (hero ? 1 : 0.75);
    pv += ((ms - pAt < 2500 ? 1 : 0) - pv) * 0.08;
    const bends: number[] = [];
    for (let b = Math.max(0, Math.floor((y0 - H * 0.6 - Y0) / D)); bendY(b) < y1 + H * 0.6; b++) bends.push(b);

    const path = (u: (n: string) => WebGLUniformLocation | null) => {
      gl.uniform2f(u('u_view'), W, H); gl.uniform1f(u('u_sy'), glide); gl.uniform1f(u('u_flow'), still ? 8 : flow); gl.uniform1f(u('u_t'), t);
      gl.uniform1f(u('u_S'), S); gl.uniform1f(u('u_S2'), S2); gl.uniform1f(u('u_lx2'), leftX2); gl.uniform1f(u('u_twist'), still ? 0 : 1);
      gl.uniform4f(u('u_bend'), Y0, D, leftX, rightX); gl.uniform3f(u('u_ptr'), px, py + vs, pv); gl.uniform1f(u('u_vs'), vs);
    };
    const strands = (blur: number, alpha: number, halo: number) => {
      const u = U.strand;
      gl.uniform1f(u('u_blur'), blur); gl.uniform1f(u('u_alpha'), alpha); gl.uniform1f(u('u_halo'), halo);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, count * 2, N);
    };
    // A glow at a point of the river (or of the screen, for the pointer's).
    const blobAt = (x: number, y: number, r: number, [cr, cg, cb, a]: readonly number[], m: number, onScreen = false) => {
      const [X, Y] = onScreen ? [x, y] : toScr(x, y);
      gl.uniform3f(U.blob('u_at'), X, Y, r); gl.uniform4f(U.blob('u_col'), cr, cg, cb, a * m);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    const scale = 1 / gain;

    // 1 · The glow layer (quarter size): olive light round each bend and up its arm, the haze top
    // right on the landing, a halo round every fibre, the pointer's light.
    gl.bindFramebuffer(gl.FRAMEBUFFER, glow.fbo);
    gl.viewport(0, 0, glow.w, glow.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(blob);
    gl.bindVertexArray(emptyVao);
    gl.uniform2f(U.blob('u_view'), W, H);
    const m = Math.min(W, H);
    for (const b of bends) {
      const gx = bendX(b) + dir(b) * 22, gy = bendY(b), on = fade * scale * lit(gy);
      blobAt(gx, gy, m * 0.8, pal.glow[2], on);
      blobAt(gx, gy, m * 0.32, pal.glow[1], on);
      blobAt(gx, gy, m * 0.1, pal.glow[0], on);
      // …and along the arms, along the middle of the fibres (the recording's green haze there): up
      // the first bend's rising arm, and the round arms (below every bend, above the later ones).
      if (b === 0) blobAt(bendX(b) + dir(b) * S * 0.25, bendY(b) - H * 0.34, m * 0.5, pal.glow[2], fade * scale * 0.8 * lit(bendY(b) - H * 0.34));
      for (const [dd, r, a] of [[0.14, 0.28, 0.9], [0.34, 0.38, 0.85], [0.58, 0.46, 0.8]] as const) {
        for (const [sc, sgn] of b === 0 ? [[S, 1]] : [[S2, 1], [S2, -1]]) {
          const u = Math.pow(dd * H / (0.22 * sc), 1.8), y = bendY(b) + sgn * dd * H;
          blobAt(bendX(b) + dir(b) * 0.62 * sc * u / (1 + u), y, m * r, pal.glow[2], fade * scale * a * lit(y));
        }
      }
    }
    if (hero && dark && vs < H * 1.5) blobAt(W * 0.82, H * 0.16, Math.max(W, H) * 0.55, pal.haze, fade * scale * lit(0));
    if (pv > 0.01) blobAt(px, py, 170, pal.glow[1], pv * k * scale, true);
    gl.useProgram(strand);
    gl.bindVertexArray(strandVao);
    path(U.strand);
    gl.uniform3fv(U.strand('u_pal'), pal.fibres.flat());
    gl.uniform1f(U.strand('u_y0'), y0); gl.uniform1f(U.strand('u_step'), step); gl.uniform1f(U.strand('u_y1'), front);
    // Out of focus, the river moves into this soft layer: wide blurred bands, as in the recording.
    strands(7 + (1 - focus) * 34, fade * scale * (dark ? 1.15 : 0.3) * (1 + 4 * (1 - focus)), 0);

    // 2 · The fibres themselves (full size): sharp at the top, softer as the page scrolls on; a thin
    // glow round each. In the app a little quieter, so text in front stays easy to read.
    gl.bindFramebuffer(gl.FRAMEBUFFER, main.fbo);
    gl.viewport(0, 0, main.w, main.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const sharp = fade * (hero ? 1 : phone ? 0.55 : 0.65);
    // …and the sharp fibres fade out of this one, only a soft trace left.
    strands((1 - focus) * 5, sharp * scale * (0.12 + 0.88 * focus) * (1 + 1.5 * (1 - focus)), dark ? 0.15 : 0.04);
    // 3 · Glitter drifting along the arms, bokeh round them.
    gl.useProgram(dot);
    gl.bindVertexArray(dotVao);
    path(U.dot);
    gl.uniform1f(U.dot('u_dpr'), dpr); gl.uniform1f(U.dot('u_alpha'), sharp * scale * (0.15 + 0.85 * focus * focus)); gl.uniform1f(U.dot('u_y1'), front);
    gl.uniform3fv(U.dot('u_dot'), [...pal.speck, ...pal.bokeh[0], ...pal.bokeh[1]]);
    for (const b of bends) { gl.uniform1f(U.dot('u_b'), b); gl.drawArrays(gl.POINTS, 0, nSpeck + nBokeh); }

    // 4 · Onto the page.
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.useProgram(comp);
    gl.bindVertexArray(emptyVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, main.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glow.tex);
    gl.uniform1i(U.comp('u_main'), 0); gl.uniform1i(U.comp('u_glow'), 1);
    gl.uniform1f(U.comp('u_gain'), gain); gl.uniform1f(U.comp('u_dark'), dark ? 1 : 0); gl.uniform1f(U.comp('u_t'), still ? 0 : t % 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // Still gliding: the caller draws another frame even when the river isn't moving on its own.
    return glide !== sy;
  };

  return { resize, draw };
}
