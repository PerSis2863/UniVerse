import { BadRequestException, NotFoundException, ConflictException } from '../http';
import { bookingMinutes, clockMinutes, weekdayOf } from '@/lib/campus-map';
import { overlaps } from '@/lib/room-finder';
import prisma from '@/lib/db';
import { orgIn } from '../school-scope';

// Rooms are each school's own (M191): a person sees and books only their school's rooms (another
// school's room looks like one that doesn't exist). Bookings show only when, never who.
type Who = { id: string; organizationId?: string | null };
const mine = (user: Who) => orgIn([user.organizationId ?? null]);

export class RoomsService {
  findAll(user: Who, date?: string) {
    return prisma.room.findMany({
      where: mine(user), orderBy: { name: 'asc' }, take: 300,
      ...(date ? { include: { reservations: { where: { date }, select: { id: true, roomId: true, date: true, time: true, duration: true } } } } : {}),
    });
  }

  async findOne(user: Who, id: string) {
    const room = await prisma.room.findFirst({ where: { id, ...mine(user) } });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async bookRoom(user: Who, data: { roomId: string, date: string, time: string, duration: string }) {
    const userId = user.id;
    await this.findOne(user, data.roomId);

    // M298: refused when it overlaps another booking or a class in the room that day (not only the same start time).
    const from = clockMinutes(data.time);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || from == null) throw new BadRequestException('Choose a date and a start time.');
    const want = { from, to: from + bookingMinutes(data.duration) };
    const [others, classes] = await Promise.all([
      prisma.roomReservation.findMany({ where: { roomId: data.roomId, date: data.date }, select: { time: true, duration: true }, take: 200 }),
      prisma.timetableSlot.findMany({ where: { roomId: data.roomId, dayOfWeek: weekdayOf(data.date) }, select: { startTime: true, endTime: true, course: { select: { code: true } } }, take: 100 }),
    ]);
    if (others.some((o) => { const f = clockMinutes(o.time); return f != null && overlaps(want, { from: f, to: f + bookingMinutes(o.duration) }); })) {
      throw new ConflictException('Room is already booked for this time slot');
    }
    const lesson = classes.find((c) => { const f = clockMinutes(c.startTime), t = clockMinutes(c.endTime); return f != null && t != null && overlaps(want, { from: f, to: t }); });
    if (lesson) throw new ConflictException(`${lesson.course.code} has a class in this room then`);

    return prisma.roomReservation.create({
      data: {
        userId,
        roomId: data.roomId,
        date: data.date,
        time: data.time,
        duration: data.duration,
      },
      include: { room: true },
    });
  }

  getUserBookings(userId: string) {
    return prisma.roomReservation.findMany({
      where: { userId },
      include: { room: true },
      orderBy: [
        { date: 'desc' },
        { time: 'desc' },
      ],
    });
  }

  async cancelBooking(userId: string, reservationId: string) {
    const reservation = await prisma.roomReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.userId !== userId) {
      throw new ConflictException('Not authorized to cancel this booking');
    }

    await prisma.roomReservation.delete({
      where: { id: reservationId },
    });

    return { success: true };
  }
}
