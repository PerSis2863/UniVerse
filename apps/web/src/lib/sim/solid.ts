import type { Mesh } from './mesh';
import { rcm, Skyline } from './skyline';
import type { Material, Reaction, Study } from './structure';

// Hyperion Simulate → 3D parts (M413, the owner, 22 Nov: "3D parts… PLEASE DO THIS"): the flat part made a solid of its
// thickness. Its triangle mesh is stacked in layers through the thickness, each prism between two layers is cut into
// three tetrahedra (the cut of each side face chosen by the lowest node number, so neighbours always agree: Dompierre
// et al.), and each tetrahedron gets a node in the middle of every edge (10-node "quadratic" tetrahedra). Then full 3D
// elasticity: three movements per node, the stresses in all directions, von Mises; the same supports and loads as the
// flat part, now on the side faces of its edges, through the whole thickness.

export interface SolidMesh {
  x: Float64Array; y: Float64Array; z: Float64Array;
  /** 10 per element: corners 1–4, then the middles of 12, 23, 31, 14, 24, 34. */
  tet: Uint32Array;
  /** The outside: 6 per face (corners, then the middles of 12, 23, 31), turned outwards. */
  surface: Uint32Array;
  /** Each edge's side faces (indexes into `surface`) and nodes. */
  faces: Map<string, number[]>;
  nodes: Map<string, number[]>;
  thickness: number;
}

const PERM = [[0, 1, 2, 3, 4, 5], [1, 2, 0, 4, 5, 3], [2, 0, 1, 5, 3, 4]];
// The four faces of a tetrahedron with a positive volume, each turned outwards.
const FACES = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]];
// The middle node of each corner pair.
const EDGE_OF = new Map([['0,1', 4], ['1,2', 5], ['0,2', 6], ['0,3', 7], ['1,3', 8], ['2,3', 9]]);
const mid = (a: number, b: number) => EDGE_OF.get(a < b ? `${a},${b}` : `${b},${a}`)!;

