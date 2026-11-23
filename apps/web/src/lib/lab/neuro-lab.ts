import { LabError } from './parse';
import { random } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Value } from './values';
import * as nr from './neuro';
import { call, col, def, need, nums, options, optNum, record, row, rows } from './sci-kit';

// Hyperion's neuroscience in the language (M496): hodgkinHuxley, lifNeuron, lifRate, izhikevich, izhNetwork,
// lifNetwork, poissonSpikes, spikeTimes, isiStats, fanoFactor, psth, rasterPlot, spikeXcorr. Our own names (MATLAB has
// no neuron models; its spike-train tools are third-party).

/** The current: a number (a step from 'Start' to 'Stop' ms), or one value per time step. */
function current(v: Value | undefined, o: Map<string, Value>, T: number, dt: number): nr.Input {
  const m = toMat(v ?? num(0), 'The current');
  if (m.d.length === 1) { const I = m.d[0], a = optNum(o, 'Start', 0), b = optNum(o, 'Stop', T); return (_k, t) => (t >= a && t < b ? I : 0); }
  const steps = Math.round(T / dt);
  if (m.d.length < steps) throw new LabError(`A current that changes has a value for every step: ${steps} of them (T / step), or use a number with 'Start' and 'Stop'.`);
  return (k) => m.d[k];
}
const span = (v: Value | undefined, dt: number) => { const T = need(v, 'The time (ms)'); if (!(T > 0 && T / dt <= 2e6)) throw new LabError('The time must be positive and at most 2 million steps.'); return T; };
function trace(lab: Lab, t: ArrayLike<number>, V: ArrayLike<number>, title: string, spikes: number[]) {
  call(lab, 'plot', row(t), row(V)); call(lab, 'xlabel', str('Time (ms)')); call(lab, 'ylabel', str('Membrane voltage (mV)'));
  call(lab, 'title', str(`${title}: ${spikes.length} spike${spikes.length === 1 ? '' : 's'}${spikes.length > 1 ? `, ${nr.isiStats(spikes).rate.toFixed(1)} Hz` : ''}`)); call(lab, 'grid', str('on'));
}

def('hodgkinHuxley', (a, nout, lab) => {
  const o = options(a, 2, ['Start', 'Stop', 'Step'], 'hodgkinHuxley'), dt = optNum(o, 'Step', 0.01);
  if (!(dt > 0 && dt <= 0.05)) throw new LabError("'Step' must be positive and at most 0.05 ms (the sodium gate is fast).");
  const T = span(a[1], dt), r = nr.hodgkinHuxley(current(a[0], o, T, dt), T, dt);
  if (nout > 0) return [col(r.t), col(r.V), rows(Array.from(r.m, (m, k) => [m, r.h[k], r.n[k]])), row(r.spikes)];
  call(lab, 'subplot', num(2), num(1), num(1)); trace(lab, r.t, r.V, 'Hodgkin–Huxley', r.spikes);
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', row(r.t), row(r.m), row(r.t), row(r.h), row(r.t), row(r.n));
  call(lab, 'legend', str('m (sodium opens)'), str('h (sodium closes)'), str('n (potassium)')); call(lab, 'xlabel', str('Time (ms)')); call(lab, 'ylabel', str('Gate open')); call(lab, 'grid', str('on'));
  return [];
});
function lifParams(o: Map<string, Value>): nr.Lif {
  const p: nr.Lif = { tau: optNum(o, 'Tau', 10), r: optNum(o, 'R', 10), rest: optNum(o, 'Rest', -65), threshold: optNum(o, 'Threshold', -50), reset: optNum(o, 'Reset', -65), refractory: optNum(o, 'Refractory', 2) };
  if (!(p.tau > 0 && p.r > 0 && p.refractory >= 0 && p.threshold > p.reset)) throw new LabError("'Tau' and 'R' are positive, 'Refractory' ≥ 0 and the threshold above the reset.");
  return p;
}
const LIF_KEYS = ['Tau', 'R', 'Rest', 'Threshold', 'Reset', 'Refractory'];
def('lifNeuron', (a, nout, lab) => {
  const o = options(a, 2, [...LIF_KEYS, 'Start', 'Stop', 'Step'], 'lifNeuron'), dt = optNum(o, 'Step', 0.1);
  if (!(dt > 0)) throw new LabError("'Step' must be positive.");
  const T = span(a[1], dt), r = nr.lif(current(a[0], o, T, dt), T, dt, lifParams(o));
  if (nout > 0) return [col(r.t), col(r.V), row(r.spikes)];
  trace(lab, r.t, r.V, 'Integrate-and-fire', r.spikes);
  return [];
});
def('lifRate', (a) => { const I = toMat(a[0] ?? num(NaN), 'The current'), p = lifParams(options(a, 1, LIF_KEYS, 'lifRate')); return [mat(I.r, I.c, [...I.d].map((x) => nr.lifRate(x, p)))]; });
def('izhikevich', (a, nout, lab) => {
  const o = options(a, 2, ['Type', 'Params', 'Start', 'Stop', 'Step'], 'izhikevich'), dt = optNum(o, 'Step', 0.25);
  const type = o.has('Type') ? textOf(o.get('Type')!).toUpperCase() : 'RS';
  const abcd = o.has('Params') ? nums(o.get('Params')) : nr.IZH_TYPES[type];
  if (!abcd || abcd.length !== 4) throw new LabError(`'Type' is ${Object.keys(nr.IZH_TYPES).map((k) => `'${k}'`).join(', ')} (regular, bursting, chattering, fast, low-threshold, thalamic, resonator), or 'Params', [a b c d].`);
  if (!(dt > 0 && dt <= 1)) throw new LabError("'Step' is from 0 to 1 ms.");
  const T = span(a[1], dt), r = nr.izhikevich(current(a[0], o, T, dt), T, abcd as [number, number, number, number], dt);
  if (nout > 0) return [col(r.t), col(r.V), row(r.spikes), col(r.U)];
  trace(lab, r.t, r.V, `Izhikevich ${o.has('Params') ? '' : type}`.trim(), r.spikes);
  return [];
});

