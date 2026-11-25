import { rk45 } from './sci-num';

// Hyperion's spinning black holes (M519): Kerr's geometry in Boyer–Lindquist coordinates, G = c = M = 1, spin a
// (0 ≤ |a| ≤ 1). Orbits in and out of the equator from the three constants E, Lz and Carter's Q, integrated in Mino
// time λ as second-order equations (r'' = R'(r)/2, u'' = U'(u)/2 with u = cos θ), so turning points need no sign flips.
// μ = 1 for matter, 0 for light. M520: Kerr–Newman, a charge q on the hole (a² + q² ≤ 1, Δ = r² − 2r + a² + q²) and
// a charge-to-mass ratio ε on the particle (P = E(r² + a²) − aLz − εqr); the defaults (0) give Kerr back.

/** The hole's charge q and the particle's charge per mass ε (Gaussian units, G = c = M = 1). */
export interface Charge { q?: number; eps?: number }
const chk = (a: number, q: number) => { if (!(a * a + q * q <= 1 + 1e-12)) throw new Error('a² + q² must stay at most 1 (otherwise there is no horizon).'); };

export const horizon = (a: number, q = 0) => { chk(a, q); return 1 + Math.sqrt(Math.max(0, 1 - a * a - q * q)); };
export const ergosphere = (a: number, th: number, q = 0) => 1 + Math.sqrt(Math.max(0, 1 - a * a * Math.cos(th) ** 2 - q * q));

const Rf = (r: number, a: number, E: number, L: number, Q: number, mu: number, q = 0, eps = 0) => {
  const D = r * r - 2 * r + a * a + q * q, P = E * (r * r + a * a) - a * L - eps * q * r;
  return P * P - D * (mu * r * r + (L - a * E) ** 2 + Q);
};
const dR = (r: number, a: number, E: number, L: number, Q: number, mu: number, q = 0, eps = 0) => {
  const D = r * r - 2 * r + a * a + q * q, P = E * (r * r + a * a) - a * L - eps * q * r;
  return 2 * P * (2 * E * r - eps * q) - (2 * r - 2) * (mu * r * r + (L - a * E) ** 2 + Q) - 2 * mu * r * D;
};
const Uf = (u: number, a: number, E: number, L: number, Q: number, mu: number) => Q * (1 - u * u) - u * u * (a * a * (mu - E * E) * (1 - u * u) + L * L);
const dU = (u: number, a: number, E: number, L: number, Q: number, mu: number) => -2 * u * Q - 2 * u * (a * a * (mu - E * E) * (1 - u * u) + L * L) + 2 * u ** 3 * a * a * (mu - E * E);

/** Newton on two unknowns with a numerical Jacobian; NaN when it doesn't settle. */
function newton2(F: (x: number[]) => number[], x0: number[], tol = 1e-14) {
  let x = x0.slice();
  for (let k = 0; k < 100; k++) {
    const f = F(x), h = 1e-7, J = [0, 1].map((j) => { const xp = x.slice(); xp[j] += h * (1 + Math.abs(xp[j])); const fp = F(xp); return fp.map((v, i) => (v - f[i]) / (h * (1 + Math.abs(x[j])))); });
    const det = J[0][0] * J[1][1] - J[1][0] * J[0][1];
    if (!Number.isFinite(det) || det === 0) return [NaN, NaN];
    const d0 = (f[0] * J[1][1] - f[1] * J[1][0]) / det, d1 = (J[0][0] * f[1] - J[0][1] * f[0]) / det;
    x = [x[0] - d0, x[1] - d1];
    if (Math.abs(d0) + Math.abs(d1) < tol * (1 + Math.abs(x[0]) + Math.abs(x[1]))) return x;
  }
  return x;
}

/** Energy and angular momentum (per unit mass) of a circular orbit in the equator; prograde when L > 0. Kerr's closed
 * form, otherwise Newton on R = R' = 0 stepped up from it (charge added in ten steps). */
