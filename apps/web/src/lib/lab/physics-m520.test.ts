import { describe, expect, it } from 'vitest';
import * as rb from './rigid2d';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics, renderSvg } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const graphics = new Graphics(); const lab = new Lab({ out: () => {}, graphics }); lab.run(code); return { graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

const box3 = (s: number) => r3.boxHull(s, s, s);
const run3 = (B: r3.Body3[], T: number, o: Partial<r3.SimOpts3> = {}) => r3.simulate3(B, { box: [100, 100, 100], g: 0, e: 1, mu: 0, dt: 1e-3, frames: [0, T], ...o });

describe('shapes with dents (M520)', () => {
  it('an L splits into convex parts that cover its area; its moment matches the parts', () => {
    const L = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], p = rb.polygon(L);
    expect(p.area).toBeCloseTo(5, 12);
    expect(p.parts.length).toBe(2);
    const sum = p.parts.reduce((s, q) => s + rb.polygon(q).area, 0);
    expect(sum).toBeCloseTo(5, 10);
    for (const q of p.parts) expect(() => rb.convexParts(q)).not.toThrow();
    // ∫ r² over the L about its centroid, from the two rectangles by parallel axes.
    const rect = (x0: number, y0: number, w: number, h: number) => ({ A: w * h, c: [x0 + w / 2, y0 + h / 2], J: (w * h * (w * w + h * h)) / 12 });
    const R = [rect(0, 0, 3, 1), rect(0, 1, 1, 2)], c = [0, 1].map((k) => R.reduce((s, r) => s + r.A * r.c[k], 0) / 5);
    const J = R.reduce((s, r) => s + r.J + r.A * ((r.c[0] - c[0]) ** 2 + (r.c[1] - c[1]) ** 2), 0);
    expect(p.k2).toBeCloseTo(J / 5, 10); expect(p.centroid[0]).toBeCloseTo(c[0], 12);
    expect(() => rb.polygon([[0, 0], [3, 0], [0, 2], [2, 2]])).toThrow(/crosses/);
  });
  it('a star (ten corners, five dents) falls and rests on the floor without sinking; a ball rests in a U', () => {
    const star = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.4 : 1, t = (Math.PI * i) / 5 + Math.PI / 2; return [r * Math.cos(t), r * Math.sin(t)]; });
    const B = [rb.body(star, 5, 3, 0.3, [0, 0, 0], 1)];
    rb.simulate(B, { W: 10, H: 10, g: 9.81, e: 0.2, mu: 0.5, dt: 5e-4, frames: [0, 3] });
    const low = Math.min(...rb.outline(B[0]).map((p) => p[1]));
    expect(low).toBeGreaterThan(-0.01); expect(low).toBeLessThan(0.01); expect(Math.hypot(B[0].vx, B[0].vy)).toBeLessThan(0.05);
    // The cup's inside is 2 wide: a ball of radius 0.4 dropped in stays inside it, between its walls.
    const U = [[0, 0], [3, 0], [3, 2], [2.5, 2], [2.5, 0.5], [0.5, 0.5], [0.5, 2], [0, 2]];
    const cup = rb.body(U, 5, 1, 0, [0, 0, 0], 1, true), ball = rb.body(0.4, 5.3, 3, 0, [0, 0, 0], 1);
    expect(cup.shape.kind === 'poly' && cup.shape.parts.length).toBeGreaterThanOrEqual(3);
    rb.simulate([cup, ball], { W: 10, H: 10, g: 9.81, e: 0.3, mu: 0.3, dt: 5e-4, frames: [0, 3] });
    const O = rb.outline(cup), top = Math.max(...O.map((p) => p[1])), floor = Math.min(...O.map((p) => p[1])) + 0.5;
    expect(Math.abs(ball.x - cup.x)).toBeLessThan(0.6); expect(ball.y).toBeCloseTo(floor + 0.4, 2); expect(ball.y).toBeLessThan(top);
  });
});

