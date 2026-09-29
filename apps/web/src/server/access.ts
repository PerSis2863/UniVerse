import prisma from '@/lib/db';
import { ForbiddenException, NotFoundException } from './http';

// Shared permission checks for the API.

export type Actor = { id: string; role: string };

/** Admins, or the teacher of this course. */
export async function assertManagesCourse(courseId: string, user: Actor) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  if (!course) throw new NotFoundException('Course not found');
  if (user.role !== 'ADMIN' && course.teacherId !== user.id) throw new ForbiddenException('You can only manage your own courses.');
}

/** Admins, or whoever created the record. */
export function assertOwnerOrAdmin(ownerId: string | null | undefined, user: Actor, what = 'this') {
  if (user.role !== 'ADMIN' && ownerId !== user.id) throw new ForbiddenException(`You can only change ${what} if you created it.`);
}
