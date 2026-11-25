import { LabError } from './parse';
import { random } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as nr from './neuro';
import * as np from './neuro-plus';
import * as nt from './neuro-tree';
import * as nf from './neuro-files';
import { FileStore, fileText } from './files';
import { call, col, def, lines, need, nums, one, options, optNum, optText, record, row, rows } from './sci-kit';

// Hyperion's neuroscience in the language (M496): hodgkinHuxley, lifNeuron, lifRate, izhikevich, izhNetwork,
// lifNetwork, poissonSpikes, spikeTimes, isiStats, fanoFactor, psth, rasterPlot, spikeXcorr; M514: cableNeuron,
// synapseConductance, stdpWindow, stdpNeuron, detectSpikes, spikeSort. Our own names (MATLAB has
// no neuron models; its spike-train tools are third-party). M517: swcRead, treeNeuron, filterRecording, abfload,
// nwbRead; detectSpikes and spikeSort take 'Band' and 'Notch' to clean a raw recording first.

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
  call(lab, 'plot', row(t), row(V)); call(lab, 'xlabel', str('Time (ms)')); call(lab, 'ylabel', str('mV'));
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
  const trials = a[3] ? need(a[3], 'The trials') : s.ids.length ? Math.max(...s.ids) : 1, r = nr.psth(s.t, trials, T, bin);
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

