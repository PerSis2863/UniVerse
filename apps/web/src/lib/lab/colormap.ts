// Hyperion's colour maps and a small PNG writer (M379). "lab" is our own map and the default (parula, MATLAB's,
// opens it too); the rest are the well-known public ones, each made from a few stops.

type Stop = [number, number, number, number?];
const STOPS: Record<string, Stop[]> = {
  hyperion: [[29, 58, 138], [37, 99, 235], [13, 148, 136], [101, 163, 13], [245, 158, 11], [253, 224, 71]],
  viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
  plasma: [[13, 8, 135], [126, 3, 168], [204, 71, 120], [248, 149, 64], [240, 249, 33]],
  turbo: [[48, 18, 59], [70, 134, 251], [27, 229, 181], [164, 252, 60], [251, 185, 56], [228, 70, 10], [122, 4, 3]],
  jet: [[0, 0, 143, 0], [0, 0, 255, 0.125], [0, 255, 255, 0.375], [255, 255, 0, 0.625], [255, 0, 0, 0.875], [128, 0, 0, 1]],
  hot: [[10, 0, 0, 0], [255, 0, 0, 0.375], [255, 255, 0, 0.75], [255, 255, 255, 1]],
  cool: [[0, 255, 255], [255, 0, 255]],
  gray: [[0, 0, 0], [255, 255, 255]],
  bone: [[0, 0, 0, 0], [84, 84, 116, 0.375], [167, 199, 199, 0.75], [255, 255, 255, 1]],
  copper: [[0, 0, 0], [255, 199, 127]],
  spring: [[255, 0, 255], [255, 255, 0]],
  summer: [[0, 128, 102], [255, 255, 102]],
  autumn: [[255, 0, 0], [255, 255, 0]],
  winter: [[0, 0, 255], [0, 255, 128]],
};
const ALIAS: Record<string, string> = { parula: 'hyperion', default: 'hyperion', lab: 'hyperion', grey: 'gray' };
export const MAP_NAMES = [...Object.keys(STOPS), ...Object.keys(ALIAS)];

/** A named map as n rows of [r g b] from 0 to 1 (null for an unknown name). */
export function mapOf(name: string, n = 256): number[][] | null {
  const stops = STOPS[ALIAS[name.toLowerCase()] ?? name.toLowerCase()];
  if (!stops) return null;
  const at = stops.map((s, i) => s[3] ?? i / (stops.length - 1));
  return Array.from({ length: n }, (_, k) => {
    const t = n === 1 ? 0 : k / (n - 1);
    let i = 0;
    while (i < stops.length - 2 && t > at[i + 1]) i++;
    const f = at[i + 1] > at[i] ? Math.max(0, Math.min(1, (t - at[i]) / (at[i + 1] - at[i]))) : 0;
    return [0, 1, 2].map((ch) => (stops[i][ch] + (stops[i + 1][ch] - stops[i][ch]) * f) / 255);
  });
}

/** The map's colour for value v on the scale [lo, hi] as [r g b] 0–255 (null for NaN). */
export function rgbAt(map: number[][], lo: number, hi: number, v: number): [number, number, number] | null {
  if (!Number.isFinite(v)) return null;
  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  const row = map[Math.max(0, Math.min(map.length - 1, Math.floor(t * map.length)))];
  return [Math.round(row[0] * 255), Math.round(row[1] * 255), Math.round(row[2] * 255)];
}
export const hex = (c: [number, number, number]) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
export const hexAt = (map: number[][], lo: number, hi: number, v: number) => { const c = rgbAt(map, lo, hi, v); return c ? hex(c) : 'none'; };

// ——— PNG: RGBA pixels as a data URL (zlib "stored" blocks: no compression library needed) ———

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
function chunk(type: string, data: Uint8Array): number[] {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(data, 4);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** `w`×`h` RGBA pixels (rows top to bottom) as a PNG data URL. */
export function png(w: number, h: number, rgba: Uint8Array): string {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78; z[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const part = raw.subarray(b * 65535, Math.min(raw.length, (b + 1) * 65535));
    z[o++] = b === blocks - 1 ? 1 : 0;
    z[o++] = part.length & 255; z[o++] = part.length >>> 8; z[o++] = ~part.length & 255; z[o++] = (~part.length >>> 8) & 255;
    z.set(part, o); o += part.length;
  }
  let s1 = 1, s2 = 0;
  for (const x of raw) { s1 = (s1 + x) % 65521; s2 = (s2 + s1) % 65521; }
  z.set(u32(((s2 << 16) | s1) >>> 0), o);
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr), ...chunk('IDAT', z), ...chunk('IEND', new Uint8Array())]);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}
