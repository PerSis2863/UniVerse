'use client';

import type { Editor } from '@tiptap/react';
import { docToDocx, docToMarkdown, imageSources, type DocxImage, type PMNode } from '@/lib/doc-export';

// Downloads and imports for a document (Stage 5 · B9.6; the formats are src/lib/doc-export.ts).

const safeName = (title: string) => title.replace(/[^\w\- ]+/g, '').trim() || 'Document';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadMarkdown(title: string, editor: Editor) {
  save(new Blob([docToMarkdown(editor.getJSON() as PMNode, title, window.location.origin)], { type: 'text/markdown;charset=utf-8' }), `${safeName(title)}.md`);
}

/** A picture as PNG for Word (any format the browser can show), or null when it can't be fetched. */
async function png(src: string): Promise<DocxImage | null> {
  try {
    const res = await fetch(src, { credentials: 'omit' });
    if (!res.ok || Number(res.headers.get('content-length') ?? 0) > 8 * 1024 * 1024) return null;
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    return blob ? { data: new Uint8Array(await blob.arrayBuffer()), width: bmp.width, height: bmp.height } : null;
  } catch { return null; }
}

export async function downloadDocx(title: string, editor: Editor) {
  const json = editor.getJSON() as PMNode;
  const images = new Map<string, DocxImage>();
  for (const src of imageSources(json).slice(0, 30)) { const img = await png(src); if (img) images.set(src, img); }
  const files = docToDocx(json, title, { images, origin: window.location.origin });
  const { zipSync, strToU8 } = await import('fflate');
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
  save(new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${safeName(title)}.docx`);
}

/** Puts a Word, Markdown, text or web page file into the document at the cursor. */
export async function importFile(file: File, editor: Editor) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Files up to 20 MB can be imported.');
  const { docHtml } = await import('./convert-engine');
  const html = await docHtml(file);
  if (!html.trim()) throw new Error('There’s nothing to import in that file.');
  editor.chain().focus().insertContent(html).run();
}
