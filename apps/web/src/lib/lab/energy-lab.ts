import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as en from './energy';
import * as bt from './battery';
import * as rn from './renew';

// Hyperion's energy toolbox in the language (M425): batteryCell, batteryPack, batteryOCV, batterySimulate,
// socEstimate (an extended Kalman filter), pvModule, pvCurve, windTurbine, windPower, windAEP; M433: batterySimulate's
// temperature ('Ambient', 'Temperature', 'Cooling'), batteryAge, batteryLife; M434: sunPosition, pvDay, windFarm,
// windFarmAEP.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: number[]) => mat(1, v.length, v);
const struct = (type: string, fields: [string, number][]): Struct => ({ k: 'struct', f: new Map<string, Value>([['Type', str(type)], ...fields.map(([k, v]) => [k, num(v)] as [string, Value])]) });
/** Name–value pairs into numbers, starting from the defaults (names case-insensitive). */
function settings<T extends object>(a: Value[], defaults: T, names: Record<string, keyof T>, what: string): T {
  const out = { ...defaults };
  for (let i = 0; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? names[(a[i] as { v: string }).v.toLowerCase()] : undefined;
    if (!key) throw new LabError(`${what} takes ${Object.keys(names).join(', ')} (as name, value pairs).`);
    const v = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!(v > 0)) throw new LabError(`${String(key)} must be a positive number.`);
    (out as Record<keyof T, number>)[key] = v;
  }
  return out;
}
const kindOf = (v: Value | undefined) => (v && v.k === 'struct' && v.f.get('Type') ? textOf(v.f.get('Type')!) : '');
const fieldNum = (v: Struct, k: string) => toMat(v.f.get(k)!).d[0];

