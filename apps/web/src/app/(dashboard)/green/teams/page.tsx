'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Copy, Crown, Loader2, LogOut, Medal, Plus, Trophy, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { cn } from '@/lib/utils';

// UniVerse Green → teams: start a team or join one with its code, see each member's CO₂ saved, the
// team leaderboard and the top people of the last 30 days (src/server/green.ts).

interface Teams {
  mine: { id: string; name: string; code: string; owner: boolean; kg: number; members: { id: string; name: string; kg: number; me: boolean }[] }[];
  leaderboard: { rank: number; id: string; name: string; members: number; kg: number; actions: number; mine: boolean }[];
  people: { rank: number; name: string; kg: number; actions: number; me: boolean }[];
}

const MEDAL = ['#f59e0b', '#94a3b8', '#b45309'];

export default function GreenTeamsPage() {
  const { data, mutate } = useSWR<Teams>('/green/teams', fetcher);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const run = async (what: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(what);
    try { await fn(); toast.success(ok); void mutate(); } catch (e) { toast.error(errorMessage(e, 'Could not do that.')); } finally { setBusy(null); }
  };
  const max = Math.max(1, ...(data?.leaderboard.map((t) => t.kg) ?? [1]));
  return (
    <>
      <Topbar title="Teams & leaderboard" subtitle="Take on the weekly challenge together" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <form onSubmit={(e) => { e.preventDefault(); void run('create', () => api.post('/green/teams', { name }), 'Team started. Share its code to invite people.').then(() => setName('')); }} className="panel p-5">
              <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-500" aria-hidden />Start a team</h2>
              <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Team name</span><input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" placeholder="Class 10B, Marketing team, Riverside Cycling Club" /></label>
              <button type="submit" disabled={busy === 'create'} className="btn-primary btn-sm mt-3">{busy === 'create' && <Loader2 className="w-4 h-4 animate-spin" />}Start it</button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); void run('join', () => api.post('/green/teams/join', { code }), 'You joined the team.').then(() => setCode('')); }} className="panel p-5">
              <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500" aria-hidden />Join with a code</h2>
              <label className="mt-3 block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Team code</span><input required maxLength={10} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="input mt-1 font-mono uppercase tracking-widest" placeholder="ABC123" /></label>
              <button type="submit" disabled={busy === 'join'} className="btn-primary btn-sm mt-3">{busy === 'join' && <Loader2 className="w-4 h-4 animate-spin" />}Join</button>
            </form>
          </div>

          {data?.mine.map((t) => (
            <section key={t.id} className="panel p-5" aria-label={t.name}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-bold text-lg text-zinc-900 dark:text-white flex-1">{t.name}</h2>
                <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">{fmt(t.kg)} kg · 30 days</span>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(t.code).then(() => { setCopied(t.id); setTimeout(() => setCopied(null), 1500); }); }} className="btn-secondary btn-sm font-mono">{copied === t.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}{t.code}</button>
                <button type="button" onClick={() => void run(`leave-${t.id}`, () => api.post(`/green/teams/${t.id}/leave`), 'You left the team.')} className="btn-secondary btn-sm"><LogOut className="w-3.5 h-3.5" />Leave</button>
              </div>
              <ol className="mt-4 space-y-2">
                {t.members.map((m, i) => (
                  <li key={m.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', m.me && 'bg-emerald-500/[0.07]')}>
                    <span className="w-5 font-mono text-xs text-zinc-400">{i + 1}</span>
                    <span className="flex-1 text-zinc-800 dark:text-zinc-100">{m.name}{m.me ? ' (you)' : ''}</span>
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{fmt(m.kg)} kg</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
            <section className="panel p-5" aria-labelledby="lb-h">
              <h2 id="lb-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" aria-hidden />Team leaderboard · 30 days</h2>
              {!data ? <div className="mt-3 h-48 skeleton rounded-xl" /> : data.leaderboard.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No teams yet. Start the first.</p> : (
                <ol className="mt-4 space-y-3">
                  {data.leaderboard.map((t, i) => (
                    <motion.li key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                      <div className="flex items-center gap-3 text-sm">
                        {t.rank <= 3 ? <Medal className="w-5 h-5" style={{ color: MEDAL[t.rank - 1] }} aria-label={`Number ${t.rank}`} /> : <span className="w-5 text-center font-mono text-xs text-zinc-400">{t.rank}</span>}
                        <span className={cn('flex-1 truncate', t.mine ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-zinc-800 dark:text-zinc-100')}>{t.name}</span>
                        <span className="text-[11px] text-zinc-500">{t.members} people</span>
                        <span className="font-mono text-xs w-20 text-right text-emerald-600 dark:text-emerald-400">{fmt(t.kg)} kg</span>
                      </div>
                      <div className="mt-1 ml-8 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" initial={{ width: 0 }} animate={{ width: `${(t.kg / max) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.03 }} /></div>
                    </motion.li>
                  ))}
                </ol>
              )}
            </section>
            <section className="panel p-5" aria-labelledby="people-h">
              <h2 id="people-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Crown className="w-4 h-4 text-amber-500" aria-hidden />Top people · 30 days</h2>
              <ol className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {(data?.people ?? []).map((p) => (
                  <li key={p.rank} className="py-2 flex items-center gap-3 text-sm">
                    <span className="w-5 font-mono text-xs text-zinc-400">{p.rank}</span>
                    <span className={cn('flex-1 truncate', p.me ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-zinc-800 dark:text-zinc-100')}>{p.name}{p.me ? ' (you)' : ''}</span>
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{fmt(p.kg)} kg</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
