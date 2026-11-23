// Hyperion's picture processing (M428, the owner's list: "Image processing"): filters by correlation with any border
// rule, the usual kernels, the median, edges (Sobel, Prewitt, Canny), Otsu's threshold and a local one, shape
// operations (erode, dilate, open, close, fill holes), labelling joined pixels and measuring them, histogram
// equalisation, contrast stretching, noise and quality measures. Our own code from the textbook methods.

export interface Plane { r: number; c: number; d: Float64Array }
export type Pad = 'zero' | 'replicate' | 'symmetric' | 'circular';
export const plane = (r: number, c: number, d?: ArrayLike<number>): Plane => ({ r, c, d: d ? Float64Array.from(d) : new Float64Array(r * c) });

/** The index along one side for a position outside it, by the border rule (−1 for a constant). */
function wrap(i: number, n: number, pad: Pad): number {
  if (i >= 0 && i < n) return i;
  if (pad === 'zero') return -1;
  if (pad === 'replicate') return i < 0 ? 0 : n - 1;
  if (pad === 'circular') return ((i % n) + n) % n;
  const p = 2 * n;
  let k = ((i % p) + p) % p;
  if (k >= n) k = p - 1 - k;
  return k;
}

/** Correlation (or convolution) with kernel K, its centre at floor((size − 1) / 2), the same size as the picture. */
export function filter(P: Plane, K: Plane, pad: Pad = 'zero', conv = false, value = 0): Plane {
  if (conv) K = plane(K.r, K.c, Float64Array.from(K.d).reverse());
  const sep = (pad !== 'zero' || value === 0) && K.r * K.c > 9 ? factor(K) : null;
  if (sep) return pass(pass(P, sep[0], Math.floor((K.r - 1) / 2), pad, true), sep[1], Math.floor((K.c - 1) / 2), pad, false);
  const o = plane(P.r, P.c), cr = Math.floor((K.r - 1) / 2), cc = Math.floor((K.c - 1) / 2);
  const taps: [number, number, number][] = [];
  for (let q = 0; q < K.c; q++) for (let p = 0; p < K.r; p++) {
    const w = K.d[p + q * K.r];
    if (w) taps.push([p - cr, q - cc, w]);
  }
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    let s = 0;
    for (const [dp, dq, w] of taps) {
      const ii = i + dp, jj = j + dq;
      if (ii >= 0 && ii < P.r && jj >= 0 && jj < P.c) { s += w * P.d[ii + jj * P.r]; continue; }
      const a = wrap(ii, P.r, pad), b = wrap(jj, P.c, pad);
      s += w * (a < 0 || b < 0 ? value : P.d[a + b * P.r]);
    }
    o.d[i + j * P.r] = s;
  }
  return o;
}

/** A kernel that is a column times a row (a Gaussian, a box), as that column and row; null otherwise. */
function factor(K: Plane): [Float64Array, Float64Array] | null {
  let p0 = 0, q0 = 0, top = 0;
  for (let q = 0; q < K.c; q++) for (let p = 0; p < K.r; p++) if (Math.abs(K.d[p + q * K.r]) > top) { top = Math.abs(K.d[p + q * K.r]); p0 = p; q0 = q; }
  if (!top) return null;
  const u = Float64Array.from({ length: K.r }, (_, p) => K.d[p + q0 * K.r]), v = Float64Array.from({ length: K.c }, (_, q) => K.d[p0 + q * K.r] / K.d[p0 + q0 * K.r]);
  for (let q = 0; q < K.c; q++) for (let p = 0; p < K.r; p++) if (Math.abs(u[p] * v[q] - K.d[p + q * K.r]) > 1e-12 * top) return null;
  return [u, v];
}
/** One direction of a separable correlation: down the columns (rows) or along the rows. */
function pass(P: Plane, w: Float64Array, centre: number, pad: Pad, down: boolean): Plane {
  const o = plane(P.r, P.c), n = down ? P.r : P.c, m = w.length;
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    const at = down ? i : j;
    let s = 0;
    if (at - centre >= 0 && at - centre + m <= n) {
      const base = down ? i - centre + j * P.r : i + (j - centre) * P.r, step = down ? 1 : P.r;
      for (let t = 0; t < m; t++) s += w[t] * P.d[base + t * step];
    } else for (let t = 0; t < m; t++) {
      const k = wrap(at + t - centre, n, pad);
      if (k >= 0) s += w[t] * P.d[down ? k + j * P.r : i + k * P.r];
    }
    o.d[i + j * P.r] = s;
  }
  return o;
}

