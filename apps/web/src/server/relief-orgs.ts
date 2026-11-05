import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { RELIEF_KINDS, RELIEF_ORG_KINDS, RELIEF_ORG_ROLES, mayChangeRole, nextQuantity, runsOrg, snap, supplyLow, type ReliefOrgRole } from '@/lib/relief';
import { toBase32 } from '@/lib/trace';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { notifyMany } from './email';
import { pushService } from './services/push.service';
import { publish } from './realtime';
import { num, short } from './trace';

// UniVerse Relief for organisations (M106, migration 0192): an NGO, a food bank, a shelter or a
// community group. Members have a role (src/lib/relief.ts RELIEF_ORG_ROLES): coordinators run it,
// volunteers see it and change stock counts. Supplies keep a log of every change. Volunteer shifts
// have places taken by a guarded update, so a shift never takes more people than it asked for.
// Nothing here is public: only members see an organisation, and only its name (and, for an open
// shift, its area) reaches anyone else. Never an email or a phone number.

const DAY = 86_400_000;
const MAX_MADE = 5, MAX_MEMBERS = 500, MAX_SUPPLIES = 200, MAX_SHIFTS = 100;
const at = (d: Date) => d.toISOString().replace('Z', '+00:00');

/** The person's role in this organisation, or null when they aren't in it. */
export async function orgRole(userId: string, orgId: string): Promise<ReliefOrgRole | null> {
  const m = await prisma.reliefOrgMember.findUnique({ where: { orgId_userId: { orgId, userId } }, select: { role: true } });
  return (m?.role as ReliefOrgRole | undefined) ?? null;
}

/** Members only (anyone else is told it doesn't exist); `run`: coordinators and owners only. */
async function member(u: SessionUser, orgId: string, run = false) {
  const role = await orgRole(u.id, orgId);
  if (!role) throw new NotFoundException('That organisation is gone, or you aren’t in it.');
  if (run && !runsOrg(role)) throw new ForbiddenException('Only the organisation’s coordinators can do that.');
  return role;
}

/** In the app and on their phone; never by email (no new emails). */
export async function tellRelief(userIds: string[], n: { title: string; body: string; link: string; tag: string; type?: string }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await notifyMany(ids, { type: n.type ?? 'relief', title: n.title, body: n.body, link: n.link, email: false });
  await pushService.sendToMany(ids, { title: n.title, body: n.body.slice(0, 140), url: n.link, tag: n.tag }).catch(() => 0);
}

/** Every member's open page of this organisation updates (src/lib/realtime-client.ts). */
async function refresh(orgId: string) {
  const ids = (await prisma.reliefOrgMember.findMany({ where: { orgId }, select: { userId: true }, take: MAX_MEMBERS })).map((m) => m.userId);
  publish(ids, { type: 'refresh', keys: [`/relief/orgs/${orgId}`, '/relief/orgs'] });
}

const coordinators = async (orgId: string) =>
  (await prisma.reliefOrgMember.findMany({ where: { orgId, role: { in: ['OWNER', 'COORDINATOR'] } }, select: { userId: true }, take: 50 })).map((m) => m.userId);

const newCode = () => toBase32(crypto.randomBytes(5), 6);

const base = (b: Body) => {
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  return lat === null || lng === null ? null : { lat: snap(lat), lng: snap(lng) };
};

type ShiftRow = { id: string; orgId: string; title: string; details: string | null; place: string | null; startsAt: Date; endsAt: Date; slots: number; filled: number; membersOnly: boolean };
const SHIFT = { id: true, orgId: true, title: true, details: true, place: true, startsAt: true, endsAt: true, slots: true, filled: true, membersOnly: true } as const;

