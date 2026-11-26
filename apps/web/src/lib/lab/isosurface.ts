// Hyperion's isosurfaces (M519): the surface where a 3D field equals a level, by marching tetrahedra (each grid cube
// cut into six tetrahedra along one diagonal, so neighbouring cubes agree and the surface has no holes or ambiguous
// cases). Corners are shared along grid edges; every triangle faces away from the larger values.

/** V on the grid gx × gy × gz with x fastest (V[i + nx (j + ny k)]): vertices [x, y, z] and triangles (0-based). */
export function isosurface(gx: ArrayLike<number>, gy: ArrayLike<number>, gz: ArrayLike<number>, V: ArrayLike<number>, level: number) {
  const nx = gx.length, ny = gy.length, nz = gz.length;
  if (V.length !== nx * ny * nz) throw new Error('The values must fill the grid.');
  const verts: number[][] = [], faces: number[][] = [], seen = new Map<number, number>();
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const P = (n: number) => { const i = n % nx, j = Math.floor(n / nx) % ny, k = Math.floor(n / (nx * ny)); return [gx[i], gy[j], gz[k]]; };
  // A corner where the edge between grid points p and q crosses the level.
  const cut = (p: number, q: number) => {
    const key = p < q ? p * nx * ny * nz + q : q * nx * ny * nz + p;
    let v = seen.get(key);
    if (v === undefined) {
      const a = V[p], b = V[q], s = a === b ? 0.5 : (level - a) / (b - a), A = P(p), B = P(q);
      v = verts.length; verts.push([A[0] + s * (B[0] - A[0]), A[1] + s * (B[1] - A[1]), A[2] + s * (B[2] - A[2])]); seen.set(key, v);
    }
    return v;
  };
  const TETS = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];
  const add = (t: number[], ins: number[], outs: number[]) => {
    // Face away from the inside (the larger values).
    const [a, b, c] = t.map((k) => verts[k]), n = cross3(sub(b, a), sub(c, a));
    const ci = mean(ins.map(P)), co = mean(outs.map(P)), d = sub(co, ci);
    faces.push(n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0 ? t : [t[0], t[2], t[1]]);
  };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => id(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1)));
    for (const T of TETS) {
      const p = T.map((b) => c[b]), ins = p.filter((q) => V[q] > level), outs = p.filter((q) => !(V[q] > level));
      if (ins.length === 0 || ins.length === 4 || p.some((q) => !Number.isFinite(V[q]))) continue;
      if (ins.length === 1 || ins.length === 3) {
        const lone = ins.length === 1 ? ins[0] : outs[0], rest = (ins.length === 1 ? outs : ins);
        add(rest.map((q) => cut(lone, q)), ins, outs);
      } else {
        const [a, b] = ins, [c2, d] = outs, q = [cut(a, c2), cut(a, d), cut(b, d), cut(b, c2)];
        add([q[0], q[1], q[2]], ins, outs); add([q[0], q[2], q[3]], ins, outs);
      }
    }
  }
  return { verts, faces };
}
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = (ps: number[][]) => [0, 1, 2].map((i) => ps.reduce((s, p) => s + p[i], 0) / ps.length);

/** The volume a closed surface holds (divergence theorem), positive when its triangles face outward. */
export const enclosed = (verts: number[][], faces: number[][]) => faces.reduce((s, [a, b, c]) => s + dot(verts[a], cross3(verts[b], verts[c])) / 6, 0);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
