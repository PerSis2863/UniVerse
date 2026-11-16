import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { isPlaceKey } from '@/lib/travel-place';
import { BadRequestException, NotFoundException } from './http';
import { first, str, type Body, type Query } from './body';
import { shortName } from './play';

// Reviews of real places by UniVerse's own people (M209, the owner chose these over paid services): stars,
// a few words, when they went, and "I live here", so the map can say what locals think apart from
// visitors. Shown with the writer's first name only. One review a person a place (changed, not doubled);
// 30 a day; three reports hide one.

const DAY = 86_400_000, HIDE_AT = 3, MAX_SHOWN = 50;
type Row = { rating: number; local: boolean };
const avg = (rows: Row[]) => (rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10 : null);
export const summary = (rows: Row[]) => {
  const locals = rows.filter((r) => r.local), visitors = rows.filter((r) => !r.local);
  return { count: rows.length, average: avg(rows), locals: { count: locals.length, average: avg(locals) }, visitors: { count: visitors.length, average: avg(visitors) } };
};

/** GET /travel/reviews?place=N123: a place's reviews, locals' and visitors' apart, newest first. */
export async function travelReviews(u: SessionUser, q: Query) {
  const place = first(q.place);
  if (!isPlaceKey(place)) throw new BadRequestException('Pick a place.');
  const rows = await prisma.travelReview.findMany({ where: { place, hidden: false }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, userId: true, rating: true, text: true, local: true, visited: true, updatedAt: true } });
  const names = rows.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(rows.slice(0, MAX_SHOWN).map((r) => r.userId))] } }, select: { id: true, name: true } }) : [];
  const mine = rows.find((r) => r.userId === u.id) ?? null;
  return {
    summary: summary(rows),
    reviews: rows.slice(0, MAX_SHOWN).map((r) => ({ id: r.id, name: shortName(names.find((n) => n.id === r.userId)?.name), rating: r.rating, text: r.text, local: r.local, visited: r.visited, at: r.updatedAt, mine: r.userId === u.id })),
    mine: mine && { id: mine.id, rating: mine.rating, text: mine.text, local: mine.local, visited: mine.visited },
  };
}

/** GET /travel/reviews/near?s=&w=&n=&e=: reviewed places in a map's view, with their average (and locals'). */
export async function travelReviewsNear(_u: SessionUser, q: Query) {
  const [s, w, n, e] = ['s', 'w', 'n', 'e'].map((k) => Number(first(q[k])));
  if (![s, w, n, e].every(Number.isFinite) || s > n || n - s > 2 || Math.abs(e - w) > 3) return { places: [] }; // a city's view at most
  const rows = await prisma.travelReview.findMany({ where: { hidden: false, lat: { gte: s, lte: n }, lon: { gte: Math.min(w, e), lte: Math.max(w, e) } }, take: 1000, select: { place: true, name: true, lat: true, lon: true, rating: true, local: true } });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.place, [...(by.get(r.place) ?? []), r]);
  return { places: [...by.entries()].slice(0, 200).map(([place, list]) => ({ place, name: list[0].name, lat: list[0].lat, lon: list[0].lon, ...summary(list) })) };
}

/** POST /travel/reviews { place, name, lat, lon, rating, text, local, visited }: mine for a place (changed if I wrote one). */
export async function saveTravelReview(u: SessionUser, b: Body) {
  const place = b.place, name = (str(b.name) ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!isPlaceKey(place) || !name) throw new BadRequestException('Pick a place.');
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestException('Give it 1 to 5 stars.');
  const text = (str(b.text) ?? '').trim().slice(0, 2000) || null;
  const visited = typeof b.visited === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.visited) && b.visited <= new Date().toISOString().slice(0, 7) ? b.visited : null;
  const lat = typeof b.lat === 'number' && Math.abs(b.lat) <= 90 ? b.lat : null, lon = typeof b.lon === 'number' && Math.abs(b.lon) <= 180 ? b.lon : null;
  if ((await prisma.travelReview.count({ where: { userId: u.id, updatedAt: { gt: new Date(Date.now() - DAY) } } })) >= 30) throw new BadRequestException('That’s 30 reviews today: write more tomorrow.');
  const data = { name, lat, lon, rating, text, local: b.local === true, visited, hidden: false };
  const review = await prisma.travelReview.upsert({ where: { userId_place: { userId: u.id, place } }, create: { userId: u.id, place, ...data }, update: data, select: { id: true } });
  // A changed review starts afresh: earlier reports were about the old words.
  await prisma.travelReviewReport.deleteMany({ where: { reviewId: review.id } });
  return { review };
}

/** DELETE /travel/reviews/:id: only my own. */
export async function deleteTravelReview(u: SessionUser, id: string) {
  const r = await prisma.travelReview.deleteMany({ where: { id, userId: u.id } });
  if (!r.count) throw new NotFoundException('That review isn’t yours.');
  return { ok: true };
}

/** POST /travel/reviews/:id/report { reason }: once a person; three reports hide it. */
export async function reportTravelReview(u: SessionUser, id: string, b: Body) {
  const review = await prisma.travelReview.findFirst({ where: { id, hidden: false }, select: { id: true, userId: true } });
  if (!review || review.userId === u.id) throw new NotFoundException('That review is gone.');
  const reason = (str(b.reason) ?? '').trim().slice(0, 300) || null;
  await prisma.travelReviewReport.upsert({ where: { reviewId_userId: { reviewId: id, userId: u.id } }, create: { reviewId: id, userId: u.id, reason }, update: { reason } });
  if ((await prisma.travelReviewReport.count({ where: { reviewId: id } })) >= HIDE_AT) await prisma.travelReview.update({ where: { id }, data: { hidden: true } });
  return { ok: true };
}
