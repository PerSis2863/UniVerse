import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { addTripPoll, removeTripPoll, voteTripPoll } from './travel-trip-polls';
import type { SessionUser } from '@/lib/server-auth';

// M243: a trip's polls are for its members; votes are checked against the poll's choices.
vi.mock('@/lib/db', () => ({
  default: {
    travelTripMember: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([{ userId: 'ana' }, { userId: 'ben' }]) },
    travelTripPoll: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'p1' }), findFirst: vi.fn(), delete: vi.fn() },
    travelTripVote: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

const ana = { id: 'ana' } as SessionUser, ben = { id: 'ben' } as SessionUser;
const poll = { id: 'p1', options: '["Sintra","Cascais","Évora"]', multi: false, closed: false, createdBy: 'ana' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'ana' } } as never);
  vi.mocked(prisma.travelTripPoll.findFirst).mockResolvedValue(poll as never);
});

describe('trip polls', () => {
  it('asks with two to eight different choices', async () => {
    await addTripPoll(ben, 't1', { kind: 'place', question: ' Day trip? ', options: ['Sintra', 'Sintra', ' Cascais ', ''], multi: true });
    expect(vi.mocked(prisma.travelTripPoll.create).mock.calls[0][0].data).toMatchObject({ kind: 'place', question: 'Day trip?', options: '["Sintra","Cascais"]', multi: true, createdBy: 'ben' });
    await expect(addTripPoll(ben, 't1', { question: 'x', options: ['one'] })).rejects.toThrow(/two choices/);
  });
  it('replaces my vote with my new choices, one unless the poll takes several', async () => {
    await voteTripPoll(ben, 't1', 'p1', { choices: [2] });
    expect(prisma.travelTripVote.deleteMany).toHaveBeenCalledWith({ where: { pollId: 'p1', userId: 'ben' } });
    expect(prisma.travelTripVote.createMany).toHaveBeenCalledWith({ data: [{ pollId: 'p1', userId: 'ben', choice: 2 }] });
    await expect(voteTripPoll(ben, 't1', 'p1', { choices: [0, 1] })).rejects.toThrow(/Pick one/);
    await expect(voteTripPoll(ben, 't1', 'p1', { choices: [7] })).rejects.toThrow(/isn’t in the poll/);
    vi.mocked(prisma.travelTripPoll.findFirst).mockResolvedValue({ ...poll, closed: true } as never);
    await expect(voteTripPoll(ben, 't1', 'p1', { choices: [0] })).rejects.toThrow(/closed/);
  });
  it('lets only its asker or the trip’s starter remove it, and only members see any of it', async () => {
    vi.mocked(prisma.travelTripPoll.findFirst).mockResolvedValue({ ...poll, createdBy: 'ben' } as never);
    await removeTripPoll(ana, 't1', 'p1');
    expect(prisma.travelTripPoll.delete).toHaveBeenCalled();
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'zoe' } } as never);
    vi.mocked(prisma.travelTripPoll.findFirst).mockResolvedValue(poll as never);
    await expect(removeTripPoll(ben, 't1', 'p1')).rejects.toThrow(/Only the person who asked/);
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue(null);
    await expect(voteTripPoll(ben, 't1', 'p1', { choices: [0] })).rejects.toThrow(/isn’t one of yours/);
  });
});
