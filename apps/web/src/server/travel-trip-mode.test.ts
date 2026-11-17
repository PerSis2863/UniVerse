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
