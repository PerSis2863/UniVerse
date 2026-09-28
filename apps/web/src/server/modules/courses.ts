import type { Router } from '../router';
import { CoursesService } from '../services/courses.service';

const courses = new CoursesService();

export default function coursesModule(router: Router) {
  const r = router.controller('courses');

  r.get('', ({ query }) => courses.findAll(query));
  r.get('admin/all', { roles: ['ADMIN'] }, () => courses.findAllForAdmin());
  r.get('my', ({ user }) => (user.role === 'TEACHER' ? courses.findForTeacher(user.id) : courses.findForStudent(user.id)));
  r.get('my-students', ({ user }) => (user.role === 'TEACHER' ? courses.findMyStudents(user.id) : []));
  r.get<{ id: string }>(':id', ({ params, user }) => courses.findOne(params.id, user));
  r.post('', { roles: ['TEACHER', 'ADMIN'] }, ({ user, body }) => {
    const teacherId = user.role === 'ADMIN' && body.teacherId ? body.teacherId : user.id;
    return courses.create(teacherId, body);
  });
  r.patch<{ id: string }>(':id', { roles: ['TEACHER', 'ADMIN'] }, ({ params, user, body }) => courses.update(params.id, user.id, user.role, body));
  r.delete<{ id: string }>(':id', { roles: ['TEACHER', 'ADMIN'] }, ({ params, user }) => courses.remove(params.id, user.id, user.role));
  r.post<{ id: string }>(':id/enroll', ({ params, user }) => courses.enroll(params.id, user.id));
  r.post<{ id: string }>(':id/unenroll', ({ params, user }) => courses.unenroll(params.id, user.id));
}
