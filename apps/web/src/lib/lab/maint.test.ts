import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './maint-lab';
import * as pm from './maint';
import { kurtogram as vbKg, spectralKurtosis as vbSk } from './vib';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 11;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

describe('Hyperion predictive maintenance (M423): the methods', () => {
  it('the Hilbert envelope of a modulated tone, and its spectrum’s peak at the modulation', () => {
    const fs = 10_000, n = 4096, x = Array.from({ length: n }, (_, k) => (1 + 0.5 * Math.cos(2 * Math.PI * 100 * (k / fs))) * Math.cos(2 * Math.PI * 2000 * (k / fs)));
    const env = pm.envelope(x);
    // Away from the ends the envelope is 1 + 0.5 cos(2π·100 t).
    for (const k of [1000, 1500, 2600]) expect(env[k]).toBeCloseTo(1 + 0.5 * Math.cos(2 * Math.PI * 100 * (k / fs)), 2);
    const s = pm.envspectrum(x, fs), top = s.p.indexOf(Math.max(...s.p));
    expect(Math.abs(s.f[top] - 100)).toBeLessThan(fs / n * 1.01);
    expect(s.p[top]).toBeCloseTo(0.5, 1);
  });

  it('a bearing’s defect frequencies by the textbook formulas', () => {
    const f = pm.bearingFrequencies(25, 9, 7.94, 39.04, 0), r = 7.94 / 39.04;
    expect(f.BPFO).toBeCloseTo(4.5 * 25 * (1 - r), 9);
    expect(f.BPFI).toBeCloseTo(4.5 * 25 * (1 + r), 9);
    expect(f.FTF).toBeCloseTo(12.5 * (1 - r), 9);
    expect(f.BSF).toBeCloseTo((39.04 / (2 * 7.94)) * 25 * (1 - r * r), 9);
    // The outer and inner race frequencies add up to the number of balls times the speed.
    expect(f.BPFO + f.BPFI).toBeCloseTo(9 * 25, 9);
  });

  it('change points: exact steps, a penalty, slope changes; CUSUM finds a drift', () => {
    const steps = [...new Array(100).fill(0), ...new Array(150).fill(3), ...new Array(80).fill(1)].map((v) => v + 0.3 * gauss());
    expect(pm.changePoints(steps, { max: 2 })).toEqual([100, 250]);
    expect(pm.changePoints(steps, { penalty: 50 })).toEqual([100, 250]);
    const kink = Array.from({ length: 200 }, (_, k) => (k < 120 ? 0.1 * k : 12 - 0.2 * (k - 120)) + 0.05 * gauss());
    expect(Math.abs(pm.changePoints(kink, { stat: 'linear' })[0] - 120)).toBeLessThanOrEqual(2);
    const drift = Array.from({ length: 200 }, (_, k) => (k < 100 ? 0 : 1) + 0.5 * gauss()), c = pm.cusum(drift, 5, 1, 0, 0.5);
    expect(c.iupper).toBeGreaterThanOrEqual(100);
    expect(c.iupper).toBeLessThan(130);
    expect(c.ilower).toBe(-1);
  });

  it('rates features: rising together is monotonic, trendable and prognosable', () => {
    const fleet = [1, 1.2, 0.9].map((r) => Array.from({ length: 50 }, (_, k) => Math.exp(0.05 * r * k)));
    expect(pm.monotonicity(fleet)).toBe(1);
    expect(pm.trendability(fleet)).toBeGreaterThan(0.95);
    expect(pm.monotonicity([[1, 2, 1, 2, 1]])).toBe(0);
  });

  it('an exponential degradation model learns from a fleet and predicts a new machine’s remaining life', () => {
    // Each machine: y = 1 + θ·e^(β t) with θ ≈ 0.5 and β ≈ 0.1, a little noise on the log.
    const fleet = Array.from({ length: 12 }, () => { const th = 0.5 * Math.exp(0.1 * gauss()), b = 0.1 + 0.005 * gauss(), t = Array.from({ length: 60 }, (_, k) => k); return { t, y: t.map((tt) => 1 + th * Math.exp(b * tt + 0.02 * gauss())) }; });
    const m = pm.fitDegradation('exponential', fleet, 1);
    expect(Math.exp(m.mean[0])).toBeCloseTo(0.5, 1);
    expect(m.mean[1]).toBeCloseTo(0.1, 2);
    // A new machine seen up to t = 20; it reaches 30 at ln(29/0.5)/0.1 ≈ 40.6.
    const t = Array.from({ length: 21 }, (_, k) => k), seen = pm.updateDegradation(m, t, t.map((tt) => 1 + 0.5 * Math.exp(0.1 * tt))), r = pm.remainingLife(seen, 30, rand);
    expect(r.rul).toBeCloseTo(Math.log(29 / 0.5) / 0.1 - 20, 0);
    expect(r.ci[0]).toBeLessThan(r.rul);
    expect(r.ci[1]).toBeGreaterThan(r.rul);
    const lin = pm.fitDegradation('linear', [0.28, 0.3, 0.32].map((s) => ({ t: [0, 10, 20, 30], y: [2, 2 + 10 * s, 2 + 20 * s, 2 + 30 * s] })));
    expect(pm.remainingLife(pm.updateDegradation(lin, [0, 10, 30], [2, 5, 11]), 20, rand).rul).toBeCloseTo(30, 0);
  });
});

