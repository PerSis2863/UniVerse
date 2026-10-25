import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, URGENCIES, snap } from '@/lib/relief';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { notifyMany } from './email';
import { pushService } from './services/push.service';
import { oneOf, type Body } from './body';
import { num, short } from './trace';

// UniVerse Relief (migration 0180): needs and offers of help on one live map. Anyone signed in can
// ask for help or offer it; a helper takes a need ("I can help"), and the person who asked or the
// helper marks it delivered. Positions are rounded to about 500 m when saved (snap), so a post never
// shows a door. Nothing older than 30 days is shown on the map. The person who asked hears when
// someone takes, gives back or delivers their request, and helpers who opted in (relief_watches,
// migration 0181) hear about new needs near the place they chose.

const DAY = 86_400_000;
const PUBLIC = { id: true, type: true, kind: true, title: true, details: true, people: true, urgency: true, lat: true, lng: true, place: true, status: true, createdAt: true, takenAt: true, doneAt: true, userId: true, helperId: true } as const;
type Row = { id: string; userId: string; helperId: string | null; [k: string]: unknown };

/** A post as the viewer may see it: who posted (to message them) and whether it's theirs. */
async function shape(rows: Row[], u: SessionUser) {
  const ids = [...new Set(rows.flatMap((r) => [r.userId, r.helperId]).filter((x): x is string => !!x))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const who = (id: string | null) => (id ? people.find((p) => p.id === id) ?? null : null);
  return rows.map(({ userId, helperId, ...r }) => ({ ...r, by: who(userId), helper: who(helperId), mine: userId === u.id, helping: helperId === u.id }));
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
  const post = await prisma.reliefPost.create({
    data: { userId: u.id, type: b.type, kind: b.kind, title, details: short(b.details, 1000), people: Math.round(num(b.people, 1, 10_000) ?? 1), urgency: b.type === 'OFFER' ? 'LOW' : urgency, lat: snap(lat), lng: snap(lng), place: short(b.place, 120) },
  });
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

const R = 6371;
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Helpers who asked to hear about needs near them: within their radius, their kinds, urgent ones unless they want all. */
export async function alertWatchers(post: { id: string; userId: string; kind: string; title: string; urgency: string; people: number; lat: number; lng: number; place: string | null }) {
  // About 25 km around (the largest radius allowed); the exact distance is checked below.
  const dLat = 0.25, dLng = dLat / Math.max(0.2, Math.cos((post.lat * Math.PI) / 180));
  const near = await prisma.reliefWatch.findMany({ where: { lat: { gte: post.lat - dLat, lte: post.lat + dLat }, lng: { gte: post.lng - dLng, lte: post.lng + dLng }, userId: { not: post.userId } }, take: 400 });
  const urgent = post.urgency === 'HIGH' || post.urgency === 'CRITICAL';
  const ids = near.filter((w) => (!w.urgentOnly || urgent) && (!w.kinds || w.kinds.split(',').includes(post.kind)) && kmBetween(w, post) <= w.radiusKm).map((w) => w.userId).slice(0, 80);
  if (!ids.length) return 0;
  await tell(ids, {
    title: `${urgent ? 'Urgent: ' : ''}${RELIEF_KIND_LABEL[post.kind as keyof typeof RELIEF_KIND_LABEL] ?? 'Help'} needed near you`,
    body: `${post.title}${post.place ? ` · ${post.place}` : ''}. Open the map to help.`,
    link: `/relief?post=${post.id}`, tag: `relief-near-${post.id}`, email: false,
  });
  return ids.length;
}

/** GET /relief/watch: my alert, or null. */
export const reliefWatch = (u: SessionUser) => prisma.reliefWatch.findUnique({ where: { userId: u.id } });

/** PUT /relief/watch { lat, lng, radiusKm, urgentOnly, kinds? }: hear about new needs near this place. */
export async function setReliefWatch(u: SessionUser, b: Body) {
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if (lat === null || lng === null) throw new BadRequestException('Choose where: use your location or tap the map.');
  const radiusKm = num(b.radiusKm, 1, 25) ?? 5;
  const kinds = Array.isArray(b.kinds) ? [...new Set(b.kinds.filter((k): k is string => oneOf(RELIEF_KINDS, k)))].join(',') || null : null;
  const data = { lat: snap(lat), lng: snap(lng), radiusKm, urgentOnly: b.urgentOnly !== false, kinds };
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

/** POST /relief/posts/:id/:action: take a need, give it back, mark it delivered, or close your post. */
export async function reliefAction(u: SessionUser, id: string, action: string) {
  const p = await post(id);
  if (action === 'take') {
    if (p.type !== 'NEED') throw new BadRequestException('Offers aren’t taken: message the person instead.');
    if (p.userId === u.id) throw new BadRequestException('This is your own request.');
    const took = await prisma.reliefPost.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'TAKEN', helperId: u.id, takenAt: new Date() } });
    if (!took.count) throw new BadRequestException('Someone is already helping with this one.');
    await tell([p.userId], { title: `${u.name} is coming to help`, body: `${u.name} took your request “${p.title}”. You can message them from My requests.`, link: '/relief/mine', tag: `relief-${id}` });
  } else if (action === 'release') {
    if (p.helperId !== u.id) throw new ForbiddenException('You aren’t helping with this one.');
    await prisma.reliefPost.update({ where: { id }, data: { status: 'OPEN', helperId: null, takenAt: null } });
    await tell([p.userId], { title: 'Your request is open again', body: `${u.name} can’t help with “${p.title}” after all. It’s back on the map for others.`, link: '/relief/mine', tag: `relief-${id}` });
  } else if (action === 'done') {
    if (p.userId !== u.id && p.helperId !== u.id) throw new ForbiddenException('Only the person who asked or the helper can mark it done.');
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
