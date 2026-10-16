'use client';

import { authedFetch } from '@/lib/authed-fetch';
import { widthOf, type DeckJSON } from '@/lib/slides/deck';
import { readPptx, writePptx, type Media } from '@/lib/slides/pptx';
import { PRINT_DECK_CSS, deckHtml, esc } from '@/lib/slides/render';
import { uploadChatFile } from '@/components/chat/chat-client';

// Presentation files (Office suite): download as PowerPoint, print or save as PDF (a slide a
// page, with or without the notes), and open PowerPoint files (their pictures are uploaded).
// Everything happens on this device; the zip library loads when needed.

const safeName = (s: string) => (s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Presentation').slice(0, 100);
function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const EXT: Record<string, Media['ext']> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

export async function downloadPptx(title: string, deck: DeckJSON) {
  const media = new Map<string, Media>();
  const srcs = [...new Set(deck.slides.flatMap((s) => s.items.map((i) => i.src).filter((x): x is string => !!x)))].slice(0, 200);
  await Promise.all(srcs.map(async (src) => {
    try {
      const res = src.startsWith('/') ? await authedFetch(src) : await fetch(src);
      if (!res.ok) return;
      const ext = EXT[(res.headers.get('content-type') ?? '').split(';')[0].trim()] ?? (/\.png$/i.test(src) ? 'png' : /\.gif$/i.test(src) ? 'gif' : /\.webp$/i.test(src) ? 'webp' : 'jpeg');
      media.set(src, { bytes: new Uint8Array(await res.arrayBuffer()), ext });
    } catch { /* a picture that can't be fetched is left out */ }
  }));
  const { zipSync } = await import('fflate');
  const bytes = zipSync(writePptx(deck, media, title), { level: 6 });
  save(`${safeName(title)}.pptx`, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
  return srcs.length - media.size;
}

/** Prints the deck a slide a page (which also saves it as a PDF), with the notes if asked. */
export function printDeck(title: string, deck: DeckJSON, notes: boolean) {
  const W = widthOf(deck.ratio);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  const css = PRINT_DECK_CSS(W) + (notes ? `.notes{page-break-after:always;font:24px/1.4 Inter,Arial,sans-serif;padding:40px;margin:0}` : '');
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${deckHtml({ ...deck, slides: deck.slides.filter((s) => !s.hidden) }, { notes })}</body></html>`);
  d.close();
  // Pictures first, then print.
  const imgs = [...d.images];
  void Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })))).then(() => setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); }, 200));
}

/** A deck from a PowerPoint file, its pictures uploaded; what couldn't come in is listed. */
export async function readDeckFile(f: File, onProgress?: (done: number, total: number) => void): Promise<{ deck: DeckJSON; skipped: string[] }> {
  if (f.size > 100_000_000) throw new Error('That file is over 100 MB.');
  if (/\.ppt$/i.test(f.name)) throw new Error('Old PowerPoint files (.ppt) can’t be opened: save it as .pptx in PowerPoint first.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('That isn’t a PowerPoint file (.pptx).');
  const { unzipSync } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes, { filter: (x) => /\.(xml|rels)$/i.test(x.name) || (/^ppt\/media\//i.test(x.name) && x.originalSize < 25_000_000) }); }
  catch { throw new Error('That file couldn’t be opened.'); }
  const { deck, skipped } = readPptx(files);
  const wanted = [...new Set(deck.slides.flatMap((s) => s.items.map((i) => i.src).filter((x): x is string => !!x?.startsWith('media:'))))];
  const uploaded = new Map<string, string>();
  let done = 0;
  for (const m of wanted.slice(0, 100)) {
    const path = m.slice(6);
    const data = files[path] ?? Object.entries(files).find(([k]) => k.toLowerCase() === path.toLowerCase())?.[1];
    if (data) {
      const ext = path.split('.').pop()!.toLowerCase();
      const type = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      try { uploaded.set(m, await uploadChatFile(new File([data as BlobPart], path.split('/').pop()!, { type }))); } catch { /* left out below */ }
    }
    onProgress?.(++done, wanted.length);
  }
  let missing = 0;
  for (const s of deck.slides) s.items = s.items.flatMap((i) => { if (!i.src?.startsWith('media:')) return [i]; const u = uploaded.get(i.src); if (!u) { missing++; return []; } return [{ ...i, src: u }]; });
  return { deck, skipped: [...skipped, ...(missing ? [`${missing} picture${missing === 1 ? '' : 's'} that couldn’t be uploaded`] : [])] };
}
