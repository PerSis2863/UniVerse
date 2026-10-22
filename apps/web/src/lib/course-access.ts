import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { inSchools, schoolsOf } from '@/server/school-scope';

/** A course's teaching team besides its teacher (Stage 5 · B2, course_staff). */
export type StaffRole = 'CO_TEACHER' | 'TA';
export const STAFF_ROLES: StaffRole[] = ['CO_TEACHER', 'TA'];

/** Courses courseAccess let an admin of their school manage (what ownsCourse trusts). */
const ADMIN_OF = new WeakSet<object>();

/** An admin of the school this course belongs to (its teacher's school, src/server/school-scope.ts). */
async function adminOf(user: SessionUser, teacherOrg: string | null | undefined) {
  return user.role === 'ADMIN' && inSchools(await schoolsOf(user), teacherOrg);
}

/**
 * Who may see a course's Blackboard: its teacher, its teaching team, enrolled students, and the
 * admins of its school (another school's admins get nothing, as if it didn't exist).
 * Returns the course plus what the user can do, or null when they have no access:
 * - canManage: change the course (its teacher, co-teachers, admins);
 * - canGrade: also grade, take attendance and help in the discussion (teaching assistants too).
 */
export async function courseAccess(courseId: string, user: SessionUser) {
  const found = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true, name: true, code: true, color: true, teacherId: true, skills: true,
      teacher: { select: { id: true, name: true, organizationId: true } },
      _count: { select: { enrollments: true } },
      staff: { where: { userId: user.id }, select: { role: true }, take: 1 },
    },
  });
  if (!found) return null;
  const { staff, teacher: { organizationId: teacherOrg, ...teacher }, ...rest } = found;
  const course = { ...rest, teacher };
  const staffRole = (STAFF_ROLES as string[]).includes(staff[0]?.role ?? '') ? (staff[0].role as StaffRole) : null;
  const admin = await adminOf(user, teacherOrg);
  if (admin) ADMIN_OF.add(course);
  const canManage = admin || course.teacherId === user.id || staffRole === 'CO_TEACHER';
  const canGrade = canManage || staffRole === 'TA';
  if (!canGrade) {
    const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { id: true } });
    if (!enrolled) return null;
  }
  return { course, canManage, canGrade, staffRole };
}

/**
 * The course's teacher or an admin of its school: changing the teaching team, copying or deleting the
 * course. An admin counts only for a course that courseAccess gave them (it checked the school).
 */
export const ownsCourse = (course: { teacherId: string }, user: { id: string; role: string }) => course.teacherId === user.id || (user.role === 'ADMIN' && ADMIN_OF.has(course));

/**
 * Courses someone teaches, for lists ("my courses"): their own and those they're on the team of.
 * `roles` narrows the team (e.g. ['CO_TEACHER'] where assistants shouldn't see a course).
 */
export const taughtBy = (userId: string, roles: StaffRole[] = STAFF_ROLES) => ({ OR: [{ teacherId: userId }, { staff: { some: { userId, role: { in: roles } } } }] });

/** Whether someone teaches a course (its teacher, or on its team in one of `roles`). */
export async function teaches(courseId: string, userId: string, roles: StaffRole[] = STAFF_ROLES) {
  return (await prisma.course.count({ where: { id: courseId, ...taughtBy(userId, roles) } })) > 0;
}