/** GET /relief/orgs: my organisations, upcoming shifts that need people, and the ones I signed up for. */
export async function reliefOrgs(u: SessionUser) {
  const now = new Date();
  const [mine, signups] = await Promise.all([
    prisma.reliefOrgMember.findMany({ where: { userId: u.id }, select: { orgId: true, role: true }, orderBy: { createdAt: 'asc' }, take: 40 }),
    prisma.reliefShiftSignup.findMany({ where: { userId: u.id }, select: { shiftId: true }, orderBy: { createdAt: 'desc' }, take: 120 }),
  ]);
  const orgIds = mine.map((m) => m.orgId);
  const signed = new Set(signups.map((s) => s.shiftId));
  const [orgs, open, mineShifts, counts, low] = await Promise.all([
    orgIds.length ? prisma.reliefOrg.findMany({ where: { id: { in: orgIds } } }) : Promise.resolve([]),
    // Open to everyone, or members-only shifts of my organisations; the next 30 days.
    prisma.reliefShift.findMany({
      where: { endsAt: { gt: now }, startsAt: { lt: new Date(now.getTime() + 30 * DAY) }, OR: [{ membersOnly: false }, ...(orgIds.length ? [{ orgId: { in: orgIds } }] : [])] },
      orderBy: { startsAt: 'asc' }, take: 80, select: SHIFT,
    }),
    signed.size ? prisma.reliefShift.findMany({ where: { id: { in: [...signed] }, endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 40, select: SHIFT }) : Promise.resolve([] as ShiftRow[]),
    orgIds.length ? prisma.reliefOrgMember.groupBy({ by: ['orgId'], where: { orgId: { in: orgIds } }, _count: { _all: true } }) : Promise.resolve([]),
    orgIds.length
      ? prisma.$queryRawUnsafe<{ orgId: string; low: unknown }[]>(`SELECT "orgId", SUM(CASE WHEN "quantity" <= "lowAt" THEN 1 ELSE 0 END) AS low FROM "relief_supplies" WHERE "orgId" IN (${orgIds.map(() => '?').join(', ')}) GROUP BY "orgId"`, ...orgIds)
      : Promise.resolve([]),
  ]);
  const shifts = [...mineShifts, ...open.filter((s) => !signed.has(s.id))];
  const names = await orgNames([...new Set(shifts.map((s) => s.orgId))].filter((id) => !orgs.some((o) => o.id === id)));
  const all = new Map([...orgs.map((o) => [o.id, { id: o.id, name: o.name, kind: o.kind, place: o.place, lat: o.lat, lng: o.lng }] as const), ...names.map((o) => [o.id, o] as const)]);
  const view = (s: ShiftRow) => ({ ...s, org: all.get(s.orgId) ?? null, signedUp: signed.has(s.id) });
  return {
    orgs: orgs.map((o) => ({
      id: o.id, name: o.name, kind: o.kind, place: o.place,
      role: mine.find((m) => m.orgId === o.id)?.role ?? 'VOLUNTEER',
      members: counts.find((c) => c.orgId === o.id)?._count._all ?? 1,
      low: Number(low.find((l) => l.orgId === o.id)?.low ?? 0),
      shifts: open.filter((s) => s.orgId === o.id).length,
    })),
    mine: mineShifts.map(view),
    shifts: open.filter((s) => !signed.has(s.id) && (s.filled < s.slots)).map(view),
  };
}

const orgNames = async (ids: string[]) =>
  ids.length ? prisma.reliefOrg.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, kind: true, place: true, lat: true, lng: true } }) : [];

/** POST /relief/orgs { name, kind, about?, place?, lat?, lng? }: start an organisation (you're its owner). */
export async function createReliefOrg(u: SessionUser, b: Body) {
  const name = short(b.name, 80);
  if (!name) throw new BadRequestException('Name the organisation.');
  if ((await prisma.reliefOrg.count({ where: { createdById: u.id } })) >= MAX_MADE) throw new BadRequestException(`You’ve started ${MAX_MADE} organisations already.`);
  const where = base(b);
  const org = await prisma.reliefOrg.create({
    data: { name, kind: oneOf(RELIEF_ORG_KINDS, b.kind) ? b.kind : 'NGO', about: short(b.about, 600), place: short(b.place, 120), lat: where?.lat ?? null, lng: where?.lng ?? null, code: newCode(), createdById: u.id },
  });
  await prisma.reliefOrgMember.create({ data: { orgId: org.id, userId: u.id, role: 'OWNER' } });
  return { id: org.id, name: org.name };
}

