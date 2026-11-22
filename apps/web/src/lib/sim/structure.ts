import type { Mesh } from './mesh';
import { rcm, Skyline } from './skyline';

// Hyperion Simulate (M404): a flat part's stress and bending by the finite element method (plane stress, 6-node
// triangles), in millimetres, newtons and megapascals (N/mm²). The supports hold edges, the loads push or pull them
// (a force spread along an edge, a pressure, a bolt pressing on the side of a hole, the part's own weight). It gives
// how far every point moves, the stresses everywhere (von Mises, principal, x, y, shear), how safe the part is against
// its material's yield strength, and the forces the supports carry (which must balance the loads).

export interface Material { id: string; name: string; E: number; nu: number; rho: number; yieldMPa: number }
/** E and yield in MPa, density in kg/m³ (common handbook values). */
export const MATERIALS: Material[] = [
  { id: 'steel', name: 'Structural steel', E: 200_000, nu: 0.3, rho: 7850, yieldMPa: 250 },
  { id: 'stainless', name: 'Stainless steel 304', E: 193_000, nu: 0.29, rho: 8000, yieldMPa: 215 },
  { id: 'aluminium', name: 'Aluminium 6061-T6', E: 68_900, nu: 0.33, rho: 2700, yieldMPa: 276 },
  { id: 'titanium', name: 'Titanium Ti-6Al-4V', E: 113_800, nu: 0.342, rho: 4430, yieldMPa: 880 },
  { id: 'copper', name: 'Copper', E: 110_000, nu: 0.34, rho: 8960, yieldMPa: 70 },
  { id: 'brass', name: 'Brass', E: 100_000, nu: 0.34, rho: 8500, yieldMPa: 200 },
  { id: 'abs', name: 'ABS plastic', E: 2_300, nu: 0.35, rho: 1050, yieldMPa: 40 },
  { id: 'nylon', name: 'Nylon 6', E: 2_700, nu: 0.39, rho: 1140, yieldMPa: 70 },
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
export interface Study { thickness: number; material: Material; supports: Support[]; loads: Load[]; gravity: boolean }

export interface Reaction { id: string; fx: number; fy: number }
export interface StaticResult {
  ux: Float64Array; uy: Float64Array; u: Float64Array;
  sx: Float64Array; sy: Float64Array; sxy: Float64Array; vm: Float64Array; s1: Float64Array; s2: Float64Array; safety: Float64Array;
  reactions: Reaction[]; applied: { fx: number; fy: number };
  massKg: number; dofs: number; profile: number;
}

const G = [[1 / 6, 1 / 6], [2 / 3, 1 / 6], [1 / 6, 2 / 3]];
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
function slopes(mesh: Mesh, e: number, xi: number, eta: number) {
  const s = shape(xi, eta), t = mesh.tri;
  let j11 = 0, j12 = 0, j21 = 0, j22 = 0;
  for (let i = 0; i < 6; i++) { const n = t[e * 6 + i], x = mesh.x[n], y = mesh.y[n]; j11 += s.dxi[i] * x; j12 += s.dxi[i] * y; j21 += s.deta[i] * x; j22 += s.deta[i] * y; }
  const det = j11 * j22 - j12 * j21, bx = new Float64Array(6), by = new Float64Array(6);
  for (let i = 0; i < 6; i++) { bx[i] = (j22 * s.dxi[i] - j12 * s.deta[i]) / det; by[i] = (-j21 * s.dxi[i] + j11 * s.deta[i]) / det; }
  return { bx, by, det, N: s.N };
}

/** Plane-stress elasticity (MPa). */
const elastic = (m: Material) => { const k = m.E / (1 - m.nu * m.nu); return { d11: k, d12: k * m.nu, d33: (k * (1 - m.nu)) / 2 }; };

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

export function solveStatic(mesh: Mesh, study: Study): StaticResult {
  const nn = mesh.x.length, ne = mesh.tri.length / 6, m = study.material, t = study.thickness;
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
  // Loads (the edges' forces and the part's own weight, straight down).
  const { fx, fy } = nodalLoads(mesh, study);
  if (study.gravity) {
    const b = m.rho * 9.81e-9 * t; // N/mm² of the part's face
    for (let e = 0; e < ne; e++) for (const [xi, eta] of G) {
      const { N, det } = slopes(mesh, e, xi, eta);
      for (let i = 0; i < 6; i++) fy[mesh.tri[e * 6 + i]] -= N[i] * b * (det / 6);
    }
  }
  const f = new Float64Array(2 * nn);
  for (let n = 0; n < nn; n++) { f[dof(n, 0)] = fx[n]; f[dof(n, 1)] = fy[n]; }
  // Supports: each held unknown belongs to the first support that holds it (for its reaction).
  const held = new Uint8Array(2 * nn), owner = new Int32Array(2 * nn).fill(-1);
  study.supports.forEach((s, si) => {
    for (const id of s.edges) for (const n of mesh.nodes.get(id) ?? []) {
      for (const c of s.kind === 'fixed' ? [0, 1] : s.kind === 'slideX' ? [1] : [0]) { const d = dof(n, c); held[d] = 1; if (owner[d] < 0) owner[d] = si; }
    }
  });
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
    const r = inner[d] - (c ? fy[n] : fx[n]);
    if (c) reactions[owner[d]].fy += r; else reactions[owner[d]].fx += r;
  }
  let ax = 0, ay = 0;
  for (let n = 0; n < nn; n++) { ax += fx[n]; ay += fy[n]; }
  // Stresses at each element's nodes, averaged where elements meet.
  const { d11, d12, d33 } = elastic(m);
  const sx = new Float64Array(nn), sy = new Float64Array(nn), sxy = new Float64Array(nn), cnt = new Float64Array(nn);
  for (let e = 0; e < ne; e++) {
    NODE_AT.forEach(([xi, eta], k) => {
      const { bx, by } = slopes(mesh, e, xi, eta);
      let ex = 0, ey = 0, g = 0;
      for (let i = 0; i < 6; i++) { const n = mesh.tri[e * 6 + i]; ex += bx[i] * ux[n]; ey += by[i] * uy[n]; g += by[i] * ux[n] + bx[i] * uy[n]; }
      const n = mesh.tri[e * 6 + k];
      sx[n] += d11 * ex + d12 * ey; sy[n] += d12 * ex + d11 * ey; sxy[n] += d33 * g; cnt[n]++;
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
  return { ux, uy, u, sx, sy, sxy, vm, s1, s2, safety, reactions, applied: { fx: ax, fy: ay }, massKg: area * t * 1e-9 * m.rho, dofs: 2 * nn, profile: K.size };
}

/** Where a field is largest: the node and its value. */
export function peak(v: Float64Array, lowest = false) {
  let at = 0;
  for (let i = 1; i < v.length; i++) if (lowest ? v[i] < v[at] : v[i] > v[at]) at = i;
  return { at, value: v[at] };
}
