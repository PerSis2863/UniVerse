// Hyperion's battery systems, part 3 (M572; MathWorks' Battery Single Particle block and its grouped parameter
// estimation): an electrochemical cell, the single particle model with electrolyte (SPMe). Written fresh from the
// standard equations (Marquis et al., J. Electrochem. Soc. 166, 2019): each electrode is one spherical particle in
// which lithium diffuses (Fick's law in shells, solved implicitly); the electrolyte's concentration across the
// negative electrode, separator and positive electrode is solved too, and its potential drop (concentration and ohmic)
// is added to the particles' open-circuit potentials and Butler–Volmer overpotentials. Default parameters: the LG M50
// 21700 cell measured by Chen et al. (J. Electrochem. Soc. 167, 2020), about 5 Ah, at 25 °C.

import { levenbergMarquardt } from './optim';

const F = 96485.33212, RG = 8.314462618;

export interface SpmeParams {
  T: number; // K
  area: number; // electrode area (m²)
  Ln: number; Ls: number; Lp: number; // thicknesses (m)
  Rn: number; Rp: number; // particle radii (m)
  epsSn: number; epsSp: number; // active material volume fractions
  epsEn: number; epsEs: number; epsEp: number; // electrolyte (porosities)
  cnMax: number; cpMax: number; // mol/m³
  Dn: number; Dp: number; // solid diffusivities (m²/s)
  kn: number; kp: number; // reaction rate constants (A/m² · (m³/mol)^1.5)
  ce0: number; De: number; kappa: number; tPlus: number; // electrolyte: mol/m³, m²/s, S/m, transference number
  x100: number; x0: number; y100: number; y0: number; // stoichiometries at 100% and 0% SOC
  rContact: number; // Ω, lumped (tabs, current collectors, film)
}

export const LGM50: SpmeParams = {
  T: 298.15, area: 0.1027, Ln: 85.2e-6, Ls: 12e-6, Lp: 75.6e-6, Rn: 5.86e-6, Rp: 5.22e-6,
  epsSn: 0.75, epsSp: 0.665, epsEn: 0.25, epsEs: 0.47, epsEp: 0.335, cnMax: 33133, cpMax: 63104,
  Dn: 3.3e-14, Dp: 4e-15, kn: 6.48e-7, kp: 3.42e-6, ce0: 1000, De: 1.769e-10, kappa: 0.95, tPlus: 0.2594,
  x100: 0.9014, x0: 0.0279, y100: 0.2661, y0: 0.9084, rContact: 0.01,
};

/** Chen et al.'s graphite (with a little silicon) and NMC 811 open-circuit potentials (V). */
export const ocpNeg = (x: number) => 1.9793 * Math.exp(-39.3631 * x) + 0.2482 - 0.0909 * Math.tanh(29.8538 * (x - 0.1234)) - 0.04478 * Math.tanh(14.9159 * (x - 0.2769)) - 0.0205 * Math.tanh(30.4444 * (x - 0.6103));
export const ocpPos = (y: number) => -0.809 * y + 4.4875 - 0.0428 * Math.tanh(18.5138 * (y - 0.5542)) - 17.7326 * Math.tanh(15.789 * (y - 0.3117)) + 17.5842 * Math.tanh(15.9308 * (y - 0.312));

/** The cell's capacity (Ah) from the negative electrode's usable lithium. */
export const spmeCapacity = (p: SpmeParams) => (p.epsSn * p.Ln * p.area * p.cnMax * (p.x100 - p.x0) * F) / 3600;

/** Solves a tridiagonal system (sub a, diagonal b, super c, right d) in place of d. */
function tridiag(a: Float64Array, b: Float64Array, c: Float64Array, d: Float64Array) {
  const n = d.length, cp = new Float64Array(n);
  cp[0] = c[0] / b[0]; d[0] /= b[0];
  for (let i = 1; i < n; i++) { const m = b[i] - a[i] * cp[i - 1]; cp[i] = c[i] / m; d[i] = (d[i] - a[i] * d[i - 1]) / m; }
  for (let i = n - 2; i >= 0; i--) d[i] -= cp[i] * d[i + 1];
}

/** A sphere in `n` shells of equal thickness: one implicit step of Fick's law with flux j (mol/m²s, out at the
 * surface) and the surface concentration extrapolated from the outer shells. */
