// Hyperion's 3D rigid bodies (M520): balls, boxes and any convex solid (the hull of its corners) that fall, bounce,
// tumble and rub in a box, z up. Contacts: the separating-axis test over both solids' face normals and every pair of
// edges, the incident face clipped against the reference face's sides (Sutherland–Hodgman, up to eight points) or the
// two nearest edge points; a ball against a solid by its nearest point. Sequential impulses with restitution and
// Coulomb friction (the sliding impulse kept inside μ times the push), then a position-only push apart. Each body keeps
// its angular momentum L in space, so a body turning freely keeps L exactly and its spin ω = I⁻¹L follows.
// M542: solids with dents as several convex parts glued together (`compound`: their mass, centre and inertia added up
// by the parallel-axis rule; contacts part by part), and rolling resistance (an opposing turn at a ball's contact, at
// most Crr · push · radius).
// M543: rolling resistance for solids too (rocking or tipping on an edge or corner, the lever their centre's distance
// to the contact), and `convexSplit`: a closed dented mesh cut into convex parts by itself. M544: cuts across a bend,
// 26-way corner probes (curved parts kept whole), at most 64 corners a part, faster mesh tests and hulls.

export type V3 = number[];
const add = (a: V3, b: V3) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3) => mul(a, 1 / (norm(a) || 1));

/** A rotation matrix (rows) from a unit quaternion [w x y z]. */
export const rotOf = (q: number[]) => {
  const [w, x, y, z] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
};
const mv = (R: number[][], v: V3) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
const mtv = (R: number[][], v: V3) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
const qmul = (a: number[], b: number[]) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
/** The quaternion turning by the rotation vector r (radians). */
export const qFromVec = (r: V3) => { const t = norm(r); if (t < 1e-15) return [1, 0, 0, 0]; const s = Math.sin(t / 2) / t; return [Math.cos(t / 2), r[0] * s, r[1] * s, r[2] * s]; };

/** A convex solid: corners about its centre of mass, faces (corner indices, counter-clockwise seen from outside) with
 * outward normals, edges, and the inertia tensor per unit mass (diagonal in the body's own axes only for a box). */
export interface Hull { v: V3[]; faces: number[][]; n: V3[]; edges: [number, number][]; volume: number; J: number[][] }

/** The convex hull of up to 40 points (every plane through three that has all on one side; coplanar triangles merged
 * into one face), its volume, centroid and inertia per unit mass, by tetrahedra from an inside point. */
export function hull(pts: V3[], max = 40): Hull & { centroid: V3 } {
  const n = pts.length;
  if (n < 4 || n > max) throw new Error(`A solid needs 4 to ${max} corners.`);
  const size = Math.max(...pts.map((p) => norm(sub(p, pts[0])))), tol = 1e-9 * size;
  const planes: { n: V3; d: number; ids: Set<number> }[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    // Three corners already on a face found (many corners on one flat face, M544): nothing new.
    if (planes.some((P) => P.ids.has(i) && P.ids.has(j) && P.ids.has(k))) continue;
    let nn = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
    const l = norm(nn);
    if (l < tol * size) continue;
    nn = mul(nn, 1 / l);
    let d = dot(nn, pts[i]), above = 0, below = 0;
    for (const p of pts) { const s = dot(nn, p) - d; if (s > tol) above++; else if (s < -tol) below++; if (above && below) break; }
    if (above && below) continue;
    if (above) { nn = mul(nn, -1); d = -d; }
    if (planes.some((P) => dot(P.n, nn) > 1 - 1e-9 && Math.abs(P.d - d) < tol)) continue;
    const ids = new Set<number>();
    pts.forEach((p, m) => { if (Math.abs(dot(nn, p) - d) <= tol) ids.add(m); });
    planes.push({ n: nn, d, ids });
  }
  if (planes.length < 4) throw new Error('Those corners are flat: a solid needs depth in all three directions.');
  const used = [...new Set(planes.flatMap((P) => [...P.ids]))];
  const inside = mul(used.reduce((s, m) => add(s, pts[m]), [0, 0, 0]), 1 / used.length);
  // Each face's corners in order round its own normal.
  const faces = planes.map((P) => {
    const ids = [...P.ids], c = mul(ids.reduce((s, m) => add(s, pts[m]), [0, 0, 0]), 1 / ids.length);
    const u = unit(sub(pts[ids[0]], c)), w = cross(P.n, u);
    // Drop corners on an edge's middle (not true corners of the face).
    const ring = ids.map((m) => ({ m, t: Math.atan2(dot(sub(pts[m], c), w), dot(sub(pts[m], c), u)) })).sort((x, y) => x.t - y.t).map((x) => x.m);
    return ring.filter((m, i) => { const p = pts[ring[(i + ring.length - 1) % ring.length]], q = pts[ring[(i + 1) % ring.length]]; return norm(cross(sub(pts[m], p), sub(q, pts[m]))) > tol * size; });
  });
  // Volume, centroid and ∫ r rᵀ over tetrahedra (inside, a, b, c).
  let vol = 0, cen = [0, 0, 0];
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const f of faces) for (let i = 1; i + 1 < f.length; i++) {
    const a = sub(pts[f[0]], inside), b = sub(pts[f[i]], inside), c = sub(pts[f[i + 1]], inside), v6 = dot(a, cross(b, c)), V = v6 / 6;
    vol += V; cen = add(cen, mul(add(add(a, b), c), V / 4));
    // ∫ x_i x_j over a tetrahedron with a corner at 0: V/20 (Σ a_i a_j + … + (Σ)_i (Σ)_j).
    const sm = add(add(a, b), c);
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) S[p][q] += (V / 20) * (a[p] * a[q] + b[p] * b[q] + c[p] * c[q] + sm[p] * sm[q]);
  }
  cen = mul(cen, 1 / vol);
  // About the centroid: S − V c cᵀ; inertia J = tr(S) 1 − S, per unit mass.
  for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) S[p][q] = S[p][q] / vol - cen[p] * cen[q];
  const tr = S[0][0] + S[1][1] + S[2][2], J = S.map((row, p) => row.map((x, q) => (p === q ? tr : 0) - x));
  const centroid = add(inside, cen), v = pts.map((p) => sub(p, centroid));
  const edges: [number, number][] = [], seen = new Set<string>();
  for (const f of faces) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length], k = a < b ? `${a},${b}` : `${b},${a}`; if (!seen.has(k)) { seen.add(k); edges.push([a, b]); } }
  return { v, faces, n: planes.map((P) => P.n), edges, volume: vol, J, centroid };
}
export const boxHull = (w: number, d: number, h: number) => hull([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [(x * w) / 2, (y * d) / 2, (z * h) / 2]))));

