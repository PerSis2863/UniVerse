'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { GraduationCap, Loader2, Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Fill } from '@/components/ui/Fill';
import { cn } from '@/lib/utils';
import { errorMessage, fetcher } from './shared';

// Ghidra's exam (M445): the owner starts a run and this panel asks the next few questions while it stays open
// (src/server/ghidra/exam-run.ts), then shows each skill's score and the rules it failed most. Close it and the run
// waits; open it and press Continue.

type Skill = { skill: string; passed: number; asked: number; score: number; failed: [string, number][] };
type Run = { id: string; per: number; total: number; cursor: number; status: 'RUNNING' | 'DONE' | 'STOPPED'; startedAt: string; finishedAt: string | null };
type State = { run: Run | null; skills: Skill[]; notAsked: string[] };

const tone = (s: number) => (s >= 85 ? 'text-emerald-600 dark:text-emerald-400' : s >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400');

export function GhidraExamPanel() {
  const { data, mutate } = useSWR<State>('/owner/ghidra-exam', fetcher, { revalidateOnFocus: false });
  const [per, setPer] = useState(10);
  const [going, setGoing] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  /** Asks the next questions until the run is done, stopped, or this panel closes. */
  async function drive(id: string) {
    setGoing(true);
    try {
      for (;;) {
        if (!live.current) return;
        const next = (await api.post<State>('/owner/ghidra-exam', { action: 'step', id })).data;
        await mutate(next, { revalidate: false });
        if (next.run?.status !== 'RUNNING') break;
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (live.current) setGoing(false);
    }
  }
  async function start() {
    try {
      const s = (await api.post<State>('/owner/ghidra-exam', { action: 'start', per })).data;
      await mutate(s, { revalidate: false });
      if (s.run) void drive(s.run.id);
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function stop() {
    if (!data?.run) return;
    live.current = false;
    const s = (await api.post<State>('/owner/ghidra-exam', { action: 'stop', id: data.run.id })).data;
    live.current = true;
    setGoing(false);
    await mutate(s, { revalidate: false });
  }

  const run = data?.run;
  const asked = data?.skills.reduce((n, s) => n + s.asked, 0) ?? 0, passed = data?.skills.reduce((n, s) => n + s.passed, 0) ?? 0;
  return (
    <section className="tone-panel rounded-3xl border border-zinc-200/80 dark:border-white/[0.06] p-5 sm:p-6 space-y-4" aria-labelledby="ghidra-exam">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><GraduationCap className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <h2 id="ghidra-exam" className="font-semibold text-zinc-900 dark:text-white">Ghidra&apos;s exam</h2>
          <p className="text-sm text-zinc-500">Test questions for each of Ghidra&apos;s skills, answered by the live site&apos;s AI and marked by fixed rules.</p>
        </div>
        {run?.status === 'RUNNING' ? (
          going ? <button onClick={() => void stop()} className="btn-secondary inline-flex items-center gap-2"><Square className="w-4 h-4" /> Stop</button>
            : <button onClick={() => void drive(run.id)} className="btn-primary inline-flex items-center gap-2"><Play className="w-4 h-4" /> Continue</button>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-500" htmlFor="exam-per">Per skill</label>
            <select id="exam-per" value={per} onChange={(e) => setPer(Number(e.target.value))} className="input w-auto py-2">
              {[5, 10, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}
            </select>
            <button onClick={() => void start()} className="btn-primary inline-flex items-center gap-2"><Play className="w-4 h-4" /> Run the exam</button>
          </div>
        )}
      </div>

      {run && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            {run.status === 'RUNNING' && going && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
            <span>{run.status === 'DONE' ? 'Finished' : run.status === 'STOPPED' ? 'Stopped' : going ? 'Asking' : 'Paused'} · {Math.min(run.cursor, run.total)} of {run.total} questions · started {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}</span>
            {asked > 0 && <span className={cn('ms-auto font-semibold tabular-nums', tone(Math.round((100 * passed) / asked)))}>{Math.round((100 * passed) / asked)}% passed</span>}
          </div>
          <div className="h-1.5 rounded-full bg-zinc-200/70 dark:bg-white/10 overflow-hidden"><Fill value={run.total ? run.cursor / run.total : 0} quick /></div>
        </div>
      )}

      {data && data.skills.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-start text-zinc-500"><th className="text-start font-medium py-2 pe-3">Skill</th><th className="text-end font-medium py-2 pe-3">Score</th><th className="text-end font-medium py-2 pe-3">Passed</th><th className="text-start font-medium py-2">Rules it failed most</th></tr></thead>
            <tbody>
              {data.skills.map((s) => (
                <tr key={s.skill} className="border-t border-zinc-200/70 dark:border-white/[0.06]">
                  <td className="py-2 pe-3 font-medium text-zinc-900 dark:text-white">{s.skill}</td>
                  <td className={cn('py-2 pe-3 text-end font-semibold tabular-nums', tone(s.score))}>{s.score}%</td>
                  <td className="py-2 pe-3 text-end tabular-nums text-zinc-500">{s.passed} / {s.asked}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-300">{s.failed.map(([r, n]) => `${r} (${n})`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        Each question is one AI request on the site&apos;s own key. {data?.notAsked.join(', ')} need a picture, a voice or Hyperion&apos;s engine, so they are scored by the exam command instead.
        Questions use made-up people and course notes only.
      </p>
    </section>
  );
}
