import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as cf from './cellfit';

// Hyperion's battery systems in the language (M570–, from MathWorks' battery-systems page and its topic pages; written
// fresh). Part 1, cell characterisation: ecmCell, ecmSimulate, hppcTest, hppcFit. Cells are plain structs (Type
// 'ecmCell'): Capacity, SOC, OCV, R0 (rows over SOC), R and Tau (one row a pair).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const n0 = (v: Value | undefined, d: number) => (v ? toMat(v).d[0] : d);
const vec = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} is missing.`); return [...toMat(v).d]; };
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const rows = (m: number[][]) => mat(m.length, m[0]?.length ?? 0, Array.from({ length: (m[0]?.length ?? 0) * m.length }, (_, k) => m[k % m.length][Math.floor(k / m.length)]));
const S = (fields: [string, Value][]): Struct => ({ k: 'struct', f: new Map(fields) });
/** Name–value pairs, case-insensitive. */
export function opts(a: Value[], from: number, names: string[], what: string): Map<string, Value> {
  const out = new Map<string, Value>();
  if ((a.length - from) % 2) throw new LabError(`${what} takes name, value pairs after its first arguments.`);
  for (let i = from; i < a.length; i += 2) {
    const want = textOf(a[i]).toLowerCase(), name = names.find((n) => n.toLowerCase() === want);
    if (!name) throw new LabError(`${what} has no '${textOf(a[i])}': it takes ${names.map((n) => `'${n}'`).join(', ')}.`);
    out.set(name, a[i + 1]);
  }
  return out;
}

export function ecmValue(c: cf.EcmCell): Struct {
  return S([['Type', str('ecmCell')], ['Capacity', num(c.capacity)], ['SOC', row(c.soc)], ['OCV', row(c.ocv)], ['R0', row(c.r0)], ['R', rows(c.r)], ['Tau', rows(c.tau)]]);
}
/** An ecmCell struct back into a cell, checked. */
export function ecmOf(v: Value | undefined, what: string): cf.EcmCell {
  if (!v || v.k !== 'struct' || !v.f.get('Type') || textOf(v.f.get('Type')!) !== 'ecmCell') throw new LabError(`${what} needs a cell from ecmCell or hppcFit.`);
  const g = (k: string) => { const m = v.f.get(k); if (!m) throw new LabError(`The cell has no ${k}.`); return toMat(m); };
  const soc = [...g('SOC').d], R = g('R'), T = g('Tau'), n = soc.length;
  const pick = (m: ReturnType<typeof toMat>) => Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, k) => m.d[i + k * m.r]));
  const c: cf.EcmCell = { capacity: n0(v.f.get('Capacity'), NaN), soc, ocv: [...g('OCV').d], r0: [...g('R0').d], r: pick(R), tau: pick(T) };
  if (!(c.capacity > 0) || n < 1 || c.ocv.length !== n || c.r0.length !== n || R.c !== n || T.c !== n || R.r !== T.r || R.r > 5) throw new LabError(`${what}: the cell's tables don't match its SOC points (R and Tau: one row a pair, a column a point).`);
  if (soc.some((z, i) => i > 0 && z <= soc[i - 1])) throw new LabError(`${what}: the cell's SOC points must rise.`);
  if (c.tau.some((r) => r.some((x) => !(x > 0)))) throw new LabError(`${what}: time constants must be positive.`);
  return c;
}

def('ecmCell', (a) => {
  // ecmCell(pairs) for the sample cell; or ecmCell('Capacity', 5, 'SOC', …, 'OCV', …, 'R0', …, 'R', …, 'Tau', …).
  if (a.length <= 1) {
    const p = Math.round(n0(a[0], 2));
    if (!(p >= 1 && p <= 3)) throw new LabError('ecmCell(pairs): one to three RC pairs.');
    return [ecmValue(cf.sampleEcm(p))];
  }
  const o = opts(a, 0, ['Capacity', 'SOC', 'OCV', 'R0', 'R', 'Tau'], 'ecmCell'), base = ecmValue(cf.sampleEcm(2));
  for (const [k, v] of o) base.f.set(k, v);
  return [ecmValue(ecmOf(base, 'ecmCell'))];
});

