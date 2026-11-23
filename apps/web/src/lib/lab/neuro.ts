// Hyperion's neuroscience (M496, the owner's list, group 7): single neurons (Hodgkin and Huxley's squid axon, 1952;
// the leaky integrate-and-fire neuron; Izhikevich's two-variable model with its named firing types, 2003), small
// networks of spiking neurons (Izhikevich's 1000-neuron cortex and integrate-and-fire neurons wired by a weight
// matrix), and spike-train analysis (spike times from a voltage, inter-spike intervals and their CV, the Fano factor,
// the PSTH, cross-correlograms, Poisson trains). Times in ms, voltages in mV, currents in µA/cm² (HH) or the models'
// own units. Pure: randomness comes in as a function.
export type Rand = () => number;
const gauss = (rand: Rand) => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

/** The input current at step k: a constant, or a value per step. */
export type Input = number | ((k: number, t: number) => number);
const at = (I: Input, k: number, t: number) => (typeof I === 'number' ? I : I(k, t));

// ——— Hodgkin–Huxley ———
export const HH = { cm: 1, gNa: 120, gK: 36, gL: 0.3, eNa: 50, eK: -77, eL: -54.387 };
const rates = (V: number) => {
  const am = Math.abs(V + 40) < 1e-7 ? 1 : (0.1 * (V + 40)) / (1 - Math.exp(-(V + 40) / 10)), bm = 4 * Math.exp(-(V + 65) / 18);
  const ah = 0.07 * Math.exp(-(V + 65) / 20), bh = 1 / (1 + Math.exp(-(V + 35) / 10));
  const an = Math.abs(V + 55) < 1e-7 ? 0.1 : (0.01 * (V + 55)) / (1 - Math.exp(-(V + 55) / 10)), bn = 0.125 * Math.exp(-(V + 65) / 80);
  return { am, bm, ah, bh, an, bn };
};
/** The gates' resting values at V. */
export const hhRest = (V = -65) => { const r = rates(V); return [V, r.am / (r.am + r.bm), r.ah / (r.ah + r.bh), r.an / (r.an + r.bn)]; };
/** HH by RK4 at dt ms for T ms: V, m, h, n each step, and the spike times (upward crossings of 0 mV). */
export function hodgkinHuxley(I: Input, T: number, dt = 0.01, p = HH) {
  const f = (s: number[], i: number) => {
    const [V, m, h, n] = s, r = rates(V);
    const ina = p.gNa * m ** 3 * h * (V - p.eNa), ik = p.gK * n ** 4 * (V - p.eK), il = p.gL * (V - p.eL);
    return [(i - ina - ik - il) / p.cm, r.am * (1 - m) - r.bm * m, r.ah * (1 - h) - r.bh * h, r.an * (1 - n) - r.bn * n];
  };
  const N = Math.round(T / dt), t = new Float64Array(N + 1), V = new Float64Array(N + 1), M = new Float64Array(N + 1), H = new Float64Array(N + 1), Nn = new Float64Array(N + 1), spikes: number[] = [];
  let s = hhRest();
  const put = (k: number) => { t[k] = k * dt; V[k] = s[0]; M[k] = s[1]; H[k] = s[2]; Nn[k] = s[3]; };
  put(0);
  for (let k = 0; k < N; k++) {
    const i = at(I, k, k * dt);
    const k1 = f(s, i), k2 = f(s.map((v, j) => v + (dt / 2) * k1[j]), i), k3 = f(s.map((v, j) => v + (dt / 2) * k2[j]), i), k4 = f(s.map((v, j) => v + dt * k3[j]), i);
    const prev = s[0];
    s = s.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (prev < 0 && s[0] >= 0) spikes.push((k + 1) * dt - (dt * s[0]) / (s[0] - prev));
    put(k + 1);
  }
  return { t, V, m: M, h: H, n: Nn, spikes };
}

// ——— Leaky integrate-and-fire ———
export interface Lif { tau: number; r: number; rest: number; threshold: number; reset: number; refractory: number }
export const LIF: Lif = { tau: 10, r: 10, rest: -65, threshold: -50, reset: -65, refractory: 2 };
/** τ dV/dt = −(V − rest) + R I, a spike and a reset at the threshold, then silent for the refractory time; the exact
 * exponential step between inputs (so the firing rate matches the formula to the step). */
