import type { Router } from '../router';
import { MentorshipService } from '../services/mentorship.service';

const mentorship = new MentorshipService();

export default function mentorshipModule(router: Router) {
  const r = router.controller('mentorship');

  r.get('my', ({ user }) => mentorship.getMyRequests(user.id, user.role));
  r.post('request', ({ user, body }) => mentorship.create(user.id, body));
  r.patch<{ id: string }>(':id', ({ params, user, body }) => mentorship.updateStatus(params.id, user, body));
  r.get<{ id: string }>(':id/sessions', ({ params, user }) => mentorship.getSessions(params.id, user));
  r.post<{ id: string }>(':id/sessions', ({ params, user, body }) => mentorship.addSession(params.id, user, body));
  r.get('mentors', () => mentorship.getIndustryMentors());
  r.post('mentors/profile', ({ user, body }) => mentorship.createMentorProfile(user.id, body));
  r.get('bookings', ({ user }) => mentorship.getBookings(user.id, user.role));
  r.post<{ mentorId: string }>('mentors/:mentorId/book', ({ user, params, body }) => mentorship.createBooking(user.id, params.mentorId, body));
  r.patch<{ id: string }>('bookings/:id/status', ({ params, user, body }) => mentorship.updateBookingStatus(params.id, user, body.status));
}
