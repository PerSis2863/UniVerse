import { rk45 } from './sci-num';

// Hyperion's spinning black holes (M519): Kerr's geometry in Boyer–Lindquist coordinates, G = c = M = 1, spin a
// (0 ≤ |a| ≤ 1). Orbits in and out of the equator from the three constants E, Lz and Carter's Q, integrated in Mino
// time λ as second-order equations (r'' = R'(r)/2, u'' = U'(u)/2 with u = cos θ), so turning points need no sign flips.
// μ = 1 for matter, 0 for light. M520: Kerr–Newman, a charge q on the hole (a² + q² ≤ 1, Δ = r² − 2r + a² + q²) and
// a charge-to-mass ratio ε on the particle (P = E(r² + a²) − aLz − εqr); the defaults (0) give Kerr back. M542: a
// magnetic charge g too (Δ gains g²; a charged particle then feels it in θ: P_θ = aE sin²θ − Lz − εg cos θ, so its
// orbits leave the equator and ride Poincaré's cones). R doesn't feel εg, so `circular` and `constants` still give
// the radial motion asked for; only the tilt then wobbles.
// M543: the disc with a thickness, see-through, and its colour by temperature (`blackbodyRGB`). M544: a see-through thick
// disc glows and absorbs all through its gas (it shadows its own far side); a solid one's inner and outer walls shine.
// M545: lengths in the gas measured by the gas itself, and absorption by colour with each pixel's spectrum (`spectrumRGB`).
// M546: scattering (`scatter`), in the Eddington approximation: the spectrum hardens by the colour correction f_col.
// M570: the scattered light from all of the disc (`transfer` 'disc', `discTransfer`) and a Compton corona (`comptonize`).

/** The hole's charge q and the particle's charge per mass ε (Gaussian units, G = c = M = 1). */
export interface Charge { q?: number; eps?: number; g?: number }
const chk = (a: number, q: number) => { if (!(a * a + q * q <= 1 + 1e-12)) throw new Error('a² + q² must stay at most 1 (otherwise there is no horizon).'); };

export const horizon = (a: number, q = 0) => { chk(a, q); return 1 + Math.sqrt(Math.max(0, 1 - a * a - q * q)); };
export const ergosphere = (a: number, th: number, q = 0) => 1 + Math.sqrt(Math.max(0, 1 - a * a * Math.cos(th) ** 2 - q * q));

const Rf = (r: number, a: number, E: number, L: number, Q: number, mu: number, q = 0, eps = 0, g = 0) => {
  const D = r * r - 2 * r + a * a + q * q + g * g, P = E * (r * r + a * a) - a * L - eps * q * r;
  return P * P - D * (mu * r * r + (L - a * E) ** 2 + Q);
};
const dR = (r: number, a: number, E: number, L: number, Q: number, mu: number, q = 0, eps = 0, g = 0) => {
  const D = r * r - 2 * r + a * a + q * q + g * g, P = E * (r * r + a * a) - a * L - eps * q * r;
  return 2 * P * (2 * E * r - eps * q) - (2 * r - 2) * (mu * r * r + (L - a * E) ** 2 + Q) - 2 * mu * r * D;
};
/** (du/dλ)² with u = cos θ: (1 − u²)(K − μa²u²) − P_θ², K = Q + (Lz − aE)², P_θ = aE(1 − u²) − Lz − wu (w = εg). */
export const Uf = (u: number, a: number, E: number, L: number, Q: number, mu: number, w = 0) => {
  const K = Q + (L - a * E) ** 2, Pt = a * E * (1 - u * u) - L - w * u;
  return (1 - u * u) * (K - mu * a * a * u * u) - Pt * Pt;
};
export const dU = (u: number, a: number, E: number, L: number, Q: number, mu: number, w = 0) => {
  const K = Q + (L - a * E) ** 2, Pt = a * E * (1 - u * u) - L - w * u;
  return -2 * u * (K - mu * a * a * u * u) - 2 * mu * a * a * u * (1 - u * u) - 2 * Pt * (-2 * a * E * u - w);
};

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
  const q = c.q ?? 0, eps = c.eps ?? 0, g = c.g ?? 0, s = prograde ? 1 : -1, sr = Math.sqrt(r), den = r ** 0.75 * Math.sqrt(r ** 1.5 - 3 * sr + 2 * s * a);
  if (!q && !eps && !g) {
    if (!(den > 0)) throw new Error('No circular orbit there (inside the light orbit).');
    return { E: (r ** 1.5 - 2 * sr + s * a) / den, L: (s * (r * r - 2 * s * a * sr + a * a)) / den };
  }
  chk(a, Math.hypot(q, g));
  // Start from a far orbit (always there), then walk in and add the charge.
  const far = Math.max(r, 30), k0 = circular(a, far, prograde);
  let x = [k0.E, k0.L];
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const f = i / steps, rr = far + (r - far) * f, qq = q * f, ee = eps;
    x = newton2((y) => [Rf(rr, a, y[0], y[1], 0, 1, qq, ee, g * f), dR(rr, a, y[0], y[1], 0, 1, qq, ee, g * f)], x);
    if (!x.every(Number.isFinite)) throw new Error('No circular orbit there (inside the light orbit).');
  }
  return { E: x[0], L: x[1] };
}
const stableAt = (a: number, r: number, pro: boolean, c: Charge) => {
  try {
    const k = circular(a, r, pro, c), h = 1e-4 * r, q = c.q ?? 0, eps = c.eps ?? 0, g = c.g ?? 0;
    return (dR(r + h, a, k.E, k.L, 0, 1, q, eps, g) - dR(r - h, a, k.E, k.L, 0, 1, q, eps, g)) / (2 * h) < 0 && k.E > 0;
  } catch { return false; }
};
/** The innermost stable circular orbit in the equator (Bardeen, Press & Teukolsky without charge; otherwise where
 * R'' turns zero, by bisection), prograde for a > 0. */
