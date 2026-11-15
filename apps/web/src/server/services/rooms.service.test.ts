import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { RoomsService } from './rooms.service';

// Rooms are each school's own (M191): the list and a booking only reach the person's school's rooms.

vi.mock('@/lib/db', () => ({ default: { room: { findMany: vi.fn(), findFirst: vi.fn() }, roomReservation: { findUnique: vi.fn(), create: vi.fn() } } }));
const db = prisma as unknown as { room: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }; roomReservation: { create: ReturnType<typeof vi.fn> } };
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
});
