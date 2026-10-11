'use client';

import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { MAX_SIDE, NO_ADJUST, filterString, fitScale, type Adjust, type Placed, type Rect } from '@/lib/studio';

// The Studio photo editor's canvas work (Stage 5 · B9.15): drawing layers, painting in a layer's own
// pixels, opening pictures, project files, saving the current picture on this device, and
// removing a photo's background. Everything stays in the browser.

export type Blend = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference';
export const BLENDS: { value: Blend; label: string }[] = [
  { value: 'source-over', label: 'Normal' }, { value: 'multiply', label: 'Multiply' }, { value: 'screen', label: 'Screen' }, { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' }, { value: 'lighten', label: 'Lighten' }, { value: 'color-dodge', label: 'Colour dodge' }, { value: 'color-burn', label: 'Colour burn' },
  { value: 'hard-light', label: 'Hard light' }, { value: 'soft-light', label: 'Soft light' }, { value: 'difference', label: 'Difference' },
];

export interface TextProps { value: string; size: number; color: string; font: string; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; outline: string | null }
export interface ShapeProps { type: 'rect' | 'ellipse' | 'line' | 'arrow'; fill: string | null; stroke: string; width: number; radius: number }
export interface Layer extends Placed {
  id: string; name: string; kind: 'raster' | 'text' | 'shape'; visible: boolean; opacity: number; blend: Blend; adjust: Adjust;
  /** Raster layers: their pixels (replaced, never changed in place, so undo keeps the old ones). */
  canvas?: HTMLCanvasElement;
  text?: TextProps;
  shape?: ShapeProps;
}
export interface Doc { name: string; w: number; h: number; background: string | null; layers: Layer[] }

export const FONTS = ['Inter, system-ui, sans-serif', 'Georgia, serif', '"Courier New", monospace', '"Comic Sans MS", "Comic Neue", cursive', 'Impact, "Arial Black", sans-serif'];
export const FONT_NAMES = ['Sans', 'Serif', 'Mono', 'Playful', 'Bold display'];

let n = 0;
export const newId = () => `l${Date.now().toString(36)}${(n++).toString(36)}`;

export function blankCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** A copy of a canvas (painting works on a copy, so undo keeps the old pixels). */
export function cloneCanvas(src: HTMLCanvasElement) {
  const c = blankCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export function rasterLayer(name: string, canvas: HTMLCanvasElement, at: { x: number; y: number; w: number; h: number }): Layer {
  return { id: newId(), name, kind: 'raster', visible: true, opacity: 1, blend: 'source-over', adjust: { ...NO_ADJUST }, canvas, ...at, rotation: 0, flipX: false, flipY: false };
}

const fontOf = (t: TextProps) => `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${t.size}px ${t.font}`;
const linesOf = (t: TextProps) => (t.value || ' ').split('\n');

/** How big a text layer's box is for its text. */
export function measureText(t: TextProps) {
  const ctx = blankCanvas(1, 1).getContext('2d')!;
  ctx.font = fontOf(t);
  const lines = linesOf(t);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), t.size * 0.5);
  return { w: Math.ceil(w + t.size * 0.2), h: Math.ceil(lines.length * t.size * 1.25) };
}

/** Maps canvas points onto a layer's own pixels (its content is cw×ch): for painting and erasing inside it. */
export function layerMatrix(l: Placed, cw: number, ch: number) {
  return new DOMMatrix().scale(cw / l.w, ch / l.h).translate(l.w / 2, l.h / 2).scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1).rotate(-l.rotation).translate(-(l.x + l.w / 2), -(l.y + l.h / 2));
}

