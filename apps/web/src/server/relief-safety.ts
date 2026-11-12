import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { kmBetween, runsOrg, snap, type ReliefOrgRole } from '@/lib/relief';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { strings, type Body } from './body';
import { later, notifyMany } from './email';
import { textEmergency } from './relief-sms';
import { pushService } from './services/push.service';
import { orgRole } from './relief-orgs';
import { publish } from './realtime';
import { num, short } from './trace';

// M150: Relief's "I'm safe" check-in (the owner, 10 Nov 2026). An organisation's coordinators declare an
// emergency for an area for a while; helpers with nearby alerts there are asked if they're safe. Anyone
// can say "I'm safe" and pick who is told, only among the people they already have a direct conversation
// with (so it can't be used to message strangers); nobody else sees who is safe. "I need help" opens a
// request on the map.

const HOUR = 3_600_000;

/** The people someone has a direct conversation with (newest first), the only ones they can tell. */
export async function contactsOf(userId: string, limit = 60) {
  const mine = await prisma.conversationParticipant.findMany({
    where: { userId, conversation: { isGroup: false, communityId: null } },
    orderBy: { conversation: { updatedAt: 'desc' } }, take: 200, select: { conversationId: true },
  });
  if (!mine.length) return [];
  const others = await prisma.conversationParticipant.findMany({
    where: { conversationId: { in: mine.map((m) => m.conversationId) }, userId: { not: userId } },
    select: { conversationId: true, user: { select: { id: true, name: true } } },
  });
  const order = new Map(mine.map((m, i) => [m.conversationId, i]));
  const seen = new Set<string>();
  return others
    .sort((a, b) => (order.get(a.conversationId) ?? 0) - (order.get(b.conversationId) ?? 0))
    .map((o) => o.user)
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .slice(0, limit);
}

/** GET /relief/contacts: who I can tell. */
export const reliefContacts = async (u: SessionUser) => ({ contacts: await contactsOf(u.id) });

/**
 * GET /relief/incidents[?lat&lng]: the emergencies that concern me (not every one in the world): those of
 * my organisations, those whose area holds my nearby alert or the place my browser shared (the query,
 * rounded), those someone told me they're safe in, and those I said I'm safe in. Whether I said I'm safe,
 * and who told me they are.
 */
