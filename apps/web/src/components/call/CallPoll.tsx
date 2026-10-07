'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { BarChart3, BookOpenCheck, Check, ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Live polls and quick quizzes in a call (Stage 4 · 2.7). The host asks (typed in, or a question
// from the class's own quizzes); everyone answers on a card that stays out of the way. A poll shows
// its results to people once they've answered; a quiz keeps everyone's answers, and the right one,
// hidden until the host ends it. The call's room keeps the votes (cloudflare/worker.ts CallRoom,
// pollControl and 'vote'); one poll at a time, gone when the call ends.

/** The poll as the call room shows it to me. */
export interface PollView {
  id: string; q: string; options: string[]; quiz: boolean; anon: boolean; by: string; open: boolean;
  mine: number | null; total: number;
  /** Answers per option, when I may see them. */ counts: number[] | null;
  /** The right answer (quizzes: hosts, and everyone once it ends). */ correct: number | null;
  /** Who picked what (hosts, when the poll isn't anonymous). */ voters?: string[][];
}

export type PollMsg =
  | { action: 'poll-start'; q: string; options: string[]; quiz: boolean; correct: number | null; anon: boolean }
  | { action: 'poll-end' }
  | { action: 'poll-clear' };

type Bank = { id: string; title: string; questions: { id: string; q: string; options: string[]; correct: number }[] }[];

const sheet = 'pointer-events-auto w-full max-w-md max-h-[72vh] overflow-y-auto rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 space-y-4';
const field = 'w-full rounded-2xl bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-fuchsia-400/50';

