'use client';
import { lowDataOn, useLowData } from '@/store/low-data';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { BookOpen, Briefcase, ChevronRight, Command, CornerDownLeft, FlaskConical, HeartHandshake, Library, Loader2, MessageSquarePlus, Moon, Search, Sun, User, Users, type LucideIcon, Gauge } from 'lucide-react';
import { isSampleMode } from '@/lib/sample-mode';
import { startSampleMode, stopSampleMode } from '@/components/SampleMode';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { navByRole } from '@/components/layout/Sidebar';
import { useLanguageStore } from '@/store/language';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { applyTheme, getSavedTheme } from '@/lib/theme';
import { spring } from '@/lib/motion';

type Item = { id: string; label: string; hint?: string; icon: LucideIcon; group: string; keywords?: string; run: () => void | Promise<void> };
type Person = { id: string; name: string; role: string; online?: boolean };
type SearchResult = { type: 'course' | 'group' | 'project' | 'internship' | 'resource'; id: string; title: string; subtitle?: string; href: string };

// How platform search results (/api/search) are shown.
const RESULT_KIND: Record<SearchResult['type'], { group: string; icon: LucideIcon }> = {
  course: { group: 'Courses', icon: BookOpen },
  group: { group: 'Groups', icon: Users },
  project: { group: 'NGO projects', icon: HeartHandshake },
  internship: { group: 'Internships', icon: Briefcase },
  resource: { group: 'Resources', icon: Library },
};

