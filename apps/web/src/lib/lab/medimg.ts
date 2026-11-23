// Hyperion's medical imaging (M500, the owner's list, group 7 and MathWorks' medical devices): reading and writing
// DICOM files in the browser (Part 10, little-endian, implicit or explicit VR, uncompressed pixels; sequences skipped),
// stored values turned into Hounsfield units by the rescale slope and intercept, CT windowing with the usual presets,
// slices of a volume, region growing and the largest connected part of a threshold in 3D, and a made-up head phantom
// to practise on. For learning, not diagnosis. Pure: no language values here.

export interface DicomImage { info: Record<string, string | number | number[]>; rows: number; cols: number; frames: number; pixels: Float64Array; signed: boolean; bits: number }

const IMPLICIT = '1.2.840.10008.1.2', EXPLICIT = '1.2.840.10008.1.2.1';
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT', 'OV', 'SV', 'UV']);
const TAGS: Record<string, [string, 'str' | 'us' | 'ds' | 'is' | 'ul']> = {
  '00080060': ['Modality', 'str'], '00080020': ['StudyDate', 'str'], '0008103E': ['SeriesDescription', 'str'], '00180050': ['SliceThickness', 'ds'],
  '00200013': ['InstanceNumber', 'is'], '00200032': ['ImagePositionPatient', 'ds'], '00201041': ['SliceLocation', 'ds'],
  '00280002': ['SamplesPerPixel', 'us'], '00280004': ['PhotometricInterpretation', 'str'], '00280008': ['NumberOfFrames', 'is'],
  '00280010': ['Rows', 'us'], '00280011': ['Columns', 'us'], '00280030': ['PixelSpacing', 'ds'], '00280100': ['BitsAllocated', 'us'],
  '00280101': ['BitsStored', 'us'], '00280103': ['PixelRepresentation', 'us'], '00281050': ['WindowCenter', 'ds'], '00281051': ['WindowWidth', 'ds'],
  '00281052': ['RescaleIntercept', 'ds'], '00281053': ['RescaleSlope', 'ds'], '00020010': ['TransferSyntaxUID', 'str'],
};

export class DicomError extends Error {}

