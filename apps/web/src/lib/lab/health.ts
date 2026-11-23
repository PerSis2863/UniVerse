import * as pm from './maint';
import { dft } from './fft';
import { spectralKurtosis } from './vib';
import { FEATURES } from './health-meta';

export { FEATURES, healthScript, type FeatureDef } from './health-meta';

// Hyperion Learn → Machine health (M465, the owner, 23 Nov: "a point-and-click maintenance window"): the engine of a
// diagnostic feature designer. A fleet of vibration recordings (bearings run until they fail, a pump's kinds of fault,
// or the person's own files), features computed from each (time and frequency), the features ranked (how well they
// track wear, or how well they tell the faults apart), and a remaining-life test on a machine the model never saw.

export type Rand = () => number;
export const seeded = (s: number): Rand => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
const gauss = (r: Rand) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

export interface Recording { machine: number; t: number; label: number; x: Float64Array; name: string }
export interface Fleet {
  name: string;
  /** 'life': machines recorded until they failed (t in days); 'faults': recordings of known kinds (label). */
  kind: 'life' | 'faults';
  fs: number; fr: number;
  bearing: { nb: number; db: number; dp: number } | null;
  classes: string[]; machines: string[]; recs: Recording[];
}

const BEARING = { nb: 9, db: 7.94, dp: 39.04 };
/** Decaying rings at a structure's resonance, one per impact (a damaged race's ball passes). */
function impacts(x: Float64Array, fs: number, rate: number, amp: number, r: Rand, ring = 3000, tau = 0.0015) {
  const len = Math.round(tau * 6 * fs);
  for (let t0 = r() / rate; t0 * fs < x.length; t0 += (1 + 0.01 * gauss(r)) / rate) {
    const s = Math.round(t0 * fs), a = amp * (0.8 + 0.4 * r());
    for (let k = 0; k < len && s + k < x.length; k++) x[s + k] += a * Math.exp(-k / fs / tau) * Math.sin((2 * Math.PI * ring * k) / fs);
  }
}

/** Bearings run to failure: each machine recorded every 2 days; an outer-race fault grows exponentially until it fails. */
export function lifeFleet(seed = 1, machines = 8): Fleet {
  const r = seeded(seed), fs = 10_000, n = 4096, fr = 25, bpfo = pm.bearingFrequencies(fr, BEARING.nb, BEARING.db, BEARING.dp).BPFO, recs: Recording[] = [];
  for (let m = 0; m < machines; m++) {
    const life = Math.round(36 + 24 * r()), a0 = 0.08 * (1 + 0.3 * Math.abs(gauss(r))), aEnd = 1.4 * (1 + 0.08 * gauss(r)), b = Math.log(aEnd / a0) / life;
    for (let t = 0; t <= life; t += 2) {
      const x = new Float64Array(n), ph = 2 * Math.PI * r(), noise = 0.25 * (1 + (0.1 * t) / life);
      for (let k = 0; k < n; k++) { const s = k / fs; x[k] = 0.5 * Math.sin(2 * Math.PI * fr * s + ph) + 0.15 * Math.sin(4 * Math.PI * fr * s + 2 * ph) + noise * gauss(r); }
      impacts(x, fs, bpfo, a0 * Math.exp(b * t), r);
      recs.push({ machine: m, t, label: 0, x, name: `Machine ${m + 1}, day ${t}` });
    }
  }
  return { name: 'Bearings run until they fail', kind: 'life', fs, fr, bearing: BEARING, classes: ['Running'], machines: Array.from({ length: machines }, (_, m) => `Machine ${m + 1}`), recs };
}

