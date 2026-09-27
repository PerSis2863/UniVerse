'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowUpRight, BookOpen, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Clock, GraduationCap,
  MapPin, Sparkles, Target, TrendingUp, FileText, Brain, Trophy, type LucideIcon,
} from 'lucide-react';
import { AccountSetupCard } from '@/components/dashboard/AccountSetupCard';
import { Topbar } from '@/components/layout/Topbar';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

interface Overview {
  name: string;
  stats: { courses: number; attendance: number | null; averageGrade: number | null; upcoming: number; impactPoints: number };
  level: { current: { level: number; title: string; emoji: string }; next: { level: number; title: string; minXP: number } | null; progress: number; xp: number };
  courses: { id: string; code: string; name: string; color: string | null; emoji: string | null; attendance: number | null; averageGrade: number | null }[];
  schedule: { id: string; start: string; end: string; type: string; room: string | null; course: { code: string; name: string; color: string | null } }[];
  upcoming: { id: string; title: string; dueDate: string; course: { code: string; name: string } }[];
  recentGrades: { id: string; name: string; course: string; percent: number; gradedAt: string }[];
}

const EASE = [0.22, 1, 0.36, 1] as const;
const card = 'relative rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-5 md:p-6';

function Panel({ title, icon: Icon, action, children, className, delay = 0 }: {
  title: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className={cn(card, className)}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

function StatTile({ label, value, sub, icon: Icon, gradient, delay }: {
  label: string; value: string; sub: string; icon: LucideIcon; gradient: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      whileHover={{ y: -4 }}
      className={cn(card, 'group overflow-hidden')}
    >
      <div aria-hidden className={cn('absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.12] group-hover:opacity-25 transition-opacity bg-gradient-to-br', gradient)} style={{ maskImage: 'radial-gradient(closest-side, black, transparent)', WebkitMaskImage: 'radial-gradient(closest-side, black, transparent)' }} />
      <div className={cn('relative w-11 h-11 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg mb-5', gradient)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="relative text-3xl font-black tracking-tight text-zinc-900 dark:text-white tabular-nums">{value}</div>
      <div className="relative text-sm font-medium text-zinc-600 dark:text-zinc-300 mt-1">{label}</div>
      <div className="relative text-xs text-zinc-500 mt-0.5">{sub}</div>
    </motion.div>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.9, ease: EASE }} className={cn('h-full rounded-full', className)} />
    </div>
  );
}

function LevelRing({ progress }: { progress: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
      <defs>
        <linearGradient id="lvl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-zinc-200 dark:stroke-white/[0.07]" />
      <motion.circle
        cx="50" cy="50" r={r} fill="none" stroke="url(#lvl)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * progress) / 100 }}
        transition={{ duration: 1.1, ease: EASE }}
      />
    </svg>
  );
}

const QUICK_ACTIONS = [
  { icon: BookOpen, label: 'Courses', href: '/student/courses' },
  { icon: TrendingUp, label: 'Grades', href: '/student/grades' },
  { icon: ClipboardCheck, label: 'Attendance', href: '/student/attendance' },
  { icon: CheckCircle2, label: 'Quizzes', href: '/student/quizzes' },
  { icon: Brain, label: 'AI Match', href: '/student/impact/ai-match' },
  { icon: FileText, label: 'Credentials', href: '/student/credentials' },
];

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'dashboard.greeting_morning' : hour < 18 ? 'dashboard.greeting_afternoon' : 'dashboard.greeting_evening';
  const dow = (new Date().getDay() + 6) % 7; // 0 = Monday, matching timetable slots

  const { data, error, isLoading } = useSWR<Overview>(`/api/student/overview?dow=${dow}`, authedJson, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });

  const s = data?.stats;
  const fmt = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

  return (
    <>
      <Topbar title={t('nav.dashboard')} subtitle={`${t(greeting)}, ${user?.name?.split(' ')[0] ?? 'Student'}! 👋`} />
      <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">

        {/* Impact network banner */}
        <div className="relative rounded-2xl bg-gradient-to-r from-indigo-50 via-purple-50 to-amber-50 dark:from-indigo-950/60 dark:via-purple-950/40 dark:to-amber-950/30 border border-indigo-100 dark:border-white/10 p-4 md:p-6 overflow-hidden shadow-xl shadow-indigo-500/5 dark:shadow-black/20">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3">
              <UniverseLogo size="lg" animated={true} withGlow={true} />
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold border border-indigo-400/30 mb-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  {t('dashboard.network')}
                </div>
                <h2 className="text-lg md:text-xl font-black text-zinc-900 dark:text-white leading-tight">
                  {t('dashboard.collab')} <span className="bg-gradient-to-r from-indigo-600 via-pink-600 to-amber-600 dark:from-indigo-400 dark:via-pink-400 dark:to-amber-400 bg-clip-text text-transparent">NGOs &amp; changemakers</span>
                </h2>
                <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-1 max-w-xl">
                  {s && s.impactPoints > 0 ? `${s.impactPoints.toLocaleString()} impact points earned. ` : ''}{t('dashboard.impact_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/student/impact/ngo-marketplace"
                className="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all"
              >
                {t('dashboard.browse')} <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/student/impact/dashboard"
                className="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center gap-1.5 transition-all"
              >
                {t('dashboard.ledger')}
              </Link>
            </div>
          </div>
        </div>

        <AccountSetupCard />

        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-500">
            Couldn&apos;t load your dashboard right now. Please refresh in a moment.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 rounded-3xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />)
          ) : !data ? null : (
            <>
              <StatTile delay={0} label="Enrolled courses" value={String(s!.courses)} sub={s!.courses ? 'This term' : 'Not enrolled yet'} icon={BookOpen} gradient="from-indigo-500 to-violet-500" />
              <StatTile delay={0.05} label="Attendance" value={fmt(s!.attendance, '%')} sub={s!.attendance === null ? 'No records yet' : 'Present or late'} icon={ClipboardCheck} gradient="from-emerald-500 to-teal-500" />
              <StatTile delay={0.1} label="Average grade" value={fmt(s!.averageGrade, '%')} sub={s!.averageGrade === null ? 'No grades yet' : 'Weighted, all courses'} icon={GraduationCap} gradient="from-sky-500 to-cyan-500" />
              <StatTile delay={0.15} label="Impact XP" value={data.level.xp.toLocaleString()} sub={`${data.level.current.emoji} ${data.level.current.title}`} icon={Trophy} gradient="from-fuchsia-500 to-pink-500" />
            </>
          )}
        </div>

        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left column */}
            <div className="xl:col-span-8 space-y-6">
              <Panel title={t('dashboard.schedule')} icon={CalendarClock} delay={0.1}
                action={<span className="text-xs text-zinc-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
              >
                {data.schedule.length === 0 ? (
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-dashed border-zinc-200 dark:border-white/[0.08]">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center"><Sparkles className="w-5 h-5 text-indigo-400" /></div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">No classes today</p>
                      <p className="text-xs text-zinc-500">A good day to pick up an impact project.</p>
                    </div>
                  </div>
                ) : (
                  <ol className="space-y-3">
                    {data.schedule.map((c) => (
                      <li key={c.id} className="flex items-center gap-4">
                        <span className="w-11 text-right text-xs font-semibold text-zinc-500 tabular-nums">{c.start}</span>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-4 ring-indigo-500/10" style={{ backgroundColor: c.course.color || '#6366f1' }} />
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.course.name}</p>
                            <p className="text-xs text-zinc-500 flex items-center gap-3">
                              <span>{c.course.code} · {c.type.toLowerCase()}</span>
                              {c.room && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{c.room}</span>}
                            </p>
                          </div>
                          <span className="text-xs text-zinc-500 whitespace-nowrap inline-flex items-center gap-1"><Clock className="w-3 h-3" />{c.start}–{c.end}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>

              <Panel title="My courses" icon={BookOpen} delay={0.15}
                action={<Link href="/student/courses" className="text-xs font-semibold text-indigo-500 hover:text-indigo-400 inline-flex items-center gap-0.5">{t('dashboard.view_all')} <ChevronRight className="w-3.5 h-3.5" /></Link>}
              >
                {data.courses.length === 0 ? (
                  <p className="text-sm text-zinc-500">You&apos;re not enrolled in any courses yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.courses.map((c, i) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06] hover:border-indigo-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: `${c.color || '#6366f1'}22` }}>
                            {c.emoji || <BookOpen className="w-4 h-4" style={{ color: c.color || '#6366f1' }} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.name}</p>
                            <p className="text-xs text-zinc-500">{c.code}</p>
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex justify-between text-[11px] mb-1"><span className="text-zinc-500">Average grade</span><span className="font-semibold text-zinc-900 dark:text-white">{fmt(c.averageGrade, '%')}</span></div>
                            <Bar value={c.averageGrade ?? 0} className="bg-gradient-to-r from-indigo-500 to-violet-500" />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] mb-1"><span className="text-zinc-500">Attendance</span><span className="font-semibold text-zinc-900 dark:text-white">{fmt(c.attendance, '%')}</span></div>
                            <Bar value={c.attendance ?? 0} className="bg-gradient-to-r from-emerald-500 to-teal-400" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* Right column */}
            <div className="xl:col-span-4 space-y-6">
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
                className={cn(card, 'overflow-hidden')}
              >
                <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-fuchsia-500/10 pointer-events-none" />
                <div className="relative flex items-center gap-5">
                  <div className="relative shrink-0">
                    <LevelRing progress={data.level.progress} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl">{data.level.current.emoji}</span>
                      <span className="text-[11px] font-bold text-zinc-500">Lvl {data.level.current.level}</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">Impact level</p>
                    <p className="text-lg font-black text-zinc-900 dark:text-white leading-tight">{data.level.current.title}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {data.level.next
                        ? `${(data.level.next.minXP - data.level.xp).toLocaleString()} XP to ${data.level.next.title}`
                        : 'Highest level reached'}
                    </p>
                    <Link href="/student/impact/dashboard" className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-indigo-500 hover:text-indigo-400">
                      {t('dashboard.ledger')} <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </motion.section>

              <Panel title={t('dashboard.deadlines')} icon={Target} delay={0.15}
                action={s!.upcoming > 0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">{s!.upcoming}</span> : undefined}
              >
                {data.upcoming.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nothing due. You&apos;re all caught up.</p>
                ) : (
                  <div className="space-y-2">
                    {data.upcoming.map((q) => {
                      const soon = new Date(q.dueDate).getTime() - Date.now() < 48 * 3600 * 1000;
                      return (
                        <Link key={q.id} href="/student/quizzes" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors group">
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', soon ? 'bg-rose-500/10 text-rose-500' : 'bg-indigo-500/10 text-indigo-500')}>
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate group-hover:text-indigo-500 transition-colors">{q.title}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{q.course.code} · due {formatDistanceToNowStrict(new Date(q.dueDate), { addSuffix: true })}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="Recent grades" icon={GraduationCap} delay={0.2}>
                {data.recentGrades.length === 0 ? (
                  <p className="text-sm text-zinc-500">No graded work yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.recentGrades.map((g) => (
                      <div key={g.id} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{g.name}</p>
                          <p className="text-[11px] text-zinc-500">{g.course}</p>
                        </div>
                        <span className={cn('text-sm font-bold tabular-nums', g.percent >= 70 ? 'text-emerald-500' : g.percent >= 50 ? 'text-amber-500' : 'text-rose-500')}>{g.percent}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={t('dashboard.quick_actions')} icon={Sparkles} delay={0.25}>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_ACTIONS.map((a) => (
                    <Link key={a.label} href={a.href} className="group flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors">
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <a.icon className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
                      </span>
                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white">{a.label}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
