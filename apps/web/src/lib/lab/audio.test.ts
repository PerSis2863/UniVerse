import { describe, expect, it } from 'vitest';
import * as A from './audio';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './audio-lab';

describe('Hyperion test and measurement (M473)', () => {
  it('WAV files go out and back at every depth', () => {
    const x = Float32Array.from({ length: 300 }, (_, i) => 0.9 * Math.sin(i / 7)), y = Float32Array.from(x, (v) => -v / 2);
    for (const [bits, float, tol] of [[8, false, 1 / 100], [16, false, 1 / 30000], [24, false, 1e-6], [32, false, 1e-7], [32, true, 1e-7], [64, true, 1e-7]] as const) {
      const w = A.decodeWav(A.encodeWav([x, y], 44100, bits, float));
      expect(w.fs).toBe(44100); expect(w.bits).toBe(bits); expect(w.channels.length).toBe(2);
      expect(Math.max(...w.channels[0].map((v, i) => Math.abs(v - x[i])))).toBeLessThan(tol);
      expect(Math.max(...w.channels[1].map((v, i) => Math.abs(v - y[i])))).toBeLessThan(tol);
    }
    expect(() => A.decodeWav(new Uint8Array(20))).toThrow(/WAV/);
  });
  it('readings: level, the strongest frequency between bins, distortion', () => {
    expect(A.rmsDb(Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / 48000)))).toBeCloseTo(-3.0103, 3);
    // A spectrum peaked a third of the way between bins 100 and 101 (a parabola in dB).
    const db = Array.from({ length: 512 }, (_, k) => -((k - 100.3) ** 2));
    expect(A.peakFrequency(db, 1024, 1024).hz).toBeCloseTo(100.3, 6);
    const p = new Array(513).fill(0); p[50] = 1; p[100] = 0.01; p[150] = 0.0001;
    expect(A.thdPercent(p)).toBeCloseTo(100 * Math.sqrt(0.0101), 6);
  });
  it('audiowrite, audioread, audioinfo and thd in scripts', () => {
    let out = '', played = 0;
    const files = new FileStore();
    const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files, sound: (c) => { played = c[0].length; } });
    lab.run(`fs = 8000; t = (0:fs-1)'/fs; y = [0.5*sin(2*pi*440*t) + 0.005*sin(2*pi*880*t), 0.2*cos(2*pi*100*t)];
      audiowrite('a.wav', y, fs, 'BitsPerSample', 24); [z, f2] = audioread('a.wav'); part = audioread('a.wav', [11 20]); info = audioinfo('a.wav');
      d = thd(z(:,1), fs); soundsc(y(:,1), fs);`);
    const v = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(v('f2')).toEqual([8000]);
    expect(toMat(lab.vars.get('z')!).c).toBe(2);
    expect(v('part').length).toBe(20);
    expect(v('d')[0]).toBeCloseTo(20 * Math.log10(0.01), 0);
    expect(played).toBe(8000);
    expect(out).toBe('');
  });
});
