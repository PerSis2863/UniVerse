'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { useAuthStore } from '@/store/auth';
import { Users, BookOpen, FileText, BarChart3, X, Plus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useState } from 'react';

const recentStudents = [
  { name: 'Aditya Bhatt', course: 'Data Structures', score: 94, status: 'excellent' },
  { name: 'Priya Sharma', course: 'Algorithms', score: 87, status: 'good' },
  { name: 'Rahul Kumar', course: 'Database', score: 72, status: 'needs-help' },
  { name: 'Sneha Patel', course: 'OS', score: 91, status: 'excellent' },
];

const myCourses = [
  { name: 'Data Structures', code: 'CS301', students: 45, completion: 68, color: '#6366f1' },
  { name: 'Algorithms', code: 'CS302', students: 38, completion: 52, color: '#06b6d4' },
  { name: 'Database Management', code: 'CS401', students: 52, completion: 80, color: '#10b981' },
];

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseCapacity, setCourseCapacity] = useState('40');
  const [courseDesc, setCourseDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateCourse = async () => {
    if (!courseName || !courseCode) {
      toast.error('Please fill in the course name and code.');
      return;
    }
    setCreating(true);
    await new Promise(r => setTimeout(r, 1200));
    setCreating(false);
    setShowCourseModal(false);
    setCourseName(''); setCourseCode(''); setCourseCapacity('40'); setCourseDesc('');
    toast.success(`Course "${courseName}" created!`, { description: `Code: ${courseCode} • Capacity: ${courseCapacity} students` });
  };

  return (
    <>
      <Topbar
        title="Teacher Dashboard"
        subtitle={`${greeting}, ${user?.name?.split(' ')[0] ?? 'Professor'}! 👋`}
        action={{ label: 'New Course', onClick: () => setShowCourseModal(true) }}
      />
      <div className="flex-1 p-4 sm:p-8 space-y-8 overflow-y-auto">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Total Students" value="135" icon={Users} change={8} color="indigo" />
          <KpiCard title="Active Courses" value="3" icon={BookOpen} change={0} color="cyan" />
          <KpiCard title="Pending Grades" value="12" icon={FileText} change={-25} color="amber" />
          <KpiCard title="Avg. Class Score" value="84.2%" icon={BarChart3} change={3} color="green" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* My Courses */}
          <div className="xl:col-span-2 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">My Courses</h2>
              <button onClick={() => setShowCourseModal(true)} className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                <Plus className="w-3.5 h-3.5" /> Add Course
              </button>
            </div>
            <div className="space-y-4">
              {myCourses.map((c, i) => (
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  key={i}
                  className="p-4 rounded-xl bg-white/[0.03] border border-zinc-100 dark:border-white/[0.06] hover:border-indigo-500/20 transition-all cursor-pointer group"
                  onClick={() => toast.info(`Opening ${c.name}...`)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${c.color}20` }}>📚</div>
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{c.name}</div>
                        <div className="text-xs text-zinc-500">{c.code} • {c.students} students</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">{c.completion}%</span>
                      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: c.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${c.completion}%` }}
                      transition={{ duration: 1, ease: 'easeOut', delay: 0.2 + i * 0.1 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recent Students */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">Recent Students</h2>
              <button className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium" onClick={() => toast.info('Opening student list...')}>View all</button>
            </div>
            <div className="space-y-3">
              {recentStudents.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => toast.info(`${s.name} — ${s.score}%`)}>
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {s.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{s.name}</div>
                    <div className="text-xs text-zinc-500">{s.course}</div>
                  </div>
                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    s.status === 'excellent' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    s.status === 'good' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}>
                    {s.score}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Create Course Modal */}
      <AnimatePresence>
        {showCourseModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowCourseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-500" /> Create New Course
                </h3>
                <button onClick={() => setShowCourseModal(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Course Name *</label>
                  <input
                    type="text" value={courseName} onChange={e => setCourseName(e.target.value)}
                    placeholder="e.g. Introduction to Machine Learning"
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Course Code *</label>
                    <input
                      type="text" value={courseCode} onChange={e => setCourseCode(e.target.value.toUpperCase())}
                      placeholder="e.g. CS501"
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Capacity</label>
                    <input
                      type="number" value={courseCapacity} onChange={e => setCourseCapacity(e.target.value)}
                      placeholder="40"
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Description</label>
                  <textarea
                    value={courseDesc} onChange={e => setCourseDesc(e.target.value)}
                    placeholder="Brief description of the course content..."
                    rows={3}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors resize-none placeholder:text-zinc-400"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCourseModal(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={handleCreateCourse} disabled={creating} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                  {creating ? (
                    <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Creating...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Create Course</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
