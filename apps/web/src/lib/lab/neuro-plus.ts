// Hyperion's neuroscience, the left-outs of M496 (M514): a neuron with length (a cable of compartments, passive or
// with Hodgkin–Huxley channels, so a spike travels and its speed can be measured), synapses whose conductance has its
// own time course (exponential, alpha, dual exponential), spike-timing-dependent plasticity in Song, Miller and
// Abbott's neuron (2000: competition between a thousand inputs), and spike sorting from a recording (threshold by the
// median noise estimate, as Quiroga et al. 2004; aligned waveforms, principal components, k-means). Times in ms unless
// said; pure, with randomness passed in.
import { HH, hhRest, type Rand } from './neuro';
import { kmeans, pca } from './ml';

// ——— The cable ———
export interface CableOpts {
  length: number; diam: number; n: number; Ri: number; Cm: number; Rm: number; active: boolean;
  I: number; at: number; start: number; stop: number; T: number; dt: number; rest: number; celsius: number;
}
export const CABLE: CableOpts = { length: 1000, diam: 2, n: 101, Ri: 100, Cm: 1, Rm: 1 / 0.3e-3, active: false, I: 0.1, at: 0, start: 0, stop: Infinity, T: 50, dt: 0.01, rest: -65, celsius: 6.3 };

const gates = (V: number, phi = 1) => {
  const am = Math.abs(V + 40) < 1e-7 ? 1 : (0.1 * (V + 40)) / (1 - Math.exp(-(V + 40) / 10)), bm = 4 * Math.exp(-(V + 65) / 18);
  const ah = 0.07 * Math.exp(-(V + 65) / 20), bh = 1 / (1 + Math.exp(-(V + 35) / 10));
  const an = Math.abs(V + 55) < 1e-7 ? 0.1 : (0.01 * (V + 55)) / (1 - Math.exp(-(V + 55) / 10)), bn = 0.125 * Math.exp(-(V + 65) / 80);
  return [am, bm, ah, bh, an, bn].map((r) => r * phi);
};

/** A cable of n compartments (lengths and diameter in µm, Ri in Ω·cm, Rm in Ω·cm², Cm in µF/cm²), sealed ends, a
 * current of I nA into compartment `at` (0-based) from start to stop ms. The channels are stepped by exponential Euler
 * and the voltages by backward Euler along the cable (a tridiagonal solve each step, as NEURON does). Active: the
 * squid axon's HH channels everywhere (Rm is then HH's leak), their rates scaled by Q10 = 3 from 6.3 °C. */