export function lif(I: Input, T: number, dt = 0.1, p: Lif = LIF) {
  const N = Math.round(T / dt), t = new Float64Array(N + 1), V = new Float64Array(N + 1), spikes: number[] = [];
  let v = p.rest, quiet = 0;
  V[0] = v;
  const toward = (from: number, target: number, span: number) => target + (from - target) * Math.exp(-span / p.tau);
  for (let k = 0; k < N; k++) {
    const target = p.rest + p.r * at(I, k, k * dt);
    // The part of this step still refractory, then the rest of it integrating exactly from where it is.
    let left = dt;
    if (quiet > 0) { const q = Math.min(quiet, left); quiet -= q; left -= q; v = p.reset; }
    if (left > 1e-12) {
      const next = toward(v, target, left);
      if (next >= p.threshold && target > p.threshold) {
        // The crossing time within the step, so spike times aren't rounded to the grid.
        const ts = (k + 1) * dt - left + p.tau * Math.log((target - v) / (target - p.threshold));
        spikes.push(ts);
        const after = (k + 1) * dt - ts;
        if (after >= p.refractory) { v = toward(p.reset, target, after - p.refractory); quiet = 0; } else { v = p.reset; quiet = p.refractory - after; }
      } else v = next;
    }
    t[k + 1] = (k + 1) * dt; V[k + 1] = v;
  }
  return { t, V, spikes };
}
/** The LIF neuron's firing rate (Hz) for a steady current: 1 / (t_ref + τ ln((RI + rest − reset) / (RI + rest − θ))). */
export function lifRate(I: number, p: Lif = LIF) {
  const target = p.rest + p.r * I;
  if (target <= p.threshold) return 0;
  return 1000 / (p.refractory + p.tau * Math.log((target - p.reset) / (target - p.threshold)));
}

// ——— Izhikevich ———
export const IZH_TYPES: Record<string, [number, number, number, number]> = {
  RS: [0.02, 0.2, -65, 8], IB: [0.02, 0.2, -55, 4], CH: [0.02, 0.2, -50, 2], FS: [0.1, 0.2, -65, 2], LTS: [0.02, 0.25, -65, 2], TC: [0.02, 0.25, -65, 0.05], RZ: [0.1, 0.26, -65, 2],
};
/** v' = 0.04v² + 5v + 140 − u + I, u' = a(bv − u); at v ≥ 30: v ← c, u ← u + d. Two half steps for v, as in the paper. */
export function izhikevich(I: Input, T: number, abcd: [number, number, number, number], dt = 0.25) {
  const [a, b, c, d] = abcd, N = Math.round(T / dt), t = new Float64Array(N + 1), V = new Float64Array(N + 1), U = new Float64Array(N + 1), spikes: number[] = [];
  let v = -65, u = b * v;
  V[0] = v; U[0] = u;
  for (let k = 0; k < N; k++) {
    const i = at(I, k, k * dt);
    for (let h = 0; h < 2; h++) v += (dt / 2) * (0.04 * v * v + 5 * v + 140 - u + i);
    u += dt * a * (b * v - u);
    if (v >= 30) { V[k + 1] = 30; spikes.push((k + 1) * dt); v = c; u += d; } else V[k + 1] = v;
    t[k + 1] = (k + 1) * dt; U[k + 1] = u;
  }
  return { t, V, U, spikes };
}

/** Izhikevich's 2003 network: Ne excitatory (regular spiking to chattering) and Ni inhibitory (fast spiking to low
 * threshold) neurons, all-to-all random weights, thalamic noise; 1 ms steps. Returns spikes as [time, neuron] pairs. */
export function izhNetwork(Ne: number, Ni: number, T: number, rand: Rand) {
  const n = Ne + Ni, a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n), W = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (i < Ne) { a[i] = 0.02; b[i] = 0.2; c[i] = -65 + 15 * r * r; d[i] = 8 - 6 * r * r; }
    else { a[i] = 0.02 + 0.08 * r; b[i] = 0.25 - 0.05 * r; c[i] = -65; d[i] = 2; }
  }
  // W[i + j n]: from neuron j to neuron i (0.5 × rand from excitatory, −rand from inhibitory).
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) W[i + j * n] = j < Ne ? 0.5 * rand() : -rand();
  const v = new Float64Array(n).fill(-65), u = new Float64Array(n), I = new Float64Array(n), out: [number, number][] = [];
  for (let i = 0; i < n; i++) u[i] = b[i] * v[i];
  for (let t = 1; t <= T; t++) {
    for (let i = 0; i < n; i++) I[i] = (i < Ne ? 5 : 2) * gauss(rand);
    const fired: number[] = [];
    for (let i = 0; i < n; i++) if (v[i] >= 30) { fired.push(i); out.push([t, i + 1]); v[i] = c[i]; u[i] += d[i]; }
    for (const j of fired) for (let i = 0; i < n; i++) I[i] += W[i + j * n];
    for (let i = 0; i < n; i++) {
      for (let h = 0; h < 2; h++) v[i] += 0.5 * (0.04 * v[i] * v[i] + 5 * v[i] + 140 - u[i] + I[i]);
      u[i] += a[i] * (b[i] * v[i] - u[i]);
    }
  }
  return out;
}

