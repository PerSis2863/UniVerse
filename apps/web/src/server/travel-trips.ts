import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { LISTING_KINDS } from '@/lib/travel-guide';
import { CURRENCIES, STYLE_IDS } from '@/lib/travel-find';
import { isDay, leg, minutesFor, tripDays } from '@/lib/travel-plan';
import { isMode } from '@/lib/travel-footprint';
import { isZone } from '@/lib/travel-jetlag';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, strings, type Body } from './body';
import { publish } from './realtime';
import { notifyMany } from './email';
import { shortName } from './play';
import { placeOf } from './travel';
import { logGreenAction } from './green';

// UniVerse Travel's trip planner (M206, the owner's Airbnb list items 4, 5 and 7): a trip of one or
// more cities with their days, the places planned into those days, and friends planning it together
// (they join with the trip's invite link; every change reaches the others' open pages at once).
// Only a trip's members can see or change it; only its owner can delete it, remove people or make a new
// invite link. The sums (dates, budget, order, calendar) are in src/lib/travel-plan.ts.

const MAX_TRIPS = 50, MAX_STOPS = 12, MAX_ITEMS = 300, MAX_MEMBERS = 12, MAX_DAYS = 60;
const KINDS = [...LISTING_KINDS] as const;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32, so every byte & 31 is equally likely
const newCode = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => ALPHABET[x & 31]).join('');
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const coord = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null);
const whole = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);
const guideTitle = (v: unknown) => { const t = clip(v, 120); return t && !/[[\]{}|#<>]/.test(t) ? t : null; };
const stopCc = (v: unknown) => (typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : null);

/** A city for a trip from what the page sent; its position and country from its guide when not sent. */
async function stopData(b: Body) {
  const guide = guideTitle(b.guide);
  if (!guide) throw new BadRequestException('Pick a place.');
  let lat = coord(b.lat, 90), lon = coord(b.lon, 180), cc = stopCc(b.cc), name = clip(b.name, 80), title = guide;
  if (lat === null || lon === null || !cc) {
    const p = await placeOf(guide).catch(() => null);
    if (p) { title = p.guide; lat ??= p.lat; lon ??= p.lon; cc ??= p.cc; name ??= p.name; }
  }
  return { guide: title, name: name ?? title, cc, lat, lon };
}

/** The trip if I'm planning it (null otherwise: someone else's trip looks like none at all). */
export async function tripFor(u: SessionUser, id: string) {
  const m = await prisma.travelTripMember.findUnique({ where: { tripId_userId: { tripId: id, userId: u.id } }, select: { trip: true } });
  if (!m) throw new NotFoundException('That trip isn’t one of yours.');
  return m.trip;
}
export async function memberIds(tripId: string) {
  return (await prisma.travelTripMember.findMany({ where: { tripId }, select: { userId: true }, take: MAX_MEMBERS + 1 })).map((m) => m.userId);
}
/** Tell everyone planning it (their open pages refetch) and note the change time. */
async function changed(tripId: string) {
  await prisma.travelTrip.update({ where: { id: tripId }, data: { updatedAt: new Date() } }).catch(() => {});
  publish(await memberIds(tripId), { type: 'refresh', keys: [`/travel/trips/${tripId}`, '/travel/trips'] });
}

/** GET /travel/trips: the trips I'm planning, latest first, with their cities. */
export async function travelTrips(u: SessionUser) {
  const rows = await prisma.travelTripMember.findMany({
    where: { userId: u.id }, take: MAX_TRIPS,
    select: { trip: { select: { id: true, name: true, startDate: true, ownerId: true, updatedAt: true, stops: { select: { name: true, days: true, guide: true }, orderBy: { position: 'asc' } }, _count: { select: { members: true, items: true } } } } },
  });
  const trips = rows.map(({ trip: t }) => ({
    id: t.id, name: t.name, startDate: t.startDate, mine: t.ownerId === u.id, updatedAt: t.updatedAt,
    cities: t.stops.map((s) => s.name), cover: t.stops[0]?.guide ?? null, days: tripDays(t.stops), people: t._count.members, places: t._count.items,
  })).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  return { trips };
}

/** POST /travel/trips { name?, stop?: { guide, name, cc, lat, lon, days }, startDate?, travellers?, style?, currency? } */
export async function createTravelTrip(u: SessionUser, b: Body) {
  if ((await prisma.travelTripMember.count({ where: { userId: u.id } })) >= MAX_TRIPS) throw new BadRequestException(`You’re planning ${MAX_TRIPS} trips: delete an old one first.`);
  const s = (b.stop && typeof b.stop === 'object' ? b.stop : null) as Body | null;
  const stop = s ? await stopData(s) : null;
  const name = clip(b.name, 80) ?? (stop ? `Trip to ${stop.name}` : 'My next trip');
  const trip = await prisma.travelTrip.create({
    data: {
      ownerId: u.id, name, code: newCode(), startDate: isDay(b.startDate) ? b.startDate : null,
      travellers: whole(b.travellers, 1, 20) ?? 1, style: oneOf(STYLE_IDS, b.style) ? b.style : 'mid', currency: oneOf(CURRENCIES, b.currency) ? b.currency : 'EUR',
      members: { create: { userId: u.id } },
      ...(stop ? { stops: { create: { ...stop, days: whole(s!.days, 1, MAX_DAYS) ?? 3 } } } : {}),
    },
    select: { id: true },
  });
  return { trip };
}

/** GET /travel/trips/:id: the trip, its cities in order, its places, who's planning it. */
export async function travelTrip(u: SessionUser, id: string) {
  const trip = await tripFor(u, id);
  const [stops, items, members] = await Promise.all([
    prisma.travelTripStop.findMany({ where: { tripId: id }, orderBy: { position: 'asc' }, take: MAX_STOPS }),
    prisma.travelTripItem.findMany({ where: { tripId: id }, orderBy: [{ day: 'asc' }, { position: 'asc' }], take: MAX_ITEMS }),
    prisma.travelTripMember.findMany({ where: { tripId: id }, orderBy: { joinedAt: 'asc' }, take: MAX_MEMBERS, select: { userId: true, zone: true } }),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) } }, select: { id: true, name: true, avatar: true } });
  const owner = trip.ownerId === u.id;
  return {
    trip: { id: trip.id, name: trip.name, startDate: trip.startDate, travellers: trip.travellers, style: trip.style, currency: trip.currency, updatedAt: trip.updatedAt },
    // The invite code is every member's to share (they plan together), never shown off the trip.
    code: trip.code, owner, ownerId: trip.ownerId, me: u.id,
    stops, items,
    members: members.map((m) => { const p = people.find((x) => x.id === m.userId); return { id: m.userId, name: shortName(p?.name), avatar: p?.avatar ?? null, owner: m.userId === trip.ownerId, zone: m.zone }; }),
  };
}

