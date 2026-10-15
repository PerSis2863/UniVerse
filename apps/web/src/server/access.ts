import prisma from '@/lib/db';
import { ForbiddenException, NotFoundException } from './http';

// Shared permission checks for the API.

export type Actor = { id: string; role: string };

/** Admins, the teacher of this course, or a co-teacher of it (Stage 5 · B2). */
export async function assertManagesCourse(courseId: string, user: Actor) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true, staff: { where: { userId: user.id }, select: { role: true }, take: 1 } } });
  if (!course) throw new NotFoundException('Course not found');
  if (user.role !== 'ADMIN' && course.teacherId !== user.id && course.staff[0]?.role !== 'CO_TEACHER') throw new ForbiddenException('You can only manage your own courses.');
}

/** Like assertManagesCourse, and the course's teaching assistants too: grading and attendance. */
export async function assertGradesCourse(courseId: string, user: Actor) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true, staff: { where: { userId: user.id }, select: { role: true }, take: 1 } } });
  if (!course) throw new NotFoundException('Course not found');
  if (user.role !== 'ADMIN' && course.teacherId !== user.id && !course.staff.length) throw new ForbiddenException('You can only manage your own courses.');
}

/** Admins, or whoever created the record. */
export function assertOwnerOrAdmin(ownerId: string | null | undefined, user: Actor, what = 'this') {
  if (user.role !== 'ADMIN' && ownerId !== user.id) throw new ForbiddenException(`You can only change ${what} if you created it.`);
}
