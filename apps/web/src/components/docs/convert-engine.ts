'use client';

import { encodeWav, kindOf, markdownToHtml, outName, recordsToRows, rowsToRecords, toCsv, type Target } from '@/lib/convert-formats';
import { parseCsv } from '@/lib/csv';
import { openPdfData } from '@/lib/pdf';
import type { SheetData } from 'write-excel-file/browser';

// The file converter's conversions (Stage 5 · B9.14; src/lib/convert-formats.ts), all in the
// browser: pictures with a canvas, PDFs with pdf.js (reading) and pdf-lib (making), Word with
// mammoth, Excel with read-excel-file / write-excel-file, ZIP with fflate, sound with the browser's
// own decoder and a WAV writer. Each library loads only when it's needed.

export interface Output { name: string; blob?: Blob; /** a document to open in Docs (HTML) */ doc?: { title: string; html: string }; /** HTML to print to PDF */ print?: { title: string; html: string } }

export const MAX_FILE = 100 * 1024 * 1024;
const MAX_PAGES = 40;

const canvasBlob = (c: HTMLCanvasElement, type: string, q = 0.92) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t make the picture.'))), type, q));

/** A picture file drawn onto a canvas (SVG too); HEIC only where the browser can read it (Safari). */
async function picture(file: Blob): Promise<HTMLCanvasElement> {
  let w = 0, h = 0;
  let draw: (ctx: CanvasRenderingContext2D) => void;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (bmp) { w = bmp.width; h = bmp.height; draw = (ctx) => { ctx.drawImage(bmp, 0, 0); bmp.close(); }; }
  else {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      w = img.naturalWidth || 1024; h = img.naturalHeight || 1024;
      draw = (ctx) => ctx.drawImage(img, 0, 0, w, h);
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(/\.hei[cf]$/i.test((file as File).name ?? '') ? 'This browser can’t open HEIC photos. Safari can, or change your camera to save JPG.' : 'This browser can’t open that picture.');
    }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

async function asPngOrJpg(file: File) {
  if (/^image\/(png|jpeg)$/.test(file.type)) return { bytes: new Uint8Array(await file.arrayBuffer()), png: file.type === 'image/png' };
  const c = await picture(file);
  return { bytes: new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer()), png: true };
}

/** Pages for pictures and PDFs, in one PDF (pictures fit within an A4-ish page). */
async function makePdf(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const f of files) {
    if (kindOf(f.name, f.type) === 'pdf') {
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    } else {
      const { bytes, png } = await asPngOrJpg(f);
      const img = png ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const s = Math.min(1, 842 / Math.max(img.width, img.height));
      const page = out.addPage([img.width * s, img.height * s]);
      page.drawImage(img, { x: 0, y: 0, width: img.width * s, height: img.height * s });
    }
  }
  return new Blob([await out.save() as BlobPart], { type: 'application/pdf' });
}

