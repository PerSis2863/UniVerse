'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Download, X } from 'lucide-react';
import { pageRanges } from '@/lib/quick-tools';

// Collaborate → Create's PDF tools (M68): put PDFs together, take pages out, and make a PDF from
// pictures. In the browser with pdf-lib (loaded only when a tool runs); files never leave the device.

export type PdfId = 'merge' | 'split' | 'images';
const save = (name: string, data: Uint8Array) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export function PdfTool({ id }: { id: PdfId }) {
  const [files, setFiles] = useState<File[]>([]);
  const [spec, setSpec] = useState('1-3');
  const [busy, setBusy] = useState(false);
  const accept = id === 'images' ? 'image/png,image/jpeg' : 'application/pdf';
  const add = (list: FileList | null) => list && setFiles((f) => (id === 'split' ? [list[0]] : [...f, ...Array.from(list)]).filter(Boolean));
  const move = (i: number, d: number) => setFiles((f) => { const n = [...f]; const j = i + d; if (j < 0 || j >= n.length) return f; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const run = async () => {
    setBusy(true);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const out = await PDFDocument.create();
      if (id === 'merge') {
        for (const f of files) { const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); }
        save('combined.pdf', await out.save());
      } else if (id === 'split') {
        const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
        const pages = pageRanges(spec, src.getPageCount());
        if (!pages.length) { toast.error(`Pick pages between 1 and ${src.getPageCount()}.`); return; }
        (await out.copyPages(src, pages.map((p) => p - 1))).forEach((p) => out.addPage(p));
        save(`${files[0].name.replace(/\.pdf$/i, '')}-pages.pdf`, await out.save());
      } else {
        for (const f of files) {
          const bytes = await f.arrayBuffer();
          const img = f.type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
          // A4 at 72 dpi, the picture fitted inside a 24 pt margin.
          const W = 595, H = 842, k = Math.min((W - 48) / img.width, (H - 48) / img.height, 1);
          const page = out.addPage([W, H]);
          page.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k });
        }
        save('pictures.pdf', await out.save());
      }
      toast.success('Saved to your downloads');
    } catch { toast.error('That didn’t work: is every file a real, unlocked PDF (or a PNG or JPEG)?'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <label className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-white/15 p-6 text-center cursor-pointer hover:border-pink-500/60">
        <span className="font-semibold text-zinc-900 dark:text-white">{id === 'images' ? 'Choose pictures' : id === 'split' ? 'Choose a PDF' : 'Choose PDFs'}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{id === 'merge' ? 'They are joined in the order below' : id === 'images' ? 'PNG or JPEG, one per page' : 'Then pick the pages to keep'}</span>
        <input type="file" accept={accept} multiple={id !== 'split'} className="sr-only" onChange={(e) => add(e.target.files)} />
      </label>
      {files.length > 0 && (
        <ol className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2 text-sm">
              <span className="font-mono text-xs text-zinc-500">{i + 1}</span><span className="min-w-0 flex-1 truncate" translate="no">{f.name}</span>
              {id !== 'split' && <><button type="button" aria-label={`Move ${f.name} up`} onClick={() => move(i, -1)} className="p-1"><ArrowUp className="w-4 h-4" /></button><button type="button" aria-label={`Move ${f.name} down`} onClick={() => move(i, 1)} className="p-1"><ArrowDown className="w-4 h-4" /></button></>}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="p-1"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ol>
      )}
      {id === 'split' && files.length > 0 && <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Pages to keep (like 1-3, 5, 8-)</span><input className="input mt-1" value={spec} onChange={(e) => setSpec(e.target.value)} /></label>}
      <button type="button" disabled={busy || !files.length || (id === 'merge' && files.length < 2)} onClick={() => void run()} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
        <Download className="w-4 h-4" aria-hidden />{busy ? 'Working…' : id === 'merge' ? 'Join into one PDF' : id === 'split' ? 'Save these pages' : 'Make the PDF'}
      </button>
    </div>
  );
}
