'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, Ban, Bug, Eye, Loader2, Megaphone, MessageSquare, Power, Sparkles, ToggleRight, Trash2, Users, Wrench } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FEATURE_SWITCHES, parseSwitches } from '@/lib/feature-switches';
import { card, errorMessage, fetcher, field, refreshConsole, toastWithUndo } from './shared';

// The owner console's Server tab: switch UniVerse between live, read-only and maintenance, show a
// notice on every page, and see the Cloudflare plan usage and the app's health at a glance. The
// Worker applies the switch (cloudflare/usage-guard.ts) within a minute; the owner always gets in.

export interface PlanUsage {
  paused: boolean; reason: string | null; resumeAt: string | null; checkedAt: string | null; error: string | null;
  meters: { key: string; label: string; used: number | null; limit: number; bytes?: boolean }[];
}
type Mode = 'LIVE' | 'READ_ONLY' | 'MAINTENANCE';
interface AiLimits { student: number; staff: number; site: number }
interface AiToday { limits: AiLimits; used: number; top: { id: string; name: string; role: string | null; calls: number }[] }
interface Control { mode: Mode; message: string | null; until: string | null; banner: string | null; switches: string | null; updatedAt: string }
interface ServerData {
  control: Control;
  usage: PlanUsage | null;
  health: { people: number; activeToday: number; signInsToday: number; messagesToday: number; openErrors: number; newErrors: number; pendingDeletions: number; suspended: number };
  settings?: { name: string; what: string; needed: boolean; set: boolean; problem: string | null }[];
  ai?: AiToday | null;
  history: { id: string; summary: string; createdAt: string; undoneAt: string | null }[];
}

const MODES: { id: Mode; label: string; icon: typeof Power; text: string; tone: string }[] = [
  { id: 'LIVE', label: 'Live', icon: Power, text: 'Everyone can use UniVerse normally.', tone: 'emerald' },
  { id: 'READ_ONLY', label: 'Read-only', icon: Eye, text: 'People can sign in and look around, but nothing can be changed or sent. Good for backups and data fixes.', tone: 'amber' },
  { id: 'MAINTENANCE', label: 'Maintenance', icon: Wrench, text: 'Everyone except you sees a "down for maintenance" page and nobody else can sign in, so almost nothing counts toward your Cloudflare limits. Payments still go through.', tone: 'rose' },
];
const TONES: Record<string, string> = {
  emerald: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

// datetime-local wants "yyyy-MM-ddTHH:mm" in the viewer's time.
const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '');