/** A ball, or one or more convex parts (corners in the body's frame, about the whole body's centre of mass). */
export type Shape3 = { kind: 'ball'; r: number } | { kind: 'hull'; parts: Hull[] };
export interface Body3 { shape: Shape3; m: number; J: number[][]; Jinv: number[][]; p: V3; q: number[]; v: V3; L: V3; fixed: boolean; R: number }

const inv3 = (M: number[][]) => {
  const [[a, b, c], [d, e, f], [g, h, i]] = M, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
};
/** Convex parts glued into one solid (each from `hull`, with its centroid in a shared frame): the parts moved to be
 * about the whole's centre of mass, the volume and inertia per unit mass (∑ V_i (J_i + |d|²1 − ddᵀ) / V). Parts that
 * overlap count twice. */
export function compound(parts: (Hull & { centroid: V3 })[]) {
  const vol = parts.reduce((s, h) => s + h.volume, 0), c = mul(parts.reduce((s, h) => add(s, mul(h.centroid, h.volume)), [0, 0, 0]), 1 / vol);
  const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const h of parts) {
    const d = sub(h.centroid, c), dd = dot(d, d);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) J[i][j] += (h.volume / vol) * (h.J[i][j] + (i === j ? dd : 0) - d[i] * d[j]);
  }
  return { parts: parts.map((h) => ({ ...h, v: h.v.map((x) => add(x, sub(h.centroid, c))) })), volume: vol, J, centroid: c };
}
/** A test of whether points are inside the closed triangle mesh (V, T): crossings of a slightly skewed ray
 * (Möller–Trumbore). M544: each triangle's ray-fixed numbers worked out once, and a box round the mesh first. */
function meshTest(V: V3[], T: number[][]) {
  const d = [0.31234, 0.54217, 0.78011], n = T.length, K = new Float64Array(n * 13);
  const lo = [0, 1, 2].map((k) => Math.min(...V.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...V.map((p) => p[k])));
  let m = 0;
  for (const [i, j, l] of T) {
    const e1 = sub(V[j], V[i]), e2 = sub(V[l], V[i]), h = cross(d, e2), a = dot(e1, h);
    if (Math.abs(a) < 1e-14) continue;
    K.set([...V[i], ...e1, ...e2, ...h, 1 / a], m * 13); m++;
  }
  return (p: V3) => {
    if (p[0] < lo[0] || p[0] > hi[0] || p[1] < lo[1] || p[1] > hi[1] || p[2] < lo[2] || p[2] > hi[2]) return false;
    let c = 0;
    for (let k = 0; k < m * 13; k += 13) {
      const sx = p[0] - K[k], sy = p[1] - K[k + 1], sz = p[2] - K[k + 2], ia = K[k + 12];
      const u = (sx * K[k + 9] + sy * K[k + 10] + sz * K[k + 11]) * ia;
      if (u < 0 || u > 1) continue;
      const qx = sy * K[k + 5] - sz * K[k + 4], qy = sz * K[k + 3] - sx * K[k + 5], qz = sx * K[k + 4] - sy * K[k + 3];
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * ia;
      if (v < 0 || u + v > 1) continue;
      if ((K[k + 6] * qx + K[k + 7] * qy + K[k + 8] * qz) * ia > 0) c++;
    }
    return c % 2 === 1;
  };
}
/** A flat face (dents allowed) cut into triangles, keeping its turn: ear clipping in the face's own plane. */
function earClip(V: V3[], f: number[]) {
  if (f.length === 3) return [f.slice()];
  let nn = [0, 0, 0];
  f.forEach((i, k) => { nn = add(nn, cross(V[i], V[f[(k + 1) % f.length]])); });
  const u = unit(Math.abs(nn[0]) < 0.9 * norm(nn) ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0])), w = cross(unit(nn), u);
  const P = f.map((i) => [dot(V[i], u), dot(V[i], w)]), c2 = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const idx = f.map((_, k) => k), out: number[][] = [];
  while (idx.length > 3) {
    let cut = false;
    for (let k = 0; k < idx.length && !cut; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      if (c2(P[a], P[b], P[c]) <= 1e-14) continue;
      if (idx.some((j) => j !== a && j !== b && j !== c && c2(P[a], P[b], P[j]) >= 0 && c2(P[b], P[c], P[j]) >= 0 && c2(P[c], P[a], P[j]) >= 0)) continue;
      out.push([f[a], f[b], f[c]]); idx.splice(k, 1); cut = true;
    }
    if (!cut) throw new Error('A face of the mesh crosses itself.');
  }
  out.push(idx.map((k) => f[k]));
  return out;
}
type Plane = { n: V3; d: number };
/** The 26 directions to a cube's faces, edges and corners (unit), for probing round a point. */
const PROBES: V3[] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => [x, y, z]))).filter((d) => d.some(Boolean)).map(unit);
/** A closed dented mesh cut into convex parts by itself (M543). V its corners, F its faces (triangles or polygons,
 * turned the same way round). A part is a convex cell (planes) met with the mesh: its corners are the mesh's corners
 * inside the cell, mesh edges through the cell's faces, cell edges through the mesh, and cell corners inside it. A part
 * is kept when grid points inside its hull are (nearly) all inside the mesh; otherwise it is cut by the plane of a face
 * beside a dent (an edge where the solid folds inwards) that loses the least volume, up to `maxParts` parts. Returns
 * each part's corners (world frame), ready for `hull` and `compound`. shortcut: the volume test samples a 12³ grid. */