// ——— M514 ———
def('cableNeuron', (a, nout, lab) => {
  const o = options(a, 0, ['Length', 'Diameter', 'Compartments', 'Ri', 'Rm', 'Cm', 'Active', 'Current', 'At', 'Start', 'Stop', 'Time', 'Step', 'Celsius', 'Rest'], 'cableNeuron');
  const d = np.CABLE, active = one(o.get('Active'), 0) !== 0;
  const c: np.CableOpts = {
    length: optNum(o, 'Length', active ? 50000 : d.length), diam: optNum(o, 'Diameter', active ? 476 : d.diam), n: Math.round(optNum(o, 'Compartments', active ? 500 : d.n)),
    Ri: optNum(o, 'Ri', active ? 35.4 : d.Ri), Rm: optNum(o, 'Rm', d.Rm), Cm: optNum(o, 'Cm', d.Cm), active, I: optNum(o, 'Current', active ? 2000 : d.I),
    at: Math.round(optNum(o, 'At', 1)) - 1, start: optNum(o, 'Start', 0), stop: optNum(o, 'Stop', active ? 0.5 : Infinity), T: optNum(o, 'Time', active ? 8 : d.T),
    dt: optNum(o, 'Step', d.dt), rest: optNum(o, 'Rest', d.rest), celsius: optNum(o, 'Celsius', active ? 18.5 : d.celsius),
  };
  if (!(c.length > 0 && c.diam > 0 && c.Ri > 0 && c.Rm > 0 && c.Cm > 0 && c.T > 0 && c.dt > 0 && c.dt <= 0.05)) throw new LabError("cableNeuron: 'Length', 'Diameter' (µm), 'Ri' (Ω·cm), 'Rm' (Ω·cm²), 'Cm' (µF/cm²) and 'Time' are positive; 'Step' at most 0.05 ms.");
  if (!(c.n >= 2 && c.n <= 2000 && c.at >= 0 && c.at < c.n)) throw new LabError("'Compartments' is 2 to 2000 and 'At' one of them (1 is the left end).");
  if ((c.T / c.dt) * c.n > 4e7) throw new LabError('That cable is too long for its time: fewer compartments, a shorter time or a larger step.');
  const r = np.cable(c);
  if (nout > 0) return [col(r.t), row(r.x), rows(r.V), num(r.speed), row(r.arrival)];
  call(lab, 'subplot', num(2), num(1), num(1));
  call(lab, 'imagesc', row(r.x), row(r.t), rows(r.V)); call(lab, 'colorbar');
  call(lab, 'xlabel', str('Position along the cable (µm)')); call(lab, 'ylabel', str('Time (ms)'));
  call(lab, 'title', str(Number.isFinite(r.speed) ? `A spike travels at ${r.speed.toFixed(1)} m/s` : `Length constant λ = ${r.lambda.toFixed(0)} µm, time constant τ = ${r.tau.toFixed(2)} ms`));
  call(lab, 'subplot', num(2), num(1), num(2));
  const pick = [0, Math.floor(c.n / 4), Math.floor(c.n / 2), Math.floor((3 * c.n) / 4), c.n - 1];
  lines(lab, r.t, pick.map((i) => r.V.map((v) => v[i])), pick.map((i) => `${r.x[i].toFixed(0)} µm`), 'Time (ms)', 'mV', active ? 'Voltage at five places' : 'The voltage spreads and fades');
  return [];
});
def('synapseConductance', (a, nout, lab) => {
  const sp = nums(a[0], 'The spike times (ms)'), t = nums(a[1], 'The times (ms)'), o = options(a, 2, ['Rise', 'Decay', 'Gmax'], 'synapseConductance');
  const rise = optNum(o, 'Rise', 0), decay = optNum(o, 'Decay', 5), g = optNum(o, 'Gmax', 1);
  if (!(decay > 0 && rise >= 0 && t.length <= 1e6 && sp.length <= 1e5)) throw new LabError("'Decay' (ms) is positive and 'Rise' ≥ 0 (0 a sudden rise, equal to 'Decay' an alpha function).");
  const v = np.conductance(sp, t, rise, decay, g);
  if (nout > 0) return [row(v)];
  lines(lab, t, [v], [], 'Time (ms)', 'Conductance', 'Synaptic conductance');
  return [];
});
const stdpKeys = ['Aplus', 'Ratio', 'TauPlus', 'TauMinus'];
def('stdpWindow', (a, nout, lab) => {
  const o = options(a, 0, stdpKeys, 'stdpWindow'), Ap = optNum(o, 'Aplus', 0.005), Am = Ap * optNum(o, 'Ratio', 1.05), tp = optNum(o, 'TauPlus', 20), tm = optNum(o, 'TauMinus', 20);
  const d = Array.from({ length: 201 }, (_, i) => -100 + i), w = d.map((x) => np.stdpChange(x, Ap, Am, tp, tm));
  if (nout > 0) return [row(d), row(w)];
  lines(lab, d, [w], [], 'Post − pre spike time (ms)', 'Weight change (share of the maximum)', 'Spike-timing-dependent plasticity'); call(lab, 'xline', num(0), str('--'));
  return [];
});
def('stdpNeuron', (a, nout, lab) => {
  const o = options(a, 0, ['Seconds', 'Inputs', 'Rate', 'Inhibitory', 'Gmax', 'Ginh', ...stdpKeys], 'stdpNeuron'), d = np.SONG;
  const p: np.Song = { ...d, seconds: optNum(o, 'Seconds', d.seconds), nEx: Math.round(optNum(o, 'Inputs', d.nEx)), rateEx: optNum(o, 'Rate', d.rateEx), nIn: Math.round(optNum(o, 'Inhibitory', d.nIn)), gmax: optNum(o, 'Gmax', d.gmax), gIn: optNum(o, 'Ginh', d.gIn), Ap: optNum(o, 'Aplus', d.Ap), ratio: optNum(o, 'Ratio', d.ratio), tauP: optNum(o, 'TauPlus', d.tauP), tauM: optNum(o, 'TauMinus', d.tauM) };
  if (!(p.seconds > 0 && p.seconds <= 3600 && p.nEx >= 1 && p.nEx <= 5000 && p.nIn >= 0 && p.rateEx >= 0 && p.gmax > 0 && p.Ap >= 0 && p.ratio >= 0 && p.tauP > 0 && p.tauM > 0)) throw new LabError("stdpNeuron: up to 3600 'Seconds' and 5000 'Inputs'; rates, 'Gmax' and time constants positive.");
  const r = np.songNeuron(p, random);
  if (nout > 0) return [row(r.w), row(r.rate), rows(r.snaps.length ? r.snaps : [[]])];
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'histogram', row(r.w), num(25));
  call(lab, 'xlabel', str('Weight ÷ the maximum')); call(lab, 'ylabel', str('Inputs')); call(lab, 'title', str(`After ${p.seconds} s: ${r.w.filter((x) => x > 0.8).length} strong, ${r.w.filter((x) => x < 0.2).length} weak`));
  call(lab, 'subplot', num(2), num(1), num(2));
  lines(lab, r.rate.map((_, i) => i + 1), [r.rate], [], 'Time (s)', 'Output (Hz)', 'The neuron settles as its inputs compete');
  return [];
});
const sortKeys = ['Threshold', 'Polarity', 'Pre', 'Post', 'DeadTime', 'Clusters', 'Band', 'Notch', 'Order'];
function sortOpts(a: Value[], name: string): np.SortOpts {
  const o = options(a, 2, sortKeys, name), d = np.SORT, pol = optText(o, 'Polarity', d.polarity).toLowerCase();
  if (pol !== 'neg' && pol !== 'pos' && pol !== 'both') throw new LabError("'Polarity' is 'neg', 'pos' or 'both'.");
  const s: np.SortOpts = { threshold: optNum(o, 'Threshold', d.threshold), polarity: pol, pre: optNum(o, 'Pre', d.pre), post: optNum(o, 'Post', d.post), dead: optNum(o, 'DeadTime', d.dead), clusters: Math.round(optNum(o, 'Clusters', 0)) };
  if (!(s.threshold > 0 && s.pre >= 0 && s.post > 0 && s.dead >= 0 && s.clusters >= 0 && s.clusters <= 20)) throw new LabError("'Threshold' (× the noise) is positive, 'Pre' and 'Post' in ms, 'Clusters' 0 (automatic) to 20.");
  return s;
}
const recording = (a: Value[]) => {
  const x = nums(a[0], 'The recording'), fs = need(a[1], 'The sampling rate (Hz)');
  if (x.length < 10 || x.length > 2e7 || !(fs >= 1000)) throw new LabError('A recording (a filtered voltage, one value per sample) and its sampling rate in Hz (1000 or more).');
  return { x, fs };
};
def('detectSpikes', (a) => {
  const { x, fs } = cleaned(a, 'detectSpikes'), r = np.detect(x, fs, sortOpts(a, 'detectSpikes'));
  return [col(r.peaks.map((p) => p / fs)), rows(r.waves.length ? r.waves : [[]]), num(r.threshold)];
});
def('spikeSort', (a, nout, lab) => {
  const { x, fs } = cleaned(a, 'spikeSort'), o = sortOpts(a, 'spikeSort'), r = np.sortSpikes(x, fs, o, random);
  if (r.peaks.length > 20000) throw new LabError(`${r.peaks.length} crossings: raise 'Threshold' or sort a shorter piece.`);
  if (nout > 0) return [col(r.peaks.map((p) => p / fs)), col(r.cluster), rows(r.waves.length ? r.waves : [[]]), rows(r.score.length ? r.score : [[]])];
  const tw = r.waves[0]?.map((_, j) => ((j - r.pre) * 1000) / fs) ?? [];
  call(lab, 'subplot', num(1), num(2), num(1));
  const means = Array.from({ length: r.k }, (_, c) => { const w = r.waves.filter((_, i) => r.cluster[i] === c + 1); return tw.map((_, j) => w.reduce((s, v) => s + v[j], 0) / Math.max(1, w.length)); });
  lines(lab, tw, means, means.map((_, c) => `Unit ${c + 1}: ${r.cluster.filter((x) => x === c + 1).length} spikes`), 'Time from the peak (ms)', 'Mean waveform', `${r.peaks.length} spikes, ${r.k} unit${r.k === 1 ? '' : 's'}`);
  call(lab, 'subplot', num(1), num(2), num(2));
  if (r.score.length) {
    call(lab, 'hold', str('on'));
    for (let c = 1; c <= r.k; c++) { const s = r.score.filter((_, i) => r.cluster[i] === c); if (s.length) call(lab, 'plot', row(s.map((v) => v[0])), row(s.map((v) => v[1] ?? 0)), str('.')); }
    call(lab, 'hold', str('off'));
  }
  call(lab, 'xlabel', str('PC 1')); call(lab, 'ylabel', str('PC 2')); call(lab, 'title', str('Waveforms by their principal components')); call(lab, 'grid', str('on'));
  return [];
});

