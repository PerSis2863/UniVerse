'use client';
import { Topbar } from '@/components/layout/Topbar';
import { HelpCircle, Clock, PlayCircle, Trophy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const res = await api.get('/quizzes/student/my-quizzes');
      setQuizzes(res.data);
    } catch (error) {
      toast.error('Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (id: string) => {
    toast.success('Quiz started! Good luck.');
    // Simulate answering some questions and submitting
    setTimeout(async () => {
      try {
        const answers = {}; // Mock answers
        const res = await api.post(`/quizzes/${id}/submit`, { answers });
        toast.info(`Quiz completed! Score: ${res.data.score}/${res.data.maxScore}`);
        fetchQuizzes(); // Refresh the list
      } catch (error) {
        toast.error('Failed to submit quiz');
      }
    }, 2000);
  };

  return (
    <>
      <Topbar title="Quizzes & Assessments" subtitle="Test your knowledge and track your progress" />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl p-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Pending Quizzes</h3>
                <p className="text-indigo-200 text-sm">You have {quizzes.filter(q => !q.completed).length} quizzes to complete.</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300">
                <HelpCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl p-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Average Score</h3>
                <p className="text-emerald-200 text-sm">Keep up the great work!</p>
              </div>
              <div className="flex items-baseline gap-1 text-emerald-300">
                <span className="text-3xl font-bold">88</span>
                <span className="text-lg">%</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Available Quizzes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.filter(q => !q.completed).map((quiz) => (
                <div key={quiz.id} className="card p-6 flex flex-col hover:border-indigo-500/50 transition-colors group">
                  <div className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 w-max mb-4">
                    {quiz.course?.name || 'General'}
                  </div>
                  <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{quiz.title}</h4>
                  <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                    <span className="flex items-center gap-1.5"><Clock className="w-4 h-4"/> {quiz.duration} mins</span>
                    <span className="flex items-center gap-1.5"><HelpCircle className="w-4 h-4"/> {quiz._count?.questions || 0} Questions</span>
                  </div>
                  <button 
                    onClick={() => startQuiz(quiz.id)}
                    className="mt-auto w-full py-2.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:bg-white/10 text-zinc-900 dark:text-white rounded-lg flex items-center justify-center gap-2 transition-colors border border-zinc-200 dark:border-white/10 group-hover:bg-indigo-600 group-hover:border-indigo-500 font-medium"
                  >
                    <PlayCircle className="w-4 h-4" /> Start Quiz
                  </button>
                </div>
              ))}
              {quizzes.filter(q => !q.completed).length === 0 && (
                <div className="col-span-full py-8 text-center text-zinc-500 dark:text-zinc-500 card">
                  No pending quizzes right now.
                </div>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Completed Quizzes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {quizzes.filter(q => q.completed).map((quiz) => (
                <div key={quiz.id} className="card p-5 flex items-center justify-between">
                  <div>
                    <div className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 mb-2">
                      {quiz.course?.name || 'General'}
                    </div>
                    <h4 className="text-md font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      {quiz.title}
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </h4>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">Score</div>
                      <div className={`text-xl font-bold ${quiz.score && quiz.score >= 90 ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {quiz.score}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
