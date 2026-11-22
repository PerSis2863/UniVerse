import { boundaryDist, bounds, inside, oriented, type Edge, type Part } from './part';

// Hyperion Simulate (M404): the mesh. The boundary is sampled every `h` mm, the inside filled with points on a
// triangle lattice, all of it joined by Delaunay triangles (Bowyer–Watson); triangles outside the part are dropped and a
// boundary piece the triangles skipped is split until they follow it. Each triangle then gets a node in the middle of
// every side (6-node "quadratic" triangles: far more accurate in bending than 3-node ones), placed on the circle where a
// side lies on a round hole.

export interface Mesh {
  x: Float64Array; y: Float64Array;
  /** The first `corners` nodes are triangle corners, the rest mid-side nodes. */
  corners: number;
  /** 6 per element: corners a, b, c (counter-clockwise), then the middles of ab, bc and ca. */
  tri: Uint32Array;
  /** Each edge's boundary pieces as [start, middle, end] in the loop's direction (the part's outside on the right). */
  segs: Map<string, [number, number, number][]>;
  /** Each edge's nodes. */
  nodes: Map<string, number[]>;
  /** The smallest angle in any triangle (degrees): a measure of the mesh's quality. */
  minAngle: number;
}

/** Delaunay triangles of points (counter-clockwise, 3 per triangle). */
export function delaunay(px: ArrayLike<number>, py: ArrayLike<number>): Uint32Array {
  const n = px.length;
  if (n < 3) return new Uint32Array(0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, px[i]); x1 = Math.max(x1, px[i]); y0 = Math.min(y0, py[i]); y1 = Math.max(y1, py[i]); }
  const d = Math.max(x1 - x0, y1 - y0, 1e-9) * 30, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const X = Float64Array.from({ length: n + 3 }, (_, i) => (i < n ? px[i] : i === n ? cx - d : i === n + 1 ? cx + d : cx));
  const Y = Float64Array.from({ length: n + 3 }, (_, i) => (i < n ? py[i] : i === n + 2 ? cy + d : cy - d));
  type T = { a: number; b: number; c: number; x: number; y: number; r: number };
  const make = (a: number, b: number, c: number): T => {
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], qx = X[c], qy = Y[c];
    const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = qx * qx + qy * qy;
    const ux = (a2 * (by - qy) + b2 * (qy - ay) + c2 * (ay - by)) / D, uy = (a2 * (qx - bx) + b2 * (ax - qx) + c2 * (bx - ax)) / D;
    return { a, b, c, x: ux, y: uy, r: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  const tris: T[] = [make(n, n + 1, n + 2)];
  const edge = new Map<number, [number, number] | null>();
  const N = n + 3;
  for (let p = 0; p < n; p++) {
    const x = X[p], y = Y[p];
    edge.clear();
    const hole = (a: number, b: number) => { const k = a < b ? a * N + b : b * N + a; edge.set(k, edge.has(k) ? null : [a, b]); };
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      if ((x - t.x) ** 2 + (y - t.y) ** 2 < t.r * (1 - 1e-12)) {
        hole(t.a, t.b); hole(t.b, t.c); hole(t.c, t.a);
        tris[i] = tris[tris.length - 1]; tris.pop(); i--;
      }
    }
    for (const e of edge.values()) if (e) tris.push(make(e[0], e[1], p));
  }
  const out: number[] = [];
  for (const t of tris) if (t.a < n && t.b < n && t.c < n) out.push(t.a, t.b, t.c);
  return Uint32Array.from(out);
}

interface Sample { x: number; y: number; loop: number; edges: string[] }
interface Seg { a: number; b: number; edge: string; loop: number }

