'use client';

import { useEffect, useRef } from 'react';
import { animate, m as motion } from 'framer-motion';
import { Activity, BarChart3, Building2, Bug, CheckCircle2, Crown, Database, Gauge, HardDrive, History, Languages, LayoutDashboard, Megaphone, MessagesSquare, Newspaper, PhoneCall, Presentation, Server, ShieldAlert, ShieldCheck, Trash2, TriangleAlert, Users, Wallet, Workflow, Radio, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reducedMotion } from '@/lib/page-transition';
import { useNow } from '@/lib/use-now';
import { TabPill } from '@/components/ui/Glide';
import { EASE } from '@/components/landing/bits';

// The owner console's deck (M13, "make the whole dashboard modern and futuristic… something
// unique"): the dark header with its grid, glow and the platform's pulse line, the sections in six
// groups (one row of groups, then that group's sections), and numbers that roll to new values.
// The look of every section's cards comes from `card` (shared.tsx) and globals.css "M13".

export type Tab = 'overview' | 'business' | 'schools' | 'moderation' | 'languages' | 'health' | 'numbers' | 'calls' | 'analytics' | 'server' | 'activity' | 'chats' | 'announce' | 'blog' | 'people' | 'database' | 'data' | 'money' | 'changes' | 'errors' | 'deletions' | 'guide' | 'flows';

type Icon = typeof Users;
const T: Record<Tab, [string, Icon]> = {
  overview: ['Overview', LayoutDashboard],
  business: ['Apps & business', Building2], people: ['People', Users], schools: ['Schools', Building2], moderation: ['Moderation', ShieldAlert], deletions: ['Deletion requests', Trash2],
  activity: ['Live activity', Activity], chats: ['Live chats', MessagesSquare], calls: ['Calls', PhoneCall], announce: ['Announce', Megaphone],
  health: ['Health check', ShieldCheck], numbers: ['Health numbers', Gauge], errors: ['Errors', Bug], server: ['Server', Server], database: ['Database', HardDrive],
  data: ['All data', Database], changes: ['Changes & undo', History], analytics: ['Analytics', BarChart3], money: ['Money', Wallet],
  flows: ['Feature flows', Workflow], guide: ['Explain UniVerse', Presentation], blog: ['Blog', Newspaper], languages: ['Languages', Languages],
};
export const TABS = (Object.keys(T) as Tab[]).map((id) => ({ id, label: T[id][0], icon: T[id][1] }));

const GROUPS: { id: string; label: string; icon: Icon; tabs: Tab[] }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: ['overview', 'business'] },
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
  return <span ref={ref} data-no-motion className={cn('tabular-nums', className)}>0</span>;
}

export function DeckHeader({ needs, search }: { needs: number | null; search: React.ReactNode }) {
  const now = useNow();
  return (
    // M92: plain and solid, after the owner's photos (no grid, drifting glows, heartbeat line or beam).
    <section className="dark trace-hero relative rounded-3xl text-white">
      <div className="relative p-5 sm:p-7 flex flex-col lg:flex-row lg:items-end gap-5 justify-between">
        <div className="min-w-0">
          <p className="text-[13px] text-zinc-400">{now ? new Date(now).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ' '}</p>
          <h1 className="mt-3 flex items-center gap-3 text-3xl sm:text-4xl font-semibold tracking-[-0.03em]">
            <span className="karma-icon"><Crown className="w-5 h-5" strokeWidth={1.5} aria-hidden /></span>
            <span><span className="font-normal text-zinc-400">Owner</span> console</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-300 max-w-xl">Everything on UniVerse. Only you can open this page. Every change here can be undone.</p>
        </div>
        <div className="flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-auto lg:min-w-[22rem]">
          {needs !== null && (
            <span className={cn('self-start lg:self-end inline-flex items-center gap-2 h-7 px-3 rounded-full text-xs font-medium border', needs ? 'border-amber-300/30 bg-amber-400/10 text-amber-200' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200')}>
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

