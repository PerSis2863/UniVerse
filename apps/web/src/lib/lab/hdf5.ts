import { unzlibSync } from 'fflate';
import { LabError } from './parse';

// Hyperion's HDF5 reader (M388), for MATLAB 7.3 .mat files (an HDF5 file after a 512-byte MATLAB header). Our
// own, from the HDF5 file format specification: superblocks 0–3, object headers 1 and 2 (with continuations),
// groups as symbol tables (v1 B-trees, local heaps) or link messages, datasets compact, contiguous or chunked (v1
// B-tree index; deflate, shuffle and Fletcher-32 filters), attributes, fixed-point, floating-point, string,
// compound (MATLAB's complex numbers) and reference types.

export interface H5Type { cls: number; size: number; signed: boolean; members?: { name: string; offset: number; type: H5Type }[] }
export interface H5Dataset { kind: 'dataset'; name: string; dims: number[]; type: H5Type; attrs: Map<string, H5Value>; read: () => Uint8Array }
export interface H5Group { kind: 'group'; name: string; attrs: Map<string, H5Value>; children: () => H5Object[] }
export type H5Object = H5Dataset | H5Group;
/** An attribute's value: numbers, text, or raw bytes for other types. */
export type H5Value = number[] | string;

const SIG = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
const UNDEF = Number.MAX_SAFE_INTEGER;

export class H5File {
  private dv: DataView;
  private base = 0;
  private so = 8; // size of offsets
  private sl = 8; // size of lengths
  private rootAddr = 0;
  private headers = new Map<number, { type: number; data: Uint8Array }[]>();
  constructor(private b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // The superblock sits at 0, 512, 1024, 2048… (MATLAB puts its own header first).
    let at = -1;
    for (let o = 0; o + 8 <= b.length; o = o ? o * 2 : 512) if (SIG.every((x, i) => b[o + i] === x)) { at = o; break; }
    if (at < 0) throw new LabError('That isn’t an HDF5 file (a MATLAB 7.3 .mat file is one).');
    const v = b[at + 8];
    if (v === 0 || v === 1) {
      this.so = b[at + 13]; this.sl = b[at + 14];
      let p = at + 24 + (v === 1 ? 4 : 0);
      this.base = this.addr(p); p += this.so * 4; // base, free space, end of file, driver info
      p += this.so; // root entry: link name offset
      this.rootAddr = this.addr(p);
    } else if (v === 2 || v === 3) {
      this.so = b[at + 9]; this.sl = b[at + 10];
      const p = at + 12;
      this.base = this.addr(p);
      this.rootAddr = this.addr(p + this.so * 3);
    } else throw new LabError(`HDF5 superblock version ${v} isn’t supported.`);
    // As the HDF5 library does: addresses count from where the superblock really is (after MATLAB's header).
    this.base = at;
  }
  /** An address field (relative to the base); undefined addresses (all ones) come back as UNDEF. */
  private addr(p: number): number {
    let v = 0, all = true;
    for (let i = this.so - 1; i >= 0; i--) { const x = this.b[p + i]; if (x !== 0xff) all = false; v = v * 256 + x; }
    return all ? UNDEF : v;
  }
  private len(p: number, n = this.sl): number { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + this.b[p + i]; return v; }
  private at(a: number) { return this.base + a; }
  private str(p: number, max = 1 << 16) { let s = ''; for (let i = p; i < p + max && this.b[i]; i++) s += String.fromCharCode(this.b[i]); return s; }

  root(): H5Group { return this.object(this.rootAddr, '/') as H5Group; }

