import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, pages, str, toMat, type Mat, type Struct, type Value } from './values';
import { cast, unitValues } from './types';
import { mapOf } from './colormap';
import { table } from './table';
import * as im from './image';

// Hyperion's picture processing in the language (M428): fspecial, imfilter, imgaussfilt, medfilt2, imsharpen, edge,
// imgradient(xy), graythresh, imbinarize, strel, imerode, imdilate, imopen, imclose, imtophat, imbothat, bwlabel,
// bwareaopen, imfill, bwperim, regionprops, label2rgb, imoverlay, imhist, histeq, imadjust, stretchlim, imnoise,
// imcomplement, imcrop, psnr, ssim, phantom, checkerboard. Pictures are matrices (grey) or rows × columns × 3 (colour);
// uint8 and uint16 pictures keep their type.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const picture = (v: Value | undefined, name: string) => { if (!v || v.k !== 'mat') throw new LabError(`${name} needs a picture (a matrix, or rows × columns × 3).`); return v; };
/** Each page as a plane, its values as stored (raw) or 0…1 (unit). */
function planesOf(I: Mat, unit: boolean): im.Plane[] {
  const n = I.r * I.c, v = unit ? unitValues(I) : [...I.d];
  return Array.from({ length: pages(I) }, (_, k) => im.plane(I.r, I.c, v.slice(k * n, (k + 1) * n)));
}
/** Planes back into a picture of the input's type (unit values scaled back for uint8 / uint16). */
function back(I: Mat, P: im.Plane[], unit: boolean): Mat {
  const n = I.r * I.c, d = new Float64Array(n * P.length);
  P.forEach((p, k) => d.set(p.d, k * n));
  const scale = unit ? (I.cls === 'uint8' ? 255 : I.cls === 'uint16' ? 65535 : 1) : 1;
  if (scale !== 1) d.forEach((v, k) => { d[k] = v * scale; });
  return I.cls && I.cls !== 'single' ? cast(mat(I.r, I.c, d), I.cls) : mat(I.r, I.c, d);
}
const grey = (v: Value | undefined, name: string) => {
  const I = picture(v, name);
  if (pages(I) !== 1) throw new LabError(`${name} works on a grey picture: try rgb2gray first.`);
  return I;
};
const bits = (on: ArrayLike<number>, r: number, c: number) => mat(r, c, Array.from(on, (x) => (x ? 1 : 0)), true);
const kernelOf = (v: Value | undefined) => { const K = toMat(v ?? num(NaN), 'The kernel'); if (pages(K) !== 1 || !K.d.length) throw new LabError('A kernel is a matrix.'); return im.plane(K.r, K.c, K.d); };
const asMat = (P: im.Plane) => mat(P.r, P.c, P.d);
const sizeOf = (v: Value | undefined, d: number): [number, number] => { if (!v) return [d, d]; const s = toMat(v).d; return [Math.max(1, Math.round(s[0])), Math.max(1, Math.round(s[1] ?? s[0]))]; };
const opts = (a: Value[], from: number) => { const o: Record<string, Value> = {}; for (let i = from; i + 1 < a.length; i += 2) if (a[i].k === 'str') o[(a[i] as { v: string }).v.toLowerCase()] = a[i + 1]; return o; };
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };

