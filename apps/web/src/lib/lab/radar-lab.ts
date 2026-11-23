import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { cmat, mat, num, str, toMat, type Mat, type Value } from './values';
import * as rd from './radar';
import * as ar from './arrays';

// Hyperion's radar in the language (M429): physconst, pow2db, db2pow, mag2db, db2mag, freq2wavelen, wavelen2freq,
// range2time, time2range, speed2dop, dop2speed, rangeres2bw, bw2rangeres, radareqsnr, radareqrng, radareqpow, chirp,
// lfmpulse, radarecho, pulsecompress, rangedoppler, cfar, ambgfun; M438: steervec, sensorsig, arraypattern,
// spatialspectrum, musicdoa.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
/** Applies f to every element, keeping the shape. */
const each = (v: Value | undefined, f: (x: number) => number, what = 'This') => { const m = toMat(v ?? num(NaN), what); return mat(m.r, m.c, [...m.d].map(f)); };
const n = (v: Value | undefined, d: number) => (v && v.k === 'mat' && v.d.length ? v.d[0] : d);
const speedOfLight = (v: Value | undefined) => n(v, rd.C);

def('physconst', (a) => {
  const k = a[0] ? textOf(a[0]).toLowerCase() : '';
  const v: Record<string, number> = { lightspeed: rd.C, boltzmann: rd.K_BOLTZMANN, earthradius: 6_371_000 };
  if (!(k in v)) throw new LabError("physconst knows 'LightSpeed', 'Boltzmann' and 'EarthRadius'.");
  return [num(v[k])];
});
def('pow2db', (a) => [each(a[0], (x) => 10 * Math.log10(x))]);
def('db2pow', (a) => [each(a[0], (x) => 10 ** (x / 10))]);
def('mag2db', (a) => [each(a[0], (x) => 20 * Math.log10(Math.abs(x)))]);
def('db2mag', (a) => [each(a[0], (x) => 10 ** (x / 20))]);
def('freq2wavelen', (a) => { const c = speedOfLight(a[1]); return [each(a[0], (f) => c / f, 'The frequency')]; });
def('wavelen2freq', (a) => { const c = speedOfLight(a[1]); return [each(a[0], (l) => c / l, 'The wavelength')]; });
def('range2time', (a) => { const c = speedOfLight(a[1]); return [each(a[0], (r) => (2 * r) / c, 'The range')]; });
def('time2range', (a) => { const c = speedOfLight(a[1]); return [each(a[0], (t) => (c * t) / 2, 'The time')]; });
def('speed2dop', (a) => { const l = n(a[1], NaN); if (!(l > 0)) throw new LabError('speed2dop needs the speed and the wavelength.'); return [each(a[0], (v) => v / l)]; });
def('dop2speed', (a) => { const l = n(a[1], NaN); if (!(l > 0)) throw new LabError('dop2speed needs the Doppler shift and the wavelength.'); return [each(a[0], (f) => f * l)]; });
def('rangeres2bw', (a) => { const c = speedOfLight(a[1]); return [each(a[0], (r) => c / (2 * r))]; });
def('bw2rangeres', (a) => { const c = speedOfLight(a[1]); return [each(a[0], (b) => c / (2 * b))]; });

