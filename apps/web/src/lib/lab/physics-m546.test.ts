import { describe, expect, it } from 'vitest';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => toMat(lab.vars.get(n)!); };
const partsVol = (parts: number[][][]) => parts.reduce((s, p) => s + r3.hull(p, 64).volume, 0);

describe("convexSplit's 'full' search (M546)", () => {
  it('a half ring: fewer parts than the plain split, still within 1% of its volume', () => {
    const P: number[][] = [];
    for (let i = 0; i <= 12; i++) { const t = (Math.PI * i) / 12; P.push([2 * Math.cos(t), 2 * Math.sin(t)]); }
    for (let i = 12; i >= 0; i--) { const t = (Math.PI * i) / 12; P.push([1.4 * Math.cos(t), 1.4 * Math.sin(t)]); }
    const n = P.length, V = [...P.map(([x, y]) => [x, y, 0]), ...P.map(([x, y]) => [x, y, 0.5])];
    const F = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...P.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
    const vol = 0.5 * 0.5 * 12 * Math.sin(Math.PI / 12) * (4 - 1.96);
    const plain = r3.convexSplit(V, F), full = r3.convexSplit(V, F, { search: 'full' });
    expect(full.length).toBeLessThanOrEqual(plain.length);
    expect(Math.abs(partsVol(full) / vol - 1)).toBeLessThan(0.01);
    expect(full.every((p) => p.length <= 64)).toBe(true);
  }, 60000);
  it('a convex box stays one part', () => {
    const box = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0], [0, 0, 1], [2, 0, 1], [2, 1, 1], [0, 1, 1]];
    const F = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    expect(r3.convexSplit(box, F, { search: 'full' }).length).toBe(1);
  });
});

describe('the disc scattering (M546)', () => {
  const NL = kr.LAM.length, sum = (x: ArrayLike<number>) => Array.from(x).reduce((a, b) => a + b, 0);
  const blueRed = (d: ReturnType<typeof kr.discImage>) => { let b = 0, r = 0; for (let k = 0; k < d.n * d.n; k++) { b += d.S![k * NL + 3]; r += d.S![k * NL + 11]; } return b / r; };
  it('a solid disc keeps its light; its colour temperature rises by the colour correction and it turns bluer', () => {
    const o = { n: 24, tK: 10000 }, a = kr.discImage(0.5, 1.2, o), b = kr.discImage(0.5, 1.2, { ...o, scatter: 0.99 });
    expect(sum(b.I) / sum(a.I)).toBeCloseTo(1, 10);
    const Ta = Math.max(...[...a.T].filter(Number.isFinite)), Tb = Math.max(...[...b.T].filter(Number.isFinite));
    const e = Math.sqrt(0.01), fcol = ((2 * e) / (1 + e)) ** -0.25;
    expect(Tb / Ta).toBeCloseTo(fcol, 6);
    expect(blueRed(b)).toBeGreaterThan(blueRed(a) * 1.2);
  }, 30000);
  it('no scattering changes nothing', () => {
    const o = { n: 16, thick: 0.15, opacity: 0.6, tK: 10000 }, a = kr.discImage(0.5, 1.3, o), b = kr.discImage(0.5, 1.3, { ...o, scatter: 0 });
    expect([...b.I]).toEqual([...a.I]);
    expect(() => kr.discImage(0.5, 1.3, { n: 8, scatter: 1 })).toThrow(/0 to 0.99/);
  }, 30000);
  it("kerrDisc gives the spectrum and its wavelengths; 'Search', 'full' in the language", () => {
    const d = lang("[I, g, r, T, S, lam] = kerrDisc(0.5, 60, 'Pixels', 16, 'Scattering', 0.5);\nV = [0 0 0; 1 0 0; 0 1 0; 0 0 1]; F = [1 3 2; 1 2 4; 2 3 4; 3 1 4]; p = convexSplit(V, F, 'Search', 'full'); np = numel(p);");
    expect([d('S').r, d('S').c, d('S').p]).toEqual([16, 16, 17]);
    expect([...d('lam').d].slice(0, 2)).toEqual([380, 405]);
    expect(d('np').d[0]).toBe(1);
    expect(() => lang("V = [0 0 0; 1 0 0; 0 1 0; 0 0 1]; F = [1 3 2; 1 2 4; 2 3 4; 3 1 4]; convexSplit(V, F, 'Search', 'deep')")).toThrow(/true, false or 'full'/);
  }, 30000);
});
