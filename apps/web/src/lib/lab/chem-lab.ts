import { LabError } from './parse';
import { textOf, transpose, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Value } from './values';
import * as ch from './chem';
import * as cp from './chem-plus';
import { ELEMENT, ELEMENTS } from './elements';
import { ros23, sample, type OdeOut } from './sci-num';
import { call, col, def, lines, need, nums, one, optNum, optText, options, record, row, rows } from './sci-kit';

// Hyperion's chemistry in the language (M495): odeset, ode15s and ode23s (stiff solvers; MATLAB's names, one
// Rosenbrock 2(3) method behind both), kineticsSim, batchReactor, pfrReactor, cstrReactor, arrhenius, arrheniusFit,
// chemEquilibrium, acidPH (our own names: MATLAB's SimBiology builds reactions as objects). M513: molarMass,
// elementInfo, balanceEquation, polyproticPH, bufferPH, acidSpecies, titrationCurve, activityCoeff, ionicStrength,
// heatedBatch, cstrSteadyStates.

def('odeset', (a) => {
  const o = options(a, 0, ['RelTol', 'AbsTol', 'MaxStep', 'InitialStep'], 'odeset');
  return [record([...o].map(([k, v]) => [k, toMat(v).d[0]] as [string, number]))];
});
const tol = (v: Value | undefined, k: string, d: number) => (v?.k === 'struct' && v.f.has(k) ? toMat(v.f.get(k)!).d[0] : d);
function odeAnswer(out: OdeOut, span: number[], nout: number) {
  const t = span.length > 2 ? span : out.t, y = span.length > 2 ? sample(out, span) : out.y;
  const T = col(t), Y = rows(y);
  if (nout <= 1) return [record([['x', row(t)], ['y', transpose(Y)]])];
  return [T, Y];
}
def('ode15s ode23s', (a, nout, lab) => {
  if (a.length < 3 || a[0].k !== 'fn') throw new LabError('ode15s needs a function, the times and the start: [t, y] = ode15s(@(t, y) [-1000*y(1)], [0 1], 1).');
  const span = nums(a[1], 'The times'), y0 = nums(a[2], 'The start');
  if (span.length < 2 || span.some((x, i) => i && !(x > span[i - 1]))) throw new LabError('The times rise: [t0 tEnd], or the times to report.');
  const f = (t: number, y: number[]) => { const v = toMat(lab.callFn(a[0], [num(t), mat(y.length, 1, y)])[0], 'The derivative'); if (v.d.length !== y.length) throw new LabError(`The derivative has ${v.d.length} numbers for ${y.length} unknowns.`); return [...v.d]; };
  try { return odeAnswer(ros23(f, span[0], span[span.length - 1], y0, tol(a[3], 'RelTol', 1e-3), tol(a[3], 'AbsTol', 1e-6)), span, nout); }
  catch (e) { if (e instanceof LabError) throw e; throw new LabError(e instanceof Error ? e.message : String(e)); }
});