/** PATCH /travel/trips/:id { name, startDate, travellers, style, currency }: any member. */
export async function updateTravelTrip(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const data: { name?: string; startDate?: string | null; travellers?: number; style?: string; currency?: string } = {};
  if ('name' in b) { const n = clip(b.name, 80); if (!n) throw new BadRequestException('Name the trip.'); data.name = n; }
  if ('startDate' in b) { if (b.startDate !== null && !isDay(b.startDate)) throw new BadRequestException('Pick a start date.'); data.startDate = b.startDate as string | null; }
  if ('travellers' in b) { const n = whole(b.travellers, 1, 20); if (!n) throw new BadRequestException('Between 1 and 20 travellers.'); data.travellers = n; }
  if ('style' in b) { if (!oneOf(STYLE_IDS, b.style)) throw new BadRequestException('Pick a style.'); data.style = b.style; }
  if ('currency' in b) { if (!oneOf(CURRENCIES, b.currency)) throw new BadRequestException('Pick a currency.'); data.currency = b.currency; }
  await prisma.travelTrip.update({ where: { id }, data });
  await changed(id);
  return { ok: true };
}

/** DELETE /travel/trips/:id: the owner deletes it for everyone; anyone else leaves it. */
export async function deleteTravelTrip(u: SessionUser, id: string) {
  const trip = await tripFor(u, id);
  const others = (await memberIds(id)).filter((x) => x !== u.id);
  if (trip.ownerId === u.id) {
    await prisma.travelTrip.delete({ where: { id } });
    if (others.length) await notifyMany(others, { type: 'event', title: `“${trip.name}” was deleted`, body: `${shortName(u.name)} deleted the trip you were planning together.`, link: '/travel/saved?tab=trips', email: false });
    publish(others, { type: 'refresh', keys: ['/travel/trips', `/travel/trips/${id}`] });
    return { deleted: true };
  }
  await prisma.travelTripMember.delete({ where: { tripId_userId: { tripId: id, userId: u.id } } });
  await changed(id);
  return { left: true };
}

