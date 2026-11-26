// Hyperion's geoscience (M498, the owner's list, group 7: "seismic and map data"): seismograms (P and S waves as Ricker
// wavelets), picking arrivals (STA/LTA and Maeda's AIC picker), locating a quake from stations' arrival times (Geiger's
// method: Gauss–Newton with Levenberg–Marquardt damping), local magnitude (Hutton and Boore), distances and bearings on
// the globe (great circle; Vincenty on an ellipsoid), map projections (Mercator, equirectangular, Lambert azimuthal
// equal-area, orthographic; UTM by Krüger's series on WGS84, to n³: round trips within a millimetre), and terrain (fractal relief, slope, aspect, hillshade).
// Pure: randomness comes in as a function.
import { levenbergMarquardt } from './optim';

export type Rand = () => number;
const gauss = (rand: Rand) => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const RAD = Math.PI / 180;
export const EARTH_R = 6371.0088; // km, the mean radius
export const WGS84: [number, number] = [6378137, 0.0818191908426215];

// ——— Seismic ———
/** A Ricker (Mexican-hat) wavelet of peak frequency f at time t. */
export const ricker = (t: number, f: number) => { const a = (Math.PI * f * t) ** 2; return (1 - 2 * a) * Math.exp(-a); };
/** A seismogram at `dist` km: P at dist/vp, S at dist/vs (larger, lower), decaying coda, noise. */
export function seismogram(dist: number, fs: number, T: number, rand: Rand, o: { vp?: number; vs?: number; origin?: number; noise?: number; amp?: number } = {}) {
  const vp = o.vp ?? 6, vs = o.vs ?? 3.5, t0 = o.origin ?? 5, tp = t0 + dist / vp, ts = t0 + dist / vs, A = (o.amp ?? 1) / Math.max(1, dist / 10);
  const n = Math.round(T * fs), x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let v = 0;
    if (t > tp - 0.2) v += A * (ricker(t - tp - 0.1, 8) + 0.5 * Math.exp(-(t - tp) / 2) * Math.sin(2 * Math.PI * 6 * (t - tp)) * (t > tp ? 1 : 0));
    if (t > ts - 0.4) v += 2.5 * A * (ricker(t - ts - 0.2, 3) + 0.6 * Math.exp(-(t - ts) / 4) * Math.sin(2 * Math.PI * 2.5 * (t - ts)) * (t > ts ? 1 : 0));
    x[i] = v + (o.noise ?? 0.02) * gauss(rand);
  }
  return { x, tp, ts };
}
/** The short-term over long-term average of the energy (classic STA/LTA, trailing windows). */
export function staLta(x: ArrayLike<number>, fs: number, sta = 0.5, lta = 10) {
  const ns = Math.max(1, Math.round(sta * fs)), nl = Math.max(ns + 1, Math.round(lta * fs)), n = x.length, r = new Float64Array(n), c = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) c[i + 1] = c[i] + x[i] * x[i];
  for (let i = nl; i < n; i++) { const s = (c[i + 1] - c[i + 1 - ns]) / ns, l = (c[i + 1] - c[i + 1 - nl]) / nl; r[i] = l > 0 ? s / l : 0; }
  return r;
}
/** Maeda's AIC picker over a window: the sample where the series splits best into a quiet part and a loud part. */
export function aicPick(x: ArrayLike<number>, from = 0, to = x.length) {
  const n = to - from;
  let best = from + 1, bestA = Infinity;
  // Running sums make it O(n).
  const c1 = new Float64Array(n + 1), c2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { c1[i + 1] = c1[i] + x[from + i]; c2[i + 1] = c2[i] + x[from + i] ** 2; }
  const varOf = (a: number, b: number) => { const k = b - a, m = (c1[b] - c1[a]) / k; return Math.max(1e-300, (c2[b] - c2[a]) / k - m * m); };
  for (let k = 2; k < n - 2; k++) { const A = k * Math.log(varOf(0, k)) + (n - k - 1) * Math.log(varOf(k, n)); if (A < bestA) { bestA = A; best = from + k; } }
  return best;
}
/** The first onset: where STA/LTA first passes `on`, refined by AIC in the seconds around it. */
export function pick(x: ArrayLike<number>, fs: number, o: { sta?: number; lta?: number; on?: number } = {}) {
  const r = staLta(x, fs, o.sta ?? 0.5, o.lta ?? 10), on = o.on ?? 4;
  const i = r.findIndex((v) => v >= on);
  if (i < 0) return NaN;
  const from = Math.max(0, i - Math.round(2 * fs)), to = Math.min(x.length, i + Math.round(0.5 * fs));
  return aicPick(x, from, to) / fs;
}

