// Hyperion's chemistry, the left-outs of M495 (M513): formulas and molar masses from the periodic table, balancing
// equations, acids with several protons, buffers and titrations by the full charge balance (activities by Davies'
// equation when asked), and reactors that heat up: a batch with an energy balance (runaway) and every steady state of
// a cooled CSTR (van Heerden's heat diagram). Pure: no language values here.
import { solve } from './optim';
import { arrhenius, cstr, reactionRates, stoichiometry, type Mechanism } from './chem';
import { ELEMENT } from './elements';
import { jacobian, ros23, root, type OdeOut } from './sci-num';

// ——— Formulas ———
export interface Formula { atoms: Map<string, number>; charge: number }
/** 'Ca(OH)2', 'K4[Fe(CN)6]', 'CuSO4·5H2O' (also '*' or '.' before a hydrate), charges as 'SO4^2-', 'Fe^{3+}', 'Na+',
 * 'OH-' (bare signs count one each: write Fe^3+, since 'Fe3+' reads as Fe₃ with one charge). */
export function parseFormula(text: string): Formula {
  let f = text.trim(), charge = 0;
  const ch = /\^\{?(\d*)([+-])\}?$|\{(\d*)([+-])\}$|([+-]+)$/.exec(f);
  if (ch) {
    if (ch[5]) charge = [...ch[5]].reduce((s, x) => s + (x === '+' ? 1 : -1), 0);
    else { const n = Number(ch[1] || ch[3] || 1), sg = ch[2] || ch[4]; charge = sg === '+' ? n : -n; }
    f = f.slice(0, ch.index).trim();
  }
  if (!f) throw new Error(`“${text}” has no elements.`);
  const atoms = new Map<string, number>();
  for (const part of f.split(/[·•*.]/)) {
    const m = /^(\d*)(.*)$/.exec(part.trim())!, mult = m[1] ? Number(m[1]) : 1;
    let i = 0;
    const s = m[2];
    const count = () => { const d = /^\d+/.exec(s.slice(i)); if (d) { i += d[0].length; return Number(d[0]); } return 1; };
    const group = (close: string): Map<string, number> => {
      const g = new Map<string, number>();
      const add = (k: string, n: number) => g.set(k, (g.get(k) ?? 0) + n);
      while (i < s.length) {
        const c = s[i];
        if (c === '(' || c === '[') { i++; const inner = group(c === '(' ? ')' : ']'); const n = count(); inner.forEach((v, k) => add(k, v * n)); continue; }
        if (c === ')' || c === ']') { if (c !== close) throw new Error(`“${text}”: a bracket doesn't match.`); i++; return g; }
        const e = /^[A-Z][a-z]?/.exec(s.slice(i));
        if (!e) throw new Error(`“${text}”: “${s.slice(i)}” is not an element (symbols start with a capital: Na, Cl, O).`);
        let sym = e[0];
        if (!ELEMENT.has(sym) && sym.length === 2 && ELEMENT.has(sym[0])) sym = sym[0];
        if (!ELEMENT.has(sym)) throw new Error(`“${sym}” is not an element.`);
        i += sym.length;
        add(sym, count());
      }
      if (close) throw new Error(`“${text}”: a bracket is not closed.`);
      return g;
    };
    if (!s) throw new Error(`“${text}”: a hydrate part is empty.`);
    group('').forEach((v, k) => atoms.set(k, (atoms.get(k) ?? 0) + v * mult));
  }
  return { atoms, charge };
}
/** g/mol (electrons' mass ignored, as chemists do). */
export const molarMass = (text: string) => { let m = 0; parseFormula(text).atoms.forEach((n, k) => { m += n * ELEMENT.get(k)!.weight; }); return m; };

/** Splits one side of an equation: species are separated by '+' with spaces around it (so 'Na+ + Cl-' works); a
 * leading whole number is a coefficient and is ignored. */
