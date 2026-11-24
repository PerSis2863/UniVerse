import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { table } from './table';
import * as vd from './vehicle';

// Hyperion's vehicle dynamics in the language (M486): vehicle, vehicleSim, vehicleHandling, magicFormula, accelRun,
// brakingDistance. MATLAB keeps these in Vehicle Dynamics Blockset blocks (Vehicle Body 3DOF, the Magic Formula tyre);
// here a car is a plain struct and the runs are functions.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };
const sfield = (s: Struct, k: string) => toMat(s.f.get(k) ?? num(NaN)).d[0];

const NUMS: [string, keyof vd.Vehicle][] = [['Mass', 'm'], ['Inertia', 'iz'], ['Lf', 'lf'], ['Lr', 'lr'], ['CgHeight', 'h'], ['Cf', 'cf'], ['Cr', 'cr'], ['Mu', 'mu'], ['Cd', 'cd'], ['Area', 'area'], ['Crr', 'crr'], ['Power', 'power'], ['MaxSteer', 'maxSteer']];
export function vehicleStruct(v: vd.Vehicle): Struct {
  const h = vd.handling(v);
  return { k: 'struct', f: new Map<string, Value>([['Type', str('vehicle')], ...NUMS.map(([k, f]) => [k, num(v[f] as number)] as [string, Value]), ['Drive', str(v.drive)], ['Tyre', str(v.tyre)], ['Wheelbase', num(h.wheelbase)], ['UndersteerGradient', num(h.K)], ['CharacteristicSpeed', num(h.characteristic)], ['CriticalSpeed', num(h.critical)]]) };
}
export function vehicleOf(x: Value | undefined): vd.Vehicle {
  if (!x || x.k !== 'struct' || x.f.get('Type')?.k !== 'str' || textOf(x.f.get('Type')!) !== 'vehicle') throw new LabError("A vehicle was expected: vehicle('Mass', 1500).");
  const out = { ...vd.CAR_DEFAULT };
  for (const [k, f] of NUMS) (out as Record<string, unknown>)[f] = sfield(x, k);
  out.drive = textOf(x.f.get('Drive')!) as vd.Vehicle['drive']; out.tyre = textOf(x.f.get('Tyre')!) as vd.Vehicle['tyre'];
  return out;
}
def('vehicle', (a) => {
  const v = { ...vd.CAR_DEFAULT };
  for (let i = 0; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (key === 'drive' || key === 'tyre' || key === 'tire') {
      const t = textOf(a[i + 1] ?? str('')).toLowerCase();
      if (key === 'drive') { if (!['front', 'rear', 'all'].includes(t)) throw new LabError("'Drive' is 'front', 'rear' or 'all'."); v.drive = t as vd.Vehicle['drive']; }
      else { if (!['linear', 'magic'].includes(t)) throw new LabError("'Tyre' is 'linear' or 'magic' (Pacejka's Magic Formula)."); v.tyre = t as vd.Vehicle['tyre']; }
      continue;
    }
    const hit = NUMS.find(([k]) => k.toLowerCase() === key);
    if (!hit) throw new LabError(`vehicle takes ${NUMS.map(([k]) => `'${k}'`).join(', ')}, 'Drive' and 'Tyre' (name, value pairs).`);
    const x = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!(x > 0)) throw new LabError(`'${hit[0]}' must be above 0.`);
    (v as Record<string, unknown>)[hit[1]] = x;
  }
  return [vehicleStruct(v)];
});

