import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  BUILDING_COLORS, MAX_BUILDINGS, MAX_FLOORS, bookingMinutes, clampBox, clockMinutes, dayWord, freeSpot, nextClass, roomUse, usageGrid,
  weekdayOf, type Busy, type Stretch,
} from '@/lib/campus-map';
import { audit } from './audit';
import { text, type Body } from './body';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { taughtBy } from '@/lib/course-access';

// Stage 5 · D15, the classroom twin (live campus map). The campus drawn as buildings on a simple map
// (admins place them); each building's rooms, with what's on in each today from the class timetable
// and room bookings; in-person classes running now (the phone clicker's check-ins, D7) and online
// classes now; campus events now or soon; and your next class with its room. Admins also see how
// much the rooms were used, hour by hour, over the past weeks.
// Times of day come from the device (date, minutes after midnight, weekday), like the room booking
// page's "free now" badges, so a school's local time is always right without a time zone setting.
// Bookings show as "Booked" (never who booked), except your own.

const isAdmin = (u: SessionUser) => u.role === 'ADMIN' || u.owner === true;
const clip = (v: unknown, max: number) => text(v).replace(/\s+/g, ' ').trim().slice(0, max);
const HOUR = 3_600_000;

/** The device's date, minutes after midnight and weekday (0 = Monday), checked. */
function clock(q: URLSearchParams) {
  const date = q.get('date') ?? '', min = Number(q.get('min')), dow = Number(q.get('dow'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(min >= 0 && min < 24 * 60) || !(Number.isInteger(dow) && dow >= 0 && dow <= 6)) throw new BadRequestException('Send date, min and dow.');
  return { date, min, dow };
}

/** Which campus's map: the one asked for, else the person's own university, else the school's own (null). */
async function whichCampus(user: SessionUser, asked: string | null) {
  if (asked !== null) return asked === '' ? null : asked;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { campusId: true } });
  if (!me?.campusId) return null;
  // Your university's map if it has one, else the school's own.
  const any = await prisma.campusBuilding.findFirst({ where: { campusId: me.campusId }, select: { id: true } });
  return any ? me.campusId : null;
}

