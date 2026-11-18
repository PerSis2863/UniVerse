import type { Router } from '../router';
import { bookSlot, cancelBooking, officeSlots, openSlots, removeSlot, waitForSlot } from '../office-slots';

// UniVersity's additions from M295 on (the owner's 32 features of 18 Nov), each group under its own path.
export default function schoolPlusModule(router: Router) {
  // Office hours you can book, with a waiting list (M295).
  const slots = router.controller('office-slots');
  slots.get('', ({ user }) => officeSlots(user));
  slots.post('', { roles: ['ADMIN', 'TEACHER'] }, ({ user, body }) => openSlots(user, body));
  slots.post<{ id: string }>(':id/book', { roles: ['STUDENT'] }, ({ user, params, body }) => bookSlot(user, params.id, body));
  slots.post<{ id: string }>(':id/wait', { roles: ['STUDENT'] }, ({ user, params, body }) => waitForSlot(user, params.id, body));
  slots.post<{ id: string }>(':id/cancel', { roles: ['STUDENT'] }, ({ user, params }) => cancelBooking(user, params.id));
  slots.delete<{ id: string }>(':id', { roles: ['ADMIN', 'TEACHER'] }, ({ user, params }) => removeSlot(user, params.id));

}
