'use client';

import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Monitor, PhoneCall, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { card, fetcher } from './shared';

// Calls tab: how calls went in the last 14 days. Every person reports their call when it ends
// (src/components/call/CallView.tsx → src/server/calls.ts recordCallStat): connection numbers only,
// never what was said or shown.

interface Problem {
  id: string; callId: string; type: string; mode: string; peers: number; seconds: number; setupMs: number | null;
  worstRttMs: number | null; worstLoss: number | null; relay: boolean; audioOnly: boolean; failure: string | null; device: string | null;
  createdAt: string; user: { id: string; name: string; role: string } | null;
}
interface Count { key: string; n: number; failed: number }
interface Health {
  turn: boolean; joins: number; failed: number; successRate: number | null; setupMedianMs: number | null; setupP90Ms: number | null;
  poorShare: number; relayShare: number; sfuShare: number; audioOnly: number; avgMinutes: number | null;
  perDay: { day: string; ok: number; failed: number }[];
  failures: Count[]; devices: Count[]; types: Count[]; problems: Problem[];
}

/** What each failure means, and what usually fixes it. */
const FAILURE: Record<string, { label: string; why: string }> = {
  connect: { label: 'Couldn’t connect', why: 'Others were in the call but no connection formed. Usually a strict school, office or mobile network; the TURN relay fixes most of these.' },
  media: { label: 'No microphone or camera', why: 'Permission was refused, or the device has none (or another app is using it).' },
  ticket: { label: 'Couldn’t get in', why: 'Not allowed into that call, the call had ended, or the server couldn’t be reached.' },
  dropped: { label: 'Kept dropping', why: 'The connection to the call server dropped and gave up after 6 tries to come back.' },
};
const TYPE: Record<string, string> = { chat: 'Chat call', group: 'Group room', class: 'Class', room: 'Voice room' };

