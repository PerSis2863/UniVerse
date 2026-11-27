import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import { mmc, simulate, type Dist, type Station } from '../sim/des';

// Hyperion's discrete-event simulation in the language (M479): queuesim runs a line (or network) of stations with
// queues and servers; mmcqueue gives Erlang's exact M/M/c answers to compare with. MATLAB builds these as SimEvents
// block diagrams; here a model is a few cells, and Simulate → Queues is the point-and-click version.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const n1 = (v: Value | undefined, what: string) => { const m = toMat(v ?? num(NaN), what); if (m.d.length !== 1 || !Number.isFinite(m.d[0])) throw new LabError(`${what} is one number.`); return m.d[0]; };
/** {'exp', mean}, {'const', v}, {'uniform', lo, hi}, {'normal', mean, sd}, {'erlang', mean, k}, or a number (exponential with that mean). */
export function distOf(v: Value | undefined, what: string): Dist {
  if (v?.k === 'mat') return { kind: 'exp', mean: n1(v, what) };
  if (v?.k !== 'cell' || !v.d.length) throw new LabError(`${what}: a mean, or {'exp', mean}, {'const', value}, {'uniform', lo, hi}, {'normal', mean, sd} or {'erlang', mean, k}.`);
  const k = textOf(v.d[0]).toLowerCase(), x = (i: number) => n1(v.d[i], what);
  const d: Dist = k === 'exp' ? { kind: 'exp', mean: x(1) } : k === 'const' ? { kind: 'const', value: x(1) } : k === 'uniform' ? { kind: 'uniform', lo: x(1), hi: x(2) } : k === 'normal' ? { kind: 'normal', mean: x(1), sd: x(2) } : k === 'erlang' ? { kind: 'erlang', mean: x(1), k: Math.round(x(2)) } : (() => { throw new LabError(`${what}: '${k}' isn’t a distribution here ('exp', 'const', 'uniform', 'normal', 'erlang').`); })();
  if ((d.kind === 'exp' || d.kind === 'erlang' || d.kind === 'normal') && !(d.mean > 0)) throw new LabError(`${what}: the mean must be above 0.`);
  return d;
}
const col = (xs: number[]) => mat(xs.length, 1, xs);
def('queuesim', (a, nout, lab) => {
  const arrival = distOf(a[0], 'The arrivals');
  const list = a[1];
  if (list?.k !== 'cell' || !list.d.length) throw new LabError("The stations: a cell of {name, servers, service}, e.g. {{'Desk', 2, {'exp', 3}}}.");
  const stations: Station[] = list.d.map((s, i) => {
    if (s.k !== 'cell' || s.d.length < 3) throw new LabError(`Station ${i + 1}: {name, servers, service} (and a queue capacity, if any).`);
    return { name: textOf(s.d[0]), servers: Math.round(n1(s.d[1], `Station ${i + 1}'s servers`)), service: distOf(s.d[2], `Station ${i + 1}'s service`), ...(s.d[3] ? { capacity: Math.round(n1(s.d[3], 'The capacity')) } : {}) };
  });
  const until = n1(a[2], 'The time to run');
  let seed = 1, warmup = 0, route: number[][] | undefined;
  for (let i = 3; i + 1 < a.length; i += 2) {
    const k = textOf(a[i]).toLowerCase();
    if (k === 'seed') seed = n1(a[i + 1], 'The seed');
    else if (k === 'warmup') warmup = n1(a[i + 1], 'The warm-up');
    else if (k === 'route') { const m = toMat(a[i + 1]); if (m.r !== stations.length || m.c !== stations.length) throw new LabError('The routing matrix is stations × stations.'); route = Array.from({ length: m.r }, (_, r) => Array.from({ length: m.c }, (_, c) => m.d[r + c * m.r])); }
    else throw new LabError("queuesim takes 'Seed', 'Warmup' and 'Route'.");
  }
  let r;
  try { r = simulate({ arrival, stations, route }, until, seed, { warmup }); } catch (e) { throw new LabError((e as Error).message); }
  const T = r.stations, cell = (xs: string[]): Cell => ({ k: 'cell', r: xs.length, c: 1, d: xs.map(str) });
  const table: Struct = { k: 'struct', table: true, f: new Map<string, Value>([['Name', cell(T.map((s) => s.name))], ['Served', col(T.map((s) => s.served))], ['Utilisation', col(T.map((s) => s.utilisation))], ['MeanQueue', col(T.map((s) => s.meanQueue))], ['MaxQueue', col(T.map((s) => s.maxQueue))], ['MeanWait', col(T.map((s) => s.meanWait))], ['MaxWait', col(T.map((s) => s.maxWait))], ['Turned', col(T.map((s) => s.balked))]]) };
  const q = mat(r.timeline.length, T.length, T.flatMap((_, i) => r.timeline.map((p) => p.q[i])));
  if (nout > 0) return [{ k: 'struct', f: new Map<string, Value>([['Stations', table], ['MeanTimeInSystem', num(r.meanInSystem)], ['Throughput', num(r.throughput)], ['MeanWIP', num(r.meanWip)], ['Arrived', num(r.arrived)], ['Finished', num(r.finished)], ['Time', col(r.timeline.map((p) => p.t))], ['Queue', q], ['Waits', col(r.waits)]]) } satisfies Struct];
  call(lab, 'subplot', num(2), num(1), num(1));
  call(lab, 'stairs', col(r.timeline.map((p) => p.t)), q);
  call(lab, 'xlabel', str('Time')); call(lab, 'ylabel', str('Waiting')); call(lab, 'grid', str('on'));
  call(lab, 'legend', ...T.map((s) => str(s.name)));
  call(lab, 'title', str(`${r.finished} through, ${r.meanInSystem.toFixed(2)} in the system on average`));
  call(lab, 'subplot', num(2), num(1), num(2));
  call(lab, 'bar', col(T.map((s) => 100 * s.utilisation)));
  call(lab, 'ylabel', str('Busy (%)')); call(lab, 'ylim', mat(1, 2, [0, 100]));
  call(lab, 'title', str(T.map((s) => `${s.name}: ${Math.round(100 * s.utilisation)}%`).join(', ')));
  return [];
});
def('mmcqueue', (a) => {
  const m = mmc(n1(a[0], 'λ (arrivals per unit time)'), n1(a[1], 'μ (services per unit time, each server)'), Math.round(n1(a[2] ?? num(1), 'c (servers)')));
  return [{ k: 'struct', f: new Map<string, Value>([['Rho', num(m.rho)], ['P0', num(m.p0)], ['PWait', num(m.pWait)], ['Lq', num(m.lq)], ['Wq', num(m.wq)], ['L', num(m.l)], ['W', num(m.w)]]) } satisfies Struct];
});
