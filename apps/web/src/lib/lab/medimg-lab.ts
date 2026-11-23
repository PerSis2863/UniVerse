import { LabError } from './parse';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Mat, type Value } from './values';
import { cast } from './types';
import { FileStore } from './files';
import * as mi from './medimg';
import { call, def, need, nums, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's medical imaging in the language (M500): dicominfo, dicomread, dicomwrite (MATLAB's names; values come
// back as int16 or uint16 as MATLAB's do), dicomreadVolume (MATLAB's takes a folder; ours a cell of file names or the
// start of their names), ctWindow, headPhantom, orthoSlices, regionGrow, segmentHU (our own names). For learning, not
// diagnosis. Patient identifiers are never read into the info struct.

const files = (lab: Lab): FileStore => { const s = (lab.host as { files?: unknown }).files; if (!(s instanceof FileStore)) throw new LabError('Files aren’t available here.'); return s; };
const read = (lab: Lab, name: string) => { try { return mi.readDicom(files(lab).get(name).bytes); } catch (e) { if (e instanceof mi.DicomError) throw new LabError(`${name}: ${e.message}`); throw e; } };
/** Stored values (row by row) as a column-major matrix, one page per frame. */
function asMatrix(d: mi.DicomImage): Mat {
  const n = d.rows * d.cols, out = new Float64Array(n * d.frames);
  for (let f = 0; f < d.frames; f++) for (let i = 0; i < d.rows; i++) for (let j = 0; j < d.cols; j++) out[f * n + i + j * d.rows] = d.pixels[f * n + i * d.cols + j];
  return mat(d.rows, d.cols, out);
}
const infoValue = (d: mi.DicomImage) => record(Object.entries(d.info).map(([k, v]) => [k, typeof v === 'number' ? v : typeof v === 'string' ? v : row(v)] as [string, number | string | Mat]));

def('dicominfo', (a, _n, lab) => [infoValue(read(lab, textOf(a[0] ?? str(''))))]);
def('dicomread', (a, _n, lab) => {
  const d = read(lab, textOf(a[0] ?? str('')));
  return [cast(asMatrix(d), d.bits === 8 ? (d.signed ? 'int8' : 'uint8') : d.bits === 16 ? (d.signed ? 'int16' : 'uint16') : d.signed ? 'int32' : 'uint32')];
});
def('dicomwrite', (a, _n, lab) => {
  const I = toMat(a[0] ?? num(NaN), 'The image'), name = textOf(a[1] ?? str(''));
  if ((I.p ?? 1) > 1 || I.r < 1 || I.c < 1 || I.r > 4096 || I.c > 4096) throw new LabError('dicomwrite saves one greyscale image (a matrix up to 4096 × 4096) per file.');
  if (!/\.dcm$/i.test(name)) throw new LabError('Name the file something.dcm.');
  const o = options(a, 2, ['Modality', 'RescaleSlope', 'RescaleIntercept', 'PixelSpacing', 'SliceThickness', 'ImagePositionPatient', 'InstanceNumber', 'WindowCenter', 'WindowWidth', 'SeriesDescription'], 'dicomwrite');
  const vals = new Float64Array(I.r * I.c);
  for (let i = 0; i < I.r; i++) for (let j = 0; j < I.c; j++) vals[i * I.c + j] = I.d[i + j * I.r];
  const signed = vals.some((v) => v < 0), sp = o.has('PixelSpacing') ? nums(o.get('PixelSpacing')) : undefined, pos = o.has('ImagePositionPatient') ? nums(o.get('ImagePositionPatient')) : undefined;
  if (vals.some((v) => (signed ? v < -32768 || v > 32767 : v > 65535))) throw new LabError('The stored values must fit 16 bits (−32768…32767, or 0…65535): store HU − intercept with a RescaleIntercept.');
  files(lab).put(name, { bytes: mi.writeDicom(I.r, I.c, vals, {
    modality: optText(o, 'Modality', 'OT'), slope: optNum(o, 'RescaleSlope', 1), intercept: optNum(o, 'RescaleIntercept', 0), signed,
    spacing: sp && sp.length === 2 ? [sp[0], sp[1]] : undefined, thickness: o.has('SliceThickness') ? optNum(o, 'SliceThickness', 1) : undefined,
    position: pos && pos.length === 3 ? [pos[0], pos[1], pos[2]] : undefined, instance: o.has('InstanceNumber') ? optNum(o, 'InstanceNumber', 1) : undefined,
    center: o.has('WindowCenter') ? optNum(o, 'WindowCenter', 0) : undefined, width: o.has('WindowWidth') ? optNum(o, 'WindowWidth', 1) : undefined,
    description: o.has('SeriesDescription') ? optText(o, 'SeriesDescription', '') : undefined,
  }) });
  return [];
});
def('dicomreadVolume', (a, _n, lab) => {
  const fs = files(lab), v = a[0];
  const names = v?.k === 'cell' ? v.d.map((x) => textOf(x)) : v ? [...fs.files.keys()].filter((n) => n.startsWith(textOf(v)) && /\.dcm$/i.test(n)) : [];
  if (!names.length) throw new LabError("dicomreadVolume needs a cell of .dcm file names, or the start of their names ('slice' reads slice*.dcm).");
  if (names.length > 2000) throw new LabError('dicomreadVolume reads up to 2,000 slices.');
  const sl = names.map((n) => ({ n, d: read(lab, n) })), r = sl[0].d.rows, c = sl[0].d.cols;
  if (sl.some((s) => s.d.rows !== r || s.d.cols !== c || s.d.frames !== 1)) throw new LabError('Every slice must be one frame of the same size.');
  const z = (s: (typeof sl)[0]) => { const p = s.d.info.ImagePositionPatient; return Array.isArray(p) && p.length === 3 ? p[2] : Number(s.d.info.InstanceNumber ?? 0); };
  sl.sort((p, q) => z(p) - z(q));
  const out = new Float64Array(r * c * sl.length);
  sl.forEach((s, k) => { const m = asMatrix(s.d), slope = Number(s.d.info.RescaleSlope ?? 1), b = Number(s.d.info.RescaleIntercept ?? 0); for (let i = 0; i < r * c; i++) out[k * r * c + i] = m.d[i] * slope + b; });
  const px = sl[0].d.info.PixelSpacing, dz = sl.length > 1 ? Math.abs(z(sl[1]) - z(sl[0])) || Number(sl[0].d.info.SliceThickness ?? 1) : Number(sl[0].d.info.SliceThickness ?? 1);
  return [mat(r, c, out), row([...(Array.isArray(px) ? px : [1, 1]), dz])];
});

function windowOf(a: Value[], from: number): [number, number] {
  if (a[from]?.k === 'str') { const k = textOf(a[from]).toLowerCase(), w = mi.WINDOWS[k]; if (!w) throw new LabError(`The windows are ${Object.keys(mi.WINDOWS).map((x) => `'${x}'`).join(', ')}, or a centre and width in HU.`); return w; }
  const c = need(a[from], 'The window centre (HU)'), w = need(a[from + 1], 'The window width (HU)');
  if (!(w >= 1)) throw new LabError('The window width is 1 HU or more.');
  return [c, w];
}
def('ctWindow', (a, nout, lab) => {
  const I = toMat(a[0] ?? num(NaN), 'The image (HU)'), [c, w] = windowOf(a, 1), out = mat(I.r, I.c, [...I.d].map((v) => mi.windowed(v, c, w)));
  if (nout > 0) return [out];
  call(lab, 'imagesc', (out.p ?? 1) > 1 ? mat(I.r, I.c, out.d.subarray(0, I.r * I.c)) : out); call(lab, 'colormap', str('gray')); call(lab, 'axis', str('equal'));
  call(lab, 'title', str(`Window ${c} / ${w} HU`));
  return [];
});
def('headPhantom', (a) => {
  const n = Math.round(a[0] ? need(a[0], 'The size') : 128), s = Math.round(a[1] ? need(a[1], 'The slices') : 48);
  if (!(n >= 16 && n <= 512 && s >= 1 && s <= 256 && n * n * s <= 2e7)) throw new LabError('headPhantom(n 16–512, slices 1–256), at most 20 million voxels.');
  return [mat(n, n, mi.headPhantom(n, s)), row([200 / n, 200 / n, 180 / s])];
});
const vol = (v: Value | undefined, what: string) => { const V = toMat(v ?? num(NaN), what); return { V, dims: [V.r, V.c, V.p ?? 1] as [number, number, number] }; };
def('orthoSlices', (a, _n, lab) => {
  const { V, dims } = vol(a[0], 'The volume'), [r, c, p] = dims, at = a[1] ? nums(a[1], 'The slice [row col page]') : [Math.ceil(r / 2), Math.ceil(c / 2), Math.ceil(p / 2)];
  const sp = a[2] ? nums(a[2], 'The spacing [dy dx dz]') : [1, 1, 1], o = options(a, 3, ['Window'], 'orthoSlices');
  const [ri, ci, pi] = at.map((x, k) => Math.min(dims[k], Math.max(1, Math.round(x))) - 1), [wc, ww] = o.has('Window') ? (o.get('Window')!.k === 'str' ? mi.WINDOWS[textOf(o.get('Window')!).toLowerCase()] ?? [40, 400] : nums(o.get('Window')) as [number, number]) : [40, 400];
  const g = (i: number, j: number, k: number) => mi.windowed(V.d[i + j * r + k * r * c], wc, ww);
  const img = (h: number, w: number, f: (y: number, x: number) => number) => { const m = mat(h, w); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.d[y + x * h] = f(y, x); return m; };
  const show = (k: number, M: Mat, xs: number, ys: number, title: string) => {
    call(lab, 'subplot', num(1), num(3), num(k)); call(lab, 'imagesc', row([0, (M.c - 1) * xs]), row([0, (M.r - 1) * ys]), M); call(lab, 'colormap', str('gray')); call(lab, 'axis', str('equal')); call(lab, 'title', str(title));
  };
  show(1, img(r, c, (y, x) => g(y, x, pi)), sp[1], sp[0], `Axial ${pi + 1}/${p}`);
  show(2, img(p, c, (y, x) => g(ri, x, p - 1 - y)), sp[1], sp[2], `Coronal ${ri + 1}/${r}`);
  show(3, img(p, r, (y, x) => g(x, ci, p - 1 - y)), sp[0], sp[2], `Sagittal ${ci + 1}/${c}`);
  return [];
});
def('regionGrow', (a) => {
  const { V, dims } = vol(a[0], 'The image'), s = nums(a[1], 'The seed [row col (page)]').map((x) => Math.round(x) - 1), tol = need(a[2], 'The tolerance');
  const seed: [number, number, number] = [s[0], s[1], s[2] ?? 0];
  if (seed.some((x, k) => !(x >= 0 && x < dims[k]))) throw new LabError('The seed must be inside the image.');
  return [mat(V.r, V.c, mi.regionGrow(V.d, dims, seed, tol), true)];
});
def('segmentHU', (a) => {
  const { V, dims } = vol(a[0], 'The volume (HU)'), range = nums(a[1], 'The range [low high] (HU)'), o = options(a, 2, ['Largest', 'Spacing'], 'segmentHU');
  if (range.length !== 2 || !(range[1] > range[0])) throw new LabError('segmentHU needs [low high] in HU.');
  let m: ArrayLike<number> = Uint8Array.from(V.d, (v) => (v >= range[0] && v <= range[1] ? 1 : 0));
  if (optNum(o, 'Largest', 1)) m = mi.largestComponent(m, dims);
  const sp = o.has('Spacing') ? nums(o.get('Spacing')) : [1, 1, 1], count = Array.from(m).reduce((s, v) => s + v, 0);
  return [mat(V.r, V.c, m, true), num((count * sp[0] * sp[1] * (sp[2] ?? 1)) / 1000)];
});