// ——— Batteries ———
def('batteryCell', (a) => {
  const c = settings(a, en.DEFAULT_CELL, { capacity: 'capacity', r0: 'r0', r1: 'r1', c1: 'c1' }, 'batteryCell');
  return [struct('batteryCell', [['Capacity', c.capacity], ['R0', c.r0], ['R1', c.r1], ['C1', c.c1]])];
});
def('batteryPack', (a) => {
  if (kindOf(a[0]) !== 'batteryCell' || a.length < 3) throw new LabError('batteryPack needs a cell and how many in series and in parallel: batteryPack(batteryCell, 96, 3).');
  const c = cellOf(a[0] as Struct), s = Math.round(toMat(a[1]).d[0]), p = Math.round(toMat(a[2]).d[0]);
  if (!(s >= 1 && p >= 1)) throw new LabError('A pack has at least one cell in series and one string.');
  const pk = en.pack(c, s, p), out = struct('batteryPack', [['Capacity', pk.cell.capacity], ['R0', pk.cell.r0], ['Series', s], ['Parallel', p], ['NominalVoltage', 3.7 * s], ['EnergykWh', (3.7 * s * pk.cell.capacity) / 1000]]);
  // The pack keeps its cell: it runs as one cell carrying I/p, its voltage × s.
  out.f.set('Cell', a[0]);
  return [out];
});
function cellOf(v: Struct): en.Cell { return { capacity: fieldNum(v, 'Capacity'), r0: fieldNum(v, 'R0'), r1: fieldNum(v, 'R1'), c1: fieldNum(v, 'C1') }; }
const battery = (v: Value | undefined, name: string) => {
  if (kindOf(v) !== 'batteryCell' && kindOf(v) !== 'batteryPack') throw new LabError(`${name} needs a battery from batteryCell or batteryPack.`);
  const s = v as Struct;
  return kindOf(s) === 'batteryPack' ? { cell: cellOf(s.f.get('Cell') as Struct), series: fieldNum(s, 'Series'), parallel: fieldNum(s, 'Parallel') } : { cell: cellOf(s), series: 1, parallel: 1 };
};
def('batteryOCV', (a) => { const z = toMat(a[0], 'The state of charge'); return [mat(z.r, z.c, [...z.d].map(en.ocv))]; });
def('batterySimulate', (a, nout, lab) => {
  const b = battery(a[0], 'batterySimulate');
  if (a.length < 3) throw new LabError('batterySimulate needs the battery, the current (A, + discharging) and the time step (s).');
  const I = [...toMat(a[1], 'The current').d], dt = toMat(a[2]).d[0], soc0 = a[3] && a[3].k === 'mat' ? toMat(a[3]).d[0] : 1;
  if (!(dt > 0)) throw new LabError('The time step must be positive.');
  // M433: with 'Ambient' (°C), 'Temperature' (the start, °C) or 'Cooling' (W/K per cell) it warms as it works, and the
  // resistance and capacity follow its temperature.
  const o: Record<string, number> = {};
  for (let i = a[3] && a[3].k === 'mat' ? 4 : 3; i + 1 < a.length; i += 2) {
    const k = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (!['ambient', 'temperature', 'cooling'].includes(k)) throw new LabError("batterySimulate's options are 'Ambient', 'Temperature' (°C) and 'Cooling' (W/K).");
    o[k] = toMat(a[i + 1]).d[0];
  }
  const thermal = Object.keys(o).length > 0, amb = o.ambient ?? o.temperature ?? 25, t0 = o.temperature ?? amb;
  if (o.cooling !== undefined && !(o.cooling > 0)) throw new LabError('Cooling must be positive (W/K).');
  const r = thermal ? bt.simulateThermal(b.cell, I.map((x) => x / b.parallel), dt, soc0, t0, amb, { ...bt.DEFAULT_THERMAL, hA: o.cooling ?? bt.DEFAULT_THERMAL.hA }) : { ...en.simulateCell(b.cell, I.map((x) => x / b.parallel), dt, soc0), temp: [] as number[] };
  const v = r.v.map((x) => x * b.series);
  if (nout > 0) return [row(v), row(r.soc), ...(thermal ? [row(r.temp)] : [])];
  const t = row(I.map((_, k) => (k * dt) / 60)), rows = thermal ? 3 : 2;
  call(lab, 'subplot', num(rows), num(1), num(1)); call(lab, 'plot', t, row(v)); call(lab, 'ylabel', str('Voltage (V)')); call(lab, 'grid', str('on')); call(lab, 'title', str('Battery under load'));
  call(lab, 'subplot', num(rows), num(1), num(2)); call(lab, 'plot', t, row(r.soc.map((z) => 100 * z))); call(lab, 'ylabel', str('State of charge (%)')); call(lab, 'grid', str('on'));
  if (thermal) { call(lab, 'subplot', num(rows), num(1), num(3)); call(lab, 'plot', t, row(r.temp)); call(lab, 'ylabel', str('Temperature (°C)')); call(lab, 'grid', str('on')); }
  call(lab, 'xlabel', str('Minutes'));
  return [];
});
/** 'Cycles', 'DoD', 'CRate', 'Temperature', 'Years', 'StorageSOC', 'CyclesPerDay', 'EndOfLife' as name–value pairs. */
function useOf(a: Value[], from: number, what: string) {
  const names: Record<string, string> = { cycles: 'cycles', dod: 'dod', crate: 'cRate', temperature: 'tempC', years: 'years', storagesoc: 'storageSoc', cyclesperday: 'perDay', endoflife: 'end' };
  const o: Record<string, number> = {};
  for (let i = from; i < a.length; i += 2) {
    const k = a[i]?.k === 'str' ? names[(a[i] as { v: string }).v.toLowerCase()] : undefined;
    if (!k) throw new LabError(`${what} takes 'Cycles', 'DoD', 'CRate', 'Temperature', 'Years', 'StorageSOC'${what === 'batteryLife' ? ", 'CyclesPerDay', 'EndOfLife'" : ''}.`);
    o[k] = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!Number.isFinite(o[k]) || (k !== 'tempC' && o[k] < 0)) throw new LabError(`${(a[i] as { v: string }).v} must be a number${k !== 'tempC' ? ' of 0 or more' : ''}.`);
  }
  if ((o.dod ?? 0.8) > 1 || (o.storageSoc ?? 0.5) > 1 || (o.end ?? 0.8) >= 1) throw new LabError('DoD, StorageSOC and EndOfLife are shares from 0 to 1.');
  return o;
}
def('batteryAge', (a) => {
  const b = battery(a[0], 'batteryAge'), o = useOf(a, 1, 'batteryAge'), use = { ...bt.DEFAULT_USE, ...o } as bt.AgeUse, r = bt.ageCell(b.cell, use);
  const aged = struct('batteryCell', [['Capacity', r.cell.capacity], ['R0', r.cell.r0], ['R1', r.cell.r1], ['C1', r.cell.c1]]);
  const out = struct('batteryAge', [['SOH', r.soh], ['CapacityLoss', r.loss], ['CycleLoss', r.cycleLoss], ['CalendarLoss', r.calendarLoss], ['ResistanceGrowth', r.resistanceGrowth]]);
  out.f.set('Cell', aged);
  return [out];
});
def('batteryLife', (a, nout, lab) => {
  const b = battery(a[0], 'batteryLife'), o = useOf(a, 1, 'batteryLife'), use = { ...bt.DEFAULT_USE, ...o }, per = o.perDay || 1, end = o.end ?? 0.8;
  const n = bt.cycleLife(b.cell, use, per, end), years = n / (365 * per);
  if (nout > 0) return [num(n), num(years)];
  const top = Number.isFinite(n) ? n * 1.5 : 5000, cyc = Array.from({ length: 101 }, (_, i) => (i * top) / 100);
  // The same use 15 °C cooler and warmer, for comparison.
  [use.tempC - 15, use.tempC, use.tempC + 15].forEach((tempC, i) => {
    call(lab, 'plot', row(cyc), row(cyc.map((c) => 100 * bt.ageCell(b.cell, { ...use, tempC, cycles: c, years: c / (365 * per) }).soh)), str(i === 1 ? '-' : '--'));
    if (i === 0) call(lab, 'hold', str('on'));
  });
  call(lab, 'yline', num(100 * end), str(':'));
  call(lab, 'hold', str('off'));
  call(lab, 'legend', str(`${use.tempC - 15} °C`), str(`${use.tempC} °C`), str(`${use.tempC + 15} °C`));
  call(lab, 'xlabel', str('Cycles')); call(lab, 'ylabel', str('State of health (%)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(Number.isFinite(n) ? `${Math.round(n)} cycles (${years.toFixed(1)} years) to ${Math.round(100 * end)}%` : 'It never reaches the end of life'));
  return [];
});
def('socEstimate', (a) => {
  const b = battery(a[0], 'socEstimate');
  if (a.length < 4) throw new LabError('socEstimate needs the battery, the currents, the measured voltages and the time step: socEstimate(cell, I, v, dt, socGuess).');
  const I = [...toMat(a[1], 'The current').d], v = [...toMat(a[2], 'The voltage').d].map((x) => x / b.series), dt = toMat(a[3]).d[0];
  if (I.length !== v.length) throw new LabError('socEstimate needs one voltage per current sample.');
  return [row(en.socEkf(b.cell, I.map((x) => x / b.parallel), v, dt, a[4] ? toMat(a[4]).d[0] : 0.5))];
});

// ——— Solar ———
def('pvModule', (a) => {
  const m = settings(a, en.DEFAULT_MODULE, { isc: 'isc', voc: 'voc', ns: 'ns', n: 'n', rs: 'rs', rsh: 'rsh' }, 'pvModule');
  return [struct('pvModule', [['Isc', m.isc], ['Voc', m.voc], ['Ns', m.ns], ['n', m.n], ['Rs', m.rs], ['Rsh', m.rsh]])];
});
def('pvCurve', (a, nout, lab) => {
  if (kindOf(a[0]) !== 'pvModule') throw new LabError('pvCurve needs a module from pvModule: pvCurve(pvModule, 1000, 25).');
  const s = a[0] as Struct, m: en.Module = { ...en.DEFAULT_MODULE, isc: fieldNum(s, 'Isc'), voc: fieldNum(s, 'Voc'), ns: fieldNum(s, 'Ns'), n: fieldNum(s, 'n'), rs: fieldNum(s, 'Rs'), rsh: fieldNum(s, 'Rsh') };
  const G = a[1] ? toMat(a[1]).d[0] : 1000, T = a[2] ? toMat(a[2]).d[0] : 25;
  if (!(G > 0)) throw new LabError('The irradiance (W/m²) must be above 0.');
  const r = en.pvCurve(m, G, T), mpp = struct('pvPoint', [['Vmp', r.vmp], ['Imp', r.imp], ['Pmax', r.pmax], ['Voc', r.voc], ['Isc', r.isc], ['FillFactor', r.pmax / (r.voc * r.isc)]]);
  if (nout > 0) return [row(r.V), row(r.I), row(r.P), mpp];
  call(lab, 'yyaxis', str('left')); call(lab, 'plot', row(r.V), row(r.I)); call(lab, 'ylabel', str('Current (A)'));
  call(lab, 'yyaxis', str('right')); call(lab, 'plot', row(r.V), row(r.P)); call(lab, 'ylabel', str('Power (W)'));
  call(lab, 'xlabel', str('Voltage (V)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Maximum power ${r.pmax.toFixed(1)} W at ${r.vmp.toFixed(1)} V (${G} W/m², ${T} °C)`));
  return [];
});

// ——— Wind ———
def('windTurbine', (a) => {
  const t = settings(a, en.DEFAULT_TURBINE, { diameter: 'diameter', ratedpower: 'rated', cutin: 'cutIn', cutout: 'cutOut', cp: 'cp', airdensity: 'rho' }, 'windTurbine');
  if (t.cp > 16 / 27) throw new LabError(`No turbine can take more than 59.3% of the wind's power (Betz's limit); Cp ${t.cp} is too high.`);
  return [struct('windTurbine', [['Diameter', t.diameter], ['RatedPower', t.rated], ['CutIn', t.cutIn], ['CutOut', t.cutOut], ['Cp', t.cp], ['AirDensity', t.rho]])];
});
const turbine = (v: Value | undefined): en.Turbine => {
  if (kindOf(v) !== 'windTurbine') throw new LabError('That needs a turbine from windTurbine.');
  const s = v as Struct;
  return { diameter: fieldNum(s, 'Diameter'), rated: fieldNum(s, 'RatedPower'), cutIn: fieldNum(s, 'CutIn'), cutOut: fieldNum(s, 'CutOut'), cp: fieldNum(s, 'Cp'), rho: fieldNum(s, 'AirDensity') };
};
def('windPower', (a) => { const t = turbine(a[0]), v = toMat(a[1] ?? num(10), 'The wind speed'); return [mat(v.r, v.c, [...v.d].map((x) => en.windPower(t, x)))]; });
def('windAEP', (a) => {
  const t = turbine(a[0]);
  if (a.length < 3) throw new LabError('windAEP needs the turbine and the Weibull wind: windAEP(turbine, k, c) (shape k, scale c in m/s).');
  const k = toMat(a[1]).d[0], c = toMat(a[2]).d[0];
  if (!(k > 0 && c > 0)) throw new LabError('The Weibull shape and scale must be positive.');
  const r = en.windYear(t, k, c);
  return [num(r.aepMWh), num(r.capacityFactor), num(r.meanWind)];
});

// ——— The sun through the day, wind farms (M434) ———
/** A date as [year month day] (or a datenum, as now() gives). */
function dateOf(v: Value | undefined): [number, number, number] {
  const d = v ? [...toMat(v, 'The date').d] : [];
  if (d.length === 1 && d[0] > 700_000) { const t = new Date((d[0] - 719_529) * 86_400_000); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
  if (d.length < 3 || !(d[1] >= 1 && d[1] <= 12 && d[2] >= 1 && d[2] <= 31)) throw new LabError('A date is [year month day], like [2026 6 21].');
  return [d[0], d[1], d[2]];
}
const place = (a: Value[], name: string) => {
  const lat = toMat(a[0] ?? num(NaN)).d[0], lon = toMat(a[1] ?? num(NaN)).d[0];
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new LabError(`${name} needs a latitude (−90 to 90) and a longitude (−180 to 180), in degrees.`);
  return [lat, lon];
};
const opts = (a: Value[], from: number, names: string[], what: string) => {
  const o: Record<string, number> = {};
  for (let i = from; i < a.length; i += 2) {
    const k = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (!names.includes(k)) throw new LabError(`${what} takes ${names.map((n) => `'${n[0].toUpperCase()}${n.slice(1)}'`).join(', ')}.`);
    o[k] = toMat(a[i + 1] ?? num(NaN)).d[0];
  }
  return o;
};
def('sunPosition', (a) => {
  const [lat, lon] = place(a, 'sunPosition'), date = dateOf(a[2]), h = toMat(a[3] ?? num(12), 'The hours'), tz = a[4] ? toMat(a[4]).d[0] : 0;
  const p = [...h.d].map((x) => rn.sunPosition(lat, lon, date, x, tz));
  return [mat(h.r, h.c, p.map((x) => x.elevation)), mat(h.r, h.c, p.map((x) => x.azimuth))];
});
def('pvDay', (a, nout, lab) => {
  if (kindOf(a[0]) !== 'pvModule') throw new LabError('pvDay needs a module from pvModule: pvDay(pvModule, lat, lon, [2026 6 21]).');
  const s = a[0] as Struct, m: en.Module = { ...en.DEFAULT_MODULE, isc: fieldNum(s, 'Isc'), voc: fieldNum(s, 'Voc'), ns: fieldNum(s, 'Ns'), n: fieldNum(s, 'n'), rs: fieldNum(s, 'Rs'), rsh: fieldNum(s, 'Rsh') };
  const [lat, lon] = place(a.slice(1), 'pvDay'), date = dateOf(a[3]), o = opts(a, 4, ['tilt', 'azimuth', 'timezone', 'air'], 'pvDay');
  const r = rn.pvDay(m, lat, lon, date, { tilt: o.tilt, facing: o.azimuth, tz: o.timezone, air: o.air });
  if (nout > 0) return [row(r.power), row(r.hours), num(r.wh)];
  call(lab, 'yyaxis', str('left')); call(lab, 'plot', row(r.hours), row(r.power)); call(lab, 'ylabel', str('Power (W)'));
  call(lab, 'yyaxis', str('right')); call(lab, 'plot', row(r.hours), row(r.elev.map((e) => Math.max(0, e)))); call(lab, 'ylabel', str('Sun above the horizon (°)'));
  call(lab, 'xlabel', str('Hour (local)')); call(lab, 'xlim', row([0, 24])); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${(r.wh / 1000).toFixed(2)} kWh on a clear ${date.join('-')}`));
  return [];
});
const layout = (v: Value | undefined): [number, number][] => {
  const m = toMat(v ?? num(NaN), 'The positions');
  if (m.c !== 2 || !m.r) throw new LabError('The turbines are rows [x y] in metres (x east, y north).');
  return Array.from({ length: m.r }, (_, i) => [m.d[i], m.d[i + m.r]]);
};
def('windFarm', (a, nout, lab) => {
  const t = turbine(a[0]), xy = layout(a[1]), v = toMat(a[2] ?? num(10)).d[0], dir = a[3] ? toMat(a[3]).d[0] : 270, o = opts(a, 4, ['decay'], 'windFarm');
  if (!(v > 0)) throw new LabError('The wind speed must be above 0.');
  const r = rn.windFarm(t, xy, v, dir, o.decay ?? 0.075);
  if (nout > 0) return [{ k: 'struct', f: new Map<string, Value>([['Speed', mat(xy.length, 1, r.speed)], ['Power', mat(xy.length, 1, r.power)], ['Efficiency', num(r.efficiency)]]) } satisfies Struct];
  const x = row(xy.map((p) => p[0])), y = row(xy.map((p) => p[1]));
  call(lab, 'scatter', x, y, num(120), row(r.speed.map((s) => s / v)), str('filled'));
  call(lab, 'colorbar'); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'xlabel', str('East (m)')); call(lab, 'ylabel', str('North (m)'));
  call(lab, 'title', str(`Wind ${v} m/s from ${dir}°: the farm makes ${(100 * r.efficiency).toFixed(1)}% of what it would unshaded`));
  return [];
});
def('windFarmAEP', (a) => {
  const t = turbine(a[0]), xy = layout(a[1]), k = toMat(a[2] ?? num(2)).d[0], c = toMat(a[3] ?? num(8)).d[0];
  const dirs = a[4] ? [...toMat(a[4]).d] : [270], w = a[5] ? [...toMat(a[5]).d] : dirs.map(() => 1), o = opts(a, 6, ['decay'], 'windFarmAEP');
  if (!(k > 0 && c > 0)) throw new LabError('The Weibull shape and scale must be positive.');
  if (w.length !== dirs.length) throw new LabError('Give one share for each direction.');
  if (xy.length * dirs.length > 4000) throw new LabError('That is a lot to work out: up to 4000 turbines × directions.');
  const r = rn.windFarmYear(t, xy, k, c, dirs, w, o.decay ?? 0.075);
  return [num(r.aepMWh), num(r.wakeLoss)];
});