/** GET /api/campus/map?date&min&dow[&campus]: the map with what's on now and today. */
export async function campusMap(user: SessionUser, q: URLSearchParams) {
  const { date, min, dow } = clock(q);
  const campusId = await whichCampus(user, q.get('campus'));
  const now = Date.now();
  const mineOnly = user.role === 'TEACHER' ? taughtBy(user.id) : user.role === 'STUDENT' ? { enrollments: { some: { studentId: user.id } } } : null;
  const [buildings, campusRows, rooms, bookings, slots, live, online, events, myCourses] = await Promise.all([
    prisma.campusBuilding.findMany({ where: { campusId }, orderBy: { name: 'asc' }, take: MAX_BUILDINGS, select: { id: true, name: true, code: true, x: true, y: true, w: true, h: true, floors: true, color: true } }),
    prisma.campusBuilding.findMany({ distinct: ['campusId'], select: { campusId: true, campus: { select: { name: true } } }, take: 50 }),
    prisma.room.findMany({ where: campusId ? { building: { campusId } } : { OR: [{ buildingId: null }, { building: { campusId: null } }] }, orderBy: { name: 'asc' }, take: 500, select: { id: true, name: true, type: true, capacity: true, buildingId: true, floor: true } }),
    prisma.roomReservation.findMany({ where: { date }, select: { roomId: true, time: true, duration: true, userId: true }, take: 3000 }),
    prisma.timetableSlot.findMany({ where: { dayOfWeek: dow, roomId: { not: null } }, select: { roomId: true, courseId: true, startTime: true, endTime: true, course: { select: { code: true, name: true } } }, take: 3000 }),
    // In-person classes running now (the phone clicker, D7), with how many have checked in.
    prisma.classroomSession.findMany({ where: { endedAt: null, startedAt: { gte: new Date(now - 5 * HOUR) } }, select: { courseId: true, startedAt: true, course: { select: { code: true, name: true } }, _count: { select: { checkins: true } } }, take: 200 }),
    // Online class calls on now.
    prisma.scheduledCall.findMany({ where: { courseId: { not: null }, startAt: { lte: new Date(now + 5 * 60_000), gte: new Date(now - 6 * HOUR) } }, select: { id: true, title: true, startAt: true, durationMin: true, courseId: true, course: { select: { code: true, name: true } } }, take: 200 }),
    prisma.campusItem.findMany({ where: { kind: 'EVENT', startAt: { gte: new Date(now - 3 * HOUR), lte: new Date(now + 3 * HOUR) } }, orderBy: { startAt: 'asc' }, select: { id: true, title: true, location: true, startAt: true, buildingId: true }, take: 30 }),
    // Online classes are listed for the people in them (admins see all).
    mineOnly ? prisma.course.findMany({ where: mineOnly, select: { id: true }, take: 300 }) : null,
  ]);
  const inMine = (courseId: string | null) => !myCourses || (!!courseId && myCourses.some((c) => c.id === courseId));

  const roomIds = new Set(rooms.map((r) => r.id));
  const busy = new Map<string, Busy[]>();
  const add = (roomId: string, b: Busy) => { if (roomIds.has(roomId)) busy.set(roomId, [...(busy.get(roomId) ?? []), b]); };
  for (const b of bookings) {
    const from = clockMinutes(b.time);
    if (from == null) continue;
    const mine = b.userId === user.id;
    add(b.roomId, { from, to: Math.min(24 * 60, from + bookingMinutes(b.duration)), kind: 'booking', label: mine ? 'Your booking' : 'Booked', ...(mine ? { mine: true } : {}) });
  }
  // The room each course is in right now (or later today), from today's timetable.
  const courseRoom = new Map<string, { roomId: string; from: number; to: number }[]>();
  for (const s of slots) {
    const from = clockMinutes(s.startTime), to = clockMinutes(s.endTime);
    if (!s.roomId || from == null || to == null || to <= from) continue;
    add(s.roomId, { from, to, kind: 'class', label: `${s.course.code} · ${s.course.name}` });
    courseRoom.set(s.courseId, [...(courseRoom.get(s.courseId) ?? []), { roomId: s.roomId, from, to }]);
  }
  const roomOf = (courseId: string | null) => {
    const list = courseId ? courseRoom.get(courseId) ?? [] : [];
    return list.find((x) => roomIds.has(x.roomId) && x.from - 15 <= min && min < x.to + 15)?.roomId ?? null;
  };

  // Events in a building: chosen by an admin, else a building named in the event's place.
  const named = (place: string | null) => {
    const p = (place ?? '').toLowerCase();
    return p ? buildings.find((b) => p.includes(b.name.toLowerCase()) || (b.code && new RegExp(`\\b${b.code.toLowerCase().replace(/[^a-z0-9]/g, '')}\\b`).test(p)))?.id ?? null : null;
  };
  const ids = new Set(buildings.map((b) => b.id));

  const campuses = campusRows.map((c) => ({ id: c.campusId, name: c.campus?.name ?? 'Our campus' }));
  if (!campuses.some((c) => c.id === campusId)) campuses.unshift({ id: campusId, name: campusId ? (await prisma.campus.findUnique({ where: { id: campusId }, select: { name: true } }))?.name ?? 'Campus' : 'Our campus' });

  return {
    campus: campuses.find((c) => c.id === campusId)!,
    campuses: campuses.sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : a.name.localeCompare(b.name))),
    buildings,
    rooms: rooms.map((r) => ({ ...r, busy: (busy.get(r.id) ?? []).sort((a, b) => a.from - b.from) })),
    // In-person classes in this map's rooms (those in no known room show on the school's own map).
    live: live.map((s) => ({ courseId: s.courseId, code: s.course.code, name: s.course.name, checkedIn: s._count.checkins, startedAt: s.startedAt.toISOString(), roomId: roomOf(s.courseId) })).filter((l) => l.roomId || campusId === null),
    online: online
      .filter((c) => c.startAt.getTime() + c.durationMin * 60_000 > now && inMine(c.courseId))
      .map((c) => ({ id: c.id, title: c.title, code: c.course?.code ?? '', until: new Date(c.startAt.getTime() + c.durationMin * 60_000).toISOString(), roomId: roomOf(c.courseId), join: `/call/c_${c.courseId}` })),
    events: events.map((e) => {
      const buildingId = e.buildingId && ids.has(e.buildingId) ? e.buildingId : named(e.location);
      return { id: e.id, title: e.title, location: e.location, startAt: e.startAt?.toISOString() ?? null, buildingId, now: !!e.startAt && e.startAt.getTime() <= now };
    }),
    next: await myNextClass(user, dow, min),
    canEdit: isAdmin(user),
  };
}