/** The flat mesh stacked `layers` times through the thickness `t` (centred on z = 0). */
export function extrude(m: Mesh, t: number, layers: number): SolidMesh {
  const C = m.corners, nz = Math.max(1, layers), xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let k = 0; k <= nz; k++) for (let i = 0; i < C; i++) { xs.push(m.x[i]); ys.push(m.y[i]); zs.push(-t / 2 + (t * k) / nz); }
  const corner: number[][] = [];
  for (let e = 0; e < m.tri.length; e += 6) {
    const a = m.tri[e], b = m.tri[e + 1], c = m.tri[e + 2];
    for (let k = 0; k < nz; k++) {
      const v = [a + k * C, b + k * C, c + k * C, a + (k + 1) * C, b + (k + 1) * C, c + (k + 1) * C];
      // The smallest node number is in the bottom layer: turn the prism so it comes first.
      const lo = [0, 1, 2].reduce((p, q) => (v[q] < v[p] ? q : p), 0), V = PERM[lo].map((i) => v[i]);
      const tets = Math.min(V[1], V[5]) < Math.min(V[2], V[4])
        ? [[V[0], V[1], V[2], V[5]], [V[0], V[1], V[5], V[4]], [V[0], V[4], V[5], V[3]]]
        : [[V[0], V[1], V[2], V[4]], [V[0], V[4], V[2], V[5]], [V[0], V[4], V[5], V[3]]];
      for (const tt of tets) corner.push(tt);
    }
  }
  // Positive volume for every tetrahedron.
  const vol = (q: number[]) => {
    const [p0, p1, p2, p3] = q, ax = xs[p1] - xs[p0], ay = ys[p1] - ys[p0], az = zs[p1] - zs[p0], bx = xs[p2] - xs[p0], by = ys[p2] - ys[p0], bz = zs[p2] - zs[p0], cx = xs[p3] - xs[p0], cy = ys[p3] - ys[p0], cz = zs[p3] - zs[p0];
    return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  };
  for (const q of corner) if (vol(q) < 0) [q[1], q[2]] = [q[2], q[1]];
  // Middle nodes.
  const mids = new Map<string, number>();
  const midNode = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let n = mids.get(k);
    if (n === undefined) { n = xs.length; xs.push((xs[a] + xs[b]) / 2); ys.push((ys[a] + ys[b]) / 2); zs.push((zs[a] + zs[b]) / 2); mids.set(k, n); }
    return n;
  };
  const tet = new Uint32Array(corner.length * 10);
  corner.forEach((q, e) => tet.set([q[0], q[1], q[2], q[3], midNode(q[0], q[1]), midNode(q[1], q[2]), midNode(q[0], q[2]), midNode(q[0], q[3]), midNode(q[1], q[3]), midNode(q[2], q[3])], e * 10));
  // The outside: faces used by one tetrahedron only.
  const seen = new Map<string, number[] | null>();
  for (let e = 0; e < corner.length; e++) for (const f of FACES) {
    const loc = f, g = loc.map((i) => tet[e * 10 + i]), key = [...g].sort((p, q) => p - q).join(',');
    if (seen.has(key)) { seen.set(key, null); continue; }
    seen.set(key, [g[0], g[1], g[2], tet[e * 10 + mid(loc[0], loc[1])], tet[e * 10 + mid(loc[1], loc[2])], tet[e * 10 + mid(loc[0], loc[2])]]);
  }
  const surf = [...seen.values()].filter((f): f is number[] => !!f);
  // Side faces belong to the edge whose boundary piece they stand on (two different flat nodes among their corners).
  const pieceOf = new Map<string, string>();
  for (const [id, segs] of m.segs) for (const [a, , b] of segs) pieceOf.set(a < b ? `${a},${b}` : `${b},${a}`, id);
  const faces = new Map<string, number[]>(), nodes = new Map<string, Set<number>>();
  surf.forEach((f, i) => {
    const flat = [...new Set(f.slice(0, 3).map((n) => n % C))];
    if (flat.length !== 2) return;
    const id = pieceOf.get(flat[0] < flat[1] ? `${flat[0]},${flat[1]}` : `${flat[1]},${flat[0]}`);
    if (!id) return;
    if (!faces.has(id)) { faces.set(id, []); nodes.set(id, new Set()); }
    faces.get(id)!.push(i);
    for (const n of f) nodes.get(id)!.add(n);
  });
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), z: Float64Array.from(zs), tet, surface: Uint32Array.from(surf.flat()), faces, nodes: new Map([...nodes].map(([k, v]) => [k, [...v]])), thickness: t };
}

// 4-point rule (exact for the stiffness of straight 10-node tetrahedra).
const A = 0.5854101966249685, B = 0.1381966011250105;
const G4 = [[A, B, B], [B, A, B], [B, B, A], [B, B, B]];
const NODE_AT = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0, 0], [0.5, 0.5, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0, 0.5], [0, 0.5, 0.5]];