  /** The messages of an object header (versions 1 and 2, following continuation blocks). */
  private messages(addr: number): { type: number; data: Uint8Array }[] {
    const known = this.headers.get(addr);
    if (known) return known;
    const out: { type: number; data: Uint8Array }[] = [];
    const p = this.at(addr), b = this.b;
    const blocks: [number, number, boolean][] = [];
    if (b[p] === 1) {
      const size = this.dv.getUint32(p + 8, true);
      blocks.push([p + 16, size, false]);
    } else if (b[p] === 0x4f && b[p + 1] === 0x48 && b[p + 2] === 0x44 && b[p + 3] === 0x52) {
      const flags = b[p + 5];
      let q = p + 6;
      if (flags & 0x20) q += 16;
      if (flags & 0x10) q += 4;
      const w = 1 << (flags & 3), size = this.len(q, w);
      blocks.push([q + w, size, true]);
    } else throw new LabError('That HDF5 file has an object header Hyperion can’t read.');
    for (let k = 0; k < blocks.length; k++) {
      const [start, size, v2] = blocks[k];
      const creation = v2 && (this.b[this.at(addr) + 5] & 0x04) !== 0;
      let q = start;
      const end = start + size;
      while (q + (v2 ? 4 : 8) <= end) {
        let type: number, msize: number;
        if (v2) { type = b[q]; msize = this.dv.getUint16(q + 1, true); q += 4 + (creation ? 2 : 0); }
        else { type = this.dv.getUint16(q, true); msize = this.dv.getUint16(q + 2, true); q += 8; }
        if (q + msize > b.length) break;
        const data = b.subarray(q, q + msize);
        if (type === 0x10) {
          // A continuation: more messages elsewhere (version 2 blocks start with "OCHK").
          const ca = this.at(this.addr(q)), cl = this.len(q + this.so);
          blocks.push(v2 ? [ca + 4, cl - 8, true] : [ca, cl, false]);
        } else if (type !== 0) out.push({ type, data });
        q += msize;
      }
    }
    this.headers.set(addr, out);
    return out;
  }

  private object(addr: number, name: string): H5Object {
    const msgs = this.messages(addr);
    const attrs = new Map<string, H5Value>();
    for (const m of msgs) if (m.type === 0x0c) { try { const [n, v] = this.attribute(m.data); attrs.set(n, v); } catch { /* an attribute of a kind we don't read */ } }
    const layout = msgs.find((m) => m.type === 0x08);
    if (!layout) return { kind: 'group', name, attrs, children: () => this.children(msgs) };
    const space = msgs.find((m) => m.type === 0x01), dtype = msgs.find((m) => m.type === 0x03);
    if (!space || !dtype) throw new LabError(`The HDF5 dataset “${name}” is missing its shape or type.`);
    const dims = this.dataspace(space.data), type = this.datatype(dtype.data, 0);
    const filters = msgs.find((m) => m.type === 0x0b);
    return { kind: 'dataset', name, dims, type, attrs, read: () => this.data(layout.data, dims, type.size, filters ? this.filters(filters.data) : []) };
  }

  private children(msgs: { type: number; data: Uint8Array }[]): H5Object[] {
    const out: H5Object[] = [];
    const table = msgs.find((m) => m.type === 0x11);
    if (table) {
      const d = table.data, tree = this.addr(d.byteOffset - this.b.byteOffset), heap = this.addr(d.byteOffset - this.b.byteOffset + this.so);
      const hp = this.at(heap);
      if (this.str(hp, 4) !== 'HEAP') throw new LabError('A group’s name heap is damaged.');
      const dataSeg = this.at(this.addr(hp + 8 + this.sl * 2));
      for (const [nameOff, objAddr] of this.groupEntries(tree)) out.push(this.object(objAddr, this.str(dataSeg + nameOff)));
      return out;
    }
    for (const m of msgs.filter((x) => x.type === 0x06)) {
      const d = m.data, flags = d[1];
      let q = 2;
      const ltype = flags & 0x08 ? d[q++] : 0;
      if (flags & 0x04) q += 8;
      if (flags & 0x10) q += 1;
      const w = 1 << (flags & 3);
      let n = 0; for (let i = w - 1; i >= 0; i--) n = n * 256 + d[q + i];
      q += w;
      const name = new TextDecoder().decode(d.subarray(q, q + n)); q += n;
      if (ltype !== 0) continue; // soft and external links are skipped
      out.push(this.object(this.addr(d.byteOffset - this.b.byteOffset + q), name));
    }
    // Link info: links kept in a fractal heap (groups of more than 8 in the newest layout) instead of in the header.
    const info = msgs.find((m) => m.type === 0x02);
    if (info && this.addr(info.data.byteOffset - this.b.byteOffset + 2 + (info.data[1] & 1 ? 8 : 0)) !== UNDEF) throw new LabError('That HDF5 file keeps a big group in a form Hyperion can’t read yet (dense link storage): save it from MATLAB with save -v7.3, or as -v7.');
    return out;
  }