/** POST /travel/trips/join { code }: join a friend's trip from its invite link. */
export async function joinTravelTrip(u: SessionUser, b: Body) {
  const code = (str(b.code) ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const trip = code.length === 10 ? await prisma.travelTrip.findUnique({ where: { code }, select: { id: true, name: true, ownerId: true } }) : null;
  if (!trip) throw new NotFoundException('That invite link isn’t working: ask for a new one.');
  const ids = await memberIds(trip.id);
  if (ids.includes(u.id)) return { trip: { id: trip.id } };
  if (ids.length >= MAX_MEMBERS) throw new BadRequestException(`A trip can have ${MAX_MEMBERS} people planning it.`);
  if ((await prisma.travelTripMember.count({ where: { userId: u.id } })) >= MAX_TRIPS) throw new BadRequestException(`You’re planning ${MAX_TRIPS} trips: delete an old one first.`);
  await prisma.travelTripMember.create({ data: { tripId: trip.id, userId: u.id } });
  await notifyMany(ids, { type: 'event', title: `${shortName(u.name)} is planning “${trip.name}” with you`, body: 'They joined with the invite link.', link: `/travel/trip?id=${trip.id}`, email: false });
  await changed(trip.id);
  return { trip: { id: trip.id } };
}

/** PATCH /travel/trips/:id/me { zone }: M244: show the group my home clock (an IANA zone), or stop (null). */
export async function setTripZone(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  if (b.zone !== null && !isZone(b.zone)) throw new BadRequestException('Pick a time zone.');
  await prisma.travelTripMember.update({ where: { tripId_userId: { tripId: id, userId: u.id } }, data: { zone: b.zone as string | null } });
  await changed(id);
  return { ok: true };
}

/** POST /travel/trips/:id/code: the owner makes a new invite link (the old one stops working). */
export async function newTravelTripCode(u: SessionUser, id: string) {
  const trip = await tripFor(u, id);
  if (trip.ownerId !== u.id) throw new ForbiddenException('Only the person who started the trip can change its link.');
  const { code } = await prisma.travelTrip.update({ where: { id }, data: { code: newCode() }, select: { code: true } });
  await changed(id);
  return { code };
}

/** DELETE /travel/trips/:id/members/:userId: the owner takes someone off the trip. */
export async function removeTravelTripMember(u: SessionUser, id: string, userId: string) {
  const trip = await tripFor(u, id);
  if (trip.ownerId !== u.id) throw new ForbiddenException('Only the person who started the trip can remove people.');
  if (userId === u.id) throw new BadRequestException('You started this trip: delete it instead.');
  const r = await prisma.travelTripMember.deleteMany({ where: { tripId: id, userId } });
  if (!r.count) throw new NotFoundException('They’re not on this trip.');
  publish([userId], { type: 'refresh', keys: ['/travel/trips', `/travel/trips/${id}`] });
  await changed(id);
  return { ok: true };
}

// ——— Cities ———

/** POST /travel/trips/:id/stops { guide, name, cc, lat, lon, days } */
export async function addTravelStop(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const stops = await prisma.travelTripStop.findMany({ where: { tripId: id }, select: { days: true, position: true }, take: MAX_STOPS + 1 });
  if (stops.length >= MAX_STOPS) throw new BadRequestException(`A trip can have ${MAX_STOPS} places.`);
  const days = whole(b.days, 1, MAX_DAYS) ?? 2;
  if (tripDays(stops) + days > MAX_DAYS) throw new BadRequestException(`A trip can be ${MAX_DAYS} days long.`);
  const stop = await prisma.travelTripStop.create({ data: { tripId: id, ...(await stopData(b)), days, position: Math.max(-1, ...stops.map((s) => s.position)) + 1 } });
  await changed(id);
  return { stop };
}

/** PATCH /travel/trips/:id/stops/:stopId { days?, mode?, green? }: places planned past a new last day go back to
 *  "not planned". M247: `mode` is how they get here from the city before; choosing the train with `green` records a
 *  Green action for the one who chose it (once a leg). */
export async function updateTravelStop(u: SessionUser, id: string, stopId: string, b: Body) {
  const trip = await tripFor(u, id);
  const stops = await prisma.travelTripStop.findMany({ where: { tripId: id }, orderBy: { position: 'asc' }, select: { id: true, days: true, name: true, lat: true, lon: true }, take: MAX_STOPS });
  const at = stops.findIndex((s) => s.id === stopId);
  if (at < 0) throw new NotFoundException('That place isn’t on this trip.');
  const data: { days?: number; mode?: string | null } = {};
  if ('days' in b) {
    const days = whole(b.days, 1, MAX_DAYS);
    if (!days) throw new BadRequestException(`Between 1 and ${MAX_DAYS} days.`);
    if (tripDays(stops.map((s) => (s.id === stopId ? { days } : s))) > MAX_DAYS) throw new BadRequestException(`A trip can be ${MAX_DAYS} days long.`);
    data.days = days;
  }
  if ('mode' in b) { if (b.mode !== null && !isMode(b.mode)) throw new BadRequestException('Pick how you’ll travel.'); data.mode = b.mode as string | null; }
  await prisma.travelTripStop.update({ where: { id: stopId }, data });
  if (data.days) await prisma.travelTripItem.updateMany({ where: { tripId: id, stopId, day: { gte: data.days } }, data: { day: null } });
  const prev = stops[at - 1], l = prev ? leg(prev, stops[at]) : null;
  let green: { kg: number } | null = null;
  if (data.mode === 'train' && b.green === true && prev && l) {
    const note = `Train: ${prev.name} → ${stops[at].name} (${trip.name})`.slice(0, 300);
    if (!(await prisma.greenAction.findFirst({ where: { userId: u.id, kind: 'TRANSIT', note }, select: { id: true } }))) {
      const a = await logGreenAction(u, { kind: 'TRANSIT', amount: Math.min(2000, Math.round(l.km * 1.2)), note, place: stops[at].name });
      green = { kg: a.co2Kg };
    }
  }
  await changed(id);
  return { ok: true, green };
}

/** DELETE /travel/trips/:id/stops/:stopId (its places go with it). */
export async function removeTravelStop(u: SessionUser, id: string, stopId: string) {
  await tripFor(u, id);
  const r = await prisma.travelTripStop.deleteMany({ where: { id: stopId, tripId: id } });
  if (!r.count) throw new NotFoundException('That place isn’t on this trip.');
  await changed(id);
  return { ok: true };
}

/** POST /travel/trips/:id/stops/order { ids }: the cities in this order. */
export async function orderTravelStops(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const ids = strings(b.ids).slice(0, MAX_STOPS);
  const stops = await prisma.travelTripStop.findMany({ where: { tripId: id }, select: { id: true }, take: MAX_STOPS });
  if (ids.length !== stops.length || !stops.every((s) => ids.includes(s.id))) throw new BadRequestException('The trip changed: reload and try again.');
  await prisma.$executeRawUnsafe(`UPDATE travel_trip_stops SET position = CASE id ${ids.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE tripId = ?`, ...ids.flatMap((s, i) => [s, i]), id);
  await changed(id);
  return { ok: true };
}

// ——— Places ———

/** POST /travel/trips/:id/items { stopId, name, kind, lat, lon, hours, price, note, address, url, day? } */
export async function addTravelItem(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const stopId = str(b.stopId) ?? '', name = clip(b.name, 120);
  if (!name) throw new BadRequestException('Name the place.');
  const stop = await prisma.travelTripStop.findFirst({ where: { id: stopId, tripId: id }, select: { days: true } });
  if (!stop) throw new NotFoundException('That place isn’t on this trip.');
  if ((await prisma.travelTripItem.count({ where: { tripId: id } })) >= MAX_ITEMS) throw new BadRequestException(`A trip can hold ${MAX_ITEMS} places.`);
  const kind = oneOf(KINDS, b.kind) ? b.kind : 'see', note = clip(b.note, 600), url = clip(b.url, 400);
  const day = whole(b.day, 0, stop.days - 1);
  const last = await prisma.travelTripItem.findFirst({ where: { tripId: id, stopId, day }, orderBy: { position: 'desc' }, select: { position: true } });
  const item = await prisma.travelTripItem.create({
    data: {
      tripId: id, stopId, day, position: (last?.position ?? -1) + 1, name, kind, lat: coord(b.lat, 90), lon: coord(b.lon, 180),
      hours: clip(b.hours, 160), price: clip(b.price, 120), minutes: whole(b.minutes, 0, 720) ?? minutesFor(kind, name, note ?? ''),
      note, address: clip(b.address, 200), url: url && /^https?:\/\//.test(url) ? url : null, addedById: u.id,
    },
  });
  await changed(id);
  return { item };
}

/** PATCH /travel/trips/:id/items/:itemId { minutes?, note? } */
export async function updateTravelItem(u: SessionUser, id: string, itemId: string, b: Body) {
  await tripFor(u, id);
  const data: { minutes?: number; note?: string | null } = {};
  if ('minutes' in b) { const m = whole(b.minutes, 0, 720); if (m === null) throw new BadRequestException('Up to 12 hours.'); data.minutes = m; }
  if ('note' in b) data.note = clip(b.note, 600);
  const r = await prisma.travelTripItem.updateMany({ where: { id: itemId, tripId: id }, data });
  if (!r.count) throw new NotFoundException('That place isn’t on this trip.');
  await changed(id);
  return { ok: true };
}

/** DELETE /travel/trips/:id/items/:itemId */
export async function removeTravelItem(u: SessionUser, id: string, itemId: string) {
  await tripFor(u, id);
  const r = await prisma.travelTripItem.deleteMany({ where: { id: itemId, tripId: id } });
  if (!r.count) throw new NotFoundException('That place isn’t on this trip.');
  await changed(id);
  return { ok: true };
}

/** POST /travel/trips/:id/items/move { moves: [{ id, stopId, day, position }] }: after a drag, or "Plan my
 *  days": where each place now is (a day number, or null for not planned). One query per 12 places. */
export async function moveTravelItems(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const raw = Array.isArray(b.moves) ? (b.moves as Body[]).slice(0, MAX_ITEMS) : [];
  const stops = new Map((await prisma.travelTripStop.findMany({ where: { tripId: id }, select: { id: true, days: true }, take: MAX_STOPS })).map((s) => [s.id, s.days]));
  const moves = raw.map((m) => {
    const itemId = str(m.id), stopId = str(m.stopId), days = stopId ? stops.get(stopId) : undefined;
    if (!itemId || !stopId || days === undefined) throw new BadRequestException('The trip changed: reload and try again.');
    const day = m.day === null ? null : whole(m.day, 0, days - 1), position = whole(m.position, 0, MAX_ITEMS) ?? 0;
    if (m.day !== null && day === null) throw new BadRequestException('That day isn’t on the trip.');
    return { itemId, stopId, day, position };
  });
  // 7 values a place plus the trip: 12 a query stays under D1's 100.
  for (let i = 0; i < moves.length; i += 12) {
    const part = moves.slice(i, i + 12), when = part.map(() => 'WHEN ? THEN ?').join(' ');
    await prisma.$executeRawUnsafe(
      `UPDATE travel_trip_items SET stopId = CASE id ${when} END, day = CASE id ${when} END, position = CASE id ${when} END WHERE tripId = ? AND id IN (${part.map(() => '?').join(',')})`,
      ...part.flatMap((m) => [m.itemId, m.stopId]), ...part.flatMap((m) => [m.itemId, m.day]), ...part.flatMap((m) => [m.itemId, m.position]), id, ...part.map((m) => m.itemId),
    );
  }
  await changed(id);
  return { ok: true };
}
