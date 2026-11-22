import { LabError } from './parse';

// UniVerse Lab's reader for old Excel files (.xls, Excel 97–2003; M387): our own, from Microsoft's published formats.
// The file is a compound document (a small file system: [MS-CFB]); its "Workbook" stream holds BIFF8 records
// ([MS-XLS]): shared strings, sheet positions, then each sheet's cells (numbers, text, formulas' saved results).

const ENDS = 0xfffffffe;

/** One stream of a compound file, by name ("Workbook" or "Book"). */
function stream(bytes: Uint8Array, wanted: string[]): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (bytes.length < 512 || sig.some((b, i) => bytes[i] !== b)) throw new LabError('That isn’t an old Excel file (.xls).');
  const secSize = 1 << dv.getUint16(30, true), miniSize = 1 << dv.getUint16(32, true);
  const dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true), miniFatStart = dv.getUint32(60, true);
  const difatStart = dv.getUint32(68, true), difatCount = dv.getUint32(72, true);
  const sector = (n: number) => { const at = (n + 1) * secSize; if (at + secSize > bytes.length) throw new LabError('That .xls file is cut short.'); return bytes.subarray(at, at + secSize); };
  // The FAT's sectors: 109 listed in the header, then chained DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const s = dv.getUint32(76 + i * 4, true); if (s < 0xfffffffa) fatSectors.push(s); }
  for (let d = difatStart, k = 0; d < 0xfffffffa && k < difatCount; k++) {
    const sd = new DataView(sector(d).buffer, sector(d).byteOffset, secSize), per = secSize / 4 - 1;
    for (let i = 0; i < per; i++) { const s = sd.getUint32(i * 4, true); if (s < 0xfffffffa) fatSectors.push(s); }
    d = sd.getUint32(per * 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSectors) { const b = sector(s), sd = new DataView(b.buffer, b.byteOffset, secSize); for (let i = 0; i < secSize / 4; i++) fat.push(sd.getUint32(i * 4, true)); }
  const chain = (start: number, table: number[], max = 1e6) => { const out: number[] = []; for (let s = start; s !== ENDS && s < table.length && out.length < max; s = table[s]) out.push(s); return out; };
  const join = (parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
  const dir = join(chain(dirStart, fat).map(sector));
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries = Array.from({ length: Math.floor(dir.length / 128) }, (_, i) => {
    const o = i * 128, len = Math.max(0, ddv.getUint16(o + 64, true) - 2);
    const name = String.fromCharCode(...Array.from({ length: len / 2 }, (_, k) => ddv.getUint16(o + k * 2, true)));
    return { name, type: dir[o + 66], start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true) };
  });
  const root = entries.find((e) => e.type === 5);
  const entry = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!entry) throw new LabError('That .xls file has no workbook in it (it may be another kind of Office file).');
  if (entry.size >= cutoff || !root) return join(chain(entry.start, fat).map(sector)).subarray(0, entry.size);
  // Small streams live in the mini stream, in 64-byte pieces with their own table.
  const miniFat: number[] = [];
  for (const s of chain(miniFatStart, fat)) { const b = sector(s), sd = new DataView(b.buffer, b.byteOffset, secSize); for (let i = 0; i < secSize / 4; i++) miniFat.push(sd.getUint32(i * 4, true)); }
  const mini = join(chain(root.start, fat).map(sector));
  return join(chain(entry.start, miniFat).map((m) => mini.subarray(m * miniSize, (m + 1) * miniSize))).subarray(0, entry.size);
}

interface Rec { type: number; data: Uint8Array; at: number }
function records(b: Uint8Array, from = 0): Rec[] {
  const out: Rec[] = [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let o = from; o + 4 <= b.length;) {
    const type = dv.getUint16(o, true), len = dv.getUint16(o + 2, true);
    out.push({ type, data: b.subarray(o + 4, o + 4 + len), at: o });
    o += 4 + len;
    if (type === 0x000a && from > 0) break; // a sheet's EOF
  }
  return out;
}
const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const f64 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset + o, 8).getFloat64(0, true);
/** An RK number: a 30-bit whole number or the top of a double, maybe divided by 100. */
function rk(v: number): number {
  let x: number;
  if (v & 2) x = (v | 0) >> 2;
  else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, v & 0xfffffffc, true); x = b.getFloat64(0, true); }
  return v & 1 ? x / 100 : x;
}

