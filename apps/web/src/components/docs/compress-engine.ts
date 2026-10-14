'use client';

import { LEVELS, fitWithin, methodFor, relinkMedia, smallName, videoSize, withJpegType, type Level, type LevelSpec } from '@/lib/compress';
import { openPdfData } from '@/lib/pdf';

// File compression (Collaborate → Tools → Compress; rules in src/lib/compress.ts), all in the browser:
//  - pictures: made no bigger than needed and saved again (JPEG, or WebP when they have see-through parts);
//  - PDFs: the photos inside are made smaller and saved again, so text and drawings stay sharp; on
//    Strong, pages drawn as pictures (with their text kept selectable) when that's smaller still;
//  - Word, Excel and PowerPoint files: the pictures inside, then packed tighter;
//  - video and sound: encoded again at a lower bitrate (and video size) with the browser's own
//    encoders, much faster than playing it (mediabunny, WebCodecs);
//  - anything else: packed into a ZIP.
// A result that isn't smaller is never handed back: the original is kept and the page says so.

export interface Compressed { name: string; blob: Blob; note?: string }
export type Progress = (message: string, fraction?: number) => void;

const MB = 1024 * 1024;
export const MAX_SIZE = { media: 4 * 1024 * MB, other: 300 * MB };

const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob((b) => res(b), type, q));

/** A picture, decoded (turned the right way up). */
async function decode(blob: Blob): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; close: () => void }> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => null);
  if (bmp) return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch {
    URL.revokeObjectURL(url);
    throw new Error(/hei[cf]/i.test(blob.type || (blob as File).name || '') ? 'This browser can’t open HEIC photos. Safari can, or set the camera to save JPG.' : 'This browser can’t open that picture.');
  }
  return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
}

/** Whether a canvas has see-through pixels (checked on a small copy). */
function seeThrough(c: HTMLCanvasElement) {
  const s = document.createElement('canvas');
  const { w, h } = fitWithin(c.width, c.height, 256);
  s.width = w; s.height = h;
  const g = s.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/** A picture at most `maxSide` long, saved as `type` (JPEG gets a white background). */
async function reencode(blob: Blob, spec: LevelSpec, type: 'image/jpeg' | 'image/png' | 'image/webp' | 'auto'): Promise<{ blob: Blob; ext: string; resized: boolean } | null> {
  const pic = await decode(blob);
  try {
    const { w, h } = fitWithin(pic.w, pic.h, spec.maxSide);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    let want = type;
    if (want === 'auto') {
      pic.draw(g, w, h);
      want = seeThrough(c) ? 'image/webp' : 'image/jpeg';
      g.clearRect(0, 0, w, h);
    }
    if (want === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    pic.draw(g, w, h);
    let out = await canvasBlob(c, want, want === 'image/png' ? undefined : spec.quality);
    // WebP where the browser can't make it: PNG keeps the see-through parts.
    if (out && want === 'image/webp' && out.type !== 'image/webp') { want = 'image/png'; out = await canvasBlob(c, 'image/png'); }
    c.width = c.height = 0;
    if (!out) return null;
    return { blob: out, ext: want === 'image/jpeg' ? 'jpg' : want === 'image/webp' ? 'webp' : 'png', resized: w < pic.w };
  } finally { pic.close(); }
}

async function picture(file: File, spec: LevelSpec): Promise<Compressed> {
  const keepWebp = file.type === 'image/webp' || /\.webp$/i.test(file.name);
  const r = await reencode(file, spec, keepWebp ? 'image/webp' : 'auto');
  if (!r) throw new Error('Couldn’t save the picture.');
  return { name: smallName(file.name, r.ext), blob: r.blob };
}

// ── PDF ─────────────────────────────────────────────────────────────────────────────────────────

type PdfLib = typeof import('pdf-lib');
type RawStream = import('pdf-lib').PDFRawStream;

/** The photos (JPEG) inside a PDF, made smaller and saved again. Text, drawings and other pictures stay. */
async function pdfPhotos(lib: PdfLib, bytes: Uint8Array, spec: LevelSpec, onProgress?: Progress) {
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFRef, PDFDict } = lib;
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (pdf.isEncrypted) throw new Error('This PDF is locked with a password, so it can’t be changed here.');
  const N = (s: string) => PDFName.of(s);
  const images = pdf.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(N('Subtype')) === N('Image'));
  let done = 0, changed = 0;
  for (const [ref, obj] of images) {
    onProgress?.(`Pictures inside: ${++done} of ${images.length}`, done / images.length);
    const stream = obj as RawStream;
    const d = stream.dict;
    const filter = d.get(N('Filter'));
    const jpeg = filter === N('DCTDecode') || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === N('DCTDecode'));
    if (!jpeg || d.get(N('Decode')) || stream.contents.length < 20_000) continue;
    // Colours the browser reads back the same: grey or RGB (not CMYK, spot or indexed colours).
    let cs = d.get(N('ColorSpace'));
    if (cs instanceof PDFRef) cs = pdf.context.lookup(cs);
    let ok = cs === N('DeviceRGB') || cs === N('DeviceGray');
    if (cs instanceof PDFArray && cs.get(0) === N('ICCBased')) {
      const icc = pdf.context.lookup(cs.get(1));
      const n = icc instanceof PDFRawStream ? icc.dict.get(N('N')) : icc instanceof PDFDict ? icc.get(N('N')) : null;
      ok = n instanceof PDFNumber && (n.asNumber() === 1 || n.asNumber() === 3);
    }
    if (!ok) continue;
    const r = await reencode(new Blob([stream.contents as BlobPart], { type: 'image/jpeg' }), spec, 'image/jpeg').catch(() => null);
    if (!r) continue;
    const smaller = new Uint8Array(await r.blob.arrayBuffer());
    if (smaller.length >= stream.contents.length * 0.9) continue;
    const pic = await createImageBitmap(r.blob);
    const nd = d.clone(pdf.context);
    nd.set(N('Width'), PDFNumber.of(pic.width));
    nd.set(N('Height'), PDFNumber.of(pic.height));
    pic.close();
    nd.set(N('ColorSpace'), N('DeviceRGB'));
    nd.set(N('BitsPerComponent'), PDFNumber.of(8));
    nd.set(N('Filter'), N('DCTDecode'));
    nd.delete(N('DecodeParms'));
    pdf.context.assign(ref, PDFRawStream.of(nd, smaller));
    changed++;
  }
  return { bytes: await pdf.save({ useObjectStreams: true }), changed };
}

