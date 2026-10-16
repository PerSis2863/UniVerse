// Cell addresses for spreadsheets (Stage 5 · Office suite): "A1" style, as Excel writes them.
// Rows and columns are counted from 0 inside the app; "A1" is row 0, column 0. Import-free.

/** The most rows and columns a sheet can have (a live sheet's size is capped at ~512 KB anyway). */
export const MAX_ROWS = 10_000;
export const MAX_COLS = 260; // A…IZ

export interface Ref { r: number; c: number; absR?: boolean; absC?: boolean }
export interface Area { r1: number; c1: number; r2: number; c2: number }

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** A → 0, AA → 26; -1 for anything else. */
export function colIndex(name: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(name)) return -1;
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** "B3" for row 2, column 1 (with $ for absolute parts when asked). */
export function addr(r: number, c: number, absR = false, absC = false): string {
  return `${absC ? '$' : ''}${colName(c)}${absR ? '$' : ''}${r + 1}`;
}
export const refText = (x: Ref) => addr(x.r, x.c, x.absR, x.absC);

/** "$B$3" → { r: 2, c: 1, absR, absC }; null when it isn't an address on the sheet. */
export function parseAddr(s: string): Ref | null {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,6})$/.exec(s.trim());
  if (!m) return null;
  const c = colIndex(m[2]), r = Number(m[4]) - 1;
  if (c < 0 || c >= MAX_COLS || r < 0 || r >= MAX_ROWS) return null;
  return { r, c, ...(m[3] ? { absR: true } : {}), ...(m[1] ? { absC: true } : {}) };
}

/** "A1:C3" (either order) → its area; a single address is a 1×1 area. */
export function parseArea(s: string): Area | null {
  const [a, b = a] = s.split(':');
  const x = parseAddr(a), y = parseAddr(b);
  if (!x || !y) return null;
  return norm({ r1: x.r, c1: x.c, r2: y.r, c2: y.c });
}
export const norm = (a: Area): Area => ({ r1: Math.min(a.r1, a.r2), c1: Math.min(a.c1, a.c2), r2: Math.max(a.r1, a.r2), c2: Math.max(a.c1, a.c2) });
export const areaText = (a: Area) => (a.r1 === a.r2 && a.c1 === a.c2 ? addr(a.r1, a.c1) : `${addr(a.r1, a.c1)}:${addr(a.r2, a.c2)}`);
export const inArea = (a: Area, r: number, c: number) => r >= a.r1 && r <= a.r2 && c >= a.c1 && c <= a.c2;
export const areaSize = (a: Area) => (a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1);

/** A cell's key in the sheet's map: its plain address ("B3"). */
export const keyOf = (r: number, c: number) => addr(r, c);
/** A key back to its row and column. */
export function cellOf(key: string): { r: number; c: number } | null {
  const x = parseAddr(key);
  return x ? { r: x.r, c: x.c } : null;
}

/** A sheet's name as a formula writes it: quoted when it has spaces or symbols ('My sheet'!A1). */
export function sheetPrefix(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !parseAddr(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`;
}
