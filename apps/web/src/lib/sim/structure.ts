import type { Mesh } from './mesh';
import { rcm, Skyline } from './skyline';

// Hyperion Simulate (M404): a flat part's stress and bending by the finite element method (plane stress, 6-node
// triangles), in millimetres, newtons and megapascals (N/mm²). The supports hold edges, the loads push or pull them
// (a force spread along an edge, a pressure, a bolt pressing on the side of a hole, the part's own weight). It gives
// how far every point moves, the stresses everywhere (von Mises, principal, x, y, shear), how safe the part is against
// its material's yield strength, and the forces the supports carry (which must balance the loads).

/** k: thermal conductivity W/(m·K), c: specific heat J/(kg·K) (for Heat, M407); alpha: how much it grows per degree
 * (1/K, M544: heat and stress together); utsMPa: tensile strength; sf, b: Basquin's fatigue line σa = sf·(2N)^b (M546:
 * fatigue life; rounded textbook figures for teaching, not design data). */
export interface Material { id: string; name: string; E: number; nu: number; rho: number; yieldMPa: number; k: number; c: number; alpha: number; utsMPa: number; sf: number; b: number }
/** E and yield in MPa, density in kg/m³ (common handbook values). */
export const MATERIALS: Material[] = [
  { id: 'steel', name: 'Structural steel', E: 200_000, nu: 0.3, rho: 7850, yieldMPa: 250, k: 60.5, c: 434, alpha: 12e-6, utsMPa: 400, sf: 700, b: -0.09 },
  { id: 'stainless', name: 'Stainless steel 304', E: 193_000, nu: 0.29, rho: 8000, yieldMPa: 215, k: 16.2, c: 500, alpha: 17.3e-6, utsMPa: 505, sf: 1000, b: -0.09 },
  { id: 'aluminium', name: 'Aluminium 6061-T6', E: 68_900, nu: 0.33, rho: 2700, yieldMPa: 276, k: 167, c: 896, alpha: 23.6e-6, utsMPa: 310, sf: 520, b: -0.085 },
  { id: 'titanium', name: 'Titanium Ti-6Al-4V', E: 113_800, nu: 0.342, rho: 4430, yieldMPa: 880, k: 6.7, c: 526, alpha: 8.6e-6, utsMPa: 950, sf: 1600, b: -0.08 },
  { id: 'copper', name: 'Copper', E: 110_000, nu: 0.34, rho: 8960, yieldMPa: 70, k: 401, c: 385, alpha: 16.5e-6, utsMPa: 220, sf: 420, b: -0.1 },
  { id: 'brass', name: 'Brass', E: 100_000, nu: 0.34, rho: 8500, yieldMPa: 200, k: 109, c: 380, alpha: 19e-6, utsMPa: 340, sf: 600, b: -0.1 },
  { id: 'abs', name: 'ABS plastic', E: 2_300, nu: 0.35, rho: 1050, yieldMPa: 40, k: 0.17, c: 1400, alpha: 90e-6, utsMPa: 44, sf: 60, b: -0.1 },
  { id: 'nylon', name: 'Nylon 6', E: 2_700, nu: 0.39, rho: 1140, yieldMPa: 70, k: 0.25, c: 1700, alpha: 80e-6, utsMPa: 80, sf: 110, b: -0.1 },
];

/** fixed: held still; slideX: may slide along x only (y held); slideY: may slide along y only (x held). */
export type SupportKind = 'fixed' | 'slideX' | 'slideY';
export interface Support { id: string; kind: SupportKind; edges: string[] }
export type Load =
  /** A total force (N) spread evenly along the edges, at `angle` degrees (0 = +x, 90 = +y). */
  | { id: string; kind: 'force'; edges: string[]; F: number; angle: number }
  /** A pressure (MPa) pushing on the edges (a negative one pulls). */
  | { id: string; kind: 'pressure'; edges: string[]; p: number }
  /** A bolt or pin in a hole pulled with a total force (N): it presses on the side of the hole it is pulled towards. */
  | { id: string; kind: 'bearing'; edges: string[]; F: number; angle: number };
/** M544: the part warmed (or cooled) from the temperature it was made at, °C: one change everywhere or one per node (from
 * Heat on the same mesh). Held edges then push back on the growth, which is where thermal stress comes from. */
