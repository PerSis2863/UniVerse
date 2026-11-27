// bzip2 decompression (M579, for ROS 1 bags packed with bz2): our own decoder from the bzip2 format (Huffman-coded
// move-to-front symbols, zero runs, the Burrows–Wheeler transform undone, the final run-length step). Streams in a
// row are joined. CRCs aren't checked; the old "randomised" blocks are refused.

const err = (m: string): never => { throw new Error(`bzip2: ${m}`); };

export function bunzip2(src: Uint8Array, hint = 0): Uint8Array {
  let pos = 0; // bit position, most significant bit first
  const bits = (n: number) => { let v = 0; for (let i = 0; i < n; i++, pos++) { const b = src[pos >> 3]; if (b === undefined) err('the data ends early.'); v = v * 2 + ((b >> (7 - (pos & 7))) & 1); } return v; };
  let out = new Uint8Array(Math.max(hint, 1 << 16)), p = 0;
  const put = (b: number) => { if (p >= out.length) { const n = new Uint8Array(out.length * 2); n.set(out); out = n; } out[p++] = b; };
  while ((pos >> 3) + 4 <= src.length) {
    pos = ((pos + 7) >> 3) << 3;
    if (bits(24) !== 0x425a68) { if (p) break; err('not a bzip2 stream.'); }
    const level = bits(8) - 48;
    if (level < 1 || level > 9) err('a bad block size.');
    const tt = new Uint32Array(level * 100000);
    for (;;) {
      const m1 = bits(24), m2 = bits(24);
      if (m1 === 0x177245 && m2 === 0x385090) { bits(32); break; }
      if (m1 !== 0x314159 || m2 !== 0x265359) err('a broken block.');
      bits(32);
      if (bits(1)) err('randomised blocks (from bzip2 0.9.0) aren’t read.');
      const orig = bits(24);
      // the bytes used
      const used: number[] = [], groups = bits(16);
      for (let i = 0; i < 16; i++) if (groups & (0x8000 >> i)) { const w = bits(16); for (let j = 0; j < 16; j++) if (w & (0x8000 >> j)) used.push(i * 16 + j); }
      if (!used.length) err('a block with no bytes.');
      const alpha = used.length + 2, nG = bits(3), nSel = bits(15);
      if (nG < 2 || nG > 6 || !nSel) err('bad Huffman groups.');
      const mtfG = Array.from({ length: nG }, (_, i) => i), sel = new Uint8Array(nSel);
      for (let i = 0; i < nSel; i++) { let j = 0; while (bits(1)) if (++j >= nG) err('a bad selector.'); const v = mtfG[j]; mtfG.splice(j, 1); mtfG.unshift(v); sel[i] = v; }
      // each group's code lengths, then its canonical decoding tables
      const tables = Array.from({ length: nG }, () => {
        const len = new Uint8Array(alpha); let c = bits(5);
        for (let s = 0; s < alpha; s++) { for (;;) { if (c < 1 || c > 20) err('a bad code length.'); if (!bits(1)) break; c += bits(1) ? -1 : 1; } len[s] = c; }
        let min = 32, max = 0; for (const l of len) { min = Math.min(min, l); max = Math.max(max, l); }
        const perm: number[] = [], first = new Array(max + 2).fill(0), cnt = new Array(max + 2).fill(0), idx = new Array(max + 2).fill(0);
        for (let l = min; l <= max; l++) for (let s = 0; s < alpha; s++) if (len[s] === l) { perm.push(s); cnt[l]++; }
        let code = 0, k = 0; for (let l = min; l <= max; l++) { first[l] = code; idx[l] = k; code = (code + cnt[l]) << 1; k += cnt[l]; }
        return { min, max, perm, first, cnt, idx };
      });
      // symbols → move-to-front indices and zero runs → bytes
      const mtf = Array.from({ length: 256 }, (_, i) => i), count = new Uint32Array(256);
      let n = 0, g = 0, left = 0, t = tables[0], run = 0, runW = 1;
      const flush = () => { if (!run) return; const b = used[mtf[0]]; count[b] += run; if (n + run > tt.length) err('a block larger than its size.'); tt.fill(b, n, n + run); n += run; run = 0; runW = 1; };
      for (;;) {
        if (!left) { if (g >= nSel) err('ran out of selectors.'); t = tables[sel[g++]]; left = 50; }
        left--;
        let l = t.min, c = bits(l);
        while (l <= t.max && !(c - t.first[l] < t.cnt[l] && c >= t.first[l])) { c = c * 2 + bits(1); l++; }
        if (l > t.max) err('a bad Huffman code.');
        const s = t.perm[t.idx[l] + c - t.first[l]];
        if (s <= 1) { run += runW << s; runW <<= 1; continue; }
        flush();
        if (s === alpha - 1) break;
        const j = s - 1, v = mtf[j]; mtf.splice(j, 1); mtf.unshift(v);
        const b = used[v]; count[b]++; if (n >= tt.length) err('a block larger than its size.'); tt[n++] = b;
      }
      if (orig >= n) err('a bad origin pointer.');
      // undo the Burrows–Wheeler transform
      const start = new Uint32Array(256); for (let i = 0, s = 0; i < 256; i++) { start[i] = s; s += count[i]; }
      for (let i = 0; i < n; i++) { const b = tt[i] & 0xff; tt[start[b]++] |= i << 8; }
      let q = tt[orig] >>> 8, last = -1, same = 0;
      for (let i = 0; i < n; i++) {
        const v = tt[q]; q = v >>> 8; const b = v & 0xff;
        if (same === 4) { for (let r = 0; r < b; r++) put(last); same = 0; last = -1; continue; }
        if (b === last) same++; else { last = b; same = 1; }
        put(b);
      }
    }
  }
  return out.subarray(0, p);
}
