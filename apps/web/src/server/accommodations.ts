import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { cleanAccommodation } from '@/lib/assignment-policy';
import { audit } from './audit';
import { ForbiddenException, NotFoundException } from './http';

// Accommodations (Stage 5 · B3.1): set once per student and used in every course: extra days on
// assignment due dates and extra time on timed quizzes (src/lib/assignment-policy.ts). Set by the
// teacher or a co-teacher of a course the student is in, or an admin; staff who teach the student
// see them (Class list, the grading view). The note is for staff only. Every change is audited.

/** POST /api/courses/:id/accommodations { studentId, extraDays, extraTimePct, note? } (none: zeros). */
export async function setAccommodation(courseId: string, user: SessionUser, b: Record<string, unknown>, req: Request) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can set extra time.');
  const studentId = typeof b.studentId === 'string' ? b.studentId : '';
  const enrolled = studentId ? await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { student: { select: { name: true } } } }) : null;
  if (!enrolled) throw new NotFoundException('They aren’t in this course.');
  const acc = cleanAccommodation(b);
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  if (!acc.extraDays && !acc.extraTimePct) {
    await prisma.studentAccommodation.deleteMany({ where: { studentId } });
  } else {
    await prisma.studentAccommodation.upsert({ where: { studentId }, create: { studentId, ...acc, note, updatedById: user.id }, update: { ...acc, note, updatedById: user.id } });
  }
  audit(user, {
    action: 'student.accommodation',
    summary: acc.extraDays || acc.extraTimePct ? `Set ${enrolled.student.name}’s extra time: ${acc.extraDays} days on assignments, ${acc.extraTimePct}% on timed quizzes (from ${a.course.code})` : `Removed ${enrolled.student.name}’s extra time (from ${a.course.code})`,
    targetType: 'user', targetId: studentId,
  }, req);
  return { ...acc, note };
}
