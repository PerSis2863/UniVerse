import type { Mesh } from './mesh';
import { Skyline } from './skyline';
import { elementStiffness, heldBy, nodalLoads, numbering, type Study } from './structure';

// Hyperion Simulate → Lightest shape (M547): topology optimisation by SIMP, the method engineering software uses. Every
// element gets a density x between almost nothing and solid; its stiffness is x³ of the material's (so half-full
// elements are poor value and the answer settles on solid and empty). Each round solves the part, finds how much each
// element's material helps carry the loads (the compliance's sensitivity −3x²·uᵀk·u), smooths that over a small radius
// (so no checkerboards or one-element struts), and moves material by the optimality criteria until the part keeps only
// the share asked for. What is left is the stiffest shape for that weight.

export interface TopoSettings { keep: number; rounds?: number; penal?: number; radius?: number }
export interface TopoResult {
  /** Each element's density (0–1), and the same averaged at the nodes for the picture. */
  density: Float64Array; atNodes: Float64Array;
  /** How bendy the part is (compliance, N·mm) at each round, and solid (all material) for comparison. */
  history: number[]; solid: number;
  /** The share of material kept, and how many elements are neither solid (≥ 0.9) nor empty (≤ 0.1). */
  kept: number; grey: number; rounds: number;
  /** The weight of what is kept (kg). */
  massKg: number;
}

const X_MIN = 1e-3;