export function circular(a: number, r: number, prograde = true, c: Charge = {}) {
  const q = c.q ?? 0, eps = c.eps ?? 0, s = prograde ? 1 : -1, sr = Math.sqrt(r), den = r ** 0.75 * Math.sqrt(r ** 1.5 - 3 * sr + 2 * s * a);
  if (!q && !eps) {
    if (!(den > 0)) throw new Error('No circular orbit there (inside the light orbit).');
    return { E: (r ** 1.5 - 2 * sr + s * a) / den, L: (s * (r * r - 2 * s * a * sr + a * a)) / den };
  }
  chk(a, q);
  // Start from a far orbit (always there), then walk in and add the charge.
  const far = Math.max(r, 30), k0 = circular(a, far, prograde);
  let x = [k0.E, k0.L];
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const f = i / steps, rr = far + (r - far) * f, qq = q * f, ee = eps;
    x = newton2((y) => [Rf(rr, a, y[0], y[1], 0, 1, qq, ee), dR(rr, a, y[0], y[1], 0, 1, qq, ee)], x);
    if (!x.every(Number.isFinite)) throw new Error('No circular orbit there (inside the light orbit).');
  }
  return { E: x[0], L: x[1] };
}
const stableAt = (a: number, r: number, pro: boolean, c: Charge) => {
  try {
    const k = circular(a, r, pro, c), h = 1e-4 * r, q = c.q ?? 0, eps = c.eps ?? 0;
    return (dR(r + h, a, k.E, k.L, 0, 1, q, eps) - dR(r - h, a, k.E, k.L, 0, 1, q, eps)) / (2 * h) < 0 && k.E > 0;
  } catch { return false; }
};
/** The innermost stable circular orbit in the equator (Bardeen, Press & Teukolsky without charge; otherwise where
 * R'' turns zero, by bisection), prograde for a > 0. */
export function isco(a: number, c: Charge = {}) {
  if (!c.q && !c.eps) {
    const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a)), z2 = Math.sqrt(3 * a * a + z1 * z1);
    return 3 + z2 - Math.sign(a) * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  }
  const pro = a >= 0, A = Math.abs(a);
  let lo = horizon(A, c.q ?? 0) * 1.0001, hi = 60;
  if (!stableAt(A, hi, pro, c)) throw new Error('No stable circular orbits.');
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (stableAt(A, m, pro, c)) hi = m; else lo = m; }
  return hi;
}
/** ξ = Lz/E and η = Q/E² of light circling at r (the spherical light orbits). */
const lightConsts = (r: number, a: number, q: number) => {
  const D = r * r - 2 * r + a * a + q * q, dD = 2 * r - 2, xi = (r * r + a * a - (4 * r * D) / dD) / a;
  return { xi, eta: (16 * r * r * D) / (dD * dD) - (xi - a) ** 2 };
};
/** The circular light orbit in the equator: prograde (a > 0) or retrograde (a < 0). */
export function photonOrbit(a: number, q = 0) {
  if (!q) return 2 * (1 + Math.cos((2 / 3) * Math.acos(-a)));
  if (Math.abs(a) < 1e-9) return (3 + Math.sqrt(9 - 8 * q * q)) / 2;
  // η = 0 at both ends of the spherical orbits: the smaller root prograde, the larger retrograde.
  const [lo, hi] = lightRange(Math.abs(a), q);
  return a > 0 ? lo : hi;
}
function lightRange(a: number, q: number) {
  const rh = horizon(a, q), n = 4000, rs: number[] = [];
  let prev = NaN;
  for (let i = 1; i <= n; i++) {
    const r = rh + 1e-9 + ((5 - rh) * i) / n, e = lightConsts(r, a, q).eta;
    if (Number.isFinite(prev) && (prev < 0) !== (e < 0)) {
      let x0 = rh + 1e-9 + ((5 - rh) * (i - 1)) / n, x1 = r;
      for (let k = 0; k < 60; k++) { const m = (x0 + x1) / 2; if ((lightConsts(m, a, q).eta < 0) === (prev < 0)) x0 = m; else x1 = m; }
      rs.push((x0 + x1) / 2);
    }
    prev = e;
  }
  if (rs.length < 2) throw new Error('No light orbits found.');
  return [rs[0], rs[rs.length - 1]];
}

/** E, Lz, Q of the bound orbit between r1 = p/(1 + e) and r2 = p/(1 − e) tilted by `inc` (radians) from the
 * equator (cos inc = Lz/√(Lz² + Q); inc > π/2 goes against the spin). Newton from the Kepler guess. */