const mech = (v: Value | undefined) => {
  if (v?.k !== 'str') throw new LabError("The mechanism is text: 'A + B -> C; C <-> D'.");
  try { return ch.parseMechanism(v.v); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
};
const cellOf = (d: string[]): Cell => ({ k: 'cell', r: 1, c: d.length, d: d.map(str) });
function setup(a: Value[], name: string) {
  const m = mech(a[0]), k = nums(a[1], 'The rate constants'), c0 = nums(a[2], 'The starting concentrations');
  if (k.length !== ch.rateCount(m) || k.some((x) => !(x >= 0))) throw new LabError(`${name}: this mechanism needs ${ch.rateCount(m)} rate constant${ch.rateCount(m) > 1 ? 's' : ''} ≥ 0 (a reversible reaction takes forward, then backward).`);
  if (c0.length !== m.species.length || c0.some((x) => !(x >= 0))) throw new LabError(`${name}: give ${m.species.length} starting concentrations ≥ 0, in the order ${m.species.join(', ')}.`);
  return { m, k, c0 };
}
function profile(a: Value[], nout: number, lab: Lab, name: string, xl: string, title: string) {
  const { m, k, c0 } = setup(a, name), end = need(a[3], name === 'pfrReactor' ? 'The residence time τ' : 'The end time');
  if (!(end > 0)) throw new LabError('The time must be positive.');
  let r;
  try { r = ch.batch(m, k, c0, end); } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); }
  if (nout > 0) return [col(r.t), rows(r.y), cellOf(m.species)];
  call(lab, 'plot', ...m.species.flatMap((_, i) => [row(r.t), row(r.y.map((y) => y[i]))]), str('LineWidth'), num(2));
  call(lab, 'legend', ...m.species.map(str)); call(lab, 'xlabel', str(xl)); call(lab, 'ylabel', str('Concentration')); call(lab, 'title', str(title)); call(lab, 'grid', str('on'));
  return [];
}
def('kineticsSim', (a, nout, lab) => profile(a, nout, lab, 'kineticsSim', 'Time', textOf(a[0] ?? str('')).replace(/\s+/g, ' ')));
def('batchReactor', (a, nout, lab) => profile(a, nout, lab, 'batchReactor', 'Time', 'Batch reactor'));
def('pfrReactor', (a, nout, lab) => profile(a, nout, lab, 'pfrReactor', 'Residence time along the reactor (V/Q)', 'Plug-flow reactor'));
def('cstrReactor', (a) => {
  const { m, k, c0 } = setup(a, 'cstrReactor'), taus = nums(a[3], 'The residence time τ');
  if (!taus.length || taus.some((x) => !(x > 0))) throw new LabError('The residence times (V/Q) must be positive.');
  if (taus.length > 500) throw new LabError('cstrReactor takes up to 500 residence times.');
  const out = taus.map((tau) => { try { return ch.cstr(m, k, c0, tau).c; } catch (e) { throw new LabError(e instanceof Error ? e.message : String(e)); } });
  return [rows(out), cellOf(m.species)];
});
def('arrhenius', (a) => { const A = need(a[0], 'The pre-exponential factor A'), Ea = need(a[1], 'The activation energy (J/mol)'), T = toMat(a[2] ?? num(NaN), 'The temperature (K)'); return [mat(T.r, T.c, [...T.d].map((t) => ch.arrhenius(A, Ea, t)))]; });
def('arrheniusFit', (a, nout, lab) => {
  const T = nums(a[0], 'The temperatures (K)'), k = nums(a[1], 'The rate constants');
  if (T.length !== k.length || T.length < 2 || T.some((x) => !(x > 0)) || k.some((x) => !(x > 0))) throw new LabError('arrheniusFit needs two or more temperatures (K) and positive rate constants, one each.');
  const f = ch.arrheniusFit(T, k);
  if (nout > 0) return [num(f.A), num(f.Ea), num(f.r2)];
  const x = T.map((t) => 1000 / t), lo = Math.min(...x), hi = Math.max(...x);
  call(lab, 'plot', row(x), row(k.map(Math.log)), str('o')); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([lo, hi]), row([lo, hi].map((v) => Math.log(f.A) - f.Ea / (ch.R_GAS * 1000) * v))); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('1000 / T (1/K)')); call(lab, 'ylabel', str('ln k')); call(lab, 'legend', str('Measured'), str('Arrhenius fit')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Ea = ${(f.Ea / 1000).toFixed(1)} kJ/mol, A = ${f.A.toPrecision(3)}`));
  lab.host.out(`A = ${f.A.toPrecision(4)}, Ea = ${(f.Ea / 1000).toPrecision(4)} kJ/mol, R² = ${f.r2.toFixed(4)}\n`);
  return [];
});
def('chemEquilibrium', (a) => {
  const m = mech(a[0]), K = nums(a[1], 'The equilibrium constants'), c0 = nums(a[2], 'The starting concentrations');
  if (K.length !== m.reactions.length || K.some((x) => !(x > 0))) throw new LabError(`chemEquilibrium: one K > 0 for each of the ${m.reactions.length} reactions.`);
  if (c0.length !== m.species.length || c0.some((x) => !(x >= 0))) throw new LabError(`chemEquilibrium: give ${m.species.length} starting concentrations ≥ 0, in the order ${m.species.join(', ')}.`);
  const r = ch.equilibrium(m, K, c0);
  return [row(r.c), row(r.extent), cellOf(m.species)];
});
def('acidPH', (a) => { const Ka = toMat(a[0] ?? num(NaN), 'Ka'), C = need(a[1], 'The concentration (mol/L)'); if (!(C >= 0)) throw new LabError('The concentration must be ≥ 0.'); return [mat(Ka.r, Ka.c, [...Ka.d].map((k) => ch.acidPH(k, C)))]; });

// ——— M513 ———
const wrap = <T>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError(e instanceof Error ? e.message : String(e)); } };
const texts = (v: Value | undefined, what: string): string[] => {
  if (v?.k === 'str') return [v.v];
  if (v?.k === 'cell' && v.d.every((x) => x.k === 'str')) return v.d.map((x) => (x as { v: string }).v);
  throw new LabError(`${what} is text, or a cell of texts.`);
};
def('molarMass', (a, nout) => {
  const f = texts(a[0], "The formula ('C6H12O6')"), M = f.map((x) => wrap(() => cp.molarMass(x)));
  if (nout < 2) return [row(M)];
  const atoms = wrap(() => cp.parseFormula(f[0]).atoms);
  return [row(M), record([...atoms].map(([k, n]) => [k, n] as [string, number]))];
});
def('elementInfo', (a, nout, lab) => {
  if (!a.length) { lab.host.out(ELEMENTS.map((e) => `${String(e.number).padStart(3)} ${e.symbol.padEnd(3)} ${e.name.padEnd(14)} ${e.bracketed ? `[${e.weight}]` : e.weight}`).join('\n') + '\n'); return []; }
  const v = a[0], e = v.k === 'str' ? ELEMENT.get(v.v.trim()) ?? ELEMENTS.find((x) => x.name.toLowerCase() === v.v.trim().toLowerCase()) : ELEMENTS[one(v, 0) - 1];
  if (!e) throw new LabError("elementInfo takes a symbol ('Fe'), a name ('iron') or an atomic number (26).");
  return [record([['Number', e.number], ['Symbol', e.symbol], ['Name', e.name], ['Weight', e.weight], ['Radioactive', e.bracketed ? 1 : 0]])];
});
def('balanceEquation', (a, nout, lab) => {
  if (a[0]?.k !== 'str') throw new LabError("balanceEquation takes the equation as text: 'C3H8 + O2 -> CO2 + H2O'.");
  const b = wrap(() => cp.balance((a[0] as { v: string }).v));
  const side = (s: string[], o: number) => s.map((x, i) => (b.coef[o + i] === 1 ? x : `${b.coef[o + i]} ${x}`)).join(' + ');
  const text = `${side(b.reactants, 0)} -> ${side(b.products, b.reactants.length)}`;
  if (nout === 0) { lab.host.out(text + '\n'); return []; }
  return [row(b.coef), str(text)];
});
const acidOf = (a: Value[], o: Map<string, Value>, C: number): cp.Acid => {
  const Ka = nums(a[0], 'Ka');
  if (!Ka.length || Ka.some((k) => !(k > 0))) throw new LabError('Ka is one or more positive constants, the first proton first (H3PO4: [7.1e-3 6.3e-8 4.5e-13]).');
  return { Ka, C, charge: optNum(o, 'Charge', 0) };
};
def('polyproticPH', (a) => {
  const C = need(a[1], 'The concentration (mol/L)'), o = options(a, 2, ['Charge', 'Activity', 'Kw'], 'polyproticPH');
  if (!(C >= 0)) throw new LabError('The concentration must be ≥ 0.');
  const r = cp.solvePH({ acids: [acidOf(a, o, C)], cation: 0, anion: 0 }, { activity: one(o.get('Activity'), 0) !== 0, Kw: optNum(o, 'Kw', 1e-14) });
  return [num(r.pH), row(r.species[0]), num(r.I)];
});
def('bufferPH', (a) => {
  const Ca = need(a[1], 'The acid concentration (mol/L)'), Cb = need(a[2], 'The conjugate base (salt) concentration (mol/L)'), o = options(a, 3, ['Charge', 'Activity', 'Kw'], 'bufferPH');
  if (!(Ca >= 0 && Cb >= 0)) throw new LabError('The concentrations must be ≥ 0.');
  const r = cp.solvePH({ acids: [acidOf(a, o, Ca + Cb)], cation: Cb, anion: 0 }, { activity: one(o.get('Activity'), 0) !== 0, Kw: optNum(o, 'Kw', 1e-14) });
  return [num(r.pH), num(r.I)];
});
def('acidSpecies', (a, nout, lab) => {
  const Ka = nums(a[0], 'Ka'), pH = a[1] ? nums(a[1], 'The pH') : Array.from({ length: 141 }, (_, i) => i / 10);
  if (!Ka.length || Ka.some((k) => !(k > 0))) throw new LabError('Ka is one or more positive constants.');
  const F = pH.map((p) => cp.fractions(Ka, 10 ** -p));
  if (nout > 0) return [rows(F)];
  lines(lab, pH, Ka.concat(0).map((_, j) => F.map((f) => f[j])), Ka.concat(0).map((_, j) => (j ? `${j} H⁺ lost` : 'Fully protonated')), 'pH', 'Fraction', 'Which form the acid takes');
  return [];
});
def('titrationCurve', (a, nout, lab) => {
  const C = need(a[1], 'The analyte concentration (mol/L)'), Va = need(a[2], 'The analyte volume'), Ct = need(a[3], 'The titrant concentration (mol/L)');
  const o = options(a, 4, ['Titrant', 'Charge', 'Volumes', 'Activity', 'Kw'], 'titrationCurve'), acid = acidOf(a, o, C);
  const t = optText(o, 'Titrant', 'base').toLowerCase();
  if (t !== 'base' && t !== 'acid') throw new LabError("'Titrant' is 'base' (NaOH) or 'acid' (HCl).");
  if (!(C > 0 && Va > 0 && Ct > 0)) throw new LabError('The concentrations and the volume must be positive.');
  const guess = cp.titration(acid, Va, Ct, t, [0]).equivalence, vmax = 1.5 * (guess[guess.length - 1] ?? (C * Va) / Ct);
  const V = o.has('Volumes') ? nums(o.get('Volumes')) : Array.from({ length: 301 }, (_, i) => (vmax * i) / 300);
  if (V.some((v) => !(v >= 0))) throw new LabError("'Volumes' are ≥ 0.");
  const r = cp.titration(acid, Va, Ct, t, V, { activity: one(o.get('Activity'), 0) !== 0, Kw: optNum(o, 'Kw', 1e-14) });
  if (nout > 0) return [col(V), col(r.pH), row(r.equivalence)];
  lines(lab, V, [r.pH], [], `Volume of ${t === 'base' ? 'strong base' : 'strong acid'} added`, 'pH', r.equivalence.length ? `Equivalence at ${r.equivalence.map((v) => v.toPrecision(3)).join(', ')}` : 'Titration');
  for (const v of r.equivalence) call(lab, 'xline', num(v), str('--'));
  return [];
});
def('activityCoeff', (a) => { const z = toMat(a[0] ?? num(NaN), 'The charge'), I = need(a[1], 'The ionic strength (mol/L)'); if (!(I >= 0)) throw new LabError('The ionic strength is ≥ 0.'); return [mat(z.r, z.c, [...z.d].map((x) => cp.davies(x, I)))]; });
def('ionicStrength', (a) => { const c = nums(a[0], 'The concentrations'), z = nums(a[1], 'The charges'); if (c.length !== z.length) throw new LabError('One charge for each concentration.'); return [num(0.5 * c.reduce((s, x, i) => s + x * z[i] * z[i], 0))]; });

function heatSetup(a: Value[], name: string, from: number, T0: number) {
  const m = mech(a[0]), A = nums(a[1], 'A'), Ea = nums(a[2], 'Ea (J/mol)'), dH = nums(a[3], 'ΔH (J/mol)'), c0 = nums(a[4], 'The concentrations');
  const n = ch.rateCount(m);
  if (A.length !== n || Ea.length !== n || A.some((x) => !(x >= 0)) || Ea.some((x) => !(x >= 0))) throw new LabError(`${name}: this mechanism needs ${n} A and ${n} Ea ≥ 0 (a reversible reaction takes forward, then backward).`);
  if (dH.length !== m.reactions.length || dH.some((x) => !Number.isFinite(x))) throw new LabError(`${name}: one ΔH (J/mol, negative gives heat) for each of the ${m.reactions.length} reactions.`);
  if (c0.length !== m.species.length || c0.some((x) => !(x >= 0))) throw new LabError(`${name}: give ${m.species.length} concentrations ≥ 0 (mol/L), in the order ${m.species.join(', ')}.`);
  const o = options(a, from, ['RhoCp', 'UA', 'Tcool', 'Range'], name);
  const h: cp.Heat = { A, Ea, dH, rhoCp: optNum(o, 'RhoCp', 4180), UA: optNum(o, 'UA', 0), Tc: optNum(o, 'Tcool', T0) };
  if (!(h.rhoCp > 0 && h.UA >= 0 && h.Tc > 0)) throw new LabError("'RhoCp' (J/(L·K)) is positive, 'UA' (W/(L·K)) ≥ 0 and 'Tcool' a temperature in kelvin.");
  return { m, h, c0, o };
}
def('heatedBatch', (a, nout, lab) => {
  const T0 = need(a[5], 'The starting temperature (K)'), end = need(a[6], 'The end time (s)'), { m, h, c0 } = heatSetup(a, 'heatedBatch', 7, T0);
  if (!(T0 > 0 && end > 0)) throw new LabError('The temperature (K) and the time must be positive.');
  const r = wrap(() => cp.heatedBatch(m, h, c0, T0, end)), S = m.species.length, T = r.y.map((y) => y[S]);
  if (nout > 0) return [col(r.t), rows(r.y.map((y) => y.slice(0, S))), col(T), cellOf(m.species)];
  const peak = T.indexOf(Math.max(...T));
  call(lab, 'subplot', num(2), num(1), num(1)); lines(lab, r.t, m.species.map((_, i) => r.y.map((y) => y[i])), m.species, 'Time (s)', 'Concentration (mol/L)', 'Batch reactor with heat');
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, r.t, [T], [], 'Time (s)', 'Temperature (K)', `Peak ${T[peak].toFixed(1)} K at ${r.t[peak].toPrecision(3)} s (${(T[peak] - T0).toFixed(1)} K above the start)`);
  return [];
});
def('cstrSteadyStates', (a, nout, lab) => {
  const Tin = need(a[5], 'The inlet temperature (K)'), tau = need(a[6], 'The residence time τ (s)'), { m, h, c0, o } = heatSetup(a, 'cstrSteadyStates', 7, Tin);
  if (!(Tin > 0 && tau > 0)) throw new LabError('The temperature (K) and τ must be positive.');
  const rise = h.dH.reduce((s, x) => s + Math.abs(x), 0) * Math.max(...c0) / h.rhoCp;
  const rg = o.has('Range') ? nums(o.get('Range')) : [Math.min(Tin, h.Tc) - 10, Math.max(Tin, h.Tc) + rise + 30];
  if (rg.length !== 2 || !(rg[0] > 0 && rg[1] > rg[0])) throw new LabError("'Range' is [lowest highest] in kelvin.");
  const r = wrap(() => cp.cstrSteadyStates(m, h, c0, Tin, tau, [Math.max(1, rg[0]), rg[1]]));
  if (nout > 0) return [col(r.states.map((s) => s.T)), rows(r.states.length ? r.states.map((s) => s.c) : [[]]), col(r.states.map((s) => (s.stable ? 1 : 0)))];
  lines(lab, r.T, [r.generated, r.removed], ['Heat from the reactions G(T)', 'Heat carried and cooled away R(T)'], 'Temperature (K)', 'Heat (W/L)', `${r.states.length} steady state${r.states.length === 1 ? '' : 's'}`);
  call(lab, 'hold', str('on'));
  for (const s of r.states) call(lab, 'plot', num(s.T), num(s.generated), str(s.stable ? 'ko' : 'kx'), str('MarkerSize'), num(10), str('LineWidth'), num(2));
  call(lab, 'hold', str('off'));
  lab.host.out(r.states.map((s) => `T = ${s.T.toFixed(2)} K  ${m.species.map((n, i) => `${n} = ${s.c[i].toPrecision(4)}`).join('  ')}  ${s.stable ? 'stable' : 'unstable'}`).join('\n') + '\n');
  return [];
});
