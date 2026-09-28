import type { Router } from '../router';
import { CalendarService } from '../services/calendar.service';

const calendar = new CalendarService();

export default function calendarModule(router: Router) {
  const r = router.controller('calendar');

  r.get('my', ({ user }) => calendar.getMyEvents(user.id));
  r.post('', ({ user, body }) => calendar.create(user.id, body));
  r.patch<{ id: string }>(':id', ({ params, user, body }) => calendar.update(params.id, user.id, body));
  r.delete<{ id: string }>(':id', ({ params, user }) => calendar.remove(params.id, user.id));
}
