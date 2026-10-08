import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

/** The quiz if the user may manage it (teacher of its course, or an admin), else null. */
export async function manageableQuiz(quizId: string, user: SessionUser) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, title: true, status: true, dueDate: true, timeLimit: true, shuffle: true, examMode: true, course: { select: { teacherId: true, name: true, code: true } } },
  });
  if (!quiz) return null;
  if (user.role !== 'ADMIN' && quiz.course.teacherId !== user.id) return null;
  return quiz;
}
