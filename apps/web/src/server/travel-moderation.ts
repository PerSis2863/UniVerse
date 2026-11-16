import prisma from '@/lib/db';
import { NotFoundException } from './http';

// M213: Travel's reported things for the owner console's Moderation list: travellers-board notes and place
// reviews that someone reported (three reports hide one by themselves). The owner hides one, or restores it
// (shown again, its reports cleared).

const TAKE = 40;

export async function travelReports() {
  const [posts, reviews] = await Promise.all([
    prisma.travelBoardPost.findMany({
      where: { reports: { some: {} } }, orderBy: { createdAt: 'desc' }, take: TAKE,
      select: { id: true, userId: true, guide: true, name: true, note: true, hidden: true, createdAt: true, reports: { select: { reason: true }, take: 5 }, _count: { select: { reports: true } } },
    }),
    prisma.travelReview.findMany({
      where: { reports: { some: {} } }, orderBy: { createdAt: 'desc' }, take: TAKE,
      select: { id: true, userId: true, name: true, rating: true, text: true, hidden: true, createdAt: true, reports: { select: { reason: true }, take: 5 }, _count: { select: { reports: true } } },
    }),
  ]);
  const why = (r: { reason: string | null }[]) => r.map((x) => x.reason?.trim()).filter(Boolean).join(' · ') || null;
  const state = (n: number, hidden: boolean) => `${n} report${n === 1 ? '' : 's'} · ${hidden ? 'hidden' : 'still showing'}`;
  return [
    ...posts.map((p) => ({ kind: 'travel-post' as const, id: p.id, userId: p.userId, title: `${p.name} on the ${p.guide} board`, text: `${p.note ?? '(no note)'} · ${state(p._count.reports, p.hidden)}`, reason: why(p.reports), hidden: p.hidden, at: p.createdAt })),
    ...reviews.map((r) => ({ kind: 'travel-review' as const, id: r.id, userId: r.userId, title: `${r.rating}★ review of ${r.name}`, text: `${r.text ?? '(stars only)'} · ${state(r._count.reports, r.hidden)}`, reason: why(r.reports), hidden: r.hidden, at: r.createdAt })),
  ];
}

/** Hide a reported note or review, or restore it (shown again, its reports cleared). */
export async function moderateTravel(kind: 'travel-post' | 'travel-review', id: string, action: 'hide' | 'restore') {
  const hidden = action === 'hide';
  if (kind === 'travel-post') {
    const r = await prisma.travelBoardPost.updateMany({ where: { id }, data: { hidden } });
    if (!r.count) throw new NotFoundException('This note isn’t there any more.');
    if (!hidden) await prisma.travelBoardReport.deleteMany({ where: { postId: id } });
  } else {
    const r = await prisma.travelReview.updateMany({ where: { id }, data: { hidden } });
    if (!r.count) throw new NotFoundException('This review isn’t there any more.');
    if (!hidden) await prisma.travelReviewReport.deleteMany({ where: { reviewId: id } });
  }
}