describe('Hyperion predictive maintenance (M423): in the language', () => {
  it('features, change points and a remaining-life prediction', () => {
    const r = run("x = [ones(1,50) 3*ones(1,50)];\nr = rms([3 4]);\np = peak2peak([1 5 -2]);\nc = peak2rms([1 -1 1 -1]);\ni = findchangepts(x);\nz = hilbert([1 0 -1 0]);\nre = real(z); im = imag(z);\n[FB, info] = bearingFaultBands(25, 9, 7.94, 39.04);\nrng(1)\nfleet = cell(1, 8);\nfor k = 1:8, t = (0:40)'; fleet{k} = [t, 2 + (0.3 + 0.01*randn)*t]; end\nmdl = fit(linearDegradationModel, fleet);\n[rul, ci] = predictRUL(mdl, [(0:10)', 2 + 0.3*(0:10)'], 20);");
    expect(r.d('r')[0]).toBeCloseTo(Math.sqrt(12.5), 12);
    expect(r.d('p')).toEqual([7]);
    expect(r.d('c')).toEqual([1]);
    expect(r.d('i')).toEqual([51]);
    r.d('re').forEach((v, k) => expect(v).toBeCloseTo([1, 0, -1, 0][k], 12));
    r.d('im').forEach((v, k) => expect(v).toBeCloseTo([0, 1, 0, -1][k], 12));
    expect(r.d('FB')).toHaveLength(8);
    expect(r.d('rul')[0]).toBeCloseTo(50, -0.5);
    expect(r.d('ci')[0]).toBeLessThan(r.d('rul')[0]);
  });

  it('draws change points and CUSUM, and explains mistakes', () => {
    const r = run("findchangepts([zeros(1,30) ones(1,30)])\nfigure; cusum([zeros(1,40) 2*ones(1,40)], 5, 1, 0, 1)");
    expect(r.graphics.figures.length).toBe(2);
    expect(() => run('predictRUL(exponentialDegradationModel, 10)')).toThrow(/Fit the model/);
    expect(() => run("fit(exponentialDegradationModel('Phi', 5), {[0 1; 1 2], [0 1; 1 3]})")).toThrow(/above Phi/);
  });
});

describe('Hyperion vibration analysis (M442)', () => {
  it('modalfrf and modalfit find a mass on a spring’s frequency and damping from noise in, response out', () => {
    // A one-mode system (fn 50 Hz, ζ 2 %) driven by white noise, simulated exactly per sample by its digital twin.
    const r = run([
      'rng(3); fs = 1000; n = 2^16; fn = 50; z = 0.02;',
      'w = 2*pi*fn; wd = w*sqrt(1-z^2); T = 1/fs; r = exp(-z*w*T);',
      'a = [1 -2*r*cos(wd*T) r^2]; b = [0 r*sin(wd*T)/wd*T*w^2 0];',
      'x = randn(n, 1); y = filter(b, a, x);',
      '[H, f, c] = modalfrf(x, y, fs, 4096);',
      '[fn1, dr] = modalfit(H, f, fs, 1);',
    ].join('\n'));
    expect(r.d('fn1')[0]).toBeCloseTo(50, 0);
    expect(r.d('dr')[0]).toBeGreaterThan(0.015);
    expect(r.d('dr')[0]).toBeLessThan(0.026);
    // Noise-free: the coherence is 1 near the resonance.
    expect(r.d('c')[205]).toBeGreaterThan(0.95);
  });
  it('spectral kurtosis and the kurtogram find the band where impacts ring', () => {
    // Steady noise everywhere plus decaying 3 kHz bursts ten times a second.
    const fs = 20000, n = 20000, x: number[] = [];
    for (let k = 0; k < n; k++) x.push(0.3 * gauss());
    for (let start = 500; start < n; start += 2000) for (let k = 0; k < 300 && start + k < n; k++) x[start + k] += 3 * Math.exp(-k / 40) * Math.sin((2 * Math.PI * 3000 * k) / fs);
    const sk = vbSk(x, fs, 128), top = sk.f[sk.sk.indexOf(Math.max(...sk.sk))];
    expect(Math.abs(top - 3000)).toBeLessThan(500);
    const kg = vbKg(x, fs, 7);
    expect(Math.abs(kg.fc - 3000)).toBeLessThan(800);
    expect(kg.max).toBeGreaterThan(2);
  });
  it('tsa keeps what turns with the shaft; orderspectrum keeps an order in place through a run-up', () => {
    const r = run([
      'rng(1); fs = 2000; t = (0:1/fs:10-1/fs)\';',
      'x = sin(2*pi*5*t) + 2*randn(size(t));',     // 5 Hz = 300 rpm, deeply buried in noise
      '[ta, tt, rpm] = tsa(x, fs, 0:0.2:10);',
      'rpm2 = linspace(600, 1800, numel(t))\';',
      'ang = cumsum(rpm2/60)/fs;',
      'y = sin(2*pi*3*ang);',                          // order 3 while the speed triples
      '[s, o] = orderspectrum(y, fs, rpm2);',
      '[~, k] = max(s); top = o(k);',
    ].join('\n'));
    expect(r.d('rpm')[0]).toBeCloseTo(300, 6);
    const ta = r.d('ta'), amp = Math.max(...ta) - Math.min(...ta);
    // Averaging 50 turns cuts noise of 2 to about 0.28: the sine's 2 peak-to-peak stands out.
    expect(amp).toBeGreaterThan(1.6);
    expect(amp).toBeLessThan(3.6);
    expect(r.d('top')[0]).toBeCloseTo(3, 1);
    expect(Math.max(...r.d('s'))).toBeGreaterThan(0.8);
  });
  it('draws without outputs and explains mistakes', () => {
    const r = run('x = randn(1, 4096);\npkurtosis(x, 1000)\nfigure; kurtogram(x, 1000, 5)\nfigure; modalfrf(x, x, 1000, 256)');
    expect(r.graphics.figures.length).toBe(3);
    expect(() => run('modalfrf(1:10, 1:9, 100, 4)')).toThrow(/same number/);
    expect(() => run('tsa(1:100, 10, 5)')).toThrow(/two pulses/);
  });
});