const speciesOf = (side: string) => side.split(/\s\+\s/).map((t) => t.trim().replace(/^\d+\s+/, '')).filter(Boolean);

/** The smallest whole-number coefficients that balance every element and the charge. */
export function balance(text: string): { reactants: string[]; products: string[]; coef: number[] } {
  const m = /^(.*?)(<->|<=>|->|=>|=|→)(.*)$/.exec(text);
  if (!m) throw new Error('An equation needs an arrow: CH4 + O2 -> CO2 + H2O.');
  const reactants = speciesOf(m[1]), products = speciesOf(m[3]), all = [...reactants, ...products];
  if (!reactants.length || !products.length) throw new Error('Both sides need a species (separate them with “ + ”, spaces around the plus).');
  const f = all.map(parseFormula), els = [...new Set(f.flatMap((x) => [...x.atoms.keys()]))];
  const rowsA = els.map((e) => all.map((_, j) => (j < reactants.length ? 1 : -1) * (f[j].atoms.get(e) ?? 0)));
  if (f.some((x) => x.charge)) rowsA.push(all.map((_, j) => (j < reactants.length ? 1 : -1) * f[j].charge));
  const x = nullVector(rowsA, all.length);
  if (!x) throw new Error('This equation can’t be balanced as written (check the formulas), or it can be balanced in more than one way (two reactions in one).');
  const sign = Math.sign(x.find((v) => Math.abs(v) > 1e-9)!), y = x.map((v) => v * sign);
  if (y.some((v) => v <= 1e-9)) throw new Error('Balancing needs a species on the other side (a coefficient came out zero or negative).');
  const lo = Math.min(...y), z = y.map((v) => v / lo);
  for (let k = 1; k <= 10_000; k++) if (z.every((v) => Math.abs(v * k - Math.round(v * k)) < 1e-6 * k)) return { reactants, products, coef: z.map((v) => Math.round(v * k)) };
  throw new Error('The coefficients are not small whole numbers.');
}
/** The one vector A x = 0 (null space of dimension 1), or null. */
function nullVector(A: number[][], n: number): number[] | null {
  const M = A.map((r) => r.slice()), piv: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < M.length; c++) {
    let best = r;
    for (let i = r + 1; i < M.length; i++) if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    if (Math.abs(M[best][c]) < 1e-9) continue;
    [M[r], M[best]] = [M[best], M[r]];
    for (let i = 0; i < M.length; i++) if (i !== r) { const q = M[i][c] / M[r][c]; for (let j = c; j < n; j++) M[i][j] -= q * M[r][j]; }
    piv.push(c); r++;
  }
  const free = [...Array(n).keys()].filter((c) => !piv.includes(c));
  if (free.length !== 1) return null;
  const x = new Array(n).fill(0);
  x[free[0]] = 1;
  piv.forEach((c, i) => { x[c] = -M[i][free[0]] / M[i][c]; });
  return x;
}

// ——— Acids, bases and buffers ———
/** An acid (or base) in solution: its Ka's from the most protonated form down, its total concentration (mol/L) and
 * the charge of its most protonated form (0 for H3PO4 or acetic acid, 1 for NH4⁺, so NH3 is its middle form). */
export interface Acid { Ka: number[]; C: number; charge: number }
export interface Mix { acids: Acid[]; cation: number; anion: number }
/** Davies' activity coefficient at 25 °C for charge z at ionic strength I (mol/L; fair up to about 0.5). */
export const davies = (z: number, I: number) => 10 ** (-0.509 * z * z * (Math.sqrt(I) / (1 + Math.sqrt(I)) - 0.3 * I));
/** The fraction of the acid in each form, j protons lost (0 … n), at [H⁺] = h with concentration constants K. */
export function fractions(K: number[], h: number): number[] {
  const lg = [0];
  for (let j = 0; j < K.length; j++) lg.push(lg[j] + Math.log(K[j]) - Math.log(h));
  const top = Math.max(...lg), w = lg.map((v) => Math.exp(v - top)), s = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / s);
}
/** pH by the charge balance h + cations + Σ C·(charge − n̄) = Kw/h + anions, solved for log h by bisection (the
 * balance rises with h). With `activity`, the ionic strength and Davies' coefficients are iterated to agreement. */