/** The mesh of a part with elements about `h` mm across. */
export function meshPart(part0: Part, edges: Edge[], h: number): Mesh {
  const part = oriented(part0);
  const loops = [part.outer, ...part.holes];
  const samples: Sample[] = [], segs: Seg[] = [];
  const idOf = (loop: number, seg: number | null) => edges.find((e) => e.loop === loop && e.seg === seg)?.id ?? `L${loop}${seg === null ? '' : `S${seg}`}`;
  loops.forEach((l, loop) => {
    const first = samples.length;
    if (l.kind === 'circle') {
      const k = Math.max(12, Math.ceil((2 * Math.PI * l.r) / h)), dir = loop === 0 ? 1 : -1, id = idOf(loop, null);
      for (let i = 0; i < k; i++) { const a = (dir * 2 * Math.PI * i) / k; samples.push({ x: l.c[0] + l.r * Math.cos(a), y: l.c[1] + l.r * Math.sin(a), loop, edges: [id] }); }
      for (let i = 0; i < k; i++) segs.push({ a: first + i, b: first + ((i + 1) % k), edge: id, loop });
      return;
    }
    const P = l.pts;
    P.forEach(([ax, ay], s) => {
      const [bx, by] = P[(s + 1) % P.length], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / h)), id = idOf(loop, s);
      const prev = idOf(loop, (s - 1 + P.length) % P.length);
      for (let i = 0; i < k; i++) samples.push({ x: ax + ((bx - ax) * i) / k, y: ay + ((by - ay) * i) / k, loop, edges: i === 0 ? [id, prev] : [id] });
    });
    const k = samples.length - first;
    for (let i = 0; i < k; i++) segs.push({ a: first + i, b: first + ((i + 1) % k), edge: samples[first + i].edges[0], loop });
  });
  // The inside: a triangle lattice, kept half a spacing away from the boundary.
  const pts: { x: number; y: number }[] = [];
  const b = bounds(part), dy = (h * Math.sqrt(3)) / 2;
  for (let j = 0, y = b.y0 + dy / 2; y < b.y1; j++, y += dy) {
    for (let x = b.x0 + (j % 2 ? h / 2 : 0) + h / 4; x < b.x1; x += h) if (inside(part, x, y) && boundaryDist(part, x, y) > 0.55 * h) pts.push({ x, y });
  }
  // Triangulate; split any boundary piece the triangles don't follow (a point too near it) and try again.
  let tri: Uint32Array = new Uint32Array(0);
  for (let pass = 0; ; pass++) {
    const nb = samples.length, all = [...samples, ...pts];
    tri = keep(delaunay(all.map((p) => p.x), all.map((p) => p.y)), all, part, nb, segs);
    const have = new Set<number>();
    const key = (a: number, c: number) => (a < c ? a * 1e7 + c : c * 1e7 + a);
    for (let t = 0; t < tri.length; t += 3) { have.add(key(tri[t], tri[t + 1])); have.add(key(tri[t + 1], tri[t + 2])); have.add(key(tri[t + 2], tri[t])); }
    const missing = segs.filter((s) => !have.has(key(s.a, s.b)));
    if (!missing.length) break;
    if (pass >= 6) throw new Error('The mesh couldn’t follow the outline (a very sharp corner?): try a finer mesh.');
    // A new boundary point in the middle of each missing piece (on the circle for a round hole); the pieces renumbered.
    for (const s of missing) {
      const A = samples[s.a], B = samples[s.b], l = loops[s.loop];
      let mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      if (l.kind === 'circle') { const d = Math.hypot(mx - l.c[0], my - l.c[1]) || 1; mx = l.c[0] + ((mx - l.c[0]) * l.r) / d; my = l.c[1] + ((my - l.c[1]) * l.r) / d; }
      samples.push({ x: mx, y: my, loop: s.loop, edges: [s.edge] });
      const m = samples.length - 1, at = segs.indexOf(s);
      segs.splice(at, 1, { ...s, b: m }, { ...s, a: m });
    }
    // Lattice points now too close to the new boundary points go.
    for (let i = pts.length - 1; i >= 0; i--) if (missing.some((s) => Math.hypot(pts[i].x - (samples[s.a].x + samples[s.b].x) / 2, pts[i].y - (samples[s.a].y + samples[s.b].y) / 2) < 0.5 * h)) pts.splice(i, 1);
  }
  const corners = samples.length + pts.length;
  const xs: number[] = [...samples.map((p) => p.x), ...pts.map((p) => p.x)], ys: number[] = [...samples.map((p) => p.y), ...pts.map((p) => p.y)];
  // Mid-side nodes.
  const segOf = new Map<string, Seg>();
  for (const s of segs) segOf.set(s.a < s.b ? `${s.a},${s.b}` : `${s.b},${s.a}`, s);
  const mids = new Map<string, number>();
  const mid = (a: number, c: number) => {
    const k = a < c ? `${a},${c}` : `${c},${a}`;
    let m = mids.get(k);
    if (m !== undefined) return m;
    let mx = (xs[a] + xs[c]) / 2, my = (ys[a] + ys[c]) / 2;
    const s = segOf.get(k), l = s ? loops[s.loop] : null;
    if (l?.kind === 'circle') { const d = Math.hypot(mx - l.c[0], my - l.c[1]) || 1; mx = l.c[0] + ((mx - l.c[0]) * l.r) / d; my = l.c[1] + ((my - l.c[1]) * l.r) / d; }
    m = xs.length; xs.push(mx); ys.push(my); mids.set(k, m);
    return m;
  };
  const t6 = new Uint32Array((tri.length / 3) * 6);
  let minAngle = 180;
  for (let t = 0, e = 0; t < tri.length; t += 3, e += 6) {
    const a = tri[t], b2 = tri[t + 1], c = tri[t + 2];
    t6.set([a, b2, c, mid(a, b2), mid(b2, c), mid(c, a)], e);
    for (const [p, q, r] of [[a, b2, c], [b2, c, a], [c, a, b2]]) {
      const ux = xs[q] - xs[p], uy = ys[q] - ys[p], vx = xs[r] - xs[p], vy = ys[r] - ys[p];
      minAngle = Math.min(minAngle, (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) * 180) / Math.PI);
    }
  }
  const bySeg = new Map<string, [number, number, number][]>(), byNode = new Map<string, number[]>();
  for (const s of segs) {
    const m = mids.get(s.a < s.b ? `${s.a},${s.b}` : `${s.b},${s.a}`)!;
    if (!bySeg.has(s.edge)) bySeg.set(s.edge, []);
    bySeg.get(s.edge)!.push([s.a, m, s.b]);
  }
  for (const [id, list] of bySeg) byNode.set(id, [...new Set(list.flat())]);
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), corners, tri: t6, segs: bySeg, nodes: byNode, minAngle };
}

