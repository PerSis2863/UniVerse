// Hyperion's decoders for compressed DICOM pixels (M507), written from the standards: RLE Lossless (DICOM PS3.5
// annex G: PackBits segments, most significant byte first), and JPEG (ITU T.81): baseline and extended sequential
// (8 or 12 bits, Huffman, any sampling factors, interleaved or one component a scan) and lossless (process 14,
// predictors 1–7, up to 16 bits). Not here: JPEG-LS, JPEG 2000, progressive and arithmetic-coded JPEG. Pure.

export class CodecError extends Error {}
const ZZ_ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];

/** One frame of an RLE-compressed image → planes: `out[s][i]` is sample s of pixel i (row by row). */
export function decodeRle(frame: Uint8Array, rows: number, cols: number, bitsAllocated: number, samples: number): Float64Array[] {
  const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength), nseg = dv.getUint32(0, true), bytes = bitsAllocated / 8, n = rows * cols;
  if (nseg !== bytes * samples || nseg > 15) throw new CodecError(`This RLE frame has ${nseg} segments; ${bytes * samples} were expected.`);
  const offs = Array.from({ length: nseg }, (_, k) => dv.getUint32(4 + 4 * k, true));
  const planes = Array.from({ length: samples }, () => new Float64Array(n));
  for (let s = 0; s < samples; s++) {
    const acc = planes[s];
    for (let b = 0; b < bytes; b++) {
      const k = s * bytes + b, start = offs[k], end = k + 1 < nseg ? offs[k + 1] : frame.length, shift = 8 * (bytes - 1 - b);
      let o = start, i = 0;
      const put = (v: number) => { if (i < n) acc[i] += v * 2 ** shift; i++; };
      while (o < end && i < n) {
        const c = frame[o++];
        const h = c > 127 ? c - 256 : c;
        if (h >= 0) { for (let j = 0; j <= h; j++) put(frame[o++]); }
        else if (h > -128) { const v = frame[o++]; for (let j = 0; j < 1 - h; j++) put(v); }
      }
      if (i < n) throw new CodecError('An RLE segment ends before the image is full.');
    }
  }
  return planes;
}

interface Huff { lookup: Map<number, number>; maxLen: number }
/** A Huffman table from its 16 code-length counts and values (T.81 annex C): code → value, keyed by (length << 16 | code). */
function huffman(counts: number[], values: number[]): Huff {
  const lookup = new Map<number, number>();
  let code = 0, k = 0, maxLen = 0;
  for (let len = 1; len <= 16; len++) {
    for (let j = 0; j < counts[len - 1]; j++) { lookup.set((len << 16) | code, values[k++]); code++; maxLen = len; }
    code <<= 1;
  }
  return { lookup, maxLen };
}

interface Comp { id: number; h: number; v: number; tq: number; td: number; ta: number; bw: number; bh: number; data: Float64Array | null; coefW: number; coefH: number; pred: number }