// ——— Filters ———
def('fspecial', (a) => {
  const kind = a[0] ? textOf(a[0]).toLowerCase() : 'average', n = (i: number, d: number) => (a[i] ? toMat(a[i]).d[0] : d);
  if (kind === 'average') { const [r, c] = sizeOf(a[1], 3); return [asMat(im.average(r, c))]; }
  if (kind === 'gaussian') { const [r, c] = sizeOf(a[1], 3); return [asMat(im.gaussian(r, c, n(2, 0.5)))]; }
  if (kind === 'disk') return [asMat(im.disk(n(1, 5)))];
  if (kind === 'sobel') return [asMat(im.SOBEL)];
  if (kind === 'prewitt') return [asMat(im.PREWITT)];
  if (kind === 'laplacian') return [asMat(im.laplacian(n(1, 0.2)))];
  if (kind === 'unsharp') return [asMat(im.unsharp(n(1, 0.2)))];
  if (kind === 'log') { const [r] = sizeOf(a[1], 5); return [asMat(im.logKernel(r, n(2, 0.5)))]; }
  throw new LabError("fspecial's kernels: 'average', 'gaussian', 'disk', 'sobel', 'prewitt', 'laplacian', 'log', 'unsharp'.");
});
def('imfilter', (a) => {
  const I = picture(a[0], 'imfilter'), K = kernelOf(a[1]);
  let pad: im.Pad = 'zero', conv = false, value = 0;
  for (const o of a.slice(2)) {
    if (o.k === 'mat') { value = o.d[0]; continue; }
    const t = textOf(o).toLowerCase();
    if (t === 'replicate' || t === 'symmetric' || t === 'circular') pad = t; else if (t === 'conv') conv = true; else if (t === 'corr' || t === 'same') continue;
    else throw new LabError(`imfilter's options: 'replicate', 'symmetric', 'circular', a number for the border, 'conv' or 'corr' (not '${t}').`);
  }
  return [back(I, planesOf(I, false).map((p) => im.filter(p, K, pad, conv, value)), false)];
});
def('imgaussfilt', (a) => {
  const I = picture(a[0], 'imgaussfilt'), sigma = a[1] && a[1].k === 'mat' ? a[1].d[0] : 0.5, o = opts(a, a[1] && a[1].k === 'mat' ? 2 : 1);
  if (!(sigma > 0)) throw new LabError('The blur (sigma) must be positive.');
  const size = o.filtersize ? Math.round(toMat(o.filtersize).d[0]) : undefined;
  return [back(I, planesOf(I, false).map((p) => im.gaussFilter(p, sigma, size)), false)];
});
def('medfilt2', (a) => {
  const I = grey(a[0], 'medfilt2'), [m, n] = a[1] && a[1].k === 'mat' ? sizeOf(a[1], 3) : [3, 3], sym = a.some((v) => v.k === 'str' && /^symmetric$/i.test(v.v));
  if (m * n > 2500) throw new LabError('medfilt2 takes neighbourhoods up to 50 × 50.');
  return [back(I, planesOf(I, false).map((p) => im.median(p, m, n, sym ? 'symmetric' : 'zero')), false)];
});
def('imsharpen', (a) => {
  const I = picture(a[0], 'imsharpen'), o = opts(a, 1), r = o.radius ? toMat(o.radius).d[0] : 1, amt = o.amount ? toMat(o.amount).d[0] : 0.8;
  return [back(I, planesOf(I, true).map((p) => { const b = im.gaussFilter(p, r); return im.plane(p.r, p.c, p.d.map((v, k) => Math.min(1, Math.max(0, v + amt * (v - b.d[k]))))); }), true)];
});
const gradients = (I: Mat) => {
  const p = planesOf(I, true)[0];
  return { gx: im.filter(p, im.plane(3, 3, [-1, -2, -1, 0, 0, 0, 1, 2, 1]), 'replicate'), gy: im.filter(p, im.plane(3, 3, [-1, 0, 1, -2, 0, 2, -1, 0, 1]), 'replicate') };
};
def('imgradientxy', (a) => { const { gx, gy } = gradients(grey(a[0], 'imgradientxy')); return [asMat(gx), asMat(gy)]; });
def('imgradient', (a) => {
  const { gx, gy } = gradients(grey(a[0], 'imgradient'));
  return [asMat(im.plane(gx.r, gx.c, gx.d.map((x, k) => Math.hypot(x, gy.d[k])))), asMat(im.plane(gx.r, gx.c, gx.d.map((x, k) => (Math.atan2(-gy.d[k], x) * 180) / Math.PI)))];
});

// ——— Edges and thresholds ———
def('edge', (a) => {
  const I = grey(a[0], 'edge'), kind = a[1] ? textOf(a[1]).toLowerCase() : 'sobel', p = planesOf(I, true)[0], t = a[2] && a[2].k === 'mat' && a[2].d.length ? [...a[2].d] : undefined;
  if (kind === 'sobel' || kind === 'prewitt') { const r = im.gradientEdges(p, kind, t?.[0]); return [bits(r.edges, I.r, I.c), num(r.thresh)]; }
  if (kind === 'canny') {
    const sigma = a[3] ? toMat(a[3]).d[0] : Math.SQRT2, r = im.canny(p, sigma, t && t.length > 1 ? t[0] : t ? 0.4 * t[0] : undefined, t ? t[t.length - 1] : undefined);
    return [bits(r.edges, I.r, I.c), mat(1, 2, r.thresh)];
  }
  throw new LabError("edge's methods here are 'sobel', 'prewitt' and 'canny'.");
});
def('graythresh', (a) => [num(im.otsu(unitValues(grey(a[0], 'graythresh'))))]);
def('imbinarize', (a) => {
  const I = grey(a[0], 'imbinarize'), v = unitValues(I);
  if (a[1] && a[1].k === 'str' && /^adaptive$/i.test(a[1].v)) { const o = opts(a, 2); return [bits(im.adaptive(im.plane(I.r, I.c, v), o.sensitivity ? toMat(o.sensitivity).d[0] : 0.5), I.r, I.c)]; }
  const T = a[1] && a[1].k === 'mat' ? a[1] : null;
  if (T && T.d.length > 1 && T.d.length !== v.length) throw new LabError('imbinarize takes one threshold or one per pixel.');
  const level = T ? null : im.otsu(v);
  return [bits(v.map((x, k) => (x > (level ?? (T!.d.length > 1 ? T!.d[k] : T!.d[0])) ? 1 : 0)), I.r, I.c)];
});

