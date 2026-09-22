'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import dynamic from 'next/dynamic';

const GamificationWidget = dynamic(
  () => import('@/components/dashboard/GamificationWidget').then(mod => mod.GamificationWidget),
  { 
    ssr: false, 
    loading: () => <div className="h-64 w-full bg-zinc-100 dark:bg-zinc-900/50 animate-pulse rounded-2xl flex items-center justify-center text-zinc-500 text-sm">Loading widget...</div> 
  }
);
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { ClassDetailModal, ClassData } from '@/components/dashboard/ClassDetailModal';
import { BookOpen, ClipboardList, BarChart3, Trophy, TrendingUp, Clock, CheckCircle2, FileText, Globe2, ArrowUpRight, Sparkles, HeartHandshake, AlertCircle, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { motion } from 'framer-motion';

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'dashboard.greeting_morning' : hour < 18 ? 'dashboard.greeting_afternoon' : 'dashboard.greeting_evening';

  const { data, error, isLoading } = useSWR('/dashboard/student', fetcher);

  if (isLoading) return <div className="p-8 text-center text-zinc-500">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-center text-rose-500">Failed to load dashboard</div>;

  const { kpis, courseProgress = [], deadlines = [], schedule = [] } = data || {};

  return (
    <>
      <Topbar title={t('nav.dashboard')} subtitle={`${t(greeting)}, ${user?.name?.split(' ')[0] ?? 'Student'}! 👋`} />
      <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-5 md:space-y-8">

        <div className="relative rounded-2xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-amber-950/30 border border-zinc-200 dark:border-white/10 p-4 md:p-6 overflow-hidden shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3">
              <UniverseLogo size="lg" animated={true} withGlow={true} />
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-400/30 mb-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  {t('dashboard.network')}
                </div>
                <h2 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white leading-tight">
                  {t('dashboard.collab')} <span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">UNICEF & MIT</span>
                </h2>
                <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-1 max-w-xl">
                  {t('dashboard.impact_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/student/impact/projects"
                className="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all"
              >
                {t('dashboard.browse')} <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/student/impact/dashboard"
                className="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-700 flex items-center justify-center gap-1.5 transition-all"
              >
                {t('dashboard.ledger')}
              </Link>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <KpiCard title={t('dashboard.enrolled')} value={kpis?.enrolled?.toString() || "0"} icon={BookOpen} change={0} color="indigo" />
          <KpiCard title={t('dashboard.attendance')} value={`${kpis?.attendance || 0}%`} icon={ClipboardList} change={0} color="green" />
          <KpiCard title={t('dashboard.gpa')} value={(kpis?.gpa || 0).toFixed(2)} icon={BarChart3} change={0} color="cyan" />
          <KpiCard title={t('dashboard.assignments')} value={kpis?.assignments?.toString() || "0"} icon={Trophy} change={0} color="amber" />
          <KpiCard title={t('dashboard.impact_hours')} value={`${kpis?.impactHours || 0} hrs`} icon={Globe2} change={0} color="indigo" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <div className="xl:col-span-1 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">{t('dashboard.schedule')}</h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="space-y-3">
              {schedule.length > 0 ? schedule.map((cls: any, i: number) => (
                <div key={i} onClick={() => setSelectedClass({ ...cls, subject: cls.course })} className="flex items-start gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group border border-zinc-200 dark:border-white/[0.06] bg-zinc-100 dark:bg-white/[0.03]">
                  <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color || '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{cls.course}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">{cls.location}</div>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {cls.time}
                  </div>
                </div>
              )) : (
                <div className="text-sm text-zinc-500 text-center py-4">No classes scheduled for today.</div>
              )}
            </div>
          </div>

          {/* GPA Progress */}
          <div className="xl:col-span-1 card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">{t('dashboard.progress')}</h2>
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
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                        style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gamification */}
          <div className="xl:col-span-1">
            <GamificationWidget />
          </div>
        </div>

        {/* Phase 2: Course Progress & Deadlines */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Course Progress */}
          <div className="xl:col-span-2 card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">{t('dashboard.course_progress')}</h2>
              <Link href="/student/courses" className="text-xs font-semibold text-indigo-500 hover:text-indigo-600">{t('dashboard.view_all')}</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courseProgress.map((course: any, i: number) => (
                <div key={i} className="p-4 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.02]">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">{course.name}</h3>
                    <span className="text-xs font-bold bg-white dark:bg-zinc-800 px-2 py-1 rounded border border-zinc-200 dark:border-white/[0.06] text-zinc-900 dark:text-white">{course.grade}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                    <span>Course Completion</span>
                    <span>{course.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${course.progress}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={cn("h-full rounded-full bg-gradient-to-r", course.color)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deadlines & Reminders */}
          <div className="xl:col-span-1 card flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-zinc-900 dark:text-white">{t('dashboard.deadlines')}</h2>
              <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"><Calendar className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 flex-1">
              {deadlines.map((item: any, i: number) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 hover:border-indigo-500/30 transition-colors group cursor-pointer">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", item.urgent ? "bg-rose-500/10 text-rose-500" : "bg-indigo-500/10 text-indigo-500")}>
                    {item.urgent ? <AlertCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:text-indigo-500 transition-colors">{item.title}</h4>
                    <p className="text-[11px] text-zinc-500 truncate">{item.course}</p>
                    <p className={cn("text-[10px] mt-1 font-medium", item.urgent ? "text-rose-500" : "text-zinc-400")}>{item.due}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="font-bold text-zinc-900 dark:text-white mb-5">{t('dashboard.quick_actions')}</h2>
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

      <ClassDetailModal 
        selectedClass={selectedClass} 
        onClose={() => setSelectedClass(null)} 
      />
    </>
  );
}
