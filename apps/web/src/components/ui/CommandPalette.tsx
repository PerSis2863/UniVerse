'use client';
import { lowDataOn, twoGOn, useLowData } from '@/store/low-data';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { BookOpen, Briefcase, CalendarDays, CalendarPlus, ChevronRight, ClipboardList, Command, Compass, CornerDownLeft, FilePlus2, FileSearch, FileSpreadsheet, FileText, FlaskConical, HeartHandshake, KanbanSquare, Library, Loader2, MessageSquarePlus, Moon, Paperclip, Presentation, Search, SquareCheck, Sun, User, Users, Video, type LucideIcon, Gauge, SignalLow } from 'lucide-react';
import { isSampleMode } from '@/lib/sample-mode';
import { startSampleMode, stopSampleMode } from '@/components/SampleMode';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { navByRole, searchOnlyPages } from '@/components/layout/Sidebar';
import { TABS_BY_ROLE } from '@/components/layout/SectionTabs';
import { useLanguageStore } from '@/store/language';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { applyTheme } from '@/lib/theme';
import { spring } from '@/lib/motion';

type Item = { id: string; label: string; hint?: string; icon: LucideIcon; group: string; keywords?: string; run: () => void | Promise<void>; /** Kept in Recent with its address (search results). */ href?: string };
type Person = { id: string; name: string; role: string; online?: boolean };
type SearchResult = { type: keyof typeof RESULT_KIND; id: string; title: string; subtitle?: string; snippet?: string; href: string };
/** /courses/my: a teacher's own courses, or a student's enrolments (each holds its course). */
type MyCourse = { id: string; name: string; code?: string; course?: MyCourse };

// How platform search results (/api/search) are shown.
const RESULT_KIND = {
  // The words inside my things (Stage 5 · Q10, src/server/search-index.ts).
  doc: { group: 'Documents', icon: FileText },
  sheet: { group: 'Documents', icon: FileSpreadsheet },
  slides: { group: 'Documents', icon: Presentation },
  task: { group: 'Tasks', icon: SquareCheck },
  board: { group: 'Tasks', icon: KanbanSquare },
  assignment: { group: 'Assignments', icon: ClipboardList },
  material: { group: 'Materials', icon: Paperclip },
  event: { group: 'Events', icon: CalendarDays },
  course: { group: 'Courses', icon: BookOpen },
  group: { group: 'Groups', icon: Users },
  project: { group: 'NGO projects', icon: HeartHandshake },
  internship: { group: 'Internships', icon: Briefcase },
  resource: { group: 'Resources', icon: Library },
} satisfies Record<string, { group: string; icon: LucideIcon }>;

const ROLE_BASE: Record<string, string> = { STUDENT: '/student', TEACHER: '/teacher', ADMIN: '/admin' };
const RECENTS_KEY = 'universe_recent_commands';
// Search results opened lately, with their address (Stage 5 · Q10).
const RECENT_FOUND_KEY = 'universe_recent_found';
type RecentFound = { id: string; label: string; hint?: string; href: string; type: keyof typeof RESULT_KIND };

