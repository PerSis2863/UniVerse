import type { Router } from '../router';
import { GradesService } from '../services/grades.service';

const grades = new GradesService();

export default function gradesModule(router: Router) {
  const r = router.controller('grades');

  r.get('student', { roles: ['STUDENT'] }, ({ user }) => grades.getStudentGrades(user.id));
  r.get<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, ({ params, user }) => grades.getCourseGrades(params.courseId, user));
  r.post<{ courseId: string }>('course/:courseId', { roles: ['TEACHER', 'ADMIN'] }, ({ params, user, body }) => grades.postGrade(params.courseId, user, body));
  r.delete<{ gradeId: string }>(':gradeId', { roles: ['TEACHER', 'ADMIN'] }, ({ params, user }) => grades.removeGrade(params.gradeId, user));
}
