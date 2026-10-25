'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, Ban, Bug, Clock, LogIn, ShieldCheck, Trash2, UserPlus, Users, GraduationCap, School, UserCog, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActivePoll } from '@/lib/realtime-client';
import { ConsoleSkeleton, SearchBox, card, fetcher, heavy, matches, useDebounced } from './shared';
import { type PlanUsage, PlanUsageCard } from './server';
import { type Tab, Ticker } from './deck';
import { LaunchBoard } from './launch';
import { LiveBoard } from './live';
import { SampleWorldCard } from './sample-world';

// The console's first section (M13): what needs the owner, who really uses each app (launch.tsx), the
// live instrument board (live.tsx), the rest as small tiles (amber when something waits), new accounts
// drawn as a line, where and on what people sign in, who is online, and the latest sign-ins and
// actions on a lit timeline.

interface OverviewData {
  roles: Record<string, number>; statuses: Record<string, number>; online: { id: string; name: string; role: string; lastSeenAt: string }[];
  signInsToday: number; newUsers: number; messagesToday: number; pendingApps: number; openErrors: number; pendingDeletions: number;
  signUps: { day: string; count: number }[]; countries: { name: string; count: number }[]; devices: { name: string; count: number }[];
  recentSignIns: { id: string; createdAt: string; kind: string; method: string | null; device: string | null; city: string | null; country: string | null; ip: string | null; user: { id: string; name: string; role: string; email: string } }[];
  recentActions: { id: string; createdAt: string; actorId: string | null; actorName: string | null; summary: string }[];
  usage?: PlanUsage | null;
}
type Found = { total: number; people: { id: string; name: string; email: string; phone: string | null; role: string; owner: boolean }[] };