class Particle {
  c: Float64Array; private r: Float64Array; private vol: Float64Array; private face: Float64Array;
  constructor(readonly R: number, readonly D: number, c0: number, readonly n = 12) {
    this.c = new Float64Array(n).fill(c0);
    const h = R / n;
    this.r = Float64Array.from({ length: n }, (_, i) => (i + 0.5) * h);
    this.vol = Float64Array.from({ length: n }, (_, i) => ((i + 1) ** 3 - i ** 3) * h ** 3 / 3);
    this.face = Float64Array.from({ length: n + 1 }, (_, i) => (i * h) ** 2);
  }
  step(dt: number, j: number) {
    const n = this.n, h = this.R / n, a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = Float64Array.from(this.c);
    for (let i = 0; i < n; i++) {
      const gin = i > 0 ? (this.D * this.face[i]) / h : 0, gout = i < n - 1 ? (this.D * this.face[i + 1]) / h : 0;
      a[i] = (-dt * gin) / this.vol[i]; c[i] = (-dt * gout) / this.vol[i]; b[i] = 1 - a[i] - c[i];
    }
    d[n - 1] -= (dt * j * this.face[n]) / this.vol[n - 1];
    tridiag(a, b, c, d);
    this.c = d;
  }
  /** The surface: the outer shell plus the gradient the flux sets over half a shell. */
  surface(j: number) { return this.c[this.n - 1] - (j * (this.R / this.n) * 0.5) / this.D; }
  mean() { let s = 0, v = 0; for (let i = 0; i < this.n; i++) { s += this.c[i] * this.vol[i]; v += this.vol[i]; } return s / v; }
}

export interface SpmeRun { v: number[]; soc: number[]; xSurf: number[]; ySurf: number[]; ce: number[][]; ceAt: number[] }

/** The cell under a current (A, + discharging) every dt s from a state of charge; stops at 2.5 V or 4.2 V+0.05. */
export function spmeSim(p: SpmeParams, current: ArrayLike<number>, dt: number, soc0 = 1, o: { keepCe?: number } = {}): SpmeRun {
  const x = p.x0 + soc0 * (p.x100 - p.x0), y = p.y0 + soc0 * (p.y100 - p.y0);
  const neg = new Particle(p.Rn, p.Dn, x * p.cnMax), pos = new Particle(p.Rp, p.Dp, y * p.cpMax);
  // The electrolyte: finite volumes across n | s | p (6, 3, 6 cells), Bruggeman's effective diffusivity ε^1.5.
  const nn = 6, ns = 3, np = 6, N = nn + ns + np, dx: number[] = [], eps: number[] = [], src: number[] = [];
  for (let i = 0; i < N; i++) {
    const zone = i < nn ? 0 : i < nn + ns ? 1 : 2;
    dx.push([p.Ln / nn, p.Ls / ns, p.Lp / np][zone]); eps.push([p.epsEn, p.epsEs, p.epsEp][zone]); src.push(zone === 0 ? 1 : zone === 2 ? -1 : 0);
  }
  let ce = new Float64Array(N).fill(p.ce0);
  const an = (3 * p.epsSn) / p.Rn, ap = (3 * p.epsSp) / p.Rp, th = (RG * p.T) / F;
  const out: SpmeRun = { v: [], soc: [], xSurf: [], ySurf: [], ce: [], ceAt: [] }, keep = o.keepCe ?? 0;
  const centres = dx.reduce<number[]>((acc, d, i) => { acc.push((i ? acc[i - 1] + dx[i - 1] / 2 : 0) + d / 2); return acc; }, []);
  out.ceAt = centres;
  for (let k = 0; k < current.length; k++) {
    const I = current[k], iden = I / p.area; // A/m² of electrode
    const jn = iden / (F * an * p.Ln), jp = -iden / (F * ap * p.Lp); // mol/m²s out of each particle's surface
    const xs = Math.min(1 - 1e-9, Math.max(1e-9, neg.surface(jn) / p.cnMax)), ys = Math.min(1 - 1e-9, Math.max(1e-9, pos.surface(jp) / p.cpMax));
    // The electrolyte's average concentration in each electrode for the exchange current.
    let cn = 0, cpp = 0;
    for (let i = 0; i < nn; i++) cn += ce[i] / nn;
    for (let i = nn + ns; i < N; i++) cpp += ce[i] / np;
    const i0n = p.kn * Math.sqrt(Math.max(cn, 1) * xs * p.cnMax * (1 - xs) * p.cnMax), i0p = p.kp * Math.sqrt(Math.max(cpp, 1) * ys * p.cpMax * (1 - ys) * p.cpMax);
    const etaN = 2 * th * Math.asinh((F * jn) / (2 * i0n)), etaP = 2 * th * Math.asinh((F * jp) / (2 * i0p));
    // Electrolyte potential drop from the negative to the positive current collector: concentration plus ohmic.
    const keff = eps.map((e) => p.kappa * e ** 1.5);
    let ohm = 0;
    for (let i = 0; i < N; i++) {
      // Current in the electrolyte rises across the negative electrode, is all of it in the separator, falls across the positive.
      const zf = i < nn ? (i + 0.5) / nn : i < nn + ns ? 1 : 1 - (i - nn - ns + 0.5) / np;
      ohm += (iden * zf * dx[i]) / keff[i];
    }
    const conc = 2 * th * (1 - p.tPlus) * Math.log(Math.max(ce[N - 1], 1) / Math.max(ce[0], 1));
    const v = ocpPos(ys) - ocpNeg(xs) + etaP - etaN + conc - ohm - I * p.rContact;
    out.v.push(v); out.xSurf.push(xs); out.ySurf.push(ys);
    out.soc.push((neg.mean() / p.cnMax - p.x0) / (p.x100 - p.x0));
    if (keep && k % keep === 0) out.ce.push([...ce]);
    if (v < 2.5 || v > 4.25 || !Number.isFinite(v)) break;
    // Step the particles and the electrolyte (implicit).
    neg.step(dt, jn); pos.step(dt, jp);
    const a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N), d = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const g = (q: number) => { const D1 = p.De * eps[i] ** 1.5, D2 = p.De * eps[q] ** 1.5; return 1 / ((dx[i] / 2) / D1 + (dx[q] / 2) / D2); };
      const gl = i > 0 ? g(i - 1) : 0, gr = i < N - 1 ? g(i + 1) : 0, cap = eps[i] * dx[i];
      a[i] = (-dt * gl) / cap; c[i] = (-dt * gr) / cap; b[i] = 1 - a[i] - c[i];
      // Lithium enters the electrolyte where the negative electrode gives it up and leaves at the positive.
      const zoneL = src[i] === 1 ? p.Ln : p.Lp;
      d[i] = ce[i] + (src[i] ? (dt * (1 - p.tPlus) * iden * src[i]) / (F * zoneL * eps[i]) : 0);
    }
    tridiag(a, b, c, d);
    ce = d;
  }
  return out;
}

