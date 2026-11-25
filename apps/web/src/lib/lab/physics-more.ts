// Hyperion's physics, the left-outs of M515 (M518): a rigid body's orientation (quaternions, with gravity for a top
// on a fixed point), real rays through spherical surfaces (spherical aberration, spots, colour), Schwarzschild's
// geodesics (orbits that precess, light that bends or is caught), a quantum wave packet moving in time (Crank–Nicolson)
// and the bound states of 2D and 3D potentials (LOBPCG preconditioned by the sine transform). Pure.
import { HB2M } from './physics-plus';
import { rk45 } from './sci-num';
import { symEig } from '../sim/modal';

// ——— Rigid bodies with orientation ———
export type Quat = [number, number, number, number];
const qmul = (a: number[], b: number[]): Quat => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
/** Body → space: v' = q v q*. */
export function rotate(q: number[], v: number[]) {
  const [w, x, y, z] = q;
  return [
    (1 - 2 * (y * y + z * z)) * v[0] + 2 * (x * y - w * z) * v[1] + 2 * (x * z + w * y) * v[2],
    2 * (x * y + w * z) * v[0] + (1 - 2 * (x * x + z * z)) * v[1] + 2 * (y * z - w * x) * v[2],
    2 * (x * z - w * y) * v[0] + 2 * (y * z + w * x) * v[1] + (1 - 2 * (x * x + y * y)) * v[2],
  ];
}
const unrotate = (q: number[], v: number[]) => rotate([q[0], -q[1], -q[2], -q[3]], v);
/** Principal moments I, body rates ω0, start orientation q0 (scalar first). `mgl`: a top on a fixed point, its centre
 * of mass l along the body's third axis, gravity down the space z. Reports at `at`: ω (body), q, the third axis in
 * space, L in space and the energy. */
export function spinBody(I: number[], w0: number[], q0: number[], at: number[], mgl = 0) {
  const f = (_: number, y: number[]) => {
    const w = y.slice(0, 3), q = y.slice(3), nq = Math.hypot(...q), qq = q.map((v) => v / nq);
    let tq = [0, 0, 0];
    if (mgl) { const d = unrotate(qq, [0, 0, -1]); tq = [-mgl * d[1], mgl * d[0], 0]; } // l e3 × (−mg ẑ in body)
    const dw = [(tq[0] + (I[1] - I[2]) * w[1] * w[2]) / I[0], (tq[1] + (I[2] - I[0]) * w[2] * w[0]) / I[1], (tq[2] + (I[0] - I[1]) * w[0] * w[1]) / I[2]];
    const dq = qmul(qq, [0, ...w]).map((v) => v / 2);
    return [...dw, ...dq];
  };
  const n0 = Math.hypot(...q0), r = rk45(f, at[0], at[at.length - 1], [...w0, ...q0.map((v) => v / n0)], 1e-11, 1e-13, 2_000_000, { at });
  const q = r.y.map((y) => { const s = y.slice(3), n = Math.hypot(...s); return s.map((v) => v / n) as Quat; });
  const w = r.y.map((y) => y.slice(0, 3));
  const axis = q.map((qq) => rotate(qq, [0, 0, 1]));
  const L = q.map((qq, i) => rotate(qq, w[i].map((v, j) => I[j] * v)));
  const energy = w.map((ww, i) => 0.5 * ww.reduce((s, v, j) => s + I[j] * v * v, 0) + mgl * axis[i][2]);
  return { t: r.t, w, q, axis, L, energy };
}

// ——— Real rays through spherical surfaces ———
export interface Surface { R: number; t: number; n: number; V?: number }
const LD = 587.56, LF = 486.13, LC = 656.27;
/** n(λ) from the d-line index and Abbe number (Cauchy's two terms); no Abbe number: the same at every λ. */
export function indexAt(s: Surface, lambda: number) {
  if (!s.V || s.n === 1) return s.n;
  const B = (s.n - 1) / s.V / (1 / LF ** 2 - 1 / LC ** 2);
  return s.n - B / LD ** 2 + B / lambda ** 2;
}
export interface Ray { p: number[]; d: number[] }
/** Each surface's vertex sits on the axis (z) after the previous one's thickness; the first at z = 0, light from −z.
 * Exact Snell's law in vector form. Returns each ray where it leaves the last surface (null if it misses a surface or
 * is totally reflected), and the last vertex's z. */
