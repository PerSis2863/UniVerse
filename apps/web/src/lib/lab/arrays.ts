// Hyperion's antenna arrays (M438, the owner: "steering a beam with many antennas, finding the direction a signal
// comes from"): steering vectors for elements anywhere (positions in wavelengths), the array's pattern for any
// weights, the signals the elements receive from far sources in noise, and three spatial spectra for direction
// finding: the beam scanned across (delay and sum), Capon's minimum variance (MVDR) and MUSIC (the noise subspace).
// Complex matrices are handled through their real 2N × 2N form [Re −Im; Im Re]. Our own code from the textbook methods.

import { symEigen } from './ml';

export type Pos = [number, number, number];
export interface CVec { re: number[]; im: number[] }
export interface CMat { re: number[][]; im: number[][] }
const rad = Math.PI / 180;
export const ula = (n: number, d = 0.5): Pos[] => Array.from({ length: n }, (_, k) => [0, (k - (n - 1) / 2) * d, 0]);
/** The phases a plane wave from azimuth `az` and elevation `el` (degrees) puts on each element: exp(j2π·p·u). */
export function steer(pos: Pos[], az: number, el = 0): CVec {
  const u = [Math.cos(el * rad) * Math.cos(az * rad), Math.cos(el * rad) * Math.sin(az * rad), Math.sin(el * rad)];
  const ph = pos.map((p) => 2 * Math.PI * (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]));
  return { re: ph.map(Math.cos), im: ph.map(Math.sin) };
}
/** |wᴴa(az)| at each azimuth, in dB below its largest. */
export function pattern(pos: Pos[], w: CVec, azs: number[], el = 0) {
  const g = azs.map((az) => { const a = steer(pos, az, el); let r = 0, i = 0; a.re.forEach((ar, k) => { r += w.re[k] * ar + w.im[k] * a.im[k]; i += w.re[k] * a.im[k] - w.im[k] * ar; }); return Math.hypot(r, i); });
  const top = Math.max(...g, 1e-300);
  return g.map((x) => 20 * Math.log10(Math.max(x / top, 1e-15)));
}
/** The width of the main beam between its −3 dB points (degrees), on a fine pattern. */
export function beamwidth(azs: number[], db: number[]) {
  const k = db.indexOf(Math.max(...db));
  let a = k, b = k;
  while (a > 0 && db[a] > -3) a--;
  while (b < db.length - 1 && db[b] > -3) b++;
  const at = (i: number, j: number) => azs[i] + ((-3 - db[i]) / (db[j] - db[i])) * (azs[j] - azs[i]);
  return at(b - 1, b) - at(a + 1, a);
}
const gauss = (rand: () => number) => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
/** T snapshots at the elements from far sources (each a complex Gaussian of its power) plus noise of power `noise`:
 * a T × N complex matrix, and its true covariance. */