export async function reliefIncidents(u: SessionUser, q: { lat?: unknown; lng?: unknown } = {}) {
  const now = new Date();
  const all = await prisma.reliefIncident.findMany({ where: { endsAt: { gt: now } }, orderBy: { createdAt: 'desc' }, take: 60 });
  if (!all.length) return { incidents: [] };
  const allIds = all.map((i) => i.id), orgIds = [...new Set(all.map((i) => i.orgId))];
  const [watch, memberOf, mine, toldMe] = await Promise.all([
    prisma.reliefWatch.findUnique({ where: { userId: u.id }, select: { lat: true, lng: true } }),
    prisma.reliefOrgMember.findMany({ where: { userId: u.id, orgId: { in: orgIds } }, select: { orgId: true, role: true } }),
    prisma.reliefSafe.findMany({ where: { userId: u.id, incidentId: { in: allIds } } }),
    prisma.reliefSafeTold.findMany({ where: { toUserId: u.id, incidentId: { in: allIds } }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  const lat = num(q.lat, -90, 90), lng = num(q.lng, -180, 180);
  const here = lat !== null && lng !== null ? { lat: snap(lat), lng: snap(lng) } : null;
  const inside = (p: { lat: number; lng: number } | null, i: { lat: number; lng: number; radiusKm: number }) => !!p && kmBetween(p, i) <= i.radiusKm;
  const list = all.filter((i) => memberOf.some((m) => m.orgId === i.orgId) || inside(watch, i) || inside(here, i)
    || toldMe.some((t) => t.incidentId === i.id) || mine.some((m) => m.incidentId === i.id)).slice(0, 20);
  if (!list.length) return { incidents: [] };
  const ids = list.map((i) => i.id);
  const runs = memberOf.filter((m) => runsOrg(m.role as ReliefOrgRole));
  const [orgs, myTold] = await Promise.all([
    prisma.reliefOrg.findMany({ where: { id: { in: [...new Set(list.map((i) => i.orgId))] } }, select: { id: true, name: true } }),
    prisma.reliefSafeTold.groupBy({ by: ['incidentId'], where: { userId: u.id, incidentId: { in: ids } }, _count: { _all: true } }),
  ]);
  // M155: for the coordinators of an emergency, how many said they're safe (a number, never who).
  const runIds = list.filter((i) => runs.some((r) => r.orgId === i.orgId)).map((i) => i.id);
  const safeCounts = runIds.length ? await prisma.reliefSafe.groupBy({ by: ['incidentId'], where: { incidentId: { in: runIds } }, _count: { _all: true } }) : [];
  const people = toldMe.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(toldMe.map((t) => t.userId))] } }, select: { id: true, name: true } }) : [];
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';
  return {
    incidents: list.map((i) => ({
      id: i.id, title: i.title, place: i.place, lat: i.lat, lng: i.lng, radiusKm: i.radiusKm, endsAt: i.endsAt, createdAt: i.createdAt,
      org: orgs.find((o) => o.id === i.orgId) ?? null,
      safeAt: mine.find((m) => m.incidentId === i.id)?.createdAt ?? null,
      told: myTold.find((t) => t.incidentId === i.id)?._count._all ?? 0,
      safeContacts: toldMe.filter((t) => t.incidentId === i.id).map((t) => ({ name: name(t.userId), at: t.createdAt })),
      canEnd: runs.some((r) => r.orgId === i.orgId),
      safeCount: runIds.includes(i.id) ? (safeCounts.find((c) => c.incidentId === i.id)?._count._all ?? 0) : null,
    })),
  };
}

/**
 * POST /relief/incidents { orgId, title, place?, lat?, lng?, radiusKm?, hours? }: a coordinator declares an
 * emergency (around the organisation's base unless a place is given), 3 at a time per organisation;
 * helpers with nearby alerts in the area are asked if they're safe (in the app, by email if they get
 * emails, and on their phone).
 */
export async function declareIncident(u: SessionUser, b: Body) {
  const orgId = typeof b.orgId === 'string' ? b.orgId : '';
  if (!orgId || !runsOrg(await orgRole(u.id, orgId))) throw new ForbiddenException('Only an organisation’s coordinators can declare an emergency.');
  const title = short(b.title, 120);
  if (!title) throw new BadRequestException('Say what is happening, in a few words.');
  const org = await prisma.reliefOrg.findUnique({ where: { id: orgId }, select: { lat: true, lng: true, place: true } });
  const lat = num(b.lat, -90, 90) ?? org?.lat ?? null, lng = num(b.lng, -180, 180) ?? org?.lng ?? null;
  if (lat === null || lng === null) throw new BadRequestException('Where? Set your organisation’s base first.');
  if ((await prisma.reliefIncident.count({ where: { orgId, endsAt: { gt: new Date() } } })) >= 3) throw new BadRequestException('Your organisation has 3 emergencies going on. End one first.');
  const radiusKm = Math.round(num(b.radiusKm, 1, 200) ?? 20), hours = Math.round(num(b.hours, 6, 168) ?? 72);
  const incident = await prisma.reliefIncident.create({
    data: { orgId, createdById: u.id, title, place: short(b.place, 120) ?? org?.place ?? null, lat: snap(lat), lng: snap(lng), radiusKm, endsAt: new Date(Date.now() + hours * HOUR) },
  });
  await askNearby(incident).catch((e) => console.error('relief safety alerts failed:', e));
  return incident;
}

