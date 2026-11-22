import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lab } from './interp';
import { FileStore, readMat } from './files';
import type { Cell, Mat, Struct } from './values';

const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));
const nums = (v: unknown) => [...(v as Mat).d];

describe('Hyperion: MATLAB 7.3 files (M388)', () => {
  it('reads numbers, types, text, logicals, complex, 3D, empty, cells, structs and sparse', () => {
    const vars = new Map(readMat(fixture('v73.mat')));
    const A = vars.get('A') as Mat;
    expect([A.r, A.c, ...nums(A)]).toEqual([3, 4, ...Array.from({ length: 12 }, (_, i) => i + 1)]);
    const big = vars.get('big') as Mat;
    expect([big.r, big.c, big.d[0], big.d[49999], big.d[100 * 37 + 5]]).toEqual([100, 500, 1, 50000, 100 * 37 + 6]);
    expect([(vars.get('u') as Mat).cls, nums(vars.get('u'))]).toEqual(['uint8', [1, 2, 250]]);
    expect([(vars.get('i') as Mat).r, (vars.get('i') as Mat).cls, nums(vars.get('i'))]).toEqual([2, 'int16', [-5, 7]]);
    expect((vars.get('t') as unknown as { v: string }).v).toBe('hello');
    expect([(vars.get('b') as Mat).logical, nums(vars.get('b'))]).toEqual([true, [1, 0, 1]]);
    const z = vars.get('z') as Mat;
    expect([nums(z), [...z.im!]]).toEqual([[1, 3], [2, -1]]);
    const P = vars.get('P') as Mat;
    expect([P.r, P.c, P.p, P.d[23]]).toEqual([2, 3, 4, 24]);
    expect([(vars.get('e') as Mat).r, (vars.get('e') as Mat).c]).toEqual([0, 0]);
    const c = vars.get('c') as Cell;
    expect([c.r, c.c, nums(c.d[0]), (c.d[1] as unknown as { v: string }).v]).toEqual([1, 2, [42], 'two']);
    const s = vars.get('s') as Struct;
    expect([nums(s.f.get('age')), (s.f.get('name') as unknown as { v: string }).v]).toEqual([[36], 'Ada']);
    const S = vars.get('S') as Mat;
    expect([S.r, S.c, ...nums(S)]).toEqual([3, 2, 5, 0, 0, 0, 0, 7]);
  });
  it('reads the newer HDF5 layout (superblock 2, version 2 headers, link messages)', () => {
    const vars = new Map(readMat(fixture('v73-new.mat')));
    expect(nums(vars.get('A'))).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect((vars.get('t') as unknown as { v: string }).v).toBe('hi');
    expect(nums((vars.get('s') as Struct).f.get('x'))).toEqual([9]);
  });
  it('load takes a 7.3 file', () => {
    const files = new FileStore(), lab = new Lab({ out: () => {}, files });
    files.load('big.mat', { bytes: fixture('v73.mat') });
    lab.run("load big.mat A u; S = load('big.mat');");
    expect(nums(lab.vars.get('A'))).toHaveLength(12);
    expect([...(lab.vars.get('S') as Struct).f.keys()]).toContain('big');
  });
});
