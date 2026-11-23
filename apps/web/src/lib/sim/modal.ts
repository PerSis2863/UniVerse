import type { Mesh } from './mesh';
import { Skyline } from './skyline';
import { MechanismError } from './skyline';
import { assemble, heldBy, nodalLoads, slopes, stressOf, type Material, type Study, type Support } from './structure';

// Hyperion Simulate → Vibration (M406): a part's natural frequencies and the shape it swings in at each (Ansys calls it
// a modal analysis). The same mesh and stiffness as Structures, plus the part's mass spread consistently over each
// element (6-point Gauss, exact for 6-node triangles); the lowest frequencies come from shift-invert Lanczos with full
// reorthogonalisation (K is factored once; each step is one solve and one product). Masses in tonnes and lengths in
// mm keep the units whole: K/M is then 1/s².

export interface Mode {
  /** Hertz. */
  freq: number;
  /** The shape, scaled so the largest movement is 1. */
  ux: Float64Array; uy: Float64Array;
  /** The share of the part's free mass moving with this mode, sideways (x) and up and down (y): 0 to 1. */
  massX: number; massY: number;
}
export interface ModalResult {
  modes: Mode[]; steps: number;
  /** Ways the part moves as a whole at 0 Hz (sliding, turning) when it is held nowhere or not firmly (M442). */
  rigid: number;
}

// Dunavant's 6-point rule: (a, a, 1 − 2a) and its turns, weights over a triangle of area 1.
const D6: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (const [a, w] of [[0.445948490915965, 0.223381589678011], [0.091576213509771, 0.109951743655322]]) out.push([a, a, w], [a, 1 - 2 * a, w], [1 - 2 * a, a, w]);
  return out;
})();

/** Eigenvalues and vectors of a small symmetric matrix (Jacobi rotations). */
export function symEig(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length, a = A.map((r) => [...r]), v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** The part's mass matrix (consistent, tonnes), on the stiffness matrix's numbering. */
function massMatrix(mesh: Mesh, material: Material, t: number, first: Int32Array, dof: (node: number, c: number) => number) {
  const ne = mesh.tri.length / 6, M = new Skyline(2 * mesh.x.length, first), rho = material.rho * 1e-12 * t; // tonnes per mm² of face
  for (let e = 0; e < ne; e++) {
    const m = new Float64Array(36);
    for (const [xi, eta, w] of D6) {
      const { N, det } = slopes(mesh, e, xi, eta), f = rho * w * (det / 2);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) m[i * 6 + j] += N[i] * N[j] * f;
    }
    for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) for (const c of [0, 1]) M.add(dof(mesh.tri[e * 6 + i], c), dof(mesh.tri[e * 6 + j], c), m[i * 6 + j]);
  }
  return M;
}

/** The modes as the solvers need them: ω² (1/s²) and shapes scaled so φᵀMφ = 1, over every unknown. */
export interface Basis {
  lambda: number[]; phi: Float64Array[]; rigid: number; steps: number;
  M: Skyline; dof: (node: number, c: number) => number; held: Uint8Array;
  /** K factored (null when the part isn't held firmly: then only the shifted matrix was). */
  K: Skyline | null;
}

/**
 * The lowest `count` modes by shift-invert Lanczos on (K − σM)⁻¹M with full reorthogonalisation. A held part uses σ = 0;
 * a part held nowhere (or able to slide or turn) is shifted below zero (M442), so its moves as a whole come out at 0 Hz
 * and are counted apart from the modes.
 */
