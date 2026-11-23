import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './sciences';
import * as mi from './medimg';
import { decodeJpeg, decodeRle } from './dicom-codecs';
import FIX from './fixtures/dicom-compressed.json';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics, files: new FileStore() }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

/** An implicit-VR file without the Part 10 header, as old scanners wrote. */
function implicitRaw(rows: number, cols: number, vals: number[]) {
  const b: number[] = [], u16 = (v: number) => b.push(v & 255, (v >> 8) & 255), u32 = (v: number) => { u16(v & 0xffff); u16(v >>> 16); };
  const el = (g: number, e: number, data: number[]) => { u16(g); u16(e); u32(data.length); b.push(...data); };
  el(0x0008, 0x0060, [67, 84]);
  // A sequence of undefined length with one item of undefined length inside: it must be skipped.
  u16(0x0008); u16(0x1140); u32(0xffffffff); u16(0xfffe); u16(0xe000); u32(0xffffffff); el(0x0008, 0x1150, [49, 0]); u16(0xfffe); u16(0xe00d); u32(0); u16(0xfffe); u16(0xe0dd); u32(0);
  el(0x0028, 0x0010, [rows, 0]); el(0x0028, 0x0011, [cols, 0]); el(0x0028, 0x0100, [16, 0]); el(0x0028, 0x0103, [1, 0]);
  const px: number[] = []; for (const v of vals) { const u = v < 0 ? v + 65536 : v; px.push(u & 255, u >> 8); }
  el(0x7fe0, 0x0010, px);
  return Uint8Array.from(b);
}

describe('Hyperion medical imaging (M500)', () => {
  it('writes and reads DICOM (explicit VR, Part 10) and old implicit files with sequences', () => {
    const vals = [-1024, 0, 40, 1000, 3071, -5];
    const bytes = mi.writeDicom(2, 3, vals, { modality: 'CT', signed: true, intercept: -1024, slope: 1, spacing: [0.5, 0.7], position: [1, 2, 3.5], instance: 7, center: 40, width: 400 });
    const d = mi.readDicom(bytes);
    expect([...d.pixels]).toEqual(vals);
    expect(d.info).toMatchObject({ Modality: 'CT', Rows: 2, Columns: 3, PixelSpacing: [0.5, 0.7], ImagePositionPatient: [1, 2, 3.5], InstanceNumber: 7, RescaleIntercept: -1024, WindowWidth: 400, PixelRepresentation: 1 });
    const r = mi.readDicom(implicitRaw(2, 2, [-3, 5, 7, 900]));
    expect([...r.pixels]).toEqual([-3, 5, 7, 900]);
    expect(r.info.Modality).toBe('CT');
    expect(() => mi.readDicom(new Uint8Array(200))).toThrow(mi.DicomError);
  });
  it('windowing follows DICOM’s linear rule', () => {
    expect(mi.windowed(40, 40, 80)).toBeCloseTo(0.5 + 0.5 / 79, 9);
    expect(mi.windowed(-10, 40, 80)).toBe(0);
    expect(mi.windowed(100, 40, 80)).toBe(1);
  });
  it('the phantom, region growing and the largest component', () => {
    const n = 64, s = 16, V = mi.headPhantom(n, s), dims: [number, number, number] = [n, n, s];
    expect(V[0]).toBe(-1000);
    expect(V[n / 2 + (n / 2) * n + (s / 2) * n * n]).toBeGreaterThan(15);
    const skull = mi.largestComponent(Uint8Array.from(V, (v) => (v > 500 ? 1 : 0)), dims), ns = skull.reduce((a, v) => a + v, 0);
    expect(ns).toBeGreaterThan(1000);
    // Growing inside the air outside never enters the head.
    const air = mi.regionGrow(V, dims, [0, 0, 0], 10);
    expect(air[n / 2 + (n / 2) * n + (s / 2) * n * n]).toBe(0);
    expect(air.reduce((a, v) => a + v, 0)).toBeGreaterThan(0.3 * n * n * s);
    // Two separate blobs: the largest one is kept.
    const m = new Uint8Array(27); m[0] = 1; m[1] = 1; m[26] = 1;
    expect([...mi.largestComponent(m, [3, 3, 3])].reduce((a, v) => a + v, 0)).toBe(2);
  });
  it('in the language: write a series, read the volume, window and segment it', () => {
    const r = run("[V, sp] = headPhantom(48, 6);\nfor k = 1:6\n  dicomwrite(V(:, :, k) + 1024, sprintf('slice%d.dcm', k), 'Modality', 'CT', 'RescaleIntercept', -1024, 'PixelSpacing', sp(1:2), 'ImagePositionPatient', [0 0 (k-1)*sp(3)], 'InstanceNumber', k);\nend\n[W, sp2] = dicomreadVolume('slice'); err = max(abs(W(:) - V(:))); info = dicominfo('slice3.dcm'); z = info.ImagePositionPatient(3); raw = dicomread('slice1.dcm'); c = class(raw);\nJ = ctWindow(W(:, :, 3), 'brain'); [mask, mL] = segmentHU(W, [500 3000], 'Spacing', sp2);\northoSlices(W, [24 24 3], sp2)");
    expect(r.d('err')[0]).toBe(0);
    expect(r.d('sp2')[2]).toBeCloseTo(30, 9);
    expect(r.d('z')[0]).toBeCloseTo(60, 9);
    expect(r.lab.vars.get('c')).toEqual({ k: 'str', v: 'uint16' });
    expect(r.d('mL')[0]).toBeGreaterThan(10);
    expect(r.graphics.figures.length).toBe(1);
  });
});

