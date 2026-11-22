import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lab } from './interp';
import { FileStore } from './files';
import { readXls } from './xls';
import { encodeJpeg } from './jpeg';
import type { Mat, Struct } from './values';

const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));

describe('Hyperion: old Excel files and JPEG (M387)', () => {
  it('reads an .xls workbook kept in the mini stream', () => {
    const [data, second] = readXls(fixture('small.xls'));
    expect(data.name).toBe('Data');
    expect(data.rows.slice(0, 3)).toEqual([['Name', 'Age', 'Score'], ['Ada', '36', '91.5'], ['Alan', '41', '88']]);
    expect(second.rows).toEqual([['1.5', '-2'], ['Grüße ✓', 'true'], ['123456789.125', '0.01']]);
  });
  it('reads a big one whose shared text runs over several records', () => {
    const [data] = readXls(fixture('big.xls'));
    expect(data.rows.length).toBe(602);
    expect(data.rows[600]).toEqual([`Person 0599 ${'x'.repeat(599 % 40)}`, String(20 + (599 % 50)), String(599 * 0.5)]);
  });
  it('readmatrix, readtable and readcell take .xls files', () => {
    const files = new FileStore(), lab = new Lab({ out: () => {}, files });
    files.load('people.xls', { bytes: fixture('small.xls') });
    lab.run("M = readmatrix('people.xls'); T = readtable('people.xls'); S = readmatrix('people.xls', 'Sheet', 'Second');");
    expect([...(lab.vars.get('M') as Mat).d.subarray(0, 2)].every(Number.isNaN)).toBe(true);
    expect([...((lab.vars.get('T') as Struct).f.get('Age') as Mat).d.subarray(0, 2)]).toEqual([36, 41]);
    expect((lab.vars.get('S') as Mat).d[0]).toBe(1.5);
  });
  it('writes a well-formed JPEG', () => {
    const w = 37, h = 21, rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; rgba[o] = x * 7; rgba[o + 1] = y * 12; rgba[o + 2] = 128; rgba[o + 3] = 255; }
    const jpg = encodeJpeg(w, h, rgba, 90);
    expect([...jpg.subarray(0, 2), ...jpg.subarray(-2)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    const files = new FileStore(), lab = new Lab({ out: () => {}, files });
    lab.run("I = rand(10, 12, 3); imwrite(I, 'r.jpg', 'Quality', 50); imwrite(I, 'r.bmp'); J = imread('r.jpg');");
    expect([files.get('r.bmp').bytes[0], files.get('r.bmp').bytes[1]]).toEqual([0x42, 0x4d]);
    expect((lab.vars.get('J') as Mat).c).toBe(12);
  });
});
