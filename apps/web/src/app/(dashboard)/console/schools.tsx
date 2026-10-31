'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Building2, ChevronDown, Eye, Flag, Loader2, ShieldAlert, Store, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { card, errorMessage, fetcher, field, ConsoleSkeleton, SearchBox, useDebounced } from './shared';
import { Bars, Tiles } from './insights';
import { LoadError } from '@/components/ui/LoadError';

// Stage 5 · Q19 Owner console: Schools (every school at a glance, growth, "View as") and
// Moderation (safety reports from every school in one queue). Server: src/server/modules/owner-console.ts.

type Health = 'good' | 'watch' | 'risk';
type School = {
  id: string; name: string; plan: string; planName: string; subscriptionStatus: string | null; seats: number; trialEndsAt: string | null;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; members: number; active: number; open: number; off: string[]; health: Health; reasons: string[];
};
type Growth = {
  currency: string; mrr: number; paying: number;
  revenue: { month: string; total: number }[];
  churn: { month: string; started: number; ended: number; payingAtStart: number; rate: number | null }[];
  cohorts: { month: string; size: number; kept: number[] }[];
};
type Person = { id: string; name: string; email: string; role: string; lastSeenAt: string | null };
type Item = { kind: 'flag' | 'report' | 'listing'; id: string; title: string; severity: string | null; text: string; reason?: string | null; repeats?: number; hidden?: boolean; at: string; person: { id: string | null; name: string; school: string | null } };