export type Warming = number | ArrayLike<number>;
/** M546: how the loads repeat (fully reversed: +load, −load; or pulsating: 0 to the load and back) and the life wanted. */
export interface Fatigue { kind: 'reversed' | 'pulsating'; cycles: number }
export const FATIGUE_START: Fatigue = { kind: 'reversed', cycles: 1e6 };
export interface Study { thickness: number; material: Material; supports: Support[]; loads: Load[]; gravity: boolean; warming?: Warming; fatigue?: Fatigue }

export interface Reaction { id: string; fx: number; fy: number }
export interface StaticResult {
  ux: Float64Array; uy: Float64Array; u: Float64Array;
  /** M546: log₁₀ of the cycles each point lasts (capped at 9: a billion), and its fatigue safety factor at the life wanted. */
  life: Float64Array; fsafety: Float64Array;
  sx: Float64Array; sy: Float64Array; sxy: Float64Array; vm: Float64Array; s1: Float64Array; s2: Float64Array; safety: Float64Array;
  reactions: Reaction[]; applied: { fx: number; fy: number };
  massKg: number; dofs: number; profile: number;
}

export const G = [[1 / 6, 1 / 6], [2 / 3, 1 / 6], [1 / 6, 2 / 3]];
const NODE_AT = [[0, 0], [1, 0], [0, 1], [0.5, 0], [0.5, 0.5], [0, 0.5]];

/** The 6 shape functions and their slopes at (ξ, η). */
function shape(xi: number, eta: number) {
  const L = 1 - xi - eta;
  return {
    N: [L * (2 * L - 1), xi * (2 * xi - 1), eta * (2 * eta - 1), 4 * L * xi, 4 * xi * eta, 4 * eta * L],
    dxi: [-(4 * L - 1), 4 * xi - 1, 0, 4 * (L - xi), 4 * eta, -4 * eta],
    deta: [-(4 * L - 1), 0, 4 * eta - 1, -4 * xi, 4 * xi, 4 * (L - eta)],
  };
}
/** Slopes in x and y at (ξ, η) of element e, and the area factor (det J). */
export function slopes(mesh: Mesh, e: number, xi: number, eta: number) {
  const s = shape(xi, eta), t = mesh.tri;
  let j11 = 0, j12 = 0, j21 = 0, j22 = 0;
  for (let i = 0; i < 6; i++) { const n = t[e * 6 + i], x = mesh.x[n], y = mesh.y[n]; j11 += s.dxi[i] * x; j12 += s.dxi[i] * y; j21 += s.deta[i] * x; j22 += s.deta[i] * y; }
  const det = j11 * j22 - j12 * j21, bx = new Float64Array(6), by = new Float64Array(6);
  for (let i = 0; i < 6; i++) { bx[i] = (j22 * s.dxi[i] - j12 * s.deta[i]) / det; by[i] = (-j21 * s.dxi[i] + j11 * s.deta[i]) / det; }
  return { bx, by, det, N: s.N };
}

/** Plane-stress elasticity (MPa). */
const elastic = (m: Material) => { const k = m.E / (1 - m.nu * m.nu); return { d11: k, d12: k * m.nu, d33: (k * (1 - m.nu)) / 2 }; };
/** The stress a free growth α·ΔT would make if fully held, in x and in y (plane stress: E·α·ΔT/(1−ν)), per °C. */
const heldPerDegree = (m: Material) => (m.E * m.alpha) / (1 - m.nu);
/** The warming at each node (°C), or null when there is none. */
export function warmingAt(mesh: Mesh, w: Warming | undefined): Float64Array | null {
  if (w === undefined) return null;
  const nn = mesh.x.length;
  if (typeof w === 'number') return w ? new Float64Array(nn).fill(w) : null;
  if (w.length !== nn) throw new Error('The temperatures do not match this mesh: run Heat again on the same part.');
  return Float64Array.from(w);
}

/** Element e's 12×12 stiffness (N/mm), and its area (mm²). */
export function elementStiffness(mesh: Mesh, e: number, m: Material, t: number, out = new Float64Array(144)) {
  out.fill(0);
  const { d11, d12, d33 } = elastic(m);
  let area = 0;
  for (const [xi, eta] of G) {
    const { bx, by, det } = slopes(mesh, e, xi, eta), f = (det / 6) * t;
    area += det / 6;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const r = 2 * i * 12 + 2 * j;
      out[r] += (bx[i] * d11 * bx[j] + by[i] * d33 * by[j]) * f;
      out[r + 1] += (bx[i] * d12 * by[j] + by[i] * d33 * bx[j]) * f;
      out[r + 12] += (by[i] * d12 * bx[j] + bx[i] * d33 * by[j]) * f;
      out[r + 13] += (by[i] * d11 * by[j] + bx[i] * d33 * bx[j]) * f;
    }
  }
  return { k: out, area };
}

