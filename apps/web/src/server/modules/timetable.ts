import type { Router } from '../router';
import { TimetableService } from '../services/timetable.service';

const timetable = new TimetableService();

export default function timetableModule(router: Router) {
  const r = router.controller('timetable');

  r.get('my', ({ user }) => timetable.findForUser(user.id));
  r.get<{ courseId: string }>('course/:courseId', ({ params }) => timetable.findByCourse(params.courseId));
  r.post('', { roles: ['ADMIN', 'TEACHER'] }, ({ body }) => timetable.create(body));
  r.patch<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params, body }) => timetable.update(params.id, body));
  r.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ params }) => timetable.remove(params.id));
}
