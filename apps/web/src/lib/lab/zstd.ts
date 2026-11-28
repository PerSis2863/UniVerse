// Zstandard decompression (M579, for ROS bags and MCAP files packed with zstd): our own decoder from RFC 8878. Frames
// (several in a row, skippable ones skipped), raw, RLE and compressed blocks, Huffman literals (1 or 4 streams, tables
// carried between blocks), FSE sequences (predefined, RLE, described or repeated tables) and repeat offsets. The
// checksum isn't verified and dictionaries aren't supported.

const hsb = (n: number) => 31 - Math.clz32(n);
const err = (m: string): never => { throw new Error(`zstd: ${m}`); };

/** Bits read backwards from the end of a slice (the padding's top set bit marks the start), as zstd's streams are. */
class Back {
  bit: number;
  constructor(private u: Uint8Array, private s: number, e: number) { const last = u[e - 1]; if (!last) err('a stream without its end marker.'); this.bit = (e - 1 - s) * 8 + hsb(last); }
  read(n: number) {
    if (!n) return 0;
    this.bit -= n;
    const b = this.bit;
    if (b >= 0) { const o = this.s + (b >> 3), u = this.u, w = (u[o] ?? 0) + (u[o + 1] ?? 0) * 256 + (u[o + 2] ?? 0) * 65536 + (u[o + 3] ?? 0) * 16777216 + (u[o + 4] ?? 0) * 4294967296; return Math.floor(w / 2 ** (b & 7)) % 2 ** n; }
    let v = 0; for (let i = n - 1; i >= 0; i--) { const q = b + i; v = v * 2 + (q >= 0 ? (this.u[this.s + (q >> 3)] >> (q & 7)) & 1 : 0); } return v;
  }
}
interface Fse { log: number; sym: Uint8Array; nb: Uint8Array; base: Uint16Array }
function buildFse(norm: number[], log: number): Fse {
  const size = 1 << log, sym = new Uint8Array(size), nb = new Uint8Array(size), base = new Uint16Array(size), next: number[] = [];
  let high = size;
  norm.forEach((p, s) => { if (p === -1) { sym[--high] = s; next[s] = 1; } });
  const step = (size >> 1) + (size >> 3) + 3, mask = size - 1;
  let pos = 0;
  norm.forEach((p, s) => { if (p <= 0) return; next[s] = p; for (let i = 0; i < p; i++) { sym[pos] = s; do pos = (pos + step) & mask; while (pos >= high); } });
  for (let i = 0; i < size; i++) { const d = next[sym[i]]++; nb[i] = log - hsb(d); base[i] = (d << nb[i]) - size; }
  return { log, sym, nb, base };
}
/** An FSE table description read forwards from u[o]; returns the table and the bytes used. */
function readFse(u: Uint8Array, o: number, maxLog: number, maxSym: number): [Fse, number] {
  let bit = 0;
  const get = (n: number) => { let v = 0; for (let i = 0; i < n; i++, bit++) v |= ((u[o + (bit >> 3)] >> (bit & 7)) & 1) << i; return v; };
  const log = get(4) + 5;
  if (log > maxLog) err('a table too large.');
  let remaining = 1 << log, s = 0;
  const norm: number[] = [];
  while (remaining > 0 && s <= maxSym) {
    const bits = hsb(remaining + 1) + 1;
    let val = get(bits);
    const low = (1 << (bits - 1)) - 1, thr = (1 << bits) - 1 - (remaining + 1);
    if ((val & low) < thr) { bit--; val &= low; } else if (val > low) val -= thr;
    const p = val - 1;
    remaining -= Math.abs(p); norm[s++] = p;
    if (p === 0) for (;;) { const r = get(2); for (let i = 0; i < r && s <= maxSym; i++) norm[s++] = 0; if (r !== 3) break; }
  }
  if (remaining !== 0) err('a broken table description.');
  return [buildFse(norm, log), (bit + 7) >> 3];
}
const rleFse = (s: number): Fse => ({ log: 0, sym: Uint8Array.of(s), nb: Uint8Array.of(0), base: Uint16Array.of(0) });

