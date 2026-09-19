'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Target, Trophy, Clock, CheckCircle2, ChevronRight, BrainCircuit, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const activeQuizzes = [
  {
    id: 1, title: 'Network Protocols & OSI Model', course: 'Computer Networks', timeLimit: 45, due: 'Today, 11:59 PM', questions: [
      { q: 'What does OSI stand for?', options: ['Open Systems Interconnection', 'Open Standard Interface', 'Optical Signal Interface', 'Ordered System Integration'], answer: 0 },
      { q: 'Which layer is responsible for routing?', options: ['Data Link', 'Network', 'Transport', 'Session'], answer: 1 },
      { q: 'What protocol operates at Layer 4?', options: ['IP', 'Ethernet', 'TCP', 'HTTP'], answer: 2 },
    ],
    color: 'from-amber-500 to-orange-500'
  },
  {
    id: 2, title: 'Process Synchronization', course: 'Operating Systems', timeLimit: 60, due: 'Tomorrow, 5:00 PM', questions: [
      { q: 'What is a deadlock?', options: ['A process waiting indefinitely', 'A circular wait among processes', 'CPU starvation', 'All of the above'], answer: 3 },
      { q: 'Which of these prevents deadlock?', options: ['Mutual exclusion', 'Hold and wait', 'Resource preemption', 'Circular wait'], answer: 2 },
    ],
    color: 'from-fuchsia-500 to-pink-500'
  },
];

const completedQuizzes = [
  { id: 3, title: 'Graph Algorithms', course: 'Data Structures', score: 92, date: 'Sept 15, 2026' },
  { id: 4, title: 'SQL Joins & Indexing', course: 'Database Management', score: 88, date: 'Sept 10, 2026' },
  { id: 5, title: 'Memory Management', course: 'Operating Systems', score: 95, date: 'Sept 02, 2026' },
];

export default function QuizzesPage() {
  const [activeQuiz, setActiveQuiz] = useState<typeof activeQuizzes[0] | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const startQuiz = (quiz: typeof activeQuizzes[0]) => {
    setActiveQuiz(quiz);
    setCurrentQ(0);
    setSelected(null);
    setAnswers(new Array(quiz.questions.length).fill(null));
    setTimeLeft(quiz.timeLimit * 60);
    setSubmitted(false);
    setShowResults(false);
    setConfirming(false);
  };

  const submitQuiz = useCallback(() => {
    if (!activeQuiz) return;
    const finalAnswers = [...answers];
    if (selected !== null) finalAnswers[currentQ] = selected;
    const correct = finalAnswers.filter((a, i) => a === activeQuiz.questions[i].answer).length;
    const pct = Math.round((correct / activeQuiz.questions.length) * 100);
    setScore(pct);
    setSubmitted(true);
    setShowResults(true);
    toast.success(`Quiz submitted! You scored ${pct}%`, { description: `${correct}/${activeQuiz.questions.length} correct answers` });
  }, [activeQuiz, answers, currentQ, selected]);

  useEffect(() => {
    if (!activeQuiz || submitted) return;
    if (timeLeft <= 0) { submitQuiz(); return; }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [activeQuiz, submitted, timeLeft, submitQuiz]);

  const nextQuestion = () => {
    if (selected !== null) {
      const newAnswers = [...answers];
      newAnswers[currentQ] = selected;
      setAnswers(newAnswers);
    }
    if (currentQ < (activeQuiz?.questions.length ?? 0) - 1) {
      setCurrentQ(q => q + 1);
      setSelected(answers[currentQ + 1]);
    } else {
      setConfirming(true);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <>
      <Topbar title="My Quizzes" subtitle="Test your knowledge and track your performance." />
      <div className="flex-1 p-4 sm:p-8 space-y-8 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Average Score" value="91.6%" icon={Target} change={2.4} color="emerald" />
          <KpiCard title="Quizzes Completed" value="12" icon={CheckCircle2} color="indigo" />
          <KpiCard title="Highest Streak" value="5 Quizzes" icon={Trophy} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-indigo-500" /> Active Quizzes
            </h2>
            <div className="space-y-4">
              {activeQuizzes.map((quiz, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  key={quiz.id}
                  className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${quiz.color} rounded-full blur-3xl opacity-10 -mr-16 -mt-16`} />
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div>
                      <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">{quiz.course}</div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{quiz.title}</h3>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Due {quiz.due}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400 mb-6 relative z-10">
                    <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {quiz.timeLimit} mins</div>
                    <div className="flex items-center gap-1.5"><Target className="w-4 h-4" /> {quiz.questions.length} Questions</div>
                  </div>
                  <button onClick={() => startQuiz(quiz)} className="w-full btn-primary py-2.5 flex justify-center items-center gap-2 relative z-10">
                    Start Quiz <ChevronRight className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Recent Results
            </h2>
            <div className="card space-y-2">
              {completedQuizzes.map((quiz, i) => (
                <motion.div
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  key={quiz.id}
                  className="p-4 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors flex items-center justify-between border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.04] cursor-pointer"
                  onClick={() => toast.info(`${quiz.title}: ${quiz.score}% on ${quiz.date}`)}
                >
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{quiz.title}</h4>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{quiz.course} • {quiz.date}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">{quiz.score}%</div>
                      <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Score</div>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </motion.div>
              ))}
              <button className="w-full mt-4 py-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex justify-center items-center gap-1" onClick={() => toast.info('Loading full results history...')}>
                View all results <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
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
                  <div className="text-xs text-zinc-500 font-medium">{activeQuiz.course}</div>
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
                    You answered {answers.filter((a, i) => a === activeQuiz.questions[i].answer).length} out of {activeQuiz.questions.length} questions correctly.
                  </p>
                  <button onClick={() => setActiveQuiz(null)} className="btn-primary px-8 py-2.5">Close</button>
                </div>
              ) : confirming ? (
                <div className="p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Submit Quiz?</h3>
                  <p className="text-sm text-zinc-500 mb-6">
                    You've answered {answers.filter(a => a !== null).length} of {activeQuiz.questions.length} questions.
                    Are you sure you want to submit?
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setConfirming(false)} className="flex-1 btn-secondary py-2.5 text-sm">Go Back</button>
                    <button onClick={submitQuiz} className="flex-1 btn-primary py-2.5 text-sm">Submit</button>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  {/* Progress */}
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                    <span>Question {currentQ + 1} of {activeQuiz.questions.length}</span>
                    <span>{answers.filter(a => a !== null).length} answered</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 mb-6 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${((currentQ + 1) / activeQuiz.questions.length) * 100}%` }} />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-5">{activeQuiz.questions[currentQ].q}</h3>
                  <div className="space-y-3 mb-6">
                    {activeQuiz.questions[currentQ].options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setSelected(i)}
                        className={`w-full text-left p-4 rounded-xl border transition-all text-sm font-medium ${
                          selected === i
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-indigo-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span className="font-bold mr-2">{['A', 'B', 'C', 'D'][i]}.</span> {opt}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setActiveQuiz(null)} className="btn-secondary py-2.5 text-sm flex items-center gap-2">
                      <X className="w-4 h-4" /> Exit
                    </button>
                    <button onClick={nextQuestion} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                      {currentQ < activeQuiz.questions.length - 1 ? 'Next Question' : 'Finish'} <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
