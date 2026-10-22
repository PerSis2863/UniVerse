import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { inSchools, schoolsOf } from '@/server/school-scope';

/** The quiz if the user may manage it (teacher or co-teacher of its course, or an admin of the course's school), else null. */
export async function manageableQuiz(quizId: string, user: SessionUser) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, courseId: true, title: true, status: true, dueDate: true, timeLimit: true, shuffle: true, examMode: true, plainWords: true, pools: true, oneWay: true, hardStop: true, practice: true, aiPolicy: true, course: { select: { teacherId: true, name: true, code: true, teacher: { select: { organizationId: true } }, staff: { where: { userId: user.id, role: 'CO_TEACHER' }, select: { id: true }, take: 1 } } } },
  });
  if (!quiz) return null;
  // The teacher's school stays out of the result (callers send the quiz back as it is).
  const { teacher, ...course } = quiz.course;
  const admin = user.role === 'ADMIN' && inSchools(await schoolsOf(user), teacher?.organizationId);
  if (!admin && course.teacherId !== user.id && !course.staff.length) return null;
  return { ...quiz, course };
}