// ——— M517: branching neurons, cleaning recordings, reading ABF and NWB files ———
function cleanOpts(o: Map<string, Value>, fs: number, name: string): nt.Clean | null {
  if (!o.has('Band') && !o.has('Notch')) return null;
  const band = o.has('Band') ? nums(o.get('Band')) : undefined, notch = o.has('Notch') ? optNum(o, 'Notch', 0) : undefined, order = Math.round(optNum(o, 'Order', 4));
  if (band && !(band.length === 2 && band[0] >= 0 && band[1] > band[0])) throw new LabError(`${name}: 'Band' is [low high] in Hz (300 6000 for spikes; 0 for no low edge).`);
  if (band && band[0] >= fs / 2) throw new LabError(`${name}: the band's low edge must sit below half the sampling rate (${fs / 2} Hz).`);
  if (notch !== undefined && !(notch > 0 && notch < fs / 2)) throw new LabError(`${name}: 'Notch' is the mains frequency (50 or 60 Hz).`);
  if (![2, 4, 6, 8].includes(order)) throw new LabError(`${name}: 'Order' is 2, 4, 6 or 8.`);
  return { band: band as [number, number] | undefined, notch, order };
}
const cleaned = (a: Value[], name: string) => {
  const r = recording(a), c = cleanOpts(options(a, 2, sortKeys, name), r.fs, name);
  return c ? { x: Array.from(nt.cleanRecording(r.x, r.fs, c)), fs: r.fs } : r;
};
def('filterRecording', (a) => {
  const X = toMat(a[0] ?? mat(0, 0), 'The recording'), fs = need(a[1], 'The sampling rate (Hz)');
  if (!(fs > 0) || X.d.length < 4) throw new LabError('filterRecording needs a recording (a vector, or one column per channel) and its sampling rate in Hz.');
  const o = options(a, 2, ['Band', 'Notch', 'Order', 'CommonAverage'], 'filterRecording'), c = cleanOpts(o, fs, 'filterRecording') ?? { band: [300, 6000] as [number, number], order: 4 };
  const vec = X.r === 1 || X.c === 1, n = vec ? X.d.length : X.r, k = vec ? 1 : X.c;
  let ch = Array.from({ length: k }, (_, j) => Array.from(X.d.subarray(j * n, (j + 1) * n)));
  if (one(o.get('CommonAverage'), 0) !== 0) { if (k < 3) throw new LabError("'CommonAverage' needs three or more channels (columns)."); ch = nt.commonAverage(ch); }
  const out = ch.map((x) => nt.cleanRecording(x, fs, c));
  return [vec ? mat(X.r, X.c, out[0]) : mat(n, k, out.flatMap((v) => Array.from(v)))];
});

