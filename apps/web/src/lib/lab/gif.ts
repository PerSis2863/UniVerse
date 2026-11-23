// An animated GIF (GIF89a) from pictures, for Hyperion's Sweep (M402): one palette of up to 256 colours for the whole
// film (the most used colours, averaged within 15-bit bins; every other colour goes to its nearest), LZW-compressed
// frames, played on a loop. Built in steps (a palette pass, then one frame at a time) so the page can breathe between.

export interface Palette { rgb: Uint8Array; n: number; lut: Int16Array }

const bin = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** Counts the colours of every frame (`add`), then picks the palette (`make`). */
export class PaletteMaker {
  private count = new Float64Array(32768);
  private sum = new Float64Array(32768 * 3);
  add(rgba: Uint8ClampedArray | Uint8Array) {
    const { count, sum } = this;
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], k = bin(r, g, b);
      count[k]++; sum[k * 3] += r; sum[k * 3 + 1] += g; sum[k * 3 + 2] += b;
    }
  }
  make(): Palette {
    const used: number[] = [];
    for (let k = 0; k < 32768; k++) if (this.count[k]) used.push(k);
    used.sort((a, b) => this.count[b] - this.count[a]);
    const top = used.slice(0, 256), rgb = new Uint8Array(256 * 3), lut = new Int16Array(32768).fill(-1);
    top.forEach((k, i) => {
      const c = this.count[k];
      rgb[i * 3] = Math.round(this.sum[k * 3] / c); rgb[i * 3 + 1] = Math.round(this.sum[k * 3 + 1] / c); rgb[i * 3 + 2] = Math.round(this.sum[k * 3 + 2] / c);
      lut[k] = i;
    });
    return { rgb, n: Math.max(1, top.length), lut };
  }
}

/** Each pixel's palette entry (a colour outside the palette takes the nearest one, remembered for its bin). */
export function indexPixels(rgba: Uint8ClampedArray | Uint8Array, p: Palette): Uint8Array {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], k = bin(r, g, b);
    let at = p.lut[k];
    if (at < 0) {
      let best = Infinity;
      for (let q = 0; q < p.n; q++) {
        const dr = p.rgb[q * 3] - r, dg = p.rgb[q * 3 + 1] - g, db = p.rgb[q * 3 + 2] - b, d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (d < best) { best = d; at = q; }
      }
      p.lut[k] = at;
    }
    out[j] = at;
  }
  return out;
}

class Bytes {
  a = new Uint8Array(1 << 16); n = 0;
  private room(k: number) { if (this.n + k > this.a.length) { const b = new Uint8Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  byte(b: number) { this.room(1); this.a[this.n++] = b; }
  word(w: number) { this.byte(w & 255); this.byte((w >> 8) & 255); }
  all(bs: ArrayLike<number>) { this.room(bs.length); this.a.set(bs, this.n); this.n += bs.length; }
  text(s: string) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  done() { return this.a.slice(0, this.n); }
}

/** GIF's LZW (8-bit pixels): codes packed from the lowest bit, in blocks of at most 255 bytes. */
function lzw(px: Uint8Array, out: Bytes) {
  const MIN = 8, CLEAR = 256, EOI = 257;
  out.byte(MIN);
  const table = new Int16Array(4096 * 256); // (prefix code, next pixel) → code, 0 for none (codes start at 258)
  const block = new Uint8Array(255);
  let used = 0, cur = 0, shift = 0, size = MIN + 1, next = EOI + 1;
  const put = (code: number) => {
    cur |= code << shift; shift += size;
    while (shift >= 8) {
      block[used++] = cur & 255; cur >>>= 8; shift -= 8;
      if (used === 255) { out.byte(255); out.all(block); used = 0; }
    }
  };
  put(CLEAR);
  if (!px.length) { put(EOI); } else {
    let prefix = px[0];
    for (let i = 1; i < px.length; i++) {
      const k = px[i], key = (prefix << 8) | k, code = table[key];
      if (code) { prefix = code; continue; }
      put(prefix);
      if (next === 4096) { put(CLEAR); table.fill(0); size = MIN + 1; next = EOI + 1; }
      else { if (next >= 1 << size) size++; table[key] = next++; }
      prefix = k;
    }
    put(prefix);
    put(EOI);
  }
  if (shift > 0) { block[used++] = cur & 255; if (used === 255) { out.byte(255); out.all(block); used = 0; } }
  if (used) { out.byte(used); out.all(block.subarray(0, used)); }
  out.byte(0);
}

/** The file, a frame at a time: `new GifWriter(w, h, palette)`, `frame(pixels, delay)`… then `finish()`. */
export class GifWriter {
  private b = new Bytes();
  constructor(private w: number, private h: number, p: Palette) {
    const b = this.b;
    b.text('GIF89a'); b.word(w); b.word(h);
    b.byte(0xf7); b.byte(0); b.byte(0); // a global table of 256 colours, 8 bits each
    b.all(p.rgb);
    b.byte(0x21); b.byte(0xff); b.byte(11); b.text('NETSCAPE2.0'); b.byte(3); b.byte(1); b.word(0); b.byte(0); // loop for ever
  }
  /** One picture (`indexPixels` of it), shown for `delayMs`. */
  frame(px: Uint8Array, delayMs: number) {
    if (px.length !== this.w * this.h) throw new Error('A frame has the wrong size.');
    const b = this.b;
    b.byte(0x21); b.byte(0xf9); b.byte(4); b.byte(0x04); b.word(Math.max(2, Math.round(delayMs / 10))); b.byte(0); b.byte(0);
    b.byte(0x2c); b.word(0); b.word(0); b.word(this.w); b.word(this.h); b.byte(0);
    lzw(px, b);
  }
  finish(): Uint8Array { this.b.byte(0x3b); return this.b.done(); }
}