/** Shape functions and slopes in x, y, z of element e at (ξ, η, ζ), and det J. */
function slopes3(s: SolidMesh, e: number, xi: number, eta: number, zeta: number) {
  const L = [1 - xi - eta - zeta, xi, eta, zeta];
  const N = [L[0] * (2 * L[0] - 1), L[1] * (2 * L[1] - 1), L[2] * (2 * L[2] - 1), L[3] * (2 * L[3] - 1), 4 * L[0] * L[1], 4 * L[1] * L[2], 4 * L[0] * L[2], 4 * L[0] * L[3], 4 * L[1] * L[3], 4 * L[2] * L[3]];
  // dN/dL, then d/dξ = d/dL1 − d/dL0 (and so on).
  const dL: number[][] = [
    [4 * L[0] - 1, 0, 0, 0], [0, 4 * L[1] - 1, 0, 0], [0, 0, 4 * L[2] - 1, 0], [0, 0, 0, 4 * L[3] - 1],
    [4 * L[1], 4 * L[0], 0, 0], [0, 4 * L[2], 4 * L[1], 0], [4 * L[2], 0, 4 * L[0], 0], [4 * L[3], 0, 0, 4 * L[0]], [0, 4 * L[3], 0, 4 * L[1]], [0, 0, 4 * L[3], 4 * L[2]],
  ];
  const d = dL.map((r) => [r[1] - r[0], r[2] - r[0], r[3] - r[0]]);
  const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 10; i++) { const n = s.tet[e * 10 + i], p = [s.x[n], s.y[n], s.z[n]]; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) J[r][c] += d[i][r] * p[c]; }
  const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
  const inv = [
    [(J[1][1] * J[2][2] - J[1][2] * J[2][1]) / det, (J[0][2] * J[2][1] - J[0][1] * J[2][2]) / det, (J[0][1] * J[1][2] - J[0][2] * J[1][1]) / det],
    [(J[1][2] * J[2][0] - J[1][0] * J[2][2]) / det, (J[0][0] * J[2][2] - J[0][2] * J[2][0]) / det, (J[0][2] * J[1][0] - J[0][0] * J[1][2]) / det],
    [(J[1][0] * J[2][1] - J[1][1] * J[2][0]) / det, (J[0][1] * J[2][0] - J[0][0] * J[2][1]) / det, (J[0][0] * J[1][1] - J[0][1] * J[1][0]) / det],
  ];
  const b = d.map((r) => [0, 1, 2].map((c) => inv[c][0] * r[0] + inv[c][1] * r[1] + inv[c][2] * r[2]));
  return { N, b, det };
}

const lame = (m: Material) => ({ lam: (m.E * m.nu) / ((1 + m.nu) * (1 - 2 * m.nu)), mu: m.E / (2 * (1 + m.nu)) });

function tetStiffness(s: SolidMesh, e: number, m: Material, out: Float64Array) {
  out.fill(0);
  const { lam, mu } = lame(m), l2 = lam + 2 * mu;
  for (const [xi, eta, zeta] of G4) {
    const { b, det } = slopes3(s, e, xi, eta, zeta), w = det / 24;
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const [ax, ay, az] = b[i], [bx, by, bz] = b[j], r = 3 * i * 30 + 3 * j;
      // Bᵢᵀ D Bⱼ for isotropic elasticity, written out.
      out[r] += (l2 * ax * bx + mu * (ay * by + az * bz)) * w;
      out[r + 1] += (lam * ax * by + mu * ay * bx) * w;
      out[r + 2] += (lam * ax * bz + mu * az * bx) * w;
      out[r + 30] += (lam * ay * bx + mu * ax * by) * w;
      out[r + 31] += (l2 * ay * by + mu * (ax * bx + az * bz)) * w;
      out[r + 32] += (lam * ay * bz + mu * az * by) * w;
      out[r + 60] += (lam * az * bx + mu * ax * bz) * w;
      out[r + 61] += (lam * az * by + mu * ay * bz) * w;
      out[r + 62] += (l2 * az * bz + mu * (ax * bx + ay * by)) * w;
    }
  }
  return out;
}

export interface SolidResult {
  ux: Float64Array; uy: Float64Array; uz: Float64Array; u: Float64Array;
  vm: Float64Array; sx: Float64Array; sy: Float64Array; sz: Float64Array; safety: Float64Array;
  reactions: Reaction[]; applied: { fx: number; fy: number }; massKg: number; dofs: number;
}