// ——— Shapes ———
def('strel', (a) => {
  let S: im.Nhood;
  if (a[0] && a[0].k === 'mat') { const m = a[0]; S = { r: m.r, c: m.c, on: Uint8Array.from(m.d, (x) => (x ? 1 : 0)) }; }
  else { const kind = a[0] ? textOf(a[0]).toLowerCase() : 'disk', x = a[1] ? toMat(a[1]).d : [3]; S = wrap(() => im.strel(kind, x[0], kind === 'rectangle' ? x[1] ?? x[0] : a[2] ? toMat(a[2]).d[0] : x[0])); }
  return [{ k: 'struct', f: new Map<string, Value>([['Type', str('strel')], ['Neighborhood', bits(S.on, S.r, S.c)]]) } satisfies Struct];
});
const nhood = (v: Value | undefined): im.Nhood => {
  if (v && v.k === 'struct' && v.f.get('Neighborhood')) { const m = toMat(v.f.get('Neighborhood')!); return { r: m.r, c: m.c, on: Uint8Array.from(m.d, (x) => (x ? 1 : 0)) }; }
  if (v && v.k === 'mat') return { r: v.r, c: v.c, on: Uint8Array.from(v.d, (x) => (x ? 1 : 0)) };
  throw new LabError("That needs a shape: strel('disk', 3), or a matrix of 1s and 0s.");
};
const morph = (name: string, f: (p: im.Plane, s: im.Nhood) => im.Plane) => def(name, (a) => {
  const I = picture(a[0], name), S = nhood(a[1]), out = back(I, planesOf(I, false).map((p) => f(p, S)), false);
  return [I.logical ? mat(I.r, I.c, out.d, true) : out];
});
morph('imerode', im.erode); morph('imdilate', im.dilate); morph('imopen', im.open); morph('imclose', im.close);
morph('imtophat', (p, s) => { const o = im.open(p, s); return im.plane(p.r, p.c, p.d.map((v, k) => v - o.d[k])); });
morph('imbothat', (p, s) => { const c = im.close(p, s); return im.plane(p.r, p.c, p.d.map((v, k) => c.d[k] - v)); });
const conn = (v: Value | undefined) => { const c = v ? toMat(v).d[0] : 8; if (c !== 4 && c !== 8) throw new LabError('The connectivity is 4 (sides) or 8 (sides and corners).'); return c as 4 | 8; };
def('bwlabel', (a) => { const B = grey(a[0], 'bwlabel'), r = im.label(B.d, B.r, B.c, conn(a[1])); return [mat(B.r, B.c, r.L), num(r.n)]; });
def('bwareaopen', (a) => { const B = grey(a[0], 'bwareaopen'); return [bits(im.areaOpen(B.d, B.r, B.c, a[1] ? toMat(a[1]).d[0] : 1, conn(a[2])), B.r, B.c)]; });
def('imfill', (a) => {
  const B = grey(a[0], 'imfill');
  if (!a[1] || a[1].k !== 'str' || !/^holes$/i.test(a[1].v)) throw new LabError("imfill here fills holes: imfill(BW, 'holes').");
  return [bits(im.fillHoles(B.d, B.r, B.c), B.r, B.c)];
});
def('bwperim', (a) => {
  const B = grey(a[0], 'bwperim'), e = im.erode(im.plane(B.r, B.c, B.d.map((x) => (x ? 1 : 0))), { r: 3, c: 3, on: Uint8Array.from([0, 1, 0, 1, 1, 1, 0, 1, 0]) });
  return [bits(B.d.map((x, k) => (x && !e.d[k] ? 1 : 0)), B.r, B.c)];
});
const PROPS = ['Area', 'Centroid', 'BoundingBox', 'MajorAxisLength', 'MinorAxisLength', 'Eccentricity', 'Orientation', 'EquivDiameter'];
def('regionprops', (a) => {
  const args = a[0] && a[0].k === 'str' && /^table$/i.test(a[0].v) ? a.slice(1) : a, B = grey(args[0], 'regionprops');
  const L = B.logical ? im.label(B.d, B.r, B.c, 8).L : B.d;
  let want = args.slice(1).map((v) => textOf(v));
  if (!want.length || want.some((w) => /^basic$/i.test(w))) want = PROPS.slice(0, 3); else if (want.some((w) => /^all$/i.test(w))) want = PROPS;
  const names = want.map((w) => { const p = PROPS.find((q) => q.toLowerCase() === w.toLowerCase()); if (!p) throw new LabError(`regionprops measures ${PROPS.join(', ')}.`); return p; });
  const R = im.regions(L, B.r, B.c), n = R.length, colOf = (f: (r: im.Region) => number[]) => { const w = n ? f(R[0]).length : 1, m = mat(n, w); R.forEach((r, i) => f(r).forEach((v, j) => { m.d[i + j * n] = v; })); return m; };
  const get: Record<string, (r: im.Region) => number[]> = { Area: (r) => [r.area], Centroid: (r) => r.centroid, BoundingBox: (r) => r.box, MajorAxisLength: (r) => [r.major], MinorAxisLength: (r) => [r.minor], Eccentricity: (r) => [r.eccentricity], Orientation: (r) => [r.orientation], EquivDiameter: (r) => [r.diameter] };
  return [table(names.map((p) => [p, colOf(get[p])]))];
});
def('label2rgb', (a) => {
  const L = grey(a[0], 'label2rgb'), n = L.d.reduce((m, v) => Math.max(m, v), 0), cmap = mapOf(a[1] ? textOf(a[1]) : 'jet', Math.max(1, n));
  if (!cmap) throw new LabError('That colour map isn’t known.');
  const N = L.r * L.c, d = new Float64Array(3 * N);
  for (let k = 0; k < N; k++) { const l = Math.round(L.d[k]); for (let ch = 0; ch < 3; ch++) d[k + ch * N] = l >= 1 ? cmap[Math.min(cmap.length - 1, l - 1)][ch] / 255 : 1; }
  return [mat(L.r, L.c, d)];
});
def('imoverlay', (a) => {
  const I = picture(a[0], 'imoverlay'), M = toMat(a[1] ?? num(0), 'The mask'), col = a[2] ? [...toMat(a[2]).d] : [1, 0, 0], N = I.r * I.c;
  if (M.d.length !== N) throw new LabError('The mask must be the same size as the picture.');
  const v = unitValues(I), P = pages(I), d = new Float64Array(3 * N);
  for (let ch = 0; ch < 3; ch++) for (let k = 0; k < N; k++) d[k + ch * N] = M.d[k] ? col[ch] : v[k + (P === 3 ? ch * N : 0)];
  return [mat(I.r, I.c, d)];
});