/** 'Gain' (dB, one or [transmit receive]), 'RCS' (m²), 'Ts' (K), 'Loss' (dB). */
function radarParams(a: Value[], from: number): rd.RadarParams {
  const p: rd.RadarParams = { ...rd.DEFAULT_RADAR, gain: [...rd.DEFAULT_RADAR.gain] };
  for (let i = from; i < a.length; i += 2) {
    const k = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '', v = toMat(a[i + 1] ?? num(NaN)).d;
    if (k === 'gain') p.gain = [v[0], v[1] ?? v[0]];
    else if (k === 'rcs') p.rcs = v[0];
    else if (k === 'ts') p.ts = v[0];
    else if (k === 'loss') p.loss = v[0];
    else throw new LabError("The radar equation takes 'Gain' (dB), 'RCS' (m²), 'Ts' (kelvin) and 'Loss' (dB).");
  }
  if (!(p.rcs > 0 && p.ts > 0)) throw new LabError('The RCS and the noise temperature must be positive.');
  return p;
}
const four = (a: Value[], name: string, what: string) => {
  if (a.length < 4) throw new LabError(`${name} needs ${what}.`);
  const v = a.slice(0, 4).map((x) => toMat(x).d[0]);
  if (!(v[0] > 0 && v[3] > 0)) throw new LabError('The wavelength and the pulse width must be positive.');
  return v;
};
def('radareqsnr', (a) => { const [l, , Pt, tau] = four(a, 'radareqsnr', 'the wavelength, the range, the peak power and the pulse width'), p = radarParams(a, 4); return [each(a[1], (r) => rd.radarSnr(l, r, Pt, tau, p))]; });
def('radareqrng', (a) => { const [l, , Pt, tau] = four(a, 'radareqrng', 'the wavelength, the SNR (dB), the peak power and the pulse width'), p = radarParams(a, 4); return [each(a[1], (s) => rd.radarRange(l, s, Pt, tau, p))]; });
def('radareqpow', (a) => { const [l, R, , tau] = four(a, 'radareqpow', 'the wavelength, the range, the SNR (dB) and the pulse width'), p = radarParams(a, 4); return [each(a[2], (s) => rd.radarPower(l, R, s, tau, p))]; });

