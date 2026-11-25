import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as np from './neuro-plus';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

describe('Hyperion neuroscience, the left-outs (M514)', () => {
  it('a passive cable fades as cosh over its length constant', () => {
    const r = np.cable({ ...np.CABLE, length: 500, diam: 1, n: 101, T: 60 });
    expect(r.lambda).toBeCloseTo(Math.sqrt(((1 / 0.3e-3) * 1e-4) / 400) * 1e4, 9);
    expect(r.tau).toBeCloseTo(10 / 3, 9);
    const V = r.V[r.V.length - 1];
    // Sealed far end, current in at the near end: V(L)/V(0) = 1 / cosh(L/λ).
    expect((V[100] + 65) / (V[0] + 65)).toBeCloseTo(1 / Math.cosh(500 / r.lambda), 2);
    expect(Number.isNaN(r.speed)).toBe(true);
  });
  it('the squid giant axon conducts at Hodgkin and Huxley’s 18.8 m/s (18.5 °C)', () => {
    const r = np.cable({ ...np.CABLE, active: true, length: 50000, diam: 476, n: 500, Ri: 35.4, I: 2000, stop: 0.5, T: 8, celsius: 18.5 });
    expect(r.speed).toBeGreaterThan(17.5);
    expect(r.speed).toBeLessThan(20);
    // Colder is slower (Q10 = 3 on the gates).
    expect(np.cable({ ...np.CABLE, active: true, length: 50000, diam: 476, n: 500, Ri: 35.4, I: 2000, stop: 0.5, T: 12, celsius: 6.3 }).speed).toBeLessThan(r.speed * 0.8);
  });
  it('synaptic kernels peak at 1 when they should', () => {
    const t = Array.from({ length: 4001 }, (_, i) => i * 0.01);
    for (const [rise, decay, peakAt] of [[0, 5, 0], [5, 5, 5], [1, 5, ((1 * 5) / 4) * Math.log(5)]]) {
      const g = np.conductance([0], t, rise, decay, 2), m = Math.max(...g);
      expect(m).toBeCloseTo(2, 3);
      expect(t[g.indexOf(m)]).toBeCloseTo(peakAt, 1);
    }
    expect(np.conductance([0, 10], [10], 0, 5, 1)[0]).toBeCloseTo(1 + Math.exp(-2), 12);
  });
  it('STDP: pairs strengthen or weaken by timing, and inputs compete (Song, Miller and Abbott)', () => {
    expect(np.stdpChange(10, 0.005, 0.00525, 20, 20)).toBeCloseTo(0.005 * Math.exp(-0.5), 12);
    expect(np.stdpChange(-10, 0.005, 0.00525, 20, 20)).toBeCloseTo(-0.00525 * Math.exp(-0.5), 12);
    const r = np.songNeuron({ ...np.SONG, seconds: 1000 }, seeded(7));
    // All inputs start at the maximum: the neuron fires fast, then the weights split into strong and weak.
    expect(r.rate[0]).toBeGreaterThan(100);
    expect(r.rate.slice(-20).reduce((s, v) => s + v, 0) / 20).toBeLessThan(40);
    expect(r.w.filter((x) => x < 0.2 || x > 0.8).length / r.w.length).toBeGreaterThan(0.6);
    expect(r.w.every((x) => x >= 0 && x <= 1)).toBe(true);
  });
  it('sorts two neurons out of a noisy recording', () => {
    const rand = seeded(11), fs = 24000, n = fs * 20, x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = 10 * gauss(rand);
    const shape = (A: number, w: number, B: number) => Array.from({ length: 48 }, (_, j) => { const s = (j - 12) / fs * 1000; return -A * Math.exp(-((s / w) ** 2)) + B * Math.exp(-(((s - 0.5) / (2 * w)) ** 2)); });
    const units = [shape(120, 0.15, 20), shape(70, 0.35, 35)], truth: [number, number][] = [];
    units.forEach((u, k) => { let t = 0; for (;;) { t += Math.floor(-Math.log(1 - rand()) * fs / 8) + 72; if (t + 48 >= n) break; truth.push([t + 12, k + 1]); for (let j = 0; j < 48; j++) x[t + j] += u[j]; } });
    truth.sort((p, q) => p[0] - q[0]);
    const r = np.sortSpikes(x, fs, np.SORT, seeded(3));
    expect(r.k).toBe(2);
    let hit = 0, agree = 0;
    for (const [tt, unit] of truth) {
      const i = r.peaks.findIndex((p) => Math.abs(p - tt) <= 5);
      if (i < 0) continue;
      hit++;
      if (r.cluster[i] === unit) agree++;
    }
    expect(hit / truth.length).toBeGreaterThan(0.9);
    expect(agree / hit).toBeGreaterThan(0.95);
    expect(r.sigma).toBeCloseTo(10, 0);
  });
  it('in the language', () => {
    const r = run("[t, x, V, v] = cableNeuron('Active', true, 'Compartments', 200, 'Time', 6);\ng = synapseConductance([0 10], 0:0.5:30, 'Rise', 1, 'Decay', 5);\n[d, w] = stdpWindow();\n[wt, rate] = stdpNeuron('Seconds', 5, 'Inputs', 200);\nrng(1); fs = 20000; sig = 5*randn(1, fs); sig(1000:1004) = sig(1000:1004) - [20 60 80 60 20];\n[ts, wv] = detectSpikes(sig, fs);\ncableNeuron()\nfigure; stdpNeuron('Seconds', 3, 'Inputs', 100)\nfigure; spikeSort(sig, fs)\nfigure; stdpWindow()");
    expect(r.d('v')[0]).toBeGreaterThan(15);
    expect(Math.max(...r.d('g'))).toBeGreaterThan(1);
    expect(r.d('wt')).toHaveLength(200);
    expect(r.d('rate')).toHaveLength(5);
    expect(r.d('ts').some((s) => Math.abs(s - 1001 / 20000) < 3e-4)).toBe(true);
    expect(r.graphics.figures.length).toBe(4);
  });
});
