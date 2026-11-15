import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

// M196: a teacher's first class in ten minutes. The teacher home's card walks through four steps
// (a course, its invite link, the first assignment, who joined) and ticks each one off from what
// is really there. Only the teacher's own newest course; students' first names only.

/** GET /api/teacher/first-class */
export async function firstClass(user: SessionUser) {
  if (user.role !== 'TEACHER') return { show: false as const };
  const course = await prisma.course.findFirst({
    where: { teacherId: user.id, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' },
    select: { id: true, code: true, name: true, status: true, _count: { select: { enrollments: true, assignments: true } } },
  });
  if (!course) return { show: true as const, course: null, students: 0, assignments: 0, joined: [] };
  const recent = course._count.enrollments
    ? await prisma.enrollment.findMany({ where: { courseId: course.id }, orderBy: { enrolledAt: 'desc' }, take: 5, select: { enrolledAt: true, student: { select: { name: true } } } })
    : [];
  return {
    show: true as const,
    course: { id: course.id, code: course.code, name: course.name, status: course.status },
    students: course._count.enrollments,
    assignments: course._count.assignments,
    joined: recent.map((e) => ({ name: e.student.name.trim().split(/\s+/)[0] || 'A student', at: e.enrolledAt })),
  };
}
