import type { Router } from '../router';
import prisma from '@/lib/db';
import { GradesService } from '../services/grades.service';
import { audit } from '../audit';
import { later, notify } from '../email';

const grades = new GradesService();

const gradeLabel = (id: string) =>
  prisma.grade.findUnique({
    where: { id },
    select: { assignmentName: true, score: true, maxScore: true, student: { select: { name: true } }, course: { select: { code: true } } },
  });

export default function gradesModule(router: Router) {
  const r = router.controller('grades');

  r.get('student', { roles: ['STUDENT'] }, ({ user }) => grades.getStudentGrades(user.id));
  r.get<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, ({ params, user }) => grades.getCourseGrades(params.courseId, user));

  r.post<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, user, body, req }) => {
    const grade = await grades.postGrade(params.courseId, user, body);
    audit(user, async () => {
      const g = await gradeLabel(grade.id);
      return {
        action: 'grade.posted',
        summary: `Posted ${grade.assignmentName} grade ${grade.score}/${grade.maxScore} for ${g?.student.name ?? 'a student'} in ${g?.course.code ?? 'a course'}`,
        targetType: 'grade',
        targetId: grade.id,
        metadata: { courseId: params.courseId, studentId: grade.studentId, score: grade.score, maxScore: grade.maxScore },
      };
    }, req);
    later(async () => {
      const g = await gradeLabel(grade.id);
      await notify(grade.studentId, {
        type: 'grade',
        title: `New grade in ${g?.course.code ?? 'your course'}`,
        body: `${grade.assignmentName}: ${grade.score}/${grade.maxScore}`,
        link: '/student/grades',
      });
    });
    return grade;
  });

  r.delete<{ gradeId: string }>(':gradeId', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, user, req }) => {
    const before = await gradeLabel(params.gradeId);
    const result = await grades.removeGrade(params.gradeId, user);
    if (before) {
      audit(user, {
        action: 'grade.deleted',
        summary: `Deleted ${before.assignmentName} grade ${before.score}/${before.maxScore} for ${before.student.name} in ${before.course.code}`,
        targetType: 'grade',
        targetId: params.gradeId,
      }, req);
    }
    return result;
  });
}
