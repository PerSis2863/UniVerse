import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { isAppFileUrl } from '@/lib/storage';
import { tripDays } from '@/lib/travel-plan';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { str, type Body } from './body';
import { publish } from './realtime';
import { shortName } from './play';
import { memberIds, tripFor } from './travel-trips';

// M242: a trip's journal: notes and photos on the days of the trip by the people planning it (members only, checked
// by tripFor), told as a story with the route on the page. Changes reach the others' open pages live. An author can
// keep an entry out of the family link (M248) with `shared`.

const MAX = 500;
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/[ \t]+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const tell = async (tripId: string) => publish(await memberIds(tripId), { type: 'refresh', keys: [`/travel/trips/${tripId}/journal`] });

/** GET /travel/trips/:id/journal: the entries, by day then time, with their authors' first names. */
export async function tripJournal(u: SessionUser, id: string) {
  await tripFor(u, id);
  const rows = await prisma.travelTripJournal.findMany({ where: { tripId: id }, orderBy: [{ day: 'asc' }, { createdAt: 'asc' }], take: MAX });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  return { entries: rows.map((r) => ({ id: r.id, day: r.day, text: r.text, photoUrl: r.photoUrl, place: r.place, shared: r.shared, mine: r.userId === u.id, by: shortName(people.find((p) => p.id === r.userId)?.name), createdAt: r.createdAt })) };
}

/** POST /travel/trips/:id/journal { day, text?, photoUrl?, place?, shared? } */
export async function addJournalEntry(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const days = tripDays(await prisma.travelTripStop.findMany({ where: { tripId: id }, select: { days: true }, take: 12 }));
  const day = typeof b.day === 'number' && Number.isInteger(b.day) && b.day >= 0 && b.day < Math.max(1, days) ? b.day : null;
  if (day === null) throw new BadRequestException('Pick a day of the trip.');
  const text = clip(b.text, 2000), photoUrl = isAppFileUrl(b.photoUrl) ? b.photoUrl : null;
  if (!text && !photoUrl) throw new BadRequestException('Write something or add a photo.');
  if ((await prisma.travelTripJournal.count({ where: { tripId: id } })) >= MAX) throw new BadRequestException(`A trip’s journal keeps ${MAX} entries.`);
  const entry = await prisma.travelTripJournal.create({ data: { tripId: id, userId: u.id, day, text, photoUrl, place: clip(b.place, 80), shared: b.shared !== false }, select: { id: true } });
  await tell(id);
  return { entry };
}

/** PATCH /travel/trips/:id/journal/:entryId { text?, shared? }: the author only. */
export async function updateJournalEntry(u: SessionUser, id: string, entryId: string, b: Body) {
  await tripFor(u, id);
  const e = await prisma.travelTripJournal.findFirst({ where: { id: entryId, tripId: id }, select: { userId: true, photoUrl: true } });
  if (!e) throw new NotFoundException('That entry isn’t there any more.');
  if (e.userId !== u.id) throw new ForbiddenException('Only its author can change it.');
  const data: { text?: string | null; shared?: boolean } = {};
  if ('text' in b) { data.text = clip(b.text, 2000); if (!data.text && !e.photoUrl) throw new BadRequestException('Write something.'); }
  if (typeof b.shared === 'boolean') data.shared = b.shared;
  await prisma.travelTripJournal.update({ where: { id: entryId }, data });
  await tell(id);
  return { ok: true };
}

/** DELETE /travel/trips/:id/journal/:entryId: its author, or the person who started the trip. */
export async function removeJournalEntry(u: SessionUser, id: string, entryId: string) {
  const trip = await tripFor(u, id);
  const e = await prisma.travelTripJournal.findFirst({ where: { id: entryId, tripId: id }, select: { userId: true } });
  if (!e) throw new NotFoundException('That entry isn’t there any more.');
  if (e.userId !== u.id && trip.ownerId !== u.id) throw new ForbiddenException('Only its author can remove it.');
  await prisma.travelTripJournal.delete({ where: { id: entryId } });
  await tell(id);
  return { ok: true };
}

/**
 * M321: POST /travel/trips/:id/journal/photos { day, photoUrls, place? }: several photos into the trip's album at once
 * (each a journal entry with its photo, on that day; 20 a request).
 */
export async function addAlbumPhotos(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const days = tripDays(await prisma.travelTripStop.findMany({ where: { tripId: id }, select: { days: true }, take: 12 }));
  const day = typeof b.day === 'number' && Number.isInteger(b.day) && b.day >= 0 && b.day < Math.max(1, days) ? b.day : null;
  if (day === null) throw new BadRequestException('Pick a day of the trip.');
  const urls = (Array.isArray(b.photoUrls) ? b.photoUrls : []).filter(isAppFileUrl).slice(0, 20);
  if (!urls.length) throw new BadRequestException('Add at least one photo.');
  if ((await prisma.travelTripJournal.count({ where: { tripId: id } })) + urls.length > MAX) throw new BadRequestException(`A trip keeps ${MAX} journal entries and photos.`);
  const place = clip(b.place, 80);
  // Groups of 10 (8 values each; D1 takes 100 a statement).
  for (let i = 0; i < urls.length; i += 10) await prisma.travelTripJournal.createMany({ data: urls.slice(i, i + 10).map((photoUrl) => ({ tripId: id, userId: u.id, day, photoUrl, place, shared: b.shared !== false })) });
  await tell(id);
  return { added: urls.length };
}
