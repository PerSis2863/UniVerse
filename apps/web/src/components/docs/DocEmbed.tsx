'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type Editor, type NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { CheckCircle2, Circle, Code2, ExternalLink, FileText, KanbanSquare, Loader2, PenTool, Play, Plus, Sigma, Trash2, Upload, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { AppLinkCard } from '@/components/chat/LinkCards';
import { PdfViewer } from '@/components/chat/FilePreview';
import { uploadChatFile } from '@/components/chat/chat-client';
import { authedJson } from '@/lib/authed-fetch';
import { EMBED_LABEL, embedHref, safeEmbed, videoEmbed, type EmbedAttrs, type EmbedKind } from '@/lib/doc-embeds';
import { isUploadedFileUrl } from '@/lib/file-urls';
import { parseChapters } from '@/lib/lesson-page';
import { firstPage } from '@/lib/pdf';
import { cn } from '@/lib/utils';

// Embeds in a document (Stage 5 · B9.5; src/lib/doc-embeds.ts): one "embed" block for a video
// (YouTube or uploaded), a PDF (first page, open to read), a whiteboard (a live card), a task board
// (its cards, live), code that runs (Python, JavaScript, TypeScript or SQL, in the browser) or maths (KaTeX, as
// MathML). They sync like any edit; in HTML (versions, downloads) they become a link, the code or
// the maths. Videos can have chapters (Stage 5 · B2 lesson pages): a click jumps there.

const ATTRS = ['kind', 'src', 'title', 'lang', 'code', 'tex', 'chapters'] as const;

export const DocEmbed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return Object.fromEntries(ATTRS.map((name) => [name, {
      default: name === 'lang' ? 'python' : '',
      parseHTML: (el: HTMLElement) => (name === 'code' ? el.querySelector('code')?.textContent ?? '' : el.getAttribute(name === 'kind' ? 'data-embed' : `data-${name}`) ?? ''),
      renderHTML: (attrs: Record<string, string>) => (name === 'code' || !attrs[name] ? {} : { [name === 'kind' ? 'data-embed' : `data-${name}`]: attrs[name] }),
    }]));
  },
  parseHTML() { return [{ tag: 'div[data-embed]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs as EmbedAttrs;
    if (a.kind === 'code') return ['div', HTMLAttributes, ['pre', {}, ['code', {}, a.code]]];
    if (a.kind === 'math') return ['div', HTMLAttributes, a.tex];
    const href = embedHref(a);
    return ['div', HTMLAttributes, href ? ['a', { href }, `${EMBED_LABEL[a.kind] ?? 'Embed'}: ${a.title || href}`] : (EMBED_LABEL[a.kind] ?? 'Embed')];
  },
  addNodeView() { return ReactNodeViewRenderer(EmbedView); },
});