const swcText = (lab: Lab, v: Value | undefined) => {
  if (v?.k !== 'str') throw new LabError('An SWC file name (from Files) or its text.');
  return /\n/.test(v.v) || /^\s*[#\d]/.test(v.v) && !/\.swc$/i.test(v.v.trim()) ? v.v : fileText(lab, v.v);
};
const samplesOf = (lab: Lab, v: Value | undefined) => {
  if (v?.k === 'mat') {
    if (v.c !== 7 || !v.r) throw new LabError('An SWC matrix has 7 columns: id, type, x, y, z, radius, parent.');
    return Array.from({ length: v.r }, (_, i) => { const g = (j: number) => v.d[i + j * v.r]; return { id: g(0), type: g(1), x: g(2), y: g(3), z: g(4), r: g(5), parent: g(6) }; });
  }
  return wrapN(() => nt.parseSWC(swcText(lab, v)));
};
const wrapN = <T>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError(e instanceof Error ? e.message : String(e)); } };
def('swcRead', (a, _n, lab) => {
  const s = samplesOf(lab, a[0]);
  return [mat(s.length, 7, [...s.map((p) => p.id), ...s.map((p) => p.type), ...s.map((p) => p.x), ...s.map((p) => p.y), ...s.map((p) => p.z), ...s.map((p) => p.r), ...s.map((p) => p.parent)])];
});
def('treeNeuron', (a, nout, lab) => {
  const o = options(a, 1, ['Active', 'Current', 'At', 'Start', 'Stop', 'Time', 'Step', 'Ri', 'Rm', 'Cm', 'Celsius', 'Rest', 'MaxLength', 'Synapses', 'Record'], 'treeNeuron');
  const tree = wrapN(() => nt.buildTree(samplesOf(lab, a[0]), optNum(o, 'MaxLength', 20)));
  const node = (id: number, what: string) => { const i = tree.id.lastIndexOf(id); if (i < 0) throw new LabError(`${what}: there's no SWC point ${id}.`); return i; };
  const act = optText(o, 'Active', 'none').toLowerCase(), types: Record<string, (t: number) => boolean> = { none: () => false, all: () => true, soma: (t) => t === 1, axon: (t) => t === 1 || t === 2 };
  if (!types[act]) throw new LabError("'Active' is 'none' (passive), 'soma', 'axon' (the soma and axon) or 'all': where the HH channels are.");
  const d = nt.TREE, I = optNum(o, 'Current', 0), at = o.has('At') ? node(optNum(o, 'At', 0), "'At'") : 0;
  const syn: nt.Synapse[] = [];
  if (o.has('Synapses')) {
    const S = toMat(o.get('Synapses')!, "'Synapses'");
    if (S.c !== 6) throw new LabError("'Synapses' has a row per event: [swcId time(ms) gmax(nS) rise(ms) decay(ms) E(mV)].");
    for (let i = 0; i < S.r; i++) { const g = (j: number) => S.d[i + j * S.r]; if (!(g(2) >= 0 && g(3) >= 0 && g(4) > 0)) throw new LabError("'Synapses': gmax ≥ 0, rise ≥ 0 and decay > 0."); syn.push({ node: node(g(0), "'Synapses'"), times: [g(1)], gmax: g(2), rise: g(3), decay: g(4), E: g(5) }); }
    if (syn.length > 2000) throw new LabError("'Synapses' takes up to 2000 events.");
  }
  const far = (() => { const p = nt.pathLength(tree); return p.indexOf(Math.max(...p)); })();
  const recNodes = o.has('Record') ? nums(o.get('Record')).map((x) => node(x, "'Record'")) : [...new Set([0, far])];
  const opts: nt.TreeOpts = {
    Ri: optNum(o, 'Ri', d.Ri), Cm: optNum(o, 'Cm', d.Cm), Rm: optNum(o, 'Rm', d.Rm), rest: optNum(o, 'Rest', d.rest), celsius: optNum(o, 'Celsius', d.celsius), T: optNum(o, 'Time', d.T), dt: optNum(o, 'Step', d.dt),
    active: types[act], stim: I ? [{ node: at, I, start: optNum(o, 'Start', 5), stop: optNum(o, 'Stop', Infinity) }] : [], synapses: syn, record: recNodes,
  };
  if (!(opts.Ri > 0 && opts.Cm > 0 && opts.Rm > 0 && opts.T > 0 && opts.dt > 0 && opts.dt <= 0.1)) throw new LabError("'Ri', 'Rm', 'Cm' and 'Time' are positive; 'Step' at most 0.1 ms.");
  if ((opts.T / opts.dt) * tree.parent.length > 6e7) throw new LabError(`${tree.parent.length} compartments for ${opts.T} ms is too much here: a shorter time, a larger 'Step' or a larger 'MaxLength'.`);
  const r = nt.treeNeuron(tree, opts);
  if (nout > 0) return [col(r.t), rows(r.V), col(r.peak), record([['Compartments', tree.parent.length], ['Id', col(Array.from(tree.id))], ['Parent', col(Array.from(tree.parent, (p) => p + 1))], ['Length', col(Array.from(tree.len))], ['Diameter', col(Array.from(tree.diam))], ['X', col(Array.from(tree.x))], ['Y', col(Array.from(tree.y))], ['Z', col(Array.from(tree.z))], ['Arrival', col(r.arrival)]])];
  call(lab, 'subplot', num(1), num(2), num(1));
  const xs: number[] = [], ys: number[] = [];
  for (let i = 1; i < tree.parent.length; i++) { xs.push(tree.px[i], tree.x[i], NaN); ys.push(tree.py[i], tree.y[i], NaN); }
  call(lab, 'plot', row(xs), row(ys), str('Color'), row([0.6, 0.6, 0.6])); call(lab, 'hold', str('on'));
  call(lab, 'scatter', row(Array.from(tree.x)), row(Array.from(tree.y)), num(12), row(r.peak), str('filled')); call(lab, 'hold', str('off'));
  call(lab, 'colorbar'); call(lab, 'axis', str('equal')); call(lab, 'xlabel', str('µm')); call(lab, 'ylabel', str('µm'));
  call(lab, 'title', str(`${tree.parent.length} compartments, coloured by the highest voltage (mV)`));
  call(lab, 'subplot', num(1), num(2), num(2));
  lines(lab, r.t, recNodes.map((_, j) => r.V.map((v) => v[j])), recNodes.map((i) => (i === 0 ? 'Soma (root)' : `Point ${tree.id[i]}`)), 'Time (ms)', 'mV', 'Voltage');
  return [];
});