export function constants(a: number, p: number, e: number, inc: number, c: Charge = {}) {
  const q = c.q ?? 0, eps = c.eps ?? 0;
  const r1 = p / (1 + e), r2 = p / (1 - e), pro = inc < Math.PI / 2, tq = Math.tan(inc) ** 2, cosi = Math.cos(inc);
  if (!(e >= 0 && e < 1 && p > 0)) throw new Error('0 ≤ e < 1 and p > 0.');
  let { E, L } = circular(a, Math.max(p, isco(pro ? Math.abs(a) : -Math.abs(a), c) + 0.5), pro, c);
  L = Math.sign(cosi || 1) * Math.abs(L);
  if (Math.abs(cosi) < 1e-9) L = 0;
  const Qof = (L0: number) => (Math.abs(cosi) < 1e-9 ? L0 * L0 + 12 * p : L0 * L0 * tq);
  // Polar orbits (cos inc = 0) take L = 0 and solve for E and Q instead.
  const polar = Math.abs(cosi) < 1e-9;
  let Q = polar ? p * p : Qof(L);
  const F = (x: number[]) => {
    const [E0, y] = x, L0 = polar ? 0 : y, Q0 = polar ? y : Qof(y);
    return e < 1e-9 ? [Rf(p, a, E0, L0, Q0, 1, q, eps), dR(p, a, E0, L0, Q0, 1, q, eps)] : [Rf(r1, a, E0, L0, Q0, 1, q, eps), Rf(r2, a, E0, L0, Q0, 1, q, eps)];
  };
  let x = [E, polar ? Q : L];
  for (let k = 0; k < 100; k++) {
    const f = F(x), h = 1e-7, J = [0, 1].map((j) => { const xp = x.slice(); xp[j] += h * (1 + Math.abs(xp[j])); const fp = F(xp); return fp.map((v, i) => (v - f[i]) / (h * (1 + Math.abs(x[j])))); });
    const det = J[0][0] * J[1][1] - J[1][0] * J[0][1];
    if (!Number.isFinite(det) || det === 0) break;
    const d0 = (f[0] * J[1][1] - f[1] * J[1][0]) / det, d1 = (J[0][0] * f[1] - J[0][1] * f[0]) / det;
    x = [x[0] - d0, x[1] - d1];
    if (Math.abs(d0) + Math.abs(d1) < 1e-14) break;
  }
  [E] = x; L = polar ? 0 : x[1]; Q = polar ? x[1] : Qof(x[1]);
  // Bound between r1 and r2 (R ≥ 0 inside) and, for a circle, stable (R'' < 0 there).
  const mid = e < 1e-9 ? p : (r1 + r2) / 2, h2 = 1e-4 * p;
  const curv = (dR(p + h2, a, E, L, Q, 1, q, eps) - dR(p - h2, a, E, L, Q, 1, q, eps)) / (2 * h2);
  if (!(E > 0 && E < 1 && Q >= -1e-9 && Rf(mid, a, E, L, Q, 1, q, eps) >= -1e-9) || (e < 1e-9 && !(curv < 0)) || Math.abs(F([x[0], x[1]])[0]) > 1e-8 * p ** 4)
    throw new Error('No stable bound orbit there: move it further out.');
  return { E, L, Q: Math.max(0, Q) };
}

export interface Geo { lambda: number[]; t: number[]; r: number[]; th: number[]; ph: number[]; x: number[]; y: number[]; z: number[]; captured: boolean }

/** A geodesic from (r0, θ0, φ0), moving inward (or out), its θ moving towards the north (u rising) or south;
 * recorded every `dl` of Mino time up to `lmax`. Stops at the horizon or far away (r > rFar). */
export function geodesic(a: number, E: number, L: number, Q: number, mu: number, r0: number, th0: number, ph0: number, lmax: number, opts: { inward?: boolean; north?: boolean; n?: number; rFar?: number } & Charge = {}): Geo {
  const q = opts.q ?? 0, eps = mu ? opts.eps ?? 0 : 0;
  const R0 = Rf(r0, a, E, L, Q, mu, q, eps), u0 = Math.cos(th0), U0 = Uf(u0, a, E, L, Q, mu);
  if (R0 < -1e-9 * (1 + r0 ** 4) || U0 < -1e-9) throw new Error('Those constants cannot be at that place (R or Θ below 0).');
  const rp = (opts.inward ? -1 : 1) * Math.sqrt(Math.max(0, R0)), up = (opts.north ? 1 : -1) * Math.sqrt(Math.max(0, U0));
  const rh = horizon(a, q), rFar = opts.rFar ?? Infinity;
  // State [t, r, r', u, u', φ]; derivatives in λ.
  const f = (_: number, s: number[]) => {
    const [, r, v, u, w] = s, D = r * r - 2 * r + a * a + q * q, P = E * (r * r + a * a) - a * L - eps * q * r, s2 = Math.max(1e-12, 1 - u * u);
    if (r < rh * 1.0001 || r > rFar) return [0, 0, 0, 0, 0, 0];
    return [-a * (a * E * s2 - L) + ((r * r + a * a) * P) / D, v, dR(r, a, E, L, Q, mu, q, eps) / 2, w, dU(u, a, E, L, Q, mu) / 2, -(a * E - L / s2) + (a * P) / D];
  };
  const n = opts.n ?? 2000, g: Geo = { lambda: [], t: [], r: [], th: [], ph: [], x: [], y: [], z: [], captured: false };
  let y = [0, r0, rp, u0, up, ph0];
  for (let i = 0; i <= n; i++) {
    if (i) {
      y = rk45(f, (lmax * (i - 1)) / n, (lmax * i) / n, y, 1e-11, 1e-13, 200_000).y.at(-1)!;
      // Back onto the first integrals ((dr/dλ)² = R, (du/dλ)² = U): the second-order form would drift off them.
      const Rr = Rf(y[1], a, E, L, Q, mu, q, eps), Uu = Uf(y[3], a, E, L, Q, mu);
      if (y[1] >= rh * 1.0001 && y[1] <= rFar) { y[2] = Math.sign(y[2]) * Math.sqrt(Math.max(0, Rr)); y[4] = Math.sign(y[4]) * Math.sqrt(Math.max(0, Uu)); }
    }
    const [t, r, , u, , ph] = y;
    if (r < rh * 1.0001) { g.captured = true; break; }
    const th = Math.acos(Math.max(-1, Math.min(1, u))), rr = Math.sqrt(r * r + a * a);
    g.lambda.push((lmax * i) / n); g.t.push(t); g.r.push(r); g.th.push(th); g.ph.push(ph);
    // A Cartesian picture: x = √(r² + a²) sin θ cos φ.
    g.x.push(rr * Math.sin(th) * Math.cos(ph)); g.y.push(rr * Math.sin(th) * Math.sin(ph)); g.z.push(r * u);
    if (r > rFar) break;
  }
  return g;
}

