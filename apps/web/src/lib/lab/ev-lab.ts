import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { table } from './table';
import * as ev from './ev';

// Hyperion's electric vehicles in the language (M488): evModel, driveCycle, evSim, evMotorMap, evCharge. MATLAB keeps
// these in Powertrain Blockset reference applications; here a car is a plain struct and the runs are functions.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };

const NAMES: [string, keyof ev.Ev][] = [['Mass', 'm'], ['Cd', 'cd'], ['Area', 'area'], ['Crr', 'crr'], ['WheelRadius', 'rw'], ['Gear', 'gear'], ['MaxTorque', 'tmax'], ['MaxPower', 'pmax'], ['MaxSpeed', 'wmax'], ['CopperLoss', 'kc'], ['IronLoss', 'ki'], ['Windage', 'kw'], ['StandingLoss', 'k0'], ['Series', 'series'], ['Parallel', 'parallel'], ['CellAh', 'cellAh'], ['CellResistance', 'cellR'], ['Regen', 'regen'], ['RegenMaxPower', 'regenMax'], ['GearEfficiency', 'gearEff'], ['Accessories', 'aux']];
const evStruct = (e: ev.Ev): Struct => ({ k: 'struct', f: new Map<string, Value>([['Type', str('ev')], ...NAMES.map(([k, f]) => [k, num(e[f])] as [string, Value]), ['BatteryKWh', num(ev.packKwh(e))], ['NominalVoltage', num(3.7 * e.series)]]) });
function evOf(x: Value | undefined): ev.Ev {
  if (!x || x.k !== 'struct' || x.f.get('Type')?.k !== 'str' || textOf(x.f.get('Type')!) !== 'ev') throw new LabError("An electric car was expected: evModel('Parallel', 40).");
  const out = { ...ev.EV_DEFAULT };
  for (const [k, f] of NAMES) out[f] = toMat(x.f.get(k)!).d[0];
  return out;
}
def('evModel', (a) => {
  const e = { ...ev.EV_DEFAULT };
  for (let i = 0; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '', hit = NAMES.find(([k]) => k.toLowerCase() === key);
    if (!hit) throw new LabError(`evModel takes ${NAMES.map(([k]) => `'${k}'`).join(', ')} (name, value pairs).`);
    const x = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!(x >= 0) || (x === 0 && !['regen', 'accessories', 'standingloss', 'windage', 'ironloss'].includes(key))) throw new LabError(`'${hit[0]}' must be above 0.`);
    if ((key === 'regen' || key === 'gearefficiency') && x > 1) throw new LabError(`'${hit[0]}' is 0 to 1.`);
    e[hit[1]] = key === 'series' || key === 'parallel' ? Math.round(x) : x;
  }
  return [evStruct(e)];
});
const cycleOf = (x: Value | undefined): ev.Cycle => {
  if (x?.k === 'str') { const make = ev.CYCLES[textOf(x).toLowerCase()]; if (!make) throw new LabError(`The drive profiles are ${Object.keys(ev.CYCLES).map((k) => `'${k}'`).join(', ')}, or a table / two columns [seconds, km/h].`); return make(); }
  if (x?.k === 'struct' && x.table) { const t = toMat(x.f.get('Time')!).d, v = toMat(x.f.get('Speed')!).d; return { name: 'yours', t: [...t], v: [...v].map((s) => s / 3.6) }; }
  const m = toMat(x ?? mat(0, 0), 'The drive profile');
  if (m.c !== 2 || m.r < 2) throw new LabError('A drive profile is two columns: seconds and km/h.');
  const t = Array.from({ length: m.r }, (_, i) => m.d[i]), v = Array.from({ length: m.r }, (_, i) => m.d[i + m.r] / 3.6);
  if (t.some((s, i) => i && !(s > t[i - 1]))) throw new LabError("The profile's times must rise.");
  return { name: 'yours', t, v };
};
def('driveCycle', (a, nout, lab) => {
  const c = cycleOf(a[0] ?? str('mixed'));
  if (nout > 0) return [table([['Time', col(c.t)], ['Speed', col(c.v.map((v) => v * 3.6))]])];
  call(lab, 'plot', row(c.t), row(c.v.map((v) => v * 3.6))); call(lab, 'xlabel', str('t (s)')); call(lab, 'ylabel', str('speed (km/h)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`The '${c.name}' profile (made up in the manner of the standard test cycles)`));
  return [];
});
def('evSim', (a, nout, lab) => {
  if (!a.length) throw new LabError("evSim needs the car and a drive profile: evSim(evModel(), 'city').");
  const e = evOf(a[0]), c = cycleOf(a[1] ?? str('mixed')), o = pairs(a, 2);
  const soc0 = o.get('soc') ? toMat(o.get('soc')!).d[0] : 0.9, repeat = o.get('repeat') ? Math.round(toMat(o.get('repeat')!).d[0]) : 1, grade = o.get('grade') ? toMat(o.get('grade')!).d[0] : 0;
  if (!(soc0 > 0 && soc0 <= 1)) throw new LabError("'SOC' is the starting charge, 0 to 1.");
  if (!(repeat >= 1 && repeat <= 50)) throw new LabError("'Repeat' is 1 to 50.");
  const r = ev.evSim(e, c, { soc0, repeat, grade });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['WhPerKm', num(r.whPerKm)], ['Km', num(r.km)], ['Range', num(r.range)], ['RegenWh', num(r.regenWh)], ['DriveWh', num(r.driveWh)], ['FrictionBrakeWh', num(r.frictionWh)], ['EndSOC', num(r.soc.at(-1) ?? soc0)], ['TooFast', num(r.missed)]]) };
  if (nout > 0) return [table([['Time', col(r.t)], ['Speed', col(r.v)], ['SOC', col(r.soc)], ['BatteryPower', col(r.pbat)], ['MotorTorque', col(r.tm)], ['MotorSpeed', col(r.wm)], ['Efficiency', col(r.eff)]]), info];
  call(lab, 'subplot', num(3), num(1), num(1)); call(lab, 'plot', row(r.t), row(r.v.map((v) => v * 3.6))); call(lab, 'ylabel', str('km/h')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${r.whPerKm.toFixed(0)} Wh/km: about ${r.range.toFixed(0)} km on a charge; braking gave back ${r.regenWh.toFixed(0)} Wh`));
  call(lab, 'subplot', num(3), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.pbat.map((p) => p / 1000))); call(lab, 'ylabel', str('battery kW')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(3), num(1), num(3)); call(lab, 'plot', row(r.t), row(r.soc.map((s) => s * 100))); call(lab, 'ylabel', str('charge (%)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
def('evMotorMap', (a, nout, lab) => {
  const e = evOf(a[0]), nw = 60, nt = 50;
  const W = Array.from({ length: nw }, (_, i) => ((i + 0.5) * e.wmax) / nw), T = Array.from({ length: nt }, (_, j) => -e.tmax + ((j + 0.5) * 2 * e.tmax) / nt);
  const E = new Float64Array(nw * nt);
  T.forEach((t, j) => W.forEach((w, i) => { E[j + i * nt] = Math.abs(t) <= ev.torqueLimit(e, w) ? ev.efficiency(e, t, w) : NaN; }));
  const M = mat(nt, nw, E);
  if (nout > 0) return [M, row(W), row(T)];
  call(lab, 'contourf', row(W.map((w) => (w * 60) / (2 * Math.PI))), row(T), mat(nt, nw, Array.from(E, (x) => (Number.isNaN(x) ? NaN : x * 100))), num(14)); call(lab, 'colorbar');
  call(lab, 'xlabel', str('motor speed (rpm)')); call(lab, 'ylabel', str('torque (N·m)')); call(lab, 'title', str('Motor and inverter efficiency (%): driving above, braking below'));
  return [];
});
def('evCharge', (a, nout, lab) => {
  if (a.length < 2) throw new LabError('evCharge needs the car and the charger\'s power in kW: evCharge(evModel(), 150).');
  const e = evOf(a[0]), kw = toMat(a[1]).d[0], o = pairs(a, 2);
  if (!(kw > 0 && kw <= 1000)) throw new LabError("The charger's power is in kW, above 0.");
  const r = ev.evCharge(e, kw * 1000, { soc0: o.get('from') ? toMat(o.get('from')!).d[0] : 0.1, socEnd: o.get('to') ? toMat(o.get('to')!).d[0] : 1, cRate: o.get('crate') ? toMat(o.get('crate')!).d[0] : 2 });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['MinutesTo80', num(r.to80 / 60)], ['Minutes', num(r.end / 60)]]) };
  if (nout > 0) return [table([['Time', col(r.t)], ['SOC', col(r.soc)], ['Power', col(r.p)], ['Current', col(r.i)]]), info];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(r.t.map((t) => t / 60)), row(r.soc.map((s) => s * 100))); call(lab, 'ylabel', str('charge (%)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Charging at up to ${kw} kW: to 80% in ${(r.to80 / 60).toFixed(0)} min`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(r.t.map((t) => t / 60)), row(r.p.map((p) => p / 1000))); call(lab, 'ylabel', str('kW')); call(lab, 'xlabel', str('minutes')); call(lab, 'grid', str('on'));
  return [];
});
