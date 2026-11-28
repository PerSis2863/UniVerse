// Hyperion's battery systems, part 2 (M571; MathWorks' "SOC Estimator (Kalman Filter)", "(Adaptive Kalman Filter)" and
// "SOH Estimator" examples): a cell's state of charge from its current and voltage by Coulomb counting, an extended
// or an unscented Kalman filter on an EcmCell with any number of RC pairs (states: SOC and each pair's voltage), and
// an adaptive filter that also follows R0 and the capacity as slow states, so the state of health (capacity now over
// new, and R0's growth) comes out with the SOC. Written fresh; Jacobians are taken numerically.

import { lookup, type EcmCell } from './cellfit';

/** SOC by counting charge: z(t) = z0 − η ∫ I dt / (3600 C), I + discharging (η applied while charging). */
export function coulombCount(current: ArrayLike<number>, dt: number, capacity: number, soc0 = 1, eta = 1) {
  const z: number[] = [];
  let s = soc0;
  for (let k = 0; k < current.length; k++) { z.push(s); const I = current[k]; s -= ((I < 0 ? eta : 1) * I * dt) / (3600 * capacity); }
  return z;
}

type Vec = number[];
type Mat = number[][];
const eye = (n: number, s = 1): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? s : 0)));
const mul = (A: Mat, B: Mat): Mat => A.map((r) => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)));
const tr = (A: Mat): Mat => A[0].map((_, j) => A.map((r) => r[j]));
const add = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((a, j) => a + B[i][j]));
/** Lower Cholesky factor of a symmetric positive matrix (nudged when it isn't quite). */
function chol(A: Mat): Mat {
  const n = A.length, L = eye(n, 0);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-18)) : s / L[j][j];
  }
  return L;
}

/** A filter's model: x' = f(x, I), y = h(x, I), with state bounds applied after each update. */
interface Model { n: number; f: (x: Vec, I: number) => Vec; h: (x: Vec, I: number) => number; clamp: (x: Vec) => Vec }

function jac(f: (x: Vec) => Vec, x: Vec): Mat {
  const f0 = f(x), J = f0.map(() => new Array(x.length).fill(0));
  x.forEach((xi, j) => { const d = 1e-6 * Math.max(1, Math.abs(xi)), xp = [...x]; xp[j] += d; const f1 = f(xp); f1.forEach((v, i) => { J[i][j] = (v - f0[i]) / d; }); });
  return J;
}

/** One measurement update then a prediction, by the EKF or UKF; returns the corrected state. */
function filterRun(m: Model, kind: 'ekf' | 'ukf', x0: Vec, P0: Mat, Q: Mat, R: number, I: ArrayLike<number>, v: ArrayLike<number>) {
  let x = x0, P = P0;
  const out: Vec[] = [], spread: number[] = [];
  const n = m.n, alpha = 1, beta = 2, kappa = 3 - n, lam = alpha * alpha * (n + kappa) - n;
  const wm = [lam / (n + lam), ...new Array(2 * n).fill(1 / (2 * (n + lam)))], wc = [wm[0] + 1 - alpha * alpha + beta, ...wm.slice(1)];
  const sigma = (x: Vec, P: Mat) => { const L = chol(P.map((r) => r.map((a) => a * (n + lam)))); return [x, ...L[0].map((_, j) => x.map((xi, i) => xi + L[i][j])), ...L[0].map((_, j) => x.map((xi, i) => xi - L[i][j]))]; };
  for (let k = 0; k < I.length; k++) {
    // Correct with the measured voltage.
    let K: Vec, yhat: number, S: number;
    if (kind === 'ekf') {
      yhat = m.h(x, I[k]);
      const H = jac((xx) => [m.h(xx, I[k])], x)[0], PH = P.map((r) => r.reduce((s, a, j) => s + a * H[j], 0));
      S = H.reduce((s, h, i) => s + h * PH[i], 0) + R; K = PH.map((p) => p / S);
    } else {
      const X = sigma(x, P), Y = X.map((xx) => m.h(xx, I[k]));
      yhat = Y.reduce((s, y, i) => s + wm[i] * y, 0);
      S = R + Y.reduce((s, y, i) => s + wc[i] * (y - yhat) ** 2, 0);
      K = x.map((_, a) => X.reduce((s, xx, i) => s + wc[i] * (xx[a] - x[a]) * (Y[i] - yhat), 0) / S);
    }
    const e = v[k] - yhat;
    x = m.clamp(x.map((xi, i) => xi + K[i] * e));
    P = P.map((r, i) => r.map((p, j) => p - K[i] * S * K[j]));
    P = P.map((r, i) => r.map((p, j) => (p + P[j][i]) / 2));
    out.push(x); spread.push(Math.sqrt(Math.max(0, P[0][0])));
    // Predict the next step.
    if (kind === 'ekf') {
      const F = jac((xx) => m.f(xx, I[k]), x);
      x = m.f(x, I[k]); P = add(mul(mul(F, P), tr(F)), Q);
    } else {
      const X = sigma(x, P).map((xx) => m.f(xx, I[k])), xm = x.map((_, a) => X.reduce((s, xx, i) => s + wm[i] * xx[a], 0));
      P = add(xm.map((_, a) => xm.map((__, b) => X.reduce((s, xx, i) => s + wc[i] * (xx[a] - xm[a]) * (xx[b] - xm[b]), 0))), Q);
      x = xm;
    }
    x = m.clamp(x);
  }
  return { states: out, spread };
}

