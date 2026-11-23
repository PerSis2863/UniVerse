import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './grid-lab';
import * as g from './grid';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion power systems and mixed-signal (M426)', () => {
  it('a two-bus load flow matches the closed form; losses balance', () => {
    // 1 pu drawn over a lossless x = 0.1 line, no reactive power at the load: sin 2δ = 0.2, V2 = cos δ.
    const r = g.loadFlow([{ type: 'slack', P: 0, Q: 0, V: 1, angle: 0 }, { type: 'PQ', P: -1, Q: 0, V: 1, angle: 0 }], [{ from: 0, to: 1, r: 0, x: 0.1, b: 0 }]);
    const d = Math.asin(0.2) / 2;
    expect(r.converged).toBe(true);
    expect(r.angle[1]).toBeCloseTo(-d, 9);
    expect(r.V[1]).toBeCloseTo(Math.cos(d), 9);
    expect(r.P[0]).toBeCloseTo(1, 9);
    const lossy = g.loadFlow([{ type: 'slack', P: 0, Q: 0, V: 1.02, angle: 0 }, { type: 'PV', P: 0.4, Q: 0, V: 1.01, angle: 0 }, { type: 'PQ', P: -1.2, Q: -0.5, V: 1, angle: 0 }], [{ from: 0, to: 1, r: 0.02, x: 0.08, b: 0.02 }, { from: 1, to: 2, r: 0.03, x: 0.1, b: 0.02 }, { from: 0, to: 2, r: 0.025, x: 0.09, b: 0.02 }]);
    expect(lossy.converged).toBe(true);
    expect(lossy.V[1]).toBeCloseTo(1.01, 12);
    expect(lossy.P.reduce((s, p) => s + p, 0)).toBeCloseTo(lossy.losses, 9);
    expect(lossy.losses).toBeGreaterThan(0);
  });

  it('a three-phase fault: I = V / (X_source + X_line), the voltage divided along the way', () => {
    const f = g.threePhaseFault(2, [{ from: 0, to: 1, r: 0, x: 0.1, b: 0 }], [{ bus: 0, x: 0.2 }], 1);
    expect(f.current).toBeCloseTo(1 / 0.3, 9);
    expect(f.voltages[1]).toBeCloseTo(0, 9);
    expect(f.voltages[0]).toBeCloseTo(1 - 0.2 / 0.3, 9);
  });

  it('an N-bit converter’s signal-to-noise ratio is 6.02 N + 1.76 dB; a PLL follows a frequency step', () => {
    for (const bits of [8, 12]) {
      const x = Array.from({ length: 20000 }, (_, k) => 0.9999 * Math.sin(2 * Math.PI * 0.01234567 * k)), q = g.adc(x, bits);
      expect(g.snrOf(x, q.values)).toBeCloseTo(6.02 * bits + 1.76, 0);
    }
    const r = g.pll((t) => (t < 0.05 ? 1000 : 1050), 50_000, 15_000, { bandwidth: 50 });
    expect(r.freq.at(-1)!).toBeCloseTo(1050, 1);
    expect(Math.abs(r.err.at(-1)!)).toBeLessThan(1e-3);
    expect(Math.max(...r.freq)).toBeGreaterThan(1050);
  });

  it('in the language', () => {
    const r = run("bus = [3 0 0 1 0; 1 -1 0 1 0];\nlin = [1 2 0 0.1 0];\nres = powerflow(bus, lin);\nv2 = res.V(2); a2 = res.AngleDeg(2);\nf = shortcircuit(2, lin, [1 0.2], 2);\nI = f.FaultCurrent;\nx = 0.9*sin(2*pi*(0:999)/97);\n[c, xq] = adc(x, 10);\ns = snr(x, xq - x);\nback = dac(c, 10);\nsame = max(abs(back - xq));\n[fr, er] = pll([1000*ones(1, 2000) 1020*ones(1, 18000)], 50e3, 20000);\npll(1000, 50e3, 5000)");
    expect(r.d('v2')[0]).toBeCloseTo(Math.cos(Math.asin(0.2) / 2), 8);
    expect(r.d('a2')[0]).toBeCloseTo((-Math.asin(0.2) / 2) * (180 / Math.PI), 6);
    expect(r.d('I')[0]).toBeCloseTo(1 / 0.3, 8);
    expect(r.d('s')[0]).toBeGreaterThan(55);
    expect(r.d('same')).toEqual([0]);
    expect(r.d('fr').at(-1)!).toBeCloseTo(1020, 0);
    expect(r.graphics.figures.length).toBe(1);
    expect(() => run('powerflow([1 0 0 1 0; 1 -1 0 1 0], [1 2 0 0.1 0])')).toThrow(/slack/);
  });
});

