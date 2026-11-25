// Hyperion's physics (M497, the owner's list, group 7): mechanics (a projectile with air drag, the pendulum without the
// small-angle shortcut and its exact period by the arithmetic–geometric mean, the chaotic double pendulum, gravity
// between bodies by a symplectic integrator, a charged particle in electric and magnetic fields by the Boris push),
// waves (a plucked string by its Fourier modes, slits' interference, the ripples of point sources) and fields (point
// charges' field and potential). SI units throughout. Every result is a function of time, so a slider on time films
// it (Hyperion's Sweep). Pure: no language values here.
import { rk45 } from './sci-num';

export const G_NEWTON = 6.6743e-11, K_COULOMB = 8.9875517923e9;

/** A projectile from the ground at speed v and angle θ (degrees); drag k = ½ ρ Cd A / m (1/m) slows it by k|v|v. */
export function projectile(v0: number, angleDeg: number, k = 0, g = 9.81, h0 = 0) {
  const th = (angleDeg * Math.PI) / 180, vx = v0 * Math.cos(th), vy = v0 * Math.sin(th);
  const f = (_: number, [, , u, w]: number[]) => { const s = Math.hypot(u, w); return [u, w, -k * s * u, -g - k * s * w]; };
  // Long enough to land: the drag-free time, at least.
  const guess = Math.max(0.1, (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, h0))) / g) * 1.05 + 0.1;
  const r = rk45(f, 0, guess, [0, h0, vx, vy], 1e-9, 1e-9, 200_000, { maxStep: guess / 400 });
  let k2 = r.y.findIndex((y, i) => i > 0 && y[1] < 0);
  if (k2 < 0) k2 = r.y.length - 1;
  // The landing between the last two steps (linear in height is enough at these step sizes; refined by a bisection).
  const a = r.t[k2 - 1], b = r.t[k2];
  let lo = a, hi = b;
  const yAt = (t: number) => (t <= a ? r.y[k2 - 1] : rk45(f, a, t, r.y[k2 - 1], 1e-10, 1e-10, 200_000, { at: [t] }).y[0]);
  for (let i = 0; i < 50 && hi - lo > 1e-12 * (1 + hi); i++) { const m = (lo + hi) / 2; if (yAt(m)[1] > 0) lo = m; else hi = m; }
  const land = (lo + hi) / 2, end = yAt(land);
  const t = [...r.t.slice(0, k2), land], y = [...r.y.slice(0, k2), end];
  return { t, x: y.map((s) => s[0]), y: y.map((s) => s[1]), vx: y.map((s) => s[2]), vy: y.map((s) => s[3]), range: end[0], flight: land, top: Math.max(...y.map((s) => s[1])), impact: Math.hypot(end[2], end[3]) };
}

/** The complete elliptic integral of the first kind K(k) by the arithmetic–geometric mean. */
export function ellipticK(k: number) { let a = 1, b = Math.sqrt(1 - k * k); for (let i = 0; i < 40 && Math.abs(a - b) > 1e-16 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]; return Math.PI / (2 * a); }
/** A pendulum's exact period from rest at θ0 (degrees): 4 √(L/g) K(sin(θ0/2)). */
export const pendulumPeriod = (L: number, theta0Deg: number, g = 9.81) => 4 * Math.sqrt(L / g) * ellipticK(Math.sin((theta0Deg * Math.PI) / 360));

/** θ'' = −(g/L) sin θ − b θ' (radians out), reported at the times `at`. */
export function pendulum(L: number, theta0Deg: number, at: number[], o: { omega0?: number; damping?: number; g?: number } = {}) {
  const g = o.g ?? 9.81, b = o.damping ?? 0;
  return rk45((_, [th, w]) => [w, -(g / L) * Math.sin(th) - b * w], at[0], at[at.length - 1], [(theta0Deg * Math.PI) / 180, o.omega0 ?? 0], 1e-10, 1e-12, 1_000_000, { at }).y;
}

