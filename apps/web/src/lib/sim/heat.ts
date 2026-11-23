import type { Mesh } from './mesh';
import { rcm, Skyline } from './skyline';
import { G, slopes, type Material } from './structure';

// Hyperion Simulate → Heat (M407, the owner's Ansys ask: "thermal"): how heat moves through a flat part of thickness t.
// Edges can be held at a temperature, take in (or lose) heat at a rate, or give it to the air (convection); the part
// may make heat inside (an electric current, a reaction) and lose it from both faces to the air around it. Steady
// (the temperatures it settles at) or over time from a start temperature (backward Euler, one factor for every step).
// Inputs in the units people use (°C, W/m², W/(m²·K), W/m³, seconds); inside, millimetres (k in W/(mm·K) …).

export type HeatBc =
  /** Held at a temperature (°C). */
  | { id: string; kind: 'temp'; edges: string[]; T: number }
  /** Heat going in through the edges (W/m² of the edge's face; a minus takes it out). */
  | { id: string; kind: 'flux'; edges: string[]; q: number }
  /** Air (or water) touching the edges: h in W/(m²·K), at T∞ °C. */
  | { id: string; kind: 'convection'; edges: string[]; h: number; Tinf: number };
export interface HeatStudy {
  thickness: number; material: Material; bcs: HeatBc[];
  /** Heat made inside, W/m³. */
  generation: number;
  /** Both flat faces lose heat to the air (h W/(m²·K) at T∞), or none (0). */
  faces: { h: number; Tinf: number };
  /** Over time: from T0 °C, for `seconds`, in `steps` steps; null for steady. */
  transient: { seconds: number; steps: number; T0: number } | null;
}
export interface HeatResult {
  /** Temperatures (°C) at the end, and at each step for a run over time. */
  T: Float64Array; frames: Float64Array[]; times: number[];
  /** Heat flowing (W/m²): its size at each node. */
  flux: Float64Array;
  /** The heat (W) going out through each held-temperature condition (in when negative), and how it all adds up. */
  through: { id: string; watts: number }[];
}

const mm = { k: 1e-3, perM2: 1e-6, perM3: 1e-9 };

/** One unknown per node: numbered so neighbours are near, and the matrix's skyline. */
function scalarNumbering(mesh: Mesh) {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, adj: Set<number>[] = Array.from({ length: nn }, () => new Set());
  for (let e = 0; e < ne; e++) for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (i !== j) adj[mesh.tri[e * 6 + i]].add(mesh.tri[e * 6 + j]);
  const order = rcm(adj.map((s) => [...s])), pos = new Int32Array(nn);
  order.forEach((node, k) => { pos[node] = k; });
  const first = Int32Array.from({ length: nn }, (_, i) => i);
  for (let e = 0; e < ne; e++) {
    let lo = Infinity;
    for (let i = 0; i < 6; i++) lo = Math.min(lo, pos[mesh.tri[e * 6 + i]]);
    for (let i = 0; i < 6; i++) { const p = pos[mesh.tri[e * 6 + i]]; first[p] = Math.min(first[p], lo); }
  }
  return { pos, first };
}
// 6-point rule (exact for the mass-like N·Nᵀ of 6-node triangles).
const D6: [number, number, number][] = [];
for (const [a, w] of [[0.445948490915965, 0.223381589678011], [0.091576213509771, 0.109951743655322]]) D6.push([a, a, w], [a, 1 - 2 * a, w], [1 - 2 * a, a, w]);
/** ∫ N·Nᵀ along a 3-node (quadratic) edge of length l, in the order start, middle, end. */
const EDGE_M = [[4, 2, -1], [2, 16, 2], [-1, 2, 4]].map((r) => r.map((v) => v / 30));
const EDGE_F = [1 / 6, 2 / 3, 1 / 6];