export function cable(o: CableOpts) {
  const { n, dt } = o, dx = o.length / n, dcm = o.diam * 1e-4, dxcm = dx * 1e-4;
  const a = (1000 * dcm) / (4 * o.Ri * dxcm * dxcm); // axial coupling, mS/cm²
  const area = Math.PI * dcm * dxcm, inj = (o.I * 1e-3) / area; // µA/cm²
  const phi = 3 ** ((o.celsius - 6.3) / 10), gL = o.active ? HH.gL : 1000 / o.Rm, eL = o.active ? HH.eL : o.rest;
  const steps = Math.round(o.T / dt), every = Math.max(1, Math.ceil((steps * n) / 2e6), Math.ceil(steps / 4000));
  const V = new Float64Array(n), m = new Float64Array(n), h = new Float64Array(n), k = new Float64Array(n);
  const r0 = hhRest(o.rest);
  V.fill(o.active ? r0[0] : o.rest); m.fill(r0[1]); h.fill(r0[2]); k.fill(r0[3]);
  const diag = new Float64Array(n), rhs = new Float64Array(n), cp = new Float64Array(n), first = new Float64Array(n).fill(NaN);
  const t: number[] = [0], rec: number[][] = [Array.from(V)];
  for (let s = 0; s < steps; s++) {
    const tn = (s + 1) * dt, on = tn > o.start && tn <= o.stop;
    for (let i = 0; i < n; i++) {
      let g = gL, ge = gL * eL;
      if (o.active) {
        const [am, bm, ah, bh, an, bn] = gates(V[i], phi);
        const upd = (x: number, al: number, be: number) => { const tau = 1 / (al + be), inf = al * tau; return inf + (x - inf) * Math.exp(-dt / tau); };
        m[i] = upd(m[i], am, bm); h[i] = upd(h[i], ah, bh); k[i] = upd(k[i], an, bn);
        const gna = HH.gNa * m[i] ** 3 * h[i], gk = HH.gK * k[i] ** 4;
        g += gna + gk; ge += gna * HH.eNa + gk * HH.eK;
      }
      const nb = (i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0);
      diag[i] = o.Cm / dt + g + a * nb;
      rhs[i] = (o.Cm / dt) * V[i] + ge + (on && i === o.at ? inj : 0);
    }
    // Thomas' algorithm with the off-diagonals −a.
    cp[0] = -a / diag[0]; rhs[0] /= diag[0];
    for (let i = 1; i < n; i++) { const den = diag[i] + a * cp[i - 1]; cp[i] = -a / den; rhs[i] = (rhs[i] + a * rhs[i - 1]) / den; }
    const prev = Float64Array.from(V);
    V[n - 1] = rhs[n - 1];
    for (let i = n - 2; i >= 0; i--) V[i] = rhs[i] - cp[i] * V[i + 1];
    for (let i = 0; i < n; i++) if (Number.isNaN(first[i]) && prev[i] < 0 && V[i] >= 0) first[i] = tn - (dt * V[i]) / (V[i] - prev[i]);
    if ((s + 1) % every === 0 || s === steps - 1) { t.push(tn); rec.push(Array.from(V)); }
  }
  const x = Array.from({ length: n }, (_, i) => (i + 0.5) * dx);
  // The speed from arrival times along the middle half of the compartments that fired (µm/ms = mm/s → m/s).
  const mid = x.map((_, i) => i).filter((i) => i >= n / 4 && i <= (3 * n) / 4 && Number.isFinite(first[i]));
  let speed = NaN;
  if (mid.length > 2) {
    const mx = mid.reduce((s, i) => s + x[i], 0) / mid.length, mt = mid.reduce((s, i) => s + first[i], 0) / mid.length;
    const sxt = mid.reduce((s, i) => s + (x[i] - mx) * (first[i] - mt), 0), stt = mid.reduce((s, i) => s + (first[i] - mt) ** 2, 0);
    speed = Math.abs(sxt / stt) / 1000;
  }
  return { t, x, V: rec, arrival: Array.from(first), speed, lambda: Math.sqrt((o.active ? 1000 / HH.gL : o.Rm) * dcm / (4 * o.Ri)) * 1e4, tau: o.Cm * (o.active ? 1000 / HH.gL : o.Rm) * 1e-3 };
}

// ——— Synapses ———
/** The conductance time course of one synaptic event, peak 1: exponential (rise 0), alpha (rise = decay) or the
 * difference of two exponentials. */
export function kernel(rise: number, decay: number): (s: number) => number {
  if (s0(rise)) return (s) => (s < 0 ? 0 : Math.exp(-s / decay));
  if (Math.abs(rise - decay) < 1e-12 * decay) return (s) => (s < 0 ? 0 : (s / decay) * Math.exp(1 - s / decay));
  const tp = ((rise * decay) / (decay - rise)) * Math.log(decay / rise), norm = Math.exp(-tp / decay) - Math.exp(-tp / rise);
  return (s) => (s < 0 ? 0 : (Math.exp(-s / decay) - Math.exp(-s / rise)) / norm);
}
const s0 = (x: number) => !(x > 0);
/** g(t) = gmax Σ kernel(t − t_k) over the spike times (each kernel cut at 20 decay constants). */
export function conductance(spikes: number[], t: number[], rise: number, decay: number, gmax: number) {
  const f = kernel(rise, decay), sorted = [...spikes].sort((p, q) => p - q), reach = 20 * Math.max(decay, rise);
  let lo = 0;
  return t.map((tt) => {
    while (lo < sorted.length && sorted[lo] < tt - reach) lo++;
    let g = 0;
    for (let j = lo; j < sorted.length && sorted[j] <= tt; j++) g += f(tt - sorted[j]);
    return gmax * g;
  });
}

// ——— STDP ———
/** The pair rule: a presynaptic spike Δ = t_post − t_pre before a postsynaptic one strengthens by A+ e^(−Δ/τ+); after
 * it, weakens by A− e^(Δ/τ−). */