/** The φ turned between one crossing of the equator going south and the next (2π Ω_φ / Ω_θ), and r's turn
 * (periapsis to periapsis), measured along the orbit; NaN when it never happened. */
export function precessions(g: Geo) {
  const cross: number[] = [], peri: number[] = [];
  for (let i = 1; i < g.th.length; i++) {
    const u0 = Math.cos(g.th[i - 1]), u1 = Math.cos(g.th[i]);
    if (u0 > 0 && u1 <= 0) cross.push(g.ph[i - 1] + ((g.ph[i] - g.ph[i - 1]) * u0) / (u0 - u1));
    if (i > 1 && g.r[i - 1] < g.r[i - 2] && g.r[i - 1] <= g.r[i]) {
      // A parabola through the three points around the smallest r.
      const y0 = g.r[i - 2], y1 = g.r[i - 1], y2 = g.r[i], den = y0 - 2 * y1 + y2, s = den > 0 ? (0.5 * (y0 - y2)) / den : 0;
      peri.push(g.ph[i - 1] + s * (s > 0 ? g.ph[i] - g.ph[i - 1] : g.ph[i - 1] - g.ph[i - 2]));
    }
  }
  const step = (v: number[]) => (v.length > 1 ? (v[v.length - 1] - v[0]) / (v.length - 1) : NaN);
  return { node: step(cross), peri: step(peri) };
}

/** The black hole's shadow seen from far away at inclination θo (radians from the spin axis): the outline (α, β) in
 * units of M, from the spherical light orbits (Bardeen 1973; with charge, ξ and η from R = R' = 0 for any Δ). */
export function shadow(a: number, thO: number, n = 400, q = 0) {
  if (Math.abs(a) < 1e-6) {
    // No spin: a circle of radius r²/√Δ at the light sphere.
    const r = (3 + Math.sqrt(9 - 8 * q * q)) / 2, R = (r * r) / Math.sqrt(r * r - 2 * r + q * q);
    return Array.from({ length: n + 1 }, (_, i) => [R * Math.cos((2 * Math.PI * i) / n), R * Math.sin((2 * Math.PI * i) / n)]);
  }
  const A = Math.abs(a), [rmin, rmax] = q ? lightRange(A, q) : [photonOrbit(A), photonOrbit(-A)], so = Math.sin(thO), co = Math.cos(thO);
  const top: number[][] = [];
  for (let i = 0; i <= n; i++) {
    // Denser near the ends, where β changes fastest.
    const s = 0.5 - 0.5 * Math.cos((Math.PI * i) / n), r = rmin + (rmax - rmin) * s, { xi, eta } = lightConsts(r, A, q);
    const b2 = eta + A * A * co * co - (xi * xi * co * co) / (so * so);
    if (b2 >= 0) top.push([(-Math.sign(a) * xi) / so, Math.sqrt(b2)]);
  }
  return [...top, ...top.slice().reverse().map(([x, y]) => [x, -y])];
}

/** A ray from a distant observer at inclination θo reaching the image point (α, β) (Cunningham & Bardeen): its
 * constants, for tracing back towards the hole. */
export function imageRay(a: number, thO: number, alpha: number, beta: number) {
  const L = -alpha * Math.sin(thO), Q = beta * beta + (alpha * alpha - a * a) * Math.cos(thO) ** 2;
  return { E: 1, L, Q };
}
