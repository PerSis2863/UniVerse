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

// Fibre colours 0–5 lime and yellow-green (5 the white-lime of the brightest), 6–8 the pale blues.
const DARK = {
  fibres: ['#c4ec3e', '#b2e030', '#d0f055', '#a4d62e', '#d9f36a', '#ebfaae', '#8fd6f2', '#6cc3ea', '#a6e2f6'].map(hex),
  glow: [[0.9, 1, 0.62, 0.8], [0.72, 0.9, 0.3, 0.46], [0.36, 0.5, 0.1, 0.2]] as const,
  haze: [0.42, 0.56, 0.14, 0.1] as const, speck: hex('#f4ffd0'), bokeh: [hex('#d8f27c'), hex('#8fd3ec')],
};
const LIGHT = {
  fibres: ['#2563eb', '#3b7ef0', '#1d4fd7', '#5b8def', '#4f46e5', '#3a6fe6', '#0891b2', '#0e7490', '#38bdf8'].map(hex),
  glow: [[0.23, 0.49, 0.94, 0.16], [0.31, 0.27, 0.9, 0.07], [0.15, 0.39, 0.92, 0.05]] as const,
  haze: [0.23, 0.49, 0.94, 0.05] as const, speck: hex('#2f5fd8'), bokeh: [hex('#93b9fa'), hex('#7dd3fc')],
};