/** The triangles inside the part: the middle and every side's middle inside (a side along the boundary is fine). */
function keep(tri: Uint32Array, pts: { x: number; y: number }[], part: Part, nb: number, segs: Seg[]): Uint32Array {
  const onB = new Set(segs.map((s) => (s.a < s.b ? s.a * 1e7 + s.b : s.b * 1e7 + s.a)));
  const out: number[] = [];
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t], tri[t + 1], tri[t + 2]], A = pts[a], B = pts[b], C = pts[c];
    const area2 = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    if (Math.abs(area2) < 1e-12 * ((B.x - A.x) ** 2 + (B.y - A.y) ** 2 + (C.x - A.x) ** 2 + (C.y - A.y) ** 2)) continue;
    if (!inside(part, (A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3)) continue;
    const sideOk = (p: number, q: number) => (p < nb && q < nb && onB.has(p < q ? p * 1e7 + q : q * 1e7 + p)) || inside(part, (pts[p].x + pts[q].x) / 2, (pts[p].y + pts[q].y) / 2);
    if (!sideOk(a, b) || !sideOk(b, c) || !sideOk(c, a)) continue;
    if (area2 > 0) out.push(a, b, c); else out.push(a, c, b);
  }
  return Uint32Array.from(out);
}

export type Fineness = 'coarse' | 'medium' | 'fine' | 'finest';
/** An element size for a part: the longer side over 12, 22, 36 or 56, and at most the shorter side over 2, 4, 6 or 8
 *  (a slender beam still gets several elements through its height). `thin` is the part's thinnest place if known. */
export function elementSize(part: Part, fineness: Fineness, thin = Infinity) {
  const b = bounds(part), span = Math.max(b.x1 - b.x0, b.y1 - b.y0), short = Math.min(b.x1 - b.x0, b.y1 - b.y0, thin);
  const k = { coarse: [12, 2], medium: [22, 4], fine: [36, 6], finest: [56, 8] }[fineness];
  return Math.min(span / k[0], short / k[1]);
}
