'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, Bug, Crown, Database, History, LayoutDashboard, Loader2, LogIn, MessageSquare, Search, Undo2, Users } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { type Rec, type Schema, RecordEditor, card, fetcher, field, formatValue, summarize, undoChange } from './shared';
import { PersonPanel } from './person';
import { ErrorsPanel } from './errors';

// The owner console: only for the platform owner. The server answers "not found" to anyone else,
// and this page shows the same "not found" screen, so it doesn't reveal itself.

type Tab = 'overview' | 'activity' | 'people' | 'data' | 'changes' | 'errors';
const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Live activity', icon: Activity },
  { id: 'people', label: 'People', icon: Users },
  { id: 'data', label: 'All data', icon: Database },
  { id: 'changes', label: 'Changes & undo', icon: History },
  { id: 'errors', label: 'Errors', icon: Bug },
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
          <Overview onPerson={openPerson} />
        ) : tab === 'activity' ? (
          <Feed onPerson={openPerson} />
        ) : tab === 'people' ? (
          person ? <PersonPanel id={person} schema={tables.schema} onBack={() => setPerson(null)} /> : <People onPerson={setPerson} />
        ) : tab === 'data' ? (
          <Data tables={tables.tables} schema={tables.schema} />
        ) : tab === 'errors' ? (
          <ErrorsPanel />
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
  signInsToday: number; newUsers: number; messagesToday: number; pendingApps: number;
  recentSignIns: { id: string; createdAt: string; kind: string; method: string | null; device: string | null; city: string | null; country: string | null; ip: string | null; user: { id: string; name: string; role: string; email: string } }[];
  recentActions: { id: string; createdAt: string; actorId: string | null; actorName: string | null; summary: string }[];
}