/** The class I'm in (or teach) now or next, and its room. */
async function myNextClass(user: SessionUser, dow: number, min: number) {
  const where = user.role === 'TEACHER' ? { course: taughtBy(user.id) } : user.role === 'STUDENT' ? { course: { enrollments: { some: { studentId: user.id } } } } : null;
  if (!where) return null;
  const slots = await prisma.timetableSlot.findMany({
    where, take: 300,
    select: { dayOfWeek: true, startTime: true, endTime: true, type: true, course: { select: { id: true, code: true, name: true } }, room: { select: { id: true, name: true, buildingId: true, floor: true } } },
  });
  const timed = slots.flatMap((s) => {
    const start = clockMinutes(s.startTime), end = clockMinutes(s.endTime);
    return start == null || end == null ? [] : [{ ...s, start, end }];
  });
  const n = nextClass(timed, dow, min);
  if (!n) return null;
  const s = n.slot;
  return {
    courseId: s.course.id, code: s.course.code, name: s.course.name, type: s.type, start: s.startTime, end: s.endTime,
    day: dayWord(n.dayOffset, dow), dayOffset: n.dayOffset, now: n.now,
    roomId: s.room?.id ?? null, roomName: s.room?.name ?? null, buildingId: s.room?.buildingId ?? null, floor: s.room?.floor ?? null,
  };
}

// ── Admins: drawing the map ──

function admin(user: SessionUser) {
  if (!isAdmin(user)) throw new ForbiddenException('Only admins can change the campus map.');
}

const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
const floors = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_FLOORS, Math.max(1, Math.round(v))) : undefined);

/** POST /api/campus/map/buildings { name, code?, campusId?, floors?, color?, x?, y?, w?, h? } */
export async function addBuilding(user: SessionUser, b: Body) {
  admin(user);
  const name = clip(b.name, 60);
  if (!name) throw new BadRequestException('Give the building a name.');
  const campusId = typeof b.campusId === 'string' && b.campusId ? b.campusId : null;
  if (campusId && !(await prisma.campus.findUnique({ where: { id: campusId }, select: { id: true } }))) throw new NotFoundException('That university isn’t in the campus network.');
  const others = await prisma.campusBuilding.findMany({ where: { campusId }, select: { x: true, y: true, w: true, h: true }, take: MAX_BUILDINGS + 1 });
  if (others.length >= MAX_BUILDINGS) throw new BadRequestException(`A campus map holds up to ${MAX_BUILDINGS} buildings.`);
  const placed = typeof b.x === 'number' && typeof b.y === 'number' ? clampBox({ x: b.x, y: b.y, w: b.w as number, h: b.h as number }) : freeSpot(others, 180, 120);
  const made = await prisma.campusBuilding.create({
    data: { name, code: clip(b.code, 6) || null, campusId, floors: floors(b.floors) ?? 1, color: color(b.color) ?? BUILDING_COLORS[others.length % BUILDING_COLORS.length], ...placed },
    select: { id: true, name: true, code: true, x: true, y: true, w: true, h: true, floors: true, color: true },
  });
  audit(user, { action: 'campus.building_added', summary: `Added “${name}” to the campus map`, targetType: 'building', targetId: made.id });
  return made;
}

/** PATCH /api/campus/map/buildings/:id { name?, code?, floors?, color?, x?, y?, w?, h? } */
export async function updateBuilding(user: SessionUser, id: string, b: Body) {
  admin(user);
  const was = await prisma.campusBuilding.findUnique({ where: { id }, select: { x: true, y: true, w: true, h: true } });
  if (!was) throw new NotFoundException('That building isn’t on the map any more.');
  const data: { name?: string; code?: string | null; floors?: number; color?: string; x?: number; y?: number; w?: number; h?: number } = {};
  if (b.name !== undefined) { const name = clip(b.name, 60); if (!name) throw new BadRequestException('Give the building a name.'); data.name = name; }
  if (b.code !== undefined) data.code = clip(b.code, 6) || null;
  if (b.floors !== undefined) data.floors = floors(b.floors) ?? 1;
  if (b.color !== undefined) { const c = color(b.color); if (c) data.color = c; }
  if (['x', 'y', 'w', 'h'].some((k) => b[k] !== undefined)) Object.assign(data, clampBox({ x: (b.x ?? was.x) as number, y: (b.y ?? was.y) as number, w: (b.w ?? was.w) as number, h: (b.h ?? was.h) as number }));
  return prisma.campusBuilding.update({ where: { id }, data, select: { id: true, name: true, code: true, x: true, y: true, w: true, h: true, floors: true, color: true } });
}

/** DELETE /api/campus/map/buildings/:id: its rooms and events stay, no longer on the map. */
export async function deleteBuilding(user: SessionUser, id: string) {
  admin(user);
  const b = await prisma.campusBuilding.findUnique({ where: { id }, select: { name: true } });
  if (!b) return { ok: true };
  await prisma.campusBuilding.delete({ where: { id } });
  audit(user, { action: 'campus.building_removed', summary: `Removed “${b.name}” from the campus map`, targetType: 'building', targetId: id });
  return { ok: true };
}

