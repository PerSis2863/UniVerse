import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';
import * as pm from './physics-more';
import { barrier, HB2M } from './physics-plus';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const span = (T: number, n: number) => Array.from({ length: n + 1 }, (_, i) => (T * i) / n);

describe('Hyperion physics, more left-outs (M518)', () => {
  it('turns a free symmetric body as Euler said, its L fixed in space', () => {
    const I = [2, 2, 1], w3 = 5, at = span(10, 200), r = pm.spinBody(I, [0.3, 0, w3], [1, 0, 0, 0], at);
    const Om = ((I[2] - I[0]) / I[0]) * w3;
    r.t.forEach((t, i) => { expect(r.w[i][0]).toBeCloseTo(0.3 * Math.cos(Om * t), 6); });
    const L0 = r.L[0];
    for (const L of r.L) L.forEach((v, j) => expect(v).toBeCloseTo(L0[j], 7));
    for (const q of r.q) expect(Math.hypot(...q)).toBeCloseTo(1, 12);
  });
  it('makes a fast top precess at mgl/(I3 ω3)', () => {
    const I = [1, 1, 0.5], w3 = 200, mgl = 2, th = 0.5, q0 = [Math.cos(th / 2), Math.sin(th / 2), 0, 0];
    const T = 2, r = pm.spinBody(I, [0, 0, w3], q0, span(T, 4000), mgl);
    const az = r.axis.map((a) => Math.atan2(a[1], a[0]));
    let turned = 0;
    for (let i = 1; i < az.length; i++) { let d = az[i] - az[i - 1]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turned += d; }
    expect(Math.abs(turned / T) / (mgl / (I[2] * w3))).toBeCloseTo(1, 1);
    const E0 = r.energy[0];
    for (const E of r.energy) expect(Math.abs(E - E0) / E0).toBeLessThan(1e-7);
  });
  it('bends real rays: one surface exactly, spherical aberration, colour', () => {
    const R = 50, n = 1.5, S = [{ R, t: 0, n }];
    for (const h of [5, 15, 25]) {
      const i = Math.asin(h / R), rr = Math.asin(Math.sin(i) / n);
      expect(pm.axisCrossing(S, h)).toBeCloseTo(R + (R * Math.sin(rr)) / Math.sin(i - rr), 9);
    }
    expect(pm.paraxialFocus(S, 10)).toBeCloseTo((n * R) / (n - 1), 4);
    // A plano-convex lens, curved side first: the edge focuses short of the middle, about as h².
    const L = [{ R: 51.68, t: 6, n: 1.5168, V: 64.17 }, { R: Infinity, t: 0, n: 1 }];
    const fp = pm.paraxialFocus(L, 10), sa = (h: number) => pm.axisCrossing(L, h) - fp;
    expect(fp).toBeGreaterThan(90);
    expect(sa(10)).toBeLessThan(0);
    expect(sa(10) / sa(5)).toBeCloseTo(4, 0);
    expect(pm.paraxialFocus(L, 10, 486.13)).toBeLessThan(pm.paraxialFocus(L, 10, 656.27));
    const s0 = pm.spot(L, 10, 0, fp), sBest = Math.min(...span(-3, 30).map((d) => pm.spot(L, 10, 0, fp + d).rms));
    expect(sBest).toBeLessThan(s0.rms / 2);
    const off = pm.spot(L, 5, 0.1, fp);
    expect(off.centroid[1]).toBeCloseTo(fp * Math.tan(0.1), -1);
  });
  it('precesses orbits and bends light as Einstein said', () => {
    const o = pm.schwarzschildOrbit(1000, 3000, 3);
    expect(o.perihelia.length).toBeGreaterThanOrEqual(3);
    expect(o.shift / o.weak).toBeCloseTo(1, 1);
    expect(Math.abs(o.shift / o.weak - 1)).toBeLessThan(0.01);
    const l = pm.lightRay(1000);
    expect(Math.abs(l.deflection / l.weak - 1)).toBeLessThan(0.01);
    expect(pm.lightRay(5.1).captured).toBe(true);
    expect(pm.lightRay(5.3).captured).toBe(false);
    expect(() => pm.schwarzschildOrbit(3, 5, 1)).toThrow();
    const merc = pm.perihelionShift(5.7909e10, 0.2056, 1.98892e30) * (36525 / 87.969) * (180 / Math.PI) * 3600;
    expect(merc).toBeCloseTo(43, 0);
  });
  it('moves a wave packet: it spreads as it should, keeps its norm and tunnels', () => {
    const x = span(200, 4000).map((v) => v - 100), V = x.map(() => 0), sigma = 2, k0 = 3;
    const r = pm.wavePacket(x, V, 1, -20, k0, sigma, [0, 10, 20], 0.02), h = x[1] - x[0];
    const stats = (p: number[]) => { const m = p.reduce((s, v, i) => s + v * x[i] * h, 0); return { norm: p.reduce((s, v) => s + v * h, 0), mean: m, sd: Math.sqrt(p.reduce((s, v, i) => s + v * (x[i] - m) ** 2 * h, 0)) }; };
    r.prob.forEach((p, j) => {
      const s = stats(p), t = r.t[j];
      expect(s.norm).toBeCloseTo(1, 6);
      expect(s.sd / (sigma * Math.sqrt(1 + ((HB2M * t) / (pm.HBAR_EVFS * sigma * sigma)) ** 2))).toBeCloseTo(1, 2);
      expect(s.mean).toBeCloseTo(-20 + ((2 * HB2M * k0) / pm.HBAR_EVFS) * t, 1);
    });
    // A barrier: the share that gets through is the plane waves' transmission averaged over the packet's momenta.
    const xb = span(400, 8000).map((v) => v - 150), hb = xb[1] - xb[0], V0 = 0.3, w = 0.5, Vb = xb.map((v) => (v >= 0 && v < w ? V0 : 0));
    const k1 = 2.6, s2 = 4, tun = pm.wavePacket(xb, Vb, 1, -30, k1, s2, [180], 0.02), p = tun.prob[0];
    const through = p.reduce((s, v, i) => s + (xb[i] > w ? v * hb : 0), 0);
    let num = 0, den = 0;
    for (let k = k1 - 1; k <= k1 + 1; k += 0.001) { const g = Math.exp(-2 * s2 * s2 * (k - k1) ** 2); num += g * barrier(HB2M * k * k, V0, w, 1); den += g; }
    expect(through).toBeCloseTo(num / den, 2);
  });
  it('finds 2D and 3D bound states', () => {
    const N = 40, L = 2, hh = L / (N + 1), r = pm.boundStates([N, N], [hh, hh], new Float64Array(N * N), 1, 4);
    const c = HB2M / (hh * hh), e1 = (k: number) => c * (2 - 2 * Math.cos((Math.PI * k) / (N + 1)));
    const want = [[1, 1], [1, 2], [2, 1], [2, 2]].map(([a, b]) => e1(a) + e1(b)).sort((p, q) => p - q);
    r.E.forEach((E, i) => expect(E).toBeCloseTo(want[i], 7));
    // A 3D oscillator: ħω (n + 3/2), degeneracies 1, 3.
    const M = 18, ext = 5, h3 = (2 * ext) / (M - 1), g = Array.from({ length: M }, (_, i) => -ext + i * h3), k = 0.1, V = new Float64Array(M ** 3);
    for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) for (let cc = 0; cc < M; cc++) V[a + M * b + M * M * cc] = 0.5 * k * (g[a] ** 2 + g[b] ** 2 + g[cc] ** 2);
    const hw = pm.HBAR_EVFS * Math.sqrt(k / (pm.HBAR_EVFS ** 2 / (2 * HB2M))), o = pm.boundStates([M, M, M], [h3, h3, h3], V, 1, 4);
    expect(o.E[0] / (1.5 * hw)).toBeCloseTo(1, 1);
    for (let i = 1; i < 4; i++) expect(o.E[i] / (2.5 * hw)).toBeCloseTo(1, 1);
  });
});

