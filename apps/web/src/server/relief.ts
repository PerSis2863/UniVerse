import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, SKILLS, SKILL_LABEL, URGENCIES, runsOrg, snap, textNumber, whoToAlert } from '@/lib/relief';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { notifyMany } from './email';
import { pushService } from './services/push.service';
import { oneOf, type Body } from './body';
import { num, short } from './trace';
import { orgRole } from './relief-orgs';
import { textPosted, textToPost } from './relief-texts';

// UniVerse Relief (migration 0180): needs and offers of help on one live map. Anyone signed in can
// ask for help or offer it; a helper takes a need ("I can help"), and the person who asked or the
// helper marks it delivered. Positions are rounded to about 500 m when saved (snap), so a post never
// shows a door. Nothing older than 30 days is shown on the map. The person who asked hears when
// someone takes, gives back or delivers their request, and helpers who opted in (relief_watches,
// migration 0181) hear about new needs near the place they chose. An organisation (M106,
// src/server/relief-orgs.ts) can post in its name and take needs on; its coordinators can then
// deliver or give back what it took.

const DAY = 86_400_000;
const PUBLIC = { id: true, type: true, kind: true, title: true, details: true, people: true, urgency: true, lat: true, lng: true, place: true, skill: true, status: true, createdAt: true, takenAt: true, doneAt: true, userId: true, helperId: true, orgId: true, helperOrgId: true } as const;
type Row = { id: string; userId: string; helperId: string | null; orgId: string | null; helperOrgId: string | null; [k: string]: unknown };

/**
 * A post as the viewer may see it: who posted (to message them), the organisation behind it, and
 * whether it's theirs to deliver (they took it, or they run the organisation that did).
 */
async function shape(rows: Row[], u: SessionUser) {
  const ids = [...new Set(rows.flatMap((r) => [r.userId, r.helperId]).filter((x): x is string => !!x))];
  const orgIds = [...new Set(rows.flatMap((r) => [r.orgId, r.helperOrgId]).filter((x): x is string => !!x))];
  const [people, orgs, runs] = await Promise.all([
    ids.length ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [],
    orgIds.length ? prisma.reliefOrg.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [],
    orgIds.length ? prisma.reliefOrgMember.findMany({ where: { userId: u.id, orgId: { in: orgIds }, role: { in: ['OWNER', 'COORDINATOR'] } }, select: { orgId: true } }) : [],
  ]);
  const who = (id: string | null) => (id ? people.find((p) => p.id === id) ?? null : null);
  const org = (id: string | null) => (id ? orgs.find((o) => o.id === id) ?? null : null);
  const mine = new Set(runs.map((r) => r.orgId));
  return rows.map(({ userId, helperId, orgId, helperOrgId, ...r }) => ({
    ...r, by: who(userId), helper: who(helperId), org: org(orgId), helperOrg: org(helperOrgId),
    mine: userId === u.id, helping: helperId === u.id || (!!helperOrgId && mine.has(helperOrgId)),
  }));
}

