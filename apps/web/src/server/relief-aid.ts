import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { AID_LABEL, aidCodeOf, aidMayMove, demoAid, runsOrg, type AidStep } from '@/lib/relief';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, type Body } from './body';
import { notifyMany } from './email';
import { pushService } from './services/push.service';
import { orgRole } from './relief-orgs';
import { num, short } from './trace';

// M151: Relief's traceable aid (the owner, 10 Nov 2026). An organisation's coordinators give each aid box
// (or pallet) a code with what is in it and where it goes; any member logs its trip (on the way, with the
// town; delivered). Anyone with the link or QR code sees the trip on /aid/<code>: the organisation, the
// contents, towns and times, never who packed, carried or received it. Signed-in donors follow a box and
// are told at each step.

// 32 letters and digits without look-alikes (no I, O, 0, 1): 10 of them is 50 bits, not guessable.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => ALPHABET[x & 31]).join('');
const DAY = 86_400_000;

/** GET /relief/orgs/:id/aid: the organisation's boxes, newest first (members only). */
export async function orgAid(u: SessionUser, orgId: string) {
  const role = await orgRole(u.id, orgId);
  if (!role) throw new NotFoundException('That organisation is gone, or you aren’t in it.');
  const boxes = await prisma.reliefAid.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 80 });
  const follows = boxes.length ? await prisma.reliefAidFollow.groupBy({ by: ['aidId'], where: { aidId: { in: boxes.map((b) => b.id) } }, _count: { _all: true } }) : [];
  return {
    run: runsOrg(role),
    boxes: boxes.map(({ createdById, ...b }) => { void createdById; return { ...b, followers: follows.find((f) => f.aidId === b.id)?._count._all ?? 0 }; }),
  };
}

/** POST /relief/orgs/:id/aid { contents, boxes?, toPlace, fromPlace? }: coordinators pack a box (300 a day). */
export async function createAid(u: SessionUser, orgId: string, b: Body) {
  if (!runsOrg(await orgRole(u.id, orgId))) throw new ForbiddenException('Only the organisation’s coordinators can add aid boxes.');
  const contents = short(b.contents, 200), toPlace = short(b.toPlace, 120);
  if (!contents) throw new BadRequestException('Say what is in it.');
  if (!toPlace) throw new BadRequestException('Say where it is going (a town or an area).');
  if ((await prisma.reliefAid.count({ where: { orgId, createdAt: { gt: new Date(Date.now() - DAY) } } })) >= 300) throw new BadRequestException('That’s 300 boxes today. Add more tomorrow.');
  const org = await prisma.reliefOrg.findUnique({ where: { id: orgId }, select: { place: true } });
  const fromPlace = short(b.fromPlace, 120) ?? org?.place ?? null;
  const aid = await prisma.reliefAid.create({
    data: { orgId, code: newCode(), contents, boxes: Math.round(num(b.boxes, 1, 10_000) ?? 1), fromPlace, toPlace, createdById: u.id },
  });
  await prisma.reliefAidStep.create({ data: { aidId: aid.id, status: 'PACKED', place: fromPlace } });
  return aid;
}

/**
 * POST /relief/aid/:id/step { status: ON_THE_WAY | DELIVERED, place?, note? }: any member logs where the
 * box is; delivered is the end (claimed by a guarded update, so two people can't both deliver it).
 */
export async function stepAid(u: SessionUser, id: string, b: Body) {
  const aid = await prisma.reliefAid.findUnique({ where: { id } });
  if (!aid || !(await orgRole(u.id, aid.orgId))) throw new NotFoundException('That box is gone, or you aren’t in its organisation.');
  const status = oneOf(['ON_THE_WAY', 'DELIVERED'] as const, b.status) ? b.status : null;
  if (!status || !aidMayMove(aid.status, status)) throw new BadRequestException(aid.status === 'DELIVERED' ? 'That box was already delivered.' : 'Choose on the way or delivered.');
  const moved = await prisma.reliefAid.updateMany({ where: { id, status: { not: 'DELIVERED' } }, data: { status, updatedAt: new Date() } });
  if (!moved.count) throw new BadRequestException('That box was already delivered.');
  const place = short(b.place, 120) ?? (status === 'DELIVERED' ? aid.toPlace : null);
  const step = await prisma.reliefAidStep.create({ data: { aidId: id, status, place, note: short(b.note, 200) } });
  await tellFollowers(aid, status, place).catch((e) => console.error('relief aid followers failed:', e));
  return { ok: true, status, step };
}

async function tellFollowers(aid: { id: string; code: string; contents: string; orgId: string }, status: AidStep, place: string | null) {
  const ids = (await prisma.reliefAidFollow.findMany({ where: { aidId: aid.id }, select: { userId: true }, take: 200 })).map((f) => f.userId);
  if (!ids.length) return;
  const org = await prisma.reliefOrg.findUnique({ where: { id: aid.orgId }, select: { name: true } });
  const title = status === 'DELIVERED' ? 'The aid you follow was delivered' : 'The aid you follow is on the way';
  const body = `${aid.contents} from ${org?.name ?? 'a Relief organisation'}: ${AID_LABEL[status].toLowerCase()}${place ? ` in ${place}` : ''}.`;
  await notifyMany(ids, { type: 'relief', title, body, link: `/aid/${aid.code}` });
  await pushService.sendToMany(ids, { title, body, url: `/aid/${aid.code}`, tag: `relief-aid-${aid.id}` }).catch(() => 0);
}

async function byCode(raw: string) {
  const code = aidCodeOf(raw);
  const aid = code.length >= 6 ? await prisma.reliefAid.findUnique({ where: { code } }) : null;
  if (!aid) throw new NotFoundException('No aid box has that code.');
  return aid;
}

/** GET /relief/aid/:code (public): the box's trip: towns and times, never people. */
export async function aidPublic(raw: string) {
  if (aidCodeOf(raw) === 'DEMO') return demoAid(Date.now());
  const aid = await byCode(raw);
  const [org, steps, followers] = await Promise.all([
    prisma.reliefOrg.findUnique({ where: { id: aid.orgId }, select: { name: true, kind: true, place: true } }),
    prisma.reliefAidStep.findMany({ where: { aidId: aid.id }, orderBy: { createdAt: 'asc' }, take: 50, select: { status: true, place: true, note: true, createdAt: true } }),
    prisma.reliefAidFollow.count({ where: { aidId: aid.id } }),
  ]);
  return {
    code: aid.code, contents: aid.contents, boxes: aid.boxes, fromPlace: aid.fromPlace, toPlace: aid.toPlace, status: aid.status,
    createdAt: aid.createdAt, updatedAt: aid.updatedAt, org, steps, followers,
  };
}

/** GET /relief/aid/:code/follow: whether I follow it. */
export async function aidFollowing(u: SessionUser, raw: string) {
  const aid = await byCode(raw);
  return { following: !!(await prisma.reliefAidFollow.findUnique({ where: { aidId_userId: { aidId: aid.id, userId: u.id } } })) };
}

/** POST /relief/aid/:code/follow { on }: follow a box (told at each step) or stop. */
export async function followAid(u: SessionUser, raw: string, b: Body) {
  const aid = await byCode(raw);
  const on = b.on !== false;
  if (on) await prisma.reliefAidFollow.upsert({ where: { aidId_userId: { aidId: aid.id, userId: u.id } }, create: { aidId: aid.id, userId: u.id }, update: {} });
  else await prisma.reliefAidFollow.deleteMany({ where: { aidId: aid.id, userId: u.id } });
  return { following: on, followers: await prisma.reliefAidFollow.count({ where: { aidId: aid.id } }) };
}