// ——— Kernels ———
export const average = (r: number, c = r) => plane(r, c, new Array(r * c).fill(1 / (r * c)));
export function gaussian(r: number, c: number, sigma: number): Plane {
  const o = plane(r, c);
  let s = 0;
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { const y = i - (r - 1) / 2, x = j - (c - 1) / 2, v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma)); o.d[i + j * r] = v; s += v; }
  o.d.forEach((v, k) => { o.d[k] = v / s; });
  return o;
}
/** A round averaging kernel of radius rad: each cell weighted by how much of it lies inside the circle. */
export function disk(rad: number): Plane {
  const n = 2 * Math.ceil(rad) + 1, o = plane(n, n), h = (n - 1) / 2, S = 8;
  let s = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let inside = 0;
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const x = j - h - 0.5 + (a + 0.5) / S, y = i - h - 0.5 + (b + 0.5) / S; if (x * x + y * y <= rad * rad) inside++; }
    o.d[i + j * n] = inside / (S * S); s += inside / (S * S);
  }
  o.d.forEach((v, k) => { o.d[k] = v / s; });
  return o;
}
const k3 = (v: number[]) => plane(3, 3, [v[0], v[3], v[6], v[1], v[4], v[7], v[2], v[5], v[8]]);
/** Row-major 3 × 3 kernels (as they're printed). */
export const SOBEL = k3([1, 2, 1, 0, 0, 0, -1, -2, -1]), PREWITT = k3([1, 1, 1, 0, 0, 0, -1, -1, -1]);
export const laplacian = (alpha = 0.2) => { const a = alpha / (alpha + 1), b = (1 - alpha) / (alpha + 1); return k3([a, b, a, b, -4 / (alpha + 1), b, a, b, a]); };
export const unsharp = (alpha = 0.2) => { const f = 1 / (alpha + 1); return k3([-alpha, alpha - 1, -alpha, alpha - 1, alpha + 5, alpha - 1, -alpha, alpha - 1, -alpha].map((v) => v * f)); };
/** Laplacian of a Gaussian, summing to 0. */
export function logKernel(n: number, sigma: number): Plane {
  const g = gaussian(n, n, sigma), o = plane(n, n), h = (n - 1) / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = j - h, y = i - h; o.d[i + j * n] = (g.d[i + j * n] * (x * x + y * y - 2 * sigma * sigma)) / sigma ** 4; }
  const m = o.d.reduce((s, v) => s + v, 0) / (n * n);
  o.d.forEach((v, k) => { o.d[k] = v - m; });
  return o;
}
export const gaussFilter = (P: Plane, sigma: number, size = 2 * Math.ceil(2 * sigma) + 1) => filter(P, gaussian(size, size, sigma), 'replicate');

/** The median of each m × n neighbourhood (zero border, or symmetric). */
export function median(P: Plane, m = 3, n = 3, pad: Pad = 'zero'): Plane {
  const o = plane(P.r, P.c), cr = Math.floor((m - 1) / 2), cc = Math.floor((n - 1) / 2), w = new Float64Array(m * n);
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    let k = 0;
    for (let q = 0; q < n; q++) for (let p = 0; p < m; p++) { const a = wrap(i + p - cr, P.r, pad), b = wrap(j + q - cc, P.c, pad); w[k++] = a < 0 || b < 0 ? 0 : P.d[a + b * P.r]; }
    w.sort();
    o.d[i + j * P.r] = k % 2 ? w[(k - 1) / 2] : (w[k / 2 - 1] + w[k / 2]) / 2;
  }
  return o;
}

