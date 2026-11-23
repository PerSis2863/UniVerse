import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './dsp-lab';
import * as dsp from './dsp';

const run = (code: string) => { const graphics = new Graphics(); const lab = new Lab({ out: () => {}, graphics }); lab.run(code); return { graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const close = (a: number[], b: number[], tol: number) => { expect(a.length).toBe(b.length); a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol)); };

describe('Hyperion: peaks, SVD and filter design (M475)', () => {
  it('finds peaks (a plateau once) with heights, places and options', () => {
    const r = run('[p, l] = findpeaks([1 3 2 5 4 4 6 1]);\n[q, m] = findpeaks([0 2 2 0 1 0]);\n[t, u] = findpeaks([1 3 2 5 4 4 6 1], \'MinPeakHeight\', 4, \'SortStr\', \'descend\');\n[v, w] = findpeaks([0 5 0 4 0 6 0], \'MinPeakDistance\', 3);');
    expect(r.d('p')).toEqual([3, 5, 6]); expect(r.d('l')).toEqual([2, 4, 7]);
    expect(r.d('m')).toEqual([2, 5]);
    expect(r.d('t')).toEqual([6, 5]);
    expect(r.d('v')).toEqual([5, 6]);
    expect(dsp.findPeaks([0, 4, 3, 5, 0], { minProminence: 2 }).map((q) => q.i)).toEqual([3]);
  });
  it('svd: the singular values, and U·S·Vᵀ gives the matrix back', () => {
    const A = [[1, 2], [3, 4], [5, 6]], r = dsp.svd(A);
    close(r.S, [9.525518091565107, 0.514300580658644], 1e-12);
    const back = A.map((row, i) => row.map((_, j) => r.S.reduce((s, sv, k) => s + r.U[i][k] * sv * r.V[j][k], 0)));
    close(back.flat(), A.flat(), 1e-12);
    const l = run('A = [2 0 1; 1 3 2];\ns = svd(A);\n[U, S, V] = svd(A);\nE = U*S*V\' - A;\n[u, e, v] = svd(magic(4), \'econ\');');
    expect(Math.max(...l.d('E').map(Math.abs))).toBeLessThan(1e-12);
    expect(l.d('s')).toHaveLength(2);
    expect(l.d('e')).toHaveLength(16);
  });
  it('butter matches the textbook coefficients; band filters pass their band', () => {
    const lo = dsp.butter(2, [0.2]);
    close(lo.b, [0.0674552738890719, 0.134910547778144, 0.0674552738890719], 1e-12);
    close(lo.a, [1, -1.14298050253990, 0.412801598096189], 1e-12);
    const hi = dsp.butter(2, [0.2], 'high');
    close(hi.b, [0.638945525159022, -1.27789105031804, 0.638945525159022], 1e-12);
    const gain = (f: { b: number[]; a: number[] }, w: number) => { const h = (c: number[]) => { let re = 0, im = 0; c.forEach((v, k) => { re += v * Math.cos(w * k); im -= v * Math.sin(w * k); }); return Math.hypot(re, im); }; return h(f.b) / h(f.a); };
    const bp = dsp.butter(3, [0.2, 0.4], 'bandpass'), bs = dsp.butter(3, [0.2, 0.4], 'stop');
    expect(bp.a).toHaveLength(7);
    expect(gain(bp, Math.PI * 0.29)).toBeGreaterThan(0.97);
    expect(gain(bp, 0.01)).toBeLessThan(1e-3);
    expect(gain(bs, Math.PI * 0.29)).toBeLessThan(0.05);
    expect(gain(bs, 0.01)).toBeGreaterThan(0.999);
  });
  it('filtfilt and lowpass keep a slow wave in place and take the fast one out', () => {
    const r = run('fs = 1000; t = (0:999)/fs;\nslow = sin(2*pi*5*t);\nx = slow + 0.5*sin(2*pi*120*t);\ny = lowpass(x, 20, fs);\nerr = max(abs(y(100:900) - slow(100:900)));\nz = highpass(x, 60, fs);\nfast = max(abs(z(100:900)));\n[b, a] = butter(4, 0.1);\nw = filtfilt(b, a, slow);\nlag = max(abs(w(100:900) - slow(100:900)));');
    expect(r.d('err')[0]).toBeLessThan(0.01);
    expect(Math.abs(r.d('fast')[0] - 0.5)).toBeLessThan(0.02);
    expect(r.d('lag')[0]).toBeLessThan(0.01);
    const d = run("findpeaks(sin(0:0.1:20))\nfigure; lowpass(randn(1, 500), 0.2)");
    expect(d.graphics.figures.length).toBe(2);
  });
});