/** GET /relief/map: open needs and offers of the last 30 days, and how the community is doing. */
export async function reliefMap(u: SessionUser) {
  const since = new Date(Date.now() - 30 * DAY);
  const [open, done, stats] = await Promise.all([
    prisma.reliefPost.findMany({ where: { status: { in: ['OPEN', 'TAKEN'] }, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, take: 600, select: PUBLIC }),
    prisma.reliefPost.findMany({ where: { status: 'DONE', doneAt: { gt: since } }, orderBy: { doneAt: 'desc' }, take: 300, select: PUBLIC }),
    prisma.$queryRawUnsafe<{ helped: unknown; minutes: unknown; helpers: unknown }[]>(
      `SELECT COALESCE(SUM(people), 0) AS helped, AVG((julianday(doneAt) - julianday(createdAt)) * 1440) AS minutes, COUNT(DISTINCT helperId) AS helpers FROM relief_posts WHERE status = 'DONE' AND doneAt > ?`,
      since.toISOString().replace('Z', '+00:00'),
    ).catch(() => [{ helped: 0, minutes: null, helpers: 0 }]),
  ]);
  const needs = open.filter((p) => p.type === 'NEED');
  return {
    posts: await shape(open, u),
    recent: await shape(done.slice(0, 20), u),
    done: done.map((p) => ({ lat: p.lat, lng: p.lng, people: p.people, kind: p.kind })),
    stats: {
      openNeeds: needs.filter((p) => p.status === 'OPEN').length, inProgress: needs.filter((p) => p.status === 'TAKEN').length,
      offers: open.filter((p) => p.type === 'OFFER').length, peopleWaiting: needs.reduce((a, p) => a + p.people, 0),
      helped: Number(stats[0]?.helped ?? 0), avgMinutes: stats[0]?.minutes === null ? null : Math.round(Number(stats[0]?.minutes ?? 0)), helpers: Number(stats[0]?.helpers ?? 0),
    },
  };
}

/** POST /relief/posts: ask for help (NEED) or offer it (OFFER). */
export async function createReliefPost(u: SessionUser, b: Body) {
  if (!oneOf(['NEED', 'OFFER'] as const, b.type)) throw new BadRequestException('Is this a need or an offer?');
  if (!oneOf(RELIEF_KINDS, b.kind)) throw new BadRequestException('Pick what kind of help.');
  const title = short(b.title, 120);
  if (!title) throw new BadRequestException('Say in a few words what’s needed or offered.');
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if (lat === null || lng === null) throw new BadRequestException('Where is it? Use your location or tap the map.');
  const urgency = oneOf(URGENCIES, b.urgency) ? b.urgency : 'MEDIUM';
  const open = await prisma.reliefPost.count({ where: { userId: u.id, status: 'OPEN' } });
  if (open >= 20) throw new BadRequestException('You have 20 open posts. Close some that are done first.');
  // In an organisation's name (M106): its coordinators only.
  const orgId = typeof b.orgId === 'string' && b.orgId ? b.orgId : null;
  if (orgId && !runsOrg(await orgRole(u.id, orgId))) throw new ForbiddenException('Only the organisation’s coordinators can post in its name.');
  // From a text request (M107): checked first, marked as put on the map after.
  const text = typeof b.textId === 'string' && b.textId ? await textToPost(u, b.textId, orgId) : null;
  const post = await prisma.reliefPost.create({
    data: { userId: u.id, orgId, type: b.type, kind: b.kind, title, details: short(b.details, 1000), people: Math.round(num(b.people, 1, 10_000) ?? 1), urgency: b.type === 'OFFER' ? 'LOW' : urgency, lat: snap(lat), lng: snap(lng), place: short(b.place, 120), skill: b.type === 'NEED' && oneOf(SKILLS, b.skill) ? b.skill : null },
  });
  if (text) await textPosted(u, text, post.id);
  if (post.type === 'NEED') await alertWatchers(post).catch((e) => console.error('relief alerts failed:', e));
  return post;
}

/** Tells these people in the app, by email if they want it, and on their phone. */
async function tell(userIds: string[], n: { title: string; body: string; link: string; tag: string; email?: boolean }) {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  await notifyMany(ids, { type: 'relief', title: n.title, body: n.body, link: n.link, email: n.email ?? true });
  await pushService.sendToMany(ids, { title: n.title, body: n.body.slice(0, 140), url: n.link, tag: n.tag }).catch(() => 0);
}

/**
 * Helpers who asked to hear about needs near them (whoToAlert in src/lib/relief.ts): those with the
 * skill a need asks for hear "your skill is needed", the others the usual alert (M149).
 */
export async function alertWatchers(post: { id: string; userId: string; kind: string; title: string; urgency: string; people: number; lat: number; lng: number; place: string | null; skill?: string | null }) {
  // About 25 km around (the largest radius allowed); the exact distance is checked in whoToAlert.
  const dLat = 0.25, dLng = dLat / Math.max(0.2, Math.cos((post.lat * Math.PI) / 180));
  const near = await prisma.reliefWatch.findMany({ where: { lat: { gte: post.lat - dLat, lte: post.lat + dLat }, lng: { gte: post.lng - dLng, lte: post.lng + dLng }, userId: { not: post.userId } }, take: 400 });
  const { skilled, others } = whoToAlert(near, { ...post, skill: post.skill ?? null });
  // M152: by email too for the helpers who ticked "Also email me" on their alert.
  const emails = new Set(near.filter((w) => w.email).map((w) => w.userId));
  const split = async (ids: string[], n: Omit<Parameters<typeof tell>[1], 'email'>) => {
    await tell(ids.filter((id) => emails.has(id)), { ...n, email: true });
    await tell(ids.filter((id) => !emails.has(id)), { ...n, email: false });
  };
  const urgent = post.urgency === 'HIGH' || post.urgency === 'CRITICAL';
  const kind = RELIEF_KIND_LABEL[post.kind as keyof typeof RELIEF_KIND_LABEL] ?? 'Help';
  const where = post.place ? ` · ${post.place}` : '';
  const link = `/relief?post=${post.id}`;
  if (skilled.length && post.skill) {
    await split(skilled, { title: `Your skill is needed: ${SKILL_LABEL[post.skill as keyof typeof SKILL_LABEL] ?? post.skill}`, body: `${post.title}${where}. You listed it with your alerts: open the map to help.`, link, tag: `relief-near-${post.id}` });
  }
  if (others.length) await split(others, { title: `${urgent ? 'Urgent: ' : ''}${kind} needed near you`, body: `${post.title}${where}. Open the map to help.`, link, tag: `relief-near-${post.id}` });
  return skilled.length + others.length;
}

/** GET /relief/watch: my alert, or null. */
export const reliefWatch = (u: SessionUser) => prisma.reliefWatch.findUnique({ where: { userId: u.id } });

/** PUT /relief/watch { lat, lng, radiusKm, urgentOnly, kinds?, skills?, email? }: hear about new needs near this place. */
export async function setReliefWatch(u: SessionUser, b: Body) {
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if (lat === null || lng === null) throw new BadRequestException('Choose where: use your location or tap the map.');
  const radiusKm = num(b.radiusKm, 1, 25) ?? 5;
  const kinds = Array.isArray(b.kinds) ? [...new Set(b.kinds.filter((k): k is string => oneOf(RELIEF_KINDS, k)))].join(',') || null : null;
  // M149: what this helper can do (comma-separated SKILLS).
  const skills = Array.isArray(b.skills) ? [...new Set(b.skills.filter((k): k is string => oneOf(SKILLS, k)))].join(',') || null : null;
  // M153: a phone number for emergency texts, only when the helper asks for them.
  const smsTo = b.sms === true ? textNumber(b.smsTo) : null;
  if (b.sms === true && !smsTo) throw new BadRequestException('Enter your number with the country code, like +91 98765 43210.');
  const data = { lat: snap(lat), lng: snap(lng), radiusKm, urgentOnly: b.urgentOnly !== false, kinds, skills, email: b.email === true, smsTo };
  return prisma.reliefWatch.upsert({ where: { userId: u.id }, create: { userId: u.id, ...data }, update: data });
}

/** DELETE /relief/watch */
export async function clearReliefWatch(u: SessionUser) {
  await prisma.reliefWatch.deleteMany({ where: { userId: u.id } });
  return { ok: true };
}

async function post(id: string) {
  const p = await prisma.reliefPost.findUnique({ where: { id } });
  if (!p) throw new NotFoundException('That post is gone.');
  return p;
}

/**
 * POST /relief/posts/:id/:action { orgId? }: take a need (for yourself, or for an organisation you
 * coordinate), give it back, mark it delivered, or close your post.
 */
export async function reliefAction(u: SessionUser, id: string, action: string, b: Body = {}) {
  const p = await post(id);
  // A need an organisation took on: its coordinators can deliver it or give it back too.
  const forOrg = p.helperOrgId ? runsOrg(await orgRole(u.id, p.helperOrgId)) : false;
  if (action === 'take') {
    if (p.type !== 'NEED') throw new BadRequestException('Offers aren’t taken: message the person instead.');
    if (p.userId === u.id) throw new BadRequestException('This is your own request.');
    const orgId = typeof b.orgId === 'string' && b.orgId ? b.orgId : null;
    if (orgId && !runsOrg(await orgRole(u.id, orgId))) throw new ForbiddenException('Only the organisation’s coordinators can take needs for it.');
    const org = orgId ? await prisma.reliefOrg.findUnique({ where: { id: orgId }, select: { name: true } }) : null;
    const took = await prisma.reliefPost.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'TAKEN', helperId: u.id, helperOrgId: orgId, takenAt: new Date() } });
    if (!took.count) throw new BadRequestException('Someone is already helping with this one.');
    const name = org ? `${org.name} (${u.name})` : u.name;
    await tell([p.userId], { title: `${org?.name ?? u.name} is coming to help`, body: `${name} took your request “${p.title}”. You can message them from My requests.`, link: '/relief/mine', tag: `relief-${id}` });
  } else if (action === 'release') {
    if (p.helperId !== u.id && !forOrg) throw new ForbiddenException('You aren’t helping with this one.');
    await prisma.reliefPost.update({ where: { id }, data: { status: 'OPEN', helperId: null, helperOrgId: null, takenAt: null } });
    await tell([p.userId], { title: 'Your request is open again', body: `${u.name} can’t help with “${p.title}” after all. It’s back on the map for others.`, link: '/relief/mine', tag: `relief-${id}` });
  } else if (action === 'done') {
    if (p.userId !== u.id && p.helperId !== u.id && !forOrg) throw new ForbiddenException('Only the person who asked or the helper can mark it done.');
    await prisma.reliefPost.update({ where: { id }, data: { status: 'DONE', doneAt: new Date() } });
    // The other side hears it: the person who asked, or the helper.
    const other = u.id === p.userId ? p.helperId : p.userId;
    if (other) await tell([other], u.id === p.userId
      ? { title: 'Thank you for helping', body: `${u.name} marked “${p.title}” as delivered. You helped ${p.people} ${p.people === 1 ? 'person' : 'people'}.`, link: '/relief/mine', tag: `relief-${id}` }
      : { title: 'Your request was delivered', body: `${u.name} marked “${p.title}” as delivered. If something’s missing, post again.`, link: '/relief/mine', tag: `relief-${id}` });
  } else if (action === 'close') {
    if (p.userId !== u.id) throw new ForbiddenException('Only the person who posted it can close it.');
    await prisma.reliefPost.update({ where: { id }, data: { status: 'CLOSED' } });
  } else throw new BadRequestException('Unknown action.');
  return { ok: true, id, action };
}

/** GET /relief/mine: what I asked for or offered, and the needs I'm helping with. */
export async function reliefMine(u: SessionUser) {
  const [mine, helping] = await Promise.all([
    prisma.reliefPost.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 100, select: PUBLIC }),
    prisma.reliefPost.findMany({ where: { helperId: u.id }, orderBy: { takenAt: 'desc' }, take: 100, select: PUBLIC }),
  ]);
  return { mine: await shape(mine, u), helping: await shape(helping, u), helped: helping.filter((p) => p.status === 'DONE').reduce((a, p) => a + p.people, 0) };
}