/** Decodes a JPEG stream → { width, height, precision, planes (one per component, full size, row by row) }. */
export function decodeJpeg(buf: Uint8Array, opts: { colourTransform?: boolean; ybr?: boolean } = {}): { width: number; height: number; precision: number; planes: Float64Array[]; lossless: boolean } {
  let o = 0;
  const u16 = (p: number) => (buf[p] << 8) | buf[p + 1];
  if (u16(0) !== 0xffd8) throw new CodecError('This is not a JPEG stream (no start marker).');
  o = 2;
  const qt: Int32Array[] = [], dc: Huff[] = [], ac: Huff[] = [];
  let frame: { kind: number; P: number; Y: number; X: number; comps: Comp[]; hmax: number; vmax: number } | null = null;
  let restart = 0, adobe: number | null = null, jfif = false;

  while (o < buf.length) {
    if (buf[o] !== 0xff) { o++; continue; }
    const m = buf[o + 1];
    o += 2;
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) { if (m === 0xff) o--; continue; }
    if (m === 0xd9) break;
    const len = u16(o), seg = buf.subarray(o + 2, o + len);
    if (m === 0xdb) {
      for (let p = 0; p < seg.length;) {
        const pq = seg[p] >> 4, tq = seg[p] & 15, t = new Int32Array(64);
        p++;
        for (let k = 0; k < 64; k++) { t[ZZ_[k]] = pq ? (seg[p] << 8) | seg[p + 1] : seg[p]; p += pq ? 2 : 1; }
        qt[tq] = t;
      }
    } else if (m === 0xc4) {
      for (let p = 0; p < seg.length;) {
        const tc = seg[p] >> 4, th = seg[p] & 15, counts = Array.from(seg.subarray(p + 1, p + 17));
        const total = counts.reduce((a, b) => a + b, 0), values = Array.from(seg.subarray(p + 17, p + 17 + total));
        (tc === 0 ? dc : ac)[th] = huffman(counts, values);
        p += 17 + total;
      }
    } else if (m === 0xdd) restart = u16(o + 2);
    else if (m === 0xe0) jfif = String.fromCharCode(...seg.subarray(0, 4)) === 'JFIF';
    else if (m === 0xee && String.fromCharCode(...seg.subarray(0, 5)) === 'Adobe') adobe = seg[11];
    else if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (m !== 0xc0 && m !== 0xc1 && m !== 0xc3) throw new CodecError(m === 0xc2 ? 'Progressive JPEG isn’t supported.' : 'Arithmetic-coded or hierarchical JPEG isn’t supported.');
      const P = seg[0], Y = u16(o + 3), X = u16(o + 5), nc = seg[5], comps: Comp[] = [];
      if (!Y || !X) throw new CodecError('This JPEG gives no height or width.');
      for (let k = 0; k < nc; k++) { const b = 6 + 3 * k; comps.push({ id: seg[b], h: seg[b + 1] >> 4, v: seg[b + 1] & 15, tq: seg[b + 2], td: 0, ta: 0, bw: 0, bh: 0, data: null, coefW: 0, coefH: 0, pred: 0 }); }
      const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
      for (const c of comps) {
        if (m === 0xc3) { c.coefW = Math.ceil((X * c.h) / hmax); c.coefH = Math.ceil((Y * c.v) / vmax); }
        else { const mx = Math.ceil(X / (8 * hmax)), my = Math.ceil(Y / (8 * vmax)); c.bw = mx * c.h; c.bh = my * c.v; c.coefW = c.bw * 8; c.coefH = c.bh * 8; }
        c.data = new Float64Array(c.coefW * c.coefH);
      }
      frame = { kind: m, P, Y, X, comps, hmax, vmax };
    } else if (m === 0xda) {
      if (!frame) throw new CodecError('A JPEG scan comes before its frame header.');
      const ns = seg[0], sc: Comp[] = [];
      for (let k = 0; k < ns; k++) {
        const c = frame.comps.find((x) => x.id === seg[1 + 2 * k]);
        if (!c) throw new CodecError('A JPEG scan names a component the frame doesn’t have.');
        c.td = seg[2 + 2 * k] >> 4; c.ta = seg[2 + 2 * k] & 15; sc.push(c);
      }
      const ss = seg[1 + 2 * ns], al = seg[3 + 2 * ns] & 15;
      o = scan(buf, o + len, frame, sc, ss, al, restart, dc, ac, qt);
      continue;
    }
    o += len;
  }
  if (!frame) throw new CodecError('This JPEG stream has no image.');
  const f = frame, lossless = f.kind === 0xc3, top = 2 ** f.P - 1;
  const planes = f.comps.map((c) => {
    const out = new Float64Array(f.X * f.Y), d = c.data!;
    // Smaller (subsampled) components are stretched by centred linear steps, as libjpeg's "fancy" upsampling does.
    const rx = f.hmax / c.h, ry = f.vmax / c.v, cw = Math.ceil(f.X / rx), ch = Math.ceil(f.Y / ry);
    for (let y = 0; y < f.Y; y++) {
      const sy = ry === 1 ? y : Math.max(0, Math.min(ch - 1, (y + 0.5) / ry - 0.5)), y0 = Math.floor(sy), y1 = Math.min(ch - 1, y0 + 1), ty = sy - y0;
      for (let x = 0; x < f.X; x++) {
        if (rx === 1 && ry === 1) { out[y * f.X + x] = d[y * c.coefW + x]; continue; }
        const sx = rx === 1 ? x : Math.max(0, Math.min(cw - 1, (x + 0.5) / rx - 0.5)), x0 = Math.floor(sx), x1 = Math.min(cw - 1, x0 + 1), tx = sx - x0;
        const top = d[y0 * c.coefW + x0] * (1 - tx) + d[y0 * c.coefW + x1] * tx, bot = d[y1 * c.coefW + x0] * (1 - tx) + d[y1 * c.coefW + x1] * tx;
        out[y * f.X + x] = top * (1 - ty) + bot * ty;
      }
    }
    if (!lossless) for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(top, Math.round(out[i])));
    return out;
  });
  // Three components of a DCT JPEG: an Adobe marker decides, then components named R, G, B (no change), then a JFIF
  // marker (YCbCr), then what the caller knows (DICOM's photometric interpretation); YCbCr when nothing says.
  const rgbIds = f.comps.every((c, k) => c.id === [82, 71, 66][k]);
  const transform = opts.colourTransform ?? (!lossless && planes.length === 3 && (adobe !== null ? adobe !== 0 : rgbIds ? false : jfif ? true : opts.ybr ?? true));
  if (transform && planes.length === 3) {
    const half = (top + 1) / 2, [Y, Cb, Cr] = planes;
    for (let i = 0; i < Y.length; i++) {
      const y = Y[i], b = Cb[i] - half, r = Cr[i] - half;
      Y[i] = Math.max(0, Math.min(top, Math.round(y + 1.402 * r)));
      Cb[i] = Math.max(0, Math.min(top, Math.round(y - 0.344136 * b - 0.714136 * r)));
      Cr[i] = Math.max(0, Math.min(top, Math.round(y + 1.772 * b)));
    }
  }
  return { width: f.X, height: f.Y, precision: f.P, planes, lossless };
}