export const FAULTS = ['Healthy', 'Imbalance', 'Misalignment', 'Bearing fault'];
/** A pump's recordings of known kinds: healthy, out of balance (1× speed), misaligned (2× and 3×), a damaged bearing. */
export function faultFleet(seed = 1, perClass = 20): Fleet {
  const r = seeded(seed), fs = 10_000, n = 4096, recs: Recording[] = [];
  for (let c = 0; c < FAULTS.length; c++) for (let i = 0; i < perClass; i++) {
    const fr = 24 + 2 * r(), x = new Float64Array(n), ph = 2 * Math.PI * r();
    const a1 = c === 1 ? 1.2 + 0.8 * r() : 0.5 + 0.2 * r(), a2 = c === 2 ? 0.8 + 0.6 * r() : 0.12 + 0.08 * r(), a3 = c === 2 ? 0.25 + 0.2 * r() : 0.03;
    for (let k = 0; k < n; k++) { const s = k / fs; x[k] = a1 * Math.sin(2 * Math.PI * fr * s + ph) + a2 * Math.sin(4 * Math.PI * fr * s + 1.3 * ph) + a3 * Math.sin(6 * Math.PI * fr * s) + 0.3 * gauss(r); }
    if (c === 3) impacts(x, fs, pm.bearingFrequencies(fr, BEARING.nb, BEARING.db, BEARING.dp).BPFO, 0.5 + 0.7 * r(), r);
    recs.push({ machine: c, t: i, label: c, x, name: `${FAULTS[c]} ${i + 1}` });
  }
  return { name: 'A pump’s kinds of fault', kind: 'faults', fs, fr: 25, bearing: BEARING, classes: FAULTS, machines: FAULTS, recs };
}

/** The person's own recordings: one file each (its first numbers), grouped by the name before the first _ or -. */
export function fileFleet(files: { name: string; text: string }[], fs: number, fr: number): Fleet {
  if (!(fs > 0)) throw new Error('Give the sample rate (samples a second) the files were recorded at.');
  const recs: Recording[] = [], classes: string[] = [];
  for (const f of files.slice(0, 400)) {
    const nums: number[] = [];
    for (const line of f.text.split(/\r?\n/)) {
      const v = Number(line.split(/[,;\t ]+/).find((c) => c.trim() !== '') ?? NaN);
      if (Number.isFinite(v)) nums.push(v);
      if (nums.length >= 1 << 16) break;
    }
    if (nums.length < 256) throw new Error(`${f.name} has ${nums.length} numbers: a recording needs at least 256.`);
    const base = f.name.replace(/\.[^.]+$/, ''), label = (base.split(/[_-]/)[0] || base).trim();
    if (!classes.includes(label)) classes.push(label);
    recs.push({ machine: classes.indexOf(label), t: recs.filter((q) => q.label === classes.indexOf(label)).length, label: classes.indexOf(label), x: Float64Array.from(nums), name: base });
  }
  if (!recs.length) throw new Error('Choose at least one recording.');
  return { name: 'Your recordings', kind: 'faults', fs, fr: fr > 0 ? fr : 0, bearing: null, classes, machines: classes, recs };
}

// ——— Features (their list and the matching script are in health-meta.ts, light enough for the page) ———
export const featuresFor = (f: Pick<Fleet, 'fr' | 'bearing'>) => FEATURES.filter((d) => !d.needs || (d.needs === 'speed' ? f.fr > 0 : !!f.bearing && f.fr > 0));

/** A Hann-windowed one-sided amplitude spectrum (peak amplitudes), at fs·k/N. */
export function spectrum(x: ArrayLike<number>, fs: number) {
  const N = x.length, w = Array.from({ length: N }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N)), sw = w.reduce((s, v) => s + v, 0);
  let m = 0; for (let k = 0; k < N; k++) m += x[k]; m /= N;
  const [re, im] = dft(w.map((v, k) => v * (x[k] - m)), new Array(N).fill(0)), half = Math.floor(N / 2) + 1;
  const a = Float64Array.from({ length: half }, (_, k) => ((k && k < N / 2 ? 2 : 1) * Math.hypot(re[k], im[k])) / sw);
  return { a, f: Float64Array.from(a, (_, k) => (k * fs) / N) };
}
/** The largest value within ±tol (Hz) of f. */
const near = (s: { a: Float64Array; f: Float64Array }, f: number, tol: number) => { let best = 0; for (let k = 0; k < s.f.length; k++) if (Math.abs(s.f[k] - f) <= tol && s.a[k] > best) best = s.a[k]; return best; };