/** POST /relief/orgs/join { code }: join as a volunteer with the code a coordinator shared. */
export async function joinReliefOrg(u: SessionUser, b: Body) {
  const code = str(b.code)?.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  const org = code && code.length === 6 ? await prisma.reliefOrg.findUnique({ where: { code } }) : null;
  if (!org) throw new NotFoundException('No organisation has that code. Check it with the person who shared it.');
  if (await orgRole(u.id, org.id)) return { id: org.id, name: org.name };
  if ((await prisma.reliefOrgMember.count({ where: { orgId: org.id } })) >= MAX_MEMBERS) throw new BadRequestException('This organisation is full.');
  await prisma.reliefOrgMember.create({ data: { orgId: org.id, userId: u.id, role: 'VOLUNTEER' } });
  await tellRelief(await coordinators(org.id), { title: `${u.name} joined ${org.name}`, body: `${u.name} joined as a volunteer. You can change their role under Members.`, link: `/relief/orgs?org=${org.id}&tab=members`, tag: `relief-org-${org.id}` });
  await refresh(org.id);
  return { id: org.id, name: org.name };
}

/** GET /relief/orgs/:id: everything a member sees (members, supplies and their log, shifts, needs). */
export async function reliefOrg(u: SessionUser, orgId: string) {
  const role = await member(u, orgId);
  const now = Date.now(), since = new Date(now - 30 * DAY);
  const [org, members, supplies, moves, shifts] = await Promise.all([
    prisma.reliefOrg.findUnique({ where: { id: orgId } }),
    prisma.reliefOrgMember.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' }, take: MAX_MEMBERS }),
    prisma.reliefSupply.findMany({ where: { orgId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], take: MAX_SUPPLIES }),
    prisma.reliefSupplyMove.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.reliefShift.findMany({ where: { orgId, endsAt: { gt: new Date(now - 2 * DAY) } }, orderBy: { startsAt: 'asc' }, take: MAX_SHIFTS, select: SHIFT }),
  ]);
  if (!org) throw new NotFoundException('That organisation is gone.');
  const signups = shifts.length ? await prisma.reliefShiftSignup.findMany({ where: { shiftId: { in: shifts.map((s) => s.id) } }, select: { shiftId: true, userId: true } }) : [];
  // The needs it is handling, and open needs within about 25 km of its base (most urgent first, on the page).
  const near = org.lat !== null && org.lng !== null ? { lat: org.lat, lng: org.lng, dLat: 0.25, dLng: 0.25 / Math.max(0.2, Math.cos((org.lat * Math.PI) / 180)) } : null;
  const [handling, open] = await Promise.all([
    prisma.reliefPost.findMany({ where: { helperOrgId: orgId, OR: [{ status: 'TAKEN' }, { status: 'DONE', doneAt: { gt: since } }] }, orderBy: { takenAt: 'desc' }, take: 60 }),
    near ? prisma.reliefPost.findMany({ where: { type: 'NEED', status: 'OPEN', createdAt: { gt: since }, lat: { gte: near.lat - near.dLat, lte: near.lat + near.dLat }, lng: { gte: near.lng - near.dLng, lte: near.lng + near.dLng } }, orderBy: { createdAt: 'desc' }, take: 60 }) : Promise.resolve([]),
  ]);
  const posts = [...handling, ...open];
  const ids = [...new Set([...members.map((m) => m.userId), ...moves.map((m) => m.userId), ...signups.map((s) => s.userId), ...posts.flatMap((p) => [p.userId, p.helperId])].filter((x): x is string => !!x))];
  const people = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((p) => [p.id, p]));
  const who = (id: string | null) => (id ? people.get(id) ?? null : null);
  const run = runsOrg(role);
  const post = (p: (typeof posts)[number]) => ({
    id: p.id, type: p.type, kind: p.kind, title: p.title, details: p.details, people: p.people, urgency: p.urgency, lat: p.lat, lng: p.lng, place: p.place,
    status: p.status, createdAt: p.createdAt, takenAt: p.takenAt, doneAt: p.doneAt, by: who(p.userId), helper: who(p.helperId),
    mine: p.userId === u.id, helping: p.helperId === u.id || (run && p.helperOrgId === orgId),
    org: null, helperOrg: p.helperOrgId === orgId ? { id: org.id, name: org.name } : null,
  });
  return {
    org: { id: org.id, name: org.name, kind: org.kind, about: org.about, place: org.place, lat: org.lat, lng: org.lng, createdAt: org.createdAt, code: run ? org.code : null },
    role,
    members: members.map((m) => ({ id: m.userId, name: who(m.userId)?.name ?? 'Someone', role: m.role, since: m.createdAt, me: m.userId === u.id })),
    supplies: supplies.map((s) => ({ id: s.id, name: s.name, kind: s.kind, unit: s.unit, quantity: s.quantity, lowAt: s.lowAt, low: supplyLow(s), updatedAt: s.updatedAt })),
    moves: moves.map((m) => ({ id: m.id, supplyId: m.supplyId, change: m.change, note: m.note, at: m.createdAt, by: who(m.userId)?.name ?? null })),
    shifts: shifts.map((s) => ({ ...s, signedUp: signups.some((g) => g.shiftId === s.id && g.userId === u.id), people: signups.filter((g) => g.shiftId === s.id).map((g) => who(g.userId) ?? { id: g.userId, name: 'Someone' }) })),
    handling: handling.map(post),
    near: open.map(post),
  };
}

