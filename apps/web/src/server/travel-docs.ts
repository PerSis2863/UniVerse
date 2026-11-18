import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { DOC_KINDS, dueAlerts } from '@/lib/travel-docs';
import { addDays, isDay, tripDays } from '@/lib/travel-plan';
import { BadRequestException, NotFoundException } from './http';
import { first, oneOf, str, type Body, type Query } from './body';
import { notify } from './email';
import { tripFor } from './travel-trips';

// M245: a traveller's documents and their reminders. Every route reads and writes only the asker's own rows (userId
// in every query): nobody else on the trip ever sees them. Names and dates only, never a document's number. The daily
// job (`docReminders`) sends each reminder once, in the app only (email: false).

const MAX = 50;
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const fields = ['id', 'tripId', 'kind', 'label', 'expires', 'note', 'reminded'] as const;
const select = Object.fromEntries(fields.map((f) => [f, true])) as Record<(typeof fields)[number], true>;

/** GET /travel/docs?trip=: my documents (for that trip and those for no trip), with the trip's dates for the page. */
export async function travelDocs(u: SessionUser, q: Query) {
  const trip = str(first(q.trip));
  const docs = await prisma.travelDoc.findMany({ where: { userId: u.id, ...(trip ? { OR: [{ tripId: trip }, { tripId: null }] } : {}) }, orderBy: { createdAt: 'asc' }, take: MAX, select });
  return { docs };
}

/** POST /travel/docs { kind, label, expires?, note?, tripId? } (the trip must be one I'm planning). */
export async function addTravelDoc(u: SessionUser, b: Body) {
  const tripId = str(b.tripId) || null;
  if (tripId) await tripFor(u, tripId);
  if ((await prisma.travelDoc.count({ where: { userId: u.id } })) >= MAX) throw new BadRequestException(`You can keep ${MAX} documents: remove an old one.`);
  if (b.expires != null && b.expires !== '' && !isDay(b.expires)) throw new BadRequestException('Pick the expiry date.');
  const doc = await prisma.travelDoc.create({
    data: { userId: u.id, tripId, kind: oneOf(DOC_KINDS, b.kind) ? b.kind : 'other', label: clip(b.label, 80) ?? '', expires: isDay(b.expires) ? b.expires : null, note: clip(b.note, 300) },
    select,
  });
  return { doc };
}

/** PATCH /travel/docs/:id { label?, expires?, note? }: mine only; a new date can bring its reminders again. */
export async function updateTravelDoc(u: SessionUser, id: string, b: Body) {
  const data: { label?: string; expires?: string | null; note?: string | null; reminded?: string } = {};
  if ('label' in b) data.label = clip(b.label, 80) ?? '';
  if ('note' in b) data.note = clip(b.note, 300);
  if ('expires' in b) {
    if (b.expires !== null && b.expires !== '' && !isDay(b.expires)) throw new BadRequestException('Pick the expiry date.');
    data.expires = isDay(b.expires) ? b.expires : null; data.reminded = '';
  }
  const r = await prisma.travelDoc.updateMany({ where: { id, userId: u.id }, data });
  if (!r.count) throw new NotFoundException('That document isn’t there any more.');
  return { ok: true };
}

/** DELETE /travel/docs/:id: mine only. */
export async function removeTravelDoc(u: SessionUser, id: string) {
  const r = await prisma.travelDoc.deleteMany({ where: { id, userId: u.id } });
  if (!r.count) throw new NotFoundException('That document isn’t there any more.');
  return { ok: true };
}

/** The daily reminders: each document's due alerts (src/lib/travel-docs.ts), once, in the app. `room()` is the run's
 *  query budget (two queries a reminder). */
export async function docReminders(room: () => number, now = new Date()): Promise<{ done: boolean; info: number }> {
  const today = now.toISOString().slice(0, 10);
  const docs = await prisma.travelDoc.findMany({
    where: { OR: [{ expires: { not: null, lte: addDays(today, 400) } }, { trip: { startDate: { gte: today, lte: addDays(today, 31) } } }] },
    select: { id: true, userId: true, kind: true, label: true, expires: true, reminded: true, tripId: true, trip: { select: { name: true, startDate: true, stops: { select: { days: true } } } } },
    take: 200,
  });
  let sent = 0;
  for (const d of docs) {
    const t = d.trip?.startDate ? { start: d.trip.startDate, end: addDays(d.trip.startDate, Math.max(0, tripDays(d.trip.stops) - 1)) } : null;
    const due = dueAlerts(d, today, t);
    if (!due.length) continue;
    if (room() < 6) return { done: false, info: sent };
    const a = due[0];
    await notify(d.userId, { type: 'reminder', title: a.title, body: `${a.body}${d.trip ? ` (${d.trip.name})` : ''}`, link: d.tripId ? `/travel/trip?id=${d.tripId}&part=ready` : '/travel/saved', email: false });
    await prisma.travelDoc.update({ where: { id: d.id }, data: { reminded: [...d.reminded.split(',').filter(Boolean), ...due.map((x) => x.key)].join(',').slice(0, 300) } });
    sent++;
  }
  return { done: true, info: sent };
}
