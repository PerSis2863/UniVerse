'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { BarChart3, Eye, EyeOff, Loader2, Lock, PenTool, Plus, Radio, Trash2, Unlock } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { fetcher } from '@/lib/fetcher';
import { confirmDialog } from '@/components/ui/Dialogs';
import { PollResults } from '@/components/live/PollResults';

interface Poll { id: string; question: string; options: string[]; status: 'OPEN' | 'CLOSED'; showResults: boolean; createdAt: string; results: number[]; total: number }

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const field = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';

/** Live class: quick polls students answer on their phones, with results updating live. */
export default function TeacherLivePage() {
  const { data: courses } = useSWR<{ id: string; code: string; name: string }[]>('/courses/my', fetcher);
  const [courseId, setCourseId] = useState('');
  const active = courseId || courses?.[0]?.id || '';
  // Votes arrive over live updates; poll quickly only without them.
  const openPoll = useLiveInterval(5000, 20_000);
  const { data, mutate } = useSWR<{ enrolled: number; polls: Poll[] }>(active ? `/api/live?courseId=${active}` : null, authedJson, {
    // Live updates refresh this instantly; this is the fallback while a poll is open.
    refreshInterval: (d) => (d?.polls.some((p) => p.status === 'OPEN') ? openPoll : 0),
  });

  return (
    <>
      <Topbar title="Live class" subtitle="Ask a quick question; students answer on their phones and you see results as they come in" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6 stagger">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm flex-1 min-w-48">
              <span className="text-zinc-600 dark:text-zinc-400">Course</span>
              <select value={active} onChange={(e) => setCourseId(e.target.value)} className={field}>
                {!courses?.length && <option value="">{courses ? 'No courses yet' : 'Loading…'}</option>}
                {courses?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            </label>
            <Link href="/boards" className="btn-secondary"><PenTool className="w-4 h-4" /> Open a whiteboard</Link>
          </div>

          {active && <NewPoll courseId={active} onCreated={() => mutate()} />}

          {data?.polls.map((p) => <PollCard key={p.id} poll={p} enrolled={data.enrolled} onChange={() => mutate()} />)}
          {data && data.polls.length === 0 && (
            <p className={`${card} p-6 text-sm text-zinc-500 text-center`}>No polls yet. Ask one above: students in the course get it straight away.</p>
          )}
        </div>
      </div>
    </>
  );
}

function NewPoll({ courseId, onCreated }: { courseId: string; onCreated: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [showResults, setShowResults] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authedJson('/api/live', { method: 'POST', body: JSON.stringify({ courseId, question, options: options.filter((o) => o.trim()), showResults }) });
      setQuestion(''); setOptions(['', '']);
      toast.success('Poll is live');
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={start} className={`${card} p-5 space-y-3`}>
      <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Radio className="w-4 h-4 text-rose-500" /> New poll</h2>
      <input aria-label="Question" required maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which sorting algorithm is stable?" className={field} />
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex gap-1">
            <input aria-label={`Answer ${i + 1}`} maxLength={120} value={o} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Answer ${i + 1}`} className={field} />
            {options.length > 2 && <button type="button" aria-label={`Remove answer ${i + 1}`} onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} className="p-2 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          {options.length < 6 && <button type="button" className="font-medium text-indigo-500" onClick={() => setOptions((l) => [...l, ''])}><Plus className="inline w-4 h-4 -mt-0.5" /> Answer</button>}
          <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 cursor-pointer"><input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} /> Students see results live</label>
        </div>
        <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy || undefined}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />} Start poll</button>
      </div>
    </form>
  );
}

function PollCard({ poll, enrolled, onChange }: { poll: Poll; enrolled: number; onChange: () => void }) {
  const patch = async (body: Record<string, unknown>) => {
    try { await authedJson(`/api/live/${poll.id}`, { method: 'PATCH', body: JSON.stringify(body) }); onChange(); } catch (err) { toast.error((err as Error).message); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this poll?', destructive: true, confirmLabel: 'Delete' }))) return;
    try { await authedJson(`/api/live/${poll.id}`, { method: 'DELETE' }); onChange(); } catch (err) { toast.error((err as Error).message); }
  };
  return (
    <section className={`${card} p-5 space-y-4`} aria-label={poll.question}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`text-[11px] font-bold uppercase tracking-wider ${poll.status === 'OPEN' ? 'text-rose-500' : 'text-zinc-500'}`}>{poll.status === 'OPEN' ? '● Live' : 'Closed'}</p>
          <h3 className="font-semibold text-zinc-900 dark:text-white">{poll.question}</h3>
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> {poll.total} of {enrolled} answered</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost" onClick={() => patch({ showResults: !poll.showResults })} title={poll.showResults ? 'Students see results' : 'Results hidden from students until closed'}>
            {poll.showResults ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button type="button" className="btn-secondary" onClick={() => patch({ status: poll.status === 'OPEN' ? 'CLOSED' : 'OPEN' })}>
            {poll.status === 'OPEN' ? <><Lock className="w-4 h-4" /> Close</> : <><Unlock className="w-4 h-4" /> Reopen</>}
          </button>
          <button type="button" className="btn-ghost text-rose-500" onClick={remove} aria-label="Delete poll"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <PollResults options={poll.options} results={poll.results} total={poll.total} />
    </section>
  );
}
