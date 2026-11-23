import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { cmat, mat, num, str, toMat, type Mat, type Value } from './values';
import * as cm from './comms';

// Hyperion's communications toolbox in the language (M427): pskmod, pskdemod, qammod, qamdemod, awgn, biterr,
// symerr, berawgn, qfunc, int2bit, bit2int, scatterplot.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const order = (v: Value | undefined, name: string) => {
  const M = v ? toMat(v).d[0] : NaN;
  if (!(M >= 2 && Number.isInteger(Math.log2(M)))) throw new LabError(`${name} needs the order M: a power of 2 (2, 4, 8, 16…).`);
  return M;
};
const symbolsOf = (v: Value, M: number) => {
  const m = toMat(v, 'The symbols');
  if ([...m.d].some((s) => !(Number.isInteger(s) && s >= 0 && s < M))) throw new LabError(`The symbols must be whole numbers from 0 to ${M - 1}.`);
  return m;
};
const unitOpt = (a: Value[], from: number) => { for (let i = from; i + 1 < a.length; i++) if (a[i].k === 'str' && /^unitaveragepower$/i.test((a[i] as { v: string }).v)) return toMat(a[i + 1]).d[0] !== 0; return false; };
const reIm = (v: Value): [number[], number[]] => { const m = toMat(v, 'The signal'); return [[...m.d], m.im ? [...m.im] : new Array(m.d.length).fill(0)]; };

def('pskmod', (a) => {
  const M = order(a[1], 'pskmod'), m = symbolsOf(a[0], M), [re, im] = cm.pskmod([...m.d], M, a[2] && a[2].k === 'mat' ? toMat(a[2]).d[0] : 0);
  return [cmat(m.r, m.c, re, im)];
});
def('pskdemod', (a) => { const M = order(a[1], 'pskdemod'), m = toMat(a[0]), [re, im] = reIm(a[0]); return [mat(m.r, m.c, cm.pskdemod(re, im, M, a[2] && a[2].k === 'mat' ? toMat(a[2]).d[0] : 0))]; });
def('qammod', (a) => {
  const M = order(a[1], 'qammod'), m = symbolsOf(a[0], M);
  try { const [re, im] = cm.qammod([...m.d], M, unitOpt(a, 2)); return [cmat(m.r, m.c, re, im)]; } catch (e) { throw new LabError((e as Error).message); }
});
def('qamdemod', (a) => { const M = order(a[1], 'qamdemod'), m = toMat(a[0]), [re, im] = reIm(a[0]); return [mat(m.r, m.c, cm.qamdemod(re, im, M, unitOpt(a, 2)))]; });
def('awgn', (a) => {
  if (a.length < 2) throw new LabError("awgn needs the signal and the SNR in dB: awgn(x, 10, 'measured').");
  const m = toMat(a[0], 'The signal'), snr = toMat(a[1]).d[0], measured = a[2] ? (a[2].k === 'str' ? /^measured$/i.test(a[2].v) : false) : false;
  const [re, im] = cm.awgn([...m.d], m.im ? [...m.im] : null, snr, random, measured);
  return [im ? cmat(m.r, m.c, re, im) : mat(m.r, m.c, re)];
});
const bitsFor = (a: Mat, b: Mat) => Math.max(1, Math.ceil(Math.log2(Math.max(1, a.d.reduce((m, v) => Math.max(m, v), 0), b.d.reduce((m, v) => Math.max(m, v), 0)) + 1)));
def('biterr', (a) => {
  const x = toMat(a[0]), y = toMat(a[1] ?? num(0));
  if (x.d.length !== y.d.length) throw new LabError('biterr compares two lists of the same length.');
  const k = a[2] ? toMat(a[2]).d[0] : bitsFor(x, y), r = cm.biterr([...x.d], [...y.d], k);
  return [num(r.count), num(r.ratio)];
});
def('symerr', (a) => {
  const x = toMat(a[0]).d, y = toMat(a[1] ?? num(0)).d;
  if (x.length !== y.length) throw new LabError('symerr compares two lists of the same length.');
  const n = x.reduce((s, v, i) => s + (v !== y[i] ? 1 : 0), 0);
  return [num(n), num(n / x.length)];
});
def('berawgn', (a) => {
  const eb = toMat(a[0], 'Eb/N0 (dB)'), kind = a[1] ? textOf(a[1]).toLowerCase() : 'psk', M = order(a[2] ?? num(2), 'berawgn');
  if (kind !== 'psk' && kind !== 'qam') throw new LabError("berawgn's kinds here are 'psk' and 'qam'.");
  return [mat(eb.r, eb.c, [...eb.d].map((e) => cm.berTheory(e, kind, M)))];
});
def('qfunc', (a) => { const m = toMat(a[0]); return [mat(m.r, m.c, [...m.d].map(cm.qfunc))]; });
def('int2bit', (a) => {
  const x = toMat(a[0], 'The numbers'), n = Math.round(toMat(a[1] ?? num(8)).d[0]), out: number[] = [];
  for (const v of x.d) { if (!(Number.isInteger(v) && v >= 0 && v < 2 ** n)) throw new LabError(`int2bit needs whole numbers from 0 to ${2 ** n - 1} for ${n} bits.`); for (let b = n - 1; b >= 0; b--) out.push(Math.floor(v / 2 ** b) % 2); }
  return [mat(out.length, 1, out)];
});
def('bit2int', (a) => {
  const b = [...toMat(a[0], 'The bits').d], n = Math.round(toMat(a[1] ?? num(8)).d[0]);
  if (b.length % n) throw new LabError(`bit2int needs a multiple of ${n} bits.`);
  const out = Array.from({ length: b.length / n }, (_, i) => b.slice(i * n, i * n + n).reduce((s, v) => s * 2 + (v ? 1 : 0), 0));
  return [mat(out.length, 1, out)];
});
def('scatterplot', (a, _n, lab) => {
  const [re, im] = reIm(a[0]);
  call(lab, 'plot', mat(1, re.length, re), mat(1, im.length, im), str('.'));
  call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'xlabel', str('In-phase')); call(lab, 'ylabel', str('Quadrature')); call(lab, 'title', str('Scatter plot'));
  return [];
});