export function isco(a: number, c: Charge = {}) {
  if (!c.q && !c.eps && !c.g) {
    const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a)), z2 = Math.sqrt(3 * a * a + z1 * z1);
    return 3 + z2 - Math.sign(a) * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  }
  const pro = a >= 0, A = Math.abs(a);
  let lo = horizon(A, Math.hypot(c.q ?? 0, c.g ?? 0)) * 1.0001, hi = 60;
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
  const q = c.q ?? 0, eps = c.eps ?? 0, g = c.g ?? 0;
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
    return e < 1e-9 ? [Rf(p, a, E0, L0, Q0, 1, q, eps, g), dR(p, a, E0, L0, Q0, 1, q, eps, g)] : [Rf(r1, a, E0, L0, Q0, 1, q, eps, g), Rf(r2, a, E0, L0, Q0, 1, q, eps, g)];
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
  const curv = (dR(p + h2, a, E, L, Q, 1, q, eps, g) - dR(p - h2, a, E, L, Q, 1, q, eps, g)) / (2 * h2);
  if (!(E > 0 && E < 1 && Q >= -1e-9 && Rf(mid, a, E, L, Q, 1, q, eps, g) >= -1e-9) || (e < 1e-9 && !(curv < 0)) || Math.abs(F([x[0], x[1]])[0]) > 1e-8 * p ** 4)
    throw new Error('No stable bound orbit there: move it further out.');
  return { E, L, Q: Math.max(0, Q) };
}

export interface Geo { lambda: number[]; t: number[]; r: number[]; th: number[]; ph: number[]; x: number[]; y: number[]; z: number[]; captured: boolean }

/** A geodesic from (r0, θ0, φ0), moving inward (or out), its θ moving towards the north (u rising) or south;
 * recorded every `dl` of Mino time up to `lmax`. Stops at the horizon or far away (r > rFar). */