  /** Group B-tree (type 0): every symbol's name offset and object address. */
  private groupEntries(tree: number): [number, number][] {
    const p = this.at(tree), out: [number, number][] = [];
    if (this.str(p, 4) !== 'TREE') throw new LabError('A group’s index is damaged.');
    const level = this.b[p + 5], used = this.dv.getUint16(p + 6, true);
    let q = p + 8 + this.so * 2;
    for (let i = 0; i < used; i++) {
      q += this.sl; // key
      const child = this.addr(q); q += this.so;
      if (level > 0) out.push(...this.groupEntries(child));
      else {
        const s = this.at(child);
        if (this.str(s, 4) !== 'SNOD') throw new LabError('A group’s symbol table is damaged.');
        const n = this.dv.getUint16(s + 6, true);
        for (let k = 0; k < n; k++) { const e = s + 8 + k * (this.so * 2 + 24); out.push([this.len(e, this.so), this.addr(e + this.so)]); }
      }
    }
    return out;
  }

  private dataspace(d: Uint8Array): number[] {
    const v = d[0], rank = d[1];
    if (v === 2 && d[3] === 2) return []; // null dataspace
    const start = v === 1 ? 8 : 4;
    return Array.from({ length: rank }, (_, i) => { let x = 0; for (let k = this.sl - 1; k >= 0; k--) x = x * 256 + d[start + i * this.sl + k]; return x; });
  }

  private datatype(d: Uint8Array, o: number): H5Type {
    const cls = d[o] & 0x0f, bits = d[o + 1], size = d[o + 4] | (d[o + 5] << 8) | (d[o + 6] << 16) | (d[o + 7] << 24);
    const t: H5Type = { cls, size, signed: cls === 0 && (bits & 0x08) !== 0 };
    if (cls === 0 || cls === 1) { if (bits & 1) throw new LabError('Big-endian numbers in HDF5 files aren’t supported.'); }
    if (cls === 6) {
      const version = d[o] >> 4, n = (d[o + 1] | (d[o + 2] << 8));
      let q = o + 8;
      t.members = [];
      for (let i = 0; i < n; i++) {
        const nameStart = q;
        let name = ''; while (d[q]) name += String.fromCharCode(d[q++]);
        q++;
        if (version < 3) q = nameStart + Math.ceil((name.length + 1) / 8) * 8;
        let offset: number;
        if (version === 3) { const w = size < 256 ? 1 : size < 65536 ? 2 : size < 16777216 ? 3 : 4; offset = 0; for (let k = w - 1; k >= 0; k--) offset = offset * 256 + d[q + k]; q += w; }
        else { offset = d[q] | (d[q + 1] << 8) | (d[q + 2] << 16) | (d[q + 3] << 24); q += 4; }
        if (version === 1) q += 28;
        const mt = this.datatype(d, q);
        t.members.push({ name, offset, type: mt });
        q += 8 + this.typePropsSize(d, q);
      }
    }
    return t;
  }
  /** How many bytes of properties follow a datatype's 8-byte header. */
  private typePropsSize(d: Uint8Array, o: number): number {
    const cls = d[o] & 0x0f;
    if (cls === 0) return 4;
    if (cls === 1) return 12;
    if (cls === 3 || cls === 7) return 0;
    if (cls === 2) return 4;
    throw new LabError(`HDF5 type class ${cls} isn’t supported here.`);
  }