// ——— Tones ———
def('imhist', (a, nout, lab) => {
  const I = grey(a[0], 'imhist'), n = a[1] ? Math.max(2, Math.round(toMat(a[1]).d[0])) : I.logical ? 2 : 256, v = unitValues(I), counts = new Float64Array(n);
  for (const x of v) counts[Math.min(n - 1, Math.max(0, Math.round(x * (n - 1))))]++;
  const scale = I.cls === 'uint8' ? 255 : I.cls === 'uint16' ? 65535 : 1, x = mat(n, 1, Array.from({ length: n }, (_, i) => (i / (n - 1)) * scale));
  if (nout > 0) return [mat(n, 1, counts), x];
  call(lab, 'bar', x, mat(n, 1, counts)); call(lab, 'xlabel', str('Brightness')); call(lab, 'ylabel', str('Pixels')); call(lab, 'title', str('Histogram'));
  return [];
});
def('histeq', (a) => { const I = grey(a[0], 'histeq'); return [back(I, [im.plane(I.r, I.c, im.equalise(unitValues(I)))], true)]; });
def('stretchlim', (a) => { const I = grey(a[0], 'stretchlim'), [lo, hi] = im.stretchLimits(unitValues(I), a[1] ? toMat(a[1]).d[0] : 0.01); return [mat(2, 1, [lo, hi])]; });
def('imadjust', (a) => {
  const I = picture(a[0], 'imadjust'), P = planesOf(I, true);
  const lim = (v: Value | undefined, d: (p: im.Plane) => [number, number]) => (p: im.Plane): [number, number] => (v && v.k === 'mat' && v.d.length >= 2 ? [v.d[0], v.d[1]] : d(p));
  const inL = lim(a[1], (p) => im.stretchLimits(p.d)), outL = lim(a[2], () => [0, 1]), g = a[3] ? toMat(a[3]).d[0] : 1;
  return [back(I, P.map((p) => { const [lo, hi] = inL(p), [l2, h2] = outL(p); return im.plane(p.r, p.c, p.d.map((x) => l2 + (h2 - l2) * Math.min(1, Math.max(0, (x - lo) / (hi - lo || 1))) ** g)); }), true)];
});
def('imcomplement', (a) => {
  const I = picture(a[0], 'imcomplement');
  if (I.logical) return [mat(I.r, I.c, I.d.map((x) => (x ? 0 : 1)), true)];
  return [back(I, planesOf(I, true).map((p) => im.plane(p.r, p.c, p.d.map((x) => 1 - x))), true)];
});
const gauss = () => { let u = 0; while (!u) u = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
def('imnoise', (a) => {
  const I = picture(a[0], 'imnoise'), kind = a[1] ? textOf(a[1]).toLowerCase() : 'gaussian', n = (i: number, d: number) => (a[i] ? toMat(a[i]).d[0] : d), clip = (x: number) => Math.min(1, Math.max(0, x));
  let f: (x: number) => number;
  if (kind === 'gaussian') { const m = n(2, 0), sd = Math.sqrt(n(3, 0.01)); f = (x) => clip(x + m + sd * gauss()); }
  else if (kind === 'salt & pepper') { const d = n(2, 0.05); f = (x) => { const u = random(); return u < d / 2 ? 0 : u < d ? 1 : x; }; }
  else if (kind === 'speckle') { const s = Math.sqrt(12 * n(2, 0.04)); f = (x) => clip(x + x * s * (random() - 0.5)); }
  else throw new LabError("imnoise's kinds: 'gaussian', 'salt & pepper', 'speckle'.");
  return [back(I, planesOf(I, true).map((p) => im.plane(p.r, p.c, p.d.map(f))), true)];
});
def('imcrop', (a) => {
  const I = picture(a[0], 'imcrop'), r = a[1] ? [...toMat(a[1]).d] : [];
  if (r.length !== 4) throw new LabError('imcrop needs the rectangle [x y width height] (x across, y down, in pixels).');
  const c0 = Math.max(1, Math.round(r[0])), r0 = Math.max(1, Math.round(r[1])), c1 = Math.min(I.c, Math.round(r[0] + r[2])), r1 = Math.min(I.r, Math.round(r[1] + r[3]));
  const R = Math.max(0, r1 - r0 + 1), C = Math.max(0, c1 - c0 + 1), P = pages(I), d = new Float64Array(R * C * P);
  for (let k = 0; k < P; k++) for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) d[i + j * R + k * R * C] = I.d[r0 - 1 + i + (c0 - 1 + j) * I.r + k * I.r * I.c];
  const out = mat(R, C, d, I.logical);
  return [I.cls ? cast(out, I.cls) : out];
});
const pair = (a: Value[], name: string) => {
  const A = picture(a[0], name), B = picture(a[1], name);
  if (A.d.length !== B.d.length || A.r !== B.r) throw new LabError(`${name} compares two pictures of the same size.`);
  return [unitValues(A), unitValues(B), A, B] as const;
};
def('psnr', (a) => {
  const [x, y] = pair(a, 'psnr'), peak = a[2] ? toMat(a[2]).d[0] : 1, s = x.reduce((t, v) => t + v * v, 0), e = x.reduce((t, v, k) => t + (v - y[k]) ** 2, 0);
  return [num(im.psnr(x, y, peak)), num(10 * Math.log10(s / e))];
});
def('ssim', (a) => {
  const [x, y, A] = pair(a, 'ssim');
  if (pages(A) !== 1) throw new LabError('ssim compares grey pictures: try rgb2gray first.');
  const r = im.ssim(im.plane(A.r, A.c, x), im.plane(A.r, A.c, y));
  return [num(r.value), asMat(r.map)];
});

// ——— Test pictures ———
def('phantom', (a) => { const n = a.find((v) => v.k === 'mat'); const s = n ? Math.round(n.d[0]) : 256; if (!(s >= 1 && s <= 2048)) throw new LabError('phantom makes 1 to 2048 pixels a side.'); return [asMat(im.phantom(s))]; });
def('checkerboard', (a) => { const n = (i: number, d: number) => (a[i] ? Math.max(1, Math.round(toMat(a[i]).d[0])) : d), p = n(1, 4); return [asMat(im.checkerboard(n(0, 10), p, n(2, p)))]; });
