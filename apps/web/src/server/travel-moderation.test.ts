import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { moderateTravel, travelReports } from './travel-moderation';

// M213: Travel's reported board notes and reviews reach the owner console; Restore shows one again and clears its reports.
vi.mock('@/lib/db', () => ({
  default: {
    travelBoardPost: { findMany: vi.fn(), updateMany: vi.fn() },
    travelReview: { findMany: vi.fn(), updateMany: vi.fn() },
    travelBoardReport: { deleteMany: vi.fn() },
    travelReviewReport: { deleteMany: vi.fn() },
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('Travel reports for the owner', () => {
  it('lists reported notes and reviews with their reasons and whether they still show', async () => {
    const at = new Date('2026-11-10T10:00:00Z');
    vi.mocked(prisma.travelBoardPost.findMany).mockResolvedValue([{ id: 'p1', userId: 'u1', guide: 'Lisbon', name: 'Ana', note: 'Buy my tour', hidden: false, createdAt: at, reports: [{ reason: 'spam' }, { reason: null }], _count: { reports: 2 } }] as never);
    vi.mocked(prisma.travelReview.findMany).mockResolvedValue([{ id: 'r1', userId: 'u2', name: 'Café Luz', rating: 1, text: null, hidden: true, createdAt: at, reports: [], _count: { reports: 3 } }] as never);
    const list = await travelReports();
    expect(list[0]).toMatchObject({ kind: 'travel-post', title: 'Ana on the Lisbon board', reason: 'spam', hidden: false, text: 'Buy my tour · 2 reports · still showing' });
    expect(list[1]).toMatchObject({ kind: 'travel-review', title: '1★ review of Café Luz', reason: null, hidden: true, text: '(stars only) · 3 reports · hidden' });
  });

  it('hides, or restores and clears the reports; something gone is a 404', async () => {
    vi.mocked(prisma.travelReview.updateMany).mockResolvedValue({ count: 1 });
    await moderateTravel('travel-review', 'r1', 'hide');
    expect(prisma.travelReviewReport.deleteMany).not.toHaveBeenCalled();
    await moderateTravel('travel-review', 'r1', 'restore');
    expect(prisma.travelReview.updateMany).toHaveBeenLastCalledWith({ where: { id: 'r1' }, data: { hidden: false } });
    expect(prisma.travelReviewReport.deleteMany).toHaveBeenCalledWith({ where: { reviewId: 'r1' } });
    vi.mocked(prisma.travelBoardPost.updateMany).mockResolvedValue({ count: 0 });
    await expect(moderateTravel('travel-post', 'gone', 'hide')).rejects.toThrow(/isn’t there/);
  });
});