/** Reads a DICOM file's header fields (patient identifiers are left out) and its pixels as stored values. */
export function readDicom(bytes: Uint8Array): DicomImage {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), info: DicomImage['info'] = {};
  let p = 0;
  const part10 = bytes.length > 132 && String.fromCharCode(...bytes.subarray(128, 132)) === 'DICM';
  if (part10) p = 132;
  let syntax = part10 ? EXPLICIT : IMPLICIT, pixel: [number, number] | null = null;
  const text = (o: number, n: number) => new TextDecoder('latin1').decode(bytes.subarray(o, o + n)).replace(/[\0 ]+$/, '').trim();
  const value = (key: string, o: number, n: number) => {
    const t = TAGS[key];
    if (!t) return;
    if (t[1] === 'us') info[t[0]] = dv.getUint16(o, true);
    else if (t[1] === 'ul') info[t[0]] = dv.getUint32(o, true);
    else if (t[1] === 'str') info[t[0]] = text(o, n);
    else { const v = text(o, n).split('\\').map(Number); info[t[0]] = v.length === 1 ? v[0] : v; }
  };
  /** Skips the items of a sequence of undefined length; returns the offset after its delimiter. */
  const skipUndefined = (o: number, explicit: boolean): number => {
    while (o + 8 <= bytes.length) {
      const g = dv.getUint16(o, true), e = dv.getUint16(o + 2, true), len = dv.getUint32(o + 4, true);
      o += 8;
      if (g === 0xfffe && e === 0xe0dd) return o;
      if (g === 0xfffe && e === 0xe000) { if (len === 0xffffffff) o = walk(o, explicit, true); else o += len; continue; }
      throw new DicomError('A sequence in this file is malformed.');
    }
    return o;
  };
  /** Reads elements from o; inside an item, stops after its delimiter. */
  function walk(o: number, explicit: boolean, inItem: boolean): number {
    while (o + 8 <= bytes.length) {
      const g = dv.getUint16(o, true), e = dv.getUint16(o + 2, true), key = `${g.toString(16).padStart(4, '0')}${e.toString(16).padStart(4, '0')}`.toUpperCase();
      if (g === 0xfffe) { const len = dv.getUint32(o + 4, true); o += 8; if (e === 0xe00d) return o; o += len === 0xffffffff ? 0 : len; continue; }
      const ex = g === 0x0002 ? true : explicit;
      let vr = '', len: number;
      if (ex) {
        vr = String.fromCharCode(bytes[o + 4], bytes[o + 5]);
        if (LONG_VR.has(vr)) { len = dv.getUint32(o + 8, true); o += 12; } else { len = dv.getUint16(o + 6, true); o += 8; }
      } else { len = dv.getUint32(o + 4, true); o += 8; }
      if (key === '7FE00010' && !inItem) {
        if (len === 0xffffffff) throw new DicomError('These pixels are compressed (encapsulated JPEG, JPEG 2000 or RLE): Hyperion reads uncompressed DICOM only.');
        pixel = [o, len]; o += len; continue;
      }
      if (len === 0xffffffff) { o = skipUndefined(o, ex); continue; }
      if (o + len > bytes.length) throw new DicomError('The file ends in the middle of an element: it may be cut short.');
      if (!inItem) value(key, o, len);
      if (key === '00020010') syntax = text(o, len).replace(/\0/g, '');
      o += len;
      if (g === 0x0002 && (bytes.length <= o + 2 || dv.getUint16(o, true) !== 0x0002)) explicit = syntax !== IMPLICIT;
    }
    return o;
  }
  if (part10) {
    walk(p, true, false);
    if (syntax !== IMPLICIT && syntax !== EXPLICIT) throw new DicomError(`This file's transfer syntax (${syntax}) is compressed or big-endian: Hyperion reads uncompressed little-endian DICOM only.`);
  } else walk(p, false, false);
  const rows = Number(info.Rows), cols = Number(info.Columns), bits = Number(info.BitsAllocated ?? 16), frames = Number(info.NumberOfFrames ?? 1) || 1, spp = Number(info.SamplesPerPixel ?? 1);
  if (!pixel || !(rows > 0 && cols > 0)) throw new DicomError('No image in this file (no pixel data, or no rows and columns).');
  if (spp !== 1) throw new DicomError('Hyperion reads greyscale DICOM (one sample a pixel).');
  if (bits !== 8 && bits !== 16 && bits !== 32) throw new DicomError(`${bits}-bit pixels aren't supported (8, 16 or 32).`);
  const [po, plen] = pixel as [number, number], n = rows * cols * frames, signed = Number(info.PixelRepresentation ?? 0) === 1;
  if (plen < (n * bits) / 8) throw new DicomError('The pixel data is shorter than rows × columns × frames.');
  const px = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = po + (i * bits) / 8;
    px[i] = bits === 8 ? (signed ? dv.getInt8(o) : dv.getUint8(o)) : bits === 16 ? (signed ? dv.getInt16(o, true) : dv.getUint16(o, true)) : signed ? dv.getInt32(o, true) : dv.getUint32(o, true);
  }
  return { info, rows, cols, frames, pixels: px, signed, bits };
}