export function convexSplit(V: V3[], F: number[][], o: { maxParts?: number; tol?: number } = {}) {
  const maxParts = o.maxParts ?? 16, tol = o.tol ?? 0.02;
  if (V.length < 4 || V.length > 400 || F.length < 4 || F.length > 800) throw new Error('A mesh needs 4 to 400 corners and 4 to 800 faces.');
  if (F.some((f) => f.length < 3 || f.some((i) => !(i >= 0 && i < V.length) || !Number.isInteger(i)))) throw new Error('Each face lists 3 or more corner numbers of the mesh.');
  let T = F.flatMap((f) => earClip(V, f));
  // Closed: every edge used by exactly two triangles, once each way round.
  const use = new Map<string, number>();
  for (const t of T) for (let k = 0; k < 3; k++) { const key = `${t[k]},${t[(k + 1) % 3]}`; use.set(key, (use.get(key) ?? 0) + 1); }
  for (const [key, c] of use) { const [a, b] = key.split(','); if (c !== 1 || use.get(`${b},${a}`) !== 1) throw new Error('The mesh must be closed, with its faces all turned the same way round.'); }
  const vol6 = T.reduce((s, [i, j, l]) => s + dot(V[i], cross(V[j], V[l])), 0);
  if (Math.abs(vol6) < 1e-14) throw new Error('The mesh encloses no volume.');
  if (vol6 < 0) T = T.map(([i, j, l]) => [i, l, j]);
  const inMesh = meshTest(V, T);
  const size = Math.max(...V.map((p) => norm(sub(p, V[0])))), eps = 1e-9 * size;
  const planeOf = ([i, j, l]: number[]): Plane => { const n = unit(cross(sub(V[j], V[i]), sub(V[l], V[i]))); return { n, d: dot(n, V[i]) }; };
  // Candidate cuts: the planes of the faces beside each fold inwards.
  const opp = new Map<string, number>();
  T.forEach((t, ti) => { for (let k = 0; k < 3; k++) opp.set(`${t[k]},${t[(k + 1) % 3]}`, ti); });
  // M544: also the plane through the fold that halves its angle (on a bent part, the cut across it), and each cut
  // remembers where its folds are, so only cuts with a fold inside a part are tried on it.
  const cuts: (Plane & { at: V3[] })[] = [];
  const addCut = (P: Plane, at: V3) => {
    if (!P.n.every(Number.isFinite)) return;
    const same = cuts.find((C) => dot(C.n, P.n) > 1 - 1e-9 && Math.abs(C.d - P.d) < eps * 10);
    if (same) same.at.push(at); else cuts.push({ ...P, at: [at] });
  };
  T.forEach((t) => {
    const P = planeOf(t);
    for (let k = 0; k < 3; k++) {
      const tj = opp.get(`${t[(k + 1) % 3]},${t[k]}`)!, other = T[tj].find((x) => x !== t[k] && x !== t[(k + 1) % 3])!;
      if (dot(P.n, V[other]) - P.d > 1e-7 * size) {
        const Q = planeOf(T[tj]), a = V[t[k]], mid = mul(add(a, V[t[(k + 1) % 3]]), 0.5), nb = unit(sub(P.n, Q.n));
        addCut(P, mid); addCut(Q, mid); addCut({ n: nb, d: dot(nb, a) }, mid);
      }
    }
  });
  const lo = [0, 1, 2].map((k) => Math.min(...V.map((p) => p[k])) - 1e-3 * size), hi = [0, 1, 2].map((k) => Math.max(...V.map((p) => p[k])) + 1e-3 * size);
  const box: Plane[] = [0, 1, 2].flatMap((k) => [{ n: [0, 1, 2].map((m) => (m === k ? 1 : 0)), d: hi[k] }, { n: [0, 1, 2].map((m) => (m === k ? -1 : 0)), d: -lo[k] }]);
  const inCell = (C: Plane[], p: V3, e = eps * 100) => C.every((P) => dot(P.n, p) <= P.d + e);
  const segs: [V3, V3][] = [];
  { const seen = new Set<string>(); for (const t of T) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; if (!seen.has(key)) { seen.add(key); segs.push([V[a], V[b]]); } } }
  const segTri = (p: V3, q: V3, [i, j, l]: number[]): V3 | null => {
    const d = sub(q, p), e1 = sub(V[j], V[i]), e2 = sub(V[l], V[i]), h = cross(d, e2), a = dot(e1, h);
    if (Math.abs(a) < 1e-14) return null;
    const s = sub(p, V[i]), u = dot(s, h) / a; if (u < -1e-9 || u > 1 + 1e-9) return null;
    const w = cross(s, e1), v = dot(d, w) / a; if (v < -1e-9 || u + v > 1 + 1e-9) return null;
    const t = dot(e2, w) / a; return t >= -1e-9 && t <= 1 + 1e-9 ? add(p, mul(d, t)) : null;
  };
  // The corners of (cell ∩ mesh), merged when closer than a hair.
  const cornersOf = (C: Plane[]) => {
    const out: V3[] = [], push = (p: V3) => { if (inCell(C, p) && !out.some((x) => norm(sub(x, p)) < eps * 1000)) out.push(p); };
    for (const p of V) push(p);
    for (const [p, q] of segs) for (const P of C) { const a = dot(P.n, p) - P.d, b = dot(P.n, q) - P.d; if (a * b < 0) push(add(p, mul(sub(q, p), a / (a - b)))); }
    const cv: { p: V3; ids: number[] }[] = [];
    for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) for (let k = j + 1; k < C.length; k++) {
      const [A, B2, D] = [C[i], C[j], C[k]], det = dot(A.n, cross(B2.n, D.n));
      if (Math.abs(det) < 1e-12) continue;
      const p = mul(add(add(mul(cross(B2.n, D.n), A.d), mul(cross(D.n, A.n), B2.d)), mul(cross(A.n, B2.n), D.d)), 1 / det);
      if (inCell(C, p)) cv.push({ p, ids: [i, j, k] });
    }
    for (const c of cv) if (inMesh(c.p)) push(c.p);
    for (let x = 0; x < cv.length; x++) for (let y = x + 1; y < cv.length; y++) {
      if (cv[x].ids.filter((i) => cv[y].ids.includes(i)).length < 2) continue;
      for (const t of T) { const h = segTri(cv[x].p, cv[y].p, t); if (h) push(h); }
    }
    // Drop points that only touch the part as a flat sliver (a corner on a cut plane but outside the solid beyond it):
    // a step from each towards the middle must land inside the mesh.
    if (out.length < 4) return out;
    // The middle: the mean of grid points inside both the cell and the mesh (inside the part when it is convex).
    const a = [0, 1, 2].map((k) => Math.min(...out.map((p) => p[k]))), b = [0, 1, 2].map((k) => Math.max(...out.map((p) => p[k])));
    let c = [0, 0, 0], m = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) for (let k = 0; k < 9; k++) {
      const p = [a[0] + ((i + 0.5) / 9) * (b[0] - a[0]), a[1] + ((j + 0.5) / 9) * (b[1] - a[1]), a[2] + ((k + 0.5) / 9) * (b[2] - a[2])];
      if (inCell(C, p, 0) && inMesh(p)) { c = add(c, p); m++; }
    }
    if (!m) return [];
    c = mul(c, 1 / m);
    // M544: a step towards the middle alone dropped real corners on the inside of a curve (the middle of a bent part
    // lies in its hole), so a corner is kept when a short step any of 26 ways, or towards the middle, lands inside both.
    const st = 1e-5 * size, inside = (q: V3) => C.every((P) => dot(P.n, q) <= P.d - 1e-9 * size) && inMesh(q);
    return out.filter((p) => inside(add(p, mul(sub(c, p), 1e-5))) || PROBES.some((d) => inside(add(p, mul(d, st)))));
  };
  // A part's hull and how much of it is solid (grid points at cell centres, never on a face).
  const judge = (C: Plane[]) => {
    const pts = cornersOf(C);
    if (pts.length < 4) return null;
    let h: Hull & { centroid: V3 };
    try { h = hull(pts, 256); } catch { return null; }
    if (h.volume < 1e-9 * size ** 3) return null;
    const W = h.v.map((v) => add(v, h.centroid)), a = [0, 1, 2].map((k) => Math.min(...W.map((p) => p[k]))), b = [0, 1, 2].map((k) => Math.max(...W.map((p) => p[k])));
    const N = 12, planes = h.faces.map((f, i) => ({ n: h.n[i], d: dot(h.n[i], W[f[0]]) }));
    let inH = 0, inM = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const p = [a[0] + ((i + 0.5) / N) * (b[0] - a[0]), a[1] + ((j + 0.5) / N) * (b[1] - a[1]), a[2] + ((k + 0.5) / N) * (b[2] - a[2])];
      if (!inCell(planes, p, 0)) continue;
      inH++; if (inMesh(p)) inM++;
    }
    const full = inH ? inM / inH : 1;
    return { pts: W, volume: h.volume, full, lost: h.volume * (1 - full) };
  };
  const done: V3[][] = [], todo: { C: Plane[]; j: NonNullable<ReturnType<typeof judge>> }[] = [];
  const first = judge(box);
  if (!first) throw new Error('The mesh is too thin to split.');
  todo.push({ C: box, j: first });
  while (todo.length) {
    todo.sort((x, y) => y.j.lost - x.j.lost);
    const cur = todo.shift()!;
    // A part may have at most 64 corners (what a solid takes); one with more is cut even when it is solid.
    const many = cur.j.pts.length > 64;
    if ((cur.j.full >= 1 - tol && !many) || done.length + todo.length + 2 > maxParts) {
      if (many) throw new Error("A part would need more than 64 corners: allow more 'Parts' or use a coarser mesh.");
      done.push(cur.j.pts); continue;
    }
    let best: { lost: number; kids: typeof todo } | null = null;
    // The cuts with a fold inside this part that split it, the 12 passing nearest its middle tried (M544: halving
    // keeps the splitting shallow, and trying every fold of a smooth curve took seconds).
    const mid = mul(cur.j.pts.reduce(add, [0, 0, 0]), 1 / cur.j.pts.length);
    const tryCuts = cuts.filter((P) => {
      if (!P.at.some((m) => inCell(cur.C, m, eps * 1000))) return false;
      const s = cur.j.pts.map((p) => dot(P.n, p) - P.d);
      return Math.max(...s) > 1e-6 * size && Math.min(...s) < -1e-6 * size;
    }).sort((x, y) => Math.abs(dot(x.n, mid) - x.d) - Math.abs(dot(y.n, mid) - y.d)).slice(0, 12);
    for (const P of tryCuts) {
      const kids = [[...cur.C, P], [...cur.C, { n: mul(P.n, -1), d: -P.d }]].map((C) => ({ C, j: judge(C) })).filter((k) => k.j) as typeof todo;
      if (!kids.length) continue;
      const lost = kids.reduce((x, k) => x + k.j.lost, 0);
      if (!best || lost < best.lost - 1e-12) best = { lost, kids };
    }
    if (many && (!best || best.lost > cur.j.lost + 1e-9 * size ** 3)) {
      // Halve it across its longest side instead.
      const W = cur.j.pts, ext = [0, 1, 2].map((k) => Math.max(...W.map((p) => p[k])) - Math.min(...W.map((p) => p[k]))), k = ext.indexOf(Math.max(...ext));
      const mid = (Math.max(...W.map((p) => p[k])) + Math.min(...W.map((p) => p[k]))) / 2, n = [0, 1, 2].map((m) => (m === k ? 1 : 0));
      const kids = [[...cur.C, { n, d: mid }], [...cur.C, { n: mul(n, -1), d: -mid }]].map((C) => ({ C, j: judge(C) })).filter((x) => x.j) as typeof todo;
      todo.push(...kids); continue;
    }
    if (!best || (!many && best.lost >= cur.j.lost)) { done.push(cur.j.pts); continue; }
    todo.push(...best.kids);
  }
  return done;
}