/** A snippet's matched words («…») shown highlighted. */
function Snippet({ text, selected }: { text: string; selected: boolean }) {
  const parts = text.split(/[«»]/);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className={cn('rounded px-0.5 font-medium', selected ? 'bg-white text-indigo-800' : 'bg-amber-200 text-zinc-900 dark:bg-amber-300 dark:text-zinc-900')}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

/** Every character of the query appears in order (so "blk" finds "Blackboard"); earlier, tighter matches rank higher. */
function score(text: string, q: string) {
  const s = text.toLowerCase();
  const idx = s.indexOf(q);
  if (idx >= 0) return 100 - idx;
  let si = 0, gaps = 0;
  for (const ch of q) {
    const f = s.indexOf(ch, si);
    if (f < 0) return 0;
    gaps += f - si;
    si = f + 1;
  }
  return Math.max(1, 40 - gaps);
}

/** Open from anywhere: window.dispatchEvent(new Event('universe:open-palette')) */
export { openCommandPalette } from '@/lib/palette';

export function CommandPalette({ role = 'STUDENT' }: { role?: string }) {
  // Opened (Ctrl+K / search button) before this component had loaded?
  const [open, setOpen] = useState(() => !!window.__universePalettePending);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]'); } catch { return []; } });
  const [recentFound, setRecentFound] = useState<RecentFound[]>(() => { try { const v = JSON.parse(localStorage.getItem(RECENT_FOUND_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.href === 'string' && x.href.startsWith('/') && x.type in RESULT_KIND).slice(0, 6) : []; } catch { return []; } });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = useLanguageStore();
  const base = ROLE_BASE[role] ?? '/student';

  // Live data only while open.
  const { data: myCourses } = useSWR<MyCourse[]>(open && role !== 'ADMIN' ? '/courses/my' : null, fetcher);
  const peopleKey = open && debounced.length >= 2 ? `/api/chat/users?q=${encodeURIComponent(debounced)}` : null;
  const { data: people, isLoading: peopleLoading } = useSWR<Person[]>(peopleKey, authedJson);
  const searchKey = open && debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null;
  const { data: found, isLoading: searchLoading } = useSWR<{ results: SearchResult[] }>(searchKey, authedJson, { keepPreviousData: true });
  const busy = peopleLoading || searchLoading;

  useEffect(() => { const id = setTimeout(() => setDebounced(query.trim()), 220); return () => clearTimeout(id); }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.__universePalettePending = false; // taken care of by the initial state
    document.addEventListener('keydown', onKey);
    window.addEventListener('universe:open-palette', onOpen);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('universe:open-palette', onOpen); };
  }, []);

  // Every opening starts with an empty search.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setQuery(''); setDebounced(''); setIndex(0); }
  }
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, [open]);

  const go = useCallback((href: string) => () => router.push(href), [router]);

  const pages: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const n of navByRole[role] ?? []) {
      if (n.href) out.push({ id: `page:${n.href}`, label: t(n.label), icon: n.icon, group: 'Pages', run: go(n.href) });
      for (const sub of n.subItems ?? []) out.push({ id: `page:${sub.href}`, label: t(sub.label), hint: t(n.label), icon: n.icon, group: 'Pages', run: go(sub.href) });
    }
    for (const p of searchOnlyPages[role] ?? []) {
      if (!out.some((o) => o.id === `page:${p.href}`)) out.push({ id: `page:${p.href}`, label: p.label, icon: FileSearch, group: 'Pages', keywords: p.keywords, run: go(p.href) });
    }
    // Pages that are tabs of a section (M27) are found too, with the section's first tab as the hint.
    for (const tabs of TABS_BY_ROLE[role] ?? []) {
      for (const tab of tabs) if (!out.some((o) => o.id === `page:${tab.href}`)) out.push({ id: `page:${tab.href}`, label: tab.label, hint: tabs[0].label, icon: FileSearch, group: 'Pages', run: go(tab.href) });
    }
    return out;
  }, [role, t, go]);

  const actions: Item[] = useMemo(() => {
    const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    return [
      ...(role === 'STUDENT' || role === 'TEACHER' || role === 'ADMIN' ? [{ id: 'act:tour', label: 'Take the tour', hint: 'Where everything is', icon: Compass, group: 'Actions', keywords: 'help guide welcome start where menu', run: () => window.dispatchEvent(new Event('universe:tour')) }] : []),
      { id: 'act:message', label: 'New message', hint: 'Messages', icon: MessageSquarePlus, group: 'Actions', keywords: 'chat dm write send inbox', run: go(`${base}/inbox?new=chat`) },
      // Make something (Stage 5 · Q10).
      { id: 'act:doc', label: 'New document', hint: 'Docs', icon: FilePlus2, group: 'Actions', keywords: 'write word page report create', run: go('/docs?new=doc') },
      { id: 'act:sheet', label: 'New spreadsheet', hint: 'Docs', icon: FileSpreadsheet, group: 'Actions', keywords: 'excel table numbers budget create', run: go('/docs?new=sheet') },
      { id: 'act:slides', label: 'New presentation', hint: 'Docs', icon: Presentation, group: 'Actions', keywords: 'powerpoint slides deck create', run: go('/docs?new=slides') },
      { id: 'act:board', label: 'New task board', hint: 'Tasks', icon: KanbanSquare, group: 'Actions', keywords: 'tasks kanban project todo create', run: go('/tasks?new=1') },
      { id: 'act:call', label: 'Schedule a call', hint: 'Calls', icon: CalendarPlus, group: 'Actions', keywords: 'meeting video class call book plan', run: go('/calls?schedule=1') },
      // The other apps (src/lib/apps.ts).
      { id: 'act:hub', label: 'Switch app', hint: 'All apps', icon: Compass, group: 'Actions', keywords: 'apps hub trace relief green university switch', run: go('/hub') },
      { id: 'act:product', label: 'New product passport', hint: 'Trace', icon: FilePlus2, group: 'Actions', keywords: 'product passport code batch print label brand', run: go('/trace') },
      { id: 'act:relief', label: 'Ask for or offer help', hint: 'Relief', icon: MessageSquarePlus, group: 'Actions', keywords: 'help need food water shelter medical volunteer aid', run: go('/relief') },
      { id: 'act:green', label: 'Log a climate action', hint: 'Green', icon: CalendarPlus, group: 'Actions', keywords: 'green co2 tree recycle cycle climate', run: go('/green') },
      ...(role === 'TEACHER' ? [
        { id: 'act:assignment', label: 'New assignment', hint: 'Assignments', icon: ClipboardList, group: 'Actions', keywords: 'homework essay task create set', run: go('/teacher/assignments') },
        { id: 'act:quiz', label: 'New quiz', hint: 'Quizzes', icon: SquareCheck, group: 'Actions', keywords: 'test exam create', run: go('/teacher/quizzes') },
      ] : []),
      {
        id: 'act:theme', label: dark ? 'Switch to light mode' : 'Switch to dark mode', icon: dark ? Sun : Moon, group: 'Actions', keywords: 'theme appearance dark light night',
        run: () => { applyTheme(dark ? 'light' : 'dark'); window.dispatchEvent(new Event('universe:theme')); },
      },
      {
        id: 'act:low-data', label: lowDataOn() ? 'Turn off low-data mode' : 'Turn on low-data mode', hint: 'Photos load on tap, fewer refreshes', icon: Gauge, group: 'Actions', keywords: 'data saver slow connection mobile data bandwidth offline',
        run: () => { const on = !lowDataOn(); useLowData.getState().setEnabled(on); import('sonner').then((m) => m.toast.success(on ? 'Low-data mode is on' : 'Low-data mode is off')); },
      },
      {
        id: 'act:2g', label: twoGOn() ? 'Turn off 2G mode' : 'Turn on 2G mode', hint: 'Voice-only calls at 16 kbps, plus low-data mode', icon: SignalLow, group: 'Actions', keywords: '2g edge weak signal slow connection data saver audio only voice calls bandwidth',
        run: () => { const on = !twoGOn(); useLowData.getState().setTwoG(on); import('sonner').then((m) => m.toast.success(on ? '2G mode is on: calls are voice only' : '2G mode is off')); },
      },
      isSampleMode()
        ? { id: 'act:sample-off', label: 'Exit sample mode', hint: 'Back to your real account', icon: FlaskConical, group: 'Actions', keywords: 'demo example sample data exit', run: stopSampleMode }
        : { id: 'act:sample-on', label: 'Explore with sample data', hint: 'Try every feature with example data — nothing is saved', icon: FlaskConical, group: 'Actions', keywords: 'demo example sample data try tour', run: startSampleMode },
    ];
  }, [base, go, open, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const courses: Item[] = useMemo(() => {
    const list = Array.isArray(myCourses) ? myCourses.map((c) => (role === 'STUDENT' ? c.course : c)).filter((c): c is MyCourse => !!c) : [];
    return list.map((c) => ({
      id: `course:${c.id}`, label: c.name, hint: c.code, icon: BookOpen, group: 'Courses', keywords: c.code,
      run: go(`${base}/blackboard?course=${c.id}`),
    }));
  }, [myCourses, role, base, go]);

  const peopleItems: Item[] = useMemo(() => (people ?? []).slice(0, 5).flatMap((p) => {
    const chatWith = async () => (await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: p.id }) })).id;
    return [
      {
        id: `person:${p.id}`, label: p.name, hint: `${p.role.charAt(0)}${p.role.slice(1).toLowerCase()}${p.online ? ' · online' : ''}`, icon: User, group: 'People',
        run: async () => { router.push(`${base}/inbox?c=${await chatWith()}`); },
      },
      // "Start a call with…" (Stage 5 · Q10): rings them like a call from the chat.
      {
        id: `call:${p.id}`, label: `Video call ${p.name.split(/\s+/)[0]}`, hint: p.online ? 'Online now' : 'Rings their devices', icon: Video, group: 'People',
        run: async () => {
          const msg = await authedJson<{ id: string }>(`/api/chat/conversations/${await chatWith()}/messages`, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind: 'video' }) });
          router.push(`/call/${msg.id}?kind=video`);
        },
      },
    ];
  }), [people, base, router]);

  const foundItems: Item[] = useMemo(() => {
    const mine = new Set(courses.map((c) => c.id));
    return (found?.results ?? [])
      .filter((r) => !(r.type === 'course' && mine.has(`course:${r.id}`)))
      .filter((r) => r.type in RESULT_KIND)
      .map((r) => ({ id: `${r.type}:${r.id}`, label: r.title, hint: r.snippet ? `${r.subtitle ? `${r.subtitle} · ` : ''}${r.snippet}` : r.subtitle, icon: RESULT_KIND[r.type].icon, group: RESULT_KIND[r.type].group, run: go(r.href), href: r.href }));
  }, [found, courses, go]);

  const results = useMemo(() => {
    const q = debounced.toLowerCase();
    const all = [...pages, ...courses, ...actions];
    // Find-a-page shortcuts (student directory, internship history, apps & links) before typing.
    const quickIds = new Set((searchOnlyPages[role] ?? []).filter((p) => p.quick).map((p) => `page:${p.href}`));
    const quick = pages.filter((i) => quickIds.has(i.id)).map((i) => ({ ...i, group: 'Find' }));
    if (!q) {
      // Recently opened: pages and actions, and search results (with their address).
      const recent = recents.map((id) => all.find((i) => i.id === id) ?? recentFound.find((f) => f.id === id)).filter(Boolean)
        .map((i) => ('run' in i! ? i : { id: i!.id, label: i!.label, hint: i!.hint, icon: RESULT_KIND[i!.type].icon, group: 'Recent', run: go(i!.href), href: i!.href })) as Item[];
      const seen = new Set(recent.map((i) => i.id));
      return [
        ...recent.slice(0, 5).map((i) => ({ ...i, group: 'Recent' })),
        ...courses.slice(0, 4).filter((i) => !seen.has(i.id)),
        ...quick.filter((i) => !seen.has(i.id)),
        ...actions,
        ...pages.filter((i) => !seen.has(i.id) && !quickIds.has(i.id)).slice(0, 6),
      ];
    }
    const ranked = all
      .map((i) => ({ i, s: Math.max(score(i.label, q), score(`${i.hint ?? ''} ${i.keywords ?? ''}`, q) * 0.6) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i);
    // Group in a fixed order so the list doesn't jump around while typing.
    const order = ['Documents', 'Tasks', 'Assignments', 'Courses', 'Materials', 'Pages', 'People', 'Events', 'Groups', 'NGO projects', 'Internships', 'Resources', 'Actions'];
    return [...ranked, ...peopleItems, ...foundItems].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [debounced, pages, courses, actions, peopleItems, foundItems, recents, recentFound, role, go]);

  // A new search starts at the top.
  const [indexedFor, setIndexedFor] = useState(debounced);
  if (indexedFor !== debounced) { setIndexedFor(debounced); setIndex(0); }
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = async (item: Item | undefined) => {
    if (!item) return;
    const next = [item.id, ...recents.filter((r) => r !== item.id)].slice(0, 8);
    setRecents(next);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    const type = item.id.split(':')[0] as RecentFound['type'];
    if (item.href && type in RESULT_KIND) {
      const kept = [{ id: item.id, label: item.label, hint: item.hint?.split(' · ')[0], href: item.href, type }, ...recentFound.filter((f) => f.id !== item.id)].slice(0, 6);
      setRecentFound(kept);
      try { localStorage.setItem(RECENT_FOUND_KEY, JSON.stringify(kept)); } catch { /* ignore */ }
    }
    setOpen(false);
    try { await item.run(); } catch (e) { toast.error((e as Error)?.message || 'Could not open that. Please try again.'); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[index]); }
  };

  let lastGroup = '';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Search">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/25" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.snappy}
            className="absolute left-1/2 -translate-x-1/2 top-[max(1rem,env(safe-area-inset-top))] sm:top-[12%] w-full max-w-xl px-3"
          >
            {/* Spotlight: a frosted panel with a big search field; the chosen result is filled with the tint. */}
            <div className="ios-alert rounded-[26px] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5" style={{ boxShadow: 'inset 0 -0.5px 0 var(--separator)' }}>
                {busy ? <Loader2 className="w-5 h-5 text-zinc-400 animate-spin shrink-0" /> : <Search className="w-5 h-5 text-zinc-400 shrink-0" />}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search documents, tasks, courses, people…"
                  aria-controls="palette-list"
                  className="flex-1 bg-transparent text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none text-[20px] font-normal tracking-tight"
                />
                <button onClick={() => setOpen(false)} className="text-[15px] font-medium text-tint-text">Cancel</button>
              </div>

              <div id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[calc(100dvh-9rem)] sm:max-h-[min(60dvh,460px)] overflow-y-auto overscroll-contain p-2">
                {results.length === 0 ? (
                  <p className="py-10 text-center text-sm text-zinc-500">
                    {debounced.length >= 2 && busy ? 'Searching…' : <>No results for &ldquo;{query}&rdquo;</>}
                  </p>
                ) : results.map((item, i) => {
                  const header = item.group !== lastGroup ? (lastGroup = item.group) : null;
                  const selected = i === index;
                  return (
                    <div key={`${item.group}-${item.id}`}>
                      {header && <p className="px-3 pt-2.5 pb-1 text-[12px] font-semibold text-zinc-500">{header}</p>}
                      <button
                        data-idx={i}
                        role="option"
                        aria-selected={selected}
                        onClick={() => choose(item)}
                        onMouseMove={() => setIndex(i)}
                        className={cn('relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-start', selected ? 'text-white' : 'text-zinc-800 dark:text-zinc-200')}
                      >
                        {selected && <motion.span layoutId="palette-sel" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-tint dark:bg-indigo-600" />}
                        <span className={cn('relative w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0', selected ? 'bg-white/20 text-white' : 'bg-[var(--fill)] text-tint-text')}>
                          <item.icon className="w-4 h-4" />
                        </span>
                        <span className="relative flex-1 min-w-0">
                          <span className="block text-sm font-semibold truncate">{item.label}</span>
                          {item.hint && <span className={cn('block text-xs', item.hint.includes('«') ? 'line-clamp-2' : 'truncate', selected ? 'text-white' : 'text-zinc-600 dark:text-zinc-400')}>{item.hint.includes('«') ? <Snippet text={item.hint} selected={selected} /> : item.hint}</span>}
                        </span>
                        {selected ? <CornerDownLeft className="relative w-4 h-4 text-white/80" /> : <ChevronRight className="relative w-4 h-4 text-zinc-300 dark:text-zinc-600" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:flex px-4 py-2.5 items-center justify-between text-[11px] text-zinc-400" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
                <span><kbd className="font-mono">↑↓</kbd> move · <kbd className="font-mono">↵</kbd> open · search anything on the platform</span>
                <span className="flex items-center gap-1"><Command className="w-3 h-3" />K</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
