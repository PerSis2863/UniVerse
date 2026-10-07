import type { Router } from '../router';
import type { Prisma } from '@prisma/client';
import { BadRequestException } from '../http';
import { QuizzesService } from '../services/quizzes.service';
import { CreateQuizDto, UpdateQuizDto, validate } from '../dto';
import { recordStudy } from '../streaks';

const quizzes = new QuizzesService();

export default function quizzesModule(router: Router) {
  const r = router.controller('quizzes');

  r.post('', { roles: ['ADMIN', 'TEACHER'] }, ({ body, user }) => quizzes.create(validate<CreateQuizDto>(CreateQuizDto, body), user));
  r.get('', ({ user }) => quizzes.findAll(user));
  r.get<{ id: string }>(':id', ({ params, user }) => quizzes.findOne(params.id, user));
  r.patch<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params, body, user }) => quizzes.update(params.id, validate<UpdateQuizDto>(UpdateQuizDto, body), user));
  r.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params, user }) => quizzes.remove(params.id, user));
  r.get<{ id: string }>(':id/submissions', { roles: ['ADMIN', 'TEACHER'] }, ({ params, user }) => quizzes.getSubmissions(params.id, user));
  r.get('teacher/offline-pending', { roles: ['TEACHER', 'ADMIN'] }, ({ user }) => quizzes.offlinePending(user));
  r.post<{ id: string }>('offline/:id/decide', { roles: ['TEACHER', 'ADMIN'] }, ({ params, body, user }) => quizzes.decideOffline(params.id, body.accept === true, user));
  r.get('teacher/my-quizzes', { roles: ['TEACHER', 'ADMIN'] }, ({ user }) => quizzes.getTeacherQuizzes(user.id));
  r.get('student/my-quizzes', { roles: ['STUDENT', 'ADMIN'] }, ({ user }) => quizzes.getStudentQuizzes(user.id));
  r.post<{ id: string }>(':id/submit', { roles: ['STUDENT'] }, async ({ user, params, body, req }) => {
    const answers = body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new BadRequestException('answers are required');
    const result = await quizzes.submitQuiz(user.id, params.id, answers as Prisma.InputJsonObject, body.offline as Parameters<typeof quizzes.submitQuiz>[3]);
    recordStudy(user.id, req);
    return result;
  });
}
