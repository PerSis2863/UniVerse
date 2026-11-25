// Hyperion's 2D rigid bodies of any shape (M519): convex polygons and circles that turn, bounce and rub, in a box and
// against fixed shapes. Contacts by the separating-axis test with edge clipping (up to two points a pair), solved by
// sequential impulses with restitution and Coulomb friction, then pushed apart (positions only, so no energy is made).

export type Shape = { kind: 'poly'; v: number[][] } | { kind: 'circle'; r: number };
export interface Body { shape: Shape; m: number; I: number; x: number; y: number; a: number; vx: number; vy: number; w: number; fixed: boolean }

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** A convex polygon about its centroid, counter-clockwise, with its area and second moment per unit mass (∫r² dm / m). */
export function polygon(pts: number[][]) {
  const n = pts.length;
  if (n < 3) throw new Error('A polygon needs at least 3 corners.');
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], c = cross(x0, y0, x1, y1); A += c / 2; cx += ((x0 + x1) * c) / 6; cy += ((y0 + y1) * c) / 6; }
  if (Math.abs(A) < 1e-14) throw new Error('The polygon has no area.');
  cx /= A; cy /= A;
  let v = pts.map(([x, y]) => [x - cx, y - cy]);
  if (A < 0) { v = v.reverse(); A = -A; }
  for (let i = 0; i < n; i++) {
    const p = v[i], q = v[(i + 1) % n], r = v[(i + 2) % n];
    if (cross(q[0] - p[0], q[1] - p[1], r[0] - q[0], r[1] - q[1]) < -1e-12 * A) throw new Error('Only convex shapes (split a concave one into convex parts).');
  }
  // ∫(x² + y²) over the polygon, by triangles from the centroid.
  let J = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = v[i], [x1, y1] = v[(i + 1) % n], c = cross(x0, y0, x1, y1); J += (c * (x0 * x0 + x0 * x1 + x1 * x1 + y0 * y0 + y0 * y1 + y1 * y1)) / 12; }
  return { v, area: A, k2: J / A, centroid: [cx, cy] };
}

