'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { useAuthStore } from '@/store/auth';
import { BookOpen, ClipboardList, BarChart3, Trophy, TrendingUp, Clock, CheckCircle2, FileText, Globe2, ArrowUpRight, Sparkles, HeartHandshake } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { motion } from 'framer-motion';

const recentActivity = [
  { icon: '🌍', text: 'Joined UNICEF & MIT Water Telemetry Taskforce', time: '10 min ago', type: 'success' },
  { icon: '📚', text: 'New material uploaded in Data Structures', time: '2 hours ago', type: 'info' },
  { icon: '✅', text: 'Attendance marked for Mathematics', time: '4 hours ago', type: 'success' },
  { icon: '🎯', text: 'Assignment grade posted — 94/100', time: 'Yesterday', type: 'success' },
];

const upcomingClasses = [
  { name: 'Data Structures & Algorithms', time: '9:00 AM', room: 'CS-201', color: '#6366f1' },
  { name: 'Operating Systems', time: '11:00 AM', room: 'CS-105', color: '#06b6d4' },
  { name: 'Database Management', time: '2:00 PM', room: 'CS-302', color: '#10b981' },
];

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <Topbar title="Dashboard" subtitle={`${greeting}, ${user?.name?.split(' ')[0] ?? 'Student'}! 👋`} />
      <div className="flex-1 p-8 space-y-8">

        {/* Global Impact Banner */}
        <div className="relative rounded-2xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-amber-950/30 border border-zinc-200 dark:border-white/10 p-6 overflow-hidden shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <UniverseLogo size="lg" animated={true} withGlow={true} />
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-400/30 mb-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Inter-University & NGO Social Impact Network
                </div>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white leading-tight">
                  You are collaborating with <span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">UNICEF & MIT</span>
                </h2>
                <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-1 max-w-xl">
                  142 verified impact hours completed. Apply for cross-campus micro-grants and discover new humanitarian research projects.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/student/impact/projects"
                className="w-full md:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all"
              >
                Browse Projects <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/student/impact/dashboard"
                className="w-full md:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center justify-center gap-1.5 transition-all"
              >
                My Impact Ledger
              </Link>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard title="Enrolled Courses" value="6" icon={BookOpen} change={0} color="indigo" />
          <KpiCard title="Attendance Rate" value="91.2%" icon={ClipboardList} change={2.4} color="green" />
          <KpiCard title="Current GPA" value="3.74" icon={BarChart3} change={5} color="cyan" />
          <KpiCard title="Assignments Done" value="24/28" icon={Trophy} change={-3} color="amber" />
          <KpiCard title="Impact Hours" value="142 hrs" icon={Globe2} change={18} color="indigo" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <div className="xl:col-span-1 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">Today&apos;s Schedule</h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="space-y-3">
              {upcomingClasses.map((cls, i) => (
                <motion.div 
                  whileHover={{ scale: 1.02, x: 5 }}
                  key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors border border-white/[0.06]">
                  <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{cls.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">{cls.room}</div>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {cls.time}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* GPA Progress */}
          <div className="xl:col-span-1 card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">Academic Progress</h2>
            <div className="flex flex-col items-center py-4">
              <div className="relative w-36 h-36">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke="url(#grad)" strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50 * 0.748} ${2 * Math.PI * 50}`} />
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-black gradient-text">3.74</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">GPA</div>
                </div>
              </div>
              <div className="mt-6 w-full space-y-2">
                {[
                  { label: 'Assignments', pct: 86 },
                  { label: 'Quizzes', pct: 91 },
                  { label: 'Attendance', pct: 91 },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400">{item.label}</span>
                      <span className="text-zinc-900 dark:text-white font-medium">{item.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                        style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="xl:col-span-1 card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">Recent Activity</h2>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <motion.div 
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                  key={i} className="flex items-start gap-3 py-2 rounded-xl px-2 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-sm flex-shrink-0">{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 leading-snug">{item.text}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">{item.time}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="font-bold text-zinc-900 dark:text-white mb-5">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: FileText, label: 'View Assignments', color: 'indigo', href: '/student/courses' },
              { icon: ClipboardList, label: 'Check Attendance', color: 'cyan', href: '/student/attendance' },
              { icon: TrendingUp, label: 'View Grades', color: 'green', href: '/student/grades' },
              { icon: CheckCircle2, label: 'Take Quiz', color: 'amber', href: '/student/quizzes' },
            ].map(a => (
              <Link href={a.href} key={a.label} passHref legacyBehavior>
                <motion.a 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="glass glass-hover rounded-xl p-4 flex flex-col items-center gap-2 group cursor-pointer transition-all">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                    a.color === 'indigo' ? 'bg-indigo-600/20 text-indigo-400' :
                    a.color === 'cyan' ? 'bg-cyan-600/20 text-cyan-400' :
                    a.color === 'green' ? 'bg-green-900/30 text-green-400' : 'bg-amber-900/30 text-amber-400'
                  )}>
                    <a.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:text-white text-center">{a.label}</span>
                </motion.a>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
