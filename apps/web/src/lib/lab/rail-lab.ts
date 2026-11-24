import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { table } from './table';
import * as rl from './rail';

// Hyperion's railways in the language (M491): trainModel, railRoute, trainRun, railHeadway. MATLAB has no railway
// toolbox of its own; these are our names. Speeds in the language are km/h and gradients ‰, as railways write them.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };
const isType = (x: Value | undefined, ty: string): x is Struct => !!x && x.k === 'struct' && x.f.get('Type')?.k === 'str' && textOf(x.f.get('Type')!) === ty;

// Speeds shown in km/h, everything else as the model has it.
const NAMES: [string, keyof rl.Train, number][] = [['Mass', 'mass', 1], ['RotatingFactor', 'rot', 1], ['Length', 'length', 1], ['A', 'A', 1], ['B', 'B', 1], ['C', 'C', 1], ['MaxEffort', 'f0', 1], ['Power', 'power', 1], ['MaxSpeed', 'vmax', 3.6], ['Braking', 'brake', 1], ['Efficiency', 'eta', 1], ['Regen', 'regen', 1]];
const trainStruct = (t: rl.Train): Struct => ({ k: 'struct', f: new Map<string, Value>([['Type', str('train')], ['Name', str(t.name)], ...NAMES.map(([k, f, u]) => [k, num((t[f] as number) * u)] as [string, Value])]) });
function trainOf(x: Value | undefined): rl.Train {
  if (!isType(x, 'train')) throw new LabError("A train was expected: trainModel('intercity').");
  const t = { ...rl.TRAINS.intercity, name: textOf(x.f.get('Name')!) };
  for (const [k, f, u] of NAMES) (t as Record<string, unknown>)[f] = toMat(x.f.get(k)!).d[0] / u;
  return t;
}
def('trainModel', (a) => {
  let i = 0, t = { ...rl.TRAINS.intercity };
  if (a[0]?.k === 'str' && rl.TRAINS[(a[0] as { v: string }).v.toLowerCase()]) { t = { ...rl.TRAINS[(a[0] as { v: string }).v.toLowerCase()] }; i = 1; }
  for (; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '', hit = NAMES.find(([k]) => k.toLowerCase() === key);
    if (!hit) throw new LabError(`trainModel takes 'metro', 'intercity' or 'freight', then ${NAMES.map(([k]) => `'${k}'`).join(', ')} (name, value pairs; MaxSpeed in km/h).`);
    const x = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!(x >= 0) || (x === 0 && !['regen', 'a', 'b', 'c'].includes(key))) throw new LabError(`'${hit[0]}' must be above 0.`);
    (t as Record<string, unknown>)[hit[1]] = x / hit[2];
  }
  return [trainStruct(t)];
});
const routeStruct = (r: rl.Route): Struct => ({ k: 'struct', f: new Map<string, Value>([['Type', str('route')], ['Name', str(r.name)], ['Sections', mat(r.sections.length, 4, Float64Array.from({ length: r.sections.length * 4 }, (_, q) => { const s = r.sections[q % r.sections.length], c = Math.floor(q / r.sections.length); return [s.length, s.grade, s.radius, s.limit * 3.6][c]; }))], ['Stations', row(r.stations)], ['Dwell', num(r.dwell)], ['Length', num(rl.routeLength(r))]]) });
function routeOf(x: Value | undefined): rl.Route {
  if (x?.k === 'str') { const make = rl.ROUTES[textOf(x).toLowerCase()]; if (!make) throw new LabError(`The routes are ${Object.keys(rl.ROUTES).map((k) => `'${k}'`).join(', ')}.`); return make(); }
  if (!isType(x, 'route')) throw new LabError("A route was expected: railRoute('intercity').");
  const m = toMat(x.f.get('Sections')!);
  return { name: textOf(x.f.get('Name')!), dwell: toMat(x.f.get('Dwell')!).d[0], stations: [...toMat(x.f.get('Stations')!).d], sections: Array.from({ length: m.r }, (_, i) => ({ length: m.d[i], grade: m.d[i + m.r], radius: m.d[i + 2 * m.r], limit: m.d[i + 3 * m.r] / 3.6 })) };
}
def('railRoute', (a) => {
  if (!a.length) throw new LabError("railRoute takes a route's name ('metro', 'intercity', 'mountain') or sections [length m, gradient ‰, curve radius m (0 straight), limit km/h] and the stations' distances (m).");
  if (a[0].k === 'str') return [routeStruct(routeOf(a[0]))];
  const m = toMat(a[0], 'The sections');
  if (m.c !== 4 || m.r < 1) throw new LabError('The sections are rows [length m, gradient ‰, curve radius m, limit km/h].');
  const sections = Array.from({ length: m.r }, (_, i) => ({ length: m.d[i], grade: m.d[i + m.r], radius: m.d[i + 2 * m.r], limit: m.d[i + 3 * m.r] / 3.6 }));
  if (sections.some((s) => !(s.length > 0 && s.limit > 0 && Math.abs(s.grade) <= 80 && s.radius >= 0))) throw new LabError('Each section needs a length and limit above 0, a gradient within ±80 ‰ and a radius of 0 (straight) or more.');
  const L = sections.reduce((s, x) => s + x.length, 0), st = a[1] ? [...toMat(a[1], 'The stations').d] : [0, L];
  if (st.some((s) => s < 0 || s > L)) throw new LabError('The stations are distances along the route (0 to its length).');
  return [routeStruct({ name: 'yours', sections, stations: st, dwell: a[2] ? toMat(a[2]).d[0] : 30 })];
});
def('trainRun', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("trainRun needs the train and the route: trainRun(trainModel('metro'), railRoute('metro'), 'Coast', 0.1).");
  const t = trainOf(a[0]), r = routeOf(a[1]), o = pairs(a, 2), coast = o.get('coast') ? toMat(o.get('coast')!).d[0] : 0;
  if (!(coast >= 0 && coast <= 0.3)) throw new LabError("'Coast' is the driving style, 0 (the fastest) to 0.3.");
  if (rl.routeLength(r) / 5 > 400000) throw new LabError('The route is at most 2,000 km.');
  const x = rl.railRun(t, r, { coast });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Minutes', num(x.time / 60)], ['EnergyKWh', num(x.energyKwh)], ['RegenKWh', num(x.regenKwh)], ['KWhPerKm', num(x.energyKwh / (rl.routeLength(r) / 1000))], ['Arrivals', row(x.arrivals.map((s) => s / 60))], ['StalledAt', num(x.stalled)]]) };
  if (nout > 0) return [table([['Distance', col(x.s)], ['Speed', col(x.v.map((v) => v * 3.6))], ['Time', col(x.t)], ['Limit', col(x.limit.map((v) => v * 3.6))], ['Gradient', col(x.grade)]]), info];
  const km = x.s.map((s) => s / 1000);
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', row(km), row(x.limit.map((v) => v * 3.6)), str('--'), row(km), row(x.v.map((v) => v * 3.6)), str('LineWidth'), num(2));
  call(lab, 'ylabel', str('km/h')); call(lab, 'legend', str('limit'), str('train')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(Number.isNaN(x.stalled) ? `${(x.time / 60).toFixed(1)} min, ${x.energyKwh.toFixed(0)} kWh (${x.regenKwh.toFixed(0)} kWh given back)` : `Stalled ${(x.stalled / 1000).toFixed(1)} km on: the hill is too steep for this train`));
  // The line's height from its gradients.
  let h = 0;
  const height = x.s.map((_, i) => (i ? (h += ((x.s[i] - x.s[i - 1]) * rl.sectionAt(r, x.s[i]).grade) / 1000) : 0));
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(km), row(height)); call(lab, 'ylabel', str('height (m)')); call(lab, 'xlabel', str('distance (km)')); call(lab, 'grid', str('on'));
  return [];
});
def('railHeadway', (a) => {
  if (a.length < 2) throw new LabError("railHeadway needs the train and the speed (km/h): railHeadway(trainModel('metro'), 80, 'Block', 400).");
  const t = trainOf(a[0]), v = toMat(a[1]).d[0] / 3.6, o = pairs(a, 2), opt = (k: string) => (o.get(k) ? toMat(o.get(k)!).d[0] : undefined);
  if (!(v > 0)) throw new LabError('The speed must be above 0 (km/h).');
  const h = rl.headway(t, v, { block: opt('block'), blocks: opt('blocks'), overlap: opt('overlap'), reaction: opt('reaction'), moving: !!opt('moving'), margin: opt('margin') });
  return [num(h.headway), num(h.perHour), num(h.brakeDist)];
});