async function zip(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const seen = new Map<string, number>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    const n = seen.get(f.name) ?? 0;
    seen.set(f.name, n + 1);
    entries[n ? f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`) : f.name] = f.data;
  }
  return new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: 'application/zip' });
}

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#18181b}table{border-collapse:collapse}td,th{border:1px solid #d4d4d8;padding:4px 8px}img{max-width:100%}</style></head><body>${body}</body></html>`;
const word = (title: string, body: string) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title></head><body>${body}</body></html>`;

/** HTML made safe to show or put in a doc: no scripts, frames, styles or event handlers. */
function cleanHtml(html: string) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,form').forEach((e) => e.remove());
  d.querySelectorAll('*').forEach((e) => { for (const a of [...e.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) e.removeAttribute(a.name); });
  return d.body.innerHTML;
}
const htmlText = (html: string) => { const d = new DOMParser().parseFromString(html, 'text/html'); return (d.body.innerText || d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim(); };

/** HTML to Markdown: headings, paragraphs, emphasis, links, lists, quotes and code. */
function htmlToMarkdown(html: string) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const walk = (n: Node, ol = 0): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(/\s+/g, ' ');
    if (!(n instanceof HTMLElement)) return '';
    const kids = (o = 0) => [...n.childNodes].map((c) => walk(c, o)).join('');
    const tag = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${kids().trim()}\n\n`;
    if (tag === 'p' || tag === 'div') return `\n\n${kids().trim()}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${kids()}**`;
    if (tag === 'em' || tag === 'i') return `*${kids()}*`;
    if (tag === 'code') return `\`${kids()}\``;
    if (tag === 'pre') return `\n\n\`\`\`\n${n.textContent ?? ''}\n\`\`\`\n\n`;
    if (tag === 'a') return `[${kids()}](${n.getAttribute('href') ?? ''})`;
    if (tag === 'blockquote') return `\n\n> ${kids().trim()}\n\n`;
    if (tag === 'ul') return `\n${[...n.children].map((li) => `- ${walk(li).trim()}`).join('\n')}\n\n`;
    if (tag === 'ol') return `\n${[...n.children].map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n')}\n\n`;
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'img') return `![${n.getAttribute('alt') ?? ''}](${n.getAttribute('src') ?? ''})`;
    return kids(ol);
  };
  return walk(d.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
const tableHtml = (rows: unknown[][]) => `<table>${rows.map((r, i) => `<tr>${r.map((c) => `<${i ? 'td' : 'th'}>${String(c ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`;

async function sound(file: File): Promise<Blob> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    return new Blob([encodeWav(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), buf.sampleRate)], { type: 'audio/wav' });
  } catch { throw new Error('This browser can’t read the sound in that file.'); }
  finally { void ctx.close(); }
}

async function frame(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('This browser can’t play that video.')); });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise<void>((res) => { v.onseeked = () => res(); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    return canvasBlob(c, 'image/png');
  } finally { URL.revokeObjectURL(url); }
}