export function sensorSignals(pos: Pos[], T: number, sources: { az: number; el?: number; power: number }[], noise: number, rand: () => number) {
  const N = pos.length, A = sources.map((s) => steer(pos, s.az, s.el ?? 0)), sd = Math.sqrt(noise / 2);
  const re = Array.from({ length: T }, () => new Array(N).fill(0)), im = Array.from({ length: T }, () => new Array(N).fill(0));
  for (let t = 0; t < T; t++) {
    sources.forEach((s, q) => {
      const a = Math.sqrt(s.power / 2), sr = a * gauss(rand), si = a * gauss(rand);
      for (let k = 0; k < N; k++) { re[t][k] += sr * A[q].re[k] - si * A[q].im[k]; im[t][k] += sr * A[q].im[k] + si * A[q].re[k]; }
    });
    for (let k = 0; k < N; k++) { re[t][k] += sd * gauss(rand); im[t][k] += sd * gauss(rand); }
  }
  const R: CMat = { re: Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? noise : 0))), im: Array.from({ length: N }, () => new Array(N).fill(0)) };
  sources.forEach((s, q) => { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = A[q]; R.re[i][j] += s.power * (a.re[i] * a.re[j] + a.im[i] * a.im[j]); R.im[i][j] += s.power * (a.im[i] * a.re[j] - a.re[i] * a.im[j]); } });
  return { X: { re, im } as CMat, R };
}
/** The sample covariance XᴴX / T of a T × N snapshot matrix. */
export function covariance(X: CMat): CMat {
  const T = X.re.length, N = X.re[0]?.length ?? 0, re = Array.from({ length: N }, () => new Array(N).fill(0)), im = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let t = 0; t < T; t++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const xr = X.re[t][i], xi = X.im[t][i], yr = X.re[t][j], yi = X.im[t][j]; re[i][j] += (xr * yr + xi * yi) / T; im[i][j] += (xi * yr - xr * yi) / T; }
  return { re, im };
}
/** The real 2N × 2N form of a complex matrix. */
const real2 = (R: CMat) => { const N = R.re.length; return Array.from({ length: 2 * N }, (_, i) => Array.from({ length: 2 * N }, (_, j) => { const a = i % N, b = j % N, top = i < N, left = j < N; return top === left ? R.re[a][b] : top ? -R.im[a][b] : R.im[a][b]; })); };
/** aᴴMa for a complex vector and a Hermitian matrix. */
function quad(R: CMat, a: CVec) {
  const N = a.re.length;
  let s = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) s += a.re[i] * (R.re[i][j] * a.re[j] - R.im[i][j] * a.im[j]) + a.im[i] * (R.re[i][j] * a.im[j] + R.im[i][j] * a.re[j]);
  return s;
}
function inverse(R: CMat): CMat {
  // Through the real form: its inverse is the real form of R⁻¹.
  const N = R.re.length, M = real2(R).map((r, i) => [...r, ...Array.from({ length: 2 * N }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < 2 * N; c++) {
    let p = c;
    for (let r = c + 1; r < 2 * N; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) throw new Error('The covariance is singular: add some noise, or more snapshots than elements.');
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 4 * N; k++) M[c][k] /= d;
    for (let r = 0; r < 2 * N; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let k = 0; k < 4 * N; k++) M[r][k] -= f * M[c][k]; }
  }
  return { re: Array.from({ length: N }, (_, i) => M[i].slice(2 * N, 3 * N)), im: Array.from({ length: N }, (_, i) => M[N + i].slice(2 * N, 3 * N)) };
}
export type Method = 'beamscan' | 'mvdr' | 'music';
/** A spatial spectrum over the azimuths (dB below its largest). MUSIC needs the number of signals. */
export function spectrum(R: CMat, pos: Pos[], azs: number[], method: Method, nsig = 1, el = 0) {
  const N = pos.length;
  let f: (a: CVec) => number;
  if (method === 'beamscan') f = (a) => quad(R, a) / (N * N);
  else if (method === 'mvdr') { const Ri = inverse(R); f = (a) => 1 / Math.max(quad(Ri, a), 1e-300); }
  else {
    // The noise subspace: the real form's 2(N − K) smallest eigenvectors (each complex one appears twice).
    const { vectors } = symEigen(real2(R)), V = vectors, cols = Array.from({ length: 2 * (N - nsig) }, (_, k) => 2 * nsig + k);
    f = (a) => {
      let s = 0;
      for (const c of cols) {
        let r = 0, i = 0;
        for (let k = 0; k < N; k++) { const vr = V[k][c], vi = V[N + k][c]; r += vr * a.re[k] + vi * a.im[k]; i += vr * a.im[k] - vi * a.re[k]; }
        s += r * r + i * i;
      }
      return 1 / Math.max(s / 2, 1e-300);
    };
  }
  const p = azs.map((az) => f(steer(pos, az, el))), top = Math.max(...p);
  return p.map((x) => 10 * Math.log10(Math.max(x / top, 1e-30)));
}
/** The K highest peaks of a spectrum (refined by a parabola through each peak and its neighbours), sorted. */
export function peaks(azs: number[], db: number[], K: number) {
  const idx: number[] = [];
  for (let i = 1; i < db.length - 1; i++) if (db[i] >= db[i - 1] && db[i] > db[i + 1]) idx.push(i);
  return idx.sort((a, b) => db[b] - db[a]).slice(0, K).map((i) => {
    const den = db[i - 1] - 2 * db[i] + db[i + 1], off = den ? (0.5 * (db[i - 1] - db[i + 1])) / den : 0;
    return azs[i] + off * (azs[i + 1] - azs[i]);
  }).sort((a, b) => a - b);
}
