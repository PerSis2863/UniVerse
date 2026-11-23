import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { cmat, mat, num, str, toMat, type Struct, type Value } from './values';
import * as F from './filters';

// Hyperion's filter designer and signal analyser in the language (M472): butter, cheby1, cheby2, ellip (digital, or
// analog with 's'), buttord, cheb1ord, cheb2ord, ellipord, fir1, fir2, firpm (our own Remez exchange), freqz,
// grpdelay, filtfilt, designfilt (a plain struct in place of MATLAB's digitalFilter object: filter, filtfilt, freqz
// and grpdelay take it), pwelch and spectrogram. Frequencies are normalised (1 = half the sample rate) as in MATLAB.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const vec = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} is missing.`); const m = toMat(v, what); if (m.im) throw new LabError(`${what} must be real.`); return [...m.d]; };
const one = (v: Value | undefined, what: string) => { const d = vec(v, what); if (d.length !== 1) throw new LabError(`${what} is one number.`); return d[0]; };
const given = (v: Value | undefined) => !!v && !(v.k === 'mat' && !v.d.length);
const wrap = <T>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const BANDS: Record<string, F.Band> = { low: 'low', high: 'high', bandpass: 'bandpass', stop: 'stop', bandstop: 'stop' };

/** butter(n, Wn, type, 's') and its siblings: [b, a] or [z, p, k]. */
function iirFn(kind: F.Kind) {
  const lead = kind === 'butter' ? 0 : kind === 'ellip' ? 2 : 1;
  return ((a, nout) => {
    const n = one(a[0], 'The order');
    const rp = kind === 'cheby1' || kind === 'ellip' ? one(a[1], 'The passband ripple (dB)') : 1;
    const rs = kind === 'cheby2' ? one(a[1], 'The stopband attenuation (dB)') : kind === 'ellip' ? one(a[2], 'The stopband attenuation (dB)') : 40;
    const wn = vec(a[1 + lead], 'The edge frequency');
    let band: F.Band = wn.length === 2 ? 'bandpass' : 'low', analog = false;
    for (const v of a.slice(2 + lead)) {
      const t = textOf(v).toLowerCase();
      if (t === 's') analog = true;
      else if (BANDS[t]) band = BANDS[t];
      else throw new LabError(`The filter type is 'low', 'high', 'bandpass' or 'stop' (and 's' for analog), not '${t}'.`);
    }
    const f = wrap(() => F.iir(kind, n, wn, band, rp, rs, analog));
    if (nout >= 3) return [cmat(f.z.length, 1, f.z.map((c) => c[0]), f.z.map((c) => c[1])), cmat(f.p.length, 1, f.p.map((c) => c[0]), f.p.map((c) => c[1])), num(f.k)];
    const { b, a: den } = F.zpk2tf(f);
    return [row(b), row(den)];
  }) as Builtin;
}
def('butter', iirFn('butter'));
def('cheby1', iirFn('cheby1'));
def('cheby2', iirFn('cheby2'));
def('ellip', iirFn('ellip'));
for (const [name, kind] of [['buttord', 'butter'], ['cheb1ord', 'cheby1'], ['cheb2ord', 'cheby2'], ['ellipord', 'ellip']] as const) {
  def(name, (a) => { const r = wrap(() => F.order(kind, vec(a[0], 'Wp'), vec(a[1], 'Ws'), one(a[2], 'Rp'), one(a[3], 'Rs'))); return [num(r.n), row(r.wn)]; });
}

