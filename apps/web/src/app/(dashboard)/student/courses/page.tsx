'use client';
import Link from '@/components/ui/Link';
import { useRouter } from 'next/navigation';
import { navigateWithTransition, vtName } from '@/lib/view-transition';
import useSWR from 'swr';
import { BookOpen, Check, ChevronRight, FileText, GraduationCap, CheckCircle2, Palette } from 'lucide-react';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_COURSE_TABS } from '@/components/layout/SectionTabs';
import { fetcher } from '@/lib/fetcher';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { courseShade } from '@/lib/course-color';
import { JointCourses } from '@/components/network/JointCourses';
import { MY_COURSE_COLORS, setMyCourseColor, useMyCourseColors } from '@/lib/my-course-colors';
import { Popover } from '@/components/ui/Menu';

interface Enrollment {
  enrolledAt: string;
  course: {
    id: string; code: string; name: string; credits: number; department: string | null; color: string | null;
    teacher: { name: string } | null;
    _count: { materials: number; quizzes: number };
  };
}

export default function CoursesPage() {
  const { data, isLoading, error } = useSWR<Enrollment[]>('/courses/my', fetcher, { dedupingInterval: 30000 });
  // Same data as the dashboard (usually already cached), for each course's average grade and attendance.
  const { data: overview } = useSWR<{ courses: { id: string; averageGrade: number | null; attendance: number | null }[] }>(
    `/api/student/overview?dow=${(new Date().getDay() + 6) % 7}`, authedJson, { revalidateIfStale: false },
  );
  const progress = new Map((overview?.courses ?? []).map((c) => [c.id, c]));
  const router = useRouter();
  const enrollments = Array.isArray(data) ? data.filter((e) => e.course) : [];
  const mine = useMyCourseColors();

  return (
    <>
      <Topbar title="My Courses" subtitle="Your enrolled courses — open one to see its Blackboard" />
      <SectionTabs tabs={STUDENT_COURSE_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        {error && <p className="text-sm text-rose-500 mb-4">Couldn&apos;t load your courses right now. Please try again shortly.</p>}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <div key={i} className="h-48 rounded-3xl skeleton" />)}</div>
        ) : enrollments.length === 0 ? (
          <FeatureGuide
            icon={BookOpen}
            title="Your courses will appear here"
            description="When you're enrolled in a course, you'll see it here with its teacher, and open its Blackboard for announcements, materials, grades and quizzes."
            steps={['Your teacher or admin enrolls you in courses', 'Open a course to see materials and announcements', 'Check your grades and quiz results as you go']}
            example={<div><ExampleRow title="Operating Systems" meta="Prof. R. Mehta · 12 materials" right="CS301" /><ExampleRow title="Sustainable Development" meta="Dr. A. Khan · 3 quizzes" right="ENV210" accent="from-indigo-400 to-indigo-600" /></div>}
          />
        ) : (
          // The CSS cascade, not an animation per card in JS (that restyled every card on every frame
          // while the page drew, on a slow phone).
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger">
            {enrollments.map(({ course, enrolledAt }) => (
              <div key={course.id} className="relative">
                <Link href={`/student/blackboard?course=${course.id}`}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigateWithTransition(router, `/student/blackboard?course=${course.id}`); }}
                  className="group block h-full rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-6 hover:border-indigo-500/40 hover:shadow-lg transition-all">
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: courseShade(mine[course.code] ?? course.color, course.code), viewTransitionName: vtName('course', course.id) }}>{course.code.slice(-3)}</div>
                    <span className="text-xs font-mono text-zinc-500">{course.code} · {course.credits} cr</span>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors w-fit" style={{ viewTransitionName: vtName('course-title', course.id) }}>{course.name}</h3>
                  <p className="flex items-center gap-2 text-sm text-zinc-500 mt-1"><GraduationCap className="w-4 h-4" /> {course.teacher?.name ?? 'Instructor to be assigned'}</p>
                  <Progress stats={progress.get(course.id)} />
                  <div className="flex items-center gap-4 text-xs text-zinc-500 mt-5 pt-4 border-t border-zinc-200/70 dark:border-white/[0.06]">
                    <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {course._count.materials} material{course._count.materials === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {course._count.quizzes} quiz{course._count.quizzes === 1 ? '' : 'zes'}</span>
                    <span className="ms-auto inline-flex items-center gap-0.5 font-semibold text-indigo-500">Open <ChevronRight className="w-3.5 h-3.5" /></span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-2">Enrolled {new Date(enrolledAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                </Link>
                {/* My own colour for this course, on this device (outside the link: a button can't sit inside one). */}
                <div className="absolute bottom-3 end-3">
                  <Popover label={`Colour for ${course.code}`} title="My colour for this course" button={<Palette className="w-4 h-4" />}>
                    {(close) => (
                      <div className="p-2 w-56">
                        <p className="px-1 pb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">My colour for {course.code} (this device)</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {MY_COURSE_COLORS.map((c) => (
                            <button key={c.value} type="button" aria-pressed={mine[course.code] === c.value} onClick={() => { setMyCourseColor(course.code, c.value); close(); }}
                              className={cn('w-9 h-9 rounded-full flex items-center justify-center', mine[course.code] === c.value && 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white ring-offset-[var(--surface)]')} style={{ background: c.value }}>
                              {mine[course.code] === c.value && <Check className="w-4 h-4 text-white" aria-hidden />}<span className="sr-only">{c.name}</span>
                            </button>
                          ))}
                        </div>
                        {mine[course.code] && <button type="button" onClick={() => { setMyCourseColor(course.code, null); close(); }} className="mt-2 w-full btn-ghost btn-sm">The course’s own colour</button>}
                      </div>
                    )}
                  </Popover>
                </div>
              </div>
            ))}
          </div>
        )}
        <JointCourses />
      </div>
    </>
  );
}

function Progress({ stats }: { stats?: { averageGrade: number | null; attendance: number | null } }) {
  if (!stats || (stats.averageGrade === null && stats.attendance === null)) return null;
  const rows = [
    { label: 'Average grade', value: stats.averageGrade },
    { label: 'Attendance', value: stats.attendance },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 mt-5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-zinc-500">{r.label}</span>
            <span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{r.value === null ? '—' : `${Math.round(r.value)}%`}</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
            <div
              className={cn('h-full rounded-full', r.value === null ? '' : r.value >= 80 ? 'bg-emerald-500' : r.value >= 65 ? 'bg-amber-500' : 'bg-rose-500')}
              style={{ width: `${Math.max(0, Math.min(100, r.value ?? 0))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
