// The numerics shared by Hyperion's science and industry toolboxes (M492–M505): a fixed-step Runge–Kutta on an
// output grid (models with switches in them, such as an epidemic's lockdown or a dose given at a set hour), adaptive
// Dormand–Prince 5(4) for smooth problems, and a Rosenbrock 2(3) method for stiff ones (the method behind ode23s,
// written from Shampine and Reichelt's paper). Pure: no language values here.
import { solve } from './optim';

export type Deriv = (t: number, y: number[]) => number[];
export interface OdeOut { t: number[]; y: number[][]; steps: number; evals: number; failed: number }

/** Classic RK4 at step ≤ h, reporting at every point of `grid` (which must rise). `onStep` may change y between steps
 * (a dose added, a spike reset): it gets the time reached and the state, and returns the state to carry on from. */
export function rk4Grid(f: Deriv, grid: number[], y0: number[], h: number, onStep?: (t: number, y: number[]) => number[]): OdeOut {
  let y = y0.slice(), evals = 0, steps = 0;
  const out: OdeOut = { t: [grid[0]], y: [y.slice()], steps: 0, evals: 0, failed: 0 };
  for (let k = 1; k < grid.length; k++) {
    const a = grid[k - 1], span = grid[k] - a, n = Math.max(1, Math.ceil(span / h - 1e-9)), dt = span / n;
    for (let s = 0; s < n; s++) {
      const t = a + s * dt;
      const k1 = f(t, y), y1 = y.map((v, i) => v + (dt / 2) * k1[i]);
      const k2 = f(t + dt / 2, y1), y2 = y.map((v, i) => v + (dt / 2) * k2[i]);
      const k3 = f(t + dt / 2, y2), y3 = y.map((v, i) => v + dt * k3[i]);
      const k4 = f(t + dt, y3);
      y = y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      evals += 4; steps++;
      if (onStep) y = onStep(t + dt, y);
    }
    out.t.push(grid[k]); out.y.push(y.slice());
  }
  out.steps = steps; out.evals = evals;
  return out;
}

const errNorm = (e: number[], y: number[], yn: number[], rtol: number, atol: number) =>
  Math.max(...e.map((v, i) => Math.abs(v) / (atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yn[i])))), 0);

/** Dormand–Prince 5(4) with step control. With `o.at` (rising times inside [t0, tf]) steps are shortened to land on
 * each of them and only those are reported (no interpolation error); otherwise every accepted step is. */
export function rk45(f: Deriv, t0: number, tf: number, y0: number[], rtol = 1e-6, atol = 1e-9, maxSteps = 200_000, o: { at?: number[]; maxStep?: number } = {}): OdeOut {
  const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
  const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1], E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
  const dir = Math.sign(tf - t0) || 1;
  let t = t0, y = y0.slice(), h = dir * Math.min(Math.abs(tf - t0) / 100, 0.1 * Math.max(1e-3, Math.abs(tf - t0))), evals = 1, failed = 0, steps = 0;
  let k0 = f(t, y);
  const at = o.at, out: OdeOut = at ? { t: [], y: [], steps: 0, evals: 0, failed: 0 } : { t: [t], y: [y.slice()], steps: 0, evals: 0, failed: 0 };
  let next = 0;
  if (at) while (next < at.length && Math.abs(at[next] - t) <= 1e-12 * Math.max(1, Math.abs(t))) { out.t.push(at[next]); out.y.push(y.slice()); next++; }
  const hmax = o.maxStep ?? Infinity;
  while (dir * (tf - t) > 1e-12 * Math.max(1, Math.abs(tf)) && steps + failed < maxSteps) {
    if (Math.abs(h) > hmax) h = dir * hmax;
    const stop = at && next < at.length ? at[next] : tf;
    const clipped = dir * (t + h - stop) >= 0;
    const hTry = h;
    if (clipped) h = stop - t;
    const K = [k0];
    for (let s = 1; s < 7; s++) K.push(f(t + C[s] * h, y.map((v, i) => v + h * A[s].reduce((acc, a, j) => acc + a * K[j][i], 0))));
    evals += 6;
    const yn = y.map((v, i) => v + h * A[6].reduce((acc, a, j) => acc + a * K[j][i], 0));
    const err = errNorm(y.map((_, i) => h * E.reduce((acc, e, j) => acc + e * K[j][i], 0)), y, yn, rtol, atol);
    if (err <= 1) {
      t = clipped ? stop : t + h; y = yn; k0 = K[6]; steps++;
      if (!at) { out.t.push(t); out.y.push(y.slice()); }
      else if (clipped && next < at.length) { out.t.push(at[next]); out.y.push(y.slice()); next++; }
    } else failed++;
    const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
    h *= Number.isFinite(fac) ? fac : 0.2;
    // A step shortened only to land on an output time doesn't shrink the next one.
    if (clipped && err <= 1) h = dir * Math.max(Math.abs(h), Math.abs(hTry));
    if (Math.abs(h) < 16 * Number.EPSILON * Math.max(Math.abs(t), 1e-3 * Math.abs(tf - t0))) throw new Error('The step size became too small: the problem may be stiff (try ode15s).');
  }
  out.steps = steps; out.evals = evals; out.failed = failed;
  return out;
}

