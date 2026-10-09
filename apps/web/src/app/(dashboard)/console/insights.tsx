'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ArrowRight, Bug, CheckCircle2, CreditCard, Download, History, Loader2, MessageSquare, MessagesSquare, Pencil, Search, Trash2, Users, X } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { PLANS, type PlanId } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { card, downloadCsv, errorMessage, fetcher, field, refreshConsole, toastWithUndo, useDebounced } from './shared';
import { ConsoleSkeleton } from './shared';
import { useActivePoll } from '@/lib/realtime-client';
import { TabPill } from '@/components/ui/Glide';

// Owner console pieces that read across the app (server side: src/server/modules/owner-insights.ts):
// the "Needs your attention" card, the console-wide search, Analytics and Money.

export type Attention = {
  items: { id: string; level: 'high' | 'medium' | 'low'; text: string; tab?: string; href?: string; filter?: string }[];
  badges: Record<string, number>;
};

/** What needs the owner now, shared by the Overview card and the counts on the tabs. */
export const useAttention = () => useSWR<Attention>('/owner/attention', fetcher, { refreshInterval: useActivePoll(60_000) });

const LEVEL = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-zinc-400',
};

export function AttentionCard({ onGo }: { onGo: (tab: string, filter?: string) => void }) {
  const { data } = useAttention();
  if (!data) return null;
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-3">
        {data.items.length ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {data.items.length ? 'Needs your attention' : 'All clear: nothing needs you right now'}
      </h2>
      {data.items.length > 0 && (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {data.items.map((x) => {
            const inner = (
              <>
                <span className={cn('w-2 h-2 rounded-full shrink-0', LEVEL[x.level])} />
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">{x.text}</span>
                <ArrowRight className="w-4 h-4 text-zinc-300 shrink-0" />
              </>
            );
            const cls = 'w-full flex items-center gap-3 py-2.5 text-left hover:text-indigo-500';
            return (
              <li key={x.id}>
                {x.href ? <a href={x.href} className={cls}>{inner}</a> : <button onClick={() => onGo(x.tab!, x.filter)} className={cls}>{inner}</button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Search everything ─────────────────────────────────────────────────────────────────────────

type Found = {
  people: { id: string; name: string; email: string; role: string; status: string; owner: boolean }[];
  chats: { id: string; name: string | null; isGroup: boolean; updatedAt: string }[];
  messages: { id: string; body: string; createdAt: string; conversationId: string; sender: { name: string } | null }[];
  errors: { id: string; message: string; path: string | null; status: string; lastSeen: string }[];
  changes: { id: string; summary: string; createdAt: string }[];
};

export type Go =
  | { to: 'person'; id: string }
  | { to: 'chat'; id: string }
  | { to: 'error'; id: string; status: string }
  | { to: 'table'; name: string }
  | { to: 'changes'; q: string };

function Row({ icon: Icon, title, sub, onClick }: { icon: typeof Users; title: string; sub?: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="w-full text-left px-3 py-2 flex gap-2.5 items-start rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
        <Icon className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm text-zinc-900 dark:text-white truncate">{title}</span>
          {sub && <span className="block text-xs text-zinc-500 truncate">{sub}</span>}
        </span>
      </button>
    </li>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{label}</p>
      <ul>{children}</ul>
    </div>
  );
}

export function ConsoleSearch({ tables, onGo }: { tables: { name: string; title: string; count: number }[]; onGo: (g: Go) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim());
  const box = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useSWR<Found>(dq.length >= 2 ? `/owner/search?q=${encodeURIComponent(dq)}` : null, fetcher, { keepPreviousData: true });
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const go = (g: Go) => { onGo(g); setOpen(false); setQ(''); };
  const lower = dq.toLowerCase();
  const tableHits = dq.length >= 2 ? tables.filter((t) => t.title.toLowerCase().includes(lower) || t.name.toLowerCase().includes(lower)).slice(0, 5) : [];
  const empty = data && !tableHits.length && !data.people.length && !data.chats.length && !data.messages.length && !data.errors.length && !data.changes.length;
  return (
    <div ref={box} className="relative w-full sm:max-w-md">
      <label className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] px-3 py-2">
        <Search className="w-4 h-4 text-zinc-400" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Search everything: people, chats, messages, errors, tables" aria-label="Search the console" className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400" />
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
        {q && <button onClick={() => setQ('')} aria-label="Clear"><X className="w-4 h-4 text-zinc-400" /></button>}
      </label>
      {open && dq.length >= 2 && (
        <div className="absolute z-40 mt-2 w-full max-h-[70vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 tone-panel shadow-xl p-1.5">
          {!data && <p className="p-3 text-sm text-zinc-500">Searching…</p>}
          {empty && <p className="p-3 text-sm text-zinc-500">Nothing matches “{dq}”.</p>}
          {!!data?.people.length && <Group label="People">{data.people.map((p) => <Row key={p.id} icon={Users} title={p.name} sub={`${p.email} · ${p.owner ? 'owner' : p.role.toLowerCase()}${p.status !== 'ACTIVE' ? ` · ${p.status.toLowerCase()}` : ''}`} onClick={() => go({ to: 'person', id: p.id })} />)}</Group>}
          {!!data?.chats.length && <Group label="Chats">{data.chats.map((c) => <Row key={c.id} icon={MessagesSquare} title={c.name ?? 'Private chat'} sub={`${c.isGroup ? 'Group' : 'Chat'} · active ${formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}`} onClick={() => go({ to: 'chat', id: c.id })} />)}</Group>}
          {!!data?.messages.length && <Group label="Messages">{data.messages.map((m) => <Row key={m.id} icon={MessageSquare} title={m.body} sub={`${m.sender?.name ?? 'Someone'} · ${format(new Date(m.createdAt), 'd MMM, HH:mm')}`} onClick={() => go({ to: 'chat', id: m.conversationId })} />)}</Group>}
          {!!data?.errors.length && <Group label="Errors">{data.errors.map((e) => <Row key={e.id} icon={Bug} title={e.message} sub={`${e.path ?? ''} · ${e.status.toLowerCase()} · last ${formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}`} onClick={() => go({ to: 'error', id: e.id, status: e.status })} />)}</Group>}
          {!!tableHits.length && <Group label="Tables">{tableHits.map((t) => <Row key={t.name} icon={Search} title={t.title} sub={`${t.count} records`} onClick={() => go({ to: 'table', name: t.name })} />)}</Group>}
          {!!data?.changes.length && <Group label="Your changes">{data.changes.map((c) => <Row key={c.id} icon={History} title={c.summary} sub={format(new Date(c.createdAt), 'd MMM yyyy, HH:mm')} onClick={() => go({ to: 'changes', q: dq })} />)}</Group>}
        </div>
      )}
    </div>
  );
}

// ─── Small charts ──────────────────────────────────────────────────────────────────────────────

function Bars({ values, labels, tone = 'from-indigo-600/70 to-fuchsia-400/80', height = 'h-32', title }: { values: number[]; labels: string[]; tone?: string; height?: string; title: (i: number) => string }) {
  const peak = Math.max(1, ...values);
  return (
    <div>
      <div className={cn('flex items-end gap-[3px]', height)} role="img" aria-label={labels.length ? `${labels[0]} to ${labels[labels.length - 1]}` : 'chart'}>
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full" title={title(i)}>
            <div className={cn('w-full rounded-t bg-gradient-to-t', tone)} style={{ height: `${Math.max(v ? 6 : 2, (v / peak) * 100)}%`, opacity: v ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      {labels.length > 1 && <div className="mt-1 flex justify-between text-[10px] text-zinc-400"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
    </div>
  );
}

function Tiles({ tiles }: { tiles: [string, string | number, string?][] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map(([label, value, hint]) => (
        <div key={label} className={cn(card, 'p-4')}>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">{value}</p>
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{label}</p>
          {hint && <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>}
        </div>
      ))}
    </div>
  );
}

function Ranked({ title, rows, empty, onClick }: { title: string; rows: { key: string; label: string; sub?: string; value: number }[]; empty: string; onClick?: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">{empty}</p> : (
        <ul className="space-y-2.5">{rows.map((r) => {
          const body = (
            <>
              <div className="flex justify-between gap-2 text-sm"><span className="truncate text-zinc-700 dark:text-zinc-200">{r.label}</span><span className="text-zinc-500 tabular-nums shrink-0">{r.value}</span></div>
              {r.sub && <p className="text-[11px] text-zinc-400 truncate">{r.sub}</p>}
              <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06]"><div className="h-full rounded-full bg-indigo-500/70" style={{ width: `${(r.value / max) * 100}%` }} /></div>
            </>
          );
          return <li key={r.key}>{onClick ? <button onClick={() => onClick(r.key)} className="w-full text-left">{body}</button> : body}</li>;
        })}</ul>
      )}
    </div>
  );
}

// ─── Analytics ─────────────────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  days: number;
  perDay: { day: string; active: number; joined: number; messages: number }[];
  totals: { people: number; activeDay: number; activeWeek: number; activeMonth: number; neverActive: number; unfinished: number; views: number; clicks: number; signIns: number };
  activeByRole: Record<string, number>;
  pages: { path: string; views: number; people: number }[];
  buttons: { label: string; path: string; clicks: number }[];
  hours: number[];
  busiest: { id: string; name: string; role: string; events: number }[];
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const ROLE_NAMES: Record<string, string> = { STUDENT: 'Students', TEACHER: 'Teachers', ADMIN: 'Admins', INDUSTRY_MENTOR: 'Mentors', GUARDIAN: 'Parents' };

export function AnalyticsPanel({ onPerson }: { onPerson: (id: string) => void }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<AnalyticsData>(`/owner/analytics?days=${days}`, fetcher, { keepPreviousData: true, refreshInterval: useActivePoll(120_000) });
  if (isLoading && !data) return <ConsoleSkeleton />;
  if (!data) return null;
  const t = data.totals;
  const labels = data.perDay.map((d) => format(new Date(d.day), 'd MMM'));
  // Hours are counted in UTC; move them to this device's time zone.
  const shift = -new Date().getTimezoneOffset() / 60;
  const hours = Array.from({ length: 24 }, (_, h) => data.hours[(((h - shift) % 24) + 24) % 24] ?? 0);
  const busiestHour = hours.indexOf(Math.max(...hours));
  const sum = (k: 'active' | 'joined' | 'messages') => data.perDay.reduce((s, d) => s + d[k], 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-sm text-zinc-500">Real use of UniVerse, from page views, button presses, sign-ins and messages.</p>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={cn('relative isolate px-3 py-1.5 rounded-full text-xs font-semibold', days === d ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{days === d && <TabPill id="p-dashboard-console-insights-0" />}{d} days</button>
          ))}
          <button onClick={() => downloadCsv(`universe-analytics-${days}d`, ['Day', 'Active people', 'New accounts', 'Messages'], data.perDay.map((d) => [d.day, d.active, d.joined, d.messages]))}
            className="btn-secondary inline-flex items-center gap-1.5 ml-1"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>
      <Tiles tiles={[
        ['Active today', t.activeDay, `${pct(t.activeDay, t.people)} of ${t.people} people`],
        ['Active this week', t.activeWeek, pct(t.activeWeek, t.people)],
        ['Active this month', t.activeMonth, pct(t.activeMonth, t.people)],
        ['Never opened the app', t.neverActive, `${t.unfinished} didn't finish signing up`],
        ['Pages opened', t.views, `last ${days} days`],
        ['Buttons pressed', t.clicks, `last ${days} days`],
        ['Sign-ins and app opens', t.signIns, `last ${days} days`],
        ['Messages sent', sum('messages'), `last ${days} days`],
      ]} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className={cn(card, 'p-5 lg:col-span-2')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">People active per day</h2>
          <Bars values={data.perDay.map((d) => d.active)} labels={labels} title={(i) => `${labels[i]}: ${data.perDay[i].active} people`} />
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Who is active · {days} days</h2>
          {Object.keys(data.activeByRole).length === 0 ? <p className="text-sm text-zinc-500">Nobody yet.</p> : (
            <ul className="space-y-2 text-sm">{Object.entries(data.activeByRole).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
              <li key={role} className="flex justify-between"><span className="text-zinc-700 dark:text-zinc-200">{ROLE_NAMES[role] ?? role}</span><span className="text-zinc-500 tabular-nums">{n}</span></li>
            ))}</ul>
          )}
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">New accounts per day</h2>
          <Bars height="h-24" tone="from-emerald-600/70 to-teal-300/80" values={data.perDay.map((d) => d.joined)} labels={labels} title={(i) => `${labels[i]}: ${data.perDay[i].joined} new`} />
          <p className="mt-2 text-xs text-zinc-500">{sum('joined')} in {days} days</p>
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Messages per day</h2>
          <Bars height="h-24" tone="from-sky-600/70 to-cyan-300/80" values={data.perDay.map((d) => d.messages)} labels={labels} title={(i) => `${labels[i]}: ${data.perDay[i].messages} messages`} />
          <p className="mt-2 text-xs text-zinc-500">{sum('messages')} in {days} days</p>
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Busiest hours (your time)</h2>
          <Bars height="h-24" tone="from-amber-600/70 to-yellow-300/80" values={hours} labels={['00:00', '23:00']} title={(h) => `${String(h).padStart(2, '0')}:00: ${hours[h]} actions`} />
          <p className="mt-2 text-xs text-zinc-500">{Math.max(...hours) ? `Busiest around ${String(busiestHour).padStart(2, '0')}:00` : 'No activity yet'}</p>
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <Ranked title="Most opened pages" empty="No page views yet." rows={data.pages.map((p) => ({ key: p.path, label: p.path, sub: `${p.people} ${p.people === 1 ? 'person' : 'people'}`, value: p.views }))} />
        <Ranked title="Most pressed buttons" empty="No button presses yet." rows={data.buttons.map((b) => ({ key: `${b.label}${b.path}`, label: `“${b.label}”`, sub: b.path, value: b.clicks }))} />
        <Ranked title="Most active people" empty="Nobody yet." onClick={onPerson} rows={data.busiest.map((b) => ({ key: b.id, label: b.name, sub: b.role.toLowerCase(), value: b.events }))} />
      </div>
      <SpeedPanel />
    </div>
  );
}

// ─── Speed (Core Web Vitals from real visits, src/lib/web-vitals.ts) ──────────────────────────

type VitalStat = { p75: number; n: number };
interface VitalsData { days: number; devices: Record<string, Record<string, VitalStat>>; pages: { page: string; n: number; metrics: Record<string, VitalStat> }[] }

// Google's thresholds: good up to the first number, poor from the second.
const VITAL_INFO: Record<string, { name: string; good: number; poor: number; ms: boolean }> = {
  LCP: { name: 'Main content shown', good: 2500, poor: 4000, ms: true },
  INP: { name: 'Response to taps', good: 200, poor: 500, ms: true },
  CLS: { name: 'Layout jumps', good: 0.1, poor: 0.25, ms: false },
  FCP: { name: 'First content', good: 1800, poor: 3000, ms: true },
  TTFB: { name: 'Server answer', good: 800, poor: 1800, ms: true },
};
const vitalText = (k: string, v: number) => (!VITAL_INFO[k].ms ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const vitalTone = (k: string, v: number) => (v <= VITAL_INFO[k].good ? 'text-emerald-600 dark:text-emerald-400' : v < VITAL_INFO[k].poor ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400');

function SpeedPanel() {
  const [days, setDays] = useState(7);
  const { data } = useSWR<VitalsData>(`/owner/vitals?days=${days}`, fetcher, { keepPreviousData: true, refreshInterval: useActivePoll(300_000) });
  const cell = (k: string, s?: VitalStat) => (s ? <span className={cn('tabular-nums font-semibold', vitalTone(k, s.p75))}>{vitalText(k, s.p75)}</span> : <span className="text-zinc-400">—</span>);
  return (
    <div className={cn(card, 'p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-semibold text-zinc-900 dark:text-white">Speed for real people</h2>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={cn('relative isolate px-3 py-1.5 rounded-full text-xs font-semibold', days === d ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{days === d && <TabPill id="p-dashboard-console-speed" />}{d} days</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-zinc-500 mb-4">From 10% of page loads, anonymous. 3 in 4 visits were at least this fast (75th percentile). Green is good, amber needs work, red is poor. Targets: main content under 2.5 s, response to taps under 200 ms.</p>
      {!data ? <div className="h-24 rounded-xl skeleton" /> : !data.pages.length ? <p className="text-sm text-zinc-500">No measurements yet. They arrive as people use the app.</p> : (
        <>
          <div className="grid sm:grid-cols-2 gap-3 mb-5">
            {(['phone', 'desktop'] as const).map((dev) => (
              <div key={dev} className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] p-3">
                <p className="text-xs font-semibold text-zinc-500 mb-2">{dev === 'phone' ? 'Phones and tablets' : 'Computers'}</p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  {(['LCP', 'INP', 'CLS'] as const).map((k) => (
                    <div key={k}><dt className="text-[11px] text-zinc-500">{VITAL_INFO[k].name}</dt><dd>{cell(k, data.devices[dev]?.[k])}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5 px-1 font-medium">Page</th>
                {(['LCP', 'INP', 'CLS', 'TTFB'] as const).map((k) => <th key={k} className="py-1.5 px-1 font-medium text-right">{VITAL_INFO[k].name}</th>)}
                <th className="py-1.5 px-1 font-medium text-right">Visits</th>
              </tr></thead>
              <tbody>
                {data.pages.map((p) => (
                  <tr key={p.page} className="border-t border-zinc-100 dark:border-white/[0.06]">
                    <td className="py-1.5 px-1 font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[220px]">{p.page}</td>
                    {(['LCP', 'INP', 'CLS', 'TTFB'] as const).map((k) => <td key={k} className="py-1.5 px-1 text-right">{cell(k, p.metrics[k])}</td>)}
                    <td className="py-1.5 px-1 text-right tabular-nums text-zinc-500">{p.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Money ─────────────────────────────────────────────────────────────────────────────────────

interface MoneyData {
  currency: string;
  byStatus: { status: string; currency: string; count: number; total: number }[];
  byType: { type: string; currency: string; total: number }[];
  perDay: { day: string; total: number }[];
  thisMonth: number; lastMonth: number;
  recent: { id: string; amount: number; currency: string; type: string; description: string; status: string; createdAt: string; user: { id: string; name: string; email: string } | null }[];
  invoices: { status: string; currency: string; count: number; total: number; overdue: number; overdueTotal: number }[];
  invoiceList: { id: string; number: string; amount: number; currency: string; status: string; dueDate: string | null; description: string | null; createdAt: string; user: { id: string; name: string } | null }[];
  subscriptions: { mrr: number; paying: number; orgs: { id: string; name: string; plan: string; planName: string; price: number; subscriptionStatus: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }[] };
}

const STATUS_TONE: Record<string, string> = { COMPLETED: 'text-emerald-600 dark:text-emerald-400', PENDING: 'text-amber-600 dark:text-amber-400', FAILED: 'text-rose-500', REFUNDED: 'text-zinc-500' };
const STATUS_NAME: Record<string, string> = { COMPLETED: 'Paid', PENDING: 'Waiting', FAILED: 'Failed', REFUNDED: 'Refunded' };
const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function MoneyPanel({ onPerson }: { onPerson: (id: string) => void }) {
  const { data, isLoading } = useSWR<MoneyData>('/owner/money', fetcher, { refreshInterval: useActivePoll(120_000) });
  const [status, setStatus] = useState('');
  if (isLoading || !data) return <ConsoleSkeleton />;
  const money = (n: number, c = data.currency) => new Intl.NumberFormat('en', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n);
  const paid = data.byStatus.filter((x) => x.status === 'COMPLETED' && x.currency === data.currency);
  const of = (s: string) => data.byStatus.filter((x) => x.status === s && x.currency === data.currency);
  const total = (rows: { total: number }[]) => rows.reduce((a, x) => a + x.total, 0);
  const count = (rows: { count: number }[]) => rows.reduce((a, x) => a + x.count, 0);
  const overdue = data.invoices.reduce((a, x) => a + x.overdue, 0);
  const change = data.lastMonth ? Math.round(((data.thisMonth - data.lastMonth) / data.lastMonth) * 100) : null;
  const labels = data.perDay.map((d) => format(new Date(d.day), 'd MMM'));
  const recent = data.recent.filter((p) => !status || p.status === status);
  return (
    <div className="space-y-6">
      <Tiles tiles={[
        ['Paid this month', money(data.thisMonth), change == null ? `last month ${money(data.lastMonth)}` : `${change >= 0 ? '+' : ''}${change}% vs last month`],
        ['Paid in total', money(total(paid)), `${count(paid)} payments`],
        ['Waiting to be paid', money(total(of('PENDING'))), `${count(of('PENDING'))} payments${overdue ? ` · ${overdue} overdue invoices` : ''}`],
        ['Subscriptions', money(data.subscriptions.mrr), `a month from ${data.subscriptions.paying} paying ${data.subscriptions.paying === 1 ? 'organization' : 'organizations'} (estimate)`],
      ]} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className={cn(card, 'p-5 lg:col-span-2')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Money received per day · 30 days</h2>
          <Bars tone="from-emerald-600/70 to-lime-300/80" values={data.perDay.map((d) => d.total)} labels={labels} title={(i) => `${labels[i]}: ${money(data.perDay[i].total)}`} />
          {failedNote(of('FAILED'), money)}
        </div>
        <Ranked title="What people paid for" empty="No paid payments yet." rows={data.byType.filter((x) => x.currency === data.currency).map((x) => ({ key: x.type, label: nice(x.type), value: Math.round(x.total) }))} />
      </div>
      <div className={cn(card, 'p-5')}>
        <div className="flex flex-wrap items-center gap-2 justify-between mb-3">
          <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-zinc-400" /> Latest payments</h2>
          <div className="flex flex-wrap gap-1">
            {['', 'COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'].map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={cn('relative isolate px-3 py-1 rounded-full text-xs font-semibold', status === s ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{status === s && <TabPill id="pill-5-0" />}{s ? STATUS_NAME[s] : 'All'}</button>
            ))}
            <button onClick={() => downloadCsv('universe-payments', ['Date', 'Person', 'Email', 'What', 'Type', 'Amount', 'Currency', 'Status'], recent.map((p) => [p.createdAt, p.user?.name, p.user?.email, p.description, p.type, p.amount, p.currency, p.status]))}
              className="btn-secondary inline-flex items-center gap-1.5 ml-1"><Download className="w-4 h-4" /> CSV</button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-3">Changes here fix UniVerse’s records only. Stripe is not charged or refunded, so do refunds in Stripe too.</p>
        <PaymentList rows={recent} money={money} onPerson={onPerson} />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Invoices</h2>
          {data.invoices.length === 0 ? <p className="text-sm text-zinc-500">No invoices yet.</p> : (
            <ul className="space-y-2 text-sm">{data.invoices.map((x) => (
              <li key={`${x.status}${x.currency}`} className="flex justify-between gap-2">
                <span className={STATUS_TONE[x.status]}>{STATUS_NAME[x.status] ?? x.status} · {x.count}{x.overdue ? <span className="text-rose-500"> ({x.overdue} overdue, {money(x.overdueTotal, x.currency)})</span> : null}</span>
                <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{money(x.total, x.currency)}</span>
              </li>
            ))}</ul>
          )}
          <InvoiceList rows={data.invoiceList} money={money} onPerson={onPerson} />
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Organization plans</h2>
          {data.subscriptions.orgs.length === 0 ? <p className="text-sm text-zinc-500">No organization is on a paid plan yet.</p> : (
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">{data.subscriptions.orgs.map((o) => (
              <li key={o.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-zinc-900 dark:text-white truncate">{o.name}</span>
                  <span className="block text-xs text-zinc-500">{o.planName}{o.price ? ` · ${money(o.price, 'USD')}/month` : ''}{o.currentPeriodEnd ? ` · ${o.cancelAtPeriodEnd ? 'ends' : 'renews'} ${format(new Date(o.currentPeriodEnd), 'd MMM yyyy')}` : ''}</span>
                </span>
                <span className={cn('text-xs font-semibold', o.subscriptionStatus === 'active' || o.subscriptionStatus === 'trialing' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{o.subscriptionStatus ? nice(o.subscriptionStatus.toUpperCase()) : 'No subscription'}</span>
                <select aria-label={`Plan for ${o.name}`} value={o.plan} onChange={(e) => void editRecord('Organization', o.id, { plan: e.target.value }, `${o.name} is now on ${PLANS[e.target.value as PlanId]?.name ?? e.target.value}`)}
                  className="text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-1.5 py-1">
                  {(Object.keys(PLANS) as PlanId[]).map((id) => <option key={id} value={id}>{PLANS[id].name}</option>)}
                </select>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Edits any record through the console's record editor routes, with Undo. */
async function editRecord(model: string, id: string, data: Record<string, unknown>, done: string) {
  try {
    const res = (await api.patch(`/owner/records/${model}/${id}`, { data })).data;
    toastWithUndo(done, res.changeId);
    await refreshConsole();
  } catch (e) { toast.error(errorMessage(e)); }
}

async function removeRecord(path: string, what: string) {
  if (!(await confirmDialog({ title: `Delete ${what}?`, message: 'You can undo this from the message that appears, or from Changes & undo.', confirmLabel: 'Delete', destructive: true }))) return;
  try {
    const res = (await api.delete(path)).data;
    toastWithUndo(`Deleted ${what}`, res.changeId);
    await refreshConsole();
  } catch (e) { toast.error(errorMessage(e)); }
}

const STATUS_OPTIONS = ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'];
const small = 'text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-1.5 py-1';
const iconBtn = 'p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-white/[0.06]';

type PaymentRowData = MoneyData['recent'][number];

/** Latest payments: change a status, fix the amount or what it was for, delete, one at a time or many. */
function PaymentList({ rows, money, onPerson }: { rows: PaymentRowData[]; money: (n: number, c?: string) => string; onPerson: (id: string) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const shown = rows.filter((p) => picked.has(p.id));
  const all = rows.length > 0 && shown.length === rows.length;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = async (action: string) => {
    const ids = shown.map((p) => p.id);
    if (action === 'delete' && !(await confirmDialog({ title: `Delete ${ids.length} ${ids.length === 1 ? 'payment' : 'payments'}?`, message: 'You can undo this from the message that appears, or from Changes & undo.', confirmLabel: 'Delete', destructive: true }))) return;
    setBusy(true);
    try {
      const res = (await api.post('/owner/payments/bulk', { ids, action })).data;
      toastWithUndo(action === 'delete' ? `Deleted ${res.done} ${res.done === 1 ? 'payment' : 'payments'}` : `Marked ${res.done} as ${STATUS_NAME[action].toLowerCase()}`, res.changeId);
      setPicked(new Set());
      await refreshConsole();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No payments here.</p>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-zinc-100 dark:border-white/[0.05]">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((p) => p.id)))} /> Select all shown ({rows.length})
        </label>
        {shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{shown.length} selected:</span>
            {STATUS_OPTIONS.map((s) => <button key={s} disabled={busy} onClick={() => void bulk(s)} className="btn-secondary !py-1 !px-2.5 text-xs">Mark {STATUS_NAME[s].toLowerCase()}</button>)}
            <button disabled={busy} onClick={() => void bulk('delete')} className="!py-1 !px-2.5 text-xs rounded-xl font-semibold text-white bg-rose-600 hover:bg-rose-500 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        )}
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">{rows.map((p) => (
        <PaymentRow key={p.id} p={p} money={money} onPerson={onPerson} picked={picked.has(p.id)} onPick={() => toggle(p.id)} />
      ))}</ul>
    </>
  );
}

function PaymentRow({ p, money, onPerson, picked, onPick }: { p: PaymentRowData; money: (n: number, c?: string) => string; onPerson: (id: string) => void; picked: boolean; onPick: () => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(p.amount));
  const [what, setWhat] = useState(p.description);
  const save = async (body: Record<string, unknown>, done: string) => {
    try {
      const res = (await api.patch(`/owner/payments/${p.id}`, body)).data;
      toastWithUndo(done, res.changeId);
      setEditing(false);
      await refreshConsole();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <li className="py-2.5 text-sm">
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label="Select payment" checked={picked} onChange={onPick} />
        <span className="min-w-0 flex-1">
          <span className="block text-zinc-900 dark:text-white truncate">{p.description}</span>
          <span className="block text-xs text-zinc-500 truncate">
            {p.user ? <button onClick={() => onPerson(p.user!.id)} className="hover:text-indigo-500">{p.user.name}</button> : 'Deleted user'} · {nice(p.type)} · {format(new Date(p.createdAt), 'd MMM yyyy, HH:mm')}
          </span>
        </span>
        <select aria-label="Payment status" value={p.status} onChange={(e) => void save({ status: e.target.value }, `Marked as ${STATUS_NAME[e.target.value].toLowerCase()}`)} className={cn(small, 'font-semibold', STATUS_TONE[p.status])}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_NAME[s]}</option>)}
        </select>
        <span className="w-20 text-right font-semibold tabular-nums text-zinc-900 dark:text-white">{money(p.amount, p.currency)}</span>
        <button aria-label="Edit payment" onClick={() => setEditing(!editing)} className={iconBtn}><Pencil className="w-4 h-4" /></button>
        <button aria-label="Delete payment" onClick={() => void removeRecord(`/owner/payments/${p.id}`, 'this payment')} className={cn(iconBtn, 'hover:!text-rose-500')}><Trash2 className="w-4 h-4" /></button>
      </div>
      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); void save({ amount, description: what }, 'Payment updated'); }} className="mt-2 ml-7 flex flex-wrap items-center gap-2">
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What it was for" className={cn(field, 'flex-1 min-w-[10rem]')} />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label={`Amount in ${p.currency}`} className={cn(field, 'w-28')} />
          <button type="submit" className="btn-primary">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
        </form>
      )}
    </li>
  );
}

/** The latest invoices, each with a status to change and a delete button. */
function InvoiceList({ rows, money, onPerson }: { rows: MoneyData['invoiceList']; money: (n: number, c?: string) => string; onPerson: (id: string) => void }) {
  if (!rows?.length) return null;
  return (
    <ul className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.05] divide-y divide-zinc-100 dark:divide-white/[0.05] max-h-96 overflow-y-auto">{rows.map((x) => (
      <li key={x.id} className="py-2 flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1">
          <span className="block text-zinc-900 dark:text-white truncate">{x.number}{x.description ? ` · ${x.description}` : ''}</span>
          <span className="block text-xs text-zinc-500 truncate">
            {x.user ? <button onClick={() => onPerson(x.user!.id)} className="hover:text-indigo-500">{x.user.name}</button> : 'Deleted user'}{x.dueDate ? ` · due ${format(new Date(x.dueDate), 'd MMM yyyy')}` : ''}
          </span>
        </span>
        <select aria-label="Invoice status" value={x.status} onChange={(e) => void editRecord('Invoice', x.id, { status: e.target.value, ...(e.target.value === 'COMPLETED' && { paidAt: new Date().toISOString() }) }, `Invoice ${x.number} marked as ${STATUS_NAME[e.target.value].toLowerCase()}`)} className={cn(small, 'font-semibold', STATUS_TONE[x.status])}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_NAME[s]}</option>)}
        </select>
        <span className="w-20 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{money(x.amount, x.currency)}</span>
        <button aria-label="Delete invoice" onClick={() => void removeRecord(`/owner/records/Invoice/${x.id}`, `invoice ${x.number}`)} className={cn(iconBtn, 'hover:!text-rose-500')}><Trash2 className="w-4 h-4" /></button>
      </li>
    ))}</ul>
  );
}

function failedNote(rows: { count: number; total: number }[], money: (n: number) => string) {
  const n = rows.reduce((a, x) => a + x.count, 0);
  if (!n) return null;
  return <p className="mt-2 text-xs text-rose-500">{n} failed {n === 1 ? 'payment' : 'payments'} in total, {money(rows.reduce((a, x) => a + x.total, 0))}.</p>;
}
