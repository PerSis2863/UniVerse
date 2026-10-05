import { createHmac, timingSafeEqual } from 'node:crypto';
import prisma from '@/lib/db';
import { deleteFile, isAppFileUrl } from '@/lib/storage';
import type { SessionUser } from '@/lib/server-auth';
import { createCommunity, addMembers, joinCommunity } from './communities';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Campus super-app (upgrade 7): events with RSVP and QR check-in, lost & found, room "free now"
// badges and a club's own space. Notifications are in the app and by push only (never email).

const DAY = 86_400_000;
const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

async function tell(userId: string, title: string, body: string, link: string, tag: string) {
  await prisma.notification.create({ data: { userId, title, body, type: 'info', link } });
  publish([userId], { type: 'notification' });
  await pushService.sendToMany([userId], { title, body, url: link, tag }).catch(() => 0);
}

// ── Rooms: free now / free at ────────────────────────────────────────────────────────────────

/** "10:00 AM", "2:30 pm" or "14:00" → minutes after midnight (null if unreadable). */
export function clockMinutes(s: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?\s*$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) { const pm = /^p/i.test(m[3]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h < 24 && min < 60 ? h * 60 + min : null;
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface RoomStatus { free: boolean; freeAt: string | null; busyUntil: string | null; nextBusy: string | null }

/** From a room's busy intervals today (minutes), whether it's free now and when that changes. */
export function roomStatus(busy: [number, number][], now: number): RoomStatus {
  const sorted = busy.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  // Back-to-back or overlapping bookings count as one stretch.
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  const current = merged.find(([a, b]) => a <= now && now < b);
  if (current) return { free: false, freeAt: current[1] >= 24 * 60 ? null : hhmm(current[1]), busyUntil: hhmm(Math.min(current[1], 24 * 60 - 1)), nextBusy: null };
  const next = merged.find(([a]) => a > now);
  return { free: true, freeAt: null, busyUntil: null, nextBusy: next ? hhmm(next[0]) : null };
}

/** GET /api/campus/rooms?date=YYYY-MM-DD&min=…&dow=0-6 (Mon=0): every room's status right now. */
export async function roomStatuses(date: string, now: number, dow: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(now >= 0 && now < 24 * 60) || !(dow >= 0 && dow <= 6)) throw new BadRequestException('Send date, min and dow.');
  const [reservations, slots] = await Promise.all([
    prisma.roomReservation.findMany({ where: { date }, select: { roomId: true, time: true, duration: true }, take: 2000 }),
    prisma.timetableSlot.findMany({ where: { dayOfWeek: dow, roomId: { not: null } }, select: { roomId: true, startTime: true, endTime: true }, take: 2000 }),
  ]);
  const busy = new Map<string, [number, number][]>();
  const add = (roomId: string, a: number | null, b: number | null) => { if (a == null || b == null) return; busy.set(roomId, [...(busy.get(roomId) ?? []), [a, b]]); };
  for (const r of reservations) {
    const start = clockMinutes(r.time);
    const hours = Number.parseFloat(r.duration);
    add(r.roomId, start, start == null ? null : start + Math.round((Number.isFinite(hours) && hours > 0 ? hours : 1) * 60));
  }
  for (const s of slots) if (s.roomId) add(s.roomId, clockMinutes(s.startTime), clockMinutes(s.endTime));
  return Object.fromEntries([...busy.entries()].map(([id, list]) => [id, roomStatus(list, now)]));
}

// ── Events: RSVP, waiting list, rotating QR check-in ─────────────────────────────────────────

const WINDOW = 30_000; // the check-in code changes every 30 seconds

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new BadRequestException('Check-in codes need SESSION_SECRET on the server.');
  return s;
}
const mac = (label: string, body: string) => createHmac('sha256', secret()).update(`${label}:${body}`).digest('base64url').slice(0, 22);

/**
 * A code for one 30-second window, signed for one purpose (`prefix`: e1 = campus event, s1 =
 * volunteer shift), so a code for one thing can never be used for another. Nothing is stored.
 */
