import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as cf from './cellfit';
import * as se from './socest';
import * as sp from './spme';

// Hyperion's battery systems in the language (M570–, from MathWorks' battery-systems page and its topic pages; written
// fresh). Part 1, cell characterisation: ecmCell, ecmSimulate, hppcTest, hppcFit. Part 2 (M571), state estimation:
// socCoulomb, socKalman, ocvSOC, sohEstimate. Part 3 (M572), electrochemistry: spmeCell, spmeSimulate, spmeFit. Cells are plain structs (Type
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

// ——— M571: SOC and SOH ———
def('socCoulomb', (a) => {
  const I = vec(a[0], 'The current (A, + discharging)'), dt = n0(a[1], NaN), cap = n0(a[2], NaN), z0 = n0(a[3], 1), eta = n0(a[4], 1);
  if (!(dt > 0 && cap > 0) || !(z0 >= 0 && z0 <= 1) || !(eta > 0 && eta <= 1)) throw new LabError('socCoulomb(I, dt, capacity, soc0, eta): dt and capacity above 0, soc0 from 0 to 1, the charging efficiency eta in (0, 1].');
  return [row(se.coulombCount(I, dt, cap, z0, eta))];
});
def('ocvSOC', (a) => { const c = ecmOf(a[0], 'ocvSOC'), v = toMat(a[1] ?? num(NaN), 'The rested voltage'); return [mat(v.r, v.c, [...v.d].map((x) => se.socFromOcv(c, x)))]; });
/** The common options of the filters. */
function filterOpts(a: Value[], from: number, what: string, extra: string[] = []) {
  const o = opts(a, from, ['Filter', 'SOC0', 'P0', 'Q', 'R', ...extra], what), p: Partial<se.SocOptions> = {};
  if (o.has('Filter')) { const f = textOf(o.get('Filter')!).toLowerCase(); if (f !== 'ekf' && f !== 'ukf') throw new LabError(`${what}: 'Filter' is 'ekf' or 'ukf'.`); p.filter = f; }
  if (o.has('SOC0')) { p.soc0 = n0(o.get('SOC0'), NaN); if (!(p.soc0 >= 0 && p.soc0 <= 1)) throw new LabError(`${what}: 'SOC0' is from 0 to 1.`); }
  for (const [k, key] of [['P0', 'p0'], ['Q', 'q'], ['R', 'r']] as const) if (o.has(k)) { const x = n0(o.get(k), NaN); if (!(x > 0)) throw new LabError(`${what}: '${k}' must be above 0.`); p[key] = x; }
  return { p, o };
}
const signals = (a: Value[], what: string) => {
  const c = ecmOf(a[0], what), I = vec(a[1], 'The current (A, + discharging)'), v = vec(a[2], 'The voltage (V)'), dt = n0(a[3], NaN);
  if (I.length !== v.length || !(dt > 0)) throw new LabError(`${what}(cell, I, v, dt, …): current and voltage the same length, dt above 0.`);
  if (I.length > 500_000) throw new LabError(`${what}: at most 500,000 samples.`);
  return { c, I, v, dt };
};
def('socKalman', (a, nout, lab) => {
  const { c, I, v, dt } = signals(a, 'socKalman'), { p } = filterOpts(a, 4, 'socKalman');
  const r = se.socFilter(c, I, v, dt, p);
  if (nout > 0) return [row(r.soc), row(r.spread)];
  const t = row(I.map((_, k) => (k * dt) / 60)), z = r.soc.map((x) => 100 * x);
  call(lab, 'plot', t, row(z), str('-'), t, row(z.map((x, k) => x + 200 * r.spread[k])), str(':'), t, row(z.map((x, k) => x - 200 * r.spread[k])), str(':'));
  call(lab, 'legend', str(`SOC (${(p.filter ?? 'ekf').toUpperCase()})`), str('± 2σ'));
  call(lab, 'xlabel', str('Minutes')); call(lab, 'ylabel', str('State of charge (%)')); call(lab, 'grid', str('on'));
  return [];
});
def('sohEstimate', (a, nout, lab) => {
  const { c, I, v, dt } = signals(a, 'sohEstimate'), { p, o } = filterOpts(a, 4, 'sohEstimate', ['Rest']);
  const rest = n0(o.get('Rest'), 300);
  if (!(rest > 0)) throw new LabError("sohEstimate: 'Rest' (s) must be above 0.");
  const r = se.sohFilter(c, I, v, dt, { ...p, rest });
  const out = S([['SOH', num(r.soh)], ['Capacity', num(r.capacity)], ['R0Growth', num(r.r0Growth.at(-1) ?? 1)], ['SOC', row(r.soc)], ['R0Track', row(r.r0Growth)]]);
  if (nout > 0) return [out];
  const t = row(I.map((_, k) => (k * dt) / 3600));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', t, row(r.soc.map((x) => 100 * x))); call(lab, 'ylabel', str('SOC (%)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`SOH ${(100 * r.soh).toFixed(1)}% (${r.capacity.toFixed(2)} of ${c.capacity} Ah), R0 × ${(r.r0Growth.at(-1) ?? 1).toFixed(2)}`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', t, row(r.r0Growth)); call(lab, 'ylabel', str('R0 / new')); call(lab, 'xlabel', str('Hours')); call(lab, 'grid', str('on'));
  return [];
});