export function modalBasis(mesh: Mesh, material: Material, t: number, supports: Support[], count = 6): Basis {
  const n = 2 * mesh.x.length;
  const first0 = assemble(mesh, material, t), { first, dof } = first0;
  let K = first0.K;
  const { held } = heldBy(mesh, supports, dof);
  const M = massMatrix(mesh, material, t, first, dof);
  K.fix(held); M.fix(held, 0);
  let sigma = 0, Kf: Skyline | null = K;
  try {
    if (!held.some((v) => v)) throw new MechanismError(0);
    K.factor();
  } catch (err) {
    if (!(err instanceof MechanismError)) throw err;
    // Shift: K − σM with σ below zero is firm whatever holds the part. σ from the typical stiffness-to-mass ratio.
    K = assemble(mesh, material, t).K;
    let ratio = 0, cnt = 0;
    for (let j = 0; j < n; j++) if (!held[j] && M.diag(j) > 0) { ratio += K.diag(j) / M.diag(j); cnt++; }
    sigma = -1e-6 * (ratio / (cnt || 1));
    for (let j = 0; j < n; j++) {
      const fj = M.first[j], sj = M.start[j];
      for (let i = fj; i <= j; i++) { const v = M.a[sj + i - fj]; if (v) K.add(i, j, -sigma * v); }
    }
    K.fix(held);
    K.factor();
    Kf = null;
  }
  const free = n - held.reduce((s, v) => s + v, 0), want = Math.min(count + (sigma ? 3 : 0), free);
  // Lanczos on K⁻¹M in the M inner product: its largest values are 1/(ω² − σ) of the lowest modes.
  const Q: Float64Array[] = [], MQ: Float64Array[] = [], alpha: number[] = [], beta: number[] = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) - 0.5;
  let r = M.mul(Float64Array.from({ length: n }, () => 1 + rnd()));
  r = K.solve(r);
  let ritz: { values: number[]; vectors: number[][] } = { values: [], vectors: [] }, steps = 0;
  const maxSteps = Math.min(free, Math.max(2 * want + 20, 30), 200);
  const tri = () => Array.from({ length: steps }, (_, i) => Array.from({ length: steps }, (_, k) => (i === k ? alpha[i] : Math.abs(i - k) === 1 ? beta[Math.min(i, k)] : 0)));
  for (let j = 0; j < maxSteps; j++) {
    const mr = M.mul(r), b = Math.sqrt(Math.max(0, dot(r, mr)));
    if (j > 0) beta.push(b);
    if (!(b > 1e-300)) break;
    const q = r.map((v) => v / b), mq = mr.map((v) => v / b);
    Q.push(q); MQ.push(mq);
    const w = K.solve(mq);
    alpha.push(dot(mq, w));
    // Against every earlier vector, twice (full reorthogonalisation keeps the Ritz values clean).
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < Q.length; i++) { const c = dot(MQ[i], w); if (c) for (let k = 0; k < n; k++) w[k] -= c * Q[i][k]; }
    r = w;
    steps = j + 1;
    // Every few steps: are the wanted modes settled?
    if (steps >= want + 4 && (steps % 4 === 0 || steps === maxSteps)) {
      ritz = symEig(tri());
      const order = ritz.values.map((v, i) => i).sort((x, y) => ritz.values[y] - ritz.values[x]).slice(0, want);
      const bNext = Math.sqrt(Math.max(0, dot(r, M.mul(r))));
      if (order.every((i) => Math.abs(bNext * ritz.vectors[steps - 1][i]) < 1e-9 * Math.abs(ritz.values[i]))) break;
    }
  }
  if (ritz.values.length !== steps) ritz = symEig(tri());
  const order = ritz.values.map((v, i) => i).filter((i) => ritz.values[i] > 0).sort((x, y) => ritz.values[y] - ritz.values[x]).slice(0, want);
  const lambda: number[] = [], phi: Float64Array[] = [];
  let rigid = 0;
  for (const i of order) {
    const l = sigma + 1 / ritz.values[i];
    // A move as a whole: ω² is zero up to the shift's rounding.
    if (sigma && Math.abs(l) < 1e-6 * Math.abs(sigma)) { rigid++; continue; }
    const v = new Float64Array(n);
    for (let k = 0; k < steps; k++) { const c = ritz.vectors[k][i]; if (c) for (let d = 0; d < n; d++) v[d] += c * Q[k][d]; }
    const mm = Math.sqrt(dot(v, M.mul(v))) || 1;
    for (let d = 0; d < n; d++) v[d] /= mm;
    lambda.push(l); phi.push(v);
  }
  return { lambda: lambda.slice(0, count), phi: phi.slice(0, count), rigid, steps, M, dof, held, K: Kf };
}