export function solveSolid(s: SolidMesh, study: Study): SolidResult {
  const nn = s.x.length, ne = s.tet.length / 10, m = study.material;
  // Numbering: neighbours near (reverse Cuthill–McKee), three unknowns per node.
  const adj: Set<number>[] = Array.from({ length: nn }, () => new Set());
  for (let e = 0; e < ne; e++) for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (i !== j) adj[s.tet[e * 10 + i]].add(s.tet[e * 10 + j]);
  const order = rcm(adj.map((x) => [...x])), pos = new Int32Array(nn);
  order.forEach((n, k) => { pos[n] = k; });
  const dof = (n: number, c: number) => 3 * pos[n] + c;
  const first = Int32Array.from({ length: 3 * nn }, (_, i) => i);
  for (let e = 0; e < ne; e++) {
    let lo = Infinity;
    for (let i = 0; i < 10; i++) lo = Math.min(lo, 3 * pos[s.tet[e * 10 + i]]);
    for (let i = 0; i < 10; i++) for (let c = 0; c < 3; c++) { const d = dof(s.tet[e * 10 + i], c); first[d] = Math.min(first[d], lo); }
  }
  const K = new Skyline(3 * nn, first), ke = new Float64Array(900);
  let volume = 0;
  for (let e = 0; e < ne; e++) {
    tetStiffness(s, e, m, ke);
    for (const [xi, eta, zeta] of G4) volume += slopes3(s, e, xi, eta, zeta).det / 24;
    for (let i = 0; i < 30; i++) for (let j = i; j < 30; j++) K.add(dof(s.tet[e * 10 + Math.floor(i / 3)], i % 3), dof(s.tet[e * 10 + Math.floor(j / 3)], j % 3), ke[i * 30 + j]);
  }
  // Loads: on the side faces of the edges (a uniform push on a 6-node face goes a third to each middle node).
  const f = new Float64Array(3 * nn);
  const faceOf = (i: number) => {
    const g = s.surface.subarray(i * 6, i * 6 + 6), [p, q, r] = [g[0], g[1], g[2]];
    const ux = s.x[q] - s.x[p], uy = s.y[q] - s.y[p], uz = s.z[q] - s.z[p], vx = s.x[r] - s.x[p], vy = s.y[r] - s.y[p], vz = s.z[r] - s.z[p];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
    return { g, area: len / 2, n: [nx / len, ny / len, nz / len] };
  };
  const push = (g: Uint32Array, fx: number, fy: number) => { for (let k = 3; k < 6; k++) { f[dof(g[k], 0)] += fx / 3; f[dof(g[k], 1)] += fy / 3; } };
  for (const ld of study.loads) {
    const list = ld.edges.flatMap((id) => s.faces.get(id) ?? []).map(faceOf);
    if (!list.length) continue;
    if (ld.kind === 'force') {
      const total = list.reduce((a, q) => a + q.area, 0), a = (ld.angle * Math.PI) / 180;
      for (const q of list) push(q.g, (ld.F * Math.cos(a) * q.area) / total, (ld.F * Math.sin(a) * q.area) / total);
    } else if (ld.kind === 'pressure') {
      for (const q of list) push(q.g, -ld.p * q.area * q.n[0], -ld.p * q.area * q.n[1]);
    } else {
      const a = (ld.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), w = list.map((q) => Math.max(0, -(q.n[0] * dx + q.n[1] * dy)) * q.area), sum = w.reduce((x, y) => x + y, 0);
      if (sum > 0) list.forEach((q, k) => push(q.g, (ld.F * w[k] * dx) / sum, (ld.F * w[k] * dy) / sum));
    }
  }
  if (study.gravity) {
    const g = m.rho * 9.81e-9;
    for (let e = 0; e < ne; e++) for (const [xi, eta, zeta] of G4) { const { N, det } = slopes3(s, e, xi, eta, zeta); for (let i = 0; i < 10; i++) f[dof(s.tet[e * 10 + i], 1)] -= N[i] * g * (det / 24); }
  }
  const fx0 = new Float64Array(nn), fy0 = new Float64Array(nn);
  for (let n = 0; n < nn; n++) { fx0[n] = f[dof(n, 0)]; fy0[n] = f[dof(n, 1)]; }
  // Supports: fixed holds x, y, z; sliding along x holds y (and z, as the flat part can't leave its plane).
  const held = new Uint8Array(3 * nn), owner = new Int32Array(3 * nn).fill(-1);
  study.supports.forEach((sp, si) => {
    for (const id of sp.edges) for (const n of s.nodes.get(id) ?? []) for (const c of sp.kind === 'fixed' ? [0, 1, 2] : sp.kind === 'slideX' ? [1, 2] : [0, 2]) { const d = dof(n, c); held[d] = 1; if (owner[d] < 0) owner[d] = si; }
  });
  if (!held.some((v) => v)) throw new Error('Add a support first: a part held nowhere just flies away.');
  K.fix(held);
  for (let d = 0; d < f.length; d++) if (held[d]) f[d] = 0;
  K.factor();
  const U = K.solve(f);
  const ux = new Float64Array(nn), uy = new Float64Array(nn), uz = new Float64Array(nn), u = new Float64Array(nn);
  for (let n = 0; n < nn; n++) { ux[n] = U[dof(n, 0)]; uy[n] = U[dof(n, 1)]; uz[n] = U[dof(n, 2)]; u[n] = Math.hypot(ux[n], uy[n], uz[n]); }
  // Reactions from the elements that touch a support; stresses at every element's nodes, averaged.
  const reactions: Reaction[] = study.supports.map((sp) => ({ id: sp.id, fx: 0, fy: 0 }));
  const inner = new Float64Array(3 * nn), ue = new Float64Array(30);
  const { lam, mu } = lame(m);
  const sx = new Float64Array(nn), sy = new Float64Array(nn), sz = new Float64Array(nn), vm = new Float64Array(nn), cnt = new Float64Array(nn);
  for (let e = 0; e < ne; e++) {
    let touches = false;
    for (let i = 0; i < 10; i++) { const n = s.tet[e * 10 + i]; ue[3 * i] = ux[n]; ue[3 * i + 1] = uy[n]; ue[3 * i + 2] = uz[n]; if (held[dof(n, 0)] || held[dof(n, 1)]) touches = true; }
    if (touches) {
      tetStiffness(s, e, m, ke);
      for (let i = 0; i < 30; i++) { let sum = 0; for (let j = 0; j < 30; j++) sum += ke[i * 30 + j] * ue[j]; inner[dof(s.tet[e * 10 + Math.floor(i / 3)], i % 3)] += sum; }
    }
    NODE_AT.forEach(([xi, eta, zeta], k) => {
      const { b } = slopes3(s, e, xi, eta, zeta);
      let exx = 0, eyy = 0, ezz = 0, gxy = 0, gyz = 0, gzx = 0;
      for (let i = 0; i < 10; i++) {
        const [bx, by, bz] = b[i], X = ue[3 * i], Y = ue[3 * i + 1], Z = ue[3 * i + 2];
        exx += bx * X; eyy += by * Y; ezz += bz * Z; gxy += by * X + bx * Y; gyz += bz * Y + by * Z; gzx += bz * X + bx * Z;
      }
      const tr = lam * (exx + eyy + ezz), a = tr + 2 * mu * exx, bb = tr + 2 * mu * eyy, c = tr + 2 * mu * ezz, txy = mu * gxy, tyz = mu * gyz, tzx = mu * gzx;
      const n = s.tet[e * 10 + k];
      sx[n] += a; sy[n] += bb; sz[n] += c; cnt[n]++;
      vm[n] += Math.sqrt(0.5 * ((a - bb) ** 2 + (bb - c) ** 2 + (c - a) ** 2) + 3 * (txy ** 2 + tyz ** 2 + tzx ** 2));
    });
  }
  const safety = new Float64Array(nn);
  for (let n = 0; n < nn; n++) {
    const k = cnt[n] || 1;
    sx[n] /= k; sy[n] /= k; sz[n] /= k; vm[n] /= k;
    safety[n] = Math.min(15, vm[n] > 0 ? m.yieldMPa / vm[n] : 15);
    for (const c of [0, 1]) { const d = dof(n, c); if (owner[d] >= 0) { const r = inner[d] - (c ? fy0[n] : fx0[n]); if (c) reactions[owner[d]].fy += r; else reactions[owner[d]].fx += r; } }
  }
  let ax = 0, ay = 0;
  for (let n = 0; n < nn; n++) { ax += fx0[n]; ay += fy0[n]; }
  return { ux, uy, uz, u, vm, sx, sy, sz, safety, reactions, applied: { fx: ax, fy: ay }, massKg: volume * 1e-9 * m.rho, dofs: 3 * nn };
}