const windowArg = (v: Value | undefined, L: number) => {
  if (!given(v)) return undefined;
  const w = vec(v, 'The window');
  if (w.length !== L) throw new LabError(`The window must have ${L} points (the order + 1).`);
  return w;
};
def('fir1', (a) => {
  const n = one(a[0], 'The order'), wn = vec(a[1], 'The edge frequency');
  let band: F.Band = wn.length === 2 ? 'bandpass' : 'low', win: number[] | undefined;
  for (const v of a.slice(2)) {
    if (v.k === 'str') { const t = v.v.toLowerCase(); if (t === 'scale' || t === 'noscale') continue; if (!BANDS[t]) throw new LabError("The type is 'low', 'high', 'bandpass' or 'stop'."); band = BANDS[t]; }
    else win = windowArg(v, n + 1);
  }
  return [row(wrap(() => F.fir1(n, wn, band, win)))];
});
def('fir2', (a) => {
  const n = one(a[0], 'The order'), npt = given(a[3]) && a[3].k === 'mat' && a[3].d.length === 1 ? a[3].d[0] : 512;
  const win = a.slice(3).find((v) => v.k === 'mat' && v.d.length === n + 1);
  return [row(wrap(() => F.fir2(n, vec(a[1], 'f'), vec(a[2], 'm'), npt, win ? vec(win, 'The window') : undefined)))];
});
def('firpm', (a, nout) => {
  const r = wrap(() => F.firpm(one(a[0], 'The order'), vec(a[1], 'f'), vec(a[2], 'a'), given(a[3]) ? vec(a[3], 'The weights') : undefined));
  return nout > 1 ? [row(r.h), num(r.err)] : [row(r.h)];
});

// ——— designfilt: a struct that filter, filtfilt, freqz and grpdelay accept ———
def('designfilt', (a) => {
  const resp = a[0] ? textOf(a[0]).toLowerCase() : '';
  const m = /^(lowpass|highpass|bandpass|bandstop)(iir|fir)$/.exec(resp);
  if (!m) throw new LabError("designfilt's first input is 'lowpassiir', 'highpassfir', 'bandpassiir', 'bandstopfir' and so on.");
  const o = new Map<string, number>();
  let method = '';
  for (let i = 1; i < a.length; i += 2) {
    const k = textOf(a[i]).toLowerCase();
    if (k === 'designmethod') method = textOf(a[i + 1]).toLowerCase();
    else if (k === 'window') continue;
    else o.set(k, one(a[i + 1], textOf(a[i])));
  }
  const fs = o.get('samplerate') ?? 2, nq = (x: number) => (2 * x) / fs;
  const two = m[1] === 'bandpass' || m[1] === 'bandstop', band = (m[1] === 'lowpass' ? 'low' : m[1] === 'highpass' ? 'high' : m[1] === 'bandpass' ? 'bandpass' : 'stop') as F.Band;
  const edges = (name: string) => (two ? [o.get(`${name}1`), o.get(`${name}2`)] : [o.get(name)]).every((x) => x !== undefined) ? (two ? [o.get(`${name}1`)!, o.get(`${name}2`)!] : [o.get(name)!]).map(nq) : null;
  const rp = o.get('passbandripple') ?? 1, rs = o.get('stopbandattenuation') ?? 60;
  let order = o.get('filterorder'), b: number[], den = [1];
  if (m[2] === 'iir') {
    const kind = (method || (o.has('halfpowerfrequency') || o.has('halfpowerfrequency1') ? 'butter' : 'ellip')) as F.Kind;
    if (!['butter', 'cheby1', 'cheby2', 'ellip'].includes(kind)) throw new LabError("An IIR design method is 'butter', 'cheby1', 'cheby2' or 'ellip'.");
    let wn = kind === 'butter' ? edges('halfpowerfrequency') ?? edges('passbandfrequency') : kind === 'cheby2' ? edges('stopbandfrequency') : edges('passbandfrequency');
    if (order === undefined) {
      const wp = edges('passbandfrequency'), ws = edges('stopbandfrequency');
      if (!wp || !ws) throw new LabError("Give 'FilterOrder' or both the passband and stopband frequencies.");
      const r = wrap(() => F.order(kind, wp, ws, rp, rs));
      order = r.n; wn = r.wn;
    }
    if (!wn) throw new LabError(`Give the ${kind === 'butter' ? "'HalfPowerFrequency'" : kind === 'cheby2' ? "'StopbandFrequency'" : "'PassbandFrequency'"}${two ? ' 1 and 2' : ''}.`);
    const tf = F.zpk2tf(wrap(() => F.iir(kind, order!, wn!, band, rp, rs)));
    b = tf.b; den = tf.a; method = kind;
  } else {
    if (order === undefined) throw new LabError("An FIR design needs 'FilterOrder'.");
    if (method === 'equiripple' || (!method && edges('passbandfrequency') && edges('stopbandfrequency'))) {
      const wp = edges('passbandfrequency'), ws = edges('stopbandfrequency');
      if (!wp || !ws) throw new LabError('Equiripple needs the passband and stopband frequencies.');
      const f = band === 'low' ? [0, wp[0], ws[0], 1] : band === 'high' ? [0, ws[0], wp[0], 1] : band === 'bandpass' ? [0, ws[0], wp[0], wp[1], ws[1], 1] : [0, wp[0], ws[0], ws[1], wp[1], 1];
      const g = band === 'low' ? [1, 1, 0, 0] : band === 'high' ? [0, 0, 1, 1] : band === 'bandpass' ? [0, 0, 1, 1, 0, 0] : [1, 1, 0, 0, 1, 1];
      b = wrap(() => F.firpm(order!, f, g).h); method = 'equiripple';
    } else {
      const wn = edges('cutofffrequency') ?? edges('passbandfrequency');
      if (!wn) throw new LabError("A window design needs 'CutoffFrequency'.");
      b = wrap(() => F.fir1(order!, wn, band)); method = 'window';
    }
  }
  const s: Struct = { k: 'struct', f: new Map<string, Value>([['Response', str(resp)], ['DesignMethod', str(method)], ['FilterOrder', num(order!)], ['SampleRate', num(fs)], ['Numerator', row(b)], ['Denominator', row(den)]]) };
  return [s];
});
/** [b, a, rest] from (b, a, …) or (d, …). */
function coeffs(a: Value[]): [number[], number[], Value[]] {
  if (a[0]?.k === 'struct') {
    const s = a[0].f, b = s.get('Numerator'), d = s.get('Denominator');
    if (!b || !d) throw new LabError('This struct is not a filter from designfilt.');
    return [vec(b, 'b'), vec(d, 'a'), a.slice(1)];
  }
  return [vec(a[0], 'b'), given(a[1]) ? vec(a[1], 'a') : [1], a.slice(2)];
}
const baseFilter = BUILTINS.filter;
def('filter', (a, nout, lab) => (a[0]?.k === 'struct' ? (() => { const [b, d, rest] = coeffs(a); return baseFilter([row(b), row(d), ...rest], nout, lab); })() : baseFilter(a, nout, lab)));
def('filtfilt', (a) => {
  const [b, d, rest] = coeffs(a), x = toMat(rest[0] ?? num(NaN), 'The signal');
  const isVec = x.r === 1 || x.c === 1, out = mat(x.r, x.c);
  const cols = isVec ? 1 : x.c, len = isVec ? x.d.length : x.r;
  for (let j = 0; j < cols; j++) out.d.set(wrap(() => F.filtfilt(b, d, x.d.subarray(j * len, (j + 1) * len))), j * len);
  return [out];
});

