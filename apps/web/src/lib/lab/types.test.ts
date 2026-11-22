import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import type { Mat } from './values';

const setup = () => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, files: new FileStore() }); return { lab, out: () => out, v: (n: string) => lab.vars.get(n) as Mat }; };
const nums = (m: Mat) => [...m.d];

describe('UniVerse Lab: number types (M386)', () => {
  it('rounds and saturates as MATLAB does', () => {
    const { lab, v } = setup();
    lab.run("a = uint8(250) + 10; b = uint8([1.5 2.5 -3]); c = int8(-200); d = uint8(7) / 2; e = -int16(5); f = class(a); g = int32(5) * 2.6; h = single(1/3); m = intmax('uint16'); s = sum(uint8([200 100]));");
    expect([nums(v('a')), nums(v('b')), nums(v('c')), nums(v('d')), nums(v('e')), nums(v('g')), nums(v('m')), nums(v('s'))]).toEqual([[255], [2, 3, 0], [-128], [4], [-5], [13], [65535], [255]]);
    expect((lab.vars.get('f') as unknown as { v: string }).v).toBe('uint8');
    expect(v('h').d[0]).toBe(Math.fround(1 / 3));
    expect(v('a').cls).toBe('uint8');
  });
  it('keeps the type through indexing, joining and functions, and refuses mixing two types', () => {
    const { lab, v } = setup();
    lab.run("x = int16([1 2 3]); y = x(2:3); z = [x 4.7]; x(5) = 9.6; w = abs(int16(-4)); q = double(x) / 2; t = isinteger(x); u = isa(x, 'integer'); k = zeros(2, 'uint8'); l = ones(1, 2, 'like', x);");
    expect([v('y').cls, v('z').cls, v('x').cls, v('w').cls, v('q').cls, v('k').cls, v('l').cls]).toEqual(['int16', 'int16', 'int16', 'int16', undefined, 'uint8', 'int16']);
    expect(nums(v('z'))).toEqual([1, 2, 3, 5]);
    expect(nums(v('x'))).toEqual([1, 2, 3, 0, 10]);
    expect([nums(v('t')), nums(v('u'))]).toEqual([[1], [1]]);
    expect(() => lab.run('int8(1) + int16(1)')).toThrow(/can’t be combined/);
  });
  it('does bit operations and whole-number division', () => {
    const { lab, v } = setup();
    lab.run("a = bitand(uint8(12), uint8(10)); b = bitor(12, 10); c = bitshift(uint8(255), 1); d = idivide(int32(7), int32(2)); e = idivide(int32(7), int32(2), 'round'); f = bin2dec('1010'); g = dec2bin(5);");
    expect([nums(v('a')), nums(v('b')), nums(v('c')), nums(v('d')), nums(v('e')), nums(v('f'))]).toEqual([[8], [14], [254], [3], [4], [10]]);
  });
  it('saves and loads typed arrays in .mat files, and imread gives uint8', () => {
    const { lab, v } = setup();
    lab.run("a = int16([-3 400]); b = single([1.5 2]); save t.mat a b; clear; load t.mat; I = zeros(2, 2, 3); I(:, :, 2) = 1; imwrite(I, 'g.png'); J = imread('g.png');");
    expect([v('a').cls, nums(v('a')), v('b').cls]).toEqual(['int16', [-3, 400], 'single']);
    expect([v('J').cls, v('J').d[4]]).toEqual(['uint8', 255]);
  });
});

describe('UniVerse Lab: more than three dimensions (M386)', () => {
  it('makes, sizes, indexes and prints them', () => {
    const { lab, v, out } = setup();
    lab.run('A = zeros(2, 3, 4, 5); s = size(A); n = ndims(A); A(2, 3, 4, 5) = 7; x = A(2, 3, 4, 5); B = reshape(1:24, 2, 2, 3, 2); y = B(1, 2, 3, 2); C = B(:, :, 2, :); sc = size(C); D = squeeze(C); sd = size(D); E = B + 1; se = size(E); P = permute(B, [4 3 2 1]); sp = size(P); p1 = P(2, 3, 2, 1); F = cat(4, ones(2), zeros(2)); sf = size(F);');
    expect([nums(v('s')), nums(v('n')), nums(v('x')), nums(v('y'))]).toEqual([[2, 3, 4, 5], [4], [7], [23]]);
    expect([nums(v('sc')), nums(v('sd')), nums(v('se')), nums(v('sp')), nums(v('p1')), nums(v('sf'))]).toEqual([[2, 2, 1, 2], [2, 2, 2], [2, 2, 3, 2], [2, 3, 2, 2], [23], [2, 2, 1, 2]]);
    lab.run('G = reshape(1:8, 1, 2, 2, 2)');
    expect(out()).toContain('G(:,:,2,2) =');
  });
});