/** Two equal-length rods with point masses (Lagrange's equations); angles from the vertical, radians out. */
export function doublePendulum(m1: number, m2: number, L1: number, L2: number, th1: number, th2: number, at: number[], g = 9.81) {
  const f = (_: number, [a, b, w1, w2]: number[]) => {
    const d = a - b, den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    const a1 = (-g * (2 * m1 + m2) * Math.sin(a) - m2 * g * Math.sin(a - 2 * b) - 2 * Math.sin(d) * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) / (L1 * den);
    const a2 = (2 * Math.sin(d) * (w1 * w1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a) + w2 * w2 * L2 * m2 * Math.cos(d))) / (L2 * den);
    return [w1, w2, a1, a2];
  };
  const s = rk45(f, at[0], at[at.length - 1], [(th1 * Math.PI) / 180, (th2 * Math.PI) / 180, 0, 0], 1e-10, 1e-12, 1_000_000, { at }).y, energy = (y: number[]) => {
    const [a, b, w1, w2] = y, v1 = L1 * w1, v2sq = v1 * v1 + (L2 * w2) ** 2 + 2 * L1 * L2 * w1 * w2 * Math.cos(a - b);
    return 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2sq - (m1 + m2) * g * L1 * Math.cos(a) - m2 * g * L2 * Math.cos(b);
  };
  return { s, energy: s.map(energy) };
}

/** Bodies under their mutual gravity (2D or 3D), by velocity Verlet (symplectic: the energy stays bounded for good)
 * with a softening length eps; positions every `every` steps. */
export function nbody(m: number[], pos: number[][], vel: number[][], T: number, dt: number, o: { G?: number; eps?: number; every?: number } = {}) {
  const n = m.length, D = pos[0].length, G = o.G ?? G_NEWTON, eps2 = (o.eps ?? 0) ** 2, every = o.every ?? 1;
  const x = pos.map((p) => p.slice()), v = vel.map((p) => p.slice());
  const acc = () => {
    const a = x.map(() => new Array(D).fill(0));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = x[j].map((q, k) => q - x[i][k]), r2 = d.reduce((s, q) => s + q * q, 0) + eps2, inv = 1 / (r2 * Math.sqrt(r2));
      for (let k = 0; k < D; k++) { a[i][k] += G * m[j] * d[k] * inv; a[j][k] -= G * m[i] * d[k] * inv; }
    }
    return a;
  };
  const energy = () => {
    let e = 0;
    for (let i = 0; i < n; i++) { e += 0.5 * m[i] * v[i].reduce((s, q) => s + q * q, 0); for (let j = i + 1; j < n; j++) e -= (G * m[i] * m[j]) / Math.sqrt(x[j].reduce((s, q, k) => s + (q - x[i][k]) ** 2, 0) + eps2); }
    return e;
  };
  const steps = Math.round(T / dt), times = [0], track = [x.map((p) => p.slice())], E = [energy()];
  let a = acc();
  for (let s = 1; s <= steps; s++) {
    for (let i = 0; i < n; i++) for (let k = 0; k < D; k++) { v[i][k] += 0.5 * dt * a[i][k]; x[i][k] += dt * v[i][k]; }
    a = acc();
    for (let i = 0; i < n; i++) for (let k = 0; k < D; k++) v[i][k] += 0.5 * dt * a[i][k];
    if (s % every === 0 || s === steps) { times.push(s * dt); track.push(x.map((p) => p.slice())); E.push(energy()); }
  }
  return { t: times, x: track, energy: E, v };
}

/** A charge q (C) of mass m (kg) in uniform E (V/m) and B (T) fields, 3D, by the Boris push (it keeps the speed
 * exactly in a pure magnetic field). */