/** Writes a greyscale image (row-major values, already stored values) as an explicit-VR little-endian DICOM file. */
export function writeDicom(rows: number, cols: number, values: ArrayLike<number>, meta: { modality?: string; slope?: number; intercept?: number; spacing?: [number, number]; thickness?: number; position?: [number, number, number]; instance?: number; center?: number; width?: number; signed?: boolean; description?: string }): Uint8Array {
  const parts: number[] = [], u16 = (v: number) => parts.push(v & 255, (v >> 8) & 255), u32 = (v: number) => { u16(v & 0xffff); u16(v >>> 16); };
  const el = (g: number, e: number, vr: string, data: number[]) => {
    if (data.length % 2) data.push(vr === 'UI' || vr === 'OB' ? 0 : 32);
    u16(g); u16(e); parts.push(vr.charCodeAt(0), vr.charCodeAt(1));
    if (LONG_VR.has(vr)) { u16(0); u32(data.length); } else u16(data.length);
    for (const b of data) parts.push(b);
  };
  const s = (t: string) => [...new TextEncoder().encode(t)], us = (v: number) => [v & 255, (v >> 8) & 255], ds = (v: number | number[]) => s((Array.isArray(v) ? v : [v]).map((x) => String(+x.toPrecision(10))).join('\\'));
  for (let i = 0; i < 128; i++) parts.push(0);
  parts.push(68, 73, 67, 77);
  // The meta group: its length must be right, so it's built first.
  const meta0 = parts.length;
  el(0x0002, 0x0001, 'OB', [0, 1]); el(0x0002, 0x0002, 'UI', s('1.2.840.10008.5.1.4.1.1.2')); el(0x0002, 0x0003, 'UI', s(`2.25.${Date.now()}${Math.floor(Math.random() * 1e6)}`));
  el(0x0002, 0x0010, 'UI', s(EXPLICIT)); el(0x0002, 0x0012, 'UI', s('2.25.4172026'));
  const metaBytes = parts.splice(meta0);
  el(0x0002, 0x0000, 'UL', [metaBytes.length & 255, (metaBytes.length >> 8) & 255, (metaBytes.length >> 16) & 255, metaBytes.length >>> 24]);
  parts.push(...metaBytes);
  el(0x0008, 0x0060, 'CS', s(meta.modality ?? 'OT'));
  if (meta.description) el(0x0008, 0x103e, 'LO', s(meta.description));
  if (meta.thickness !== undefined) el(0x0018, 0x0050, 'DS', ds(meta.thickness));
  if (meta.instance !== undefined) el(0x0020, 0x0013, 'IS', s(String(meta.instance)));
  if (meta.position) el(0x0020, 0x0032, 'DS', ds(meta.position));
  el(0x0028, 0x0002, 'US', us(1)); el(0x0028, 0x0004, 'CS', s('MONOCHROME2'));
  el(0x0028, 0x0010, 'US', us(rows)); el(0x0028, 0x0011, 'US', us(cols));
  if (meta.spacing) el(0x0028, 0x0030, 'DS', ds(meta.spacing));
  el(0x0028, 0x0100, 'US', us(16)); el(0x0028, 0x0101, 'US', us(16)); el(0x0028, 0x0102, 'US', us(15)); el(0x0028, 0x0103, 'US', us(meta.signed ? 1 : 0));
  if (meta.center !== undefined) el(0x0028, 0x1050, 'DS', ds(meta.center));
  if (meta.width !== undefined) el(0x0028, 0x1051, 'DS', ds(meta.width));
  el(0x0028, 0x1052, 'DS', ds(meta.intercept ?? 0)); el(0x0028, 0x1053, 'DS', ds(meta.slope ?? 1));
  const px = new Uint8Array(rows * cols * 2), pv = new DataView(px.buffer);
  for (let i = 0; i < rows * cols; i++) { const v = Math.round(values[i]); if (meta.signed) pv.setInt16(i * 2, Math.max(-32768, Math.min(32767, v)), true); else pv.setUint16(i * 2, Math.max(0, Math.min(65535, v)), true); }
  u16(0x7fe0); u16(0x0010); parts.push(79, 87); u16(0); u32(px.length);
  const head = Uint8Array.from(parts), out = new Uint8Array(head.length + px.length);
  out.set(head); out.set(px, head.length);
  return out;
}

export const WINDOWS: Record<string, [number, number]> = { brain: [40, 80], subdural: [75, 215], stroke: [40, 40], soft: [40, 400], abdomen: [60, 400], liver: [60, 160], lung: [-600, 1500], mediastinum: [50, 350], bone: [400, 1800] };
/** Values seen through a window (centre, width): 0 below, 1 above, a straight line between (DICOM's linear rule). */
export const windowed = (v: number, c: number, w: number) => (v <= c - 0.5 - (w - 1) / 2 ? 0 : v > c - 0.5 + (w - 1) / 2 ? 1 : (v - (c - 0.5)) / (w - 1) + 0.5);