// ——— Edges ———
/** Sobel or Prewitt edges: the squared gradient over a cut (4 × its mean unless given), thinned to one pixel. */
export function gradientEdges(P: Plane, kind: 'sobel' | 'prewitt', thresh?: number) {
  const K = kind === 'sobel' ? SOBEL : PREWITT, s = kind === 'sobel' ? 8 : 6;
  const gy = filter(P, K, 'replicate'), gx = filter(P, plane(3, 3, [...transpose3(K)]), 'replicate');
  const n = P.r * P.c, b = new Float64Array(n);
  for (let k = 0; k < n; k++) b[k] = (gx.d[k] / s) ** 2 + (gy.d[k] / s) ** 2;
  const cutoff = thresh === undefined ? (4 * b.reduce((t, v) => t + v, 0)) / n : thresh * thresh;
  const e = new Uint8Array(n), at = (i: number, j: number) => (i < 0 || j < 0 || i >= P.r || j >= P.c ? 0 : b[i + j * P.r]);
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    const k = i + j * P.r, v = b[k];
    if (v <= cutoff) continue;
    const ax = Math.abs(gx.d[k]), ay = Math.abs(gy.d[k]);
    // Thinned along the stronger gradient: a peak across the edge.
    if ((ax >= ay && v > at(i, j - 1) && v >= at(i, j + 1)) || (ay >= ax && v > at(i - 1, j) && v >= at(i + 1, j))) e[k] = 1;
  }
  return { edges: e, thresh: Math.sqrt(cutoff) };
}
function transpose3(K: Plane) { const o = new Float64Array(9); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o[j + i * 3] = K.d[i + j * 3]; return o; }

/** Canny: Gaussian smoothing, the gradient, thinning across it, then hysteresis between a low and a high cut (as a
 * share of the strongest gradient; by default the high cut leaves 70% of pixels below it, the low is 0.4 × high). */
export function canny(P: Plane, sigma = Math.SQRT2, low?: number, high?: number) {
  const G = gaussFilter(P, sigma, 2 * Math.ceil(3 * sigma) + 1), n = P.r * P.c, gx = new Float64Array(n), gy = new Float64Array(n), mag = new Float64Array(n);
  const g = (i: number, j: number) => G.d[Math.min(P.r - 1, Math.max(0, i)) + Math.min(P.c - 1, Math.max(0, j)) * P.r];
  let top = 0;
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    const k = i + j * P.r;
    gx[k] = (g(i, j + 1) - g(i, j - 1)) / 2; gy[k] = (g(i + 1, j) - g(i - 1, j)) / 2; mag[k] = Math.hypot(gx[k], gy[k]); top = Math.max(top, mag[k]);
  }
  if (top > 0) for (let k = 0; k < n; k++) mag[k] /= top;
  if (high === undefined) { const s = Float64Array.from(mag).sort(); high = s[Math.min(n - 1, Math.floor(0.7 * n))] || 1e-9; }
  if (low === undefined) low = 0.4 * high;
  const thin = new Uint8Array(n), m = (i: number, j: number) => (i < 0 || j < 0 || i >= P.r || j >= P.c ? 0 : mag[i + j * P.r]);
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    const k = i + j * P.r, v = mag[k];
    if (v <= low) continue;
    // The gradient's direction to the nearest of 0°, 45°, 90°, 135° (rows grow downwards).
    const a = ((Math.atan2(gy[k], gx[k]) * 180) / Math.PI + 180) % 180;
    const [di, dj] = a < 22.5 || a >= 157.5 ? [0, 1] : a < 67.5 ? [1, 1] : a < 112.5 ? [1, 0] : [1, -1];
    if (v > m(i - di, j - dj) && v >= m(i + di, j + dj)) thin[k] = 1;
  }
  const e = new Uint8Array(n), stack: number[] = [];
  for (let k = 0; k < n; k++) if (thin[k] && mag[k] > high) { e[k] = 1; stack.push(k); }
  while (stack.length) {
    const k = stack.pop()!, i = k % P.r, j = (k - i) / P.r;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= P.r || jj >= P.c) continue;
      const q = ii + jj * P.r;
      if (thin[q] && !e[q]) { e[q] = 1; stack.push(q); }
    }
  }
  return { edges: e, thresh: [low, high] as [number, number] };
}

