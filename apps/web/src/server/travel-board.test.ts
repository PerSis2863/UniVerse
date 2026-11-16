import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { directChat } from './direct-chat';
import { joinTravelBoard, messageTraveller, travelBoard, travelChatBlocked } from './travel-board';
import type { SessionUser } from '@/lib/server-auth';

// M207: the travellers board is for adults who opted in, shows only first names and dates, and keeps
// blocked people apart.
vi.mock('@/lib/db', () => ({
  default: {
    user: { findUnique: vi.fn() },
    travelBoardPost: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), upsert: vi.fn().mockResolvedValue({ id: 'p-me' }) },
    travelBlock: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    conversationParticipant: { findFirst: vi.fn() },
  },
}));
vi.mock('./safety', async () => {
  const { default: db } = await import('@/lib/db');
  // As the real adultOnly: a birth date under 18, or a student with none (this school counts students as under 18).
  return { adultOnly: async (u: { id: string }, refuse: string) => {
    const me = (await db.user.findUnique({ where: { id: u.id } } as never)) as { role: string; dateOfBirth: Date | null } | null;
    if (!me || (me.dateOfBirth ? Date.now() - me.dateOfBirth.getTime() < 18 * 365.25 * 86_400_000 : me.role === 'STUDENT')) throw new Error(refuse);
  } };
});
vi.mock('./direct-chat', () => ({ directChat: vi.fn().mockResolvedValue('c1') }));

const me = { id: 'me', name: 'Sam Lee' } as SessionUser;
const adult = { role: 'MEMBER', dateOfBirth: new Date('1995-01-01'), organizationId: null };
const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10), later = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
const ask = { guide: 'Lisbon', from: soon, to: later, note: 'Up for a food tour', adult: true };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.travelBlock.findMany).mockResolvedValue([]); vi.mocked(prisma.travelBoardPost.count).mockResolvedValue(0); });

describe('joining the board', () => {
  it('takes an adult, with their first name only', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adult as never);
    await joinTravelBoard(me, ask);
    expect(vi.mocked(prisma.travelBoardPost.upsert).mock.calls[0][0].create).toMatchObject({ name: 'Sam', guide: 'Lisbon', fromDate: soon, toDate: later });
  });
  it('refuses under-18s, students their school counts as under 18, and anyone not ticking 18+', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...adult, dateOfBirth: new Date(Date.now() - 16 * 365 * 86_400_000) } as never);
    await expect(joinTravelBoard(me, ask)).rejects.toThrow(/adults/);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: 'STUDENT', dateOfBirth: null, organizationId: 'o1' } as never);
    await expect(joinTravelBoard(me, ask)).rejects.toThrow(/adults/);
    await expect(joinTravelBoard(me, { ...ask, adult: false })).rejects.toThrow(/18 or over/);
    expect(prisma.travelBoardPost.upsert).not.toHaveBeenCalled();
  });
});

describe('seeing the board', () => {
  it('shows only a count to someone not on it', async () => {
    vi.mocked(prisma.travelBoardPost.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.travelBoardPost.count).mockResolvedValue(4);
    expect(await travelBoard(me, { guide: 'Lisbon' })).toEqual({ mine: null, people: [], count: 4 });
    expect(prisma.travelBoardPost.findMany).not.toHaveBeenCalled();
  });
  it('shows others by first name and dates, never their account, and not people blocked either way', async () => {
    vi.mocked(prisma.travelBoardPost.findUnique).mockResolvedValue({ id: 'p-me', fromDate: soon, toDate: later, note: null, hidden: false } as never);
    vi.mocked(prisma.travelBlock.findMany).mockResolvedValue([{ userId: 'ben', blockedId: 'me' }] as never);
    vi.mocked(prisma.travelBoardPost.findMany).mockResolvedValue([
      { id: 'p1', userId: 'ana', name: 'Ana', fromDate: soon, toDate: later, note: 'Hi' },
      { id: 'p2', userId: 'ben', name: 'Ben', fromDate: soon, toDate: later, note: null },
    ] as never);
    const r = await travelBoard(me, { guide: 'Lisbon' });
    expect(r.people).toEqual([{ id: 'p1', name: 'Ana', fromDate: soon, toDate: later, note: 'Hi' }]);
  });
});

describe('messaging', () => {
  it('opens a Travel chat only with someone on the same city’s board', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adult as never);
    vi.mocked(prisma.travelBoardPost.findFirst).mockResolvedValue({ id: 'p1', userId: 'ana', guide: 'Lisbon' } as never);
    vi.mocked(prisma.travelBoardPost.count).mockResolvedValueOnce(0);
    await expect(messageTraveller(me, 'p1')).rejects.toThrow(/isn’t on the board/);
    vi.mocked(prisma.travelBoardPost.count).mockResolvedValueOnce(1);
    expect(await messageTraveller(me, 'p1')).toEqual({ conversationId: 'c1' });
    expect(directChat).toHaveBeenCalledWith('me', 'ana', 'travel');
  });
});

describe('a chat after a block (M213)', () => {
  it('refuses sending either way, and says who blocked only to the one who did', async () => {
    vi.mocked(prisma.conversationParticipant.findFirst).mockResolvedValue({ userId: 'ana' } as never);
    vi.mocked(prisma.travelBlock.findFirst).mockResolvedValueOnce(null);
    expect(await travelChatBlocked('c1', 'me')).toBeNull();
    vi.mocked(prisma.travelBlock.findFirst).mockResolvedValueOnce({ userId: 'me' } as never);
    expect(await travelChatBlocked('c1', 'me')).toMatch(/You blocked/);
    vi.mocked(prisma.travelBlock.findFirst).mockResolvedValueOnce({ userId: 'ana' } as never);
    expect(await travelChatBlocked('c1', 'me')).toMatch(/isn’t taking messages/);
  });
});