/** Epicentre (x, y km on a flat map), origin time and, if asked, depth from P arrival times at stations, uniform speed vp. */
export function locate(st: number[][], tp: number[], vp: number, o: { depth?: boolean; guess?: number[] } = {}) {
  const depth = o.depth ?? false, n = st.length;
  const cx = st.reduce((s, p) => s + p[0], 0) / n, cy = st.reduce((s, p) => s + p[1], 0) / n;
  const first = tp.indexOf(Math.min(...tp));
  const x0 = o.guess ?? [st[first][0] * 0.7 + cx * 0.3, st[first][1] * 0.7 + cy * 0.3, Math.min(...tp) - 1, ...(depth ? [10] : [])];
  const resid = (p: number[]) => st.map((s, i) => p[2] + Math.hypot(s[0] - p[0], s[1] - p[1], depth ? p[3] : 0) / vp - tp[i]);
  const r = levenbergMarquardt(resid, x0, { maxIter: 300, ...(depth ? { lb: [-Infinity, -Infinity, -Infinity, 0], ub: [Infinity, Infinity, Infinity, 700] } : {}) });
  const res = resid(r.x);
  return { x: r.x[0], y: r.x[1], t0: r.x[2], depth: depth ? r.x[3] : 0, rms: Math.sqrt(res.reduce((s, v) => s + v * v, 0) / n), residuals: res };
}
/** Distance from S − P time: d = Δt vp vs / (vp − vs). */
export const spDistance = (dt: number, vp = 6, vs = 3.5) => (dt * vp * vs) / (vp - vs);
/** Local magnitude (Hutton and Boore 1987): ML = log10 A + 1.11 log10(r/100) + 0.00189 (r − 100) + 3, A in mm
 * (Wood–Anderson), r km: 1 mm at 100 km is ML 3, Richter's own anchor. */
export const localMagnitude = (ampMm: number, r: number) => Math.log10(ampMm) + 1.11 * Math.log10(r / 100) + 0.00189 * (r - 100) + 3;

// ——— The globe ———
/** Great-circle angle (degrees) between two points, by the haversine (good at any distance). */
export function arc(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dp = p2 - p1, dl = (lon2 - lon1) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / RAD;
}
/** The initial bearing from point 1 to point 2, degrees clockwise from north (0–360). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD) + 360) % 360;
}
/** The point reached going `arcDeg` along the great circle from (lat, lon) at bearing az. */
export function destination(lat: number, lon: number, arcDeg: number, az: number): [number, number] {
  const p = lat * RAD, d = arcDeg * RAD, a = az * RAD;
  const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(a));
  const l2 = lon * RAD + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2));
  return [p2 / RAD, ((((l2 / RAD + 540) % 360) + 360) % 360) - 180];
}
/** Vincenty's inverse formula on an ellipsoid [a e]: the distance in a's units (NaN if it does not converge, for
 * nearly antipodal points). */
