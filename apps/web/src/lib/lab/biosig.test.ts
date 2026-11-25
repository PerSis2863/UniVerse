import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as bs from './biosig';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
let seed = 3;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('Hyperion biosignals (M499)', () => {
  it('Butterworth biquads: −3 dB at the cut-off', () => {
    const fs = 1000, f = 50, x = Array.from({ length: 4000 }, (_, i) => Math.sin((2 * Math.PI * f * i) / fs));
    for (const kind of ['low', 'high'] as const) {
      const y = bs.runBiquad(x, bs.biquad(kind, f, fs)), amp = Math.max(...y.slice(3000));
      expect(amp).toBeCloseTo(Math.SQRT1_2, 2);
    }
  });
  it('Pan–Tompkins finds every beat, even with noise and wander', () => {
    for (const [hr, extra] of [[60, {}], [110, { noise: 0.08, wander: 0.4, mains: 0.05 }]] as const) {
      const fs = 360, e = bs.ecgSynth(fs, 60, hr, rand, extra), r = bs.panTompkins(e.x, fs), found = r.r.map((i) => i / fs);
      const hit = e.beats.filter((b) => b > 0.5 && b < 59.5 && found.some((f) => Math.abs(f - b) < 0.03)).length, truth = e.beats.filter((b) => b > 0.5 && b < 59.5).length;
      expect(hit / truth).toBeGreaterThan(0.98);
      expect(found.length).toBeLessThanOrEqual(e.beats.length + 1);
    }
  });
  it('HRV: the time measures by hand, breathing shows as HF power', () => {
    const rr = [0.8, 0.85, 0.79, 0.9, 0.82, 0.8, 0.86, 0.81, 0.84, 0.8];
    const h = bs.hrv(rr), ms = rr.map((v) => v * 1000), d = ms.slice(1).map((v, i) => v - ms[i]);
    expect(h.rmssd).toBeCloseTo(Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length), 9);
    expect(h.pnn50).toBeCloseTo((100 * d.filter((v) => Math.abs(v) > 50).length) / d.length, 9);
    expect(h.hr).toBeCloseTo(60 / (rr.reduce((s, v) => s + v, 0) / rr.length), 9);
    const t: number[] = []; let acc = 0;
    const resp = Array.from({ length: 400 }, () => { const v = 0.85 + 0.05 * Math.sin(2 * Math.PI * 0.25 * acc); acc += v; t.push(acc); return v; });
    const b = bs.hrv(resp);
    expect(b.hf).toBeGreaterThan(10 * b.lf);
  });
  it('Welch and EEG bands: a 10 Hz sine is alpha with power A²/2', () => {
    const fs = 256, x = Array.from({ length: fs * 20 }, (_, i) => 20 * Math.sin((2 * Math.PI * 10 * i) / fs));
    const r = bs.eegBands(x, fs);
    expect(r.names[r.relative.indexOf(Math.max(...r.relative))]).toBe('Alpha');
    expect(r.power[2]).toBeCloseTo(200, -1);
  });
  it('compression: 20 dB over the threshold at 2:1 comes out 10 dB over', () => {
    const fs = 16000, x = Array.from({ length: fs }, (_, i) => 10 ** (-10 / 20) * Math.sin((2 * Math.PI * 1000 * i) / fs));
    const y = bs.wdrc(x, fs, -30, 2), out = 20 * Math.log10(Math.max(...y.slice(fs / 2).map(Math.abs)));
    expect(out).toBeCloseTo(-20, 0);
    // Below the threshold nothing but the gain changes.
    const q = x.map((v) => v / 100), yq = bs.wdrc(q, fs, -30, 2, 0.005, 0.05, 6);
    expect(Math.max(...yq.slice(fs / 2)) / Math.max(...q)).toBeCloseTo(10 ** (6 / 20), 2);
    const ha = bs.hearingAid(x, fs, [500, 2000], [0, 0, 0], 0, 1);
    expect(Math.max(...ha.slice(fs / 2))).toBeCloseTo(Math.max(...x), 1);
  });
  it('in the language', () => {
    const r = run("rng(2); [x, t, beats] = ecgSynth(360, 30, 75); [idx, tt, rr] = panTompkins(x, 360); n = numel(tt); nb = numel(beats);\nh = hrvMetrics(rr); hr = h.HeartRate; e = eegSynth(256, 10, [10 30]); [p, rel] = eegBandPower(e, 256); a = rel(3);\npatientMonitor(x, 360)\nfigure; panTompkins(x, 360)");
    expect(Math.abs(r.d('n')[0] - r.d('nb')[0])).toBeLessThanOrEqual(1);
    expect(r.d('hr')[0]).toBeCloseTo(75, -1);
    expect(r.d('a')[0]).toBeGreaterThan(0.5);
    expect(r.graphics.figures.length).toBe(2);
  });
});
