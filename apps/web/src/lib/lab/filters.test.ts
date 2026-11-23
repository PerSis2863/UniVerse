import { describe, expect, it } from 'vitest';
import * as F from './filters';

const mag = (b: number[], a: number[], f: number) => { const [h] = F.response(b, a, [Math.PI * f]); return Math.hypot(h[0], h[1]); };
const db = (b: number[], a: number[], f: number) => 20 * Math.log10(mag(b, a, f));

describe('filters', () => {
  it('butter matches textbook', () => {
    const { b, a } = F.zpk2tf(F.iir('butter', 2, [0.5], 'low'));
    // butter(2, 0.5): b = [0.2929 0.5858 0.2929], a = [1 0 0.1716]
    expect(b[0]).toBeCloseTo(0.29289, 4); expect(a[2]).toBeCloseTo(0.17157, 4); expect(a[1]).toBeCloseTo(0, 8);
    expect(db(b, a, 0.5)).toBeCloseTo(-3.0103, 3);
  });
  it('cheby1 / cheby2 / ellip edges', () => {
    const c1 = F.zpk2tf(F.iir('cheby1', 5, [0.3], 'low', 1));
    expect(db(c1.b, c1.a, 0.3)).toBeCloseTo(-1, 3); expect(db(c1.b, c1.a, 0)).toBeCloseTo(0, 6);
    const c2 = F.zpk2tf(F.iir('cheby2', 6, [0.4], 'low', 1, 40));
    expect(db(c2.b, c2.a, 0.4)).toBeCloseTo(-40, 3);
    for (let n = 2; n <= 7; n++) {
      const e = F.zpk2tf(F.iir('ellip', n, [0.3], 'low', 0.5, 50));
      expect(db(e.b, e.a, 0.3)).toBeCloseTo(-0.5, 3);
      expect(Math.max(...Array.from({ length: 50 }, (_, i) => db(e.b, e.a, (0.3 * i) / 49)))).toBeLessThan(1e-6);
    }
    const bp = F.zpk2tf(F.iir('butter', 3, [0.2, 0.4], 'bandpass'));
    expect(db(bp.b, bp.a, 0.2)).toBeCloseTo(-3.0103, 3); expect(db(bp.b, bp.a, 0.4)).toBeCloseTo(-3.0103, 3);
    const bs = F.zpk2tf(F.iir('ellip', 3, [0.2, 0.4], 'stop', 1, 40));
    expect(db(bs.b, bs.a, 0.2)).toBeCloseTo(-1, 3);
    const hp = F.zpk2tf(F.iir('cheby1', 4, [0.6], 'high', 2));
    expect(db(hp.b, hp.a, 0.6)).toBeCloseTo(-2, 3);
  });
  it('orders', () => {
    expect(F.order('butter', [0.2], [0.3], 1, 40).n).toBe(12);
    expect(F.order('ellip', [0.2], [0.3], 1, 40).n).toBe(4);
    expect(F.order('cheby1', [0.2], [0.3], 1, 40).n).toBe(6);
  });
  it('fir1, fir2, firpm', () => {
    const h = F.fir1(20, [0.4]);
    expect(h.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    expect(db(h, [1], 0.4)).toBeCloseTo(-6, 0);
    const pm = F.firpm(30, [0, 0.3, 0.4, 1], [1, 1, 0, 0]);
    const pass = Array.from({ length: 60 }, (_, i) => Math.abs(mag(pm.h, [1], 0.3 * i / 59) - 1));
    const stop = Array.from({ length: 60 }, (_, i) => mag(pm.h, [1], 0.4 + 0.6 * i / 59));
    expect(Math.max(...pass)).toBeCloseTo(pm.err, 2); expect(Math.max(...stop)).toBeCloseTo(pm.err, 2);
    const pm2 = F.firpm(31, [0, 0.3, 0.4, 1], [1, 1, 0, 0]);
    expect(Math.max(...Array.from({ length: 60 }, (_, i) => mag(pm2.h, [1], 0.4 + 0.6 * i / 59)))).toBeCloseTo(pm2.err, 2);
    const f2 = F.fir2(40, [0, 0.5, 0.5, 1], [1, 1, 0, 0]);
    expect(mag(f2, [1], 0.1)).toBeCloseTo(1, 1); expect(mag(f2, [1], 0.9)).toBeLessThan(0.02);
  });
  it('filtfilt has zero phase, gd', () => {
    const { b, a } = F.zpk2tf(F.iir('butter', 4, [0.2], 'low'));
    const x = Array.from({ length: 400 }, (_, i) => Math.sin(0.02 * Math.PI * i));
    const y = F.filtfilt(b, a, x);
    expect(Math.max(...Array.from(y.slice(50, 350), (v, i) => Math.abs(v - x[i + 50])))).toBeLessThan(1e-3);
    expect(F.groupDelay([0, 0, 1], [1], [0.3])[0]).toBeCloseTo(2, 10);
    const w = F.welch(Array.from({ length: 4096 }, (_, i) => Math.cos(2 * Math.PI * 100 * i / 1000)), F.hammingW(256), 128, 256, 1000);
    const k = w.pxx.indexOf(Math.max(...w.pxx)); expect(w.f[k]).toBeCloseTo(101.5, 0);
    // Parseval: total power 0.5
    expect(w.pxx.reduce((s, p) => s + p, 0) * (1000 / 256)).toBeCloseTo(0.5, 2);
  });
});

import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './filters-lab';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('filters in the language (M472)', () => {
  it('designs, filters and analyses', () => {
    const r = run(`[b, a] = butter(2, 0.5); [z, p, k] = butter(3, 0.4); [n, Wn] = ellipord(0.2, 0.3, 1, 40);
      d = designfilt('lowpassiir', 'FilterOrder', 4, 'HalfPowerFrequency', 100, 'SampleRate', 1000);
      x = sin(2*pi*10*(0:999)/1000) + 0.5*sin(2*pi*300*(0:999)/1000); y = filtfilt(d, x); y2 = filter(d, x);
      e = designfilt('bandpassfir', 'FilterOrder', 40, 'StopbandFrequency1', 0.1, 'PassbandFrequency1', 0.2, 'PassbandFrequency2', 0.4, 'StopbandFrequency2', 0.5);
      h = fir1(30, [0.2 0.4]); [g, w] = grpdelay(h, 1, 8); [pxx, f] = pwelch(x, 256, 128, 256, 1000); [s, ff, t] = spectrogram(x, 128, 64, 128, 1000);
      freqz(b, a); figure; spectrogram(x, 128, 64, 128, 1000);`);
    expect(r.d('b')[0]).toBeCloseTo(0.29289, 4);
    expect(r.d('k')[0]).toBeGreaterThan(0);
    expect(r.d('n')).toEqual([4]);
    const y = r.d('y'), x = r.d('x');
    // The 300 Hz part is gone, the 10 Hz part kept in place (no phase shift).
    expect(Math.max(...y.slice(100, 900).map((v, i) => Math.abs(v - Math.sin((2 * Math.PI * 10 * (i + 100)) / 1000))))).toBeLessThan(0.02);
    expect(x.length).toBe(1000);
    expect(r.d('g').every((v) => Math.abs(v - 15) < 1e-9)).toBe(true);
    const pxx = r.d('pxx'), f = r.d('f');
    expect(f[pxx.indexOf(Math.max(...pxx))]).toBeCloseTo(11.7, 0);
    expect(r.d('ff').length).toBe(65);
    expect(r.graphics.figures.length).toBe(2);
  });
});
