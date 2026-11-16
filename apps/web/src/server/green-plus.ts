import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { footprint, readFootprint, tipById } from '@/lib/green-plus';
import { HHMM } from '@/lib/local-time';
import { isDay } from '@/lib/travel-plan';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { first, oneOf, str, type Body, type Query } from './body';
import { num } from './trace';
import { adultOnly } from './safety';
import { shortName } from './play';

// UniVerse Green's second wave (M216): footprint results over time, a monthly goal and pledges, and community
// events. Everything here is the signed-in person's own, except events: anyone sees the upcoming ones (the
// organiser's first name, where and when, how many are going: never who); only adults organise; three
// reports hide one.

const DAY = 86_400_000, KEEP_FOOTPRINTS = 24, MAX_PLEDGES = 12, MAX_EVENTS = 20, HIDE_AT = 3;
export const EVENT_KINDS = ['cleanup', 'planting', 'repair', 'swap', 'walk', 'other'] as const;
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const today = () => new Date().toISOString().slice(0, 10);
const readDays = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter(isDay) : []; } catch { return []; } };

// ——— Footprint ———
/** GET /green/footprints: my results, newest first. */
export async function greenFootprints(u: SessionUser) {
  const rows = await prisma.greenFootprint.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: KEEP_FOOTPRINTS });
  return { history: rows.map((r) => ({ id: r.id, kg: r.kg, createdAt: r.createdAt, answers: readFootprint(JSON.parse(r.answers) as Record<string, unknown>) })) };
}
/** POST /green/footprints { answers }: worked out here again from the answers (never the page's sum). */
export async function saveFootprint(u: SessionUser, b: Body) {
  const answers = readFootprint((b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>);
  const f = footprint(answers);
  const row = await prisma.greenFootprint.create({ data: { userId: u.id, answers: JSON.stringify(answers), kg: f.total }, select: { id: true } });
  const old = await prisma.greenFootprint.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, skip: KEEP_FOOTPRINTS, take: 20, select: { id: true } });
  if (old.length) await prisma.greenFootprint.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { id: row.id, footprint: f };
}

// ——— Goal and pledges ———
/** GET /green/goals: my monthly goal with this month's CO₂ so far, and my pledges with the days I kept them. */
export async function greenGoals(u: SessionUser) {
  const now = new Date(), monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [goal, pledges, month] = await Promise.all([
    prisma.greenGoal.findUnique({ where: { userId: u.id } }),
    prisma.greenPledge.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' }, take: MAX_PLEDGES }),
    prisma.greenAction.aggregate({ where: { userId: u.id, createdAt: { gte: monthStart } }, _sum: { co2Kg: true } }),
  ]);
  return {
    monthlyKg: goal?.monthlyKg ?? null, monthKg: Math.round((month._sum.co2Kg ?? 0) * 10) / 10, monthStart: monthStart.toISOString().slice(0, 10),
    pledges: pledges.filter((p) => tipById(p.tip)).map((p) => ({ id: p.id, tip: p.tip, days: readDays(p.days), createdAt: p.createdAt })),
  };
}
/** PUT /green/goals { monthlyKg } (none: no goal). */
export async function setGreenGoal(u: SessionUser, b: Body) {
  if (b.monthlyKg === null) { await prisma.greenGoal.deleteMany({ where: { userId: u.id } }); return { monthlyKg: null }; }
  const kg = num(b.monthlyKg, 1, 10_000);
  if (kg === null) throw new BadRequestException('A goal between 1 and 10,000 kg a month.');
  await prisma.greenGoal.upsert({ where: { userId: u.id }, create: { userId: u.id, monthlyKg: kg }, update: { monthlyKg: kg } });
  return { monthlyKg: kg };
}
/** POST /green/pledges { tip } */
export async function addGreenPledge(u: SessionUser, b: Body) {
  const tip = typeof b.tip === 'string' && tipById(b.tip) ? b.tip : null;
  if (!tip) throw new BadRequestException('Pick something to pledge.');
  if ((await prisma.greenPledge.count({ where: { userId: u.id } })) >= MAX_PLEDGES) throw new BadRequestException(`Keep ${MAX_PLEDGES} pledges at most: finish one first.`);
  const p = await prisma.greenPledge.upsert({ where: { userId_tip: { userId: u.id, tip } }, create: { userId: u.id, tip }, update: {}, select: { id: true } });
  return { id: p.id };
}
/** POST /green/pledges/:id/check { day }: kept it that day (today or the six before), or not after all. */
export async function checkGreenPledge(u: SessionUser, id: string, b: Body) {
  const day = isDay(b.day) ? b.day : today();
  if (day > today() || Date.parse(today()) - Date.parse(day) > 6 * DAY) throw new BadRequestException('Tick this week’s days only.');
  const p = await prisma.greenPledge.findFirst({ where: { id, userId: u.id } });
  if (!p) throw new NotFoundException('That pledge isn’t yours.');
  const days = new Set(readDays(p.days));
  if (days.has(day)) days.delete(day); else days.add(day);
  const kept = [...days].sort().slice(-120); // four months of days
  await prisma.greenPledge.update({ where: { id }, data: { days: JSON.stringify(kept) } });
  return { days: kept };
}
/** DELETE /green/pledges/:id */
export async function removeGreenPledge(u: SessionUser, id: string) {
  const r = await prisma.greenPledge.deleteMany({ where: { id, userId: u.id } });
  if (!r.count) throw new NotFoundException('That pledge isn’t yours.');
  return { ok: true };
}

