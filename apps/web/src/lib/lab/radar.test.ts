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

describe('antenna arrays and direction finding (M438)', () => {
  let seed = 11;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  it('patterns: an 8-element line’s beam is 0.886λ/(Nd) wide, its first side lobe −12.8 dB; steering moves it; a taper lowers the side lobes', async () => {
    const ar = await import('./arrays');
    const pos = ar.ula(8), azs = Array.from({ length: 18001 }, (_, i) => -90 + i * 0.01), p = ar.pattern(pos, ar.steer(pos, 0), azs);
    expect(ar.beamwidth(azs, p)).toBeCloseTo((0.886 / 4) * (180 / Math.PI), 0);
    expect(Math.max(...p.filter((_, i) => Math.abs(azs[i]) > 16))).toBeCloseTo(-12.8, 1);
    const p30 = ar.pattern(pos, ar.steer(pos, 30), azs);
    expect(azs[p30.indexOf(0)]).toBeCloseTo(30, 6);
    const w = ar.steer(pos, 0), ham = pos.map((_, k) => 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / 7));
    const ph = ar.pattern(pos, { re: w.re.map((v, k) => v * ham[k]), im: w.im.map((v, k) => v * ham[k]) }, azs);
    expect(Math.max(...ph.filter((_, i) => Math.abs(azs[i]) > 30))).toBeLessThan(-22);
  });
  it('direction finding: MUSIC and MVDR split two sources 7° apart that the scanned beam can’t', async () => {
    const ar = await import('./arrays');
    const pos = ar.ula(10), { X, R: Rtrue } = ar.sensorSignals(pos, 400, [{ az: 0, power: 1 }, { az: 7, power: 1 }], 0.1, rand), R = ar.covariance(X), g = Array.from({ length: 1801 }, (_, i) => -90 + i * 0.1);
    const music = ar.peaks(g, ar.spectrum(R, pos, g, 'music', 2), 2), mvdr = ar.peaks(g, ar.spectrum(R, pos, g, 'mvdr'), 2), scan = ar.peaks(g, ar.spectrum(R, pos, g, 'beamscan'), 2);
    expect(Math.abs(music[0])).toBeLessThan(0.5); expect(Math.abs(music[1] - 7)).toBeLessThan(0.5);
    expect(Math.abs(mvdr[0])).toBeLessThan(1); expect(Math.abs(mvdr[1] - 7)).toBeLessThan(1);
    expect(scan.some((x) => x > 1 && x < 6)).toBe(true); // one merged peak in between
    // With the true covariance MUSIC is exact.
    expect(ar.peaks(g, ar.spectrum(Rtrue, pos, g, 'music', 2), 2).map((x) => Math.round(x * 100) / 100)).toEqual([0, 7]);
  });
  it('in the language', () => {
    const r = run("rng(3); pos = (0:9)*0.5;\na = steervec(pos, [0 30]);\nn = size(a); m = abs(a(1,2));\n[X, Rt] = sensorsig(pos, 500, [-20 25], 0.05);\nR = X'*X/500;\ndoa = musicdoa(R, 2);\nP = spatialspectrum(R, pos, -90:0.5:90, 'Method', 'mvdr');\np = arraypattern(pos, steervec(pos, 25).*hamming(10), -90:0.1:90);\n[~, k] = max(p); beam = -90 + (k-1)*0.1;\narraypattern(pos, steervec(pos, 25))\nfigure; spatialspectrum(R, pos, 'Method', 'music', 'NumSignals', 2)");
    expect(r.d('n')).toEqual([10, 2]); expect(r.d('m')[0]).toBeCloseTo(1, 12);
    expect(Math.abs(r.d('doa')[0] + 20)).toBeLessThan(0.5); expect(Math.abs(r.d('doa')[1] - 25)).toBeLessThan(0.5);
    expect(r.d('P').length).toBe(361);
    expect(r.d('beam')[0]).toBeCloseTo(25, 0);
    expect(r.graphics.figures.length).toBe(2);
    expect(() => run('musicdoa(eye(4), 4)')).toThrow(/1 to N/);
  });
});

