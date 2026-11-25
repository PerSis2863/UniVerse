import { describe, expect, it } from 'vitest';
import * as rb from './rigid2d';
import * as kr from './kerr';
import { enclosed, isosurface } from './isosurface';
import { lightRay, schwarzschildOrbit } from './physics-more';
import { Lab } from './interp';
import { Graphics, renderSvg, toTikz } from './plot';
import { toMat } from './values';
import './sciences';

const schwarzLight = (b: number) => lightRay(b).deflection;
const lang = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

const square = (s: number) => [[0, 0], [s, 0], [s, s], [0, s]];
const run = (B: rb.Body[], T: number, o: Partial<rb.SimOpts> = {}) => rb.simulate(B, { W: 100, H: 100, g: 0, e: 1, mu: 0, dt: 1e-3, frames: [0, T], ...o });

describe('rigid shapes (M519)', () => {
  it('a polygon: centroid, area and a square\'s moment s²/6', () => {
    const p = rb.polygon([[0, 0], [0, 2], [2, 2], [2, 0]]);
    expect(p.area).toBeCloseTo(4, 12); expect(p.centroid).toEqual([1, 1]); expect(p.k2).toBeCloseTo(4 / 6, 12);
    expect(() => rb.polygon([[0, 0], [2, 0], [1, 0.2], [1, 2]])).toThrow(/convex/);
  });
  it('equal squares meeting face on swap their speeds', () => {
    const B = [rb.body(square(1), 40, 50, 0, [1, 0, 0], 1), rb.body(square(1), 43, 50, 0, [-1, 0, 0], 1)];
    run(B, 3);
    expect(B[0].vx).toBeCloseTo(-1, 6); expect(B[1].vx).toBeCloseTo(1, 6); expect(Math.abs(B[0].w) + Math.abs(B[1].w)).toBeLessThan(1e-6);
  });
  it('a tilted square hits a wall corner first: energy kept, momentum turned into spin', () => {
    const B = [rb.body(square(2), 5, 50, 0.4, [-3, 0, 0], 2)];
    const r = run(B, 3, { W: 100, H: 100 });
    expect(r.hits).toBe(1);
    expect(r.energy[1]).toBeCloseTo(r.energy[0], 8);
    expect(Math.abs(B[0].w)).toBeGreaterThan(0.1); expect(B[0].vx).toBeGreaterThan(0);
  });
  it('a pair keeps its momentum and (elastic, one corner) its energy', () => {
    const B = [rb.body([[0, 0], [2, 0], [1, 1.5]], 40, 50, 0.3, [2, 0.2, 0.5], 1.5), rb.body(1, 46, 50.4, 0, [-1, 0, 0], 3)];
    const p0 = [B[0].m * B[0].vx + B[1].m * B[1].vx, B[0].m * B[0].vy + B[1].m * B[1].vy];
    const r = run(B, 4);
    expect(r.hits).toBeGreaterThanOrEqual(1);
    expect(B[0].m * B[0].vx + B[1].m * B[1].vx).toBeCloseTo(p0[0], 9); expect(B[0].m * B[0].vy + B[1].m * B[1].vy).toBeCloseTo(p0[1], 9);
    expect(r.energy[1]).toBeCloseTo(r.energy[0], 5);
  });
  it('a box slides to rest after v²/(2μg) and sits on the floor', () => {
    const B = [rb.body(square(1), 10, 0.5, 0, [4, 0, 0], 1)];
    rb.simulate(B, { W: 100, H: 10, g: 9.81, e: 0, mu: 0.4, dt: 5e-4, frames: [0, 3] });
    expect(B[0].x - 10).toBeCloseTo(16 / (2 * 0.4 * 9.81), 1);
    expect(Math.abs(B[0].vx)).toBeLessThan(1e-6); expect(B[0].y).toBeCloseTo(0.5, 2); expect(Math.abs(B[0].a)).toBeLessThan(1e-3);
  });
  it('a ball bounces to e² of its height; a ball rolls down a fixed ramp', () => {
    const B = [rb.body(0.1, 5, 2.1, 0, [0, 0, 0], 1)];
    const frames = Array.from({ length: 1201 }, (_, i) => i * 0.001);
    const r = rb.simulate(B, { W: 10, H: 10, g: 9.81, e: 0.8, mu: 0, dt: 1e-4, frames });
    const ys = r.frames.map((f) => f[1]), bounce = ys.findIndex((y, i) => i > 0 && y > ys[i - 1]);
    const top = Math.max(...ys.slice(bounce));
    expect((top - 0.1) / 2).toBeCloseTo(0.64, 2);
    const ramp = rb.body([[0, 0], [8, 0], [0, 4]], 4, 2, 0, [0, 0, 0], 1, true), ball = rb.body(0.3, 2.5, 4.45, 0, [0, 0, 0], 1);
    rb.simulate([ramp, ball], { W: 20, H: 10, g: 9.81, e: 0, mu: 0.6, dt: 5e-4, frames: [0, 0.6] });
    // Rolling without slipping: a disc speeds up at ⅔ g sin θ, ω r = −v.
    const v = Math.hypot(ball.vx, ball.vy);
    expect(ball.vx).toBeGreaterThan(0); expect(v / ((2 / 3) * 9.81 * Math.sin(Math.atan(0.5)) * 0.6)).toBeCloseTo(1, 1); expect(-ball.w * 0.3 / v).toBeCloseTo(1, 1);
  });
});

