'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { Ban, Check, ChevronDown, Clock, Flag, History, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { chatJson } from './chat-client';

// A community's moderation (Stage 4 · 1.13, src/server/community-moderation.ts), in Manage
// community for its owner and moderators: reported messages, automod words, timeouts and the log.

interface View {
  reports: { id: string; excerpt: string; reasons: string[]; count: number; sender: { id: string; name: string }; reporter: string; createdAt: string }[];
  resolved: { id: string; excerpt: string; outcome: string | null; sender: string; by: string; at: string }[];
  timeouts: { userId: string; name: string; until: string }[];
  automod: { words: string[]; mode: 'BLOCK' | 'FLAG' };
  log: { id: string; action: string; actor: string; target: string | null; detail: string | null; at: string }[];
}

const ACTION: Record<string, string> = {
  remove_message: 'removed a message by', timeout: 'timed out', untimeout: 'lifted the timeout of', remove_member: 'removed', role: 'changed the role of',
  automod: 'changed automod', dismiss_report: 'dismissed a report about',
};
const DURATIONS = [{ m: 10, l: '10 min' }, { m: 60, l: '1 hour' }, { m: 1440, l: '1 day' }, { m: 10080, l: '1 week' }];
const ago = (d: string) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });

export function CommunityModeration({ communityId, members }: { communityId: string; members: { id: string; name: string; communityRole: string }[] }) {
  const key = `/api/chat/communities/${communityId}/moderation`;
  const { data, mutate } = useSWR<View>(key, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [words, setWords] = useState<string | null>(null);
  const [mode, setMode] = useState<'BLOCK' | 'FLAG' | null>(null);
  const [who, setWho] = useState('');
  const [mins, setMins] = useState(60);
  const [showLog, setShowLog] = useState(false);
  const act = async (id: string, body: Record<string, unknown>, ok: string) => {
    setBusy(id);
    try { await chatJson(key, { method: 'POST', body: JSON.stringify(body) }); await mutate(); toast.success(ok); return true; }
    catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(null); }
  };
  if (!data) return <div className="h-24 rounded-2xl skeleton" />;
  const wordText = words ?? data.automod.words.join(', ');
  const btn = 'px-2.5 py-1.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50';

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />Moderation</p>

      {/* Reports */}
      <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><Flag className="w-4 h-4 text-rose-500" />Reported messages{data.reports.length ? ` · ${data.reports.length}` : ''}</p>
        {data.reports.length === 0 ? <p className="text-xs text-zinc-500">Nothing to review.</p> : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {data.reports.map((r) => (
                <motion.li key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="rounded-xl bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 p-2.5">
                  <p className="text-sm text-zinc-800 dark:text-zinc-100 break-words line-clamp-3">“{r.excerpt}”</p>
                  <p className="text-[11px] text-zinc-500 mt-1">{r.sender.name} · reported by {r.count > 1 ? `${r.count} people` : r.reporter} · {ago(r.createdAt)}{r.reasons.length ? ` · ${r.reasons.slice(0, 2).join('; ')}` : ''}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" disabled={!!busy} onClick={() => void act(r.id, { action: 'resolve', reportId: r.id, outcome: 'remove' }, 'Message removed')} className={cn(btn, 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>{busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Remove</button>
                    <button type="button" disabled={!!busy} onClick={() => void act(r.id, { action: 'resolve', reportId: r.id, outcome: 'remove_timeout', minutes: 60 }, `Removed, and ${r.sender.name.split(' ')[0]} is timed out for an hour`)} className={cn(btn, 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}><Clock className="w-3 h-3" />Remove + 1 h timeout</button>
                    <button type="button" disabled={!!busy} onClick={() => void act(r.id, { action: 'resolve', reportId: r.id, outcome: 'dismiss' }, 'Dismissed')} className={cn(btn, 'bg-zinc-100 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-200')}><Check className="w-3 h-3" />Keep it</button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Automod */}
      <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><Ban className="w-4 h-4 text-indigo-500" />Automod words</p>
        <p className="text-xs text-zinc-500">Whole words, separated by commas. Moderators aren’t checked.</p>
        <textarea value={wordText} onChange={(e) => setWords(e.target.value)} rows={2} maxLength={4000} placeholder="e.g. spamword, insult" aria-label="Automod words" className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none" />
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="When a message has one" value={mode ?? data.automod.mode} onChange={(e) => setMode(e.target.value === 'FLAG' ? 'FLAG' : 'BLOCK')} className="text-xs rounded-lg bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 px-2 py-1.5 text-zinc-700 dark:text-zinc-200">
            <option value="BLOCK">Don’t send it</option><option value="FLAG">Send it, and report it to moderators</option>
          </select>
          <button type="button" disabled={!!busy} onClick={() => void (async () => {
            const list = wordText.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
            if (await act('automod', { action: 'automod', words: list, mode: mode ?? data.automod.mode }, list.length ? `Automod: ${list.length} word${list.length === 1 ? '' : 's'}` : 'Automod off')) { setWords(null); setMode(null); }
          })()} className="btn-primary btn-sm">{busy === 'automod' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save</button>
        </div>
      </div>

      {/* Timeouts */}
      <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-500" />Timeouts</p>
        <p className="text-xs text-zinc-500">They can still read, but can’t post in any channel.</p>
        {data.timeouts.map((t) => (
          <div key={t.userId} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200">{t.name} <span className="text-xs text-zinc-500">· until {new Date(t.until).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
            <button type="button" disabled={!!busy} onClick={() => void act(`t-${t.userId}`, { action: 'timeout', userId: t.userId, minutes: 0 }, 'Timeout lifted')} aria-label={`Lift ${t.name}'s timeout`} className="p-1 text-zinc-400 hover:text-emerald-500"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who" className="flex-1 min-w-0 text-xs rounded-lg bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 px-2 py-1.5 text-zinc-700 dark:text-zinc-200">
            <option value="">Time someone out…</option>
            {members.filter((m) => m.communityRole === 'MEMBER').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="For how long" className="text-xs rounded-lg bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 px-2 py-1.5 text-zinc-700 dark:text-zinc-200">
            {DURATIONS.map((d) => <option key={d.m} value={d.m}>{d.l}</option>)}
          </select>
          <button type="button" disabled={!who || !!busy} onClick={() => void (async () => { if (await act('timeout', { action: 'timeout', userId: who, minutes: mins }, 'Timed out')) setWho(''); })()} className="btn-secondary btn-sm">Time out</button>
        </div>
      </div>

      {/* Log */}
      <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3">
        <button type="button" onClick={() => setShowLog(!showLog)} aria-expanded={showLog} className="w-full text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
          <History className="w-4 h-4 text-zinc-500" /><span className="flex-1 text-left">Moderator log</span><ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', showLog && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {showLog && (
            <motion.ul key="log" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
              {data.log.length === 0 ? <li className="pt-2 text-xs text-zinc-500">Nothing yet.</li> : data.log.map((l) => (
                <li key={l.id} className="pt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="font-semibold">{l.actor}</span> {ACTION[l.action] ?? l.action}{l.target ? <> <span className="font-semibold">{l.target}</span></> : ''}{l.detail ? <span className="text-zinc-500"> · {l.detail}</span> : ''} <span className="text-zinc-400">· {ago(l.at)}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