// ——— Thresholds ———
/** Otsu's threshold for values in 0…1: the cut that best separates the histogram's two classes. */
export function otsu(v: ArrayLike<number>, bins = 256) {
  const h = new Float64Array(bins);
  for (let k = 0; k < v.length; k++) h[Math.min(bins - 1, Math.max(0, Math.round(v[k] * (bins - 1))))]++;
  const n = v.length, muT = h.reduce((s, c, i) => s + i * c, 0) / n;
  let w = 0, mu = 0, best = -1;
  const ties: number[] = [];
  for (let t = 0; t < bins; t++) {
    w += h[t] / n; mu += (t * h[t]) / n;
    if (w <= 0 || w >= 1) continue;
    const s = (muT * w - mu) ** 2 / (w * (1 - w));
    if (s > best + 1e-12) { best = s; ties.length = 0; ties.push(t); } else if (Math.abs(s - best) <= 1e-12) ties.push(t);
  }
  return ties.length ? ties.reduce((s, t) => s + t, 0) / ties.length / (bins - 1) : 0;
}
/** A local threshold (Bradley's): a pixel is on when brighter than its neighbourhood's mean × (1 + 0.3 (0.5 − s)). */
export function adaptive(P: Plane, sensitivity = 0.5, win?: number) {
  const w = win ?? 2 * Math.floor(Math.max(P.r, P.c) / 16) + 1, h = Math.floor(w / 2), R = P.r + 1, I = new Float64Array(R * (P.c + 1));
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) I[i + 1 + (j + 1) * R] = P.d[i + j * P.r] + I[i + (j + 1) * R] + I[i + 1 + j * R] - I[i + j * R];
  const out = new Uint8Array(P.r * P.c), f = 1 + 0.3 * (0.5 - sensitivity);
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    const i0 = Math.max(0, i - h), i1 = Math.min(P.r, i + h + 1), j0 = Math.max(0, j - h), j1 = Math.min(P.c, j + h + 1);
    const sum = I[i1 + j1 * R] - I[i0 + j1 * R] - I[i1 + j0 * R] + I[i0 + j0 * R];
    out[i + j * P.r] = P.d[i + j * P.r] > (f * sum) / ((i1 - i0) * (j1 - j0)) ? 1 : 0;
  }
  return out;
}

