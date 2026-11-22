import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import type { Mat } from './values';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; } }); lab.run(code); return { lab, out, v: (n: string) => lab.vars.get(n) as Mat }; };

describe('UniVerse Lab: 3D arrays (M382)', () => {
  it('makes, sizes and prints them', () => {
    const { v, out } = run('A = zeros(2, 3, 4); s = size(A); n = numel(A); d = ndims(A); B = reshape(1:8, 2, 2, 2)');
    expect([...v('s').d]).toEqual([2, 3, 4]);
    expect([v('n').d[0], v('d').d[0], v('A').p]).toEqual([24, 3, 4]);
    expect(out).toContain('B(:,:,2) =');
  });
  it('indexes and assigns pages', () => {
    const { v } = run('A = []; A(:, :, 1) = [1 2; 3 4]; A(:, :, 2) = [5 6; 7 8]; x = A(2, 1, 2); P = A(:, :, 2); L = A(7); A(1, 1, 3) = 9; q = size(A, 3)');
    expect([v('x').d[0], [...v('P').d], v('L').d[0], v('q').d[0]]).toEqual([7, [5, 7, 6, 8], 6, 3]);
  });
  it('does element-by-element maths and reductions page by page or along pages', () => {
    const { v } = run('A = cat(3, [1 2; 3 4], [10 20; 30 40]); B = A * 2 + 1; s = sum(A); t = sum(A, 3); m = max(A, [], 3); c = A + [100 200]; q = squeeze(sum(sum(A, 1), 2))');
    expect([...v('B').d]).toEqual([3, 7, 5, 9, 21, 61, 41, 81]);
    expect([v('s').r, v('s').c, v('s').p, ...v('s').d]).toEqual([1, 2, 2, 4, 6, 40, 60]);
    expect([...v('t').d]).toEqual([11, 33, 22, 44]);
    expect([...v('m').d]).toEqual([10, 30, 20, 40]);
    expect([...v('c').d.subarray(4)]).toEqual([110, 130, 220, 240]);
    expect([...v('q').d]).toEqual([10, 100]);
  });
  it('permutes, joins and grids', () => {
    const { v } = run('A = reshape(1:24, 2, 3, 4); B = permute(A, [3 1 2]); C = [A A]; [X, Y, Z] = meshgrid(1:2, 1:3, 1:4); w = Z(3, 2, 4)');
    expect([v('B').r, v('B').c, v('B').p, v('B').d[1]]).toEqual([4, 2, 3, 7]);
    expect([v('C').c, v('C').p]).toEqual([6, 4]);
    expect([v('X').r, v('X').c, v('X').p, v('w').d[0]]).toEqual([3, 2, 4, 4]);
  });
  it('refuses what only works in 2D, plainly', () => {
    expect(() => run('A = ones(2, 2, 2); B = A * A')).toThrow(/2D matrices/);
  });
});

describe('UniVerse Lab: full-colour pictures (M382)', () => {
  it('shows a picture with three pages and converts it', async () => {
    const { Graphics, renderSvg, toTikz } = await import('./plot');
    const graphics = new Graphics();
    const lab = new Lab({ out: () => {}, graphics });
    lab.run('[X, Y] = meshgrid(linspace(0, 1, 4)); I = cat(3, X, Y, 1 - X); imshow(I); G = rgb2gray(I); S = imresize(I, 2); U = im2uint8(I)');
    const g = graphics.current!.axes.get(1)!.grids[0];
    expect([g.rgb?.length, graphics.current!.axes.get(1)!.visible]).toEqual([48, false]);
    expect((lab.vars.get('G') as Mat).d[0]).toBeCloseTo(0.114, 3);
    expect([(lab.vars.get('S') as Mat).r, (lab.vars.get('S') as Mat).p]).toEqual([8, 3]);
    expect((lab.vars.get('U') as Mat).d[12]).toBe(255);
    expect(renderSvg(graphics.current!, 400, 400)).toContain('image-rendering:pixelated');
    expect(toTikz(graphics.current!)).toContain('[rgb=0,0,1]');
  });
});
