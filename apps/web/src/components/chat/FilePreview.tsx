'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m as motion } from 'framer-motion';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Download, Eye, FileCode2, FileText, Loader2, Minus, Plus, X } from 'lucide-react';
import { drawPage, firstPage, openPdf, previewKind } from '@/lib/pdf';
import { useLowData } from '@/store/low-data';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { safeHref } from '@/lib/safe-href';
import { formatBytes } from './chat-client';

// Files in chats (Stage 4 · 1.8): a PDF shows its first page and opens in a viewer; a text or code
// file shows its first lines. Previews load when the message scrolls into view, never in low-data
// mode (then "Preview" loads it on tap), and only for files up to 20 MB (PDF) or 200 KB (text).

const PDF_PREVIEW_MAX = 20 * 1024 * 1024;
const TEXT_PREVIEW_MAX = 200 * 1024;
const TEXT_OPEN_MAX = 1024 * 1024;

/** A full-screen layer over the app, closed with Esc. */
function Overlay({ title, url, onClose, children, tools }: { title: string; url: string; onClose: () => void; children: React.ReactNode; tools?: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; };
  }, [onClose]);
  return createPortal(
    <motion.div role="dialog" aria-label={title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.smooth} className="fixed inset-0 z-[95] bg-zinc-950/95 backdrop-blur-sm flex flex-col text-white">
      <div className="h-14 shrink-0 flex items-center gap-2 px-3 sm:px-4 border-b border-white/10 pt-[env(safe-area-inset-top)]">
        <p className="flex-1 min-w-0 truncate text-sm font-semibold">{title}</p>
        {tools}
        <a href={safeHref(url)} download={title} target="_blank" rel="noopener noreferrer" aria-label="Download" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center"><Download className="w-5 h-5" /></a>
        <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center"><X className="w-5 h-5" /></button>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex-1 min-h-0">{children}</motion.div>
    </motion.div>,
    document.body,
  );
}

/** One page, drawn when it comes near the screen (and again when the zoom changes). */
function PdfPage({ doc, n, width, onSeen }: { doc: PDFDocumentProxy; n: number; width: number; onSeen: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(n <= 2);
  const [ratio, setRatio] = useState(1.414);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setNear(true);
      if (e.intersectionRatio >= 0.4) onSeen(n);
    }, { rootMargin: '800px 0px', threshold: [0, 0.4] });
    io.observe(el);
    return () => io.disconnect();
  }, [n, onSeen]);
  useEffect(() => {
    if (!near || !width) return;
    let stale = false;
    const canvas = document.createElement('canvas');
    canvas.className = 'block bg-white shadow-xl';
    // Each drawing goes into a new canvas, swapped in when done: pdf.js can't draw on one twice at once.
    void drawPage(doc, n, canvas, width).then(() => {
      if (stale || !box.current) return;
      setRatio(canvas.height / canvas.width);
      box.current.replaceChildren(canvas);
    }).catch((e) => console.warn('PDF page could not be drawn', e));
    return () => { stale = true; };
  }, [doc, n, width, near]);
  return <div ref={box} className="mx-auto bg-white/5" style={{ width, height: Math.round(width * ratio) }} aria-label={`Page ${n}`} />;
}

export function PdfViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let opened: PDFDocumentProxy | null = null;
    openPdf(url).then((d) => { if (gone) { void d.destroy(); return; } opened = d; setDoc(d); }).catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; void opened?.destroy(); };
  }, [url]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(900, el.clientWidth - 24)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tools = (
    <div className="flex items-center gap-1 text-xs">
      {doc && <span className="px-2 tabular-nums text-white/70">{page} / {doc.numPages}</span>}
      <button type="button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center disabled:opacity-40"><Minus className="w-4 h-4" /></button>
      <span className="w-10 text-center tabular-nums text-white/70">{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4" /></button>
    </div>
  );
  return (
    <Overlay title={name} url={url} onClose={onClose} tools={tools}>
      <div ref={scroller} className="h-full overflow-auto py-4 px-3">
        {failed ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-white/80">This PDF can’t be shown here.</p>
            <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" className="btn-primary">Open it in a new tab</a>
          </div>
        ) : !doc || !fit ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/60" /></div>
        ) : (
          <div className="space-y-3 w-max min-w-full">
            {Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={i} doc={doc} n={i + 1} width={Math.round(fit * zoom)} onSeen={setPage} />)}
          </div>
        )}
      </div>
    </Overlay>
  );
}

