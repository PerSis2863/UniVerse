'use client';

import { canEncode128, code128Svg } from '@/lib/code128';

// Printing barcode labels for library copies (Stage 5 · Q22, B15.4): a sheet of labels (three across
// on A4, or one per page on a label printer set to that size), each with the book's title, the
// copy's barcode as bars (Code 128, src/lib/code128.ts) and in letters, and the shelf. Opens the
// browser's print window; stick them inside the cover.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function printLabels(copies: { barcode: string; title: string; shelf?: string | null }[]) {
  const cells = copies.filter((c) => canEncode128(c.barcode)).map((c) => `
    <div class="label">
      <div class="title">${esc(c.title.length > 60 ? `${c.title.slice(0, 59)}…` : c.title)}</div>
      ${code128Svg(c.barcode, { module: 1.5, height: 42 })}
      <div class="code">${esc(c.barcode)}${c.shelf ? ` · ${esc(c.shelf)}` : ''}</div>
    </div>`).join('');
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) throw new Error('Allow pop-ups for this site to print labels.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Library labels</title><style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; font: 11px/1.3 system-ui, sans-serif; color: #000; background: #fff; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
    .label { border: 1px dashed #bbb; border-radius: 2mm; padding: 3mm; text-align: center; break-inside: avoid; }
    .label svg { max-width: 100%; height: 42px; }
    .title { font-weight: 600; margin-bottom: 1mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .code { font-family: ui-monospace, monospace; letter-spacing: .05em; margin-top: 1mm; }
    @media print { .label { border-color: #ddd; } }
  </style></head><body><div class="sheet">${cells}</div><script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
  w.document.close();
}
