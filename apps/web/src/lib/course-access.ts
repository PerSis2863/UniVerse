import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

/**
 * Who may see a course's Blackboard: its teacher, enrolled students, and admins.
 * Returns the course plus whether the user can post to it, or null when they have no access.
 */
export async function courseAccess(courseId: string, user: SessionUser) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true, name: true, code: true, color: true, teacherId: true,
      teacher: { select: { id: true, name: true } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!course) return null;
  const canManage = user.role === 'ADMIN' || course.teacherId === user.id;
  if (!canManage) {
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { id: true } });
    if (!enrolled) return null;
  }
  return { course, canManage };
}
