import { describe, expect, it } from 'vitest';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => toMat(lab.vars.get(n)!); };
const partsVol = (parts: number[][][]) => parts.reduce((s, p) => s + r3.hull(p, 64).volume, 0);
const extrude = (Q: number[][], h: number) => { const m = Q.length; return { V: [...Q.map(([x, y]) => [x, y, 0]), ...Q.map(([x, y]) => [x, y, h])], F: [Array.from({ length: m }, (_, i) => m - 1 - i), Array.from({ length: m }, (_, i) => m + i), ...Q.map((_, i) => [i, (i + 1) % m, m + ((i + 1) % m), m + i])] }; };

describe("convexSplit's 'voxel' search and the hull (M570)", () => {
  it('a hull with a corner inside a face and one on an edge keeps its volume', () => {
    const box = [[0, 0, 0], [3, 0, 0], [2, 1, 0], [0, 1, 0], [0, 0, 0.5], [3, 0, 0.5], [2, 1, 0.5], [0, 1, 0.5]];
    expect(r3.hull([...box, [1.7, 0, 0.2], [0, 1, 0.25], [1.7, 1, 0.4]], 64).volume).toBeCloseTo(1.25, 12);
  });
  it('an L, a U and a cube with a pyramid dent come out exact', () => {
    const L = extrude([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 1), U = extrude([[0, 0], [3, 0], [3, 2], [2, 2], [2, 1], [1, 1], [1, 2], [0, 2]], 0.5);
    const D = { V: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0.5, 0.5, 0.2]], F: [[3, 2, 1, 0], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 8], [5, 6, 8], [6, 7, 8], [7, 4, 8]] };
    for (const [M, v, k] of [[L, 3, 2], [U, 2.5, 3], [D, 1 - 0.8 / 3, 4]] as const) {
      const p = r3.convexSplit(M.V, M.F, { search: 'voxel' });
      expect(p.length).toBe(k);
      expect(partsVol(p) / v).toBeCloseTo(1, 6);
    }
  }, 30000);
  it('a half ring: within the tolerance, merged, none over 64 corners', () => {
    const P: number[][] = [];
    for (let i = 0; i <= 12; i++) { const t = (Math.PI * i) / 12; P.push([2 * Math.cos(t), 2 * Math.sin(t)]); }
    for (let i = 12; i >= 0; i--) { const t = (Math.PI * i) / 12; P.push([1.4 * Math.cos(t), 1.4 * Math.sin(t)]); }
    const M = extrude(P, 0.5), vol = 0.5 * 0.5 * 12 * Math.sin(Math.PI / 12) * (4 - 1.96), p = r3.convexSplit(M.V, M.F, { search: 'voxel' });
    expect(p.length).toBeLessThanOrEqual(12);
    expect(partsVol(p) / vol - 1).toBeLessThan(0.025);
    expect(partsVol(p) / vol).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(p.every((x) => x.length <= 64)).toBe(true);
  }, 60000);
});

describe('the disc: light from all of its gas, and a corona (M570)', () => {
  const sum = (x: ArrayLike<number>) => Array.from(x).reduce((a, b) => a + b, 0);
  it('hardly any scattering: the same as the slab; thick and scattering: a few per cent brighter; thin and scattering: dimmer', () => {
    const o = { n: 20, thick: 0.15, opacity: 0.6, tK: 10000 };
    const a = kr.discImage(0.5, 1.2, { ...o, scatter: 0.01 }), b = kr.discImage(0.5, 1.2, { ...o, scatter: 0.01, transfer: 'disc' });
    expect(sum(b.I) / sum(a.I)).toBeCloseTo(1, 2);
    const t = { n: 20, thick: 0.2, opacity: 0.999, tK: 10000, scatter: 0.5 }, c = kr.discImage(0.5, 1.2, t), d = kr.discImage(0.5, 1.2, { ...t, transfer: 'disc' });
    expect(sum(d.I) / sum(c.I)).toBeGreaterThan(1.01);
    expect(sum(d.I) / sum(c.I)).toBeLessThan(1.1);
    // A thin slab that mostly scatters lets its scattered light out: the slab formula (a deep slab) overstates it.
    const e = kr.discImage(0.5, 1.2, { ...o, scatter: 0.99 }), f = kr.discImage(0.5, 1.2, { ...o, scatter: 0.99, transfer: 'disc' });
    expect(sum(f.I) / sum(e.I)).toBeLessThan(0.5);
    expect([...f.S!].every((x) => x >= 0 && Number.isFinite(x))).toBe(true);
  }, 60000);
  it('Comptonization keeps photons and makes a power law of index −½ + √(9/4 + 4/y)', () => {
    const E = kr.EK, F = E.map((e) => (Math.abs(Math.log10(e / 0.5)) < 0.02 ? 1 : 0)), X = kr.comptonize(E, F, 100, 1);
    expect(sum(X.map((v, i) => v / E[i]))).toBeCloseTo(sum(F.map((v, i) => v / E[i])), 10);
    const th = 100 / 511, y = (4 * th + 16 * th * th), G = -0.5 + Math.sqrt(9 / 4 + 4 / y);
    const i1 = E.findIndex((e) => e >= 2), i2 = E.findIndex((e) => e >= 8), cut = (e: number) => Math.exp(-e / 100);
    const slope = Math.log((X[i2] / cut(E[i2])) / (X[i1] / cut(E[i1]))) / Math.log(E[i2] / E[i1]);
    expect(slope).toBeCloseTo(2 - G, 6);
    expect(X[E.findIndex((e) => e >= 900)]).toBeLessThan(1e-3 * Math.max(...X));
  });
  it("kerrDisc's corona: X-rays well above the bare disc's; E and X and 'Search', 'voxel' in the language", () => {
    const d = lang("[~, ~, ~, ~, ~, ~, E, X0] = kerrDisc(0.5, 60, 'Pixels', 16, 'Temperature', 1e7);\n[~, ~, ~, ~, ~, ~, ~, X1] = kerrDisc(0.5, 60, 'Pixels', 16, 'Temperature', 1e7, 'Corona', [100 1]);\nV = [0 0 0; 1 0 0; 0 1 0; 0 0 1]; F = [1 3 2; 1 2 4; 2 3 4; 3 1 4]; np = numel(convexSplit(V, F, 'Search', 'voxel'));");
    const E = [...d('E').d], X0 = [...d('X0').d], X1 = [...d('X1').d], at = (e: number) => E.findIndex((x) => x >= e);
    expect(E.length).toBe(151);
    expect(X1[at(50)]).toBeGreaterThan(1e3 * X0[at(50)]);
    expect(X1[at(0.01)]).toBeLessThan(X0[at(0.01)]); // some of the disc's own light moved up
    expect(d('np').d[0]).toBe(1);
    expect(() => lang("kerrDisc(0.5, 60, 'Pixels', 16, 'Corona', [2000 1])")).toThrow(/\[kTe tau\]/);
    expect(() => lang("kerrDisc(0.5, 60, 'Pixels', 16, 'Transfer', 'cloud')")).toThrow(/'slab'/);
  }, 60000);
});
