import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { table } from './table';
import * as fl from './flight';

// Hyperion's flight dynamics in the language (M489): atmosisa (MATLAB's name and outputs), aircraft, aircraftTrim,
// aircraftModes, aircraftSim, aircraftPerformance, levelTurn. MATLAB keeps aeroplanes in Aerospace Blockset blocks
// (6DOF, Aircraft objects); here an aeroplane is a plain struct and the runs are functions.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };
const fnOf = (lab: Lab, x: Value, what: string) => { if (x.k === 'fn') { const cache = new Map<number, number>(); return (t: number) => { const k = Math.round(t * 100); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(x, [num(k / 100)])[0], what).d[0]; cache.set(k, y); } return y; }; } const d = toMat(x, what).d[0]; return () => d; };
const struct = (fields: [string, number | string][]): Struct => ({ k: 'struct', f: new Map<string, Value>(fields.map(([k, v]) => [k, typeof v === 'string' ? str(v) : num(v)])) });

def('atmosisa', (a, nout) => {
  const h = toMat(a[0] ?? num(0), 'The height'), out = Array.from(h.d, (x) => fl.isa(x));
  const m = (f: (s: ReturnType<typeof fl.isa>) => number) => mat(h.r, h.c, out.map(f));
  return [m((s) => s.T), m((s) => s.a), m((s) => s.P), m((s) => s.rho)].slice(0, Math.max(1, nout));
});