export function solveModes(mesh: Mesh, material: Material, t: number, supports: Support[], count = 6): ModalResult {
  const nn = mesh.x.length, n = 2 * nn;
  const b = modalBasis(mesh, material, t, supports, count), { M, dof } = b;
  // The share of mass in x and y: the free mass first.
  const rx = new Float64Array(n), ry = new Float64Array(n);
  for (let node = 0; node < nn; node++) { rx[dof(node, 0)] = 1; ry[dof(node, 1)] = 1; }
  const Mrx = M.mul(rx), Mry = M.mul(ry), totX = dot(rx, Mrx) || 1, totY = dot(ry, Mry) || 1;
  const modes: Mode[] = b.phi.map((phi, i) => {
    const gx = dot(phi, Mrx), gy = dot(phi, Mry);
    const ux = new Float64Array(nn), uy = new Float64Array(nn);
    let big = 0, sign = 1;
    for (let node = 0; node < nn; node++) {
      ux[node] = phi[dof(node, 0)]; uy[node] = phi[dof(node, 1)];
      const m = Math.hypot(ux[node], uy[node]);
      if (m > big) { big = m; sign = Math.abs(ux[node]) > Math.abs(uy[node]) ? Math.sign(ux[node]) : Math.sign(uy[node]); }
    }
    for (let node = 0; node < nn; node++) { ux[node] *= sign / (big || 1); uy[node] *= sign / (big || 1); }
    return { freq: Math.sqrt(Math.max(0, b.lambda[i])) / (2 * Math.PI), ux, uy, massX: (gx * gx) / totX, massY: (gy * gy) / totY };
  });
  return { modes, steps: b.steps, rigid: b.rigid };
}

// —— Harmonic response (M442): the part shaken steadily at one frequency after another, with damping. ——

export interface Harmonic {
  /** What shakes it: the study's loads, each swinging at the frequency ('loads'), or its supports ('base'). */
  drive: 'loads' | 'base';
  /** For 'base': the direction and the shaking's size in g (1 g = 9.81 m/s²). */
  dir: 'x' | 'y'; g: number;
  /** Damping as a share of critical (0.02 = 2 %: bolted steel about 2–5 %, a welded frame 1 %). */
  zeta: number;
  /** The range swept, Hz. */
  fMin: number; fMax: number;
}
export const HARMONIC_START: Harmonic = { drive: 'loads', dir: 'y', g: 1, zeta: 0.02, fMin: 0, fMax: 0 };

export interface HarmonicResult {
  /** Frequencies (Hz) and the movement there (mm, the largest over a cycle) at the point that moves most. */
  f: Float64Array; amp: Float64Array; watch: number;
  /** Its resonances: where the curve peaks, with the movement and the damping-free mode it comes from. */
  peaks: { f: number; amp: number; mode: number }[];
  /** The movement when the shaking is slow (the static answer), mm. */
  staticAmp: number;
  modesUsed: number; fMax: number;
}

/** The complex response over every unknown at ω (rad/s): mode superposition with the static part kept exact (mode acceleration). */
function responseAt(b: Basis, p: number[], us: Float64Array, w: number, zeta: number) {
  const n = us.length, re = Float64Array.from(us), im = new Float64Array(n);
  b.lambda.forEach((l, i) => {
    const wi = Math.sqrt(l), dr = l - w * w, di = 2 * zeta * wi * w, dd = dr * dr + di * di;
    // H − 1/λ: the dynamic part beyond the static one.
    const hr = dr / dd - 1 / l, hi = -di / dd;
    const v = b.phi[i];
    for (let k = 0; k < n; k++) { re[k] += v[k] * p[i] * hr; im[k] += v[k] * p[i] * hi; }
  });
  return { re, im };
}

