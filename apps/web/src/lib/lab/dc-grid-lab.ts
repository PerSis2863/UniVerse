import { LabError } from './parse';
import { num, str, toMat, type Value } from './values';
import * as g from './dc-grid';
import { call, col, def, isText, lines, nums, options, optNum, record, row } from './sci-kit';

// Hyperion's data centres on the grid in the language (M572): dcGridVoltage, dcHostingCapacity, dcFrequency,
// dcHarmonics, itic. Our own names (MathWorks builds these as Simscape Electrical models).

const same = (v: Value | undefined, n: number, what: string, d: number) => {
  const x = v === undefined ? [d] : nums(v, what);
  if (x.length !== 1 && x.length !== n) throw new LabError(`${what} must be one number or one per sample.`);
  return Array.from({ length: n }, (_, i) => x[x.length === 1 ? 0 : i]);
};

def('dcGridVoltage', (a, nout, lab) => {
  const P = nums(a[0], 'The load P (pu)'), Q = same(a[1], P.length, 'The load Q (pu)', 0);
  const o = options(a, 2, ['Source', 'Z', 'Tap', 'Dt', 'Band', 'Delay'], 'dcGridVoltage'), z = o.has('Z') ? nums(o.get('Z')) : [0.01, 0.08];
  if (z.length !== 2 || !(z[0] >= 0 && z[1] >= 0)) throw new LabError("dcGridVoltage's 'Z' is [R X] in pu.");
  const tap = optNum(o, 'Tap', 0) ? { ...g.TAP, band: optNum(o, 'Band', g.TAP.band), delay: optNum(o, 'Delay', g.TAP.delay) } : undefined, dt = optNum(o, 'Dt', 1);
  const r = g.voltageSeries(P, Q, optNum(o, 'Source', 1), z[0], z[1], dt, tap);
  if (nout > 0) return [row(r.V), row(r.taps)];
  const t = P.map((_, i) => i * dt);
  call(lab, 'subplot', num(2), num(1), num(1)); lines(lab, t, [r.V], [], 'Time (s)', 'Voltage (pu)', `Voltage at the connection: ${Math.min(...r.V.filter(Number.isFinite)).toFixed(3)} to ${Math.max(...r.V.filter(Number.isFinite)).toFixed(3)} pu`);
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, t, [P], [], 'Time (s)', 'Load (pu)', tap ? `${new Set(r.taps).size - 1} tap positions used` : 'The load');
  return [];
});
def('dcHostingCapacity', (a) => {
  const z = nums(a[0], 'The impedance [R X] (pu)'), o = options(a, 1, ['PF', 'Vmin', 'Limit', 'Source'], 'dcHostingCapacity');
  if (z.length !== 2) throw new LabError('dcHostingCapacity([R X], …): R and X in pu.');
  const pf = optNum(o, 'PF', 0.98), r = g.hostingCapacity(optNum(o, 'Source', 1), z[0], z[1], pf, optNum(o, 'Vmin', 0.95), optNum(o, 'Limit', Infinity));
  if (!(pf > 0 && pf <= 1)) throw new LabError("'PF' is a power factor, above 0 and at most 1.");
  return [record([['Capacity', r.capacity], ['Nose', r.nose], ['VoltageAtNose', r.voltageAtNose], ['LimitedBy', r.limitedBy]])];
});
def('dcFrequency', (a, nout, lab) => {
  const t = nums(a[0], 'The times (s)'), dP = same(a[1], t.length, 'The load change (pu)', 0);
  const o = options(a, 2, ['H', 'D', 'R', 'Tg', 'F0', 'Battery', 'Reserve'], 'dcFrequency'), b = o.has('Battery') ? nums(o.get('Battery')) : [0, 0.1];
  const s: g.Sfr = { H: optNum(o, 'H', g.SFR.H), D: optNum(o, 'D', g.SFR.D), R: optNum(o, 'R', g.SFR.R), Tg: optNum(o, 'Tg', g.SFR.Tg), f0: optNum(o, 'F0', 50), battery: b[0], tb: b[1] ?? 0.1, reserve: optNum(o, 'Reserve', Infinity) };
  if (!(s.H > 0 && s.R > 0 && s.Tg > 0 && s.tb > 0) || t.some((v, i) => i && !(v > t[i - 1]))) throw new LabError('dcFrequency: rising times; H, R, Tg and the battery\'s time above 0.');
  const r = g.frequencyResponse(t, dP, s);
  if (nout > 0) return [row(r.df), record([['Nadir', r.nadir], ['NadirAt', r.nadirAt], ['RoCoF', r.rocof], ['Settled', r.settled], ['Governors', row(r.pm)], ['Battery', row(r.pb)]])];
  lines(lab, t, [r.df.map((v) => v + s.f0)], [], 'Time (s)', 'Frequency (Hz)', `Nadir ${(s.f0 + r.nadir).toFixed(3)} Hz at ${r.nadirAt.toFixed(1)} s, RoCoF ${r.rocof.toFixed(3)} Hz/s`);
  return [];
});
def('dcHarmonics', (a, nout, lab) => {
  const load = toMat(a[0], 'The load (MVA)').d[0], kV = toMat(a[1] ?? num(NaN), 'The bus voltage (kV)').d[0], ssc = toMat(a[2] ?? num(NaN), 'The short-circuit level (MVA)').d[0];
  if (!(load > 0 && kV > 0 && ssc > load)) throw new LabError('dcHarmonics(load MVA, kV, short-circuit MVA): the short-circuit level above the load.');
  const o = options(a, 3, ['Rectifier', 'Capacitor', 'XR', 'Demand', 'Linear'], 'dcHarmonics'), rv = o.get('Rectifier'), keys = Object.keys(g.RECTIFIERS);
  let mix: Record<string, number> = { '6pulse': 1 };
  if (rv && isText(rv)) { const k = rv.v.toLowerCase(); if (!g.RECTIFIERS[k]) throw new LabError(`'Rectifier' is one of ${keys.map((x) => `'${x}'`).join(', ')}, or shares [6-pulse 12-pulse AFE PFC].`); mix = { [k]: 1 }; }
  else if (rv) { const w = nums(rv); if (w.length !== 4 || w.some((x) => x < 0)) throw new LabError("'Rectifier' shares are [6-pulse 12-pulse AFE PFC]."); mix = Object.fromEntries(keys.map((k, i) => [k, w[i]])); }
  const r = g.harmonics({ load, kV, ssc, xr: optNum(o, 'XR', 10), cap: optNum(o, 'Capacitor', 0), mix, demand: optNum(o, 'Demand', 1), linear: optNum(o, 'Linear', 0.3) });
  if (nout > 0) return [record([['Order', col(r.orders)], ['Current', col(r.Ih)], ['Voltage', col(r.Vh)], ['THDv', r.thdv], ['THDi', r.thdi], ['TDD', r.tdd], ['SCR', r.ratio], ['Resonance', r.resonance], ['LimitTHDv', r.limits.thdv], ['LimitEach', r.limits.each], ['LimitTDD', r.limits.tdd], ['Pass', r.pass ? 1 : 0]])];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'bar', row(r.orders), row(r.Vh)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row([0, 26]), row([r.limits.each, r.limits.each]), str('r--')); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Harmonic order')); call(lab, 'ylabel', str('Voltage (%)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`THDv ${r.thdv.toFixed(2)}% (limit ${r.limits.thdv}%), TDD ${r.tdd.toFixed(1)}% (limit ${r.limits.tdd}%): ${r.pass ? 'passes' : 'fails'} IEEE 519`));
  const hs = Array.from({ length: 241 }, (_, i) => 1 + i * 0.1);
  call(lab, 'subplot', num(2), num(1), num(2)); lines(lab, hs, [hs.map((h) => r.scan(h))], [], 'Harmonic order', '|Z| (pu)', Number.isFinite(r.resonance) ? `Impedance scan: resonance near order ${r.resonance.toFixed(1)}` : 'Impedance scan');
  return [];
});
def('itic', (a, nout, lab) => {
  const v = nums(a[0], 'The voltage (pu)'), d = same(a[1], v.length, 'The duration (s)', NaN);
  if (d.some((x) => !(x > 0))) throw new LabError('itic(V, duration): durations above 0 s.');
  const ok = v.map((x, i) => (g.itic(x, d[i]) ? 1 : 0));
  if (nout > 0) return [row(ok)];
  const xy = (p: [number, number][]) => [row(p.map((q) => q[0])), row(p.map((q) => q[1]))];
  call(lab, 'semilogx', ...xy(g.ITIC_LOW), str('k-'), ...xy(g.ITIC_HIGH), str('k-'), str('LineWidth'), num(1.5)); call(lab, 'hold', str('on'));
  const pin = (keep: number) => [row(d.filter((_, i) => ok[i] === keep)), row(v.filter((_, i) => ok[i] === keep))];
  if (ok.includes(1)) call(lab, 'semilogx', ...pin(1), str('go'), str('MarkerFaceColor'), str('g'));
  if (ok.includes(0)) call(lab, 'semilogx', ...pin(0), str('rx'), str('MarkerSize'), num(9));
  call(lab, 'hold', str('off')); call(lab, 'xlabel', str('Duration (s)')); call(lab, 'ylabel', str('Voltage (pu)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`ITIC: ${ok.filter(Boolean).length} of ${ok.length} events ridden through`));
  return [];
});