interface Huff { max: number; sym: Uint8Array; nb: Uint8Array }
function buildHuff(w: number[]): Huff {
  let sum = 0; for (const x of w) if (x) sum += 1 << (x - 1);
  if (!sum) err('an empty Huffman table.');
  const max = hsb(sum) + 1, left = (1 << max) - sum;
  if (left & (left - 1)) err('a broken Huffman table.');
  w.push(hsb(left) + 1);
  const bits = w.map((x) => (x ? max + 1 - x : 0)), count = new Array(max + 2).fill(0);
  for (const b of bits) count[b]++;
  const idx = new Array(max + 2).fill(0), size = 1 << max, sym = new Uint8Array(size), nb = new Uint8Array(size);
  for (let i = max; i >= 1; i--) { idx[i - 1] = idx[i] + count[i] * (1 << (max - i)); nb.fill(i, idx[i], idx[i - 1]); }
  bits.forEach((b, s) => { if (!b) return; const len = 1 << (max - b); sym.fill(s, idx[b], idx[b] + len); idx[b] += len; });
  return { max, sym, nb };
}
function readHuff(u: Uint8Array, o: number): [Huff, number] {
  const hb = u[o], w: number[] = [];
  if (hb >= 128) { const n = hb - 127; for (let i = 0; i < n; i++) w.push(i & 1 ? u[o + 1 + (i >> 1)] & 15 : u[o + 1 + (i >> 1)] >> 4); return [buildHuff(w), 1 + ((n + 1) >> 1)]; }
  const [t, used] = readFse(u, o + 1, 6, 255), br = new Back(u, o + 1 + used, o + 1 + hb);
  let s1 = br.read(t.log), s2 = br.read(t.log);
  const step = (s: number) => t.base[s] + br.read(t.nb[s]);
  for (;;) {
    w.push(t.sym[s1]); s1 = step(s1);
    if (br.bit < 0) { w.push(t.sym[s2]); break; }
    w.push(t.sym[s2]); s2 = step(s2);
    if (br.bit < 0) { w.push(t.sym[s1]); break; }
  }
  return [buildHuff(w), 1 + hb];
}
function huffStream(h: Huff, u: Uint8Array, s: number, e: number, out: Uint8Array, at: number, n: number) {
  const br = new Back(u, s, e), mask = (1 << h.max) - 1;
  let st = br.read(h.max);
  for (let i = 0; i < n; i++) { out[at + i] = h.sym[st]; const b = h.nb[st]; st = ((st << b) + br.read(b)) & mask; }
}