/** The Jacobian ∂f/∂y by forward differences. */
export function jacobian(f: Deriv, t: number, y: number[], fy: number[]): number[][] {
  return y.map((v, j) => {
    const d = 1e-7 * Math.max(1, Math.abs(v)), z = y.slice(); z[j] += d;
    const fz = f(t, z);
    return fz.map((q, i) => (q - fy[i]) / d);
  }).reduce<number[][]>((J, colj, j) => { colj.forEach((q, i) => { (J[i] ??= [])[j] = q; }); return J; }, []);
}

/** Rosenbrock 2(3) for stiff problems (an L-stable method: large steps through fast, decaying parts). */
export function ros23(f: Deriv, t0: number, tf: number, y0: number[], rtol = 1e-3, atol = 1e-6, maxSteps = 100_000): OdeOut {
  const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2, n = y0.length;
  let t = t0, y = y0.slice(), h = (tf - t0) / 100, evals = 0, failed = 0, steps = 0;
  const out: OdeOut = { t: [t], y: [y.slice()], steps: 0, evals: 0, failed: 0 };
  // A first step from the size of the derivative.
  const f00 = f(t, y); evals++;
  const rate = Math.max(...f00.map((v, i) => Math.abs(v) / (atol + rtol * Math.abs(y[i]))), 1e-10);
  h = Math.sign(tf - t0) * Math.min(Math.abs(tf - t0), Math.max(1e-10 * Math.abs(tf - t0), 0.8 * rtol ** (1 / 3) / rate));
  while ((tf - t) * Math.sign(tf - t0) > 1e-12 * Math.max(1, Math.abs(tf)) && steps + failed < maxSteps) {
    if ((t + h - tf) * Math.sign(h) > 0) h = tf - t;
    const F0 = f(t, y), J = jacobian(f, t, y, F0); evals += 1 + n;
    const dt = 1e-7 * Math.max(1, Math.abs(t)), Ft = f(t + dt, y).map((v, i) => (v - F0[i]) / dt); evals++;
    const W = J.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - h * d * v));
    const sol = (b: number[]) => { const x = solve(W, b); if (!x) throw new Error('The stiff solver met a singular matrix.'); return x; };
    const k1 = sol(F0.map((v, i) => v + h * d * Ft[i]));
    const F1 = f(t + 0.5 * h, y.map((v, i) => v + 0.5 * h * k1[i]));
    const k2 = sol(F1.map((v, i) => v - k1[i])).map((v, i) => v + k1[i]);
    const yn = y.map((v, i) => v + h * k2[i]);
    const F2 = f(t + h, yn); evals += 2;
    const k3 = sol(F2.map((v, i) => v - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + h * d * Ft[i]));
    const err = errNorm(k1.map((v, i) => (h / 6) * (v - 2 * k2[i] + k3[i])), y, yn, rtol, atol);
    if (err <= 1 && yn.every(Number.isFinite)) { t += h; y = yn; steps++; out.t.push(t); out.y.push(y.slice()); }
    else failed++;
    h *= Number.isFinite(err) ? Math.min(5, Math.max(0.2, 0.8 * (err || 1e-10) ** (-1 / 3))) : 0.2;
    if (Math.abs(h) < 16 * Number.EPSILON * Math.max(Math.abs(t), 1e-3 * Math.abs(tf - t0))) throw new Error('The step size became too small.');
  }
  out.steps = steps; out.evals = evals; out.failed = failed;
  return out;
}

/** Linear interpolation of a solution onto times `at`. */
export function sample(o: OdeOut, at: number[]): number[][] {
  let k = 0;
  return at.map((s) => {
    while (k < o.t.length - 2 && o.t[k + 1] < s) k++;
    const a = o.t[k], b = o.t[Math.min(k + 1, o.t.length - 1)], w = b > a ? Math.min(1, Math.max(0, (s - a) / (b - a))) : 0;
    return o.y[k].map((v, i) => v + w * (o.y[Math.min(k + 1, o.t.length - 1)][i] - v));
  });
}

/** Bisection mixed with secant steps for a root of g on [a, b] (g(a), g(b) of opposite signs). */
export function root(g: (x: number) => number, a: number, b: number, tol = 1e-12): number {
  let fa = g(a), fb = g(b);
  if (fa === 0) return a; if (fb === 0) return b;
  if (fa * fb > 0) return NaN;
  for (let k = 0; k < 200 && Math.abs(b - a) > tol * Math.max(1, Math.abs(a)); k++) {
    const s = b - (fb * (b - a)) / (fb - fa), m = (a + b) / 2, x = s > Math.min(a, b) && s < Math.max(a, b) && k % 3 !== 2 ? s : m, fx = g(x);
    if (fx === 0) return x;
    if (fa * fx < 0) { b = x; fb = fx; } else { a = x; fa = fx; }
  }
  return (a + b) / 2;
}
