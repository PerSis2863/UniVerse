import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notifyMany } from './email';
import { checkInSafe, sharedTrip, shareTrip } from './travel-trip-share';
import type { SessionUser } from '@/lib/server-auth';

// M248: the family link shows the plan without anyone's email, phone or account id; "I'm safe" reaches the others on
// the trip (in the app) and marks the person safe in a Relief emergency around today's city.
vi.mock('@/lib/db', () => ({
  default: {
    travelTripMember: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([{ userId: 'ana' }, { userId: 'ben' }]) },
    travelTrip: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({ shareCode: 'ABCDEFGHJKLMNPQR' }) },
    travelTripStop: { findMany: vi.fn() },
    travelTripItem: { findMany: vi.fn().mockResolvedValue([]) },
    travelTripCheckin: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), deleteMany: vi.fn() },
    travelTripJournal: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'ana', name: 'Ana Silva' }, { id: 'ben', name: 'Ben Ode' }]) },
    reliefIncident: { findMany: vi.fn() },
    reliefSafe: { upsert: vi.fn() },
  },
}));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));
vi.mock('./travel', () => ({ placeOf: vi.fn() }));

const ana = { id: 'ana', name: 'Ana Silva' } as SessionUser;
const today = new Date().toISOString().slice(0, 10);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'ana', name: 'Portugal', startDate: today, shareCode: null } } as never);
  vi.mocked(prisma.travelTripStop.findMany).mockResolvedValue([{ id: 's1', name: 'Lisbon', lat: 38.71, lon: -9.14, days: 3 }] as never);
});

describe('the family link', () => {
  it('turns on with a new unguessable code each time', async () => {
    await shareTrip(ana, 't1');
    expect(vi.mocked(prisma.travelTrip.update).mock.calls[0][0].data.shareCode).toMatch(/^[2-9A-HJ-NP-Z]{16}$/);
  });
  it('shows the plan with first names only, and refuses a wrong code', async () => {
    vi.mocked(prisma.travelTrip.findUnique).mockResolvedValue({ id: 't1', name: 'Portugal', startDate: today, travellers: 2 } as never);
    vi.mocked(prisma.travelTripCheckin.findMany).mockResolvedValue([{ id: 'c1', userId: 'ben', note: 'All good', place: 'Lisbon', createdAt: new Date() }] as never);
    const r = await sharedTrip('abcd-efgh-jklm-npqr');
    expect(r.people).toEqual(['Ana', 'Ben']);
    expect(r.checkins[0]).toMatchObject({ by: 'Ben', note: 'All good' });
    expect(JSON.stringify(r)).not.toMatch(/"userId"|@|Silva|"ana"|"ben"/);
    await expect(sharedTrip('short')).rejects.toThrow(/isn’t working/);
  });
});

describe('I’m safe', () => {
  it('tells the others in the app and marks Relief safe around today’s city', async () => {
    vi.mocked(prisma.reliefIncident.findMany).mockResolvedValue([{ id: 'i1', title: 'Lisbon floods', lat: 38.72, lng: -9.13, radiusKm: 20 }, { id: 'i2', title: 'Far away', lat: 10, lng: 10, radiusKm: 20 }] as never);
    const r = await checkInSafe(ana, 't1', { note: ' Landed ' });
    expect(r).toMatchObject({ place: 'Lisbon', relief: ['Lisbon floods'] });
    expect(vi.mocked(prisma.travelTripCheckin.create).mock.calls[0][0].data).toMatchObject({ userId: 'ana', note: 'Landed', place: 'Lisbon' });
    expect(vi.mocked(notifyMany).mock.calls[0]).toEqual([['ben'], expect.objectContaining({ title: 'Ana is safe', email: false })]);
    expect(prisma.reliefSafe.upsert).toHaveBeenCalledTimes(1);
  });
});
