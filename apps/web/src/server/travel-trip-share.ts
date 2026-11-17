import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { kmBetween } from '@/lib/relief';
import { stopDates } from '@/lib/travel-plan';
import { NotFoundException } from './http';
import { str, type Body } from './body';
import { publish } from './realtime';
import { notifyMany } from './email';
import { shortName } from './play';
import { memberIds, tripFor } from './travel-trips';

// M248: "Share my trip with family". Anyone planning a trip can turn on a read-only link to its plan (an unguessable
// code; turning it off or making a new one stops the old link) and say "I'm safe". The public page shows first names,
// cities, places, check-ins and the journal entries their authors left in, never an email, a phone number or an
// account id. A check-in also tells the others on the trip, and, linked to Relief's check-in (M150), marks the person
// safe in any Relief emergency declared around the city they're in today (nobody is told by that; Relief's own
// "I'm safe" chooses who hears).

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => ALPHABET[x & 31]).join('');
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const KEEP = 50;
const tell = async (tripId: string) => publish(await memberIds(tripId), { type: 'refresh', keys: [`/travel/trips/${tripId}/share`] });

async function names(ids: string[]) {
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)].slice(0, 90) } }, select: { id: true, name: true } });
  return (id: string) => shortName(people.find((p) => p.id === id)?.name);
}

/** GET /travel/trips/:id/share: the family link (if on) and the latest check-ins. */
export async function tripShare(u: SessionUser, id: string) {
  const trip = await tripFor(u, id);
  const rows = await prisma.travelTripCheckin.findMany({ where: { tripId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
  const name = await names(rows.map((r) => r.userId));
  return { code: trip.shareCode, checkins: rows.map((r) => ({ id: r.id, by: r.userId === u.id ? 'You' : name(r.userId), note: r.note, place: r.place, at: r.createdAt })) };
}

/** POST /travel/trips/:id/share: turn the family link on, or make a new one (the old link stops). Any member. */
export async function shareTrip(u: SessionUser, id: string) {
  await tripFor(u, id);
  const { shareCode } = await prisma.travelTrip.update({ where: { id }, data: { shareCode: newCode() }, select: { shareCode: true } });
  await tell(id);
  return { code: shareCode };
}

/** DELETE /travel/trips/:id/share: the family link off. */
export async function unshareTrip(u: SessionUser, id: string) {
  await tripFor(u, id);
  await prisma.travelTrip.update({ where: { id }, data: { shareCode: null } });
  await tell(id);
  return { ok: true };
}

/** The city a trip is in today (UTC dates), for the Relief link. */
function cityToday(start: string | null, stops: { name: string; lat: number | null; lon: number | null; days: number }[], today: string) {
  const dates = stopDates(start, stops);
  const i = dates.findIndex((d) => d.from && d.to && d.from <= today && today <= d.to);
  return i >= 0 ? stops[i] : null;
}

/** POST /travel/trips/:id/safe { note?, place? }: "I'm safe", to the others on the trip and on the family link. */
export async function checkInSafe(u: SessionUser, id: string, b: Body) {
  const trip = await tripFor(u, id);
  const stops = await prisma.travelTripStop.findMany({ where: { tripId: id }, orderBy: { position: 'asc' }, select: { name: true, lat: true, lon: true, days: true }, take: 12 });
  const city = cityToday(trip.startDate, stops, new Date().toISOString().slice(0, 10));
  const place = clip(b.place, 80) ?? city?.name ?? null;
  await prisma.travelTripCheckin.create({ data: { tripId: id, userId: u.id, note: clip(b.note, 200), place } });
  const old = await prisma.travelTripCheckin.findMany({ where: { tripId: id }, orderBy: { createdAt: 'desc' }, skip: KEEP, take: 20, select: { id: true } });
  if (old.length) await prisma.travelTripCheckin.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  const others = (await memberIds(id)).filter((m) => m !== u.id);
  if (others.length) await notifyMany(others, { type: 'event', title: `${shortName(u.name)} is safe`, body: `${shortName(u.name)} checked in${place ? ` in ${place}` : ''} on “${trip.name}”.`, link: `/travel/trip?id=${id}&part=share`, email: false });
  // Relief (M150): safe in any emergency declared around today's city.
  const relief: string[] = [];
  if (city?.lat != null && city.lon != null) {
    const live = await prisma.reliefIncident.findMany({ where: { endsAt: { gt: new Date() } }, select: { id: true, title: true, lat: true, lng: true, radiusKm: true }, take: 50 });
    for (const i of live.filter((x) => kmBetween(x, { lat: city.lat!, lng: city.lon! }) <= x.radiusKm).slice(0, 3)) {
      await prisma.reliefSafe.upsert({ where: { incidentId_userId: { incidentId: i.id, userId: u.id } }, create: { incidentId: i.id, userId: u.id }, update: {} });
      relief.push(i.title);
    }
  }
  await tell(id);
  return { ok: true, place, relief };
}

/** GET /travel/shared/:code (public): the trip's plan for family, read-only. No emails, phones or account ids. */
export async function sharedTrip(code: string) {
  const c = (code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const trip = c.length === 16 ? await prisma.travelTrip.findUnique({ where: { shareCode: c }, select: { id: true, name: true, startDate: true, travellers: true } }) : null;
  if (!trip) throw new NotFoundException('This link isn’t working: ask for a new one.');
  const [stops, items, members, checkins, journal] = await Promise.all([
    prisma.travelTripStop.findMany({ where: { tripId: trip.id }, orderBy: { position: 'asc' }, take: 12, select: { id: true, guide: true, name: true, cc: true, lat: true, lon: true, days: true, position: true } }),
    prisma.travelTripItem.findMany({ where: { tripId: trip.id, day: { not: null } }, orderBy: [{ day: 'asc' }, { position: 'asc' }], take: 300, select: { id: true, stopId: true, day: true, position: true, name: true, kind: true, lat: true, lon: true, minutes: true, hours: true, price: true } }),
    prisma.travelTripMember.findMany({ where: { tripId: trip.id }, orderBy: { joinedAt: 'asc' }, take: 12, select: { userId: true } }),
    prisma.travelTripCheckin.findMany({ where: { tripId: trip.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, userId: true, note: true, place: true, createdAt: true } }),
    prisma.travelTripJournal.findMany({ where: { tripId: trip.id, shared: true }, orderBy: [{ day: 'asc' }, { createdAt: 'asc' }], take: 200, select: { id: true, userId: true, day: true, text: true, photoUrl: true, place: true } }),
  ]);
  const name = await names([...members.map((m) => m.userId), ...checkins.map((x) => x.userId), ...journal.map((j) => j.userId)]);
  return {
    trip: { name: trip.name, startDate: trip.startDate, travellers: trip.travellers },
    stops, items: items.map((i) => ({ ...i, note: null })),
    people: members.map((m) => name(m.userId)),
    checkins: checkins.map((x) => ({ id: x.id, by: name(x.userId), note: x.note, place: x.place, at: x.createdAt })),
    journal: journal.map((j) => ({ id: j.id, by: name(j.userId), day: j.day, text: j.text, photoUrl: j.photoUrl, place: j.place })),
  };
}
