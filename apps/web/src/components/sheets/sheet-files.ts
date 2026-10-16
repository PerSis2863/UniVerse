'use client';

import { cleanBook, type BookJSON } from '@/lib/sheet/book';
import { display } from '@/lib/sheet/format';
import { detectDelimiter } from '@/lib/csv';
import { keyOf } from '@/lib/sheet/refs';
import { PRINT_SHEET_CSS, sheetHtml } from '@/lib/sheet/render';
import type { V } from '@/lib/sheet/values';
import { csvCells, readXlsx, sheetCsv, writeXlsx } from '@/lib/sheet/xlsx';

// Spreadsheet files (Office suite): download as Excel or CSV, print or save as PDF, and open Excel
// (.xlsx) or CSV files. Everything happens on this device; the zip library loads when needed.

const safeName = (s: string) => (s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Spreadsheet').slice(0, 100);
function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadXlsx(title: string, book: BookJSON, valueOf: (sheet: string, key: string) => V) {
  const { zipSync } = await import('fflate');
  const bytes = zipSync(writeXlsx(book, valueOf), { level: 6 });
  save(`${safeName(title)}.xlsx`, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export function downloadCsv(title: string, book: BookJSON, sheetId: string, valueOf: (sheet: string, key: string) => V) {
  const s = book.sheets.find((x) => x.id === sheetId) ?? book.sheets[0];
  let rows = 0, cols = 0;
  for (const k of Object.keys(s.cells)) { const m = /^([A-Z]+)(\d+)$/.exec(k); if (!m) continue; rows = Math.max(rows, Number(m[2])); cols = Math.max(cols, m[1].split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0)); }
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) { const row: string[] = []; for (let c = 0; c < cols; c++) { const k = keyOf(r, c); const cell = s.cells[k]; row.push(cell ? display(valueOf(s.id, k), cell.s) : ''); } out.push(row); }
  save(`${safeName(title)}${book.sheets.length > 1 ? ` - ${safeName(s.name)}` : ''}.csv`, new Blob([`﻿${sheetCsv(out)}`], { type: 'text/csv;charset=utf-8' }));
}

/** Prints the sheet (or every sheet), which also saves it as a PDF. */
export function printBook(title: string, book: BookJSON, only: string | null, valueOf: (sheet: string, key: string) => V) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = book.sheets.filter((s) => !only || s.id === only).map((s) => `${book.sheets.length > 1 ? `<h2>${esc(s.name)}</h2>` : ''}${sheetHtml(s, (k) => valueOf(s.id, k), { maxCells: 100_000 })}`).join('');
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_SHEET_CSS}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`);
  d.close();
  setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}

/** A workbook from an Excel or CSV file; what couldn't come in is listed. */
export async function readSheetFile(f: File): Promise<{ book: BookJSON; skipped: string[] }> {
  if (f.size > 25_000_000) throw new Error('That file is over 25 MB. Split it into smaller files.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { unzipSync } = await import('fflate');
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(bytes, { filter: (x) => /\.(xml|rels)$/i.test(x.name) && x.originalSize < 20_000_000 }); }
    catch { throw new Error('That file couldn’t be opened.'); }
    if (!files['xl/workbook.xml']) throw new Error(/\.xls$/i.test(f.name) ? 'Old Excel files (.xls) can’t be opened: save it as .xlsx in Excel first.' : 'That isn’t an Excel workbook (.xlsx).');
    const { skipped, ...book } = readXlsx(files);
    return { book, skipped };
  }
  if (/\.xls$/i.test(f.name)) throw new Error('Old Excel files (.xls) can’t be opened: save it as .xlsx in Excel first.');
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, '');
  const rows = csvKeepingRows(text);
  const name = f.name.replace(/\.[^.]+$/, '').slice(0, 31) || 'Imported';
  return { book: cleanBook({ sheets: [{ id: 's1', name, cells: csvCells(rows) }] }), skipped: [] };
}

/** CSV rows, keeping empty ones (a sheet's rows stay where they were). */
export function csvKeepingRows(text: string): string[][] {
  const sep = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