export function chargedParticle(q: number, m: number, E: number[], B: number[], r0: number[], v0: number[], T: number, dt: number) {
  const steps = Math.round(T / dt), r = r0.slice(), v = v0.slice(), out = [r.slice()], ts = [0], qm = (q / m) * (dt / 2);
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let s = 1; s <= steps; s++) {
    const vm = v.map((x, i) => x + qm * E[i]), t = B.map((b) => qm * b), t2 = t.reduce((p, x) => p + x * x, 0), sv = t.map((x) => (2 * x) / (1 + t2));
    const vp = vm.map((x, i) => x + cross(vm, t)[i]), vplus = vm.map((x, i) => x + cross(vp, sv)[i]);
    for (let i = 0; i < 3; i++) { v[i] = vplus[i] + qm * E[i]; r[i] += dt * v[i]; }
    out.push(r.slice()); ts.push(s * dt);
  }
  return { t: ts, r: out, v };
}

/** A string fixed at both ends, plucked at `at` (0–1 of its length) to height h, by its Fourier modes (`modes` of
 * them): y(x, t) = Σ b_n sin(nπx/L) cos(nπct/L) e^(−γt). */
export function pluckedString(L: number, c: number, at: number, h: number, x: number[], t: number, modes = 200, damping = 0) {
  const p = at * L, b = Array.from({ length: modes }, (_, i) => { const n = i + 1; return (2 * h * L * L * Math.sin((n * Math.PI * p) / L)) / (n * n * Math.PI * Math.PI * p * (L - p)); });
  return x.map((xx) => b.reduce((s, bn, i) => s + bn * Math.sin(((i + 1) * Math.PI * xx) / L) * Math.cos(((i + 1) * Math.PI * c * t) / L), 0) * Math.exp(-damping * t));
}

/** N slits of width a, d apart, lit by wavelength λ, seen on a screen D away: relative intensity at x (Fraunhofer). */
export function slits(lambda: number, d: number, a: number, N: number, D: number, x: number[]) {
  return x.map((xx) => {
    const s = xx / Math.hypot(xx, D), beta = (Math.PI * a * s) / lambda, phi = (2 * Math.PI * d * s) / lambda;
    const env = Math.abs(beta) < 1e-12 ? 1 : (Math.sin(beta) / beta) ** 2;
    const grating = Math.abs(Math.sin(phi / 2)) < 1e-12 ? N * N : (Math.sin((N * phi) / 2) / Math.sin(phi / 2)) ** 2;
    return (env * grating) / (N * N);
  });
}

/** Circular waves from point sources [x y amplitude phase] at time t: Σ A cos(k r − ωt + φ) / √r (2D spreading). */
export function waveField(src: number[][], lambda: number, f: number, X: number[], Y: number[], t: number) {
  const k = (2 * Math.PI) / lambda, w = 2 * Math.PI * f;
  return Y.map((y) => X.map((x) => src.reduce((s, [sx, sy, A = 1, ph = 0]) => { const r = Math.max(Math.hypot(x - sx, y - sy), lambda / 20); return s + (A * Math.cos(k * r - w * t + ph)) / Math.sqrt(r / lambda); }, 0)));
}

/** Point charges [x y q]: the field (V/m) and potential (V) on a grid; inside `core` of a charge NaN (it diverges). */
export function pointCharges(charges: number[][], X: number[], Y: number[], core = 0) {
  const Ex: number[][] = [], Ey: number[][] = [], V: number[][] = [];
  for (const y of Y) {
    const ex: number[] = [], ey: number[] = [], v: number[] = [];
    for (const x of X) {
      let a = 0, b = 0, p = 0, inside = false;
      for (const [cx, cy, q] of charges) {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
        if (r <= core || r === 0) { inside = true; break; }
        a += (K_COULOMB * q * dx) / r ** 3; b += (K_COULOMB * q * dy) / r ** 3; p += (K_COULOMB * q) / r;
      }
      ex.push(inside ? NaN : a); ey.push(inside ? NaN : b); v.push(inside ? NaN : p);
    }
    Ex.push(ex); Ey.push(ey); V.push(v);
  }
  return { Ex, Ey, V };
}
