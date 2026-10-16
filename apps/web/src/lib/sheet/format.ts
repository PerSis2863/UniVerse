import { dateOf, isErr, numText, type V } from './values';

// How spreadsheet cells look (Stage 5 · Office suite): the style a cell keeps (bold, colours,
// alignment, borders, number format…) and number formats as Excel writes them ("#,##0.00",
// "0%", "d mmm yyyy", "$#,##0;[Red]-$#,##0"). Import-free; tested in format.test.ts.

export type NumFmt = 'general' | 'number' | 'currency' | 'percent' | 'scientific' | 'date' | 'time' | 'datetime' | 'text' | 'custom';
export const NUM_FMTS: { value: NumFmt; label: string }[] = [
  { value: 'general', label: 'Automatic' }, { value: 'number', label: 'Number' }, { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' }, { value: 'scientific', label: 'Scientific' }, { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' }, { value: 'datetime', label: 'Date and time' }, { value: 'text', label: 'Plain text' },
];
export const CURRENCIES = ['$', '€', '£', '₹', '¥'] as const;

export interface Borders { t?: 1; r?: 1; b?: 1; l?: 1 }
export interface Style {
  b?: boolean; i?: boolean; u?: boolean; st?: boolean;
  /** Text and fill colours (#rrggbb). */
  color?: string; bg?: string;
  align?: 'left' | 'center' | 'right'; va?: 'top' | 'middle' | 'bottom'; wrap?: boolean;
  fmt?: NumFmt; dp?: number; cur?: string; code?: string;
  size?: number; font?: string; bd?: Borders;
}
export const STYLE_KEYS = ['b', 'i', 'u', 'st', 'color', 'bg', 'align', 'va', 'wrap', 'fmt', 'dp', 'cur', 'code', 'size', 'font', 'bd'] as const;
export const FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'] as const;

const HEX = /^#[0-9a-f]{6}$/i;
/** A style from untrusted JSON (a pasted or imported sheet, another person's edit). */
export function cleanStyle(x: unknown): Style | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  const s: Style = {};
  for (const k of ['b', 'i', 'u', 'st', 'wrap'] as const) if (o[k] === true) s[k] = true;
  for (const k of ['color', 'bg'] as const) if (typeof o[k] === 'string' && HEX.test(o[k] as string)) s[k] = (o[k] as string).toLowerCase();
  if (o.align === 'left' || o.align === 'center' || o.align === 'right') s.align = o.align;
  if (o.va === 'top' || o.va === 'middle' || o.va === 'bottom') s.va = o.va;
  if (typeof o.fmt === 'string' && (NUM_FMTS.some((f) => f.value === o.fmt) || o.fmt === 'custom')) s.fmt = o.fmt as NumFmt;
  if (typeof o.dp === 'number' && Number.isInteger(o.dp) && o.dp >= 0 && o.dp <= 10) s.dp = o.dp;
  if (typeof o.cur === 'string' && (CURRENCIES as readonly string[]).includes(o.cur)) s.cur = o.cur;
  if (typeof o.code === 'string' && o.code.length <= 80) s.code = o.code;
  if (typeof o.size === 'number' && o.size >= 6 && o.size <= 72) s.size = Math.round(o.size);
  if (typeof o.font === 'string' && (FONTS as readonly string[]).includes(o.font)) s.font = o.font;
  if (o.bd && typeof o.bd === 'object') {
    const b = o.bd as Record<string, unknown>, bd: Borders = {};
    for (const k of ['t', 'r', 'b', 'l'] as const) if (b[k]) bd[k] = 1;
    if (Object.keys(bd).length) s.bd = bd;
  }
  return Object.keys(s).length ? s : undefined;
}

/** The Excel format code a style's number format stands for. */
export function codeOf(s: Style | undefined): string | null {
  if (!s?.fmt || s.fmt === 'general' || s.fmt === 'text') return null;
  const dp = s.dp ?? (s.fmt === 'percent' ? 0 : 2);
  const dec = dp ? `.${'0'.repeat(dp)}` : '';
  switch (s.fmt) {
    case 'number': return `#,##0${dec}`;
    case 'currency': { const c = s.cur ?? '$'; return `${c}#,##0${dec};-${c}#,##0${dec}`; }
    case 'percent': return `0${dec}%`;
    case 'scientific': return `0${dec}E+00`;
    case 'date': return 'd mmm yyyy';
    case 'time': return 'hh:mm';
    case 'datetime': return 'd mmm yyyy hh:mm';
    case 'custom': return s.code ?? null;
  }
  return null;
}