export function solvePH(mix: Mix, o: { Kw?: number; activity?: boolean } = {}): { pH: number; h: number; I: number; species: number[][] } {
  const Kw = o.Kw ?? 1e-14;
  let I = 0, h = 1e-7, g1 = 1, Kc = mix.acids.map((a) => a.Ka), Kwc = Kw;
  for (let it = 0; it < (o.activity ? 60 : 1); it++) {
    const net = (x: number) => { const hh = 10 ** x; return hh - Kwc / hh + mix.cation - mix.anion + mix.acids.reduce((s, a, k) => s + a.C * fractions(Kc[k], hh).reduce((t, f, j) => t + f * (a.charge - j), 0), 0); };
    h = 10 ** root(net, -20, 3, 1e-14);
    const conc = mix.acids.map((a, k) => fractions(Kc[k], h).map((f) => f * a.C));
    const In = 0.5 * (h + Kwc / h + mix.cation + mix.anion + conc.reduce((s, c, k) => s + c.reduce((t, x, j) => t + x * (mix.acids[k].charge - j) ** 2, 0), 0));
    if (!o.activity) break;
    const done = Math.abs(In - I) < 1e-12 * (1 + In);
    I = In; g1 = davies(1, I);
    Kc = mix.acids.map((a) => a.Ka.map((K, j) => (K * davies(a.charge - j, I)) / (g1 * davies(a.charge - j - 1, I))));
    Kwc = Kw / (g1 * g1);
    if (done) break;
  }
  const species = mix.acids.map((a, k) => fractions(Kc[k], h).map((f) => f * a.C));
  if (!o.activity) I = 0.5 * (h + Kw / h + mix.cation + mix.anion + species.reduce((s, c, k) => s + c.reduce((t, x, j) => t + x * (mix.acids[k].charge - j) ** 2, 0), 0));
  return { pH: -Math.log10(g1 * h), h, I, species };
}
/** A titration of Va of an acid (or base) by a strong base (NaOH) or strong acid (HCl) at Ct: pH at each volume
 * added, and the equivalence volumes (one per proton the titrant can take or give). */
export function titration(acid: Acid, Va: number, Ct: number, titrant: 'base' | 'acid', V: number[], o: { activity?: boolean; Kw?: number } = {}) {
  const pH = V.map((v) => {
    const f = Va / (Va + v), t = (Ct * v) / (Va + v);
    return solvePH({ acids: [{ ...acid, C: acid.C * f }], cation: titrant === 'base' ? t : 0, anion: titrant === 'acid' ? t : 0 }, o).pH;
  });
  const steps = titrant === 'base' ? acid.Ka.length - Math.max(0, acid.charge) : acid.charge;
  return { pH, equivalence: Array.from({ length: Math.max(0, steps) }, (_, j) => ((j + 1) * acid.C * Va) / Ct) };
}

// ——— Reactors with heat ———
/** Each one-way rate constant's Arrhenius A and Ea (J/mol), each reaction's ΔH (J/mol as written: negative gives
 * heat), the mixture's ρCp (J/(L·K)), the cooling UA per volume (W/(L·K)) and the coolant's temperature (K). */
export interface Heat { A: number[]; Ea: number[]; dH: number[]; rhoCp: number; UA: number; Tc: number }
const kAt = (h: Heat, T: number) => h.A.map((a, i) => arrhenius(a, h.Ea[i], T));

