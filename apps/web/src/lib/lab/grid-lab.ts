import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as g from './grid';

// Hyperion's power systems and mixed-signal in the language (M426): powerflow, shortcircuit, adc, dac, snr, pll; M435:
// transformer taps (a sixth line column, and 'TapControl' to hold voltages), unbalanced faults ('Type' LG, LL, LLG).
// Buses as rows [type P Q V angle] (type 3 slack, 2 generator (PV), 1 load (PQ), as MATPOWER numbers them; P, Q
// injections in per unit, angle in degrees) and lines as rows [from to r x b] (buses numbered from 1).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const rows = (v: Value | undefined, what: string, cols: number): number[][] => {
  if (!v) throw new LabError(`${what} is missing.`);
  const m = toMat(v, what);
  if (m.c < cols) throw new LabError(`${what} needs ${cols} columns.`);
  return Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]));
};
const col = (v: number[]) => mat(v.length, 1, v);
const row = (v: number[]) => mat(1, v.length, v);
/** Lines as rows [from to r x b extra]: the sixth column is a transformer's tap for powerflow, the zero-sequence
 * reactance x0 for shortcircuit. */
const linesOf = (v: Value | undefined, n: number, sixth: 'tap' | 'x0' = 'tap'): g.Line[] => rows(v, 'The lines [from to r x b]', 4).map((r) => {
  const l: g.Line = { from: r[0] - 1, to: r[1] - 1, r: r[2], x: r[3], b: r[4] ?? 0 };
  if (r[5] !== undefined && r[5] > 0) l[sixth] = r[5];
  if (sixth === 'tap' && l.tap !== undefined && !(l.tap >= 0.5 && l.tap <= 1.5)) throw new LabError('A tap is an off-nominal ratio from 0.5 to 1.5 (1 = none).');
  if (![l.from, l.to].every((b) => Number.isInteger(b) && b >= 0 && b < n)) throw new LabError(`A line joins buses that don't exist (there are ${n}).`);
  if (!l.r && !l.x) throw new LabError('A line needs some impedance (r or x).');
  return l;
});
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };

def('powerflow', (a) => {
  const B = rows(a[0], 'The buses [type P Q V angle]', 5), types: Record<number, g.BusType> = { 1: 'PQ', 2: 'PV', 3: 'slack' };
  const buses = B.map((r, i) => { const type = types[r[0]]; if (!type) throw new LabError(`Bus ${i + 1}'s type is 3 (slack), 2 (generator) or 1 (load).`); return { type, P: r[1], Q: r[2], V: r[3] || 1, angle: (r[4] * Math.PI) / 180 }; });
  const lines = linesOf(a[1], buses.length);
  // 'TapControl', rows [line bus target]: on-load tap changers holding those buses' voltages.
  let control: { line: number; bus: number; target: number }[] = [];
  for (let i = 2; i + 1 < a.length; i += 2) {
    if (a[i].k !== 'str' || !/^tapcontrol$/i.test((a[i] as { v: string }).v)) throw new LabError("powerflow's option is 'TapControl', rows [line bus targetV].");
    control = rows(a[i + 1], 'TapControl [line bus target]', 3).map((c) => ({ line: c[0] - 1, bus: c[1] - 1, target: c[2] }));
    if (control.some((c) => !lines[c.line] || !(c.bus >= 0 && c.bus < buses.length) || !(c.target > 0.5 && c.target < 1.5))) throw new LabError('TapControl names a line and a bus that exist, and a target voltage near 1 pu.');
  }
  const r = wrap(() => (control.length ? g.loadFlowTaps(buses, lines, control) : { ...g.loadFlow(buses, lines), taps: lines.map((l) => l.tap || 1) }));
  if (!r.converged) throw new LabError('The load flow didn’t converge: the load may be more than the network can carry.');
  return [{ k: 'struct', f: new Map<string, Value>([
    ['V', col(r.V)], ['AngleDeg', col(r.angle.map((t) => (t * 180) / Math.PI))], ['P', col(r.P)], ['Q', col(r.Q)],
    ['LineFlows', (() => { const m = mat(r.flows.length, 4); r.flows.forEach((f, i) => { m.d[i] = f.from + 1; m.d[i + r.flows.length] = f.to + 1; m.d[i + 2 * r.flows.length] = f.P; m.d[i + 3 * r.flows.length] = f.Q; }); return m; })()],
    ['Losses', num(r.losses)], ['Iterations', num(r.iterations)], ['Taps', col(r.taps)],
  ]) } satisfies Struct];
});
def('shortcircuit', (a) => {
  if (a.length < 4) throw new LabError("shortcircuit needs the number of buses, the lines, the sources [bus x1 x2 x0] and the faulted bus: shortcircuit(n, lines, sources, k, 'Type', 'LG').");
  const n = Math.round(toMat(a[0]).d[0]), k = Math.round(toMat(a[3]).d[0]) - 1;
  if (!(k >= 0 && k < n)) throw new LabError(`The faulted bus must be 1 to ${n}.`);
  let kind: g.FaultKind = '3P', zf: [number, number] = [0, 0];
  for (let i = 4; i + 1 < a.length; i += 2) {
    const key = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (key === 'type') { const t = textOf(a[i + 1]).toUpperCase(); if (!['3P', 'LG', 'LL', 'LLG'].includes(t)) throw new LabError("The fault's 'Type' is '3P', 'LG' (line to ground), 'LL' (line to line) or 'LLG'."); kind = t as g.FaultKind; }
    else if (key === 'zf') { const z = toMat(a[i + 1]); zf = [z.d[0], z.im ? z.im[0] : 0]; }
    else throw new LabError("shortcircuit's options are 'Type' and 'Zf' (the fault's impedance, pu).");
  }
  // Sources [bus x1 x2 x0]: x2 and x0 as x1 unless given; Inf for x0 means not grounded.
  const sources = rows(a[2], 'The sources [bus x1 x2 x0]', 2).map((r) => ({ bus: r[0] - 1, x1: r[1], x2: r[2] ?? r[1], x0: r[3] ?? r[1] }));
  const r = wrap(() => g.unbalancedFault(n, linesOf(a[1], n, 'x0'), sources, k, kind, zf));
  // The faulted phase's current: a for line to ground and three-phase, b for the others.
  const current = kind === 'LG' || kind === '3P' ? r.phase[0] : r.phase[1];
  const V = kind === '3P' ? col(r.voltages.map((v) => v[0])) : (() => { const m = mat(n, 3); r.voltages.forEach((v, i) => v.forEach((x, j) => { m.d[i + j * n] = x; })); return m; })();
  return [{ k: 'struct', f: new Map<string, Value>([['FaultCurrent', num(current)], ['Zkk', num(Math.hypot(...r.z[1]))], ['PhaseCurrents', row(r.phase)], ['SequenceCurrents', row(r.seq)], ['BusVoltages', V], ['Type', { k: 'str', v: kind }]]) } satisfies Struct];
});
const range = (v: Value | undefined): [number, number] => { if (!v) return [-1, 1]; const m = toMat(v).d; return [m[0], m[1]]; };
def('adc', (a) => {
  const x = toMat(a[0], 'The signal'), bits = Math.round(toMat(a[1] ?? num(8)).d[0]), [lo, hi] = range(a[2]);
  if (!(bits >= 1 && bits <= 24) || !(hi > lo)) throw new LabError('adc(x, bits, [lo hi]): 1 to 24 bits and a range with lo < hi.');
  const r = g.adc([...x.d], bits, lo, hi);
  return [mat(x.r, x.c, r.codes), mat(x.r, x.c, r.values)];
});
def('dac', (a) => {
  const c = toMat(a[0], 'The codes'), bits = Math.round(toMat(a[1] ?? num(8)).d[0]), [lo, hi] = range(a[2]);
  return [mat(c.r, c.c, g.dac([...c.d], bits, lo, hi))];
});
def('snr', (a) => {
  // snr(signal, noise), as the ratio of their powers in dB.
  if (a.length < 2) throw new LabError('snr needs the signal and the noise: snr(x, noise).');
  const x = [...toMat(a[0]).d], e = [...toMat(a[1]).d];
  if (x.length !== e.length) throw new LabError('The signal and the noise must be the same length.');
  return [num(g.snrOf(x, x.map((v, i) => v + e[i])))];
});
def('pll', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("pll needs the input frequency (a number or a vector per sample), the sample rate and the number of samples: pll(fin, fs, n, 'Bandwidth', 50).");
  const fin = toMat(a[0], 'The input frequency') as Mat, fs = toMat(a[1]).d[0], n = Math.round(toMat(a[2]).d[0]);
  if (!(fs > 0 && n > 1 && n <= 2_000_000)) throw new LabError('The sample rate must be positive and the samples between 2 and 2,000,000.');
  const opt: Record<string, number> = {};
  for (let i = 3; i + 1 < a.length; i += 2) if (a[i].k === 'str') opt[(a[i] as { v: string }).v.toLowerCase()] = toMat(a[i + 1]).d[0];
  const at = (t: number) => fin.d[Math.min(fin.d.length - 1, Math.round(t * fs))];
  const r = g.pll(at, fs, n, { f0: opt.freerun, bandwidth: opt.bandwidth, damping: opt.damping });
  if (nout > 0) return [row(r.freq), row(r.err)];
  const t = row(r.freq.map((_, k) => k / fs));
  call(lab, 'plot', t, row(r.freq.map((_, k) => at(k / fs))), str('--'));
  call(lab, 'hold', str('on')); call(lab, 'plot', t, row(r.freq)); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('Input'), str('Locked oscillator')); call(lab, 'xlabel', str('Time (s)')); call(lab, 'ylabel', str('Frequency (Hz)')); call(lab, 'title', str('Phase-locked loop')); call(lab, 'grid', str('on'));
  return [];
});