/** A number, a handle @(t) …, or one of the standard tests by name ('step', 'ramp', 'sinedwell'). */
function steerOf(lab: Lab, x: Value | undefined, amp: number): (t: number) => number {
  if (!x) return () => 0;
  if (x.k === 'fn') { const cache = new Map<number, number>(); return (t) => { const k = Math.round(t * 1e4); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(x, [num(k / 1e4)])[0], 'The steering').d[0]; cache.set(k, y); } return y; }; }
  if (x.k === 'str') {
    const name = textOf(x).toLowerCase();
    if (name === 'step') return vd.stepSteer(amp);
    if (name === 'ramp') return vd.rampSteer(amp);
    if (name === 'sinedwell') return vd.sineWithDwell(amp);
    throw new LabError("The steering is a number, @(t) …, or 'step', 'ramp' or 'sinedwell' (with 'Amplitude').");
  }
  const d = toMat(x, 'The steering').d[0];
  return () => d;
}
const timeFn = (lab: Lab, x: Value | undefined, what: string) => {
  if (!x) return undefined;
  if (x.k === 'fn') { const cache = new Map<number, number>(); return (t: number) => { const k = Math.round(t * 1e4); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(x, [num(k / 1e4)])[0], what).d[0]; cache.set(k, y); } return y; }; }
  const d = toMat(x, what).d[0];
  return () => d;
};

