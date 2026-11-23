import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { cmat, mat, num, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { isTable, table } from './table';
import * as pm from './maint';

// Hyperion's predictive maintenance toolbox in the language (M423): rms, peak2peak, peak2rms, hilbert, envelope,
// envspectrum, bearingFaultBands, findchangepts, cusum, monotonicity, trendability, prognosability, and degradation
// models (exponentialDegradationModel, linearDegradationModel, fit, update, predictRUL) for remaining useful life.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: number[]) => mat(1, v.length, v);
const col = (v: number[]) => mat(v.length, 1, v);
/** A vector's values, or each column of a matrix. */
const columns = (v: Value, what = 'The signal'): number[][] => { const m = toMat(v, what); if (m.im) throw new LabError(`${what} must be real.`); return m.r === 1 || m.c === 1 ? [[...m.d]] : Array.from({ length: m.c }, (_, j) => [...m.d.subarray(j * m.r, (j + 1) * m.r)]); };
const perColumn = (v: Value, f: (x: number[]) => number) => { const m = toMat(v), cs = columns(v); return m.r === 1 || m.c === 1 ? num(f(cs[0])) : row(cs.map(f)); };
const opts = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i + 1 < a.length; i += 2) if (a[i].k === 'str') o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1]); return o; };

def('rms', (a) => [perColumn(a[0], (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length))]);
def('peak2peak', (a) => [perColumn(a[0], (x) => Math.max(...x) - Math.min(...x))]);
def('peak2rms', (a) => [perColumn(a[0], (x) => Math.max(...x.map(Math.abs)) / Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length))]);
def('hilbert', (a) => {
  const m = toMat(a[0], 'The signal'), cs = columns(a[0]), outs = cs.map((x) => pm.analytic(x));
  if (m.r === 1 || m.c === 1) return [cmat(m.r, m.c, outs[0].re, outs[0].im)];
  const re = new Float64Array(m.d.length), im = new Float64Array(m.d.length);
  outs.forEach((o, j) => { re.set(o.re, j * m.r); im.set(o.im, j * m.r); });
  return [cmat(m.r, m.c, re, im)];
});
def('envelope', (a) => {
  const m = toMat(a[0], 'The signal');
  if (!(m.r === 1 || m.c === 1)) throw new LabError('envelope works on one signal (a vector) here.');
  const x = [...m.d], up = pm.envelope(x), mu = x.reduce((s, v) => s + v, 0) / x.length;
  return [mat(m.r, m.c, up), mat(m.r, m.c, up.map((u) => 2 * mu - u))];
});
def('envspectrum', (a, nout, lab) => {
  if (a.length < 2) throw new LabError('envspectrum needs the signal and its sample rate: envspectrum(x, fs).');
  const x = columns(a[0])[0], fs = toMat(a[1]).d[0], r = pm.envspectrum(x, fs);
  if (nout > 0) return [col(r.p), col(r.f)];
  call(lab, 'plot', row(r.f), row(r.p));
  call(lab, 'title', str('Envelope spectrum')); call(lab, 'xlabel', str('Frequency (Hz)')); call(lab, 'ylabel', str('Peak amplitude')); call(lab, 'grid', str('on'));
  return [];
});
def('bearingFaultBands', (a) => {
  if (a.length < 4) throw new LabError('bearingFaultBands needs the shaft speed (Hz), the number of balls, the ball and pitch diameters (and the contact angle in degrees).');
  const [fr, nb, db, dp] = a.slice(0, 4).map((v) => toMat(v).d[0]), beta = a[4] && a[4].k === 'mat' ? a[4].d[0] : 0;
  if (!(fr > 0 && nb >= 1 && db > 0 && dp > db)) throw new LabError('The speed and sizes must be positive, with the pitch diameter larger than the ball.');
  const f = pm.bearingFrequencies(fr, nb, db, dp, beta), centres = [f.BPFO, f.BPFI, f.FTF, f.BSF], half = 0.05;
  const FB = mat(4, 2);
  centres.forEach((c, i) => { FB.d[i] = c * (1 - half); FB.d[i + 4] = c * (1 + half); });
  return [FB, { k: 'struct', f: new Map<string, Value>([['Centers', col(centres)], ['Labels', { k: 'cell', r: 4, c: 1, d: ['BPFO (outer race)', 'BPFI (inner race)', 'FTF (cage)', 'BSF (ball spin)'].map(str) } satisfies Cell], ['BPFO', num(f.BPFO)], ['BPFI', num(f.BPFI)], ['FTF', num(f.FTF)], ['BSF', num(f.BSF)]]) } satisfies Struct];
});
def('findchangepts', (a, nout, lab) => {
  const x = columns(a[0])[0], o = opts(a, 1), stat = (o.get('statistic') ? textOf(o.get('statistic')!).toLowerCase() : 'mean') as pm.Stat;
  if (!['mean', 'rms', 'std', 'linear'].includes(stat)) throw new LabError("Statistic is 'mean', 'rms', 'std' or 'linear'.");
  const max = o.get('maxnumchanges') ? Math.round(toMat(o.get('maxnumchanges')!).d[0]) : undefined, penalty = o.get('minthreshold') ? toMat(o.get('minthreshold')!).d[0] : undefined;
  if (penalty === undefined && x.length ** 2 * (max ?? 1) > 2e8) throw new LabError("That's a long signal for an exact search over so many changes: give 'MinThreshold' (the least a change must lower the cost) instead.");
  if (penalty !== undefined && x.length > 20_000) throw new LabError('findchangepts here looks at signals up to 20,000 samples.');
  const ipt = pm.changePoints(x, { stat, max, penalty, minDistance: o.get('mindistance') ? Math.round(toMat(o.get('mindistance')!).d[0]) : undefined });
  if (nout > 0) return [col(ipt.map((i) => i + 1))];
  // Drawn: the signal, a line at each change, each segment's level.
  const edges = [0, ...ipt, x.length], level: number[] = [];
  for (let s = 0; s + 1 < edges.length; s++) { const seg = x.slice(edges[s], edges[s + 1]), m = seg.reduce((p, v) => p + v, 0) / seg.length; for (let k = edges[s]; k < edges[s + 1]; k++) level[k] = m; }
  call(lab, 'plot', row(x.map((_, k) => k + 1)), row(x));
  call(lab, 'hold', str('on'));
  if (stat === 'mean') call(lab, 'plot', row(x.map((_, k) => k + 1)), row(level), str('LineWidth'), num(2));
  for (const i of ipt) call(lab, 'xline', num(i + 0.5), str('--'));
  call(lab, 'hold', str('off'));
  call(lab, 'title', str(`Number of changes found: ${ipt.length}`));
  return [];
});
def('cusum', (a, nout, lab) => {
  const x = columns(a[0])[0], n = (i: number, d?: number) => (a[i] && !(a[i].k === 'mat' && !(a[i] as Mat).d.length) ? toMat(a[i]).d[0] : d);
  const r = pm.cusum(x, n(1, 5), n(2, 1), n(3), n(4));
  const at = (i: number) => (i < 0 ? mat(0, 0) : num(i + 1));
  if (nout > 0) return [at(r.iupper), at(r.ilower), row(r.upper), row(r.lower)];
  const t = row(x.map((_, k) => k + 1)), lim = (n(1, 5) ?? 5) * r.sd;
  call(lab, 'plot', t, row(r.upper), t, row(r.lower));
  call(lab, 'yline', num(lim), str('--')); call(lab, 'yline', num(-lim), str('--'));
  call(lab, 'legend', str('Upper sum'), str('Lower sum'));
  call(lab, 'title', str(r.iupper >= 0 || r.ilower >= 0 ? `Drift found at sample ${Math.min(...[r.iupper, r.ilower].filter((v) => v >= 0)) + 1}` : 'No drift found'));
  return [];
});
/** Members as lists: a cell of vectors, or a matrix with a column per member. */
const members = (v: Value): number[][] => (v.k === 'cell' ? v.d.map((m) => [...toMat(m, 'A member').d]) : columns(v));
def('monotonicity', (a) => [num(pm.monotonicity(members(a[0])))]);
def('trendability', (a) => { const m = members(a[0]); if (m.length < 2) throw new LabError('trendability compares at least two members.'); return [num(pm.trendability(m))]; });
def('prognosability', (a) => { const m = members(a[0]); if (m.length < 2) throw new LabError('prognosability compares at least two members.'); return [num(pm.prognosability(m))]; });