/** The grouped parameters a fit can find from a cell's voltage alone: each electrode's diffusion time (R²/D, s), the
 * reaction rate scale and the contact resistance. */
export interface SpmeGroups { tauN: number; tauP: number; kScale: number; rContact: number }
export const groupsOf = (p: SpmeParams): SpmeGroups => ({ tauN: p.Rn ** 2 / p.Dn, tauP: p.Rp ** 2 / p.Dp, kScale: 1, rContact: p.rContact });
export const withGroups = (p: SpmeParams, g: SpmeGroups): SpmeParams => ({ ...p, Dn: p.Rn ** 2 / g.tauN, Dp: p.Rp ** 2 / g.tauP, kn: p.kn * g.kScale, kp: p.kp * g.kScale, rContact: g.rContact });

export const GROUP_NAMES: (keyof SpmeGroups)[] = ['tauN', 'tauP', 'kScale', 'rContact'];
/** Fits the chosen grouped parameters to a measured voltage (Levenberg–Marquardt on their logarithms, from the cell's
 * own values); a run that stops early (a cut-off voltage) counts its missing samples as 0.5 V off. */
export function spmeFit(p: SpmeParams, current: number[], voltage: number[], dt: number, soc0: number, fit: (keyof SpmeGroups)[] = GROUP_NAMES) {
  const g0 = groupsOf(p);
  const groups = (u: number[]) => { const g = { ...g0 }; fit.forEach((k, i) => { g[k] = g0[k] * Math.exp(u[i]); }); return g; };
  const resid = (u: number[]) => {
    const v = spmeSim(withGroups(p, groups(u)), current, dt, soc0).v;
    return voltage.map((m, k) => (k < v.length ? v[k] - m : 0.5));
  };
  const r = levenbergMarquardt(resid, fit.map(() => 0), { lb: fit.map(() => -5), ub: fit.map(() => 5), maxIter: 60 });
  const g = groups(r.x);
  return { groups: g, cell: withGroups(p, g), rms: Math.sqrt(r.residual.reduce((s, x) => s + x * x, 0) / Math.max(1, voltage.length)), iterations: r.iterations };
}