/** Helpers whose nearby alert is inside the emergency's area (up to 200): "Are you safe?". */
async function askNearby(i: { id: string; title: string; lat: number; lng: number; radiusKm: number; createdById: string | null }) {
  const dLat = i.radiusKm / 111, dLng = dLat / Math.max(0.2, Math.cos((i.lat * Math.PI) / 180));
  const near = await prisma.reliefWatch.findMany({ where: { lat: { gte: i.lat - dLat, lte: i.lat + dLat }, lng: { gte: i.lng - dLng, lte: i.lng + dLng } }, select: { userId: true, lat: true, lng: true }, take: 400 });
  const ids = near.filter((w) => w.userId !== i.createdById && kmBetween(w, i) <= i.radiusKm).map((w) => w.userId).slice(0, 200);
  if (!ids.length) return;
  const n = { title: `Emergency near you: ${i.title}`, body: 'Are you safe? Tell the people close to you in one tap, or ask for help, on Relief.', link: '/relief', tag: `relief-incident-${i.id}` };
  await notifyMany(ids, { type: 'relief', title: n.title, body: n.body, link: n.link, urgent: true });
  await pushService.sendToMany(ids, { title: n.title, body: n.body, url: n.link, tag: n.tag }).catch(() => 0);
  publish(ids, { type: 'refresh', keys: ['/relief/incidents*'] }); // M155: the banner shows at once for those open
  // M153: a text too for the ones who asked, when the owner has emergency texts on (after the answer).
  later(() => textEmergency(i, ids));
}

/** POST /relief/incidents/:id/end: its organisation's coordinators end it. */
export async function endIncident(u: SessionUser, id: string) {
  const i = await prisma.reliefIncident.findUnique({ where: { id }, select: { orgId: true } });
  if (!i) throw new NotFoundException('That emergency is gone.');
  if (!runsOrg(await orgRole(u.id, i.orgId))) throw new ForbiddenException('Only its organisation’s coordinators can end it.');
  await prisma.reliefIncident.update({ where: { id }, data: { endsAt: new Date() } });
  return { ok: true };
}

/**
 * POST /relief/incidents/:id/safe { tell: userIds }: "I'm safe", told to the people chosen (20 at a time),
 * only among those I already have a direct conversation with; telling more later adds them.
 */
export async function markSafe(u: SessionUser, id: string, b: Body) {
  const i = await prisma.reliefIncident.findUnique({ where: { id }, select: { id: true, title: true, endsAt: true } });
  if (!i || i.endsAt <= new Date()) throw new NotFoundException('That emergency is over.');
  const asked = new Set((strings(b.tell) ?? []).slice(0, 20));
  const mine = new Set((await contactsOf(u.id, 200)).map((c) => c.id));
  const tell = [...asked].filter((x) => mine.has(x));
  await prisma.reliefSafe.upsert({ where: { incidentId_userId: { incidentId: id, userId: u.id } }, create: { incidentId: id, userId: u.id }, update: {} });
  const already = new Set((await prisma.reliefSafeTold.findMany({ where: { incidentId: id, userId: u.id }, select: { toUserId: true } })).map((t) => t.toUserId));
  const fresh = tell.filter((x) => !already.has(x));
  for (const to of fresh) await prisma.reliefSafeTold.create({ data: { incidentId: id, userId: u.id, toUserId: to } }).catch(() => null);
  if (fresh.length) {
    const n = { title: `${u.name} is safe`, body: `${u.name} told you they’re safe during “${i.title}”.`, link: '/relief' };
    await notifyMany(fresh, { type: 'relief', ...n, urgent: true });
    await pushService.sendToMany(fresh, { title: n.title, body: n.body, url: n.link, tag: `relief-safe-${id}-${u.id}` }).catch(() => 0);
    publish(fresh, { type: 'refresh', keys: ['/relief/incidents*'] }); // M155: "<name> told you they're safe", live
  }
  return { ok: true, told: already.size + fresh.length };
}
