import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { FileStore } from './files';
import { toMat } from './values';
import './sciences';
import * as mi from './medimg';

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