export function geodesic(a: number, E: number, L: number, Q: number, mu: number, r0: number, th0: number, ph0: number, lmax: number, opts: { inward?: boolean; north?: boolean; n?: number; rFar?: number } & Charge = {}): Geo {
  const q = opts.q ?? 0, eps = mu ? opts.eps ?? 0 : 0, g = opts.g ?? 0, w = eps * g;
  const R0 = Rf(r0, a, E, L, Q, mu, q, eps, g), u0 = Math.cos(th0), U0 = Uf(u0, a, E, L, Q, mu, w);
  if (R0 < -1e-9 * (1 + r0 ** 4) || U0 < -1e-9) throw new Error('Those constants cannot be at that place (R or Θ below 0).');
  const rp = (opts.inward ? -1 : 1) * Math.sqrt(Math.max(0, R0)), up = (opts.north ? 1 : -1) * Math.sqrt(Math.max(0, U0));
  const rh = horizon(a, Math.hypot(q, g)), rFar = opts.rFar ?? Infinity;
  // State [t, r, r', u, u', φ]; derivatives in λ.
  const f = (_: number, s: number[]) => {
    const [, r, v, u, uv] = s, D = r * r - 2 * r + a * a + q * q + g * g, P = E * (r * r + a * a) - a * L - eps * q * r, s2 = Math.max(1e-12, 1 - u * u), Pt = a * E * s2 - L - w * u;
    if (r < rh * 1.0001 || r > rFar) return [0, 0, 0, 0, 0, 0];
    return [-a * Pt + ((r * r + a * a) * P) / D, v, dR(r, a, E, L, Q, mu, q, eps, g) / 2, uv, dU(u, a, E, L, Q, mu, w) / 2, -Pt / s2 + (a * P) / D];
  };
  const n = opts.n ?? 2000, out: Geo = { lambda: [], t: [], r: [], th: [], ph: [], x: [], y: [], z: [], captured: false };
  let y = [0, r0, rp, u0, up, ph0];
  for (let i = 0; i <= n; i++) {
    if (i) {
      y = rk45(f, (lmax * (i - 1)) / n, (lmax * i) / n, y, 1e-11, 1e-13, 200_000).y.at(-1)!;
      // Back onto the first integrals ((dr/dλ)² = R, (du/dλ)² = U): the second-order form would drift off them.
      const Rr = Rf(y[1], a, E, L, Q, mu, q, eps, g), Uu = Uf(y[3], a, E, L, Q, mu, w);
      if (y[1] >= rh * 1.0001 && y[1] <= rFar) { y[2] = Math.sign(y[2]) * Math.sqrt(Math.max(0, Rr)); y[4] = Math.sign(y[4]) * Math.sqrt(Math.max(0, Uu)); }
    }
    const [t, r, , u, , ph] = y;
    if (r < rh * 1.0001) { out.captured = true; break; }
    const th = Math.acos(Math.max(-1, Math.min(1, u))), rr = Math.sqrt(r * r + a * a);
    out.lambda.push((lmax * i) / n); out.t.push(t); out.r.push(r); out.th.push(th); out.ph.push(ph);
    // A Cartesian picture: x = √(r² + a²) sin θ cos φ.
    out.x.push(rr * Math.sin(th) * Math.cos(ph)); out.y.push(rr * Math.sin(th) * Math.sin(ph)); out.z.push(r * u);
    if (r > rFar) break;
  }
  return out;
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

/** A thin glowing disc round the hole, seen from far away at inclination θo (radians): one ray a pixel traced back
 * from the observer (fixed-step RK4 in Mino time, steps shrinking near the hole, kept on R and U after each), stopped
 * where it first crosses the equator between rIn (the ISCO unless given) and rOut. Each hit shines with
 * Novikov–Thorne's shape F ∝ r⁻³(1 − √(rIn/r)) times g⁴, g = 1 / (uᵗ(1 − Ωξ)) the shift of light from gas circling at
 * Ω (with the spin). Rows run from the top of the picture down; α across, β up, both in GM/c². `q` is the metric
 * charge √(q² + g²). M543: `thick` h/r makes it a flared slab (light enters through its faces |cos θ| = h/r, the gas
 * taken at the cylinder radius), and `opacity` below 1 lets light through: each crossing adds its glow times what is
 * left, (1 − opacity) per crossing, so the hole's far side and the thin ring of light shine through. `T` is each pixel's
 * colour temperature, g · (F/F_peak)^¼ relative to the hottest gas, weighted by brightness. */
export function discImage(a: number, thO: number, o: { q?: number; n?: number; rIn?: number; rOut?: number; half?: number; thick?: number; opacity?: number; tK?: number; absorb?: number; scatter?: number; transfer?: 'slab' | 'disc'; corona?: { kTe: number; tau: number }; wide?: boolean } = {}) {
  const H = o.thick ?? 0, op = o.opacity ?? 1, q = o.q ?? 0, n = o.n ?? 80, rOut = o.rOut ?? 20, rIn = o.rIn ?? isco(a, q ? { q } : {}), half = o.half ?? rOut * 1.1, rh = horizon(a, q), r0 = 1000;
  if (!(rOut > rIn)) throw new Error('The disc\'s outer edge must lie outside its inner edge.');
  if (!(H >= 0 && H <= 0.3 && op > 0 && op <= 1)) throw new Error('The disc\'s thickness h/r is 0 to 0.3 and its opacity more than 0, up to 1.');
  // The gas's Ω and uᵗ on a table of radii (log-spaced), from its circular orbit's E and L.
  const NT = 300, tr: number[] = [], tOm: number[] = [], tUt: number[] = [];
  for (let i = 0; i < NT; i++) {
    const r = rIn * (rOut / rIn) ** (i / (NT - 1)), k = circular(a, r, true, q ? { q } : {});
    const D = r * r - 2 * r + a * a + q * q, P = k.E * (r * r + a * a) - a * k.L, dt = -a * (a * k.E - k.L) + ((r * r + a * a) * P) / D, dp = -(a * k.E - k.L) + (a * P) / D;
    tr.push(r); tOm.push(dp / dt); tUt.push(dt / (r * r));
  }
  const look = (r: number, t: number[]) => { const x = (Math.log(r / rIn) / Math.log(rOut / rIn)) * (NT - 1), i = Math.max(0, Math.min(NT - 2, Math.floor(x))), f = x - i; return t[i] * (1 - f) + t[i + 1] * f; };
  // The hottest gas's F^¼ (temperatures are given relative to it): F peaks at r = (49/36) rIn.
  const Fof = (r: number) => (1 - Math.sqrt(rIn / r)) / r ** 3, Tpk = Fof(Math.min(rOut, (49 / 36) * rIn)) ** 0.25;
  const I = new Float64Array(n * n), G = new Float64Array(n * n).fill(NaN), Rh = new Float64Array(n * n).fill(NaN), Tm = new Float64Array(n * n).fill(NaN);
  const zc = H; // the disc's faces: |cos θ| = h/r (a disc that flares, its height growing with r)
  const vol = H > 0 && op < 1; // a see-through thick disc: glow and absorption through its gas (M544)
  const so = Math.sin(thO), co = Math.cos(thO);
  // M545: with `tK` (the hottest gas in kelvin) each pixel's spectrum S at the wavelengths LAM too, and the gas absorbs
  // by colour: κ_ν ∝ (ν/ν_peak)^−absorb in the gas's own frame (ν_peak its own temperature's, where `opacity` holds),
  // so 2 (free–free) takes red more than blue and −1 (dust) blue more. The light that leaves gas at T reaches us as a
  // black body at gT (I_ν/ν³ is the same for every observer).
  const S = o.tK ? new Float64Array(n * n * LAM.length) : null, beta = o.absorb ?? 0, trS = new Float64Array(LAM.length);
  if (o.tK !== undefined && !(o.tK >= 100 && o.tK <= 1e8 && Math.abs(beta) <= 4)) throw new Error('The hottest gas is 100 K to 10⁸ K and the absorption\'s power −4 to 4.');
  // M546: `scatter` ω, the share of the opacity (at the gas's peak colour) that turns light aside instead of taking it,
  // in the Eddington (two-stream) approximation: at a colour whose absorption is f times the peak's, the extinction is
  // (1 − ω)f + ω times κ and the share destroyed ε = (1 − ω)f / that. A surface (or a deep slab) gives out ε_eff =
  // 2√ε / (1 + √ε) of a black body's light, so to carry the flux its gas must be f_col = ε_eff^−¼ hotter: the spectrum
  // hardens (the known colour correction of discs, about 1.5–1.8 when scattering rules). Inside a see-through slab the
  // source is ε B + (1 − ε) J, J = B (1 − e^(−√(3ε) τ) / (1 + √ε)) at the optical depth τ to its nearer face.
  // shortcut: J from a plane-parallel slab at each point, not the light really arriving there from all of the disc.
  const om = o.scatter ?? 0;
  if (!(om >= 0 && om <= 0.99)) throw new Error('The scattering share is 0 to 0.99.');
  const ext = (f: number) => (1 - om) * f + om, epsOf = (f: number) => ((1 - om) * f) / ext(f), effOf = (f: number) => { const e = Math.sqrt(epsOf(f)); return (2 * e) / (1 + e); };
  const fcol = effOf(1) ** -0.25, srcOf = (f: number, tau: number) => { const e = epsOf(f), se = Math.sqrt(e); return e + (1 - e) * (1 - Math.exp(-Math.sqrt(3 * e) * tau * ext(f)) / (1 + se)); };
  // M570: with `transfer` 'disc' the light scattered inside a see-through slab is the light really arriving at each
  // point from all of the disc's gas (discTransfer), not a flat slab's own.
  const nl = o.transfer === 'disc' && H > 0 && op < 1 && om > 0 ? discTransfer({ rIn, rOut, zc: H, op, om, beta, fcol, rh, Tl: (r) => Fof(r) ** 0.25 / Tpk }) : null;
  if (o.transfer && !['slab', 'disc'].includes(o.transfer)) throw new Error("The light inside the gas is 'slab' or 'disc'.");
  const spec = (k: number, g: number, rc: number, takeOf: (kr: number) => number, src: (f: number, u: number) => number) => {
    const T = o.tK! * (Fof(rc) ** 0.25 / Tpk);
    LAM.forEach((l, b) => {
      const x = 14387.77 / (l * 1e-3 * g * T) / 2.821, f = beta ? x ** -beta : 1, take = takeOf(ext(f));
      S![k * LAM.length + b] += trS[b] * take * src(f, (x * T) / o.tK!) * planck(l, g * fcol * T); trS[b] *= 1 - take;
    });
  };
  // M570: `corona` (kTe in keV, its optical depth τ): hot electrons above the disc boosting its light by Compton
  // scattering. The whole picture's light over 10⁻³ to 10³ keV (E, X as E·F_E, arbitrary units) from each bit of gas a
  // black body at g f_col T (grey weights), then e^−τ of it passes and the rest is Comptonized (`comptonize`).
  const wide = o.corona || o.wide ? new Float64Array(EK.length) : null;
  if (wide && !o.tK) throw new Error('The wide spectrum needs the gas\'s temperature.');
  if (o.corona && !(o.corona.kTe >= 1 && o.corona.kTe <= 1000 && o.corona.tau > 0 && o.corona.tau <= 10)) throw new Error('A corona needs the gas\'s temperature, electrons of 1 to 1000 keV and an optical depth above 0 up to 10.');
  const addWide = (w: number, Tobs: number) => { if (wide) { const kT = 8.617333e-8 * Tobs; EK.forEach((E, i) => { const x = E / kT; wide[i] += x > 700 ? 0 : (w * (15 / Math.PI ** 4) * x ** 4) / Math.expm1(x); }); } };
  const opaque = (t: number) => t < 1e-3 && (!S || trS.every((x) => x < 1e-3));
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    trS.fill(1);
    const al = -half + (2 * half * (px + 0.5)) / n, be = half - (2 * half * (py + 0.5)) / n;
    const L = -al * so, Q = be * be + (al * al - a * a) * co * co;
    // State [r, r', u, u'] with E = 1, μ = 0.
    let r = r0, u = co, rv = -Math.sqrt(Math.max(0, Rf(r, a, 1, L, Q, 0, q))), uv = (be > 0 ? 1 : -1) * Math.sqrt(Math.max(0, Uf(u, a, 1, L, Q, 0)));
    const F = (y: number[]) => [y[1], dR(y[0], a, 1, L, Q, 0, q) / 2, y[3], dU(y[2], a, 1, L, Q, 0) / 2];
    const scale = Math.sqrt(Math.max(0, Q) + L * L) + 1;
    let tr2 = 1, Isum = 0, Tsum = 0;
    for (let k = 0; k < 20000; k++) {
      const h = 0.02 / (r + scale), y = [r, rv, u, uv];
      const k1 = F(y), k2 = F(y.map((v, j) => v + (h / 2) * k1[j])), k3 = F(y.map((v, j) => v + (h / 2) * k2[j])), k4 = F(y.map((v, j) => v + h * k3[j]));
      const ny = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      if (ny[0] < rh * 1.01) break;
      if (vol) {
        // M544: inside the slab the gas glows and absorbs along the way (Beer–Lambert), so a ray grazing through a
        // long stretch of it is dimmed more: the near side shadows the far side's glow. κ makes a straight-down pass
        // through the full height at that radius take away `opacity`; the source is the gas's glow, so that pass
        // gives opacity × glow, as a crossing did before. M545: lengths as the gas itself measures them,
        // ds = (−p·u) dλ = Σ dλ_Mino / g (Σ = r² + a² cos²θ; the affine step is Σ times the Mino one, and the gas sees
        // the light's energy as 1/g); its height, across its motion, is the same for it as for a still observer.
        const um = (u + ny[2]) / 2, rm = (r + ny[0]) / 2, s2 = Math.max(1e-12, 1 - um * um), rc = rm * Math.sqrt(s2);
        if (Math.abs(um) < zc && rc >= rIn && rc <= rOut) {
          const g = 1 / (look(rc, tUt) * (1 - look(rc, tOm) * L)), ds = ((rm * rm + a * a * um * um) * h) / g;
          const kap = -Math.log(1 - op) / (2 * rm * Math.asin(zc)), take = 1 - Math.exp(-kap * ds);
          const tau = kap * rm * (Math.asin(zc) - Math.asin(Math.min(zc, Math.abs(um)))), Tl = Fof(rc) ** 0.25 / Tpk;
          const w = (tr2 * take * g ** 4 * Fof(rc) * (nl ? Math.exp(nl(rc, um / zc, Tl)) : srcOf(1, tau))) / effOf(1);
          Isum += w; Tsum += w * g * fcol * Tl; addWide(w, o.tK! * g * fcol * Tl);
          if (S) spec(py * n + px, g, rc, (kr) => 1 - Math.exp(-kap * kr * ds), (f, uu) => (nl ? Math.exp(nl(rc, um / zc, uu)) : srcOf(f, tau)));
          // Its shift and radius: where the gas has taken the first 5% (one step takes little).
          if (Number.isNaN(G[py * n + px]) && tr2 * (1 - take) < 0.95) { G[py * n + px] = g; Rh[py * n + px] = rc; }
          tr2 *= 1 - take;
          if (opaque(tr2)) break;
        }
        [r, rv, u, uv] = ny;
        rv = Math.sign(rv) * Math.sqrt(Math.max(0, Rf(r, a, 1, L, Q, 0, q))); uv = Math.sign(uv) * Math.sqrt(Math.max(0, Uf(u, a, 1, L, Q, 0)));
        if (r > r0 * 1.01 && rv > 0) break;
        continue;
      }
      // M544: a solid thick disc's walls (the cylinders at rIn and rOut between its faces). The inner one, met from the
      // hole's side, shines with the gas one disc-height behind it (Novikov–Thorne's glow is zero at rIn itself); the
      // outer rim, met from outside (a ray seen edge-on that never crosses a face), with the gas at rOut.
      const c0 = r * Math.sqrt(1 - u * u), c1 = ny[0] * Math.sqrt(1 - ny[2] * ny[2]);
      const wall = !zc || Math.abs(u) >= zc || Math.abs(ny[2]) >= zc ? 0 : c0 < rIn && c1 >= rIn ? Math.min(rOut, rIn * (1 + zc)) : c0 > rOut && c1 <= rOut ? rOut : 0;
      if (wall) {
        const rc = wall, g = 1 / (look(rc, tUt) * (1 - look(rc, tOm) * L)), w = tr2 * g ** 4 * Fof(rc);
        Isum += w; Tsum += w * g * fcol * (Fof(rc) ** 0.25 / Tpk); addWide(w, o.tK! * g * fcol * (Fof(rc) ** 0.25 / Tpk));
        if (S) spec(py * n + px, g, rc, () => 1, effOf);
        if (Number.isNaN(G[py * n + px])) { G[py * n + px] = g; Rh[py * n + px] = wall === rOut ? rOut : rIn; }
        break;
      }
      // Entering the disc through its top face (cos θ = h/r from above) or its bottom (−h/r from below).
      let hit = -1;
      for (const sf of zc ? [zc, -zc] : [0]) {
        const a0 = u - sf, a1 = ny[2] - sf;
        const enter = sf > 0 ? a0 > 0 && a1 <= 0 : sf < 0 ? a0 < 0 && a1 >= 0 : a0 * a1 <= 0 && a0 !== 0;
        if (enter) { hit = a0 / (a0 - a1); break; }
      }
      if (hit >= 0) {
        const rc = (r + hit * (ny[0] - r)) * Math.sqrt(1 - zc * zc);
        if (rc >= rIn && rc <= rOut) {
          const g = 1 / (look(rc, tUt) * (1 - look(rc, tOm) * L)), w = tr2 * op * g ** 4 * Fof(rc);
          Isum += w; Tsum += w * g * fcol * (Fof(rc) ** 0.25 / Tpk); addWide(w, o.tK! * g * fcol * (Fof(rc) ** 0.25 / Tpk));
          if (S) spec(py * n + px, g, rc, (kr) => (op >= 1 ? 1 : 1 - (1 - op) ** kr), effOf);
          if (Number.isNaN(G[py * n + px])) { G[py * n + px] = g; Rh[py * n + px] = rc; }
          tr2 *= 1 - op;
          if (opaque(tr2)) break;
        }
      }
      [r, rv, u, uv] = ny;
      // Back onto the first integrals (the signs kept).
      rv = Math.sign(rv) * Math.sqrt(Math.max(0, Rf(r, a, 1, L, Q, 0, q))); uv = Math.sign(uv) * Math.sqrt(Math.max(0, Uf(u, a, 1, L, Q, 0)));
      if (r > r0 * 1.01 && rv > 0) break;
    }
    if (Isum > 0) { I[py * n + px] = Isum; Tm[py * n + px] = Tsum / Isum; }
  }
  const px2 = ((2 * half) / n) ** 2; // each pixel's patch of sky, so X is the picture's total
  return { I, g: G, r: Rh, T: Tm, n, half, S, lam: LAM, ...(wide ? { E: EK, X: o.corona ? comptonize(EK, wide.map((v) => v * px2), o.corona.kTe, o.corona.tau) : Array.from(wide, (v) => v * px2) } : {}) };
}