/** Every page drawn as a picture, with its words laid invisibly on top so they can still be selected. */
async function pdfAsPictures(lib: PdfLib, bytes: Uint8Array, spec: LevelSpec, onProgress?: Progress) {
  const src = await openPdfData(bytes.slice().buffer);
  const out = await lib.PDFDocument.create();
  const font = await out.embedFont(lib.StandardFonts.Helvetica);
  const chars = new Set(font.getCharacterSet());
  for (let i = 1; i <= src.numPages; i++) {
    onProgress?.(`Page ${i} of ${src.numPages}`, i / src.numPages);
    const pg = await src.getPage(i);
    const base = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: spec.pdfDpi / 72 });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvas: c, viewport: vp }).promise;
    const jpg = await canvasBlob(c, 'image/jpeg', spec.quality);
    c.width = c.height = 0;
    if (!jpg) throw new Error('Couldn’t draw a page.');
    const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const page = out.addPage([base.width, base.height]);
    page.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
    // The words, invisible, where pdf.js says they are (upright pages only).
    if (!pg.rotate) {
      const [x0, y0] = pg.view;
      const key = page.node.newFontDictionary(font.name, font.ref);
      const ops = [lib.pushGraphicsState(), lib.beginText(), lib.setTextRenderingMode(lib.TextRenderingMode.Invisible)];
      let n = 0;
      for (const it of (await pg.getTextContent()).items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const [a, b, , d, e, f] = it.transform as number[];
        if (Math.abs(b) > 0.01 || a <= 0) continue;
        const text = [...it.str].filter((ch) => chars.has(ch.codePointAt(0)!)).join('');
        const size = Math.abs(d) || it.height;
        if (!text.trim() || size < 1) continue;
        const natural = font.widthOfTextAtSize(text, size);
        if (!natural) continue;
        ops.push(lib.setFontAndSize(key, size), lib.setCharacterSqueeze(Math.max(1, Math.min(1000, ((it.width || natural) / natural) * 100))), lib.setTextMatrix(1, 0, 0, 1, e - x0, f - y0), lib.showText(font.encodeText(text)));
        n++;
      }
      ops.push(lib.endText(), lib.popGraphicsState());
      if (n) page.pushOperators(...ops);
    }
    pg.cleanup();
  }
  await src.destroy();
  return out.save({ useObjectStreams: true });
}