describe('3D bodies (M520)', () => {
  it('a hull: a cube\'s volume and moment s²/6; a tetrahedron\'s volume', () => {
    const h = box3(2);
    expect(h.volume).toBeCloseTo(8, 10); expect(h.faces.length).toBe(6); expect(h.edges.length).toBe(12);
    for (let i = 0; i < 3; i++) expect(h.J[i][i]).toBeCloseTo(4 / 6, 10);
    const t = r3.hull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.1, 0.1, 0.1]]);
    expect(t.volume).toBeCloseTo(1 / 6, 10); expect(t.faces.length).toBe(4); expect(t.centroid[0]).toBeCloseTo(0.25, 10);
  });
  it('a tumbling box keeps its angular momentum and energy (no contacts)', () => {
    const b = r3.body3(r3.boxHull(1, 2, 3), [50, 50, 50], [0.3, 0.2, 0.1], [0, 0, 0], [0.1, 2, 0.1], 1);
    const L0 = b.L.slice(), r = run3([b], 5, { dt: 1e-4 });
    b.L.forEach((x, i) => expect(x).toBeCloseTo(L0[i], 12));
    expect(r.energy[1] / r.energy[0]).toBeCloseTo(1, 2);
  });
  it('equal cubes face on swap speeds; a ball bounces to e² of its height', () => {
    const B = [r3.body3(box3(1), [40, 50, 50], [0, 0, 0], [1, 0, 0], [0, 0, 0], 1), r3.body3(box3(1), [43, 50, 50], [0, 0, 0], [-1, 0, 0], [0, 0, 0], 1)];
    run3(B, 3);
    expect(B[0].v[0]).toBeCloseTo(-1, 6); expect(B[1].v[0]).toBeCloseTo(1, 6); expect(norm3(r3.omega(B[0]))).toBeLessThan(1e-6);
    const ball = r3.body3(0.1, [5, 5, 2.1], [0, 0, 0], [0, 0, 0], [0, 0, 0], 1), zs: number[] = [];
    const frames = Array.from({ length: 1201 }, (_, i) => i * 0.001), r = r3.simulate3([ball], { box: [10, 10, 10], g: 9.81, e: 0.8, mu: 0, dt: 1e-4, frames });
    r.frames.forEach((f) => zs.push(f[2]));
    const k = zs.findIndex((z, i) => i > 0 && z > zs[i - 1]);
    expect((Math.max(...zs.slice(k)) - 0.1) / 2).toBeCloseTo(0.64, 2);
  });
  it('a tilted cube lands on a corner: energy kept, it starts spinning', () => {
    const b = r3.body3(box3(1), [50, 50, 5], [0.5, 0.3, 0], [0, 0, -3], [0, 0, 0], 1);
    const r = run3([b], 1.6, { box: [100, 100, 100] });
    expect(r.hits).toBe(1); expect(r.energy[1] / r.energy[0]).toBeCloseTo(1, 7); expect(norm3(r3.omega(b))).toBeGreaterThan(0.5);
  });
  it('a box slides v²/(2μg) and rests flat; a cube stacked on another stays', () => {
    const b = r3.body3(box3(1), [10, 10, 0.5], [0, 0, 0], [4, 0, 0], [0, 0, 0], 1);
    r3.simulate3([b], { box: [100, 20, 10], g: 9.81, e: 0, mu: 0.4, dt: 5e-4, frames: [0, 2] });
    expect(b.p[0] - 10).toBeCloseTo(16 / (2 * 0.4 * 9.81), 1); expect(norm3(b.v)).toBeLessThan(1e-3); expect(b.p[2]).toBeCloseTo(0.5, 2);
    const s = [r3.body3(box3(1), [5, 5, 0.5], [0, 0, 0], [0, 0, 0], [0, 0, 0], 1), r3.body3(box3(1), [5.2, 5, 1.5], [0, 0, 0], [0, 0, 0], [0, 0, 0], 1)];
    r3.simulate3(s, { box: [10, 10, 10], g: 9.81, e: 0, mu: 0.5, dt: 1e-3, frames: [0, 2] });
    expect(s[1].p[2]).toBeCloseTo(1.5, 2); expect(s[1].p[0]).toBeCloseTo(5.2, 2);
  });
});
const norm3 = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