/** A body: a ball's radius, a hull, or a compound's parts, at p, turned by the rotation vector rot, moving at v and
 * spinning at w. */
export function body3(shape: number | Hull | { parts: Hull[]; J: number[][] }, p: V3, rot: V3, v: V3, w: V3, m: number, fixed = false): Body3 {
  const sh: Shape3 = typeof shape === 'number' ? { kind: 'ball', r: shape } : { kind: 'hull', parts: 'parts' in shape ? shape.parts : [shape] };
  if (sh.kind === 'ball' && !(sh.r > 0)) throw new Error('A ball needs a positive radius.');
  const J = typeof shape === 'number' ? [[0.4 * m * shape ** 2, 0, 0], [0, 0.4 * m * shape ** 2, 0], [0, 0, 0.4 * m * shape ** 2]] : shape.J.map((row) => row.map((x) => x * m));
  const b: Body3 = { shape: sh, m, J, Jinv: inv3(J), p: p.slice(), q: qFromVec(rot), v: v.slice(), L: [0, 0, 0], fixed, R: sh.kind === 'ball' ? sh.r : Math.max(...sh.parts.flatMap((h) => h.v.map(norm))) };
  b.L = Lof(b, w);
  return b;
}
/** I in space = R J Rᵀ, applied to ω; and its inverse to L. */
const Lof = (b: Body3, w: V3) => { const R = rotOf(b.q); return mv(R, mv(b.J, mtv(R, w))); };
export const omega = (b: Body3) => { if (b.fixed) return [0, 0, 0]; const R = rotOf(b.q); return mv(R, mv(b.Jinv, mtv(R, b.L))); };
/** Each convex part placed in space: its corners, outward normals and the hull itself. */
export interface Posed { V: V3[]; N: V3[]; h: Hull }
export const posed = (b: Body3): Posed[] => { if (b.shape.kind !== 'hull') return []; const R = rotOf(b.q); return b.shape.parts.map((h) => ({ V: h.v.map((v) => add(b.p, mv(R, v))), N: h.n.map((n) => mv(R, n)), h })); };
/** Every corner of a body's parts in space. */
export const corners = (b: Body3) => posed(b).flatMap((P) => P.V);

