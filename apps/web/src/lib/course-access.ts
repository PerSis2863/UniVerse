import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

/** A course's teaching team besides its teacher (Stage 5 · B2, course_staff). */
export type StaffRole = 'CO_TEACHER' | 'TA';
export const STAFF_ROLES: StaffRole[] = ['CO_TEACHER', 'TA'];

/**
 * Who may see a course's Blackboard: its teacher, its teaching team, enrolled students, and admins.
 * Returns the course plus what the user can do, or null when they have no access:
 * - canManage: change the course (its teacher, co-teachers, admins);
 * - canGrade: also grade, take attendance and help in the discussion (teaching assistants too).
 */
export async function courseAccess(courseId: string, user: SessionUser) {
  const found = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true, name: true, code: true, color: true, teacherId: true, skills: true,
      teacher: { select: { id: true, name: true } },
      _count: { select: { enrollments: true } },
      staff: { where: { userId: user.id }, select: { role: true }, take: 1 },
    },
  });
  if (!found) return null;
  const { staff, ...course } = found;
  const staffRole = (STAFF_ROLES as string[]).includes(staff[0]?.role ?? '') ? (staff[0].role as StaffRole) : null;
  const canManage = user.role === 'ADMIN' || course.teacherId === user.id || staffRole === 'CO_TEACHER';
  const canGrade = canManage || staffRole === 'TA';
  if (!canGrade) {
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { id: true } });
    if (!enrolled) return null;
  }
  return { course, canManage, canGrade, staffRole };
}

/** The course's teacher or an admin: changing the teaching team, copying or deleting the course. */
export const ownsCourse = (course: { teacherId: string }, user: { id: string; role: string }) => user.role === 'ADMIN' || course.teacherId === user.id;

/**
 * Courses someone teaches, for lists ("my courses"): their own and those they're on the team of.
 * `roles` narrows the team (e.g. ['CO_TEACHER'] where assistants shouldn't see a course).
 */
export const taughtBy = (userId: string, roles: StaffRole[] = STAFF_ROLES) => ({ OR: [{ teacherId: userId }, { staff: { some: { userId, role: { in: roles } } } }] });

/** Whether someone teaches a course (its teacher, or on its team in one of `roles`). */
export async function teaches(courseId: string, userId: string, roles: StaffRole[] = STAFF_ROLES) {
  return (await prisma.course.count({ where: { id: courseId, ...taughtBy(userId, roles) } })) > 0;
}
