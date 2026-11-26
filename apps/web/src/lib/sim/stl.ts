import { quadraticTets, type SolidMesh } from './solid';

// Hyperion Simulate → 3D file (M552): a part from an STL file (the 3D-printing and CAD export format: a closed surface
// of triangles, in millimetres). The surface is filled with small cubes (a cube is inside when the line through its
// middle along x crosses the surface an odd number of times before it), each cube is cut into six tetrahedra along
// its main diagonal (the same cut in every cube, so neighbours always share whole faces), and those become 10-node
// tetrahedra for the 3D solver. The part is turned so the file's z is up (CAD's habit; the solver's y is up). Its six
// sides (the faces at the box's ends) get names so supports and loads can go on them.

export const SIDES = ['Bottom', 'Top', 'Left', 'Right', 'Front', 'Back'] as const;
export type Side = (typeof SIDES)[number];

/** An STL file's triangles (9 numbers each: three corners x, y, z), binary or text. */
export function parseStl(buf: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(buf), head = new TextDecoder().decode(bytes.subarray(0, Math.min(512, bytes.length)));
  const count = bytes.length >= 84 ? new DataView(buf).getUint32(80, true) : 0;
  // Binary when its size matches its triangle count (a text file can start with "solid" too, so the size decides).
  if (bytes.length >= 84 && 84 + count * 50 === bytes.length) {
    const dv = new DataView(buf), out = new Float32Array(count * 9);
    for (let t = 0; t < count; t++) for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
    return out;
  }
  if (!/^\s*solid/i.test(head)) throw new Error('This isn’t an STL file (binary or text).');
  const text = new TextDecoder().decode(bytes), nums: number[] = [];
  for (const m of text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error('The STL file has no complete triangles.');
  return Float32Array.from(nums);
}

/** The box around the triangles (in the file's own axes). */
export function boundsOf(tris: Float32Array) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], tris[i + k]); hi[k] = Math.max(hi[k], tris[i + k]); }
  return { lo, hi };
}

/** Which boxes of a grid about h on a side are inside the surface (1), counted along x for each row of y and z. Each
 *  direction's spacing is stretched a little so whole boxes fit the part's extent exactly. */
export function voxels(tris: Float32Array, h0: number) {
  const { lo, hi } = boundsOf(tris), n = [0, 1, 2].map((k) => Math.max(1, Math.round((hi[k] - lo[k]) / h0)));
  const [nx, ny, nz] = n, d = [0, 1, 2].map((k) => (hi[k] - lo[k]) / n[k]), occ = new Uint8Array(nx * ny * nz), T = tris.length / 9;
  // Each triangle listed in the rows its y–z box covers.
  const rows: number[][] = Array.from({ length: ny * nz }, () => []);
  for (let t = 0; t < T; t++) {
    const o = t * 9, ys = [tris[o + 1], tris[o + 4], tris[o + 7]], zs = [tris[o + 2], tris[o + 5], tris[o + 8]];
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - lo[1]) / d[1] - 0.5)), j1 = Math.min(ny - 1, Math.ceil((Math.max(...ys) - lo[1]) / d[1] - 0.5));
    const k0 = Math.max(0, Math.floor((Math.min(...zs) - lo[2]) / d[2] - 0.5)), k1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) - lo[2]) / d[2] - 0.5));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) rows[k * ny + j].push(t);
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    // A hair off the grid so the line never runs exactly along a triangle's edge.
    const yc = lo[1] + (j + 0.5) * d[1] + d[1] * 1e-4, zc = lo[2] + (k + 0.5) * d[2] + d[2] * 1.7e-4, xs: number[] = [];
    for (const t of rows[k * ny + j]) {
      const o = t * 9, [ay, az, by, bz, cy, cz] = [tris[o + 1], tris[o + 2], tris[o + 4], tris[o + 5], tris[o + 7], tris[o + 8]];
      const d = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((yc - ay) * (cz - az) - (cy - ay) * (zc - az)) / d, v = ((by - ay) * (zc - az) - (yc - ay) * (bz - az)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      xs.push(tris[o] + u * (tris[o + 3] - tris[o]) + v * (tris[o + 6] - tris[o]));
    }
    xs.sort((a, b) => a - b);
    for (let p = 0; p + 1 < xs.length; p += 2) for (let i = 0; i < nx; i++) { const xc = lo[0] + (i + 0.5) * d[0]; if (xc > xs[p] && xc < xs[p + 1]) occ[(k * ny + j) * nx + i] = 1; }
  }
  return { occ, nx, ny, nz, lo, d, filled: occ.reduce((s, v) => s + v, 0) };
}