// ——— Shapes ———
export interface Nhood { r: number; c: number; on: Uint8Array }
export function strel(kind: string, a = 1, b = a): Nhood {
  const make = (r: number, c: number, f: (y: number, x: number) => boolean): Nhood => { const on = new Uint8Array(r * c); for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) on[i + j * r] = f(i - (r - 1) / 2, j - (c - 1) / 2) ? 1 : 0; return { r, c, on }; };
  if (kind === 'square') return make(a, a, () => true);
  if (kind === 'rectangle') return make(a, b, () => true);
  if (kind === 'disk') { const n = 2 * Math.round(a) + 1; return make(n, n, (y, x) => x * x + y * y <= a * a + 1e-9); }
  if (kind === 'diamond') { const n = 2 * Math.round(a) + 1; return make(n, n, (y, x) => Math.abs(x) + Math.abs(y) <= a); }
  if (kind === 'line') {
    // A line of length a at b degrees (anticlockwise from across), one pixel thick.
    const t = (b * Math.PI) / 180, hx = Math.round(((a - 1) / 2) * Math.cos(t)), hy = Math.round(((a - 1) / 2) * Math.sin(t)), r = 2 * Math.abs(hy) + 1, c = 2 * Math.abs(hx) + 1, on = new Uint8Array(r * c), steps = Math.max(r, c) * 2;
    for (let s = 0; s <= steps; s++) { const u = s / steps - 0.5, i = Math.round((r - 1) / 2 - 2 * hy * u), j = Math.round((c - 1) / 2 + 2 * hx * u); on[i + j * r] = 1; }
    return { r, c, on };
  }
  throw new Error(`strel's shapes here are 'disk', 'square', 'rectangle', 'diamond' and 'line', or a matrix of 1s and 0s.`);
}
/** Erosion: the smallest value under the shape (outside the picture doesn't count). */
export function erode(P: Plane, S: Nhood): Plane { return morph(P, S, false); }
/** Dilation: the largest value under the shape turned half a circle. */
export function dilate(P: Plane, S: Nhood): Plane { return morph(P, S, true); }
function morph(P: Plane, S: Nhood, max: boolean): Plane {
  const o = plane(P.r, P.c), cr = Math.floor((S.r - 1) / 2), cc = Math.floor((S.c - 1) / 2), offs: [number, number][] = [];
  for (let q = 0; q < S.c; q++) for (let p = 0; p < S.r; p++) if (S.on[p + q * S.r]) offs.push(max ? [cr - p, cc - q] : [p - cr, q - cc]);
  for (let j = 0; j < P.c; j++) for (let i = 0; i < P.r; i++) {
    let v = max ? -Infinity : Infinity;
    for (const [di, dj] of offs) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= P.r || jj >= P.c) continue; const x = P.d[ii + jj * P.r]; v = max ? Math.max(v, x) : Math.min(v, x); }
    o.d[i + j * P.r] = Number.isFinite(v) ? v : max ? 0 : 1;
  }
  return o;
}
export const open = (P: Plane, S: Nhood) => dilate(erode(P, S), S);
export const close = (P: Plane, S: Nhood) => erode(dilate(P, S), S);