/** Integrate-and-fire neurons wired by W (W[i][j] mV added to i when j fires, after `delay` ms), each with its own
 * steady current and noise σ (mV per √ms). Returns spikes as [time, neuron] and each neuron's voltage if asked. */
export function lifNetwork(W: number[][], Iext: number[], T: number, rand: Rand, o: { dt?: number; noise?: number; delay?: number; p?: Lif } = {}) {
  const n = W.length, dt = o.dt ?? 0.1, p = o.p ?? LIF, sigma = o.noise ?? 0, lag = Math.max(1, Math.round((o.delay ?? 1) / dt));
  const v = new Float64Array(n).fill(p.rest), quiet = new Float64Array(n), out: [number, number][] = [], ring: number[][] = Array.from({ length: lag + 1 }, () => []);
  const N = Math.round(T / dt), trace = Array.from({ length: Math.min(n, 5) }, () => new Float64Array(N + 1));
  for (let k = 0; k < N; k++) {
    const arriving = ring[k % (lag + 1)];
    ring[k % (lag + 1)] = [];
    for (let i = 0; i < n; i++) {
      if (quiet[i] > 1e-12) { quiet[i] -= dt; v[i] = p.reset; continue; }
      v[i] += (dt / p.tau) * (-(v[i] - p.rest) + p.r * Iext[i]) + sigma * Math.sqrt(dt) * gauss(rand);
      for (const j of arriving) v[i] += W[i][j];
      if (v[i] >= p.threshold) { out.push([(k + 1) * dt, i + 1]); v[i] = p.reset; quiet[i] = p.refractory; ring[(k + lag) % (lag + 1)].push(i); }
    }
    trace.forEach((tr, i) => { tr[k + 1] = v[i]; });
  }
  return { spikes: out, trace };
}

// ——— Spike trains ———
/** Upward crossings of the threshold, interpolated between samples. */
export function spikeTimes(V: ArrayLike<number>, t: ArrayLike<number>, threshold = 0) {
  const s: number[] = [];
  for (let k = 1; k < V.length; k++) if (V[k - 1] < threshold && V[k] >= threshold) s.push(t[k - 1] + ((threshold - V[k - 1]) / (V[k] - V[k - 1])) * (t[k] - t[k - 1]));
  return s;
}
/** A homogeneous Poisson train at `rate` Hz over T ms, with an optional dead time after each spike. */
export function poisson(rate: number, T: number, rand: Rand, dead = 0) {
  const s: number[] = [];
  let t = 0;
  for (;;) { t += -Math.log(1 - rand()) * (1000 / rate) + (s.length ? dead : 0); if (t > T) return s; s.push(t); }
}
export function isiStats(times: number[]) {
  const isi = times.slice(1).map((x, i) => x - times[i]), n = isi.length;
  const mean = n ? isi.reduce((s, x) => s + x, 0) / n : NaN, sd = n > 1 ? Math.sqrt(isi.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : NaN;
  return { isi, mean, cv: sd / mean, rate: 1000 / mean };
}
/** Counts in windows of `win` ms: variance ÷ mean (1 for Poisson, 0 for a clock). */
export function fano(times: number[], T: number, win: number) {
  const k = Math.floor(T / win), c = new Array(k).fill(0);
  for (const x of times) { const b = Math.floor(x / win); if (b < k) c[b]++; }
  const m = c.reduce((s, x) => s + x, 0) / k, v = c.reduce((s, x) => s + (x - m) ** 2, 0) / (k - 1);
  return v / m;
}
/** The peri-stimulus time histogram: spikes of all trials (or neurons) per bin, as Hz. */
export function psth(times: number[], trials: number, T: number, bin: number) {
  const k = Math.ceil(T / bin), c = new Array(k).fill(0);
  for (const x of times) { const b = Math.floor(x / bin); if (b >= 0 && b < k) c[b]++; }
  return { edges: Array.from({ length: k + 1 }, (_, i) => i * bin), rate: c.map((x) => (1000 * x) / (trials * bin)) };
}
/** The cross-correlogram: counts of b's spikes at each lag from a's, in bins out to ±maxLag. */
export function crossCorrelogram(a: number[], b: number[], maxLag: number, bin: number) {
  const k = Math.round(maxLag / bin), c = new Array(2 * k + 1).fill(0);
  let lo = 0;
  for (const x of a) {
    while (lo < b.length && b[lo] < x - maxLag - bin / 2) lo++;
    for (let j = lo; j < b.length && b[j] <= x + maxLag + bin / 2; j++) { const q = Math.round((b[j] - x) / bin); if (Math.abs(q) <= k) c[q + k]++; }
  }
  return { lags: Array.from({ length: 2 * k + 1 }, (_, i) => (i - k) * bin), counts: c };
}
