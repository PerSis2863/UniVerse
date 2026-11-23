import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './image-lab';
import * as im from './image';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const P = (rows: number[][]) => im.plane(rows.length, rows[0].length, rows[0].flatMap((_, j) => rows.map((r) => r[j])));
const rowsOf = (p: im.Plane) => Array.from({ length: p.r }, (_, i) => Array.from({ length: p.c }, (_, j) => p.d[i + j * p.r]));
const box = (r: number, c: number, f: (i: number, j: number) => boolean) => P(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (f(i, j) ? 1 : 0))));

describe('Hyperion picture processing (M428)', () => {
  it('filters by correlation or convolution, with border rules', () => {
    const I = P([[1, 2], [3, 4]]), up = P([[0, 1, 0], [0, 0, 0], [0, 0, 0]]);
    expect(rowsOf(im.filter(I, up))).toEqual([[0, 0], [1, 2]]);
    expect(rowsOf(im.filter(I, up, 'zero', true))).toEqual([[3, 4], [0, 0]]);
    expect(rowsOf(im.filter(I, up, 'replicate'))).toEqual([[1, 2], [1, 2]]);
    const ones = box(5, 5, () => true);
    expect(im.filter(ones, im.average(3)).d[0]).toBeCloseTo(4 / 9, 12);
    expect(im.filter(ones, im.average(3), 'replicate').d[0]).toBeCloseTo(1, 12);
    expect(im.gaussian(5, 5, 1).d.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    expect(im.logKernel(5, 0.5).d.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 12);
    // A lone bright pixel goes in a median.
    const spot = box(5, 5, (i, j) => i === 2 && j === 2);
    expect(im.median(spot).d.every((v) => v === 0)).toBe(true);
  });

  it('finds a step edge one pixel thick (Sobel and Canny) and thresholds by Otsu', () => {
    const step = box(20, 20, (_, j) => j >= 10);
    for (const e of [im.gradientEdges(step, 'sobel').edges, im.canny(step).edges]) {
      const cols = new Set<number>(); e.forEach((v, k) => { if (v) cols.add(Math.floor(k / 20)); });
      expect(cols.size).toBe(1);
      expect([9, 10]).toContain([...cols][0]);
    }
    const v = [...new Array(500).fill(0.2), ...new Array(500).fill(0.8)];
    const t = im.otsu(v);
    expect(t).toBeGreaterThan(0.2); expect(t).toBeLessThan(0.8);
  });

  it('erodes, dilates, labels, fills and measures shapes', () => {
    const sq = box(9, 9, (i, j) => i >= 2 && i <= 6 && j >= 2 && j <= 6), S = im.strel('square', 3);
    expect(im.erode(sq, S).d.reduce((s, v) => s + v, 0)).toBe(9);
    expect([...im.open(sq, S).d]).toEqual([...sq.d]);
    expect(im.dilate(sq, S).d.reduce((s, v) => s + v, 0)).toBe(49);
    const two = box(10, 40, (i, j) => (i >= 2 && i <= 6 && j < 5) || (i >= 0 && i < 10 && j >= 20 && j < 30));
    const { L, n } = im.label(two.d, 10, 40);
    expect(n).toBe(2);
    const R = im.regions(L, 10, 40);
    expect(R[0].area).toBe(25); expect(R[0].centroid).toEqual([3, 5]); expect(R[0].box).toEqual([0.5, 2.5, 5, 5]);
    // A 10 × 30 bar: MATLAB's ellipse axes 34.64 and 11.55, lying flat.
    const bar = box(10, 30, () => true), r = im.regions(bar.d, 10, 30)[0];
    expect(r.major).toBeCloseTo(34.641, 2); expect(r.minor).toBeCloseTo(11.547, 2); expect(r.orientation).toBeCloseTo(0, 9);
    expect(im.regions(box(30, 10, () => true).d, 30, 10)[0].orientation).toBeCloseTo(90, 9);
    const ring = box(9, 9, (i, j) => Math.max(Math.abs(i - 4), Math.abs(j - 4)) === 3);
    expect(im.fillHoles(ring.d, 9, 9).reduce((s, v) => s + v, 0)).toBe(49);
    expect(im.areaOpen(two.d, 10, 40, 50).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it('measures quality and draws the test pictures', () => {
    const p = im.phantom(256);
    expect(p.d[128 + 128 * 256]).toBeCloseTo(0.2, 9);
    expect(p.d[0]).toBe(0);
    const s = im.ssim(p, p);
    expect(s.value).toBeCloseTo(1, 9);
    expect(im.psnr(p.d, p.d)).toBe(Infinity);
    const cb = im.checkerboard(2, 1);
    expect(rowsOf(cb)).toEqual([[0, 0, 0.7, 0.7], [0, 0, 0.7, 0.7], [1, 1, 0, 0], [1, 1, 0, 0]]);
  });

  it('in the language', () => {
    const r = run("rng(2)\nI = phantom(64);\nJ = imnoise(I, 'salt & pepper', 0.05);\nK = medfilt2(J);\nbetter = psnr(K, I) > psnr(J, I);\nBW = imbinarize(I);\nBW = imfill(BW, 'holes');\n[L, n] = bwlabel(BW);\nst = regionprops(BW, 'Area', 'Centroid');\nE = edge(I, 'canny');\nh = fspecial('gaussian', 5, 1); s = sum(h(:));\nse = strel('disk', 2); nb = sum(se.Neighborhood(:));\nU = uint8(255*I); V = imgaussfilt(U, 1); cls = isa(V, 'uint8');\nimshow(label2rgb(L))\nfigure; imhist(I)");
    expect(r.d('better')).toEqual([1]);
    expect(r.d('n')[0]).toBeGreaterThanOrEqual(1);
    expect(r.d('s')[0]).toBeCloseTo(1, 12);
    expect(r.d('nb')).toEqual([13]);
    expect(r.d('cls')).toEqual([1]);
    expect(r.d('E').some((v) => v === 1)).toBe(true);
    expect(r.graphics.figures.length).toBe(2);
    expect(() => run("edge(cat(3, eye(3), eye(3), eye(3)))")).toThrow(/rgb2gray/);
  });
});