const COS = Array.from({ length: 64 }, (_, k) => Math.cos(((2 * (k >> 3) + 1) * (k & 7) * Math.PI) / 16) * ((k & 7) === 0 ? Math.SQRT1_2 : 1)); // [x*8+u] with C(u)

/** One scan's entropy-coded data from `o`; returns where it ended (at the next marker). */
function scan(buf: Uint8Array, o: number, f: { kind: number; P: number; Y: number; X: number; comps: Comp[]; hmax: number; vmax: number }, sc: Comp[], ss: number, al: number, restart: number, dc: Huff[], ac: Huff[], qt: Int32Array[]): number {
  let bits = 0, nbits = 0, marker = false;
  const bit = () => {
    if (nbits === 0) {
      if (marker || o >= buf.length) { bits = 0; nbits = 8; }
      else {
        const b = buf[o];
        if (b === 0xff) { const n = buf[o + 1]; if (n === 0) { o += 2; bits = 0xff; } else { marker = true; bits = 0; } }
        else { o++; bits = b; }
        nbits = 8;
      }
    }
    nbits--;
    return (bits >> nbits) & 1;
  };
  const receive = (s: number) => { let v = 0; for (let i = 0; i < s; i++) v = (v << 1) | bit(); return v; };
  const extend = (v: number, s: number) => (s === 0 ? 0 : v < 1 << (s - 1) ? v - (1 << s) + 1 : v);
  const decode = (h: Huff | undefined) => {
    if (!h) throw new CodecError('A JPEG scan uses a Huffman table it never defined.');
    let code = 0;
    for (let len = 1; len <= 16; len++) {
      code = (code << 1) | bit();
      const v = h.lookup.get((len << 16) | code);
      if (v !== undefined) return v;
    }
    throw new CodecError('This JPEG’s coded data is damaged (no Huffman code matched).');
  };
  /** At a restart marker: skip it, reset the bit reader and the predictions. */
  const reset = () => {
    nbits = 0; marker = false;
    while (o + 1 < buf.length && !(buf[o] === 0xff && buf[o + 1] >= 0xd0 && buf[o + 1] <= 0xd7)) o++;
    o += 2;
    for (const c of sc) c.pred = 0;
  };
  for (const c of sc) c.pred = 0;

  if (f.kind === 0xc3) {
    // Lossless (annex H): each sample predicted from its neighbours a (left), b (above), c (above left).
    const psv = ss, P = f.P, mod = 2 ** 16;
    if (sc.some((c) => c.h !== 1 || c.v !== 1)) throw new CodecError('Lossless JPEG with subsampled components isn’t supported.');
    const w = f.X, h = f.Y, start = 2 ** (P - al - 1);
    // The first line (of the scan, or after a restart) predicts from the left; its first sample from 2^(P−Pt−1).
    let count = 0, firstLine = true, fresh = true;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (restart && count > 0 && count % restart === 0) { reset(); firstLine = true; fresh = true; }
        for (const c of sc) {
          const d = c.data!, W = c.coefW, at = y * W + x;
          const t = decode(dc[c.td]);
          const diff = t === 16 ? 32768 : extend(receive(t), t);
          let p: number;
          if (fresh) p = start;
          else if (firstLine) p = d[at - 1];
          else if (x === 0) p = d[at - W];
          else {
            const a = d[at - 1], b = d[at - W], cc = d[at - W - 1];
            p = psv === 1 ? a : psv === 2 ? b : psv === 3 ? cc : psv === 4 ? a + b - cc : psv === 5 ? a + ((b - cc) >> 1) : psv === 6 ? b + ((a - cc) >> 1) : (a + b) >> 1;
          }
          d[at] = (((p + diff) % mod) + mod) % mod;
        }
        fresh = false;
        count++;
      }
      firstLine = false;
    }
    if (al) for (const c of sc) for (let i = 0; i < c.data!.length; i++) c.data![i] *= 2 ** al;
  } else {
    // Sequential DCT: per block a DC difference then run-length AC coefficients, dequantised and inverse-transformed.
    const coef = new Float64Array(64), tmp = new Float64Array(64), shift = 2 ** (f.P - 1);
    const block = (c: Comp, bx: number, by: number) => {
      coef.fill(0);
      const t = decode(dc[c.td]);
      c.pred += extend(receive(t), t);
      const q = qt[c.tq];
      if (!q) throw new CodecError('A JPEG component uses a quantisation table it never defined.');
      coef[0] = c.pred * q[0];
      for (let k = 1; k < 64;) {
        const rs = decode(ac[c.ta]), r = rs >> 4, s = rs & 15;
        if (s === 0) { if (r === 15) { k += 16; continue; } break; }
        k += r;
        if (k > 63) break;
        const z = ZZ_[k];
        coef[z] = extend(receive(s), s) * q[z];
        k++;
      }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let v = 0; for (let u = 0; u < 8; u++) v += coef[y * 8 + u] * COS[x * 8 + u]; tmp[y * 8 + x] = v; }
      const d = c.data!, W = c.coefW;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let v = 0; for (let u = 0; u < 8; u++) v += tmp[u * 8 + x] * COS[y * 8 + u]; d[(by * 8 + y) * W + bx * 8 + x] = v / 4 + shift; }
    };
    if (sc.length === 1) {
      const c = sc[0], bw = Math.ceil(Math.ceil((f.X * c.h) / f.hmax) / 8), bh = Math.ceil(Math.ceil((f.Y * c.v) / f.vmax) / 8);
      let n = 0;
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { if (restart && n > 0 && n % restart === 0) reset(); block(c, bx, by); n++; }
    } else {
      const mx = Math.ceil(f.X / (8 * f.hmax)), my = Math.ceil(f.Y / (8 * f.vmax));
      let n = 0;
      for (let y = 0; y < my; y++) for (let x = 0; x < mx; x++) {
        if (restart && n > 0 && n % restart === 0) reset();
        for (const c of sc) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) block(c, x * c.h + h, y * c.v + v);
        n++;
      }
    }
  }
  // Move to the next marker that isn't a restart.
  while (o + 1 < buf.length && !(buf[o] === 0xff && buf[o + 1] !== 0 && !(buf[o + 1] >= 0xd0 && buf[o + 1] <= 0xd7))) o++;
  return o;
}
