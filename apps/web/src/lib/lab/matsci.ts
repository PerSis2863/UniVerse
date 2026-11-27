// Hyperion's semiconductors and materials (M504, the owner's list, group 7 and MathWorks' semiconductors, metals,
// materials and mining): silicon's carriers, the pn junction by the depletion approximation (built-in potential, width,
// field, the band diagram), the diode's I–V by Shockley's equation with series resistance, the MOSFET's threshold from
// its doping and oxide and its square-law curves; materials' stress–strain (Ramberg–Osgood) and what a tensile test
// gives (modulus, 0.2% offset yield, strength, elongation, toughness), fatigue (Basquin's S–N line, Goodman's mean-stress
// correction, ASTM E1049 rainflow counting, Miner's rule); and grade estimation for mining (an experimental variogram,
// a spherical model, ordinary kriging, inverse distance weighting). SI units except where the field's own are clearer
// (cm⁻³ for doping, MPa for stress). Pure.
import { solve } from './optim';

export const Q = 1.602176634e-19, KB = 1.380649e-23, EPS0 = 8.8541878128e-14; // C, J/K, F/cm
export const SI = { epsR: 11.7, eg0: 1.17, alpha: 4.73e-4, beta: 636, nc300: 2.8e19, nv300: 1.04e19 }, SIO2_EPS = 3.9;
export const vt = (T = 300) => (KB * T) / Q;
/** Silicon's band gap at T (Varshni) and intrinsic carrier density (cm⁻³). */
export const siEg = (T = 300) => SI.eg0 - (SI.alpha * T * T) / (T + SI.beta);
export const siNi = (T = 300) => Math.sqrt(SI.nc300 * SI.nv300 * (T / 300) ** 3) * Math.exp(-siEg(T) / (2 * vt(T)));

/** A step pn junction (doping in cm⁻³, bias V forward positive), depletion approximation. Lengths in cm. */
export function pnJunction(Na: number, Nd: number, V = 0, T = 300, ni = siNi(T)) {
  const eps = SI.epsR * EPS0, vbi = vt(T) * Math.log((Na * Nd) / (ni * ni)), drop = vbi - V;
  const W = Math.sqrt(((2 * eps * Math.max(drop, 0)) / Q) * (1 / Na + 1 / Nd)), xn = (W * Na) / (Na + Nd), xp = (W * Nd) / (Na + Nd);
  return { vbi, W, xn, xp, emax: (Q * Nd * xn) / eps, drop };
}
/** The band diagram along x (cm, 0 at the junction, p side negative): Ec, Ev and the Fermi levels (eV, the p side's
 * Fermi level at 0 in equilibrium). */
export function bands(Na: number, Nd: number, V = 0, T = 300, n = 400) {
  const j = pnJunction(Na, Nd, V, T), ni = siNi(T), eps = SI.epsR * EPS0, eg = siEg(T), span = 2.5 * j.W || 1e-5;
  // ψ: the electrostatic potential, 0 deep in the p side, rising by the drop across the depletion region.
  const psi = (x: number) => {
    if (x <= -j.xp) return 0;
    if (x <= 0) return (Q * Na * (x + j.xp) ** 2) / (2 * eps);
    if (x <= j.xn) return j.drop - (Q * Nd * (j.xn - x) ** 2) / (2 * eps);
    return j.drop;
  };
  const efp = 0, ecP = efp + eg / 2 + vt(T) * Math.log(Na / ni); // Ec − Ef on the p side
  const x = Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));
  const ec = x.map((s) => ecP - psi(s)), ev = ec.map((v) => v - eg);
  return { x, ec, ev, efp: x.map(() => efp), efn: x.map(() => efp - V), ...j };
}
/** Shockley's diode with series resistance: I = Is (e^((V − I Rs)/(n Vt)) − 1), solved by Newton for each V. */
export function diodeCurrent(V: number, Is = 1e-14, n = 1, Rs = 0, T = 300) {
  const nv = n * vt(T);
  if (Rs === 0) return Is * Math.expm1(V / nv);
  // Newton on f(I) = I − Is(e^((V − I Rs)/nv) − 1), from the smaller of the two limits.
  let I = Math.min(Is * Math.expm1(Math.min(V, 40 * nv) / nv), V > 0 ? V / Rs : 0);
  for (let k = 0; k < 200; k++) {
    const e = Math.exp((V - I * Rs) / nv), f = I - Is * (e - 1), d = 1 + (Is * e * Rs) / nv, step = f / d;
    I -= step;
    if (Math.abs(step) < 1e-15 + 1e-12 * Math.abs(I)) break;
  }
  return I;
}
/** A MOSFET's threshold on p-type silicon: V_FB + 2φF + √(2 ε q Na 2φF) / Cox (Na cm⁻³, tox in nm). */
export function mosThreshold(Na: number, toxNm: number, Vfb = -0.9, T = 300) {
  const phiF = vt(T) * Math.log(Na / siNi(T)), cox = (SIO2_EPS * EPS0) / (toxNm * 1e-7), eps = SI.epsR * EPS0;
  return { vth: Vfb + 2 * phiF + Math.sqrt(2 * eps * Q * Na * 2 * phiF) / cox, phiF, cox };
}
/** Square law: cut off, triode, saturation (with channel-length modulation λ); k = μ Cox W/L (A/V²). */
export function mosfetId(vgs: number, vds: number, vth: number, k: number, lambda = 0) {
  const ov = vgs - vth;
  if (ov <= 0) return 0;
  if (vds < ov) return k * (ov * vds - (vds * vds) / 2) * (1 + lambda * vds);
  return 0.5 * k * ov * ov * (1 + lambda * vds);
}