/** PATCH /relief/orgs/:id { name?, kind?, about?, place?, lat?, lng? } (coordinators). */
export async function updateReliefOrg(u: SessionUser, orgId: string, b: Body) {
  await member(u, orgId, true);
  const data: { name?: string; kind?: string; about?: string | null; place?: string | null; lat?: number; lng?: number } = {};
  if (b.name !== undefined) { const name = short(b.name, 80); if (!name) throw new BadRequestException('Name the organisation.'); data.name = name; }
  if (oneOf(RELIEF_ORG_KINDS, b.kind)) data.kind = b.kind;
  if (b.about !== undefined) data.about = short(b.about, 600);
  if (b.place !== undefined) data.place = short(b.place, 120);
  const where = base(b);
  if (where) Object.assign(data, where);
  await prisma.reliefOrg.update({ where: { id: orgId }, data });
  await refresh(orgId);
  return { ok: true };
}

/** POST /relief/orgs/:id/code: a new join code (the old one stops working). */
export async function newReliefOrgCode(u: SessionUser, orgId: string) {
  await member(u, orgId, true);
  const { code } = await prisma.reliefOrg.update({ where: { id: orgId }, data: { code: newCode() }, select: { code: true } });
  return { code };
}

/** POST /relief/orgs/:id/leave. The last member leaving closes the organisation. */
export async function leaveReliefOrg(u: SessionUser, orgId: string) {
  const role = await member(u, orgId);
  const [count, owners] = await Promise.all([prisma.reliefOrgMember.count({ where: { orgId } }), prisma.reliefOrgMember.count({ where: { orgId, role: 'OWNER' } })]);
  if (count <= 1) {
    await prisma.reliefOrg.delete({ where: { id: orgId } });
    return { ok: true, closed: true };
  }
  if (role === 'OWNER' && owners <= 1) throw new BadRequestException('Make someone else an owner before you leave.');
  await prisma.reliefOrgMember.delete({ where: { orgId_userId: { orgId, userId: u.id } } });
  await refresh(orgId);
  return { ok: true, closed: false };
}