export function solveHeat(mesh: Mesh, s: HeatStudy): HeatResult {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, t = s.thickness, m = s.material;
  const { pos, first } = scalarNumbering(mesh);
  const K = new Skyline(nn, first), C = s.transient ? new Skyline(nn, first) : null, f = new Float64Array(nn);
  const k = m.k * mm.k * t, hf = 2 * s.faces.h * mm.perM2, rc = m.rho * 1e-9 * m.c * t; // W/K, W/(mm²K) both faces, J/(K·mm²)
  for (let e = 0; e < ne; e++) {
    const ke = new Float64Array(36), me = new Float64Array(36), fe = new Float64Array(6);
    for (const [xi, eta] of G) {
      const { bx, by, det } = slopes(mesh, e, xi, eta), w = det / 6;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) ke[i * 6 + j] += k * (bx[i] * bx[j] + by[i] * by[j]) * w;
    }
    for (const [xi, eta, wq] of D6) {
      const { N, det } = slopes(mesh, e, xi, eta), w = wq * (det / 2);
      for (let i = 0; i < 6; i++) {
        fe[i] += N[i] * (s.generation * mm.perM3 * t + hf * s.faces.Tinf) * w;
        for (let j = 0; j < 6; j++) { const nn2 = N[i] * N[j] * w; ke[i * 6 + j] += hf * nn2; me[i * 6 + j] += rc * nn2; }
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = pos[mesh.tri[e * 6 + i]];
      f[a] += fe[i];
      for (let j = i; j < 6; j++) { const b = pos[mesh.tri[e * 6 + j]]; K.add(a, b, ke[i * 6 + j]); C?.add(a, b, me[i * 6 + j]); }
    }
  }
  // Edges: heat flux and convection.
  const segsOf = (edges: string[]) => edges.flatMap((id) => mesh.segs.get(id) ?? []);
  const len = ([a, , b]: [number, number, number]) => Math.hypot(mesh.x[b] - mesh.x[a], mesh.y[b] - mesh.y[a]);
  for (const bc of s.bcs) {
    if (bc.kind === 'flux') for (const g of segsOf(bc.edges)) { const l = len(g); g.forEach((n, i) => { f[pos[n]] += bc.q * mm.perM2 * t * l * EDGE_F[i]; }); }
    if (bc.kind === 'convection') for (const g of segsOf(bc.edges)) {
      const l = len(g), h = bc.h * mm.perM2 * t;
      g.forEach((n, i) => { f[pos[n]] += h * bc.Tinf * l * EDGE_F[i]; for (let j = 0; j < 3; j++) if (pos[g[j]] >= pos[n]) K.add(pos[n], pos[g[j]], h * l * EDGE_M[i][j]); });
    }
  }
  // Held temperatures (the later condition wins on a shared corner).
  const held = new Uint8Array(nn), value = new Float64Array(nn), owner = new Int32Array(nn).fill(-1);
  s.bcs.forEach((bc, bi) => { if (bc.kind === 'temp') for (const id of bc.edges) for (const n of mesh.nodes.get(id) ?? []) { held[pos[n]] = 1; value[pos[n]] = bc.T; owner[pos[n]] = bi; } });
  const freeOnly = !held.some((v) => v);
  if (freeOnly && !(s.faces.h > 0) && !s.bcs.some((b) => b.kind === 'convection' && b.h > 0) && !s.transient) throw new Error('Nothing takes heat away: hold an edge at a temperature, or add air (convection) on an edge or the faces.');
  const Kfull = K.mul(value), base = Float64Array.from(f);
  // The matrix before holding, kept for the heat through held edges afterwards.
  const Kraw = new Skyline(nn, first);
  Kraw.a.set(K.a);
  const frames: Float64Array[] = [], times: number[] = [];
  const toNodes = (x: Float64Array) => { const out = new Float64Array(nn); for (let n = 0; n < nn; n++) out[n] = x[pos[n]]; return out; };
  let T: Float64Array;
  if (!s.transient) {
    const rhs = f.map((v, i) => (held[i] ? value[i] : v - Kfull[i]));
    K.fix(held); K.factor();
    T = K.solve(rhs);
  } else {
    const { seconds, steps, T0 } = s.transient, dt = seconds / Math.max(1, steps);
    // (C/dt + K) T¹ = C/dt T⁰ + f, held values kept.
    const A = new Skyline(nn, first);
    for (let i = 0; i < A.a.length; i++) A.a[i] = C!.a[i] / dt + K.a[i];
    const lift = A.mul(value);
    A.fix(held); A.factor();
    T = Float64Array.from({ length: nn }, (_, i) => (held[i] ? value[i] : T0));
    frames.push(toNodes(T)); times.push(0);
    for (let step = 1; step <= steps; step++) {
      // The held values' known part moves to the right-hand side (lift = A · held values).
      const ct = C!.mul(T), rhs = Float64Array.from({ length: nn }, (_, i) => (held[i] ? value[i] : ct[i] / dt + f[i] - lift[i]));
      T = A.solve(rhs);
      frames.push(toNodes(T)); times.push(step * dt);
    }
  }
  // Heat through each held edge: what the conduction there needs beyond the loads (energy balance), in watts.
  const KT = Kraw.mul(T);
  const through = s.bcs.map((bc) => ({ id: bc.id, watts: 0 }));
  for (let i = 0; i < nn; i++) if (held[i] && owner[i] >= 0) through[owner[i]].watts += KT[i] - base[i];
  // Heat flux q = −k ∇T (W/m²) at each element's nodes, averaged.
  const Tn = toNodes(T), qx = new Float64Array(nn), qy = new Float64Array(nn), cnt = new Float64Array(nn);
  const NODE_AT = [[0, 0], [1, 0], [0, 1], [0.5, 0], [0.5, 0.5], [0, 0.5]];
  for (let e = 0; e < ne; e++) NODE_AT.forEach(([xi, eta], kk) => {
    const { bx, by } = slopes(mesh, e, xi, eta);
    let gx = 0, gy = 0;
    for (let i = 0; i < 6; i++) { const n = mesh.tri[e * 6 + i]; gx += bx[i] * Tn[n]; gy += by[i] * Tn[n]; }
    const n = mesh.tri[e * 6 + kk];
    qx[n] -= m.k * gx * 1000; qy[n] -= m.k * gy * 1000; cnt[n]++; // W/(m·K) × K/mm × 1000 mm/m = W/m²
  });
  const flux = Float64Array.from({ length: nn }, (_, n) => Math.hypot(qx[n], qy[n]) / (cnt[n] || 1));
  return { T: Tn, frames, times, flux, through: through.filter((x, i) => s.bcs[i].kind === 'temp') };
}
