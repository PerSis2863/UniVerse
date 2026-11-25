import { describe, expect, it } from 'vitest';
import * as rb from './rigid2d';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics, renderSvg } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const graphics = new Graphics(); const lab = new Lab({ out: () => {}, graphics }); lab.run(code); return { graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('rolling resistance (M542)', () => {
  it('a rolling disc slows at Crr g / 1.5 (2D), a ball at Crr g / 1.4 (3D); none without it', () => {
    const c = rb.body(0.5, 5, 0.5, 0, [3, 0, -6], 1), frames = [0, 0.5, 1];
    rb.simulate([c], { W: 100, H: 10, g: 9.81, e: 0, mu: 0.5, dt: 2e-4, frames, roll: 0.05 });
    expect(c.vx).toBeCloseTo(3 - (0.05 * 9.81) / 1.5, 2); expect(c.w * 0.5).toBeCloseTo(-c.vx, 3);
    const b = r3.body3(0.5, [5, 5, 0.5], [0, 0, 0], [3, 0, 0], [0, 6, 0], 1);
    r3.simulate3([b], { box: [100, 10, 10], g: 9.81, e: 0, mu: 0.5, dt: 2e-4, frames, roll: 0.05 });
    expect(b.v[0]).toBeCloseTo(3 - (0.05 * 9.81) / 1.4, 2);
    const free = r3.body3(0.5, [5, 5, 0.5], [0, 0, 0], [3, 0, 0], [0, 6, 0], 1);
    r3.simulate3([free], { box: [100, 10, 10], g: 9.81, e: 0, mu: 0.5, dt: 2e-4, frames });
    expect(free.v[0]).toBeCloseTo(3, 4);
  });
});

describe('glued solids (M542)', () => {
  it('two boxes glued in an L: the parallel-axis inertia; it lands and rests on both feet', () => {
    const A = { ...r3.boxHull(2, 1, 1), centroid: [0, 0, 0] }, B = { ...r3.boxHull(1, 1, 1), centroid: [0.5, 0, 1] };
    const c = r3.compound([A, B]);
    expect(c.volume).toBeCloseTo(3, 10); expect(c.centroid[0]).toBeCloseTo(1 / 6, 10); expect(c.centroid[2]).toBeCloseTo(1 / 3, 10);
    // I_yy per unit mass by hand: each box's (w² + h²)/12 plus its distance² in x and z from the centre.
    const Iyy = (2 * ((4 + 1) / 12 + (1 / 6) ** 2 + (1 / 3) ** 2) + 1 * ((1 + 1) / 12 + (1 / 3) ** 2 + (2 / 3) ** 2)) / 3;
    expect(c.J[1][1]).toBeCloseTo(Iyy, 10);
    const b = r3.body3(c, [5, 5, 3], [0, 0, 0], [0, 0, 0], [0, 0, 0], 3);
    r3.simulate3([b], { box: [10, 10, 10], g: 9.81, e: 0, mu: 0.5, dt: 1e-3, frames: [0, 3] });
    expect(Math.min(...r3.corners(b).map((p) => p[2]))).toBeCloseTo(0, 2); expect(Math.hypot(...b.v)).toBeLessThan(1e-3);
    // A ball dropped into a U of three glued boxes stays between its walls.
    const U = r3.compound([{ ...r3.boxHull(3, 3, 0.5), centroid: [0, 0, 0] }, { ...r3.boxHull(0.5, 3, 2), centroid: [-1.25, 0, 1.25] }, { ...r3.boxHull(0.5, 3, 2), centroid: [1.25, 0, 1.25] }]);
    const cup = r3.body3(U, [5, 5, 0.25 + U.centroid[2]], [0, 0, 0], [0, 0, 0], [0, 0, 0], 1, true), ball = r3.body3(0.5, [5.3, 5, 4], [0, 0, 0], [0, 0, 0], [0, 0, 0], 1);
    r3.simulate3([cup, ball], { box: [10, 10, 10], g: 9.81, e: 0.3, mu: 0.4, dt: 1e-3, frames: [0, 3] });
    expect(Math.abs(ball.p[0] - 5)).toBeLessThan(0.55); expect(ball.p[2]).toBeLessThan(2.5);
  });
});

describe('magnetic charge (M542)', () => {
  it('the general θ equation gives the old one back without it; horizons count g', () => {
    for (const u of [-0.7, 0.1, 0.5]) expect(kr.Uf(u, 0.6, 0.95, 3, 4, 1, 0)).toBeCloseTo(4 * (1 - u * u) - u * u * (0.36 * (1 - 0.95 ** 2) * (1 - u * u) + 9), 12);
    expect(kr.horizon(0, Math.hypot(0.6, 0.8))).toBeCloseTo(1, 12);
  });
  it('a charged particle by a magnetic charge rides a cone (Poincaré): cos θ stays put', () => {
    const w = 0.8, u0 = 0.4, K = ((1 - u0 * u0) * w * w) / (u0 * u0), L = (-u0 * K) / w - w * u0, Q = K - L * L;
    expect(kr.Uf(u0, 0, 0.98, L, Q, 1, w)).toBeCloseTo(0, 10); expect(kr.dU(u0, 0, 0.98, L, Q, 1, w)).toBeCloseTo(0, 10);
    const g = kr.geodesic(0, 0.98, L, Q, 1, 30, Math.acos(u0), 0, 2, { eps: 1, g: w, inward: true, north: true, n: 200 });
    for (const th of g.th) expect(Math.cos(th)).toBeCloseTo(u0, 7);
    expect(Math.max(...g.ph) - Math.min(...g.ph)).toBeGreaterThan(0.5);
  });
});

describe('the glowing disc (M542)', () => {
  it('a face-on disc without spin: a ring with a hole of about the ISCO, light shifted only down', () => {
    const d = kr.discImage(0, (5 * Math.PI) / 180, { n: 48, rOut: 15, half: 16 });
    const gs = [...d.g].filter(Number.isFinite);
    expect(gs.length).toBeGreaterThan(48 * 48 * 0.4); expect(Math.max(...gs)).toBeLessThan(1);
    // The middle pixel sees no disc (the shadow), and the redshift there-abouts is strongest.
    expect(Number.isNaN(d.g[24 * 48 + 24])).toBe(true);
    // Far out the shift tends to the gravitational and time-dilation ones: √(1 − 3/r).
    const k = [...d.r].findIndex((r) => r > 13);
    expect(d.g[k]).toBeCloseTo(Math.sqrt(1 - 3 / d.r[k]), 1);
  });
  it('seen from the side the approaching half is brighter (Doppler beaming)', () => {
    const n = 40, d = kr.discImage(0.9, (75 * Math.PI) / 180, { n });
    let left = 0, right = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = d.I[i * n + j]; if (j < n / 2) left += v; else right += v; }
    // The gas circles with the spin (anticlockwise seen from above): the side at α < 0 comes towards the observer.
    expect(left).toBeGreaterThan(2 * right);
  });
});