function EmbedView({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const a = node.attrs as EmbedAttrs;
  const editable = useEditorState({ editor, selector: ({ editor: e }) => e.isEditable });
  const ok = safeEmbed(a);
  return (
    <NodeViewWrapper className={cn('doc-embed my-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50/60 dark:bg-white/[0.03] overflow-hidden', selected && 'ring-2 ring-indigo-500')} contentEditable={false}>
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-200/70 dark:border-white/[0.06]" data-drag-handle>
        <span className="flex-1 truncate">{EMBED_LABEL[a.kind] ?? 'Embed'}{a.title ? ` · ${a.title}` : ''}</span>
        {editable && <button type="button" onClick={() => deleteNode()} aria-label={`Remove this ${(EMBED_LABEL[a.kind] ?? 'embed').toLowerCase()}`} className="p-1.5 -my-1 rounded-md hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="p-3">
        {!ok ? <p className="text-sm text-zinc-500">This can’t be shown here.</p>
          : a.kind === 'youtube' || a.kind === 'video' ? <VideoEmbed attrs={a} editable={editable} update={updateAttributes} />
          : a.kind === 'pdf' ? <PdfEmbed url={a.src} name={a.title || 'PDF'} />
          : a.kind === 'board' ? <AppLinkCard kind="board" id={a.src} url={`/boards/${a.src}`} mine={false} />
          : a.kind === 'tasks' ? <TasksEmbed boardId={a.src} />
          : a.kind === 'code' ? <CodeEmbed attrs={a} editable={editable} update={updateAttributes} />
          : a.kind === 'math' ? <MathEmbed tex={a.tex} editable={editable} update={updateAttributes} />
          : null}
      </div>
    </NodeViewWrapper>
  );
}

/** A video with its chapters: a click on one jumps there (YouTube reloads at that time). */
function VideoEmbed({ attrs, editable, update }: { attrs: EmbedAttrs; editable: boolean; update: (a: Partial<EmbedAttrs>) => void }) {
  const chapters = parseChapters(attrs.chapters);
  const video = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [draft, setDraft] = useState(attrs.chapters ?? '');
  const [seen, setSeen] = useState(attrs.chapters);
  if (attrs.chapters !== seen) { setSeen(attrs.chapters); setDraft(attrs.chapters ?? ''); }
  const jump = (at: number) => {
    setNow(at);
    if (attrs.kind === 'video' && video.current) { video.current.currentTime = at; void video.current.play().catch(() => {}); }
    else setStart(at);
  };
  // The chapter playing now: the last one that started before the current time.
  const current = now === null ? -1 : chapters.reduce((last, c, i) => (c.at <= now ? i : last), -1);
  return (
    <div className="space-y-2">
      {attrs.kind === 'youtube'
        ? <iframe key={start ?? 'start'} src={`https://www.youtube-nocookie.com/embed/${attrs.src}${start !== null ? `?start=${start}&autoplay=1` : ''}`} title={attrs.title || 'Video'} loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen className="w-full aspect-video rounded-xl border-0" />
        : <video ref={video} src={attrs.src} controls preload="metadata" className="w-full rounded-xl bg-black" aria-label={attrs.title || 'Video'} onTimeUpdate={chapters.length ? (e) => setNow(Math.floor(e.currentTarget.currentTime)) : undefined} />}
      {chapters.length > 0 && (
        <ol aria-label="Chapters" className="space-y-0.5">
          {chapters.map((c, i) => (
            <li key={`${c.at}-${i}`}>
              <button type="button" onClick={() => jump(c.at)} aria-current={i === current ? 'true' : undefined}
                className={cn('w-full text-start flex gap-3 px-2 py-1.5 rounded-lg text-sm transition-colors', i === current ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-200' : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
                <span className="tabular-nums font-semibold text-indigo-700 dark:text-indigo-300 w-14 shrink-0">{c.label}</span><span className="min-w-0">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {editable && (
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Chapters (optional, one per line, e.g. <code>0:00 Introduction</code>, <code>4:30 First example</code>)
          <textarea value={draft} rows={Math.min(8, Math.max(2, draft.split('\n').length))} onChange={(e) => setDraft(e.target.value.slice(0, 4000))} onBlur={() => { if (draft !== (attrs.chapters ?? '')) update({ chapters: draft }); }} spellCheck={false} className="input mt-1 py-1.5 font-mono text-sm" />
        </label>
      )}
    </div>
  );
}

function PdfEmbed({ url, name }: { url: string; name: string }) {
  const [thumb, setThumb] = useState<{ src: string; pages: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    firstPage(url, 480).then((t) => { if (live) setThumb(t); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [url]);
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 w-28 aspect-[3/4] rounded-lg overflow-hidden border border-zinc-200 dark:border-white/10 bg-white grid place-items-center" aria-label={`Open ${name}`}>
        {thumb ? <span className="block w-full h-full bg-cover bg-top" style={{ backgroundImage: `url(${thumb.src})` }} aria-hidden /> : failed ? <FileText className="w-6 h-6 text-zinc-400" aria-hidden /> : <Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-hidden />}
      </button>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{name}</p>
        {thumb && <p className="text-xs text-zinc-500">{thumb.pages} page{thumb.pages === 1 ? '' : 's'}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">Read</button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><ExternalLink className="w-3.5 h-3.5" />Open</a>
        </div>
      </div>
      {open && <PdfViewer url={url} name={name} onClose={() => setOpen(false)} />}
    </div>
  );
}

interface Board { title: string; lists: { id: string; title: string }[]; tasks: { id: string; listId: string; title: string; doneAt: string | null; dueAt: string | null }[] }
function TasksEmbed({ boardId }: { boardId: string }) {
  // The same address the board page uses, so changes elsewhere refresh this too.
  const { data, error } = useSWR<Board>(`/api/tasks/${boardId}`, authedJson);
  if (error) return <p className="text-sm text-zinc-500">You can’t open this task board.</p>;
  if (!data) return <div className="h-24 rounded-xl skeleton" />;
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {data.lists.map((l) => {
          const cards = data.tasks.filter((t) => t.listId === l.id);
          return (
            <div key={l.id} className="w-48 shrink-0 rounded-xl bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 p-2">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1.5">{l.title} <span className="text-zinc-400 font-normal">{cards.length}</span></p>
              <div role="list" className="space-y-1">
                {cards.slice(0, 8).map((t) => (
                  <div role="listitem" key={t.id} className="flex items-start gap-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                    {t.doneAt ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" aria-label="Done" /> : <Circle className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-px" aria-hidden />}
                    <span className={cn('min-w-0', t.doneAt && 'line-through text-zinc-500')}>{t.title}</span>
                  </div>
                ))}
                {cards.length > 8 && <p className="text-[11px] text-zinc-500">and {cards.length - 8} more</p>}
                {!cards.length && <p className="text-[11px] text-zinc-500">Nothing here</p>}
              </div>
            </div>
          );
        })}
      </div>
      <Link href={`/tasks/${boardId}`} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><KanbanSquare className="w-3.5 h-3.5" aria-hidden />Open {data.title}</Link>
    </div>
  );
}

function CodeEmbed({ attrs, editable, update }: { attrs: EmbedAttrs; editable: boolean; update: (a: Partial<EmbedAttrs>) => void }) {
  const [code, setCode] = useState(attrs.code);
  const [out, setOut] = useState<{ lines: string[]; error: string | null } | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typing, setTyping] = useState(false);
  // Someone else changed it: show theirs (unless I'm typing).
  const [seen, setSeen] = useState(attrs.code);
  if (attrs.code !== seen) { setSeen(attrs.code); if (!typing) setCode(attrs.code); }
  const change = (v: string) => {
    setCode(v);
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setTyping(false); update({ code: v }); }, 500);
  };
  const run = async () => {
    setRunning(true);
    try {
      const { runCode } = await import('@/lib/code-runner');
      const r = await runCode(attrs.lang || 'python', code);
      setOut({ lines: r.lines, error: r.timedOut ? 'It took too long and was stopped.' : r.error });
    } catch (e) { setOut({ lines: [], error: (e as Error).message }); }
    finally { setRunning(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select value={attrs.lang} disabled={!editable} onChange={(e) => update({ lang: e.target.value })} aria-label="Language" className="input py-1 text-xs w-auto">
          <option value="python">Python</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="sql">SQL</option>
        </select>
        <button type="button" onClick={() => void run()} disabled={running} className="btn-primary btn-sm">{running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}Run</button>
      </div>
      {editable
        ? <textarea value={code} onChange={(e) => change(e.target.value.slice(0, 20_000))} spellCheck={false} rows={Math.min(16, Math.max(3, code.split('\n').length))} aria-label="Code" className="w-full font-mono text-sm rounded-xl bg-zinc-900 text-zinc-100 p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        : <pre className="!m-0"><code>{code}</code></pre>}
      {out && (
        <div aria-live="polite" className="rounded-xl bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 p-2.5 font-mono text-xs whitespace-pre-wrap max-h-56 overflow-auto">
          {out.lines.length ? out.lines.join('\n') : !out.error && <span className="text-zinc-500">(no output)</span>}
          {out.error && <span className="block text-rose-600 dark:text-rose-400">{out.error}</span>}
        </div>
      )}
    </div>
  );
}

function MathEmbed({ tex, editable, update }: { tex: string; editable: boolean; update: (a: Partial<EmbedAttrs>) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [draft, setDraft] = useState(tex);
  const [seen, setSeen] = useState(tex);
  if (tex !== seen) { setSeen(tex); setDraft(tex); }
  useEffect(() => {
    let live = true;
    void import('katex').then(({ default: katex }) => {
      if (live) setHtml(katex.renderToString(draft || '\\;', { displayMode: true, output: 'mathml', throwOnError: false, maxSize: 20, maxExpand: 200 }));
    });
    return () => { live = false; };
  }, [draft]);
  return (
    <div className="space-y-2">
      {html === null ? <div className="h-10 rounded-lg skeleton" /> : <div className="text-lg overflow-x-auto text-zinc-900 dark:text-zinc-100" dangerouslySetInnerHTML={{ __html: html }} />}
      {editable && (
        <label className="block text-xs text-zinc-500">Maths (LaTeX, e.g. <code>\frac{'{a}{b}'}</code>, <code>x^2</code>, <code>\sqrt{'{x}'}</code>)
          <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 2000))} onBlur={() => { if (draft !== tex) update({ tex: draft }); }} spellCheck={false} className="input mt-1 py-1.5 font-mono text-sm" />
        </label>
      )}
    </div>
  );
}

// ── Insert menu ──────────────────────────────────────────────────────────────────────────────

type Step = 'menu' | 'video' | 'pdf' | 'board' | 'tasks';
/** Puts an embed at the cursor, or after the embed (or picture) that's selected rather than over it. */
function insert(editor: Editor, attrs: Partial<EmbedAttrs> & { kind: EmbedKind }) {
  const node = { type: 'embed', attrs };
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) editor.chain().focus().insertContentAt(selection.to, node).run();
  else editor.chain().focus().insertContent(node).run();
}

type MenuId = Step | 'code' | 'math';
/** Something else the menu can put in (lesson pages add callouts, quick checks and flashcards). */
export interface ExtraInsert { id: string; label: string; icon: typeof Video; run: (editor: Editor) => void }

export function EmbedMenu({ editor, disabled, kinds, extra = [] }: {
  editor: Editor | null; disabled: boolean;
  /** Which of the embeds to offer (all of them when not given). */
  kinds?: MenuId[];
  extra?: ExtraInsert[];
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boards = useSWR<{ id: string; title: string }[]>(step === 'board' ? '/api/boards' : null, authedJson);
  const taskBoards = useSWR<{ boards: { id: string; title: string }[] }>(step === 'tasks' ? '/api/tasks' : null, authedJson);
  const close = () => { setStep(null); setUrl(''); };
  const put = (attrs: Partial<EmbedAttrs> & { kind: EmbedKind }) => { if (editor) insert(editor, attrs); close(); };
  const upload = async (f: File | undefined) => {
    if (!f || !step) return;
    setBusy(true);
    try { const src = await uploadChatFile(f); put({ kind: step === 'pdf' ? 'pdf' : 'video', src, title: f.name }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const addLink = () => {
    if (step === 'video') { const v = videoEmbed(url); if (!v) { toast.error('Paste a YouTube link, or upload a video.'); return; } put({ ...v, title: v.kind === 'youtube' ? 'YouTube' : 'Video' }); }
    else if (step === 'pdf') { if (!isUploadedFileUrl(url.trim())) { toast.error('Paste the link of a PDF uploaded here, or upload one.'); return; } put({ kind: 'pdf', src: url.trim(), title: 'PDF' }); }
  };
  const items = ([
    { id: 'video', label: 'Video', icon: Video }, { id: 'pdf', label: 'PDF', icon: FileText }, { id: 'board', label: 'Whiteboard', icon: PenTool },
    { id: 'tasks', label: 'Task board', icon: KanbanSquare }, { id: 'code', label: 'Code that runs', icon: Code2 }, { id: 'math', label: 'Maths', icon: Sigma },
  ] as { id: MenuId; label: string; icon: typeof Video }[]).filter((it) => !kinds || kinds.includes(it.id));
  const picks = step === 'board' ? boards.data?.map((b) => ({ id: b.id, title: b.title })) : step === 'tasks' ? taskBoards.data?.boards : undefined;
  return (
    <div className="relative shrink-0">
      <button type="button" disabled={disabled || !editor} onMouseDown={(e) => e.preventDefault()} onClick={() => (step ? close() : setStep('menu'))} aria-expanded={!!step} title="Insert" aria-label={kinds || extra.length ? "Insert a video, maths, a callout or another block" : "Insert a video, PDF, board, code or maths"}
        className={cn('h-8 px-2 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40', step ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}>
        <Plus className="w-4 h-4" /><span className="max-sm:sr-only">Insert</span>
      </button>
      {step && (
        <div className="absolute end-0 top-10 z-40 w-72 rounded-2xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 shadow-2xl p-2" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
          {step === 'menu' && (
            <ul>
              {items.map((it) => (
                <li key={it.id}>
                  <button type="button" onClick={() => (it.id === 'code' ? put({ kind: 'code', lang: 'python', code: 'print("Hello!")' }) : it.id === 'math' ? put({ kind: 'math', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' }) : setStep(it.id))}
                    className="w-full text-start px-2 py-2 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-2"><it.icon className="w-4 h-4 text-indigo-500" aria-hidden />{it.label}</button>
                </li>
              ))}
              {extra.map((it) => (
                <li key={it.id}>
                  <button type="button" onClick={() => { if (editor) it.run(editor); close(); }}
                    className="w-full text-start px-2 py-2 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] inline-flex items-center gap-2"><it.icon className="w-4 h-4 text-indigo-500" aria-hidden />{it.label}</button>
                </li>
              ))}
            </ul>
          )}
          {(step === 'video' || step === 'pdf') && (
            <div className="space-y-2 p-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">{step === 'video' ? 'A video' : 'A PDF'}</p>
              <input type="file" ref={fileRef} accept={step === 'video' ? 'video/*' : 'application/pdf'} className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary btn-sm w-full">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Upload {step === 'video' ? 'a video' : 'a PDF'}</button>
              <form onSubmit={(e) => { e.preventDefault(); addLink(); }} className="flex gap-1.5">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={step === 'video' ? 'or paste a YouTube link' : 'or paste a file link from here'} aria-label={step === 'video' ? 'YouTube or video link' : 'PDF link'} className="input py-1.5 text-sm flex-1 min-w-0" />
                <button type="submit" disabled={!url.trim()} className="btn-primary btn-sm">Add</button>
              </form>
            </div>
          )}
          {(step === 'board' || step === 'tasks') && (
            <div className="p-1 space-y-1.5">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">{step === 'board' ? 'Which whiteboard?' : 'Which task board?'}</p>
              {!picks ? <div className="h-16 rounded-xl skeleton" /> : !picks.length ? <p className="text-xs text-zinc-500">You don’t have any yet.</p> : (
                <ul className="max-h-60 overflow-y-auto">
                  {picks.slice(0, 50).map((b) => <li key={b.id}><button type="button" onClick={() => put({ kind: step, src: b.id, title: b.title })} className="w-full text-start px-2 py-1.5 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] truncate">{b.title}</button></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
