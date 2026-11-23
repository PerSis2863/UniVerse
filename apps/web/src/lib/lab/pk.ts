// Hyperion's pharmacokinetics (M493, the owner's list, group 7: biotech and pharma): how a drug's concentration in
// the blood rises and falls. One- and two-compartment models from the textbooks (Gibaldi and Perrier; Rowland and
// Tozer) as sums of exponentials, so any schedule of doses is a superposition of single doses: an IV bolus, an
// infusion over a while, or by mouth with first-order absorption. Steady state by summing the doses (a geometric
// series), a dosing window between the lowest level that works and the highest that is safe, non-compartmental
// analysis of measured levels, and Michaelis–Menten elimination (saturating, like phenytoin) by solving the equation.
// Units are the person's own, kept consistent: mg, L, h, mg/L by default. Pure: no language values here.
import { rk4Grid, root } from './sci-num';

export type Route = 'iv' | 'infusion' | 'oral';
export interface PkModel { cl: number; v: number; q?: number; v2?: number; ka?: number; f?: number; vmax?: number; km?: number }
export interface Dose { at: number; amount: number; route: Route; duration?: number }

/** The model's disposition as exponential modes: the concentration a unit amount in the central compartment gives is
 * Σ A_i e^(−λ_i t). */
export function modes(m: PkModel): { a: number; l: number }[] {
  const k10 = m.cl / m.v;
  if (!m.q || !m.v2) return [{ a: 1 / m.v, l: k10 }];
  const k12 = m.q / m.v, k21 = m.q / m.v2, s = k10 + k12 + k21, d = Math.sqrt(s * s - 4 * k10 * k21);
  const al = (s + d) / 2, be = (s - d) / 2;
  return [{ a: (al - k21) / (m.v * (al - be)), l: al }, { a: (k21 - be) / (m.v * (al - be)), l: be }];
}
/** The terminal half-life (the slowest mode). */
export const halfLife = (m: PkModel) => Math.LN2 / Math.min(...modes(m).map((x) => x.l));

/** The concentration t after one dose (0 before it). */
export function single(m: PkModel, d: Omit<Dose, 'at'>, t: number): number {
  if (t < 0) return 0;
  const ms = modes(m);
  if (d.route === 'iv') return d.amount * ms.reduce((s, x) => s + x.a * Math.exp(-x.l * t), 0);
  if (d.route === 'infusion') {
    const T = d.duration ?? 1, R = d.amount / T;
    return R * ms.reduce((s, x) => s + (x.a / x.l) * (t <= T ? 1 - Math.exp(-x.l * t) : (1 - Math.exp(-x.l * T)) * Math.exp(-x.l * (t - T))), 0);
  }
  const ka = m.ka ?? 1, F = m.f ?? 1;
  return F * d.amount * ms.reduce((s, x) => s + x.a * (Math.abs(ka - x.l) < 1e-9 * ka ? ka * t * Math.exp(-ka * t) : (ka / (ka - x.l)) * (Math.exp(-x.l * t) - Math.exp(-ka * t))), 0);
}

/** A regular schedule: `count` doses `every` hours from `start`. */
export const schedule = (amount: number, route: Route, every: number, count: number, duration?: number, start = 0): Dose[] =>
  Array.from({ length: count }, (_, k) => ({ at: start + k * every, amount, route, duration }));

/** Concentrations at the times t for a schedule (superposition), or by solving the equations when elimination
 * saturates (Vmax, Km). */
export function simulate(m: PkModel, doses: Dose[], t: number[]): number[] {
  if (m.vmax && m.km) return saturating(m, doses, t);
  return t.map((s) => doses.reduce((c, d) => c + single(m, d, s - d.at), 0));
}

/** One compartment (plus the gut for oral doses) with dA/dt = −Vmax C / (Km + C): mg/h and mg/L. */
function saturating(m: PkModel, doses: Dose[], t: number[]): number[] {
  const ka = m.ka ?? 1, F = m.f ?? 1, V = m.v, vmax = m.vmax!, km = m.km!;
  const rate = (s: number) => doses.reduce((r, d) => (d.route === 'infusion' && s >= d.at && s < d.at + (d.duration ?? 1) ? r + d.amount / (d.duration ?? 1) : r), 0);
  const f = (s: number, [gut, A]: number[]) => { const C = A / V; return [-ka * gut, ka * gut + rate(s) - (vmax * C) / (km + C)]; };
  // Integrate from mark to mark (the asked-for times, the doses, the infusions' ends), so a bolus lands exactly at its
  // time; a time asked for at a dose reads after it.
  const events = new Set([...doses.map((d) => d.at), ...doses.filter((d) => d.route === 'infusion').map((d) => d.at + (d.duration ?? 1))]);
  const marks = [...new Set([...t, ...events])].sort((x, z) => x - z), at = new Map<number, number>();
  let y = [0, 0], now = marks[0];
  for (const mk of marks) {
    if (mk > now) { y = rk4Grid(f, [now, mk], y, 0.02).y[1]; now = mk; }
    for (const d of doses) if (d.at === mk) { if (d.route === 'iv') y[1] += d.amount; else if (d.route === 'oral') y[0] += F * d.amount; }
    at.set(mk, y[1] / V);
  }
  return t.map((s) => at.get(s)!);
}