/** A made-up head CT in Hounsfield units: n × n × slices (column-major pages), with skull, brain, ventricles and a small
 * bright lesion; `spacing` mm per pixel. */
export function headPhantom(n: number, slices: number) {
  const V = new Float64Array(n * n * slices);
  for (let k = 0; k < slices; k++) {
    const z = slices > 1 ? (2 * k) / (slices - 1) - 1 : 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (2 * j) / (n - 1) - 1, y = (2 * i) / (n - 1) - 1;
      const head = (x / 0.72) ** 2 + (y / 0.9) ** 2 + (z / 0.95) ** 2, brain = (x / 0.6) ** 2 + (y / 0.78) ** 2 + (z / 0.82) ** 2;
      let hu = -1000;
      if (head <= 1) hu = 40; // scalp
      if (head <= 0.93) hu = 1000; // skull
      if (brain <= 1) hu = 30 + 8 * Math.cos(6 * x) * Math.cos(5 * y); // grey and white matter, roughly
      const vent = ((x - 0.14) / 0.08) ** 2 + (y / 0.25) ** 2 + (z / 0.35) ** 2, vent2 = ((x + 0.14) / 0.08) ** 2 + (y / 0.25) ** 2 + (z / 0.35) ** 2;
      if (vent <= 1 || vent2 <= 1) hu = 5;
      if (((x + 0.3) / 0.1) ** 2 + ((y + 0.35) / 0.1) ** 2 + ((z - 0.2) / 0.15) ** 2 <= 1) hu = 70; // a lesion
      V[i + j * n + k * n * n] = Math.round(hu); // whole HU, as scanners store them
    }
  }
  return V;
}

/** Region growing from a seed (row, col, page; 0-based): neighbours (4- or 6-connected) whose value is within `tol` of
 * the seed's join. Returns a mask. */
export function regionGrow(V: ArrayLike<number>, dims: [number, number, number], seed: [number, number, number], tol: number) {
  const [r, c, p] = dims, mask = new Uint8Array(r * c * p), at = (i: number, j: number, k: number) => i + j * r + k * r * c, s0 = V[at(...seed)];
  const stack = [at(...seed)];
  mask[stack[0]] = 1;
  while (stack.length) {
    const q = stack.pop()!, k = Math.floor(q / (r * c)), j = Math.floor((q % (r * c)) / r), i = q % r;
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = i + di, b = j + dj, e = k + dk;
      if (a < 0 || b < 0 || e < 0 || a >= r || b >= c || e >= p) continue;
      const t = at(a, b, e);
      if (!mask[t] && Math.abs(V[t] - s0) <= tol) { mask[t] = 1; stack.push(t); }
    }
  }
  return mask;
}
/** The largest 6-connected part of a mask. */
export function largestComponent(mask: ArrayLike<number>, dims: [number, number, number]) {
  const [r, c, p] = dims, lab = new Int32Array(r * c * p), sizes: number[] = [0];
  for (let s = 0; s < lab.length; s++) {
    if (!mask[s] || lab[s]) continue;
    const id = sizes.length, stack = [s];
    lab[s] = id;
    let size = 0;
    while (stack.length) {
      const q = stack.pop()!; size++;
      const k = Math.floor(q / (r * c)), j = Math.floor((q % (r * c)) / r), i = q % r;
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const a = i + di, b = j + dj, e = k + dk;
        if (a < 0 || b < 0 || e < 0 || a >= r || b >= c || e >= p) continue;
        const t = a + b * r + e * r * c;
        if (mask[t] && !lab[t]) { lab[t] = id; stack.push(t); }
      }
    }
    sizes.push(size);
  }
  const best = sizes.indexOf(Math.max(...sizes));
  return Uint8Array.from(lab, (v) => (v === best && best > 0 ? 1 : 0));
}
