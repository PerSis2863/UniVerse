import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as cf from './cellfit';
import * as se from './socest';
import * as sp from './spme';
import * as pk from './pack';

// Hyperion's battery systems in the language (M570–, from MathWorks' battery-systems page and its topic pages; written
// fresh). Part 1, cell characterisation: ecmCell, ecmSimulate, hppcTest, hppcFit. Part 2 (M571), state estimation:
// socCoulomb, socKalman, ocvSOC, sohEstimate. Part 3 (M572), electrochemistry: spmeCell, spmeSimulate, spmeFit.
// Part 4 (M573), packs: packBuild, packFault, packSimulate, packAging, arcTest; M573b packPlate. Cells are plain structs (Type
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

// ——— M573: packs ———
// shortcut: the full spec (the cell, faults, coolant) rides beside the struct, not in its fields, so a pack edited
// field by field or saved and loaded must be built again with packBuild; likewise a run for packAging.
const packs = new WeakMap<Struct, pk.PackSpec>();
function packValue(p: pk.PackSpec): Struct {
  const v = S([['Type', str('batteryPackModel')], ['Series', num(p.series)], ['Parallel', num(p.parallel)], ['Cells', num(p.series * p.parallel)],
    ['NominalVoltage', num(p.series * cf.lookup(p.cell.soc, p.cell.ocv, 0.5))], ['Capacity', num(p.parallel * p.cell.capacity)], ['Faults', num(p.faults.length)]]);
  packs.set(v, p);
  return v;
}
const packOf = (v: Value | undefined, what: string) => { const p = v && v.k === 'struct' ? packs.get(v) : undefined; if (!p) throw new LabError(`${what} needs a pack from packBuild (or packFault).`); return p; };
def('packBuild', (a) => {
  const c = ecmOf(a[0], 'packBuild'), s = Math.round(n0(a[1], NaN)), p = Math.round(n0(a[2], NaN));
  if (!(s >= 1 && p >= 1 && s * p <= 2000)) throw new LabError('packBuild(cell, series, parallel, …): 1–2,000 cells.');
  const o = opts(a, 3, ['Spread', 'Seed', 'Coolant', 'Ambient', 'Cooling', 'Temperature', 'Columns', 'Gas', 'Fire'], 'packBuild');
  const spec = pk.packSpec(c, s, p);
  if (o.has('Spread')) { const x = vec(o.get('Spread'), 'Spread'); if (x.length !== 3 || x.some((y) => !(y >= 0 && y < 0.5))) throw new LabError("'Spread' is [capacity R0 SOC], one-sigma shares from 0 to 0.5."); spec.spread = { capacity: x[0], r0: x[1], soc: x[2] }; }
  if (o.has('Seed')) spec.seed = n0(o.get('Seed'), 1);
  if (o.has('Ambient')) spec.ambient = n0(o.get('Ambient'), 25);
  if (o.has('Temperature')) spec.t0 = n0(o.get('Temperature'), 25);
  if (o.has('Coolant')) {
    const x = vec(o.get('Coolant'), 'Coolant');
    if (x.length === 0) spec.coolant = null;
    else { if (x.length !== 2 || !(x[1] > 0)) throw new LabError("'Coolant' is [inlet °C, flow kg/s], or [] for none."); spec.coolant = { ...pk.GLYCOL, inlet: x[0], flow: x[1] }; }
  }
  if (o.has('Cooling')) { const x = vec(o.get('Cooling'), 'Cooling'); if (x.length !== 3 || x.some((y) => !(y >= 0))) throw new LabError("'Cooling' is [to the coolant, to the air, to each neighbour] in W/K."); spec.thermal = { ...pk.CELL_THERMAL, hCool: x[0], hAir: x[1], kNeighbour: x[2] }; }
  if (o.has('Columns')) { const x = n0(o.get('Columns'), NaN); if (!(x >= 1)) throw new LabError("'Columns' is how many cells a row of the plate holds (1 or more)."); spec.cols = Math.round(x); }
  if (o.has('Gas')) { const x = vec(o.get('Gas'), 'Gas'); if (x.length !== 4 || !(x[0] > 0 && x[1] >= 0 && x[2] > 0 && x[3] >= 0)) throw new LabError("'Gas' is [vent °C, litres per Ah, enclosure m³, air changes an hour]."); spec.gas = { ...spec.gas, ventT: x[0], litresPerAh: x[1], volume: x[2], ach: x[3] }; }
  if (o.has('Fire')) { const x = n0(o.get('Fire'), NaN); if (!(x >= 0 && x <= 0.25)) throw new LabError("'Fire' is the share of a vent's flame that heats each neighbour, 0 (no fire) to 0.25."); spec.gas = { ...spec.gas, fire: x }; }
  return [packValue(spec)];
});
def('packFault', (a) => {
  const p = packOf(a[0], 'packFault'), cellNo = Math.round(n0(a[1], NaN)), kind = a[2] ? textOf(a[2]).toLowerCase() : '', at = n0(a[3], 0), value = n0(a[4], NaN);
  const N = p.series * p.parallel;
  if (!(cellNo >= 1 && cellNo <= N)) throw new LabError(`packFault(pack, cell, kind, at, value): cell 1 to ${N}.`);
  if (kind !== 'resistance' && kind !== 'short' && kind !== 'heater') throw new LabError("packFault: the kind is 'resistance' (Ω added), 'short' (Ω across the cell) or 'heater' (W).");
  if (!(value > 0) || !(at >= 0)) throw new LabError('packFault: a value above 0 and a time of 0 or more.');
  return [packValue({ ...p, faults: [...p.faults, { cell: cellNo - 1, kind, at, value }] })];
});
const lastRun = new WeakMap<Struct, pk.PackRun>();
def('packSimulate', (a, nout, lab) => {
  const p = packOf(a[0], 'packSimulate'), I = vec(a[1], 'The current (A, + discharging)'), dt = n0(a[2], NaN), z0 = n0(a[3], 1);
  if (!(dt > 0) || !(z0 >= 0 && z0 <= 1)) throw new LabError('packSimulate(pack, I, dt, soc0): dt above 0, soc0 from 0 to 1.');
  if (I.length * p.series * p.parallel > 20_000_000) throw new LabError('packSimulate: too much to simulate (samples × cells over 20 million).');
  const r = pk.packSim(p, I, dt, z0);
  const out = S([['Time', row(r.t)], ['Voltage', row(r.v)], ['CellVoltage', rows(r.cellV)], ['CellCurrent', rows(r.cellI)], ['SOC', rows(r.soc)], ['Temperature', rows(r.temp)],
    ['CoolantOut', row(r.coolantOut)], ['MaxTemperature', num(r.maxTemp)], ['Runaway', row(r.runaway.map((i) => i + 1))], ['CellCapacity', row(r.capacity)],
    ['Vented', row(r.vented.map((i) => i + 1))], ['VentTime', row(r.ventTime)], ['GasVolume', row(r.gas)], ['LFLShare', row(r.lfl)], ['TimeToLFL', num(r.timeToLfl)], ['HeatRelease', row(r.hrr)]]);
  lastRun.set(out, r);
  if (nout > 0) return [out];
  const t = row(r.t.map((x) => x / 60));
  const n = r.vented.length ? 4 : 3;
  call(lab, 'subplot', num(n), num(1), num(1)); call(lab, 'plot', t, row(r.v)); call(lab, 'ylabel', str('Pack (V)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(r.runaway.length ? `Thermal runaway in cell${r.runaway.length > 1 ? 's' : ''} ${r.runaway.map((i) => i + 1).join(', ')}` : `Hottest cell ${r.maxTemp.toFixed(1)} °C`));
  call(lab, 'subplot', num(n), num(1), num(2)); call(lab, 'imagesc', t, row(r.temp.map((_, i) => i + 1)), rows(r.temp)); call(lab, 'colorbar'); call(lab, 'ylabel', str('Cell (°C)'));
  call(lab, 'subplot', num(n), num(1), num(3));
  const zmin = r.t.map((_, k) => Math.min(...r.soc.map((s) => s[k]))), zmax = r.t.map((_, k) => Math.max(...r.soc.map((s) => s[k])));
  call(lab, 'plot', t, row(zmin.map((x) => 100 * x)), str('-'), t, row(zmax.map((x) => 100 * x)), str('-'));
  call(lab, 'legend', str('Lowest cell'), str('Highest cell')); call(lab, 'ylabel', str('SOC (%)')); call(lab, 'grid', str('on'));
  if (n === 4) {
    call(lab, 'subplot', num(4), num(1), num(4));
    if (p.gas.fire > 0) { call(lab, 'plot', t, row(r.hrr.map((w) => w / 1000))); call(lab, 'ylabel', str('Flames (kW)')); }
    else { call(lab, 'plot', t, row(r.lfl.map((x) => 100 * x))); call(lab, 'ylabel', str('Gas (% of LFL)')); call(lab, 'title', str(Number.isFinite(r.timeToLfl) ? `Flammable at ${(r.timeToLfl / 60).toFixed(1)} min` : `${r.gas.at(-1)!.toFixed(1)} L vented, below its flammable limit`)); }
    call(lab, 'grid', str('on'));
  }
  call(lab, 'xlabel', str('Minutes'));
  return [];
});
// M573b: the plate drawn from above, each cell coloured by its temperature at time t (the end by default), the
// coolant's channel snaking through them, cells that vented ringed and those that ran away crossed.
def('packPlate', (a, nout, lab) => {
  const p = packOf(a[0], 'packPlate'), N = p.series * p.parallel, L = pk.plateLayout(N, p.cols), r = a[1] && a[1].k === 'struct' ? lastRun.get(a[1]) : undefined;
  if (a[1] && !r) throw new LabError('packPlate(pack, run, t): run is what packSimulate gave for this pack.');
  const k = r ? (a[2] ? r.t.reduce((b, x, i) => (Math.abs(x - n0(a[2], 0)) < Math.abs(r.t[b] - n0(a[2], 0)) ? i : b), 0) : r.t.length - 1) : -1;
  const T = Array.from({ length: N }, (_, i) => (r ? r.temp[i][k] : p.t0 ?? p.ambient));
  if (nout > 0) return [S([['X', row(L.x.map((x) => x + 1))], ['Y', row(L.y.map((y) => y + 1))], ['Temperature', row(T)]])];
  const grid = mat(L.rows, L.cols, new Array(L.rows * L.cols).fill(NaN));
  T.forEach((v, i) => { grid.d[L.x[i] * L.rows + L.y[i]] = v; });
  call(lab, 'imagesc', grid); call(lab, 'colorbar'); call(lab, 'axis', str('equal')); call(lab, 'hold', str('on'));
  const path = L.x.map((_, i) => i);
  if (p.coolant) call(lab, 'plot', row(path.map((i) => L.x[i] + 1)), row(path.map((i) => L.y[i] + 1)), str('Color'), str('#38bdf8'), str('LineWidth'), num(2));
  if (N <= 200) T.forEach((v, i) => call(lab, 'text', num(L.x[i] + 1), num(L.y[i] + 1.3), str(String(i + 1)), str('HorizontalAlignment'), str('center'), str('FontSize'), num(9)));
  const mark = (cells: number[], style: string) => { if (cells.length) call(lab, 'plot', row(cells.map((i) => L.x[i] + 1)), row(cells.map((i) => L.y[i] + 1)), str(style), str('MarkerSize'), num(12), str('LineWidth'), num(2)); };
  if (r) { mark(r.vented.filter((i) => r.ventTime[r.vented.indexOf(i)] <= r.t[k]), 'ko'); mark(r.runaway.filter((i) => r.temp[i][k] > 200), 'kx'); }
  call(lab, 'hold', str('off'));
  call(lab, 'title', str(`${p.coolant ? 'Coolant in at cell 1, out at cell ' + N : 'No coolant'}${r ? ` · ${(r.t[k] / 60).toFixed(1)} min · hottest ${Math.max(...T).toFixed(0)} °C` : ''}`));
  return [];
});
def('packAging', (a) => {
  const p = packOf(a[0], 'packAging'), r = a[1] && a[1].k === 'struct' ? lastRun.get(a[1]) : undefined, n = n0(a[2], NaN);
  if (!r) throw new LabError('packAging(pack, run, cycles): run is what packSimulate gave for this pack.');
  if (!(n >= 0)) throw new LabError('packAging: cycles of 0 or more.');
  const g = pk.packAge(p, r, n);
  return [S([['SOH', row(g.soh)], ['GroupCapacity', row(g.groupCapacity)], ['PackCapacity', num(g.packCapacity)], ['WeakestGroup', num(g.weakest + 1)]])];
});
def('arcTest', (a, nout, lab) => {
  const o = opts(a, 0, ['A', 'Ea', 'H', 'Mass', 'Start', 'Step'], 'arcTest'), rx = { ...pk.NMC_RUNAWAY }, th = { ...pk.CELL_THERMAL };
  for (const k of ['A', 'Ea', 'H'] as const) if (o.has(k)) { const x = n0(o.get(k), NaN); if (!(x > 0)) throw new LabError(`arcTest: '${k}' must be above 0.`); rx[k] = x; }
  if (o.has('Mass')) th.mass = n0(o.get('Mass'), th.mass);
  const r = pk.arcTest(rx, th, { start: o.has('Start') ? n0(o.get('Start'), 50) : undefined, step: o.has('Step') ? n0(o.get('Step'), 5) : undefined });
  const out = S([['Onset', num(r.onset)], ['MaxTemperature', num(r.maxTemp)], ['PeakRate', num(r.peakRate)], ['TimeToPeak', num(r.timeToPeak)], ['Time', row(r.time)], ['Temperature', row(r.temp)]]);
  if (nout > 0) return [out];
  call(lab, 'plot', row(r.time.map((x) => x / 3600)), row(r.temp)); call(lab, 'xlabel', str('Hours')); call(lab, 'ylabel', str('Cell (°C)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`ARC: onset ${r.onset.toFixed(0)} °C, peak ${r.maxTemp.toFixed(0)} °C at ${r.peakRate.toFixed(0)} °C/s`));
  return [];
});