describe('Hyperion compressed DICOM (M507)', () => {
  // Made with libjpeg-turbo and pydicom's RLE encoder (fixtures/dicom-compressed.json): a 16 × 12 12-bit ramp with noise.
  const fx = FIX as Record<string, string | number[]>, b64 = (k: string) => Uint8Array.from(atob(fx[k] as string), (ch) => ch.charCodeAt(0));
  const g16 = fx.g16 as number[];
  it('decodes lossless JPEG with predictors 1, 4 and 7 exactly', () => {
    for (const k of ['ll1', 'll4', 'll7']) {
      const j = decodeJpeg(b64(k));
      expect([j.width, j.height, j.precision, j.lossless]).toEqual([16, 12, 12, true]);
      expect([...j.planes[0]]).toEqual(g16);
    }
  });
  it('decodes a baseline 4:2:0 colour JPEG as libjpeg does (within two levels)', () => {
    const j = decodeJpeg(b64('rgb')), ref = fx.rgb_ref as number[];
    let worst = 0;
    for (let i = 0; i < 16 * 12; i++) for (let s = 0; s < 3; s++) worst = Math.max(worst, Math.abs(j.planes[s][i] - ref[i * 3 + s]));
    expect(worst).toBeLessThanOrEqual(2);
  });
  it('reads a two-frame lossless DICOM and an RLE one through dicomread', () => {
    const fs = new FileStore();
    fs.load('ll.dcm', { bytes: b64('dcm_ll') }); fs.load('rle.dcm', { bytes: b64('dcm_rle') });
    const lab = new Lab({ out: () => {}, graphics: new Graphics(), files: fs });
    lab.run("A = dicomread('ll.dcm'); B = dicomread('rle.dcm'); s = size(A); c = class(B);");
    const A = toMat(lab.vars.get('A')!), B = toMat(lab.vars.get('B')!);
    expect([A.r, A.c, A.p]).toEqual([12, 16, 2]);
    expect(A.d[0 + 0 * 12]).toBe(g16[0]);
    expect(A.d[3 + 5 * 12]).toBe(g16[3 * 16 + 5]); // row 3, column 5 (frame 1)
    expect(A.d[12 * 16 + 3 + 5 * 12]).toBe(g16[(11 - 3) * 16 + 5]); // frame 2 is upside down
    expect(B.d[7 + 9 * 12]).toBe(g16[7 * 16 + 9]);
  });
  it('decodes RLE PackBits runs and literals, most significant byte first', () => {
    // Two segments (16 bits): high bytes = a run of three 1s and a literal 2; low bytes = four literals.
    const head = new Uint8Array(64), dv = new DataView(head.buffer);
    dv.setUint32(0, 2, true); dv.setUint32(4, 64, true); dv.setUint32(8, 68, true);
    const planes = decodeRle(new Uint8Array([...head, 0xfe, 1, 0x00, 2, 3, 0, 255, 3, 4]), 2, 2, 16, 1);
    expect([...planes[0]]).toEqual([256, 511, 259, 516]);
  });
});