/** n points (or the frequencies given) and the sample rate, after the coefficients. */
function grid(rest: Value[]): { w: number[]; fs: number | null } {
  const first = rest[0] && rest[0].k === 'mat' ? [...rest[0].d] : [512];
  const fs = given(rest[1]) ? one(rest[1], 'The sample rate') : null;
  if (first.length > 1) return { w: fs ? first.map((f) => (2 * Math.PI * f) / fs) : first, fs };
  const n = first[0];
  return { w: Array.from({ length: n }, (_, k) => (Math.PI * k) / n), fs };
}
const axisOf = (w: number[], fs: number | null) => (fs ? w.map((x) => (x * fs) / (2 * Math.PI)) : w.map((x) => x / Math.PI));
const xlab = (fs: number | null) => (fs ? 'Frequency (Hz)' : 'Normalised frequency (×π rad/sample)');
def('freqz', (a, nout, lab) => {
  const [b, d, rest] = coeffs(a), { w, fs } = grid(rest), h = F.response(b, d, w);
  if (nout > 0) return [cmat(w.length, 1, h.map((c) => c[0]), h.map((c) => c[1])), col(fs ? axisOf(w, fs) : w)];
  const x = row(axisOf(w, fs));
  call(lab, 'subplot', num(2), num(1), num(1)); call(lab, 'plot', x, row(h.map((c) => 20 * Math.log10(Math.hypot(c[0], c[1]) || 1e-300))));
  call(lab, 'ylabel', str('Magnitude (dB)')); call(lab, 'grid', str('on')); call(lab, 'title', str('Frequency response'));
  // Unwrapped phase in degrees.
  let prev = 0, off = 0;
  const ph = h.map((c, i) => { const p = Math.atan2(c[1], c[0]); if (i) { while (p + off - prev > Math.PI) off -= 2 * Math.PI; while (p + off - prev < -Math.PI) off += 2 * Math.PI; } prev = p + off; return (prev * 180) / Math.PI; });
  call(lab, 'subplot', num(2), num(1), num(2)); call(lab, 'plot', x, row(ph)); call(lab, 'ylabel', str('Phase (degrees)')); call(lab, 'xlabel', str(xlab(fs))); call(lab, 'grid', str('on'));
  return [];
});
def('grpdelay', (a, nout, lab) => {
  const [b, d, rest] = coeffs(a), { w, fs } = grid(rest), g = F.groupDelay(b, d, w);
  if (nout > 0) return [col(g), col(fs ? axisOf(w, fs) : w)];
  call(lab, 'plot', row(axisOf(w, fs)), row(g)); call(lab, 'xlabel', str(xlab(fs))); call(lab, 'ylabel', str('Group delay (samples)')); call(lab, 'grid', str('on')); call(lab, 'title', str('Group delay'));
  return [];
});