export function TextViewer({ url, name, size, onClose }: { url: string; name: string; size: number | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cut = (size ?? 0) > TEXT_OPEN_MAX;
  useEffect(() => {
    let gone = false;
    fetch(url, cut ? { headers: { Range: `bytes=0-${TEXT_OPEN_MAX - 1}` } } : undefined)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((t) => { if (!gone) setText(t); })
      .catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; };
  }, [url, cut]);
  return (
    <Overlay title={name} url={url} onClose={onClose}>
      <div className="h-full overflow-auto p-4">
        {failed ? <p className="text-sm text-white/80 text-center mt-10">This file can’t be shown here. Download it instead.</p>
          : text === null ? <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/60" /></div>
          : (
            <>
              <pre className="mx-auto max-w-4xl text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words text-zinc-100 bg-white/[0.04] rounded-xl p-4">{text}</pre>
              {cut && <p className="text-center text-xs text-white/60 mt-3">Showing the first 1 MB. Download the file to see all of it.</p>}
            </>
          )}
      </div>
    </Overlay>
  );
}

/** A file in a chat bubble: a preview (PDF first page, first lines of text) and the viewer. */
export function FileBubble({ url, name, size, mime, mine }: { url: string; name: string | null; size: number | null; mime: string | null; mine: boolean }) {
  const kind = previewKind(name, mime);
  const lowData = useLowData((s) => s.enabled);
  const title = name || 'File';
  const small = kind === 'pdf' ? (size ?? 0) <= PDF_PREVIEW_MAX : kind === 'text' ? (size ?? 0) <= TEXT_PREVIEW_MAX : false;
  const [want, setWant] = useState(false);
  const [open, setOpen] = useState(false);
  const [thumb, setThumb] = useState<{ src: string; pages: number } | null>(null);
  const [lines, setLines] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Preview once the bubble is on screen (or when asked to, in low-data mode).
  useEffect(() => {
    if (!kind || !small || (lowData && !want)) return;
    const el = box.current;
    if (!el) return;
    let gone = false;
    const load = () => {
      setBusy(true);
      const job = kind === 'pdf'
        ? firstPage(url, 512).then((t) => { if (!gone) setThumb(t); })
        : fetch(url, { headers: { Range: 'bytes=0-1499' } }).then((r) => (r.ok ? r.text() : Promise.reject(new Error()))).then((t) => { if (!gone) setLines(t.split('\n').slice(0, 8).join('\n')); });
      void job.catch((e) => console.warn('File preview unavailable', e)).finally(() => { if (!gone) setBusy(false); });
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => { gone = true; io.disconnect(); };
  }, [kind, small, lowData, want, url]);

  const Icon = kind === 'text' ? FileCode2 : FileText;
  return (
    <div ref={box} className="w-64 max-w-full">
      {kind && (thumb || lines !== null) && (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${title}`} className="block w-full p-1 pb-0">
          {thumb ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.smooth} className="block h-40 overflow-hidden rounded-[12px] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn on the device */}
              <img src={thumb.src} alt={`First page of ${title}`} className="w-full object-cover object-top" />
            </motion.span>
          ) : (
            <motion.pre initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.smooth} className={cn('h-28 overflow-hidden rounded-[12px] p-2.5 text-left text-[11px] leading-snug font-mono whitespace-pre-wrap break-all', mine ? 'bg-black/20 text-white/90' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200')}>{lines}</motion.pre>
          )}
        </button>
      )}
      <div className="flex items-center gap-3 p-3">
        <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', mine ? 'bg-white/15' : 'bg-indigo-500/10 text-indigo-500')}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate">{title}</span>
          <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>{formatBytes(size)}{thumb ? ` · ${thumb.pages} ${thumb.pages === 1 ? 'page' : 'pages'}` : ''}</span>
        </span>
        {kind && (
          <button type="button" onClick={() => { setWant(true); setOpen(true); }} aria-label={`Preview ${title}`} className="w-8 h-8 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10">
            <Eye className="w-4 h-4" />
          </button>
        )}
        <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" download={title} aria-label={`Download ${title}`} className="w-8 h-8 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10">
          <Download className="w-4 h-4" />
        </a>
      </div>
      {open && kind === 'pdf' && <PdfViewer url={url} name={title} onClose={() => setOpen(false)} />}
      {open && kind === 'text' && <TextViewer url={url} name={title} size={size} onClose={() => setOpen(false)} />}
    </div>
  );
}
