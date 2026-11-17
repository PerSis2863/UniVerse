import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { logGreenAction } from './green';
import { updateTravelStop } from './travel-trips';
import type { SessionUser } from '@/lib/server-auth';

// M247: how a leg is travelled; picking the train records one Green action per leg for the one who picked it.
vi.mock('@/lib/db', () => ({
  default: {
    travelTripMember: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([{ userId: 'ana' }]) },
    travelTripStop: { findMany: vi.fn(), update: vi.fn() },
    travelTripItem: { updateMany: vi.fn() },
    travelTrip: { update: vi.fn().mockResolvedValue({}) },
    greenAction: { findFirst: vi.fn() },
  },
}));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./green', () => ({ logGreenAction: vi.fn().mockResolvedValue({ co2Kg: 33.6 }) }));
vi.mock('./travel', () => ({ placeOf: vi.fn() }));

const ana = { id: 'ana' } as SessionUser;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'ana', name: 'Portugal' } } as never);
  vi.mocked(prisma.travelTripStop.findMany).mockResolvedValue([{ id: 's1', days: 2, name: 'Lisbon', lat: 38.71, lon: -9.14 }, { id: 's2', days: 2, name: 'Porto', lat: 41.15, lon: -8.61 }] as never);
});

describe('a leg’s way of travel', () => {
  it('records the train in Green once, for the one who chose it', async () => {
    vi.mocked(prisma.greenAction.findFirst).mockResolvedValue(null);
    const r = await updateTravelStop(ana, 't1', 's2', { mode: 'train', green: true });
    expect(r.green).toEqual({ kg: 33.6 });
    expect(vi.mocked(logGreenAction).mock.calls[0][1]).toMatchObject({ kind: 'TRANSIT', note: 'Train: Lisbon → Porto (Portugal)', place: 'Porto' });
    vi.mocked(prisma.greenAction.findFirst).mockResolvedValue({ id: 'g1' } as never);
    expect((await updateTravelStop(ana, 't1', 's2', { mode: 'train', green: true })).green).toBeNull();
    expect(logGreenAction).toHaveBeenCalledTimes(1);
  });
  it('refuses a way that isn’t one, and keeps days working', async () => {
    await expect(updateTravelStop(ana, 't1', 's2', { mode: 'rocket' })).rejects.toThrow(/how you’ll travel/);
    await updateTravelStop(ana, 't1', 's2', { days: 1 });
    expect(prisma.travelTripStop.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { days: 1 } });
    expect(prisma.travelTripItem.updateMany).toHaveBeenCalled();
  });
});

describe('copying a trip (M256)', () => {
  it('copies cities and planned places into a new trip of my own, five places a query', async () => {
    const { copyTravelTrip } = await import('./travel-trips');
    const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
    db.travelTripMember.count = vi.fn().mockResolvedValue(3);
    db.travelTrip.create = vi.fn().mockResolvedValue({ id: 'new' });
    db.travelTripItem.findMany = vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, stopId: 's2', day: 0, position: i, name: `P${i}`, kind: 'see', lat: null, lon: null, hours: null, price: null, minutes: 60, note: null, address: null, url: null })));
    db.travelTripItem.createMany = vi.fn();
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'zoe', name: 'Portugal', travellers: 2, style: 'mid', currency: 'EUR' } } as never);
    vi.mocked(prisma.travelTripStop.findMany).mockResolvedValueOnce([{ id: 's1', guide: 'Lisbon', name: 'Lisbon', cc: 'PT', lat: 1, lon: 2, days: 2, position: 0, mode: null }, { id: 's2', guide: 'Porto', name: 'Porto', cc: 'PT', lat: 3, lon: 4, days: 2, position: 1, mode: 'train' }] as never)
      .mockResolvedValueOnce([{ id: 'n1', position: 0 }, { id: 'n2', position: 1 }] as never);
    expect(await copyTravelTrip(ana, 't1', {})).toEqual({ trip: { id: 'new' } });
    const made = db.travelTrip.create.mock.calls[0][0].data;
    expect(made).toMatchObject({ ownerId: 'ana', name: 'Portugal (copy)', members: { create: { userId: 'ana' } } });
    expect(made.stops.create[1]).toMatchObject({ guide: 'Porto', mode: 'train', position: 1 });
    expect(db.travelTripItem.createMany).toHaveBeenCalledTimes(3);
    expect(db.travelTripItem.createMany.mock.calls[0][0].data[0]).toMatchObject({ tripId: 'new', stopId: 'n2', name: 'P0', addedById: 'ana' });
  });
});

describe('the trip chat (M258)', () => {
  it('makes one group chat of everyone on the trip, then keeps its people the same', async () => {
    const { tripChat } = await import('./travel-trips');
    const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
    db.conversation = { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'c1' }) };
    db.conversationParticipant = { createMany: vi.fn(), deleteMany: vi.fn() };
    vi.mocked(prisma.travelTripMember.findMany).mockResolvedValue([{ userId: 'ana' }, { userId: 'ben' }] as never);
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'ana', name: 'Portugal', chatId: null } } as never);
    expect(await tripChat(ana, 't1')).toEqual({ conversationId: 'c1' });
    expect(db.conversation.create.mock.calls[0][0].data).toMatchObject({ isGroup: true, name: 'Portugal', app: 'travel', participants: { create: [{ userId: 'ana', role: 'ADMIN' }, { userId: 'ben', role: 'MEMBER' }] } });
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'ana', name: 'Portugal', chatId: 'c1' } } as never);
    db.conversation.findUnique.mockResolvedValue({ id: 'c1', participants: [{ userId: 'ana' }, { userId: 'zoe' }] });
    expect(await tripChat(ana, 't1')).toEqual({ conversationId: 'c1' });
    expect(db.conversationParticipant.createMany).toHaveBeenCalledWith({ data: [{ conversationId: 'c1', userId: 'ben' }] });
    expect(db.conversationParticipant.deleteMany).toHaveBeenCalledWith({ where: { conversationId: 'c1', userId: { in: ['zoe'] } } });
  });
});