// ——— Events ———
const eventOut = (e: { id: string; userId: string; name: string; title: string; kind: string; date: string; time: string | null; place: string; lat: number | null; lng: number | null; details: string | null; _count: { going: number } }, me: string, going: Set<string>) => ({
  id: e.id, name: e.name, title: e.title, kind: e.kind, date: e.date, time: e.time, place: e.place, lat: e.lat, lng: e.lng, details: e.details,
  going: e._count.going, imGoing: going.has(e.id), mine: e.userId === me,
});
/** GET /green/events ?lat&lng (near there, about 60 km): the upcoming ones, soonest first. */
export async function greenEvents(u: SessionUser, q: Query) {
  const lat = num(first(q.lat), -90, 90), lng = num(first(q.lng), -180, 180), box = lat !== null && lng !== null ? 0.55 : null;
  const rows = await prisma.greenEvent.findMany({
    where: { hidden: false, date: { gte: today() }, ...(box !== null ? { lat: { gte: lat! - box, lte: lat! + box }, lng: { gte: lng! - box / Math.max(0.2, Math.cos((lat! * Math.PI) / 180)), lte: lng! + box / Math.max(0.2, Math.cos((lat! * Math.PI) / 180)) } } : {}) },
    orderBy: [{ date: 'asc' }, { time: 'asc' }], take: 60,
    select: { id: true, userId: true, name: true, title: true, kind: true, date: true, time: true, place: true, lat: true, lng: true, details: true, _count: { select: { going: true } } },
  });
  const going = new Set((await prisma.greenEventGoing.findMany({ where: { userId: u.id, eventId: { in: rows.map((r) => r.id) } }, select: { eventId: true } })).map((g) => g.eventId));
  return { events: rows.map((e) => eventOut(e, u.id, going)) };
}
/** POST /green/events { title, kind, date, time, place, lat, lng, details }: adults only. */
export async function createGreenEvent(u: SessionUser, b: Body) {
  await adultOnly(u, 'Events are organised by adults (18 and over). You can still go to them.');
  const title = clip(b.title, 80), place = clip(b.place, 120);
  if (!title) throw new BadRequestException('Name the event.');
  if (!place) throw new BadRequestException('Say where to meet.');
  if (!isDay(b.date) || b.date < today() || Date.parse(b.date) - Date.now() > 366 * DAY) throw new BadRequestException('Pick a date in the coming year.');
  const time = typeof b.time === 'string' && HHMM.test(b.time) ? b.time : null;
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if ((await prisma.greenEvent.count({ where: { userId: u.id, date: { gte: today() } } })) >= MAX_EVENTS) throw new BadRequestException(`You have ${MAX_EVENTS} events coming up already.`);
  const e = await prisma.greenEvent.create({
    data: { userId: u.id, name: shortName(u.name), title, kind: oneOf(EVENT_KINDS, b.kind) ? b.kind : 'other', date: b.date, time, place, lat: lat !== null && lng !== null ? Math.round(lat * 1000) / 1000 : null, lng: lat !== null && lng !== null ? Math.round(lng * 1000) / 1000 : null, details: clip(b.details, 600), going: { create: { userId: u.id } } },
    select: { id: true },
  });
  return { id: e.id };
}
async function visibleEvent(id: string) {
  const e = await prisma.greenEvent.findUnique({ where: { id }, select: { id: true, userId: true, hidden: true } });
  if (!e || e.hidden) throw new NotFoundException('That event isn’t there any more.');
  return e;
}
/** POST /green/events/:id/going: I'm going, or not after all. */
export async function goingGreenEvent(u: SessionUser, id: string) {
  await visibleEvent(id);
  const had = await prisma.greenEventGoing.deleteMany({ where: { eventId: id, userId: u.id } });
  if (!had.count) await prisma.greenEventGoing.create({ data: { eventId: id, userId: u.id } });
  return { going: !had.count, count: await prisma.greenEventGoing.count({ where: { eventId: id } }) };
}
/** POST /green/events/:id/report { reason }: three hide it. */
export async function reportGreenEvent(u: SessionUser, id: string, b: Body) {
  const e = await visibleEvent(id);
  if (e.userId === u.id) throw new ForbiddenException('Delete your own event instead.');
  const reason = clip(b.reason, 300);
  await prisma.greenEventReport.upsert({ where: { eventId_userId: { eventId: id, userId: u.id } }, create: { eventId: id, userId: u.id, reason }, update: { reason } });
  if ((await prisma.greenEventReport.count({ where: { eventId: id } })) >= HIDE_AT) await prisma.greenEvent.update({ where: { id }, data: { hidden: true } });
  return { ok: true };
}
/** DELETE /green/events/:id: the organiser. */
export async function deleteGreenEvent(u: SessionUser, id: string) {
  const r = await prisma.greenEvent.deleteMany({ where: { id, userId: u.id } });
  if (!r.count) throw new NotFoundException('Only the organiser can delete an event.');
  return { ok: true };
}
