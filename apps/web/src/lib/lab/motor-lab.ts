import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { makeTf } from './control';
import { table } from './table';
import * as mo from './motor';
import { fromRows } from './robot-lab';
import { rowsOf } from './robot-motion-lab';

// Hyperion's mechatronics in the language (M485): dcmotor, dcmotorTF (a transfer function for the control toolbox,
// M414: step, bode, pid, feedback work on it), dcmotorSim, pmsm, focTune, focSim, clarke, invclarke, park, invpark,
// gearReflect, encoderSim. MATLAB keeps motors and controllers in Simscape and Motor Control Blockset blocks; here
// motors are plain structs and the simulations are functions.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const kindOf = (v: Value | undefined) => (v && v.k === 'struct' && v.f.get('Type')?.k === 'str' ? textOf(v.f.get('Type')!) : '');
const f = (s: Struct, k: string) => toMat(s.f.get(k)!).d[0];
/** Name–value pairs over number defaults (names as written, case-insensitive). */
function settings<T extends object>(a: Value[], from: number, defaults: T, names: Record<string, keyof T>, what: string): T {
  const out = { ...defaults };
  for (let i = from; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? names[(a[i] as { v: string }).v.toLowerCase()] : undefined;
    if (!key) throw new LabError(`${what} takes ${Object.keys(names).map((k) => `'${k}'`).join(', ')} (name, value pairs).`);
    const v = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!(v >= 0)) throw new LabError(`'${String(key)}' must be a number, 0 or more.`);
    (out as Record<keyof T, number>)[key] = v;
  }
  return out;
}
const struct = (type: string, fields: [string, number][]): Struct => ({ k: 'struct', f: new Map<string, Value>([['Type', str(type)], ...fields.map(([k, v]) => [k, num(v)] as [string, Value])]) });
/** A number, or a function of time (a handle), as a function of t; handles are sampled every 0.1 ms. */
function ofTime(lab: Lab, v: Value | undefined, d: number, what: string): (t: number) => number {
  if (!v) return () => d;
  if (v.k === 'fn') {
    const cache = new Map<number, number>();
    return (t) => { const k = Math.round(t * 1e4); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(v, [num(k / 1e4)])[0], what).d[0]; cache.set(k, y); } return y; };
  }
  const x = toMat(v, what).d[0];
  return () => x;
}
const loadOf = (lab: Lab, o: Map<string, Value>) => {
  const L = ofTime(lab, o.get('load'), 0, 'The load torque'), at = o.get('loadat') ? toMat(o.get('loadat')!).d[0] : 0;
  return (t: number) => (t >= at ? L(t) : 0);
};
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) if (a[i]?.k === 'str') o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); return o; };