export function ServerPanel({ onTab }: { onTab: (t: 'people' | 'errors' | 'deletions' | 'activity') => void }) {
  const { data, mutate } = useSWR<ServerData>('/owner/server', fetcher, { refreshInterval: 60_000 });
  if (!data) return <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />;
  const h = data.health;
  const tiles: [string, number, typeof Users, 'people' | 'errors' | 'deletions' | 'activity'][] = [
    ['People', h.people, Users, 'people'], ['Active today', h.activeToday, Activity, 'activity'], ['Sign-ins today', h.signInsToday, Activity, 'activity'], ['Messages today', h.messagesToday, MessageSquare, 'activity'],
    ['Open errors', h.openErrors, Bug, 'errors'], ['Errors seen today', h.newErrors, Bug, 'errors'], ['Deletion requests', h.pendingDeletions, Trash2, 'deletions'], ['Banned', h.suspended, Ban, 'people'],
  ];
  return (
    <div className="space-y-6">
      <SwitchCard key={data.control.updatedAt} control={data.control} onSaved={() => void mutate()} />
      <NoticeCard key={`n-${data.control.updatedAt}`} banner={data.control.banner} onSaved={() => void mutate()} />
      <FeatureCard key={`f-${data.control.updatedAt}`} switches={data.control.switches} onSaved={() => void mutate()} />
      <PlanUsageCard usage={data.usage} />
      {data.ai && <AiCard key={`a-${data.control.updatedAt}`} ai={data.ai} onSaved={() => void mutate()} />}
      <CloudflareCard />
      {data.settings && <SettingsCard settings={data.settings} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(([label, n, Icon, to]) => (
          <button key={label} onClick={() => onTab(to)} className={cn(card, 'p-4 text-left hover:border-indigo-500/40')}>
            <Icon className="w-4 h-4 text-zinc-400 mb-2" />
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{n}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </button>
        ))}
      </div>
      <div className={cn(card, 'p-5')}>
        <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Server changes</h2>
        {data.history.length === 0 ? <p className="text-sm text-zinc-500">No changes yet.</p> : (
          <ul className="space-y-2">{data.history.map((c) => (
            <li key={c.id} className="text-sm">
              <span className={cn('text-zinc-800 dark:text-zinc-200', c.undoneAt && 'line-through opacity-60')}>{c.summary}</span>
              <span className="text-xs text-zinc-400"> · {format(new Date(c.createdAt), 'd MMM, HH:mm')}</span>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

/** Today's AI use and the daily limits that keep it inside Gemini's free allowance (src/server/ai-budget.ts). */
function AiCard({ ai, onSaved }: { ai: AiToday; onSaved: () => void }) {
  const [limits, setLimits] = useState<AiLimits>(ai.limits);
  const [busy, setBusy] = useState(false);
  const changed = (['student', 'staff', 'site'] as const).some((k) => limits[k] !== ai.limits[k]);
  const pct = ai.limits.site ? Math.min(100, Math.round((ai.used / ai.limits.site) * 100)) : 100;
  const save = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server', { aiLimits: limits });
      toastWithUndo('AI limits saved', res.changeId);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const input = (k: keyof AiLimits, label: string) => (
    <label className="text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <input type="number" min={0} max={100000} step={1} className={cn(field, 'mt-1')} value={limits[k]}
        onChange={(e) => setLimits({ ...limits, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /> AI use today</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-3">
        Every AI tutor answer, summary, translation and report counts as one request. Answers many people ask for again (the same tutor question, a summary of the same file) are saved and don’t count. Limits reset at midnight UTC. You’re never limited.
      </p>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{ai.used.toLocaleString()} of {ai.limits.site.toLocaleString()} requests</span>
        <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI requests used today">
        <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
      </div>
      {ai.top.length > 0 && (
        <ul className="mt-3 text-sm divide-y divide-zinc-200 dark:divide-white/10">
          {ai.top.map((p) => (
            <li key={p.id} className="py-1.5 flex justify-between gap-3">
              <span className="truncate text-zinc-800 dark:text-zinc-200">{p.name}{p.role ? <span className="text-xs text-zinc-400"> · {p.role.toLowerCase()}</span> : null}</span>
              <span className="tabular-nums text-zinc-500 shrink-0">{p.calls}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        {input('student', 'Per student, each day')}
        {input('staff', 'Per teacher or admin, each day')}
        {input('site', 'Whole site, each day')}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={() => void save()} disabled={busy || !changed} className="btn-primary">Save limits</button>
      </div>
    </div>
  );
}

/** Which Cloudflare settings the live site can see: names and yes/no only, never the values. */
type CfPart<T> = { ok: true; data: T } | { ok: false; error: string };
type CfAccount = {
  setup: boolean; checkedAt?: string; canEdit?: boolean;
  versions?: CfPart<{ at: string; versionId: string | null; by: string; note: string }[]>;
  builds?: CfPart<{ minutesUsed: number; minutesLimit: number; count: number; partial: boolean; recent: { at: string; outcome: string; minutes: number; branch: string; message: string }[] }>;
  database?: CfPart<{ name: string; bytes: number | null; tables: number | null }>;
  storage?: CfPart<{ buckets: string[] }>;
  traffic?: CfPart<{ days: { day: string; visitors: number; pageViews: number; requests: number }[]; visitors: number; pageViews: number; threats: number; bytes: number; countries: { code: string; requests: number }[] }>;
  attacks?: CfPart<{ total: number; top: { count: number; action: string; source: string; clientCountryName: string }[] }>;
  domain?: CfPart<{ checks: { name: string; ok: boolean | null; note: string }[] }>;
  plan?: CfPart<{ name: string; price: number; currency: string; frequency: string; renews: string | null; state: string }[]>;
};

const size = (b: number | null) => (b == null ? '?' : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

/** Live version, build minutes, database and file storage, read from Cloudflare with the read-only token. */
function CloudflareCard() {
  const [fresh, setFresh] = useState(0);
  const { data, isValidating } = useSWR<CfAccount>(`/owner/cloudflare${fresh ? `?fresh=1&n=${fresh}` : ''}`, fetcher, { refreshInterval: 300_000 });
  const missing = (p?: CfPart<unknown>) => (p && !p.ok ? <p className="text-xs text-amber-600 dark:text-amber-400">{(p as { error: string }).error}</p> : null);
  const b = data?.builds?.ok ? data.builds.data : null;
  // Every change to Cloudflare needs a code sent to the owner's email.
  const putBack = async (versionId: string, when: string) => {
    if (!(await confirmDialog({ title: `Put the version from ${when} back live?`, message: 'Use this when a new update broke something. We will email you a code to confirm.', confirmLabel: 'Email me a code' }))) return;
    try {
      await api.post('/owner/cloudflare/code');
      const code = window.prompt('Enter the 6-digit code we just emailed you:');
      if (!code) return;
      const res = (await api.post('/owner/cloudflare/rollback', { versionId, code })).data;
      toast.success(res.done);
      setFresh((n) => n + 1);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <div className={cn(card, 'p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold text-zinc-900 dark:text-white">Cloudflare account</h2>
        <button onClick={() => setFresh((n) => n + 1)} disabled={isValidating} className="btn-secondary !py-1 !px-2.5 text-xs">{isValidating ? 'Checking…' : 'Check now'}</button>
      </div>
      {!data ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400" /> : !data.setup ? (
        <p className="text-sm text-zinc-500">Add the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets to see this.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Build minutes this month</h3>
            {b ? (
              <>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden"><div className={cn('h-full', b.minutesUsed / b.minutesLimit > 0.8 ? 'bg-rose-500' : 'bg-indigo-500')} style={{ width: `${Math.min(100, (b.minutesUsed / b.minutesLimit) * 100)}%` }} /></div>
                <p className="mt-1 text-zinc-700 dark:text-zinc-200">{b.minutesUsed}{b.partial ? '+' : ''} of {b.minutesLimit} minutes · {b.count} builds</p>
                <ul className="mt-2 space-y-1">{b.recent.map((x) => (
                  <li key={x.at} className="text-xs text-zinc-500 truncate">
                    <span className={cn('font-semibold', x.outcome === 'success' ? 'text-emerald-600 dark:text-emerald-400' : x.outcome === 'fail' || x.outcome === 'failure' ? 'text-rose-500' : 'text-amber-500')}>{x.outcome}</span> · {formatDistanceToNow(new Date(x.at), { addSuffix: true })} · {x.minutes} min{x.branch ? ` · ${x.branch}` : ''}{x.message ? ` · ${x.message}` : ''}
                  </li>
                ))}</ul>
              </>
            ) : missing(data.builds)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Live site versions</h3>
            {data.versions?.ok ? (
              <ul className="space-y-1">{data.versions.data.map((v, i) => (
                <li key={v.at} className="text-xs text-zinc-500 truncate">
                  {i === 0 && <span className="font-semibold text-emerald-600 dark:text-emerald-400">Live · </span>}{format(new Date(v.at), 'd MMM, HH:mm')}{v.by ? ` · ${v.by}` : ''}{v.note ? ` · ${v.note}` : ''}
                  {i > 0 && data.canEdit && v.versionId && <button onClick={() => void putBack(v.versionId!, format(new Date(v.at), 'd MMM, HH:mm'))} className="ml-2 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Put back live</button>}
                </li>
              ))}</ul>
            ) : missing(data.versions)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Database</h3>
            {data.database?.ok ? <p className="text-zinc-700 dark:text-zinc-200">{data.database.data.name}: {size(data.database.data.bytes)} of 5 GB · {data.database.data.tables ?? '?'} tables</p> : missing(data.database)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Visitors · last 7 days</h3>
            {data.traffic?.ok ? (() => {
              const t = data.traffic.data;
              const max = Math.max(1, ...t.days.map((d) => d.visitors));
              return (
                <>
                  <p className="text-zinc-700 dark:text-zinc-200">{t.visitors.toLocaleString()} visitors · {t.pageViews.toLocaleString()} page views · {size(t.bytes)} sent{t.threats ? ` · ${t.threats} threats stopped` : ''}</p>
                  <div className="mt-2 flex items-end gap-1 h-12">{t.days.map((d) => <div key={d.day} title={`${d.day}: ${d.visitors} visitors`} className="flex-1 rounded-t bg-indigo-500/70" style={{ height: `${Math.max(4, (d.visitors / max) * 100)}%` }} />)}</div>
                  {t.countries.length > 0 && <p className="mt-1 text-xs text-zinc-500">Top countries: {t.countries.map((c) => `${c.code} (${c.requests.toLocaleString()})`).join(', ')}</p>}
                </>
              );
            })() : missing(data.traffic)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Blocked by Cloudflare · last 24 hours</h3>
            {data.attacks?.ok ? (data.attacks.data.total === 0 ? <p className="text-emerald-600 dark:text-emerald-400">Nothing needed blocking.</p> : (
              <>
                <p className="text-zinc-700 dark:text-zinc-200">{data.attacks.data.total.toLocaleString()} requests stopped</p>
                <ul className="mt-1 space-y-0.5">{data.attacks.data.top.map((x, i) => <li key={i} className="text-xs text-zinc-500">{x.count} · {x.action} by {x.source}{x.clientCountryName ? ` · from ${x.clientCountryName}` : ''}</li>)}</ul>
              </>
            )) : missing(data.attacks)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Domain health</h3>
            {data.domain?.ok ? (
              <ul className="space-y-1">{data.domain.data.checks.map((c) => (
                <li key={c.name} className="text-xs">
                  <span className={cn('font-semibold', c.ok === true ? 'text-emerald-600 dark:text-emerald-400' : c.ok === false ? 'text-rose-500' : 'text-amber-500')}>{c.ok === true ? 'OK' : c.ok === false ? 'Fix' : 'Can’t check'}</span>
                  <span className="text-zinc-700 dark:text-zinc-200"> · {c.name}</span> <span className="text-zinc-500">· {c.note}</span>
                </li>
              ))}</ul>
            ) : missing(data.domain)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Cloudflare plan</h3>
            {data.plan?.ok ? (data.plan.data.length === 0 ? <p className="text-zinc-500">Free plan, nothing billed.</p> : (
              <ul className="space-y-0.5">{data.plan.data.map((x, i) => (
                <li key={i} className="text-zinc-700 dark:text-zinc-200">{x.name}{x.price ? ` · ${new Intl.NumberFormat('en', { style: 'currency', currency: x.currency }).format(x.price)}${x.frequency ? ` ${x.frequency}` : ''}` : ' · free'}{x.renews ? <span className="text-xs text-zinc-500"> · renews {format(new Date(x.renews), 'd MMM yyyy')}</span> : null}</li>
              ))}</ul>
            )) : missing(data.plan)}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">File storage</h3>
            {data.storage?.ok ? <p className="text-zinc-700 dark:text-zinc-200">{data.storage.data.buckets.length ? data.storage.data.buckets.join(', ') : 'No storage bucket yet (large chat files need one).'}</p> : missing(data.storage)}
          </section>
        </div>
      )}
    </div>
  );
}

function SettingsCard({ settings }: { settings: NonNullable<ServerData['settings']> }) {
  const bad = settings.filter((s) => s.problem || (s.needed && !s.set)).length;
  return (
    <div className={cn(card, 'p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-semibold text-zinc-900 dark:text-white">Server settings</h2>
        <span className={cn('text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', bad ? TONES.rose : TONES.emerald)}>{bad ? `${bad} to fix` : 'All good'}</span>
      </div>
      <p className="text-sm text-zinc-500 mb-4">What the live site can see in Cloudflare → universe-web → Settings → Variables and Secrets. Add each one there as type Secret, then Deploy. Values are never shown.</p>
      <ul className="divide-y divide-zinc-200 dark:divide-white/10">
        {settings.map((s) => (
          <li key={s.name} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
            <span><code className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{s.name}</code> <span className="text-xs text-zinc-500">· {s.what}</span></span>
            <span className={cn('text-xs font-semibold', s.problem ? 'text-rose-600 dark:text-rose-400' : s.set ? 'text-emerald-600 dark:text-emerald-400' : s.needed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400')}>
              {s.problem ? 'Needs fixing' : s.set ? 'Set' : s.needed ? 'Missing' : 'Not set (optional)'}
            </span>
            {s.problem && <p className="basis-full text-xs text-rose-600 dark:text-rose-400">{s.problem}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwitchCard({ control, onSaved }: { control: Control; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>(control.mode);
  const [message, setMessage] = useState(control.message ?? '');
  const [until, setUntil] = useState(toLocalInput(control.until));
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now()); // when this card was shown (it's re-created on every save)
  const ended = control.until && new Date(control.until).getTime() <= now;
  const current = ended ? 'LIVE' : control.mode;
  const changed = mode !== control.mode || message !== (control.message ?? '') || until !== toLocalInput(control.until);

  const save = async () => {
    if (mode === 'MAINTENANCE' && current !== 'MAINTENANCE' && !(await confirmDialog({ title: 'Pause UniVerse for maintenance?', message: 'Within a minute, everyone except you sees the maintenance page until you switch back to Live.', confirmLabel: 'Pause it', destructive: true }))) return;
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server', { mode, message, until: mode === 'LIVE' || !until ? null : new Date(until).toISOString() });
      toastWithUndo(mode === 'LIVE' ? 'UniVerse is live' : mode === 'READ_ONLY' ? 'UniVerse is read-only' : 'UniVerse is paused for maintenance', res.changeId);
      onSaved();
      await refreshConsole();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = MODES.find((m) => m.id === current)!;
  return (
    <div className={cn(card, 'p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-semibold text-zinc-900 dark:text-white">Server</h2>
        <span className={cn('text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', TONES[shown.tone])}>Now: {shown.label}</span>
      </div>
      <p className="text-sm text-zinc-500 mb-4">
        {control.mode !== 'LIVE' && control.until && !ended ? `Back to Live by itself on ${format(new Date(control.until), 'd MMM, HH:mm')}. ` : ''}
        Changes reach everyone within a minute. You can always get in.
      </p>
      <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Server mode">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}
            className={cn('text-left rounded-2xl border p-4 transition-colors', mode === m.id ? TONES[m.tone] : 'border-zinc-200 dark:border-white/10 hover:border-indigo-500/40')}>
            <m.icon className="w-5 h-5 mb-2" />
            <p className="font-semibold text-zinc-900 dark:text-white">{m.label}</p>
            <p className="text-xs text-zinc-500 mt-1">{m.text}</p>
          </button>
        ))}
      </div>
      {mode !== 'LIVE' && (
        <div className="mt-4 grid sm:grid-cols-[1fr_16rem] gap-3">
          <label className="text-sm">
            <span className="text-xs text-zinc-500">Message for everyone (optional)</span>
            <input className={cn(field, 'mt-1')} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={mode === 'MAINTENANCE' ? 'UniVerse is being updated. Your work is saved.' : 'UniVerse is in read-only mode for maintenance'} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-zinc-500">Back to Live by itself at (optional)</span>
            <input type="datetime-local" className={cn(field, 'mt-1')} value={until} min={toLocalInput(new Date(now).toISOString())} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={() => void save()} disabled={busy || !changed} aria-busy={busy} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
      </div>
    </div>
  );
}

function NoticeCard({ banner, onSaved }: { banner: string | null; onSaved: () => void }) {
  const [text, setText] = useState(banner ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (value: string) => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/server', { banner: value });
      toastWithUndo(value ? 'Notice is showing' : 'Notice removed', res.changeId);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-indigo-500" /> Notice for everyone</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-3">Shown at the top of every page when it opens, for example “Maintenance tonight 22:00 to 23:00”. People can close it.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={field} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a short notice" />
        <div className="flex gap-2 shrink-0">
          <button onClick={() => void save(text.trim())} disabled={busy || !text.trim() || text.trim() === (banner ?? '')} className="btn-primary">Show</button>
          {banner && <button onClick={() => void save('')} disabled={busy} className="btn-secondary">Remove</button>}
        </div>
      </div>
    </div>
  );
}

/** Turn single features off for everyone (the Worker refuses them; you still get through). */
function FeatureCard({ switches, onSaved }: { switches: string | null; onSaved: () => void }) {
  const [off, setOff] = useState(() => parseSwitches(switches));
  const [busy, setBusy] = useState<string | null>(null);
  const flip = async (id: string, label: string) => {
    const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
    setBusy(id);
    try {
      const { data: res } = await api.post('/owner/server', { switches: next });
      setOff(next);
      toastWithUndo(`${label}: ${next.includes(id) ? 'off' : 'on'}`, res.changeId);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={cn(card, 'p-5')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><ToggleRight className="w-4 h-4 text-indigo-500" /> Feature switches</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-3">Turn one part of UniVerse off for everyone while the rest keeps working. People see a short “turned off for now” message. Changes reach everyone within a minute, and you can still use everything.</p>
      <ul className="grid sm:grid-cols-2 gap-2">
        {FEATURE_SWITCHES.map((f) => {
          const on = !off.includes(f.id);
          return (
            <li key={f.id}>
              <button role="switch" aria-checked={on} onClick={() => void flip(f.id, f.label)} disabled={busy !== null}
                className={cn('w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors', on ? 'border-zinc-200 dark:border-white/10 hover:border-indigo-500/40' : 'border-rose-500/40 bg-rose-500/[0.06]')}>
                <span className={cn('mt-0.5 w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors', on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600')}>
                  <span className={cn('block w-4 h-4 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold text-sm text-zinc-900 dark:text-white">{f.label} {busy === f.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{!on && <span className="text-[10px] font-bold uppercase text-rose-500">off</span>}</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">{f.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const amount = (n: number, bytes?: boolean) =>
  bytes ? `${(n / 1024 ** 3).toFixed(n < 1024 ** 3 ? 2 : 1)} GB` : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** The spending guard: how much of what the $5 Cloudflare plan includes has been used this month. */
export function PlanUsageCard({ usage }: { usage: PlanUsage | null }) {
  const meters = usage?.meters ?? [];
  const read = meters.filter((m) => m.used !== null).sort((a, b) => b.used! / b.limit - a.used! / a.limit);
  return (
    <div className={cn(card, 'p-5', usage?.paused && 'border-rose-500/50')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold text-zinc-900 dark:text-white">Cloudflare plan · this billing month</h2>
        {usage?.checkedAt && <span className="text-xs text-zinc-400">checked {formatDistanceToNow(new Date(usage.checkedAt), { addSuffix: true })}</span>}
      </div>
      {!usage ? (
        <p className="text-sm text-zinc-500">The spending guard hasn&apos;t run yet. It checks every 15 minutes once the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets are set.</p>
      ) : (
        <>
          <p className={cn('text-sm mb-3', usage.paused ? 'text-rose-500 font-semibold' : 'text-zinc-500')}>
            {usage.paused
              ? `Paused: ${usage.reason ?? 'an allowance ran low.'}${usage.resumeAt ? ` Opens again on ${format(new Date(usage.resumeAt), 'd MMM')}.` : ''}`
              : 'Running. The app pauses itself at 90% of any allowance, so the plan stays at $5. You get an email at 70%.'}
          </p>
          {read.length > 0 && (
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">{read.map((m) => {
              const pct = Math.min(100, (m.used! / m.limit) * 100);
              return (
                <li key={m.key}>
                  <div className="flex justify-between gap-2 text-xs"><span className="text-zinc-600 dark:text-zinc-300 truncate">{m.label}</span><span className="text-zinc-400 shrink-0">{amount(m.used!, m.bytes)} of {amount(m.limit, m.bytes)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                    <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                </li>
              );
            })}</ul>
          )}
          {usage.error && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 whitespace-pre-wrap">Couldn&apos;t read some of it: {usage.error}</p>}
        </>
      )}
    </div>
  );
}
