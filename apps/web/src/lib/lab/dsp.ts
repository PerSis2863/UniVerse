// Hyperion: peaks, the singular value decomposition and filter design (M475, the owner, 23 Nov: "finding peaks, SVD,
// and filter design (low-pass, Butterworth)… please do this"). Pure; the language is in dsp-lab.ts.

/** Local maxima of y (plateaus count once, at their first sample), with their prominence and filtered like MATLAB's
 *  findpeaks options. Indices are 0-based; results in order of position unless sorted. */
export function findPeaks(y: number[], o: { minHeight?: number; minProminence?: number; minDistance?: number; threshold?: number; nPeaks?: number; sort?: 'none' | 'ascend' | 'descend' } = {}) {
  const n = y.length, cand: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(y[i] > y[i - 1])) continue;
    let j = i;
    while (j + 1 < n && y[j + 1] === y[i]) j++;
    if (j + 1 < n && y[j + 1] < y[i]) { if (!o.threshold || (y[i] - y[i - 1] >= o.threshold && y[i] - y[j + 1] >= o.threshold)) cand.push(i); }
    i = j;
  }
  // Prominence: how far it stands above the higher of the two lowest points between it and higher ground each side.
  const prom = (i: number) => {
    let lo = y[i], left = y[i];
    for (let k = i - 1; k >= 0 && y[k] <= y[i]; k--) left = Math.min(left, y[k]);
    let right = y[i];
    for (let k = i + 1; k < n && y[k] <= y[i]; k++) right = Math.min(right, y[k]);
    lo = Math.max(left, right);
    return y[i] - lo;
  };
  let peaks = cand.map((i) => ({ i, h: y[i], p: prom(i) }))
    .filter((q) => (o.minHeight === undefined || q.h >= o.minHeight) && (o.minProminence === undefined || q.p >= o.minProminence));
  // MinPeakDistance: the tallest win; a peak closer than the distance to a taller kept one goes.
  if (o.minDistance && o.minDistance > 0) {
    const keep: typeof peaks = [];
    for (const q of [...peaks].sort((a, b) => b.h - a.h)) if (keep.every((k) => Math.abs(k.i - q.i) >= o.minDistance!)) keep.push(q);
    peaks = keep.sort((a, b) => a.i - b.i);
  }
  if (o.sort === 'descend') peaks.sort((a, b) => b.h - a.h);
  else if (o.sort === 'ascend') peaks.sort((a, b) => a.h - b.h);
  if (o.nPeaks !== undefined) peaks = peaks.slice(0, Math.max(0, o.nPeaks));
  return peaks;
}


/**
 * The singular value decomposition A = U·S·Vᵀ by one-sided Jacobi rotations (accurate, simple): columns of A·V are
 * made orthogonal; their lengths are the singular values. Full U (m × m) is completed by Gram–Schmidt. Real matrices.
 */
export function svd(A: number[][]) {
  const m = A.length, n = A[0]?.length ?? 0, tall = m >= n;
  // Work on the tall form; a wide matrix is done through its transpose.
  const M = tall ? A.map((r) => [...r]) : A[0].map((_, j) => A.map((r) => r[j]));
  const r = M.length, c = M[0].length;
  const W = M.map((row) => [...row]), V: number[][] = Array.from({ length: c }, (_, i) => Array.from({ length: c }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < c - 1; p++) for (let q = p + 1; q < c; q++) {
      let a = 0, b = 0, g = 0;
      for (let i = 0; i < r; i++) { a += W[i][p] ** 2; b += W[i][q] ** 2; g += W[i][p] * W[i][q]; }
      if (Math.abs(g) <= 1e-15 * Math.sqrt(a * b)) continue;
      off = Math.max(off, Math.abs(g) / Math.sqrt(a * b));
      const zeta = (b - a) / (2 * g), t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta)), cs = 1 / Math.sqrt(1 + t * t), sn = cs * t;
      for (let i = 0; i < r; i++) { const x = W[i][p], y = W[i][q]; W[i][p] = cs * x - sn * y; W[i][q] = sn * x + cs * y; }
      for (let i = 0; i < c; i++) { const x = V[i][p], y = V[i][q]; V[i][p] = cs * x - sn * y; V[i][q] = sn * x + cs * y; }
    }
    if (off < 1e-15) break;
  }
  const s = Array.from({ length: c }, (_, j) => Math.sqrt(W.reduce((acc, row) => acc + row[j] ** 2, 0)));
  const order = s.map((_, j) => j).sort((x, y) => s[y] - s[x]);
  const S = order.map((j) => s[j]);
  const Vs = V.map((row) => order.map((j) => row[j]));
  // U's first columns: A·v / σ; the rest completed to an orthonormal basis.
  const U: number[][] = Array.from({ length: r }, () => new Array(r).fill(0));
  const cols: number[][] = [];
  order.forEach((j, k) => { if (S[k] > 1e-300 * (S[0] || 1) && S[k] > 0) cols.push(W.map((row) => row[j] / S[k])); });
  for (let e = 0; cols.length < r && e < r; e++) {
    const v = Array.from({ length: r }, (_, i) => (i === e ? 1 : 0));
    for (const u of cols) { const d = u.reduce((acc, x, i) => acc + x * v[i], 0); for (let i = 0; i < r; i++) v[i] -= d * u[i]; }
    const len = Math.hypot(...v);
    if (len > 1e-10) cols.push(v.map((x) => x / len));
  }
  cols.forEach((u, j) => u.forEach((x, i) => { U[i][j] = x; }));
  // Back to the original shape: A = U S Vᵀ (for a wide A the roles of U and V swap).
  return tall ? { U, S, V: Vs } : { U: Vs, S, V: U };
}