/** PATCH /relief/orgs/:id/members/:userId { role } and DELETE (remove), within mayChangeRole's rules. */
export async function setReliefOrgMember(u: SessionUser, orgId: string, userId: string, b: Body | null) {
  const by = await member(u, orgId, true);
  if (userId === u.id) throw new BadRequestException(b ? 'Ask another owner to change your role.' : 'Use Leave to leave the organisation.');
  const target = await orgRole(userId, orgId);
  if (!target) throw new NotFoundException('They aren’t in this organisation.');
  const to = b ? (oneOf(RELIEF_ORG_ROLES, b.role) ? b.role : null) : null;
  if (b && !to) throw new BadRequestException('Choose a role.');
  const owners = await prisma.reliefOrgMember.count({ where: { orgId, role: 'OWNER' } });
  if (!mayChangeRole(by, target, to, owners)) throw new ForbiddenException(by === 'COORDINATOR' ? 'Coordinators can only change volunteers. Ask an owner.' : 'The organisation needs at least one owner.');
  const org = await prisma.reliefOrg.findUnique({ where: { id: orgId }, select: { name: true } });
  if (to) {
    await prisma.reliefOrgMember.update({ where: { orgId_userId: { orgId, userId } }, data: { role: to } });
    if (to !== target) await tellRelief([userId], { title: `You’re now ${to === 'VOLUNTEER' ? 'a volunteer' : `an ${to === 'OWNER' ? 'owner' : 'coordinator'}`} at ${org?.name ?? 'your organisation'}`, body: `${u.name} changed your role.`, link: `/relief/orgs?org=${orgId}`, tag: `relief-org-${orgId}` });
  } else {
    await prisma.reliefOrgMember.delete({ where: { orgId_userId: { orgId, userId } } });
  }
  await refresh(orgId);
  return { ok: true };
}

// ─── Supplies ─────────────────────────────────────────────────────────────────────────────────

/** POST /relief/orgs/:id/supplies { name, kind, unit, quantity, lowAt } (coordinators). */
export async function addReliefSupply(u: SessionUser, orgId: string, b: Body) {
  await member(u, orgId, true);
  const name = short(b.name, 80);
  if (!name) throw new BadRequestException('Name the item.');
  if ((await prisma.reliefSupply.count({ where: { orgId } })) >= MAX_SUPPLIES) throw new BadRequestException(`An organisation can keep ${MAX_SUPPLIES} items.`);
  const quantity = nextQuantity(0, num(b.quantity, 0, 1_000_000) ?? 0);
  const s = await prisma.reliefSupply.create({
    data: { orgId, name, kind: oneOf(RELIEF_KINDS, b.kind) ? b.kind : 'OTHER', unit: short(b.unit, 24) ?? 'items', quantity, lowAt: Math.round(num(b.lowAt, 0, 1_000_000) ?? 0) },
  });
  if (quantity) await prisma.reliefSupplyMove.create({ data: { orgId, supplyId: s.id, userId: u.id, change: quantity, note: 'Starting stock' } });
  await refresh(orgId);
  return { id: s.id };
}

/**
 * PATCH /relief/orgs/:id/supplies/:sid { change? | quantity?, note?, name?, unit?, lowAt?, kind? }.
 * Any member changes the count (logged with their name); coordinators change the item itself. The
 * count changes in one statement, so two people counting at once both land, and never below zero.
 */
export async function updateReliefSupply(u: SessionUser, orgId: string, supplyId: string, b: Body) {
  const role = await member(u, orgId);
  const s = await prisma.reliefSupply.findFirst({ where: { id: supplyId, orgId } });
  if (!s) throw new NotFoundException('That item is gone.');
  const set = num(b.quantity, 0, 1_000_000);
  const change = set !== null ? Math.round(set) - s.quantity : Math.round(num(b.change, -1_000_000, 1_000_000) ?? 0);
  const edit: { name?: string; unit?: string; lowAt?: number; kind?: string } = {};
  if (b.name !== undefined) { const name = short(b.name, 80); if (name) edit.name = name; }
  if (b.unit !== undefined) { const unit = short(b.unit, 24); if (unit) edit.unit = unit; }
  const lowAt = num(b.lowAt, 0, 1_000_000);
  if (lowAt !== null) edit.lowAt = Math.round(lowAt);
  if (oneOf(RELIEF_KINDS, b.kind)) edit.kind = b.kind;
  if (Object.keys(edit).length && !runsOrg(role)) throw new ForbiddenException('Only coordinators can change the item itself. You can change the count.');
  if (!change && !Object.keys(edit).length) return { ok: true, quantity: s.quantity };
  if (Object.keys(edit).length) await prisma.reliefSupply.update({ where: { id: supplyId }, data: edit });
  let quantity = s.quantity;
  if (change) {
    await prisma.$executeRawUnsafe(`UPDATE "relief_supplies" SET "quantity" = MIN(1000000, MAX(0, "quantity" + ?)), "updatedAt" = ? WHERE "id" = ?`, change, at(new Date()), supplyId);
    await prisma.reliefSupplyMove.create({ data: { orgId, supplyId, userId: u.id, change, note: short(b.note, 140) } });
    quantity = nextQuantity(s.quantity, change);
  }
  await refresh(orgId);
  return { ok: true, quantity };
}