/** M570: the light scattered inside a see-through thick disc, from all of its gas: the gas cut into 20 rings (log
 * spaced) × 8 layers (by cos θ / h), and from the middle of each cell 48 straight rays (evenly spread) followed
 * through the gas, each crossing of a cell weighted by the light it gives that is not taken on the way (the Λ
 * operator); at each of 25 frequencies (10⁻³ to 10³ times the hottest gas's peak, in each cell's own frame) the
 * source S = ε B + (1 − ε) Λ S is solved exactly (a dense linear solve; Λ iteration stalls when ε is small), ε the
 * share of the extinction that is absorption there, B a black body at f_col T. Returns ln(S / B) at a cylinder
 * radius R, a height ζ = cos θ / (h/r) (−1 to 1) and a frequency u (in the hottest gas's peaks), interpolated.
 * shortcut: flat space and straight rays, and the gas taken still while it scatters (no shift between its parts);
 * rays into the hole end there. */
export function discTransfer(p: { rIn: number; rOut: number; zc: number; op: number; om: number; beta: number; fcol: number; rh: number; Tl: (r: number) => number }) {
  const NR = 20, NZ = 8, NC = NR * NZ, qR = (p.rOut / p.rIn) ** (1 / NR), lnq = Math.log(qR), zc = p.zc;
  const kapOf = (r: number) => -Math.log(1 - p.op) / (2 * r * Math.asin(zc));
  const cellAt = (x: number, y: number, z: number) => {
    const R = Math.hypot(x, y), r = Math.hypot(R, z), c = z / r;
    if (!(Math.abs(c) < zc && R >= p.rIn && R < p.rOut)) return -1;
    return Math.min(NR - 1, Math.floor(Math.log(R / p.rIn) / lnq)) * NZ + Math.min(NZ - 1, Math.floor(((c / zc + 1) / 2) * NZ));
  };
  const Rc = Array.from({ length: NR }, (_, i) => p.rIn * qR ** (i + 0.5)), Zc = Array.from({ length: NZ }, (_, k) => -1 + ((k + 0.5) * 2) / NZ);
  const ND = 48, dirs = Array.from({ length: ND }, (_, i) => { const z = 1 - (2 * i + 1) / ND, s = Math.sqrt(1 - z * z), t = i * Math.PI * (3 - Math.sqrt(5)); return [s * Math.cos(t), s * Math.sin(t), z]; });
  // Each ray's crossings: (cell, κ times the length in it, without the colour's factor).
  const off: number[] = [0], segC: number[] = [], segT: number[] = [];
  for (let i = 0; i < NC; i++) {
    const R0 = Rc[Math.floor(i / NZ)], c0 = Zc[i % NZ] * zc, r0 = R0 / Math.sqrt(1 - c0 * c0), P0 = [R0, 0, r0 * c0];
    for (const d of dirs) {
      let x = P0[0], y = P0[1], z = P0[2], last = -1, acc = 0, tauG = 0;
      for (let st = 0; st < 40000; st++) {
        const R = Math.hypot(x, y), r = Math.hypot(R, z);
        if (r < p.rh * 1.01 || (R > p.rOut && x * d[0] + y * d[1] > 0) || tauG > 40 / p.om) break;
        const h = 0.5 * Math.min((2 * zc * Math.max(r, p.rIn)) / NZ, Math.max(R, p.rIn) * (qR - 1)), mx = x + 0.5 * h * d[0], my = y + 0.5 * h * d[1], mz = z + 0.5 * h * d[2];
        const c = cellAt(mx, my, mz), dt = c >= 0 ? kapOf(Math.hypot(mx, my, mz)) * h : 0;
        if (c !== last) { if (last >= 0) { segC.push(last); segT.push(acc); } last = c; acc = 0; }
        acc += dt; tauG += dt; x += h * d[0]; y += h * d[1]; z += h * d[2];
      }
      if (last >= 0) { segC.push(last); segT.push(acc); }
      off.push(segC.length);
    }
  }
  const NU = 25, U = Array.from({ length: NU }, (_, k) => 10 ** (-3 + (6 * k) / (NU - 1)));
  const lnS = new Float64Array(NU * NC), Tc = Rc.map((R) => p.Tl(R)), A = new Float64Array(NC * NC), rhs = new Float64Array(NC);
  const lnexpm1 = (y: number) => (y > 30 ? y : Math.log(Math.expm1(y)));
  U.forEach((u, ku) => {
    const ext = new Float64Array(NC), eps = new Float64Array(NC), lnB = new Float64Array(NC);
    for (let j = 0; j < NC; j++) {
      const Tl = Tc[Math.floor(j / NZ)], f = p.beta ? (u / Tl) ** -p.beta : 1;
      ext[j] = (1 - p.om) * f + p.om; eps[j] = ((1 - p.om) * f) / ext[j]; lnB[j] = 3 * Math.log(u) - lnexpm1((2.821 * u) / (p.fcol * Tl));
    }
    const top = Math.max(...lnB);
    A.fill(0);
    for (let i = 0; i < NC; i++) {
      for (let dd = 0; dd < ND; dd++) {
        let ta = 0;
        for (let s2 = off[i * ND + dd]; s2 < off[i * ND + dd + 1] && ta < 40; s2++) {
          const j = segC[s2], dtau = segT[s2] * ext[j];
          A[i * NC + j] -= ((1 - eps[i]) * Math.exp(-ta) * -Math.expm1(-dtau)) / ND; ta += dtau;
        }
      }
      A[i * NC + i] += 1; rhs[i] = eps[i] * Math.exp(lnB[i] - top);
    }
    // Gaussian elimination with partial pivoting.
    for (let c = 0; c < NC; c++) {
      let pv = c;
      for (let r = c + 1; r < NC; r++) if (Math.abs(A[r * NC + c]) > Math.abs(A[pv * NC + c])) pv = r;
      if (pv !== c) { for (let k = 0; k < NC; k++) { const t = A[c * NC + k]; A[c * NC + k] = A[pv * NC + k]; A[pv * NC + k] = t; } const t = rhs[c]; rhs[c] = rhs[pv]; rhs[pv] = t; }
      for (let r = c + 1; r < NC; r++) { const m = A[r * NC + c] / A[c * NC + c]; if (!m) continue; for (let k = c; k < NC; k++) A[r * NC + k] -= m * A[c * NC + k]; rhs[r] -= m * rhs[c]; }
    }
    for (let r = NC - 1; r >= 0; r--) { let v = rhs[r]; for (let k = r + 1; k < NC; k++) v -= A[r * NC + k] * rhs[k]; rhs[r] = v / A[r * NC + r]; }
    for (let j = 0; j < NC; j++) lnS[ku * NC + j] = Math.log(Math.max(rhs[j], 1e-300)) + top - lnB[j];
  });
  const idx = (x: number, n: number) => { const c = Math.max(0, Math.min(n - 1.000001, x)), i = Math.floor(c); return [i, c - i] as const; };
  return (R: number, zeta: number, u: number) => {
    const [i, fi] = idx(Math.log(R / p.rIn) / lnq - 0.5, NR), [k, fk] = idx(((zeta + 1) / 2) * NZ - 0.5, NZ), [m, fm] = idx(((Math.log10(u) + 3) / 6) * (NU - 1), NU);
    let v = 0;
    for (const [a, wa] of [[i, 1 - fi], [i + 1, fi]]) for (const [b, wb] of [[k, 1 - fk], [k + 1, fk]]) for (const [c, wc] of [[m, 1 - fm], [m + 1, fm]]) {
      if (!(wa * wb * wc)) continue;
      v += wa * wb * wc * lnS[Math.min(NU - 1, c) * NC + Math.min(NR - 1, a) * NZ + Math.min(NZ - 1, b)];
    }
    return v;
  };
}

