// Hyperion's JPEG and BMP writers (M387): imwrite(I, 'photo.jpg') and 'picture.bmp'. Our own baseline JPEG
// encoder written from the JPEG standard (ITU T.81): colour to YCbCr, 8 × 8 blocks through the discrete cosine
// transform, quantised by the standard tables scaled to the quality, then Huffman-coded with tables built from the
// picture's own counts (Annex K.2), so no fixed code tables are needed. No colour subsampling (4:4:4).

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
// The example quantisation tables of the standard (Annex K.1), in normal (row by row) order.
const LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];

const scaled = (base: number[], quality: number) => {
  const q = Math.max(1, Math.min(100, Math.round(quality))), s = q < 50 ? 5000 / q : 200 - 2 * q;
  return base.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
};
const AT = Array.from({ length: 64 }, (_, k) => ZIGZAG.indexOf(k)); // where coefficient k goes in zigzag order
const COS = Array.from({ length: 64 }, (_, k) => Math.cos(((2 * (k >> 3) + 1) * (k & 7) * Math.PI) / 16)); // COS[x*8+u]
const C = (u: number) => (u === 0 ? Math.SQRT1_2 : 1);

/** One 8 × 8 block (values −128…127) → quantised coefficients in zigzag order. */
function block(px: Float64Array, q: number[]): Int32Array {
  const tmp = new Float64Array(64), out = new Int32Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += px[y * 8 + x] * COS[x * 8 + u]; tmp[y * 8 + u] = s; }
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let s = 0;
    for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[y * 8 + v];
    const k = v * 8 + u;
    out[AT[k]] = Math.round((0.25 * C(u) * C(v) * s) / q[k]);
  }
  return out;
}
const bitLength = (v: number) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };

/** Huffman code lengths (at most 16 bits) for symbol counts, by the standard's procedure (Annex K.2). */
function huffman(freq: number[]): { bits: number[]; vals: number[]; code: Map<number, [number, number]> } {
  const f = [...freq, 1]; // symbol 256 reserved, so no code is all ones
  if (!freq.some((x) => x > 0)) f[0] = 1; // a table never used still needs one code
  const size = new Array<number>(257).fill(0), others = new Array<number>(257).fill(-1);
  for (;;) {
    let v1 = -1, v2 = -1;
    for (let i = 0; i < 257; i++) if (f[i] > 0 && (v1 < 0 || f[i] <= f[v1])) v1 = i;
    for (let i = 0; i < 257; i++) if (f[i] > 0 && i !== v1 && (v2 < 0 || f[i] <= f[v2])) v2 = i;
    if (v2 < 0) break;
    f[v1] += f[v2]; f[v2] = 0;
    size[v1]++; let i = v1; while (others[i] >= 0) { i = others[i]; size[i]++; }
    others[i] = v2;
    size[v2]++; i = v2; while (others[i] >= 0) { i = others[i]; size[i]++; }
  }
  const bits = new Array<number>(33).fill(0);
  for (let i = 0; i < 257; i++) if (size[i]) bits[size[i]]++;
  // Codes longer than 16 bits are folded back (Adjust_BITS).
  for (let i = 32; i > 16; i--) while (bits[i] > 0) { let j = i - 2; while (bits[j] === 0) j--; bits[i] -= 2; bits[i - 1]++; bits[j + 1] += 2; bits[j]--; }
  let top = 16; while (bits[top] === 0) top--;
  bits[top]--; // drop the reserved symbol
  const vals = Array.from({ length: 256 }, (_, i) => i).filter((i) => size[i] > 0).sort((a, b) => size[a] - size[b] || a - b);
  const code = new Map<number, [number, number]>();
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) { for (let n = 0; n < bits[len]; n++) code.set(vals[k++], [c++, len]); c <<= 1; }
  return { bits: bits.slice(1, 17), vals: vals.slice(0, k), code };
}