export interface Contact3 { a: number; b: number; n: V3; p: V3; depth: number }

/** Sutherland–Hodgman: keep the part of the polygon P with n·x ≤ d. */
const clipPoly = (P: V3[], n: V3, d: number) => {
  const out: V3[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], da = dot(n, a) - d, db = dot(n, b) - d;
    if (da <= 0) out.push(a);
    if (da * db < 0) out.push(add(a, mul(sub(b, a), da / (da - db))));
  }
  return out;
};
/** The nearest points of segments p1–q1 and p2–q2. */
function segNear(p1: V3, q1: V3, p2: V3, q2: V3) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
  let s = den > 1e-15 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0, t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
  return [add(p1, mul(d1, s)), add(p2, mul(d2, t))];
}

/** Hull A against hull B: contacts with the normal from A to B. */
function hullHull(PA: Posed, PB: Posed, ia: number, ib: number, out: Contact3[]) {
  const { V: VA, N: NA, h: hA } = PA, { V: VB, N: NB, h: hB } = PB;
  // The parts' own middles say which way is from A to B (a compound's centre may lie outside a part).
  const mid = (V: V3[]) => mul(V.reduce((s, x) => add(s, x), [0, 0, 0]), 1 / V.length), AB = sub(mid(VB), mid(VA));
  const span = (V: V3[], n: V3) => { let lo = Infinity, hi = -Infinity; for (const v of V) { const s = dot(n, v); if (s < lo) lo = s; if (s > hi) hi = s; } return [lo, hi]; };
  // The axis of least overlap, pointing from A to B; faces preferred over edges when nearly equal.
  let best = Infinity, axis: V3 = [0, 0, 1], kind = 0, which = -1;
  const test = (n0: V3, k: number, w: number, bias: number) => {
    const l = norm(n0);
    if (l < 1e-9) return true;
    let n = mul(n0, 1 / l);
    const [a0, a1] = span(VA, n), [b0, b1] = span(VB, n), o = Math.min(a1 - b0, b1 - a0);
    if (o < 0) return false;
    if (dot(n, AB) < 0) n = mul(n, -1);
    if (o * bias < best) { best = o * bias; axis = n; kind = k; which = w; }
    return true;
  };
  for (let i = 0; i < NA.length; i++) if (!test(NA[i], 1, i, 1)) return;
  for (let i = 0; i < NB.length; i++) if (!test(NB[i], 2, i, 1)) return;
  const eA = hA.edges.map(([p, q]) => sub(VA[q], VA[p])), eB = hB.edges.map(([p, q]) => sub(VB[q], VB[p]));
  for (let i = 0; i < eA.length; i++) for (let j = 0; j < eB.length; j++) if (!test(cross(eA[i], eB[j]), 3, i * eB.length + j, 1.05)) return;
  const depth = best / (kind === 3 ? 1.05 : 1);
  if (kind === 3) {
    const i = Math.floor(which / eB.length), j = which % eB.length, [pa, qa] = hA.edges[i], [pb, qb] = hB.edges[j];
    const [x, y] = segNear(VA[pa], VA[qa], VB[pb], VB[qb]);
    out.push({ a: ia, b: ib, n: axis, p: mul(add(x, y), 0.5), depth });
    return;
  }
  // Reference face on the solid whose face gave the axis; the other's face most against it is clipped to it.
  const refA = kind === 1, R = refA ? hA : hB, I = refA ? hB : hA, VR = refA ? VA : VB, VI = refA ? VB : VA, NR = refA ? NA : NB, NI = refA ? NB : NA;
  // The face pointing along the axis (A's) or against it (B's): opposite faces share an axis.
  let f = 0, fbest = -Infinity;
  for (let k = 0; k < NR.length; k++) { const d = dot(NR[k], axis) * (refA ? 1 : -1); if (d > fbest) { fbest = d; f = k; } }
  const nR = NR[f];
  let inc = 0, dmin = Infinity;
  for (let k = 0; k < NI.length; k++) { const d = dot(NI[k], nR); if (d < dmin) { dmin = d; inc = k; } }
  let poly = I.faces[inc].map((k) => VI[k]);
  const face = R.faces[f].map((k) => VR[k]);
  for (let k = 0; k < face.length; k++) {
    const a = face[k], b = face[(k + 1) % face.length], side = unit(cross(sub(b, a), nR));
    poly = clipPoly(poly, side, dot(side, a));
    if (!poly.length) return;
  }
  const dR0 = dot(nR, face[0]);
  for (const p of poly) {
    const sep = dot(nR, p) - dR0;
    if (sep <= 0) out.push({ a: ia, b: ib, n: axis, p: sub(p, mul(nR, sep / 2)), depth: -sep });
  }
}
/** A ball (centre c, radius r) against hull body H: the normal from the hull to the ball. */
function hullBall(P: Posed, c: V3, r: number, ih: number, ib: number, out: Contact3[]) {
  const { V, N, h } = P;
  let sep = -Infinity, f = 0;
  for (let i = 0; i < N.length; i++) { const s = dot(N[i], sub(c, V[h.faces[i][0]])); if (s > sep) { sep = s; f = i; } }
  if (sep > r) return;
  if (sep <= 0) { out.push({ a: ih, b: ib, n: N[f], p: sub(c, mul(N[f], r)), depth: r - sep }); return; }
  // Outside: the nearest point over every face (inside the face, or on its edges).
  let near: V3 | null = null, dn = Infinity;
  h.faces.forEach((F, i) => {
    const P = F.map((k) => V[k]), n = N[i], s = dot(n, sub(c, P[0])), proj = sub(c, mul(n, s));
    const inFace = P.every((a, k) => dot(cross(sub(P[(k + 1) % P.length], a), sub(proj, a)), n) >= 0);
    const cands = inFace ? [proj] : P.map((a, k) => { const b = P[(k + 1) % P.length], e = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(c, a), e) / dot(e, e))); return add(a, mul(e, t)); });
    for (const x of cands) { const d = norm(sub(c, x)); if (d < dn) { dn = d; near = x; } }
  });
  if (!near || dn > r || dn < 1e-15) return;
  out.push({ a: ih, b: ib, n: mul(sub(c, near), 1 / dn), p: near, depth: r - dn });
}

