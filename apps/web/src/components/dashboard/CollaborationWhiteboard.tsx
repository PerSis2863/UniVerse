'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Download, Eraser, PenTool, Redo, Share2, Square, Trash2, Type, Undo } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';

type Pt = { x: number; y: number };
type Shape =
  | { kind: 'pen'; points: Pt[]; color: string; width: number }
  | { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: 'text'; x: number; y: number; text: string; color: string; size: number };
type Tool = 'pen' | 'rect' | 'ellipse' | 'text' | 'eraser';

const COLORS = ['#111827', '#4f46e5', '#db2777', '#059669', '#d97706', '#dc2626'];
const TOOLS: { id: Tool; icon: typeof PenTool; label: string; key: string }[] = [
  { id: 'pen', icon: PenTool, label: 'Pen', key: 'p' },
  { id: 'rect', icon: Square, label: 'Rectangle', key: 'r' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', key: 'o' },
  { id: 'text', icon: Type, label: 'Text', key: 't' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', key: 'e' },
];

function draw(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.kind === 'pen') {
    ctx.lineWidth = s.width;
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
    ctx.stroke();
  } else if (s.kind === 'rect') {
    ctx.lineWidth = s.width;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  } else if (s.kind === 'ellipse') {
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.kind === 'text') {
    ctx.font = `600 ${s.size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(s.text, s.x, s.y);
  }
}

function hits(s: Shape, p: Pt, r: number, ctx: CanvasRenderingContext2D | null) {
  if (s.kind === 'pen') return s.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= r + s.width / 2);
  if (s.kind === 'text') {
    const w = ctx ? (ctx.font = `600 ${s.size}px ui-sans-serif, system-ui, sans-serif`, ctx.measureText(s.text).width) : s.text.length * s.size * 0.6;
    return p.x >= s.x - r && p.x <= s.x + w + r && p.y >= s.y - r && p.y <= s.y + s.size + r;
  }
  const x0 = Math.min(s.x, s.x + s.w), x1 = Math.max(s.x, s.x + s.w), y0 = Math.min(s.y, s.y + s.h), y1 = Math.max(s.y, s.y + s.h);
  const inside = p.x >= x0 - r && p.x <= x1 + r && p.y >= y0 - r && p.y <= y1 + r;
  const deep = p.x > x0 + r && p.x < x1 - r && p.y > y0 + r && p.y < y1 - r;
  return inside && !deep; // only the outline, so erasing inside a box doesn't remove it
}

/** A personal whiteboard: drawings are saved on this device (per board) and can be exported or shared as an image. */
export function CollaborationWhiteboard({ boardId = 'default', title = 'Whiteboard' }: { boardId?: string; title?: string }) {
  const storageKey = `universe:whiteboard:${boardId}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [redo, setRedo] = useState<Shape[][]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[1]);
  const [width, setWidth] = useState(3);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [textValue, setTextValue] = useState('');
  const start = useRef<Pt | null>(null);
  const erasing = useRef<{ before: Shape[] } | null>(null);

  // Load/save per board.
  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); setShapes(raw ? JSON.parse(raw) : []); } catch { setShapes([]); }
    setUndoStack([]); setRedo([]);
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(shapes)); } catch { /* storage full or blocked — board still works in memory */ }
  }, [shapes, storageKey]);

  const render = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width / dpr, c.height / dpr);
    for (const s of shapes) draw(ctx, s);
    if (draft) draw(ctx, draft);
  }, [shapes, draft]);

  // Keep the canvas sharp and sized to its container.
  useEffect(() => {
    const c = canvasRef.current, wrap = wrapRef.current;
    if (!c || !wrap) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(wrap.clientWidth * dpr);
      c.height = Math.round(wrap.clientHeight * dpr);
      render();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [render]);
  useEffect(render, [render]);

  const commit = (next: Shape[], before = shapes) => {
    setUndoStack((u) => [...u.slice(-49), before]);
    setRedo([]);
    setShapes(next);
  };
  const undo = useCallback(() => {
    if (!undoStack.length) return;
    setRedo((r) => [...r, shapes]);
    setShapes(undoStack[undoStack.length - 1]);
    setUndoStack(undoStack.slice(0, -1));
  }, [shapes, undoStack]);
  const redoFn = useCallback(() => {
    if (!redo.length) return;
    setUndoStack((u) => [...u, shapes]);
    setShapes(redo[redo.length - 1]);
    setRedo(redo.slice(0, -1));
  }, [shapes, redo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoFn(); else undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoFn(); return; }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && !e.metaKey && !e.ctrlKey && !e.altKey && wrapRef.current?.matches(':hover')) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redoFn]);

  const pos = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const eraseAt = (p: Pt) => {
    const ctx = canvasRef.current?.getContext('2d') ?? null;
    setShapes((cur) => cur.filter((s) => !hits(s, p, 8, ctx)));
  };

  const onDown = (e: React.PointerEvent) => {
    if (textAt) return;
    const p = pos(e);
    if (tool === 'text') { setTextAt(p); setTextValue(''); return; }
    (e.target as Element).setPointerCapture(e.pointerId);
    start.current = p;
    if (tool === 'eraser') { erasing.current = { before: shapes }; eraseAt(p); return; }
    setDraft(tool === 'pen' ? { kind: 'pen', points: [p], color, width } : { kind: tool, x: p.x, y: p.y, w: 0, h: 0, color, width });
  };
  const onMove = (e: React.PointerEvent) => {
    const from = start.current;
    if (!from) return;
    const p = pos(e);
    if (tool === 'eraser') return eraseAt(p);
    setDraft((d) => {
      if (!d) return d;
      if (d.kind === 'pen') return { ...d, points: [...d.points, p] };
      if (d.kind === 'rect' || d.kind === 'ellipse') {
        let w = p.x - from.x, h = p.y - from.y; // not start.current: this runs later, maybe after pointer up
        if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        return { ...d, w, h };
      }
      return d;
    });
  };
  const onUp = () => {
    if (erasing.current) {
      const before = erasing.current.before;
      erasing.current = null;
      start.current = null;
      if (before.length !== shapes.length) { setUndoStack((u) => [...u.slice(-49), before]); setRedo([]); }
      return;
    }
    start.current = null;
    if (!draft) return;
    const tiny = (draft.kind === 'rect' || draft.kind === 'ellipse') && Math.abs(draft.w) < 3 && Math.abs(draft.h) < 3;
    if (!tiny) commit([...shapes, draft]);
    setDraft(null);
  };

  const placeText = () => {
    if (textAt && textValue.trim()) commit([...shapes, { kind: 'text', x: textAt.x, y: textAt.y, text: textValue.trim(), color, size: 12 + width * 3 }]);
    setTextAt(null);
    setTextValue('');
  };

  const toBlob = () => new Promise<Blob>((resolve, reject) => {
    const c = canvasRef.current;
    if (!c) return reject(new Error('Nothing to export'));
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png');
  });
  const fileName = `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'whiteboard'}.png`;

  const exportPng = async () => {
    try {
      const url = URL.createObjectURL(await toBlob());
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Whiteboard saved as an image');
    } catch (e) { toast.error((e as Error).message); }
  };

  const share = async () => {
    try {
      const blob = await toBlob();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast.success('Image copied — paste it into any chat or message');
        return;
      }
      await exportPng();
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error('Could not share the image. Try Export instead.');
    }
  };

  const clear = () => {
    if (!shapes.length) return;
    const before = shapes;
    commit([]);
    toast('Whiteboard cleared', { action: { label: 'Undo', onClick: () => commit(before, []) } });
  };

  const iconBtn = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40';

  return (
    <div className="flex flex-col h-[600px] rounded-2xl border border-zinc-200 dark:border-white/10 overflow-hidden bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl shadow-sm">
      <div className="border-b border-zinc-200 dark:border-white/10 px-3 py-2 flex items-center gap-2 overflow-x-auto scrollbar-none">
        {TOOLS.map((t) => (
          <button key={t.id} title={`${t.label} (${t.key.toUpperCase()})`} aria-label={t.label} onClick={() => setTool(t.id)}
            className={cn('relative isolate', iconBtn, tool === t.id ? 'text-indigo-600 dark:text-indigo-300' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10')}>{tool === t.id && <TabPill id="oard-collaborationwhiteboard-0" variant="soft" />}
            <t.icon className="w-4 h-4" />
          </button>
        ))}
        <div className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1 shrink-0" />
        {COLORS.map((c) => (
          <button key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)}
            className={cn('w-6 h-6 shrink-0 rounded-full border-2 transition-transform', color === c ? 'border-indigo-400 scale-110' : 'border-white dark:border-zinc-800')} style={{ background: c }} />
        ))}
        <select aria-label="Thickness" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="shrink-0 ml-1 text-xs rounded-lg bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 px-2 py-1.5">
          <option value={2}>Thin</option><option value={3}>Medium</option><option value={6}>Thick</option><option value={10}>Marker</option>
        </select>
        <div className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-1 shrink-0" />
        <button title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={!undoStack.length} className={cn(iconBtn, 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10')}><Undo className="w-4 h-4" /></button>
        <button title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redoFn} disabled={!redo.length} className={cn(iconBtn, 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10')}><Redo className="w-4 h-4" /></button>
        <button title="Clear" aria-label="Clear whiteboard" onClick={clear} disabled={!shapes.length} className={cn(iconBtn, 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-500')}><Trash2 className="w-4 h-4" /></button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button onClick={share} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Share</button>
          <button onClick={exportPng} className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Export</button>
        </div>
      </div>

      <div ref={wrapRef} className="relative flex-1 touch-none">
        <canvas
          ref={canvasRef}
          className={cn('absolute inset-0 w-full h-full', tool === 'text' ? 'cursor-text' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        />
        {textAt && (
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') placeText(); if (e.key === 'Escape') setTextAt(null); }}
            onBlur={placeText}
            placeholder="Type, then press Enter"
            maxLength={200}
            className="absolute px-1 py-0.5 bg-white/90 border border-indigo-400 rounded outline-none text-zinc-900 font-semibold"
            style={{ left: textAt.x, top: textAt.y - 2, color, fontSize: 12 + width * 3, minWidth: 160 }}
          />
        )}
        {!shapes.length && !draft && !textAt && (
          <p className="absolute inset-x-0 bottom-4 text-center text-xs text-zinc-400 pointer-events-none">Draw with the pen, add shapes or text. Your board is saved on this device.</p>
        )}
      </div>
    </div>
  );
}
