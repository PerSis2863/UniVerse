import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { Lab } from './interp';
import { FileStore, readMat, writeMat } from './files';
import type { Mat, Struct, Value } from './values';

const setup = () => { const files = new FileStore(); let out = ''; const lab = new Lab({ out: (t) => { out += t; }, files }); return { files, lab, out: () => out, v: (n: string) => lab.vars.get(n) as Mat }; };

describe('Hyperion: files (M383)', () => {
  it('reads and writes delimited text, skipping a header row', () => {
    const { files, lab, v } = setup();
    files.load('data.csv', { bytes: new TextEncoder().encode('time,speed\n0,1.5\n1,2.5\n2,\n') });
    lab.run("A = readmatrix('data.csv'); writematrix(A * 2, 'twice.csv'); B = readmatrix('twice.csv'); C = csvread('twice.csv');");
    expect([v('A').r, v('A').c, v('A').d[1], Number.isNaN(v('A').d[5])]).toEqual([3, 2, 1, true]);
    expect([...v('B').d.subarray(0, 4)]).toEqual([0, 2, 4, 3]);
    expect(v('C').d[5]).toBe(0);
    expect(files.takeChanges().map((c) => c.name)).toEqual(['twice.csv']);
  });
  it('writes and reads Excel workbooks', () => {
    const { lab, v } = setup();
    lab.run("writematrix([1 2; 3 4.5], 'book.xlsx'); M = readmatrix('book.xlsx'); C = readcell('book.xlsx');");
    expect([...v('M').d]).toEqual([1, 3, 2, 4.5]);
    expect((lab.vars.get('C') as { r: number }).r).toBe(2);
  });
  it('saves and loads MATLAB .mat files, compressed ones too', () => {
    const { files, lab, v } = setup();
    lab.run("x = [1 2; 3 4]; z = [1+2i 3]; s.name = 'Ada'; s.age = 36; c = {1, 'two'}; t = 'hello'; b = [true false]; P = ones(2, 2, 3); save data.mat; clear; load data.mat");
    expect([...v('x').d]).toEqual([1, 3, 2, 4]);
    expect([...v('z').im!]).toEqual([2, 0]);
    expect(((lab.vars.get('s') as Struct).f.get('name') as { v: string }).v).toBe('Ada');
    expect((lab.vars.get('t') as { v: string }).v).toBe('hello');
    expect([v('b').logical, v('P').p]).toEqual([true, 3]);
    lab.run("save('two.mat', 'x', 't'); S = load('two.mat');");
    expect([...(lab.vars.get('S') as Struct).f.keys()]).toEqual(['x', 't']);
    // A compressed element, as MATLAB writes by default.
    const plain = writeMat([['y', { k: 'mat', r: 1, c: 2, d: Float64Array.from([7, 8]) } as Value]]);
    const body = plain.subarray(128), zipped = zlibSync(body);
    const tag = new Uint8Array(8); new DataView(tag.buffer).setUint32(0, 15, true); new DataView(tag.buffer).setUint32(4, zipped.length, true);
    const file = new Uint8Array([...plain.subarray(0, 128), ...tag, ...zipped]);
    expect(readMat(file).map(([n, m]) => [n, [...(m as Mat).d]])).toEqual([['y', [7, 8]]]);
    files.load('m.mat', { bytes: file });
    lab.run("load('m.mat')");
    expect([...v('y').d]).toEqual([7, 8]);
  });
  it('reads and writes tables', () => {
    const { files, lab, out } = setup();
    files.load('people.csv', { bytes: new TextEncoder().encode('Name,Age,Height (cm)\nAda,36,165\nAlan,41,178\n') });
    lab.run("T = readtable('people.csv'); a = T.Age; n = T.Name; h = height(T); writetable(T, 'copy.csv'); U = table([1; 2], {'x'; 'y'}, 'VariableNames', {'id', 'tag'}); disp(U)");
    expect([...(lab.vars.get('a') as Mat).d, (lab.vars.get('h') as Mat).d[0]]).toEqual([36, 41, 2]);
    expect([...(lab.vars.get('T') as Struct).f.keys()]).toEqual(['Name', 'Age', 'Height_cm']);
    expect(files.text('copy.csv')).toBe('Name,Age,Height_cm\nAda,36,165\nAlan,41,178\n');
    expect(out()).toMatch(/id\s+tag/);
  });
  it('writes text files line by line and reads them back', () => {
    const { lab, v } = setup();
    lab.run("f = fopen('log.txt', 'w'); fprintf(f, 'step %d\\n', 1:3); fclose(f); g = fopen('log.txt'); first = fgetl(g); rest = fscanf(g, '%f'); fclose(g); e = exist('log.txt');");
    expect((lab.vars.get('first') as { v: string }).v).toBe('step 1');
    expect([...v('rest').d]).toEqual([2, 3]);
    expect(v('e').d[0]).toBe(2);
  });
  it('writes and reads pictures', () => {
    const { files, lab, v } = setup();
    lab.run("I = zeros(2, 3, 3); I(:, :, 1) = 1; imwrite(I, 'red.png'); J = imread('red.png');");
    expect(files.get('red.png').bytes.subarray(1, 4)).toEqual(new Uint8Array([80, 78, 71]));
    expect([v('J').r, v('J').c, v('J').p, v('J').d[0], v('J').d[6]]).toEqual([2, 3, 3, 255, 0]);
    expect(() => lab.run("imread('nope.png')")).toThrow(/no file called/);
  });
});