export function featureValues(x: Float64Array, fs: number, fr: number, bearing: Fleet['bearing'], ids: string[]): number[] {
  const n = x.length;
  let sum = 0, sq = 0, absSum = 0, sqrtSum = 0, mx = -Infinity, mn = Infinity;
  for (let k = 0; k < n; k++) { const v = x[k]; sum += v; sq += v * v; absSum += Math.abs(v); sqrtSum += Math.sqrt(Math.abs(v)); if (v > mx) mx = v; if (v < mn) mn = v; }
  const mean = sum / n, rms = Math.sqrt(sq / n), peak = Math.max(Math.abs(mx), Math.abs(mn)), meanAbs = absSum / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (let k = 0; k < n; k++) { const d = x[k] - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const wantSpec = ids.some((id) => ['centroid', 'dominant', 'a1', 'a2', 'a3'].includes(id)), spec = wantSpec ? spectrum(x, fs) : null;
  const env = ids.some((id) => id === 'bpfo' || id === 'bpfi') && bearing && fr > 0 ? pm.envspectrum([...x], fs) : null;
  const bf = bearing && fr > 0 ? pm.bearingFrequencies(fr, bearing.nb, bearing.db, bearing.dp) : null;
  const tol = (fs / n) * 2;
  return ids.map((id) => {
    switch (id) {
      case 'rms': return rms;
      case 'std': return Math.sqrt(m2);
      case 'mean': return mean;
      case 'peak': return peak;
      case 'p2p': return mx - mn;
      case 'crest': return rms ? peak / rms : 0;
      case 'kurt': return m2 ? m4 / (m2 * m2) : 0;
      case 'skew': return m2 ? m3 / m2 ** 1.5 : 0;
      case 'shape': return meanAbs ? rms / meanAbs : 0;
      case 'impulse': return meanAbs ? peak / meanAbs : 0;
      case 'clearance': return sqrtSum ? peak / (sqrtSum / n) ** 2 : 0;
      case 'centroid': { let a = 0, af = 0; spec!.a.forEach((v, k) => { a += v; af += v * spec!.f[k]; }); return a ? af / a : 0; }
      case 'dominant': { let k0 = 1; for (let k = 1; k < spec!.a.length; k++) if (spec!.a[k] > spec!.a[k0]) k0 = k; return spec!.f[k0]; }
      case 'a1': case 'a2': case 'a3': return near(spec!, fr * Number(id[1]), Math.max(tol, fr * 0.06));
      case 'bpfo': case 'bpfi': { if (!env || !bf) return 0; const target = id === 'bpfo' ? bf.BPFO : bf.BPFI; let best = 0; env.f.forEach((f, k) => { if (Math.abs(f - target) <= Math.max(tol, target * 0.03) && env.p[k] > best) best = env.p[k]; }); return best; }
      case 'skmax': { const sk = spectralKurtosis([...x], fs, Math.min(128, 1 << Math.floor(Math.log2(n / 4)))).sk; return Math.max(...sk); }
      default: return NaN;
    }
  });
}

/** Every recording's features: a row each, columns in `ids` order. */
export const featureTable = (fleet: Fleet, ids: string[]) => fleet.recs.map((r) => featureValues(r.x, fleet.fs, fleet.fr, fleet.bearing, ids));

// ——— Ranking ———
export interface Rank { id: string; score: number; parts: Record<string, number> }
/** Each machine's values in time order. */
export function members(fleet: Fleet, table: number[][], j: number) {
  return fleet.machines.map((_, m) => fleet.recs.map((r, i) => ({ r, v: table[i][j] })).filter((q) => q.r.machine === m).sort((a, b) => a.r.t - b.r.t));
}
/**
 * 'life': monotonicity, trendability and prognosability (each 0–1) and their mean; 'faults': η² from the one-way analysis
 * of variance (the share of the spread between the kinds' averages; its F kept in parts).
 */
export function rank(fleet: Fleet, table: number[][], ids: string[]): Rank[] {
  let out: Rank[];
  if (fleet.kind === 'life') {
    out = ids.map((id, j) => {
      const ms = members(fleet, table, j).map((m) => m.map((q) => q.v)).filter((m) => m.length > 1);
      const mono = pm.monotonicity(ms), trend = pm.trendability(ms), prog = pm.prognosability(ms);
      const parts = { Monotonicity: mono, Trendability: trend, Prognosability: Number.isFinite(prog) ? prog : 0 };
      return { id, score: (parts.Monotonicity + parts.Trendability + parts.Prognosability) / 3, parts };
    });
  } else {
    const K = fleet.classes.length, N = table.length;
    out = ids.map((id, j) => {
      if (K < 2) return { id, score: 0, parts: { F: 0 } };
      const all = table.map((row) => row[j]), grand = all.reduce((s, v) => s + v, 0) / N;
      let between = 0, within = 0;
      for (let c = 0; c < K; c++) {
        const v = fleet.recs.flatMap((r, i) => (r.label === c ? [all[i]] : [])), m = v.reduce((s, x) => s + x, 0) / (v.length || 1);
        between += v.length * (m - grand) ** 2; within += v.reduce((s, x) => s + (x - m) ** 2, 0);
      }
      const F = within > 0 ? between / (K - 1) / (within / Math.max(1, N - K)) : between > 0 ? Infinity : 0;
      // η²: the share of the feature's spread that the kind explains (0 to 1).
      return { id, score: between + within > 0 ? between / (between + within) : 0, parts: { F } };
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ——— Remaining life, tested on one machine ———
export interface LifeTest { t: number[]; truth: number[]; rul: number[]; lo: number[]; hi: number[]; threshold: number; phi: number; error: number; life: number }
/**
 * An exponential degradation model learnt from every machine but `test` on feature column j, then updated with the test
 * machine's readings one at a time: the predicted remaining life at each against the truth (its last day − now).
 */
export function lifeTest(fleet: Fleet, table: number[][], j: number, test: number, seed = 7): LifeTest {
  const ms = members(fleet, table, j), train = ms.filter((_, m) => m !== test).map((m) => ({ t: m.map((q) => q.r.t), y: m.map((q) => q.v) }));
  const mine = ms[test];
  if (!mine || mine.length < 4 || train.length < 2) throw new Error('The test needs one machine with at least 4 recordings and two others to learn from.');
  const all = ms.flat().map((q) => q.v), lo = Math.min(...all), hi = Math.max(...all), phi = lo - 0.01 * (hi - lo || Math.abs(lo) || 1);
  // Falling features are turned around so wear always means a rising value.
  const rising = train.reduce((s, m) => s + (m.y[m.y.length - 1] - m.y[0]), 0) >= 0;
  const flip = (v: number) => (rising ? v : hi + lo - v);
  const trainF = train.map((m) => ({ t: m.t, y: m.y.map(flip) })), threshold = trainF.reduce((s, m) => s + m.y[m.y.length - 1], 0) / trainF.length;
  const prior = pm.fitDegradation('exponential', trainF, phi), rand = seeded(seed), life = mine[mine.length - 1].r.t;
  const out: LifeTest = { t: [], truth: [], rul: [], lo: [], hi: [], threshold: rising ? threshold : hi + lo - threshold, phi, error: 0, life };
  let errSum = 0;
  for (let k = 2; k < mine.length; k++) {
    const seen = mine.slice(0, k + 1), now = seen[seen.length - 1].r.t;
    const d = pm.updateDegradation(prior, seen.map((q) => q.r.t), seen.map((q) => flip(q.v)));
    const r = pm.remainingLife(d, threshold, rand, now);
    out.t.push(now); out.truth.push(life - now); out.rul.push(Math.min(r.rul, life * 3)); out.lo.push(Math.min(r.ci[0], life * 3)); out.hi.push(Math.min(r.ci[1], life * 3));
    errSum += Math.abs(Math.min(r.rul, life * 3) - (life - now));
  }
  out.error = errSum / Math.max(1, out.t.length);
  return out;
}
