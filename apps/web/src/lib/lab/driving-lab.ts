import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { table } from './table';
import * as dr from './driving';
import { vehicleOf } from './vehicle-lab';

// Hyperion's automated driving in the language (M487): roadPath, laneKeep, lqrLateral, accFollow. MATLAB keeps these in
// Automated Driving Toolbox objects and blocks (drivingScenario, Lane Keeping Assist, Adaptive Cruise Control System);
// here a road is a plain struct and the runs are functions on M486's car.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };
const numOpt = (o: Map<string, Value>, k: string, d: number) => { const v = o.get(k); return v ? toMat(v).d[0] : d; };
const fnOf = (lab: Lab, x: Value, what: string) => { if (x.k === 'fn') return (t: number) => toMat(lab.callFn(x, [num(t)])[0], what).d[0]; const d = toMat(x, what).d[0]; return () => d; };

const roadStruct = (r: dr.Road): Struct => ({ k: 'struct', f: new Map<string, Value>([['Type', str('road')], ['Name', str(r.name)], ['Width', num(r.width)], ['S', col(r.s)], ['X', col(r.x)], ['Y', col(r.y)], ['Heading', col(r.h)], ['Curvature', col(r.k)]]) });
function roadOf(x: Value | undefined): dr.Road {
  if (x?.k === 'str') { const make = dr.ROADS[textOf(x).toLowerCase()]; if (!make) throw new LabError(`The roads are ${Object.keys(dr.ROADS).map((k) => `'${k}'`).join(', ')}.`); return make(); }
  if (!x || x.k !== 'struct' || x.f.get('Type')?.k !== 'str' || textOf(x.f.get('Type')!) !== 'road') throw new LabError("A road was expected: roadPath('scurve').");
  const v = (k: string) => [...toMat(x.f.get(k)!).d];
  return { name: textOf(x.f.get('Name')!), width: toMat(x.f.get('Width')!).d[0], s: v('S'), x: v('X'), y: v('Y'), h: v('Heading'), k: v('Curvature') };
}
def('roadPath', (a, _n, lab) => {
  if (!a.length) throw new LabError(`roadPath takes a road's name (${Object.keys(dr.ROADS).map((k) => `'${k}'`).join(', ')}) or its curvature @(s) … and length.`);
  if (a[0].k === 'fn') {
    const L = toMat(a[1] ?? num(NaN)).d[0], w = a[2] ? toMat(a[2]).d[0] : 3.5;
    if (!(L > 0 && L <= 5000)) throw new LabError('The road is 0 to 5,000 m long.');
    if (!(w >= 2.5 && w <= 6)) throw new LabError('A lane is 2.5 to 6 m wide.');
    return [roadStruct(dr.roadFrom(fnOf(lab, a[0], 'The curvature'), L, 'custom', w))];
  }
  return [roadStruct(roadOf(a[0]))];
});
const drawRoad = (lab: Lab, r: dr.Road) => {
  const edge = (side: number) => [r.x.map((x, i) => x - side * Math.sin(r.h[i])), r.y.map((y, i) => y + side * Math.cos(r.h[i]))];
  for (const side of [-r.width / 2, r.width / 2]) { const [xs, ys] = edge(side); call(lab, 'plot', row(xs), row(ys), str('Color'), row([0.55, 0.55, 0.6]), str('LineWidth'), num(1.5)); call(lab, 'hold', str('on')); }
  call(lab, 'plot', row(r.x), row(r.y), str('--'), str('Color'), row([0.75, 0.75, 0.78]));
};
def('laneKeep', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("laneKeep needs the car and the road: laneKeep(vehicle(), roadPath('scurve'), 'Controller', 'lqr', 'Speed', 25).");
  const v = vehicleOf(a[0]), r = roadOf(a[1]), o = pairs(a, 2), keeper = (o.get('controller') ? textOf(o.get('controller')!).toLowerCase() : 'lqr') as dr.Keeper;
  if (!['stanley', 'purepursuit', 'lqr'].includes(keeper)) throw new LabError("'Controller' is 'stanley', 'purepursuit' or 'lqr'.");
  const speed = numOpt(o, 'speed', 20);
  if (!(speed > 1 && speed < 70)) throw new LabError("'Speed' is in m/s, 1 to 70.");
  const run = dr.laneKeep(v, r, keeper, speed, { e0: numOpt(o, 'offset', 0), gain: o.get('gain') ? toMat(o.get('gain')!).d[0] : undefined });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['MaxError', num(run.maxE)], ['LeftLane', num(run.left ? 1 : 0)], ['MinTimeToLineCrossing', num(Math.min(...run.ttlc))]]) };
  if (nout > 0) return [table([['Time', col(run.t)], ['X', col(run.x)], ['Y', col(run.y)], ['Yaw', col(run.psi)], ['Speed', col(run.vx)], ['LateralError', col(run.e)], ['HeadingError', col(run.he)], ['Steer', col(run.steer)], ['TimeToLineCrossing', col(run.ttlc)]]), info];
  call(lab, 'subplot', num(2), num(1), num(1)); drawRoad(lab, r);
  call(lab, 'plot', row(run.x), row(run.y), str('LineWidth'), num(2)); call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${keeper === 'lqr' ? 'LQR' : keeper === 'stanley' ? 'Stanley' : 'Pure pursuit'} at ${(speed * 3.6).toFixed(0)} km/h: at most ${run.maxE.toFixed(2)} m off the centre${run.left ? ' (left the lane)' : ''}`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(run.t), row(run.e), row(run.t), row(run.steer.map((d) => (d * 180) / Math.PI)));
  call(lab, 'legend', str('off the centre (m)'), str('steering (°)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
def('lqrLateral', (a) => {
  const v = vehicleOf(a[0]), u = a[1] ? toMat(a[1]).d[0] : 20;
  if (!(u > 1)) throw new LabError('The speed is in m/s, above 1.');
  return [row(dr.lqrGains(v, u))];
});
def('accFollow', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("accFollow needs the car, the lead car's speed (m/s, a number or @(t) …) and the time: accFollow(vehicle(), @(t) 25 - 15*(t > 10), 30).");
  const v = vehicleOf(a[0]), lead = fnOf(lab, a[1], "The lead car's speed"), T = toMat(a[2]).d[0], o = pairs(a, 3);
  if (!(T > 0 && T <= 600)) throw new LabError('accFollow runs up to 600 s.');
  const flag = (k: string, d: boolean) => (o.get(k) ? !!toMat(o.get(k)!).d[0] : d);
  const r = dr.followSim(v, lead, T, { set: numOpt(o, 'setspeed', 30), timeGap: numOpt(o, 'timegap', 1.8), standstill: numOpt(o, 'standstill', 5), gap0: numOpt(o, 'gap', 60), v0: o.get('initialspeed') ? toMat(o.get('initialspeed')!).d[0] : undefined, aeb: flag('aeb', true), acc: flag('acc', true), aebTtc: numOpt(o, 'aebttc', 1.6) });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Crashed', num(r.crashed ? 1 : 0)], ['MinGap', num(Math.min(...r.gap))], ['EmergencyBraking', num(r.aeb.some(Boolean) ? 1 : 0)]]) };
  if (nout > 0) return [table([['Time', col(r.t)], ['Speed', col(r.vx)], ['LeadSpeed', col(r.lead)], ['Gap', col(r.gap)], ['Accel', col(r.accel)], ['Braking', col(r.aeb.map((b) => (b ? 1 : 0)))], ['TimeToCollision', col(r.ttlc)]]), info];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(r.t), row(r.lead), str('--'), row(r.t), row(r.vx), str('LineWidth'), num(2)); call(lab, 'ylabel', str('speed (m/s)')); call(lab, 'legend', str('car ahead'), str('ours')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(r.crashed ? 'Following: it crashed into the car ahead' : `Following: the gap never under ${Math.min(...r.gap).toFixed(1)} m${r.aeb.some(Boolean) ? ' (emergency braking used)' : ''}`));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.gap), str('LineWidth'), num(2)); call(lab, 'ylabel', str('gap (m)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