export function vincenty(lat1: number, lon1: number, lat2: number, lon2: number, [a, e]: [number, number] = WGS84) {
  const f = 1 - Math.sqrt(1 - e * e), b = a * (1 - f), L = (lon2 - lon1) * RAD;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * RAD)), U2 = Math.atan((1 - f) * Math.tan(lat2 * RAD));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, prev = 0, sS = 0, cS = 0, sig = 0, ca2 = 0, c2m = 0;
  for (let i = 0; i < 200; i++) {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sS === 0) return 0;
    cS = sU1 * sU2 + cU1 * cU2 * cl; sig = Math.atan2(sS, cS);
    const sa = (cU1 * cU2 * sl) / sS; ca2 = 1 - sa * sa;
    c2m = ca2 ? cS - (2 * sU1 * sU2) / ca2 : 0;
    const C = (f / 16) * ca2 * (4 + f * (4 - 3 * ca2));
    prev = lam;
    lam = L + (1 - C) * f * sa * (sig + C * sS * (c2m + C * cS * (-1 + 2 * c2m * c2m)));
    if (Math.abs(lam - prev) < 1e-13) {
      const u2 = (ca2 * (a * a - b * b)) / (b * b), A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const ds = B * sS * (c2m + (B / 4) * (cS * (-1 + 2 * c2m * c2m) - (B / 6) * c2m * (-3 + 4 * sS * sS) * (-3 + 4 * c2m * c2m)));
      return b * A * (sig - ds);
    }
  }
  return NaN;
}

// ——— Projections (unit sphere unless said; x, y in radians of the sphere's radius) ———
export type Projection = 'mercator' | 'equirectangular' | 'lambert' | 'orthographic';
/** Forward projection about the centre (lat0, lon0); orthographic points on the far side are NaN. */
export function project(kind: Projection, lat: number, lon: number, lat0 = 0, lon0 = 0): [number, number] {
  const p = lat * RAD, l = ((((lon - lon0 + 540) % 360) + 360) % 360 - 180) * RAD, p0 = lat0 * RAD;
  if (kind === 'mercator') return [l, Math.log(Math.tan(Math.PI / 4 + Math.max(-1.5, Math.min(1.5, p)) / 2))];
  if (kind === 'equirectangular') return [l * Math.cos(p0), p];
  const c = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  if (kind === 'orthographic') return c < 0 ? [NaN, NaN] : [Math.cos(p) * Math.sin(l), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)];
  const k = Math.sqrt(2 / (1 + c));
  return [k * Math.cos(p) * Math.sin(l), k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l))];
}

/** UTM (Transverse Mercator, k0 = 0.9996) on WGS84 by Krüger's series to n³ (about a millimetre inside a zone). */
export function toUtm(lat: number, lon: number, zone = Math.floor((lon + 180) / 6) + 1) {
  const [a, e] = WGS84, f = 1 - Math.sqrt(1 - e * e), n = f / (2 - f), A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64), k0 = 0.9996;
  const al = [n / 2 - (2 / 3) * n * n + (5 / 16) * n ** 3, (13 / 48) * n * n - (3 / 5) * n ** 3, (61 / 240) * n ** 3];
  const p = lat * RAD, l = (lon - (zone * 6 - 183)) * RAD, en = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - en * Math.atanh(en * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(l)), eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  al.forEach((c, j) => { const k = 2 * (j + 1); E += c * Math.cos(k * xi) * Math.sinh(k * eta); N += c * Math.sin(k * xi) * Math.cosh(k * eta); });
  return { e: 500000 + k0 * A * E, n: (lat < 0 ? 10_000_000 : 0) + k0 * A * N, zone };
}
export function fromUtm(E: number, N: number, zone: number, south = false) {
  const [a, e] = WGS84, f = 1 - Math.sqrt(1 - e * e), n = f / (2 - f), A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64), k0 = 0.9996;
  const be = [n / 2 - (2 / 3) * n * n + (37 / 96) * n ** 3, (1 / 48) * n * n + (1 / 15) * n ** 3, (17 / 480) * n ** 3];
  const de = [2 * n - (2 / 3) * n * n - 2 * n ** 3, (7 / 3) * n * n - (8 / 5) * n ** 3, (56 / 15) * n ** 3];
  const xi = (N - (south ? 10_000_000 : 0)) / (k0 * A), eta = (E - 500000) / (k0 * A);
  let x1 = xi, e1 = eta;
  be.forEach((c, j) => { const k = 2 * (j + 1); x1 -= c * Math.sin(k * xi) * Math.cosh(k * eta); e1 -= c * Math.cos(k * xi) * Math.sinh(k * eta); });
  const chi = Math.asin(Math.sin(x1) / Math.cosh(e1));
  let p = chi;
  de.forEach((c, j) => { p += c * Math.sin(2 * (j + 1) * chi); });
  return { lat: p / RAD, lon: zone * 6 - 183 + Math.atan2(Math.sinh(e1), Math.cos(x1)) / RAD };
}