/** DELETE /relief/orgs/:id/supplies/:sid (coordinators). */
export async function deleteReliefSupply(u: SessionUser, orgId: string, supplyId: string) {
  await member(u, orgId, true);
  await prisma.reliefSupply.deleteMany({ where: { id: supplyId, orgId } });
  await refresh(orgId);
  return { ok: true };
}

// ─── Volunteer shifts ─────────────────────────────────────────────────────────────────────────

/** POST /relief/orgs/:id/shifts { title, details?, place?, startsAt, hours, slots, membersOnly } (coordinators). */
export async function createReliefShift(u: SessionUser, orgId: string, b: Body) {
  await member(u, orgId, true);
  const title = short(b.title, 100);
  if (!title) throw new BadRequestException('Say what the shift is for.');
  const start = typeof b.startsAt === 'string' ? new Date(b.startsAt) : null;
  const now = Date.now();
  if (!start || Number.isNaN(start.getTime()) || start.getTime() < now - 3_600_000 || start.getTime() > now + 180 * DAY) throw new BadRequestException('Choose when it starts (within the next six months).');
  const hours = num(b.hours, 0.5, 24);
  if (hours === null) throw new BadRequestException('A shift is half an hour to 24 hours long.');
  const slots = Math.round(num(b.slots, 1, 500) ?? 0);
  if (!slots) throw new BadRequestException('How many people do you need (1 to 500)?');
  if ((await prisma.reliefShift.count({ where: { orgId, endsAt: { gt: new Date() } } })) >= MAX_SHIFTS) throw new BadRequestException(`An organisation can have ${MAX_SHIFTS} shifts coming up.`);
  const s = await prisma.reliefShift.create({
    data: { orgId, title, details: short(b.details, 600), place: short(b.place, 120), startsAt: start, endsAt: new Date(start.getTime() + hours * 3_600_000), slots, membersOnly: b.membersOnly === true, createdById: u.id },
  });
  await refresh(orgId);
  return { id: s.id };
}

/** DELETE /relief/orgs/:id/shifts/:sid (coordinators): cancels it, and everyone signed up hears. */
export async function cancelReliefShift(u: SessionUser, orgId: string, shiftId: string) {
  await member(u, orgId, true);
  const s = await prisma.reliefShift.findFirst({ where: { id: shiftId, orgId }, select: { id: true, title: true, startsAt: true, endsAt: true } });
  if (!s) throw new NotFoundException('That shift is gone.');
  const people = (await prisma.reliefShiftSignup.findMany({ where: { shiftId }, select: { userId: true } })).map((g) => g.userId).filter((id) => id !== u.id);
  await prisma.reliefShift.delete({ where: { id: shiftId } });
  if (s.endsAt.getTime() > Date.now()) {
    const org = await prisma.reliefOrg.findUnique({ where: { id: orgId }, select: { name: true } });
    await tellRelief(people, { title: `Shift cancelled: ${s.title}`, body: `${org?.name ?? 'The organisation'} cancelled this shift. Thank you for signing up.`, link: '/relief/orgs', tag: `relief-shift-${shiftId}` });
  }
  await refresh(orgId);
  return { ok: true };
}