  private attribute(d: Uint8Array): [string, H5Value] {
    const v = d[0];
    const nameSize = d[2] | (d[3] << 8), typeSize = d[4] | (d[5] << 8), spaceSize = d[6] | (d[7] << 8);
    const pad = (n: number) => (v === 1 ? Math.ceil(n / 8) * 8 : n);
    let q = v === 3 ? 9 : 8;
    const name = new TextDecoder().decode(d.subarray(q, q + nameSize)).replace(/\0+$/, ''); q += pad(nameSize);
    const type = this.datatype(d, q); q += pad(typeSize);
    const dims = this.dataspace(d.subarray(q, q + spaceSize)); q += pad(spaceSize);
    const n = dims.reduce((s, x) => s * x, 1);
    const raw = d.subarray(q, q + n * type.size);
    if (type.cls === 3) return [name, new TextDecoder().decode(raw).replace(/\0[\s\S]*$/, '')];
    if (type.cls === 9) {
      // A variable-length string (h5py and the NWB tools write text this way): length, the global heap
      // collection's address and the object's index in it (M517). Only the first element is kept.
      if (n < 1) return [name, ''];
      const len = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0, true), col = this.at(this.addrIn(raw, 4)), idx = new DataView(raw.buffer, raw.byteOffset + 4 + this.so, 4).getUint32(0, true);
      return [name, this.heapObject(col, idx).subarray(0, len).reduce((t, c) => t + String.fromCharCode(c), '')];
    }
    return [name, numbers(raw, type)];
  }

  private addrIn(d: Uint8Array, p: number) { let v = 0; for (let i = this.so - 1; i >= 0; i--) v = v * 256 + d[p + i]; return v; }
  /** Object `idx` of a global heap collection ('GCOL'). */
  private heapObject(p: number, idx: number): Uint8Array {
    const b = this.b;
    if (String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]) !== 'GCOL') throw new LabError('A global heap is missing.');
    const end = p + this.len(p + 8);
    let q = p + 8 + this.sl;
    while (q + 8 + this.sl <= end) {
      const i = b[q] | (b[q + 1] << 8), size = this.len(q + 8);
      if (i === 0) break;
      if (i === idx) return b.subarray(q + 8 + this.sl, q + 8 + this.sl + size);
      q += 8 + this.sl + Math.ceil(size / 8) * 8;
    }
    throw new LabError('A global heap object is missing.');
  }

  private filters(d: Uint8Array): { id: number; values: number[] }[] {
    const v = d[0], n = d[1], out: { id: number; values: number[] }[] = [];
    let q = v === 1 ? 8 : 2;
    for (let i = 0; i < n; i++) {
      const id = d[q] | (d[q + 1] << 8);
      const nameLen = v === 1 || id >= 256 ? d[q + 2] | (d[q + 3] << 8) : 0;
      q += v === 1 || id >= 256 ? 4 : 2;
      q += 2; // flags
      const count = d[q] | (d[q + 1] << 8); q += 2;
      q += v === 1 ? Math.ceil(nameLen / 8) * 8 : nameLen;
      const values = Array.from({ length: count }, (_, k) => new DataView(d.buffer, d.byteOffset + q + k * 4, 4).getUint32(0, true));
      q += count * 4 + (v === 1 && count % 2 ? 4 : 0);
      out.push({ id, values });
    }
    return out;
  }

  /** A dataset's bytes in C order, every element `size` bytes. */
  private data(layout: Uint8Array, dims: number[], size: number, filters: { id: number; values: number[] }[]): Uint8Array {
    const n = dims.reduce((s, x) => s * x, 1), total = n * size;
    const v = layout[0];
    const lp = layout.byteOffset - this.b.byteOffset;
    if (v === 3 || v === 4) {
      const cls = layout[1];
      if (cls === 0) { const sz = layout[2] | (layout[3] << 8); return layout.subarray(4, 4 + sz); }
      if (cls === 1) { const a = this.addr(lp + 2); return a === UNDEF ? new Uint8Array(total) : this.b.subarray(this.at(a), this.at(a) + total); }
      if (cls === 2) {
        if (v === 4) throw new LabError('That HDF5 file stores chunks in a newer index Hyperion can’t read yet (save it from MATLAB with -v7.3 defaults, or as -v7).');
        const rank = layout[2] - 1, tree = this.addr(lp + 3), chunk = Array.from({ length: rank }, (_, i) => new DataView(layout.buffer, layout.byteOffset + 3 + this.so + i * 4, 4).getUint32(0, true));
        return this.chunked(tree, dims, chunk, size, filters);
      }
    } else if (v === 1 || v === 2) {
      const rank = layout[1], cls = layout[2];
      let q = 8;
      if (cls === 0) { q += rank * 4; const sz = new DataView(layout.buffer, layout.byteOffset + q, 4).getUint32(0, true); return layout.subarray(q + 4, q + 4 + sz); }
      const a = this.addr(lp + q); q += this.so;
      if (cls === 1) return a === UNDEF ? new Uint8Array(total) : this.b.subarray(this.at(a), this.at(a) + total);
      const chunk = Array.from({ length: rank - 1 }, (_, i) => new DataView(layout.buffer, layout.byteOffset + q + i * 4, 4).getUint32(0, true));
      return this.chunked(a, dims, chunk, size, filters);
    }
    throw new LabError(`HDF5 data layout version ${v} isn’t supported.`);
  }

  private chunked(tree: number, dims: number[], chunk: number[], size: number, filters: { id: number; values: number[] }[]): Uint8Array {
    const n = dims.reduce((s, x) => s * x, 1), out = new Uint8Array(n * size), rank = dims.length;
    if (tree === UNDEF) return out;
    const strides = dims.map((_, i) => dims.slice(i + 1).reduce((s, x) => s * x, 1));
    const cstrides = chunk.map((_, i) => chunk.slice(i + 1).reduce((s, x) => s * x, 1)), cn = chunk.reduce((s, x) => s * x, 1);
    const visit = (addr: number) => {
      const p = this.at(addr);
      if (this.str(p, 4) !== 'TREE') throw new LabError('A dataset’s chunk index is damaged.');
      const level = this.b[p + 5], used = this.dv.getUint16(p + 6, true);
      let q = p + 8 + this.so * 2;
      const keySize = 8 + (rank + 1) * 8;
      for (let i = 0; i < used; i++) {
        const csize = this.dv.getUint32(q, true), mask = this.dv.getUint32(q + 4, true);
        const offs = Array.from({ length: rank }, (_, k) => this.len(q + 8 + k * 8, 8));
        q += keySize;
        const child = this.addr(q); q += this.so;
        if (level > 0) { visit(child); continue; }
        let raw = this.b.subarray(this.at(child), this.at(child) + csize);
        // Filters run backwards on reading (the last applied is undone first); a set bit in the mask skips one.
        for (let f = filters.length - 1; f >= 0; f--) {
          if (mask & (1 << f)) continue;
          const { id } = filters[f];
          if (id === 1) { try { raw = unzlibSync(raw); } catch { throw new LabError('A compressed chunk of that HDF5 file couldn’t be opened.'); } }
          else if (id === 2) { const es = filters[f].values[0] ?? size, cnt = raw.length / es, o = new Uint8Array(raw.length); for (let e = 0; e < cnt; e++) for (let b2 = 0; b2 < es; b2++) o[e * es + b2] = raw[b2 * cnt + e]; raw = o; }
          else if (id === 3) raw = raw.subarray(0, raw.length - 4);
          else throw new LabError(`That HDF5 file uses a compression (filter ${id}) Hyperion can’t undo.`);
        }
        // Copy the chunk into place, element by element (edge chunks reach past the array: those parts are dropped).
        for (let e = 0; e < cn; e++) {
          let dst = 0, inside = true;
          for (let k = 0; k < rank; k++) { const x = offs[k] + Math.floor(e / cstrides[k]) % chunk[k]; if (x >= dims[k]) { inside = false; break; } dst += x * strides[k]; }
          if (inside) out.set(raw.subarray(e * size, (e + 1) * size), dst * size);
        }
      }
    };
    visit(tree);
    return out;
  }

  /** The object a reference points to (MATLAB's cells hold references). */
  deref(addr: number): H5Object { return this.object(addr, ''); }
  get offsetSize() { return this.so; }
}

/** Raw bytes of a numeric type as numbers. */
export function numbers(raw: Uint8Array, t: H5Type): number[] {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), out: number[] = [];
  const n = Math.floor(raw.length / t.size);
  for (let i = 0; i < n; i++) {
    const o = i * t.size;
    if (t.cls === 1) out.push(t.size === 4 ? dv.getFloat32(o, true) : dv.getFloat64(o, true));
    else if (t.cls === 0 || t.cls === 7) {
      if (t.size === 1) out.push(t.signed ? dv.getInt8(o) : dv.getUint8(o));
      else if (t.size === 2) out.push(t.signed ? dv.getInt16(o, true) : dv.getUint16(o, true));
      else if (t.size === 4) out.push(t.signed ? dv.getInt32(o, true) : dv.getUint32(o, true));
      else out.push(Number(t.signed ? dv.getBigInt64(o, true) : dv.getBigUint64(o, true)));
    } else throw new LabError(`HDF5 type class ${t.cls} isn’t numbers.`);
  }
  return out;
}