/** Polynomial coefficients (highest power first) from roots given as [re, im] pairs; the result's real part. */
function poly(roots: [number, number][]): number[] {
  let c: [number, number][] = [[1, 0]];
  for (const [rr, ri] of roots) {
    const next: [number, number][] = Array.from({ length: c.length + 1 }, () => [0, 0]);
    c.forEach(([a, b], k) => { next[k][0] += a; next[k][1] += b; next[k + 1][0] -= a * rr - b * ri; next[k + 1][1] -= a * ri + b * rr; });
    c = next;
  }
  return c.map(([a]) => a);
}

/**
 * A digital Butterworth filter of order n (MATLAB's butter): the analog prototype's poles on the left half circle,
 * pre-warped to the cut-off and moved to z by the bilinear transform. Wn is a fraction of Nyquist (0 < Wn < 1);
 * 'bandpass' and 'stop' take [w1 w2] and give order 2n. Returns { b, a } with a[0] = 1, gain 1 in the pass band.
 */
export function butter(n: number, Wn: number[], type: 'low' | 'high' | 'bandpass' | 'stop' = 'low') {
  if (!(n >= 1 && n <= 20 && Number.isInteger(n))) throw new Error('The order is a whole number from 1 to 20.');
  if (Wn.some((w) => !(w > 0 && w < 1))) throw new Error('Cut-offs are fractions of the Nyquist frequency, between 0 and 1.');
  const warp = (w: number) => 2 * Math.tan((Math.PI * w) / 2); // fs = 2
  const proto: [number, number][] = Array.from({ length: n }, (_, k) => { const th = (Math.PI * (2 * k + n + 1)) / (2 * n); return [Math.cos(th), Math.sin(th)]; });
  let sp: [number, number][] = [], sz: [number, number][] = [], gainAt: number;
  const cdiv = (a: [number, number], b: [number, number]): [number, number] => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const csqrt = ([re, im]: [number, number]): [number, number] => { const r = Math.hypot(re, im), x = Math.sqrt((r + re) / 2), y = Math.sqrt(Math.max(0, (r - re) / 2)); return [x, im < 0 ? -y : y]; };
  if (type === 'low' || type === 'high') {
    const wc = warp(Wn[0]);
    sp = proto.map((p) => (type === 'low' ? [p[0] * wc, p[1] * wc] : cdiv([wc, 0], p)));
    sz = type === 'high' ? proto.map(() => [0, 0]) : [];
    gainAt = type === 'low' ? 0 : Math.PI;
  } else {
    if (Wn.length !== 2 || !(Wn[1] > Wn[0])) throw new Error('A band needs [low high] with low < high.');
    const w1 = warp(Wn[0]), w2 = warp(Wn[1]), bw = w2 - w1, w0sq = w1 * w2;
    for (const p of proto) {
      // s → (s² + w0²) / (bw·s) for a band pass; the reverse for a stop.
      const q: [number, number] = type === 'bandpass' ? [p[0] * bw / 2, p[1] * bw / 2] : cdiv([bw / 2, 0], p);
      const d = csqrt([q[0] ** 2 - q[1] ** 2 - w0sq, 2 * q[0] * q[1]]);
      sp.push([q[0] + d[0], q[1] + d[1]], [q[0] - d[0], q[1] - d[1]]);
    }
    sz = type === 'bandpass' ? proto.map((): [number, number] => [0, 0]) : proto.flatMap((): [number, number][] => [[0, Math.sqrt(w0sq)], [0, -Math.sqrt(w0sq)]]);
    gainAt = type === 'bandpass' ? 2 * Math.atan(Math.sqrt(w0sq) / 2) : 0;
  }
  // Bilinear: z = (2 + s) / (2 − s); zeros at infinity go to z = −1.
  const bz = (s: [number, number]): [number, number] => cdiv([2 + s[0], s[1]], [2 - s[0], -s[1]]);
  const zp = sp.map(bz), zz: [number, number][] = [...sz.map(bz), ...Array.from({ length: sp.length - sz.length }, (): [number, number] => [-1, 0])];
  const a = poly(zp), b0 = poly(zz);
  // Gain 1 where the band passes.
  const at = (c: number[], w: number) => { let re = 0, im = 0; c.forEach((v, k) => { re += v * Math.cos(-w * k); im += v * Math.sin(-w * k); }); return Math.hypot(re, im); };
  const g = at(a, gainAt) / (at(b0, gainAt) || 1);
  return { b: b0.map((v) => v * g), a };
}