/** Steady state of a dose every τ: the profile over one interval (n points), its peak, trough and mean, the
 * accumulation (peak at steady state ÷ peak after the first dose) and the time to reach 90% of it. */
export function steadyState(m: PkModel, d: Omit<Dose, 'at'>, tau: number, n = 241) {
  const lmin = Math.min(...modes(m).map((x) => x.l), d.route === 'oral' ? m.ka ?? 1 : Infinity);
  const K = Math.min(100_000, Math.ceil(30 / (lmin * tau)) + 1);
  const t = Array.from({ length: n }, (_, i) => (i * tau) / (n - 1));
  const c = t.map((s) => { let sum = 0; for (let k = 0; k < K; k++) sum += single(m, d, s + k * tau); return sum; });
  const first = t.map((s) => single(m, d, s));
  const avg = ((d.route === 'oral' ? m.f ?? 1 : 1) * d.amount) / (m.cl * tau);
  return { t, c, max: Math.max(...c), min: Math.min(...c), avg, accumulation: Math.max(...c) / Math.max(...first), to90: Math.log(10) / Math.min(...modes(m).map((x) => x.l)) };
}

/** The longest interval and its dose that keep the steady state between `mec` (the lowest level that works) and
 * `mtc` (the highest that is safe), and a practical interval (4, 6, 8, 12, 24 h…) with its dose aimed at the middle
 * of the window (the geometric mean). */
export function dosingWindow(m: PkModel, mec: number, mtc: number, route: Route, duration?: number) {
  const ratio = (tau: number) => { const s = steadyState(m, { amount: 1, route, duration }, tau, 121); return s.max / s.min; };
  const target = mtc / mec, hi0 = 20 * halfLife(m);
  if (ratio(Math.max(1e-6, (duration ?? 0) * 1.001 || 1e-3)) > target) return null;
  const tauMax = ratio(hi0) <= target ? hi0 : root((tau) => ratio(tau) - target, Math.max(1e-3, (duration ?? 0) * 1.001), hi0, 1e-6);
  const dose = (tau: number, at: number) => at / steadyState(m, { amount: 1, route, duration }, tau).max;
  const nice = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 168].filter((x) => x <= tauMax && x > (duration ?? 0)).pop();
  const mid = Math.sqrt(mec * mtc);
  const practical = nice ? (() => { const s = steadyState(m, { amount: 1, route, duration }, nice); const a = mid / Math.sqrt(s.max * s.min); return { tau: nice, dose: a, max: a * s.max, min: a * s.min }; })() : null;
  return { tauMax, doseMax: dose(tauMax, mtc), practical };
}

/** Non-compartmental analysis of measured levels after one dose: Cmax, Tmax, AUC to the last sample (linear up, log
 * down), λz from the last `tail` points (log-linear least squares), AUC to infinity, half-life, clearance and Vz. */
export function nca(t: number[], c: number[], dose: number, tail = 3) {
  let k = 0;
  c.forEach((v, i) => { if (v > c[k]) k = i; });
  let auc = 0, aumc = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1], a = c[i - 1], b = c[i];
    if (b < a && b > 0 && a > 0) { const lr = Math.log(a / b); auc += ((a - b) * dt) / lr; aumc += (dt * (a * t[i - 1] - b * t[i])) / lr + ((a - b) * dt * dt) / (lr * lr); }
    else { auc += ((a + b) * dt) / 2; aumc += ((a * t[i - 1] + b * t[i]) * dt) / 2; }
  }
  const pts = t.map((x, i) => [x, c[i]]).slice(Math.max(k + 1, t.length - tail)).filter(([, y]) => y > 0);
  let lz = NaN;
  if (pts.length >= 2) {
    const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + Math.log(p[1]), 0) / n;
    lz = -pts.reduce((s, p) => s + (p[0] - mx) * (Math.log(p[1]) - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  }
  const last = c[c.length - 1], aucInf = lz > 0 ? auc + last / lz : NaN, aumcInf = lz > 0 ? aumc + (last * t[t.length - 1]) / lz + last / (lz * lz) : NaN;
  return { cmax: c[k], tmax: t[k], aucLast: auc, aucInf, lambdaZ: lz, halfLife: Math.LN2 / lz, cl: dose / aucInf, vz: dose / (aucInf * lz), mrt: aumcInf / aucInf };
}