const ROLE_BASE: Record<string, string> = { STUDENT: '/student', TEACHER: '/teacher', ADMIN: '/admin' };
const RECENTS_KEY = 'universe_recent_commands';

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = useLanguageStore();
  const base = ROLE_BASE[role] ?? '/student';

  // Live data only while open.
  const { data: myCourses } = useSWR<any[]>(open && role !== 'ADMIN' ? '/courses/my' : null, fetcher);
  const peopleKey = open && debounced.length >= 2 ? `/api/chat/users?q=${encodeURIComponent(debounced)}` : null;
  const { data: people, isLoading: peopleLoading } = useSWR<Person[]>(peopleKey, authedJson);
  const searchKey = open && debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null;
  const { data: found, isLoading: searchLoading } = useSWR<{ results: SearchResult[] }>(searchKey, authedJson, { keepPreviousData: true });
  const busy = peopleLoading || searchLoading;

  useEffect(() => { try { setRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')); } catch { /* ignore */ } }, []);
  useEffect(() => { const id = setTimeout(() => setDebounced(query.trim()), 220); return () => clearTimeout(id); }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    // Opened (Ctrl+K / search button) before this component had loaded.
    if (window.__universePalettePending) { window.__universePalettePending = false; setOpen(true); }
    document.addEventListener('keydown', onKey);
    window.addEventListener('universe:open-palette', onOpen);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('universe:open-palette', onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setDebounced(''); setIndex(0);
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
    return out;
  }, [role, t, go]);

  const actions: Item[] = useMemo(() => {
    const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    return [
      { id: 'act:message', label: 'New message', hint: 'Messages', icon: MessageSquarePlus, group: 'Actions', keywords: 'chat dm write send inbox', run: go(`${base}/inbox`) },
      {
        id: 'act:theme', label: dark ? 'Switch to light mode' : 'Switch to dark mode', icon: dark ? Sun : Moon, group: 'Actions', keywords: 'theme appearance dark light night',
        run: () => { applyTheme(dark ? 'light' : 'dark'); window.dispatchEvent(new Event('universe:theme')); },
      },
      {
        id: 'act:low-data', label: lowDataOn() ? 'Turn off low-data mode' : 'Turn on low-data mode', hint: 'Photos load on tap, fewer refreshes', icon: Gauge, group: 'Actions', keywords: 'data saver slow connection mobile data bandwidth offline',
        run: () => { const on = !lowDataOn(); useLowData.getState().setEnabled(on); import('sonner').then((m) => m.toast.success(on ? 'Low-data mode is on' : 'Low-data mode is off')); },
      },
      isSampleMode()
        ? { id: 'act:sample-off', label: 'Exit sample mode', hint: 'Back to your real account', icon: FlaskConical, group: 'Actions', keywords: 'demo example sample data exit', run: stopSampleMode }
        : { id: 'act:sample-on', label: 'Explore with sample data', hint: 'Try every feature with example data — nothing is saved', icon: FlaskConical, group: 'Actions', keywords: 'demo example sample data try tour', run: startSampleMode },
    ];
  }, [base, go, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const courses: Item[] = useMemo(() => {
    const list = Array.isArray(myCourses) ? myCourses.map((c) => (role === 'STUDENT' ? c.course : c)).filter(Boolean) : [];
    return list.map((c: any) => ({
      id: `course:${c.id}`, label: c.name, hint: c.code, icon: BookOpen, group: 'Courses', keywords: c.code,
      run: go(`${base}/blackboard?course=${c.id}`),
    }));
  }, [myCourses, role, base, go]);

  const peopleItems: Item[] = useMemo(() => (people ?? []).slice(0, 6).map((p) => ({
    id: `person:${p.id}`, label: p.name, hint: `${p.role.charAt(0)}${p.role.slice(1).toLowerCase()}${p.online ? ' · online' : ''}`, icon: User, group: 'People',
    run: async () => {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: p.id }) });
      router.push(`${base}/inbox?c=${id}`);
    },
  })), [people, base, router]);

  const foundItems: Item[] = useMemo(() => {
    const mine = new Set(courses.map((c) => c.id));
    return (found?.results ?? [])
      .filter((r) => !(r.type === 'course' && mine.has(`course:${r.id}`)))
      .map((r) => ({ id: `${r.type}:${r.id}`, label: r.title, hint: r.subtitle, icon: RESULT_KIND[r.type].icon, group: RESULT_KIND[r.type].group, run: go(r.href) }));
  }, [found, courses, go]);

  const results = useMemo(() => {
    const q = debounced.toLowerCase();
    const all = [...pages, ...courses, ...actions];
    if (!q) {
      const recent = recents.map((id) => all.find((i) => i.id === id)).filter(Boolean) as Item[];
      const seen = new Set(recent.map((i) => i.id));
      return [
        ...recent.slice(0, 4).map((i) => ({ ...i, group: 'Recent' })),
        ...courses.slice(0, 4).filter((i) => !seen.has(i.id)),
        ...actions,
        ...pages.filter((i) => !seen.has(i.id)).slice(0, 6),
      ];
    }
    const ranked = all
      .map((i) => ({ i, s: Math.max(score(i.label, q), score(`${i.hint ?? ''} ${i.keywords ?? ''}`, q) * 0.6) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i);
    // Group in a fixed order so the list doesn't jump around while typing.
    const order = ['Courses', 'Pages', 'People', 'Groups', 'NGO projects', 'Internships', 'Resources', 'Actions'];
    return [...ranked, ...peopleItems, ...foundItems].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [debounced, pages, courses, actions, peopleItems, foundItems, recents]);

  useEffect(() => { setIndex(0); }, [debounced]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = async (item: Item | undefined) => {
    if (!item) return;
    const next = [item.id, ...recents.filter((r) => r !== item.id)].slice(0, 8);
    setRecents(next);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setOpen(false);
    try { await item.run(); } catch (e: any) { toast.error(e?.message || 'Could not open that. Please try again.'); }
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
            className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.snappy}
            className="absolute left-1/2 -translate-x-1/2 top-[max(1rem,env(safe-area-inset-top))] sm:top-[12%] w-full max-w-xl px-3"
          >
            <div className="glass-sidebar border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200/70 dark:border-white/[0.07]">
                {busy ? <Loader2 className="w-5 h-5 text-zinc-400 animate-spin shrink-0" /> : <Search className="w-5 h-5 text-zinc-400 shrink-0" />}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search courses, people, groups, projects, internships…"
                  aria-controls="palette-list"
                  className="flex-1 bg-transparent text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none text-base"
                />
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-zinc-200 dark:border-white/10 text-zinc-500">ESC</button>
              </div>

              <div id="palette-list" ref={listRef} role="listbox" className="max-h-[min(60dvh,420px)] overflow-y-auto overscroll-contain p-2">
                {results.length === 0 ? (
                  <p className="py-10 text-center text-sm text-zinc-500">
                    {debounced.length >= 2 && busy ? 'Searching…' : <>No results for &ldquo;{query}&rdquo;</>}
                  </p>
                ) : results.map((item, i) => {
                  const header = item.group !== lastGroup ? (lastGroup = item.group) : null;
                  const selected = i === index;
                  return (
                    <div key={`${item.group}-${item.id}`}>
                      {header && <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{header}</p>}
                      <button
                        data-idx={i}
                        role="option"
                        aria-selected={selected}
                        onClick={() => choose(item)}
                        onMouseMove={() => setIndex(i)}
                        className={cn('relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-800 dark:text-zinc-200')}
                      >
                        {selected && <motion.span layoutId="palette-sel" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-indigo-500/10" />}
                        <span className={cn('relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0', selected ? 'bg-indigo-500/15 text-indigo-500' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-500')}>
                          <item.icon className="w-4 h-4" />
                        </span>
                        <span className="relative flex-1 min-w-0">
                          <span className="block text-sm font-semibold truncate">{item.label}</span>
                          {item.hint && <span className="block text-xs text-zinc-500 truncate">{item.hint}</span>}
                        </span>
                        {selected ? <CornerDownLeft className="relative w-4 h-4 text-indigo-400" /> : <ChevronRight className="relative w-4 h-4 text-zinc-300 dark:text-zinc-600" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:flex px-4 py-2.5 border-t border-zinc-200/70 dark:border-white/[0.07] items-center justify-between text-[11px] text-zinc-400">
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