/** M570: the energies (keV) of the wide spectrum, 10⁻³ to 10³ keV, 25 a decade. */
export const EK = Array.from({ length: 151 }, (_, i) => 10 ** (-3 + i / 25));
/** M570: thermal Comptonization of a spectrum F (E·F_E at the energies E, keV) by a cloud of electrons at kTe (keV)
 * of optical depth τ: e^−τ of the photons pass, the rest are boosted along a power law up to a cutoff near kTe. The
 * power law's index from Kompaneets' equation: y = (4θ + 16θ²) max(τ, τ²), θ = kTe / m_e c², photon index
 * Γ = −½ + √(9/4 + 4/y); each photon at E₀ < kTe spreads as (E/E₀)^(1−Γ) e^(−E/kTe) per ln E above E₀ (Steiner's SIMPL,
 * upward only, with the cutoff), photons kept in number. Returns E·F_E. shortcut: one Green's function, not Kompaneets
 * solved; no photons scattered down (photons above kTe pass unchanged). */
export function comptonize(E: number[], F: ArrayLike<number>, kTe: number, tau: number) {
  const th = kTe / 511, y = (4 * th + 16 * th * th) * Math.max(tau, tau * tau), G = -0.5 + Math.sqrt(9 / 4 + 4 / y), esc = Math.exp(-tau), n = E.length;
  const N = Array.from(F, (v, i) => v / E[i]), out = N.map((v) => v * esc);
  for (let j = 0; j < n; j++) {
    if (!(N[j] > 0)) continue;
    if (E[j] >= kTe) { out[j] += N[j] * (1 - esc); continue; }
    let tot = 0; const w: number[] = [];
    for (let i = j; i < n; i++) { const v = (E[i] / E[j]) ** (1 - G) * Math.exp(-E[i] / kTe); w.push(v); tot += v; }
    w.forEach((v, k) => { out[j + k] += (N[j] * (1 - esc) * v) / tot; });
  }
  return out.map((v, i) => v * E[i]);
}