def('chirp', (a) => {
  const t = toMat(a[0] ?? num(NaN), 'The time'), method = a[4] ? textOf(a[4]).toLowerCase() : 'linear';
  if (method !== 'linear' && method !== 'quadratic' && method !== 'logarithmic') throw new LabError("chirp sweeps 'linear', 'quadratic' or 'logarithmic'.");
  const f0 = n(a[1], 0), t1 = n(a[2], 1), f1 = n(a[3], 100), phi = n(a[5], 0);
  if (method === 'logarithmic' && !(f0 > 0 && f1 > 0)) throw new LabError('A logarithmic chirp needs frequencies above 0.');
  return [mat(t.r, t.c, [...t.d].map((x) => rd.chirp(x, f0, t1, f1, method, phi)))];
});
def('lfmpulse', (a) => {
  const B = n(a[0], NaN), T = n(a[1], NaN), fs = n(a[2], NaN);
  if (!(B > 0 && T > 0 && fs > 0)) throw new LabError('lfmpulse needs the bandwidth (Hz), the pulse width (s) and the sample rate (Hz).');
  if (T * fs > 1e6) throw new LabError('That pulse has over a million samples: lower the sample rate or the width.');
  const [re, im] = rd.lfm(B, T, fs);
  return [cmat(1, re.length, re, im)];
});
const waveOf = (v: Value | undefined): [Float64Array, Float64Array] => {
  const m = toMat(v ?? num(NaN), 'The pulse');
  return [Float64Array.from(m.d), m.im ? Float64Array.from(m.im) : new Float64Array(m.d.length)];
};
def('radarecho', (a) => {
  if (a.length < 6) throw new LabError("radarecho needs the pulse, the sample rate, the PRF, the number of pulses, the carrier frequency and the targets [range speed amplitude]: radarecho(w, fs, prf, 64, 10e9, [2000 15 1], 'SNR', 10).");
  const wave = waveOf(a[0]), fs = n(a[1], NaN), prf = n(a[2], NaN), pulses = Math.round(n(a[3], NaN)), fc = n(a[4], NaN), T = toMat(a[5], 'The targets');
  if (!(fs > 0 && prf > 0 && fc > 0 && pulses >= 1 && pulses <= 4096)) throw new LabError('The sample rate, PRF and carrier must be positive and the pulses 1 to 4096.');
  if (T.c < 2) throw new LabError('Each target is a row [range speed] or [range speed amplitude].');
  if ((fs / prf) * pulses > 4e6) throw new LabError('That data cube is too big (over 4 million samples): fewer pulses or a lower sample rate.');
  const targets = Array.from({ length: T.r }, (_, i) => ({ range: T.d[i], speed: T.d[i + T.r], amp: T.c > 2 ? T.d[i + 2 * T.r] : 1 }));
  let snr = 20;
  for (let i = 6; i + 1 < a.length; i += 2) if (a[i].k === 'str' && /^snr$/i.test((a[i] as { v: string }).v)) snr = toMat(a[i + 1]).d[0];
  const r = rd.echoes(wave, fs, prf, pulses, fc, targets, snr, random);
  return [cmat(r.rows, r.cols, r.re, r.im)];
});
def('pulsecompress', (a) => {
  const X = toMat(a[0] ?? num(NaN), 'The received signal'), wave = waveOf(a[1]), or = new Float64Array(X.r * X.c), oi = new Float64Array(X.r * X.c);
  const re = Float64Array.from(X.d), im = X.im ? Float64Array.from(X.im) : new Float64Array(X.d.length), rows = X.r === 1 ? X.c : X.r, cols = X.r === 1 ? 1 : X.c;
  for (let m = 0; m < cols; m++) { const [yr, yi] = rd.compress(re.subarray(m * rows, (m + 1) * rows), im.subarray(m * rows, (m + 1) * rows), wave); or.set(yr, m * rows); oi.set(yi, m * rows); }
  return [cmat(X.r, X.c, or, oi)];
});
def('rangedoppler', (a, nout, lab) => {
  if (a.length < 5) throw new LabError('rangedoppler needs the echoes, the pulse, the sample rate, the PRF and the carrier frequency.');
  const X = toMat(a[0], 'The echoes'), r = rd.rangeDoppler({ rows: X.r, cols: X.c, re: Float64Array.from(X.d), im: X.im ? Float64Array.from(X.im) : new Float64Array(X.d.length) }, waveOf(a[1]), n(a[2], NaN), n(a[3], NaN), n(a[4], NaN));
  const M: Mat = mat(r.rows, r.cols, r.map);
  if (nout > 0) return [M, mat(r.rows, 1, r.range), row(r.speed)];
  call(lab, 'imagesc', row(r.speed), mat(r.rows, 1, r.range.map((x) => x / 1000)), M);
  call(lab, 'xlabel', str('Speed (m/s, + going away)')); call(lab, 'ylabel', str('Range (km)')); call(lab, 'title', str('Range–Doppler map (dB)')); call(lab, 'colorbar');
  return [];
});
def('cfar', (a) => {
  const X = toMat(a[0] ?? num(NaN), 'The power'), guard = Math.round(n(a[1], 2)), train = Math.round(n(a[2], 10)), pfa = n(a[3], 1e-6);
  if (!(guard >= 0 && train >= 1 && pfa > 0 && pfa < 1)) throw new LabError('cfar(power, guard, train, pfa): guard cells ≥ 0, training cells ≥ 1 a side, 0 < pfa < 1.');
  const rows = X.r === 1 ? X.c : X.r, cols = X.r === 1 ? 1 : X.c, det = mat(X.r, X.c, undefined, true), th = mat(X.r, X.c);
  for (let m = 0; m < cols; m++) { const r = rd.cfar(X.d.subarray(m * rows, (m + 1) * rows), guard, train, pfa); det.d.set(r.detections, m * rows); th.d.set(r.threshold, m * rows); }
  return [det, th];
});
def('ambgfun', (a, nout, lab) => {
  const w = waveOf(a[0]), fs = n(a[1], NaN);
  if (!(fs > 0)) throw new LabError('ambgfun needs the pulse and its sample rate.');
  if (w[0].length > 2048) throw new LabError('ambgfun takes pulses up to 2048 samples.');
  const r = rd.ambiguity(w[0], w[1], fs), M = mat(r.delays.length, r.dopplers.length, r.mag);
  if (nout > 0) return [M, mat(r.delays.length, 1, r.delays), row(r.dopplers)];
  // Shown with delay across and Doppler up, as it's usually drawn.
  const T = mat(r.dopplers.length, r.delays.length);
  for (let i = 0; i < r.delays.length; i++) for (let k = 0; k < r.dopplers.length; k++) T.d[k + i * r.dopplers.length] = r.mag[i + k * r.delays.length];
  call(lab, 'imagesc', row(r.delays.map((t) => t * 1e6)), mat(r.dopplers.length, 1, r.dopplers.map((f) => f / 1e6)), T);
  call(lab, 'axis', str('xy')); call(lab, 'xlabel', str('Delay (µs)')); call(lab, 'ylabel', str('Doppler (MHz)')); call(lab, 'title', str('Ambiguity function')); call(lab, 'colorbar');
  return [];
});

