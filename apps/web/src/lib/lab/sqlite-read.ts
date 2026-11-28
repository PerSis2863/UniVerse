// Reading a SQLite database's tables (M579, for ROS 2's .db3 bags): our own reader from the published SQLite file
// format: the header, table B-trees (interior and leaf pages), overflow pages, varints and records. Read only; no SQL,
// no indexes, no WAL file (a bag closed by ROS has none left).

const err = (m: string): never => { throw new Error(`SQLite: ${m}`); };
export type Cellv = number | string | Uint8Array | null;

export class SqliteFile {
  private page: number; private usable: number; private dv: DataView;
  constructor(private u: Uint8Array) {
    if (new TextDecoder().decode(u.subarray(0, 15)) !== 'SQLite format 3') err('not a SQLite file.');
    if (u.length < 512) err('the file is too short.');
    this.dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const ps = this.dv.getUint16(16); this.page = ps === 1 ? 65536 : ps; this.usable = this.page - u[20];
    if (this.dv.getUint32(56) > 1) err('only UTF-8 databases are read.');
  }
  private varint(o: number): [number, number] {
    let v = 0;
    for (let i = 0; i < 8; i++) { const b = this.u[o + i]; v = v * 128 + (b & 127); if (b < 128) return [v, i + 1]; }
    return [v * 256 + this.u[o + 8], 9];
  }
  /** Every row of the table whose B-tree starts at `root`: [rowid, payload bytes]. */
  private *rows(root: number): Generator<[number, Uint8Array]> {
    const stack = [root], seen = new Set<number>();
    while (stack.length) {
      const pg = stack.pop()!;
      if (seen.has(pg) || pg < 1 || (pg - 1) * this.page >= this.u.length) err('a broken page link.');
      seen.add(pg);
      const base = (pg - 1) * this.page, h = base + (pg === 1 ? 100 : 0), type = this.u[h], n = this.dv.getUint16(h + 3);
      if (type === 0x05) {
        const kids: number[] = [];
        for (let i = 0; i < n; i++) kids.push(this.dv.getUint32(base + this.dv.getUint16(h + 12 + 2 * i)));
        kids.push(this.dv.getUint32(h + 8));
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]); // left to right
      } else if (type === 0x0d) {
        for (let i = 0; i < n; i++) {
          let o = base + this.dv.getUint16(h + 8 + 2 * i);
          const [P, a] = this.varint(o); o += a;
          const [rowid, b] = this.varint(o); o += b;
          yield [rowid, this.payload(o, P)];
        }
      } else err(`an unexpected page type ${type}.`);
    }
  }
  private payload(o: number, P: number): Uint8Array {
    const U = this.usable, X = U - 35;
    if (P <= X) return this.u.subarray(o, o + P);
    const M = Math.floor(((U - 12) * 32) / 255) - 23, K = M + ((P - M) % (U - 4)), local = K <= X ? K : M, out = new Uint8Array(P);
    out.set(this.u.subarray(o, o + local));
    let at = local, next = this.dv.getUint32(o + local);
    while (at < P) {
      if (!next) err('an overflow chain ends early.');
      const b = (next - 1) * this.page, take = Math.min(U - 4, P - at);
      out.set(this.u.subarray(b + 4, b + 4 + take), at); at += take; next = this.dv.getUint32(b);
    }
    return out;
  }
  private record(p: Uint8Array): Cellv[] {
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength), types: number[] = [];
    const vi = (o: number): [number, number] => { let v = 0; for (let i = 0; i < 8; i++) { const b = p[o + i]; v = v * 128 + (b & 127); if (b < 128) return [v, i + 1]; } return [v * 256 + p[o + 8], 9]; };
    const [hs, a] = vi(0);
    for (let o = a; o < hs;) { const [t, k] = vi(o); types.push(t); o += k; }
    let o = hs;
    return types.map((t) => {
      if (t === 0) return null; if (t === 8) return 0; if (t === 9) return 1;
      if (t >= 1 && t <= 6) { const n = [0, 1, 2, 3, 4, 6, 8][t]; let v = 0; for (let i = 0; i < n; i++) v = v * 256 + p[o + i]; if (p[o] & 0x80) v -= 2 ** (8 * n); o += n; return v; }
      if (t === 7) { const v = dv.getFloat64(o); o += 8; return v; }
      const n = (t - (t & 1 ? 13 : 12)) / 2, b = p.subarray(o, o + n); o += n;
      return t & 1 ? new TextDecoder().decode(b) : b;
    });
  }
  /** The tables: name → { root page, column names }. */
  tables() {
    const out = new Map<string, { root: number; cols: string[] }>();
    for (const [, p] of this.rows(1)) {
      const [type, name, , root, sql] = this.record(p);
      if (type !== 'table' || typeof sql !== 'string') continue;
      const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
      const cols = body.split(/,(?![^(]*\))/).map((c) => c.trim()).filter((c) => !/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i.test(c)).map((c) => c.split(/\s+/)[0].replace(/^["`[]|["`\]]$/g, ''));
      out.set(String(name), { root: Number(root), cols });
    }
    return out;
  }
  /** A table's rows as objects by column name (an INTEGER PRIMARY KEY column takes the row id). */
  read(table: string): Record<string, Cellv>[] {
    const t = this.tables().get(table) ?? err(`no table '${table}'.`);
    const out: Record<string, Cellv>[] = [];
    for (const [rowid, p] of this.rows(t.root)) { const r = this.record(p), o: Record<string, Cellv> = {}; t.cols.forEach((c, i) => { o[c] = r[i] ?? (i === 0 ? rowid : null); }); out.push(o); }
    return out;
  }
}