/** What a cell shows: its value in its number format. */
export function display(v: V, s?: Style): string {
  if (v === null) return '';
  if (isErr(v)) return v.e;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  const code = codeOf(s);
  return code ? formatCode(v, code) : numText(v);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Splits a format code at unquoted semicolons (positive;negative;zero;text). */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (ch === '\\' && i + 1 < code.length) { cur += ch + code[++i]; continue; }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const isDateCode = (c: string) => /[dmyhs]/i.test(c.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '')) && !/[0#?]/.test(c.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '').replace(/s+\.0+/i, ''));

function dateCode(n: number, code: string): string {
  const d = dateOf(n);
  const frac = n - Math.floor(n);
  let secs = Math.round(frac * 86400);
  if (secs >= 86400) secs = 0;
  const H = Math.floor(secs / 3600), Mi = Math.floor((secs % 3600) / 60), S = secs % 60;
  const ampm = /AM\/PM|A\/P/i.test(code);
  const h12 = ((H + 11) % 12) + 1;
  let out = '';
  const src = code.replace(/\[[^\]]*\]/g, '');
  // "m" after an hour or before seconds means minutes.
  let lastWasHour = false;
  for (let i = 0; i < src.length;) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if (rest[0] === '"') { const end = rest.indexOf('"', 1); out += rest.slice(1, end < 0 ? undefined : end); i += end < 0 ? rest.length : end + 1; continue; }
    if (rest[0] === '\\') { out += rest[1] ?? ''; i += 2; continue; }
    if ((m = /^AM\/PM/i.exec(rest))) { out += H < 12 ? 'AM' : 'PM'; i += m[0].length; continue; }
    if ((m = /^A\/P/i.exec(rest))) { out += H < 12 ? 'A' : 'P'; i += m[0].length; continue; }
    if ((m = /^y{3,4}/i.exec(rest))) { out += String(d.getUTCFullYear()); i += m[0].length; lastWasHour = false; continue; }
    if ((m = /^y{1,2}/i.exec(rest))) { out += String(d.getUTCFullYear()).slice(-2); i += m[0].length; lastWasHour = false; continue; }
    if ((m = /^d{4,}/i.exec(rest))) { out += DAYS[d.getUTCDay()]; i += m[0].length; continue; }
    if ((m = /^d{3}/i.exec(rest))) { out += DAYS[d.getUTCDay()].slice(0, 3); i += 3; continue; }
    if ((m = /^d{1,2}/i.exec(rest))) { out += m[0].length === 2 ? String(d.getUTCDate()).padStart(2, '0') : String(d.getUTCDate()); i += m[0].length; continue; }
    if ((m = /^h{1,2}/i.exec(rest))) { const h = ampm ? h12 : H; out += m[0].length === 2 ? String(h).padStart(2, '0') : String(h); i += m[0].length; lastWasHour = true; continue; }
    if ((m = /^s{1,2}/i.exec(rest))) { out += m[0].length === 2 ? String(S).padStart(2, '0') : String(S); i += m[0].length; continue; }
    if ((m = /^m{1,5}/i.exec(rest))) {
      const minutes = lastWasHour || /^m{1,2}[^dmy"]*s/i.test(rest);
      const len = m[0].length;
      if (minutes && len <= 2) out += len === 2 ? String(Mi).padStart(2, '0') : String(Mi);
      else if (len >= 5) out += MONTHS[d.getUTCMonth()][0];
      else if (len === 4) out += MONTHS[d.getUTCMonth()];
      else if (len === 3) out += MONTHS[d.getUTCMonth()].slice(0, 3);
      else out += len === 2 ? String(d.getUTCMonth() + 1).padStart(2, '0') : String(d.getUTCMonth() + 1);
      i += len; lastWasHour = false; continue;
    }
    out += rest[0]; i++;
  }
  return out;
}

