import type { Mesh } from './mesh';
import { symEig } from './modal';
import { Skyline } from './skyline';
import { assemble, G, heldBy, slopes, solveStatic, warmingAt, type Study } from './structure';

// Hyperion Simulate → Buckling (M545): linear (eigenvalue) buckling, as engineering software does it. The loads are
// solved first; the stress they make stiffens or softens the part (a pull stiffens a string, a push softens a column):
// the geometric stiffness Kg = ∫ ∇Nᵀ·σ·∇N. The part buckles when K + λ·Kg can no longer hold it, at λ times the loads.
// λ comes from Lanczos on K⁻¹(−Kg) in K's inner product (its largest values are 1/λ of the lowest buckling loads),
// the same way Vibration finds its modes. In plane (the flat part's own plane): a column, a strip on edge, a thin web.

export interface BuckleMode { factor: number; ux: Float64Array; uy: Float64Array; u: Float64Array }
export interface BuckleResult {
  /** The lowest buckling load factors (×the loads), smallest first, with their shapes (largest movement = 1). */
  modes: BuckleMode[];
  /** True when nothing pushes hard enough anywhere: the loads only pull (or there are none). */
  none: boolean;
  steps: number;
}

const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** The stress the loads make at each element's integration points (sx, sy, sxy), from the static answer. */
function gaussStress(mesh: Mesh, study: Study, ux: Float64Array, uy: Float64Array) {
  const m = study.material, ne = mesh.tri.length / 6, k = m.E / (1 - m.nu * m.nu), d12 = k * m.nu, d33 = (k * (1 - m.nu)) / 2;
  const dT = warmingAt(mesh, study.warming), per = (m.E * m.alpha) / (1 - m.nu), out = new Float64Array(ne * 9);
  for (let e = 0; e < ne; e++) G.forEach(([xi, eta], g) => {
    const { bx, by, N } = slopes(mesh, e, xi, eta);
    let ex = 0, ey = 0, gm = 0, d = 0;
    for (let i = 0; i < 6; i++) { const n = mesh.tri[e * 6 + i]; ex += bx[i] * ux[n]; ey += by[i] * uy[n]; gm += by[i] * ux[n] + bx[i] * uy[n]; if (dT) d += N[i] * dT[n]; }
    const th = per * d, o = e * 9 + g * 3;
    out[o] = k * ex + d12 * ey - th; out[o + 1] = d12 * ex + k * ey - th; out[o + 2] = d33 * gm;
  });
  return out;
}

export function solveBuckling(mesh: Mesh, study: Study, count = 4): BuckleResult {
  const nn = mesh.x.length, n = 2 * nn, ne = mesh.tri.length / 6, t = study.thickness;
  const st = solveStatic(mesh, study), sig = gaussStress(mesh, study, st.ux, st.uy);
  const { K, first, dof } = assemble(mesh, study.material, t);
  // Kg: the same for x and for y movements (∇Nᵢ·σ·∇Nⱼ), nothing between them.
  const Kg = new Skyline(n, first);
  for (let e = 0; e < ne; e++) G.forEach(([xi, eta], g) => {
    const { bx, by, det } = slopes(mesh, e, xi, eta), o = e * 9 + g * 3, sx = sig[o], sy = sig[o + 1], sxy = sig[o + 2], w = (det / 6) * t;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const v = (bx[i] * (sx * bx[j] + sxy * by[j]) + by[i] * (sxy * bx[j] + sy * by[j])) * w;
      if (!v) continue;
      const ni = mesh.tri[e * 6 + i], nj = mesh.tri[e * 6 + j];
      for (const c of [0, 1]) { const a = dof(ni, c), b = dof(nj, c); if (a <= b) Kg.add(a, b, v); }
    }
  });
  const { held } = heldBy(mesh, study.supports, dof);
  K.fix(held); Kg.fix(held, 0);
  const Kc = new Skyline(n, first);
  Kc.a.set(K.a);
  K.factor();
  const free = n - held.reduce((s, v) => s + v, 0), want = Math.min(count, free);
  const Q: Float64Array[] = [], KQ: Float64Array[] = [], alpha: number[] = [], beta: number[] = [];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) - 0.5;
  let r = K.solve(Float64Array.from({ length: n }, (_, d) => (held[d] ? 0 : 1 + rnd())));
  let ritz: { values: number[]; vectors: number[][] } = { values: [], vectors: [] }, steps = 0;
  const maxSteps = Math.min(free, Math.max(2 * want + 24, 36), 200);
  const tri = () => Array.from({ length: steps }, (_, i) => Array.from({ length: steps }, (_, k) => (i === k ? alpha[i] : Math.abs(i - k) === 1 ? beta[Math.min(i, k)] : 0)));
  const top = () => ritz.values.map((_, i) => i).filter((i) => ritz.values[i] > 0).sort((x, y) => ritz.values[y] - ritz.values[x]).slice(0, want);
  for (let j = 0; j < maxSteps; j++) {
    const kr = Kc.mul(r), b = Math.sqrt(Math.max(0, dot(r, kr)));
    if (j > 0) beta.push(b);
    if (!(b > 1e-300)) break;
    const q = r.map((v) => v / b), kq = kr.map((v) => v / b);
    Q.push(q); KQ.push(kq);
    const gq = Kg.mul(q);
    for (let d = 0; d < n; d++) gq[d] = -gq[d];
    const w = K.solve(gq);
    alpha.push(dot(kq, w));
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < Q.length; i++) { const c = dot(KQ[i], w); if (c) for (let d = 0; d < n; d++) w[d] -= c * Q[i][d]; }
    r = w;
    steps = j + 1;
    if (steps >= want + 4 && (steps % 4 === 0 || steps === maxSteps)) {
      ritz = symEig(tri());
      const bNext = Math.sqrt(Math.max(0, dot(r, Kc.mul(r)))), best = top();
      if (best.length >= want && best.every((i) => Math.abs(bNext * ritz.vectors[steps - 1][i]) < 1e-9 * Math.abs(ritz.values[i]))) break;
    }
  }
  if (ritz.values.length !== steps) ritz = symEig(tri());
  // Values far below the largest are rounding (a part that only pulls has none worth the name).
  const biggest = Math.max(0, ...ritz.values.map(Math.abs));
  const modes: BuckleMode[] = top().filter((i) => ritz.values[i] > 1e-10 * biggest).map((i) => {
    const v = new Float64Array(n);
    for (let k = 0; k < steps; k++) { const c = ritz.vectors[k][i]; if (c) for (let d = 0; d < n; d++) v[d] += c * Q[k][d]; }
    const ux = new Float64Array(nn), uy = new Float64Array(nn), u = new Float64Array(nn);
    let big = 0;
    for (let p = 0; p < nn; p++) { ux[p] = v[dof(p, 0)]; uy[p] = v[dof(p, 1)]; u[p] = Math.hypot(ux[p], uy[p]); big = Math.max(big, u[p]); }
    for (let p = 0; p < nn; p++) { ux[p] /= big || 1; uy[p] /= big || 1; u[p] /= big || 1; }
    return { factor: 1 / ritz.values[i], ux, uy, u };
  });
  return { modes, none: !modes.length, steps };
}
