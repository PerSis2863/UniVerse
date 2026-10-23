'use client';

import { useEffect, useRef } from 'react';
import { animate, m as motion } from 'framer-motion';
import { Activity, BarChart3, Building2, Bug, CheckCircle2, Crown, Database, Gauge, HardDrive, History, Languages, LayoutDashboard, Megaphone, MessagesSquare, Newspaper, PhoneCall, Presentation, Server, ShieldAlert, ShieldCheck, Trash2, TriangleAlert, Users, Wallet, Workflow, Radio, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reducedMotion } from '@/lib/page-transition';
import { useNow } from '@/lib/use-now';
import { TabPill } from '@/components/ui/Glide';
import { Accent, EASE } from '@/components/landing/bits';

// The owner console's deck (M13, "make the whole dashboard modern and futuristic… something
// unique"): the dark header with its grid, glow and the platform's pulse line, the sections in six
// groups (one row of groups, then that group's sections), and numbers that roll to new values.
// The look of every section's cards comes from `card` (shared.tsx) and globals.css "M13".

export type Tab = 'overview' | 'schools' | 'moderation' | 'languages' | 'health' | 'numbers' | 'calls' | 'analytics' | 'server' | 'activity' | 'chats' | 'announce' | 'blog' | 'people' | 'database' | 'data' | 'money' | 'changes' | 'errors' | 'deletions' | 'guide' | 'flows';

type Icon = typeof Users;
const T: Record<Tab, [string, Icon]> = {
  overview: ['Overview', LayoutDashboard],
  people: ['People', Users], schools: ['Schools', Building2], moderation: ['Moderation', ShieldAlert], deletions: ['Deletion requests', Trash2],
  activity: ['Live activity', Activity], chats: ['Live chats', MessagesSquare], calls: ['Calls', PhoneCall], announce: ['Announce', Megaphone],
  health: ['Health check', ShieldCheck], numbers: ['Health numbers', Gauge], errors: ['Errors', Bug], server: ['Server', Server], database: ['Database', HardDrive],
  data: ['All data', Database], changes: ['Changes & undo', History], analytics: ['Analytics', BarChart3], money: ['Money', Wallet],
  flows: ['Feature flows', Workflow], guide: ['Explain UniVerse', Presentation], blog: ['Blog', Newspaper], languages: ['Languages', Languages],
};
export const TABS = (Object.keys(T) as Tab[]).map((id) => ({ id, label: T[id][0], icon: T[id][1] }));

const GROUPS: { id: string; label: string; icon: Icon; tabs: Tab[] }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: ['overview'] },
  { id: 'people', label: 'People', icon: Users, tabs: ['people', 'schools', 'moderation', 'deletions'] },
  { id: 'live', label: 'Live', icon: Radio, tabs: ['activity', 'chats', 'calls', 'announce'] },
  { id: 'health', label: 'Health', icon: ShieldCheck, tabs: ['health', 'numbers', 'errors', 'server', 'database'] },
  { id: 'data', label: 'Data & money', icon: Database, tabs: ['data', 'changes', 'analytics', 'money'] },
  { id: 'content', label: 'Content', icon: FileText, tabs: ['flows', 'guide', 'blog', 'languages'] },
];
const groupOf = (t: Tab) => GROUPS.find((g) => g.tabs.includes(t)) ?? GROUPS[0];

/** A number that rolls from the value it showed to the new one (from 0 the first time). */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (v: number) => { shown.current = v; el.textContent = Math.round(v).toLocaleString('en-US'); };
    if (reducedMotion()) return void write(value);
    const c = animate(shown.current, value, { duration: shown.current ? 0.7 : 1.3, ease: EASE, onUpdate: write });
    return () => c.stop();
  }, [value]);
  return <span ref={ref} className={cn('tabular-nums', className)}>0</span>;
}

