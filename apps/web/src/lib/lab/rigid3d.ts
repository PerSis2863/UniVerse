// Hyperion's 3D rigid bodies (M520): balls, boxes and any convex solid (the hull of its corners) that fall, bounce,
// tumble and rub in a box, z up. Contacts: the separating-axis test over both solids' face normals and every pair of
// edges, the incident face clipped against the reference face's sides (Sutherland–Hodgman, up to eight points) or the
// two nearest edge points; a ball against a solid by its nearest point. Sequential impulses with restitution and
// Coulomb friction (the sliding impulse kept inside μ times the push), then a position-only push apart. Each body keeps
// its angular momentum L in space, so a body turning freely keeps L exactly and its spin ω = I⁻¹L follows.
// M542: solids with dents as several convex parts glued together (`compound`: their mass, centre and inertia added up
// by the parallel-axis rule; contacts part by part), and rolling resistance (an opposing turn at a ball's contact, at
// most Crr · push · radius).

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
export function hull(pts: V3[]): Hull & { centroid: V3 } {
  const n = pts.length;
  if (n < 4 || n > 40) throw new Error('A solid needs 4 to 40 corners.');
  const size = Math.max(...pts.map((p) => norm(sub(p, pts[0])))), tol = 1e-9 * size;
  const planes: { n: V3; d: number; ids: Set<number> }[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nn = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
    const l = norm(nn);
    if (l < tol * size) continue;
    nn = mul(nn, 1 / l);
    let d = dot(nn, pts[i]), above = 0, below = 0;
    for (const p of pts) { const s = dot(nn, p) - d; if (s > tol) above++; else if (s < -tol) below++; }
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
      // A ball in the contact rolls: its radius sets the most the resistance can turn it back by.
      const radii = [c.a, c.b].filter((i) => i >= 0 && B[i].shape.kind === 'ball').map((i) => (B[i].shape as { r: number }).r);
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
