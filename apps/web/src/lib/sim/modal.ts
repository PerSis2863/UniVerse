import type { Mesh } from './mesh';
import { Skyline } from './skyline';
import { assemble, heldBy, slopes, type Material, type Support } from './structure';

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
export interface ModalResult { modes: Mode[]; steps: number }

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

export function solveModes(mesh: Mesh, material: Material, t: number, supports: Support[], count = 6): ModalResult {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, n = 2 * nn;
  const { K, first, dof } = assemble(mesh, material, t);
  const { held } = heldBy(mesh, supports, dof);
  if (!held.some((v) => v)) throw new Error('Hold the part somewhere first: a part held nowhere has no natural frequencies to find here.');
  const M = new Skyline(n, first), rho = material.rho * 1e-12 * t; // tonnes per mm² of face
  for (let e = 0; e < ne; e++) {
    const m = new Float64Array(36);
    for (const [xi, eta, w] of D6) {
      const { N, det } = slopes(mesh, e, xi, eta), f = rho * w * (det / 2);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) m[i * 6 + j] += N[i] * N[j] * f;
    }
    for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) for (const c of [0, 1]) M.add(dof(mesh.tri[e * 6 + i], c), dof(mesh.tri[e * 6 + j], c), m[i * 6 + j]);
  }
  K.fix(held); M.fix(held, 0);
  K.factor();
  const free = n - held.reduce((s, v) => s + v, 0), want = Math.min(count, free);
  // Lanczos on K⁻¹M in the M inner product: its largest values are 1/ω² of the lowest modes.
  const Q: Float64Array[] = [], MQ: Float64Array[] = [], alpha: number[] = [], beta: number[] = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) - 0.5;
  let r = M.mul(Float64Array.from({ length: n }, () => 1 + rnd()));
  r = K.solve(r);
  let ritz: { values: number[]; vectors: number[][] } = { values: [], vectors: [] }, steps = 0;
  const maxSteps = Math.min(free, Math.max(2 * want + 20, 30), 160);
  for (let j = 0; j < maxSteps; j++) {
    const mr = M.mul(r), b = Math.sqrt(Math.max(0, dot(r, mr)));
    if (j > 0) beta.push(b);
    if (!(b > 1e-300)) break;
    const q = r.map((v) => v / b), mq = mr.map((v) => v / b);
    Q.push(q); MQ.push(mq);
    const w = K.solve(mq);
    const a = dot(mq, w);
    alpha.push(a);
    // Against every earlier vector, twice (full reorthogonalisation keeps the Ritz values clean).
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < Q.length; i++) { const c = dot(MQ[i], w); if (c) for (let k = 0; k < n; k++) w[k] -= c * Q[i][k]; }
    r = w;
    steps = j + 1;
    // Every few steps: are the wanted modes settled?
    if (steps >= want + 4 && (steps % 4 === 0 || steps === maxSteps)) {
      const T = Array.from({ length: steps }, (_, i) => Array.from({ length: steps }, (_, k) => (i === k ? alpha[i] : Math.abs(i - k) === 1 ? beta[Math.min(i, k)] : 0)));
      ritz = symEig(T);
      const order = ritz.values.map((v, i) => i).sort((x, y) => ritz.values[y] - ritz.values[x]).slice(0, want);
      const bNext = Math.sqrt(Math.max(0, dot(r, M.mul(r))));
      if (order.every((i) => Math.abs(bNext * ritz.vectors[steps - 1][i]) < 1e-9 * Math.abs(ritz.values[i]))) break;
    }
  }
  if (ritz.values.length !== steps) {
    const T = Array.from({ length: steps }, (_, i) => Array.from({ length: steps }, (_, k) => (i === k ? alpha[i] : Math.abs(i - k) === 1 ? beta[Math.min(i, k)] : 0)));
    ritz = symEig(T);
  }
  const order = ritz.values.map((v, i) => i).filter((i) => ritz.values[i] > 0).sort((x, y) => ritz.values[y] - ritz.values[x]).slice(0, want);
  // The share of mass in x and y: the free mass first.
  const rx = new Float64Array(n), ry = new Float64Array(n);
  for (let node = 0; node < nn; node++) { rx[dof(node, 0)] = 1; ry[dof(node, 1)] = 1; }
  const Mrx = M.mul(rx), Mry = M.mul(ry), totX = dot(rx, Mrx) || 1, totY = dot(ry, Mry) || 1;
  const modes: Mode[] = order.map((i) => {
    const phi = new Float64Array(n);
    for (let k = 0; k < steps; k++) { const c = ritz.vectors[k][i]; if (c) for (let d = 0; d < n; d++) phi[d] += c * Q[k][d]; }
    const gx = dot(phi, Mrx), gy = dot(phi, Mry), mm = dot(phi, M.mul(phi)) || 1;
    const ux = new Float64Array(nn), uy = new Float64Array(nn);
    let big = 0, sign = 1;
    for (let node = 0; node < nn; node++) {
      ux[node] = phi[dof(node, 0)]; uy[node] = phi[dof(node, 1)];
      const m = Math.hypot(ux[node], uy[node]);
      if (m > big) { big = m; sign = Math.abs(ux[node]) > Math.abs(uy[node]) ? Math.sign(ux[node]) : Math.sign(uy[node]); }
    }
    for (let node = 0; node < nn; node++) { ux[node] *= sign / (big || 1); uy[node] *= sign / (big || 1); }
    return { freq: Math.sqrt(1 / ritz.values[i]) / (2 * Math.PI), ux, uy, massX: (gx * gx) / mm / totX, massY: (gy * gy) / mm / totY };
  });
  return { modes, steps };
}
