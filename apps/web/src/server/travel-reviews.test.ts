import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { saveTravelReview, summary, travelReviews } from './travel-reviews';
import type { SessionUser } from '@/lib/server-auth';

// M209: UniVerse's own reviews of places: locals apart from visitors, first names only, one a person.
vi.mock('@/lib/db', () => ({
  default: {
    travelReview: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0), upsert: vi.fn().mockResolvedValue({ id: 'r1' }) },
    travelReviewReport: { deleteMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
const me = { id: 'me', name: 'Sam Lee' } as SessionUser;
beforeEach(() => vi.clearAllMocks());

describe('travel reviews', () => {
  it('sums locals and visitors apart', () => {
    expect(summary([{ rating: 5, local: true }, { rating: 4, local: true }, { rating: 2, local: false }])).toEqual({ count: 3, average: 3.7, locals: { count: 2, average: 4.5 }, visitors: { count: 1, average: 2 } });
  });
  it('shows writers by first name only, and which one is mine', async () => {
    vi.mocked(prisma.travelReview.findMany).mockResolvedValue([{ id: 'a', userId: 'ana', rating: 5, text: 'Best tarts', local: true, visited: '2026-10', updatedAt: new Date() }, { id: 'b', userId: 'me', rating: 3, text: null, local: false, visited: null, updatedAt: new Date() }] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'ana', name: 'Ana Maria Costa' }, { id: 'me', name: 'Sam Lee' }] as never);
    const r = await travelReviews(me, { place: 'N398922337' });
    expect(r.reviews.map((x) => [x.name, x.local, x.mine])).toEqual([['Ana', true, false], ['Sam', false, true]]);
    expect(JSON.stringify(r)).not.toContain('ana');
    expect(r.mine).toMatchObject({ id: 'b', rating: 3 });
  });
  it('keeps one review a person a place and checks what comes in', async () => {
    await saveTravelReview(me, { place: 'N1', name: 'Café', rating: 4, text: ' Lovely ', local: true, visited: '2099-01' });
    const call = vi.mocked(prisma.travelReview.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ userId_place: { userId: 'me', place: 'N1' } });
    expect(call.create).toMatchObject({ rating: 4, text: 'Lovely', local: true, visited: null });
    await expect(saveTravelReview(me, { place: 'N1', name: 'Café', rating: 6 })).rejects.toThrow(/1 to 5/);
    await expect(saveTravelReview(me, { place: '../x', name: 'Café', rating: 4 })).rejects.toThrow(/Pick a place/);
  });
});