def('ecmSimulate', (a, nout, lab) => {
  const c = ecmOf(a[0], 'ecmSimulate'), I = vec(a[1], 'The current (A, + discharging)'), dt = n0(a[2], NaN), soc0 = n0(a[3], 1);
  if (!(dt > 0) || !(soc0 >= 0 && soc0 <= 1)) throw new LabError('ecmSimulate(cell, I, dt, soc0): a time step above 0 and a starting SOC from 0 to 1.');
  const r = cf.ecmSim(c, I, dt, soc0);
  if (nout > 0) return [row(r.v), row(r.soc)];
  const t = row(I.map((_, k) => (k * dt) / 60));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', t, row(r.v)); call(lab, 'ylabel', str('Voltage (V)')); call(lab, 'grid', str('on')); call(lab, 'title', str('Cell under load'));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', t, row(r.soc.map((z) => 100 * z))); call(lab, 'ylabel', str('State of charge (%)')); call(lab, 'xlabel', str('Minutes')); call(lab, 'grid', str('on'));
  return [];
});

def('hppcTest', (a, nout, lab) => {
  const cap = n0(a[0], NaN);
  if (!(cap > 0)) throw new LabError("hppcTest(capacity, 'PulseC', 1, 'ChargeC', 0.75, 'Pulse', 10, 'Rest', 40, 'LongRest', 3600, 'Step', 0.1, 'dt', 1): the cell's capacity (Ah).");
  const o = opts(a, 1, ['PulseC', 'ChargeC', 'StepC', 'Pulse', 'Rest', 'LongRest', 'Step', 'dt'], 'hppcTest'), p: Partial<cf.HppcOptions> = {};
  const keys: Record<string, keyof cf.HppcOptions> = { PulseC: 'pulseC', ChargeC: 'chargeC', StepC: 'stepC', Pulse: 'pulse', Rest: 'rest', LongRest: 'longRest', Step: 'step', dt: 'dt' };
  for (const [k, v] of o) { const x = toMat(v).d[0]; if (!(x > 0)) throw new LabError(`'${k}' must be above 0.`); p[keys[k]] = x; }
  if ((p.step ?? 0.1) > 0.5) throw new LabError("'Step' is the share of the capacity between levels (0.1 for every 10%).");
  const I = cf.hppcProfile(cap, p), dt = p.dt ?? 1;
  if (I.length > 2_000_000) throw new LabError('That test is over 2 million samples: make dt bigger.');
  const t = row(I.map((_, k) => k * dt));
  if (nout > 0) return [t, row(I)];
  call(lab, 'plot', row(I.map((_, k) => (k * dt) / 3600)), row(I)); call(lab, 'xlabel', str('Hours')); call(lab, 'ylabel', str('Current (A, + discharging)')); call(lab, 'title', str('HPPC test')); call(lab, 'grid', str('on'));
  return [];
});

def('hppcFit', (a, nout, lab) => {
  const t = vec(a[0], 'The time (s)'), I = vec(a[1], 'The current (A)'), v = vec(a[2], 'The voltage (V)'), cap = n0(a[3], NaN), pairs = Math.round(n0(a[4], 2));
  if (!(cap > 0)) throw new LabError('hppcFit(t, I, v, capacity, pairs): the capacity (Ah) is needed to count the state of charge.');
  let r: cf.HppcFit;
  try { r = cf.hppcFit(t, I, v, cap, pairs); } catch (e) { throw new LabError(`hppcFit: ${e instanceof Error ? e.message : String(e)}`); }
  const cell = ecmValue(r.cell);
  cell.f.set('FitRMS', num(r.rms)); cell.f.set('Pulses', num(r.pulses));
  if (nout > 0) return [cell];
  // No output: the test against the fitted cell, and the tables.
  const sim = cf.ecmSim(r.cell, I, t[1] - t[0], 1).v, h = row(t.map((x) => x / 3600));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', h, row(v), str('-'), h, row(sim), str('--')); call(lab, 'legend', str('Measured'), str('Fitted cell')); call(lab, 'ylabel', str('Voltage (V)')); call(lab, 'xlabel', str('Hours')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`HPPC fit: ${r.pulses} pulses, ${(r.rms * 1000).toFixed(1)} mV RMS`));
  call(lab, 'subplot', num(2), num(1), num(2));
  const z = row(r.cell.soc.map((x) => 100 * x));
  call(lab, 'plot', z, row(r.cell.r0.map((x) => 1000 * x)), str('-o'));
  call(lab, 'hold', str('on'));
  r.cell.r.forEach((ri) => call(lab, 'plot', z, row(ri.map((x) => 1000 * x)), str('-s')));
  call(lab, 'hold', str('off'));
  call(lab, 'legend', str('R0'), ...r.cell.r.map((_, i) => str(`R${i + 1}`)));
  call(lab, 'xlabel', str('State of charge (%)')); call(lab, 'ylabel', str('Resistance (mΩ)')); call(lab, 'grid', str('on'));
  return [];
});
