import type { Router } from '../router';
import type { Prisma } from '@prisma/client';
import { BadRequestException } from '../http';
import { QuizzesService } from '../services/quizzes.service';
import { CreateQuizDto, UpdateQuizDto, validate } from '../dto';
import { recordStudy } from '../streaks';
import { str } from '../body';
import { createPaper, getPaper, listPapers, paperToQuiz, postPaper, removePaper, saveMarks } from '../exam-papers';
import { draftQuiz } from '../quiz-draft';

const quizzes = new QuizzesService();

export default function quizzesModule(router: Router) {
  const r = router.controller('quizzes');

  r.post('', { roles: ['ADMIN', 'TEACHER'] }, ({ body, user }) => quizzes.create(validate<CreateQuizDto>(CreateQuizDto, body), user));
  // M366: Ghidra drafts a quiz in a course the asker may manage (checked first, the same way as creating one by hand).
  r.post('draft', { roles: ['ADMIN', 'TEACHER'] }, async ({ body, user }) => {
    const courseId = str((body ?? {}).courseId);
    if (!courseId) throw new BadRequestException('Choose the course.');
    await quizzes.assertCanManage(courseId, user);
    return draftQuiz(user, body ?? {});
  });
  r.get('', ({ user }) => quizzes.findAll(user));
  r.get<{ id: string }>(':id', ({ params, user }) => quizzes.findOne(params.id, user));
  r.patch<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params, body, user }) => quizzes.update(params.id, validate<UpdateQuizDto>(UpdateQuizDto, body), user));
  r.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params, user }) => quizzes.remove(params.id, user));
  r.get<{ id: string }>(':id/submissions', { roles: ['ADMIN', 'TEACHER'] }, ({ params, user }) => quizzes.getSubmissions(params.id, user));
  r.get('teacher/offline-pending', { roles: ['TEACHER', 'ADMIN'] }, ({ user }) => quizzes.offlinePending(user));
  r.post<{ id: string }>('offline/:id/decide', { roles: ['TEACHER', 'ADMIN'] }, ({ params, body, user }) => quizzes.decideOffline(params.id, body.accept === true, user));
  r.get('teacher/my-quizzes', { roles: ['TEACHER', 'ADMIN'] }, ({ user }) => quizzes.getTeacherQuizzes(user.id));
  r.get('student/my-quizzes', { roles: ['STUDENT', 'ADMIN'] }, ({ user }) => quizzes.getStudentQuizzes(user.id));
  // AI receipts (Stage 5 · Q22): the AI help on the student's record since they started.
  r.get<{ id: string }>(':id/ai-receipt', { roles: ['STUDENT'] }, ({ user, params }) => quizzes.receiptPreview(params.id, user.id));
  r.post<{ id: string }>(':id/start', { roles: ['STUDENT'] }, ({ user, params }) => quizzes.start(params.id, user.id));
  // One-way exams (Stage 5 · B4.3): each answer saved as the student moves on.
  r.post<{ id: string }>(':id/answer', { roles: ['STUDENT'] }, ({ user, params, body }) => quizzes.answer(params.id, user.id, (body ?? {}) as Record<string, unknown>));
  r.post<{ id: string }>(':id/submit', { roles: ['STUDENT'] }, async ({ user, params, body, req }) => {
    const answers = body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new BadRequestException('answers are required');
    const result = await quizzes.submitQuiz(user.id, params.id, answers as Prisma.InputJsonObject, body.offline as Parameters<typeof quizzes.submitQuiz>[3], body.integrity, { choice: body.aiReceipt, timeUp: body.timeUp === true });
    recordStudy(user.id, req);
    return result;
  });

  // Paper exams (M291): printed versions A–D from the question bank, marking with rubrics, totals to the gradebook.
  const papers = router.controller('exam-papers', { roles: ['ADMIN', 'TEACHER'] });
  papers.get('', ({ user, query }) => listPapers(user, str(query.courseId) ?? ''));
  papers.post('', ({ user, body }) => createPaper(user, body));
  papers.get<{ id: string }>(':id', ({ user, params }) => getPaper(user, params.id));
  papers.post<{ id: string }>(':id/marks', ({ user, params, body }) => saveMarks(user, params.id, body));
  papers.post<{ id: string }>(':id/post', ({ user, params }) => postPaper(user, params.id));
  // M324: the same questions as an online quiz (a draft).
  papers.post<{ id: string }>(':id/to-quiz', ({ user, params }) => paperToQuiz(user, params.id));
  papers.delete<{ id: string }>(':id', ({ user, params }) => removePaper(user, params.id));
}
