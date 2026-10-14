// Studio photo editor (Stage 5 · B9.15): the pure parts (no canvas), so they can be tested.

export interface Adjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  hue: number; // -180..180 degrees
  warmth: number; // -100..100
  blur: number; // 0..20 px
  vignette: number; // 0..100
  grayscale: number; // 0..100
  sepia: number; // 0..100
  invert: number; // 0..100
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, hue: 0, warmth: 0, blur: 0, vignette: 0, grayscale: 0, sepia: 0, invert: 0 };

export const SLIDERS: { key: keyof Adjust; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
  { key: 'blur', label: 'Blur', min: 0, max: 20 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
];

/** One-tap looks. */
export const FILTERS: { id: string; name: string; adjust: Partial<Adjust> }[] = [
  { id: 'none', name: 'Original', adjust: {} },
  { id: 'vivid', name: 'Vivid', adjust: { saturation: 35, contrast: 15 } },
  { id: 'warm', name: 'Warm', adjust: { warmth: 40, brightness: 5 } },
  { id: 'cool', name: 'Cool', adjust: { warmth: -40, saturation: -5 } },
  { id: 'mono', name: 'Mono', adjust: { grayscale: 100, contrast: 10 } },
  { id: 'noir', name: 'Noir', adjust: { grayscale: 100, contrast: 45, brightness: -10, vignette: 40 } },
  { id: 'vintage', name: 'Vintage', adjust: { sepia: 45, contrast: -10, saturation: -15, vignette: 30 } },
  { id: 'fade', name: 'Fade', adjust: { contrast: -25, brightness: 10, saturation: -20 } },
  { id: 'drama', name: 'Drama', adjust: { contrast: 40, saturation: 10, vignette: 50 } },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The canvas filter for an adjustment (ctx.filter; the vignette is drawn separately). "none" when nothing is set. */
export function filterString(a: Adjust): string {
  const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${100 + clamp(a.brightness, -100, 100)}%)`);
  if (a.contrast) parts.push(`contrast(${100 + clamp(a.contrast, -100, 100)}%)`);
  if (a.saturation) parts.push(`saturate(${100 + clamp(a.saturation, -100, 100)}%)`);
  // Warmer: a touch of sepia; cooler: a slight turn towards blue.
  if (a.warmth > 0) parts.push(`sepia(${Math.round(clamp(a.warmth, 0, 100) * 0.4)}%)`);
  const hue = a.hue + (a.warmth < 0 ? Math.round(clamp(-a.warmth, 0, 100) * 0.25) : 0);
  if (hue) parts.push(`hue-rotate(${clamp(hue, -180, 205)}deg)`);
  if (a.grayscale) parts.push(`grayscale(${clamp(a.grayscale, 0, 100)}%)`);
  if (a.sepia) parts.push(`sepia(${clamp(a.sepia, 0, 100)}%)`);
  if (a.invert) parts.push(`invert(${clamp(a.invert, 0, 100)}%)`);
  if (a.blur) parts.push(`blur(${clamp(a.blur, 0, 20)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/** The scale that fits w×h inside maxW×maxH (never enlarging). */
export function fitScale(w: number, h: number, maxW: number, maxH: number) {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(1, maxW / w, maxH / h);
}

export interface Rect { x: number; y: number; w: number; h: number }

/** A rectangle from two corners, kept inside the canvas and whole-pixel. */
export function rectFrom(x0: number, y0: number, x1: number, y1: number, maxW: number, maxH: number): Rect {
  const l = clamp(Math.min(x0, x1), 0, maxW), r = clamp(Math.max(x0, x1), 0, maxW);
  const t = clamp(Math.min(y0, y1), 0, maxH), b = clamp(Math.max(y0, y1), 0, maxH);
  return { x: Math.round(l), y: Math.round(t), w: Math.round(r - l), h: Math.round(b - t) };
}

export interface Placed { x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean }

/** A point on the canvas in a layer's own pixels (its content is cw×ch), undoing its position, rotation, size and flips. */
export function toLayer(p: { x: number; y: number }, l: Placed, cw: number, ch: number) {
  const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
  const r = (-l.rotation * Math.PI) / 180;
  const dx = p.x - cx, dy = p.y - cy;
  let lx = dx * Math.cos(r) - dy * Math.sin(r);
  let ly = dx * Math.sin(r) + dy * Math.cos(r);
  if (l.flipX) lx = -lx;
  if (l.flipY) ly = -ly;
  return { x: ((lx + l.w / 2) / l.w) * cw, y: ((ly + l.h / 2) / l.h) * ch };
}

/** Whether a canvas point falls on a layer (inside its turned box). */
export function hits(p: { x: number; y: number }, l: Placed) {
  const q = toLayer(p, l, l.w, l.h);
  return q.x >= 0 && q.y >= 0 && q.x <= l.w && q.y <= l.h;
}

/** The simple editor's crop shapes (null: any shape). */
export const CROP_RATIOS: { id: string; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'square', label: 'Square', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

/** The biggest rectangle of this shape (width ÷ height) in the middle of a w×h picture. */
export function ratioRect(w: number, h: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: Math.round(w), h: Math.round(h) };
  const cw = Math.min(w, h * ratio), ch = cw / ratio;
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: Math.round(cw), h: Math.round(ch) };
}

/** A crop dragged from (x0, y0) towards (x1, y1), kept to a shape (when one is chosen) and inside the picture. */
export function ratioDrag(x0: number, y0: number, x1: number, y1: number, ratio: number | null, maxW: number, maxH: number): Rect {
  if (!ratio) return rectFrom(x0, y0, x1, y1, maxW, maxH);
  const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  // As far as the pointer went, but no further than the picture's edge in either direction.
  const roomX = sx > 0 ? maxW - x0 : x0, roomY = sy > 0 ? maxH - y0 : y0;
  let w = Math.min(Math.abs(x1 - x0), roomX), h = Math.min(Math.abs(y1 - y0), roomY);
  if (w / Math.max(h, 1e-9) > ratio) w = h * ratio; else h = w / ratio;
  if (w > roomX) { w = roomX; h = w / ratio; }
  if (h > roomY) { h = roomY; w = h * ratio; }
  return rectFrom(x0, y0, x0 + sx * w, y0 + sy * h, maxW, maxH);
}

/** The four sliders of the simple editor, in plain words. */
export const SIMPLE_SLIDERS: { key: keyof Adjust; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Light', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Colour', min: -100, max: 100 },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
];

/** Whether a picture's adjustments are exactly one of the looks. */
export const isLook = (a: Adjust, look: Partial<Adjust>) => (Object.keys(NO_ADJUST) as (keyof Adjust)[]).every((k) => a[k] === (look[k] ?? 0));

/** Ready-made canvas sizes. */
export const SIZES: { id: string; name: string; w: number; h: number }[] = [
  { id: 'square', name: 'Square post', w: 1080, h: 1080 },
  { id: 'story', name: 'Story', w: 1080, h: 1920 },
  { id: 'wide', name: 'Slide (16:9)', w: 1920, h: 1080 },
  { id: 'poster', name: 'Poster (A4)', w: 1240, h: 1754 },
  { id: 'banner', name: 'Banner', w: 1500, h: 500 },
];

/** The biggest side a canvas or an opened picture keeps (larger pictures are scaled down to it). */
export const MAX_SIDE = 2048;

/** A file name for an export: the project's name, made safe, with the format's extension. */
export function exportName(name: string, type: 'png' | 'jpeg' | 'webp') {
  const base = name.trim().replace(/[^\p{L}\p{N} _-]+/gu, '').replace(/\s+/g, '-').slice(0, 60) || 'image';
  return `${base}.${type === 'jpeg' ? 'jpg' : type}`;
}

/** A 3×3 sharpen of RGBA pixels (amount 0..1), edges left as they are. Returns new pixels. */
export function sharpen(data: Uint8ClampedArray, w: number, h: number, amount = 0.6): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const k = amount;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] * (1 + 4 * k) - k * (data[i + c - 4] + data[i + c + 4] + data[i + c - w * 4] + data[i + c + w * 4]);
        out[i + c] = v;
      }
    }
  }
  return out;
}