// ——— Terrain ———
/** Fractal relief by the diamond-square method on a (2^k + 1)² grid; roughness H (0–1: smaller is rougher). */
export function fractalTerrain(k: number, H: number, rand: Rand, relief = 1000) {
  const n = 2 ** k + 1, z = new Float64Array(n * n), at = (i: number, j: number) => i * n + j;
  let step = n - 1, scale = relief;
  for (const [i, j] of [[0, 0], [0, n - 1], [n - 1, 0], [n - 1, n - 1]]) z[at(i, j)] = (rand() - 0.5) * scale;
  while (step > 1) {
    const h = step / 2;
    for (let i = h; i < n; i += step) for (let j = h; j < n; j += step) z[at(i, j)] = (z[at(i - h, j - h)] + z[at(i - h, j + h)] + z[at(i + h, j - h)] + z[at(i + h, j + h)]) / 4 + (rand() - 0.5) * scale;
    for (let i = 0; i < n; i += h) for (let j = (i / h) % 2 ? 0 : h; j < n; j += step) {
      let s = 0, c = 0;
      for (const [di, dj] of [[-h, 0], [h, 0], [0, -h], [0, h]]) { const a = i + di, b = j + dj; if (a >= 0 && a < n && b >= 0 && b < n) { s += z[at(a, b)]; c++; } }
      z[at(i, j)] = s / c + (rand() - 0.5) * scale;
    }
    step = h; scale *= 2 ** -H;
  }
  return Array.from({ length: n }, (_, i) => Array.from(z.subarray(i * n, (i + 1) * n)));
}
/** Slope (degrees) and aspect (degrees clockwise from north, the way the ground faces) by central differences; rows run
 * north to south (row 1 at the top), columns west to east, cell size in the heights' units. */
export function slopeAspect(Z: number[][], cell: number) {
  const r = Z.length, c = Z[0].length, S: number[][] = [], A: number[][] = [];
  for (let i = 0; i < r; i++) {
    const s: number[] = [], a: number[] = [];
    for (let j = 0; j < c; j++) {
      const dzdx = (Z[i][Math.min(c - 1, j + 1)] - Z[i][Math.max(0, j - 1)]) / (cell * (Math.min(c - 1, j + 1) - Math.max(0, j - 1)));
      const dzdy = (Z[Math.max(0, i - 1)][j] - Z[Math.min(r - 1, i + 1)][j]) / (cell * (Math.min(r - 1, i + 1) - Math.max(0, i - 1)));
      s.push(Math.atan(Math.hypot(dzdx, dzdy)) / RAD);
      a.push(dzdx === 0 && dzdy === 0 ? NaN : ((Math.atan2(-dzdx, -dzdy) / RAD) + 360) % 360);
    }
    S.push(s); A.push(a);
  }
  return { slope: S, aspect: A };
}
/** Hillshade 0–1: the sun at azimuth az (degrees from north) and altitude alt lighting each cell. */
export function hillshade(Z: number[][], cell: number, az = 315, alt = 45) {
  const { slope, aspect } = slopeAspect(Z, cell), zen = (90 - alt) * RAD, sun = az * RAD;
  return slope.map((r, i) => r.map((s, j) => { const sl = s * RAD, as = Number.isNaN(aspect[i][j]) ? 0 : aspect[i][j] * RAD; return Math.max(0, Math.cos(zen) * Math.cos(sl) + Math.sin(zen) * Math.sin(sl) * Math.cos(sun - as)); }));
}