// ——— DC motor ———
const DC_NAMES = { r: 'r', l: 'l', k: 'k', j: 'j', b: 'b' } as const;
const dcOf = (v: Value | undefined): mo.DcMotor => { if (kindOf(v) !== 'dcmotor') throw new LabError("A DC motor was expected: dcmotor('R', 1.2, 'K', 0.05)."); const s = v as Struct; return { r: f(s, 'R'), l: f(s, 'L'), k: f(s, 'K'), j: f(s, 'J'), b: f(s, 'B') }; };
def('dcmotor', (a) => {
  const m = settings(a, 0, mo.DC_DEFAULT, DC_NAMES, 'dcmotor');
  if (!(m.r > 0 && m.l > 0 && m.k > 0 && m.j > 0)) throw new LabError('R, L, K and J must be above 0.');
  return [struct('dcmotor', [['R', m.r], ['L', m.l], ['K', m.k], ['J', m.j], ['B', m.b], ['NoLoadSpeedPerVolt', m.k / (m.k * m.k + m.r * m.b)], ['StallTorquePerVolt', m.k / m.r]])];
});
def('dcmotorTF', (a) => {
  const m = dcOf(a[0]), what = a[1] ? textOf(a[1]).toLowerCase() : 'speed', [n, d] = mo.dcSpeedTf(m);
  if (what === 'speed') return [makeTf(n, d)];
  if (what === 'position') return [makeTf(n, [...d, 0])];
  if (what === 'current') return [makeTf([m.j, m.b], d)];
  throw new LabError("dcmotorTF gives 'speed' (rad/s per volt), 'position' (rad per volt) or 'current' (A per volt).");
});
def('dcmotorSim', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("dcmotorSim needs the motor, the voltage (a number or @(t) …) and the time: dcmotorSim(m, 24, 0.1, 'Load', 0.05, 'LoadAt', 0.05).");
  const m = dcOf(a[0]), T = toMat(a[2]).d[0], o = pairs(a, 3);
  if (!(T > 0 && T <= 100)) throw new LabError('The time is up to 100 s.');
  const r = mo.dcSimulate(m, ofTime(lab, a[1], 0, 'The voltage'), T, loadOf(lab, o));
  if (nout > 0) return [col(r.t), col(r.w), col(r.i), col(r.theta)];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(r.t), row(r.w)); call(lab, 'ylabel', str('speed (rad/s)')); call(lab, 'grid', str('on')); call(lab, 'title', str('DC motor'));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.i)); call(lab, 'ylabel', str('current (A)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});

// ——— PMSM and field-oriented control ———
const PM_NAMES = { rs: 'rs', ld: 'ld', lq: 'lq', fluxlinkage: 'psi', polepairs: 'p', j: 'j', b: 'b', vdc: 'vdc', imax: 'imax' } as const;
const pmOf = (v: Value | undefined): mo.Pmsm => { if (kindOf(v) !== 'pmsm') throw new LabError("A PMSM was expected: pmsm('PolePairs', 4)."); const s = v as Struct; return { rs: f(s, 'Rs'), ld: f(s, 'Ld'), lq: f(s, 'Lq'), psi: f(s, 'FluxLinkage'), p: f(s, 'PolePairs'), j: f(s, 'J'), b: f(s, 'B'), vdc: f(s, 'Vdc'), imax: f(s, 'Imax') }; };
def('pmsm', (a) => {
  const m = settings(a, 0, mo.PMSM_DEFAULT, PM_NAMES, 'pmsm');
  if (!(m.rs > 0 && m.ld > 0 && m.lq > 0 && m.psi > 0 && m.p >= 1 && m.j > 0 && m.vdc > 0 && m.imax > 0)) throw new LabError('Every setting but B must be above 0 (PolePairs at least 1).');
  const kt = 1.5 * m.p * m.psi, base = m.vdc / Math.sqrt(3) / (m.p * m.psi);
  return [struct('pmsm', [['Rs', m.rs], ['Ld', m.ld], ['Lq', m.lq], ['FluxLinkage', m.psi], ['PolePairs', m.p], ['J', m.j], ['B', m.b], ['Vdc', m.vdc], ['Imax', m.imax], ['TorqueConstant', kt], ['MaxTorque', kt * m.imax], ['BaseSpeed', base]])];
});
def('focTune', (a) => {
  const m = pmOf(a[0]), o = pairs(a, 1), cb = 2 * Math.PI * (o.get('currentbandwidth') ? toMat(o.get('currentbandwidth')!).d[0] : 500), sb = 2 * Math.PI * (o.get('speedbandwidth') ? toMat(o.get('speedbandwidth')!).d[0] : 20);
  if (!(cb > 0 && sb > 0 && sb < cb)) throw new LabError("'CurrentBandwidth' and 'SpeedBandwidth' are in Hz, the speed loop slower than the current loop.");
  const g = mo.focTune(m, cb, sb);
  return [struct('focGains', [['KpD', g.kpd], ['KiD', g.kid], ['KpQ', g.kpq], ['KiQ', g.kiq], ['KpSpeed', g.kps], ['KiSpeed', g.kis]])];
});
def('focSim', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("focSim needs the motor, the speed wanted (rad/s, a number or @(t) …) and the time: focSim(pmsm, 100, 0.3, 'Load', 2, 'LoadAt', 0.15).");
  const m = pmOf(a[0]), T = toMat(a[2]).d[0], o = pairs(a, 3);
  if (!(T > 0 && T <= 5)) throw new LabError('focSim runs up to 5 s (steps of 20 µs).');
  const gs = o.get('gains'), g = gs && kindOf(gs) === 'focGains' ? { kpd: f(gs as Struct, 'KpD'), kid: f(gs as Struct, 'KiD'), kpq: f(gs as Struct, 'KpQ'), kiq: f(gs as Struct, 'KiQ'), kps: f(gs as Struct, 'KpSpeed'), kis: f(gs as Struct, 'KiSpeed') } : mo.focTune(m);
  const flag = (k: string) => (o.get(k) ? !!toMat(o.get(k)!).d[0] : true);
  const r = mo.focSimulate(m, ofTime(lab, a[1], 0, 'The speed wanted'), T, loadOf(lab, o), g, { fieldWeakening: flag('fieldweakening'), mtpa: flag('mtpa') });
  if (nout > 0) return [table([['Time', col(r.t)], ['Speed', col(r.w)], ['SpeedRef', col(r.wRef)], ['Id', col(r.id)], ['Iq', col(r.iq)], ['Vd', col(r.vd)], ['Vq', col(r.vq)], ['Torque', col(r.torque)], ['Ia', col(r.ia)], ['Ib', col(r.ib)], ['Ic', col(r.ic)], ['Power', col(r.power)]])];
  call(lab, 'subplot', num(3), num(1), num(1)); call(lab, 'plot', row(r.t), row(r.wRef), str('--'), row(r.t), row(r.w)); call(lab, 'ylabel', str('speed (rad/s)')); call(lab, 'legend', str('wanted'), str('motor')); call(lab, 'grid', str('on')); call(lab, 'title', str('PMSM under field-oriented control'));
  call(lab, 'subplot', num(3), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.id), row(r.t), row(r.iq)); call(lab, 'ylabel', str('current (A)')); call(lab, 'legend', str('i_d'), str('i_q')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(3), num(1), num(3)); call(lab, 'plot', row(r.t), row(r.ia), row(r.t), row(r.ib), row(r.t), row(r.ic)); call(lab, 'ylabel', str('phase current (A)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});

// ——— Transforms ———
const rowsN = (v: Value | undefined, n: number, name: string) => { const m = toMat(v ?? mat(0, 0), 'The signals'); const R = m.c === n ? rowsOf(m) : m.r === n && m.c !== n ? rowsOf({ ...m, r: m.c, c: m.r, d: transposeD(m.d, m.r, m.c) }) : null; if (!R) throw new LabError(`${name} takes rows of ${n} values.`); return R; };
const transposeD = (d: Float64Array, r: number, c: number) => { const o = new Float64Array(d.length); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) o[j + i * c] = d[i + j * r]; return o; };
const angles = (v: Value | undefined, n: number) => { const t = [...toMat(v ?? mat(0, 0), 'The angle').d]; if (t.length !== 1 && t.length !== n) throw new LabError('Give one angle, or one a row.'); return (i: number) => t[t.length === 1 ? 0 : i]; };
def('clarke', (a) => { const R = rowsN(a[0], 3, 'clarke'); return [fromRows(R.flatMap((r) => mo.clarke(r[0], r[1], r[2])), R.length, 2)]; });
def('invclarke', (a) => { const R = rowsN(a[0], 2, 'invclarke'); return [fromRows(R.flatMap((r) => mo.invClarke(r[0], r[1])), R.length, 3)]; });
def('park', (a) => { const R = rowsN(a[0], 2, 'park'), th = angles(a[1], R.length); return [fromRows(R.flatMap((r, i) => mo.park(r[0], r[1], th(i))), R.length, 2)]; });
def('invpark', (a) => { const R = rowsN(a[0], 2, 'invpark'), th = angles(a[1], R.length); return [fromRows(R.flatMap((r, i) => mo.invPark(r[0], r[1], th(i))), R.length, 2)]; });

// ——— Gears and encoders ———
def('gearReflect', (a) => {
  const [J, b, T, N, eta] = [0, 1, 2, 3, 4].map((i) => (a[i] ? toMat(a[i]).d[0] : i === 4 ? 1 : NaN));
  if (!(N > 0 && eta > 0 && eta <= 1 && J >= 0)) throw new LabError('gearReflect(J, b, torque, N, efficiency): N above 0, efficiency 0 to 1.');
  const r = mo.gearReflect(J, b, T, N, eta);
  return [num(r.j), num(r.b), num(r.torque)];
});
def('encoderSim', (a) => {
  if (a.length < 3) throw new LabError('encoderSim needs the times, the shaft angles (rad) and the lines a turn.');
  const t = [...toMat(a[0]).d], th = [...toMat(a[1]).d], cpr = toMat(a[2]).d[0], w = a[3] ? Math.round(toMat(a[3]).d[0]) : 1;
  if (t.length !== th.length || !(cpr >= 1) || !(w >= 1)) throw new LabError('One angle a time; at least 1 line; a window of 1 sample or more.');
  const r = mo.encoder(t, th, cpr, w);
  return [col(r.counts), col(r.angle), col(r.speed)];
});

// ——— Stepper motors (M485b) ———
const ST_NAMES = { teeth: 'teeth', r: 'r', l: 'l', km: 'km', detent: 'detent', j: 'j', b: 'b', current: 'current', supply: 'supply' } as const;
const stOf = (v: Value | undefined): mo.Stepper => {
  if (kindOf(v) !== 'stepper') throw new LabError("A stepper was expected: stepper('Current', 1.5).");
  const s = v as Struct;
  return { teeth: f(s, 'Teeth'), r: f(s, 'R'), l: f(s, 'L'), km: f(s, 'Km'), detent: f(s, 'Detent'), j: f(s, 'J'), b: f(s, 'B'), current: f(s, 'Current'), supply: f(s, 'Supply') };
};
def('stepper', (a) => {
  const m = settings(a, 0, mo.STEPPER_DEFAULT, ST_NAMES, 'stepper');
  if (!(m.teeth >= 1 && m.r > 0 && m.l > 0 && m.km > 0 && m.j > 0 && m.current > 0 && m.supply > 0)) throw new LabError('Teeth, R, L, Km, J, Current and Supply must be above 0.');
  return [struct('stepper', [['Teeth', m.teeth], ['R', m.r], ['L', m.l], ['Km', m.km], ['Detent', m.detent], ['J', m.j], ['B', m.b], ['Current', m.current], ['Supply', m.supply], ['StepsPerTurn', 4 * m.teeth], ['HoldingTorque', m.km * m.current * Math.SQRT2]])];
});
def('stepperSim', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("stepperSim needs the stepper, the step rate (full steps a second: a number or @(t) …) and the time: stepperSim(s, @(t) min(800, 4000*t), 0.5, 'Microsteps', 8).");
  const m = stOf(a[0]), T = toMat(a[2]).d[0], o = pairs(a, 3), micro = o.get('microsteps') ? Math.round(toMat(o.get('microsteps')!).d[0]) : 1;
  if (!(T > 0 && T <= 3)) throw new LabError('stepperSim runs up to 3 s (steps of 10 µs).');
  if (!(micro >= 1 && micro <= 256)) throw new LabError("'Microsteps' is 1 to 256.");
  const r = mo.stepperSimulate(m, ofTime(lab, a[1], 0, 'The step rate'), T, { micro, load: loadOf(lab, o) });
  if (nout > 0) return [table([['Time', col(r.t)], ['Commanded', col(r.cmd)], ['Angle', col(r.angle)], ['Speed', col(r.w)], ['Ia', col(r.ia)], ['Ib', col(r.ib)]]), num(r.lost)];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(r.t), row(r.cmd), str('--'), row(r.t), row(r.angle)); call(lab, 'ylabel', str('angle (rad)')); call(lab, 'legend', str('commanded'), str('rotor')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(r.lost ? `Stepper: ${Math.abs(r.lost)} steps lost` : 'Stepper: every step kept'));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.ia), row(r.t), row(r.ib)); call(lab, 'ylabel', str('phase current (A)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'legend', str('A'), str('B')); call(lab, 'grid', str('on'));
  return [];
});
def('stepperPullout', (a, nout, lab) => {
  const m = stOf(a[0]), rates = a[1] ? [...toMat(a[1]).d] : [100, 200, 400, 600, 800, 1200, 1600, 2400], micro = a[2] ? Math.round(toMat(a[2]).d[0]) : 8;
  if (!rates.length || rates.length > 40 || rates.some((v) => !(v > 0))) throw new LabError('Give 1 to 40 step rates above 0 (full steps a second).');
  const T = mo.pullOut(m, rates, micro);
  if (nout > 0) return [row(T)];
  call(lab, 'plot', row(rates), row(T), str('-o')); call(lab, 'xlabel', str('step rate (full steps/s)')); call(lab, 'ylabel', str('pull-out torque (N·m)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str('Stepper pull-out torque: the most load it carries without losing steps'));
  return [];
});