/** A batch reactor with its energy balance: ρCp dT/dt = Σ(−ΔH_r) r_r − UA (T − Tc). The state is [c…, T]. */
export function heatedBatch(m: Mechanism, h: Heat, c0: number[], T0: number, tEnd: number): OdeOut {
  const rr = reactionRates(m), nu = stoichiometry(m), S = m.species.length;
  const f = (_: number, y: number[]) => {
    const c = y.slice(0, S), T = y[S], r = rr(c, kAt(h, T)), d = new Array(S + 1).fill(0);
    r.forEach((x, j) => { nu[j].forEach((v, i) => { if (v) d[i] += v * x; }); d[S] -= (h.dH[j] * x) / h.rhoCp; });
    d[S] -= (h.UA * (T - h.Tc)) / h.rhoCp;
    return d;
  };
  return ros23(f, 0, tEnd, [...c0, T0], 1e-6, 1e-10 * Math.max(1, ...c0));
}

export interface SteadyState { T: number; c: number[]; stable: boolean; generated: number; removed: number }
/** Every steady state of a cooled CSTR (inlet cin at Tin, residence time τ) between T range[0] and range[1]: at each
 * temperature the mass balance is solved, the heat the reactions give G(T) is set against the heat carried and
 * cooled away R(T) = ρCp (T − Tin)/τ + UA (T − Tc), and the crossings found. A crossing is stable when R rises
 * faster than G there (van Heerden's slope test; necessary, not sufficient: a tank can still oscillate). */
export function cstrSteadyStates(m: Mechanism, h: Heat, cin: number[], Tin: number, tau: number, range: [number, number], n = 300) {
  const rr = reactionRates(m), nu = stoichiometry(m);
  const massAt = (T: number, guess?: number[]): number[] => {
    const k = kAt(h, T), f = (_: number, c: number[]) => { const r = rr(c, k), d = cin.map((v, i) => (v - c[i]) / tau); r.forEach((x, j) => nu[j].forEach((v, i) => { if (v) d[i] += v * x; })); return d; };
    if (guess) {
      let c = guess.slice();
      for (let it = 0; it < 40; it++) {
        const F = f(0, c), dx = solve(jacobian(f, 0, c, F), F.map((v) => -v));
        if (!dx) break;
        c = c.map((v, i) => v + dx[i]);
        if (Math.max(...dx.map(Math.abs)) < 1e-13 * (1 + Math.max(...c.map(Math.abs)))) return c.every((v) => v >= -1e-12) ? c.map((v) => Math.max(0, v)) : cstr(m, k, cin, tau).c;
      }
    }
    return cstr(m, k, cin, tau).c;
  };
  const G = (T: number, c: number[]) => rr(c, kAt(h, T)).reduce((s, x, j) => s - h.dH[j] * x, 0);
  const R = (T: number) => (h.rhoCp * (T - Tin)) / tau + h.UA * (T - h.Tc);
  const Ts = Array.from({ length: n + 1 }, (_, i) => range[0] + ((range[1] - range[0]) * i) / n), cs: number[][] = [];
  for (const T of Ts) cs.push(massAt(T, cs[cs.length - 1]));
  const gen = Ts.map((T, i) => G(T, cs[i])), rem = Ts.map(R), out: SteadyState[] = [];
  for (let i = 0; i < n; i++) {
    const a = gen[i] - rem[i], b = gen[i + 1] - rem[i + 1];
    if (a === 0 || a * b < 0) {
      const T = a === 0 ? Ts[i] : root((x) => G(x, massAt(x, cs[i])) - R(x), Ts[i], Ts[i + 1], 1e-12);
      const c = massAt(T, cs[i]), dT = 1e-4 * Math.max(1, Math.abs(T));
      const slope = (G(T + dT, massAt(T + dT, c)) - R(T + dT) - (G(T - dT, massAt(T - dT, c)) - R(T - dT))) / (2 * dT);
      out.push({ T, c, stable: slope < 0, generated: G(T, c), removed: R(T) });
    }
  }
  return { states: out, T: Ts, generated: gen, removed: rem };
}