describe('spinning black holes (M519)', () => {
  it('horizon, ISCO and light orbits at the known values', () => {
    expect(kr.horizon(0)).toBe(2); expect(kr.horizon(1)).toBe(1);
    expect(kr.isco(0)).toBeCloseTo(6, 10); expect(kr.isco(1)).toBeCloseTo(1, 6); expect(kr.isco(-1)).toBeCloseTo(9, 10);
    expect(kr.photonOrbit(0)).toBeCloseTo(3, 12); expect(kr.photonOrbit(1)).toBeCloseTo(1, 12); expect(kr.photonOrbit(-1)).toBeCloseTo(4, 12);
  });
  it('a circular orbit stays circular, and its constants match the closed form', () => {
    const a = 0.9, c = kr.circular(a, 8), k = kr.constants(a, 8, 0, 0);
    expect(k.E).toBeCloseTo(c.E, 9); expect(k.L).toBeCloseTo(c.L, 9); expect(k.Q).toBeCloseTo(0, 9);
    const g = kr.geodesic(a, c.E, c.L, 0, 1, 8, Math.PI / 2, 0, 50);
    expect(Math.max(...g.r.map((r) => Math.abs(r - 8)))).toBeLessThan(1e-6);
  });
  it('no spin: the periapsis turns as Schwarzschild\'s', () => {
    const p = 20, e = 0.3, k = kr.constants(0, p, e, 0), r1 = p / (1 + e);
    const g = kr.geodesic(0, k.E, k.L, k.Q, 1, r1, Math.PI / 2, 0, 40, { n: 20000 });
    const s = schwarzschildOrbit(r1, p / (1 - e), 3);
    expect(kr.precessions(g).peri - 2 * Math.PI).toBeCloseTo(s.shift, 3);
  });
  it('a tilted circle\'s plane is dragged round: φ per vertical swing 2π Ω_φ/Ω_θ', () => {
    const a = 0.7, r = 10, k = kr.constants(a, r, 0, 0.05);
    const g = kr.geodesic(a, k.E, k.L, k.Q, 1, r, Math.PI / 2, 0, 60, { n: 30000 });
    const Wphi = 1 / (r ** 1.5 + a), Wth = Wphi * Math.sqrt(1 - (4 * a) / r ** 1.5 + (3 * a * a) / (r * r));
    expect(kr.precessions(g).node / ((2 * Math.PI * Wphi) / Wth)).toBeCloseTo(1, 4);
    expect(Math.max(...g.r.map((x) => Math.abs(x - r)))).toBeLessThan(1e-5);
  });
  it('light: prograde rays get closer than retrograde ones before being caught', () => {
    const a = 0.9, b = (s: number) => -a + s * 6 * Math.cos(Math.acos(-s * a) / 3);
    for (const s of [1, -1]) {
      const bc = b(s);
      const ray = (bb: number) => kr.geodesic(a, 1, bb, 0, 0, 1000, Math.PI / 2, 0, 2, { inward: true, rFar: 1001 });
      expect(ray(bc * 0.98).captured).toBe(true); expect(ray(bc * 1.02).captured).toBe(false);
    }
  });
  it('the shadow: a circle of 3√3 without spin, shifted to −2 … 7 at the edge for a = 1 seen edge-on', () => {
    const r = kr.shadow(1e-3, Math.PI / 2).map(([x, y]) => Math.hypot(x - 2e-3, y));
    expect(Math.max(...r.map((v) => Math.abs(v - 3 * Math.sqrt(3))))).toBeLessThan(5e-3);
    const s = kr.shadow(0.9999, Math.PI / 2), xs = s.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-2, 1); expect(Math.max(...xs)).toBeCloseTo(7, 2);
  });
});

