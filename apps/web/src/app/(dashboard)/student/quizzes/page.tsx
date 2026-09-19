'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Target, Trophy, Clock, CheckCircle2, ChevronRight, BrainCircuit } from 'lucide-react';
import { motion } from 'framer-motion';

const activeQuizzes = [
  { id: 1, title: 'Network Protocols & OSI Model', course: 'Computer Networks', timeLimit: '45 mins', due: 'Today, 11:59 PM', questions: 30, color: 'from-amber-500 to-orange-500' },
  { id: 2, title: 'Process Synchronization', course: 'Operating Systems', timeLimit: '60 mins', due: 'Tomorrow, 5:00 PM', questions: 25, color: 'from-fuchsia-500 to-pink-500' },
];

const completedQuizzes = [
  { id: 3, title: 'Graph Algorithms', course: 'Data Structures', score: 92, date: 'Sept 15, 2026' },
  { id: 4, title: 'SQL Joins & Indexing', course: 'Database Management', score: 88, date: 'Sept 10, 2026' },
  { id: 5, title: 'Memory Management', course: 'Operating Systems', score: 95, date: 'Sept 02, 2026' },
];

export default function QuizzesPage() {
  return (
    <>
      <Topbar title="My Quizzes" subtitle="Test your knowledge and track your performance." />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Average Score" value="91.6%" icon={Target} change={2.4} color="emerald" />
          <KpiCard title="Quizzes Completed" value="12" icon={CheckCircle2} color="indigo" />
          <KpiCard title="Highest Streak" value="5 Quizzes" icon={Trophy} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Active Quizzes */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-indigo-500" /> Active Quizzes
            </h2>
            
            <div className="space-y-4">
              {activeQuizzes.map((quiz, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={quiz.id}
                  className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.06] rounded-2xl p-6 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${quiz.color} rounded-full blur-3xl opacity-10 -mr-16 -mt-16`} />
                  
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div>
                      <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">{quiz.course}</div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {quiz.title}
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      Due {quiz.due}
                    </span>
                  </div>

                  <div className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400 mb-6 relative z-10">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> {quiz.timeLimit}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Target className="w-4 h-4" /> {quiz.questions} Questions
                    </div>
                  </div>

                  <button className="w-full btn-primary py-2.5 flex justify-center items-center gap-2 relative z-10">
                    Start Quiz <ChevronRight className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Completed Quizzes */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Recent Results
            </h2>
            
            <div className="card space-y-2">
              {completedQuizzes.map((quiz, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={quiz.id}
                  className="p-4 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors flex items-center justify-between border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.04]"
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
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
              
              <button className="w-full mt-4 py-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex justify-center items-center gap-1">
                View all results <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