export function traceSurfaces(S: Surface[], rays: Ray[], lambda = LD, aperture = Infinity, paths?: number[][][]) {
  let zv = 0, n1 = 1;
  const out: (Ray | null)[] = rays.map((r) => ({ p: [...r.p], d: [...r.d] }));
  if (paths) rays.forEach((r, i) => { paths[i] = [[...r.p]]; });
  for (let k = 0; k < S.length; k++) {
    const s = S[k], n2 = indexAt(s, lambda);
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      if (!r) continue;
      let t: number, N: number[];
      if (!Number.isFinite(s.R)) { t = (zv - r.p[2]) / r.d[2]; N = [0, 0, -1]; }
      else {
        const c = [0, 0, zv + s.R], o = r.p.map((v, j) => v - c[j]), b = o.reduce((a, v, j) => a + v * r.d[j], 0), cc = o.reduce((a, v) => a + v * v, 0) - s.R * s.R, disc = b * b - cc;
        if (disc < 0) { out[i] = null; continue; }
        // The intersection on the vertex's side of the sphere.
        t = s.R > 0 ? -b - Math.sqrt(disc) : -b + Math.sqrt(disc);
        const p = r.p.map((v, j) => v + t * r.d[j]);
        N = p.map((v, j) => (v - c[j]) / s.R); // turned to face the ray below
      }
      if (!(t > -1e-9)) { out[i] = null; continue; }
      const p = r.p.map((v, j) => v + t * r.d[j]);
      if (k === 0 && Math.hypot(p[0], p[1]) > aperture) { out[i] = null; continue; } // the stop is the first surface
      let cosi = -N.reduce((a, v, j) => a + v * r.d[j], 0);
      if (cosi < 0) { N = N.map((v) => -v); cosi = -cosi; }
      const mu = n1 / n2, kk = 1 - mu * mu * (1 - cosi * cosi);
      if (kk < 0) { out[i] = null; continue; }
      const d = r.d.map((v, j) => mu * v + (mu * cosi - Math.sqrt(kk)) * N[j]), nd = Math.hypot(...d);
      out[i] = { p, d: d.map((v) => v / nd) };
      paths?.[i].push(p);
    }
    n1 = n2;
    if (k < S.length - 1) zv += s.t;
  }
  return { rays: out, zLast: zv };
}
/** Where a ray parallel to the axis at height h crosses it, from the last vertex (the paraxial one for h → 0). */
export function axisCrossing(S: Surface[], h: number, lambda = LD) {
  const r = traceSurfaces(S, [{ p: [0, h, -1], d: [0, 0, 1] }], lambda).rays[0];
  if (!r || Math.abs(r.d[1]) < 1e-15) return NaN;
  const t = -r.p[1] / r.d[1];
  return r.p[2] + t * r.d[2] - traceSurfaces(S, [], lambda).zLast;
}
export const paraxialFocus = (S: Surface[], aperture: number, lambda = LD) => axisCrossing(S, aperture * 1e-5, lambda);
/** Rays filling a circular pupil of radius a at the first vertex, at field angle θ (radians, in the y–z plane); where
 * they land on a plane `zi` after the last vertex. */