/** The host writes a poll or quiz (or picks a question from the class's quizzes) and starts it. */
export function PollComposer({ open, onClose, onStart, questionsFor }: {
  open: boolean; onClose: () => void; onStart: (m: PollMsg) => void;
  /** Class calls: the call whose class quizzes can be asked live. */
  questionsFor: string | null;
}) {
  const [quiz, setQuiz] = useState(false);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [correct, setCorrect] = useState<number | null>(null);
  const [anon, setAnon] = useState(true);
  const [bank, setBank] = useState<null | 'loading' | Bank>(null);
  const filled = options.map((o, i) => ({ text: o.trim(), i })).filter((o) => o.text);
  const valid = !!q.trim() && filled.length >= 2 && (!quiz || (correct !== null && !!options[correct]?.trim()));

  const pickMode = (isQuiz: boolean) => { haptic('tap'); setQuiz(isQuiz); setAnon(!isQuiz); };
  const loadBank = async () => {
    if (!questionsFor) return;
    setBank('loading');
    try {
      const r = await authedJson<{ quizzes: Bank }>(`/api/calls/${encodeURIComponent(questionsFor)}/questions`);
      setBank(r.quizzes);
    } catch {
      setBank(null);
      toast.error('Couldn’t load the class’s quizzes.');
    }
  };
  const pickQuestion = (x: Bank[number]['questions'][number]) => {
    haptic('tap');
    setQuiz(true); setAnon(false); setQ(x.q); setOptions(x.options); setCorrect(x.correct); setBank(null);
  };
  const start = () => {
    if (!valid) return;
    haptic('tap');
    onStart({ action: 'poll-start', q: q.trim(), options: filled.map((o) => o.text), quiz, correct: quiz && correct !== null ? filled.findIndex((o) => o.i === correct) : null, anon });
    setQ(''); setOptions(['', '']); setCorrect(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="poll-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40" aria-hidden />
          <div key="poll-compose" className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
            <motion.div role="dialog" aria-label="Ask a poll or quiz" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={spring.smooth} className={sheet}>
              <div className="flex items-center justify-between">
                <p className="font-semibold inline-flex items-center gap-2"><BarChart3 className="w-4 h-4 text-fuchsia-300" />Ask everyone</p>
                <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/[0.06]" role="group" aria-label="Poll or quiz">
                {([[false, 'Poll'], [true, 'Quick quiz']] as const).map(([isQuiz, label]) => (
                  <button key={label} type="button" onClick={() => pickMode(isQuiz)} aria-pressed={quiz === isQuiz} className={cn('relative isolate py-2 rounded-xl text-sm font-semibold transition-colors', quiz === isQuiz ? 'text-white' : 'text-zinc-400 hover:text-white')}>
                    {quiz === isQuiz && <motion.span layoutId="poll-mode" transition={spring.snappy} className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500" />}
                    {label}
                  </button>
                ))}
              </div>

              {questionsFor && (
                bank === null ? (
                  <button type="button" onClick={() => void loadBank()} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-sm font-medium"><BookOpenCheck className="w-4 h-4 text-indigo-200" />Ask a question from this class’s quizzes</button>
                ) : bank === 'loading' ? (
                  <p className="text-sm text-zinc-400 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading the class’s quizzes…</p>
                ) : bank.length === 0 ? (
                  <p className="text-sm text-zinc-400">This class has no quiz questions with choices yet.</p>
                ) : (
                  <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] max-h-56 overflow-y-auto">
                    {bank.map((quizItem) => (
                      <div key={quizItem.id}>
                        <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{quizItem.title}</p>
                        {quizItem.questions.map((x) => (
                          <button key={x.id} type="button" onClick={() => pickQuestion(x)} className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.08] truncate">{x.q}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              )}

              <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} rows={2} placeholder={quiz ? 'Question, e.g. What does a mitochondrion do?' : 'Question, e.g. How was the reading?'} aria-label="Question" className={cn(field, 'resize-none')} />

              <div className="space-y-2" role={quiz ? 'radiogroup' : undefined} aria-label={quiz ? 'The right answer' : undefined}>
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {quiz && (
                      <button type="button" role="radio" aria-checked={correct === i} onClick={() => { haptic('tap'); setCorrect(i); }} aria-label={`Option ${i + 1} is the right answer`}
                        className={cn('w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors', correct === i ? 'bg-emerald-500 border-emerald-500' : 'border-white/25 hover:border-white/50')}>
                        {correct === i && <Check className="w-4 h-4" strokeWidth={3} />}
                      </button>
                    )}
                    <input value={o} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className={field} />
                    {options.length > 2 && (
                      <button type="button" onClick={() => { setOptions((all) => all.filter((_, j) => j !== i)); setCorrect((c) => (c === null ? c : c === i ? null : c > i ? c - 1 : c)); }} aria-label={`Remove option ${i + 1}`} className="p-2 rounded-full hover:bg-white/10 text-zinc-400"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                {options.length < 6 && (
                  <button type="button" onClick={() => setOptions((all) => [...all, ''])} className="text-sm font-semibold text-indigo-200 hover:underline inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add an option</button>
                )}
                {quiz && <p className="text-xs text-zinc-400">Tick the right answer. Nobody sees it, or anyone’s answers, until you end the quiz.</p>}
              </div>

              <button type="button" role="switch" aria-checked={anon} onClick={() => { haptic('tap'); setAnon((a) => !a); }} className="w-full flex items-center justify-between gap-3 text-left">
                <span>
                  <span className="block text-sm font-medium">Anonymous</span>
                  <span className="block text-xs text-zinc-400">{anon ? 'You see only how many picked each answer.' : 'You see who picked what (only you and co-hosts).'}</span>
                </span>
                <span className={cn('relative w-11 h-7 rounded-full transition-colors shrink-0', anon ? 'bg-emerald-500' : 'bg-white/20')}>
                  <motion.span layout transition={spring.snappy} className={cn('absolute top-0.5 w-6 h-6 rounded-full bg-white shadow', anon ? 'right-0.5' : 'left-0.5')} />
                </span>
              </button>

              <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={!valid} onClick={start} className="w-full py-3 rounded-2xl font-bold bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/25 disabled:opacity-40">
                {quiz ? 'Start the quiz' : 'Start the poll'}
              </motion.button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/** The poll everyone answers, with live results (folds into a small pill). */
export function PollCard({ poll, mod, onVote, onSend }: { poll: PollView; mod: boolean; onVote: (n: number) => void; onSend: (m: PollMsg) => void }) {
  const [folded, setFolded] = useState(false);
  const pct = (i: number) => (poll.counts && poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0);
  const label = poll.quiz ? 'Quick quiz' : 'Poll';
  const answers = `${poll.total} ${poll.total === 1 ? 'answer' : 'answers'}`;
  const status = poll.open
    ? poll.quiz && !mod ? (poll.mine !== null ? 'Answer sent. Results when the quiz ends.' : 'Pick an answer.') : poll.mine === null && !mod ? 'Pick an answer to see the results.' : answers
    : `Ended · ${answers}`;

  return (
    <motion.div key="poll-card" initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={spring.smooth}
      className="absolute z-[25] inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] sm:inset-x-auto sm:left-4 sm:bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:w-[22rem] pointer-events-auto">
      <AnimatePresence mode="wait" initial={false}>
        {folded ? (
          <motion.button key="pill" type="button" onClick={() => { haptic('tap'); setFolded(false); }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.snappy}
            className="inline-flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-[#121830]/95 backdrop-blur-xl border border-fuchsia-400/30 shadow-xl text-sm font-semibold">
            <BarChart3 className="w-4 h-4 text-fuchsia-300" />{label} · {answers}{poll.open && poll.mine === null && !mod && <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse" aria-label="Not answered yet" />}
          </motion.button>
        ) : (
          <motion.section key="card" role="dialog" aria-label={`${label}: ${poll.q}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring.smooth}
            className="max-h-[50vh] overflow-y-auto rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-[11px] font-bold uppercase tracking-wide">{label}</span>
              <span className="flex-1 text-xs text-zinc-400 truncate">from {poll.by}</span>
              <button type="button" onClick={() => setFolded(true)} aria-label="Fold the poll away" className="p-1.5 rounded-full hover:bg-white/10"><ChevronDown className="w-4 h-4" /></button>
              {mod && !poll.open && <button type="button" onClick={() => { haptic('tap'); onSend({ action: 'poll-clear' }); }} aria-label="Remove the poll for everyone" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>}
            </div>
            <p className="font-semibold leading-snug">{poll.q}</p>
            <ul className="space-y-1.5" role="radiogroup" aria-label="Answers">
              {poll.options.map((o, i) => {
                const mine = poll.mine === i;
                const right = poll.correct === i;
                const wrong = poll.quiz && !poll.open && mine && poll.correct !== null && !right;
                return (
                  <li key={i}>
                    <button type="button" role="radio" aria-checked={mine} disabled={!poll.open} onClick={() => { if (!mine) { haptic('tap'); onVote(i); } }}
                      className={cn('relative w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default',
                        right ? 'border-emerald-400/50' : wrong ? 'border-rose-400/50' : mine ? 'border-fuchsia-400/60' : 'border-white/10 hover:border-white/25')}>
                      {poll.counts && <motion.span aria-hidden initial={{ width: 0 }} animate={{ width: `${pct(i)}%` }} transition={spring.smooth} className={cn('absolute inset-y-0 left-0', right ? 'bg-emerald-500/30' : wrong ? 'bg-rose-500/25' : 'bg-gradient-to-r from-indigo-500/35 to-fuchsia-500/30')} />}
                      <span className="relative flex items-center gap-2">
                        <span className="flex-1">{o}</span>
                        {right && <Check className="w-4 h-4 text-emerald-300" strokeWidth={3} aria-label="The right answer" />}
                        {mine && !right && <span className="text-[11px] font-semibold text-fuchsia-200">You</span>}
                        {poll.counts && <span className="tabular-nums text-xs text-zinc-300">{pct(i)}%</span>}
                      </span>
                      {poll.voters?.[i]?.length ? <span className="relative block mt-1 text-[11px] text-zinc-400 truncate">{poll.voters[i].join(', ')}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400" role="status">{status}</p>
              {mod && poll.open && (
                <button type="button" onClick={() => { haptic('tap'); onSend({ action: 'poll-end' }); }} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold shrink-0">{poll.quiz ? 'End & show answer' : 'End poll'}</button>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
