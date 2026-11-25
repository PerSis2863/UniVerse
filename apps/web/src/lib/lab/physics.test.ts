import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as ph from './physics';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion physics (M497)', () => {
  it('a projectile: the textbook range, height and time; drag shortens it', () => {
    const r = ph.projectile(20, 30, 0, 9.81);
    expect(r.range).toBeCloseTo((400 * Math.sin(Math.PI / 3)) / 9.81, 6);
    expect(r.top).toBeCloseTo((400 * 0.25) / (2 * 9.81), 3);
    expect(r.flight).toBeCloseTo((2 * 20 * 0.5) / 9.81, 8);
    const d = ph.projectile(20, 30, 0.02, 9.81);
    expect(d.range).toBeLessThan(r.range * 0.9);
    // From a 10 m cliff, horizontally: t = √(2h/g).
    expect(ph.projectile(5, 0.0001, 0, 9.81, 10).flight).toBeCloseTo(Math.sqrt(20 / 9.81), 3);
  });
  it('the pendulum: exact period, and the simulation agrees', () => {
    expect(ph.ellipticK(0)).toBeCloseTo(Math.PI / 2, 14);
    const T0 = 2 * Math.PI * Math.sqrt(1 / 9.81);
    expect(ph.pendulumPeriod(1, 0.01)).toBeCloseTo(T0, 8);
    expect(ph.pendulumPeriod(1, 90) / T0).toBeCloseTo(1.180340599, 8);
    // Time between two upward zero crossings of the simulated 90° swing.
    const t = Array.from({ length: 20001 }, (_, i) => i * 0.0005), s = ph.pendulum(1, 90, t), up: number[] = [];
    for (let i = 1; i < t.length; i++) if (s[i - 1][0] < 0 && s[i][0] >= 0) up.push(t[i - 1] + (t[i] - t[i - 1]) * (-s[i - 1][0] / (s[i][0] - s[i - 1][0])));
    expect(up[1] - up[0]).toBeCloseTo(ph.pendulumPeriod(1, 90), 4);
  });
  it('the double pendulum keeps its energy', () => {
    const r = ph.doublePendulum(1, 1, 1, 1, 120, -20, Array.from({ length: 101 }, (_, i) => i * 0.1));
    r.energy.forEach((e) => expect(Math.abs(e - r.energy[0])).toBeLessThan(1e-6 * Math.abs(r.energy[0]) + 1e-6));
  });
  it('gravity: the Earth goes round the Sun in a year, energy bounded', () => {
    const M = 1.989e30, AU = 1.496e11, v = Math.sqrt((ph.G_NEWTON * M) / AU), year = 2 * Math.PI * Math.sqrt(AU ** 3 / (ph.G_NEWTON * M));
    const r = ph.nbody([M, 5.97e24], [[0, 0], [AU, 0]], [[0, 0], [0, v]], year, year / 20000, { every: 100 });
    const end = r.x[r.x.length - 1][1];
    expect(Math.hypot(end[0] - AU, end[1]) / AU).toBeLessThan(2e-3);
    expect(Math.max(...r.energy.map((e) => Math.abs(e / r.energy[0] - 1)))).toBeLessThan(1e-6);
  });
  it('a charge in a magnetic field circles at the cyclotron radius; crossed fields drift at E/B', () => {
    const q = 1.602e-19, m = 9.109e-31, B = 1e-3, v = 1e6, R = (m * v) / (q * B), period = (2 * Math.PI * m) / (q * B);
    const r = ph.chargedParticle(q, m, [0, 0, 0], [0, 0, B], [0, 0, 0], [v, 0, 0], period, period / 2000);
    const ys = r.r.map((p) => p[1]);
    expect(Math.max(...ys.map(Math.abs)) / (2 * R)).toBeCloseTo(1, 3);
    expect(Math.hypot(...r.v)).toBeCloseTo(v, 3);
    const d = ph.chargedParticle(q, m, [0, 1e3, 0], [0, 0, B], [0, 0, 0], [0, 0, 0], 10 * period, period / 400);
    expect(d.r[d.r.length - 1][0] / (10 * period)).toBeCloseTo(1e3 / B, -3);
  });
  it('waves: the plucked string, slits and fields', () => {
    const x = Array.from({ length: 11 }, (_, i) => i / 10), y0 = ph.pluckedString(1, 100, 0.3, 0.01, x, 0, 2000);
    expect(y0[3]).toBeCloseTo(0.01, 4);
    expect(y0[8]).toBeCloseTo(0.01 * (0.2 / 0.7), 4);
    const half = ph.pluckedString(1, 100, 0.3, 0.01, x, 0.01, 2000), whole = ph.pluckedString(1, 100, 0.3, 0.01, x, 0.02, 2000);
    x.forEach((_, i) => { expect(half[i]).toBeCloseTo(-y0[10 - i], 4); expect(whole[i]).toBeCloseTo(y0[i], 4); });
    // Two slits: bright at mλD/d.
    const lam = 500e-9, d = 0.1e-3, D = 1, I = ph.slits(lam, d, 0.02e-3, 2, D, [0, (lam * D) / d, (lam * D) / (2 * d)]);
    expect(I[0]).toBeCloseTo(1, 12);
    expect(I[1]).toBeGreaterThan(0.85);
    expect(I[2]).toBeLessThan(1e-6);
    const f = ph.pointCharges([[0, 0, 1e-9]], [1], [0]);
    expect(f.V[0][0]).toBeCloseTo(ph.K_COULOMB * 1e-9, 9);
    expect(f.Ex[0][0]).toBeCloseTo(ph.K_COULOMB * 1e-9, 9);
    // A dipole far along its axis: E ≈ 2kp/r³.
    const p = 1e-9 * 0.002, dip = ph.pointCharges([[0.001, 0, 1e-9], [-0.001, 0, -1e-9]], [1], [0]);
    expect(dip.Ex[0][0] / ((2 * ph.K_COULOMB * p) / 1)).toBeCloseTo(1, 4);
    const w = ph.waveField([[0, 0], [1, 0]], 1, 1, [0.5], [0], 0);
    expect(Math.abs(w[0][0])).toBeGreaterThan(1);
  });
  it('in the language', () => {
    const r = run("[x, y, t, info] = projectile(20, 45); R = info.Range; T = pendulumPeriod(1, [10 90]);\n[Ex, Ey, V] = efield([0 0 1e-9], 1, 0); [xs, ys] = stringWave(1, 100, 0.5, 0.01, 0);\nprojectile(30, 40, 'Drag', 0.01, 'At', 1)\nfigure; pendulum(1, 60, 5, 'At', 1.2)\nfigure; efield([-1 0 1e-9; 1 0 -1e-9], linspace(-3, 3, 41), linspace(-2, 2, 31))\nfigure; nbody([1 1e-3], [0 0; 1 0], [0 0; 0 1], 6.3, 0.001, 'G', 1)");
    expect(r.d('R')[0]).toBeCloseTo(400 / 9.81, 6);
    expect(r.d('T')[1] / r.d('T')[0]).toBeGreaterThan(1.17);
    expect(r.d('V')[0]).toBeCloseTo(ph.K_COULOMB * 1e-9, 6);
    expect(Math.max(...r.d('ys'))).toBeCloseTo(0.01, 3);
    expect(r.graphics.figures.length).toBe(4);
  });
});