// ——— Spectra: pwelch, spectrogram ———
/** (x, window, noverlap, nfft, fs) with MATLAB's defaults: 8 segments overlapping by half, Hamming, nfft ≥ 256. */
function frames(a: Value[], segs: number) {
  const x = vec(a[0], 'The signal');
  let win: number[];
  if (given(a[1])) { const w = vec(a[1], 'The window'); win = w.length === 1 ? F.hammingW(Math.round(w[0])) : w; }
  else win = F.hammingW(Math.max(2, Math.floor(x.length / (segs / 2 + 0.5))));
  const L = win.length, overlap = given(a[2]) ? one(a[2], 'The overlap') : Math.floor(L / 2);
  const nfft = given(a[3]) ? one(a[3], 'nfft') : Math.max(256, 2 ** Math.ceil(Math.log2(L)));
  const fs = given(a[4]) ? one(a[4], 'The sample rate') : null;
  return { x, win, overlap, nfft, fs };
}
def('pwelch', (a, nout, lab) => {
  const { x, win, overlap, nfft, fs } = frames(a, 8), r = wrap(() => F.welch(x, win, overlap, nfft, fs ?? 2 * Math.PI));
  if (nout > 0) return [col(r.pxx), col(r.f)];
  call(lab, 'plot', row(fs ? r.f : r.f.map((f) => f / Math.PI)), row(r.pxx.map((p) => 10 * Math.log10(p || 1e-300))));
  call(lab, 'xlabel', str(xlab(fs))); call(lab, 'ylabel', str(fs ? 'Power/frequency (dB/Hz)' : 'Power/frequency (dB/(rad/sample))')); call(lab, 'grid', str('on')); call(lab, 'title', str('Welch power spectral density'));
  return [];
});
def('spectrogram', (a, nout, lab) => {
  const { x, win, overlap, nfft, fs } = frames(a, 8), F_ = fs ?? 2 * Math.PI, r = wrap(() => F.stft(x, win, overlap, nfft, F_));
  const ps = Array.from(r.re, (v, i) => { const k = i % r.bins; return ((v * v + r.im[i] * r.im[i]) / (F_ * r.U)) * (k === 0 || (nfft % 2 === 0 && k === r.bins - 1) ? 1 : 2); });
  if (nout > 0) return [cmat(r.bins, r.frames, r.re, r.im), col(r.f), row(r.t), mat(r.bins, r.frames, ps)];
  call(lab, 'imagesc', row(fs ? r.t : r.t.map((t) => t * 2 * Math.PI)), row(fs ? r.f : r.f.map((f) => f / Math.PI)), mat(r.bins, r.frames, ps.map((p) => 10 * Math.log10(p || 1e-300))));
  call(lab, 'axis', str('xy')); call(lab, 'colorbar');
  call(lab, 'xlabel', str(fs ? 'Time (s)' : 'Samples')); call(lab, 'ylabel', str(xlab(fs))); call(lab, 'title', str('Spectrogram (dB)'));
  return [];
});
