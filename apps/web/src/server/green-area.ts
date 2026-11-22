import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { GREEN_FACTORS, GREEN_KINDS, type GreenKind } from '@/lib/green';
import { areaOf, CHALLENGE_DAYS, MIN_NEIGHBOURS } from '@/lib/green-area';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { notifyMany } from './email';

// M318: neighbourhood challenges (Green's home page). A person chooses their neighbourhood (the 0.1° square
// their position falls in, kept with their household); this month's confirmed CO₂ saved by everyone there,
// and challenges anyone there sets (a kind of action, a goal, 7 to 30 days) counting everyone's confirmed
// actions of that kind. Totals show only once three people share the area; names never.

const DAY = 86_400_000;
const N = (v: unknown) => Number(v ?? 0) || 0;
const q = <T,>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args).catch(() => [] as T[]);
const iso = (d: Date) => d.toISOString().replace('Z', '+00:00');

async function myArea(u: SessionUser) {
  const h = await prisma.greenHome.findUnique({ where: { userId: u.id }, select: { areaLat: true, areaLng: true } });
  return h?.areaLat != null && h.areaLng != null ? { lat: h.areaLat, lng: h.areaLng } : null;
}

const SUM = `SELECT COALESCE(SUM(a."{col}"), 0) AS n FROM green_actions a JOIN green_homes h ON h."userId" = a."userId"
  WHERE h."areaLat" = ? AND h."areaLng" = ? AND a."verifiedAt" IS NOT NULL AND a."createdAt" >= ? AND a."createdAt" < ?`;

/** GET /green/area */
export async function greenArea(u: SessionUser) {
  const area = await myArea(u);
  if (!area) return { area: null };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), lastStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [neighbours, challenges] = await Promise.all([
    prisma.greenHome.count({ where: { areaLat: area.lat, areaLng: area.lng } }),
    prisma.greenAreaChallenge.findMany({ where: { areaLat: area.lat, areaLng: area.lng, endsAt: { gt: new Date(now.getTime() - 7 * DAY) } }, orderBy: { endsAt: 'asc' }, take: 10 }),
  ]);
  if (neighbours < MIN_NEIGHBOURS) return { area, neighbours, enough: false, month: null, challenges: [] };
  const kg = SUM.replace('{col}', 'co2Kg');
  const [month, last, progress] = await Promise.all([
    q<{ n: unknown }>(kg, area.lat, area.lng, iso(monthStart), iso(now)),
    q<{ n: unknown }>(kg, area.lat, area.lng, iso(lastStart), iso(monthStart)),
    Promise.all(challenges.map((c) => q<{ n: unknown }>(`${SUM.replace('{col}', 'amount')} AND a."kind" = ?`, area.lat, area.lng, iso(c.startsAt), iso(c.endsAt < now ? c.endsAt : now), c.kind))),
  ]);
  return {
    area, neighbours, enough: true,
    month: { kg: Math.round(N(month[0]?.n) * 10) / 10, lastKg: Math.round(N(last[0]?.n) * 10) / 10 },
    challenges: challenges.map((c, i) => ({ id: c.id, title: c.title, kind: c.kind, unit: GREEN_FACTORS[c.kind as GreenKind]?.units ?? '', goal: c.goal, progress: Math.round(N(progress[i][0]?.n) * 10) / 10, startsAt: c.startsAt, endsAt: c.endsAt, over: c.endsAt < now, mine: c.createdBy === u.id })),
  };
}

/** PUT /green/area { lat, lng } (snapped to the 0.1° square) or { clear: true } */
export async function setGreenArea(u: SessionUser, b: Body) {
  const lat = Number(b.lat), lng = Number(b.lng);
  const a = b.clear === true ? null : Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? areaOf(lat, lng) : undefined;
  if (a === undefined) throw new BadRequestException('Share where you are, or tap your area on the map.');
  await prisma.greenHome.upsert({ where: { userId: u.id }, create: { userId: u.id, areaLat: a?.lat ?? null, areaLng: a?.lng ?? null }, update: { areaLat: a?.lat ?? null, areaLng: a?.lng ?? null } });
  return greenArea(u);
}

/** POST /green/area/challenges { title?, kind, goal, days } (anyone in the area; three running at most) */
export async function addAreaChallenge(u: SessionUser, b: Body) {
  const area = await myArea(u);
  if (!area) throw new ForbiddenException('Choose your neighbourhood first.');
  if (!oneOf(GREEN_KINDS, b.kind)) throw new BadRequestException('Choose the kind of action.');
  const f = GREEN_FACTORS[b.kind];
  const goal = Number(b.goal);
  if (!Number.isFinite(goal) || goal <= 0 || goal > f.max * 100) throw new BadRequestException(`Set a goal in ${f.units}.`);
  const days = (CHALLENGE_DAYS as readonly number[]).includes(Number(b.days)) ? Number(b.days) : 14;
  const running = await prisma.greenAreaChallenge.count({ where: { areaLat: area.lat, areaLng: area.lng, endsAt: { gt: new Date() } } });
  if (running >= 3) throw new BadRequestException('Three challenges are running here already: join one of them.');
  const title = (str(b.title) ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || `${goal} ${f.units}: ${f.label.toLowerCase()}`;
  const now = new Date();
  await prisma.greenAreaChallenge.create({ data: { areaLat: area.lat, areaLng: area.lng, title, kind: b.kind, goal, startsAt: now, endsAt: new Date(now.getTime() + days * DAY), createdBy: u.id } });
  // The neighbours hear in the app (no email): 200 at most.
  const near = await prisma.greenHome.findMany({ where: { areaLat: area.lat, areaLng: area.lng, userId: { not: u.id } }, select: { userId: true }, take: 200 });
  await notifyMany(near.map((n) => n.userId), { type: 'green', title: 'A new challenge in your neighbourhood', body: `${title}, for ${days} days. Every confirmed action counts.`, link: '/student/life/green', email: false });
  return greenArea(u);
}

/** DELETE /green/area/challenges/:id (whoever set it) */
export async function removeAreaChallenge(u: SessionUser, id: string) {
  const c = await prisma.greenAreaChallenge.findUnique({ where: { id }, select: { createdBy: true } });
  if (!c) throw new NotFoundException('That challenge is gone.');
  if (c.createdBy !== u.id) throw new ForbiddenException('Only whoever set it can remove it.');
  await prisma.greenAreaChallenge.delete({ where: { id } });
  return greenArea(u);
}