export const stdpChange = (d: number, Ap: number, Am: number, tp: number, tm: number) => (d > 0 ? Ap * Math.exp(-d / tp) : d < 0 ? -Am * Math.exp(d / tm) : 0);

export interface Song { nEx: number; nIn: number; rateEx: number; rateIn: number; gmax: number; gIn: number; Ap: number; ratio: number; tauP: number; tauM: number; seconds: number; dt: number }
export const SONG: Song = { nEx: 1000, nIn: 200, rateEx: 10, rateIn: 10, gmax: 0.015, gIn: 0.05, Ap: 0.005, ratio: 1.05, tauP: 20, tauM: 20, seconds: 100, dt: 0.1 };
const poissonCount = (mu: number, rand: Rand) => { let k = 0, p = Math.exp(-mu), s = p; const u = rand(); while (u > s && k < 1000) { k++; p *= mu / k; s += p; } return k; };
/** Song, Miller and Abbott (2000): a conductance-based integrate-and-fire neuron (τ 20 ms, rest −70, threshold −54,
 * reset −60, E_ex 0, E_in −70 mV, synaptic τ 5 ms) driven by Poisson inputs; excitatory weights learn by additive
 * STDP kept in [0, gmax]. Returns the weights (÷ gmax) at the end and at ten moments, and the output rate each second. */
export function songNeuron(p: Song, rand: Rand) {
  const { nEx, dt } = p, Am = p.Ap * p.ratio, w = new Float64Array(nEx).fill(p.gmax), P = new Float64Array(nEx), tP = new Float64Array(nEx);
  let V = -60, gEx = 0, gIn = 0, M = 0, tM = 0, spikesThisSecond = 0;
  const steps = Math.round((p.seconds * 1000) / dt), perSecond = Math.round(1000 / dt), rate: number[] = [], snaps: number[][] = [];
  const muEx = nEx * p.rateEx * dt * 1e-3, muIn = p.nIn * p.rateIn * dt * 1e-3, decEx = Math.exp(-dt / 5);
  for (let s = 1; s <= steps; s++) {
    const t = s * dt;
    for (let c = poissonCount(muEx, rand); c > 0; c--) {
      const a = Math.floor(rand() * nEx);
      gEx += w[a];
      w[a] = Math.max(0, w[a] + p.gmax * M * Math.exp(-(t - tM) / p.tauM));
      P[a] = P[a] * Math.exp(-(t - tP[a]) / p.tauP) + p.Ap; tP[a] = t;
    }
    gIn += p.gIn * poissonCount(muIn, rand);
    V += (dt / 20) * (-70 - V + gEx * (0 - V) + gIn * (-70 - V));
    gEx *= decEx; gIn *= decEx;
    if (V >= -54) {
      V = -60; spikesThisSecond++;
      M = M * Math.exp(-(t - tM) / p.tauM) - Am; tM = t;
      for (let a = 0; a < nEx; a++) w[a] = Math.min(p.gmax, w[a] + p.gmax * P[a] * Math.exp(-(t - tP[a]) / p.tauP));
    }
    if (s % perSecond === 0) { rate.push(spikesThisSecond); spikesThisSecond = 0; }
    if (s % Math.max(1, Math.round(steps / 10)) === 0 && snaps.length < 10) snaps.push(Array.from(w, (x) => x / p.gmax));
  }
  return { w: Array.from(w, (x) => x / p.gmax), snaps, rate };
}

// ——— Spike sorting ———
export interface SortOpts { threshold: number; polarity: 'neg' | 'pos' | 'both'; pre: number; post: number; dead: number; clusters: number }
export const SORT: SortOpts = { threshold: 4, polarity: 'neg', pre: 0.5, post: 1, dead: 1, clusters: 0 };
/** Crossings of threshold × σ (σ = median|x| / 0.6745, robust to the spikes themselves), each aligned on its peak
 * within the next millisecond, a window of pre and post ms around it; a dead time after each. */