/** POST /relief/shifts/:sid/signup: take a place (open shifts: anyone; members-only: members). */
export async function signUpReliefShift(u: SessionUser, shiftId: string) {
  const s = await prisma.reliefShift.findUnique({ where: { id: shiftId } });
  if (!s || s.endsAt.getTime() <= Date.now()) throw new NotFoundException('That shift is over or gone.');
  if (s.membersOnly && !(await orgRole(u.id, s.orgId))) throw new ForbiddenException('This shift is for the organisation’s members.');
  if (await prisma.reliefShiftSignup.findUnique({ where: { shiftId_userId: { shiftId, userId: u.id } } })) return { ok: true };
  // The place is taken first, guarded by the count, so a full shift never takes one more.
  const took = await prisma.$executeRawUnsafe(`UPDATE "relief_shifts" SET "filled" = "filled" + 1 WHERE "id" = ? AND "filled" < "slots"`, shiftId);
  if (!took) throw new BadRequestException('This shift is full. Thank you for offering!');
  try {
    await prisma.reliefShiftSignup.create({ data: { shiftId, userId: u.id } });
  } catch (e) {
    // Signed up a moment ago in another tab: give the extra place back.
    await prisma.$executeRawUnsafe(`UPDATE "relief_shifts" SET "filled" = MAX(0, "filled" - 1) WHERE "id" = ?`, shiftId);
    if (!/unique constraint/i.test(String((e as Error)?.message))) throw e;
    return { ok: true };
  }
  if (s.createdById && s.createdById !== u.id) {
    await tellRelief([s.createdById], { title: `${u.name} signed up: ${s.title}`, body: `${s.filled + 1} of ${s.slots} places taken.`, link: `/relief/orgs?org=${s.orgId}&tab=shifts`, tag: `relief-shift-${shiftId}` });
  }
  await refresh(s.orgId);
  return { ok: true };
}

/** DELETE /relief/shifts/:sid/signup: give the place back. */
export async function leaveReliefShift(u: SessionUser, shiftId: string) {
  const gone = await prisma.reliefShiftSignup.deleteMany({ where: { shiftId, userId: u.id } });
  if (gone.count) {
    await prisma.$executeRawUnsafe(`UPDATE "relief_shifts" SET "filled" = MAX(0, "filled" - 1) WHERE "id" = ?`, shiftId);
    const s = await prisma.reliefShift.findUnique({ where: { id: shiftId }, select: { orgId: true } });
    if (s) await refresh(s.orgId);
  }
  return { ok: true };
}

/**
 * The daily jobs (src/server/daily-jobs.ts): everyone signed up for a shift starting in the next 24
 * hours hears once ("starts in about 5 hours", so no time zone to get wrong). `room` is how many
 * queries the run can still spend.
 */
export async function shiftReminders(room: () => number): Promise<{ done: boolean; info: number }> {
  const now = Date.now();
  const shifts = await prisma.reliefShift.findMany({ where: { startsAt: { gt: new Date(now), lte: new Date(now + DAY) }, filled: { gt: 0 } }, select: { id: true, orgId: true, title: true, place: true, startsAt: true }, orderBy: { startsAt: 'asc' }, take: 100 });
  let sent = 0;
  for (const s of shifts) {
    if (room() < 6) return { done: false, info: sent };
    const link = `/relief/orgs?shift=${s.id}`;
    const [people, already] = await Promise.all([
      prisma.reliefShiftSignup.findMany({ where: { shiftId: s.id }, select: { userId: true } }),
      prisma.notification.findMany({ where: { type: 'reminder', link }, select: { userId: true } }),
    ]);
    const told = new Set(already.map((n) => n.userId));
    const ids = people.map((p) => p.userId).filter((id) => !told.has(id));
    if (!ids.length) continue;
    const hours = Math.max(1, Math.round((s.startsAt.getTime() - now) / 3_600_000));
    await tellRelief(ids, { type: 'reminder', title: `Your shift: ${s.title}`, body: `Starts in about ${hours} ${hours === 1 ? 'hour' : 'hours'}${s.place ? ` · ${s.place}` : ''}. Thank you for volunteering!`, link, tag: `relief-shift-${s.id}` });
    sent += ids.length;
  }
  return { done: true, info: sent };
}