/** The numbering of unknowns (2 per node) and the matrix's skyline, from the mesh's connections. */
export function numbering(mesh: Mesh) {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, adj: Set<number>[] = Array.from({ length: nn }, () => new Set());
  for (let e = 0; e < ne; e++) for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (i !== j) adj[mesh.tri[e * 6 + i]].add(mesh.tri[e * 6 + j]);
  const order = rcm(adj.map((s) => [...s])), pos = new Int32Array(nn);
  order.forEach((node, k) => { pos[node] = k; });
  const first = Int32Array.from({ length: 2 * nn }, (_, i) => i);
  for (let e = 0; e < ne; e++) {
    let lo = Infinity;
    for (let i = 0; i < 6; i++) lo = Math.min(lo, 2 * pos[mesh.tri[e * 6 + i]]);
    for (let i = 0; i < 6; i++) { const p = 2 * pos[mesh.tri[e * 6 + i]]; first[p] = Math.min(first[p], lo); first[p + 1] = Math.min(first[p + 1], lo); }
  }
  return { pos, first };
}

const segLen = (mesh: Mesh, [a, , b]: [number, number, number]) => Math.hypot(mesh.x[b] - mesh.x[a], mesh.y[b] - mesh.y[a]);

/** The loads as forces on nodes (N): fx, fy per node. */
export function nodalLoads(mesh: Mesh, study: Study) {
  const nn = mesh.x.length, fx = new Float64Array(nn), fy = new Float64Array(nn);
  const segsOf = (edges: string[]) => edges.flatMap((id) => mesh.segs.get(id) ?? []);
  const spread = (s: [number, number, number], qx: number, qy: number, l: number) => {
    const w = [l / 6, (2 * l) / 3, l / 6];
    s.forEach((n, k) => { fx[n] += qx * w[k]; fy[n] += qy * w[k]; });
  };
  for (const ld of study.loads) {
    const segs = segsOf(ld.edges);
    if (!segs.length) continue;
    if (ld.kind === 'force') {
      const total = segs.reduce((s, g) => s + segLen(mesh, g), 0) || 1, a = (ld.angle * Math.PI) / 180;
      for (const g of segs) spread(g, (ld.F * Math.cos(a)) / total, (ld.F * Math.sin(a)) / total, segLen(mesh, g));
    } else if (ld.kind === 'pressure') {
      for (const g of segs) {
        const [a, , b] = g, l = segLen(mesh, g), nx = (mesh.y[b] - mesh.y[a]) / l, ny = -(mesh.x[b] - mesh.x[a]) / l;
        spread(g, -ld.p * study.thickness * nx, -ld.p * study.thickness * ny, l);
      }
    } else {
      // On the side of the hole the pin is pulled towards, more where it presses straight on (cos), adding up to F.
      const a = (ld.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const w = segs.map((g) => { const [p, , q] = g, l = segLen(mesh, g), nx = (mesh.y[q] - mesh.y[p]) / l, ny = -(mesh.x[q] - mesh.x[p]) / l; return Math.max(0, -(nx * dx + ny * dy)) * l; });
      const sum = w.reduce((s, v) => s + v, 0);
      if (sum > 0) segs.forEach((g, k) => { const l = segLen(mesh, g), q = (ld.F * w[k]) / sum / l; spread(g, q * dx, q * dy, l); });
    }
  }
  return { fx, fy };
}

/** The whole part's stiffness matrix (and each element's, for the inner forces afterwards). */
export function assemble(mesh: Mesh, m: Material, t: number) {
  const nn = mesh.x.length, ne = mesh.tri.length / 6;
  const { pos, first } = numbering(mesh), K = new Skyline(2 * nn, first);
  const dof = (node: number, c: number) => 2 * pos[node] + c;
  const ks = new Float64Array(ne * 144);
  let area = 0;
  for (let e = 0; e < ne; e++) {
    const { k, area: a } = elementStiffness(mesh, e, m, t, ks.subarray(e * 144, e * 144 + 144));
    area += a;
    for (let i = 0; i < 12; i++) for (let j = i; j < 12; j++) {
      const di = dof(mesh.tri[e * 6 + (i >> 1)], i & 1), dj = dof(mesh.tri[e * 6 + (j >> 1)], j & 1);
      K.add(di, dj, k[i * 12 + j]);
    }
  }
  return { K, pos, first, dof, ks, area };
}

/** The unknowns the supports hold (1), and which support holds each (for its reaction). */
export function heldBy(mesh: Mesh, supports: Support[], dof: (node: number, c: number) => number) {
  const n = 2 * mesh.x.length, held = new Uint8Array(n), owner = new Int32Array(n).fill(-1);
  supports.forEach((s, si) => {
    for (const id of s.edges) for (const node of mesh.nodes.get(id) ?? []) {
      for (const c of s.kind === 'fixed' ? [0, 1] : s.kind === 'slideX' ? [1] : [0]) { const d = dof(node, c); held[d] = 1; if (owner[d] < 0) owner[d] = si; }
    }
  });
  return { held, owner };
}

export function solveStatic(mesh: Mesh, study: Study): StaticResult {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, m = study.material, t = study.thickness;
  const { K, dof, ks, area } = assemble(mesh, m, t);
  // Loads (the edges' forces and the part's own weight, straight down).
  const { fx, fy } = nodalLoads(mesh, study);
  if (study.gravity) {
    const b = m.rho * 9.81e-9 * t; // N/mm² of the part's face
    for (let e = 0; e < ne; e++) for (const [xi, eta] of G) {
      const { N, det } = slopes(mesh, e, xi, eta);
      for (let i = 0; i < 6; i++) fy[mesh.tri[e * 6 + i]] -= N[i] * b * (det / 6);
    }
  }
  // M544: warming pushes every element outwards from inside (∫ Bᵀ·D·ε_th): forces inside the part that add up to nothing,
  // so they change no reaction's total, only what held edges must push back with.
  const dT = warmingAt(mesh, study.warming), tx = new Float64Array(nn), ty = new Float64Array(nn);
  if (dT) {
    const per = heldPerDegree(m);
    for (let e = 0; e < ne; e++) for (const [xi, eta] of G) {
      const { bx, by, N, det } = slopes(mesh, e, xi, eta);
      let d = 0;
      for (let i = 0; i < 6; i++) d += N[i] * dT[mesh.tri[e * 6 + i]];
      const q = per * d * (det / 6) * t;
      for (let i = 0; i < 6; i++) { const n = mesh.tri[e * 6 + i]; tx[n] += bx[i] * q; ty[n] += by[i] * q; }
    }
  }
  const f = new Float64Array(2 * nn);
  for (let n = 0; n < nn; n++) { f[dof(n, 0)] = fx[n] + tx[n]; f[dof(n, 1)] = fy[n] + ty[n]; }
  // Supports: each held unknown belongs to the first support that holds it (for its reaction).
  const { held, owner } = heldBy(mesh, study.supports, dof);
  if (!held.some((v) => v)) throw new Error('Add a support first: a part held nowhere just flies away.');
  K.fix(held);
  for (let d = 0; d < f.length; d++) if (held[d]) f[d] = 0;
  K.factor();
  const U = K.solve(f);
  const ux = new Float64Array(nn), uy = new Float64Array(nn), u = new Float64Array(nn);
  for (let n = 0; n < nn; n++) { ux[n] = U[dof(n, 0)]; uy[n] = U[dof(n, 1)]; u[n] = Math.hypot(ux[n], uy[n]); }
  // Reactions: what the supports push back with = the part's inner forces at held unknowns minus the loads there.
  const inner = new Float64Array(2 * nn), ue = new Float64Array(12);
  for (let e = 0; e < ne; e++) {
    for (let i = 0; i < 12; i++) { const n = mesh.tri[e * 6 + (i >> 1)]; ue[i] = i & 1 ? uy[n] : ux[n]; }
    for (let i = 0; i < 12; i++) {
      let s = 0;
      for (let j = 0; j < 12; j++) s += ks[e * 144 + i * 12 + j] * ue[j];
      inner[dof(mesh.tri[e * 6 + (i >> 1)], i & 1)] += s;
    }
  }
  const reactions: Reaction[] = study.supports.map((s) => ({ id: s.id, fx: 0, fy: 0 }));
  for (let n = 0; n < nn; n++) for (const c of [0, 1]) {
    const d = dof(n, c);
    if (owner[d] < 0) continue;
    const r = inner[d] - (c ? fy[n] + ty[n] : fx[n] + tx[n]);
    if (c) reactions[owner[d]].fy += r; else reactions[owner[d]].fx += r;
  }
  let ax = 0, ay = 0;
  for (let n = 0; n < nn; n++) { ax += fx[n]; ay += fy[n]; }
  const { sx, sy, sxy, vm, s1, s2, safety } = stressOf(mesh, m, ux, uy, dT);
  const { life, fsafety } = fatigueOf(m, s1, s2, vm, study.fatigue ?? FATIGUE_START);
  return { ux, uy, u, life, fsafety, sx, sy, sxy, vm, s1, s2, safety, reactions, applied: { fx: ax, fy: ay }, massKg: area * t * 1e-9 * m.rho, dofs: 2 * nn, profile: K.size };
}

/** The stresses at nodes for a movement (each element's own at its nodes, averaged where elements meet). */
export function stressOf(mesh: Mesh, m: Material, ux: Float64Array, uy: Float64Array, dT: Float64Array | null = null) {
  const nn = mesh.x.length, ne = mesh.tri.length / 6;
  const { d11, d12, d33 } = elastic(m);
  const sx = new Float64Array(nn), sy = new Float64Array(nn), sxy = new Float64Array(nn), cnt = new Float64Array(nn);
  for (let e = 0; e < ne; e++) {
    NODE_AT.forEach(([xi, eta], k) => {
      const { bx, by } = slopes(mesh, e, xi, eta);
      let ex = 0, ey = 0, g = 0;
      for (let i = 0; i < 6; i++) { const n = mesh.tri[e * 6 + i]; ex += bx[i] * ux[n]; ey += by[i] * uy[n]; g += by[i] * ux[n] + bx[i] * uy[n]; }
      const n = mesh.tri[e * 6 + k];
      // Only the strain beyond the free growth α·ΔT makes stress (M544).
      const th = dT ? heldPerDegree(m) * dT[n] : 0;
      sx[n] += d11 * ex + d12 * ey - th; sy[n] += d12 * ex + d11 * ey - th; sxy[n] += d33 * g; cnt[n]++;
    });
  }
  const vm = new Float64Array(nn), s1 = new Float64Array(nn), s2 = new Float64Array(nn), safety = new Float64Array(nn);
  for (let n = 0; n < nn; n++) {
    sx[n] /= cnt[n] || 1; sy[n] /= cnt[n] || 1; sxy[n] /= cnt[n] || 1;
    const c = (sx[n] + sy[n]) / 2, r = Math.hypot((sx[n] - sy[n]) / 2, sxy[n]);
    s1[n] = c + r; s2[n] = c - r;
    vm[n] = Math.sqrt(sx[n] ** 2 - sx[n] * sy[n] + sy[n] ** 2 + 3 * sxy[n] ** 2);
    safety[n] = Math.min(15, vm[n] > 0 ? m.yieldMPa / vm[n] : 15);
  }
  return { sx, sy, sxy, vm, s1, s2, safety };
}

/** M546: fatigue at every node, stress-life: the equivalent stress is von Mises carrying the sign of the larger principal
 * stress (a squeeze is kinder than a pull). Fully reversed: amplitude |S|, no mean. Pulsating 0 → S: amplitude and mean
 * |S|/2, the mean counted by Goodman only when it pulls. Life from Basquin; the safety factor against the amplitude
 * allowed at the life wanted (with Goodman). Warming counts as a steady stress only when it is part of the loads. */
export function fatigueOf(m: Material, s1: Float64Array, s2: Float64Array, vm: Float64Array, f: Fatigue) {
  const nn = vm.length, life = new Float64Array(nn), fsafety = new Float64Array(nn);
  const allowed = m.sf * (2 * Math.max(1, f.cycles)) ** m.b;
  for (let n = 0; n < nn; n++) {
    const S = Math.abs(s1[n]) >= Math.abs(s2[n]) ? Math.sign(s1[n] || 1) * vm[n] : Math.sign(s2[n] || 1) * vm[n];
    const sa = f.kind === 'reversed' ? Math.abs(S) : Math.abs(S) / 2, sm = f.kind === 'reversed' ? 0 : Math.max(0, S / 2);
    const eq = sm >= m.utsMPa ? Infinity : sa / (1 - sm / m.utsMPa);
    life[n] = eq <= 0 ? 9 : !Number.isFinite(eq) ? 0 : Math.max(0, Math.min(9, Math.log10(0.5 * (eq / m.sf) ** (1 / m.b))));
    const use = sa / allowed + sm / m.utsMPa;
    fsafety[n] = Math.min(15, use > 0 ? 1 / use : 15);
  }
  return { life, fsafety };
}

/** Where a field is largest: the node and its value. */
export function peak(v: Float64Array, lowest = false) {
  let at = 0;
  for (let i = 1; i < v.length; i++) if (lowest ? v[i] < v[at] : v[i] > v[at]) at = i;
  return { at, value: v[at] };
}
