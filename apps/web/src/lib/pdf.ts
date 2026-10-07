'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';

// PDF previews in chats (Stage 4 · 1.8): pdf.js, loaded only when someone previews or opens a
// PDF. Its worker is copied to /pdfjs at build time (scripts/copy-pdfjs-assets.mjs). Files are read
// in 64 KB ranges, so a first-page preview usually downloads only part of the file. The "legacy"
// build: the modern one needs very new JavaScript (Map.getOrInsertComputed) that many phones lack.

let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function pdfjs() {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    return m;
  });
  return lib;
}

export async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  return m.getDocument({ url, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65_536, withCredentials: false }).promise;
}

/** Draws a page into a canvas `width` CSS pixels wide (sharp on high-density screens). */
export async function drawPage(doc: PDFDocumentProxy, n: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: (width / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
}

/** First pages already drawn, as pictures, so scrolling back doesn't draw them again. */
const thumbs = new Map<string, { src: string; pages: number }>();

/** The first page as a picture `width` pixels wide, and how many pages there are. */
export async function firstPage(url: string, width: number): Promise<{ src: string; pages: number }> {
  const known = thumbs.get(url);
  if (known) return known;
  const doc = await openPdf(url);
  try {
    const canvas = document.createElement('canvas');
    await drawPage(doc, 1, canvas, width);
    const out = { src: canvas.toDataURL('image/jpeg', 0.8), pages: doc.numPages };
    if (thumbs.size > 60) thumbs.delete(thumbs.keys().next().value!);
    thumbs.set(url, out);
    return out;
  } finally {
    void doc.destroy();
  }
}

/** What kind of preview a file gets. */
export function previewKind(name: string | null | undefined, mime: string | null | undefined): 'pdf' | 'text' | null {
  const n = (name ?? '').toLowerCase();
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (mime?.startsWith('text/') || /\.(txt|md|csv|tsv|json|log|py|js|ts|tsx|jsx|java|c|cpp|h|cs|go|rs|rb|php|html|css|sql|yaml|yml|xml|ini|sh)$/.test(n)) return 'text';
  return null;
}