/** The most a node moves over a cycle: the long half-axis of the ellipse it draws. */
const swingOf = (ar: number, ai: number, br: number, bi: number) => {
  const a2 = ar * ar + br * br, b2 = ai * ai + bi * bi, ab = ar * ai + br * bi;
  return Math.sqrt(Math.max(0, (a2 + b2) / 2 + Math.sqrt(((a2 - b2) / 2) ** 2 + ab * ab)));
};

/** The shaking as forces on the unknowns (N): the loads, or −M·r·a for shaking supports. */
function driveOf(mesh: Mesh, study: Study, h: Harmonic, b: Basis) {
  const nn = mesh.x.length, F = new Float64Array(2 * nn);
  if (h.drive === 'loads') {
    const { fx, fy } = nodalLoads(mesh, { ...study, gravity: false });
    for (let node = 0; node < nn; node++) { F[b.dof(node, 0)] = fx[node]; F[b.dof(node, 1)] = fy[node]; }
  } else {
    const r = new Float64Array(2 * nn), c = h.dir === 'x' ? 0 : 1;
    for (let node = 0; node < nn; node++) r[b.dof(node, c)] = 1;
    const Mr = b.M.mul(r), a = h.g * 9810; // mm/s²
    for (let d = 0; d < F.length; d++) F[d] = b.held[d] ? 0 : -Mr[d] * a;
  }
  for (let d = 0; d < F.length; d++) if (b.held[d]) F[d] = 0;
  return F;
}

export function solveHarmonic(mesh: Mesh, study: Study, h: Harmonic, b: Basis): HarmonicResult {
  if (!b.K) throw new Error('Hold the part firmly first: shaking a part that can slide or turn has no steady answer.');
  const nn = mesh.x.length, F = driveOf(mesh, study, h, b);
  if (!F.some((v) => v)) throw new Error(h.drive === 'loads' ? 'Add a load first: it is what swings back and forth.' : 'Nothing moves: shaking the supports needs a part with mass that isn’t held everywhere.');
  const us = b.K.solve(F), p = b.phi.map((v) => dot(v, F)), zeta = Math.max(1e-4, Math.min(0.5, h.zeta));
  // Automatic range: past the fourth mode (the ones a part usually meets), not the 24th.
  const fTop = b.lambda.length ? Math.sqrt(b.lambda[Math.min(3, b.lambda.length - 1)]) / (2 * Math.PI) : 1;
  const fMax = h.fMax > 0 ? h.fMax : fTop * 1.5, fMin = Math.max(0, Math.min(h.fMin, fMax * 0.9));
  // Where to watch: the node that moves most at the strongest resonance in range (or slowly, when none is).
  const at = (re: Float64Array, im: Float64Array, node: number) => swingOf(re[b.dof(node, 0)], im[b.dof(node, 0)], re[b.dof(node, 1)], im[b.dof(node, 1)]);
  let watch = 0, best = -1;
  const tries = [0, ...b.lambda.map((l) => Math.sqrt(l)).filter((w) => w / (2 * Math.PI) >= fMin && w / (2 * Math.PI) <= fMax)];
  for (const w of tries) {
    const { re, im } = responseAt(b, p, us, w, zeta);
    for (let node = 0; node < nn; node++) { const v = at(re, im, node); if (v > best) { best = v; watch = node; } }
  }
  // The sweep: an even grid plus each resonance and its half-power points, so no peak falls between points.
  const fs = new Set<number>();
  for (let i = 0; i <= 400; i++) fs.add(fMin + ((fMax - fMin) * i) / 400);
  for (const l of b.lambda) { const f0 = Math.sqrt(l) / (2 * Math.PI); for (const k of [-2, -1, -0.5, 0, 0.5, 1, 2]) { const f = f0 * (1 + k * zeta); if (f >= fMin && f <= fMax) fs.add(f); } }
  const f = Float64Array.from([...fs].sort((x, y) => x - y)), amp = new Float64Array(f.length);
  const dx = b.dof(watch, 0), dy = b.dof(watch, 1);
  f.forEach((hz, k) => {
    const w = 2 * Math.PI * hz;
    let xr = us[dx], xi = 0, yr = us[dy], yi = 0;
    b.lambda.forEach((l, i) => {
      const wi = Math.sqrt(l), dr = l - w * w, di = 2 * zeta * wi * w, dd = dr * dr + di * di, hr = dr / dd - 1 / l, hi = -di / dd, c = p[i];
      xr += b.phi[i][dx] * c * hr; xi += b.phi[i][dx] * c * hi; yr += b.phi[i][dy] * c * hr; yi += b.phi[i][dy] * c * hi;
    });
    amp[k] = swingOf(xr, xi, yr, yi);
  });
  const peaks: HarmonicResult['peaks'] = [];
  for (let k = 1; k < f.length - 1; k++) if (amp[k] > amp[k - 1] && amp[k] >= amp[k + 1]) {
    const w = 2 * Math.PI * f[k];
    let mode = 0;
    b.lambda.forEach((l, i) => { if (Math.abs(Math.sqrt(l) - w) < Math.abs(Math.sqrt(b.lambda[mode]) - w)) mode = i; });
    peaks.push({ f: f[k], amp: amp[k], mode });
  }
  return { f, amp, watch, peaks, staticAmp: Math.hypot(us[dx], us[dy]), modesUsed: b.lambda.length, fMax };
}

