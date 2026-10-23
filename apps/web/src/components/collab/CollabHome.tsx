'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { formatDistanceStrict } from 'date-fns';
import { CalendarClock, Code2, File, FileSpreadsheet, FileText, Flame, Keyboard, KanbanSquare, LayoutTemplate, Loader2, NotebookPen, PenTool, Pin, PinOff, Presentation, QrCode as QrIcon, Search, Sparkles, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Sheet } from '@/components/ui/Sheet';
import { QrCode } from '@/components/ui/QrCode';
import { authedJson } from '@/lib/authed-fetch';
import { useNow } from '@/lib/use-now';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { DOC_TEMPLATES } from '@/lib/doc-templates';
import { type Pin as PinT, type PinKind, MAX_PINS } from '@/lib/collab-pins';
import { focusNow, pause, setFocus, start } from '@/lib/focus-timer';
import { activityDays, dueThisWeek, notesToHtml, streakOf } from '@/lib/collab-home';
import { FocusTimer } from './FocusTimer';

// Collaborate → Home (M17): everything someone works on with others, from every tool, in one place:
// pinned items, recent work, one search across all of it, templates, a focus timer, quick notes, what's
// due this week and how active the work has been. Shortcuts: / search, d s p b t new, f timer, ? help.

type Item = PinT & { at: string; sub: string };

const KIND: Record<PinKind, { label: string; icon: LucideIcon; tone: string }> = {
  board: { label: 'Whiteboard', icon: PenTool, tone: 'from-violet-500 to-fuchsia-500' },
  doc: { label: 'Document', icon: FileText, tone: 'from-indigo-500 to-fuchsia-500' },
  sheet: { label: 'Spreadsheet', icon: FileSpreadsheet, tone: 'from-indigo-400 to-indigo-600' },
  slides: { label: 'Presentation', icon: Presentation, tone: 'from-fuchsia-400 to-fuchsia-600' },
  tasks: { label: 'Task board', icon: KanbanSquare, tone: 'from-fuchsia-400 to-fuchsia-600' },
  code: { label: 'Code room', icon: Code2, tone: 'from-indigo-600 to-fuchsia-600' },
  file: { label: 'File', icon: File, tone: 'from-zinc-500 to-zinc-700' },
};
const FILTERS: [PinKind | 'all', string][] = [['all', 'Everything'], ['doc', 'Docs'], ['sheet', 'Sheets'], ['slides', 'Slides'], ['board', 'Boards'], ['tasks', 'Tasks'], ['code', 'Code'], ['file', 'Files']];
const CREATE: [string, string, LucideIcon, string][] = [
  ['d', 'Document', FileText, '/docs?new=doc'], ['s', 'Spreadsheet', FileSpreadsheet, '/docs?new=sheet'], ['p', 'Presentation', Presentation, '/docs?new=slides'],
  ['b', 'Whiteboard', PenTool, '/boards?new=1'], ['t', 'Task board', KanbanSquare, '/tasks?new=1'],
];
const NOTES_KEY = 'uv-collab-notes';

interface Boards { id: string; title: string; updatedAt: string; owner: { name: string }; mine: boolean }
interface Docs { docs: { id: string; title: string; kind?: string; course: string | null; updatedAt: string }[] }
interface Tasks { boards: { id: string; title: string; course: string | null; tasks: number; updatedAt: string }[]; mine: { id: string; title: string; dueAt: string | null; boardId: string; board: string; list: string }[] }
interface Code { rooms: { id: string; title: string; language: string; updatedAt: string }[] }
interface Files { files: { id: string; name: string; updatedAt: string; space: { label: string; href: string } }[] }

const docKind = (k?: string): PinKind => (k === 'sheet' ? 'sheet' : k === 'slides' ? 'slides' : 'doc');
const docPath: Record<string, string> = { doc: '/docs', sheet: '/sheets', slides: '/slides' };

