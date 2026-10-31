'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ArrowDown, ArrowUp, ClipboardList, Download, Eraser, FilePlus2, Highlighter, Loader2, PenLine, RotateCw, Scissors, Signature, Square, Trash2, Type, Undo2, X } from 'lucide-react';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { haptic } from '@/lib/haptics';
import { openPdfData } from '@/lib/pdf';
import { markAt, movePage, parseRanges, simplify, toFraction, turn, type Mark, type PageRef } from '@/lib/pdf-edit';
import { cn } from '@/lib/utils';
import { cleanValues, fillForm, readForm, type FormField, type FormValues } from '@/lib/pdf-form';

// The Studio PDF editor (Stage 5 · B9.15; src/lib/pdf-edit.ts): pages to reorder, turn, delete,
// add (from PDFs or pictures) and download; marks to draw on them: pen, highlighter, text, a
// signature and white-out. Saved with pdf-lib: the pages stay as they were (text stays text), and
// each page's marks go on top as a picture, so any language and any drawing saves exactly. A PDF
// form's fields can be filled in (Stage 5 · Q22, src/lib/pdf-form.ts): the answers are written
// onto the pages when saving.

type Source = { kind: 'pdf'; bytes: ArrayBuffer; doc: PDFDocumentProxy } | { kind: 'image'; bytes: ArrayBuffer; url: string; w: number; h: number; png: boolean };
type Tool = 'pen' | 'highlight' | 'text' | 'sign' | 'whiteout' | 'erase';
const TOOLS: { id: Tool; label: string; icon: typeof PenLine }[] = [
  { id: 'pen', label: 'Pen', icon: PenLine }, { id: 'highlight', label: 'Highlighter', icon: Highlighter }, { id: 'text', label: 'Text', icon: Type },
  { id: 'sign', label: 'Signature', icon: Signature }, { id: 'whiteout', label: 'White-out', icon: Square }, { id: 'erase', label: 'Remove a mark', icon: Eraser },
];
const COLORS = ['#1d2650', '#2563eb', '#dc2626', '#16a34a', '#facc15'];
let seq = 0;
const nid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Draws marks onto a canvas the size of the page as shown. */
function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], w: number, h: number, images: Map<string, HTMLImageElement>) {
  for (const m of marks) {
    ctx.save();
    if (m.kind === 'whiteout' && m.rect) { ctx.fillStyle = '#ffffff'; ctx.fillRect(m.rect.x * w, m.rect.y * h, m.rect.w * w, m.rect.h * h); }
    if ((m.kind === 'pen' || m.kind === 'highlight') && m.points?.length) {
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = m.kind === 'highlight' ? 0.35 : 1;
      ctx.lineWidth = m.size * w;
      ctx.lineCap = m.kind === 'highlight' ? 'butt' : 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      m.points.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
      if (m.points.length === 1) ctx.lineTo(m.points[0].x * w + 0.5, m.points[0].y * h);
      ctx.stroke();
    }
    if (m.kind === 'text' && m.text && m.rect) {
      ctx.fillStyle = m.color;
      ctx.font = `${Math.round(m.size * h)}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      m.text.split('\n').forEach((line, i) => ctx.fillText(line, m.rect!.x * w, m.rect!.y * h + i * m.size * h * 1.2));
    }
    if (m.kind === 'image' && m.image && m.rect) { const img = images.get(m.image); if (img) ctx.drawImage(img, m.rect.x * w, m.rect.y * h, m.rect.w * w, m.rect.h * h); }
    ctx.restore();
  }
}

function useImages(marks: Mark[]) {
  const [images, setImages] = useState(() => new Map<string, HTMLImageElement>());
  useEffect(() => {
    const need = marks.filter((m) => m.image && !images.has(m.image));
    if (!need.length) return;
    let live = true;
    void Promise.all(need.map(async (m) => { const img = new Image(); img.src = m.image!; await img.decode(); return [m.image!, img] as const; })).then((loaded) => {
      if (live) setImages((cur) => { const next = new Map(cur); for (const [k, v] of loaded) next.set(k, v); return next; });
    }).catch(() => {});
    return () => { live = false; };
  }, [marks, images]);
  return images;
}

/** One page drawn (PDF page or picture) at a width, turned. */
function PageCanvas({ source, page, width, className }: { source: Source; page: PageRef; width: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    const c = ref.current;
    if (!c) return;
    (async () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (source.kind === 'pdf') {
        const p = await source.doc.getPage(page.index + 1);
        const base = p.getViewport({ scale: 1, rotation: (p.rotate + page.rotation) % 360 });
        const vp = p.getViewport({ scale: (width / base.width) * dpr, rotation: (p.rotate + page.rotation) % 360 });
        if (!live) return;
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await p.render({ canvas: c, viewport: vp }).promise;
        p.cleanup();
        if (live) setSize({ w: width, h: (vp.height / vp.width) * width });
      } else {
        const img = new Image();
        img.src = source.url;
        await img.decode();
        const r = page.rotation;
        const [iw, ih] = r % 180 ? [source.h, source.w] : [source.w, source.h];
        const s = (width * dpr) / iw;
        c.width = Math.floor(iw * s); c.height = Math.floor(ih * s);
        const g = c.getContext('2d')!;
        g.translate(c.width / 2, c.height / 2);
        g.rotate((r * Math.PI) / 180);
        g.drawImage(img, (-source.w * s) / 2, (-source.h * s) / 2, source.w * s, source.h * s);
        if (live) setSize({ w: width, h: (ih / iw) * width });
      }
    })().catch(() => {});
    return () => { live = false; };
  }, [source, page.index, page.rotation, width]);
  return <canvas ref={ref} className={className} style={size ? { width: size.w, height: size.h } : { width, height: width * 1.3 }} aria-hidden />;
}

export function PdfEditor({ file, onClose }: { file: File; onClose: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [current, setCurrent] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Form fields per PDF added (by its place in `sources`), and the answers given so far.
  const [forms, setForms] = useState<Record<number, FormField[]>>({});
  const [answers, setAnswers] = useState<Record<number, FormValues>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [drawing, setDrawingState] = useState<Mark | null>(null);
  // The mark being drawn, also kept here so a quick drag never reads a stale one.
  const drawingRef = useRef<Mark | null>(null);
  const setDrawing = (m: Mark | null) => { drawingRef.current = m; setDrawingState(m); };
  const [width, setWidth] = useState(600);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const sourceCount = useRef(0);
  const page = pages[current];
  const allMarks = pages.flatMap((p) => p.marks);
  const images = useImages(allMarks);

  /** Adds a PDF's pages or a picture as pages. */
  const addFile = useCallback(async (f: File) => {
    const bytes = await f.arrayBuffer();
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      const doc = await openPdfData(bytes.slice(0));
      const idx = sourceCount.current++;
      setSources((s) => [...s, { kind: 'pdf', bytes, doc }]);
      setPages((p) => [...p, ...Array.from({ length: Math.min(doc.numPages, 300) }, (_, i) => ({ id: nid(), source: idx, index: i, rotation: 0 as const, marks: [] }))]);
      const fields = (await readForm(bytes.slice(0))).filter((x) => !x.readOnly);
      if (fields.length) { setForms((m) => ({ ...m, [idx]: fields })); toast(`This PDF is a form with ${fields.length} field${fields.length === 1 ? '' : 's'}: tap Fill in the form.`); }
    } else if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.src = url;
      await img.decode();
      let png = f.type === 'image/png';
      let data = bytes;
      if (!/^image\/(png|jpeg)$/.test(f.type)) {
        // pdf-lib takes PNG and JPG: other pictures become PNG.
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0);
        data = await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))).arrayBuffer();
        png = true;
      }
      const idx = sourceCount.current++;
      setSources((s) => [...s, { kind: 'image', bytes: data, url, w: img.naturalWidth, h: img.naturalHeight, png }]);
      setPages((p) => [...p, { id: nid(), source: idx, index: 0, rotation: 0, marks: [] }]);
    } else throw new Error('Add a PDF or a picture.');
  }, []);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { if (live) void addFile(file).catch((e) => toast.error((e as Error).message || 'Couldn’t open that PDF.')); }, 0);
    return () => { live = false; clearTimeout(t); };
  }, [file, addFile]);
  // The page shown as wide as its space allows.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.min(900, el.clientWidth - 32))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Marks drawn over the shown page.
  useEffect(() => {
    const c = overlayRef.current;
    if (!c || !page) return;
    const box = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.floor(box.width * dpr)); c.height = Math.max(1, Math.floor(box.height * dpr));
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    drawMarks(g, drawing ? [...page.marks, drawing] : page.marks, c.width, c.height, images);
  });

  const setMarks = (fn: (m: Mark[]) => Mark[]) => setPages((ps) => ps.map((p, i) => (i === current ? { ...p, marks: fn(p.marks) } : p)));
  const point = (e: React.PointerEvent) => toFraction(e.clientX, e.clientY, overlayRef.current!.getBoundingClientRect());
  const onDown = async (e: React.PointerEvent) => {
    if (!page || e.button !== 0) return;
    const p = point(e);
    if (tool === 'erase') { const m = markAt(page.marks, p); if (m) { setMarks((ms) => ms.filter((x) => x.id !== m.id)); haptic('tap'); } return; }
    if (tool === 'text') {
      const text = await promptDialog({ title: 'Add text', message: 'It goes where you tapped.', placeholder: 'Your text', confirmLabel: 'Add', maxLength: 300 });
      if (text?.trim()) setMarks((ms) => [...ms, { id: nid(), kind: 'text', color, size: 0.022, text: text.trim(), rect: { x: p.x, y: p.y, w: 0.3, h: 0.03 } }]);
      return;
    }
    if (tool === 'sign') {
      if (!signature) { setSigning(true); return; }
      const img = images.get(signature) ?? await (async () => { const i = new Image(); i.src = signature; await i.decode(); return i; })();
      const box = overlayRef.current!.getBoundingClientRect();
      const w = 0.28, h = (w * box.width * (img.naturalHeight / img.naturalWidth)) / box.height;
      setMarks((ms) => [...ms, { id: nid(), kind: 'image', color: '#000', size: 1, image: signature, rect: { x: Math.min(1 - w, p.x - w / 2), y: Math.min(1 - h, p.y - h / 2), w, h } }]);
      return;
    }
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (tool === 'whiteout') setDrawing({ id: nid(), kind: 'whiteout', color: '#fff', size: 1, rect: { x: p.x, y: p.y, w: 0, h: 0 }, points: [p] });
    else setDrawing({ id: nid(), kind: tool, color: tool === 'highlight' ? (color === COLORS[0] ? '#facc15' : color) : color, size: tool === 'highlight' ? 0.02 : 0.004, points: [p] });
  };
  const extend = (d: Mark, p: { x: number; y: number }): Mark => {
    if (d.kind === 'whiteout') { const s = d.points![0]; return { ...d, rect: { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) } }; }
    return { ...d, points: [...d.points!, p] };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drawingRef.current;
    if (d) setDrawing(extend(d, point(e)));
  };
  const onUp = (e: React.PointerEvent) => {
    const d0 = drawingRef.current;
    if (!d0) return;
    const drawing = overlayRef.current ? extend(d0, point(e)) : d0;
    const m = drawing.kind === 'whiteout' ? { ...drawing, points: undefined } : { ...drawing, points: simplify(drawing.points!) };
    setDrawing(null);
    if (m.kind === 'whiteout' && (!m.rect || m.rect.w < 0.005 || m.rect.h < 0.005)) return;
    setMarks((ms) => [...ms, m]);
  };

  /** Builds the PDF (all pages, or some), with marks on top. */
  const build = async (only?: number[]) => {
    const { PDFDocument, degrees } = await import('pdf-lib');
    const out = await PDFDocument.create();
    const loaded = new Map<number, Awaited<ReturnType<typeof PDFDocument.load>>>();
    const list = only ? only.map((i) => pages[i]) : pages;
    for (const pr of list) {
      const src = sources[pr.source];
      let target;
      if (src.kind === 'pdf') {
        if (!loaded.has(pr.source)) {
          // The form's answers first, onto the pages, so they come along with them.
          const filled = forms[pr.source] ? cleanValues(forms[pr.source], answers[pr.source] ?? {}) : {};
          loaded.set(pr.source, await PDFDocument.load(Object.keys(filled).length ? await fillForm(src.bytes.slice(0), filled) : src.bytes, { ignoreEncryption: true }));
        }
        [target] = await out.copyPages(loaded.get(pr.source)!, [pr.index]);
        out.addPage(target);
      } else {
        const img = src.png ? await out.embedPng(src.bytes) : await out.embedJpg(src.bytes);
        const s = Math.min(1, 842 / Math.max(img.width, img.height));
        target = out.addPage([img.width * s, img.height * s]);
        target.drawImage(img, { x: 0, y: 0, width: img.width * s, height: img.height * s });
      }
      const base = target.getRotation().angle;
      const R = (((base + pr.rotation) % 360) + 360) % 360;
      target.setRotation(degrees(R));
      if (pr.marks.length) {
        // Marks are drawn on the page as it's shown (turned), then turned back onto the page itself.
        const { width: W, height: H } = target.getSize();
        const scale = 2;
        const [dw, dh] = R % 180 ? [H, W] : [W, H];
        const shown = document.createElement('canvas'); shown.width = Math.round(dw * scale); shown.height = Math.round(dh * scale);
        drawMarks(shown.getContext('2d')!, pr.marks, shown.width, shown.height, images);
        const flat = document.createElement('canvas'); flat.width = Math.round(W * scale); flat.height = Math.round(H * scale);
        const g = flat.getContext('2d')!;
        if (R === 90) { g.translate(0, flat.height); g.rotate(-Math.PI / 2); }
        else if (R === 180) { g.translate(flat.width, flat.height); g.rotate(Math.PI); }
        else if (R === 270) { g.translate(flat.width, 0); g.rotate(Math.PI / 2); }
        g.drawImage(shown, 0, 0);
        const png = await out.embedPng(await (await new Promise<Blob>((r) => flat.toBlob((b) => r(b!), 'image/png'))).arrayBuffer());
        target.drawImage(png, { x: 0, y: 0, width: W, height: H });
      }
    }
    return new Blob([await out.save() as BlobPart], { type: 'application/pdf' });
  };
  const save = async (only?: number[], suffix = 'edited') => {
    setBusy(only ? 'extract' : 'save');
    try {
      const blob = await build(only);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${file.name.replace(/\.pdf$/i, '')}-${suffix}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      haptic('success');
      toast.success('PDF saved');
    } catch (e) { toast.error((e as Error).message || 'Couldn’t save the PDF.'); }
    finally { setBusy(null); }
  };
  const extract = async () => {
    const v = await promptDialog({ title: 'Download some pages', message: `Pages to keep, like 1-3, 5 (of ${pages.length}).`, placeholder: '1-3, 5', confirmLabel: 'Download', maxLength: 200 });
    if (!v) return;
    const list = parseRanges(v, pages.length);
    if (!list.length) { toast.error('No pages matched.'); return; }
    await save(list, 'pages');
  };
  const pageOp = async (i: number, op: 'up' | 'down' | 'turn' | 'delete') => {
    if (op === 'delete') {
      if (pages.length === 1) { toast('A PDF needs at least one page.'); return; }
      if (pages[i].marks.length && !(await confirmDialog({ title: 'Delete this page?', message: 'Its marks go too.', destructive: true, confirmLabel: 'Delete' }))) return;
      setPages((ps) => ps.filter((_, j) => j !== i));
      setCurrent((c) => Math.max(0, Math.min(c, pages.length - 2)));
      return;
    }
    if (op === 'turn') {
      // Marks turn with the page (a quarter turn clockwise).
      const rot = (m: Mark): Mark => ({ ...m, points: m.points?.map((p) => ({ x: 1 - p.y, y: p.x })), rect: m.rect && (m.kind === 'text' ? { ...m.rect, x: 1 - m.rect.y - 0.3, y: m.rect.x } : { x: 1 - m.rect.y - m.rect.h, y: m.rect.x, w: m.rect.h, h: m.rect.w }) });
      setPages((ps) => ps.map((p, j) => (j === i ? { ...p, rotation: turn(p.rotation, 1), marks: p.marks.map(rot) } : p)));
      return;
    }
    const to = op === 'up' ? i - 1 : i + 1;
    setPages((ps) => movePage(ps, i, to));
    if (current === i) setCurrent(Math.max(0, Math.min(pages.length - 1, to)));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-100 dark:bg-[#1d2650]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1d2650] overflow-x-auto">
        <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Close the PDF editor?', message: 'Unsaved changes are lost: save the PDF first to keep them.', confirmLabel: 'Close' })) onClose(); }} aria-label="Close the PDF editor" className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate max-w-[12rem]">{file.name}</span>
        <span className="text-[11px] text-zinc-500 shrink-0">{pages.length} page{pages.length === 1 ? '' : 's'}</span>
        <div className="ms-auto flex items-center gap-1 shrink-0">
          <input ref={addRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={async (e) => { for (const f of [...(e.target.files ?? [])].slice(0, 10)) await addFile(f).catch((err) => toast.error((err as Error).message)); e.target.value = ''; }} />
          {Object.keys(forms).length > 0 && <button type="button" onClick={() => setFormOpen(true)} className="btn-secondary btn-sm"><ClipboardList className="w-3.5 h-3.5" />Fill in the form</button>}
          <button type="button" onClick={() => addRef.current?.click()} className="btn-secondary btn-sm"><FilePlus2 className="w-3.5 h-3.5" />Add pages</button>
          <button type="button" onClick={() => void extract()} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'extract' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}Some pages</button>
          <button type="button" onClick={() => void save()} disabled={!!busy || !pages.length} className="btn-primary btn-sm">{busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Save PDF</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Pages */}
        <ol aria-label="Pages" className="order-2 md:order-1 flex md:flex-col gap-2 p-2 overflow-auto md:w-44 shrink-0 bg-white dark:bg-[#1d2650] border-t md:border-t-0 md:border-e border-zinc-200 dark:border-white/10">
          {pages.map((p, i) => (
            <li key={p.id} className={cn('relative shrink-0 rounded-lg border-2 p-1 bg-white', i === current ? 'border-indigo-500' : 'border-transparent')}>
              <button type="button" onClick={() => setCurrent(i)} aria-label={`Page ${i + 1}`} aria-current={i === current ? 'page' : undefined} className="block">
                {sources[p.source] && <PageCanvas source={sources[p.source]} page={p} width={120} />}
              </button>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-zinc-500 tabular-nums">{i + 1}{p.marks.length ? ' ✎' : ''}</span>
                <span className="flex">
                  <button type="button" onClick={() => void pageOp(i, 'up')} disabled={i === 0} aria-label={`Move page ${i + 1} up`} className="p-0.5 text-zinc-500 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                  <button type="button" onClick={() => void pageOp(i, 'down')} disabled={i === pages.length - 1} aria-label={`Move page ${i + 1} down`} className="p-0.5 text-zinc-500 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                  <button type="button" onClick={() => void pageOp(i, 'turn')} aria-label={`Turn page ${i + 1}`} className="p-0.5 text-zinc-500"><RotateCw className="w-3 h-3" /></button>
                  <button type="button" onClick={() => void pageOp(i, 'delete')} aria-label={`Delete page ${i + 1}`} className="p-0.5 text-zinc-500 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                </span>
              </div>
            </li>
          ))}
          {!pages.length && <li className="p-4 text-xs text-zinc-500"><Loader2 className="w-4 h-4 animate-spin inline me-1" />Opening…</li>}
        </ol>
        {/* The page */}
        <div ref={stageRef} className="order-1 md:order-2 flex-1 min-w-0 min-h-[50vh] overflow-auto p-4 flex flex-col items-center gap-3">
          <div role="toolbar" aria-label="Marks" className="flex flex-wrap items-center gap-1 rounded-2xl bg-white dark:bg-[#1d2650] border border-zinc-200 dark:border-white/10 p-1 shadow-sm">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" onClick={() => { setTool(t.id); if (t.id === 'sign' && !signature) setSigning(true); }} aria-pressed={tool === t.id} aria-label={t.label} title={t.label}
                className={cn('w-10 h-10 rounded-xl grid place-items-center', tool === t.id ? 'bg-indigo-500 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}><t.icon className="w-4 h-4" /></button>
            ))}
            <span className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
            {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={cn('w-6 h-6 rounded-full border border-zinc-300', color === c && 'ring-2 ring-indigo-500 ring-offset-1')} style={{ background: c }} />)}
            <span className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1" aria-hidden />
            <button type="button" onClick={() => setMarks((ms) => ms.slice(0, -1))} disabled={!page?.marks.length} aria-label="Undo the last mark on this page" className="w-10 h-10 rounded-xl grid place-items-center text-zinc-600 dark:text-zinc-300 disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
          </div>
          {page && sources[page.source] && (
            <div className="relative shadow-xl bg-white">
              <PageCanvas source={sources[page.source]} page={page} width={width} className="block" />
              <canvas ref={overlayRef} role="img" aria-label={`Page ${current + 1} of ${pages.length}, ${page.marks.length} mark${page.marks.length === 1 ? '' : 's'}`}
                className={cn('absolute inset-0 w-full h-full touch-none', tool === 'text' ? 'cursor-text' : tool === 'erase' ? 'cursor-pointer' : 'cursor-crosshair')}
                onPointerDown={(e) => void onDown(e)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            </div>
          )}
          {page && <p className="text-xs text-zinc-500">Page {current + 1} of {pages.length}</p>}
        </div>
      </div>
      {formOpen && <FormSheet forms={forms} answers={answers} names={sources.map((_, i) => (i === 0 ? file.name : `Added PDF ${i}`))} onChange={(src, name, v) => setAnswers((a) => ({ ...a, [src]: { ...a[src], [name]: v } }))} onClose={() => setFormOpen(false)} />}
      {signing && <SignaturePad onClose={() => setSigning(false)} onDone={(url) => { setSignature(url); setSigning(false); setTool('sign'); toast('Tap the page where it goes.'); }} />}
    </div>
  );
}

function SignaturePad({ onClose, onDone }: { onClose: () => void; onDone: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height }; };
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="sign-title" className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1d2650] p-5 space-y-3">
        <div className="flex items-center justify-between"><h2 id="sign-title" className="font-bold text-zinc-900 dark:text-white">Your signature</h2><button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button></div>
        <canvas ref={ref} width={600} height={220} className="w-full h-40 rounded-xl border border-zinc-300 bg-white touch-none cursor-crosshair" aria-label="Draw your signature here"
          onPointerDown={(e) => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* gone */ } last.current = pos(e); }}
          onPointerMove={(e) => { if (!last.current) return; const p = pos(e); const g = ref.current!.getContext('2d')!; g.strokeStyle = '#1d2650'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke(); last.current = p; setEmpty(false); }}
          onPointerUp={() => { last.current = null; }} />
        <div className="flex justify-between">
          <button type="button" onClick={() => { ref.current!.getContext('2d')!.clearRect(0, 0, 600, 220); setEmpty(true); }} className="btn-secondary btn-sm">Clear</button>
          <button type="button" disabled={empty} onClick={() => onDone(ref.current!.toDataURL('image/png'))} className="btn-primary btn-sm">Use this signature</button>
        </div>
      </div>
    </div>
  );
}

/** The form's fields to fill in; the answers go onto the pages when the PDF is saved. */
function FormSheet({ forms, answers, names, onChange, onClose }: { forms: Record<number, FormField[]>; answers: Record<number, FormValues>; names: string[]; onChange: (source: number, name: string, value: string | boolean) => void; onClose: () => void }) {
  const value = (src: number, f: FormField) => (f.name in (answers[src] ?? {}) ? answers[src][f.name] : f.value);
  const label = (name: string) => name.replace(/[._]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="pdf-form-title" className="bg-white dark:bg-zinc-900 w-full sm:max-w-lg max-h-[85vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 id="pdf-form-title" className="font-semibold text-zinc-900 dark:text-white">Fill in the form</h2>
          <button type="button" onClick={onClose} aria-label="Done" className="btn-primary btn-sm">Done</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-5">
          {Object.entries(forms).map(([k, fields]) => {
            const src = Number(k);
            return (
              <section key={k} aria-label={names[src]} className="space-y-3">
                {Object.keys(forms).length > 1 && <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{names[src]}</h3>}
                {fields.map((f) => {
                  const id = `pf-${src}-${f.name}`;
                  const v = value(src, f);
                  if (f.kind === 'check') return (
                    <label key={f.name} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200 min-h-11"><input type="checkbox" checked={v === true} onChange={(e) => onChange(src, f.name, e.target.checked)} className="w-4 h-4" />{label(f.name)}</label>
                  );
                  if (f.kind === 'radio') return (
                    <fieldset key={f.name} className="space-y-1">
                      <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label(f.name)}</legend>
                      {(f.options ?? []).map((o) => <label key={o} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200 min-h-9"><input type="radio" name={id} checked={v === o} onChange={() => onChange(src, f.name, o)} />{o}</label>)}
                    </fieldset>
                  );
                  return (
                    <div key={f.name}>
                      <label htmlFor={id} className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">{label(f.name)}</label>
                      {f.kind === 'choice' ? (
                        <select id={id} className="input" value={String(v)} onChange={(e) => onChange(src, f.name, e.target.value)}>
                          <option value="">—</option>
                          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.multiline ? (
                        <textarea id={id} className="input min-h-[4.5rem]" maxLength={f.maxLength} value={String(v)} onChange={(e) => onChange(src, f.name, e.target.value)} />
                      ) : (
                        <input id={id} className="input" maxLength={f.maxLength} value={String(v)} onChange={(e) => onChange(src, f.name, e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Your answers are written onto the pages when you save the PDF, so they show in any viewer.</p>
        </div>
      </div>
    </div>
  );
}