// ——— Materials ———
export interface Material { name: string; E: number; yield: number; uts: number; n: number; elong: number; sf: number; b: number }
/** Typical room-temperature values (MPa; E in MPa; Ramberg–Osgood n; fatigue strength coefficient σf′ and Basquin b),
 * rounded textbook figures for teaching, not design data. */
export const MATERIALS: Record<string, Material> = {
  steel: { name: 'Structural steel (S355)', E: 210e3, yield: 355, uts: 510, n: 12, elong: 0.22, sf: 900, b: -0.09 },
  aluminium: { name: 'Aluminium 6061-T6', E: 69e3, yield: 276, uts: 310, n: 20, elong: 0.12, sf: 520, b: -0.085 },
  titanium: { name: 'Titanium Ti-6Al-4V', E: 114e3, yield: 880, uts: 950, n: 25, elong: 0.14, sf: 1600, b: -0.08 },
  copper: { name: 'Copper (annealed)', E: 117e3, yield: 70, uts: 220, n: 4, elong: 0.45, sf: 420, b: -0.1 },
};
/** Ramberg–Osgood: ε = σ/E + 0.002 (σ/σy)^n, up to the strength, then necking to failure (a falling tail). */
export function stressStrain(m: Material, points = 300) {
  const up = Array.from({ length: points }, (_, i) => (m.uts * i) / (points - 1)), eps = up.map((s) => s / m.E + 0.002 * (s / m.yield) ** m.n);
  const eU = eps[eps.length - 1], tail = Math.max(eU * 1.05, m.elong);
  for (let k = 1; k <= 30; k++) { const e = eU + ((tail - eU) * k) / 30; eps.push(e); up.push(m.uts * (1 - 0.25 * (k / 30) ** 2)); }
  return { strain: eps, stress: up };
}
/** What a tensile test gives: E (fit of the first part), the 0.2% offset yield, the strength, the elongation at
 * fracture (the plastic part) and the toughness (the area under the curve, MJ/m³ for MPa). */
export function tensile(strain: number[], stress: number[]) {
  const k = Math.max(3, Math.floor(strain.findIndex((_, i) => stress[i] > 0.4 * Math.max(...stress)) || 5));
  const xs = strain.slice(0, k), ys = stress.slice(0, k), mx = xs.reduce((s, v) => s + v, 0) / k, my = ys.reduce((s, v) => s + v, 0) / k;
  const E = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  // The offset line σ = E(ε − 0.002) meets the curve where their difference changes sign.
  let yieldS = NaN;
  for (let i = 1; i < strain.length; i++) {
    const g0 = stress[i - 1] - E * (strain[i - 1] - 0.002), g1 = stress[i] - E * (strain[i] - 0.002);
    if (g0 > 0 && g1 <= 0) { const t = g0 / (g0 - g1); yieldS = stress[i - 1] + t * (stress[i] - stress[i - 1]); break; }
  }
  const uts = Math.max(...stress), last = strain.length - 1;
  let tough = 0;
  for (let i = 1; i < strain.length; i++) tough += ((stress[i] + stress[i - 1]) / 2) * (strain[i] - strain[i - 1]);
  return { E, yield: yieldS, uts, elongation: strain[last] - stress[last] / E, toughness: tough };
}