/** The document (HTML) inside a Word, text, Markdown or web page file. */
async function docHtml(file: File): Promise<string> {
  const kind = kindOf(file.name, file.type);
  if (kind === 'word') {
    const mammoth = await import('mammoth');
    return cleanHtml((await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value);
  }
  const text = await file.text();
  if (kind === 'markdown') return markdownToHtml(text);
  if (kind === 'html') return cleanHtml(text);
  return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
}

/** Rows of a spreadsheet, CSV or JSON file (a spreadsheet's first sheet). */
async function rows(file: File): Promise<unknown[][]> {
  const kind = kindOf(file.name, file.type);
  if (kind === 'sheet') {
    const { default: read } = await import('read-excel-file/browser');
    const sheets = await read(file);
    return (sheets[0]?.data ?? []) as unknown[][];
  }
  if (kind === 'csv') return parseCsv(await file.text());
  const r = recordsToRows(JSON.parse(await file.text()));
  if (!r) throw new Error('This JSON isn’t a list of records, so it can’t become a table.');
  return r;
}

export async function convert(file: File, t: Target): Promise<Output[]> {
  if (file.size > MAX_FILE) throw new Error('Files up to 100 MB can be converted in the browser.');
  const title = file.name.replace(/\.[^.]+$/, '');
  switch (t.id) {
    case 'png': case 'jpg': case 'webp': {
      const c = await picture(file);
      if (t.id === 'jpg') { const flat = document.createElement('canvas'); flat.width = c.width; flat.height = c.height; const g = flat.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0); return [{ name: outName(file.name, 'jpg'), blob: await canvasBlob(flat, 'image/jpeg') }]; }
      return [{ name: outName(file.name, t.ext), blob: await canvasBlob(c, `image/${t.id}`) }];
    }
    case 'pdf-img': return [{ name: outName(file.name, 'pdf'), blob: await makePdf([file]) }];
    case 'png-pages': case 'jpg-pages': case 'pdf-text': {
      const doc = await openPdfData(await file.arrayBuffer());
      const n = Math.min(doc.numPages, MAX_PAGES);
      if (t.id === 'pdf-text') {
        const parts: string[] = [];
        for (let i = 1; i <= n; i++) {
          const pg = await doc.getPage(i);
          const tc = await pg.getTextContent();
          parts.push(tc.items.map((it) => ('str' in it ? `${it.str}${it.hasEOL ? '\n' : ''}` : '')).join(''));
          pg.cleanup();
        }
        const text = parts.join('\n\n').trim();
        if (!text) throw new Error('There’s no text in this PDF: it may be scanned pictures. Try PNG pictures instead.');
        return [{ name: outName(file.name, 'txt'), blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }];
      }
      const type = t.id === 'jpg-pages' ? 'image/jpeg' : 'image/png';
      const pics: { name: string; data: Uint8Array }[] = [];
      for (let i = 1; i <= n; i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 2 });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        if (type === 'image/jpeg') { const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        await pg.render({ canvas: c, viewport: vp }).promise;
        pg.cleanup();
        pics.push({ name: outName(file.name, t.ext, n > 1 ? i : undefined), data: new Uint8Array(await (await canvasBlob(c, type)).arrayBuffer()) });
      }
      if (pics.length === 1) return [{ name: pics[0].name, blob: new Blob([pics[0].data as BlobPart], { type }) }];
      return [{ name: outName(file.name, 'zip'), blob: await zip(pics) }];
    }
    case 'html': case 'txt': case 'md': case 'doc': case 'pdf': case 'uvdoc': {
      const html = await docHtml(file);
      if (t.id === 'html') return [{ name: outName(file.name, 'html'), blob: new Blob([page(title, html)], { type: 'text/html;charset=utf-8' }) }];
      if (t.id === 'txt') return [{ name: outName(file.name, 'txt'), blob: new Blob([htmlText(html)], { type: 'text/plain;charset=utf-8' }) }];
      if (t.id === 'md') return [{ name: outName(file.name, 'md'), blob: new Blob([htmlToMarkdown(html)], { type: 'text/markdown;charset=utf-8' }) }];
      if (t.id === 'doc') return [{ name: outName(file.name, 'doc'), blob: new Blob([word(title, html)], { type: 'application/msword' }) }];
      if (t.id === 'pdf') return [{ name: outName(file.name, 'pdf'), print: { title, html: page(title, html) } }];
      return [{ name: title, doc: { title, html } }];
    }
    case 'csv': case 'json': case 'xlsx': case 'html-table': {
      const r = await rows(file);
      if (t.id === 'csv') return [{ name: outName(file.name, 'csv'), blob: new Blob(['﻿' + toCsv(r)], { type: 'text/csv;charset=utf-8' }) }];
      if (t.id === 'json') return [{ name: outName(file.name, 'json'), blob: new Blob([JSON.stringify(rowsToRecords(r), null, 2)], { type: 'application/json' }) }];
      if (t.id === 'html-table') return [{ name: outName(file.name, 'html'), blob: new Blob([page(title, tableHtml(r))], { type: 'text/html;charset=utf-8' }) }];
      const { default: write } = await import('write-excel-file/browser');
      const data = r.map((row) => row.map((c) => (c == null || c === '' ? null : typeof c === 'number' || typeof c === 'boolean' ? c : /^-?\d+(\.\d+)?$/.test(String(c)) && String(c).length < 16 ? Number(c) : String(c))));
      return [{ name: outName(file.name, 'xlsx'), blob: await write(data as SheetData).toBlob() }];
    }
    case 'wav': return [{ name: outName(file.name, 'wav'), blob: await sound(file) }];
    case 'frame': return [{ name: outName(file.name, 'png'), blob: await frame(file) }];
    case 'unzip': {
      const { unzipSync } = await import('fflate');
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => !f.name.endsWith('/') && f.originalSize < MAX_FILE });
      const list = Object.entries(files).slice(0, 200);
      if (!list.length) throw new Error('That ZIP is empty.');
      return list.map(([name, data]) => ({ name: name.split('/').pop() || name, blob: new Blob([data as BlobPart]) }));
    }
    default: throw new Error('That conversion isn’t available.');
  }
}

export async function combine(files: File[], t: Target): Promise<Output> {
  if (files.some((f) => f.size > MAX_FILE)) throw new Error('Files up to 100 MB can be converted in the browser.');
  if (t.id === 'merge-pdf') return { name: 'combined.pdf', blob: await makePdf(files) };
  return { name: 'files.zip', blob: await zip(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })))) };
}
