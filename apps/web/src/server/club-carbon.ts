import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { activityOf, carbonSummary, kgFor } from '@/lib/carbon';
import type { Body } from './body';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// A club's carbon tracker (Stage 5 · Q16): members log what the club did (trips, electricity, a
// generator, paper…); each entry is worked out with a standard factor (src/lib/carbon.ts). Members
// and admins see it; members log; an entry is removed by whoever logged it, the founder or an admin.

async function access(user: SessionUser, clubId: string) {
  const club = await prisma.association.findUnique({ where: { id: clubId }, select: { id: true, name: true } });
  if (!club) throw new NotFoundException('Club not found.');
  const m = await prisma.associationMembership.findFirst({ where: { associationId: clubId, userId: user.id }, select: { role: true } });
  if (!m && user.role !== 'ADMIN') throw new ForbiddenException('Only the club’s members can see its carbon tracker.');
  return { club, member: !!m, founder: m?.role === 'FOUNDER' };
}

/** GET /api/campus/clubs/[id]/carbon: the last year's entries and totals. */
export async function clubCarbon(user: SessionUser, clubId: string) {
  const { club, member, founder } = await access(user, clubId);
  const since = new Date(Date.now() - 366 * 86_400_000);
  const rows = await prisma.clubCarbonEntry.findMany({
    where: { associationId: clubId, occurredAt: { gte: since } }, orderBy: { occurredAt: 'desc' }, take: 2000,
    select: { id: true, activity: true, quantity: true, kgCo2e: true, note: true, occurredAt: true, userId: true, user: { select: { name: true } } },
  });
  return {
    club, canLog: member, summary: carbonSummary(rows),
    entries: rows.slice(0, 60).map((r) => ({
      id: r.id, activity: r.activity, label: activityOf(r.activity)?.label ?? r.activity, unit: activityOf(r.activity)?.unit ?? '', saving: !!activityOf(r.activity)?.saving,
      quantity: r.quantity, kgCo2e: r.kgCo2e, note: r.note, occurredAt: r.occurredAt, by: r.user?.name ?? null,
      canDelete: r.userId === user.id || founder || user.role === 'ADMIN',
    })),
  };
}

/** POST /api/campus/clubs/[id]/carbon { activity, quantity, note?, occurredAt? } */
export async function logCarbon(user: SessionUser, clubId: string, b: Body) {
  const { member } = await access(user, clubId);
  if (!member) throw new ForbiddenException('Only the club’s members can add to its tracker.');
  const kg = kgFor(b.activity, b.quantity);
  if (kg === null) throw new BadRequestException('Pick an activity and an amount above 0.');
  const at = b.occurredAt ? new Date(String(b.occurredAt)) : new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 86_400_000 || at.getTime() < Date.now() - 366 * 86_400_000) throw new BadRequestException('Pick a date within the last year.');
  if ((await prisma.clubCarbonEntry.count({ where: { associationId: clubId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } })) >= 100) throw new BadRequestException('That’s a lot for one day. Try again tomorrow.');
  await prisma.clubCarbonEntry.create({
    data: { associationId: clubId, userId: user.id, activity: String(b.activity), quantity: Number(b.quantity), kgCo2e: kg, note: typeof b.note === 'string' ? b.note.trim().slice(0, 200) || null : null, occurredAt: at },
  });
  return clubCarbon(user, clubId);
}

/** DELETE /api/campus/clubs/[id]/carbon?entry= */
export async function deleteCarbon(user: SessionUser, clubId: string, entryId: string) {
  const { founder } = await access(user, clubId);
  const e = await prisma.clubCarbonEntry.findFirst({ where: { id: entryId, associationId: clubId }, select: { userId: true } });
  if (!e) throw new NotFoundException('Entry not found.');
  if (e.userId !== user.id && !founder && user.role !== 'ADMIN') throw new ForbiddenException('Only whoever added it, the founder or an admin can remove it.');
  await prisma.clubCarbonEntry.delete({ where: { id: entryId } });
  return clubCarbon(user, clubId);
}