/** Basquin: σa = σf′ (2N)^b; fitted to points (N, σa) in log–log. */
export function basquinFit(N: number[], S: number[]) {
  const x = N.map((n) => Math.log10(2 * n)), y = S.map(Math.log10), n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / x.reduce((s, v) => s + (v - mx) ** 2, 0);
  return { sf: 10 ** (my - b * mx), b };
}
/** Cycles to failure at an amplitude (and a mean, by Goodman against the strength). */
export const cyclesToFailure = (sa: number, sf: number, b: number, sm = 0, uts = Infinity) => { const eq = sa / (1 - sm / uts); return eq <= 0 || sm >= uts ? 0 : 0.5 * (eq / sf) ** (1 / b); };

/** ASTM E1049 rainflow counting: rows [range mean count] (count 1 or 0.5). */
export function rainflow(x: number[]) {
  // The turning points first.
  const tp: number[] = [];
  for (const v of x) { if (tp.length && v === tp[tp.length - 1]) continue; if (tp.length >= 2 && (tp[tp.length - 1] - tp[tp.length - 2]) * (v - tp[tp.length - 1]) > 0) tp[tp.length - 1] = v; else tp.push(v); }
  const out: [number, number, number][] = [], st: number[] = [];
  for (const p of tp) {
    st.push(p);
    while (st.length >= 3) {
      const Xr = Math.abs(st[st.length - 1] - st[st.length - 2]), Yr = Math.abs(st[st.length - 2] - st[st.length - 3]);
      if (Xr < Yr) break;
      if (st.length === 3) { out.push([Yr, (st[0] + st[1]) / 2, 0.5]); st.shift(); }
      else { out.push([Yr, (st[st.length - 2] + st[st.length - 3]) / 2, 1]); const last = st.pop()!; st.pop(); st.pop(); st.push(last); }
    }
  }
  for (let i = 0; i + 1 < st.length; i++) out.push([Math.abs(st[i + 1] - st[i]), (st[i] + st[i + 1]) / 2, 0.5]);
  return out;
}
/** Miner's rule: the damage Σ n/N of cycles [range mean count] (amplitude = range/2). Failure at 1. */
export function minerDamage(cycles: [number, number, number][], sf: number, b: number, uts = Infinity, scale = 1) {
  return cycles.reduce((d, [r, m, c]) => { const N = cyclesToFailure((r * scale) / 2, sf, b, m * scale, uts); return d + (N > 0 ? c / N : Infinity); }, 0);
}

// ——— Grade estimation ———
/** The experimental semivariogram: half the mean squared difference of pairs in each lag bin. */
export function variogram(xy: number[][], v: number[], lag: number, nlags: number) {
  const g = new Array(nlags).fill(0), c = new Array(nlags).fill(0);
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) { const h = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]), k = Math.floor(h / lag); if (k < nlags) { g[k] += 0.5 * (v[i] - v[j]) ** 2; c[k]++; } }
  return { h: g.map((_, k) => (k + 0.5) * lag), gamma: g.map((s, k) => (c[k] ? s / c[k] : NaN)), pairs: c };
}
/** A spherical model: nugget + sill × (1.5 h/a − 0.5 (h/a)³) up to the range a. */
export const spherical = (h: number, nugget: number, sill: number, range: number) => (h === 0 ? 0 : h >= range ? nugget + sill : nugget + sill * (1.5 * (h / range) - 0.5 * (h / range) ** 3));
/** Ordinary kriging at each query point with the spherical model: the estimate and its kriging variance. */
export function krige(xy: number[][], v: number[], q: number[][], model: [number, number, number]) {
  const n = v.length, gm = (a: number[], b: number[]) => spherical(Math.hypot(a[0] - b[0], a[1] - b[1]), ...model);
  const A = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === n && j === n ? 0 : i === n || j === n ? 1 : gm(xy[i], xy[j]))));
  return q.map((p) => {
    const b = [...xy.map((s) => gm(s, p)), 1], w = solve(A.map((r) => r.slice()), b);
    if (!w) return { est: NaN, var: NaN };
    return { est: w.slice(0, n).reduce((s, wi, i) => s + wi * v[i], 0), var: w.reduce((s, wi, i) => s + wi * b[i], 0) };
  });
}
/** Inverse distance weighting with power p (a data point itself returns its own value). */
export const idw = (xy: number[][], v: number[], q: number[][], p = 2) => q.map((pt) => {
  let sw = 0, s = 0;
  for (let i = 0; i < v.length; i++) { const d = Math.hypot(xy[i][0] - pt[0], xy[i][1] - pt[1]); if (d === 0) return v[i]; const w = d ** -p; sw += w; s += w * v[i]; }
  return s / sw;
});