/** A spike list: rows [time neuron]. */
const spikeList = (s: [number, number][]) => rows(s);
function raster(lab: Lab, s: [number, number][], n: number, T: number, title: string) {
  call(lab, 'plot', row(s.map((x) => x[0])), row(s.map((x) => x[1])), str('.'), str('MarkerSize'), num(4));
  call(lab, 'xlim', row([0, T])); call(lab, 'ylim', row([0.5, n + 0.5])); call(lab, 'xlabel', str('Time (ms)')); call(lab, 'ylabel', str('Neuron')); call(lab, 'title', str(title));
}
def('izhNetwork', (a, nout, lab) => {
  const Ne = Math.round(need(a[0], 'The excitatory neurons')), Ni = Math.round(need(a[1], 'The inhibitory neurons')), T = Math.round(need(a[2], 'The time (ms)'));
  if (!(Ne >= 1 && Ni >= 0 && Ne + Ni <= 2000 && T >= 1 && T * (Ne + Ni) <= 4e6)) throw new LabError('izhNetwork takes up to 2,000 neurons and 4 million neuron-milliseconds.');
  const s = nr.izhNetwork(Ne, Ni, T, random);
  if (nout > 0) return [spikeList(s)];
  raster(lab, s, Ne + Ni, T, `${Ne} excitatory + ${Ni} inhibitory: ${((1000 * s.length) / (T * (Ne + Ni))).toFixed(1)} Hz a neuron`);
  return [];
});
def('lifNetwork', (a, nout, lab) => {
  const Wm = toMat(a[0] ?? num(NaN), 'The weights'), n = Wm.r;
  if (Wm.r !== Wm.c || n < 1 || n > 2000) throw new LabError('lifNetwork needs a square weight matrix (mV that neuron j adds to neuron i when it fires: W(i, j)), up to 2,000 neurons.');
  const W = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Wm.d[i + j * n]));
  const I = nums(a[1], 'The currents'), Iext = I.length === 1 ? new Array(n).fill(I[0]) : I;
  if (Iext.length !== n) throw new LabError('Give one current, or one for each neuron.');
  const o = options(a, 3, [...LIF_KEYS, 'Noise', 'Delay', 'Step'], 'lifNetwork'), dt = optNum(o, 'Step', 0.1), T = span(a[2], dt);
  if (T / dt * n > 2e7) throw new LabError('That network is too big for its time: fewer neurons, a shorter time or a larger step.');
  const r = nr.lifNetwork(W, Iext, T, random, { dt, noise: optNum(o, 'Noise', 0), delay: optNum(o, 'Delay', 1), p: lifParams(o) });
  if (nout > 0) return [spikeList(r.spikes), rows(Array.from(r.trace[0] ?? [], (_, k) => r.trace.map((tr) => tr[k])))];
  raster(lab, r.spikes, n, T, `${n} integrate-and-fire neurons: ${r.spikes.length} spikes`);
  return [];
});