describe('unbalanced faults and transformer taps (M435)', () => {
  it('a lone generator: textbook fault currents for every kind', () => {
    // x1 = x2 = 0.2, x0 = 0.05, solidly grounded, bolted faults at its terminals.
    const src = [{ bus: 0, x1: 0.2, x2: 0.2, x0: 0.05 }];
    expect(g.unbalancedFault(1, [], src, 0, '3P').phase[0]).toBeCloseTo(5, 9);
    expect(g.unbalancedFault(1, [], src, 0, 'LG').phase[0]).toBeCloseTo(3 / 0.45, 9);
    expect(g.unbalancedFault(1, [], src, 0, 'LL').phase[1]).toBeCloseTo(Math.sqrt(3) / 0.4, 9);
    // LLG: I1 = 1/(j0.2 + j0.2‖j0.05) = 1/j0.24; I0 = −I1·0.2/0.25; the ground carries 3·I0.
    const llg = g.unbalancedFault(1, [], src, 0, 'LLG');
    expect(llg.seq[1]).toBeCloseTo(1 / 0.24, 9); expect(llg.seq[0]).toBeCloseTo((1 / 0.24) * 0.8, 9);
    // In a bolted line-to-ground fault phase a's voltage is 0 at the fault.
    expect(g.unbalancedFault(1, [], src, 0, 'LG').voltages[0][0]).toBeCloseTo(0, 9);
    // The same three-phase fault as M426's.
    const lines = [{ from: 0, to: 1, r: 0, x: 0.1, b: 0 }];
    expect(g.unbalancedFault(2, lines, [{ bus: 0, x1: 0.2 }], 1, '3P').phase[0]).toBeCloseTo(g.threePhaseFault(2, lines, [{ bus: 0, x: 0.2 }], 1).current, 9);
    expect(() => g.unbalancedFault(1, [], [{ bus: 0, x1: 0.2, x0: Infinity }], 0, 'LG')).toThrow(/grounded/);
  });
  it('a tap lowers the far side; a tap changer holds its voltage; power still balances', () => {
    const buses = [{ type: 'slack' as const, P: 0, Q: 0, V: 1, angle: 0 }, { type: 'PQ' as const, P: -0.8, Q: -0.4, V: 1, angle: 0 }];
    const line = { from: 0, to: 1, r: 0.01, x: 0.1, b: 0 };
    const plain = g.loadFlow(buses, [line]), tapped = g.loadFlow(buses, [{ ...line, tap: 0.95 }]);
    expect(tapped.V[1]).toBeGreaterThan(plain.V[1]);
    expect(tapped.P.reduce((s, p) => s + p, 0)).toBeCloseTo(tapped.losses, 9);
    const held = g.loadFlowTaps(buses, [line], [{ line: 0, bus: 1, target: 1.0 }]);
    expect(Math.abs(held.V[1] - 1)).toBeLessThanOrEqual(0.00625 / 2 + 1e-9);
    expect(held.taps[0]).toBeLessThan(1);
    // A bus beyond the far side (a town down a line from the transformer), and the ±10 % limit.
    const three = [buses[0], { ...buses[1], P: 0, Q: 0 }, { type: 'PQ' as const, P: -0.6, Q: -0.3, V: 1, angle: 0 }];
    const ls = [{ from: 0, to: 1, r: 0, x: 0.1, b: 0 }, { from: 1, to: 2, r: 0.02, x: 0.15, b: 0 }];
    expect(Math.abs(g.loadFlowTaps(three, ls, [{ line: 0, bus: 2, target: 1 }]).V[2] - 1)).toBeLessThanOrEqual(0.00625 / 2 + 1e-9);
    const heavy = g.loadFlowTaps([three[0], three[1], { ...three[2], P: -0.9, Q: -0.45 }], ls, [{ line: 0, bus: 2, target: 1 }]);
    expect(heavy.taps[0]).toBeCloseTo(0.9, 12);
  });
  it('in the language', () => {
    const r = run("bus = [3 0 0 1 0; 1 -0.8 -0.4 1 0];\nlines = [1 2 0.01 0.1 0 1];\np = powerflow(bus, lines, 'TapControl', [1 2 1.0]);\nv2 = p.V(2); tap = p.Taps(1);\nf = shortcircuit(1, zeros(0, 4), [1 0.2 0.2 0.05], 1, 'Type', 'LG');\nlg = f.FaultCurrent; pc = f.PhaseCurrents;\nll = shortcircuit(1, zeros(0, 4), [1 0.2], 1, 'Type', 'LL').FaultCurrent;");
    expect(Math.abs(r.d('v2')[0] - 1)).toBeLessThan(0.004);
    expect(r.d('tap')[0]).toBeLessThan(1);
    expect(r.d('lg')[0]).toBeCloseTo(3 / 0.45, 9);
    expect(r.d('pc')[1]).toBeCloseTo(0, 9);
    expect(r.d('ll')[0]).toBeCloseTo(Math.sqrt(3) / 0.4, 9);
  });
});

