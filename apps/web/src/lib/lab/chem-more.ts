// Hyperion's chemistry, the left-outs of M513 (M516): a packed-bed reactor in the gas phase with Ergun's pressure drop
// (the volumetric flow grows as moles are made and the pressure falls: Fogler's chapter 5), rate laws that aren't mass
// action (Langmuir–Hinshelwood, or any rate the person writes) in a batch, a PFR or the packed bed, and Pitzer's
// equations for one salt in water at 25 °C (activity and osmotic coefficients, water's activity) where Davies' equation
// fails (past about 0.5 mol/kg). Pure: no language values here.
import { R_GAS, reactionRates, stoichiometry, type Mechanism } from './chem';
import { ros23, type OdeOut } from './sci-num';

/** Net rate of each reaction from the concentrations (mol/L) and the temperature (K). */
export type RateLaw = (c: number[], T: number) => number[];
export const massAction = (m: Mechanism, k: number[]): RateLaw => { const rr = reactionRates(m); return (c) => rr(c, k); };

/** A batch (or constant-density PFR at t = τ) with any rate law. */
export function rateLawBatch(m: Mechanism, rate: RateLaw, c0: number[], tEnd: number, T = 298.15): OdeOut {
  const nu = stoichiometry(m), S = m.species.length;
  return ros23((_, c) => { const r = rate(c, T), d = new Array(S).fill(0); r.forEach((x, j) => nu[j].forEach((v, i) => { if (v) d[i] += v * x; })); return d; }, 0, tEnd, c0, 1e-6, 1e-10 * Math.max(1e-12, ...c0));
}

/** Langmuir–Hinshelwood: rate = k Π_{i<n} K_i p_i / (1 + Σ K_i p_i)^n, the first n species reacting on n sites
 * (n = 1: one adsorbed reactant; n = 2: two adsorbed reactants meeting on the surface); the rest only take sites. */
export function lhRate(k: number, K: number[], p: number[], n: number): number {
  let top = k, den = 1;
  for (let i = 0; i < K.length; i++) { const kp = K[i] * Math.max(0, p[i]); den += kp; if (i < n) top *= kp; }
  return top / den ** n;
}

export interface PackedBed { P0: number; T: number; alpha: number }
export interface BedOut { W: number[]; F: number[][]; y: number[]; c: number[][]; v: number[]; stoppedAt?: number }
/** Ergun's α (1/kg) from the bed: superficial mass flux G (kg/(m²·s)), particle size Dp (m), void fraction φ, gas
 * viscosity μ (Pa·s), inlet gas density ρ0 (kg/m³), cross-section Ac (m²), catalyst density ρc (kg/m³), P0 (Pa). */
export function ergunAlpha(G: number, Dp: number, phi: number, mu: number, rho0: number, Ac: number, rhoc: number, P0: number) {
  const beta0 = (G * (1 - phi)) / (rho0 * Dp * phi ** 3) * ((150 * (1 - phi) * mu) / Dp + 1.75 * G);
  return { alpha: (2 * beta0) / (Ac * rhoc * (1 - phi) * P0), beta0 };
}
/** Isothermal gas-phase packed bed along the catalyst mass W (kg): dFᵢ/dW = Σ νᵢⱼ r′ⱼ (r′ per kg of catalyst, from
 * concentrations Cᵢ = C_T0 (Fᵢ/F_T) y), dy/dW = −α/(2y) · F_T/F_T0, y = P/P0. α = 0: a gas PFR whose flow still grows
 * with the moles. Stops where the pressure is all but gone (y < 0.01). Flows in mol/s, P0 in Pa, C in mol/L. */
export function packedBed(m: Mechanism, rate: RateLaw, F0: number[], Wend: number, b: PackedBed): BedOut {
  const nu = stoichiometry(m), S = m.species.length, FT0 = F0.reduce((s, x) => s + x, 0);
  if (!(FT0 > 0)) throw new Error('Some gas must flow in (a molar flow > 0).');
  const CT0 = b.P0 / (R_GAS * b.T) / 1000, v0 = FT0 / CT0;
  const conc = (z: number[]) => { const FT = z.slice(0, S).reduce((s, x) => s + Math.max(0, x), 0) || 1e-300, y = Math.max(z[S], 1e-6); return z.slice(0, S).map((f) => (CT0 * Math.max(0, f) * y) / FT); };
  const f = (_: number, z: number[]) => {
    const r = rate(conc(z), b.T), d = new Array(S + 1).fill(0);
    r.forEach((x, j) => nu[j].forEach((v, i) => { if (v) d[i] += v * x; }));
    const FT = z.slice(0, S).reduce((s, x) => s + Math.max(0, x), 0);
    d[S] = (-b.alpha / (2 * Math.max(z[S], 1e-3))) * (FT / FT0);
    return d;
  };
  const o = ros23(f, 0, Wend, [...F0, 1], 1e-6, 1e-10 * FT0);
  const out: BedOut = { W: [], F: [], y: [], c: [], v: [] };
  for (let i = 0; i < o.t.length; i++) {
    const z = o.y[i];
    if (z[S] < 0.01) { out.stoppedAt = o.t[i]; break; }
    const FT = z.slice(0, S).reduce((s, x) => s + x, 0);
    out.W.push(o.t[i]); out.F.push(z.slice(0, S)); out.y.push(z[S]); out.c.push(conc(z)); out.v.push((v0 * FT) / FT0 / z[S]);
  }
  return out;
}

