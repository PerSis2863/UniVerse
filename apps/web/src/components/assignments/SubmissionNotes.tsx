'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, MessageSquarePlus, SquareDashedMousePointer, Trash2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { textParts, type Anchor } from '@/lib/note-anchor';
import { cn } from '@/lib/utils';

// Notes on a hand-in (Stage 5 · B3.3, src/server/submission-notes.ts): highlighted words in a typed
// answer, and boxes on the pages of a PDF or on a picture, each with a numbered comment. The teaching
// team adds them while grading (select words, or turn on "Draw a box" and drag); students read them
// once their grade is back. Pages are drawn with pdf.js (src/lib/pdf.ts), never run.

interface Note { id: string; anchor: Anchor; comment: string; author: { id: string; name: string } }
interface Data { notes: Note[]; canEdit: boolean }
export interface NotedSubmission { id: string; text: string; fileUrl?: string | null; fileName?: string | null }

const MAX_PAGES = 40;
const isPdf = (name?: string | null) => /\.pdf$/i.test(name ?? '');
const isImage = (name?: string | null) => /\.(png|jpe?g|gif|webp)$/i.test(name ?? '');

export function SubmissionNotes({ sub, title = 'Notes' }: { sub: NotedSubmission; title?: string }) {
  const key = `/api/assignments/submissions/${sub.id}/notes`;
  const { data, mutate } = useSWR<Data>(key, authedJson);
  const [pending, setPending] = useState<Anchor | null>(null);
  const [active, setActive] = useState<string | null>(null);
  if (!data) return <div className="h-24 rounded-2xl skeleton" />;
  const { notes, canEdit } = data;
  const number = new Map(notes.map((n, i) => [n.id, i + 1]));
  const send = async (body: Record<string, unknown>, ok: string) => {
    try { await authedJson(key, { method: 'POST', body: JSON.stringify(body) }); await mutate(); toast.success(ok); return true; }
    catch (e) { toast.error(errorMessage(e, 'That didn’t save.')); return false; }
  };
  const fileKind = sub.fileUrl ? (isPdf(sub.fileName) ? 'pdf' : isImage(sub.fileName) ? 'image' : null) : null;
  if (!canEdit && !notes.length) return null;
  return (
    <section className="panel p-5 space-y-4" aria-label={title}>
      <h3 className="font-semibold text-zinc-900 dark:text-white">{title} {notes.length > 0 && <span className="font-normal text-sm text-zinc-600 dark:text-zinc-400">· {notes.length}</span>}</h3>
      {canEdit && <p className="text-xs text-zinc-600 dark:text-zinc-400">{fileKind ? 'Turn on “Draw a box” and drag over the page to pin a note.' : 'Select words in the answer, then add a note.'} The student sees them when you return the grade.</p>}
      {fileKind === 'pdf' && <PdfPages url={sub.fileUrl!} notes={notes} number={number} canEdit={canEdit} active={active} onPick={setActive} onBox={setPending} />}
      {fileKind === 'image' && <BoxedPage page={1} notes={notes} number={number} canEdit={canEdit} active={active} onPick={setActive} onBox={setPending}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a file the student uploaded */}
        <img src={sub.fileUrl!} alt={sub.fileName ?? 'Picture handed in'} className="block w-full" draggable={false} />
      </BoxedPage>}
      {sub.text && <NotedText text={sub.text} notes={notes} number={number} canEdit={canEdit} active={active} onPick={setActive} onWords={setPending} />}
      {pending && <NewNote onCancel={() => setPending(null)} onSave={async (comment) => { if (await send({ action: 'add', anchor: pending, comment }, 'Note added')) setPending(null); }} />}
      {notes.length > 0 && (
        <ol className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={cn('flex gap-3 rounded-xl px-3 py-2 text-sm', active === n.id ? 'bg-amber-500/10' : 'bg-zinc-50 dark:bg-white/[0.03]')}>
              <button type="button" onClick={() => setActive(n.id)} className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 text-xs font-bold shrink-0" aria-label={`Show note ${number.get(n.id)}`}>{number.get(n.id)}</button>
              <div className="min-w-0 flex-1">
                <p className="text-zinc-900 dark:text-white whitespace-pre-wrap">{n.comment}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{n.anchor.type === 'box' ? `Page ${n.anchor.page}` : `“${n.anchor.quote.slice(0, 60)}${n.anchor.quote.length > 60 ? '…' : ''}”`} · {n.author.name}</p>
              </div>
              {canEdit && <button type="button" aria-label={`Delete note ${number.get(n.id)}`} onClick={() => void send({ action: 'delete', noteId: n.id }, 'Note deleted')} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 self-start"><Trash2 className="w-4 h-4" /></button>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NewNote({ onCancel, onSave }: { onCancel: () => void; onSave: (comment: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-400/[0.07] p-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(text); setBusy(false); }}>
      <label className="block text-sm font-medium text-zinc-900 dark:text-white">Your note
        <textarea autoFocus rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className="input mt-1" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary btn-sm">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add the note</button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm"><X className="w-3.5 h-3.5" /> Cancel</button>
      </div>
    </form>
  );
}

/** A typed answer with its noted words marked; select words to note them. */
function NotedText({ text, notes, number, canEdit, active, onPick, onWords }: {
  text: string; notes: Note[]; number: Map<string, number>; canEdit: boolean; active: string | null; onPick: (id: string) => void; onWords: (a: Anchor) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const read = () => {
    const s = window.getSelection();
    const el = box.current;
    if (!s || !el || s.isCollapsed || !s.rangeCount || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) { setSel(null); return; }
    const r = s.getRangeAt(0);
    const at = (node: Node, offset: number) => { const x = document.createRange(); x.selectNodeContents(el); x.setEnd(node, offset); return x.toString().length; };
    const start = at(r.startContainer, r.startOffset), end = at(r.endContainer, r.endOffset);
    setSel(end > start ? { start, end } : null);
  };
  return (
    <div className="space-y-2">
      <div ref={box} onMouseUp={canEdit ? read : undefined} onKeyUp={canEdit ? read : undefined} onTouchEnd={canEdit ? () => setTimeout(read, 0) : undefined}
        className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words max-h-[28rem] overflow-y-auto rounded-xl border border-zinc-200 dark:border-white/10 p-3">
        {textParts(text, notes.map((n) => ({ id: n.id, anchor: n.anchor }))).map((p, i) => p.noteId
          ? <mark key={i} onClick={() => onPick(p.noteId!)} className={cn('rounded-sm px-0.5 text-inherit cursor-pointer', active === p.noteId ? 'bg-amber-300 dark:bg-amber-400/50' : 'bg-amber-200/70 dark:bg-amber-400/25')}>{p.text}<sup className="ml-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">{number.get(p.noteId)}</sup></mark>
          : <span key={i}>{p.text}</span>)}
      </div>
      {canEdit && (
        <button type="button" disabled={!sel} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (sel) { onWords({ type: 'text', start: sel.start, end: sel.end, quote: text.slice(sel.start, sel.end).slice(0, 300) }); setSel(null); } }} className="btn-secondary btn-sm">
          <MessageSquarePlus className="w-4 h-4" /> Add a note on the selected words
        </button>
      )}
    </div>
  );
}

/** A page (a drawn PDF page or a picture) with its boxes; drag to draw one when drawing is on. */
function BoxedPage({ page, notes, number, canEdit, active, onPick, onBox, children }: {
  page: number; notes: Note[]; number: Map<string, number>; canEdit: boolean; active: string | null; onPick: (id: string) => void; onBox: (a: Anchor) => void; children: React.ReactNode;
}) {
  const [drawing, setDrawing] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pos = (e: React.PointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = drag && { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
  const boxes = notes.filter((n) => n.anchor.type === 'box' && n.anchor.page === page);
  return (
    <div className="space-y-1.5">
      {canEdit && (
        <button type="button" aria-pressed={drawing} onClick={() => setDrawing((d) => !d)} className={cn('btn-sm', drawing ? 'btn-primary' : 'btn-secondary')}>
          <SquareDashedMousePointer className="w-4 h-4" /> {drawing ? `Drawing on page ${page}: drag a box` : `Draw a box on page ${page}`}
        </button>
      )}
      <div className="relative rounded-lg overflow-hidden border border-zinc-200 dark:border-white/10 bg-white select-none">
        {children}
        <div ref={layer} className={cn('absolute inset-0', drawing && 'cursor-crosshair touch-none')}
          onPointerDown={drawing ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); } : undefined}
          onPointerMove={drawing && drag ? (e) => { const p = pos(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } : undefined}
          onPointerUp={drawing && drag ? () => { if (rect && rect.w > 0.01 && rect.h > 0.01) { onBox({ type: 'box', page, ...rect }); setDrawing(false); } setDrag(null); } : undefined}>
          {boxes.map((n) => {
            const a = n.anchor as Extract<Anchor, { type: 'box' }>;
            return (
              <button key={n.id} type="button" onClick={() => onPick(n.id)} aria-label={`Note ${number.get(n.id)}: ${n.comment.slice(0, 80)}`}
                style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }}
                className={cn('absolute border-2 rounded-sm', drawing && 'pointer-events-none', active === n.id ? 'border-amber-500 bg-amber-400/25' : 'border-amber-400 bg-amber-300/15')}>
                <span className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold grid place-items-center">{number.get(n.id)}</span>
              </button>
            );
          })}
          {rect && <span className="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/10" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}

/** A PDF's pages drawn one under the other (up to 40), each with its boxes. */
function PdfPages({ url, ...rest }: { url: string; notes: Note[]; number: Map<string, number>; canEdit: boolean; active: string | null; onPick: (id: string) => void; onBox: (a: Anchor) => void }) {
  const [pages, setPages] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    let live = true;
    let close: (() => void) | null = null;
    void (async () => {
      try {
        const { openPdf, drawPage } = await import('@/lib/pdf');
        const doc = await openPdf(url);
        close = () => void doc.destroy();
        if (!live) return;
        const n = Math.min(doc.numPages, MAX_PAGES);
        setPages(n);
        await new Promise((r) => requestAnimationFrame(r));
        const width = Math.min(900, holder.current?.clientWidth ?? 600);
        for (let i = 1; i <= n && live; i++) { const c = canvases.current[i - 1]; if (c) await drawPage(doc, i, c, width); }
      } catch { if (live) setFailed(true); }
    })();
    return () => { live = false; close?.(); };
  }, [url]);
  if (failed) return <p className="text-sm text-zinc-600 dark:text-zinc-400">This PDF couldn’t be shown here. Open it from the hand-in above.</p>;
  return (
    <div ref={holder} className="space-y-4 max-h-[80vh] overflow-y-auto">
      {pages === null ? <div className="h-64 rounded-xl skeleton" /> : Array.from({ length: pages }, (_, i) => (
        <BoxedPage key={i} page={i + 1} {...rest}>
          <canvas ref={(c) => { canvases.current[i] = c; }} className="block w-full h-auto" aria-label={`Page ${i + 1}`} />
        </BoxedPage>
      ))}
    </div>
  );
}
