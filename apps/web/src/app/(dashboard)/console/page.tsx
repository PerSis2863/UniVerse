'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, Bug, Crown, Database, Download, History, LayoutDashboard, Loader2, LogIn, MessageSquare, MousePointerClick, Trash2, Undo2, Users } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { type Rec, type Schema, RecordEditor, SearchBox, card, downloadCsv, fetcher, field, formatValue, matches, summarize, undoChange, useDebounced } from './shared';
import { PersonPanel } from './person';
import { ErrorsPanel } from './errors';
import { DeletionsPanel } from './deletions';

// The owner console: only for the platform owner. The server answers "not found" to anyone else,
// and this page shows the same "not found" screen, so it doesn't reveal itself.

type Tab = 'overview' | 'activity' | 'people' | 'data' | 'changes' | 'errors' | 'deletions';
const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Live activity', icon: Activity },
  { id: 'people', label: 'People', icon: Users },
  { id: 'data', label: 'All data', icon: Database },
  { id: 'changes', label: 'Changes & undo', icon: History },
  { id: 'errors', label: 'Errors', icon: Bug },
  { id: 'deletions', label: 'Deletion requests', icon: Trash2 },
];

export default function OwnerConsole() {
  const owner = useAuthStore((s) => s.user?.owner === true);
  const [tab, setTab] = useState<Tab>('overview');
  const [person, setPerson] = useState<string | null>(null);
  // Links such as /console?tab=errors (from the error digest email) open that tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab(t as Tab); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  const { data: tables } = useSWR<{ tables: { name: string; title: string; count: number }[]; schema: Schema }>(owner ? '/owner/tables' : null, fetcher);

  if (!owner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <p className="text-5xl font-black text-zinc-300 dark:text-zinc-700">404</p>
        <p className="mt-2 text-sm text-zinc-500">This page could not be found.</p>
      </div>
    );
  }

  const openPerson = (id: string) => {
    setPerson(id);
    setTab('people');
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-4 sm:px-8 pt-6 pb-4 border-b border-zinc-200/70 dark:border-white/[0.06]">
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-2"><Crown className="w-6 h-6 text-amber-500" /> Owner console</h1>
        <p className="text-sm text-zinc-500">Everything on UniVerse. Only you can open this page. Every change here can be undone.</p>
        <nav className="mt-4 flex flex-wrap gap-1" aria-label="Console sections">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== 'people') setPerson(null); }}
              className={cn('inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold', tab === t.id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="p-4 sm:p-8 max-w-6xl mx-auto">
        {!tables ? (
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        ) : tab === 'overview' ? (
          <Overview onPerson={openPerson} onTab={setTab} />
        ) : tab === 'activity' ? (
          <Feed onPerson={openPerson} />
        ) : tab === 'people' ? (
          person ? <PersonPanel id={person} schema={tables.schema} onBack={() => setPerson(null)} /> : <People onPerson={setPerson} />
        ) : tab === 'data' ? (
          <Data tables={tables.tables} schema={tables.schema} />
        ) : tab === 'errors' ? (
          <ErrorsPanel />
        ) : tab === 'deletions' ? (
          <DeletionsPanel onOpenPerson={openPerson} />
        ) : (
          <Changes />
        )}
      </main>
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────────────────────────

interface OverviewData {
  roles: Record<string, number>; statuses: Record<string, number>; online: { id: string; name: string; role: string; lastSeenAt: string }[];
  signInsToday: number; newUsers: number; messagesToday: number; pendingApps: number; openErrors: number; pendingDeletions: number;
  signUps: { day: string; count: number }[]; countries: { name: string; count: number }[]; devices: { name: string; count: number }[];
  recentSignIns: { id: string; createdAt: string; kind: string; method: string | null; device: string | null; city: string | null; country: string | null; ip: string | null; user: { id: string; name: string; role: string; email: string } }[];
  recentActions: { id: string; createdAt: string; actorId: string | null; actorName: string | null; summary: string }[];
}

type PersonRow = {
  id: string; name: string; email: string; phone: string | null; role: string; status: string; accountType: string | null; onboardedAt: string | null; createdAt: string; lastSeenAt: string | null;
  lastSignIn: { createdAt: string; device: string | null; country: string | null; city: string | null } | null; owner: boolean; signIns: number; courses: number; messages: number;
};

function Overview({ onPerson, onTab }: { onPerson: (id: string) => void; onTab: (t: Tab) => void }) {
  const { data } = useSWR<OverviewData>('/owner/overview', fetcher, { refreshInterval: 60_000 });
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data: found } = useSWR<{ total: number; people: PersonRow[] }>(dq ? `/owner/people?q=${encodeURIComponent(dq)}` : null, fetcher);
  if (!data) return <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />;
  const total = Object.values(data.roles).reduce((a, b) => a + b, 0);
  const tiles: [string, number, Tab][] = [
    ['People', total, 'people'], ['Students', data.roles.STUDENT ?? 0, 'people'], ['Teachers', data.roles.TEACHER ?? 0, 'people'], ['Admins', data.roles.ADMIN ?? 0, 'people'],
    ['Online now', data.online.length, 'activity'], ['Sign-ins today', data.signInsToday, 'activity'], ['Messages today', data.messagesToday, 'activity'], ['New this week', data.newUsers, 'people'],
    ['Waiting for approval', data.statuses.PENDING ?? 0, 'people'], ['Suspended', data.statuses.SUSPENDED ?? 0, 'people'], ['Open errors', data.openErrors ?? 0, 'errors'], ['Deletion requests', data.pendingDeletions ?? 0, 'deletions'],
  ];
  const online = data.online.filter((u) => matches(q, u.name, u.role));
  const signIns = data.recentSignIns.filter((x) => matches(q, x.user.name, x.user.email, x.user.role, x.device, x.city, x.country, x.ip, x.method));
  const actions = data.recentActions.filter((a) => matches(q, a.actorName, a.summary));
  const peak = Math.max(1, ...(data.signUps ?? []).map((d) => d.count));
  return (
    <div className="space-y-6">
      <SearchBox value={q} onChange={setQ} placeholder="Search people, sign-ins and actions" />
      {dq && (
        <div className={cn(card, 'p-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">People matching “{dq}”{found ? ` · ${found.total}` : ''}</p>
          {!found ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : found.people.length === 0 ? <p className="text-sm text-zinc-500">Nobody.</p> : (
            <ul className="grid sm:grid-cols-2 gap-1">{found.people.slice(0, 10).map((p) => (
              <li key={p.id}><button onClick={() => onPerson(p.id)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">{p.name}</span> <span className="text-[10px] font-bold uppercase text-zinc-400">{p.owner ? 'owner' : p.role}</span>
                <span className="block text-xs text-zinc-500 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ''}</span>
              </button></li>
            ))}</ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(([label, n, to]) => (
          <button key={label} onClick={() => onTab(to)} className={cn(card, 'p-4 text-left hover:border-indigo-500/40')}>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{n}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className={cn(card, 'p-5 lg:col-span-1')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">New accounts · 14 days</h2>
          <div className="flex items-end gap-1 h-28" role="img" aria-label="New accounts per day">
            {(data.signUps ?? []).map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${format(new Date(d.day), 'd MMM')}: ${d.count}`}>
                <div className="w-full rounded-t bg-gradient-to-t from-indigo-600/70 to-fuchsia-400/80" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / peak) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{(data.signUps ?? []).reduce((a, d) => a + d.count, 0)} in the last 14 days</p>
        </div>
        <TopList title="Where people sign in from · 30 days" rows={data.countries ?? []} />
        <TopList title="Devices · 30 days" rows={data.devices ?? []} />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Online now</h2>
          {online.length === 0 ? <p className="text-sm text-zinc-500">{q ? 'Nobody online matches.' : 'Nobody right now.'}</p> : (
            <ul className="space-y-2">{online.map((u) => (
              <li key={u.id}><button onClick={() => onPerson(u.id)} className="text-sm text-left hover:text-indigo-500"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2" />{u.name} <span className="text-xs text-zinc-400">{u.role.toLowerCase()} · {formatDistanceToNow(new Date(u.lastSeenAt), { addSuffix: true })}</span></button></li>
            ))}</ul>
          )}
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Latest sign-ins</h2>
          {signIns.length === 0 && <p className="text-sm text-zinc-500">No sign-ins match.</p>}
          <ul className="space-y-2">{signIns.map((s) => (
            <li key={s.id} className="text-sm">
              <button onClick={() => onPerson(s.user.id)} className="font-medium text-zinc-900 dark:text-white hover:text-indigo-500">{s.user.name}</button>
              <span className="text-zinc-500"> · {s.kind === 'SIGN_UP' ? 'signed up' : s.kind === 'SIGN_IN' ? 'signed in' : 'opened the app'}{s.method ? ` with ${s.method}` : ''}</span>
              <p className="text-xs text-zinc-400">{[s.device, s.city, s.country, s.ip].filter(Boolean).join(' · ')} · {format(new Date(s.createdAt), 'd MMM, HH:mm')}</p>
            </li>
          ))}</ul>
        </div>
        <div className={cn(card, 'p-5 lg:col-span-2')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Latest actions</h2>
          {actions.length === 0 && <p className="text-sm text-zinc-500">No actions match.</p>}
          <ul className="space-y-2">{actions.map((a) => (
            <li key={a.id} className="text-sm">
              {a.actorId ? <button onClick={() => onPerson(a.actorId!)} className="font-medium text-zinc-900 dark:text-white hover:text-indigo-500">{a.actorName}</button> : <span className="font-medium">System</span>}
              <span className="text-zinc-600 dark:text-zinc-300"> · {a.summary}</span>
              <span className="text-xs text-zinc-400"> · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
            </li>
          ))}</ul>
        </div>
      </div>
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No sign-ins yet.</p> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.name} className="text-sm">
            <div className="flex justify-between gap-2"><span className="truncate text-zinc-700 dark:text-zinc-200">{r.name}</span><span className="text-zinc-400 tabular-nums">{r.count}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06]"><div className="h-full rounded-full bg-indigo-500/70" style={{ width: `${(r.count / max) * 100}%` }} /></div>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

// ─── Live activity ─────────────────────────────────────────────────────────────────────────────

type FeedItem = { kind: 'signin' | 'action' | 'message' | 'ui'; at: string; user: { id: string | null; name: string | null; role: string | null } | null; data: Record<string, unknown> };

const ROLE_OPTIONS = [['', 'Everyone'], ['STUDENT', 'Students'], ['TEACHER', 'Teachers'], ['ADMIN', 'Admins'], ['INDUSTRY_MENTOR', 'Mentors']] as const;

function Feed({ onPerson }: { onPerson: (id: string) => void }) {
  const [filter, setFilter] = useState<'' | FeedItem['kind']>('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const dq = useDebounced(q.trim());
  const base = `/owner/activity?${new URLSearchParams({ ...(filter && { kind: filter }), ...(dq && { q: dq }), ...(role && { role }) })}`;
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<{ items: FeedItem[]; next: string | null }>(
    (i, prev) => (i === 0 ? base : prev?.next ? `${base}&before=${encodeURIComponent(prev.next)}` : null),
    fetcher,
    { refreshInterval: dq ? 0 : 30_000 },
  );
  const items = (data ?? []).flatMap((p) => p.items);
  const more = !!data?.[data.length - 1]?.next;
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search names, emails, messages, pages, buttons, devices, places" />
        <select className={cn(field, 'sm:w-40')} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Who">
          {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {([['', 'Everything'], ['signin', 'Sign-ins'], ['action', 'Actions'], ['message', 'Messages'], ['ui', 'Clicks & pages']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn('px-3 py-1.5 rounded-full text-xs font-semibold', filter === k ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{l}</button>
        ))}
        {isValidating && !isLoading && <Loader2 className="ml-2 w-3.5 h-3.5 animate-spin text-zinc-400" />}
      </div>
      <ul className={cn(card, 'divide-y divide-zinc-100 dark:divide-white/[0.05]')}>
        {isLoading && <li className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></li>}
        {!isLoading && items.length === 0 && <li className="p-6 text-sm text-zinc-500">{dq || role || filter ? 'Nothing matches.' : 'Nothing yet.'}</li>}
        {items.map((x, i) => {
          const Icon = x.kind === 'signin' ? LogIn : x.kind === 'message' ? MessageSquare : x.kind === 'ui' ? MousePointerClick : Activity;
          const d = x.data;
          const what = x.kind === 'signin'
            ? `${d.kind === 'SIGN_UP' ? 'signed up' : d.kind === 'SIGN_IN' ? 'signed in' : 'opened the app'}${d.method ? ` with ${d.method}` : ''} · ${[d.device, d.city, d.country, d.ip].filter(Boolean).join(' · ')}`
            : x.kind === 'ui'
              ? d.kind === 'VIEW' ? `opened ${String(d.path)}` : `clicked “${String(d.label ?? 'a button')}” on ${String(d.path)}`
            : x.kind === 'message'
              ? `${d.type === 'CALL' ? 'started a call' : 'sent a message'}${(d.conversation as { name?: string } | null)?.name ? ` in ${(d.conversation as { name: string }).name}` : ''}: “${String(d.body ?? '').slice(0, 120)}”`
              : String(d.summary);
          return (
            <li key={`${x.kind}-${String(d.id)}-${i}`} className="p-4 flex gap-3">
              <Icon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1 text-sm">
                {x.user?.id ? <button onClick={() => onPerson(x.user!.id!)} className="font-semibold text-zinc-900 dark:text-white hover:text-indigo-500">{x.user.name}</button> : <span className="font-semibold">System</span>}
                {x.user?.role && <span className="ml-1 text-[10px] font-bold uppercase text-zinc-400">{x.user.role}</span>}
                <p className="text-zinc-600 dark:text-zinc-300 break-words">{what}</p>
              </div>
              <time className="text-xs text-zinc-400 shrink-0" title={new Date(x.at).toLocaleString()}>{format(new Date(x.at), 'd MMM, HH:mm:ss')}</time>
            </li>
          );
        })}
      </ul>
      {more && <button onClick={() => setSize(size + 1)} className="text-sm font-semibold text-indigo-500">Load older</button>}
    </div>
  );
}

// ─── People ────────────────────────────────────────────────────────────────────────────────────

function People({ onPerson }: { onPerson: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const dq = useDebounced(q.trim());
  const params = new URLSearchParams({ ...(dq && { q: dq }), ...(role && { role }), ...(status && { status }), ...(page && { skip: String(page * 200) }) });
  const { data, isLoading } = useSWR<{ total: number; people: PersonRow[] }>(`/owner/people?${params}`, fetcher, { keepPreviousData: true });
  const people = data?.people ?? [];
  const exportCsv = () => downloadCsv('universe-people', ['Name', 'Email', 'Phone', 'Role', 'Status', 'Account type', 'Courses', 'Sign-ins', 'Messages sent', 'Last sign-in', 'Device', 'Place', 'Last active', 'Joined'],
    people.map((p) => [p.name, p.email, p.phone, p.owner ? 'OWNER' : p.role, p.status, p.accountType, p.courses, p.signIns, p.messages, p.lastSignIn?.createdAt, p.lastSignIn?.device, [p.lastSignIn?.city, p.lastSignIn?.country].filter(Boolean).join(', '), p.lastSeenAt, p.createdAt]));
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Name, email or phone" />
        <select className={cn(field, 'sm:w-40')} value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }} aria-label="Role">{ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{v ? l : 'All roles'}</option>)}</select>
        <select className={cn(field, 'sm:w-40')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING">Waiting for approval</option><option value="SUSPENDED">Suspended</option></select>
        <button onClick={exportCsv} disabled={!people.length} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-50"><Download className="w-4 h-4" /> CSV</button>
      </div>
      <p className="text-xs text-zinc-500">{data ? `${data.total} ${data.total === 1 ? 'person' : 'people'}${data.total > 200 ? ` · showing ${page * 200 + 1}–${page * 200 + people.length}` : ''}` : ' '}</p>
      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>{['Name', 'Email', 'Phone', 'Role', 'Status', 'Courses', 'Sign-ins', 'Messages', 'Last sign-in', 'Last active', 'Joined'].map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {isLoading && <tr><td className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></td></tr>}
            {!isLoading && people.length === 0 && <tr><td colSpan={11} className="p-6 text-sm text-zinc-500">Nobody matches.</td></tr>}
            {people.map((p) => (
              <tr key={p.id} onClick={() => onPerson(p.id)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{p.name} {p.owner && <Crown className="inline w-3.5 h-3.5 text-amber-500" />}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{p.email}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{p.phone ?? '—'}</td>
                <td className="px-4 py-3">{p.owner ? 'OWNER' : p.role}{p.accountType && <span className="block text-[10px] text-zinc-400">{p.accountType.toLowerCase()}</span>}</td>
                <td className={cn('px-4 py-3', p.status === 'SUSPENDED' && 'text-rose-500', p.status === 'PENDING' && 'text-amber-500')}>{p.status}</td>
                <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-300" title={p.role === 'TEACHER' ? 'Courses taught' : 'Courses enrolled'}>{p.courses}</td>
                <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">{p.signIns}</td>
                <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">{p.messages}</td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                  {p.lastSignIn ? (
                    <span title={formatDistanceToNow(new Date(p.lastSignIn.createdAt), { addSuffix: true })}>
                      <span className="block text-zinc-700 dark:text-zinc-300">{format(new Date(p.lastSignIn.createdAt), 'd MMM yyyy, HH:mm')}</span>
                      <span className="block text-xs">{[p.lastSignIn.device ?? 'Unknown device', p.lastSignIn.city, p.lastSignIn.country].filter(Boolean).join(' · ')}</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{p.lastSeenAt ? formatDistanceToNow(new Date(p.lastSeenAt), { addSuffix: true }) : '—'}</td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{format(new Date(p.createdAt), 'd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > 200 && (
        <div className="flex gap-3 text-sm">
          {page > 0 && <button onClick={() => setPage(page - 1)} className="font-semibold text-indigo-500">← Newer</button>}
          {(page + 1) * 200 < data.total && <button onClick={() => setPage(page + 1)} className="font-semibold text-indigo-500">Older →</button>}
        </div>
      )}
    </div>
  );
}

// ─── All data ──────────────────────────────────────────────────────────────────────────────────

function Data({ tables, schema }: { tables: { name: string; title: string; count: number }[]; schema: Schema }) {
  const [table, setTable] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [skip, setSkip] = useState(0);
  const [editing, setEditing] = useState<Rec | null>(null);
  const [find, setFind] = useState('');
  const dq = useDebounced(q.trim());
  const { data, isLoading } = useSWR<{ fields: { name: string }[]; records: Rec[]; total: number }>(table ? `/owner/records/${table}?skip=${skip}${dq ? `&q=${encodeURIComponent(dq)}` : ''}` : null, fetcher, { keepPreviousData: true });
  if (!table) {
    const shown = tables.filter((t) => matches(find, t.title, t.name));
    return (
      <div className="space-y-4">
      <SearchBox value={find} onChange={setFind} placeholder={`Search ${tables.length} tables`} />
      {shown.length === 0 && <p className="text-sm text-zinc-500">No table matches.</p>}
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {shown.map((t) => (
          <li key={t.name}><button onClick={() => { setTable(t.name); setSkip(0); setQ(''); }} className={cn(card, 'w-full p-3 text-left flex justify-between hover:border-indigo-500/40')}><span className="text-sm font-medium text-zinc-900 dark:text-white">{t.title}</span><span className="text-xs text-zinc-400">{t.count}</span></button></li>
        ))}
      </ul>
      </div>
    );
  }
  const cols = (data?.fields ?? []).map((f) => f.name).filter((n) => n !== 'id').slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setTable(null)} className="text-sm text-zinc-500">← All tables</button>
        <h2 className="font-bold text-zinc-900 dark:text-white">{table}</h2>
        <span className="text-xs text-zinc-400">{data?.total ?? '…'} records</span>
        <SearchBox className="sm:max-w-xs ml-auto" value={q} onChange={(v) => { setQ(v); setSkip(0); }} placeholder={`Search ${table}`} />
      </div>
      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500"><tr>{['', ...cols].map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {isLoading && <tr><td className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></td></tr>}
            {data && data.records.length === 0 && <tr><td colSpan={cols.length + 1} className="p-6 text-sm text-zinc-500">No records{dq ? ' match' : ''}.</td></tr>}
            {data?.records.map((r) => (
              <tr key={r.id} onClick={() => setEditing(r)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03] align-top">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-white max-w-[220px] truncate">{summarize(r)}</td>
                {cols.map((c) => <td key={c} className="px-3 py-2 text-zinc-600 dark:text-zinc-300 max-w-[200px] truncate">{formatValue(r[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-sm">
        {skip > 0 && <button onClick={() => setSkip(Math.max(0, skip - 50))} className="font-semibold text-indigo-500">← Newer</button>}
        {data && skip + 50 < data.total && <button onClick={() => setSkip(skip + 50)} className="font-semibold text-indigo-500">Older →</button>}
      </div>
      {editing && <RecordEditor model={table} record={editing} schema={schema} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─── Changes & undo ────────────────────────────────────────────────────────────────────────────

function Changes() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const base = `/owner/changes${dq ? `?q=${encodeURIComponent(dq)}` : ''}`;
  const { data: pages, size, setSize, isLoading } = useSWRInfinite<{ items: { id: string; action: string; model: string; summary: string; createdAt: string; undoneAt: string | null; before: unknown; after: unknown }[]; next: string | null }>(
    (i, prev) => (i === 0 ? base : prev?.next ? `${base}${dq ? '&' : '?'}before=${encodeURIComponent(prev.next)}` : null),
    fetcher,
  );
  const items = (pages ?? []).flatMap((p) => p.items);
  const more = !!pages?.[pages.length - 1]?.next;
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder="Search changes (what, which table, record id)" />
      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-zinc-400" /> : !items.length ? (
        <p className="text-sm text-zinc-500">{dq ? 'No changes match.' : 'No changes yet. Everything you edit or delete in the console appears here, with an Undo button.'}</p>
      ) : (
    <ul className={cn(card, 'divide-y divide-zinc-100 dark:divide-white/[0.05]')}>
      {items.map((c) => (
        <li key={c.id} className={cn('p-4 flex gap-3 items-start', c.undoneAt && 'opacity-60')}>
          <History className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-zinc-900 dark:text-white break-words">{c.summary}</p>
            {c.action === 'UPDATE' && (
              <p className="text-xs text-zinc-500 break-words">
                {Object.keys((c.before ?? {}) as object).map((k) => `${k}: ${JSON.stringify((c.before as Record<string, unknown>)[k])} → ${JSON.stringify((c.after as Record<string, unknown>)?.[k])}`).join(' · ')}
              </p>
            )}
            <p className="text-xs text-zinc-400">{c.model} · {format(new Date(c.createdAt), 'd MMM yyyy, HH:mm')}{c.undoneAt ? ` · undone ${formatDistanceToNow(new Date(c.undoneAt), { addSuffix: true })}` : ''}</p>
          </div>
          {!c.undoneAt && (c.action === 'UPDATE' || c.action === 'DELETE') && (
            <button onClick={async () => { setBusy(c.id); await undoChange(c.id); setBusy(null); }} aria-busy={busy === c.id || undefined} disabled={busy === c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-200 shrink-0">
              {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Undo
            </button>
          )}
        </li>
      ))}
    </ul>
      )}
      {more && <button onClick={() => setSize(size + 1)} className="text-sm font-semibold text-indigo-500">Load older</button>}
    </div>
  );
}
