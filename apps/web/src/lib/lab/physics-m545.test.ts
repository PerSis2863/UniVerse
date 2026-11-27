import { describe, expect, it } from 'vitest';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => [...toMat(lab.vars.get(n)!).d]; };
const partsVol = (parts: number[][][]) => parts.reduce((s, p) => s + r3.hull(p, 64).volume, 0);
// A unit cube with a pyramid pushed into its top, the tip down at z = 0.2: volume 1 − 0.8/3.
const V = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0.5, 0.5, 0.2]];
const F = [[3, 2, 1, 0], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 8], [5, 6, 8], [6, 7, 8], [7, 4, 8]];

describe('convexSplit (M545)', () => {
  it('a pyramid dent: no corner of a thin wedge dropped, and the plateau crossed by looking ahead: 4 exact parts', () => {
    const parts = r3.convexSplit(V, F);
    expect(parts.length).toBe(4);
    expect(partsVol(parts) / (1 - 0.8 / 3)).toBeCloseTo(1, 3);
  });
  it("'Search' tries free planes and keeps an L exact", () => {
    const L = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], n = L.length;
    const W = [...L.map(([x, y]) => [x, y, 0]), ...L.map(([x, y]) => [x, y, 1])];
    const G = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...L.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
    const parts = r3.convexSplit(W, G, { search: true });
    expect(parts.length).toBe(2);
    expect(partsVol(parts)).toBeCloseTo(5, 6);
  });
});

describe('the disc by colour (M545)', () => {
  const deg = Math.PI / 180, NL = kr.LAM.length;
  const blueRed = (d: ReturnType<typeof kr.discImage>) => { let b = 0, r = 0; for (let k = 0; k < d.n * d.n; k++) { b += d.S![k * NL + 3]; r += d.S![k * NL + 11]; } return b / r; };
  it('a sampled black body has the black body\'s colour', () => {
    const T = 5000, c = kr.sampledRGB(kr.LAM.map((l) => 1 / ((l * 1e-3) ** 5 * Math.expm1(14387.77 / (l * 1e-3 * T))))), w = kr.blackbodyRGB(T);
    c.forEach((x, i) => expect(x).toBeCloseTo(w[i], 2));
  });
  it('gas glows most at the colours it takes most (Kirchhoff): free–free redder, dust bluer', () => {
    const o = { n: 28, thick: 0.15, opacity: 0.6, tK: 10000 }, th = 82 * deg;
    const grey = kr.discImage(0.9, th, o), ff = kr.discImage(0.9, th, { ...o, absorb: 2 }), dust = kr.discImage(0.9, th, { ...o, absorb: -1 });
    expect(blueRed(ff)).toBeLessThan(blueRed(grey) / 1.02);
    expect(blueRed(dust)).toBeGreaterThan(blueRed(grey) * 1.02);
    // A solid disc shows only its faces: how its gas takes light makes no difference.
    const solid = { n: 20, tK: 10000 }, a = kr.discImage(0.9, th, solid), b = kr.discImage(0.9, th, { ...solid, absorb: 2 });
    const top = Math.max(...a.S!); a.S!.forEach((x, k) => expect(Math.abs(x - b.S![k]) / top).toBeLessThan(1e-12));
    // Absorption by colour changes the spectrum; the brightness picture only by what a ray meets after its grey light is
    // used up (it goes on while any colour still gets through).
    const sum = (x: Float64Array) => x.reduce((s, y) => s + y, 0);
    expect(Math.abs(sum(ff.I) / sum(grey.I) - 1)).toBeLessThan(2e-3);
  }, 60000);
  it('face-on, a pass through the gas as the gas measures it still takes about the opacity', () => {
    const v = kr.discImage(0, 5 * deg, { n: 24, thick: 0.15, opacity: 0.3 }), s = kr.discImage(0, 5 * deg, { n: 24, thick: 0.15 });
    const sum = (x: Float64Array) => x.reduce((a, b) => a + b, 0);
    expect(sum(v.I) / sum(s.I)).toBeGreaterThan(0.25);
    expect(sum(v.I) / sum(s.I)).toBeLessThan(0.4);
  }, 30000);
  it("kerrDisc's 'Absorption', convexSplit's 'Search' in the language", () => {
    const d = lang("figure; kerrDisc(0.9, 80, 'Pixels', 20, 'Colour', 'temperature', 'Thickness', 0.1, 'Opacity', 0.5, 'Absorption', 2); ok = 1;\nV = [0 0 0; 1 0 0; 0 1 0; 0 0 1]; F = [1 3 2; 1 2 4; 2 3 4; 3 1 4]; p = convexSplit(V, F, 'Search', true); np = numel(p);");
    expect(d('ok')[0]).toBe(1); expect(d('np')[0]).toBe(1);
    expect(() => lang("kerrDisc(0.5, 60, 'Absorption', 5)")).toThrow(/−4 to 4/);
  }, 60000);
});
