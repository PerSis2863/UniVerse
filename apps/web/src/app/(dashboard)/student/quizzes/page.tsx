'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, PROGRESS_TABS } from '@/components/layout/SectionTabs';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Target,  Clock, CheckCircle2, ChevronRight, BrainCircuit, AlertCircle, Loader2 } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/fetcher';
import { ApiError, api } from '@/lib/api';
import { QuizReview } from '@/components/quizzes/QuizReview';
import { enqueue, isOfflineError, newClientId } from '@/lib/outbox';
import { getPack, type PackQuiz } from '@/lib/offline-packs';
import { AnswerInput, hasAnswer, withShownOrder } from '@/components/quizzes/AnswerInput';
import type { Given } from '@/lib/question-types';
import { Translatable } from '@/components/shared/Translatable';
import type { LevelChoice } from '@/components/shared/ReadingLevel';
import { readingLevel } from '@/lib/display-prefs';
import { AiPolicyNote, AiReceiptChoice, startChoice, type ReceiptChoice } from '@/components/assignments/AiReceipt';
import { isAiPolicy } from '@/lib/ai-receipt';

interface QuizSummary { id: string; title: string; status: string; completed: boolean; score?: number | null; dueDate?: string | null; timeLimit?: number | null; courseId: string; course: { name: string }; _count?: { questions: number } }
/** A quiz being taken: its questions (from the server, or the copy saved for offline use). */
type FullQuiz = PackQuiz & { course?: { name: string } | null; examMode?: boolean; plainWords?: boolean; oneWay?: boolean; hardStop?: boolean; aiPolicy?: string };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuizzesPage() {
  const { data: quizzes = [], isLoading } = useSWR<QuizSummary[]>('/quizzes/student/my-quizzes', fetcher);

  const activeQuizzesList = quizzes.filter((q) => !q.completed && q.status === 'PUBLISHED');
  const completedQuizzesList = quizzes.filter((q) => q.completed);

  const [activeQuiz, setActiveQuiz] = useState<FullQuiz | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Each question's answer as its type takes it (Stage 5 · B4.1): text, or a list.
  const [answers, setAnswers] = useState<Record<string, Given>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [loadingQuizId, setLoadingQuizId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState(0); // when the time limit runs out (ms)

  const seen = useRef({ left: 0, pasted: 0, fullscreenExits: 0 });
  /** The AI receipt they attach when handing in (Stage 5 · Q22), for the quiz's AI rule. */
  const [receipt, setReceipt] = useState<ReceiptChoice>(() => startChoice('FREE'));
  /** Reading level for the questions (the same for all of them; starts at the one in Settings). */
  const [quizLevel, setQuizLevel] = useState<LevelChoice>(readingLevel);

  const startQuiz = async (quizSummary: QuizSummary) => {
    setLoadingQuizId(quizSummary.id);
    try {
      // Offline (upgrade 4): open the copy saved with the course in Courses → Offline, if there is one.
      const fullQuiz: FullQuiz = await api.get<FullQuiz>(`/quizzes/${quizSummary.id}`).then((r) => r.data).catch(async (e) => {
        const saved = isOfflineError(e) ? (await getPack(quizSummary.courseId).catch(() => null))?.quizzes?.find((q) => q.id === quizSummary.id) : null;
        if (!saved) throw e;
        return saved;
      });
      // A quiz whose questions were all taken out has nothing to answer.
      if (!fullQuiz.questions?.length) { toast.error('This quiz has no questions yet. Ask your teacher.'); return; }
      const started = new Date();
      let ends = started.getTime() + (fullQuiz.timeLimit || 30) * 60_000;
      // Exam mode (B4.4): the clock runs on the server from the first start, so reloading doesn't
      // reset it; full screen is asked for, and leaving it, the tab or pasting is noted.
      let resumeAt = 0;
      const policy = isAiPolicy(fullQuiz.aiPolicy) ? fullQuiz.aiPolicy : 'FREE';
      // A quiz that asks for an AI receipt keeps when the student started: the receipt covers the attempt.
      if (!fullQuiz.examMode && policy !== 'FREE') await api.post(`/quizzes/${fullQuiz.id}/start`).catch(() => null);
      if (fullQuiz.examMode) {
        const clock = await api.post<{ endsAt: string | null; done?: string[] }>(`/quizzes/${fullQuiz.id}/start`).then((r) => r.data).catch(() => null);
        if (clock?.endsAt) ends = new Date(clock.endsAt).getTime();
        // One way (B4.3): back after a reload, they go on from the first question not yet passed.
        if (fullQuiz.oneWay && clock?.done?.length) resumeAt = Math.max(0, fullQuiz.questions.findIndex((q) => !clock.done!.includes(q.id)));
        if (fullQuiz.oneWay && clock?.done?.length === fullQuiz.questions.length) resumeAt = fullQuiz.questions.length - 1;
        seen.current = { left: 0, pasted: 0, fullscreenExits: 0 };
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      setStartedAt(started.toISOString());
      setReceipt(startChoice(policy));
      setActiveQuiz(fullQuiz);
      setCurrentQ(resumeAt);
      setAnswers({});
      setTimeLeft(Math.max(0, Math.round((ends - started.getTime()) / 1000))); // the countdown corrects it each second
      setEndsAt(ends);
      setSubmitted(false);
      setShowResults(false);
      setConfirming(false);
    } catch {
      toast.error('Failed to load quiz');
    } finally {
      setLoadingQuizId(null);
    }
  };

  /** `timeUp`: handed in by itself at zero, maybe before they chose what goes on their AI receipt. */
  const submitQuiz = async (timeUp = false) => {
    if (!activeQuiz) return;
    const finalAnswers = withShownOrder(activeQuiz.questions, answers);

    try {
      const res = await api.post(`/quizzes/${activeQuiz.id}/submit`, { answers: finalAnswers, aiReceipt: receipt, ...(timeUp ? { timeUp: true } : {}), ...(activeQuiz.examMode ? { integrity: seen.current } : {}) });
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      const result = res.data;
      const pct = Math.round((result.score / (result.maxScore || 100)) * 100);
      setScore(pct);
      setSubmitted(true);
      setShowResults(true);
      toast.success(`Quiz submitted! You scored ${pct}%`);
      mutate('/quizzes/student/my-quizzes');
    } catch (e) {
      if (!isOfflineError(e)) { toast.error((e as Error).message || 'Failed to submit quiz'); return; }
      // No connection: keep the answers on this device and send them when it's back (upgrade 4).
      const id = newClientId();
      await enqueue({
        id, kind: 'quiz', method: 'POST', url: `/api/core/quizzes/${encodeURIComponent(activeQuiz.id)}/submit`, ref: activeQuiz.id, label: `Quiz: ${activeQuiz.title}`,
        body: { answers: finalAnswers, offline: { clientId: id, startedAt, finishedAt: new Date().toISOString() } },
      }).catch(() => null);
      setSubmitted(true);
      setActiveQuiz(null);
      toast.success('You’re offline: your answers are saved on this device and sent when you’re back online.');
    }
  };

  // The countdown runs against the clock (a background tab's timers can be slowed down), and
  // submits by itself when time is up.
  const submitRef = useRef(submitQuiz);
  useEffect(() => { submitRef.current = submitQuiz; });
  useEffect(() => {
    if (!activeQuiz || submitted) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) { clearInterval(timer); void submitRef.current(true); }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeQuiz, submitted, endsAt]);

  // Exam mode: what's noted for the teacher while the quiz is open.
  useEffect(() => {
    if (!activeQuiz?.examMode || submitted) return;
    const onHide = () => { if (document.visibilityState === 'hidden') seen.current.left++; };
    const onPaste = () => { seen.current.pasted++; };
    const onFull = () => { if (!document.fullscreenElement) seen.current.fullscreenExits++; };
    document.addEventListener('visibilitychange', onHide);
    document.addEventListener('paste', onPaste);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, [activeQuiz, submitted]);

  const [saving, setSaving] = useState(false);
  const nextQuestion = async () => {
    if (!activeQuiz) return;
    if (currentQ >= activeQuiz.questions.length - 1) { setConfirming(true); return; }
    // One-way exams (B4.3): the answer is saved on the server before moving on, for good.
    if (activeQuiz.examMode && activeQuiz.oneWay) {
      const q = activeQuiz.questions[currentQ];
      setSaving(true);
      try { await api.post(`/quizzes/${activeQuiz.id}/answer`, { questionId: q.id, answer: answers[q.id] ?? '' }); }
      catch (e) { if (!(e instanceof ApiError && e.status === 409)) { toast.error((e as Error).message || 'Your answer couldn’t be saved. Try again.'); return; } }
      finally { setSaving(false); }
    }
    setCurrentQ((q) => q + 1);
  };
  const answeredCount = activeQuiz ? activeQuiz.questions.filter((q) => hasAnswer(answers[q.id])).length : 0;

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const avgScore = completedQuizzesList.length > 0 
    ? Math.round(completedQuizzesList.reduce((acc, q) => acc + (q.score || 0), 0) / completedQuizzesList.length)
    : 0;

  return (
    <>
      <Topbar title="My Quizzes" subtitle="Test your knowledge and track your performance." />
      <SectionTabs tabs={PROGRESS_TABS} />
      <div className="flex-1 p-4 sm:p-8 space-y-8 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Average Score" value={`${avgScore}%`} icon={Target} color="emerald" />
          <KpiCard title="Quizzes Completed" value={completedQuizzesList.length.toString()} icon={CheckCircle2} color="indigo" />
          <KpiCard title="Active Quizzes" value={activeQuizzesList.length.toString()} icon={Clock} color="amber" />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
             <ContentSkeleton variant="grid" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <BrainCircuit className="w-6 h-6 text-indigo-500" /> Active Quizzes
              </h2>
              {activeQuizzesList.length === 0 ? (
                <div className="text-zinc-500 text-sm">No active quizzes right now.</div>
              ) : (
                <div className="space-y-4">
                  {activeQuizzesList.map((quiz, i) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.03 }}
                      key={quiz.id}
                      className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
                    >
                      <div className={`absolute top-0 end-0 w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full blur-3xl opacity-10 -me-16 -mt-16`} />
                      <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                          <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">{quiz.course.name}</div>
                          <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{quiz.title}</h3>
                        </div>
                        {quiz.dueDate && (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Due {new Date(quiz.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400 mb-6 relative z-10 flex-wrap">
                        <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {quiz.timeLimit || '-'} mins</div>
                        <div className="flex items-center gap-1.5"><Target className="w-4 h-4" /> {quiz._count?.questions || 0} Questions</div>
                      </div>
                      <button 
                        onClick={() => startQuiz(quiz)} 
                        aria-busy={loadingQuizId === quiz.id || undefined} disabled={loadingQuizId === quiz.id}
                        className="w-full btn-primary py-2.5 flex justify-center items-center gap-2 relative z-10 disabled:opacity-70"
                      >
                        {loadingQuizId === quiz.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                        ) : (
                          <>Start Quiz <ChevronRight className="w-4 h-4" /></>
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Recent Results
              </h2>
              {completedQuizzesList.length === 0 ? (
                <div className="text-zinc-500 text-sm">No completed quizzes yet.</div>
              ) : (
                <div className="card space-y-2">
                  {(showAllResults ? completedQuizzesList : completedQuizzesList.slice(0, 3)).map((quiz, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 6) * 0.03 }}
                      key={quiz.id}
                      className="p-4 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors flex items-center justify-between border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.04] cursor-pointer"
                      role="button" tabIndex={0}
                      onClick={() => setReviewing(quiz.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setReviewing(quiz.id); } }}
                    >
                      <div>
                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{quiz.title}</h4>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{quiz.course.name}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-end">
                          <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">{quiz.score ?? '-'}%</div>
                          <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Score</div>
                        </div>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {completedQuizzesList.length > 3 && (
                    <button className="w-full mt-4 py-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex justify-center items-center gap-1 transition-all" onClick={() => setShowAllResults(!showAllResults)}>
                      {showAllResults ? 'Hide results' : 'View all results'} <ChevronRight className={`w-4 h-4 transition-transform ${showAllResults ? 'rotate-90' : ''}`} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quiz Modal */}
      <AnimatePresence>
        {activeQuiz && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
                <div>
                  <div className="text-xs text-zinc-500 font-medium">{activeQuiz.course?.name}</div>
                  <div className="font-bold text-zinc-900 dark:text-white">{activeQuiz.title}</div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono font-bold text-sm ${timeLeft < 60 ? 'bg-rose-500/10 text-rose-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>
                  <Clock className="w-4 h-4" /> {formatTime(timeLeft)}
                </div>
              </div>

              {showResults ? (
                <div className="p-8 text-center">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl font-black ${score >= 70 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {score}%
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{score >= 70 ? '🎉 Well done!' : '📚 Keep studying!'}</h3>
                  <p className="text-zinc-500 text-sm mb-6">
                    Quiz submitted successfully.
                  </p>
                  <button onClick={() => setActiveQuiz(null)} className="btn-primary px-8 py-2.5">Close</button>
                </div>
              ) : confirming ? (
                <div className="p-6 sm:p-8 text-center max-h-[75vh] overflow-y-auto">
                  <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Submit Quiz?</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                    You’ve answered {answeredCount} of {activeQuiz.questions.length} questions.
                    Are you sure you want to submit?
                  </p>
                  {/* AI receipt (Stage 5 · Q22): attached, declined or "no AI", by the quiz's rule. */}
                  {(activeQuiz.aiPolicy ?? 'FREE') !== 'FREE' && (
                    <div className="text-start mb-6"><AiReceiptChoice previewUrl={`/api/core/quizzes/${activeQuiz.id}/ai-receipt`} policy={activeQuiz.aiPolicy ?? 'FREE'} value={receipt} onChange={setReceipt} what="quiz" /></div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setConfirming(false)} className="flex-1 btn-secondary py-2.5 text-sm">Go Back</button>
                    <button onClick={() => void submitQuiz()} className="flex-1 btn-primary py-2.5 text-sm">Submit</button>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  {(activeQuiz.aiPolicy ?? 'FREE') !== 'FREE' && <AiPolicyNote policy={activeQuiz.aiPolicy ?? 'FREE'} className="mb-4 text-xs" />}
                  {activeQuiz.examMode && (
                    <p role="note" className="mb-4 text-xs rounded-xl px-3 py-2 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                      Exam mode: the time limit runs on the server. Your teacher sees how often you left this page, pasted or left full screen. Nothing else is recorded.
                      {activeQuiz.oneWay && ' One question at a time: once you go on, you can’t go back to a question.'}
                      {activeQuiz.hardStop && ' When the time is up, no more answers are taken.'}
                    </p>
                  )}
                  {/* Progress */}
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    <span>Question {currentQ + 1} of {activeQuiz.questions.length}</span>
                    <span>{answeredCount} answered</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 mb-6 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${((currentQ + 1) / activeQuiz.questions.length) * 100}%` }} />
                  </div>
                  {activeQuiz.plainWords !== false ? (
                    // Reading help (Stage 5 · D9), unless the teacher turned it off: the question in
                    // simpler words or the student's language, and read aloud with its answers.
                    <div className="mb-5">
                      <Translatable
                        key={activeQuiz.questions[currentQ].id} kind="quiz-question" id={activeQuiz.questions[currentQ].id} text={activeQuiz.questions[currentQ].question}
                        levels={{ level: quizLevel, onLevel: setQuizLevel, also: activeQuiz.questions.slice(currentQ + 1, currentQ + 6).map((x) => x.id) }}
                        speakExtra={activeQuiz.questions[currentQ].options.map((o, i) => `${LETTERS[i] ?? ''}. ${o}`).join('. ')}
                        render={(t, lang) => <h3 lang={lang} className="text-lg font-bold text-zinc-900 dark:text-white">{t}</h3>}
                      />
                    </div>
                  ) : <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-5">{activeQuiz.questions[currentQ].question}</h3>}
                  <div className="mb-6">
                    <AnswerInput
                      key={activeQuiz.questions[currentQ].id}
                      q={activeQuiz.questions[currentQ]}
                      label={`Your answer to question ${currentQ + 1}`}
                      value={answers[activeQuiz.questions[currentQ].id]}
                      onChange={(v) => setAnswers((a) => ({ ...a, [activeQuiz.questions[currentQ].id]: v }))}
                    />
                  </div>
                  <div className="flex gap-3 mt-8">
                    <button onClick={() => void nextQuestion()} disabled={saving} aria-busy={saving || undefined} className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                      {currentQ < activeQuiz.questions.length - 1 ? 'Next Question' : 'Finish'} <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {reviewing && <QuizReview quizId={reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
}