/** Labels joined pixels 1, 2, … in the order their first pixel is met going down each column. */
export function label(on: ArrayLike<number>, r: number, c: number, conn: 4 | 8 = 8) {
  const L = new Float64Array(r * c), q: number[] = [];
  let n = 0;
  const nb = conn === 8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let k = 0; k < r * c; k++) {
    if (!on[k] || L[k]) continue;
    L[k] = ++n; q.push(k);
    while (q.length) {
      const x = q.pop()!, i = x % r, j = (x - i) / r;
      for (const [di, dj] of nb) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= r || jj >= c) continue; const y = ii + jj * r; if (on[y] && !L[y]) { L[y] = n; q.push(y); } }
    }
  }
  return { L, n };
}
export interface Region { area: number; centroid: [number, number]; box: [number, number, number, number]; major: number; minor: number; eccentricity: number; orientation: number; diameter: number }
/** Each label's area, centroid [x y], bounding box, and the ellipse with the same second moments. */
export function regions(L: ArrayLike<number>, r: number, c: number): Region[] {
  let n = 0;
  for (let k = 0; k < L.length; k++) if (L[k] > n) n = L[k];
  const A = new Float64Array(n + 1), sx = new Float64Array(n + 1), sy = new Float64Array(n + 1);
  const lo = Array.from({ length: n + 1 }, () => [Infinity, Infinity]), hi = Array.from({ length: n + 1 }, () => [-Infinity, -Infinity]);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { const l = L[i + j * r]; if (l < 1) continue; A[l]++; sx[l] += j + 1; sy[l] += i + 1; lo[l] = [Math.min(lo[l][0], j + 1), Math.min(lo[l][1], i + 1)]; hi[l] = [Math.max(hi[l][0], j + 1), Math.max(hi[l][1], i + 1)]; }
  const xx = new Float64Array(n + 1), yy = new Float64Array(n + 1), xy = new Float64Array(n + 1);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { const l = L[i + j * r]; if (l < 1) continue; const x = j + 1 - sx[l] / A[l], y = -(i + 1 - sy[l] / A[l]); xx[l] += x * x; yy[l] += y * y; xy[l] += x * y; }
  const out: Region[] = [];
  for (let l = 1; l <= n; l++) {
    const N = A[l];
    if (!N) { out.push({ area: 0, centroid: [NaN, NaN], box: [NaN, NaN, 0, 0], major: 0, minor: 0, eccentricity: 0, orientation: 0, diameter: 0 }); continue; }
    const uxx = xx[l] / N + 1 / 12, uyy = yy[l] / N + 1 / 12, uxy = xy[l] / N, common = Math.sqrt((uxx - uyy) ** 2 + 4 * uxy * uxy);
    const major = 2 * Math.SQRT2 * Math.sqrt(uxx + uyy + common), minor = 2 * Math.SQRT2 * Math.sqrt(Math.max(0, uxx + uyy - common));
    const [num, den] = uyy > uxx ? [uyy - uxx + common, 2 * uxy] : [2 * uxy, uxx - uyy + common];
    out.push({
      area: N, centroid: [sx[l] / N, sy[l] / N], box: [lo[l][0] - 0.5, lo[l][1] - 0.5, hi[l][0] - lo[l][0] + 1, hi[l][1] - lo[l][1] + 1],
      major, minor, eccentricity: (2 * Math.sqrt(Math.max(0, (major / 2) ** 2 - (minor / 2) ** 2))) / major,
      orientation: num === 0 && den === 0 ? 0 : (Math.atan(num / den) * 180) / Math.PI, diameter: Math.sqrt((4 * N) / Math.PI),
    });
  }
  return out;
}
/** Fills holes: background that can't be reached from the picture's edge (4-connected) becomes foreground. */
export function fillHoles(on: ArrayLike<number>, r: number, c: number) {
  const seen = new Uint8Array(r * c), q: number[] = [];
  const push = (i: number, j: number) => { const k = i + j * r; if (!on[k] && !seen[k]) { seen[k] = 1; q.push(k); } };
  for (let i = 0; i < r; i++) { push(i, 0); push(i, c - 1); }
  for (let j = 0; j < c; j++) { push(0, j); push(r - 1, j); }
  while (q.length) { const k = q.pop()!, i = k % r, j = (k - i) / r; if (i > 0) push(i - 1, j); if (i < r - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < c - 1) push(i, j + 1); }
  return Uint8Array.from({ length: r * c }, (_, k) => (on[k] || !seen[k] ? 1 : 0));
}
/** Removes joined groups of fewer than p pixels. */
export function areaOpen(on: ArrayLike<number>, r: number, c: number, p: number, conn: 4 | 8 = 8) {
  const { L, n } = label(on, r, c, conn), size = new Float64Array(n + 1);
  for (const l of L) size[l]++;
  return Uint8Array.from(L, (l) => (l && size[l] >= p ? 1 : 0));
}