/** The part at one shaking frequency: its shape at the moment the watched point is furthest out, how far each point
 *  swings, and the largest von Mises stress each point reaches over a cycle (MPa). */
export function harmonicField(mesh: Mesh, study: Study, h: Harmonic, b: Basis, hz: number, watch: number) {
  const nn = mesh.x.length, F = driveOf(mesh, study, h, b), us = b.K!.solve(F), p = b.phi.map((v) => dot(v, F));
  const { re, im } = responseAt(b, p, us, 2 * Math.PI * hz, Math.max(1e-4, Math.min(0.5, h.zeta)));
  const ux = new Float64Array(nn), uy = new Float64Array(nn), swing = new Float64Array(nn), vm = new Float64Array(nn);
  // The watched point's furthest moment: the phase that maximises its movement.
  const wx = [re[b.dof(watch, 0)], im[b.dof(watch, 0)]], wy = [re[b.dof(watch, 1)], im[b.dof(watch, 1)]];
  const th = 0.5 * Math.atan2(-2 * (wx[0] * wx[1] + wy[0] * wy[1]), wx[0] ** 2 + wy[0] ** 2 - wx[1] ** 2 - wy[1] ** 2);
  for (let node = 0; node < nn; node++) {
    const xr = re[b.dof(node, 0)], xi = im[b.dof(node, 0)], yr = re[b.dof(node, 1)], yi = im[b.dof(node, 1)];
    ux[node] = xr * Math.cos(th) - xi * Math.sin(th); uy[node] = yr * Math.cos(th) - yi * Math.sin(th);
    swing[node] = swingOf(xr, xi, yr, yi);
  }
  const tx = new Float64Array(nn), ty = new Float64Array(nn);
  for (let s = 0; s < 12; s++) {
    const ph = (Math.PI * s) / 12, c = Math.cos(ph), sn = Math.sin(ph);
    for (let node = 0; node < nn; node++) { tx[node] = re[b.dof(node, 0)] * c - im[b.dof(node, 0)] * sn; ty[node] = re[b.dof(node, 1)] * c - im[b.dof(node, 1)] * sn; }
    const st = stressOf(mesh, study.material, tx, ty);
    for (let node = 0; node < nn; node++) if (st.vm[node] > vm[node]) vm[node] = st.vm[node];
  }
  return { ux, uy, swing, vm };
}
