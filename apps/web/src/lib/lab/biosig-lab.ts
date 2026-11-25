import { LabError } from './parse';
import { random } from './builtins';
import { num, str, toMat, type Cell, type Value } from './values';
import * as bs from './biosig';
import { call, def, need, nums, options, optNum, record, row } from './sci-kit';

// Hyperion's biosignals in the language (M499): ecgSynth, panTompkins, hrvMetrics, eegSynth, eegBandPower,
// patientMonitor, wdrc, hearingAid. Our own names (MATLAB's are in toolboxes and apps the engine doesn't have).
// butter, filtfilt, pwelch and findpeaks are deliberately not defined here: the signals branch (M472–M481) owns those
// names; these functions use their own filters inside. For learning, not diagnosis.

const NOTE = 'For learning, not diagnosis';
const signal = (v: Value | undefined, what: string) => { const x = nums(v, what); if (x.length < 16) throw new LabError(`${what} needs at least 16 samples.`); return x; };
const rate = (v: Value | undefined) => { const fs = need(v, 'The sample rate (Hz)'); if (!(fs >= 50 && fs <= 100_000)) throw new LabError('The sample rate is 50 Hz to 100 kHz.'); return fs; };

def('ecgSynth', (a, nout, lab) => {
  const fs = rate(a[0]), T = need(a[1], 'The length (s)'), hr = a[2] ? need(a[2], 'The heart rate (beats a minute)') : 70;
  const o = options(a, 3, ['RSA', 'Jitter', 'Noise', 'Wander', 'Mains', 'Breathing'], 'ecgSynth');
  if (!(T > 0 && fs * T <= 5e6 && hr >= 20 && hr <= 250)) throw new LabError('ecgSynth(fs, seconds, rate 20–250): at most 5 million samples.');
  const r = bs.ecgSynth(fs, T, hr, random, { rsa: optNum(o, 'RSA', 0.04), jitter: optNum(o, 'Jitter', 0.01), noise: optNum(o, 'Noise', 0.02), wander: optNum(o, 'Wander', 0), mains: optNum(o, 'Mains', 0), breath: optNum(o, 'Breathing', 0.25) });
  const t = Array.from(r.x, (_, i) => i / fs);
  if (nout > 0) return [row(r.x), row(t), row(r.beats)];
  call(lab, 'plot', row(t), row(r.x)); call(lab, 'xlabel', str('Time (s)')); call(lab, 'ylabel', str('mV')); call(lab, 'title', str(`Synthetic ECG, ${hr} beats a minute`)); call(lab, 'grid', str('on'));
  return [];
});
def('panTompkins', (a, nout, lab) => {
  const x = signal(a[0], 'The ECG'), fs = rate(a[1]);
  if (fs < 100) throw new LabError('Pan–Tompkins needs at least 100 Hz (its band-pass reaches 15 Hz with room to spare).');
  const r = bs.panTompkins(x, fs), times = r.r.map((i) => i / fs), rr = times.slice(1).map((v, i) => v - times[i]);
  if (nout > 0) return [row(r.r.map((i) => i + 1)), row(times), row(rr)];
  const t = x.map((_, i) => i / fs);
  call(lab, 'plot', row(t), row(x)); call(lab, 'hold', str('on')); call(lab, 'plot', row(times), row(r.r.map((i) => x[i])), str('rv'), str('MarkerFaceColor'), str('r')); call(lab, 'hold', str('off'));
  call(lab, 'xlabel', str('Time (s)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${r.r.length} beats${rr.length ? `, ${(60 / (rr.reduce((s, v) => s + v, 0) / rr.length)).toFixed(0)} a minute` : ''} (${NOTE.toLowerCase()})`));
  return [];
});
def('hrvMetrics', (a) => {
  const rr = nums(a[0], 'The RR intervals (s)');
  if (rr.length < 10 || rr.some((v) => !(v > 0.2 && v < 3))) throw new LabError('hrvMetrics needs 10 or more RR intervals in seconds (0.2 to 3 s each).');
  const h = bs.hrv(rr);
  return [record([['HeartRate', h.hr], ['MeanRR', h.meanRR], ['SDNN', h.sdnn], ['RMSSD', h.rmssd], ['pNN50', h.pnn50], ['LF', h.lf], ['HF', h.hf], ['LFHF', h.ratio]])];
});
def('eegSynth', (a) => {
  const fs = rate(a[0]), T = need(a[1], 'The length (s)'), R = a[2] ? toMat(a[2], 'The rhythms') : null;
  if (!(T > 0 && fs * T <= 5e6)) throw new LabError('eegSynth(fs, seconds, [freq amp; …]): at most 5 million samples.');
  if (R && R.c !== 2) throw new LabError('The rhythms are rows [frequency (Hz) amplitude (µV)].');
  const rh = R ? Array.from({ length: R.r }, (_, i) => [R.d[i], R.d[i + R.r]]) : [[10, 20]];
  return [row(bs.eegSynth(fs, T, rh, random, a[3] ? need(a[3], 'The background (µV)') : 5))];
});
def('eegBandPower', (a, nout, lab) => {
  const x = signal(a[0], 'The EEG'), fs = rate(a[1]);
  if (x.length < 2 * fs) throw new LabError('eegBandPower needs at least 2 seconds.');
  const r = bs.eegBands(x, fs);
  if (nout > 0) return [record(r.names.map((n, i) => [n, r.power[i]] as [string, number])), row(r.relative)];
  call(lab, 'subplot', num(1), num(2), num(1));
  const keep = r.spectrum.f.map((f, i) => [f, r.spectrum.p[i]]).filter(([f]) => f > 0 && f <= 50);
  call(lab, 'semilogy', row(keep.map((k) => k[0])), row(keep.map((k) => k[1]))); call(lab, 'xlabel', str('Hz')); call(lab, 'ylabel', str('µV²/Hz')); call(lab, 'title', str('Spectrum (Welch)')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(1), num(2), num(2));
  call(lab, 'bar', row(r.relative.map((v) => 100 * v)));
  call(lab, 'xticklabels', { k: 'cell', r: 1, c: 5, d: r.names.map(str) } as Cell); call(lab, 'ylabel', str('% of the power')); call(lab, 'title', str('Bands'));
  return [];
});
def('patientMonitor', (a, _n, lab) => {
  const x = signal(a[0], 'The ECG'), fs = rate(a[1]), o = options(a, 2, ['SpO2', 'Resp', 'BP'], 'patientMonitor');
  const r = bs.panTompkins(x, fs), tt = r.r.map((i) => i / fs), rr = tt.slice(1).map((v, i) => v - tt[i]), hr = rr.length ? 60 / (rr.slice(-8).reduce((s, v) => s + v, 0) / Math.min(8, rr.length)) : NaN;
  const spo2 = optNum(o, 'SpO2', 98), resp = optNum(o, 'Resp', 15), bp = o.has('BP') ? nums(o.get('BP')) : [120, 80];
  const show = Math.min(x.length, Math.round(6 * fs)), from = x.length - show, t = Array.from({ length: show }, (_, i) => (from + i) / fs);
  // The pleth follows each detected beat; the breathing is a slow wave at the given rate.
  const pleth = t.map((s) => { const last = tt.filter((b) => b <= s).pop(); if (last === undefined) return 0; const u = (s - last - 0.2) / 0.35; return u < 0 ? 0 : Math.exp(-u) * Math.sin(Math.min(Math.PI, u * 2.5)) ** 2 + 0.15 * Math.exp(-u / 2); });
  call(lab, 'subplot', num(3), num(1), num(1)); call(lab, 'plot', row(t), row(x.slice(from)), str('Color'), str('#22c55e'));
  call(lab, 'title', str(`HR ${Number.isFinite(hr) ? hr.toFixed(0) : '--'} bpm    BP ${bp[0]}/${bp[1]}    ${NOTE}`));
  call(lab, 'subplot', num(3), num(1), num(2)); call(lab, 'plot', row(t), row(pleth), str('Color'), str('#06b6d4')); call(lab, 'title', str(`SpO2 ${spo2}%`));
  call(lab, 'subplot', num(3), num(1), num(3)); call(lab, 'plot', row(t), row(t.map((s) => Math.sin((2 * Math.PI * resp * s) / 60))), str('Color'), str('#eab308'));
  call(lab, 'title', str(`Resp ${resp} a minute`)); call(lab, 'xlabel', str('Time (s)'));
  return [];
});
def('wdrc', (a) => {
  const x = signal(a[0], 'The sound'), fs = rate(a[1]), th = need(a[2], 'The threshold (dB)'), ratio = need(a[3], 'The ratio'), o = options(a, 4, ['Attack', 'Release', 'Gain'], 'wdrc');
  if (!(ratio >= 1)) throw new LabError('The compression ratio is 1 or more.');
  return [row(bs.wdrc(x, fs, th, ratio, optNum(o, 'Attack', 0.005), optNum(o, 'Release', 0.05), optNum(o, 'Gain', 0)))];
});
def('hearingAid', (a, nout, lab) => {
  const x = signal(a[0], 'The sound'), fs = rate(a[1]), o = options(a, 2, ['Edges', 'Gains', 'Threshold', 'Ratio'], 'hearingAid');
  const edges = o.has('Edges') ? nums(o.get('Edges')) : [500, 1000, 2000, 4000], gains = o.has('Gains') ? nums(o.get('Gains')) : [5, 10, 20, 25, 30];
  if (gains.length !== edges.length + 1 || edges.some((e) => !(e > 0 && e < fs / 2))) throw new LabError("hearingAid: 'Edges' between 0 and fs/2, and one more 'Gains' (dB) than edges (one per band).");
  const y = bs.hearingAid(x, fs, edges, gains, optNum(o, 'Threshold', -30), optNum(o, 'Ratio', 2));
  if (nout > 0) return [row(y)];
  const t = x.map((_, i) => i / fs);
  call(lab, 'plot', row(t), row(x), row(t), row(y)); call(lab, 'legend', str('In'), str('Out')); call(lab, 'xlabel', str('Time (s)'));
  call(lab, 'title', str(`Hearing aid: ${edges.length + 1} bands, gains ${gains.join('/')} dB, ${optNum(o, 'Ratio', 2)}:1 above ${optNum(o, 'Threshold', -30)} dB`)); call(lab, 'grid', str('on'));
  return [];
});