// ——— Tones ———
/** Histogram equalisation over 256 levels: each value to its share of the pixels at or below it. */
export function equalise(v: ArrayLike<number>) {
  const h = new Float64Array(256), n = v.length, lv = (x: number) => Math.min(255, Math.max(0, Math.round(x * 255)));
  for (let k = 0; k < n; k++) h[lv(v[k])]++;
  const cdf = new Float64Array(256);
  let s = 0;
  for (let i = 0; i < 256; i++) { s += h[i]; cdf[i] = s / n; }
  return Float64Array.from(v, (x) => cdf[lv(x)]);
}
/** The values 1% from each end (contrast-stretch limits). */
export function stretchLimits(v: ArrayLike<number>, tol = 0.01): [number, number] {
  const s = Float64Array.from(v).sort(), n = s.length, lo = s[Math.min(n - 1, Math.floor(tol * n))], hi = s[Math.max(0, Math.ceil((1 - tol) * n) - 1)];
  return hi > lo ? [lo, hi] : [0, 1];
}
export const psnr = (a: ArrayLike<number>, b: ArrayLike<number>, peak = 1) => { let m = 0; for (let k = 0; k < a.length; k++) m += (a[k] - b[k]) ** 2; m /= a.length; return 10 * Math.log10((peak * peak) / m); };
/** Structural similarity (Wang et al.): means, spreads and their link in an 11 × 11 Gaussian window (σ 1.5). */
export function ssim(A: Plane, B: Plane, range = 1) {
  const K = gaussian(11, 11, 1.5), f = (P: Plane) => filter(P, K, 'replicate'), n = A.r * A.c, sq = (P: Plane, Q: Plane) => plane(P.r, P.c, P.d.map((v, k) => v * Q.d[k]));
  const ma = f(A), mb = f(B), saa = f(sq(A, A)), sbb = f(sq(B, B)), sab = f(sq(A, B)), C1 = (0.01 * range) ** 2, C2 = (0.03 * range) ** 2, map = plane(A.r, A.c);
  let s = 0;
  for (let k = 0; k < n; k++) {
    const a = ma.d[k], b = mb.d[k], va = saa.d[k] - a * a, vb = sbb.d[k] - b * b, cv = sab.d[k] - a * b;
    map.d[k] = ((2 * a * b + C1) * (2 * cv + C2)) / ((a * a + b * b + C1) * (va + vb + C2)); s += map.d[k];
  }
  return { value: s / n, map };
}

// ——— Test pictures ———
/** The modified Shepp–Logan head (Toft's contrast), n × n, values 0…1. */
export function phantom(n = 256): Plane {
  const E = [[1, 0.69, 0.92, 0, 0, 0], [-0.8, 0.6624, 0.874, 0, -0.0184, 0], [-0.2, 0.11, 0.31, 0.22, 0, -18], [-0.2, 0.16, 0.41, -0.22, 0, 18], [0.1, 0.21, 0.25, 0, 0.35, 0], [0.1, 0.046, 0.046, 0, 0.1, 0], [0.1, 0.046, 0.046, 0, -0.1, 0], [0.1, 0.046, 0.023, -0.08, -0.605, 0], [0.1, 0.023, 0.023, 0, -0.606, 0], [0.1, 0.023, 0.046, 0.06, -0.605, 0]];
  const o = plane(n, n), at = (k: number) => (n > 1 ? (k - (n - 1) / 2) / ((n - 1) / 2) : 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = at(j), y = -at(i);
    let v = 0;
    for (const [A, a, b, x0, y0, phi] of E) { const t = (phi * Math.PI) / 180, u = (x - x0) * Math.cos(t) + (y - y0) * Math.sin(t), w = (y - y0) * Math.cos(t) - (x - x0) * Math.sin(t); if ((u * u) / (a * a) + (w * w) / (b * b) <= 1) v += A; }
    o.d[i + j * n] = v;
  }
  return o;
}
/** A checkerboard of n-pixel squares, 2p × 2q of them; the right half's light squares grey (0.7). */
export function checkerboard(n = 10, p = 4, q = p): Plane {
  const r = 2 * p * n, c = 2 * q * n, o = plane(r, c);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { const ti = Math.floor(i / n), tj = Math.floor(j / n); o.d[i + j * r] = (ti + tj) % 2 ? (tj >= q ? 0.7 : 1) : 0; }
  return o;
}