const world = (b: Body) => {
  if (b.shape.kind !== 'poly') return [];
  const c = Math.cos(b.a), s = Math.sin(b.a);
  return b.shape.v.map(([x, y]) => [b.x + c * x - s * y, b.y + s * x + c * y]);
};
const normals = (P: number[][]) => P.map((p, i) => { const q = P[(i + 1) % P.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [dy / l, -dx / l]; });

export interface Contact { a: number; b: number; n: number[]; p: number[]; depth: number }

/** The face of P that separates it most from Q's points: [separation, face]. */
function maxSep(P: number[][], N: number[][], Q: number[][]) {
  let best = -Infinity, face = 0;
  for (let i = 0; i < P.length; i++) {
    let m = Infinity;
    for (const q of Q) m = Math.min(m, N[i][0] * (q[0] - P[i][0]) + N[i][1] * (q[1] - P[i][1]));
    if (m > best) { best = m; face = i; }
  }
  return [best, face] as const;
}

/** Polygon A against polygon B: contact points with the normal pointing from A to B. */
function polyPoly(A: number[][], B: number[][], ia: number, ib: number, out: Contact[]) {
  const NA = normals(A), NB = normals(B);
  const [sa, fa] = maxSep(A, NA, B), [sb, fb] = maxSep(B, NB, A);
  if (sa > 0 || sb > 0) return;
  // The reference face belongs to the shape that separates more (a small bias keeps the choice steady).
  const flip = sb > sa + 1e-9 * (1 + Math.abs(sa));
  const R = flip ? B : A, NR = flip ? NB : NA, I = flip ? A : B, NI = flip ? NA : NB, f = flip ? fb : fa;
  const n = NR[f];
  let inc = 0, dmin = Infinity;
  for (let i = 0; i < I.length; i++) { const d = NI[i][0] * n[0] + NI[i][1] * n[1]; if (d < dmin) { dmin = d; inc = i; } }
  let seg = [I[inc], I[(inc + 1) % I.length]];
  const r0 = R[f], r1 = R[(f + 1) % R.length], tx = r1[0] - r0[0], ty = r1[1] - r0[1], tl = Math.hypot(tx, ty), t = [tx / tl, ty / tl];
  // Clip the incident edge to the reference face's two side planes.
  const clip = (pts: number[][], nx: number, ny: number, off: number) => {
    const d = pts.map((p) => nx * p[0] + ny * p[1] - off), res: number[][] = [];
    if (d[0] <= 0) res.push(pts[0]);
    if (d[1] <= 0) res.push(pts[1]);
    if (d[0] * d[1] < 0) { const s = d[0] / (d[0] - d[1]); res.push([pts[0][0] + s * (pts[1][0] - pts[0][0]), pts[0][1] + s * (pts[1][1] - pts[0][1])]); }
    return res;
  };
  seg = clip(seg, -t[0], -t[1], -(t[0] * r0[0] + t[1] * r0[1]));
  if (seg.length < 2) return;
  seg = clip(seg, t[0], t[1], t[0] * r1[0] + t[1] * r1[1]);
  if (seg.length < 2) return;
  for (const p of seg) {
    const sep = n[0] * (p[0] - r0[0]) + n[1] * (p[1] - r0[1]);
    if (sep <= 0) out.push({ a: flip ? ib : ia, b: flip ? ia : ib, n: [n[0], n[1]], p, depth: -sep });
  }
}

/** Circle (centre c, radius r) against polygon P: the normal from the polygon to the circle. */
function polyCircle(P: number[][], c: number[], r: number, ip: number, ic: number, out: Contact[]) {
  const N = normals(P);
  let sep = -Infinity, f = 0;
  for (let i = 0; i < P.length; i++) { const s = N[i][0] * (c[0] - P[i][0]) + N[i][1] * (c[1] - P[i][1]); if (s > sep) { sep = s; f = i; } }
  if (sep > r) return;
  if (sep < 0) { out.push({ a: ip, b: ic, n: N[f], p: [c[0] - N[f][0] * r, c[1] - N[f][1] * r], depth: r - sep }); return; }
  // Outside: the nearest point of the face (or a corner).
  const p = P[f], q = P[(f + 1) % P.length], ex = q[0] - p[0], ey = q[1] - p[1];
  const s = Math.max(0, Math.min(1, ((c[0] - p[0]) * ex + (c[1] - p[1]) * ey) / (ex * ex + ey * ey)));
  const near = [p[0] + s * ex, p[1] + s * ey], dx = c[0] - near[0], dy = c[1] - near[1], d = Math.hypot(dx, dy);
  if (d > r || d < 1e-15) return;
  out.push({ a: ip, b: ic, n: [dx / d, dy / d], p: near, depth: r - d });
}

/** Every contact between bodies and with the walls of [0, W] × [0, H] (b = −1 for a wall). */
export function contacts(B: Body[], W: number, H: number): Contact[] {
  const out: Contact[] = [], P = B.map(world);
  const walls: [number[], number][] = [[[-1, 0], 0], [[1, 0], W], [[0, -1], 0], [[0, 1], H]]; // outward normal, n·x limit
  B.forEach((b, i) => {
    if (b.fixed) return;
    for (const [n, lim] of walls) {
      const edge = n[0] ? n[0] * lim : n[1] * lim;
      if (b.shape.kind === 'circle') { const d = n[0] * b.x + n[1] * b.y + b.shape.r - edge; if (d > 0) out.push({ a: i, b: -1, n, p: [b.x + n[0] * b.shape.r, b.y + n[1] * b.shape.r], depth: d }); }
      else for (const p of P[i]) { const d = n[0] * p[0] + n[1] * p[1] - edge; if (d > 0) out.push({ a: i, b: -1, n, p, depth: d }); }
    }
  });
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    if (a.fixed && b.fixed) continue;
    const ra = a.shape.kind === 'circle' ? a.shape.r : Math.max(...a.shape.v.map((v) => Math.hypot(v[0], v[1])));
    const rb = b.shape.kind === 'circle' ? b.shape.r : Math.max(...b.shape.v.map((v) => Math.hypot(v[0], v[1])));
    if (Math.hypot(a.x - b.x, a.y - b.y) > ra + rb) continue;
    if (a.shape.kind === 'poly' && b.shape.kind === 'poly') polyPoly(P[i], P[j], i, j, out);
    else if (a.shape.kind === 'poly') polyCircle(P[i], [b.x, b.y], rb, i, j, out);
    else if (b.shape.kind === 'poly') polyCircle(P[j], [a.x, a.y], ra, j, i, out);
    else {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < ra + rb && d > 1e-15) out.push({ a: i, b: j, n: [dx / d, dy / d], p: [a.x + (dx / d) * ra, a.y + (dy / d) * ra], depth: ra + rb - d });
    }
  }
  return out;
}