// The six tetrahedra of a cube along its main diagonal (corner bits: 1 x, 2 y, 4 z).
const KUHN = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];

/** The part as a solid for the 3D solver, its cubes about as small as `maxUnknowns` allows (three per node). */
/** `size` is in the file's own order (x, y, z), the solver's axes being (x, z, y). */
export function stlSolid(tris: Float32Array, maxUnknowns = 14_000): SolidMesh & { cube: number; size: number[] } {
  const { lo, hi } = boundsOf(tris), span = [0, 1, 2].map((k) => hi[k] - lo[k]);
  if (!(Math.min(...span) > 0)) throw new Error('The part is flat: it has no thickness.');
  // A 10-node mesh of cubes has about 8 nodes a cube: start near the unknowns allowed, then coarsen until it fits.
  let h = Math.cbrt((span[0] * span[1] * span[2]) / (maxUnknowns / 24)), v = voxels(tris, h);
  for (let tries = 0; tries < 12 && v.filled * 24 > maxUnknowns; tries++) { h *= 1.15; v = voxels(tris, h); }
  if (v.filled < 2) throw new Error('No inside found: the STL must be a closed surface (a solid, not a sheet).');
  const { occ, nx, ny, nz, d } = v, xs: number[] = [], ys: number[] = [], zs: number[] = [], id = new Map<number, number>();
  // File (x, y, z) → solver (x, z, y): the file's z is up.
  const node = (i: number, j: number, k: number) => {
    const key = (k * (ny + 1) + j) * (nx + 1) + i;
    let n = id.get(key);
    if (n === undefined) { n = xs.length; xs.push(i * d[0]); ys.push(k * d[2]); zs.push(j * d[1]); id.set(key, n); }
    return n;
  };
  const corner: number[][] = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!occ[(k * ny + j) * nx + i]) continue;
    const c = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => node(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1)));
    for (const q of KUHN) corner.push(q.map((b) => c[b]));
  }
  const { tet, surf } = quadraticTets(xs, ys, zs, corner);
  // Name the outside faces at the ends of the box: those lying on its lowest or highest plane in each direction.
  const X = Float64Array.from(xs), Y = Float64Array.from(ys), Z = Float64Array.from(zs);
  const ext = (a: Float64Array) => [Math.min(...a), Math.max(...a)];
  const [[x0, x1], [y0, y1], [z0, z1]] = [ext(X), ext(Y), ext(Z)], tol = Math.min(...d) * 1e-6;
  const faces = new Map<string, number[]>(), nodes = new Map<string, Set<number>>();
  surf.forEach((f, i) => {
    const c3 = f.slice(0, 3), on = (a: Float64Array, v0: number) => c3.every((n) => Math.abs(a[n] - v0) < tol);
    const side: Side | null = on(Y, y0) ? 'Bottom' : on(Y, y1) ? 'Top' : on(X, x0) ? 'Left' : on(X, x1) ? 'Right' : on(Z, z0) ? 'Front' : on(Z, z1) ? 'Back' : null;
    if (!side) return;
    if (!faces.has(side)) { faces.set(side, []); nodes.set(side, new Set()); }
    faces.get(side)!.push(i);
    for (const n of f) nodes.get(side)!.add(n);
  });
  return { x: X, y: Y, z: Z, tet, surface: Uint32Array.from(surf.flat()), faces, nodes: new Map([...nodes].map(([k, s]) => [k, [...s]])), thickness: z1 - z0, cube: Math.max(...d), size: [x1 - x0, z1 - z0, y1 - y0] };
}

/** A box's 12 triangles (for tests and as a first part). */
export function boxStl(w: number, d: number, hgt: number): Float32Array {
  const P = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, hgt], [w, 0, hgt], [w, d, hgt], [0, d, hgt]];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return Float32Array.from(F.flatMap((f) => f.flatMap((i) => P[i])));
}
