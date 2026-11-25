import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ch from './chem';
import { ros23 } from './sci-num';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion chemistry and reactors (M495)', () => {
  it('solves the Robertson problem (the classic stiff test) to its published values', () => {
    const f = (_: number, [a, b, c]: number[]) => [-0.04 * a + 1e4 * b * c, 0.04 * a - 1e4 * b * c - 3e7 * b * b, 3e7 * b * b];
    const r = ros23(f, 0, 40, [1, 0, 0], 1e-6, 1e-10);
    const y = r.y[r.y.length - 1];
    // Hairer and Wanner: y(40) = 0.7158, 9.185e-6, 0.2842.
    expect(y[0]).toBeCloseTo(0.7158, 3);
    expect(y[1] / 9.185e-6).toBeCloseTo(1, 2);
    expect(y[2]).toBeCloseTo(0.2842, 3);
    expect(r.steps).toBeLessThan(2000);
  });
  it('parses mechanisms and runs batch, PFR and CSTR against the closed forms', () => {
    const m = ch.parseMechanism('A -> B; 2 B <-> C');
    expect(m.species).toEqual(['A', 'B', 'C']);
    expect(ch.rateCount(m)).toBe(3);
    // First order A → B: batch/PFR c = c0 e^(−kτ), CSTR c = c0 / (1 + kτ).
    const one = ch.parseMechanism('A -> B');
    const b = ch.batch(one, [0.5], [2, 0], 3);
    expect(b.y[b.y.length - 1][0]).toBeCloseTo(2 * Math.exp(-1.5), 4);
    expect(ch.cstr(one, [0.5], [2, 0], 3).c[0]).toBeCloseTo(2 / 2.5, 10);
    // Second order 2A → B in a CSTR: k τ c² + c − c_in = 0 (rate of A is −2k c²).
    const two = ch.parseMechanism('2 A -> B'), k = 0.3, tau = 4, cin = 1.5;
    const want = (-1 + Math.sqrt(1 + 8 * k * tau * cin)) / (4 * k * tau);
    expect(ch.cstr(two, [k], [cin, 0], tau).c[0]).toBeCloseTo(want, 9);
  });
  it('Arrhenius and its fit', () => {
    const T = [300, 320, 340, 360], k = T.map((t) => ch.arrhenius(1e10, 75e3, t));
    const f = ch.arrheniusFit(T, k);
    expect(f.Ea).toBeCloseTo(75e3, 3);
    expect(f.A / 1e10).toBeCloseTo(1, 9);
    // The rule of thumb: about twice as fast for 10 K near room temperature at ~50 kJ/mol.
    expect(ch.arrhenius(1, 52.9e3, 308) / ch.arrhenius(1, 52.9e3, 298)).toBeCloseTo(2, 1);
  });
  it('equilibria and pH', () => {
    const r = ch.equilibrium(ch.parseMechanism('A <-> B'), [4], [1, 0]);
    expect(r.c[1] / r.c[0]).toBeCloseTo(4, 9);
    expect(r.c[0] + r.c[1]).toBeCloseTo(1, 12);
    // A + B ⇌ C with K = 10 from 1, 1: x / (1 − x)² = 10.
    const s = ch.equilibrium(ch.parseMechanism('A + B <-> C'), [10], [1, 1, 0]);
    expect(s.c[2] / (s.c[0] * s.c[1])).toBeCloseTo(10, 8);
    expect(s.c[2]).toBeCloseTo((21 - Math.sqrt(41)) / 20, 9);
    // Two reactions at once.
    const t = ch.equilibrium(ch.parseMechanism('A <-> B; B <-> C'), [2, 3], [1, 0, 0]);
    expect(t.c[1] / t.c[0]).toBeCloseTo(2, 8);
    expect(t.c[2] / t.c[1]).toBeCloseTo(3, 8);
    // Acetic acid, 0.1 M, Ka 1.8e-5: pH 2.87; pure water 7; 0.01 M strong acid 2.
    expect(ch.acidPH(1.8e-5, 0.1)).toBeCloseTo(2.875, 2);
    expect(ch.acidPH(1.8e-5, 0)).toBeCloseTo(7, 6);
    expect(ch.acidPH(Infinity, 0.01)).toBeCloseTo(2, 6);
  });
  it('in the language', () => {
    const r = run("[t, y] = ode15s(@(t, y) [-0.04*y(1) + 1e4*y(2)*y(3); 0.04*y(1) - 1e4*y(2)*y(3) - 3e7*y(2)^2; 3e7*y(2)^2], [0 40], [1 0 0], odeset('RelTol', 1e-5, 'AbsTol', 1e-10)); y1 = y(end, 1);\n[t2, C] = batchReactor('A -> B', 0.5, [2 0], 3); a = C(end, 1);\n[Cs, names] = cstrReactor('A -> B', 0.5, [2 0], [1 3]); c3 = Cs(2, 1);\n[A, Ea] = arrheniusFit([300 350], arrhenius(1e9, 60e3, [300 350]));\n[c] = chemEquilibrium('A <-> B', 4, [1 0]); pH = acidPH(1.8e-5, 0.1);\nkineticsSim('A -> B; B -> C', [1 0.2], [1 0 0], 20)");
    expect(r.d('y1')[0]).toBeCloseTo(0.7158, 3);
    expect(r.d('a')[0]).toBeCloseTo(2 * Math.exp(-1.5), 4);
    expect(r.d('c3')[0]).toBeCloseTo(0.8, 9);
    expect(r.d('Ea')[0]).toBeCloseTo(60e3, 4);
    expect(r.d('c')[1]).toBeCloseTo(0.8, 9);
    expect(r.graphics.figures.length).toBe(1);
  });
});