// ——— M572: the single particle model with electrolyte ———
const SPME_KEYS = Object.keys(sp.LGM50) as (keyof sp.SpmeParams)[];
function spmeValue(p: sp.SpmeParams): Struct {
  return S([['Type', str('spmeCell')], ...SPME_KEYS.map((k) => [k, num(p[k])] as [string, Value]), ['Capacity', num(sp.spmeCapacity(p))]]);
}
function spmeOf(v: Value | undefined, what: string): sp.SpmeParams {
  if (!v || v.k !== 'struct' || !v.f.get('Type') || textOf(v.f.get('Type')!) !== 'spmeCell') throw new LabError(`${what} needs a cell from spmeCell.`);
  const p = { ...sp.LGM50 };
  for (const k of SPME_KEYS) { const x = v.f.get(k); if (x) { const n = toMat(x).d[0]; if (!(n > 0) && k !== 'rContact') throw new LabError(`${what}: the cell's ${k} must be above 0.`); p[k] = n; } }
  if (!(p.x100 > p.x0 && p.y0 > p.y100 && p.x100 < 1 && p.y0 < 1)) throw new LabError(`${what}: the stoichiometries need x0 < x100 < 1 and y100 < y0 < 1.`);
  return p;
}
def('spmeCell', (a) => {
  const o = opts(a, 0, SPME_KEYS as string[], 'spmeCell'), p = { ...sp.LGM50 };
  for (const [k, v] of o) p[k as keyof sp.SpmeParams] = toMat(v).d[0];
  return [spmeValue(spmeOf(spmeValue(p), 'spmeCell'))];
});
const spmeArgs = (a: Value[], what: string) => {
  const p = spmeOf(a[0], what), I = vec(a[1], 'The current (A, + discharging)'), dt = n0(a[2], NaN), z0 = n0(a[3], 1);
  if (!(dt > 0) || !(z0 >= 0 && z0 <= 1)) throw new LabError(`${what}(cell, I, dt, soc0): dt above 0, soc0 from 0 to 1.`);
  if (I.length > 200_000) throw new LabError(`${what}: at most 200,000 samples.`);
  return { p, I, dt, z0 };
};
def('spmeSimulate', (a, nout, lab) => {
  const { p, I, dt, z0 } = spmeArgs(a, 'spmeSimulate'), r = sp.spmeSim(p, I, dt, z0, { keepCe: Math.max(1, Math.floor(I.length / 6)) });
  if (nout > 0) return [row(r.v), row(r.soc), row(r.xSurf), row(r.ySurf)];
  const t = row(r.v.map((_, k) => (k * dt) / 60));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', t, row(r.v)); call(lab, 'ylabel', str('Voltage (V)')); call(lab, 'xlabel', str('Minutes')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(r.v.length < I.length ? `Stopped at ${r.v.at(-1)!.toFixed(2)} V after ${((r.v.length * dt) / 60).toFixed(1)} min` : 'Single particle model with electrolyte'));
  call(lab, 'subplot', num(2), num(1), num(2));
  const x = row(r.ceAt.map((m) => m * 1e6));
  r.ce.forEach((c, i) => { call(lab, 'plot', x, row(c)); if (i === 0) call(lab, 'hold', str('on')); });
  call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Across the cell, negative to positive (µm)')); call(lab, 'ylabel', str('Electrolyte (mol/m³)')); call(lab, 'grid', str('on'));
  return [];
});
def('spmeFit', (a) => {
  const { p, I, dt, z0 } = spmeArgs([a[0], a[1], a[3], a[4]], 'spmeFit'), v = vec(a[2], 'The measured voltage (V)');
  if (v.length !== I.length) throw new LabError('spmeFit(cell, I, v, dt, soc0, \'Fit\', {…}): current and voltage the same length.');
  if (I.length > 20_000) throw new LabError('spmeFit: at most 20,000 samples (it simulates the cell many times).');
  const o = opts(a, 5, ['Fit'], 'spmeFit');
  let fit = sp.GROUP_NAMES;
  if (o.has('Fit')) {
    const want = o.get('Fit')!, names = want.k === 'cell' ? want.d.map((x) => textOf(x)) : [textOf(want)];
    fit = names.map((n) => { const k = sp.GROUP_NAMES.find((g) => g.toLowerCase() === n.toLowerCase()); if (!k) throw new LabError(`spmeFit can fit ${sp.GROUP_NAMES.join(', ')}.`); return k; });
  }
  const r = sp.spmeFit(p, I, v, dt, z0, fit), cell = spmeValue(r.cell);
  cell.f.set('Groups', S(sp.GROUP_NAMES.map((k) => [k, num(r.groups[k])] as [string, Value])));
  cell.f.set('FitRMS', num(r.rms));
  return [cell];
});