function groupThousands(int: string) { return int.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
/** Rounds half away from zero at dp places, as Excel does (1.005 → 1.01, not toFixed's 1.00). */
export function roundTo(x: number, dp: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Number(`${Math.round(Number(`${Math.abs(x)}e${dp}`))}e-${dp}`);
  return Number.isFinite(r) ? Math.sign(x) * r : Math.round(x * 10 ** dp) / 10 ** dp;
}

function numberCode(n: number, code: string): string {
  let c = code.replace(/\[[^\]]*\]/g, '');
  // Literal text kept aside so its characters aren't read as digits.
  const lits: string[] = [];
  c = c.replace(/"([^"]*)"|\\(.)/g, (_, a: string | undefined, b: string | undefined) => { lits.push(a ?? b ?? ''); return String.fromCharCode(0xe000 + lits.length - 1); });
  const pct = (c.match(/%/g) ?? []).length;
  let x = n * 100 ** pct;
  const sci = /E[+-]/i.exec(c);
  const body = /[0#?][0#?,.]*(?:E[+-]0+)?/i.exec(c);
  if (!body) return c.replace(/[\ue000-\uefff]/g, (k) => lits[k.charCodeAt(0) - 0xe000]) || numText(n);
  const spec = body[0];
  let out: string;
  if (sci) {
    const [mant] = spec.split(/E/i);
    const dp = (mant.split('.')[1] ?? '').length;
    const expDigits = (spec.split(/E[+-]/i)[1] ?? '0').length;
    const e = x === 0 ? 0 : Math.floor(Math.log10(Math.abs(x)));
    const m = x / 10 ** e;
    out = `${Math.abs(m).toFixed(dp)}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(expDigits, '0')}`;
  } else {
    // Commas after the last digit divide by 1000 each ("#,##0," shows thousands).
    const trailing = /,+$/.exec(spec.replace(/\.[0#?]*$/, ''))?.[0].length ?? 0;
    x /= 1000 ** trailing;
    const [intSpec, decSpec = ''] = spec.replace(/,+$/, '').split('.');
    const minDp = (decSpec.match(/0/g) ?? []).length, maxDp = decSpec.length;
    let [int, dec = ''] = roundTo(Math.abs(x), maxDp).toFixed(maxDp).split('.');
    // Optional digits (#) after the point are dropped when they're 0.
    while (dec.length > minDp && dec.endsWith('0')) dec = dec.slice(0, -1);
    const minInt = (intSpec.match(/0/g) ?? []).length;
    if (int === '0' && minInt === 0) int = '';
    int = int.padStart(minInt, '0');
    if (intSpec.includes(',')) int = groupThousands(int);
    out = spec.includes('.') ? `${int}.${dec}` : int;
  }
  const pre = c.slice(0, body.index), post = c.slice(body.index + spec.length);
  const lit = (t: string) => t.replace(/[_*]./g, '').replace(/[\ue000-\uefff]/g, (k) => lits[k.charCodeAt(0) - 0xe000]);
  return lit(pre) + out + lit(post);
}

/** A number in an Excel format code. */
export function formatCode(n: number, code: string): string {
  if (!Number.isFinite(n)) return '#NUM!';
  const secs = sections(code);
  if (/^general$/i.test(secs[0].trim())) return numText(n);
  let use = secs[0], v = n;
  if (secs.length >= 2 && n < 0) { use = secs[1]; v = -n; }
  else if (secs.length >= 3 && n === 0) use = secs[2];
  const out = isDateCode(use) ? dateCode(v, use) : numberCode(v, use);
  // A single section shows the minus sign itself.
  return n < 0 && (secs.length < 2) && !isDateCode(use) ? `-${out}` : out;
}

/** How a cell lines up when the style doesn't say: numbers right, text left, TRUE/FALSE centred. */
export function alignOf(v: V, s?: Style): 'left' | 'center' | 'right' {
  if (s?.align) return s.align;
  if (typeof v === 'number') return 'right';
  if (typeof v === 'boolean' || isErr(v)) return 'center';
  return 'left';
}