describe('in the language (M542)', () => {
  it('Rolling, glued solids, Magnetic and kerrDisc', () => {
    const r = lang([
      "[t, P] = rigidShapes({0.5}, [5 0.5 0], [3 0 -6], 'Time', 1, 'Rolling', 0.05, 'Friction', 0.5); x1 = P(end, 1);",
      "[t3, P3] = rigidShapes3D({{[2 1 1 0 0 0], [1 1 1 0.5 0 1]}, 0.4}, [5 5 3 0 0 0; 2 5 1 0 0 0], [], 'Time', 1, 'Rolling', 0.02);",
      "R = kerrRadii(0.5, 0.3, 0.4); h = R.Horizon;",
      "[I, g, rr] = kerrDisc(0.9, 70, 'Pixels', 24);",
      "figure; kerrDisc(0.9, 80, 'Pixels', 40)", "figure; kerrOrbit(0, 12, 0, 40, 'Orbits', 2, 'Magnetic', 0.5, 'ParticleCharge', 2)",
      "figure; rigidShapes3D({{[2 1 1 0 0 0], [1 1 1 0.5 0 1]}}, [5 5 3 10 0 0], [], 'Time', 1)",
    ].join('\n'));
    expect(r.d('x1')[0]).toBeLessThan(5 + 3); expect(r.d('P3').length).toBe(151 * 14);
    expect(r.d('h')[0]).toBeCloseTo(1 + Math.sqrt(1 - 0.25 - 0.09 - 0.16), 10); expect(r.d('I').length).toBe(576);
    expect(r.graphics.figures.length).toBe(3);
    for (const f of r.graphics.figures) expect(renderSvg(f, 600, 450).length).toBeGreaterThan(1000);
  });
});
