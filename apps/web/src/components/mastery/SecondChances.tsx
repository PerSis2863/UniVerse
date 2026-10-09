'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceStrict } from 'date-fns';
import { Check, CheckCircle2, Layers, Loader2, MessageSquareQuote, PlayCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import Link from '@/components/ui/Link';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import type { Band } from '@/lib/mastery';
import { BAND } from './MasteryMap';

// Second chances (Stage 5 · D10; src/server/second-chance.ts): above a student's mastery map, what
// they missed lately (by concept, or by question when it isn't tagged), each a short catch-up: the
// class moments where it was explained, a few practice questions, the missed questions again, what
// the teacher said about a criterion, and flashcards. Practice answers raise the map.

interface Item { key: string; topic: string; band: Band | null; missedAt: string; missed: number; sources: string[]; started: boolean; answered: number; right: number; total: number }
interface Done { key: string; topic: string; band: Band | null; completedAt: string; answered: number; right: number; total: number }
interface Q { question: string; options: string[]; from: 'class' | 'tutor' | 'quiz'; source: string | null; t: number | null; sessionId: string | null; right?: boolean; answer?: number; explain?: string; chose?: number | null }
interface Chance {
  key: string; topic: string; status: string; watched: boolean; cards: boolean; answered: number; right: number; total: number;
  moments: { sessionId: string; when: string; t: number; text: string }[];
  feedback: { criterion: string; source: string; score: number; points: number; comment: string }[];
  practice: Q[]; retry: Q[]; noAi: 'off' | 'limit' | 'no-sources' | 'failed' | null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';

export function SecondChances({ courseId }: { courseId: string }) {
  const url = `/api/courses/${courseId}/second-chances`;
  const { data, mutate } = useSWR<{ open: Item[]; done: Done[] }>(url, authedJson);
  const now = useNow();
  const [open, setOpen] = useState<Chance | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || (!data.open.length && !data.done.length)) return null;

  const start = async (key: string) => {
    setBusy(key);
    try {
      setOpen(await authedJson<Chance>(url, { method: 'POST', body: JSON.stringify({ action: 'start', key }) }));
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t open that second chance.')); }
    finally { setBusy(null); }
  };
  const dismiss = async (it: Item) => {
    if (!(await confirmDialog({ title: 'Skip this one?', message: `“${it.topic}” leaves the list until you miss it again.`, confirmLabel: 'Skip' }))) return;
    try { await authedJson(url, { method: 'POST', body: JSON.stringify({ action: 'dismiss', key: it.key }) }); void mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t skip it.')); }
  };

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={cn(card, 'p-4 sm:p-5')} aria-labelledby="chances-title">
      <h2 id="chances-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><RotateCcw className="w-4 h-4 text-indigo-500" aria-hidden /> Second chances</h2>
      <p className="text-xs text-zinc-500 mt-0.5">What you missed lately, with the class moments that explain it and a few questions to try. It never changes a grade.</p>
      {data.open.length > 0 ? (
        <motion.ul variants={list} initial="hidden" animate="show" className="mt-3 space-y-2">
          {data.open.map((it) => (
            <motion.li key={it.key} variants={fadeUp} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white line-clamp-2">{it.topic}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Missed {it.missed} in {it.sources.join(', ')}{now ? ` · ${formatDistanceStrict(new Date(it.missedAt), now, { addSuffix: true })}` : ''}
                  {it.band && <> · <span className={BAND[it.band].tone}>{BAND[it.band].label}</span></>}
                </p>
                {it.started && it.total > 0 && <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">{it.answered} of {it.total} answered</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => void start(it.key)} disabled={busy === it.key} className="btn-primary btn-sm">
                  {busy === it.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <PlayCircle className="w-3.5 h-3.5" aria-hidden />}{it.started ? 'Continue' : 'Start'}
                </button>
                <button type="button" onClick={() => void dismiss(it)} aria-label={`Skip ${it.topic}`} className="w-8 h-8 rounded-full grid place-items-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"><X className="w-4 h-4" aria-hidden /></button>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      ) : <p className="mt-3 text-sm text-zinc-500">Nothing to catch up on right now.</p>}
      {busy && <p className="sr-only" role="status">Building your second chance…</p>}
      {data.done.length > 0 && (
        <details className="mt-3 group">
          <summary className="text-xs font-semibold text-zinc-500 cursor-pointer select-none">Finished lately ({data.done.length})</summary>
          <ul className="mt-2 space-y-1">
            {data.done.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300"><CheckCircle2 className="inline w-3.5 h-3.5 text-emerald-500 mr-1 -mt-0.5" aria-hidden />{d.topic}</span>
                <span className="text-[11px] text-zinc-500 shrink-0 tabular-nums">{d.total ? `${d.right}/${d.answered} right · ` : ''}{now ? formatDistanceStrict(new Date(d.completedAt), now, { addSuffix: true }) : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {open && <ChanceSheet key={open.key} courseId={courseId} initial={open} onClose={() => setOpen(null)} onChanged={() => void mutate()} />}
    </motion.section>
  );
}

function ChanceSheet({ courseId, initial, onClose, onChanged }: { courseId: string; initial: Chance; onClose: () => void; onChanged: () => void }) {
  const url = `/api/courses/${courseId}/second-chances`;
  const { mutate: revalidate } = useSWRConfig();
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const post = <T,>(body: Record<string, unknown>) => authedJson<T>(url, { method: 'POST', body: JSON.stringify({ key: c.key, ...body }) });

  const answer = async (part: 'practice' | 'retry', i: number, choice: number) => {
    const id = `${part}:${i}`;
    if (busy || c[part][i]?.right !== undefined) return;
    setBusy(id);
    try {
      const r = await post<{ right: boolean; chose: number | null; answer: number; explain: string; answered: number }>({ action: 'answer', part, i, choice });
      haptic(r.right ? 'success' : 'warning');
      setC((x) => ({ ...x, answered: r.answered, [part]: x[part].map((q, k) => (k === i ? { ...q, right: r.right, chose: r.chose, answer: r.answer, explain: r.explain } : q)) }));
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t check that answer.')); }
    finally { setBusy(null); }
  };
  const watched = () => { if (!c.watched) { setC((x) => ({ ...x, watched: true })); void post({ action: 'watched' }).catch(() => {}); } };
  const cards = async () => {
    setBusy('cards');
    try {
      const r = await post<{ added: number }>({ action: 'cards' });
      setC((x) => ({ ...x, cards: true }));
      haptic('success');
      toast.success(r.added ? `${r.added} flashcard${r.added === 1 ? '' : 's'} added to your deck` : 'They’re in your deck already');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add the flashcards.')); }
    finally { setBusy(null); }
  };
  const done = async () => {
    setBusy('done');
    try {
      await post({ action: 'done' });
      haptic('success');
      toast.success('Nice work', { description: 'Your mastery map now counts this practice.' });
      onChanged();
      void revalidate((k) => typeof k === 'string' && k.startsWith(`/api/courses/${courseId}/mastery`));
      onClose();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t finish it.')); }
    finally { setBusy(null); }
  };

  const asked = c.practice.length + c.retry.length;
  const footer = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-500 tabular-nums">{asked ? `${c.answered} of ${asked} answered` : ''}</span>
      <button type="button" onClick={() => void done()} disabled={busy === 'done'} className="btn-primary">
        {busy === 'done' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}I’m done
      </button>
    </div>
  );
  return (
    <Sheet title={c.topic} onClose={onClose} footer={footer}>
      <div className="space-y-5">
        <Step n={1} title="Watch it explained" icon={PlayCircle}>
          {c.moments.length ? (
            <ul className="space-y-1.5">
              {c.moments.map((m) => (
                <li key={`${m.sessionId}-${m.t}`}>
                  <Link href={`/student/blackboard?course=${courseId}&tab=sessions&session=${m.sessionId}&t=${Math.floor(m.t)}`} onClick={watched} className="flex items-start gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 px-3 py-2 hover:border-indigo-400/60 transition-colors">
                    <span className="text-[11px] font-semibold tabular-nums text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">{format(new Date(m.when), 'd MMM')} · {clock(m.t)}</span>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">{m.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No class recording covers this yet. <Link href={`/student/tutor?course=${courseId}&tab=ask`} className="text-indigo-600 dark:text-indigo-400 font-semibold">Ask the course tutor</Link> to explain it.</p>
          )}
        </Step>

        {c.feedback.length > 0 && (
          <Step n={2} title="What your teacher said" icon={MessageSquareQuote}>
            <ul className="space-y-2">
              {c.feedback.map((f, i) => (
                <li key={i} className="rounded-2xl bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{f.criterion} <span className="text-xs font-normal text-zinc-500 tabular-nums">· {f.score}/{f.points} in {f.source}</span></p>
                  {f.comment ? <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-wrap">{f.comment}</p> : <p className="text-xs text-zinc-500 mt-1">No comment on this one; the assignment’s feedback may say more.</p>}
                </li>
              ))}
            </ul>
          </Step>
        )}

        <Step n={c.feedback.length ? 3 : 2} title="Practise" icon={Sparkles}>
          {c.practice.length ? (
            <ol className="space-y-3">{c.practice.map((q, i) => <Question key={i} q={q} n={i + 1} courseId={courseId} busy={busy === `practice:${i}`} onAnswer={(k) => void answer('practice', i, k)} />)}</ol>
          ) : (
            <p className="text-sm text-zinc-500">
              {c.noAi === 'limit' ? 'You’ve used today’s AI allowance, so there are no new practice questions. ' : c.noAi === 'failed' ? 'The tutor couldn’t make practice questions this time. ' : ''}
              <Link href={`/student/tutor?course=${courseId}&tab=practice&topic=${encodeURIComponent(c.topic)}`} className="text-indigo-600 dark:text-indigo-400 font-semibold">Practise in the tutor</Link>
            </p>
          )}
          {c.practice.length > 0 && c.practice.length < 3 && c.noAi === 'limit' && <p className="text-xs text-zinc-500 mt-2">You’ve used today’s AI allowance, so there are fewer questions than usual.</p>}
        </Step>

        {c.retry.length > 0 && (
          <Step n={(c.feedback.length ? 4 : 3)} title={c.retry.length === 1 ? 'The question you missed' : 'The questions you missed'} icon={RotateCcw}>
            <ol className="space-y-3">{c.retry.map((q, i) => <Question key={i} q={q} n={i + 1} courseId={courseId} busy={busy === `retry:${i}`} onAnswer={(k) => void answer('retry', i, k)} />)}</ol>
          </Step>
        )}

        {asked > 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500 shrink-0" aria-hidden />{c.cards ? 'They’re in your flashcards.' : asked === 1 ? 'Keep this question as a flashcard.' : 'Keep these questions as flashcards.'}</p>
            {c.cards
              ? <Link href={`/student/tutor?course=${courseId}&tab=cards`} className="btn-secondary btn-sm shrink-0">Review</Link>
              : <button type="button" onClick={() => void cards()} disabled={busy === 'cards'} className="btn-secondary btn-sm shrink-0">{busy === 'cards' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}Add</button>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Step({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-indigo-500" aria-hidden />{n}. {title}</h3>
      {children}
    </section>
  );
}

function Question({ q, n, courseId, busy, onAnswer }: { q: Q; n: number; courseId: string; busy: boolean; onAnswer: (choice: number) => void }) {
  const answered = q.right !== undefined && q.answer !== undefined;
  const chose = q.chose ?? undefined;
  return (
    <li className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{n}. {q.question}</p>
      <div className="mt-2 space-y-1.5" role="group" aria-label={`Answers to question ${n}`}>
        {q.options.map((o, k) => {
          const right = answered && k === q.answer;
          const wrong = answered && chose === k && k !== q.answer;
          return (
            <button key={k} type="button" disabled={answered || busy} onClick={() => onAnswer(k)} aria-pressed={chose === k}
              className={cn('w-full text-left text-sm px-3 py-2 rounded-xl border flex items-center gap-2 transition-colors',
                right ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : wrong ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 enabled:hover:border-indigo-400/60')}>
              {right && <CheckCircle2 className="w-4 h-4 shrink-0" aria-label="Right answer" />}{wrong && <X className="w-4 h-4 shrink-0" aria-label="Your answer" />}<span>{o}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <p className={cn('mt-2 text-xs', q.right ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-600 dark:text-zinc-400')} role="status">
          {q.right ? 'Right. ' : 'Not quite: the right answer is marked. '}{q.explain}
        </p>
      )}
      {(q.source || (q.sessionId && q.t != null)) && (
        <p className="mt-1.5 text-[11px] text-zinc-500">
          {q.sessionId && q.t != null
            ? <Link href={`/student/blackboard?course=${courseId}&tab=sessions&session=${q.sessionId}&t=${Math.floor(q.t)}`} className="text-indigo-600 dark:text-indigo-400">From class at {clock(q.t)}</Link>
            : `From ${q.source}`}
        </p>
      )}
    </li>
  );
}