// ——— Antenna arrays (M438) ———
/** Element positions in wavelengths: a row (along y, a line array) or 3 rows [x; y; z]. */
function positions(v: Value | undefined): ar.Pos[] {
  const m = toMat(v ?? num(NaN), 'The positions');
  if (m.r === 1 || m.c === 1) return [...m.d].map((y): ar.Pos => [0, y, 0]);
  if (m.r !== 3) throw new LabError('Positions are a row (a line of elements along y, in wavelengths) or 3 rows [x; y; z].');
  return Array.from({ length: m.c }, (_, j): ar.Pos => [m.d[3 * j], m.d[3 * j + 1], m.d[3 * j + 2]]);
}
/** Angles: a row of azimuths, or 2 rows [azimuth; elevation] (degrees). */
function angles(v: Value | undefined): [number, number][] {
  const m = toMat(v ?? num(0), 'The angles');
  if (m.r === 2) return Array.from({ length: m.c }, (_, j) => [m.d[2 * j], m.d[2 * j + 1]]);
  return [...m.d].map((az) => [az, 0]);
}
const cvecOf = (v: Value | undefined, n: number): ar.CVec => {
  const m = toMat(v ?? num(NaN), 'The weights');
  if (m.d.length !== n) throw new LabError(`One weight per element (${n}).`);
  return { re: [...m.d], im: m.im ? [...m.im] : new Array(n).fill(0) };
};
function cmatOf(v: Value | undefined, what: string): ar.CMat {
  const m = toMat(v ?? num(NaN), what);
  if (m.r !== m.c) throw new LabError(`${what} must be square (N × N).`);
  return { re: Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r])), im: Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => (m.im ? m.im[i + j * m.r] : 0))) };
}
const toCmat = (M: ar.CMat) => { const r = M.re.length, c = M.re[0]?.length ?? 0, re = new Float64Array(r * c), im = new Float64Array(r * c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { re[i + j * r] = M.re[i][j]; im[i + j * r] = M.im[i][j]; } return cmat(r, c, re, im); };
const scan = (v: Value | undefined) => (v ? [...toMat(v).d] : Array.from({ length: 1801 }, (_, i) => -90 + i * 0.1));
def('steervec', (a) => {
  const pos = positions(a[0]), ang = angles(a[1]), N = pos.length, re = new Float64Array(N * ang.length), im = new Float64Array(N * ang.length);
  ang.forEach(([az, el], j) => { const s = ar.steer(pos, az, el); for (let k = 0; k < N; k++) { re[k + j * N] = s.re[k]; im[k + j * N] = s.im[k]; } });
  return [cmat(N, ang.length, re, im)];
});
def('sensorsig', (a) => {
  const pos = positions(a[0]), ns = Math.round(toMat(a[1] ?? num(NaN)).d[0]), ang = angles(a[2]), noise = a[3] ? toMat(a[3]).d[0] : 0;
  if (!(ns >= 1 && ns * pos.length <= 2e6)) throw new LabError('sensorsig(pos, snapshots, angles, noise power): 1 or more snapshots (up to 2 million samples in all).');
  if (!(noise >= 0)) throw new LabError('The noise power must be 0 or more.');
  let power = ang.map(() => 1);
  for (let i = 4; i + 1 < a.length; i += 2) if (a[i].k === 'str' && /^power$/i.test((a[i] as { v: string }).v)) { const p = [...toMat(a[i + 1]).d]; power = ang.map((_, k) => p[Math.min(k, p.length - 1)]); }
  const r = ar.sensorSignals(pos, ns, ang.map(([az, el], k) => ({ az, el, power: power[k] })), noise, random);
  // Rows are snapshots, given conjugated so that X'*X/ns (X' conjugates back) is the covariance E[x·xᴴ].
  return [toCmat({ re: r.X.re, im: r.X.im.map((row_) => row_.map((v) => -v)) }), toCmat(r.R)];
});
def('arraypattern', (a, nout, lab) => {
  const pos = positions(a[0]), w = a[1] && a[1].k === 'mat' && a[1].d.length ? cvecOf(a[1], pos.length) : { re: pos.map(() => 1), im: pos.map(() => 0) }, az = scan(a[2]);
  const db = ar.pattern(pos, w, az);
  if (nout > 0) return [row(db)];
  call(lab, 'plot', row(az), row(db)); call(lab, 'ylim', row([-60, 3])); call(lab, 'xlim', row([az[0], az[az.length - 1]]));
  call(lab, 'xlabel', str('Azimuth (°)')); call(lab, 'ylabel', str('Response (dB)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${pos.length} elements: beam at ${az[db.indexOf(0)].toFixed(1)}°, ${ar.beamwidth(az, db).toFixed(1)}° wide`));
  return [];
});
def('spatialspectrum', (a, nout, lab) => {
  const R = cmatOf(a[0], 'The covariance'), pos = positions(a[1]), az = scan(a[2] && a[2].k === 'mat' ? a[2] : undefined);
  if (R.re.length !== pos.length) throw new LabError('The covariance is N × N for N elements.');
  let method: ar.Method = 'music', k = 1;
  for (let i = a[2] && a[2].k === 'mat' ? 3 : 2; i + 1 < a.length; i += 2) {
    const key = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (key === 'method') { const m = textOf(a[i + 1]).toLowerCase(); if (m !== 'beamscan' && m !== 'mvdr' && m !== 'music') throw new LabError("The method is 'beamscan', 'mvdr' or 'music'."); method = m; }
    else if (key === 'numsignals') k = Math.round(toMat(a[i + 1]).d[0]);
    else throw new LabError("spatialspectrum takes 'Method' and 'NumSignals'.");
  }
  if (!(k >= 1 && k < pos.length)) throw new LabError('The number of signals is 1 to N − 1.');
  let db: number[];
  try { db = ar.spectrum(R, pos, az, method, k); } catch (e) { throw new LabError((e as Error).message); }
  if (nout > 0) return [row(db)];
  call(lab, 'plot', row(az), row(db)); call(lab, 'xlim', row([az[0], az[az.length - 1]]));
  call(lab, 'xlabel', str('Azimuth (°)')); call(lab, 'ylabel', str('Power (dB)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${method === 'music' ? 'MUSIC' : method === 'mvdr' ? 'MVDR (Capon)' : 'Beam scan'}: peaks at ${ar.peaks(az, db, k).map((x) => x.toFixed(1) + '°').join(', ')}`));
  return [];
});
def('musicdoa', (a) => {
  const R = cmatOf(a[0], 'The covariance'), k = Math.round(toMat(a[1] ?? num(1)).d[0]), N = R.re.length;
  let az = scan(undefined), d = 0.5;
  for (let i = 2; i + 1 < a.length; i += 2) {
    const key = a[i].k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (key === 'scanangles') az = scan(a[i + 1]); else if (key === 'elementspacing') d = toMat(a[i + 1]).d[0];
    else throw new LabError("musicdoa takes 'ScanAngles' and 'ElementSpacing' (in wavelengths; a line of elements).");
  }
  if (!(k >= 1 && k < N)) throw new LabError('The number of signals is 1 to N − 1.');
  const pos = ar.ula(N, d);
  return [row(ar.peaks(az, ar.spectrum(R, pos, az, 'music', k), k))];
});