async function pdf(file: File, spec: LevelSpec, level: Level, onProgress?: Progress): Promise<Compressed> {
  const lib = await import('pdf-lib');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const photos = await pdfPhotos(lib, bytes, spec, onProgress);
  let best: { bytes: Uint8Array; note?: string } = { bytes: photos.bytes };
  if (level === 'strong') {
    const pages = await pdfAsPictures(lib, bytes, spec, onProgress).catch(() => null);
    if (pages && pages.length < best.bytes.length * 0.85) best = { bytes: pages, note: 'Pages became pictures (text can still be selected where it’s Latin script).' };
  }
  return { name: smallName(file.name, 'pdf'), blob: new Blob([best.bytes as BlobPart], { type: 'application/pdf' }), note: best.note };
}

// ── Word, Excel and PowerPoint ─────────────────────────────────────────────────────────────────────

async function office(file: File, spec: LevelSpec, onProgress?: Progress): Promise<Compressed> {
  const { unzipSync, zipSync } = await import('fflate');
  let parts: Record<string, Uint8Array>;
  try { parts = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { throw new Error('This file looks damaged, or it’s an older Office format (.doc, .xls, .ppt).'); }
  const media = Object.keys(parts).filter((p) => /^(word|xl|ppt)\/media\/[^/]+\.(jpe?g|png)$/i.test(p) && parts[p].length > 30_000);
  const renamed: [string, string][] = [];
  let i = 0;
  for (const p of media) {
    onProgress?.(`Pictures inside: ${++i} of ${media.length}`, i / media.length);
    const png = /\.png$/i.test(p);
    const pic = new Blob([parts[p] as BlobPart], { type: png ? 'image/png' : 'image/jpeg' });
    let r = await reencode(pic, spec, png ? 'image/png' : 'image/jpeg').catch(() => null);
    let path = p;
    if (png) {
      // A photo saved as PNG is far smaller as a JPEG: used when it has no see-through parts and at
      // least halves the size (screenshots and drawings, which PNG keeps crisp, stay PNG).
      const jpeg = await reencode(pic, spec, 'auto').catch(() => null);
      const pngSize = r?.resized ? r.blob.size : parts[p].length;
      if (jpeg?.ext === 'jpg' && jpeg.blob.size < pngSize * 0.5) {
        r = jpeg;
        path = p.replace(/\.png$/i, '.jpg');
        if (parts[path]) path = p.replace(/\.png$/i, '-small.jpg');
      } else if (!r?.resized) continue;
    }
    if (!r) continue;
    const smaller = new Uint8Array(await r.blob.arrayBuffer());
    if (smaller.length >= parts[p].length * 0.9) continue;
    if (path !== p) { delete parts[p]; renamed.push([p.split('/').pop()!, path.split('/').pop()!]); }
    parts[path] = smaller;
  }
  // Pictures that became JPEGs: the links to them, and the file's list of formats.
  if (renamed.length) {
    const text = (b: Uint8Array) => new TextDecoder().decode(b);
    const bytes = (t: string) => new TextEncoder().encode(t);
    for (const k of Object.keys(parts).filter((k) => k.endsWith('.rels'))) {
      const before = text(parts[k]);
      const after = renamed.reduce((x, [from, to]) => relinkMedia(x, from, to), before);
      if (after !== before) parts[k] = bytes(after);
    }
    if (parts['[Content_Types].xml']) parts['[Content_Types].xml'] = bytes(withJpegType(text(parts['[Content_Types].xml'])));
  }
  return { name: smallName(file.name), blob: new Blob([zipSync(parts, { level: 9 }) as BlobPart], { type: file.type || 'application/octet-stream' }) };
}

// ── Video and sound ──────────────────────────────────────────────────────────────────────────────

async function media(file: File, kind: 'video' | 'audio', spec: LevelSpec, onProgress?: Progress, signal?: AbortSignal): Promise<Compressed> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = kind === 'video' ? await input.getPrimaryVideoTrack().catch(() => null) : null;
    const audio = (await input.getAudioTracks().catch(() => []))[0] ?? null;
    if (kind === 'video' && !video) throw new Error('There’s no video this browser can read in that file.');
    if (kind === 'audio' && !audio) throw new Error('There’s no sound this browser can read in that file.');
    const size = video ? videoSize(await video.getDisplayWidth(), await video.getDisplayHeight(), spec.videoSide) : null;
    const [avc, vp9, vp8, aac, opus] = await Promise.all([
      kind === 'video' && mb.canEncodeVideo('avc', { width: 1280, height: 720 }),
      kind === 'video' && mb.canEncodeVideo('vp9', { width: 1280, height: 720 }),
      kind === 'video' && mb.canEncodeVideo('vp8', { width: 1280, height: 720 }),
      mb.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48_000 }),
      mb.canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48_000 }),
    ]);
    // MP4 (H.264 / AAC) plays everywhere; WebM (VP9 or VP8 / Opus) where the browser can't make MP4.
    const mp4 = kind === 'video' ? !!avc : !!aac;
    const vCodec = avc ? 'avc' : vp9 ? 'vp9' : vp8 ? 'vp8' : null;
    const aCodec = mp4 ? (aac ? 'aac' : opus ? 'opus' : null) : opus ? 'opus' : null;
    if ((kind === 'video' && !vCodec) || (kind === 'audio' && !aCodec)) throw new Error(`This browser can’t compress ${kind === 'video' ? 'videos' : 'sound'}. Try Chrome, Edge or Safari on a computer.`);
    const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input, output, tracks: 'primary',
      video: kind === 'video' ? { ...(size ?? {}), codec: vCodec!, bitrate: spec.videoBitrate, forceTranscode: true } : { discard: true },
      audio: audio && aCodec ? { codec: aCodec, bitrate: spec.audioBitrate, forceTranscode: true } : { discard: true },
    });
    if (!conversion.isValid) throw new Error(`This browser can’t compress that ${kind === 'video' ? 'video' : 'sound'}.`);
    conversion.onProgress = (p) => onProgress?.(`${Math.round(p * 100)}%`, p);
    const stop = () => void conversion.cancel();
    signal?.addEventListener('abort', stop);
    try { await conversion.execute(); } finally { signal?.removeEventListener('abort', stop); }
    const buf = output.target.buffer;
    if (!buf) throw new Error('Couldn’t finish the file.');
    const ext = kind === 'video' ? (mp4 ? 'mp4' : 'webm') : mp4 ? 'm4a' : 'webm';
    return { name: smallName(file.name, ext), blob: new Blob([buf], { type: `${kind}/${mp4 ? 'mp4' : 'webm'}` }) };
  } finally {
    input.dispose();
  }
}