describe('grid stability (M436)', () => {
  it('one machine: the equal-area angle and the critical clearing time agree with the textbook', async () => {
    const st = await import('./stability');
    // H = 5 s, 60 Hz, Pm = 0.8, Pmax = 2, a bolted fault (nothing passes during it), the line back after:
    // δcr = acos((π − 2δ0)·sin δ0 − cos δ0) = 89.37°, t_cr = √(4H(δcr − δ0)/(ωs·Pm)) = 0.276 s.
    const d0 = Math.asin(0.4), dcr = st.criticalAngle(0.8, 2, 0, 2);
    expect((dcr * 180) / Math.PI).toBeCloseTo(89.37, 1);
    const closed = Math.sqrt((4 * 5 * (dcr - d0)) / (2 * Math.PI * 60 * 0.8)), tcr = st.criticalTime({ H: 5, Pm: 0.8, Pmax: 2, during: 0, after: 2, f: 60 });
    expect(Math.abs(tcr - closed)).toBeLessThan(0.003);
    expect(st.swing({ H: 5, Pm: 0.8, Pmax: 2, during: 0, after: 2, clear: tcr - 0.01, f: 60 }).stable).toBe(true);
    expect(st.swing({ H: 5, Pm: 0.8, Pmax: 2, during: 0, after: 2, clear: tcr + 0.01, f: 60 }).stable).toBe(false);
  });
  it('many machines: at rest before the fault, the load flow’s power on each shaft, longer faults swing further', async () => {
    const st = await import('./stability');
    const buses = [{ type: 'slack' as const, P: 0, Q: 0, V: 1.04, angle: 0 }, { type: 'PV' as const, P: 1.63, Q: 0, V: 1.025, angle: 0 }, { type: 'PV' as const, P: 0.85, Q: 0, V: 1.025, angle: 0 }, { type: 'PQ' as const, P: -1.25, Q: -0.5, V: 1, angle: 0 }, { type: 'PQ' as const, P: -0.9, Q: -0.3, V: 1, angle: 0 }, { type: 'PQ' as const, P: -1.0, Q: -0.35, V: 1, angle: 0 }];
    const lines = [{ from: 0, to: 3, r: 0.01, x: 0.085, b: 0.176 }, { from: 0, to: 4, r: 0.017, x: 0.092, b: 0.158 }, { from: 3, to: 5, r: 0.032, x: 0.161, b: 0.306 }, { from: 4, to: 5, r: 0.039, x: 0.17, b: 0.358 }, { from: 1, to: 3, r: 0.0085, x: 0.072, b: 0.149 }, { from: 2, to: 4, r: 0.0119, x: 0.1008, b: 0.209 }, { from: 1, to: 5, r: 0.03, x: 0.12, b: 0.2 }];
    const gens = [{ bus: 0, H: 23.64, xd: 0.0608 }, { bus: 1, H: 6.4, xd: 0.1198 }, { bus: 2, H: 3.01, xd: 0.1813 }];
    const still = st.transient(buses, lines, gens, 3, 0, { T: 1 });
    expect(Math.max(...still.angles.map((a) => Math.max(...a) - Math.min(...a)))).toBeLessThan(1e-9);
    expect(still.Pm[1]).toBeCloseTo(1.63, 6); expect(still.Pm[2]).toBeCloseTo(0.85, 6);
    const peak = (tc: number) => Math.max(...st.transient(buses, lines, gens, 5, tc, { T: 2, trip: 6 }).angles.map((a) => Math.max(...a.map(Math.abs))));
    expect(peak(0.3)).toBeGreaterThan(peak(0.1));
  });
  it('in the language', () => {
    const r = run("[t, d] = swing(5, 0.8, 2, 'During', 0, 'After', 2, 'Clear', 0.2, 'Frequency', 60);\nok = max(d) < 180;\n[tcr, dcr] = criticalclearing(5, 0.8, 2, 0, 2, 60);\nbus = [3 0 0 1.04 0; 2 1.63 0 1.025 0; 1 -1.25 -0.5 1 0];\nlines = [1 3 0.01 0.085 0.176; 2 3 0.0085 0.072 0.149; 1 2 0.03 0.12 0.2];\ns = transientstability(bus, lines, [1 20 0.06; 2 6.4 0.12], 3, 0.1, 'Trip', 3);\nst = s.Stable;\nswing(5, 0.8, 2, 'During', 0, 'Clear', 0.3, 'Frequency', 60)\nfigure; criticalclearing(5, 0.8, 2, 0.5, 1.5)\nfigure; transientstability(bus, lines, [1 20 0.06; 2 6.4 0.12], 3, 0.1)");
    expect(r.d('ok')).toEqual([1]);
    expect(r.d('tcr')[0]).toBeCloseTo(0.276, 2); expect(r.d('dcr')[0]).toBeCloseTo(89.37, 1);
    expect(r.d('st')).toEqual([1]);
    expect(r.graphics.figures.length).toBe(3);
    expect(() => run('swing(5, 2, 1)')).toThrow(/Pmax/);
  });
});

