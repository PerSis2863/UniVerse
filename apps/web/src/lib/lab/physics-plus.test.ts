import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as pp from './physics-plus';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('Hyperion physics, the left-outs (M515)', () => {
  it('Biot–Savart: a long wire, a loop at its centre and on its axis', () => {
    const B = pp.biotSavart([[0, 0, -1000], [0, 0, 1000]], 10, [0.1, 0, 0]);
    expect(rel(B[1], 2e-5)).toBeLessThan(1e-6);
    expect(Math.abs(B[0]) + Math.abs(B[2])).toBeLessThan(1e-15);
    const N = 720, R = 0.1, loop = Array.from({ length: N + 1 }, (_, k) => [R * Math.cos((2 * Math.PI * k) / N), R * Math.sin((2 * Math.PI * k) / N), 0]);
    expect(rel(pp.biotSavart(loop, 10, [0, 0, 0])[2], (pp.MU0 * 10) / (2 * R))).toBeLessThan(1e-4);
    expect(rel(pp.biotSavart(loop, 10, [0, 0, 0.05])[2], (pp.MU0 * 10 * R * R) / (2 * (R * R + 0.0025) ** 1.5))).toBeLessThan(1e-4);
    // A field line round the wire closes on itself; one from + in a dipole ends at −.
    const line = pp.fieldLine((p) => pp.biotSavart([[0, 0, -1000], [0, 0, 1000]], 10, p), [0.1, 0, 0], 0.005, 400, 10, [], false);
    expect(Math.hypot(...line[line.length - 1].map((x, i) => x - [0.1, 0, 0][i]))).toBeLessThan(0.01);
    const dip = [[-1, 0, 0, 1], [1, 0, 0, -1]], E = pp.fieldLine((p) => pp.coulomb3(dip, p, 0.05), [-0.9, 0.1, 0], 0.01, 5000, 20, [[1, 0, 0]], false);
    expect(Math.hypot(E[E.length - 1][0] - 1, E[E.length - 1][1], E[E.length - 1][2])).toBeLessThan(0.1);
  });
  it('optics by matrices: two lenses, the lensmaker, imaging and a Gaussian beam', () => {
    expect(pp.system(pp.parseOptics('f 50; d 20; f 100')).efl).toBeCloseTo(5000 / 130, 10);
    const s = pp.system(pp.parseOptics('s 50 1 1.5; s -50 1.5 1'));
    expect(s.efl).toBeCloseTo(50, 10);
    const im = pp.system(pp.parseOptics('f 50')).image(100);
    expect(im.si).toBeCloseTo(100, 10);
    expect(im.mag).toBeCloseTo(-1, 10);
    expect(pp.system(pp.parseOptics('m -100')).efl).toBeCloseTo(-50, 10);
    const zR = (Math.PI * 1) / 5e-4, free = pp.gaussianBeam(pp.parseOptics(`d ${zR}`), 1, 5e-4, 10);
    expect(free.w[free.w.length - 1]).toBeCloseTo(Math.SQRT2, 9);
    const foc = pp.gaussianBeam(pp.parseOptics('f 100'), 1, 5e-4), k = (100 / zR) ** 2;
    expect(foc.waistAt).toBeCloseTo(100 / (1 + k), 6);
    expect(foc.waistRadius).toBeCloseTo((5e-4 * 100) / Math.PI / Math.sqrt(1 + k), 9);
    expect(() => pp.parseOptics('q 3')).toThrow();
  });
  it('relativity: the interval holds, speeds add below c, a fast electron circles at γmv/(qB)', () => {
    const [ct, x] = pp.lorentz(0.6, 5, 3);
    expect(ct * ct - x * x).toBeCloseTo(25 - 9, 10);
    expect(pp.addVelocity(0.5, 0.5, 1)).toBeCloseTo(0.8, 12);
    const q = -1.602176634e-19, m = 9.1093837e-31, v = 0.9 * pp.C_LIGHT, g = pp.gammaOf(0.9), R = (g * m * v) / (Math.abs(q) * 1);
    const T = (2 * Math.PI * R) / v, r = pp.relativisticParticle(q, m, [0, 0, 0], [0, 0, 1], [0, 0, 0], [v, 0, 0], T, T / 20000);
    expect(rel(Math.max(...r.r.map((p) => Math.abs(p[1]))), 2 * R)).toBeLessThan(1e-3);
    expect(Math.max(...r.speed.map((s) => Math.abs(s - v) / v))).toBeLessThan(1e-12);
    const push = pp.relativisticParticle(1.602e-19, 1.67e-27, [1e9, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 1e-6, 1e-9);
    expect(Math.max(...push.speed)).toBeLessThan(pp.C_LIGHT);
    expect(Math.max(...push.speed)).toBeGreaterThan(0.99 * pp.C_LIGHT);
  });
  it('quantum: the infinite well, the oscillator, the finite well and tunnelling', () => {
    const N = 999, x = Array.from({ length: N }, (_, i) => (i + 1) / (N + 1)), box = pp.schrodinger(x, new Array(N).fill(0), 1, 3);
    box.E.forEach((E, n) => expect(rel(E, (n + 1) ** 2 * Math.PI ** 2 * pp.HB2M)).toBeLessThan(1e-5));
    expect(box.psi[0].reduce((s, p) => s + p * p, 0) / (N + 1)).toBeCloseTo(1, 9);
    const xo = Array.from({ length: 2001 }, (_, i) => -5 + i / 200), ho = pp.schrodinger(xo, xo.map((v) => v * v), 1, 4), w = Math.sqrt(pp.HB2M);
    ho.E.forEach((E, n) => expect(rel(E, (2 * n + 1) * w)).toBeLessThan(1e-4));
    const fw = pp.finiteWell(0.3, 5, 0.067), xs = Array.from({ length: 3001 }, (_, i) => -15 + i / 100), num = pp.schrodinger(xs, xs.map((v) => (Math.abs(v) < 2.5 ? 0 : 0.3)), 0.067, fw.length);
    expect(fw.length).toBeGreaterThan(1);
    fw.forEach((E, n) => expect(Math.abs(num.E[n] - E)).toBeLessThan(2e-3));
    for (const E of [0.05, 0.2, 0.5, 1.3]) expect(rel(pp.transmission([-0.25, 0.25, 0.75], [0, 0.3, 0], E, 1), pp.barrier(E, 0.3, 0.5, 1))).toBeLessThan(1e-9);
    // Resonant tunnelling: two barriers pass some energies almost whole.
    const xd = Array.from({ length: 81 }, (_, i) => i * 0.1), Vd = xd.map((v) => ((v > 1 && v < 2) || (v > 5 && v < 6) ? 0.4 : 0));
    const Ts = Array.from({ length: 300 }, (_, i) => pp.transmission(xd, Vd, 0.001 + (i * 0.4) / 300, 0.067));
    expect(Math.max(...Ts)).toBeGreaterThan(0.9);
    expect(Math.min(...Ts)).toBeLessThan(0.01);
  });
  it('rigid bodies: the tennis-racket flip, and collisions', () => {
    const at = Array.from({ length: 401 }, (_, i) => i * 0.25);
    const mid = pp.eulerSpin([1, 2, 3], [0.01, 1, 0.01], at), ax1 = pp.eulerSpin([1, 2, 3], [1, 0.01, 0.01], at);
    expect(Math.min(...mid.w.map((w) => w[1]))).toBeLessThan(-0.9);
    expect(Math.min(...ax1.w.map((w) => w[0]))).toBeGreaterThan(0.99);
    expect(Math.max(...mid.energy) - Math.min(...mid.energy)).toBeLessThan(1e-8);
    expect(Math.max(...mid.L) - Math.min(...mid.L)).toBeLessThan(1e-8);
    expect(pp.collide1d(1, 1, 2, 0, 1)).toEqual([0, 2]);
    expect(pp.collide1d(1, 3, 4, 0, 0)).toEqual([1, 1]);
    const head = pp.disks([[2, 5], [8, 5]], [[1, 0], [-1, 0]], [0.5, 0.5], [1, 1], 10, 10, [4]);
    expect(head.hits.pairs).toBe(1);
    expect(head.velocities).toEqual([[-1, 0], [1, 0]]);
    let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const n = 30, pos = Array.from({ length: n }, (_, i) => [1 + (i % 6) * 1.6, 1 + Math.floor(i / 6) * 1.6]), vel = pos.map(() => [rnd() - 0.5, rnd() - 0.5]);
    const ke = (v: number[][]) => v.reduce((a, w) => a + 0.5 * (w[0] ** 2 + w[1] ** 2), 0);
    const g = pp.disks(pos, vel, new Array(n).fill(0.3), new Array(n).fill(1), 10, 10, [0, 50]);
    expect(rel(ke(g.velocities), ke(vel))).toBeLessThan(1e-12);
    expect(g.hits.pairs).toBeGreaterThan(20);
    for (const f of g.frames) for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) expect(Math.hypot(f[i][0] - f[j][0], f[i][1] - f[j][1])).toBeGreaterThan(0.6 - 1e-9);
    expect(ke(pp.disks(pos, vel, new Array(n).fill(0.3), new Array(n).fill(1), 10, 10, [50], 0.5).velocities)).toBeLessThan(ke(vel));
  });
  it('in the language', () => {
    const r = run("B = bfield([0 0 -100; 0 0 100], 10, [0.1 0 0]);\n[f, bfl] = opticsSystem('f 50; d 20; f 100');\n[z, w] = gaussianBeam(1, 5e-4, 'd 1000; f 200; d 400');\n[ctp, xp] = lorentzTransform(0.6, 5, 3); u = velocityAdd(0.5, 0.5, 1); s = relativistic(9.109e-31, 0.9*299792458);\n[E, psi] = schrodinger1D(linspace(-5, 5, 801), linspace(-5, 5, 801).^2, 'States', 3);\nEw = finiteWell(0.3, 5, 'Mass', 0.067); T = tunneling([0.1 0.2], 0.3, 0.5);\n[t, wv] = rigidBody([1 2 3], [0.01 1 0.01], 50); v = collide1d(1, 1, 2, 0);\nbfield([0 0 -1; 0 0 1], 5)\nfigure; rayTrace('d 100; f 50; d 150')\nfigure; lensImage(50, 120, 10)\nfigure; minkowskiDiagram(0.5, [1 0.5; 2 1.5])\nfigure; schrodinger1D(linspace(-5, 5, 401), linspace(-5, 5, 401).^2)\nfigure; transmission(0:0.1:8, 0.4*(((0:0.1:8) > 1 & (0:0.1:8) < 2) | ((0:0.1:8) > 5 & (0:0.1:8) < 6)), 'Mass', 0.067)\nfigure; rigidBody([1 2 3], [0.01 1 0.01], 50)\nfigure; diskCollisions(20, 'Time', 5)\nfigure; fieldLines([-1 0 0 1; 1 0 0 -1])\nfigure; chargedParticle(-1.602e-19, 9.109e-31, [0 0 0], [0 0 1], [0 0 0], [2.7e8 0 0], 1e-10, 1e-13, 'Relativistic', true)");
    expect(r.d('B')[1]).toBeCloseTo(2e-5, 9);
    expect(r.d('f')[0]).toBeCloseTo(5000 / 130, 9);
    expect(r.d('u')[0]).toBeCloseTo(0.8, 12);
    expect(r.d('E')[0]).toBeCloseTo(Math.sqrt(pp.HB2M), 3);
    expect(r.d('Ew').length).toBeGreaterThan(1);
    expect(r.d('T')[0]).toBeCloseTo(pp.barrier(0.1, 0.3, 0.5, 1), 12);
    expect(r.d('v')).toEqual([0, 2]);
    expect(r.graphics.figures.length).toBe(10);
  });
});
