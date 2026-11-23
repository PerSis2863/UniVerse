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