export function detect(x: ArrayLike<number>, fs: number, o: SortOpts) {
  const abs = Array.from(x, Math.abs).sort((p, q) => p - q), sigma = abs[Math.floor(abs.length / 2)] / 0.6745, thr = o.threshold * sigma;
  const pre = Math.round((o.pre * fs) / 1000), post = Math.round((o.post * fs) / 1000), look = Math.max(1, Math.round(fs / 1000)), dead = Math.round((o.dead * fs) / 1000);
  const val = (i: number) => (o.polarity === 'neg' ? -x[i] : o.polarity === 'pos' ? x[i] : Math.abs(x[i]));
  const peaks: number[] = [], waves: number[][] = [];
  for (let i = 1; i < x.length; i++) {
    if (!(val(i) > thr && val(i - 1) <= thr)) continue;
    let pk = i;
    for (let j = i; j < Math.min(x.length, i + look); j++) if (val(j) > val(pk)) pk = j;
    if (pk - pre < 0 || pk + post >= x.length) continue;
    if (peaks.length && pk - peaks[peaks.length - 1] < dead) continue;
    peaks.push(pk);
    waves.push(Array.from({ length: pre + post + 1 }, (_, j) => x[pk - pre + j]));
    i = pk + dead;
  }
  return { peaks, waves, sigma, threshold: thr, pre };
}
/** The mean silhouette (−1 … 1) of a clustering. */
export function silhouette(X: number[][], idx: number[], k: number) {
  if (k < 2) return 0;
  const d = (p: number[], q: number[]) => Math.sqrt(p.reduce((s, v, j) => s + (v - q[j]) ** 2, 0));
  let tot = 0;
  for (let i = 0; i < X.length; i++) {
    const sum = new Array(k).fill(0), cnt = new Array(k).fill(0);
    for (let j = 0; j < X.length; j++) if (j !== i) { sum[idx[j]] += d(X[i], X[j]); cnt[idx[j]]++; }
    const a = cnt[idx[i]] ? sum[idx[i]] / cnt[idx[i]] : 0, b = Math.min(...sum.map((s, c) => (c === idx[i] || !cnt[c] ? Infinity : s / cnt[c])));
    tot += cnt[idx[i]] ? (b - a) / Math.max(a, b) : 0;
  }
  return tot / X.length;
}
/** Detect, take three principal components of the waveforms, and group them by k-means; with clusters 0, the k
 * (1 to 6) with the best silhouette among those whose every cluster holds 5% of the spikes (one cluster when none
 * reaches 0.5). */
export function sortSpikes(x: ArrayLike<number>, fs: number, o: SortOpts, rand: Rand) {
  const d = detect(x, fs, o);
  if (d.waves.length < 3) return { ...d, cluster: d.peaks.map(() => 1), score: d.waves.map(() => [0, 0, 0]), k: d.waves.length ? 1 : 0, quality: 0 };
  const pc = pca(d.waves), score = pc.score.map((r) => r.slice(0, 3));
  // Silhouettes are n²: judge k on an even sample of at most 600 spikes.
  const step = Math.max(1, Math.ceil(score.length / 600)), sample = score.filter((_, i) => i % step === 0);
  let k = o.clusters, quality = 0;
  if (!k) {
    k = 1;
    for (let c = 2; c <= Math.min(6, Math.floor(sample.length / 5)); c++) {
      const r = kmeans(sample, c, rand, { replicates: 3 }), s = silhouette(sample, r.idx, c);
      // A cluster of a few stray crossings (noise, two spikes overlapping) is not a unit: each needs 5% of the spikes.
      const small = Math.min(...Array.from({ length: c }, (_, j) => r.idx.filter((x) => x === j).length)) < 0.05 * sample.length;
      if (s > quality && !small) { quality = s; if (s >= 0.5) k = c; }
    }
  }
  k = Math.min(k, score.length);
  const r = kmeans(score, k, rand, { replicates: 5 });
  // Number clusters by their peak size, largest first, so the order holds between runs.
  const size = Array.from({ length: k }, (_, c) => { const w = d.waves.filter((_, i) => r.idx[i] === c); return w.length ? Math.abs(w.reduce((s, v) => s + v[d.pre], 0) / w.length) : 0; });
  const order = size.map((_, c) => c).sort((p, q) => size[q] - size[p]), rank = new Array(k);
  order.forEach((c, i) => { rank[c] = i + 1; });
  return { ...d, cluster: r.idx.map((c) => rank[c]), score, k, quality };
}
