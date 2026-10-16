import type { ErrCode } from './formula';

// Values in a spreadsheet (Stage 5 · Office suite): numbers, text, TRUE/FALSE, empty, or an error;
// dates are numbers of days as in Excel (1 = 1 January 1900; 45000 ≈ March 2023). Import-free.

export interface Err { e: ErrCode }
export type V = number | string | boolean | null | Err;
/** A block of values (an area like A1:C3), row by row. */
export type M = V[][];

export const err = (e: ErrCode): Err => ({ e });
export const isErr = (v: unknown): v is Err => typeof v === 'object' && v !== null && 'e' in v;
export const isM = (v: unknown): v is M => Array.isArray(v);

// Excel's day 0 is 30 December 1899 (it counts 1900 as a leap year, so this lines up from March 1900).
const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;
/** A date's day number (Excel's serial). */
export const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - EPOCH) / DAY;
/** A date's day number from a JavaScript time (in UTC), with the time of day as a fraction. */
export const serialOf = (ms: number) => (ms - EPOCH) / DAY;
/** A day number back to a UTC date. */
export const dateOf = (n: number) => new Date(EPOCH + Math.round(n * DAY));

/** Text as a number where Excel would read one ("1,200", "50%", "$3", "1e3"); null if not. */
export function numberFrom(s: string): number | null {
  const t = s.trim().replace(/^[$€£₹¥]\s?|\s?[$€£₹¥]$/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
  if (!t) return null;
  const pct = t.endsWith('%');
  const body = pct ? t.slice(0, -1).trim() : t;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(body)) return null;
  const n = Number(body);
  return Number.isFinite(n) ? (pct ? n / 100 : n) : null;
}

/** A value as a number for arithmetic: empty is 0, TRUE is 1, text that reads as a number counts. */
export function toNum(v: V): number | Err {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const n = numberFrom(v);
  if (n != null) return n;
  const d = dateFrom(v);
  return d != null ? d : err('#VALUE!');
}
export function toText(v: V): string | Err {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return numText(v);
  if (isErr(v)) return v;
  return v;
}
export function toBool(v: V): boolean | Err {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isErr(v)) return v;
  const u = v.trim().toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  return err('#VALUE!');
}

/** A number as General format shows it: up to 10 significant digits, no trailing zeros. */
export function numText(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e11 || a < 1e-9)) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E');
  return String(Number(n.toPrecision(10)));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Text as a date's day number ("2026-10-16", "16/10/2026", "16 Oct 2026", "Oct 16, 2026", with an
 *  optional time "14:30"); day-first for d/m/y unless the first number can't be a day... month. */
export function dateFrom(s: string, dayFirst = true): number | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let rest = '';
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/.exec(t);
  if (x) { y = +x[1]; m = +x[2]; d = +x[3]; rest = x[4] ?? ''; }
  else if ((x = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})(?:\s+(.*))?$/.exec(t))) {
    let a = +x[1], b = +x[2];
    if (!dayFirst || b > 12) [a, b] = [b, a];
    if (b > 12 && a <= 12) [a, b] = [b, a];
    d = a; m = b; y = +x[3]; if (y < 100) y += 2000; rest = x[4] ?? '';
  } else if ((x = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-,]+(\d{4})(?:\s+(.*))?$/.exec(t))) {
    d = +x[1]; m = MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1; y = +x[3]; rest = x[4] ?? '';
  } else if ((x = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?:\s+(.*))?$/.exec(t))) {
    m = MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1; d = +x[2]; y = +x[3]; rest = x[4] ?? '';
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 9999) return null;
  const n = serial(y, m, d);
  if (dateOf(n).getUTCDate() !== d) return null;
  if (!rest) return n;
  const time = timeFrom(rest);
  return time == null ? null : n + time;
}
/** "14:30", "2:30 pm", "14:30:15" as a fraction of a day; null if not a time. */
export function timeFrom(s: string): number | null {
  const x = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!x) return null;
  let h = +x[1];
  const mi = +x[2], se = +(x[3] ?? 0);
  if (x[4]) { if (h < 1 || h > 12) return null; h = (h % 12) + (/pm/i.test(x[4]) ? 12 : 0); }
  if (h > 23 || mi > 59 || se > 59) return null;
  return (h * 3600 + mi * 60 + se) / 86400;
}

/** Comparison as Excel does it: numbers < text < booleans; text ignores case. */
export function compare(a: V, b: V): number {
  const rank = (v: V) => (v === null ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 4);
  let x = a, y = b;
  if (x === null) x = typeof y === 'string' ? '' : typeof y === 'boolean' ? false : 0;
  if (y === null) y = typeof x === 'string' ? '' : typeof x === 'boolean' ? false : 0;
  const rx = rank(x), ry = rank(y);
  if (rx !== ry) return rx - ry;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  if (typeof x === 'string' && typeof y === 'string') { const p = x.toLowerCase(), q = y.toLowerCase(); return p < q ? -1 : p > q ? 1 : 0; }
  if (typeof x === 'boolean' && typeof y === 'boolean') return Number(x) - Number(y);
  return 0;
}

/** What a cell's typed text means: a number, TRUE/FALSE, an error code, or text. Dates and
 *  percentages come back with the format to show them in. */
export function readInput(raw: string): { v: V; fmt?: 'percent' | 'date' | 'datetime' | 'time' | 'currency'; cur?: string } {
  const t = raw.trim();
  if (!t) return { v: null };
  if (raw.startsWith("'")) return { v: raw.slice(1) };
  const u = t.toUpperCase();
  if (u === 'TRUE' || u === 'FALSE') return { v: u === 'TRUE' };
  const n = numberFrom(t);
  if (n != null) {
    const cur = /^[$€£₹¥]|[$€£₹¥]$/.exec(t)?.[0];
    return { v: n, ...(t.endsWith('%') ? { fmt: 'percent' as const } : cur ? { fmt: 'currency' as const, cur } : {}) };
  }
  const time = timeFrom(t);
  if (time != null) return { v: time, fmt: 'time' };
  const d = dateFrom(t);
  if (d != null) return { v: d, fmt: Number.isInteger(d) ? 'date' : 'datetime' };
  return { v: raw };
}