const store = (lab: Lab): FileStore => { const s = (lab.host as { files?: unknown }).files; if (!(s instanceof FileStore)) throw new LabError('Files aren’t available here.'); return s; };
def('abfload', (a, nout, lab) => {
  if (a[0]?.k !== 'str') throw new LabError("abfload takes a file's name from Files: [d, si, h] = abfload('cell1.abf').");
  const r = wrapN(() => nf.readAbf(store(lab).get(a[0].k === 'str' ? a[0].v : '').bytes)), n = r.data[0][0].length, k = r.channels.length;
  const d = new Float64Array(n * k * r.sweeps);
  for (let s = 0; s < r.sweeps; s++) for (let c = 0; c < k; c++) d.set(r.data[c][s], s * n * k + c * n);
  const h: Struct = record([['Rate', r.rate], ['Sweeps', r.sweeps], ['Mode', r.mode === 3 ? 'gap-free' : r.mode === 5 ? 'episodic' : String(r.mode)], ['Channels', { k: 'cell', r: 1, c: k, d: r.channels.map(str) }], ['Units', { k: 'cell', r: 1, c: k, d: r.units.map(str) }]]);
  if (nout === 0) lab.host.out(`${k} channel${k > 1 ? 's' : ''} (${r.channels.join(', ')}), ${r.sweeps} sweep${r.sweeps > 1 ? 's' : ''} of ${n} samples at ${r.rate} Hz\n`);
  return [mat(n, k, d), num(1e6 / r.rate), h];
});
def('nwbRead', (a, _n, lab) => {
  if (a[0]?.k !== 'str') throw new LabError("nwbRead takes a file's name from Files: s = nwbRead('session.nwb').");
  const series = wrapN(() => nf.readNwb(store(lab).get(a[0].k === 'str' ? a[0].v : '').bytes));
  const f = new Map<string, Value>();
  for (const s of series) {
    let key = s.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]/, 'x$&') || 'series';
    while (f.has(key)) key += '_';
    const n = s.data[0].length;
    f.set(key, record([['Data', mat(n, s.data.length, s.data.flat())], ['Rate', s.rate], ['StartTime', s.start], ['Unit', s.unit], ...(s.timestamps ? [['Timestamps', col(s.timestamps)] as [string, Value]] : [])]));
  }
  return [{ k: 'struct', f }];
});