/** The wavelengths (nm) of discImage's spectra (M545). */
export const LAM = Array.from({ length: 17 }, (_, i) => 380 + 25 * i);
/** Planck's law per wavelength (nm), at T kelvin, in arbitrary units (λ in µm). */
const planck = (l: number, T: number) => { const lm = l * 1e-3; return 1 / (lm ** 5 * Math.expm1(14387.77 / (lm * Math.max(T, 1)))); };

/** The colour of a spectrum f(λ nm) (sRGB 0–1, brightest channel 1): through the CIE 1931 matching functions (Wyman,
 * Sloan and Shirley's fit), XYZ to linear sRGB, then the sRGB curve. M545: any spectrum, not only a black body's. */
export function spectrumRGB(f: (l: number) => number) {
  const g = (x: number, m: number, s1: number, s2: number) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const B = f(l);
    X += B * (1.056 * g(l, 599.8, 37.9, 31) + 0.362 * g(l, 442, 16, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2));
    Y += B * (0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1));
    Z += B * (1.217 * g(l, 437, 11.8, 36) + 0.681 * g(l, 459, 26, 13.8));
  }
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z].map((v) => Math.max(0, v));
  const top = Math.max(...lin) || 1;
  return lin.map((v) => { const x = v / top; return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; });
}
/** The colour of a black body at T kelvin: 1000 K is deep orange, 6500 K white, 20 000 K blue. */
export const blackbodyRGB = (T: number) => spectrumRGB((l) => planck(l, Math.max(T, 100)));
/** The colour of a spectrum sampled at LAM (linear between). */
export const sampledRGB = (v: ArrayLike<number>) => spectrumRGB((l) => { const x = (l - 380) / 25, i = Math.min(LAM.length - 2, Math.floor(x)), t = x - i; return v[i] * (1 - t) + v[i + 1] * t; });