export function rotatingCode(prefix: 'e1' | 's1', id: string, now = Date.now()) {
  const w = Math.floor(now / WINDOW);
  const body = `${prefix}.${id}.${w.toString(36)}`;
  return { code: `${body}.${mac(prefix, body)}`, expiresIn: Math.ceil(((w + 1) * WINDOW - now) / 1000) };
}

/** The id in a code from this window or the one before (a minute's grace), or null. */
export function readRotatingCode(prefix: 'e1' | 's1', code: string, now = Date.now()): string | null {
  const m = /^(e1|s1)\.([A-Za-z0-9_-]{1,64})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{22})$/.exec(code);
  if (!m || m[1] !== prefix) return null;
  const w = parseInt(m[3], 36), current = Math.floor(now / WINDOW);
  if (w !== current && w !== current - 1) return null;
  const want = Buffer.from(mac(prefix, `${prefix}.${m[2]}.${m[3]}`)), got = Buffer.from(m[4]);
  return want.length === got.length && timingSafeEqual(want, got) ? m[2] : null;
}

/** The code shown on the organiser's screen at an event's door. */
export const checkinCode = (itemId: string, now = Date.now()) => rotatingCode('e1', itemId, now);
export const readCheckinCode = (code: string, now = Date.now()) => readRotatingCode('e1', code, now);

const upcoming = () => ({ kind: 'EVENT', startAt: { gte: new Date(Date.now() - DAY) } });

/** GET /api/campus/events: upcoming events with seats taken and my place. */
export async function listEvents(user: SessionUser) {
  const items = await prisma.campusItem.findMany({ where: upcoming(), orderBy: { startAt: 'asc' }, take: 100 });
  const ids = items.map((i) => i.id);
  const [counts, mine] = ids.length ? await Promise.all([
    prisma.eventRsvp.groupBy({ by: ['itemId', 'status'], where: { itemId: { in: ids.slice(0, 90) } }, _count: { _all: true } }),
    prisma.eventRsvp.findMany({ where: { userId: user.id, itemId: { in: ids.slice(0, 90) } }, select: { itemId: true, status: true, checkedInAt: true } }),
  ]) : [[], []];
  const n = (id: string, status: string) => counts.find((c) => c.itemId === id && c.status === status)?._count._all ?? 0;
  return items.map((i) => ({ ...i, going: n(i.id, 'GOING'), waiting: n(i.id, 'WAITLIST'), mine: mine.find((m) => m.itemId === i.id) ?? null }));
}

/** POST /api/campus/events/[id]/rsvp { going }: take a seat (or join the waiting list), or give it up. */
export async function rsvp(user: SessionUser, itemId: string, going: boolean) {
  const item = await prisma.campusItem.findFirst({ where: { id: itemId, kind: 'EVENT' }, select: { id: true, title: true, capacity: true, startAt: true } });
  if (!item) throw new NotFoundException('Event not found.');
  if (item.startAt && item.startAt.getTime() < Date.now() - 6 * 3600_000) throw new BadRequestException('This event is over.');
  const existing = await prisma.eventRsvp.findUnique({ where: { itemId_userId: { itemId, userId: user.id } } });
  if (!going) {
    if (!existing) return { status: null };
    if (existing.checkedInAt) throw new BadRequestException('You’ve already checked in to this event.');
    await prisma.eventRsvp.delete({ where: { id: existing.id } });
    // A seat came free: the first person waiting gets it.
    if (existing.status === 'GOING' && item.capacity) {
      const next = await prisma.eventRsvp.findFirst({ where: { itemId, status: 'WAITLIST' }, orderBy: { createdAt: 'asc' } });
      if (next) {
        await prisma.eventRsvp.update({ where: { id: next.id }, data: { status: 'GOING' } });
        await tell(next.userId, 'You’re in!', `A seat came free at “${item.title}”. See you there.`, '/student/life/events', `event-${itemId}`).catch(() => {});
      }
    }
    return { status: null };
  }
  if (existing) return { status: existing.status };
  const taken = item.capacity ? await prisma.eventRsvp.count({ where: { itemId, status: 'GOING' } }) : 0;
  const status = item.capacity && taken >= item.capacity ? 'WAITLIST' : 'GOING';
  await prisma.eventRsvp.create({ data: { itemId, userId: user.id, status } });
  return { status };
}

