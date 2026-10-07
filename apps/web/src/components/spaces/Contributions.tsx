'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BadgeCheck, Loader2, Scale, Star } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

// Fair group work (Stage 4 · 4.3; src/server/contributions.ts): who did what in a space's shared work.
// Whoever runs the space sees everyone (and a teacher can verify someone's part as skill evidence);
// students see their own part and, in study groups, rate their teammates.

type Tool = 'writing' | 'code' | 'tasks' | 'reviews' | 'posts';
interface Row {
  id: string; name: string; avatar: string | null; share: number; shares: Partial<Record<Tool, number>>;
  writing: { edits: number; bytes: number; versions: number }; code: { edits: number; bytes: number };
  tasks: { done: number; made: number }; reviews: number; posts: number;
  rating: { avg: number; count: number } | null; verified: { skill: string; level: string | null }[];
}
interface Data {
  days: number; used: Tool[]; canManage: boolean; canVerify: boolean; ratings: boolean; size: number;
  people: Row[]; me: Row | null; teammates: { id: string; name: string; avatar: string | null; myScore: number | null }[];
}

const kb = (b: number) => (b >= 1024 ? `${(b / 1024).toFixed(b >= 10_240 ? 0 : 1)} KB` : `${b} B`);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The numbers behind someone's share, for the tools the group used. */
function Parts({ r, used }: { r: Row; used: Tool[] }) {
  const part: Record<Tool, string> = {
    writing: `Writing ${kb(r.writing.bytes)}${r.writing.versions ? ` · ${r.writing.versions} versions` : ''}`,
    code: `Code ${kb(r.code.bytes)}`,
    tasks: `${r.tasks.done} task${r.tasks.done === 1 ? '' : 's'} done${r.tasks.made ? ` · ${r.tasks.made} added` : ''}`,
    reviews: `${r.reviews} review${r.reviews === 1 ? '' : 's'}`,
    posts: `${r.posts} post${r.posts === 1 ? '' : 's'}`,
  };
  return <span className="flex flex-wrap gap-1.5">{used.map((t) => <span key={t} className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">{part[t]}</span>)}</span>;
}

function Stars({ value, onPick, label }: { value: number | null; onPick: (n: number) => void; label: string }) {
  return (
    <span className="inline-flex" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onPick(n)} className="p-0.5">
          <Star className={cn('w-5 h-5 transition-colors', value && n <= value ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600')} />
        </button>
      ))}
    </span>
  );
}

function Verify({ r, used, endpoint, onDone }: { r: Row; used: Tool[]; endpoint: string; onDone: () => void }) {
  const suggested = ['Teamwork', 'Communication', ...(used.includes('writing') && r.writing.bytes ? ['Technical writing'] : []), ...(used.includes('code') && r.code.bytes ? ['Programming'] : []), ...(used.includes('tasks') && r.tasks.done ? ['Project management'] : [])];
  const [skills, setSkills] = useState<string[]>(r.verified.length ? r.verified.map((v) => v.skill) : suggested.slice(0, 3));
  const [level, setLevel] = useState(r.verified[0]?.level ?? 'Proficient');
  const [busy, setBusy] = useState(false);
  const options = [...new Set([...suggested, ...skills])];
  return (
    <div className="mt-2 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 p-3 space-y-2">
      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Skills this work shows</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((s) => (
          <button key={s} type="button" aria-pressed={skills.includes(s)} onClick={() => setSkills((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s].slice(0, 6)))}
            className={cn('rounded-full px-2.5 py-1 text-xs font-medium border transition-colors', skills.includes(s) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-white/15 text-zinc-600 dark:text-zinc-300')}>{s}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {['Developing', 'Proficient', 'Advanced'].map((l) => (
          <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', level === l ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>{l}</button>
        ))}
        <span className="flex-1" />
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await authedJson(endpoint, { method: 'POST', body: JSON.stringify({ userId: r.id, skills, level }) });
            toast.success(skills.length ? `${r.name.split(' ')[0]}’s passport now shows this work` : 'Removed from their passport');
            onDone();
          } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
        }} className="btn-primary btn-sm rounded-full inline-flex">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}{skills.length ? 'Verify' : 'Remove'}</button>
      </div>
    </div>
  );
}