export function solveTopology(mesh: Mesh, study: Study, s: TopoSettings): TopoResult {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, t = study.thickness, keep = Math.min(0.95, Math.max(0.05, s.keep));
  const penal = s.penal ?? 3, rounds = s.rounds ?? 120;
  const { pos, first } = numbering(mesh), dof = (node: number, c: number) => 2 * pos[node] + c;
  // Each element's stiffness at full material, its area and its middle (for the smoothing).
  const ks = new Float64Array(ne * 144), area = new Float64Array(ne), cx = new Float64Array(ne), cy = new Float64Array(ne);
  for (let e = 0; e < ne; e++) {
    area[e] = elementStiffness(mesh, e, study.material, t, ks.subarray(e * 144, e * 144 + 144)).area;
    for (let i = 0; i < 3; i++) { cx[e] += mesh.x[mesh.tri[e * 6 + i]] / 3; cy[e] += mesh.y[mesh.tri[e * 6 + i]] / 3; }
  }
  const total = area.reduce((a, b) => a + b, 0);
  // The smoothing radius: about one element's size unless asked (wider gives fewer, thicker members but greyer edges).
  const h = Math.sqrt(total / ne) * 1.5, rmin = s.radius ?? h;
  const nbr: number[][] = Array.from({ length: ne }, () => []), wts: number[][] = Array.from({ length: ne }, () => []);
  // A grid of cells the radius wide finds the neighbours without comparing every pair.
  const cells = new Map<string, number[]>(), key = (x: number, y: number) => `${Math.floor(x / rmin)},${Math.floor(y / rmin)}`;
  for (let e = 0; e < ne; e++) { const k = key(cx[e], cy[e]); (cells.get(k) ?? cells.set(k, []).get(k)!).push(e); }
  for (let e = 0; e < ne; e++) {
    const gx = Math.floor(cx[e] / rmin), gy = Math.floor(cy[e] / rmin);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const f of cells.get(`${gx + a},${gy + b}`) ?? []) {
      const w = rmin - Math.hypot(cx[e] - cx[f], cy[e] - cy[f]);
      if (w > 0) { nbr[e].push(f); wts[e].push(w * area[f]); }
    }
  }
  // Loads (the edges' forces; the part's own weight would change with the shape, so it is left out).
  const { fx, fy } = nodalLoads(mesh, study), f = new Float64Array(2 * nn);
  for (let n = 0; n < nn; n++) { f[dof(n, 0)] = fx[n]; f[dof(n, 1)] = fy[n]; }
  const { held } = heldBy(mesh, study.supports, dof);
  if (!held.some((v) => v)) throw new Error('Add a support first: a part held nowhere just flies away.');
  if (!f.some((v) => v)) throw new Error('Add a load first: with nothing to carry, any shape will do.');
  for (let d = 0; d < f.length; d++) if (held[d]) f[d] = 0;
  const solve = (x: Float64Array) => {
    const K = new Skyline(2 * nn, first);
    for (let e = 0; e < ne; e++) {
      const sc = X_MIN + x[e] ** penal * (1 - X_MIN);
      for (let i = 0; i < 12; i++) for (let j = i; j < 12; j++) K.add(dof(mesh.tri[e * 6 + (i >> 1)], i & 1), dof(mesh.tri[e * 6 + (j >> 1)], j & 1), sc * ks[e * 144 + i * 12 + j]);
    }
    K.fix(held);
    K.factor();
    return K.solve(f);
  };
  /** uᵀ·k·u of each element at full material. */
  const energy = (U: Float64Array, out: Float64Array) => {
    const ue = new Float64Array(12);
    for (let e = 0; e < ne; e++) {
      for (let i = 0; i < 12; i++) ue[i] = U[dof(mesh.tri[e * 6 + (i >> 1)], i & 1)];
      let s2 = 0;
      for (let i = 0; i < 12; i++) { let r = 0; for (let j = 0; j < 12; j++) r += ks[e * 144 + i * 12 + j] * ue[j]; s2 += ue[i] * r; }
      out[e] = s2;
    }
  };
  let x = new Float64Array(ne).fill(keep);
  const ce = new Float64Array(ne), dc = new Float64Array(ne), history: number[] = [];
  const solidU = solve(new Float64Array(ne).fill(1)), solid = f.reduce((a, v, i) => a + v * solidU[i], 0);
  let round = 0;
  for (; round < rounds; round++) {
    const U = solve(x);
    history.push(f.reduce((a, v, i) => a + v * U[i], 0));
    energy(U, ce);
    for (let e = 0; e < ne; e++) dc[e] = -penal * x[e] ** (penal - 1) * (1 - X_MIN) * ce[e];
    // Smoothed sensitivities (Sigmund's filter, weighted by distance and area).
    const sm = new Float64Array(ne);
    for (let e = 0; e < ne; e++) {
      let num = 0, den = 0;
      nbr[e].forEach((g, k) => { num += wts[e][k] * x[g] * dc[g] / area[g]; den += wts[e][k]; });
      sm[e] = (num / den) * area[e] / Math.max(1e-3, x[e]);
    }
    // Optimality criteria: the multiplier found by halving so the material kept is the share asked for.
    let lo = 0, hi = 1e9, next = x;
    const move = 0.2;
    while ((hi - lo) / (hi + lo) > 1e-4) {
      const mid = (lo + hi) / 2;
      next = x.map((v, e) => Math.max(0, Math.max(v - move, Math.min(1, Math.min(v + move, v * Math.sqrt(Math.max(0, -sm[e]) / (mid * area[e])))))));
      let vol = 0;
      for (let e = 0; e < ne; e++) vol += next[e] * area[e];
      if (vol > keep * total) lo = mid; else hi = mid;
    }
    const change = next.reduce((m, v, e) => Math.max(m, Math.abs(v - x[e])), 0);
    x = next;
    if (round > 30 && change < 0.002) { round++; break; }
  }
  const atNodes = new Float64Array(nn), cnt = new Float64Array(nn);
  for (let e = 0; e < ne; e++) for (let i = 0; i < 6; i++) { const n = mesh.tri[e * 6 + i]; atNodes[n] += x[e]; cnt[n]++; }
  for (let n = 0; n < nn; n++) atNodes[n] /= cnt[n] || 1;
  let vol = 0, grey = 0;
  for (let e = 0; e < ne; e++) { vol += x[e] * area[e]; if (x[e] > 0.1 && x[e] < 0.9) grey++; }
  return { density: x, atNodes, history, solid, kept: vol / total, grey, rounds: round, massKg: vol * t * 1e-9 * study.material.rho };
}