const heavy = { revalidateOnFocus: false, dedupingInterval: 30_000, errorRetryCount: 2 };
const HEALTH: Record<Health, { label: string; cls: string }> = {
  good: { label: 'Good', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  watch: { label: 'Watch', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  risk: { label: 'At risk', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
};
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' });

/**
 * Opens the app as this person in a new tab, read-only for 30 minutes (src/app/view-as/page.tsx).
 * The tab is opened straight away (browsers block tabs opened after a wait) and pointed at the
 * view once the server has said yes.
 */
export function ViewAsButton({ id, name, small }: { id: string; name: string; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    const tab = window.open('', '_blank');
    setBusy(true);
    try {
      const { data } = await api.post<{ token: string }>(`/owner/view-as/${id}`);
      const url = `/view-as#${encodeURIComponent(data.token)}`;
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else toast.message(`Ready to view as ${name}`, { action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener') } });
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void open()} disabled={busy} aria-label={`View as ${name} (read-only)`}
      className={cn('btn-secondary inline-flex items-center gap-1.5', small ? 'min-h-11 px-3 text-xs' : 'min-h-11')}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} View as{small ? '' : ' (read-only)'}
    </button>
  );
}

export function SchoolsPanel({ onPerson }: { onPerson: (id: string) => void }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 300);
  const { data, error, mutate } = useSWR<{ schools: School[]; totals: { schools: number; members: number; risk: number; watch: number } }>(`/owner/schools${search ? `?q=${encodeURIComponent(search)}` : ''}`, fetcher, { ...heavy, keepPreviousData: true });
  const growth = useSWR<Growth>('/owner/growth', fetcher, heavy);
  const [openId, setOpenId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | 'all'>('all');
  if (error && !data) return <LoadError onRetry={() => void mutate()} />;
  if (!data) return <ConsoleSkeleton />;
  const list = data.schools.filter((s) => health === 'all' || s.health === health);
  return (
    <div className="space-y-6">
      <Tiles tiles={[
        ['Schools', data.totals.schools, `${data.totals.members.toLocaleString()} people`],
        ['At risk', data.totals.risk, 'payment failed or cancelling'],
        ['To watch', data.totals.watch, 'trial ending, quiet, over seats or reports'],
        ['Healthy', data.totals.schools - data.totals.risk - data.totals.watch],
      ]} />
      <GrowthCharts growth={growth.data} error={!!growth.error} retry={() => void growth.mutate()} />
      <section className={cn(card, 'p-4 sm:p-6')} aria-labelledby="schools-h">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 id="schools-h" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-zinc-400" aria-hidden /> Schools</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="school-health">Show</label>
            <select id="school-health" value={health} onChange={(e) => setHealth(e.target.value as Health | 'all')} className={cn(field, 'w-auto min-h-11')}>
              <option value="all">All schools</option>
              <option value="risk">At risk</option>
              <option value="watch">To watch</option>
              <option value="good">Good</option>
            </select>
            <SearchBox value={q} onChange={setQ} placeholder="Search schools" />
          </div>
        </div>
        {list.length === 0 ? <p className="text-sm text-zinc-500 py-6 text-center">No schools here.</p> : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {list.map((s) => (
              <li key={s.id} className="py-3">
                <button type="button" onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}
                  className="w-full text-start flex flex-wrap items-center gap-x-4 gap-y-1 min-h-11 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/[0.03] px-2 -mx-2">
                  <span className="font-semibold text-zinc-900 dark:text-white min-w-0 flex-1 truncate">{s.name}</span>
                  <span className={cn('text-xs font-semibold rounded-full px-2 py-0.5', HEALTH[s.health].cls)}>{HEALTH[s.health].label}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">{s.planName}{s.subscriptionStatus ? ` · ${s.subscriptionStatus.replace('_', ' ')}` : ''}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums">{s.members} of {s.seats} seats · {s.active} active this week</span>
                  {s.open > 0 && <span className="text-xs text-rose-700 dark:text-rose-300 tabular-nums">{s.open} open report{s.open === 1 ? '' : 's'}</span>}
                  <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', openId === s.id && 'rotate-180')} aria-hidden />
                </button>
                {(s.reasons.length > 0 || s.off.length > 0) && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                    {s.reasons.join(' · ')}{s.reasons.length && s.off.length ? ' · ' : ''}{s.off.length ? `Off here: ${s.off.join(', ')}` : ''}
                  </p>
                )}
                {openId === s.id && <SchoolPeople id={s.id} onPerson={onPerson} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SchoolPeople({ id, onPerson }: { id: string; onPerson: (id: string) => void }) {
  const { data, error, mutate } = useSWR<{ admins: Person[]; recent: Person[] }>(`/owner/schools/${id}`, fetcher, heavy);
  if (error && !data) return <LoadError onRetry={() => void mutate()} />;
  if (!data) return <div className="h-16 rounded-xl skeleton mt-3" />;
  const row = (p: Person) => (
    <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
      <button type="button" onClick={() => onPerson(p.id)} className="min-h-11 text-start text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline">{p.name}</button>
      <span className="text-xs text-zinc-500">{p.role.toLowerCase()}{p.lastSeenAt ? ` · seen ${formatDistanceToNow(new Date(p.lastSeenAt), { addSuffix: true })}` : ''}</span>
      <span className="ms-auto"><ViewAsButton id={p.id} name={p.name} small /></span>
    </li>
  );
  return (
    <div className="mt-3 grid sm:grid-cols-2 gap-4 rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3">
      <div>
        <h3 className="text-xs font-semibold uppercase text-zinc-600 dark:text-zinc-400 mb-1">Admins</h3>
        {data.admins.length ? <ul>{data.admins.map(row)}</ul> : <p className="text-sm text-zinc-500">No admin yet.</p>}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase text-zinc-600 dark:text-zinc-400 mb-1">Recently active</h3>
        {data.recent.length ? <ul>{data.recent.map(row)}</ul> : <p className="text-sm text-zinc-500">Nobody yet.</p>}
      </div>
    </div>
  );
}

function GrowthCharts({ growth, error, retry }: { growth?: Growth; error: boolean; retry: () => void }) {
  if (error && !growth) return <LoadError onRetry={retry} />;
  if (!growth) return <div className="h-48 rounded-2xl skeleton" />;
  const money = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: growth.currency, maximumFractionDigits: 0 }).format(n);
  const labels = growth.revenue.map((r) => monthName(r.month));
  const last = growth.churn[growth.churn.length - 1];
  const prev = growth.churn[growth.churn.length - 2];
  return (
    <div className="space-y-6">
      <Tiles tiles={[
        ['Subscriptions a month', money(growth.mrr), `from ${growth.paying} paying school${growth.paying === 1 ? '' : 's'} (estimate)`],
        ['Paid this month', money(growth.revenue[growth.revenue.length - 1]?.total ?? 0)],
        ['New this month', last?.started ?? 0, 'schools that started paying'],
        ['Cancelled last month', prev?.ended ?? 0, prev?.rate != null ? `${prev.rate} % of paying schools` : 'no paying schools then'],
      ]} />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className={cn(card, 'p-4 sm:p-6')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Money received per month · 12 months</h2>
          <Bars values={growth.revenue.map((r) => r.total)} labels={labels} title={(i) => `${labels[i]}: ${money(growth.revenue[i].total)}`} />
        </section>
        <section className={cn(card, 'p-4 sm:p-6')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Schools cancelling per month (churn)</h2>
          <Bars values={growth.churn.map((c) => c.ended)} labels={labels}
            title={(i) => `${labels[i]}: ${growth.churn[i].ended} cancelled, ${growth.churn[i].started} new${growth.churn[i].rate != null ? ` (${growth.churn[i].rate} %)` : ''}`} />
          <p className="text-xs text-zinc-500 mt-2">Counted from Stripe’s subscription changes since this chart was added.</p>
        </section>
      </div>
      <section className={cn(card, 'p-4 sm:p-6')} aria-labelledby="cohorts-h">
        <h2 id="cohorts-h" className="font-semibold text-zinc-900 dark:text-white mb-1">Who keeps coming back</h2>
        <p className="text-xs text-zinc-500 mb-3">People who joined each month, and the share who opened UniVerse again 1, 2, 3… months later.</p>
        {/* Scrolls sideways on a phone; focusable so it can be scrolled with the keyboard. */}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby="cohorts-h">
          <table className="text-xs tabular-nums w-full min-w-[420px]">
            <thead><tr className="text-start text-zinc-600 dark:text-zinc-400"><th scope="col" className="py-1 pe-3 font-semibold">Joined</th><th scope="col" className="py-1 pe-3 font-semibold">People</th>{growth.cohorts.map((_, k) => <th key={k} scope="col" className="py-1 px-1 font-semibold text-center">{k === 0 ? 'Same month' : `+${k}`}</th>)}</tr></thead>
            <tbody>
              {growth.cohorts.map((c) => (
                <tr key={c.month}>
                  <th scope="row" className="py-1 pe-3 text-start font-medium text-zinc-800 dark:text-zinc-200">{monthName(c.month)}</th>
                  <td className="py-1 pe-3 text-zinc-700 dark:text-zinc-300">{c.size}</td>
                  {growth.cohorts.map((_, k) => (
                    <td key={k} className="p-0.5">
                      {k < c.kept.length && c.size > 0 ? (
                        <span className="block rounded px-1 py-1 text-center text-zinc-900 dark:text-white" style={{ background: `rgba(43,53,104,${0.08 + (c.kept[k] / 100) * 0.6})` }}>{c.kept[k]} %</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const KIND: Record<Item['kind'], { label: string; icon: typeof Flag; actions: { id: string; label: string }[] }> = {
  flag: { label: 'Chat safety flag', icon: ShieldAlert, actions: [{ id: 'reviewed', label: 'Reviewed' }, { id: 'dismiss', label: 'Dismiss' }] },
  report: { label: 'Community report', icon: Flag, actions: [{ id: 'dismiss', label: 'Dismiss' }] },
  listing: { label: 'Reported campus post', icon: Store, actions: [{ id: 'hide', label: 'Hide' }, { id: 'restore', label: 'Restore' }] },
};

export function ModerationPanel({ onPerson }: { onPerson: (id: string) => void }) {
  const { data, error, mutate } = useSWR<{ bySchool: { id: string | null; name: string; open: number }[]; items: Item[] }>('/owner/moderation', fetcher, heavy);
  const [busy, setBusy] = useState<string | null>(null);
  const [school, setSchool] = useState('all');
  if (error && !data) return <LoadError onRetry={() => void mutate()} />;
  if (!data) return <ConsoleSkeleton />;
  const act = async (item: Item, action: string) => {
    setBusy(`${item.id}:${action}`);
    try {
      await api.post(`/owner/moderation/${item.kind}/${item.id}`, { action });
      toast.success('Done');
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const items = data.items.filter((i) => school === 'all' || (i.person.school ?? 'No school') === school);
  const total = data.bySchool.reduce((s, x) => s + x.open, 0);
  return (
    <div className="space-y-6">
      <section className={cn(card, 'p-4 sm:p-6')} aria-labelledby="mod-h">
        <h2 id="mod-h" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-zinc-400" aria-hidden /> Open safety reports · every school</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Chat safety flags, community reports and reported campus posts that nobody has handled yet. Each school’s admins see their own; this is all of them.</p>
        {total === 0 ? <p className="text-sm text-zinc-500 mt-4">Nothing open. All clear.</p> : (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by school">
            {[{ id: 'all', name: 'All schools', open: total }, ...data.bySchool].map((s) => (
              <button key={s.id ?? s.name} type="button" onClick={() => setSchool(s.id === 'all' ? 'all' : s.name)} aria-pressed={school === (s.id === 'all' ? 'all' : s.name)}
                className={cn('min-h-11 rounded-full px-3 text-sm border', school === (s.id === 'all' ? 'all' : s.name) ? 'border-indigo-500 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300')}>
                {s.name} <span className="tabular-nums font-semibold">{s.open}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item) => {
            const k = KIND[item.kind];
            const Icon = k.icon;
            return (
              <li key={`${item.kind}-${item.id}`} className={cn(card, 'p-4', item.hidden && 'opacity-80')}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200"><Icon className="w-3.5 h-3.5" aria-hidden /> {k.label}</span>
                  <span>{item.title.replace('_', ' ')}{item.severity ? ` · ${item.severity}` : ''}{item.repeats ? ` · ${item.repeats + 1} times` : ''}</span>
                  <span>{item.person.school ?? 'No school'}</span>
                  <span>{formatDistanceToNow(new Date(item.at), { addSuffix: true })}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-900 dark:text-white break-words">{item.text}</p>
                {item.reason && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Reason: {item.reason}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.person.id && (
                    <button type="button" onClick={() => onPerson(item.person.id!)} className="min-h-11 inline-flex items-center gap-1.5 text-sm text-indigo-700 dark:text-indigo-300 hover:underline">
                      <Users className="w-4 h-4" aria-hidden /> {item.person.name}
                    </button>
                  )}
                  <span className="ms-auto flex flex-wrap gap-2">
                    {k.actions.filter((a) => !(item.kind === 'listing' && a.id === 'hide' && item.hidden)).map((a) => (
                      <button key={a.id} type="button" onClick={() => void act(item, a.id)} disabled={busy !== null} className="btn-secondary min-h-11 inline-flex items-center gap-1.5">
                        {busy === `${item.id}:${a.id}` && <Loader2 className="w-4 h-4 animate-spin" />} {a.label}
                      </button>
                    ))}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