def('poissonSpikes', (a) => {
  const rate = need(a[0], 'The rate (Hz)'), T = need(a[1], 'The time (ms)'), n = Math.round(a[2] ? need(a[2], 'The trains') : 1), o = options(a, 3, ['DeadTime'], 'poissonSpikes');
  if (!(rate >= 0 && T > 0 && n >= 1 && (rate * T * n) / 1000 <= 5e6)) throw new LabError('poissonSpikes(rate Hz, T ms, trains): positive, up to 5 million spikes.');
  const dead = optNum(o, 'DeadTime', 0);
  if (n === 1) return [row(nr.poisson(rate, T, random, dead))];
  return [spikeList(Array.from({ length: n }, (_, k) => nr.poisson(rate, T, random, dead).map((t) => [t, k + 1] as [number, number])).flat())];
});
def('spikeTimes', (a) => [row(nr.spikeTimes(nums(a[0], 'The voltage'), nums(a[1], 'The times'), a[2] ? need(a[2], 'The threshold') : 0))]);
def('isiStats', (a) => {
  const t = nums(a[0], 'The spike times');
  if (t.length < 3 || t.some((x, i) => i && x < t[i - 1])) throw new LabError('isiStats needs three or more spike times in order.');
  const s = nr.isiStats(t);
  return [record([['MeanISI', s.mean], ['CV', s.cv], ['Rate', s.rate], ['ISI', s.isi]])];
});
def('fanoFactor', (a) => {
  const t = nums(a[0], 'The spike times'), T = need(a[1], 'The time (ms)'), w = need(a[2], 'The window (ms)');
  if (!(w > 0 && T >= 2 * w)) throw new LabError('The window must be positive and fit at least twice in the time.');
  return [num(nr.fano(t, T, w))];
});
/** Times from a spike list or a row of times; trials = the neurons or trials in it. */
const timesOf = (v: Value | undefined) => { const m = toMat(v ?? num(NaN), 'The spikes'); return m.c === 2 && m.r > 0 ? { t: [...m.d.subarray(0, m.r)], ids: [...m.d.subarray(m.r)] } : { t: [...m.d], ids: [] as number[] }; };
def('psth', (a, nout, lab) => {
  const s = timesOf(a[0]), T = need(a[1], 'The time (ms)'), bin = need(a[2], 'The bin width (ms)');
  if (!(bin > 0 && T / bin <= 1e5)) throw new LabError('The bin width must be positive and at most 100,000 bins.');
  const trials = a[3] ? need(a[3], 'The trials') : s.ids.length ? new Set(s.ids).size : 1, r = nr.psth(s.t, trials, T, bin);
  if (nout > 0) return [row(r.rate), row(r.edges)];
  call(lab, 'bar', row(r.edges.slice(0, -1).map((e) => e + bin / 2)), row(r.rate), num(1)); call(lab, 'xlabel', str('Time (ms)')); call(lab, 'ylabel', str('Rate (Hz)'));
  call(lab, 'title', str(`PSTH, ${bin} ms bins, ${trials} train${trials === 1 ? '' : 's'}`)); call(lab, 'grid', str('on'));
  return [];
});
def('rasterPlot', (a, _n, lab) => {
  const s = timesOf(a[0]);
  if (!s.ids.length) throw new LabError('rasterPlot needs spikes as rows [time neuron] (from izhNetwork, lifNetwork or poissonSpikes).');
  const pairs = s.t.map((t, i) => [t, s.ids[i]] as [number, number]);
  raster(lab, pairs, Math.max(...s.ids), a[1] ? need(a[1], 'The time (ms)') : Math.max(...s.t), `${pairs.length} spikes`);
  return [];
});
def('spikeXcorr', (a, nout, lab) => {
  const x = nums(a[0], 'The first train'), y = nums(a[1], 'The second train'), maxLag = need(a[2], 'The largest lag (ms)'), bin = a[3] ? need(a[3], 'The bin (ms)') : 1;
  if (!(maxLag > 0 && bin > 0 && maxLag / bin <= 5000)) throw new LabError('The lag and bin must be positive, at most 5,000 bins a side.');
  const r = nr.crossCorrelogram([...x].sort((p, q) => p - q), [...y].sort((p, q) => p - q), maxLag, bin);
  if (nout > 0) return [row(r.counts), row(r.lags)];
  call(lab, 'bar', row(r.lags), row(r.counts), num(1)); call(lab, 'xlabel', str('Lag (ms): the second train after the first')); call(lab, 'ylabel', str('Count')); call(lab, 'title', str('Cross-correlogram')); call(lab, 'grid', str('on'));
  return [];
});