describe('Hyperion physics, more left-outs, in the language (M518)', () => {
  it('runs every new function', () => {
    const r = run(`[t, w, q, ax] = rigidRotation([1 1 0.5], [0 0 100], 1, 'Orientation', [cos(0.25) sin(0.25) 0 0], 'Gravity', 2);
rigidRotation([2 2 1], [0.3 0 5], 10)
lens = [51.68 6 1.5168 64.17; Inf 95 1 0];
[h, sa, f] = lensAberration(lens, 10);
[pts, rms] = spotDiagram(lens, 10, 2);
figure; lensAberration(lens, 10)
figure; spotDiagram(lens, 10, 0, 'Defocus', -0.5)
figure; realRayTrace(lens, 10, 3)
[x, y, shift, weak] = schwarzschildOrbit(1000, 3000, 2);
figure; schwarzschildOrbit(12, 40, 4)
[dfl, caught] = lightBending([4 1000]);
figure; lightBending()
p = perihelionShift(5.7909e10, 0.2056, 1.98892e30);
xx = linspace(-60, 60, 1200); V = 0.3*(xx >= 0 & xx < 0.5);
[tt, P] = wavePacket(xx, V, 'X0', -20, 'K0', 2.6, 'Sigma', 3, 'Times', [0 50]);
figure; wavePacket(xx, V, 'X0', -20, 'K0', 2.6, 'Sigma', 3)
g = linspace(-4, 4, 30); [X, Y] = meshgrid(g, g);
[E2, psi2] = schrodinger2D(g, g, 0.05*(X.^2 + Y.^2), 'States', 3);
figure; schrodinger2D(g, g, @(x, y) 0.05*(x.^2 + 4*y.^2))
g3 = linspace(-4, 4, 12);
[E3, psi3] = schrodinger3D(g3, g3, g3, @(x, y, z) 0.05*(x.^2 + y.^2 + z.^2), 'States', 2);`);
    expect(r.d('caught')).toEqual([1, 0]);
    expect(r.d('dfl')[1]).toBeCloseTo(0.004, 4);
    expect(r.d('sa')[40]).toBeLessThan(0);
    expect(r.d('E2')[1]).toBeCloseTo(r.d('E2')[2], 6);
    expect(r.d('psi2')).toHaveLength(30 * 30 * 3);
    expect(r.d('psi3')).toHaveLength(12 ** 3 * 2);
    expect(r.d('shift')[0] / r.d('weak')[0]).toBeCloseTo(1, 1);
    expect(r.d('P')).toHaveLength(2 * 1200);
    expect(r.graphics.figures.length).toBe(8);
    expect(r.out).toMatch(/Energy/);
  });
});