export function spot(S: Surface[], a: number, theta: number, zi: number, rings = 8, lambda = LD) {
  const rays: Ray[] = [{ p: [0, 0, -1], d: [0, Math.sin(theta), Math.cos(theta)] }];
  for (let r = 1; r <= rings; r++) for (let k = 0; k < 6 * r; k++) { const ang = (2 * Math.PI * k) / (6 * r), rad = (a * r) / rings; rays.push({ p: [rad * Math.cos(ang), rad * Math.sin(ang) - Math.tan(theta), -1], d: [0, Math.sin(theta), Math.cos(theta)] }); }
  const tr = traceSurfaces(S, rays, lambda), z = tr.zLast + zi, pts: number[][] = [];
  for (const r of tr.rays) if (r && r.d[2] > 0) { const t = (z - r.p[2]) / r.d[2]; pts.push([r.p[0] + t * r.d[0], r.p[1] + t * r.d[1]]); }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { pts, centroid: [cx, cy], rms: Math.sqrt(pts.reduce((s, p) => s + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / pts.length), lost: rays.length - pts.length };
}

// ——— Schwarzschild's geodesics (G = c = 1, lengths in units of the mass M) ———
/** A bound orbit between the turning points rp and ra (in M): u'' = 1/L² − u + 3u² (u = M/r, against φ). Returns the
 * path, the perihelion angles and the shift per orbit; `plunge` when it falls inside the horizon. */
export function schwarzschildOrbit(rp: number, ra: number, orbits: number, per = 720) {
  const u1 = 1 / rp, u2 = 1 / ra, iL2 = (u1 + u2) / 2 - (u1 * u1 + u1 * u2 + u2 * u2);
  // The orbit equation's cubic has roots u2 < u1 < u3 with u1 + u2 + u3 = 1/2: a bound orbit needs u3 above u1.
  if (!(iL2 > 0 && ra >= rp && 0.5 - 2 * u1 - u2 > 0)) throw new Error('No bound orbit has those turning points: too close in, it would fall (no orbit keeps a perihelion inside 4 M, nor a circular one inside 6 M).');
  const f = (_: number, y: number[]) => (y[0] > 0.6 ? [0, 0] : [y[1], iL2 - y[0] + 3 * y[0] * y[0]]); // frozen once inside the horizon (u > 1/2)
  const end = 2 * Math.PI * orbits * 1.2, at = Array.from({ length: Math.ceil(orbits * 1.2 * per) + 1 }, (_, i) => (end * i) / Math.ceil(orbits * 1.2 * per));
  const r = rk45(f, 0, end, [u1, 0], 1e-10, 1e-15 * u1, 2_000_000, { at });
  const peri: number[] = [];
  let plunge = false, last = r.t.length;
  for (let i = 1; i < r.t.length; i++) {
    if (r.y[i][0] > 0.5) { plunge = true; last = i; break; }
    // du/dφ goes from + to − at a perihelion: interpolate the zero.
    if (r.y[i - 1][1] > 0 && r.y[i][1] <= 0) peri.push(r.t[i - 1] + (r.t[i] - r.t[i - 1]) * (r.y[i - 1][1] / (r.y[i - 1][1] - r.y[i][1])));
  }
  const phi = r.t.slice(0, last), rr = r.y.slice(0, last).map((y) => 1 / y[0]);
  const shift = peri.length ? (peri[peri.length - 1]) / peri.length - 2 * Math.PI : NaN;
  return { phi, r: rr, x: phi.map((p, i) => rr[i] * Math.cos(p)), y: phi.map((p, i) => rr[i] * Math.sin(p)), perihelia: peri, shift, weak: (6 * Math.PI) / ((2 * rp * ra) / (rp + ra)), L: 1 / Math.sqrt(iL2), plunge };
}
/** Light from far away at impact parameter b (in M): u'' = −u + 3u². Captured when b < 3√3; else the deflection. */
export function lightRay(b: number, per = 2000) {
  const f = (_: number, y: number[]) => (y[0] > 0.6 ? [0, 0] : [y[1], -y[0] + 3 * y[0] * y[0]]);
  const end = 4 * Math.PI, at = Array.from({ length: per + 1 }, (_, i) => (end * i) / per);
  const r = rk45(f, 0, end, [0, 1 / b], 1e-10, 1e-14 / b, 2_000_000, { at });
  let last = r.t.length, captured = false, out = NaN;
  for (let i = 1; i < r.t.length; i++) {
    if (r.y[i][0] > 0.5) { captured = true; last = i; break; }
    if (r.y[i][0] <= 0) { out = r.t[i - 1] + (r.t[i] - r.t[i - 1]) * (r.y[i - 1][0] / (r.y[i - 1][0] - r.y[i][0])); last = i; break; }
  }
  const phi = r.t.slice(1, last), rr = r.y.slice(1, last).map((y) => 1 / y[0]);
  return { phi, x: phi.map((p, i) => rr[i] * Math.cos(p)), y: phi.map((p, i) => rr[i] * Math.sin(p)), captured, deflection: captured ? NaN : out - Math.PI, weak: 4 / b };
}
export const G_NEWTON = 6.6743e-11;
/** The perihelion advance per orbit (radians) of a body with semi-major axis a (m) and eccentricity e round mass M (kg). */
export const perihelionShift = (a: number, e: number, M: number) => (6 * Math.PI * G_NEWTON * M) / (299_792_458 ** 2 * a * (1 - e * e));

// ——— A wave packet in time ———
export const HBAR_EVFS = 0.6582119569;
/** Crank–Nicolson on a grid in nm (ψ = 0 beyond it), V in eV, times in fs: (1 + iHΔt/2ħ)ψⁿ⁺¹ = (1 − iHΔt/2ħ)ψⁿ.
 * Starts as a Gaussian at x0 with width σ (of |ψ|²'s spread: ψ ∝ exp(−(x − x0)²/4σ² + i k0 x)). Frames at `frames`. */
export function wavePacket(x: number[], V: number[], mass: number, x0: number, k0: number, sigma: number, frames: number[], dt: number) {
  const n = x.length, h = x[1] - x[0], c = HB2M / mass / (h * h), a = dt / (2 * HBAR_EVFS);
  let re = new Float64Array(n), im = new Float64Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) { const g = Math.exp(-((x[i] - x0) ** 2) / (4 * sigma * sigma)); re[i] = g * Math.cos(k0 * x[i]); im[i] = g * Math.sin(k0 * x[i]); norm += g * g * h; }
  const s = 1 / Math.sqrt(norm);
  for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; }
  // Left side: diag 1 + i a (V + 2c), off −i a c. Thomas' algorithm in complex arithmetic (pre-factored once).
  const offR = 0, offI = -a * c, cpR = new Float64Array(n), cpI = new Float64Array(n), dR = new Float64Array(n), dI = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let br = 1, bi = a * (V[i] + 2 * c);
    if (i > 0) { const mr = offR * cpR[i - 1] - offI * cpI[i - 1], mi = offR * cpI[i - 1] + offI * cpR[i - 1]; br -= mr; bi -= mi; }
    dR[i] = br; dI[i] = bi;
    const den = br * br + bi * bi; cpR[i] = (offR * br + offI * bi) / den; cpI[i] = (offI * br - offR * bi) / den;
  }
  const out: number[][] = [], ts: number[] = [];
  let t = 0, f = 0;
  const rr = new Float64Array(n), ri = new Float64Array(n);
  const snap = () => { out.push(Array.from(re, (v, i) => v * v + im[i] * im[i])); ts.push(t); f++; };
  while (f < frames.length && frames[f] <= t + 1e-12) snap();
  while (f < frames.length) {
    // Right side: (1 − i a H) ψ.
    for (let i = 0; i < n; i++) {
      const Hr = (V[i] + 2 * c) * re[i] - c * ((i > 0 ? re[i - 1] : 0) + (i < n - 1 ? re[i + 1] : 0)), Hi = (V[i] + 2 * c) * im[i] - c * ((i > 0 ? im[i - 1] : 0) + (i < n - 1 ? im[i + 1] : 0));
      rr[i] = re[i] + a * Hi; ri[i] = im[i] - a * Hr;
    }
    for (let i = 0; i < n; i++) {
      let yr = rr[i], yi = ri[i];
      if (i > 0) { yr -= offR * rr[i - 1] - offI * ri[i - 1]; yi -= offR * ri[i - 1] + offI * rr[i - 1]; }
      const den = dR[i] * dR[i] + dI[i] * dI[i]; rr[i] = (yr * dR[i] + yi * dI[i]) / den; ri[i] = (yi * dR[i] - yr * dI[i]) / den;
    }
    for (let i = n - 2; i >= 0; i--) { rr[i] -= cpR[i] * rr[i + 1] - cpI[i] * ri[i + 1]; ri[i] -= cpR[i] * ri[i + 1] + cpI[i] * rr[i + 1]; }
    [re, im] = [Float64Array.from(rr), Float64Array.from(ri)];
    t += dt;
    while (f < frames.length && frames[f] <= t + 1e-9) snap();
  }
  return { t: ts, prob: out };
}