// The river's path, shared by the fibres and the glitter (pixels of the page; `u_S` is the size the
// shape scales with, about the screen's height).
const PATH = `
uniform vec2 u_view; uniform float u_sy, u_t, u_S, u_twist; uniform vec4 u_bend; uniform vec3 u_ptr;
// The camera (riverCamera): which stretch of the river is at the top of the screen, how near it is,
// how it's turned, and how it's shifted. The river itself never moves; the camera flies past it.
uniform vec4 u_cam; uniform vec2 u_camOff;
vec2 toScreen(vec2 p) {
  vec2 c = 0.5 * u_view, q = vec2(p.x, p.y - u_cam.x) - c;
  return vec2(u_cam.z * q.x - u_cam.w * q.y, u_cam.w * q.x + u_cam.z * q.y) * u_cam.y + c + u_camOff;
}
float bY(float b) { return u_bend.x + b * u_bend.y; }
float sideOf(float b) { return mod(b, 2.0) < 0.5 ? 1.0 : -1.0; }
float bX(float b) { return (sideOf(b) > 0.0 ? u_bend.z : u_bend.w) + sin(u_t * 0.35 + b) * 8.0; }
// Each arm opens round from the bend and levels off (m·u^q / (1 + u^q), u the distance over l); the
// upper one leans out (k) towards the top right once it's a third of a screen from the bend.
float arm(float d, float m, float l, float q) { float u = pow(max(d, 0.0) / (l * u_S), q); return m * u_S * u / (1.0 + u); }
float armUp(float d, float m, float l, float q, float k) { d = max(d, 0.0); float e = 0.4 * u_view.y; return min(u_view.x * 2.0, arm(d, m, l, q) + k * d * d * d / (d * d + e * e)); }
// Measured on the recording's frames, row by row, and laid over them: a full, round C. Below the
// bend the fibres sweep out wide (the inner ones nearly sideways); above it the outer ones rise
// almost upright and the inner ones fan out to the right, leaning on towards the top right.
// f0: spread at the bend, the lower arm's reach and length, the upper arm's lean; f1: sway size,
// wavelength, speed (either way), timing; f2.x: where it sits across the bundle (0 outside, 1
// inside); f3: colour, the upper arm's reach, its own bow from the bend and the bow's length.
// z: how near the viewer the fibre is as the ribbon turns (-1 behind … 1 in front).
float fibreX(float y, vec4 f0, vec4 f1, vec4 f2, vec4 f3, out float z) {
  float w = f2.x, breath = 0.25 + 0.5 * fract(f1.w * 1.37);
  float b = floor((y - u_bend.x) / u_bend.y);
  float br = 1.0 + 0.045 * sin(u_t * breath + f1.w);
  float dn = bY(b + 1.0) - y, dp = b < 0.0 ? 1e6 : y - bY(b);
  // The owner: the fibres leave the bend packed together in one bright band, each already moving and
  // bending its own way (gently: they start parallel), drift apart towards the middle and are
  // scattered by the end. So everything that's a fibre's own grows with the distance from the bend:
  // its sway, its bow (1 − cos: no corner at the bend), and its reach: near the bend most fibres share
  // the middle of the bundle (bunched w), far out they spread evenly across a wide fan (t, their
  // even rank), like the recording's comb of lines at the end, rather than tangling.
  // The distance to the nearer bend, softened where the two meet halfway (a plain min puts a kink in
  // every fibre at the same place there).
  float H = u_view.y, dist = min(dn, dp) - 0.06 * H * log(1.0 + exp(-abs(dn - dp) / (0.06 * H)));
  float spread = smoothstep(0.1 * H, 0.6 * H, dist);
  float own = f1.x * (0.3 + 0.8 * spread) * smoothstep(0.0, 0.25 * H, dist) * sin(y / f1.y + u_t * f1.z + f1.w)
    + f3.z * u_S * (1.0 - cos(dist / (f3.w * u_S))) * (1.0 + 0.3 * sin(u_t * f1.z * 0.4 + f1.w));
  float c = 2.0 * w - 1.0, t = 0.5 + 0.5 * sign(c) * pow(abs(c), 1.0 / 1.7);
  float r1 = fract(f1.w * 0.6180339 + 0.37) - 0.5;
  float upM = mix(f3.y, 0.04 + 0.32 * t + r1 * 0.03, spread), downM = mix(f0.y, 0.34 + 0.6 * t + r1 * 0.05, spread);
  float downL = f0.z * mix(1.0, 1.15 - 0.3 * t, spread);
  // In 3D, like the recording (the owner: "please work on this also"): the river is a ribbon that
  // turns as the page scrolls, more the further along it, so the fan narrows and widens and fibres
  // pass in front of and behind each other. Each fibre has a depth of its own across the ribbon; its
  // spread from the middle of the fan is turned by the angle (exactly the drawn shape at the top of
  // the page, where the angle is 0). The upper arm also stands up a little as the page scrolls.
  float th = u_twist * (u_sy / H * 0.9 + dist / H * 0.7 * min(1.0, u_sy / H * 1.5));
  float ct = cos(th), st = sin(th), dep = fract(f1.w * 1.913 + 0.29) - 0.5;
  float dD = downM - 0.64, dU = upM - 0.2;
  downM = 0.64 + dD * ct + dep * 0.6 * st;
  upM = 0.2 + dU * ct + dep * 0.32 * st;
  float dx = 0.0125 + (f0.x - 0.0125) * ct + dep * 0.03 * st;
  z = (-dD / 0.3 * st + dep * 2.0 * ct) * min(1.0, abs(th) * 1.5);
  float lean = f0.w * (1.0 - 0.35 * u_twist * smoothstep(0.0, 0.45 * H, u_sy));
  // Above the first bend (the top of the page) the river arrives from the top right, as in the
  // recording: the fibres leave the bend spreading fast (the inner ones almost sideways), rise, and
  // halfway up the screen the whole bundle swings over towards the top-right corner (a smooth step,
  // its height d0, each fibre reaching its own way across). As the page scrolls the swing eases and
  // rises out of view (the ribbon turning). Between bends the arm leans on as before.
  float d0 = 0.45 * H + 0.3 * u_sy * u_twist;
  float swing = (0.45 + 0.5 * t) * u_S * (1.0 - 0.5 * u_twist * smoothstep(0.0, 0.35 * H, u_sy)) / (1.0 + exp(-(dn - d0) / (0.06 * H)));
  // The innermost fibres (about a quarter) leave the bend almost sideways and keep going (under the
  // recording's card), leaving a dark gap between them and the packed band that rises.
  float sideways = 2.6 * smoothstep(0.6, 0.95, w) * dn * dn / (dn + 0.05 * H);
  float up = b < 0.0 ? arm(dn, upM, 0.14 - 0.04 * w, 2.0) + swing + sideways : armUp(dn, upM, 0.2 - 0.05 * w, 2.0, lean);
  float nx = bX(b + 1.0) + sideOf(b + 1.0) * (dx * u_S + br * up + own);
  if (b < 0.0) return nx;
  float px = bX(b) + sideOf(b) * (dx * u_S + br * arm(dp, downM, downL, 2.0 - 0.4 * w) + own);
  // Over to the next bend in the second half of the way, so each arm keeps its own shape first.
  float f = clamp((dp / u_bend.y - 0.45) / 0.55, 0.0, 1.0);
  return mix(px, nx, f * f * (3.0 - 2.0 * f));
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
  float zoom = u_cam.y, w = a_f2.y * zoom, blur = (a_f2.z + max(0.0, -z) * 1.6 + 1.1 * exp(-nearBend / (u_view.y * 0.1))) * zoom + u_blur;
  float s0 = sqrt(0.25 * w * w + blur * blur + 0.16), r4 = max(0.6, radius * 0.3);
  float s = s0 * r4 / (s0 + r4) + 0.4 * min(s0, 0.6);
  float hw = 3.0 * max(s, u_halo > 0.0 ? min(3.2, r4) : 0.0) + 1.5;
  gl_Position = clip(p1 + vec2(tg.y, -tg.x) * a_v.y * hw);
  // Brightest by the bends, fading along the arms; drawn in from the top on arrival.
  float near = nearBend;
  float lit = a_f2.w * (0.62 + 0.3 * exp(-near / (u_view.y * 0.42)) + 1.4 * exp(-near / (u_view.y * 0.05))) * clamp((u_y1 - y) / 140.0, 0.0, 1.0) * u_alpha;
  // Light running along it, each fibre its own way and pace, from the bend on.
  lit *= (0.72 + 0.28 * sin(y / (a_f1.y * 0.8) - u_t * a_f1.z * 2.6 + a_f1.w * 3.0)) * clamp(1.0 + 0.3 * z, 0.6, 1.4);
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
  float ph = fract(u_t * a_q.w + a_p.w);
  float d = (a_p.x + ph * 0.14) * u_view.y;
  float y = a_q.x > 0.5 ? bY(u_b) - d : bY(u_b) + d;
  float z;
  float x = fibreX(y, a_f0, a_f1, a_f2, a_f3, z); x += part(x, y) + sideOf(u_b) * a_p.y * (0.3 + 2.5 * d / u_view.y);
  gl_Position = clip(toScreen(vec2(x, y)));
  gl_PointSize = a_p.z * u_dpr * u_cam.y;
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
    const blue = !bright && hash(i, 4) < 0.12 + 0.3 * w;
    const level = hash(i, 5);
    const o = i * 16;
    // Spread at the bend; the lower arm's reach and length; the upper arm's lean (its reach is o + 13).
    out.set([w * 0.025, 0.5 + 0.3 * w + (hash(i, 6) - 0.5) * 0.03, 0.26 - 0.1 * w, 0.3 + 0.5 * w], o);
    // Its own sway: size, wavelength, speed (running up or down the fibre) and timing.
    out.set([6 + hash(i, 8) * 18, 130 + hash(i, 9) * 320, (0.35 + hash(i, 10) * 0.8) * (hash(i, 11) < 0.5 ? -1 : 1), hash(i, 12) * 6.283], o + 4);
    // Where it sits across the bundle; width, blur (the out-of-focus ones) and brightness.
    out.set([
      w,
      bright ? 1.2 + hash(i, 14) * 0.4 : far ? 2 + hash(i, 14) * 2 : 0.6 + hash(i, 14) * 0.5,
      far ? 2.5 + hash(i, 15) * 4.5 : 0,
      (bright ? 1 : far ? 0.35 + level * 0.3 : (0.22 + 0.6 * level * level) * (1 - 0.2 * w) + (blue ? 0.2 : 0)) * edge,
    ], o + 8);
    out[o + 12] = bright ? 5 : blue ? 6 + (i % 3) : [0, 1, 2, 3, 4][i % 5];
    out[o + 13] = 0.06 + 0.5 * w * w * w * w + (hash(i, 19) - 0.5) * 0.015;
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
const softplus = (x: number, k: number) => k * Math.log1p(Math.exp(x / k));

// The camera's stages down the page, in screens scrolled, after the recording's sections: the
// drawn river at the top; a screen down, the S on the right, getting soft; two screens down, a wide,
// very soft ribbon from bottom left to top right; then a big soft arc; around seven screens down it
// comes sharp again and runs across the bottom of the screen; then round again from the soft ribbon.
// Turn (radians, + is clockwise), nearness, focus (1 sharp … 0 very soft), shift (screen widths and heights).
const STAGES = {
  at: [0, 0.6, 1.1, 2, 3, 4.2, 5.5, 7, 8.5],
  rot: [0, 0, 0.25, 0.7, 0.45, 0.15, 0.6, 1.35, 0.7],
  zoom: [1, 1.05, 1.3, 1.9, 1.8, 1.6, 1.4, 1.15, 1.9],
  focus: [1, 0.95, 0.6, 0.05, 0.08, 0.15, 0.3, 1, 0.05],
  ox: [0, 0, 0.05, -0.3, -0.05, -0.1, 0, 0, -0.3],
  oy: [0, 0, 0, -0.2, 0, 0, 0, 0.25, -0.2],
};

/**
 * The camera for a scroll position, as in the Relay recording (the owner: "the animation when someone
 * scrolls is totally different"): the river stays on screen behind every section and the camera flies
 * past it. At the top it is exactly the drawn river; for the first screen it moves with the page, then
 * drifts more slowly behind it while the camera moves through STAGES (eased from one to the next).
 * Reduce Motion: it simply moves with the page and softens. `vs` is the river's y at the top of the
 * screen; `rot` in radians.
 */
export function riverCamera(sy: number, W: number, H: number, still: boolean) {
  const q = Math.max(0, sy) / H;
  if (still) return { vs: sy, zoom: 1, rot: 0, ox: 0, oy: 0, focus: Math.max(0, 1 - q / 0.8) };
  const vs = H * (q - 0.6 * (softplus(q - 0.7, 0.25) - softplus(-0.7, 0.25)));
  const { at } = STAGES, last = at[at.length - 1];
  const qq = q <= last ? q : at[3] + ((q - at[3]) % (last - at[3]));
  let i = 0;
  while (i < at.length - 2 && qq >= at[i + 1]) i++;
  const f = smooth(at[i], at[i + 1], qq);
  const mix = (v: number[]) => v[i] + (v[i + 1] - v[i]) * f;
  return { vs, zoom: mix(STAGES.zoom), rot: mix(STAGES.rot), ox: mix(STAGES.ox) * W, oy: mix(STAGES.oy) * H, focus: mix(STAGES.focus) };
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

  const resize = (w: number, h: number, ratio: number) => {
    W = w; H = h;
    dpr = Math.min(2, ratio || 1, Math.sqrt(4.2e6 / Math.max(1, W * H)));
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    sizeLayer(main, cv.width, cv.height);
    sizeLayer(glow, Math.max(1, Math.round(W / 4)), Math.max(1, Math.round(H / 4)));
    // Enough for the river across the screen's diagonal (the camera turns it).
    samples = Math.ceil((Math.hypot(W + 520, H + 520) + 100) / step) + 2;
    const strip = new Float32Array(samples * 4);
    for (let i = 0; i < samples; i++) strip.set([i, -1, i, 1], i * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf); gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
  };

  const draw = (ms: number, s: RiverState) => {
    if (gl.isContextLost() || !W) return;
    const { sy, px, py, pAt } = s;
    const t = still ? 8 : ms / 1000;
    const dark = tone === 'dark' || s.dark;
    const pal = dark ? DARK : LIGHT;
    const k = (dark ? 1 : 0.75) * strength;
    const wide = W >= 1024;
    // The bends, in page pixels: the first beside the hero's paragraph, then one every D further
    // down, alternating sides (even ones open to the right).
    const D = H * 1.7, Y0 = H * (hero ? 0.684 : 0.55);
    const leftX = W * (wide ? 0.345 : phone ? 0.2 : 0.28), rightX = W - leftX;
    const S = Math.min(H, W * 0.9);
    const bendY = (b: number) => Y0 + b * D;
    const bendX = (b: number) => (b % 2 === 0 ? leftX : rightX) + Math.sin(t * 0.35 + b) * 8;
    const dir = (b: number) => (b % 2 === 0 ? 1 : -1);
    const grow = hero && !still ? Math.min(1, (ms - born) / 1800) : 1;
    const eased = 1 - Math.pow(1 - grow, 3);
    // The camera for this scroll (see riverCamera) and what it shows of the river: the screen's corners
    // taken back into the river's own coordinates.
    const cam = riverCamera(sy, W, H, still);
    const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    const toScr = (x: number, y: number) => { const qx = x - W / 2, qy = y - cam.vs - H / 2; return [(cs * qx - sn * qy) * cam.zoom + W / 2 + cam.ox, (sn * qx + cs * qy) * cam.zoom + H / 2 + cam.oy] as const; };
    const toRiver = (X: number, Y: number) => { const qx = (X - W / 2 - cam.ox) / cam.zoom, qy = (Y - H / 2 - cam.oy) / cam.zoom; return [cs * qx + sn * qy + W / 2, -sn * qx + cs * qy + H / 2 + cam.vs] as const; };
    // A wide margin: soft fibres are up to ~250 px wide, and their cut ends mustn't show.
    const ys = [[-260, -260], [W + 260, -260], [-260, H + 260], [W + 260, H + 260]].map(([X, Y]) => toRiver(X, Y)[1]);
    const y0 = Math.min(...ys);
    const y1 = Math.min(Math.max(...ys), hero && grow < 1 ? -80 + eased * (H * 1.3) : Infinity);
    const stepR = step / cam.zoom, count = Math.max(2, Math.min(samples, Math.ceil((y1 - y0) / stepR) + 2));
    const { focus } = cam;
    const fade = k * (0.4 + 0.6 * eased) * (hero ? 1 : 0.75);
    pv += ((ms - pAt < 2500 ? 1 : 0) - pv) * 0.08;
    const [rpx, rpy] = toRiver(px, py);
    const bends: number[] = [];
    for (let b = Math.max(0, Math.floor((y0 - H * 0.6 - Y0) / D)); bendY(b) < y1 + H * 0.6; b++) bends.push(b);

    const path = (u: (n: string) => WebGLUniformLocation | null) => {
      gl.uniform2f(u('u_view'), W, H); gl.uniform1f(u('u_sy'), sy); gl.uniform1f(u('u_t'), t);
      gl.uniform1f(u('u_S'), S); gl.uniform1f(u('u_twist'), still ? 0 : 1);
      gl.uniform4f(u('u_bend'), Y0, D, leftX, rightX); gl.uniform3f(u('u_ptr'), rpx, rpy, pv);
      gl.uniform4f(u('u_cam'), cam.vs, cam.zoom, cs, sn); gl.uniform2f(u('u_camOff'), cam.ox, cam.oy);
    };
    const strands = (blur: number, alpha: number, halo: number) => {
      const u = U.strand;
      gl.uniform1f(u('u_blur'), blur); gl.uniform1f(u('u_alpha'), alpha); gl.uniform1f(u('u_halo'), halo);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, count * 2, N);
    };
    // A glow at a point of the river (or of the screen, for the pointer's), through the camera.
    const blobAt = (x: number, y: number, r: number, [cr, cg, cb, a]: readonly number[], m: number, onScreen = false) => {
      const [X, Y] = onScreen ? [x, y] : toScr(x, y);
      gl.uniform3f(U.blob('u_at'), X, Y, onScreen ? r : r * cam.zoom); gl.uniform4f(U.blob('u_col'), cr, cg, cb, a * m);
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
      const gx = bendX(b) + dir(b) * 22, gy = bendY(b);
      blobAt(gx, gy, m * 0.8, pal.glow[2], fade * scale);
      blobAt(gx, gy, m * 0.32, pal.glow[1], fade * scale);
      blobAt(gx, gy, m * 0.1, pal.glow[0], fade * scale);
      // …and along the upper arm, where the recording's light spreads out with the fibres.
      const d = H * 0.34, up = S * 0.25;
      blobAt(bendX(b) + dir(b) * up, bendY(b) - d, m * 0.5, pal.glow[2], fade * scale * 0.8);
      // …and down the lower arm, along the middle of the fibres (the recording's green haze there).
      for (const [dd, r, a] of [[0.14, 0.28, 0.9], [0.34, 0.38, 0.85], [0.58, 0.46, 0.8]] as const) {
        const u = Math.pow(dd * H / (0.22 * S), 1.8);
        blobAt(bendX(b) + dir(b) * 0.62 * S * u / (1 + u), bendY(b) + dd * H, m * r, pal.glow[2], fade * scale * a);
      }
    }
    if (hero && dark && cam.vs < H * 1.5) blobAt(W * 0.82, H * 0.16, Math.max(W, H) * 0.55, pal.haze, fade * scale);
    if (pv > 0.01) blobAt(px, py, 170, pal.glow[1], pv * k * scale, true);
    gl.useProgram(strand);
    gl.bindVertexArray(strandVao);
    path(U.strand);
    gl.uniform3fv(U.strand('u_pal'), pal.fibres.flat());
    gl.uniform1f(U.strand('u_y0'), y0); gl.uniform1f(U.strand('u_step'), stepR); gl.uniform1f(U.strand('u_y1'), y1);
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
    gl.uniform1f(U.dot('u_dpr'), dpr); gl.uniform1f(U.dot('u_alpha'), sharp * scale * (0.15 + 0.85 * focus * focus)); gl.uniform1f(U.dot('u_y1'), y1);
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
  };

  return { resize, draw };
}