export interface SocOptions { filter: 'ekf' | 'ukf'; soc0: number; p0: number; q: number; r: number }
export const SOC_DEFAULTS: SocOptions = { filter: 'ekf', soc0: 0.5, p0: 0.1, q: 1e-8, r: 1e-4 };

const lag = (c: EcmCell, z: number, i: number, dt: number) => Math.exp(-dt / lookup(c.soc, c.tau[i], z));

/** SOC (and its 1-sigma spread) from current (A, + discharging) and voltage every dt s. */
export function socFilter(c: EcmCell, current: ArrayLike<number>, voltage: ArrayLike<number>, dt: number, o: Partial<SocOptions> = {}) {
  const p = { ...SOC_DEFAULTS, ...o }, np = c.r.length, n = 1 + np;
  const m: Model = {
    n,
    f: (x, I) => [x[0] - (I * dt) / (3600 * c.capacity), ...x.slice(1).map((vi, i) => { const a = lag(c, x[0], i, dt); return a * vi + lookup(c.soc, c.r[i], x[0]) * (1 - a) * I; })],
    h: (x, I) => lookup(c.soc, c.ocv, x[0]) - I * lookup(c.soc, c.r0, x[0]) - x.slice(1).reduce((s, v) => s + v, 0),
    clamp: (x) => [Math.max(0, Math.min(1, x[0])), ...x.slice(1)],
  };
  const P0 = eye(n, 1e-6); P0[0][0] = p.p0;
  const Q = eye(n, p.q * 10); Q[0][0] = p.q;
  const r = filterRun(m, p.filter, [p.soc0, ...new Array(np).fill(0)], P0, Q, p.r, current, voltage);
  return { soc: r.states.map((x) => x[0]), spread: r.spread };
}

/** Capacity (Ah) from SOC estimates and the charge passed: over windows of `window` samples, Δz·C ≈ ΔAh, solved by
 * least squares weighted towards large swings (Σ Δz·ΔAh / Σ Δz²); windows with a swing under 5% are skipped. */
export function capacityFromSoc(soc: ArrayLike<number>, current: ArrayLike<number>, dt: number, window: number) {
  let num = 0, den = 0, ah = 0;
  const cum = [0];
  for (let k = 0; k < current.length; k++) cum.push((ah += (current[k] * dt) / 3600));
  for (let k = window; k < soc.length; k += Math.max(1, Math.floor(window / 4))) {
    const dz = soc[k - window] - soc[k], dq = cum[k] - cum[k - window];
    if (Math.abs(dz) < 0.05) continue;
    num += dz * dq; den += dz * dz;
  }
  return den > 0 ? num / den : NaN;
}

/** SOC from a rested voltage: the OCV table read backwards (it rises with SOC). */
export function socFromOcv(c: EcmCell, v: number) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (lookup(c.soc, c.ocv, m) < v) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** Capacity (Ah) from rests: after each rest of `rest` seconds or more the voltage gives the SOC (socFromOcv), and
 * between rests the charge passed over the SOC's change gives the capacity (least squares over consecutive rests with
 * a swing of 5% or more). NaN when there are too few. */
