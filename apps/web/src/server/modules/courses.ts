import type { Router } from '../router';
import prisma from '@/lib/db';
import { num } from '../trace';
import { dailyCounts } from '@/lib/daily-counts';
import { CoursesService } from '../services/courses.service';
import { audit } from '../audit';
import { first, str } from '../body';

const courses = new CoursesService();

export default function coursesModule(router: Router) {
  const r = router.controller('courses');

  r.get('', ({ query, user }) => courses.findAll({ search: first(query.search), department: first(query.department) }, user));
  r.get('admin/all', { roles: ['ADMIN'] }, ({ user }) => courses.findAllForAdmin(user));
  r.get('my', ({ user }) => (user.role === 'TEACHER' ? courses.findForTeacher(user.id) : courses.findForStudent(user.id)));
  // M143: each of the teacher's own courses' hand-ins per day over the last 14 days, in the viewer's
  // time zone (`tz`, minutes east of UTC): the courses page's small charts. The newest 5,000.
  r.get('my/activity', { roles: ['TEACHER'] }, async ({ user, query }) => {
    const mine = (await prisma.course.findMany({ where: { teacherId: user.id }, select: { id: true }, take: 90 })).map((c) => c.id);
    const rows = mine.length ? await prisma.assignmentSubmission.findMany({
      where: { submittedAt: { gte: new Date(Date.now() - 15 * 86_400_000) }, assignment: { courseId: { in: mine } } },
      select: { submittedAt: true, assignment: { select: { courseId: true } } }, orderBy: { submittedAt: 'desc' }, take: 5000,
    }) : [];
    return dailyCounts(rows.map((r) => ({ key: r.assignment.courseId, at: r.submittedAt })), mine, 14, Date.now(), num(query.tz, -840, 840) ?? 0);
  });
  r.get('my-students', ({ user }) => (user.role === 'TEACHER' ? courses.findMyStudents(user.id) : []));
  r.get<{ id: string }>(':id', ({ params, user }) => courses.findOne(params.id, user));

  r.post('', { roles: ['TEACHER', 'ADMIN'] }, async ({ user, body, req }) => {
    const teacherId = (user.role === 'ADMIN' && str(body.teacherId)) || user.id;
    const course = await courses.create(teacherId, body, user);
    audit(user, { action: 'course.created', summary: `Created course ${course.code} · ${course.name}`, targetType: 'course', targetId: course.id }, req);
    return course;
  });

  r.patch<{ id: string }>(':id', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, user, body, req }) => {
    const course = await courses.update(params.id, user, body);
    const changed = Object.keys(body ?? {}).filter((k) => ['code', 'name', 'description', 'credits', 'department', 'color', 'emoji', 'status', 'teacherId'].includes(k));
    if (changed.length) {
      const what = body.status ? `status to ${body.status}` : changed.join(', ');
      audit(user, { action: 'course.updated', summary: `Updated ${course.code} (${what})`, targetType: 'course', targetId: course.id, metadata: { fields: changed } }, req);
    }
    return course;
  });

  r.delete<{ id: string }>(':id', { roles: ['TEACHER', 'ADMIN'] }, async ({ params, user, req }) => {
    const course = await courses.remove(params.id, user);
    audit(user, { action: 'course.deleted', summary: `Deleted course ${course.code} · ${course.name}`, targetType: 'course', targetId: params.id }, req);
    return course;
  });

  r.post<{ id: string }>(':id/enroll', { roles: ['STUDENT'] }, ({ params, user }) => courses.enroll(params.id, user.id));
  r.post<{ id: string }>(':id/unenroll', ({ params, user }) => courses.unenroll(params.id, user.id));
}