/** RGBA pixels (rows top to bottom) as a baseline JPEG. */
export function encodeJpeg(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray, quality = 75): Uint8Array {
  const qs = [scaled(LUMA, quality), scaled(CHROMA, quality)];
  const bw = Math.ceil(w / 8), bh = Math.ceil(h / 8);
  // Every block of every component, quantised, in the order they are written (Y, Cb, Cr per block).
  const blocks: Int32Array[] = [];
  const px = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = Math.min(w - 1, bx * 8 + x), sy = Math.min(h - 1, by * 8 + y), o = (sy * w + sx) * 4;
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      px[0][y * 8 + x] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      px[1][y * 8 + x] = -0.168736 * r - 0.331264 * g + 0.5 * b;
      px[2][y * 8 + x] = 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
    blocks.push(block(px[0], qs[0]), block(px[1], qs[1]), block(px[2], qs[1]));
  }
  // Pass 1: count the symbols; pass 2: write them with codes built from the counts.
  const freq = [new Array<number>(256).fill(0), new Array<number>(256).fill(0), new Array<number>(256).fill(0), new Array<number>(256).fill(0)];
  const walk = (emit: (table: number, sym: number, extra: number, n: number) => void) => {
    const prev = [0, 0, 0];
    blocks.forEach((b, i) => {
      const comp = i % 3, t = comp === 0 ? 0 : 1;
      const diff = b[0] - prev[comp]; prev[comp] = b[0];
      const s = bitLength(diff);
      emit(t * 2, s, diff < 0 ? diff - 1 : diff, s);
      let run = 0;
      for (let k = 1; k < 64; k++) {
        const v = b[k];
        if (v === 0) { run++; continue; }
        while (run > 15) { emit(t * 2 + 1, 0xf0, 0, 0); run -= 16; }
        const n = bitLength(v);
        emit(t * 2 + 1, (run << 4) | n, v < 0 ? v - 1 : v, n);
        run = 0;
      }
      if (run > 0) emit(t * 2 + 1, 0x00, 0, 0);
    });
  };
  walk((table, sym) => { freq[table][sym]++; });
  const tables = freq.map((f) => huffman(f));
  const data: number[] = [];
  let acc = 0, filled = 0;
  const put = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) {
      acc = (acc << 1) | ((value >> i) & 1);
      if (++filled === 8) { data.push(acc); if (acc === 0xff) data.push(0); acc = 0; filled = 0; }
    }
  };
  walk((table, sym, extra, n) => { const [c, len] = tables[table].code.get(sym)!; put(c, len); if (n) put(extra & ((1 << n) - 1), n); });
  if (filled) put(0x7f, 8 - filled);
  const out: number[] = [];
  const seg = (marker: number, body: number[]) => out.push(0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body);
  out.push(0xff, 0xd8);
  seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  seg(0xdb, [0, ...ZIGZAG.map((k) => qs[0][k]), 1, ...ZIGZAG.map((k) => qs[1][k])]);
  seg(0xc0, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  seg(0xc4, [[0x00, 0], [0x10, 1], [0x01, 2], [0x11, 3]].flatMap(([id, t]) => [id, ...tables[t].bits, ...tables[t].vals]));
  seg(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
  for (const b of data) out.push(b);
  out.push(0xff, 0xd9);
  return Uint8Array.from(out);
}

/** RGBA pixels as a 24-bit BMP (rows bottom to top, each padded to 4 bytes). */
export function encodeBmp(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const rowBytes = Math.ceil((w * 3) / 4) * 4, size = 54 + rowBytes * h;
  const o = new Uint8Array(size), dv = new DataView(o.buffer);
  o[0] = 0x42; o[1] = 0x4d;
  dv.setUint32(2, size, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
  dv.setUint32(34, rowBytes * h, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, t = 54 + (h - 1 - y) * rowBytes + x * 3;
    o[t] = rgba[s + 2]; o[t + 1] = rgba[s + 1]; o[t + 2] = rgba[s];
  }
  return o;
}