/** Every contact, with the walls of [0, W] × [0, D] × [0, H] as b = −1. */
export function contacts3(B: Body3[], box: V3): Contact3[] {
  const out: Contact3[] = [];
  const walls: [V3, number][] = [[[-1, 0, 0], 0], [[1, 0, 0], box[0]], [[0, -1, 0], 0], [[0, 1, 0], box[1]], [[0, 0, -1], 0], [[0, 0, 1], box[2]]];
  B.forEach((b, i) => {
    if (b.fixed) return;
    const pts = b.shape.kind === 'ball' ? null : corners(b);
    for (const [n, lim] of walls) {
      const edge = dot(n, [lim, lim, lim]);
      if (b.shape.kind === 'ball') { const d = dot(n, b.p) + b.shape.r - edge; if (d > 0) out.push({ a: i, b: -1, n, p: add(b.p, mul(n, b.shape.r)), depth: d }); }
      else for (const p of pts!) { const d = dot(n, p) - edge; if (d > 0) out.push({ a: i, b: -1, n, p, depth: d }); }
    }
  });
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    if ((a.fixed && b.fixed) || norm(sub(a.p, b.p)) > a.R + b.R) continue;
    // Part by part (a convex solid is its own one part).
    if (a.shape.kind === 'hull' && b.shape.kind === 'hull') { const pb = posed(b); for (const pa of posed(a)) for (const q of pb) hullHull(pa, q, i, j, out); }
    else if (a.shape.kind === 'hull' && b.shape.kind === 'ball') { for (const pa of posed(a)) hullBall(pa, b.p, b.shape.r, i, j, out); }
    else if (b.shape.kind === 'hull' && a.shape.kind === 'ball') { for (const pb of posed(b)) hullBall(pb, a.p, a.shape.r, j, i, out); }
    else if (a.shape.kind === 'ball' && b.shape.kind === 'ball') {
      const d = sub(b.p, a.p), l = norm(d);
      if (l < a.shape.r + b.shape.r && l > 1e-15) { const n = mul(d, 1 / l); out.push({ a: i, b: j, n, p: add(a.p, mul(n, a.shape.r)), depth: a.shape.r + b.shape.r - l }); }
    }
  }
  return out;
}

