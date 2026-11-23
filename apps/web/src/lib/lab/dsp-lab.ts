import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, str, toMat, type Mat, type Value } from './values';
import * as dsp from './dsp';

// Hyperion's language for M475: findpeaks, svd, butter, filtfilt, lowpass, highpass, bandpass.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: number[]) => mat(1, v.length, v);
const col = (v: number[]) => mat(v.length, 1, v);
const vec = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} is missing.`); const m = toMat(v, what); if (m.im) throw new LabError(`${what} must be real.`); return [...m.d]; };
const shaped = (like: Mat, v: number[]) => (like.r === 1 ? row(v) : col(v));
const opts = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i + 1 < a.length; i += 2) if (a[i].k === 'str') o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1]); return o; };
const fail = (e: unknown): never => { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); };

def('findpeaks', (a, nout, lab) => {
  if (!a.length) throw new LabError('findpeaks needs a signal: [pks, locs] = findpeaks(y).');
  const ym = toMat(a[0], 'The signal'), y = vec(a[0], 'The signal');
  const hasX = a[1] && a[1].k === 'mat' && (a[1] as Mat).d.length === y.length && y.length > 1;
  const x = hasX ? vec(a[1], 'x') : y.map((_, i) => i + 1), o = opts(a, hasX ? 2 : 1), n = (k: string) => (o.get(k) ? toMat(o.get(k)!).d[0] : undefined);
  const sort = o.get('sortstr') ? textOf(o.get('sortstr')!).toLowerCase() : 'none';
  // MinPeakDistance is in x's units: turned into samples by the mean spacing.
  const dx = x.length > 1 ? (x[x.length - 1] - x[0]) / (x.length - 1) : 1, md = n('minpeakdistance');
  const p = dsp.findPeaks(y, { minHeight: n('minpeakheight'), minProminence: n('minpeakprominence'), threshold: n('threshold'), minDistance: md !== undefined ? md / Math.abs(dx || 1) : undefined, nPeaks: n('npeaks'), sort: sort === 'ascend' || sort === 'descend' ? sort : 'none' });
  if (nout === 0) {
    call(lab, 'plot', row(x), row(y)); call(lab, 'hold', str('on'));
    call(lab, 'plot', row(p.map((q) => x[q.i])), row(p.map((q) => q.h)), str('v'));
    call(lab, 'hold', str('off')); call(lab, 'title', str(`${p.length} peak${p.length === 1 ? '' : 's'}`));
    return [];
  }
  // [pks, locs, widths, prominences]: widths aren't measured here (0), prominences are.
  return [shaped(ym, p.map((q) => q.h)), shaped(ym, p.map((q) => x[q.i])), shaped(ym, p.map(() => 0)), shaped(ym, p.map((q) => q.p))];
});

def('svd', (a, nout) => {
  const m = toMat(a[0], 'The matrix');
  if (m.im) throw new LabError('svd here works on real matrices.');
  if (m.r === 0 || m.c === 0) return nout > 1 ? [mat(0, 0), mat(0, 0), mat(0, 0)] : [mat(0, 1)];
  const A = Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]));
  const r = dsp.svd(A), econ = a[1] && ((a[1].k === 'str' && /^econ$/i.test(a[1].v)) || (a[1].k === 'mat' && (a[1] as Mat).d[0] === 0));
  if (nout <= 1) return [col(r.S)];
  const k = Math.min(m.r, m.c), uc = econ ? k : m.r, vc = econ ? k : m.c;
  const U = mat(m.r, uc), S = mat(econ ? k : m.r, vc), V = mat(m.c, vc);
  for (let i = 0; i < m.r; i++) for (let j = 0; j < uc; j++) U.d[i + j * m.r] = r.U[i][j] ?? 0;
  for (let j = 0; j < k; j++) S.d[j + j * S.r] = r.S[j];
  for (let i = 0; i < m.c; i++) for (let j = 0; j < vc; j++) V.d[i + j * m.c] = r.V[i][j] ?? 0;
  return [U, S, V];
});

def('butter', (a) => {
  if (a.length < 2) throw new LabError("butter needs the order and the cut-off (a fraction of Nyquist): [b, a] = butter(4, 0.2) or butter(4, 0.2, 'high').");
  const n = toMat(a[0], 'The order').d[0], Wn = vec(a[1], 'The cut-off');
  const t = a[2] && a[2].k === 'str' ? a[2].v.toLowerCase() : Wn.length === 2 ? 'bandpass' : 'low';
  const type = t === 'high' ? 'high' : t === 'stop' || t === 'bandstop' ? 'stop' : t === 'bandpass' ? 'bandpass' : t === 'low' ? 'low' : null;
  if (!type) throw new LabError("The type is 'low', 'high', 'bandpass' or 'stop'.");
  try { const f = dsp.butter(n, Wn, type); return [row(f.b), row(f.a)]; } catch (e) { return fail(e); }
});

def('filtfilt', (a) => {
  if (a.length < 3) throw new LabError('filtfilt needs b, a and the signal: y = filtfilt(b, a, x).');
  const xm = toMat(a[2], 'The signal');
  try { return [shaped(xm, dsp.filtfilt(vec(a[0], 'b'), vec(a[1], 'a'), vec(a[2], 'The signal')))]; } catch (e) { return fail(e); }
});

/** lowpass, highpass, bandpass: an order-8 Butterworth (4 per edge of a band) run both ways, so nothing is delayed. */
for (const [name, type] of [['lowpass', 'low'], ['highpass', 'high'], ['bandpass', 'bandpass']] as const) {
  def(name, (a, nout, lab) => {
    if (a.length < 2) throw new LabError(`${name} needs the signal and the ${type === 'bandpass' ? 'band [f1 f2]' : 'cut-off'}: ${name}(x, ${type === 'bandpass' ? '[f1 f2]' : 'fpass'}, fs) (or as a fraction of Nyquist without fs).`);
    const xm = toMat(a[0], 'The signal'), x = vec(a[0], 'The signal'), f = vec(a[1], 'The cut-off'), fs = a[2] && a[2].k === 'mat' ? toMat(a[2]).d[0] : 2;
    try {
      const flt = dsp.butter(type === 'bandpass' ? 4 : 8, f.map((v) => v / (fs / 2)), type), y = dsp.filtfilt(flt.b, flt.a, x);
      if (nout === 0) {
        const t = x.map((_, i) => (a[2] ? i / fs : i + 1));
        call(lab, 'plot', row(t), row(x), row(t), row(y)); call(lab, 'legend', str('original'), str('filtered'));
        call(lab, 'title', str(`${name === 'lowpass' ? 'Low-pass' : name === 'highpass' ? 'High-pass' : 'Band-pass'} filtered`));
        return [];
      }
      return [shaped(xm, y), { k: 'struct', f: new Map<string, Value>([['b', row(flt.b)], ['a', row(flt.a)]]) }];
    } catch (e) { return fail(e); }
  });
}
