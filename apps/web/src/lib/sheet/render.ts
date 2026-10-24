import type { BookJSON, SheetJSON } from './book';
import { display, type Style } from './format';
import { cellOf, colName, keyOf } from './refs';
import type { V } from './values';

// A workbook as HTML (Office suite): for its saved versions (search reads them, "Ask your
// semester" too), printing and PDF. What each cell shows, with its look. Import-free.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function css(s: Style | undefined): string {
  if (!s) return '';
  const out: string[] = [];
  if (s.b) out.push('font-weight:bold');
  if (s.i) out.push('font-style:italic');
  if (s.u || s.st) out.push(`text-decoration:${[s.u && 'underline', s.st && 'line-through'].filter(Boolean).join(' ')}`);
  if (s.color) out.push(`color:${s.color}`);
  if (s.bg) out.push(`background:${s.bg}`);
  if (s.align) out.push(`text-align:${s.align}`);
  if (s.size) out.push(`font-size:${s.size}pt`);
  if (s.font) out.push(`font-family:'${s.font.replace(/'/g, '')}'`);
  if (s.wrap) out.push('white-space:pre-wrap');
  return out.join(';');
}

/** The used part of a sheet as an HTML table (up to `maxCells` cells). */
export function sheetHtml(s: SheetJSON, valueOf: (key: string) => V, opts: { maxCells?: number; headers?: boolean } = {}): string {
  let rows = 0, cols = 0;
  for (const k of Object.keys(s.cells)) { const x = cellOf(k); if (x) { rows = Math.max(rows, x.r + 1); cols = Math.max(cols, x.c + 1); } }
  const max = opts.maxCells ?? 50_000;
  rows = Math.min(rows, Math.max(1, Math.floor(max / Math.max(1, cols))));
  const hidden = new Set(s.hiddenRows ?? []);
  const merged = new Map<string, { rs: number; cs: number }>(), covered = new Set<string>();
  for (const m of s.merges ?? []) {
    const [a, b] = m.split(':').map((x) => cellOf(x)!);
    if (!a || !b) continue;
    merged.set(keyOf(a.r, a.c), { rs: b.r - a.r + 1, cs: b.c - a.c + 1 });
    for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) if (r !== a.r || c !== a.c) covered.add(keyOf(r, c));
  }
  let html = '<table>';
  if (opts.headers) html += `<thead><tr><th></th>${Array.from({ length: cols }, (_, c) => `<th>${colName(c)}</th>`).join('')}</tr></thead>`;
  html += '<tbody>';
  for (let r = 0; r < rows; r++) {
    if (hidden.has(r)) continue;
    html += `<tr>${opts.headers ? `<th>${r + 1}</th>` : ''}`;
    for (let c = 0; c < cols; c++) {
      const k = keyOf(r, c);
      if (covered.has(k)) continue;
      const cell = s.cells[k];
      const m = merged.get(k);
      const v = cell ? valueOf(k) : null;
      const text = cell ? display(v, cell.s) : '';
      const style = css(cell?.s) || (typeof v === 'number' ? 'text-align:right' : '');
      html += `<td${m ? `${m.rs > 1 ? ` rowspan="${m.rs}"` : ''}${m.cs > 1 ? ` colspan="${m.cs}"` : ''}` : ''}${style ? ` style="${esc(style)}"` : ''}>${esc(text)}</td>`;
    }
    html += '</tr>';
  }
  return `${html}</tbody></table>`;
}

/** The whole workbook as HTML (each sheet under its name), kept under `max` characters. */
export function bookHtml(book: BookJSON, valueOf: (sheet: string, key: string) => V, max = 380_000): string {
  let out = '';
  for (const s of book.sheets) {
    const part = `<h2>${esc(s.name)}</h2>${sheetHtml(s, (k) => valueOf(s.id, k), { maxCells: 20_000 })}`;
    if (out.length + part.length > max) break;
    out += part;
  }
  return out || '<p></p>';
}

/** The first words of a workbook, for the list of documents. */
export function bookPreview(book: BookJSON, valueOf: (sheet: string, key: string) => V): string {
  const words: string[] = [];
  for (const s of book.sheets) {
    const keys = Object.keys(s.cells).map((k) => ({ k, at: cellOf(k)! })).filter((x) => x.at).sort((a, b) => a.at.r - b.at.r || a.at.c - b.at.c);
    for (const { k } of keys) {
      const t = display(valueOf(s.id, k), s.cells[k].s).trim();
      if (t) words.push(t);
      if (words.join(' · ').length > 300) return words.join(' · ').slice(0, 300);
    }
  }
  return words.join(' · ').slice(0, 300);
}

export const PRINT_SHEET_CSS = 'body{font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#11212d;margin:1.5rem}h1{font-size:1.4rem}h2{font-size:1.1rem;margin:1.2rem 0 .4rem}table{border-collapse:collapse;font-size:10pt}td,th{border:1px solid #ccd0cf;padding:.2em .45em;vertical-align:bottom;white-space:nowrap}th{background:#eef1f2;color:#4a5c6a;font-weight:600}@page{margin:12mm}';