describe('clutter, FMCW, grouping and tracking (M460)', () => {
  let seed = 5;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  it('FMCW: two cars found at their range (c/2B = 0.5 m cells) and speed; grouped into one detection each', async () => {
    const tk = await import('./tracking');
    const b = tk.fmcwBeat(300e6, 40e-6, 10e6, 77e9, 128, [{ range: 30, speed: 5, amp: 1 }, { range: 60, speed: -10, amp: 1 }], 0, rand);
    const m = tk.fmcwMap(b.re, b.im, b.rows, b.cols, 300e6, 40e-6, 10e6, 77e9), top = Math.max(...m.map);
    expect(m.range[1]).toBeCloseTo(0.5, 3);
    const found = tk.groupDetections(Float64Array.from(m.map, (v) => (v > top - 6 ? 1 : 0)), m.map, m.rows, m.cols).map(([r, c]) => [m.range[r], m.speed[c]]).sort((x, y) => x[0] - y[0]);
    expect(found).toHaveLength(2);
    expect(Math.abs(found[0][0] - 30)).toBeLessThan(0.5); expect(Math.abs(found[0][1] - 5)).toBeLessThan(0.4);
    expect(Math.abs(found[1][0] - 60)).toBeLessThan(0.5); expect(Math.abs(found[1][1] + 10)).toBeLessThan(0.4);
  });
  it('a three-pulse canceller takes still clutter away (over 60 dB at zero speed)', async () => {
    const tk = await import('./tracking');
    const w = rd.lfm(5e6, 5e-6, 10e6), cube = rd.echoes(w, 10e6, 10e3, 64, 10e9, [{ range: 3000, speed: 20, amp: 1 }], 0, rand, 30);
    const f = tk.mti(cube.re, cube.im, cube.rows, cube.cols, 3);
    const zero = (r: ReturnType<typeof rd.rangeDoppler>) => { const k = r.speed.reduce((b, s, i) => (Math.abs(s) < Math.abs(r.speed[b]) ? i : b), 0); let s = 0; for (let i = 100; i < r.rows; i++) s += 10 ** (r.map[i + k * r.rows] / 10); return 10 * Math.log10(s); };
    expect(zero(rd.rangeDoppler(cube, w, 10e6, 10e3, 10e9)) - zero(rd.rangeDoppler({ rows: cube.rows, cols: f.cols, re: f.re, im: f.im }, w, 10e6, 10e3, 10e9))).toBeGreaterThan(60);
  });
  it('a Kalman filter beats the raw measurements; the tracker keeps two targets and drops false alarms quickly', async () => {
    const tk = await import('./tracking');
    const truth = Array.from({ length: 100 }, (_, k) => [k * 10, 500 - k * 5]), Z = truth.map(([x, y]) => [x + 10 * g(), y + 10 * g()] as [number, number]);
    const X = tk.kalmanTrack(Z, 1, 0.1, 10), rmse = (a: number[][]) => Math.sqrt(a.slice(20).reduce((s, v, k) => s + (v[0] - truth[k + 20][0]) ** 2 + (v[1] - truth[k + 20][1]) ** 2, 0) / 160);
    expect(rmse(X)).toBeLessThan(0.6 * rmse(Z));
    expect(Math.abs(X[99][2] - 10)).toBeLessThan(1.5); expect(Math.abs(X[99][3] + 5)).toBeLessThan(1.5);
    const scans: [number, number][][] = Array.from({ length: 60 }, (_, k) => [[k * 20 + 5 * g(), k * 10 + 5 * g()], [k * 20 + 5 * g(), 600 - k * 10 + 5 * g()], ...Array.from({ length: 3 }, (): [number, number] => [rand() * 1200, rand() * 600])]);
    const out = tk.multiTrack(scans, 1, { q: 1, r: 5, vmax: 40 }), ids = [...new Set(out.map((o) => o.id))], len = (id: number) => out.filter((o) => o.id === id).length;
    const long = ids.filter((id) => len(id) > 40);
    expect(long).toHaveLength(2);
    expect(ids.filter((id) => len(id) <= 40).every((id) => len(id) < 10)).toBe(true);
    // Each long track stays on its own target (they cross at scan 30).
    for (const id of long) { const pts = out.filter((o) => o.id === id), up = pts[pts.length - 1].y > 300; expect(pts.every((p) => Math.abs(p.y - (up ? p.scan - 1 : 60 - (p.scan - 1)) * 10) < 40)).toBe(true); }
  }, 20_000);
  it('in the language', () => {
    const r = run("rng(2); x = fmcwbeat(300e6, 40e-6, 10e6, 77e9, 64, [30 5 1; 60 -10 1], 'SNR', 0);\n[M, rr, ss] = fmcwrangedoppler(x, 300e6, 40e-6, 10e6, 77e9);\nP = groupdetections(M > max(M(:)) - 6, M);\nn = size(P, 1);\nw = lfmpulse(5e6, 5e-6, 10e6); e = radarecho(w, 10e6, 10e3, 16, 10e9, [3000 20 1], 'Clutter', 30);\nm = mtifilter(e, 2); c = size(m, 2);\nd = groupdetections([0 1 1 0 0 1 0], [0 2 5 0 0 3 0]);\nt = (0:49)'; Z = [t*10 + randn(50,1)*5, 300 - t*4 + randn(50,1)*5];\nX = trackkalman(Z, 1, 'ProcessNoise', 0.1, 'MeasurementNoise', 5);\ntr = trackmulti({[0 0; 100 100], [10 5; 100 95], [20 10; 100 90], [30 15; 100 85], [40 20; 100 80]}, 1, 'MeasurementNoise', 2);\nk = numel(tr.Track);\nfmcwrangedoppler(x, 300e6, 40e-6, 10e6, 77e9)\nfigure; trackkalman(Z, 1)");
    expect(r.d('n')).toEqual([2]);
    expect(r.d('c')).toEqual([15]);
    expect(r.d('d')).toEqual([3, 6]);
    expect(r.d('X').length).toBe(200);
    expect(r.d('k')[0]).toBeGreaterThanOrEqual(4);
    expect(r.graphics.figures.length).toBe(2);
  });
});
