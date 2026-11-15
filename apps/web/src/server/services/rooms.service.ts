import { NotFoundException, ConflictException } from '../http';
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

    // Check if already booked
    const existing = await prisma.roomReservation.findUnique({
      where: {
        roomId_date_time: {
          roomId: data.roomId,
          date: data.date,
          time: data.time,
        }
      }
    });

    if (existing) {
      throw new ConflictException('Room is already booked for this time slot');
    }

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
