import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './radar-lab';
import * as rd from './radar';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 5;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('Hyperion radar (M429)', () => {
  it('the radar equation and its inverses', () => {
    // 10 GHz, 50 km, 1 MW, 1 µs, 30 dB antenna each way, 1 m², 290 K: worked by hand, 12.58 dB.
    const lambda = rd.C / 10e9, p = { gain: [30, 30] as [number, number], rcs: 1, ts: 290, loss: 0 };
    const byHand = (1e6 * 1e-6 * 1e3 * 1e3 * lambda ** 2) / ((4 * Math.PI) ** 3 * 50e3 ** 4 * 1.380649e-23 * 290);
    expect(rd.radarSnr(lambda, 50e3, 1e6, 1e-6, p)).toBeCloseTo(10 * Math.log10(byHand), 10);
    expect(rd.radarSnr(lambda, 50e3, 1e6, 1e-6, p)).toBeCloseTo(12.58, 2);
    expect(rd.radarRange(lambda, rd.radarSnr(lambda, 50e3, 1e6, 1e-6, p), 1e6, 1e-6, p)).toBeCloseTo(50e3, 6);
    expect(rd.radarPower(lambda, 50e3, rd.radarSnr(lambda, 50e3, 1e6, 1e-6, p), 1e-6, p)).toBeCloseTo(1e6, 3);
    // Twice as far needs 16 × the power (R⁴).
    expect(rd.radarPower(lambda, 100e3, 13, 1e-6, p) / rd.radarPower(lambda, 50e3, 13, 1e-6, p)).toBeCloseTo(16, 9);
  });

  it('compresses a chirp to a sharp peak at its delay, sidelobes near −13 dB', () => {
    const w = rd.lfm(10e6, 10e-6, 20e6), N = w[0].length, re = new Float64Array(600), im = new Float64Array(600);
    for (let i = 0; i < N; i++) { re[100 + i] = w[0][i]; im[100 + i] = w[1][i]; }
    const [yr, yi] = rd.compress(re, im, w), mag = Array.from(yr, (v, k) => Math.hypot(v, yi[k]));
    const peak = mag.indexOf(Math.max(...mag));
    expect(peak).toBe(100);
    expect(mag[peak]).toBeCloseTo(N, 6);
    const side = Math.max(...mag.filter((_, k) => Math.abs(k - peak) > 2));
    expect(20 * Math.log10(side / mag[peak])).toBeLessThan(-12);
    expect(20 * Math.log10(side / mag[peak])).toBeGreaterThan(-15);
  });

  it('finds a moving target on the range–Doppler map, and CFAR keeps its false alarms', () => {
    const w = rd.lfm(5e6, 5e-6, 10e6), fc = 10e9, prf = 10e3;
    const cube = rd.echoes(w, 10e6, prf, 64, fc, [{ range: 3000, speed: 20, amp: 1 }, { range: 6000, speed: -40, amp: 1 }], 0, rand);
    const m = rd.rangeDoppler(cube, w, 10e6, prf, fc);
    const peakNear = (R: number) => { let best = -Infinity, at = [0, 0]; for (let k = 0; k < m.cols; k++) for (let i = 0; i < m.rows; i++) if (Math.abs(m.range[i] - R) < 300 && m.map[i + k * m.rows] > best) { best = m.map[i + k * m.rows]; at = [i, k]; } return at; };
    for (const [R, v] of [[3000, 20], [6000, -40]]) {
      const [i, k] = peakNear(R);
      expect(Math.abs(m.range[i] - R)).toBeLessThanOrEqual(15);
      expect(Math.abs(m.speed[k] - v)).toBeLessThan(2.4);
    }
    // Exponential noise: CA-CFAR's false-alarm rate is (1 + α/N)^−N = pfa exactly.
    const n = 200_000, p = Float64Array.from({ length: n }, () => -Math.log(1 - rand()));
    p[5000] = 200; p[90000] = 200;
    const r = rd.cfar(p, 2, 16, 1e-3), hits = r.detections.reduce((s, v) => s + v, 0);
    expect(r.detections[5000]).toBe(1); expect(r.detections[90000]).toBe(1);
    expect(hits).toBeGreaterThan(100); expect(hits).toBeLessThan(320);
  });

  it('the ambiguity function is 1 at the origin; chirp sweeps', () => {
    const w = rd.lfm(1e6, 20e-6, 4e6), a = rd.ambiguity(w[0], w[1], 4e6), D = a.delays.length, z = a.dopplers.indexOf(0), t0 = (D - 1) / 2;
    expect(a.mag[t0 + z * D]).toBeCloseTo(1, 9);
    expect(Math.max(...a.mag)).toBeLessThanOrEqual(1 + 1e-9);
    expect(rd.chirp(0, 10, 1, 100)).toBeCloseTo(1, 12);
    // Linear: the phase at t is 2π(f0 t + (f1 − f0) t² / 2 t1).
    expect(rd.chirp(0.3, 10, 1, 100)).toBeCloseTo(Math.cos(2 * Math.PI * (3 + 90 * 0.09 / 2)), 12);
  });

  it('in the language', () => {
    const r = run("rng(4)\nc = physconst('LightSpeed'); fc = 10e9; lambda = freq2wavelen(fc);\nsnr = radareqsnr(lambda, 50e3, 1e6, 1e-6, 'Gain', 30);\nR = radareqrng(lambda, snr, 1e6, 1e-6, 'Gain', 30);\nfs = 10e6; prf = 10e3; w = lfmpulse(5e6, 5e-6, fs);\nx = radarecho(w, fs, prf, 32, fc, [3000 20 1], 'SNR', 0);\n[M, rng_, spd] = rangedoppler(x, w, fs, prf, fc);\n[~, k] = max(M(:)); [i, j] = ind2sub(size(M), k);\nfound = [rng_(i) spd(j)];\nres = bw2rangeres(5e6); fd = speed2dop(2*20, lambda); p = db2pow(pow2db(7));\n[det, th] = cfar(abs(pulsecompress(x(:,1), w)).^2, 2, 10, 1e-4);\nrangedoppler(x, w, fs, prf, fc)\nfigure; ambgfun(lfmpulse(1e6, 10e-6, 4e6), 4e6)\nfigure; t = 0:1e-3:1; plot(t, chirp(t, 0, 1, 50))");
    expect(r.d('snr')[0]).toBeCloseTo(12.58, 2);
    expect(r.d('R')[0]).toBeCloseTo(50e3, -1);
    expect(Math.abs(r.d('found')[0] - 3000)).toBeLessThanOrEqual(15);
    expect(Math.abs(r.d('found')[1] - 20)).toBeLessThan(5);
    expect(r.d('res')[0]).toBeCloseTo(29.98, 2);
    expect(r.d('fd')[0]).toBeCloseTo(2 * 20 / (rd.C / 10e9), 6);
    expect(r.d('p')[0]).toBeCloseTo(7, 12);
    expect(r.d('det').some((v) => v === 1)).toBe(true);
    expect(r.graphics.figures.length).toBe(3);
    const s = run('[r, c] = ind2sub([3 4], [5 12]); k = sub2ind([3 4], r, c); [a, b, d] = ind2sub([2 3 4], 17);');
    expect(s.d('r')).toEqual([2, 3]); expect(s.d('c')).toEqual([2, 4]); expect(s.d('k')).toEqual([5, 12]);
    expect([s.d('a')[0], s.d('b')[0], s.d('d')[0]]).toEqual([1, 3, 3]);
  });
});
