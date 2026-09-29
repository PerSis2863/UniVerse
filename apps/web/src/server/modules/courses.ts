import type { Router } from '../router';
import { CoursesService } from '../services/courses.service';
import { audit } from '../audit';

const courses = new CoursesService();

export default function coursesModule(router: Router) {
  const r = router.controller('courses');

  r.get('', ({ query }) => courses.findAll(query));
  r.get('admin/all', { roles: ['ADMIN'] }, () => courses.findAllForAdmin());
  r.get('my', ({ user }) => (user.role === 'TEACHER' ? courses.findForTeacher(user.id) : courses.findForStudent(user.id)));
  r.get('my-students', ({ user }) => (user.role === 'TEACHER' ? courses.findMyStudents(user.id) : []));
  r.get<{ id: string }>(':id', ({ params, user }) => courses.findOne(params.id, user));

  r.post('', { roles: ['TEACHER', 'ADMIN'] }, async ({ user, body, req }) => {
    const teacherId = user.role === 'ADMIN' && body.teacherId ? body.teacherId : user.id;
    const course = await courses.create(teacherId, body);
    audit(user, { action: 'course.created', summary: `Created course ${course.code} · ${course.name}`, targetType: 'course', targetId: course.id }, req);
    return course;
  });

  r.patch<{ id: string }>(':id', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, user, body, req }) => {
    const course = await courses.update(params.id, user.id, user.role, body);
    const changed = Object.keys(body ?? {}).filter((k) => ['code', 'name', 'description', 'credits', 'department', 'color', 'emoji', 'status', 'teacherId'].includes(k));
    if (changed.length) {
      const what = body.status ? `status to ${body.status}` : changed.join(', ');
      audit(user, { action: 'course.updated', summary: `Updated ${course.code} (${what})`, targetType: 'course', targetId: course.id, metadata: { fields: changed } }, req);
    }
    return course;
  });

  r.delete<{ id: string }>(':id', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, user, req }) => {
    const course = await courses.remove(params.id, user.id, user.role);
    audit(user, { action: 'course.deleted', summary: `Deleted course ${course.code} · ${course.name}`, targetType: 'course', targetId: params.id }, req);
    return course;
  });

  r.post<{ id: string }>(':id/enroll', { roles: ['STUDENT'] }, ({ params, user }) => courses.enroll(params.id, user.id));
  r.post<{ id: string }>(':id/unenroll', ({ params, user }) => courses.unenroll(params.id, user.id));
}