/** PATCH /api/campus/map/rooms/:id { buildingId: string | null, floor?: number | null } */
export async function placeRoom(user: SessionUser, id: string, b: Body) {
  admin(user);
  const buildingId = typeof b.buildingId === 'string' && b.buildingId ? b.buildingId : null;
  const building = buildingId ? await prisma.campusBuilding.findUnique({ where: { id: buildingId }, select: { floors: true } }) : null;
  if (buildingId && !building) throw new NotFoundException('That building isn’t on the map any more.');
  const floor = building && typeof b.floor === 'number' && Number.isFinite(b.floor) ? Math.min(building.floors - 1, Math.max(-3, Math.round(b.floor))) : building ? 0 : null;
  const room = await prisma.room.update({ where: { id }, data: { buildingId, floor }, select: { id: true, buildingId: true, floor: true } }).catch(() => null);
  if (!room) throw new NotFoundException('That room was removed.');
  return room;
}

/** PATCH /api/campus/map/events/:id { buildingId: string | null }: where a campus event happens. */
export async function placeEvent(user: SessionUser, id: string, b: Body) {
  admin(user);
  const buildingId = typeof b.buildingId === 'string' && b.buildingId ? b.buildingId : null;
  if (buildingId && !(await prisma.campusBuilding.findUnique({ where: { id: buildingId }, select: { id: true } }))) throw new NotFoundException('That building isn’t on the map any more.');
  const item = await prisma.campusItem.findFirst({ where: { id, kind: 'EVENT' }, select: { id: true } });
  if (!item) throw new NotFoundException('That event was removed.');
  return prisma.campusItem.update({ where: { id }, data: { buildingId }, select: { id: true, buildingId: true } });
}

// ── Admins: how much the rooms were used ──

const WEEKS = [1, 2, 4, 8, 12];

/**
 * GET /api/campus/map/usage?date&weeks[&campus][&building]: over the `weeks` weeks before `date`, how
 * much of each hour (Monday to Sunday) the rooms were in use (class timetable, every week, and
 * bookings), and each room's hours. Upcoming events are left out (they don't take a room).
 */
export async function campusUsage(user: SessionUser, q: URLSearchParams) {
  admin(user);
  const date = q.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Send date.');
  const weeks = WEEKS.includes(Number(q.get('weeks'))) ? Number(q.get('weeks')) : 4;
  const building = q.get('building') || null;
  const campusId = q.get('campus') ? q.get('campus') : null;
  const scope = building ? { buildingId: building } : campusId ? { building: { campusId } } : { OR: [{ buildingId: null }, { building: { campusId: null } }] };
  const end = new Date(`${date}T00:00:00Z`);
  const start = new Date(end.getTime() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  const [rooms, slots, bookings] = await Promise.all([
    prisma.room.findMany({ where: scope, select: { id: true, name: true, buildingId: true }, take: 500 }),
    prisma.timetableSlot.findMany({ where: { room: scope }, select: { roomId: true, dayOfWeek: true, startTime: true, endTime: true }, take: 5000 }),
    prisma.roomReservation.findMany({ where: { room: scope, date: { gte: start, lt: date } }, select: { roomId: true, date: true, time: true, duration: true }, take: 10000 }),
  ]);
  const stretches: Stretch[] = [];
  for (const s of slots) {
    const from = clockMinutes(s.startTime), to = clockMinutes(s.endTime);
    if (!s.roomId || from == null || to == null) continue;
    for (let w = 0; w < weeks; w++) stretches.push({ roomId: s.roomId, day: `w${w}-${s.dayOfWeek}`, dow: s.dayOfWeek, from, to });
  }
  for (const b of bookings) {
    const from = clockMinutes(b.time);
    if (from == null) continue;
    // A booking and a class in the same room on the same weekday of the same week count once.
    const back = Math.floor((end.getTime() - new Date(`${b.date}T00:00:00Z`).getTime()) / (7 * 86_400_000));
    const dow = weekdayOf(b.date);
    stretches.push({ roomId: b.roomId, day: `w${Math.min(weeks - 1, Math.max(0, back))}-${dow}`, dow, from, to: Math.min(24 * 60, from + bookingMinutes(b.duration)) });
  }
  const use = roomUse(stretches, rooms, weeks);
  return { weeks, from: start, to: date, rooms: rooms.length, bookings: bookings.length, grid: usageGrid(stretches, rooms.length, weeks), use };
}
