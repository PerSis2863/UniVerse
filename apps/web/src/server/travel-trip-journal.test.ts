import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { addJournalEntry, removeJournalEntry, updateJournalEntry } from './travel-trip-journal';
import type { SessionUser } from '@/lib/server-auth';

// M242: a trip's journal is for its members; only an entry's author changes it (the trip's starter may remove it).
vi.mock('@/lib/db', () => ({
  default: {
    travelTripMember: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([{ userId: 'ana' }, { userId: 'ben' }]) },
    travelTripStop: { findMany: vi.fn().mockResolvedValue([{ days: 3 }, { days: 2 }]) },
    travelTripJournal: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'j1' }), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('@/lib/storage', () => ({ isAppFileUrl: (u: unknown) => typeof u === 'string' && u.startsWith('/api/files/') }));

const ana = { id: 'ana' } as SessionUser, ben = { id: 'ben' } as SessionUser;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue({ trip: { id: 't1', ownerId: 'ana' } } as never);
});

describe('trip journal', () => {
  it('keeps a note or an uploaded photo on a day of the trip', async () => {
    await addJournalEntry(ben, 't1', { day: 4, text: '  Sunset   at the castle ', photoUrl: 'https://evil.example/x.jpg', shared: false });
    expect(vi.mocked(prisma.travelTripJournal.create).mock.calls[0][0].data).toMatchObject({ tripId: 't1', userId: 'ben', day: 4, text: 'Sunset at the castle', photoUrl: null, shared: false });
    await expect(addJournalEntry(ben, 't1', { day: 5, text: 'x' })).rejects.toThrow(/day of the trip/);
    await expect(addJournalEntry(ben, 't1', { day: 0 })).rejects.toThrow(/Write something/);
  });
  it('lets only the author change an entry, and the author or the trip’s starter remove it', async () => {
    vi.mocked(prisma.travelTripJournal.findFirst).mockResolvedValue({ userId: 'ben', photoUrl: null } as never);
    await expect(updateJournalEntry(ana, 't1', 'j1', { shared: false })).rejects.toThrow(/Only its author/);
    await updateJournalEntry(ben, 't1', 'j1', { shared: false });
    expect(prisma.travelTripJournal.update).toHaveBeenCalledWith({ where: { id: 'j1' }, data: { shared: false } });
    await removeJournalEntry(ana, 't1', 'j1');
    expect(prisma.travelTripJournal.delete).toHaveBeenCalled();
  });
  it('is only for the trip’s members', async () => {
    vi.mocked(prisma.travelTripMember.findUnique).mockResolvedValue(null);
    await expect(addJournalEntry(ben, 't1', { day: 0, text: 'x' })).rejects.toThrow(/isn’t one of yours/);
  });
});