/** The heartbeat that runs along the bottom of the header: one light, round and round. */
function Pulse() {
  const beat = (x: number) => `L ${x} 30 L ${x + 8} 30 L ${x + 14} 12 L ${x + 22} 48 L ${x + 28} 22 L ${x + 34} 30`;
  const d = `M0 30 ${[90, 330, 520, 760, 1010].map((x) => `${beat(x)} `).join('')}L 1200 30`;
  return (
    <svg aria-hidden className="absolute inset-x-0 bottom-0 w-full h-12 opacity-80" viewBox="0 0 1200 60" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="deck-pulse" x1="0" x2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#f0abfc" /></linearGradient></defs>
      <path d={d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <path d={d} pathLength={1000} fill="none" stroke="url(#deck-pulse)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="deck-pulse" />
    </svg>
  );
}

export function DeckHeader({ needs, search }: { needs: number | null; search: React.ReactNode }) {
  const now = useNow();
  return (
    <section className="dark relative rounded-3xl border border-white/[0.08] bg-[#090b16] text-white shadow-[0_30px_90px_-40px_rgba(99,102,241,0.6)]">
      {/* The glow and grid stay inside the rounded box; the search's results may hang below it. */}
      <div aria-hidden className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
        <div className="deck-grid absolute inset-0" />
        <div className="mkt-drift-a absolute -top-48 -start-40 w-[560px] h-[560px] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.32), transparent)' }} />
        <div className="mkt-drift-b absolute -bottom-56 -end-24 w-[520px] h-[520px] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(192,38,211,0.22), transparent)' }} />
        <Pulse />
      </div>
      <div className="relative p-5 sm:p-7 pb-12 sm:pb-14 flex flex-col lg:flex-row lg:items-end gap-5 justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-zinc-300 flex items-center gap-2">
            <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-fuchsia-400 deck-ping" /><span className="relative w-2 h-2 rounded-full bg-fuchsia-400" /></span>
            owner console{now ? ` / ${new Date(now).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
          <h1 className="mt-3 flex items-center gap-3 text-3xl sm:text-4xl font-bold tracking-[-0.03em]">
            <span className="deck-orbit shrink-0 w-11 h-11 rounded-2xl grid place-items-center bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/25"><Crown className="w-5 h-5 text-amber-300" aria-hidden /></span>
            <span>Owner <Accent>console.</Accent></span>
          </h1>
          <p className="mt-2 text-sm text-zinc-300 max-w-xl">Everything on UniVerse. Only you can open this page. Every change here can be undone.</p>
        </div>
        <div className="flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-auto lg:min-w-[22rem]">
          {needs !== null && (
            <span className={cn('self-start lg:self-end inline-flex items-center gap-2 h-7 px-3 rounded-full font-mono text-xs border', needs ? 'border-amber-300/30 bg-amber-400/10 text-amber-200' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200')}>
              {needs ? <TriangleAlert className="w-3.5 h-3.5" aria-hidden /> : <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />}
              {needs ? `${needs} need${needs === 1 ? 's' : ''} you` : 'all clear'}
            </span>
          )}
          {search}
        </div>
      </div>
    </section>
  );
}

/** The sections: six groups in one row, and under it the open group's sections. */
export function DeckNav({ tab, onTab, badges }: { tab: Tab; onTab: (t: Tab) => void; badges?: Partial<Record<string, number>> }) {
  const open = groupOf(tab);
  const badge = (t: Tab) => badges?.[t] ?? 0;
  const count = (n: number) => (n > 99 ? '99+' : n);
  return (
    <nav aria-label="Console sections" className="mt-4">
      <div className="flex gap-1 overflow-x-auto hide-scrollbar p-1 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-white/[0.03]">
        {GROUPS.map((g) => {
          const on = g === open;
          const n = g.tabs.filter((t) => t !== 'activity').reduce((a, t) => a + badge(t), 0);
          return (
            <button key={g.id} type="button" onClick={() => onTab(g.tabs[0])} aria-current={on ? 'true' : undefined}
              className={cn('relative isolate shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors', on ? 'text-white' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.05]')}>
              {on && <TabPill id="console-group" />}
              <g.icon className="w-4 h-4" aria-hidden /> {g.label}
              {n > 0 && <span className="min-w-[1.25rem] px-1.5 rounded-full text-[10px] leading-5 text-center bg-rose-600 text-white">{count(n)}</span>}
            </button>
          );
        })}
      </div>
      {open.tabs.length > 1 && (
        <motion.div key={open.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
          className="mt-2 flex gap-1 overflow-x-auto hide-scrollbar border-b border-zinc-200/80 dark:border-white/[0.06]">
          {open.tabs.map((id) => {
            const [label, I] = T[id];
            const n = badge(id);
            return (
              <button key={id} type="button" onClick={() => onTab(id)} aria-current={tab === id ? 'page' : undefined}
                className={cn('relative isolate shrink-0 inline-flex items-center gap-1.5 h-10 px-3 text-sm font-medium transition-colors', tab === id ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white')}>
                {tab === id && <TabPill id="console-sub" variant="line" />}
                <I className="w-4 h-4" aria-hidden /> {label}
                {n > 0 && (
                  <span title={id === 'activity' ? 'online now' : undefined}
                    className={cn('min-w-[1.25rem] px-1.5 rounded-full text-[10px] leading-5 text-center text-white', id === 'activity' ? 'bg-emerald-700' : 'bg-rose-600')}>{count(n)}</span>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </nav>
  );
}

