'use client';

import { useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Loader2, Mic, MicOff, MessagesSquare, Sparkles, Trash2, Volume2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, INTERNSHIP_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { STAR_NAMES, wordCount } from '@/lib/careers';
import { fadeUp, list, spring } from '@/lib/motion';
import { captionsSupported, useCaptions } from '@/lib/use-captions';
import { cn } from '@/lib/utils';

// Stage 5 · Q15: practise interview questions for a role. Type or say an answer; checks that need
// no AI (filler words, the STAR parts, length) run every time, and AI feedback comes when it's on.

interface Checks { words: number; minutes: number; fillers: { total: number; top: { word: string; n: number }[] }; star: string; length: string | null }
interface Feedback { score: number; strengths: string[]; improve: string[]; outline: string }
interface Result { id: string; checks: Checks; feedback: Feedback | null; note: string | null }
interface Past { id: string; role: string; question: string; fillers: number; star: string; score: number | null; createdAt: string }
interface Tracked { id: string; title: string; company: string }

const HISTORY = '/api/careers/interview';
const noop = () => () => {};

function StarChips({ star }: { star: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="STAR parts">
      {(['S', 'T', 'A', 'R'] as const).map((k) => {
        const has = star.includes(k);
        return (
          <li key={k} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', has ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400')}>
            {has ? <Check className="w-3.5 h-3.5" aria-hidden /> : <span aria-hidden className="w-3.5 text-center">–</span>}
            {STAR_NAMES[k]}<span className="sr-only">{has ? ': there' : ': missing'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function InterviewPracticePage() {
  const [role, setRole] = useState('');
  const [set, setSet] = useState<{ role: string; questions: string[]; ai: boolean; note?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState(0);
  const [answer, setAnswer] = useState('');
  const [hearing, setHearing] = useState('');
  const [dictating, setDictating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const canDictate = useSyncExternalStore(noop, captionsSupported, () => false);
  const history = useSWR<{ answers: Past[] }>(HISTORY, authedJson);
  const tracked = useSWR<Tracked[]>('/api/careers/applications', authedJson);

  useCaptions(dictating, (text, final) => {
    if (final) { setAnswer((a) => `${a}${a && !/\s$/.test(a) ? ' ' : ''}${text.trim()}`); setHearing(''); }
    else setHearing(text);
  }, (why) => { setDictating(false); setHearing(''); toast.error(why || 'Dictation stopped.'); });

  const getQuestions = async (r = role) => {
    if (r.trim().length < 2) { toast.error('Say which role you’re practising for.'); return; }
    setAsking(true);
    try {
      const out = await authedJson<{ role: string; questions: string[]; ai: boolean; note?: string }>(HISTORY, { method: 'POST', body: JSON.stringify({ action: 'questions', role: r.trim() }) });
      setSet(out); setQ(0); setAnswer(''); setResult(null);
      if (out.note) toast(out.note);
    } catch (e) { toast.error((e as Error).message); }
    finally { setAsking(false); }
  };
  const getFeedback = async () => {
    if (!set) return;
    setDictating(false);
    setChecking(true);
    try {
      const out = await authedJson<Result>(HISTORY, { method: 'POST', body: JSON.stringify({ action: 'feedback', role: set.role, question: set.questions[q], answer }) });
      setResult(out);
      void history.mutate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setChecking(false); }
  };
  const forget = async (id?: string) => {
    if (!id && !(await confirmDialog({ title: 'Clear your practice history?', message: 'Your saved answers and their feedback are removed.', confirmLabel: 'Clear', destructive: true }))) return;
    try {
      const out = await authedJson<{ answers: Past[] }>(`${HISTORY}?${id ? `id=${encodeURIComponent(id)}` : 'all=1'}`, { method: 'DELETE' });
      await history.mutate(out?.answers ? out : undefined);
    } catch (e) { toast.error((e as Error).message); }
  };

  const words = wordCount(answer);
  const roles = [...new Set((Array.isArray(tracked.data) ? tracked.data : []).map((t) => t.title))].slice(0, 12);
  const past = history.data?.answers ?? [];

  return (
    <>
      <Topbar title="Internships" subtitle="Practise interview questions and get feedback" />
      <SectionTabs tabs={INTERNSHIP_TABS} />
      <div className="flex-1 overflow-y-auto">
        <motion.div variants={list} initial="hidden" animate="show" className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-5">
          <motion.section variants={fadeUp} className="panel p-4 sm:p-5" aria-labelledby="role-h">
            <h2 id="role-h" className="font-bold text-zinc-900 dark:text-white">What are you interviewing for?</h2>
            <form className="mt-3 flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); void getQuestions(); }}>
              <input className="input flex-1" aria-label="Role" list="tracked-roles" maxLength={120} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Software engineering intern" />
              <datalist id="tracked-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
              <button type="submit" className="btn-primary" disabled={asking}>{asking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />} Get questions</button>
            </form>
            {roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs text-zinc-500 self-center">From your tracker:</span>
                {roles.slice(0, 4).map((r) => <button key={r} type="button" className="rounded-full px-2.5 py-1 text-xs font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10" onClick={() => { setRole(r); void getQuestions(r); }}>{r}</button>)}
              </div>
            )}
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
              <Volume2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span>Want to practise speaking with follow-up questions? Try the <Link href="/student/oral-practice" className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2">voice coach</Link> and pick Interview.</span>
            </p>
          </motion.section>

          {set && (
            <motion.section variants={fadeUp} initial="hidden" animate="show" className="panel p-4 sm:p-5 space-y-4" aria-labelledby="q-h">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="q-h" className="font-bold text-zinc-900 dark:text-white min-w-0 break-words">Questions for {set.role}</h2>
                <span className="text-xs text-zinc-500">{set.ai ? 'Written by AI for this role' : 'Common questions (AI is off)'}</span>
              </div>
              <ol className="space-y-1.5">
                {set.questions.map((text, i) => (
                  <li key={text}>
                    <button type="button" aria-pressed={q === i} onClick={() => { setQ(i); setResult(null); }}
                      className={cn('w-full text-start rounded-2xl px-3 py-2.5 text-sm transition-colors flex gap-2', q === i ? 'bg-indigo-500/10 text-zinc-900 dark:text-white ring-1 ring-indigo-500/40' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
                      <span className="tabular-nums text-zinc-500 shrink-0">{i + 1}.</span><span className="min-w-0 break-words">{text}</span>
                    </button>
                  </li>
                ))}
              </ol>

              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label htmlFor="answer" className="label">Your answer</label>
                  <span className="text-xs text-zinc-500 tabular-nums">{words} words · about {Math.max(0, Math.round((words / 130) * 10) / 10)} min spoken</span>
                </div>
                <textarea id="answer" className="input min-h-[160px]" maxLength={4000} value={answer} onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Answer as you would out loud. For “tell me about a time…”, use STAR: the situation, your task, what you did, and the result." />
                <AnimatePresence>
                  {dictating && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} className="mt-1 text-sm text-zinc-500 italic" aria-live="polite">
                      {hearing || 'Listening…'}
                    </motion.p>
                  )}
                </AnimatePresence>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canDictate && (
                    <button type="button" className={dictating ? 'btn-danger' : 'btn-secondary'} aria-pressed={dictating} onClick={() => { setDictating((v) => !v); setHearing(''); }}>
                      {dictating ? <MicOff className="w-4 h-4" aria-hidden /> : <Mic className="w-4 h-4" aria-hidden />} {dictating ? 'Stop' : 'Say it'}
                    </button>
                  )}
                  <button type="button" className="btn-primary" disabled={checking || words < 15} onClick={getFeedback}>{checking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />} Check my answer</button>
                  {words > 0 && words < 15 && <span className="text-xs text-zinc-500">A few sentences first</span>}
                </div>
              </div>

              {result && (
                <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4 border-t border-zinc-200 dark:border-white/10 pt-4" aria-live="polite">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3">
                      <p className="text-xs font-semibold text-zinc-500">Length</p>
                      <p className="mt-0.5 font-bold text-zinc-900 dark:text-white tabular-nums">{result.checks.words} words · ~{result.checks.minutes} min</p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{result.checks.length ?? 'A good length.'}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3">
                      <p className="text-xs font-semibold text-zinc-500">Filler words</p>
                      <p className="mt-0.5 font-bold text-zinc-900 dark:text-white tabular-nums">{result.checks.fillers.total}</p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{result.checks.fillers.top.length ? result.checks.fillers.top.map((f) => `“${f.word}” ×${f.n}`).join(', ') : 'None. Nice and clear.'}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3">
                      <p className="text-xs font-semibold text-zinc-500 mb-1.5">Structure</p>
                      <StarChips star={result.checks.star} />
                    </div>
                  </div>
                  {result.feedback ? (
                    <div className="space-y-3">
                      <p className="font-bold text-zinc-900 dark:text-white">AI feedback · <span className="tabular-nums">{result.feedback.score}/5</span></p>
                      {result.feedback.strengths.length > 0 && (
                        <div><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Strengths</p><ul className="mt-1 list-disc ps-5 text-sm text-zinc-700 dark:text-zinc-200 space-y-1">{result.feedback.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
                      )}
                      {result.feedback.improve.length > 0 && (
                        <div><p className="text-xs font-semibold text-amber-800 dark:text-amber-300">To improve</p><ul className="mt-1 list-disc ps-5 text-sm text-zinc-700 dark:text-zinc-200 space-y-1">{result.feedback.improve.map((s) => <li key={s}>{s}</li>)}</ul></div>
                      )}
                      {result.feedback.outline && (
                        <div><p className="text-xs font-semibold text-zinc-500">A stronger answer could go</p><p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line rounded-2xl bg-indigo-500/[0.06] p-3">{result.feedback.outline}</p></div>
                      )}
                    </div>
                  ) : result.note ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{result.note}</p> : null}
                </motion.div>
              )}
            </motion.section>
          )}

          <motion.section variants={fadeUp} className="panel p-4 sm:p-5" aria-labelledby="past-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="past-h" className="font-bold text-zinc-900 dark:text-white">Your recent practice</h2>
              {past.length > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => forget()}>Clear all</button>}
            </div>
            {history.isLoading ? <div className="skeleton h-16 mt-3 rounded-2xl" /> : past.length ? (
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
                {past.map((p) => (
                  <li key={p.id} className="py-2.5 flex items-start gap-3">
                    <MessagesSquare className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-900 dark:text-white break-words">{p.question}</p>
                      <p className="text-xs text-zinc-500 break-words">{p.role} · {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {p.fillers} filler{p.fillers === 1 ? '' : 's'} · {p.star.length}/4 STAR parts{p.score ? ` · ${p.score}/5` : ''}</p>
                    </div>
                    <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Remove practice answer: ${p.question}`} onClick={() => forget(p.id)}><Trash2 className="w-4 h-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Answers you check are kept here so you can see yourself improve. Only you see them.</p>}
          </motion.section>
        </motion.div>
      </div>
    </>
  );
}