// ——— Pitzer ———
export interface PitzerSalt { zM: number; zX: number; nuM: number; nuX: number; beta0: number; beta1: number; beta2: number; Cphi: number }
const s11 = (beta0: number, beta1: number, Cphi: number): PitzerSalt => ({ zM: 1, zX: -1, nuM: 1, nuX: 1, beta0, beta1, beta2: 0, Cphi });
// 2:1 salts as Pitzer and Mayorga (1973) print them: (4/3)β0, (4/3)β1, (2^(5/2)/3)Cφ.
const s21 = (zM: number, b0: number, b1: number, c: number): PitzerSalt => {
  const two = zM === 2;
  return { zM: two ? 2 : 1, zX: two ? -1 : -2, nuM: two ? 1 : 2, nuX: two ? 2 : 1, beta0: (3 / 4) * b0, beta1: (3 / 4) * b1, beta2: 0, Cphi: (3 / 2 ** 2.5) * c };
};
/** 25 °C parameters: Pitzer and Mayorga (1973) for 1:1 and 2:1, Pitzer and Mayorga (1974) for 2:2. */
export const PITZER: Record<string, PitzerSalt & { max: number }> = {
  NaCl: { ...s11(0.0765, 0.2664, 0.00127), max: 6 }, KCl: { ...s11(0.04835, 0.2122, -0.00084), max: 4.8 },
  LiCl: { ...s11(0.1494, 0.3074, 0.00359), max: 6 }, HCl: { ...s11(0.1775, 0.2945, 0.0008), max: 6 },
  NaBr: { ...s11(0.0973, 0.2791, 0.00116), max: 4 }, KBr: { ...s11(0.0569, 0.2212, -0.0018), max: 5.5 },
  NaOH: { ...s11(0.0864, 0.253, 0.0044), max: 6 }, KOH: { ...s11(0.1298, 0.32, 0.0041), max: 5.5 },
  NaNO3: { ...s11(0.0068, 0.1783, -0.00072), max: 6 }, KNO3: { ...s11(-0.0816, 0.0494, 0.0066), max: 3.5 },
  CaCl2: { ...s21(2, 0.4212, 2.152, -0.00064), max: 2.5 }, MgCl2: { ...s21(2, 0.4698, 2.242, 0.00979), max: 4.5 },
  Na2SO4: { ...s21(1, 0.0261, 1.484, 0.00938), max: 4 },
  CuSO4: { zM: 2, zX: -2, nuM: 1, nuX: 1, beta0: 0.234, beta1: 2.527, beta2: -48.33, Cphi: 0.0044, max: 1.4 },
};
const A_PHI = 0.3915, B_P = 1.2, MW = 0.01801528;
/** One salt in water at 25 °C, molality m (mol/kg): the mean activity coefficient γ±, the osmotic coefficient φ and
 * water's activity a_w = exp(−φ ν m M_w). 2:2 salts use α1 = 1.4, α2 = 12; the rest α1 = 2. */
export function pitzer(s: PitzerSalt, m: number) {
  const z = Math.abs(s.zM * s.zX), nu = s.nuM + s.nuX, I = 0.5 * m * (s.nuM * s.zM ** 2 + s.nuX * s.zX ** 2), sI = Math.sqrt(I);
  const both = s.zM === 2 && s.zX === -2, a1 = both ? 1.4 : 2, a2 = 12;
  const g = (x: number) => (x ? (2 * (1 - (1 + x) * Math.exp(-x))) / (x * x) : 1);
  const gp = (x: number) => (x ? (-2 * (1 - (1 + x + (x * x) / 2) * Math.exp(-x))) / (x * x) : 0);
  const fg = -A_PHI * (sI / (1 + B_P * sI) + (2 / B_P) * Math.log(1 + B_P * sI)), fphi = (-A_PHI * sI) / (1 + B_P * sI);
  const B = s.beta0 + s.beta1 * g(a1 * sI) + (both ? s.beta2 * g(a2 * sI) : 0);
  const Bp = I ? (s.beta1 * gp(a1 * sI) + (both ? s.beta2 * gp(a2 * sI) : 0)) / I : 0;
  const Bphi = s.beta0 + s.beta1 * Math.exp(-a1 * sI) + (both ? s.beta2 * Math.exp(-a2 * sI) : 0);
  const w = (2 * s.nuM * s.nuX) / nu, w3 = (2 * (s.nuM * s.nuX) ** 1.5) / nu;
  const lnG = z * fg + m * w * (2 * B + I * Bp) + m * m * w3 * 1.5 * s.Cphi;
  const phi = 1 + z * fphi + m * w * Bphi + m * m * w3 * s.Cphi;
  return { gamma: Math.exp(lnG), phi, aw: Math.exp(-phi * nu * m * MW), I };
}