function Overview({ onPerson }: { onPerson: (id: string) => void }) {
  const { data } = useSWR<OverviewData>('/owner/overview', fetcher, { refreshInterval: 60_000 });
  if (!data) return <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />;
  const total = Object.values(data.roles).reduce((a, b) => a + b, 0);
  const tiles = [
    ['People', total], ['Students', data.roles.STUDENT ?? 0], ['Teachers', data.roles.TEACHER ?? 0], ['Admins', data.roles.ADMIN ?? 0],
    ['Online now', data.online.length], ['Sign-ins today', data.signInsToday], ['Messages today', data.messagesToday], ['New this week', data.newUsers],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(([label, n]) => (
          <div key={label} className={cn(card, 'p-4')}>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{n}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Online now</h2>
          {data.online.length === 0 ? <p className="text-sm text-zinc-500">Nobody right now.</p> : (
            <ul className="space-y-2">{data.online.map((u) => (
              <li key={u.id}><button onClick={() => onPerson(u.id)} className="text-sm text-left hover:text-indigo-500"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2" />{u.name} <span className="text-xs text-zinc-400">{u.role.toLowerCase()} · {formatDistanceToNow(new Date(u.lastSeenAt), { addSuffix: true })}</span></button></li>
            ))}</ul>
          )}
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Latest sign-ins</h2>
          <ul className="space-y-2">{data.recentSignIns.map((s) => (
            <li key={s.id} className="text-sm">
              <button onClick={() => onPerson(s.user.id)} className="font-medium text-zinc-900 dark:text-white hover:text-indigo-500">{s.user.name}</button>
              <span className="text-zinc-500"> · {s.kind === 'SIGN_UP' ? 'signed up' : s.kind === 'SIGN_IN' ? 'signed in' : 'opened the app'}{s.method ? ` with ${s.method}` : ''}</span>
              <p className="text-xs text-zinc-400">{[s.device, s.city, s.country, s.ip].filter(Boolean).join(' · ')} · {format(new Date(s.createdAt), 'd MMM, HH:mm')}</p>
            </li>
          ))}</ul>
        </div>
        <div className={cn(card, 'p-5 lg:col-span-2')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Latest actions</h2>
          <ul className="space-y-2">{data.recentActions.map((a) => (
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

// ─── Live activity ─────────────────────────────────────────────────────────────────────────────

type FeedItem = { kind: 'signin' | 'action' | 'message'; at: string; user: { id: string | null; name: string | null; role: string | null } | null; data: Record<string, unknown> };

function Feed({ onPerson }: { onPerson: (id: string) => void }) {
  const [filter, setFilter] = useState<'' | FeedItem['kind']>('');
  const { data, size, setSize, isLoading } = useSWRInfinite<{ items: FeedItem[]; next: string | null }>(
    (i, prev) => (i === 0 ? '/owner/activity' : prev?.next ? `/owner/activity?before=${encodeURIComponent(prev.next)}` : null),
    fetcher,
    { refreshInterval: 30_000 },
  );
  const items = (data ?? []).flatMap((p) => p.items).filter((x) => !filter || x.kind === filter);
  const more = !!data?.[data.length - 1]?.next;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {([['', 'Everything'], ['signin', 'Sign-ins'], ['action', 'Actions'], ['message', 'Messages']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn('px-3 py-1.5 rounded-full text-xs font-semibold', filter === k ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{l}</button>
        ))}
      </div>
      <ul className={cn(card, 'divide-y divide-zinc-100 dark:divide-white/[0.05]')}>
        {isLoading && <li className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></li>}
        {items.map((x, i) => {
          const Icon = x.kind === 'signin' ? LogIn : x.kind === 'message' ? MessageSquare : Activity;
          const d = x.data;
          const what = x.kind === 'signin'
            ? `${d.kind === 'SIGN_UP' ? 'signed up' : d.kind === 'SIGN_IN' ? 'signed in' : 'opened the app'}${d.method ? ` with ${d.method}` : ''} · ${[d.device, d.city, d.country, d.ip].filter(Boolean).join(' · ')}`
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
              <time className="text-xs text-zinc-400 shrink-0" title={new Date(x.at).toLocaleString()}>{format(new Date(x.at), 'd MMM, HH:mm')}</time>
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
  const params = new URLSearchParams({ ...(q.trim() && { q: q.trim() }), ...(role && { role }), ...(status && { status }) });
  const { data, isLoading } = useSWR<{ id: string; name: string; email: string; phone: string | null; role: string; status: string; createdAt: string; lastSeenAt: string | null; lastSignIn: { createdAt: string; device: string | null; country: string | null } | null; owner: boolean }[]>(`/owner/people?${params}`, fetcher);
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input className={cn(field, 'pl-9')} placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        </div>
        <select className={cn(field, 'sm:w-40')} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="">All roles</option><option>STUDENT</option><option>TEACHER</option><option>ADMIN</option><option>INDUSTRY_MENTOR</option></select>
        <select className={cn(field, 'sm:w-40')} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option>ACTIVE</option><option>PENDING</option><option>SUSPENDED</option></select>
      </div>
      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>{['Name', 'Email', 'Phone', 'Role', 'Status', 'Last sign-in', 'Joined'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {isLoading && <tr><td className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></td></tr>}
            {data?.map((p) => (
              <tr key={p.id} onClick={() => onPerson(p.id)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{p.name} {p.owner && <Crown className="inline w-3.5 h-3.5 text-amber-500" />}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{p.email}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{p.phone ?? '—'}</td>
                <td className="px-4 py-3">{p.role}</td>
                <td className={cn('px-4 py-3', p.status === 'SUSPENDED' && 'text-rose-500')}>{p.status}</td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{p.lastSignIn ? `${formatDistanceToNow(new Date(p.lastSignIn.createdAt), { addSuffix: true })}${p.lastSignIn.device ? ` · ${p.lastSignIn.device}` : ''}` : '—'}</td>
                <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{format(new Date(p.createdAt), 'd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── All data ──────────────────────────────────────────────────────────────────────────────────

function Data({ tables, schema }: { tables: { name: string; title: string; count: number }[]; schema: Schema }) {
  const [table, setTable] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [skip, setSkip] = useState(0);
  const [editing, setEditing] = useState<Rec | null>(null);
  const { data, isLoading } = useSWR<{ fields: { name: string }[]; records: Rec[]; total: number }>(table ? `/owner/records/${table}?skip=${skip}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}` : null, fetcher);
  if (!table) {
    return (
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {tables.map((t) => (
          <li key={t.name}><button onClick={() => { setTable(t.name); setSkip(0); setQ(''); }} className={cn(card, 'w-full p-3 text-left flex justify-between hover:border-indigo-500/40')}><span className="text-sm font-medium text-zinc-900 dark:text-white">{t.title}</span><span className="text-xs text-zinc-400">{t.count}</span></button></li>
        ))}
      </ul>
    );
  }
  const cols = (data?.fields ?? []).map((f) => f.name).filter((n) => n !== 'id').slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setTable(null)} className="text-sm text-zinc-500">← All tables</button>
        <h2 className="font-bold text-zinc-900 dark:text-white">{table}</h2>
        <span className="text-xs text-zinc-400">{data?.total ?? '…'} records</span>
        <input className={cn(field, 'sm:w-64 ml-auto')} placeholder="Search text" value={q} onChange={(e) => { setQ(e.target.value); setSkip(0); }} aria-label="Search records" />
      </div>
      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500"><tr>{['', ...cols].map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {isLoading && <tr><td className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></td></tr>}
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
  const { data, isLoading } = useSWR<{ items: { id: string; action: string; model: string; summary: string; createdAt: string; undoneAt: string | null; before: unknown; after: unknown }[] }>('/owner/changes', fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />;
  if (!data?.items.length) return <p className="text-sm text-zinc-500">No changes yet. Everything you edit or delete in the console appears here, with an Undo button.</p>;
  return (
    <ul className={cn(card, 'divide-y divide-zinc-100 dark:divide-white/[0.05]')}>
      {data.items.map((c) => (
        <li key={c.id} className={cn('p-4 flex gap-3 items-start', c.undoneAt && 'opacity-60')}>
          <History className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-zinc-900 dark:text-white break-words">{c.summary}</p>
            {c.action === 'UPDATE' && (
              <p className="text-xs text-zinc-500 break-words">
                {Object.keys((c.before ?? {}) as object).map((k) => `${k}: ${JSON.stringify((c.before as Record<string, unknown>)[k])} → ${JSON.stringify((c.after as Record<string, unknown>)?.[k])}`).join(' · ')}
              </p>
            )}
            <p className="text-xs text-zinc-400">{format(new Date(c.createdAt), 'd MMM yyyy, HH:mm')}{c.undoneAt ? ` · undone ${formatDistanceToNow(new Date(c.undoneAt), { addSuffix: true })}` : ''}</p>
          </div>
          {!c.undoneAt && (c.action === 'UPDATE' || c.action === 'DELETE') && (
            <button onClick={async () => { setBusy(c.id); await undoChange(c.id); setBusy(null); }} disabled={busy === c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-200 shrink-0">
              {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