/** POST /api/campus/events/checkin { code }: a student scanned the code on the organiser's screen. */
export async function checkIn(user: SessionUser, code: unknown) {
  const itemId = typeof code === 'string' ? readCheckinCode(code.trim()) : null;
  if (!itemId) throw new BadRequestException('This code has expired. Scan the one on the screen now.');
  const item = await prisma.campusItem.findFirst({ where: { id: itemId, kind: 'EVENT' }, select: { id: true, title: true, capacity: true } });
  if (!item) throw new NotFoundException('Event not found.');
  const mine = await prisma.eventRsvp.findUnique({ where: { itemId_userId: { itemId, userId: user.id } } });
  if (mine?.checkedInAt) return { title: item.title, checkedInAt: mine.checkedInAt, already: true };
  if (mine?.status === 'WAITLIST') throw new BadRequestException('You’re on the waiting list for this event. Ask the organiser at the door.');
  const now = new Date();
  if (mine) await prisma.eventRsvp.update({ where: { id: mine.id }, data: { checkedInAt: now } });
  else {
    // Walk-ins are welcome while there are seats.
    const taken = item.capacity ? await prisma.eventRsvp.count({ where: { itemId, status: 'GOING' } }) : 0;
    if (item.capacity && taken >= item.capacity) throw new BadRequestException('This event is full. Ask the organiser at the door.');
    await prisma.eventRsvp.create({ data: { itemId, userId: user.id, status: 'GOING', checkedInAt: now } });
  }
  return { title: item.title, checkedInAt: now, already: false };
}

/** GET /api/campus/events/[id]/attendees (admin): who's coming, waiting and checked in, plus the live code. */
export async function attendees(user: SessionUser, itemId: string) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can see attendees.');
  const item = await prisma.campusItem.findFirst({ where: { id: itemId, kind: 'EVENT' }, select: { id: true, title: true, capacity: true, startAt: true } });
  if (!item) throw new NotFoundException('Event not found.');
  const people = await prisma.eventRsvp.findMany({
    where: { itemId }, orderBy: { createdAt: 'asc' }, take: 1000,
    select: { id: true, status: true, checkedInAt: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
  });
  return { item, people };
}

// ── Lost & found ─────────────────────────────────────────────────────────────────────────────

const LF_SELECT = { id: true, kind: true, title: true, description: true, photoUrl: true, location: true, status: true, createdAt: true, expiresAt: true, reporter: { select: { id: true, name: true, avatar: true } } } as const;

