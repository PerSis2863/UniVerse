'use client';
import Link from '@/components/ui/Link';
import { useRouter } from 'next/navigation';
import { navigateWithTransition, vtName } from '@/lib/view-transition';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, FileText, GraduationCap, CheckCircle2 } from 'lucide-react';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { Topbar } from '@/components/layout/Topbar';
import { fetcher } from '@/lib/fetcher';

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
  const router = useRouter();
  const enrollments = Array.isArray(data) ? data.filter((e) => e.course) : [];

  return (
    <>
      <Topbar title="My Courses" subtitle="Your enrolled courses — open one to see its Blackboard" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        {error && <p className="text-sm text-rose-500 mb-4">Couldn&apos;t load your courses right now. Please try again shortly.</p>}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <div key={i} className="h-48 rounded-3xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />)}</div>
        ) : enrollments.length === 0 ? (
          <FeatureGuide
            icon={BookOpen}
            title="Your courses will appear here"
            description="When you're enrolled in a course, you'll see it here with its teacher, and open its Blackboard for announcements, materials, grades and quizzes."
            steps={['Your teacher or admin enrolls you in courses', 'Open a course to see materials and announcements', 'Check your grades and quiz results as you go']}
            example={<div><ExampleRow title="Operating Systems" meta="Prof. R. Mehta · 12 materials" right="CS301" /><ExampleRow title="Sustainable Development" meta="Dr. A. Khan · 3 quizzes" right="ENV210" accent="from-emerald-500 to-teal-500" /></div>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {enrollments.map(({ course, enrolledAt }, i) => (
              <motion.div key={course.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}>
                <Link href={`/student/blackboard?course=${course.id}`}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigateWithTransition(router, `/student/blackboard?course=${course.id}`); }}
                  className="group block h-full rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-6 hover:border-indigo-500/40 hover:shadow-lg transition-all">
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: course.color || '#4f46e5', viewTransitionName: vtName('course', course.id) }}>{course.code.slice(-3)}</div>
                    <span className="text-xs font-mono text-zinc-500">{course.code} · {course.credits} cr</span>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors w-fit" style={{ viewTransitionName: vtName('course-title', course.id) }}>{course.name}</h3>
                  <p className="flex items-center gap-2 text-sm text-zinc-500 mt-1"><GraduationCap className="w-4 h-4" /> {course.teacher?.name ?? 'Instructor to be assigned'}</p>
                  <div className="flex items-center gap-4 text-xs text-zinc-500 mt-5 pt-4 border-t border-zinc-200/70 dark:border-white/[0.06]">
                    <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {course._count.materials} material{course._count.materials === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {course._count.quizzes} quiz{course._count.quizzes === 1 ? '' : 'zes'}</span>
                    <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-indigo-500">Open <ChevronRight className="w-3.5 h-3.5" /></span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-2">Enrolled {new Date(enrolledAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
