import { LabError } from './parse';
import { textOf, transpose, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Value } from './values';
import * as ch from './chem';
import { ros23, sample, type OdeOut } from './sci-num';
import { call, col, def, need, nums, options, record, row, rows } from './sci-kit';

// Hyperion's chemistry in the language (M495): odeset, ode15s and ode23s (stiff solvers; MATLAB's names, one
// Rosenbrock 2(3) method behind both), kineticsSim, batchReactor, pfrReactor, cstrReactor, arrhenius, arrheniusFit,
// chemEquilibrium, acidPH (our own names: MATLAB's SimBiology builds reactions as objects).

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
