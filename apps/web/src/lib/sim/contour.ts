// Hyperion Simulate (M404): results drawn as engineering programs draw them, in 9 bands of colour from blue (lowest) to
// red (highest), each band's limits written on the legend. Each 6-node triangle is drawn as 4 small ones; each small one
// is cut along the band limits (its values vary straight across it), and every band is filled in one go.

export const BANDS = 9;
const RGB: [number, number, number][] = [[0, 0, 255], [0, 178, 255], [0, 255, 255], [0, 255, 178], [0, 255, 0], [178, 255, 0], [255, 255, 0], [255, 178, 0], [255, 0, 0]];
/** The band colours, lowest first (reversed for a safety factor, where low is the danger). */
export const bandColors = (reverse = false) => (reverse ? [...RGB].reverse() : RGB).map(([r, g, b]) => `rgb(${r},${g},${b})`);

/** The band limits from min to max (BANDS + 1 numbers). */
export function levels(min: number, max: number): number[] {
  if (!(max > min)) max = min + (Math.abs(min) || 1) * 1e-9;
  return Array.from({ length: BANDS + 1 }, (_, i) => min + ((max - min) * i) / BANDS);
}

/** The part of a triangle (x, y, value at its corners) whose values lie in [lo, hi], as x, y pairs. */
export function clipBand(x: number[], y: number[], v: number[], lo: number, hi: number): number[] {
  let poly = [0, 1, 2].map((i) => [x[i], y[i], v[i]]);
  const cut = (keepAbove: boolean, at: number) => {
    const out: number[][] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const pin = keepAbove ? p[2] >= at : p[2] <= at, qin = keepAbove ? q[2] >= at : q[2] <= at;
      if (pin) out.push(p);
      if (pin !== qin) { const t = (at - p[2]) / (q[2] - p[2]); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), at]); }
    }
    poly = out;
  };
  cut(true, lo);
  if (poly.length) cut(false, hi);
  return poly.length >= 3 ? poly.flatMap((p) => [p[0], p[1]]) : [];
}

/** The 4 small triangles of a 6-node one (by local node number). */
export const SUB = [[0, 3, 5], [3, 1, 4], [5, 4, 2], [3, 4, 5]];

/** Every band's area as one path per band, for screen points (sx, sy per node) and a value per node. */
export function bandPaths(tri: Uint32Array, sx: Float32Array | Float64Array, sy: Float32Array | Float64Array, v: Float64Array, lv: number[]): Path2D[] {
  const paths = Array.from({ length: BANDS }, () => new Path2D()), min = lv[0], span = lv[BANDS] - lv[0] || 1;
  const band = (val: number) => Math.max(0, Math.min(BANDS - 1, Math.floor(((val - min) / span) * BANDS)));
  const X = [0, 0, 0], Y = [0, 0, 0], V = [0, 0, 0];
  for (let e = 0; e < tri.length; e += 6) {
    for (const s of SUB) {
      for (let k = 0; k < 3; k++) { const n = tri[e + s[k]]; X[k] = sx[n]; Y[k] = sy[n]; V[k] = v[n]; }
      const b0 = band(Math.min(V[0], V[1], V[2])), b1 = band(Math.max(V[0], V[1], V[2]));
      if (b0 === b1) { const p = paths[b0]; p.moveTo(X[0], Y[0]); p.lineTo(X[1], Y[1]); p.lineTo(X[2], Y[2]); p.closePath(); continue; }
      for (let b = b0; b <= b1; b++) {
        const poly = clipBand(X, Y, V, b === 0 ? -Infinity : lv[b], b === BANDS - 1 ? Infinity : lv[b + 1]);
        if (!poly.length) continue;
        const p = paths[b];
        p.moveTo(poly[0], poly[1]);
        for (let i = 2; i < poly.length; i += 2) p.lineTo(poly[i], poly[i + 1]);
        p.closePath();
      }
    }
  }
  return paths;
}

/** A number for a legend: 4 significant figures, or powers of ten for very large or small ones. */
export const legendNum = (v: number) => (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) ? v.toExponential(3) : String(+v.toPrecision(4)));
