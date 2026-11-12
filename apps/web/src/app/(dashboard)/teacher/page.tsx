'use client';
import { NewCourseSheet } from '@/components/dashboard/NewCourseSheet';
import { CardHead } from '@/components/ui/CardMenu';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { useRouter } from 'next/navigation';
import { AccountSetupCard } from '@/components/dashboard/AccountSetupCard';
import { DailyBrief } from '@/components/dashboard/DailyBrief';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { useAuthStore } from '@/store/auth';
import { Users, BookOpen, FileText, BarChart3, Plus, ChevronRight, TrendingUp } from 'lucide-react';
import { m as motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { WhenVisible } from '@/components/ui/WhenVisible';
import { HomeBoard } from '@/components/home/HomeBoard';
import { UpNextCard } from '@/components/home/UpNext';
import { AttentionCard, CreateCard } from '@/components/home/RoleCards';
import { useHome } from '@/components/home/use-home';

// The charting library is large, so the charts load after the rest of the dashboard.
const chartSkeleton = () => <div className="h-full w-full rounded-xl skeleton" />;
const GradeDistributionChart = dynamic(() => import('./TeacherCharts').then((m) => m.GradeDistributionChart), { ssr: false, loading: chartSkeleton });
const PerformanceTrendChart = dynamic(() => import('./TeacherCharts').then((m) => m.PerformanceTrendChart), { ssr: false, loading: chartSkeleton });
import { useState } from 'react';
import { useLanguageStore } from '@/store/language';

import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { courseColor } from '@/lib/course-color';
import { TeacherLive } from '@/components/live/HomeLive';

interface TeacherCourse { id?: string; name: string; code: string; color?: string | null; students: number; completion: number }
interface RecentStudent { name: string; course: string; score: number; status: string }

export default function TeacherDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dashboard.greeting_morning') : hour < 18 ? t('dashboard.greeting_afternoon') : t('dashboard.greeting_evening');
  
  const [showCourseModal, setShowCourseModal] = useState(false);
  const { data, isLoading, error } = useSWR('/dashboard/teacher', fetcher);
  const home = useHome();

  if (isLoading) {
    return (
      <>
        <Topbar title={t('teacher.title')} subtitle={`${greeting}, ${user?.name?.split(' ')[0] ?? 'Professor'}! 👋`} />
        <div className="flex-1 flex items-center justify-center">
          <ContentSkeleton variant="dashboard" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Topbar title={t('teacher.title')} subtitle={`${greeting}, ${user?.name?.split(' ')[0] ?? 'Professor'}! 👋`} />
        <div className="flex-1 flex items-center justify-center text-red-500">Failed to load dashboard data</div>
      </>
    );
  }

  const {
    activeCourses = 0,
    totalStudents = 0,
    pendingGrades = 0,
    avgClassScore = 0,
    myCourses = [],
    gradeDistributionData = [],
    performanceTrendData = [],
    recentStudents = []
  } = data;

  return (
    <>
      <Topbar
        title={t('teacher.title')}
        subtitle={`${greeting}, ${user?.name?.split(' ')[0] ?? 'Professor'}! 👋`}
        action={{ label: t('teacher.new_course'), onClick: () => setShowCourseModal(true) }}
      />
      <div className="flex-1 p-4 sm:p-8 space-y-8 overflow-y-auto">
        <HomeBoard role="teacher" layout={home.layout} onSave={(l) => void home.saveLayout(l)} afterTop={<AccountSetupCard />} cards={{
          upnext: <UpNextCard items={home.data?.upNext} loading={home.isLoading} empty="No classes or calls coming up, and nothing waiting to be graded." />,
          kpis: (
            <div className="kpi-row grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard title={t('teacher.total_students')} value={totalStudents.toString()} icon={Users} color="indigo" />
              <KpiCard title={t('teacher.active_courses')} value={activeCourses.toString()} icon={BookOpen} color="cyan" />
              <KpiCard title={t('teacher.pending_grades')} value={pendingGrades.toString()} icon={FileText} color="amber" />
              <KpiCard title={t('teacher.avg_class_score')} value={`${avgClassScore}%`} icon={BarChart3} color="green" />
            </div>
          ),
          brief: <DailyBrief />,
          orbit: <TeacherLive courses={myCourses} recent={recentStudents} pending={pendingGrades} avg={avgClassScore} name={user?.name} />,
          attention: <AttentionCard attention={home.data?.attention} />,
          courses: (
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-zinc-900 dark:text-white">{t('teacher.add_course')}</h2>
                <button onClick={() => setShowCourseModal(true)} className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                  <Plus className="w-3.5 h-3.5" /> {t('teacher.add_course')}
                </button>
              </div>
              <div className="space-y-4">
                {myCourses.map((c: TeacherCourse, i: number) => (
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    key={i}
                    className="p-4 rounded-xl bg-white/[0.03] border border-zinc-100 dark:border-white/[0.06] hover:border-indigo-500/20 transition cursor-pointer group"
                    onClick={() => router.push('/teacher/blackboard')}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${courseColor(c.color, c.code)}20` }}>📚</div>
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
                        style={{ backgroundColor: courseColor(c.color, c.code) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${c.completion}%` }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 + i * 0.1 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ),
          charts: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <CardHead icon={BarChart3} title={t('teacher.grade_distribution')} className="mb-5" />
                <WhenVisible className="h-64" placeholder={chartSkeleton()}>
                  <GradeDistributionChart data={gradeDistributionData} />
                </WhenVisible>
              </div>
              <div className="card">
                <CardHead icon={TrendingUp} title={t('teacher.performance_trend')} className="mb-5" />
                <WhenVisible className="h-64" placeholder={chartSkeleton()}>
                  <PerformanceTrendChart data={performanceTrendData} />
                </WhenVisible>
              </div>
            </div>
          ),
          create: <CreateCard onNewCourse={() => setShowCourseModal(true)} />,
          recent: (
            <div className="card">
              <CardHead title={t('teacher.recent_students')} className="items-center mb-5">
                <button className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium" onClick={() => router.push('/teacher/students')}>{t('dashboard.view_all')}</button>
              </CardHead>
              <div className="space-y-3">
                {recentStudents.map((s: RecentStudent, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => router.push('/teacher/grades')}>
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
          ),
        }} />
      </div>

      {showCourseModal && <NewCourseSheet onClose={() => setShowCourseModal(false)} />}
    </>
  );
}
