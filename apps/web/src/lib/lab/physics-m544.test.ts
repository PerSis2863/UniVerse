import { describe, expect, it } from 'vitest';
import * as r3 from './rigid3d';
import * as kr from './kerr';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './sciences';

const lang = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => [...toMat(lab.vars.get(n)!).d]; };
const extrude = (P: number[][], h: number) => {
  const n = P.length, V = [...P.map(([x, y]) => [x, y, 0]), ...P.map(([x, y]) => [x, y, h])];
  const F = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...P.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
  return { V, F };
};
// The mesh's own volume (faces fanned into triangles).
const meshVol = (V: number[][], F: number[][]) => Math.abs(F.reduce((s, f) => {
  for (let k = 1; k + 1 < f.length; k++) { const [a, b, c] = [V[f[0]], V[f[k]], V[f[k + 1]]]; s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
  return s;
}, 0) / 6);
const partsVol = (parts: number[][][]) => parts.reduce((s, p) => s + r3.hull(p, 64).volume, 0);

describe('convexSplit on smooth curves (M544)', () => {
  it('a half ring of 24 steps: its parts within 1% of its volume, none hollow, none over 64 corners', () => {
    const P: number[][] = [];
    for (let i = 0; i <= 24; i++) { const t = (Math.PI * i) / 24; P.push([2 * Math.cos(t), 2 * Math.sin(t)]); }
    for (let i = 24; i >= 0; i--) { const t = (Math.PI * i) / 24; P.push([1.4 * Math.cos(t), 1.4 * Math.sin(t)]); }
    const m = extrude(P, 0.5), parts = r3.convexSplit(m.V, m.F);
    expect(parts.length).toBeLessThanOrEqual(16);
    expect(parts.every((p) => p.length <= 64)).toBe(true);
    expect(partsVol(parts) / meshVol(m.V, m.F)).toBeGreaterThan(0.99);
    expect(partsVol(parts) / meshVol(m.V, m.F)).toBeLessThan(1.01);
  }, 30000);
  it('a doughnut (no flat faces to cut along) splits into its ring of parts', () => {
    const N = 12, M = 6, V: number[][] = [], F: number[][] = [], id = (i: number, j: number) => ((i + N) % N) * M + ((j + M) % M);
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const u = (2 * Math.PI * i) / N, v = (2 * Math.PI * j) / M; V.push([(2 + 0.6 * Math.cos(v)) * Math.cos(u), (2 + 0.6 * Math.cos(v)) * Math.sin(u), 0.6 * Math.sin(v)]); }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) F.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
    const parts = r3.convexSplit(V, F);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(partsVol(parts) / meshVol(V, F)).toBeCloseTo(1, 2);
  }, 30000);
});

describe('the thick disc (M544)', () => {
  const deg = Math.PI / 180, sum = (x: Float64Array) => x.reduce((s, y) => s + y, 0);
  it('see-through, face-on: a pass straight through takes about the opacity, as before', () => {
    const v = kr.discImage(0.5, 10 * deg, { n: 32, thick: 0.15, opacity: 0.3 }), o = kr.discImage(0.5, 10 * deg, { n: 32, thick: 0.15 });
    expect(sum(v.I) / sum(o.I)).toBeGreaterThan(0.25);
    expect(sum(v.I) / sum(o.I)).toBeLessThan(0.4);
  }, 30000);
  it('a thicker see-through disc seen nearly edge-on shadows more of its far side', () => {
    // The same opacity, more gas on the way: the light from behind (rays that crossed the near side) falls.
    const th = 80 * deg, thin = kr.discImage(0, th, { n: 32, thick: 0.05, opacity: 0.3 }), thick = kr.discImage(0, th, { n: 32, thick: 0.25, opacity: 0.3 });
    // The far side shows over the top of the hole: the picture's upper half (rows run from the top).
    const far = (d: ReturnType<typeof kr.discImage>) => { let s = 0; for (let i = 0; i < d.n / 2; i++) for (let j = 0; j < d.n; j++) s += d.I[i * d.n + j]; return s / sum(d.I); };
    expect(far(thick)).toBeLessThan(far(thin) - 0.03);
    expect([...thick.r].filter(Number.isFinite).length).toBeGreaterThan(0);
  }, 30000);
  it('a solid thick disc: the inner wall glows seen from above, the rim stops edge-on rays; a thin one has neither', () => {
    const rin = kr.isco(0.5), wall = (d: ReturnType<typeof kr.discImage>, r: number) => [...d.r].filter((x) => Math.abs(x - r) < 1e-9).length;
    const thick = kr.discImage(0.5, 60 * deg, { n: 60, thick: 0.2 }), thin = kr.discImage(0.5, 60 * deg, { n: 60 });
    expect(wall(thick, rin)).toBeGreaterThan(0); expect(wall(thin, rin)).toBe(0);
    const edge = kr.discImage(0.5, 89.5 * deg, { n: 24, thick: 0.2 });
    expect(wall(edge, 20)).toBeGreaterThan(0);
  }, 30000);
});

describe('in the language (M544)', () => {
  it("convexSplit takes up to 32 parts and refuses more", () => {
    const d = lang("[x, y] = deal(cos(linspace(0, pi, 9)), sin(linspace(0, pi, 9))); P = [2*x' 2*y'; fliplr(1.4*x)' fliplr(1.4*y)']; n = size(P, 1);\nV = [P zeros(n, 1); P 0.5*ones(n, 1)]; F = nan(n + 2, n); F(1, :) = n:-1:1; F(2, :) = n+1:2*n;\nfor i = 1:n, j = mod(i, n) + 1; F(i + 2, 1:4) = [i j n+j n+i]; end\nparts = convexSplit(V, F, 'Parts', 32); np = numel(parts);");
    expect(d('np')[0]).toBeGreaterThanOrEqual(4);
    expect(() => lang("V = [0 0 0; 1 0 0; 0 1 0; 0 0 1]; F = [1 3 2; 1 2 4; 2 3 4; 3 1 4]; convexSplit(V, F, 'Parts', 33)")).toThrow(/1 to 32/);
  }, 30000);
});
