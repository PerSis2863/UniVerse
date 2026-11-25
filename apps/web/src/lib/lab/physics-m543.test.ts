import { describe, expect, it } from 'vitest';
import * as rb from './rigid2d';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics, renderSvg } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const graphics = new Graphics(); const lab = new Lab({ out: () => {}, graphics }); lab.run(code); return { graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
// An outline (counter-clockwise, in x–y) pushed up to height h: a closed mesh.
const extrude = (P: number[][], h: number) => {
  const n = P.length, V = [...P.map(([x, y]) => [x, y, 0]), ...P.map(([x, y]) => [x, y, h])];
  const F = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...P.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
  return { V, F };
};
const hex = Array.from({ length: 6 }, (_, i) => [0.5 * Math.cos((i * Math.PI) / 3), 0.5 * Math.sin((i * Math.PI) / 3)]);

describe('rolling resistance for any shape (M543)', () => {
  it('a hexagon tumbling along the floor stops sooner with it', () => {
    const run = (roll: number) => { const b = rb.body(hex, 1, 0.5, 0, [3, 0, -6], 1); rb.simulate([b], { W: 100, H: 5, g: 9.81, e: 0, mu: 0.8, dt: 5e-4, frames: [0, 4], roll }); return b; };
    const free = run(0), held = run(0.1);
    expect(held.x).toBeLessThan(free.x - 0.3);
    expect(Math.abs(held.w)).toBeLessThan(1e-2);
  });
  it('a box resting flat on the floor is not moved by it; a cube tipped on its edge settles', () => {
    const b = rb.body([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], 3, 0.5, 0, [0, 0, 0], 1);
    rb.simulate([b], { W: 10, H: 5, g: 9.81, e: 0, mu: 0.5, dt: 1e-3, frames: [0, 1], roll: 0.2 });
    expect(b.x).toBeCloseTo(3, 4); expect(b.a).toBeCloseTo(0, 4);
    const c = r3.body3(r3.boxHull(1, 1, 1), [5, 5, 0.75], [0, (30 * Math.PI) / 180, 0], [0, 0, 0], [0, 0, 0], 1);
    r3.simulate3([c], { box: [10, 10, 10], g: 9.81, e: 0, mu: 0.6, dt: 1e-3, frames: [0, 3], roll: 0.1 });
    expect(c.p[2]).toBeCloseTo(0.5, 2); expect(Math.hypot(...r3.omega(c))).toBeLessThan(1e-2);
  });
});

describe('convexSplit (M543)', () => {
  it('a cube stays one part; an L splits into two; a U into three, volumes kept', () => {
    const cube = extrude([[0, 0], [1, 0], [1, 1], [0, 1]], 1);
    expect(r3.convexSplit(cube.V, cube.F)).toHaveLength(1);
    const L = extrude([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 1), pl = r3.convexSplit(L.V, L.F);
    expect(pl).toHaveLength(2);
    expect(pl.reduce((s, p) => s + r3.hull(p, 64).volume, 0)).toBeCloseTo(3, 9);
    const U = extrude([[0, 0], [3, 0], [3, 2], [2, 2], [2, 1], [1, 1], [1, 2], [0, 2]], 0.5), pu = r3.convexSplit(U.V, U.F);
    expect(pu).toHaveLength(3);
    expect(pu.reduce((s, p) => s + r3.hull(p, 64).volume, 0)).toBeCloseTo(2.5, 9);
  });
  it('the split L glued back has the L\'s centre, falls and rests on its parts', () => {
    const L = extrude([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 1), C = r3.compound(r3.convexSplit(L.V, L.F).map((p) => r3.hull(p, 64)));
    // Centre of an L of three unit squares: (2·1 + 1·0.5)/3… by symmetry x = y = 5/6, z = 1/2.
    expect(C.centroid[0]).toBeCloseTo(5 / 6, 9); expect(C.centroid[1]).toBeCloseTo(5 / 6, 9); expect(C.volume).toBeCloseTo(3, 9);
    const b = r3.body3(C, [5, 5, 3], [0.3, 0.2, 0], [0, 0, 0], [0, 0, 0], 3);
    r3.simulate3([b], { box: [10, 10, 10], g: 9.81, e: 0, mu: 0.5, dt: 1e-3, frames: [0, 4] });
    expect(Math.hypot(...b.v)).toBeLessThan(0.05); expect(b.p[2]).toBeLessThan(1.2);
  });
  it('refuses an open mesh', () => {
    const cube = extrude([[0, 0], [1, 0], [1, 1], [0, 1]], 1);
    expect(() => r3.convexSplit(cube.V, cube.F.slice(1))).toThrow(/closed/);
  });
});

describe('the disc, thick, see-through and coloured (M543)', () => {
  it('blackbody colours: red at 2000 K, about white at 6500 K, blue at 20 000 K', () => {
    const [r1, , b1] = kr.blackbodyRGB(2000), w = kr.blackbodyRGB(6500), [r3c, , b3] = kr.blackbodyRGB(20000);
    expect(r1).toBeCloseTo(1, 9); expect(b1).toBeLessThan(0.4);
    expect(Math.min(...w)).toBeGreaterThan(0.85);
    expect(b3).toBeCloseTo(1, 9); expect(r3c).toBeLessThan(0.85);
  });
  it('without thickness or see-through it is the M542 disc; the temperature peaks near 1 and is shifted by g', () => {
    const a = kr.discImage(0.5, 1.2, { n: 24 }), b = kr.discImage(0.5, 1.2, { n: 24, thick: 0, opacity: 1 });
    expect([...a.I]).toEqual([...b.I]);
    const T = [...a.T].filter(Number.isFinite);
    expect(Math.max(...T)).toBeGreaterThan(0.8); expect(Math.max(...T)).toBeLessThan(1.6);
  });
  it('see-through: more pixels glow and the total light grows from the rays that cross again', () => {
    const o = { n: 40 }, solid = kr.discImage(0.9, (80 * Math.PI) / 180, o), thin = kr.discImage(0.9, (80 * Math.PI) / 180, { ...o, opacity: 0.5 });
    const lit = (d: typeof solid) => [...d.I].filter((v) => v > 0).length;
    expect(lit(thin)).toBeGreaterThanOrEqual(lit(solid));
    // Each pixel's first crossing gives half; later crossings add, so a ray crossing twice gives more than half.
    let more = 0;
    for (let k = 0; k < 1600; k++) if (solid.I[k] > 0 && thin.I[k] > 0.51 * solid.I[k]) more++;
    expect(more).toBeGreaterThan(5);
  });
  it('a thick disc seen nearly edge-on hides more of the hole than a thin one', () => {
    const th = (85 * Math.PI) / 180, thin = kr.discImage(0, th, { n: 32 }), thick = kr.discImage(0, th, { n: 32, thick: 0.15 });
    const lit = (d: typeof thin) => [...d.I].filter((v) => v > 0).length;
    expect(lit(thick)).toBeGreaterThan(lit(thin));
  });
});

describe('in the language (M543)', () => {
  it('convexSplit, Rolling on shapes, kerrDisc\'s new choices', () => {
    const r = lang([
      'P = [0 0; 2 0; 2 1; 1 1; 1 2; 0 2]; n = 6; V = [P zeros(n, 1); P ones(n, 1)];',
      'F = {n:-1:1, n+1:2*n}; for k = 1:n, F{end+1} = [k, mod(k, n)+1, n+mod(k, n)+1, n+k]; end',
      'parts = convexSplit(V, F); np = numel(parts);',
      "[t3, P3] = rigidShapes3D({parts}, [5 5 3 30 20 0], [], 'Time', 1, 'Rolling', 0.05);",
      "[I, g, rr, T] = kerrDisc(0.9, 70, 'Pixels', 24, 'Thickness', 0.05, 'Opacity', 0.5); Tmax = max(T(:));",
      "figure; kerrDisc(0.9, 80, 'Pixels', 32, 'Colour', 'temperature', 'Opacity', 0.6)",
      "hex = [cosd(0:60:300)' sind(0:60:300)'] * 0.5; figure; rigidShapes({hex}, [1 0.5 0], [3 0 -6], 'Box', [12 2], 'Time', 1, 'Rolling', 0.1)",
    ].join('\n'));
    expect(r.d('np')[0]).toBe(2); expect(r.d('P3').length).toBe(151 * 7);
    expect(r.d('Tmax')[0]).toBeGreaterThan(5000); expect(r.d('Tmax')[0]).toBeLessThan(20000);
    expect(r.graphics.figures.length).toBe(2);
    for (const f of r.graphics.figures) expect(renderSvg(f, 600, 450).length).toBeGreaterThan(1000);
  });
});