describe('isosurfaces (M519)', () => {
  it('a sphere: closed, facing out, holding 4/3 π r³', () => {
    const g = Array.from({ length: 41 }, (_, i) => -2 + i * 0.1), V: number[] = [];
    for (const z of g) for (const y of g) for (const x of g) V.push(-(x * x + y * y + z * z));
    const s = isosurface(g, g, g, V, -1.5 * 1.5);
    for (const v of s.verts) expect(Math.hypot(...v)).toBeCloseTo(1.5, 1);
    expect(enclosed(s.verts, s.faces) / ((4 / 3) * Math.PI * 1.5 ** 3)).toBeCloseTo(1, 2);
    // Every edge shared by exactly two triangles: no holes.
    const edges = new Map<string, number>();
    for (const f of s.faces) for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = a < b ? `${a},${b}` : `${b},${a}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
    expect([...edges.values()].every((n) => n === 2)).toBe(true);
  });
});

describe('in the language (M519)', () => {
  it('isosurface: a struct for patch, faces and vertices, a drawing with LaTeX', () => {
    const r = lang("[x, y, z] = meshgrid(-2:0.25:2); V = x.^2 + y.^2 + z.^2;\nfv = isosurface(x, y, z, V, 1); [F, P] = isosurface(x, y, z, V, 1);\nnf = size(F, 1); top = max(sqrt(sum(P.^2, 2))); low = min(F(:));\nfigure; isosurface(x, y, z, V, 1)\nfigure; patch(fv, 'FaceColor', 'r', 'EdgeColor', 'none'); view(3)\nfigure; patch('Faces', [1 2 3 4], 'Vertices', [0 0 0; 1 0 0; 1 1 1; 0 1 1], 'FaceColor', 'g')");
    expect(r.d('nf')[0]).toBeGreaterThan(100); expect(r.d('top')[0]).toBeLessThan(1.001); expect(r.d('low')[0]).toBe(1);
    expect(r.graphics.figures.length).toBe(3);
    for (const f of r.graphics.figures) expect(renderSvg(f, 600, 450)).toContain('<path');
    expect(toTikz(r.graphics.figures[0])).toContain('patch');
    const g = [...r.graphics.figures[2].axes.values()][0].grids[0];
    expect(g.tri).toEqual([0, 1, 2, 0, 2, 3]);
  });
  it('rigidShapes, kerrRadii, kerrOrbit, kerrLight, kerrShadow and schrodinger3D in 3D', () => {
    const r = lang([
      "[t, P, info] = rigidShapes({[1 1], 0.4, [0 0; 2 0; 1 1.5]}, [2 5 0; 5 6 0; 8 4 30], [1 0 0; 0 0 0; -1 0 2], 'Time', 1);",
      "R = kerrRadii(1); isco = R.ISCOPrograde;",
      "[x, y, z, o] = kerrOrbit(0.6, 12, 0.2, 30, 'Orbits', 3); sh = o.NodeShift;",
      "[d, c] = kerrLight(0.9, [-5 2 20 -20]); d0 = kerrLight(0, 20);",
      "figure; rigidShapes({[1 1], 0.4}, [2 5 20; 5 6 0], [3 0 0; 0 0 0], 'Fixed', [])",
      "figure; kerrOrbit(0.9, 10, 0.1, 40, 'Orbits', 2)", "figure; kerrLight(0.9)", "figure; kerrShadow([0 0.9], 60)",
      "g = linspace(-1.5, 1.5, 14); figure; schrodinger3D(g, g, g, @(x, y, z) 0.5*(x.^2 + y.^2 + z.^2), 'States', 2)",
    ].join('\n'));
    expect(r.d('t').length).toBe(201); expect(r.d('P').length).toBe(201 * 9); expect(r.d('isco')[0]).toBeLessThan(1.1);
    expect(r.d('sh')[0]).toBeGreaterThan(0);
    expect(r.d('c')).toEqual([1, 1, 0, 0]);
    // No spin: the Schwarzschild solver's deflection; with spin, half the difference about 4aM/b² (+ 10πaM²/b³ …).
    const d = r.d('d'), d0 = r.d('d0');
    expect(d0[0]).toBeCloseTo(schwarzLight(20), 5); expect(d[2]).toBeLessThan(d[3]);
    expect((d[3] - d[2]) / 2 / ((4 * 0.9) / 400 + (10 * Math.PI * 0.9) / 8000)).toBeCloseTo(1, 0);
    expect(r.graphics.figures.length).toBe(5);
    for (const f of r.graphics.figures) expect(renderSvg(f, 600, 450).length).toBeGreaterThan(1000);
    const q = [...r.graphics.figures[4].axes.values()][0];
    expect(q.grids.some((x) => x.kind === 'tri')).toBe(true);
  });
});