const h2 = 'text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2';
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** New accounts per day as a line over a soft two-tone fill, revealed left to right (.deck-draw). */
function Trend({ days }: { days: { day: string; count: number }[] }) {
  const n = Math.max(1, days.length - 1);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const pts = days.map((d, i) => [(i / n) * 100, 92 - (d.count / peak) * 80] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return (
    <div className="relative h-32">
      <svg aria-hidden className="deck-draw absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5f5c57" stopOpacity="0.35" /><stop offset="1" stopColor="#5f5c57" stopOpacity="0" /></linearGradient>
          <linearGradient id="trend-line" x1="0" x2="1"><stop offset="0" stopColor="#2a2927" /><stop offset="1" stopColor="#db2777" /></linearGradient>
        </defs>
        {pts.length > 1 && <>
          <path d={`${line} L100 100 L0 100 Z`} fill="url(#trend-fill)" />
          <path d={line} fill="none" stroke="url(#trend-line)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </>}
      </svg>
      {/* One column a day: hover (or focus with a screen reader) for the day's number. */}
      <div className="absolute inset-0 flex" role="list" aria-label="New accounts per day">
        {days.map((d) => (
          <span key={d.day} role="listitem" title={`${format(new Date(d.day), 'd MMM')}: ${d.count}`} className="flex-1 hover:bg-indigo-500/[0.06] rounded">
            <span className="sr-only">{format(new Date(d.day), 'd MMM')}: {d.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TopList({ title, rows, icon: Icon }: { title: string; rows: { name: string; count: number }[]; icon: typeof Users }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className={cn(h2, 'mb-4')}><Icon className="w-4 h-4 text-indigo-500 dark:text-indigo-300" aria-hidden /> {title}</h2>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No sign-ins yet.</p> : (
        <ol className="space-y-2.5">{rows.map((r, i) => (
          <li key={r.name} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate text-zinc-700 dark:text-zinc-200"><span className="font-mono text-[11px] text-zinc-400 me-2">{String(i + 1).padStart(2, '0')}</span>{r.name}</span>
              <span className="text-zinc-500 tabular-nums">{r.count}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
              <div className="bar-grow h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${(r.count / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
            </div>
          </li>
        ))}</ol>
      )}
    </div>
  );
}

export function Overview({ onPerson, onTab }: { onPerson: (id: string) => void; onTab: (t: Tab, status?: string) => void }) {
  const { data } = useSWR<OverviewData>('/owner/overview', fetcher, { ...heavy, refreshInterval: useActivePoll(60_000) });
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data: found } = useSWR<Found>(dq ? `/owner/people?q=${encodeURIComponent(dq)}` : null, fetcher);
  if (!data) return <ConsoleSkeleton />;
  const signUps = data.signUps ?? [];
  const go = (to: string) => { const [t, status] = to.split(':'); onTab(t as Tab, status); };
  const small: [string, number, string, typeof Users, boolean][] = [
    ['Students', data.roles.STUDENT ?? 0, 'people', GraduationCap, false], ['Teachers', data.roles.TEACHER ?? 0, 'people', School, false],
    ['Admins', data.roles.ADMIN ?? 0, 'people', UserCog, false], ['New this week', data.newUsers, 'people', UserPlus, false],
    ['Waiting for approval', data.statuses.PENDING ?? 0, 'people:PENDING', Clock, true], ['Suspended', data.statuses.SUSPENDED ?? 0, 'people:SUSPENDED', Ban, true],
    ['Open errors', data.openErrors ?? 0, 'errors', Bug, true], ['Deletion requests', data.pendingDeletions ?? 0, 'deletions', Trash2, true],
  ];
  const online = data.online.filter((u) => matches(q, u.name, u.role));
  const signIns = data.recentSignIns.filter((x) => matches(q, x.user.name, x.user.email, x.user.role, x.device, x.city, x.country, x.ip, x.method));
  const actions = data.recentActions.filter((a) => matches(q, a.actorName, a.summary));
  const dot = 'absolute -start-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 shadow-[0_0_10px_rgba(236,72,153,0.55)]';
  return (
    <div className="space-y-6">
      <SampleWorldCard />
      <LaunchBoard />
      <LiveBoard />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {small.map(([label, n, to, Icon, warn]) => {
          const waiting = warn && n > 0;
          return (
            <button key={label} type="button" onClick={() => go(to)}
              className={cn(card, 'flex items-center gap-3 px-3.5 py-3 text-start transition-colors', waiting ? 'border-amber-300/70 dark:border-amber-400/25 bg-amber-50/70 dark:bg-amber-400/[0.06]' : 'hover:border-indigo-400/40')}>
              <Icon className={cn('w-4 h-4 shrink-0', waiting ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-400')} aria-hidden />
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight text-zinc-900 dark:text-white"><Ticker value={n} /></span>
                <span className="block text-xs text-zinc-500 truncate">{label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <PlanUsageCard usage={data.usage ?? null} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className={cn(card, 'p-5')}>
          <h2 className={h2}><UserPlus className="w-4 h-4 text-indigo-500 dark:text-indigo-300" aria-hidden /> New accounts · 14 days</h2>
          <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white"><Ticker value={signUps.reduce((a, d) => a + d.count, 0)} /></p>
          <div className="mt-2"><Trend days={signUps} /></div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-400">
            {signUps.length > 1 && <><span>{format(new Date(signUps[0].day), 'd MMM')}</span><span>today</span></>}
          </div>
        </div>
        <TopList title="Where people sign in from · 30 days" rows={data.countries ?? []} icon={ShieldCheck} />
        <TopList title="Devices · 30 days" rows={data.devices ?? []} icon={LogIn} />
      </div>

      <div className={cn(card, 'p-5')}>
        <SearchBox value={q} onChange={setQ} placeholder="Search people, sign-ins and actions" />
        {dq && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">People matching “{dq}”{found ? ` · ${found.total}` : ''}</p>
            {!found ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : found.people.length === 0 ? <p className="text-sm text-zinc-500">Nobody.</p> : (
              <ul className="grid sm:grid-cols-2 gap-1">{found.people.slice(0, 10).map((p) => (
                <li key={p.id}><button type="button" onClick={() => onPerson(p.id)} className="w-full text-start rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">{p.name}</span> <span className="text-[10px] font-bold uppercase text-zinc-400">{p.owner ? 'owner' : p.role}</span>
                  <span className="block text-xs text-zinc-500 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ''}</span>
                </button></li>
              ))}</ul>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className={cn(card, 'p-5')}>
          <h2 className={cn(h2, 'mb-4')}><span className="w-2 h-2 rounded-full bg-emerald-500 deck-ping" /> Online now</h2>
          {online.length === 0 ? <p className="text-sm text-zinc-500">{q ? 'Nobody online matches.' : 'Nobody right now.'}</p> : (
            <ul className="grid sm:grid-cols-2 gap-2">{online.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onPerson(u.id)} className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                  <span className="relative shrink-0 w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white bg-gradient-to-br from-indigo-500 to-fuchsia-600">
                    {initials(u.name)}<span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0b0b0c]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{u.name}</span>
                    <span className="block text-xs text-zinc-500">{u.role.toLowerCase()} · {formatDistanceToNow(new Date(u.lastSeenAt), { addSuffix: true })}</span>
                  </span>
                </button>
              </li>
            ))}</ul>
          )}
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className={cn(h2, 'mb-4')}><LogIn className="w-4 h-4 text-indigo-500 dark:text-indigo-300" aria-hidden /> Latest sign-ins</h2>
          {signIns.length === 0 && <p className="text-sm text-zinc-500">No sign-ins match.</p>}
          <ol className="relative ms-1.5 border-s border-zinc-200 dark:border-white/10 space-y-3">{signIns.map((s) => (
            <li key={s.id} className="relative ps-4 text-sm">
              <span aria-hidden className={dot} />
              <button type="button" onClick={() => onPerson(s.user.id)} className="font-medium text-zinc-900 dark:text-white hover:text-indigo-500">{s.user.name}</button>
              <span className="text-zinc-500"> · {s.kind === 'SIGN_UP' ? 'signed up' : s.kind === 'SIGN_IN' ? 'signed in' : 'opened the app'}{s.method ? ` with ${s.method}` : ''}</span>
              <p className="font-mono text-[11px] text-zinc-400">{[s.device, s.city, s.country, s.ip].filter(Boolean).join(' · ')} · {format(new Date(s.createdAt), 'd MMM, HH:mm')}</p>
            </li>
          ))}</ol>
        </div>
        <div className={cn(card, 'p-5 lg:col-span-2')}>
          <h2 className={cn(h2, 'mb-4')}><Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-300" aria-hidden /> Latest actions</h2>
          {actions.length === 0 && <p className="text-sm text-zinc-500">No actions match.</p>}
          <ol className="relative ms-1.5 border-s border-zinc-200 dark:border-white/10 space-y-3">{actions.map((a) => (
            <li key={a.id} className="relative ps-4 text-sm">
              <span aria-hidden className={dot} />
              {a.actorId ? <button type="button" onClick={() => onPerson(a.actorId!)} className="font-medium text-zinc-900 dark:text-white hover:text-indigo-500">{a.actorName}</button> : <span className="font-medium">System</span>}
              <span className="text-zinc-600 dark:text-zinc-300"> · {a.summary}</span>
              <span className="font-mono text-[11px] text-zinc-400"> · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
            </li>
          ))}</ol>
        </div>
      </div>
    </div>
  );
}
