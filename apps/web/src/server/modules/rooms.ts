import type { Router } from '../router';
import { RoomsService } from '../services/rooms.service';

const rooms = new RoomsService();

export default function roomsModule(router: Router) {
  const r = router.controller('rooms');

  r.get('', ({ query }) => rooms.findAll(query.date));
  r.get('my-bookings', ({ user }) => rooms.getUserBookings(user.id));
  r.get<{ id: string }>(':id', ({ params }) => rooms.findOne(params.id));
  r.post<{ id: string }>(':id/book', ({ params, body, user }) =>
    rooms.bookRoom(user.id, { roomId: params.id, date: body.date, time: body.time, duration: body.duration }),
  );
  r.delete<{ id: string }>('bookings/:id', ({ params, user }) => rooms.cancelBooking(user.id, params.id));
}