describe('converter imperfections (M437)', () => {
  let seed = 3;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  it('an ideal 10-bit converter: SINAD 6.02N + 1.76 dB, ENOB 10; jitter costs −20·log(2πfσ)', async () => {
    const cv = await import('./convert');
    const N = 8192, fs = 1e6, x = Array.from({ length: N }, (_, n) => 0.999 * Math.sin((2 * Math.PI * 127 * n) / N));
    const ideal = cv.adcMetrics(cv.realAdc(x, 10, -1, 1, {}, rand).values, fs);
    expect(ideal.sinad).toBeCloseTo(61.96, 0); expect(ideal.enob).toBeCloseTo(10, 1);
    expect(ideal.freq).toBeCloseTo((127 * fs) / N, 6);
    const fin = (127 * fs) / N, j = cv.adcMetrics(cv.realAdc(x, 16, -1, 1, { jitter: 5e-9, fs }, rand).values, fs);
    expect(Math.abs(j.snr - -20 * Math.log10(2 * Math.PI * fin * 5e-9))).toBeLessThan(0.5);
    // Uneven code edges add spurs: the spurious-free range falls.
    expect(cv.adcMetrics(cv.realAdc(x, 10, -1, 1, { inl: 0.5 }, rand).values, fs).sfdr).toBeLessThan(ideal.sfdr);
  });
  it('INL and DNL from a sine’s histogram match the edges it was built with', async () => {
    const cv = await import('./convert');
    const xs = Array.from({ length: 2_000_000 }, (_, n) => 1.02 * Math.sin((2 * Math.PI * 7919 * n) / 2_000_000 + 0.1));
    const q = cv.realAdc(xs, 6, -1, 1, { inl: 0.2 }, rand), d = cv.inlDnl(q.codes, 6), L = 64;
    const e = q.edges.map((x, k) => (x - (-1 + (k + 1) * q.lsb)) / q.lsb), ep = e.map((x, k) => x - (e[0] + ((e[L - 2] - e[0]) * k) / (L - 2)));
    // Counting noise (about 20,000 samples a code) leaves a few hundredths of an LSB.
    for (let k = 2; k < L - 2; k++) expect(Math.abs(d.inl[k] - (ep[k - 1] + ep[k]) / 2)).toBeLessThan(0.03);
    const ideal = cv.inlDnl(cv.realAdc(xs, 6, -1, 1, {}, rand).codes, 6);
    expect(Math.max(...ideal.dnl.map(Math.abs))).toBeLessThan(0.02);
  });
  it('a sigma-delta modulator: about 9 dB more for each doubling of oversampling (first order), 15 dB (second)', async () => {
    const cv = await import('./convert');
    const snr = (order: 1 | 2, osr: number) => {
      const n = 4200 * osr, x = Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 17 * i) / (4096 * osr)));
      return cv.adcMetrics(cv.sigmaDelta(x, order, osr).decimated.slice(-4096), 1).snr;
    };
    const g1 = snr(1, 128) - snr(1, 64), g2 = snr(2, 128) - snr(2, 64);
    expect(g1).toBeGreaterThan(6); expect(g1).toBeLessThan(11);
    expect(g2).toBeGreaterThan(12); expect(g2).toBeLessThan(18);
    expect(snr(2, 64)).toBeGreaterThan(snr(1, 64) + 15);
  });
  it('in the language', () => {
    const r = run("rng(1); N = 4096; x = 0.999*sin(2*pi*101*(0:N-1)/N);\n[c, y] = adc(x, 12, [-1 1]);\nm = adcmetrics(y, 1e6); e0 = m.ENOB;\n[c2, y2] = adc(x, 12, [-1 1], 'Noise', 2);\ne1 = adcmetrics(y2, 1e6).ENOB;\nxs = 1.02*sin(2*pi*7919*(0:399999)/400000 + 0.1);\n[cs] = adc(xs, 6, [-1 1], 'INL', 0.2);\n[inl, dnl] = inldnl(cs, 6);\n[b, d] = sigmadelta(0.5*sin(2*pi*(0:65535)/4096), 64, 2);\nadcmetrics(y2, 1e6)\nfigure; inldnl(cs, 6)");
    expect(r.d('e0')[0]).toBeCloseTo(12, 0);
    expect(r.d('e1')[0]).toBeLessThan(r.d('e0')[0] - 1);
    expect(r.d('inl').length).toBe(64);
    expect(new Set(r.d('b'))).toEqual(new Set([1, -1]));
    expect(r.graphics.figures.length).toBe(2);
    expect(() => run("adc(1:3, 8, [-1 1], 'Jitter', 1e-9)")).toThrow(/Fs/);
  });
});