export interface SimOpts { W: number; H: number; g: number; e: number; mu: number; dt: number; frames: number[]; iterations?: number }

/** Runs the bodies (changed in place) and records [x, y, angle] of each at the frame times. */
export function simulate(B: Body[], o: SimOpts) {
  const it = o.iterations ?? 20, inv = B.map((b) => (b.fixed ? 0 : 1 / b.m)), invI = B.map((b) => (b.fixed ? 0 : 1 / b.I));
  const out: number[][] = [], energy: number[] = [];
  let t = 0, f = 0, hits = 0;
  const ke = () => B.reduce((s, b) => s + (b.fixed ? 0 : 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.I * b.w * b.w + b.m * o.g * b.y), 0);
  const snap = () => { out.push(B.flatMap((b) => [b.x, b.y, b.a])); energy.push(ke()); };
  while (f < o.frames.length && o.frames[f] <= 1e-12) { snap(); f++; }
  const end = o.frames[o.frames.length - 1] ?? 0, slop = 1e-4 * Math.min(o.W, o.H);
  let touching = new Set<string>();
  const relN = (c: Contact, ra: number[], rb: number[], n: number[]) => {
    const A = B[c.a], Bb = c.b >= 0 ? B[c.b] : null;
    const va = [A.vx - A.w * ra[1], A.vy + A.w * ra[0]], vb = Bb ? [Bb.vx - Bb.w * rb[1], Bb.vy + Bb.w * rb[0]] : [0, 0];
    return (vb[0] - va[0]) * n[0] + (vb[1] - va[1]) * n[1];
  };
  const apply = (c: Contact, ra: number[], rb: number[], d: number[], j: number) => {
    const A = B[c.a];
    A.vx -= j * d[0] * inv[c.a]; A.vy -= j * d[1] * inv[c.a]; A.w -= j * cross(ra[0], ra[1], d[0], d[1]) * invI[c.a];
    if (c.b >= 0) { const Bb = B[c.b]; Bb.vx += j * d[0] * inv[c.b]; Bb.vy += j * d[1] * inv[c.b]; Bb.w += j * cross(rb[0], rb[1], d[0], d[1]) * invI[c.b]; }
  };
  while (t < end - 1e-12) {
    const dt = Math.min(o.dt, end - t);
    for (const b of B) if (!b.fixed) b.vy -= o.g * dt;
    const C = contacts(B, o.W, o.H);
    // A contact approaching faster than gravity gives in two steps bounces; slower ones rest (no endless jitter).
    const rest = 2 * o.g * dt + 1e-9;
    const pre = C.map((c) => {
      const A = B[c.a], Bb = c.b >= 0 ? B[c.b] : null;
      const ra = [c.p[0] - A.x, c.p[1] - A.y], rb = Bb ? [c.p[0] - Bb.x, c.p[1] - Bb.y] : [0, 0];
      const ia = inv[c.a], ib = c.b >= 0 ? inv[c.b] : 0, Ia = invI[c.a], Ib = c.b >= 0 ? invI[c.b] : 0;
      const t2 = [-c.n[1], c.n[0]];
      const kn = ia + ib + Ia * cross(ra[0], ra[1], c.n[0], c.n[1]) ** 2 + Ib * cross(rb[0], rb[1], c.n[0], c.n[1]) ** 2;
      const kt = ia + ib + Ia * cross(ra[0], ra[1], t2[0], t2[1]) ** 2 + Ib * cross(rb[0], rb[1], t2[0], t2[1]) ** 2;
      const vn = relN(c, ra, rb, c.n);
      return { c, ra, rb, t2, mn: 1 / kn, mt: 1 / kt, target: vn < -rest ? -o.e * vn : 0, jn: 0, jt: 0 };
    });
    for (let k = 0; k < it; k++) for (const q of pre) {
      // The normal push (never pulling), then friction within μ times it.
      const vn = relN(q.c, q.ra, q.rb, q.c.n);
      const jn = Math.max(0, q.jn + q.mn * (q.target - vn)), dj = jn - q.jn;
      q.jn = jn; apply(q.c, q.ra, q.rb, q.c.n, dj);
      if (o.mu > 0) {
        const vt = relN(q.c, q.ra, q.rb, q.t2), lim = o.mu * q.jn;
        const jt = Math.max(-lim, Math.min(lim, q.jt - q.mt * vt)), dt2 = jt - q.jt;
        q.jt = jt; apply(q.c, q.ra, q.rb, q.t2, dt2);
      }
    }
    const now = new Set(C.map((c) => `${c.a},${c.b}`));
    for (const k of now) if (!touching.has(k)) hits++;
    touching = now;
    for (const b of B) if (!b.fixed) { b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; }
    // Push overlapping shapes apart, shared by their inverse masses (positions only).
    for (const c of contacts(B, o.W, o.H)) {
      const ia = inv[c.a], ib = c.b >= 0 ? inv[c.b] : 0, s = Math.max(0, c.depth - slop) * 0.8 / (ia + ib || 1);
      B[c.a].x -= c.n[0] * s * ia; B[c.a].y -= c.n[1] * s * ia;
      if (c.b >= 0) { B[c.b].x += c.n[0] * s * ib; B[c.b].y += c.n[1] * s * ib; }
    }
    t += dt;
    while (f < o.frames.length && o.frames[f] <= t + 1e-12) { snap(); f++; }
  }
  while (f < o.frames.length) { snap(); f++; }
  return { frames: out, energy, hits };
}

/** A body from a shape: a polygon's corners (relative to anything: it's centred on its centroid) or a circle's radius. */
export function body(shape: number[][] | number, x: number, y: number, a: number, v: number[], m: number, fixed = false): Body {
  if (typeof shape === 'number') {
    if (!(shape > 0)) throw new Error('A circle needs a positive radius.');
    return { shape: { kind: 'circle', r: shape }, m, I: 0.5 * m * shape * shape, x, y, a, vx: v[0], vy: v[1], w: v[2], fixed };
  }
  const p = polygon(shape);
  return { shape: { kind: 'poly', v: p.v }, m, I: m * p.k2, x, y, a, vx: v[0], vy: v[1], w: v[2], fixed };
}
export const area = (shape: number[][] | number) => (typeof shape === 'number' ? Math.PI * shape * shape : polygon(shape).area);
/** Where a body's outline is (for drawing). */
export function outline(b: Body): number[][] {
  if (b.shape.kind === 'poly') return world(b);
  const r = b.shape.r;
  return Array.from({ length: 41 }, (_, i) => { const t = b.a + (2 * Math.PI * i) / 40; return i === 40 ? [b.x, b.y] : [b.x + r * Math.cos(t), b.y + r * Math.sin(t)]; });
}
