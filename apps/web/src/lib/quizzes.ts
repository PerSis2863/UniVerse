import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

/** The quiz if the user may manage it (teacher or co-teacher of its course, or an admin), else null. */
export async function manageableQuiz(quizId: string, user: SessionUser) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, courseId: true, title: true, status: true, dueDate: true, timeLimit: true, shuffle: true, examMode: true, plainWords: true, pools: true, oneWay: true, hardStop: true, course: { select: { teacherId: true, name: true, code: true, staff: { where: { userId: user.id, role: 'CO_TEACHER' }, select: { id: true }, take: 1 } } } },
  });
  if (!quiz) return null;
  if (user.role !== 'ADMIN' && quiz.course.teacherId !== user.id && !quiz.course.staff.length) return null;
  return quiz;
}
