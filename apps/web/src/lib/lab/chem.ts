// Hyperion's chemistry and chemical engineering (M495, the owner's list, group 7): reaction mechanisms written as text
// ('A + B -> C; 2 C <-> D') turned into mass-action rate equations, Arrhenius' law and fitting it, chemical equilibria
// (several reactions at once, by Newton's method on the extents), a weak acid's pH, and the three ideal reactors of
// every textbook (Fogler; Levenspiel): batch, plug flow (PFR) and continuously stirred (CSTR), isothermal, at constant
// density. Stiff mechanisms are solved by the Rosenbrock method in sci-num.ts. Pure: no language values here.
import { solve } from './optim';
import { jacobian, ros23, type OdeOut } from './sci-num';

export const R_GAS = 8.314462618;

export interface Reaction { reactants: [string, number][]; products: [string, number][]; reversible: boolean }
export interface Mechanism { species: string[]; reactions: Reaction[] }

/** 'A + B -> C; 2 C <-> D' (also '=>', '<=>', '=', newlines or ';' between reactions). */
export function parseMechanism(text: string): Mechanism {
  const species: string[] = [], reactions: Reaction[] = [];
  const side = (s: string): [string, number][] => s.split('+').map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = /^(\d*\.?\d*)\s*\*?\s*([A-Za-z][\w()]*)$/.exec(t);
    if (!m) throw new Error(`“${t}” is not a species (a number, then a name like H2O or A).`);
    const name = m[2];
    if (!species.includes(name)) species.push(name);
    return [name, m[1] ? Number(m[1]) : 1];
  });
  for (const part of text.split(/[;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.*?)(<->|<=>|->|=>|=)(.*)$/.exec(part);
    if (!m) throw new Error(`“${part}” needs an arrow: -> one way, <-> both ways.`);
    reactions.push({ reactants: side(m[1]), products: side(m[3]), reversible: m[2] === '<->' || m[2] === '<=>' || m[2] === '=' });
  }
  if (!reactions.length) throw new Error('The mechanism has no reactions.');
  return { species, reactions };
}

/** How many rate constants the mechanism needs (a reversible reaction takes forward then backward). */
export const rateCount = (m: Mechanism) => m.reactions.reduce((s, r) => s + (r.reversible ? 2 : 1), 0);

/** The net rate of change of every species (mass action: each reaction's rate is k × Π c^ν of its reactants). */
export function rates(m: Mechanism, k: number[]) {
  const idx = (s: string) => m.species.indexOf(s);
  const rx = m.reactions.map((r) => ({ re: r.reactants.map(([s, n]) => [idx(s), n] as [number, number]), pr: r.products.map(([s, n]) => [idx(s), n] as [number, number]), rev: r.reversible }));
  return (c: number[]) => {
    const d = new Array(m.species.length).fill(0);
    let q = 0;
    for (const r of rx) {
      const pow = (side: [number, number][]) => side.reduce((p, [i, n]) => p * Math.max(0, c[i]) ** n, 1);
      const net = k[q++] * pow(r.re) - (r.rev ? k[q++] * pow(r.pr) : 0);
      for (const [i, n] of r.re) d[i] -= n * net;
      for (const [i, n] of r.pr) d[i] += n * net;
    }
    return d;
  };
}

/** A batch reactor (or a mechanism in a flask): concentrations over time, solved as a stiff system. */
export const batch = (m: Mechanism, k: number[], c0: number[], tEnd: number, rtol = 1e-6, atol = 1e-10): OdeOut => {
  const r = rates(m, k);
  return ros23((_, c) => r(c), 0, tEnd, c0, rtol, atol);
};

/** A plug-flow reactor at constant density: each slice ages as a batch does, so concentrations along the reactor at
 * residence time τ = V / Q are the batch's at t = τ. */
export const pfr = batch;

/** A CSTR's steady state: 0 = (c_in − c)/τ + r(c). Run to (near) steady state from the inlet, then Newton's method. */
export function cstr(m: Mechanism, k: number[], cin: number[], tau: number): { c: number[]; residual: number } {
  const r = rates(m, k), f = (_: number, c: number[]) => r(c).map((v, i) => v + (cin[i] - c[i]) / tau);
  const run = ros23(f, 0, 40 * tau, cin, 1e-6, 1e-12 * Math.max(1e-12, ...cin));
  let c = run.y[run.y.length - 1];
  for (let it = 0; it < 50; it++) {
    const F = f(0, c), J = jacobian(f, 0, c, F), dx = solve(J, F.map((v) => -v));
    if (!dx) break;
    c = c.map((v, i) => Math.max(0, v + dx[i]));
    if (Math.max(...dx.map(Math.abs)) < 1e-14 * (1 + Math.max(...c.map(Math.abs)))) break;
  }
  return { c, residual: Math.max(...f(0, c).map(Math.abs)) };
}