/** A file, smaller. The original comes back (with a note) when nothing could make it smaller. */
export async function compress(file: File, level: Level, onProgress?: Progress, signal?: AbortSignal): Promise<Compressed> {
  const spec = LEVELS[level];
  const method = methodFor(file.name, file.type);
  const big = method === 'video' || method === 'audio' ? MAX_SIZE.media : MAX_SIZE.other;
  if (file.size > big) throw new Error(`Files up to ${Math.round(big / MB / (big >= 1024 * MB ? 1024 : 1))} ${big >= 1024 * MB ? 'GB' : 'MB'} can be compressed in the browser.`);
  let out: Compressed;
  switch (method) {
    case 'image': out = await picture(file, spec); break;
    case 'pdf': out = await pdf(file, spec, level, onProgress); break;
    case 'office': out = await office(file, spec, onProgress); break;
    case 'video': case 'audio': out = await media(file, method, spec, onProgress, signal); break;
    case 'zip': {
      const { zipSync } = await import('fflate');
      out = { name: `${file.name}.zip`, blob: new Blob([zipSync({ [file.name]: new Uint8Array(await file.arrayBuffer()) }, { level: 9 }) as BlobPart], { type: 'application/zip' }) };
      break;
    }
    default: return { name: file.name, blob: file, note: 'This kind of file is already compressed.' };
  }
  if (out.blob.size >= file.size) return { name: file.name, blob: file, note: 'It was already as small as it can get, so it’s unchanged.' };
  return out;
}

/** Several results in one ZIP (stored as they are: they're already compressed). */
export async function zipAll(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    let name = f.name, n = 1;
    while (entries[name]) name = f.name.replace(/(\.[^.]+)?$/, ` (${n++})$1`);
    entries[name] = new Uint8Array(await f.blob.arrayBuffer());
  }
  return new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: 'application/zip' });
}