describe('charged black holes (M520)', () => {
  it('horizons and the Reissner–Nordström light sphere, ISCO and shadow', () => {
    expect(kr.horizon(0, 1)).toBe(1); expect(kr.horizon(0.6, 0.8)).toBe(1); expect(() => kr.horizon(0.8, 0.8)).toThrow();
    expect(kr.photonOrbit(0, 1)).toBe(2);
    // r³ − 6r² + 9q²r − 4q⁴ = 0 (largest root): 4 at q = 1.
    expect(kr.isco(0, { q: 1 })).toBeCloseTo(4, 6);
    const q = 0.6, ri = kr.isco(0, { q }), f = ri ** 3 - 6 * ri ** 2 + 9 * q * q * ri - 4 * q ** 4;
    expect(Math.abs(f)).toBeLessThan(1e-5);
    // Through the spinning formulas with a tiny spin: a circle of radius r²/√Δ at the light sphere.
    const qq = 0.99, rs = (3 + Math.sqrt(9 - 8 * qq * qq)) / 2, R = (rs * rs) / Math.sqrt(rs * rs - 2 * rs + qq * qq);
    for (const [x, y] of kr.shadow(1e-4, Math.PI / 2, 200, qq)) expect(Math.hypot(x, y)).toBeCloseTo(R, 2);
  });
  it('the charged formulas give Kerr back at q = 0, and the light orbits shrink with charge', () => {
    const c = kr.circular(0.5, 9, true, { q: 1e-7 }), k = kr.circular(0.5, 9, true);
    expect(c.E).toBeCloseTo(k.E, 8); expect(c.L).toBeCloseTo(k.L, 8);
    expect(kr.photonOrbit(0.5, 1e-6)).toBeCloseTo(kr.photonOrbit(0.5), 5); expect(kr.photonOrbit(0.5, 0.5)).toBeLessThan(kr.photonOrbit(0.5));
    expect(kr.isco(0.5, { q: 0.5 })).toBeLessThan(kr.isco(0.5));
  });
  it('a particle with e/m = 1 hovers at rest beside an extremal charged hole (electric push = gravity)', () => {
    const g = kr.geodesic(0, 1, 0, 0, 1, 7, Math.PI / 2, 0, 5, { q: 1, eps: 1, n: 100 });
    for (const r of g.r) expect(r).toBeCloseTo(7, 9);
    // Without its charge it falls in.
    expect(kr.geodesic(0, Math.sqrt(36 / 49), 0, 0, 1, 7, Math.PI / 2, 0, 50, { q: 1, inward: true }).captured).toBe(true);
  });
  it('a circular charged orbit stays circular', () => {
    const a = 0.3, c = { q: 0.5, eps: -0.4 }, k = kr.circular(a, 9, true, c);
    const g = kr.geodesic(a, k.E, k.L, 0, 1, 9, Math.PI / 2, 0, 30, c);
    expect(Math.max(...g.r.map((r) => Math.abs(r - 9)))).toBeLessThan(1e-6);
  });
});

describe('light from any direction (M520)', () => {
  it('rays traced back from a distant observer: inside the shadow caught, outside escape', () => {
    const a = 0.9, th = (60 * Math.PI) / 180, edge = kr.shadow(a, th);
    for (const s of [0.97, 1.03]) for (const k of [0, Math.floor(edge.length / 4), Math.floor(edge.length / 2)]) {
      const [al, be] = edge[k], ray = kr.imageRay(a, th, al * s, be * s);
      const g = kr.geodesic(a, ray.E, ray.L, ray.Q, 0, 1000, th, 0, 2, { inward: true, north: be > 0, rFar: 1001, n: 1500 });
      expect(g.captured).toBe(s < 1);
    }
  });
});

describe('in the language (M520)', () => {
  it('rigidShapes with a dent, rigidShapes3D, charged holes and light from above', () => {
    const r = lang([
      "[t, P] = rigidShapes({[0 0; 3 0; 3 1; 1 1; 1 3; 0 3]}, [5 5 0], [], 'Time', 1); y1 = P(end, 2);",
      "[t3, P3, info] = rigidShapes3D({0.5, [1 1 1], [0 0 0; 1 0 0; 0 1 0; 0 0 1]}, [3 5 4 0 0 0; 6 5 3 0 0 30; 5 2 2 0 0 0], [], 'Time', 1);",
      "R = kerrRadii(0, 1); i4 = R.ISCOPrograde;",
      "[x, y, z, o] = kerrOrbit(0.5, 10, 0.1, 20, 'Orbits', 2, 'Charge', 0.5, 'ParticleCharge', 0.2); E = o.E;",
      "[c, rmin] = kerrLight(0.9, [0 1 8], 'Inclination', 60, 'Beta', [0 0 0]);",
      "figure; rigidShapes({[0 0; 3 0; 3 1; 1 1; 1 3; 0 3], 0.4}, [3 5 0; 7 6 0])",
      "figure; rigidShapes3D({0.5, [1 1 1]}, [3 5 4 0 0 0; 6 5 3 30 0 0], [2 0 0; -1 0 0])",
      "figure; kerrLight(0.9, -6:2:6, 'Inclination', 70, 'Beta', 3)", "figure; kerrLight(0.7, [3 5 8], 'Charge', 0.6)",
      "figure; kerrShadow([0 0.6], 90, 'Charge', 0.7)", "figure; kerrOrbit(0.5, 9, 0.1, 30, 'Orbits', 2, 'Charge', 0.6)",
    ].join('\n'));
    expect(r.d('y1')[0]).toBeLessThan(5); expect(r.d('t3').length).toBe(151); expect(r.d('P3').length).toBe(151 * 21);
    expect(r.d('i4')[0]).toBeCloseTo(4, 2); expect(r.d('E')[0]).toBeGreaterThan(0.9);
    expect(r.d('c')).toEqual([1, 1, 0]);
    expect(r.graphics.figures.length).toBe(6);
    for (const f of r.graphics.figures) expect(renderSvg(f, 600, 450).length).toBeGreaterThan(1000);
  });
});