/** Arrhenius: k = A exp(−Ea / (R T)), Ea in J/mol, T in kelvin. */
export const arrhenius = (A: number, Ea: number, T: number) => A * Math.exp(-Ea / (R_GAS * T));
/** A and Ea from rate constants measured at several temperatures: ln k = ln A − Ea / (R T), by least squares. */
export function arrheniusFit(T: number[], k: number[]) {
  const x = T.map((t) => 1 / t), y = k.map(Math.log), n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), slope = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx;
  const ss = y.reduce((s, v, i) => s + (v - (my + slope * (x[i] - mx))) ** 2, 0), st = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return { A: Math.exp(my - slope * mx), Ea: -slope * R_GAS, r2: st ? 1 - ss / st : 1 };
}

/** Equilibrium of several reactions: the extents ξ with K_r = Π c_i^ν_ir (c = c0 + ν ξ), by damped Newton on
 * ln K, keeping every concentration positive. */
export function equilibrium(m: Mechanism, K: number[], c0: number[]): { c: number[]; extent: number[]; iterations: number } {
  const S = m.species.length, Rn = m.reactions.length;
  const nu = m.reactions.map((r) => { const v = new Array(S).fill(0); for (const [s, n] of r.reactants) v[m.species.indexOf(s)] -= n; for (const [s, n] of r.products) v[m.species.indexOf(s)] += n; return v; });
  const conc = (x: number[]) => c0.map((c, i) => c + nu.reduce((s, v, r) => s + v[i] * x[r], 0));
  const scale = Math.max(...c0, 1e-12), floor = 1e-30 * scale;
  // Start where every species present is: a small extent each way does not matter; start from a tiny positive amount.
  let x = new Array(Rn).fill(0);
  const ok = (c: number[]) => c.every((v, i) => v > 0 || (v >= 0 && nu.every((r) => r[i] === 0)));
  if (!ok(conc(x))) {
    // Some product starts at zero: move each reaction a hair forward (or backward) so every involved species is positive.
    for (let r = 0; r < Rn; r++) { const c = conc(x); const room = Math.min(...nu[r].map((v, i) => (v < 0 ? c[i] / -v : Infinity))); x[r] += Math.min(1e-6 * scale, room / 2); }
    if (!ok(conc(x))) for (let r = 0; r < Rn; r++) { const c = conc(x); const room = Math.min(...nu[r].map((v, i) => (v > 0 ? c[i] / v : Infinity))); if (Number.isFinite(room)) x[r] -= Math.min(1e-6 * scale, room / 2); }
  }
  const G = (x0: number[]) => { const c = conc(x0).map((v) => Math.max(v, floor)); return nu.map((v, r) => v.reduce((s, n, i) => s + (n ? n * Math.log(c[i]) : 0), 0) - Math.log(K[r])); };
  let it = 0;
  for (; it < 200; it++) {
    const g = G(x);
    if (Math.max(...g.map(Math.abs)) < 1e-12) break;
    const c = conc(x).map((v) => Math.max(v, floor));
    const J = nu.map((vr) => nu.map((vq) => vr.reduce((s, n, i) => s + (n && vq[i] ? (n * vq[i]) / c[i] : 0), 0)));
    const dx = solve(J, g.map((v) => -v));
    if (!dx) break;
    let t = 1;
    while (t > 1e-12 && !conc(x.map((v, r) => v + t * dx[r])).every((v, i) => v > 0 || nu.every((r) => r[i] === 0) && v >= 0)) t /= 2;
    x = x.map((v, r) => v + t * dx[r]);
  }
  return { c: conc(x), extent: x, iterations: it };
}

/** A weak acid's pH at concentration C (mol/L): [H⁺] solves h³ + Ka h² − (Ka C + Kw) h − Ka Kw = 0 (charge balance
 * with water's own ions). A strong acid is Ka = Infinity. */
export function acidPH(Ka: number, C: number, Kw = 1e-14): number {
  if (!Number.isFinite(Ka)) { const h = (C + Math.sqrt(C * C + 4 * Kw)) / 2; return -Math.log10(h); }
  const f = (h: number) => h ** 3 + Ka * h * h - (Ka * C + Kw) * h - Ka * Kw;
  let lo = 0, hi = Math.max(1, C + Math.sqrt(Kw));
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return -Math.log10((lo + hi) / 2);
}