/** A reader over a record and its CONTINUE records (shared strings cross them; text restarts with a flags byte). */
class Pieces {
  private k = 0; private o = 0;
  constructor(private parts: Uint8Array[]) {}
  private here() { while (this.k < this.parts.length && this.o >= this.parts[this.k].length) { this.k++; this.o = 0; } return this.parts[this.k]; }
  byte() { const p = this.here(); if (!p) throw new LabError('The shared text of that .xls file is cut short.'); return p[this.o++]; }
  u16() { return this.byte() | (this.byte() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n: number) { for (let i = 0; i < n; i++) this.byte(); }
  /** n characters, 8-bit or 16-bit, switching when a CONTINUE record starts (its first byte is new flags). */
  chars(n: number, wide: boolean): string {
    let s = '';
    for (let i = 0; i < n; i++) {
      if (this.o >= (this.parts[this.k]?.length ?? 0) && this.k + 1 < this.parts.length) { this.k++; this.o = 0; wide = (this.byte() & 1) === 1; }
      s += String.fromCharCode(wide ? this.u16() : this.byte());
    }
    return s;
  }
}
function unicode(p: Pieces): string {
  const n = p.u16(), flags = p.byte(), wide = (flags & 1) === 1;
  const runs = flags & 8 ? p.u16() : 0, ext = flags & 4 ? p.u32() : 0;
  const s = p.chars(n, wide);
  p.skip(runs * 4 + ext);
  return s;
}
/** A short string inside one record: byte length (BOUNDSHEET) or 16-bit length (LABEL, STRING). */
function inline(d: Uint8Array, o: number, short: boolean): string {
  const n = short ? d[o] : u16(d, o), at = o + (short ? 1 : 2), wide = (d[at] & 1) === 1;
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(wide ? u16(d, at + 1 + i * 2) : d[at + 1 + i]);
  return s;
}

export interface XlsSheet { name: string; rows: string[][] }
/** Every sheet of an .xls workbook as rows of text cells (numbers written in full). */
export function readXls(bytes: Uint8Array): XlsSheet[] {
  const wb = stream(bytes, ['Workbook', 'Book']);
  const top = records(wb);
  if (!top.length || top[0].type !== 0x0809 || u16(top[0].data, 0) !== 0x0600) throw new LabError('That .xls file is older than Excel 97: open it in Excel and save it as .xlsx.');
  const sheets: { name: string; at: number }[] = [];
  let sst: string[] = [];
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    if (r.type === 0x000a) break;
    if (r.type === 0x0085 && r.data[5] === 0) sheets.push({ at: u32(r.data, 0), name: inline(r.data, 6, true) });
    if (r.type === 0x00fc) {
      const parts = [r.data.subarray(8)];
      for (let j = i + 1; j < top.length && top[j].type === 0x003c; j++) parts.push(top[j].data);
      const p = new Pieces(parts), n = u32(r.data, 4);
      sst = Array.from({ length: n }, () => unicode(p));
    }
  }
  return sheets.map(({ name, at }) => {
    const rows: string[][] = [];
    const set = (r: number, c: number, v: string) => { (rows[r] ??= [])[c] = v; };
    const num = (x: number) => String(x);
    const recs = records(wb, at);
    for (let i = 0; i < recs.length; i++) {
      const { type, data: d } = recs[i];
      const r = u16(d, 0), c = u16(d, 2);
      if (type === 0x00fd) set(r, c, sst[u32(d, 6)] ?? '');
      else if (type === 0x0203) set(r, c, num(f64(d, 6)));
      else if (type === 0x027e) set(r, c, num(rk(u32(d, 6))));
      else if (type === 0x00bd) { const last = u16(d, d.length - 2); for (let k = 0; k <= last - c; k++) set(r, c + k, num(rk(u32(d, 4 + k * 6 + 2)))); }
      else if (type === 0x0204) set(r, c, inline(d, 6, false));
      else if (type === 0x0205) set(r, c, d[7] ? '' : d[6] ? 'true' : 'false');
      else if (type === 0x0006) {
        // A formula: its saved result (a number, or a marker with the text in the next STRING record).
        if (u16(d, 12) !== 0xffff) set(r, c, num(f64(d, 6)));
        else if (d[6] === 0 && recs[i + 1]?.type === 0x0207) set(r, c, inline(recs[i + 1].data, 0, false));
        else if (d[6] === 1) set(r, c, d[8] ? 'true' : 'false');
      }
    }
    return { name, rows: Array.from(rows, (row) => Array.from(row ?? [], (x) => x ?? '')) };
  });
}