// ——— Degradation models ———
const KINDS = { exponentialDegradationModel: 'exponential', linearDegradationModel: 'linear' } as const;
type ModelName = keyof typeof KINDS;
const isDegradation = (v: Value | undefined): v is Struct => !!v && v.k === 'struct' && !!v.f.get('Type') && textOf(v.f.get('Type')!) in KINDS;
for (const name of Object.keys(KINDS) as ModelName[]) {
  def(name, (a) => {
    const o = opts(a, 0);
    return [{ k: 'struct', f: new Map<string, Value>([['Type', str(name)], ['Phi', num(o.get('phi') ? toMat(o.get('phi')!).d[0] : 0)], ['LifeTimeVariable', o.get('lifetimevariable') ?? str('Time')], ['DataVariables', o.get('datavariables') ?? str('Value')], ['Fitted', mat(1, 1, [0], true)]]) } satisfies Struct];
  });
}
const modelOf = (m: Struct): pm.Degradation => {
  if (!toMat(m.f.get('Fitted')!).d[0]) throw new LabError('Fit the model to past machines first: mdl = fit(mdl, data).');
  const M = toMat(m.f.get('Mean')!).d, C = toMat(m.f.get('Covariance')!).d;
  return { kind: KINDS[textOf(m.f.get('Type')!) as ModelName], phi: toMat(m.f.get('Phi')!).d[0], mean: [M[0], M[1]], cov: [[C[0], C[2]], [C[1], C[3]]], noise: toMat(m.f.get('NoiseVariance')!).d[0], time: toMat(m.f.get('CurrentTime') ?? num(0)).d[0] };
};
const withModel = (m: Struct, d: pm.Degradation): Struct => {
  const f = new Map(m.f);
  f.set('Fitted', mat(1, 1, [1], true)); f.set('Mean', row(d.mean)); f.set('Covariance', mat(2, 2, [d.cov[0][0], d.cov[1][0], d.cov[0][1], d.cov[1][1]])); f.set('NoiseVariance', num(d.noise)); f.set('CurrentTime', num(d.time));
  // The usual names too: the slope and intercept of log(level − Phi) (exponential) or of the level (linear).
  f.set('Theta', num(d.kind === 'exponential' ? Math.exp(d.mean[0]) : d.mean[0])); f.set('Beta', num(d.mean[1]));
  return { k: 'struct', f };
};
/** One machine's history as times and values: an n × 2 matrix [t y], or a table with the model's two columns. */
function history(m: Struct, v: Value): { t: number[]; y: number[] } {
  if (isTable(v)) {
    const tn = textOf(m.f.get('LifeTimeVariable')!), yn = textOf(m.f.get('DataVariables')!), t = v.f.get(tn), y = v.f.get(yn);
    if (!t || !y) throw new LabError(`The table needs the columns “${tn}” and “${yn}” (or set 'LifeTimeVariable' and 'DataVariables').`);
    return { t: [...toMat(t).d], y: [...toMat(y).d] };
  }
  const x = toMat(v, 'A history');
  if (x.c !== 2) throw new LabError('A history is a matrix with two columns, [time value], or a table.');
  return { t: [...x.d.subarray(0, x.r)], y: [...x.d.subarray(x.r)] };
}
const otherFit = BUILTINS.fit;
def('fit', (a, nout, lab) => {
  if (!isDegradation(a[0])) { if (otherFit) return otherFit(a, nout, lab); throw new LabError('fit here learns degradation models: fit(exponentialDegradationModel, data). For curves use polyfit or lsqcurvefit.'); }
  if (!a[1] || a[1].k !== 'cell') throw new LabError('fit needs the past machines’ histories in a cell: fit(mdl, {[t1 y1], [t2 y2], …}).');
  const m = a[0], kind = KINDS[textOf(m.f.get('Type')!) as ModelName];
  try { return [withModel(m, pm.fitDegradation(kind, a[1].d.map((v) => history(m, v)), toMat(m.f.get('Phi')!).d[0]))]; } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); }
});
def('update', (a) => {
  if (!isDegradation(a[0]) || !a[1]) throw new LabError('update needs a fitted degradation model and the machine’s readings: update(mdl, [t y]).');
  const h = history(a[0], a[1]);
  try { return [withModel(a[0], pm.updateDegradation(modelOf(a[0]), h.t, h.y))]; } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); }
});
def('predictRUL', (a, nout, lab) => {
  if (!isDegradation(a[0]) || a.length < 2) throw new LabError('predictRUL needs a degradation model and the failure threshold: predictRUL(mdl, threshold), or predictRUL(mdl, readings, threshold).');
  let d = modelOf(a[0]);
  const threshold = toMat(a[a.length - 1], 'The threshold').d[0];
  try {
    if (a.length >= 3) { const h = history(a[0], a[1]); d = pm.updateDegradation(d, h.t, h.y); }
    const r = pm.remainingLife(d, threshold, random);
    if (nout === 0) { lab.host.out(`Remaining useful life: ${+r.rul.toPrecision(4)} (90% between ${+r.ci[0].toPrecision(4)} and ${+r.ci[1].toPrecision(4)})\n`); return []; }
    // The spread of possible lives as a table of times and probabilities (40 bins).
    const finite = r.draws.filter(Number.isFinite), lo = finite[0] ?? 0, hi = finite[finite.length - 1] ?? 1, w = (hi - lo) / 40 || 1, counts = new Array(40).fill(0);
    for (const v of finite) counts[Math.min(39, Math.floor((v - lo) / w))]++;
    const pdf = table([['Time', col(counts.map((_, i) => lo + (i + 0.5) * w))], ['Probability', col(counts.map((c) => c / r.draws.length))]]);
    return [num(r.rul), row(r.ci), pdf];
  } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); }
});