export function capacityFromRests(c: EcmCell, current: ArrayLike<number>, voltage: ArrayLike<number>, dt: number, rest = 300) {
  const pts: { z: number; ah: number }[] = [];
  let ah = 0, still = 0;
  for (let k = 0; k < current.length; k++) {
    if (Math.abs(current[k]) < 1e-9) still++;
    else { if (still * dt >= rest) pts.push({ z: socFromOcv(c, voltage[k - 1]), ah }); still = 0; }
    ah += (current[k] * dt) / 3600;
  }
  if (still * dt >= rest) pts.push({ z: socFromOcv(c, voltage[current.length - 1]), ah });
  let num = 0, den = 0;
  for (let i = 1; i < pts.length; i++) { const dz = pts[i - 1].z - pts[i].z, dq = pts[i].ah - pts[i - 1].ah; if (Math.abs(dz) >= 0.05) { num += dz * dq; den += dz * dz; } }
  return den > 0 && pts.length >= 3 ? num / den : NaN;
}

/** SOC with R0 followed as a slow state (an adaptive filter) and the capacity estimated alongside: from the rests
 * (capacityFromRests) when there are some, else by dual estimation (the filter's SOC swings against the charge passed,
 * the filter run again on that capacity, until it moves under 0.2%: at most 12 rounds; it leans towards the capacity
 * it starts from).
 * States: SOC, each pair's voltage, g = R0 / the table's R0. The state of health is the capacity over the new one. */
export function sohFilter(c: EcmCell, current: ArrayLike<number>, voltage: ArrayLike<number>, dt: number, o: Partial<SocOptions> & { qR?: number; window?: number; rest?: number } = {}) {
  const p = { ...SOC_DEFAULTS, filter: 'ukf' as const, ...o }, np = c.r.length, n = 2 + np, iG = 1 + np;
  const window = o.window ?? Math.round(3600 / dt);
  // The capacity from rests when the record has them; otherwise rounds of the filter against the charge passed.
  const rested = capacityFromRests(c, current, voltage, dt, o.rest ?? 300);
  let cap = Number.isFinite(rested) ? Math.max(0.2 * c.capacity, Math.min(1.5 * c.capacity, rested)) : c.capacity, r: ReturnType<typeof filterRun> | null = null;
  for (let round = 0; round < (Number.isFinite(rested) ? 1 : 12); round++) {
    const C = cap;
    const m: Model = {
      n,
      f: (x, I) => [x[0] - (I * dt) / (3600 * C), ...x.slice(1, iG).map((vi, i) => { const a = lag(c, x[0], i, dt); return a * vi + lookup(c.soc, c.r[i], x[0]) * x[iG] * (1 - a) * I; }), x[iG]],
      h: (x, I) => lookup(c.soc, c.ocv, x[0]) - I * x[iG] * lookup(c.soc, c.r0, x[0]) - x.slice(1, iG).reduce((s, v) => s + v, 0),
      clamp: (x) => [Math.max(0, Math.min(1, x[0])), ...x.slice(1, iG), Math.max(0.3, Math.min(5, x[iG]))],
    };
    const P0 = eye(n, 1e-6); P0[0][0] = p.p0; P0[iG][iG] = 0.25;
    const Q = eye(n, p.q * 10); Q[0][0] = p.q; Q[iG][iG] = o.qR ?? 1e-9;
    r = filterRun(m, p.filter, [p.soc0, ...new Array(np).fill(0), 1], P0, Q, p.r, current, voltage);
    if (Number.isFinite(rested)) break;
    const est = capacityFromSoc(r.states.map((x) => x[0]), current, dt, window);
    if (!Number.isFinite(est)) break;
    const next = Math.max(0.2 * c.capacity, Math.min(1.5 * c.capacity, est)), moved = Math.abs(next - cap) / cap;
    cap = next;
    if (moved < 0.002) break;
  }
  const st = r!.states;
  return { soc: st.map((x) => x[0]), r0Growth: st.map((x) => x[iG]), capacity: cap, soh: cap / c.capacity };
}
