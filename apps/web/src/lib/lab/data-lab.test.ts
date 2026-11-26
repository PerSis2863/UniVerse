import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import { FileStore, writeFileBytes } from './files';
import { digest } from './data-lab';

const make = () => new Lab({ out: () => {}, graphics: new Graphics(), files: new FileStore() });
const num = (lab: Lab, n: string) => [...toMat(lab.vars.get(n)!).d];
const text = (lab: Lab, n: string) => (lab.vars.get(n) as { v: string }).v;

/** A NetCDF classic file: dims x = 3, y = 2; a double variable t(y, x) = 1..6 with scale_factor 2, a global title. */
function netcdf() {
  const parts: number[] = [], u32 = (v: number) => parts.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const name = (s: string) => { u32(s.length); for (const c of s) parts.push(c.charCodeAt(0)); while (parts.length % 4) parts.push(0); };
  parts.push(0x43, 0x44, 0x46, 1); u32(0);
  u32(10); u32(2); name('y'); u32(2); name('x'); u32(3);
  u32(12); u32(1); name('title'); u32(2); u32(5); for (const c of 'hello') parts.push(c.charCodeAt(0)); while (parts.length % 4) parts.push(0);
  u32(11); u32(1); name('t'); u32(2); u32(0); u32(1);
  u32(12); u32(1); name('scale_factor'); u32(6); u32(1); const sf = new DataView(new ArrayBuffer(8)); sf.setFloat64(0, 2); for (let i = 0; i < 8; i++) parts.push(sf.getUint8(i));
  u32(6); u32(48); const beginAt = parts.length; u32(0);
  const begin = parts.length; parts[beginAt] = 0; parts[beginAt + 3] = begin & 255; parts[beginAt + 2] = (begin >> 8) & 255;
  const dv = new DataView(new ArrayBuffer(48)); for (let i = 0; i < 6; i++) dv.setFloat64(i * 8, i + 1);
  for (let i = 0; i < 48; i++) parts.push(dv.getUint8(i));
  return Uint8Array.from(parts);
}
/** A FITS file: a 3 × 2 16-bit image with BZERO 100. */
function fitsFile() {
  const cards = ['SIMPLE  =                    T', 'BITPIX  =                   16', 'NAXIS   =                    2', 'NAXIS1  =                    3', 'NAXIS2  =                    2', 'BZERO   =                  100', 'END'];
  const head = new Uint8Array(2880).fill(32);
  cards.forEach((c, i) => { for (let k = 0; k < c.length; k++) head[i * 80 + k] = c.charCodeAt(k); });
  const data = new Uint8Array(2880), dv = new DataView(data.buffer);
  [1, 2, 3, 4, 5, 6].forEach((v, i) => dv.setInt16(i * 2, v));
  const out = new Uint8Array(5760); out.set(head); out.set(data, 2880);
  return out;
}

describe('Hyperion data files (M557)', () => {
  it('JSON both ways', () => {
    const lab = make();
    lab.run(`s = jsondecode('{"name":"Ada","scores":[90,85,77],"grid":[[1,2],[3,4]],"ok":true,"none":null}');
      n = s.scores; g = s.grid; back = jsonencode(struct('a', [1 2 3], 'b', 'hi', 'c', NaN));`);
    expect(num(lab, 'n')).toEqual([90, 85, 77]);
    expect(num(lab, 'g')).toEqual([1, 3, 2, 4]);
    expect(text(lab, 'back')).toBe('{"a":[1,2,3],"b":"hi","c":null}');
  });
  it('YAML and XML', () => {
    const lab = make();
    lab.run(`y = yamldecode(sprintf('name: rig\\nsize:\\n  w: 3\\n  h: 4\\ntags:\\n  - fast\\n  - small\\nflags: [1, 2, 3]'));
      w = y.size.w; f = y.flags; tag = y.tags{2};`);
    expect(num(lab, 'w')).toEqual([3]);
    expect(num(lab, 'f')).toEqual([1, 2, 3]);
    expect(text(lab, 'tag')).toBe('small');
    writeFileBytes(lab, 'part.xml', new TextEncoder().encode('<part id="7"><name>bracket</name><mass>1.5</mass></part>'));
    lab.run("p = readstruct('part.xml'); m = p.mass; id = p.idAttribute;");
    expect(num(lab, 'm')).toEqual([1.5]);
    expect(num(lab, 'id')).toEqual([7]);
  });
  it('NetCDF classic: ncinfo and ncread (dimensions in MATLAB’s order, scale_factor applied)', () => {
    const lab = make();
    writeFileBytes(lab, 'a.nc', netcdf());
    lab.run("info = ncinfo('a.nc'); t = ncread('a.nc', 't'); sz = size(t); ti = ncreadatt('a.nc', '/', 'title');");
    expect(num(lab, 'sz')).toEqual([3, 2]);
    expect(num(lab, 't')).toEqual([2, 4, 6, 8, 10, 12]);
    expect(text(lab, 'ti')).toBe('hello');
  });
  it('FITS images', () => {
    const lab = make();
    writeFileBytes(lab, 'sky.fits', fitsFile());
    lab.run("im = fitsread('sky.fits'); sz = size(im);");
    expect(num(lab, 'sz')).toEqual([2, 3]);
    expect(num(lab, 'im')).toEqual([101, 104, 102, 105, 103, 106]);
  });
  it('hashes match their published test values; zip, gzip, base64 and byte streams round-trip', () => {
    const abc = new TextEncoder().encode('abc');
    expect(digest('md5', abc)).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(digest('sha1', abc)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(digest('sha256', abc)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(digest('md5', new Uint8Array(0))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    const lab = make();
    writeFileBytes(lab, 'note.txt', new TextEncoder().encode('hello world'));
    lab.run(`zip('pack', {'note.txt'}); delete('note.txt'); got = unzip('pack.zip'); t = fileread('note.txt');
      e = base64encode('Hyperion'); d = char(base64decode(e));
      b = getByteStreamFromArray(magic(3)); m = getArrayFromByteStream(b);`);
    expect(text(lab, 't')).toBe('hello world');
    expect(text(lab, 'e')).toBe('SHlwZXJpb24=');
    expect(text(lab, 'd')).toBe('Hyperion');
    expect(num(lab, 'm')).toEqual([8, 3, 4, 1, 5, 9, 6, 7, 2]);
  });
});