// ——— Bound states in 2D and 3D ———
/** The lowest `count` states of −(ħ²/2m)∇²ψ + Vψ = Eψ on a grid (ψ = 0 beyond it). dims = sizes along each axis
 * (the first varies fastest), V flattened the same way. LOBPCG (Knyazev 2001) with the exact inverse of
 * (−(ħ²/2m)∇² + mean V) as preconditioner, applied by sine transforms along each axis. */
export function boundStates(dims: number[], h: number[], V: Float64Array, mass: number, count: number, tol = 1e-6, maxIt = 300) {
  const n = dims.reduce((s, x) => s * x, 1), c = h.map((hh) => HB2M / mass / (hh * hh)), stride = dims.map((_, i) => dims.slice(0, i).reduce((s, x) => s * x, 1));
  let vmin = Infinity, vsum = 0;
  for (const v of V) { if (v < vmin) vmin = v; vsum += v; }
  const shift = vsum / n - vmin;
  const H = (x: Float64Array, y: Float64Array) => {
    for (let i = 0; i < n; i++) y[i] = (V[i] - vmin + 2 * (c[0] + (c[1] ?? 0) + (c[2] ?? 0))) * x[i];
    for (let ax = 0; ax < dims.length; ax++) {
      const st = stride[ax], N = dims[ax], cc = c[ax];
      for (let i = 0; i < n; i++) { const k = Math.floor(i / st) % N; if (k > 0) y[i] -= cc * x[i - st]; if (k < N - 1) y[i] -= cc * x[i + st]; }
    }
  };
  const S = dims.map((N) => { const m = new Float64Array(N * N), s = Math.sqrt(2 / (N + 1)); for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) m[j * N + k] = s * Math.sin((Math.PI * (j + 1) * (k + 1)) / (N + 1)); return m; });
  const lam = dims.map((N, ax) => Float64Array.from({ length: N }, (_, k) => c[ax] * (2 - 2 * Math.cos((Math.PI * (k + 1)) / (N + 1)))));
  const tmp = new Float64Array(n), line = new Float64Array(Math.max(...dims));
  const sine = (x: Float64Array, ax: number) => {
    const st = stride[ax], N = dims[ax], M = S[ax];
    for (let base = 0; base < n; base++) {
      if (Math.floor(base / st) % N) continue;
      for (let j = 0; j < N; j++) line[j] = x[base + j * st];
      for (let j = 0; j < N; j++) { let s = 0; for (let k = 0; k < N; k++) s += M[j * N + k] * line[k]; tmp[base + j * st] = s; }
    }
    x.set(tmp);
  };
  const T = (x: Float64Array) => {
    for (let ax = 0; ax < dims.length; ax++) sine(x, ax);
    for (let i = 0; i < n; i++) { let l = shift + 1e-12; for (let ax = 0; ax < dims.length; ax++) l += lam[ax][Math.floor(i / stride[ax]) % dims[ax]]; x[i] /= l; }
    for (let ax = 0; ax < dims.length; ax++) sine(x, ax);
  };
  const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };
  const ortho = (vs: Float64Array[]) => {
    const out: Float64Array[] = [];
    for (const v0 of vs) {
      const v = Float64Array.from(v0), before = Math.sqrt(dot(v, v));
      for (let pass = 0; pass < 2; pass++) for (const q of out) { const p = dot(q, v); for (let i = 0; i < n; i++) v[i] -= p * q[i]; }
      const nv = Math.sqrt(dot(v, v));
      if (nv > 1e-10 * before && nv > 1e-300) { for (let i = 0; i < n; i++) v[i] /= nv; out.push(v); }
    }
    return out;
  };
  const b = Math.min(n, count + 3);
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  let X = ortho(Array.from({ length: b }, () => Float64Array.from({ length: n }, rnd)));
  let P: Float64Array[] = [], values: number[] = [], prev: number[] = [], it = 0, res: number[] = [];
  const rr = (basis: Float64Array[]) => {
    const AS = basis.map((v) => { const y = new Float64Array(n); H(v, y); return y; });
    const G = basis.map((u) => AS.map((y) => dot(u, y))), Gs = G.map((r, i) => r.map((v, j) => (v + G[j][i]) / 2));
    const e = symEig(Gs), order = e.values.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
    const C = order.slice(0, b).map((j) => basis.map((_, i) => e.vectors[i][j]));
    const comb = (vs: Float64Array[], coef: number[], from = 0) => { const y = new Float64Array(n); for (let i = from; i < vs.length; i++) { const w = coef[i]; if (w) for (let k = 0; k < n; k++) y[k] += w * vs[i][k]; } return y; };
    return { X: C.map((cf) => comb(basis, cf)), AX: C.map((cf) => comb(AS, cf)), P: C.map((cf) => comb(basis, cf, X.length)), values: order.slice(0, b).map((j) => e.values[j]) };
  };
  let r0 = rr(X);
  X = r0.X; values = r0.values;
  let AX = r0.AX;
  const scale = 4 * (c[0] + (c[1] ?? 0) + (c[2] ?? 0)) + shift + 1;
  for (; it < maxIt; it++) {
    const R = X.map((x, j) => { const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = AX[j][i] - values[j] * x[i]; return r; });
    res = R.map((r) => Math.sqrt(dot(r, r)));
    // Done when the residuals are small, or the energies (which converge as the residuals squared) have stopped moving.
    if (res.slice(0, count).every((v) => v < tol * scale) || (it > 2 && res.slice(0, count).every((v) => v < 1e-3 * scale) && values.slice(0, count).every((v, j) => Math.abs(v - prev[j]) < 1e-10 * scale))) break;
    prev = values.slice();
    const W = R.map((r) => { T(r); return r; });
    const basis = ortho([...X, ...W, ...P]);
    r0 = rr(basis);
    X = r0.X; AX = r0.AX; values = r0.values;
    P = ortho(r0.P);
  }
  return { E: values.slice(0, count).map((v) => v + vmin), psi: X.slice(0, count).map((v) => { const s = 1 / Math.sqrt(h.reduce((p, x) => p * x, 1)); return Array.from(v, (x) => x * s); }), iterations: it, residual: Math.max(...res.slice(0, count)) };
}