export function Contributions({ kind, id }: { kind: string; id: string }) {
  const [days, setDays] = useState(30);
  const [verifying, setVerifying] = useState<string | null>(null);
  const { data, mutate } = useSWR<Data>(`/api/spaces/${kind}/${id}/contributions?days=${days}`, authedJson);
  const rate = async (rateeId: string, score: number) => {
    mutate((d) => (d ? { ...d, teammates: d.teammates.map((t) => (t.id === rateeId ? { ...t, myScore: score } : t)) } : d), { revalidate: false });
    try { await authedJson(`/api/spaces/${kind}/${id}/ratings`, { method: 'POST', body: JSON.stringify({ rateeId, score }) }); } catch (e) { toast.error((e as Error).message); void mutate(); }
  };
  if (!data) return <section className={`panel p-4`}><div className="h-24 rounded-xl skeleton" /></section>;
  const nothing = !data.used.length;
  return (
    <section className={`panel p-4 space-y-3`} aria-label="Who did what">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex-1">{data.canManage ? 'Who did what' : 'Your part'}</h2>
        <div className="flex rounded-full bg-zinc-100 dark:bg-white/[0.06] p-0.5" role="tablist" aria-label="Over the last">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold transition-colors', days === d ? 'bg-white dark:bg-white/15 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500')}>{d} days</button>
          ))}
        </div>
      </div>
      {nothing ? (
        <p className="text-sm text-zinc-500">No shared work in this time yet: documents, code, tasks{data.ratings ? ' and posts' : ''} made here show up as people work on them.</p>
      ) : data.canManage ? (
        <>
          <ul className="space-y-2.5">
            {data.people.map((r) => (
              <li key={r.id}>
                <div className="flex items-start gap-3">
                  <Avatar name={r.name} src={r.avatar} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">{r.name}</span>
                      {r.rating && <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400" title={`${r.rating.count} teammate rating${r.rating.count === 1 ? '' : 's'}`}><Star className="w-3 h-3 fill-current" />{r.rating.avg}</span>}
                      {r.verified.length > 0 && <BadgeCheck className="w-4 h-4 text-sky-600" aria-label={`Verified: ${r.verified.map((v) => v.skill).join(', ')}`} />}
                      <span className="ml-auto text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{pct(r.share)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: pct(Math.min(1, r.share)) }} /></div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Parts r={r} used={data.used} />
                      {data.canVerify && <button type="button" onClick={() => setVerifying(verifying === r.id ? null : r.id)} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">{r.verified.length ? 'Verified · change' : 'Verify for passport'}</button>}
                    </div>
                    {verifying === r.id && <Verify r={r} used={data.used} endpoint={`/api/spaces/${kind}/${id}/verify`} onDone={() => { setVerifying(null); void mutate(); }} />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-zinc-400">Share = each person’s part of the group’s writing, code, finished tasks, reviews{data.ratings ? ' and posts' : ''}, averaged over the tools you used. Activity isn’t quality: use it to start a conversation, not to grade on its own.</p>
        </>
      ) : data.me ? (
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex flex-col items-center justify-center"><span className="text-lg font-bold leading-none">{pct(data.me.share)}</span><span className="text-[9px] opacity-80">of the work</span></div>
          <div className="min-w-0 space-y-1.5">
            <Parts r={data.me} used={data.used} />
            {data.me.rating && <p className="text-xs text-zinc-500 inline-flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />Teammates rate your part {data.me.rating.avg} of 5</p>}
            {data.me.verified.length > 0 && <p className="text-xs text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" />Verified for your passport: {data.me.verified.map((v) => v.skill).join(', ')}</p>}
          </div>
        </div>
      ) : null}
      {data.ratings && data.teammates.length > 0 && (
        <div className="pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1.5">Rate your teammates’ part <span className="font-normal text-zinc-500">(only averages are shown, never who rated)</span></p>
          <ul className="space-y-1">
            {data.teammates.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <Avatar name={t.name} src={t.avatar} size={24} />
                <span className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-100 truncate">{t.name}</span>
                <Stars value={t.myScore} onPick={(n) => void rate(t.id, n)} label={`Rate ${t.name}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
