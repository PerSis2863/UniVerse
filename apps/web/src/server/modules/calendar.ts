import type { Router } from '../router';
import { CalendarService } from '../services/calendar.service';
import { assertManagesCourse } from '../access';
import type { Body } from '../body';
import type { User } from '@prisma/client';

/** An event on a course shows in its students' calendars: only the course's teacher (or an admin) may add one. */
async function checkCourse(body: Body, user: User) {
  if (body.courseId != null && body.courseId !== '') await assertManagesCourse(String(body.courseId), user);
}

const calendar = new CalendarService();

export default function calendarModule(router: Router) {
  const r = router.controller('calendar');

  r.get('my', ({ user }) => calendar.getMyEvents(user.id));
  r.post('', async ({ user, body }) => { await checkCourse(body, user); return calendar.create(user.id, body); });
  r.patch<{ id: string }>(':id', async ({ params, user, body }) => { await checkCourse(body, user); return calendar.update(params.id, user.id, body); });
  r.delete<{ id: string }>(':id', ({ params, user }) => calendar.remove(params.id, user.id));
}