/** GET /api/campus/lost-found?kind=LOST|FOUND&mine=1&all=1 (all: admins, includes hidden and resolved). */
export async function listLostFound(user: SessionUser, q: URLSearchParams) {
  const kind = q.get('kind');
  const all = user.role === 'ADMIN' && q.get('all') === '1';
  return prisma.lostFoundItem.findMany({
    where: {
      ...(kind === 'LOST' || kind === 'FOUND' ? { kind } : {}),
      ...(q.get('mine') === '1' ? { reporterId: user.id } : all ? {} : { status: 'OPEN', expiresAt: { gt: new Date() } }),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: LF_SELECT,
  });
}

/** POST /api/campus/lost-found: report something lost or found (shown for 30 days). */
export async function reportLostFound(user: SessionUser, b: Record<string, unknown>) {
  const kind = b.kind === 'FOUND' ? 'FOUND' : b.kind === 'LOST' ? 'LOST' : null;
  const title = str(b.title, 100);
  if (!kind || !title) throw new BadRequestException('Say whether you lost or found it, and what it is.');
  const photoUrl = b.photoUrl == null || b.photoUrl === '' ? null : isAppFileUrl(b.photoUrl) ? b.photoUrl : undefined;
  if (photoUrl === undefined) throw new BadRequestException('Invalid photo.');
  const open = await prisma.lostFoundItem.count({ where: { reporterId: user.id, status: 'OPEN', expiresAt: { gt: new Date() } } });
  if (open >= 10) throw new BadRequestException('You have 10 open reports. Mark some as sorted first.');
  return prisma.lostFoundItem.create({
    data: { kind, title, description: str(b.description, 600), location: str(b.location, 120), photoUrl, reporterId: user.id, expiresAt: new Date(Date.now() + 30 * DAY) },
    select: LF_SELECT,
  });
}

/** PATCH /api/campus/lost-found/[id] { status }: the reporter marks it sorted; admins hide or restore. */
export async function updateLostFound(user: SessionUser, id: string, b: Record<string, unknown>) {
  const item = await prisma.lostFoundItem.findUnique({ where: { id }, select: { reporterId: true, title: true } });
  if (!item) throw new NotFoundException('Not found.');
  const admin = user.role === 'ADMIN';
  const status = String(b.status ?? '');
  if (!['OPEN', 'RESOLVED', 'HIDDEN'].includes(status)) throw new BadRequestException('Unknown status.');
  if (!admin && (item.reporterId !== user.id || status === 'HIDDEN')) throw new ForbiddenException('Only the person who posted it can change this.');
  const updated = await prisma.lostFoundItem.update({ where: { id }, data: { status, ...(status === 'OPEN' ? { expiresAt: new Date(Date.now() + 30 * DAY) } : {}) }, select: LF_SELECT });
  if (admin && status === 'HIDDEN' && item.reporterId !== user.id) {
    await tell(item.reporterId, 'Your lost & found post was removed', `“${item.title}” was taken down by a campus admin.`, '/student/life/lost-found', `lf-${id}`).catch(() => {});
  }
  return updated;
}

export async function deleteLostFound(user: SessionUser, id: string) {
  const item = await prisma.lostFoundItem.findUnique({ where: { id }, select: { reporterId: true } });
  if (!item) throw new NotFoundException('Not found.');
  if (user.role !== 'ADMIN' && item.reporterId !== user.id) throw new ForbiddenException('Only the person who posted it can delete it.');
  await prisma.lostFoundItem.delete({ where: { id } });
  return { ok: true };
}

/** Daily job: posts expired more than 60 days ago are deleted. */
export async function purgeLostFound(now = Date.now()) {
  const old = await prisma.lostFoundItem.findMany({ where: { expiresAt: { lt: new Date(now - 60 * DAY) } }, select: { id: true, photoUrl: true }, take: 90 });
  for (const o of old) if (o.photoUrl) await deleteFile(o.photoUrl).catch(() => {});
  if (old.length) await prisma.lostFoundItem.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return old.length;
}

// ── Clubs: their own space ───────────────────────────────────────────────────────────────────

/** POST /api/campus/clubs/[id]/space: the club's founder (or an admin) makes a Community with its members. */
export async function clubSpace(user: SessionUser, associationId: string) {
  const club = await prisma.association.findUnique({ where: { id: associationId }, select: { id: true, name: true, description: true, status: true, communityId: true } });
  if (!club) throw new NotFoundException('Club not found.');
  if (club.communityId && (await prisma.community.findUnique({ where: { id: club.communityId }, select: { id: true } }))) return { communityId: club.communityId, created: false };
  const founder = await prisma.associationMembership.findFirst({ where: { associationId, userId: user.id, role: 'FOUNDER' }, select: { id: true } });
  if (!founder && user.role !== 'ADMIN') throw new ForbiddenException('Only the club’s founder can create its space.');
  if (club.status !== 'ACTIVE') throw new BadRequestException('The club needs to be approved first.');
  const members = await prisma.associationMembership.findMany({ where: { associationId, userId: { not: user.id } }, select: { userId: true }, take: 200 });
  const community = await createCommunity(user, { name: club.name.slice(0, 60), description: club.description });
  if (members.length) await addMembers(user, community.id, { userIds: members.map((m) => m.userId) });
  await prisma.association.update({ where: { id: associationId }, data: { communityId: community.id } });
  return { communityId: community.id, created: true };
}

/** Someone joined a club that already has a space: they join the space too. */
export async function joinClubSpace(associationId: string, userId: string) {
  const club = await prisma.association.findUnique({ where: { id: associationId }, select: { communityId: true } });
  const c = club?.communityId ? await prisma.community.findUnique({ where: { id: club.communityId }, select: { inviteCode: true } }) : null;
  if (c) await joinCommunity({ id: userId } as SessionUser, { code: c.inviteCode });
}
