import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notifyMany } from './email';
import { morningBriefings } from './travel-briefing';

// M255: the morning briefing goes to everyone on a trip under way, once a day, in the app only.
vi.mock('@/lib/db', () => ({
  default: {
    travelTrip: { findMany: vi.fn() },
    notification: { findFirst: vi.fn() },
    travelTripItem: { findMany: vi.fn().mockResolvedValue([{ id: 'i1', stopId: 's2', day: 0, position: 0, name: 'Livraria Lello', kind: 'see', lat: null, lon: null, hours: null, price: null, minutes: 30 }]) },
    travelTripMember: { findMany: vi.fn().mockResolvedValue([{ userId: 'ana' }, { userId: 'ben' }]) },
  },
}));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));
vi.mock('./travel', () => ({ travelWeather: vi.fn().mockResolvedValue({ days: [{ date: '2027-04-11', min: 11, max: 18, rain: 0 }] }) }));

const now = new Date('2027-04-11T06:00:00Z');
const trip = { id: 't1', startDate: '2027-04-08', stops: [{ id: 's1', name: 'Lisbon', lat: 38.7, lon: -9.1, days: 3 }, { id: 's2', name: 'Porto', lat: 41.1, lon: -8.6, days: 2 }] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.travelTrip.findMany).mockResolvedValue([trip, { ...trip, id: 't2', startDate: '2027-01-01' }] as never); });

describe('morning briefing', () => {
  it('tells everyone on a trip under way about today, once', async () => {
    vi.mocked(prisma.notification.findFirst).mockResolvedValue(null);
    expect(await morningBriefings(() => 40, now)).toEqual({ done: true, info: 1 });
    expect(vi.mocked(notifyMany).mock.calls[0]).toEqual([['ana', 'ben'], { type: 'event', title: 'Day 4: today in Porto', body: 'Livraria Lello 09:00. 11–18°.', link: '/travel/trip?id=t1&part=today&on=2027-04-11', email: false }]);
    vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: 'n1' } as never);
    expect(await morningBriefings(() => 40, now)).toEqual({ done: true, info: 0 });
  });
  it('waits for the next run when out of room', async () => {
    expect(await morningBriefings(() => 5, now)).toEqual({ done: false, info: 0 });
  });
});