export interface SimOpts3 { box: V3; g: number; e: number; mu: number; dt: number; frames: number[]; iterations?: number; roll?: number }

/** Runs the bodies (changed in place); [x y z qw qx qy qz] of each at the frame times, the energy and the contacts. */
export function simulate3(B: Body3[], o: SimOpts3) {
  const it = o.iterations ?? 20, inv = B.map((b) => (b.fixed ? 0 : 1 / b.m));
  const frames: number[][] = [], energy: number[] = [];
  let t = 0, f = 0, hits = 0, touching = new Set<string>();
  const ke = () => B.reduce((s, b) => (b.fixed ? s : s + 0.5 * b.m * dot(b.v, b.v) + 0.5 * dot(omega(b), b.L) + b.m * o.g * b.p[2]), 0);
  const snap = () => { frames.push(B.flatMap((b) => [...b.p, ...b.q])); energy.push(ke()); };
  while (f < o.frames.length && o.frames[f] <= 1e-12) { snap(); f++; }
  const end = o.frames[o.frames.length - 1] ?? 0, slop = 1e-4 * Math.min(...o.box);
  // The velocity of body i's material at point p, and an impulse J (on b, −J on a) at p.
  const vel = (i: number, p: V3) => (i < 0 ? [0, 0, 0] : add(B[i].v, cross(omega(B[i]), sub(p, B[i].p))));
  const kick = (i: number, p: V3, J: V3) => { if (i < 0 || B[i].fixed) return; B[i].v = add(B[i].v, mul(J, inv[i])); B[i].L = add(B[i].L, cross(sub(p, B[i].p), J)); };
  const Iinv = (i: number, x: V3) => { const b = B[i], R = rotOf(b.q); return mv(R, mv(b.Jinv, mtv(R, x))); };
  const kOf = (c: Contact3, d: V3) => {
    let k = 0;
    for (const [i] of [[c.a], [c.b]]) { if (i < 0 || B[i].fixed) continue; const r = sub(c.p, B[i].p), rd = cross(r, d); k += inv[i] + dot(cross(Iinv(i, rd), r), d); }
    return k;
  };
  while (t < end - 1e-12) {
    const dt = Math.min(o.dt, end - t);
    for (const b of B) if (!b.fixed) b.v[2] -= o.g * dt;
    const C = contacts3(B, o.box), rest = 2 * o.g * dt + 1e-9;
    const pre = C.map((c) => {
      const rel = sub(vel(c.b, c.p), vel(c.a, c.p)), vn = dot(rel, c.n);
      const t1 = unit(Math.abs(c.n[0]) < 0.9 ? cross(c.n, [1, 0, 0]) : cross(c.n, [0, 1, 0])), t2 = cross(c.n, t1);
      // A solid (M543: rocking or tipping on an edge or corner) uses its centre's distance to the contact as the lever.
      const radii = [c.a, c.b].filter((i) => i >= 0 && !B[i].fixed).map((i) => (B[i].shape.kind === 'ball' ? (B[i].shape as { r: number }).r : norm(sub(c.p, B[i].p))));
      return { c, t1, t2, mn: 1 / kOf(c, c.n), m1: 1 / kOf(c, t1), m2: 1 / kOf(c, t2), target: vn < -rest ? -o.e * vn : 0, jn: 0, j1: 0, j2: 0, rad: radii.length ? Math.min(...radii) : 0, H: [0, 0, 0] };
    });
    for (let k = 0; k < it; k++) for (const q of pre) {
      const { c } = q;
      const vn = dot(sub(vel(c.b, c.p), vel(c.a, c.p)), c.n), jn = Math.max(0, q.jn + q.mn * (q.target - vn)), dj = jn - q.jn;
      q.jn = jn; kick(c.b, c.p, mul(c.n, dj)); kick(c.a, c.p, mul(c.n, -dj));
      if (o.mu > 0) {
        const rel = sub(vel(c.b, c.p), vel(c.a, c.p));
        let j1 = q.j1 - q.m1 * dot(rel, q.t1), j2 = q.j2 - q.m2 * dot(rel, q.t2);
        const lim = o.mu * q.jn, l = Math.hypot(j1, j2);
        if (l > lim) { j1 *= lim / l; j2 *= lim / l; }
        const J = add(mul(q.t1, j1 - q.j1), mul(q.t2, j2 - q.j2));
        q.j1 = j1; q.j2 = j2; kick(c.b, c.p, J); kick(c.a, c.p, mul(J, -1));
      }
      if (o.roll && q.rad) {
        // Rolling resistance: an angular impulse H (on b; −H on a) against the turning across the contact.
        const wr = sub(c.b >= 0 ? omega(B[c.b]) : [0, 0, 0], omega(B[c.a])), wt = sub(wr, mul(c.n, dot(wr, c.n))), l = norm(wt);
        if (l > 1e-14) {
          const d = mul(wt, 1 / l), k = (B[c.a].fixed ? 0 : dot(d, Iinv(c.a, d))) + (c.b >= 0 && !B[c.b].fixed ? dot(d, Iinv(c.b, d)) : 0);
          let H = sub(q.H, mul(d, l / (k || Infinity)));
          const lim = o.roll * q.jn * q.rad, hl = norm(H);
          if (hl > lim) H = mul(H, lim / hl);
          const dH = sub(H, q.H);
          q.H = H;
          if (c.b >= 0 && !B[c.b].fixed) B[c.b].L = add(B[c.b].L, dH);
          if (!B[c.a].fixed) B[c.a].L = sub(B[c.a].L, dH);
        }
      }
    }
    const now = new Set(C.map((c) => `${c.a},${c.b}`));
    for (const k of now) if (!touching.has(k)) hits++;
    touching = now;
    for (const b of B) if (!b.fixed) {
      b.p = add(b.p, mul(b.v, dt));
      const w = omega(b), q = qmul(qFromVec(mul(w, dt)), b.q), l = Math.hypot(...q);
      b.q = q.map((x) => x / l);
    }
    for (const c of contacts3(B, o.box)) {
      const ia = inv[c.a], ib = c.b >= 0 ? inv[c.b] : 0, s = (Math.max(0, c.depth - slop) * 0.8) / (ia + ib || 1);
      B[c.a].p = sub(B[c.a].p, mul(c.n, s * ia));
      if (c.b >= 0) B[c.b].p = add(B[c.b].p, mul(c.n, s * ib));
    }
    t += dt;
    while (f < o.frames.length && o.frames[f] <= t + 1e-12) { snap(); f++; }
  }
  while (f < o.frames.length) { snap(); f++; }
  return { frames, energy, hits };
}