function drawContent(ctx: CanvasRenderingContext2D, l: Layer) {
  if (l.kind === 'raster' && l.canvas) ctx.drawImage(l.canvas, 0, 0, l.w, l.h);
  if (l.kind === 'text' && l.text) {
    const t = l.text;
    ctx.font = fontOf(t);
    ctx.textBaseline = 'top';
    ctx.textAlign = t.align;
    const x = t.align === 'left' ? t.size * 0.1 : t.align === 'right' ? l.w - t.size * 0.1 : l.w / 2;
    linesOf(t).forEach((line, i) => {
      const y = i * t.size * 1.25 + t.size * 0.1;
      if (t.outline) { ctx.lineWidth = Math.max(2, t.size / 12); ctx.strokeStyle = t.outline; ctx.lineJoin = 'round'; ctx.strokeText(line, x, y); }
      ctx.fillStyle = t.color;
      ctx.fillText(line, x, y);
    });
  }
  if (l.kind === 'shape' && l.shape) {
    const s = l.shape;
    const half = s.width / 2;
    ctx.lineWidth = s.width;
    ctx.strokeStyle = s.stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (s.type === 'rect') ctx.roundRect(half, half, Math.max(0, l.w - s.width), Math.max(0, l.h - s.width), s.radius);
    else if (s.type === 'ellipse') ctx.ellipse(l.w / 2, l.h / 2, Math.max(0, l.w / 2 - half), Math.max(0, l.h / 2 - half), 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(half, l.h / 2);
      ctx.lineTo(l.w - half, l.h / 2);
    }
    if (s.fill && (s.type === 'rect' || s.type === 'ellipse')) { ctx.fillStyle = s.fill; ctx.fill(); }
    if (s.width > 0) ctx.stroke();
    if (s.type === 'arrow') {
      const head = Math.min(l.w / 3, s.width * 4 + 8);
      ctx.beginPath();
      ctx.moveTo(l.w - half - head, l.h / 2 - head * 0.6);
      ctx.lineTo(l.w - half, l.h / 2);
      ctx.lineTo(l.w - half - head, l.h / 2 + head * 0.6);
      ctx.stroke();
    }
  }
}