const secs = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function CallsPanel({ onPerson }: { onPerson: (id: string) => void }) {
  const { data, isLoading } = useSWR<Health>('/owner/calls', fetcher, { revalidateOnFocus: false });
  if (isLoading || !data) return <ContentSkeleton />;
  const peak = Math.max(1, ...data.perDay.map((d) => d.ok + d.failed));

  return (
    <div className="space-y-4">
      {!data.turn && (
        <div className={cn(card, 'p-4 flex gap-3 border-amber-300/60 dark:border-amber-400/20 bg-amber-50/60 dark:bg-amber-400/[0.06]')}>
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-zinc-900 dark:text-white">The TURN relay is off</p>
            <p className="text-zinc-600 dark:text-zinc-400">Calls on strict school, office and mobile networks often can’t connect without it. Create a TURN key in Cloudflare → Realtime → TURN (free up to 1,000 GB a month), then add <code className="text-xs">TURN_KEY_ID</code> and <code className="text-xs">TURN_KEY_API_TOKEN</code> as secrets in Cloudflare → Workers &amp; Pages → universe-web → Settings → Variables and Secrets. The Server tab shows when the site sees them.</p>
          </div>
        </div>
      )}

      {data.joins === 0 ? (
        <div className={cn(card, 'p-8 text-center')}>
          <PhoneCall className="w-8 h-8 mx-auto text-zinc-400" />
          <p className="mt-2 font-semibold text-zinc-900 dark:text-white">No calls in the last 14 days</p>
          <p className="text-sm text-zinc-500">Each person’s call reports here when it ends.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              ['Connected', data.successRate === null ? '—' : `${data.successRate}%`, `${data.joins} joins · ${data.failed} failed`, data.successRate !== null && data.successRate < 90],
              ['Time to connect', secs(data.setupMedianMs), `typical · 1 in 10 over ${secs(data.setupP90Ms)}`, (data.setupMedianMs ?? 0) > 3000],
              ['Poor quality', `${data.poorShare}%`, `${data.audioOnly} switched to audio only`, data.poorShare > 15],
              ['Average call', data.avgMinutes === null ? '—' : `${data.avgMinutes} min`, `${data.relayShare}% via TURN · ${data.sfuShare}% bigger calls`, false],
            ] as const).map(([label, value, hint, bad]) => (
              <div key={label} className={cn(card, 'p-4')}>
                <p className={cn('text-2xl font-bold', bad ? 'text-rose-500' : 'text-zinc-900 dark:text-white')}>{value}</p>
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{label}</p>
                <p className="text-[11px] text-zinc-400">{hint}</p>
              </div>
            ))}
          </div>

          <div className={cn(card, 'p-4')}>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Joins per day · 14 days</p>
            <div className="mt-3 flex items-end gap-1 h-28" role="img" aria-label="Joins per day, connected and failed">
              {data.perDay.map((d) => {
                const total = d.ok + d.failed;
                return (
                  <div key={d.day} className="flex-1 h-full flex flex-col justify-end" title={`${format(new Date(d.day), 'd MMM')}: ${d.ok} connected, ${d.failed} failed`}>
                    {d.failed > 0 && <div className="rounded-t bg-rose-500/85" style={{ height: `${(d.failed / peak) * 100}%` }} />}
                    <div className={cn('bg-gradient-to-t from-indigo-500 to-fuchsia-500', d.failed ? '' : 'rounded-t')} style={{ height: `${total ? (d.ok / peak) * 100 : 2}%`, opacity: total ? 1 : 0.2 }} />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 flex gap-3"><span><span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 mr-1" />connected</span><span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500 mr-1" />failed</span></p>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className={cn(card, 'p-4 space-y-3')}>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Why calls failed</p>
              {data.failures.length === 0 ? <p className="text-sm text-zinc-500">No failures. 🎉</p> : data.failures.map((f) => (
                <div key={f.key} className="flex gap-3">
                  <span className="text-lg font-bold text-rose-500 w-10 shrink-0 text-right">{f.n}</span>
                  <div className="text-sm">
                    <p className="font-semibold text-zinc-900 dark:text-white">{FAILURE[f.key]?.label ?? f.key}</p>
                    <p className="text-zinc-500 text-xs">{FAILURE[f.key]?.why}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className={cn(card, 'p-4')}>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Devices</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400"><th className="font-semibold py-1">Device</th><th className="font-semibold py-1 text-right">Joins</th><th className="font-semibold py-1 text-right">Failed</th></tr></thead>
                <tbody>
                  {data.devices.map((d) => (
                    <tr key={d.key} className="border-t border-zinc-100 dark:border-white/[0.05]">
                      <td className="py-1.5 text-zinc-700 dark:text-zinc-300">{d.key}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.n}</td>
                      <td className={cn('py-1.5 text-right tabular-nums', d.failed / d.n > 0.1 ? 'text-rose-500 font-semibold' : 'text-zinc-500')}>{Math.round((d.failed / d.n) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-zinc-400">{data.types.map((t) => `${TYPE[t.key] ?? t.key}: ${t.n}`).join(' · ')}</p>
            </div>
          </div>

          <div className={cn(card, 'divide-y divide-zinc-100 dark:divide-white/[0.05]')}>
            <p className="p-4 text-sm font-semibold text-zinc-900 dark:text-white">Calls with problems</p>
            {data.problems.length === 0 && <p className="p-4 pt-0 text-sm text-zinc-500">None in the last 14 days.</p>}
            {data.problems.map((p) => (
              <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', p.failure ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                  {p.failure ? FAILURE[p.failure]?.label ?? p.failure : p.audioOnly ? 'Went audio only' : 'Poor quality'}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300">{TYPE[p.type] ?? p.type} · {p.mode === 'sfu' ? 'bigger call' : 'direct'}{p.relay ? ' · TURN' : ''}</span>
                <span className="text-zinc-500 inline-flex items-center gap-1"><Monitor className="w-3.5 h-3.5" />{p.device ?? 'unknown'}</span>
                <span className="text-zinc-500 tabular-nums">{p.worstRttMs !== null ? `${p.worstRttMs} ms` : ''}{p.worstLoss ? ` · ${Math.round(p.worstLoss * 100)}% lost` : ''}{p.seconds ? ` · ${Math.round(p.seconds / 60)} min` : ''}</span>
                <span className="flex-1" />
                {p.user && <button type="button" onClick={() => onPerson(p.user!.id)} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"><User className="w-3.5 h-3.5" />{p.user.name}</button>}
                <span className="text-xs text-zinc-400" title={format(new Date(p.createdAt), 'd MMM yyyy, HH:mm')}>{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
