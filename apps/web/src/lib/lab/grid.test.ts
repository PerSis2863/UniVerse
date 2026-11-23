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