const NAMES: [string, keyof fl.Aircraft][] = [['Mass', 'm'], ['WingArea', 'S'], ['Chord', 'c'], ['Span', 'b'], ['Iyy', 'iyy'], ['CL0', 'cl0'], ['CLalpha', 'cla'], ['CLde', 'clde'], ['CLq', 'clq'], ['StallAngle', 'alphaStall'], ['CD0', 'cd0'], ['K', 'k'], ['Cm0', 'cm0'], ['Cmalpha', 'cma'], ['Cmq', 'cmq'], ['Cmde', 'cmde'], ['Power', 'power'], ['PropEfficiency', 'eta'], ['StaticThrust', 't0'], ['ElevatorMax', 'deMax']];
const acStruct = (ac: fl.Aircraft) => struct([['Type', 'aircraft'], ...NAMES.map(([k, f]) => [k, ac[f]] as [string, number])]);
function acOf(x: Value | undefined): fl.Aircraft {
  if (!x || x.k !== 'struct' || x.f.get('Type')?.k !== 'str' || textOf(x.f.get('Type')!) !== 'aircraft') throw new LabError("An aeroplane was expected: aircraft('Mass', 1100).");
  const out = { ...fl.PLANE_DEFAULT };
  for (const [k, f] of NAMES) out[f] = toMat(x.f.get(k)!).d[0];
  return out;
}
def('aircraft', (a) => {
  const ac = { ...fl.PLANE_DEFAULT };
  for (let i = 0; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '', hit = NAMES.find(([k]) => k.toLowerCase() === key);
    if (!hit) throw new LabError(`aircraft takes ${NAMES.map(([k]) => `'${k}'`).join(', ')} (name, value pairs).`);
    const x = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!Number.isFinite(x)) throw new LabError(`'${hit[0]}' must be a number.`);
    ac[hit[1]] = x;
  }
  if (!(ac.m > 0 && ac.S > 0 && ac.c > 0 && ac.iyy > 0 && ac.power > 0)) throw new LabError('Mass, WingArea, Chord, Iyy and Power must be above 0.');
  if (!(ac.cma < 0)) throw new LabError("'Cmalpha' must be below 0, or the aeroplane can't fly steadily (it would be unstable in pitch).");
  return [acStruct(ac)];
});
const speedHeight = (a: Value[], i: number) => { const V = a[i] ? toMat(a[i]).d[0] : 50, h = a[i + 1] ? toMat(a[i + 1]).d[0] : 1000; if (!(V > 5 && V < 300)) throw new LabError('The speed is in m/s, 5 to 300.'); if (!(h >= 0 && h <= 32000)) throw new LabError('The height is 0 to 32,000 m.'); return [V, h] as const; };
def('aircraftTrim', (a) => {
  const ac = acOf(a[0]), [V, h] = speedHeight(a, 1), t = fl.trim(ac, V, h);
  return [struct([['Alpha', t.alpha], ['Elevator', t.de], ['Throttle', t.throttle], ['Speed', V], ['Height', h], ['Possible', t.ok ? 1 : 0]])];
});
def('aircraftModes', (a) => {
  const ac = acOf(a[0]), [V, h] = speedHeight(a, 1), m = fl.modes(ac, fl.trim(ac, V, h));
  return [table([['Mode', { k: 'cell', r: m.length, c: 1, d: m.map((x) => str(x.name)) }], ['Real', col(m.map((x) => x.re))], ['Imag', col(m.map((x) => x.im))], ['Period', col(m.map((x) => x.period))], ['Damping', col(m.map((x) => x.damping))], ['HalfTime', col(m.map((x) => x.halfTime))]])];
});
def('aircraftSim', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("aircraftSim needs the aeroplane and the time: aircraftSim(aircraft(), 60, 'Elevator', @(t) -0.03*(t > 1 & t < 2)).");
  const ac = acOf(a[0]), T = toMat(a[1]).d[0], o = pairs(a, 2);
  if (!(T > 0 && T <= 1800)) throw new LabError('aircraftSim runs up to 1,800 s (steps of 10 ms).');
  const V0 = o.get('speed') ? toMat(o.get('speed')!).d[0] : 50, h0 = o.get('height') ? toMat(o.get('height')!).d[0] : 1000;
  const tr = fl.trim(ac, V0, h0);
  if (!tr.ok) throw new LabError(`It can't fly level at ${V0} m/s and ${h0} m (${tr.alpha >= ac.alphaStall ? 'below the stall speed' : 'not enough power or elevator'}).`);
  const r = fl.flightSim(ac, T, { V0, h0, elevator: o.get('elevator') ? fnOf(lab, o.get('elevator')!, 'The elevator') : undefined, throttle: o.get('throttle') ? fnOf(lab, o.get('throttle')!, 'The throttle') : undefined, holdHeight: o.get('holdheight') ? fnOf(lab, o.get('holdheight')!, 'The height to hold') : undefined, holdSpeed: o.get('holdspeed') ? toMat(o.get('holdspeed')!).d[0] : undefined });
  const info = struct([['Stalled', r.stalled ? 1 : 0], ['MinHeight', Math.min(...r.h)], ['MaxHeight', Math.max(...r.h)]]);
  if (nout > 0) return [table([['Time', col(r.t)], ['X', col(r.x)], ['Height', col(r.h)], ['Speed', col(r.V)], ['Alpha', col(r.alpha)], ['Pitch', col(r.th)], ['PitchRate', col(r.q)], ['Elevator', col(r.de)], ['Throttle', col(r.thr)]]), info];
  call(lab, 'subplot', num(3), num(1), num(1)); call(lab, 'plot', row(r.x.map((x) => x / 1000)), row(r.h), str('LineWidth'), num(2)); call(lab, 'xlabel', str('distance (km)')); call(lab, 'ylabel', str('height (m)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(r.stalled ? 'The wing stalled' : 'The flight path'));
  call(lab, 'subplot', num(3), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.V)); call(lab, 'ylabel', str('speed (m/s)')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(3), num(1), num(3)); call(lab, 'plot', row(r.t), row(r.alpha.map((x) => (x * 180) / Math.PI)), row(r.t), row(r.th.map((x) => (x * 180) / Math.PI)));
  call(lab, 'legend', str('angle of attack (°)'), str('pitch (°)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
def('aircraftPerformance', (a, nout, lab) => {
  const ac = acOf(a[0]), h = a[1] ? toMat(a[1]).d[0] : 0;
  if (!(h >= 0 && h <= 12000)) throw new LabError('The height is 0 to 12,000 m.');
  const p = fl.performance(ac, h);
  const info = struct([['StallSpeed', p.stall], ['BestGlideSpeed', p.bestGlide], ['GlideRatio', p.glideRatio], ['BestClimbSpeed', p.bestClimbSpeed], ['BestClimbRate', p.bestClimb], ['TopSpeed', p.topSpeed], ['Ceiling', p.ceiling]]);
  if (nout > 0) return [info];
  const V = Array.from({ length: 120 }, (_, i) => p.stall + (i * (p.topSpeed * 1.05 - p.stall)) / 119);
  call(lab, 'plot', row(V), row(V.map((v) => fl.climbRate(ac, v, h))), str('LineWidth'), num(2)); call(lab, 'xlabel', str('speed (m/s)')); call(lab, 'ylabel', str('rate of climb at full power (m/s)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Stall ${p.stall.toFixed(0)} m/s, best climb ${p.bestClimb.toFixed(1)} m/s at ${p.bestClimbSpeed.toFixed(0)} m/s, top ${p.topSpeed.toFixed(0)} m/s, ceiling ${p.ceiling} m`));
  return [];
});
def('levelTurn', (a) => {
  const V = toMat(a[0] ?? num(NaN), 'The speed').d[0], bank = toMat(a[1] ?? num(NaN), 'The bank').d[0];
  if (!(V > 0) || !(bank > 0 && bank < 89)) throw new LabError('levelTurn takes the speed (m/s) and the bank in degrees (0 to 89).');
  const t = fl.turn(V, (bank * Math.PI) / 180);
  return [num(t.n), num(t.radius), num(t.time)];
});

// Rolling and yawing (M489b): the sideways modes and a run with ailerons, rudder or the autopilot. The aeroplane's
// sideways numbers are the textbook-typical defaults unless 'Lateral' gives a struct of them (fields as LAT_DEFAULT).
const LAT_NAMES: [string, keyof fl.Lateral][] = [['Ixx', 'ixx'], ['Izz', 'izz'], ['Ixz', 'ixz'], ['CYbeta', 'cyb'], ['Clbeta', 'clb'], ['Cnbeta', 'cnb'], ['Clp', 'clp'], ['Cnp', 'cnp'], ['Clr', 'clr'], ['Cnr', 'cnr'], ['Clda', 'clda'], ['Cnda', 'cnda'], ['CYdr', 'cydr'], ['Cldr', 'cldr'], ['Cndr', 'cndr'], ['AileronMax', 'daMax'], ['RudderMax', 'drMax']];
function latOf(x: Value | undefined): fl.Lateral {
  const out = { ...fl.LAT_DEFAULT };
  if (!x) return out;
  if (x.k !== 'struct') throw new LabError(`'Lateral' is a struct with any of ${LAT_NAMES.map(([k]) => k).join(', ')}.`);
  for (const [k, f] of LAT_NAMES) { const v = x.f.get(k); if (v) out[f] = toMat(v).d[0]; }
  if (!(out.ixx > 0 && out.izz > 0)) throw new LabError('Ixx and Izz must be above 0.');
  return out;
}
def('aircraftLateralModes', (a) => {
  const ac = acOf(a[0]), [V, h] = speedHeight(a, 1), o = pairs(a, 3), m = fl.lateralModes(ac, V, h, latOf(o.get('lateral')));
  return [table([['Mode', { k: 'cell', r: m.length, c: 1, d: m.map((x) => str(x.name)) }], ['Real', col(m.map((x) => x.re))], ['Imag', col(m.map((x) => x.im))], ['Period', col(m.map((x) => x.period))], ['Damping', col(m.map((x) => x.damping))], ['HalfTime', col(m.map((x) => x.halfTime))]])];
});
def('aircraftLateralSim', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("aircraftLateralSim needs the aeroplane and the time: aircraftLateralSim(aircraft(), 60, 'HoldHeading', 90).");
  const ac = acOf(a[0]), T = toMat(a[1]).d[0], o = pairs(a, 2), rad = (x: number) => (x * Math.PI) / 180;
  if (!(T > 0 && T <= 1800)) throw new LabError('aircraftLateralSim runs up to 1,800 s (steps of 10 ms).');
  const V = o.get('speed') ? toMat(o.get('speed')!).d[0] : 50, h = o.get('height') ? toMat(o.get('height')!).d[0] : 1000;
  if (!(V > 5 && V < 300)) throw new LabError('The speed is in m/s, 5 to 300.');
  // Bank and heading in degrees (as pilots say them), the controls in radians (as the other runs).
  const deg = (x: Value | undefined, what: string) => { if (!x) return undefined; const f = fnOf(lab, x, what); return (t: number) => rad(f(t)); };
  const r = fl.lateralSim(ac, T, {
    V, h, lat: latOf(o.get('lateral')), aileron: o.get('aileron') ? fnOf(lab, o.get('aileron')!, 'The aileron') : undefined, rudder: o.get('rudder') ? fnOf(lab, o.get('rudder')!, 'The rudder') : undefined,
    holdBank: deg(o.get('holdbank'), 'The bank to hold'), holdHeading: deg(o.get('holdheading'), 'The heading to hold'), maxBank: o.get('maxbank') ? rad(toMat(o.get('maxbank')!).d[0]) : undefined, yawDamper: o.get('yawdamper') ? !!toMat(o.get('yawdamper')!).d[0] : false,
  });
  const d = (v: number[]) => v.map((x) => (x * 180) / Math.PI);
  if (nout > 0) return [table([['Time', col(r.t)], ['North', col(r.x)], ['East', col(r.y)], ['Sideslip', col(d(r.beta))], ['RollRate', col(d(r.p))], ['YawRate', col(d(r.r))], ['Bank', col(d(r.phi))], ['Heading', col(d(r.psi))], ['Aileron', col(r.da)], ['Rudder', col(r.dr)]])];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(r.y), row(r.x), str('LineWidth'), num(2)); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('east (m)')); call(lab, 'ylabel', str('north (m)')); call(lab, 'title', str('From above'));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(r.t), row(d(r.phi)), row(r.t), row(d(r.beta))); call(lab, 'legend', str('bank (°)'), str('sideslip (°)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
