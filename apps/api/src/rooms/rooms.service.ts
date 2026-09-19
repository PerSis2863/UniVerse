import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.room.findMany();
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async bookRoom(userId: string, data: { roomId: string, date: string, time: string, duration: string }) {
    // Check if room exists
    await this.findOne(data.roomId);

    // Check if already booked
    const existing = await this.prisma.roomReservation.findUnique({
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

    return this.prisma.roomReservation.create({
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
    return this.prisma.roomReservation.findMany({
      where: { userId },
      include: { room: true },
      orderBy: [
        { date: 'desc' },
        { time: 'desc' },
      ],
    });
  }

  async cancelBooking(userId: string, reservationId: string) {
    const reservation = await this.prisma.roomReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.userId !== userId) {
      throw new ConflictException('Not authorized to cancel this booking');
    }

    await this.prisma.roomReservation.delete({
      where: { id: reservationId },
    });

    return { success: true };
  }
}