/** Direct-form filtering (as MATLAB's filter), with initial conditions zi. */
export function filter(b: number[], a: number[], x: number[], zi?: number[]) {
  const n = Math.max(b.length, a.length), B = [...b, ...new Array(n - b.length).fill(0)].map((v) => v / a[0]), A = [...a, ...new Array(n - a.length).fill(0)].map((v) => v / a[0]);
  const z = zi ? [...zi, 0] : new Array(n).fill(0), y = new Array(x.length);
  for (let k = 0; k < x.length; k++) {
    y[k] = B[0] * x[k] + z[0];
    for (let i = 1; i < n; i++) z[i - 1] = B[i] * x[k] + z[i] - A[i] * y[k];
  }
  return y as number[];
}

/** Steady-state initial conditions for a step (Gustafsson's lfilter_zi), so filtering doesn't start with a jump. */
function stepState(b: number[], a: number[]) {
  const n = Math.max(b.length, a.length), B = [...b, ...new Array(n - b.length).fill(0)].map((v) => v / a[0]), A = [...a, ...new Array(n - a.length).fill(0)].map((v) => v / a[0]);
  const m = n - 1;
  if (m === 0) return [];
  // (I − companion(A)ᵀ) zi = B[1:] − A[1:]·B[0]
  const M = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0) - (j === 0 ? -A[i + 1] : i === j - 1 ? 1 : 0)));
  const rhs = Array.from({ length: m }, (_, i) => B[i + 1] - A[i + 1] * B[0]);
  // Gaussian elimination (m ≤ 40).
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = c + 1; r < m; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < m; k++) M[r][k] -= f * M[c][k]; rhs[r] -= f * rhs[c]; }
  }
  const zi = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) { let s = rhs[r]; for (let k = r + 1; k < m; k++) s -= M[r][k] * zi[k]; zi[r] = s / M[r][r]; }
  return zi;
}

/** Zero-phase filtering (as MATLAB's filtfilt): forward, then backward, the ends extended by odd reflection and started
 *  in their steady state, so nothing is delayed and the edges don't ring. */
export function filtfilt(b: number[], a: number[], x: number[]) {
  const edge = 3 * (Math.max(a.length, b.length) - 1);
  if (x.length <= edge) throw new Error(`The signal needs more than ${edge} samples for this filter.`);
  const head = Array.from({ length: edge }, (_, k) => 2 * x[0] - x[edge - k]), tail = Array.from({ length: edge }, (_, k) => 2 * x[x.length - 1] - x[x.length - 2 - k]);
  const ext = [...head, ...x, ...tail], zi = stepState(b, a);
  let y = filter(b, a, ext, zi.map((v) => v * ext[0]));
  y.reverse();
  y = filter(b, a, y, zi.map((v) => v * y[0]));
  y.reverse();
  return y.slice(edge, edge + x.length);
}