/** Draws one layer onto a canvas whose pixels are the picture's. */
export function drawLayer(ctx: CanvasRenderingContext2D, l: Layer) {
  if (!l.visible || l.opacity <= 0 || l.w <= 0 || l.h <= 0) return;
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.globalCompositeOperation = l.blend;
  ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
  ctx.translate(-l.w / 2, -l.h / 2);
  const f = filterString(l.adjust);
  if (f !== 'none') ctx.filter = f;
  if (l.adjust.vignette > 0) {
    // The vignette darkens this layer's edges only: drawn on a scratch canvas, then placed.
    const s = blankCanvas(l.w, l.h), g = s.getContext('2d')!;
    drawContent(g, l);
    const grad = g.createRadialGradient(l.w / 2, l.h / 2, Math.min(l.w, l.h) * 0.25, l.w / 2, l.h / 2, Math.hypot(l.w, l.h) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(l.adjust.vignette / 100) * 0.85})`);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = grad;
    g.fillRect(0, 0, l.w, l.h);
    ctx.drawImage(s, 0, 0);
  } else drawContent(ctx, l);
  ctx.restore();
}

/** The whole picture onto a canvas of its size (the background, then each layer bottom up). */
export function drawDoc(ctx: CanvasRenderingContext2D, doc: Doc, opts: { background?: string | null } = {}) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, doc.w, doc.h);
  const bg = opts.background !== undefined ? opts.background : doc.background;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, doc.w, doc.h); }
  ctx.restore();
  for (const l of doc.layers) drawLayer(ctx, l);
}

/** The picture as a file. JPG has no see-through areas: they turn white. */
export async function exportBlob(doc: Doc, type: 'png' | 'jpeg' | 'webp', quality = 0.92, scale = 1): Promise<Blob> {
  const c = blankCanvas(doc.w * scale, doc.h * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  drawDoc(ctx, doc, { background: doc.background ?? (type === 'jpeg' ? '#ffffff' : null) });
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, `image/${type}`, quality));
  if (!blob) throw new Error('Couldn’t make the image.');
  return blob;
}

/** One layer, as it shows, cut to a rectangle of the picture (for "copy to a new layer"). */
export function cutLayer(l: Layer, r: Rect) {
  const c = blankCanvas(r.w, r.h);
  const ctx = c.getContext('2d')!;
  ctx.translate(-r.x, -r.y);
  drawLayer(ctx, { ...l, opacity: 1, blend: 'source-over' });
  return c;
}

/** Opens a picture file as a canvas, scaled down so its longest side is at most MAX_SIDE. */
export async function canvasFromFile(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('That file isn’t a picture this browser can open.');
  const s = fitScale(bmp.width, bmp.height, MAX_SIDE, MAX_SIDE);
  const c = blankCanvas(bmp.width * s, bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

async function canvasFromDataUrl(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = blankCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

// ── Project files and the copy kept on this device ──────────────────────────────────────────

interface Saved { v: 1; name: string; w: number; h: number; background: string | null; layers: (Omit<Layer, 'canvas'> & { data?: string })[] }

export function serialize(doc: Doc): string {
  const saved: Saved = { v: 1, name: doc.name, w: doc.w, h: doc.h, background: doc.background, layers: doc.layers.map(({ canvas, ...l }) => ({ ...l, ...(canvas ? { data: canvas.toDataURL('image/png') } : {}) })) };
  return JSON.stringify(saved);
}

export async function deserialize(json: string): Promise<Doc> {
  const s = JSON.parse(json) as Saved;
  if (s?.v !== 1 || !Array.isArray(s.layers) || !(s.w > 0) || !(s.h > 0)) throw new Error('That isn’t a Studio project file.');
  const layers: Layer[] = [];
  for (const { data, ...l } of s.layers) {
    if (l.kind === 'raster' && typeof data !== 'string') continue;
    layers.push({ ...l, adjust: { ...NO_ADJUST, ...l.adjust }, ...(l.kind === 'raster' ? { canvas: await canvasFromDataUrl(data!) } : {}) });
  }
  return { name: String(s.name ?? 'Untitled'), w: Math.min(4096, s.w), h: Math.min(4096, s.h), background: s.background ?? null, layers };
}

const DB = 'universe-studio';
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
/** Keeps the current picture on this device (private windows may not allow it: then nothing is kept). */
export async function keepLocal(json: string | null) {
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      if (json === null) tx.objectStore('kv').delete('current'); else tx.objectStore('kv').put(json, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* storage unavailable */ }
}
export async function readLocal(): Promise<string | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get('current');
      r.onsuccess = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// ── Removing a photo's background (people) ──────────────────────────────────────────────────

let segmenter: Promise<ImageSegmenter> | null = null;
function loadSegmenter() {
  // The same engine and model as call backgrounds (src/lib/call-background.ts), for still pictures.
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const make = (delegate: 'GPU' | 'CPU') => ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate },
      runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  segmenter.catch(() => { segmenter = null; });
  return segmenter;
}

/** A copy of a picture with everything but the people in it made see-through. */
export async function removeBackground(src: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const seg = await loadSegmenter();
  const out = cloneCanvas(src);
  const ctx = out.getContext('2d')!;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  await new Promise<void>((resolve, reject) => {
    try {
      seg.segment(src, (result) => {
        const mask = result.confidenceMasks?.[0];
        if (!mask) { reject(new Error('Couldn’t find anyone in this picture.')); return; }
        const conf = mask.getAsFloat32Array();
        const mw = mask.width, mh = mask.height;
        for (let y = 0; y < out.height; y++) {
          const my = Math.min(mh - 1, Math.floor((y / out.height) * mh));
          for (let x = 0; x < out.width; x++) {
            const mx = Math.min(mw - 1, Math.floor((x / out.width) * mw));
            // Soft edges: confidence below 0.3 is background, above 0.7 is a person.
            const a = Math.min(1, Math.max(0, (conf[my * mw + mx] - 0.3) / 0.4));
            const i = (y * out.width + x) * 4 + 3;
            img.data[i] = Math.round(img.data[i] * a);
          }
        }
        result.close();
        resolve();
      });
    } catch (e) { reject(e); }
  });
  ctx.putImageData(img, 0, 0);
  return out;
}
