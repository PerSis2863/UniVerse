'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Activity, Ban, Bug, Eye, Loader2, Megaphone, MessageSquare, Power, ToggleRight, Trash2, Users, Wrench } from 'lucide-react';
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
interface Control { mode: Mode; message: string | null; until: string | null; banner: string | null; switches: string | null; updatedAt: string }
interface ServerData {
  control: Control;
  usage: PlanUsage | null;
  health: { people: number; activeToday: number; signInsToday: number; messagesToday: number; openErrors: number; newErrors: number; pendingDeletions: number; suspended: number };
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
