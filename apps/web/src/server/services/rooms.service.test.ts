import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { RoomsService } from './rooms.service';

// Rooms are each school's own (M191): the list and a booking only reach the person's school's rooms.

vi.mock('@/lib/db', () => ({ default: { room: { findMany: vi.fn(), findFirst: vi.fn() }, roomReservation: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() }, timetableSlot: { findMany: vi.fn() } } }));
type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { room: { findMany: Fn; findFirst: Fn }; roomReservation: { create: Fn; findMany: Fn }; timetableSlot: { findMany: Fn } };
const rooms = new RoomsService();

beforeEach(() => vi.clearAllMocks());

describe('rooms per school', () => {
  it('lists only my school’s rooms', async () => {
    db.room.findMany.mockResolvedValue([]);
    await rooms.findAll({ id: 'u', organizationId: 'orgA' });
    expect(db.room.findMany.mock.calls[0][0].where).toEqual({ organizationId: { in: ['orgA'] } });
    await rooms.findAll({ id: 'u2', organizationId: null });
    expect(db.room.findMany.mock.calls[1][0].where).toEqual({ organizationId: null });
  });

  it('another school’s room can’t be booked', async () => {
    db.room.findFirst.mockResolvedValue(null);
    await expect(rooms.bookRoom({ id: 'u', organizationId: 'orgA' }, { roomId: 'rB', date: '2026-11-20', time: '10:00', duration: '1' })).rejects.toThrow('Room not found');
    expect(db.roomReservation.create).not.toHaveBeenCalled();
  });

  // M298: a booking that overlaps another, or a class in the room, is refused.
  it('refuses overlapping bookings and classes', async () => {
    db.room.findFirst.mockResolvedValue({ id: 'r1' });
    db.roomReservation.findMany.mockResolvedValue([{ time: '10:00', duration: '2h' }]);
    db.timetableSlot.findMany.mockResolvedValue([{ startTime: '14:00', endTime: '15:30', course: { code: 'CS101' } }]);
    const me = { id: 'u', organizationId: 'orgA' };
    await expect(rooms.bookRoom(me, { roomId: 'r1', date: '2026-11-20', time: '11:00', duration: '1' })).rejects.toThrow(/already booked/);
    await expect(rooms.bookRoom(me, { roomId: 'r1', date: '2026-11-20', time: '13:30', duration: '1' })).rejects.toThrow(/CS101 has a class/);
    db.roomReservation.create.mockResolvedValue({ id: 'b1' });
    await rooms.bookRoom(me, { roomId: 'r1', date: '2026-11-20', time: '12:00', duration: '1' });
    expect(db.roomReservation.create).toHaveBeenCalledTimes(1);
  });
});