export function CollabHome() {
  const router = useRouter();
  const now = useNow();
  const opt = { revalidateOnFocus: false };
  const boards = useSWR<Boards[]>('/api/boards', authedJson, opt);
  const docs = useSWR<Docs>('/api/docs', authedJson, opt);
  const tasks = useSWR<Tasks>('/api/tasks', authedJson, opt);
  const code = useSWR<Code>('/api/code', authedJson, opt);
  const files = useSWR<Files>('/api/files-hub?view=recent', authedJson, opt);
  const pins = useSWR<{ pins: PinT[] }>('/api/collab/pins', authedJson, opt);
  const loading = boards.isLoading || docs.isLoading || tasks.isLoading;

  // Every item from every tool, newest first.
  const items = useMemo<Item[]>(() => [
    ...(Array.isArray(boards.data) ? boards.data : []).map((b) => ({ kind: 'board' as const, id: b.id, title: b.title, href: `/boards/${b.id}`, at: b.updatedAt, sub: b.mine ? 'Yours' : `From ${b.owner.name}` })),
    ...(docs.data?.docs ?? []).map((d) => { const k = docKind(d.kind); return { kind: k, id: d.id, title: d.title, href: `${docPath[k]}/${d.id}`, at: d.updatedAt, sub: d.course ?? 'Yours and shared' }; }),
    ...(tasks.data?.boards ?? []).map((t) => ({ kind: 'tasks' as const, id: t.id, title: t.title, href: `/tasks/${t.id}`, at: t.updatedAt, sub: `${t.tasks} card${t.tasks === 1 ? '' : 's'}${t.course ? ` · ${t.course}` : ''}` })),
    ...(code.data?.rooms ?? []).map((r) => ({ kind: 'code' as const, id: r.id, title: r.title, href: `/code/${r.id}`, at: r.updatedAt, sub: r.language })),
    ...(files.data?.files ?? []).map((f) => ({ kind: 'file' as const, id: f.id, title: f.name, href: f.space.href, at: f.updatedAt, sub: f.space.label })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [boards.data, docs.data, tasks.data, code.data, files.data]);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PinKind | 'all'>('all');
  const [share, setShare] = useState<Item | PinT | null>(null);
  const [help, setHelp] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const shown = items.filter((i) => (filter === 'all' || i.kind === filter) && (!q.trim() || `${i.title} ${i.sub} ${KIND[i.kind].label}`.toLowerCase().includes(q.trim().toLowerCase())));

  const pinned = pins.data?.pins ?? [];
  const isPinned = (i: PinT) => pinned.some((p) => p.kind === i.kind && p.id === i.id);
  const togglePin = async (i: PinT) => {
    const next = isPinned(i) ? pinned.filter((p) => !(p.kind === i.kind && p.id === i.id)) : [{ kind: i.kind, id: i.id, title: i.title, href: i.href }, ...pinned].slice(0, MAX_PINS);
    void pins.mutate({ pins: next }, { revalidate: false });
    try { await pins.mutate(authedJson<{ pins: PinT[] }>('/api/collab/pins', { method: 'PUT', body: JSON.stringify({ pins: next }) }), { revalidate: false }); }
    catch (e) { toast.error((e as Error).message); void pins.mutate(); }
  };

  // Shortcuts, when not typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.isContentEditable))) return;
      if (e.key === '/') { e.preventDefault(); search.current?.focus(); return; }
      if (e.key === '?') { setHelp(true); return; }
      if (e.key === 'f') { const s = focusNow(); setFocus(s.endsAt ? pause(s, Date.now()) : start(s, Date.now())); return; }
      const c = CREATE.find(([k]) => k === e.key);
      if (c) router.push(c[3]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Search everything, and start something new. */}
        <section className="panel collab-hero relative overflow-hidden p-5 sm:p-7">
          <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white">Your work, <span className="font-serif italic font-normal bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500 dark:from-indigo-200 dark:via-fuchsia-200 dark:to-pink-200 bg-clip-text text-transparent pe-1">together</span></h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-[75ch]">Every board, document, task board, code room and file you share with others, in one place.</p>
          <label className="relative mt-4 block">
            <Search className="w-5 h-5 absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find anything: a board, a doc, a file…" aria-label="Find anything in Collaborate" aria-keyshortcuts="/"
              className="msg-search w-full h-12 ps-12 pe-12 rounded-2xl bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-base text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none transition-shadow duration-200" />
            <kbd className="hidden sm:block absolute end-4 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md border border-zinc-300 dark:border-white/15 text-xs text-zinc-500">/</kbd>
          </label>
          <div className="stagger mt-4 flex flex-wrap gap-2">
            {CREATE.map(([key, label, Icon, href]) => (
              <Link key={key} href={href} className="group inline-flex items-center gap-2 ps-2 pe-3 h-10 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-zinc-200 dark:hover:bg-white/[0.1] active:scale-[0.97]">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center transition-transform duration-200 group-hover:rotate-[-8deg] group-hover:scale-110"><Icon className="w-3.5 h-3.5" /></span>
                New {label.toLowerCase()}<kbd className="hidden sm:inline text-xs font-normal text-zinc-500">{key}</kbd>
              </Link>
            ))}
            <button type="button" onClick={() => setHelp(true)} className="inline-flex items-center gap-1.5 px-3 h-10 rounded-full text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-500"><Keyboard className="w-4 h-4" /> Shortcuts</button>
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Pinned: glide into place as they're added or taken away. */}
            {pinned.length > 0 && !q && (
              <section aria-labelledby="pinned-h">
                <h3 id="pinned-h" className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 inline-flex items-center gap-1.5"><Pin className="w-4 h-4 text-fuchsia-500 rotate-45" /> Pinned</h3>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  <AnimatePresence initial={false}>
                    {pinned.map((p) => {
                      const K = KIND[p.kind];
                      return (
                        <motion.div key={`${p.kind}:${p.id}`} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={spring.smooth}
                          className="group card sheen relative p-4 flex items-center gap-3">
                          <span className={cn('w-10 h-10 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shrink-0', K.tone)}><K.icon className="w-5 h-5" /></span>
                          <Link href={p.href} className="min-w-0 flex-1 after:absolute after:inset-0"><span className="block font-semibold text-sm text-zinc-900 dark:text-white truncate" translate="no">{p.title}</span><span className="text-xs text-zinc-500 dark:text-zinc-400">{K.label}</span></Link>
                          <button type="button" onClick={() => void togglePin(p)} aria-label={`Unpin ${p.title}`} className="relative z-10 p-1.5 rounded-full text-zinc-400 hover:text-fuchsia-500 hover:bg-zinc-100 dark:hover:bg-white/10"><PinOff className="w-4 h-4" /></button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </section>
            )}

            <section className="panel p-4 sm:p-5" aria-labelledby="recent-h">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 id="recent-h" className="text-base font-bold text-zinc-900 dark:text-white">{q ? `Found ${shown.length}` : 'Recent work'}</h3>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
                  {FILTERS.map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn('relative isolate shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors', filter === k ? 'text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>
                      {filter === k && <motion.span layoutId="collab-filter" transition={spring.snappy} className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {loading ? (
                <div className="space-y-2" role="status" aria-label="Loading">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-2xl skeleton" />)}</div>
              ) : shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">{q ? 'Nothing matches that.' : 'Nothing here yet. Start a document or a board above.'}</p>
              ) : (
                <ul key={`${filter}:${q ? 1 : 0}`} className="stagger divide-y divide-zinc-100 dark:divide-white/[0.05]">
                  {shown.slice(0, 40).map((i) => {
                    const K = KIND[i.kind];
                    const on = isPinned(i);
                    return (
                      <li key={`${i.kind}:${i.id}`} className="group relative flex items-center gap-3 py-2.5">
                        <span className={cn('w-9 h-9 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105', K.tone)}><K.icon className="w-4 h-4" /></span>
                        <Link href={i.href} className="min-w-0 flex-1 after:absolute after:inset-0">
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate" translate="no">{i.title}</span>
                          <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">{K.label} · {i.sub}{now ? ` · ${formatDistanceStrict(new Date(i.at), now, { addSuffix: true })}` : ''}</span>
                        </Link>
                        <span className="relative z-10 flex gap-0.5 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <button type="button" onClick={() => setShare(i)} aria-label={`Share ${i.title} with a QR code`} className="p-1.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><QrIcon className="w-4 h-4" /></button>
                          <button type="button" onClick={() => void togglePin(i)} aria-pressed={on} aria-label={on ? `Unpin ${i.title}` : `Pin ${i.title}`} className={cn('p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10', on ? 'text-fuchsia-500' : 'text-zinc-400 hover:text-fuchsia-500')}><Pin className="w-4 h-4 rotate-45" /></button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Templates />
          </div>

          <div className="space-y-6 min-w-0">
            <section className="panel p-5" aria-label="Focus timer"><FocusTimer /></section>
            <WeekAhead tasks={tasks.data?.mine ?? []} now={now} />
            <Activity at={items.map((i) => i.at)} now={now} />
            <QuickNotes />
          </div>
        </div>
      </div>

      {share && (
        <Sheet title={`Share “${share.title}”`} onClose={() => setShare(null)}>
          <ShareBody item={share} />
        </Sheet>
      )}
      {help && (
        <Sheet title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {[['/', 'Find anything'], ...CREATE.map(([k, l]) => [k, `New ${l.toLowerCase()}`]), ['f', 'Start or pause the focus timer'], ['?', 'These shortcuts']].map(([k, l]) => (
              <div key={k} className="contents"><dt><kbd className="px-2 py-0.5 rounded-md border border-zinc-300 dark:border-white/15 font-mono text-xs">{k}</kbd></dt><dd className="text-zinc-700 dark:text-zinc-300">{l}</dd></div>
            ))}
          </dl>
        </Sheet>
      )}
    </div>
  );
}

/** A QR code a class can scan from the projector, and the link to copy. */
function ShareBody({ item }: { item: PinT }) {
  const url = typeof window === 'undefined' ? item.href : `${window.location.origin}${item.href}`;
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="p-3 rounded-2xl bg-white shadow-xl shadow-indigo-500/20"><QrCode value={url} size={220} title={`QR code for ${item.title}`} /></div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-sm">Scan it with a phone camera to open it. Only people who can already see it can open it.</p>
      <div className="flex w-full max-w-sm gap-2">
        <input readOnly value={url} aria-label="Link" className="input flex-1 min-w-0 text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-primary" onClick={() => void navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'), () => toast.error('Couldn’t copy the link'))}>Copy</button>
      </div>
    </div>
  );
}

/** Start a document from one of the templates. */
function Templates() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const make = async (id: string, name: string) => {
    setBusy(id);
    try {
      const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title: name, kind: 'doc' }) });
      router.push(`/docs/${d.id}?template=${id}`);
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  };
  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="tpl-h">
      <h3 id="tpl-h" className="text-base font-bold text-zinc-900 dark:text-white mb-3 inline-flex items-center gap-1.5"><LayoutTemplate className="w-4 h-4 text-indigo-500" /> Start from a template</h3>
      <div className="stagger grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {DOC_TEMPLATES.map((t) => (
          <button key={t.id} type="button" disabled={!!busy} onClick={() => void make(t.id, t.name)}
            className="group text-start p-3 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-fuchsia-400/40 hover:bg-white dark:hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-60">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-white">{busy === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-indigo-500 transition-transform duration-200 group-hover:scale-110" />}{t.name}</span>
            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{t.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** My cards due in the next seven days, day by day. */
function WeekAhead({ tasks, now }: { tasks: Tasks['mine']; now: number }) {
  if (!now) return null;
  const { days, overdue } = dueThisWeek(tasks, now);
  return (
    <section className="panel p-5" aria-labelledby="week-h">
      <h3 id="week-h" className="text-base font-bold text-zinc-900 dark:text-white mb-3 inline-flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-indigo-500" /> Due this week</h3>
      {overdue > 0 && <p className="mb-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{overdue} overdue</p>}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <div key={d.label} className="flex flex-col items-center gap-1">
            <span className={cn('text-xs', i === 0 ? 'font-bold text-indigo-600 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400')}>{d.label}</span>
            <span className={cn('w-full h-12 rounded-xl flex items-center justify-center text-sm font-bold transition-colors', d.items.length ? 'bg-gradient-to-b from-indigo-500/20 to-fuchsia-500/20 text-zinc-900 dark:text-white' : 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-400')} title={d.items.map((t) => t.title).join(', ') || 'Nothing due'}>{d.items.length || '·'}</span>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {days.flatMap((d) => d.items.map((t) => ({ ...t, day: d.label }))).slice(0, 5).map((t) => (
          <li key={t.id}><Link href={`/tasks/${t.boardId}`} className="flex items-center justify-between gap-2 text-sm hover:text-indigo-600 dark:hover:text-indigo-300"><span className="truncate text-zinc-800 dark:text-zinc-200" translate="no">{t.title}</span><span className="shrink-0 text-xs text-zinc-500">{t.day}</span></Link></li>
        ))}
      </ul>
    </section>
  );
}

/** How active the shared work has been: four weeks of days, and the current streak. */
function Activity({ at, now }: { at: string[]; now: number }) {
  if (!now) return null;
  const days = activityDays(at, now, 28);
  const streak = streakOf(days);
  const max = Math.max(1, ...days);
  return (
    <section className="panel p-5" aria-labelledby="act-h">
      <div className="flex items-center justify-between mb-3">
        <h3 id="act-h" className="text-base font-bold text-zinc-900 dark:text-white inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-fuchsia-500" /> Activity</h3>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-300"><Flame className="w-3.5 h-3.5" />{streak}-day streak</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label={`Changes to your shared work in the last four weeks: ${days.reduce((a, b) => a + b, 0)} in all, on ${days.filter(Boolean).length} days`}>
        {days.map((n, i) => (
          <span key={i} className="activity-cell aspect-square rounded-md" style={{ ['--i' as string]: i, background: n ? `rgb(107 85 96 / ${0.25 + (0.75 * n) / max})` : undefined }} />
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Each square is a day; brighter means more of your shared work changed.</p>
    </section>
  );
}

/** A quick notepad kept on this device; it can become a document. */
function QuickNotes() {
  const router = useRouter();
  const [text, setText] = useState(() => { try { return localStorage.getItem(NOTES_KEY) ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(NOTES_KEY, text); } catch { /* private mode */ } }, 400);
    return () => clearTimeout(t);
  }, [text]);
  const toDoc = async () => {
    setBusy(true);
    try {
      const title = text.trim().split('\n')[0].slice(0, 80) || 'Quick notes';
      const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title, kind: 'doc' }) });
      try { sessionStorage.setItem(`doc-import:${d.id}`, notesToHtml(text)); } catch { /* no storage: the doc starts empty */ }
      router.push(`/docs/${d.id}`);
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return (
    <section className="panel p-5" aria-labelledby="notes-h">
      <h3 id="notes-h" className="text-base font-bold text-zinc-900 dark:text-white mb-2 inline-flex items-center gap-1.5"><NotebookPen className="w-4 h-4 text-indigo-500" /> Quick notes</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={20_000} placeholder="Jot down an idea, a link, a to-do… (kept on this device)" aria-label="Quick notes"
        className="msg-search w-full resize-y rounded-2xl bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 p-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none transition-shadow duration-200" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Saved as you type'}</span>
        <button type="button" onClick={() => void toDoc()} disabled={!text.trim() || busy} className="btn-secondary text-sm">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Make it a document</button>
      </div>
    </section>
  );
}