/** The car's outline (4.6 × 1.8 m about its centre of mass) at a pose. */
const outline = (x: number, y: number, psi: number, v: vd.Vehicle) => {
  const c = Math.cos(psi), s = Math.sin(psi), f = v.lf + 0.9, b = -(v.lr + 0.9), w = 0.9;
  return [[b, -w], [f, -w], [f, w], [b, w], [b, -w]].map(([u, q]) => [x + u * c - q * s, y + u * s + q * c]);
};
def('vehicleSim', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("vehicleSim needs the vehicle, the steering (at the wheels, rad: a number, @(t) …, or 'step', 'ramp', 'sinedwell') and the time: vehicleSim(car, 'sinedwell', 4, 'Amplitude', 0.08, 'Speed', 22).");
  const v = vehicleOf(a[0]), T = toMat(a[2]).d[0], o = pairs(a, 3);
  if (!(T > 0 && T <= 120)) throw new LabError('vehicleSim runs up to 120 s (steps of 1 ms).');
  const amp = o.get('amplitude') ? toMat(o.get('amplitude')!).d[0] : 0.05;
  const speed = timeFn(lab, o.get('speed'), 'The speed'), force = timeFn(lab, o.get('force'), 'The force'), grade = timeFn(lab, o.get('grade'), 'The slope');
  if (speed && force) throw new LabError("Give 'Speed' (held by the driver) or 'Force' (N, negative brakes), not both.");
  const v0 = o.get('initialspeed') ? toMat(o.get('initialspeed')!).d[0] : speed ? speed(0) : 0;
  const r = vd.vehicleSim(v, steerOf(lab, a[1], amp), T, { speed, force, grade, v0 });
  if (nout > 0) {
    const info: Struct = { k: 'struct', f: new Map<string, Value>([['Spun', num(r.spun ? 1 : 0)], ['PeakSideSlip', num(Math.max(...r.beta.map(Math.abs)))], ['PeakLateralAccel', num(Math.max(...r.ay.map(Math.abs)))]]) };
    return [table([['Time', col(r.t)], ['X', col(r.x)], ['Y', col(r.y)], ['Yaw', col(r.psi)], ['Vx', col(r.vx)], ['Vy', col(r.vy)], ['YawRate', col(r.r)], ['Ay', col(r.ay)], ['Ax', col(r.ax)], ['SideSlip', col(r.beta)], ['Steer', col(r.steer)], ['SlipFront', col(r.af)], ['SlipRear', col(r.ar)]]), info];
  }
  call(lab, 'subplot', num(2), num(2), num(1)); call(lab, 'plot', row(r.x), row(r.y), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  let since = Infinity;
  r.t.forEach((_, k) => {
    since += k ? Math.hypot(r.x[k] - r.x[k - 1], r.y[k] - r.y[k - 1]) : 0;
    if (since < 12 && k !== r.t.length - 1) return;
    since = 0;
    const ol = outline(r.x[k], r.y[k], r.psi[k], v);
    call(lab, 'plot', row(ol.map((p) => p[0])), row(ol.map((p) => p[1])), str('Color'), row([0.45, 0.45, 0.5]));
  });
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)'));
  call(lab, 'title', str(r.spun ? 'The car spun (body slip past 15°)' : 'Where the car went'));
  call(lab, 'subplot', num(2), num(2), num(2)); call(lab, 'plot', row(r.t), row(r.steer.map((d) => (d * 180) / Math.PI)), row(r.t), row(r.r.map((w) => (w * 180) / Math.PI)));
  call(lab, 'legend', str('steering (°)'), str('yaw rate (°/s)')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(2), num(2), num(3)); call(lab, 'plot', row(r.t), row(r.ay.map((x) => x / vd.G))); call(lab, 'ylabel', str('side acceleration (g)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(2), num(2), num(4)); call(lab, 'plot', row(r.t), row(r.beta.map((x) => (x * 180) / Math.PI)), row(r.t), row(r.af.map((x) => (x * 180) / Math.PI)), row(r.t), row(r.ar.map((x) => (x * 180) / Math.PI)));
  call(lab, 'legend', str('body slip'), str('front tyres'), str('rear tyres')); call(lab, 'ylabel', str('angle (°)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
def('vehicleHandling', (a, nout, lab) => {
  const v = vehicleOf(a[0]), h = vd.handling(v), top = a[1] ? toMat(a[1]).d[0] : 60;
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['UndersteerGradient', num(h.K)], ['UndersteerDegPerG', num((h.K * vd.G * 180) / Math.PI)], ['CharacteristicSpeed', num(h.characteristic)], ['CriticalSpeed', num(h.critical)], ['Kind', str(h.K > 1e-6 ? 'understeer' : h.K < -1e-6 ? 'oversteer' : 'neutral')]]) };
  if (nout > 0) return [info];
  const u = Array.from({ length: 121 }, (_, k) => (k * top) / 120), g = u.map((x) => h.yawGain(x));
  call(lab, 'plot', row(u), row(g), str('LineWidth'), num(2)); call(lab, 'xlabel', str('speed (m/s)')); call(lab, 'ylabel', str('yaw rate per steering (1/s)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(h.K > 0 ? `Understeers (${((h.K * vd.G * 180) / Math.PI).toFixed(2)}°/g): most responsive at ${h.characteristic.toFixed(1)} m/s` : h.K < 0 ? `Oversteers: unstable past ${h.critical.toFixed(1)} m/s` : 'Neutral steer'));
  return [];
});
def('magicFormula', (a) => {
  if (a.length < 5) throw new LabError('magicFormula needs the slip and B, C, D, E: magicFormula(alpha, 10, 1.3, 1, -0.6).');
  const x = toMat(a[0], 'The slip'), [B, C, D, E] = [1, 2, 3, 4].map((k) => toMat(a[k]).d[0]);
  return [mat(x.r, x.c, Array.from(x.d, (s) => vd.magic(s, B, C, D, E)))];
});
def('accelRun', (a, nout, lab) => {
  const v = vehicleOf(a[0]), upTo = a[1] ? toMat(a[1]).d[0] : 100 / 3.6;
  if (!(upTo > 0)) throw new LabError('The speed to reach must be above 0 (m/s).');
  const r = vd.accelRun(v, upTo);
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Time', num(r.time)], ['TopSpeed', num(r.top)]]) };
  if (nout > 0) return [table([['Time', col(r.t)], ['Speed', col(r.v)], ['Distance', col(r.d)]]), info];
  call(lab, 'plot', row(r.t), row(r.v.map((x) => x * 3.6)), str('LineWidth'), num(2)); call(lab, 'xlabel', str('t (s)')); call(lab, 'ylabel', str('speed (km/h)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(Number.isNaN(r.time) ? `Never reaches ${(upTo * 3.6).toFixed(0)} km/h (top speed ${(r.top * 3.6).toFixed(0)} km/h)` : `${(upTo * 3.6).toFixed(0)} km/h in ${r.time.toFixed(2)} s; top speed ${(r.top * 3.6).toFixed(0)} km/h`));
  return [];
});
def('brakingDistance', (a) => {
  const v = vehicleOf(a[0]), u = toMat(a[1] ?? num(NaN), 'The speed').d[0];
  if (!(u > 0 && u < 150)) throw new LabError('The speed is in m/s, above 0.');
  const r = vd.brakingDistance(v, u);
  return [num(r.distance), num(r.time)];
});