const LL_BASE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40, 48, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
const LL_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const ML_BASE = [...Array.from({ length: 32 }, (_, i) => i + 3), 35, 37, 39, 41, 43, 47, 51, 59, 67, 83, 99, 131, 259, 515, 1027, 2051, 4099, 8195, 16387, 32771, 65539];
const ML_BITS = [...new Array(32).fill(0), 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const LL_DEF = buildFse([4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1], 6);
const ML_DEF = buildFse([1, 4, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1], 6);
const OF_DEF = buildFse([1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1], 5);

/** Every frame in `src` decompressed and joined; `hint` sizes the first buffer. */
export function zstd(src: Uint8Array, hint = 0): Uint8Array {
  let out = new Uint8Array(Math.max(hint, 1 << 16)), p = 0;
  const room = (n: number) => { if (p + n > out.length) { const b = new Uint8Array(Math.max(out.length * 2, p + n)); b.set(out.subarray(0, p)); out = b; } };
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  let o = 0;
  while (o + 4 <= src.length) {
    const magic = dv.getUint32(o, true);
    if ((magic & 0xfffffff0) === 0x184d2a50) { o += 8 + dv.getUint32(o + 4, true); continue; }
    if (magic !== 0xfd2fb528) err('not a Zstandard frame.');
    const fhd = src[o + 4], single = (fhd >> 5) & 1, fcsFlag = fhd >> 6, dictFlag = fhd & 3, check = (fhd >> 2) & 1;
    if (dictFlag) err('frames made with a dictionary aren’t read.');
    o += 5 + (single ? 0 : 1);
    const fcsLen = [single ? 1 : 0, 2, 4, 8][fcsFlag];
    if (fcsLen) { const fcs = fcsLen === 1 ? src[o] : fcsLen === 2 ? dv.getUint16(o, true) + 256 : fcsLen === 4 ? dv.getUint32(o, true) : Number(dv.getBigUint64(o, true)); room(fcs); }
    o += fcsLen;
    const rep = [1, 4, 8];
    let huff: Huff | null = null, llT: Fse | null = null, ofT: Fse | null = null, mlT: Fse | null = null;
    for (let last = 0; !last;) {
      const bh = src[o] | (src[o + 1] << 8) | (src[o + 2] << 16), type = (bh >> 1) & 3, size = bh >>> 3;
      last = bh & 1; o += 3;
      if (type === 0) { room(size); out.set(src.subarray(o, o + size), p); p += size; o += size; continue; }
      if (type === 1) { room(size); out.fill(src[o], p, p + size); p += size; o += 1; continue; }
      if (type === 3) err('a reserved block type.');
      const end = o + size;
      // literals
      const b0 = src[o], lt = b0 & 3, sf = (b0 >> 2) & 3;
      let lits: Uint8Array, q: number;
      if (lt < 2) {
        const [n, h] = sf === 1 ? [(b0 >> 4) + (src[o + 1] << 4), 2] : sf === 3 ? [(b0 >> 4) + (src[o + 1] << 4) + (src[o + 2] << 12), 3] : [b0 >> 3, 1];
        q = o + h;
        if (lt === 0) { lits = src.subarray(q, q + n); q += n; } else { lits = new Uint8Array(n).fill(src[q]); q += 1; }
      } else {
        const hl = sf < 2 ? 3 : sf === 2 ? 4 : 5, v = (src[o] | (src[o + 1] << 8) | (src[o + 2] << 16) | (hl > 3 ? src[o + 3] << 24 : 0)) >>> 0;
        const regen = sf < 2 ? (v >>> 4) & 0x3ff : sf === 2 ? (v >>> 4) & 0x3fff : (v >>> 4) & 0x3ffff;
        const comp = sf < 2 ? (v >>> 14) & 0x3ff : sf === 2 ? (v >>> 18) & 0x3fff : (v >>> 22) + (src[o + 4] << 10);
        let s = o + hl;
        const e = s + comp;
        if (lt === 2) { const [h, used] = readHuff(src, s); huff = h; s += used; } else if (!huff) err('literals reuse a Huffman table that was never given.');
        lits = new Uint8Array(regen);
        if (sf === 0) huffStream(huff!, src, s, e, lits, 0, regen);
        else {
          const z1 = dv.getUint16(s, true), z2 = dv.getUint16(s + 2, true), z3 = dv.getUint16(s + 4, true), seg = (regen + 3) >> 2;
          let a = s + 6;
          [z1, z2, z3, e - s - 6 - z1 - z2 - z3].forEach((z, i) => { huffStream(huff!, src, a, a + z, lits, i * seg, i < 3 ? seg : regen - 3 * seg); a += z; });
        }
        q = e;
      }
      // sequences
      let nSeq = src[q];
      if (nSeq === 0) q += 1;
      else if (nSeq < 128) q += 1;
      else if (nSeq < 255) { nSeq = ((nSeq - 128) << 8) + src[q + 1]; q += 2; }
      else { nSeq = src[q + 1] + (src[q + 2] << 8) + 0x7f00; q += 3; }
      let li = 0;
      if (nSeq) {
        const modes = src[q++];
        const table = (mode: number, def: Fse, prev: Fse | null, maxLog: number, maxSym: number): Fse => {
          if (mode === 0) return def;
          if (mode === 1) return rleFse(src[q++]);
          if (mode === 2) { const [t, used] = readFse(src, q, maxLog, maxSym); q += used; return t; }
          return prev ?? err('a sequence table repeated before it was given.');
        };
        llT = table(modes >> 6, LL_DEF, llT, 9, 35); ofT = table((modes >> 4) & 3, OF_DEF, ofT, 8, 31); mlT = table((modes >> 2) & 3, ML_DEF, mlT, 9, 52);
        const br = new Back(src, q, end);
        let sl = br.read(llT.log), so = br.read(ofT.log), sm = br.read(mlT.log);
        for (let i = 0; i < nSeq; i++) {
          const oc = ofT.sym[so], mc = mlT.sym[sm], lc = llT.sym[sl];
          const ofv = 2 ** oc + br.read(oc), ml = ML_BASE[mc] + br.read(ML_BITS[mc]), ll = LL_BASE[lc] + br.read(LL_BITS[lc]);
          let off: number;
          if (ofv > 3) { off = ofv - 3; rep[2] = rep[1]; rep[1] = rep[0]; rep[0] = off; }
          else {
            const k = ofv + (ll === 0 ? 1 : 0);
            if (k === 1) off = rep[0];
            else if (k === 2) { off = rep[1]; rep[1] = rep[0]; rep[0] = off; }
            else if (k === 3) { off = rep[2]; rep[2] = rep[1]; rep[1] = rep[0]; rep[0] = off; }
            else { off = rep[0] - 1; rep[2] = rep[1]; rep[1] = rep[0]; rep[0] = off; }
          }
          room(ll + ml);
          out.set(lits.subarray(li, li + ll), p); p += ll; li += ll;
          if (!off || off > p) err('a match reaching before the start.');
          for (let k = 0; k < ml; k++, p++) out[p] = out[p - off];
          if (i < nSeq - 1) { sl = llT.base[sl] + br.read(llT.nb[sl]); sm = mlT.base[sm] + br.read(mlT.nb[sm]); so = ofT.base[so] + br.read(ofT.nb[so]); }
        }
      }
      room(lits.length - li); out.set(lits.subarray(li), p); p += lits.length - li;
      o = end;
    }
    if (check) o += 4;
  }
  return out.subarray(0, p);
}
