import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notify } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { need } from './permissions';

// Registers (Stage 5 · B15.5), kept by admins or staff with registers.manage:
//   equipment  each item with a tag (printed as a QR label), where it is, who has it, its state,
//              and every change; a stock check scans tags to mark what's been seen
//   buses      routes with stops and times, and which students ride from which stop
//   hostel     rooms with beds, and who lives where
// Students see their bus, room and the equipment lent to them; parents see their children's;
// staff see equipment lent to them. Notices in the app only.

export const ASSET_STATUSES = ['IN_USE', 'IN_STORE', 'REPAIR', 'LOST', 'RETIRED'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);
const firstName = (n: string) => n.split(/\s+/)[0] || n;

// ── Equipment ───────────────────────────────────────────────────────────────────────────────

/** A new tag: A- and six digits, unused. */
async function newTag() {
  for (let i = 0; i < 10; i++) {
    const tag = `A-${Math.floor(100_000 + Math.random() * 900_000)}`;
    if (!(await prisma.asset.findUnique({ where: { tag }, select: { id: true } }))) return tag;
  }
  throw new ConflictException('Couldn’t make a tag. Try again.');
}
const log = (assetId: string, type: string, note: string | null, byId: string) => prisma.assetEvent.create({ data: { assetId, type, note, byId } });

/** GET /api/registers/assets?q=&status=&category=: equipment matching a name, tag, serial, place or person. */
export async function assetList(user: SessionUser, q: URLSearchParams) {
  await need(user, 'registers.manage');
  const s = (q.get('q') ?? '').trim().slice(0, 60);
  const status = ASSET_STATUSES.find((x) => x === q.get('status'));
  const category = q.get('category') || undefined;
  const [assets, byStatus, categories] = await Promise.all([
    prisma.asset.findMany({
      where: { ...(status ? { status } : {}), ...(category ? { category } : {}), ...(s ? { OR: [{ name: { contains: s } }, { tag: { contains: s.toUpperCase() } }, { serial: { contains: s } }, { location: { contains: s } }, { assignedTo: { name: { contains: s } } }] } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 300,
      select: { id: true, tag: true, name: true, category: true, location: true, status: true, lastSeenAt: true, assignedTo: { select: { id: true, name: true } } },
    }),
    prisma.asset.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.asset.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } }),
  ]);
  return {
    assets, byStatus: Object.fromEntries(byStatus.map((x) => [x.status, x._count._all])),
    categories: categories.filter((c) => c.category).map((c) => ({ name: c.category as string, count: c._count._all })),
  };
}

export function assetFields(b: Record<string, unknown>) {
  const name = text(b.name, 120);
  if (!name) throw new BadRequestException('Name the item, like “Projector” or “Laptop”.');
  const status = ASSET_STATUSES.find((x) => x === b.status) ?? 'IN_USE';
  const purchasedAt = typeof b.purchasedAt === 'string' && DAY_RE.test(b.purchasedAt) ? b.purchasedAt : null;
  const cost = b.cost != null && b.cost !== '' ? Math.round(Number(b.cost) * 100) : null;
  if (cost != null && (!Number.isFinite(cost) || cost < 0 || cost > 10_000_000_000)) throw new BadRequestException('That cost doesn’t look right.');
  return { name, category: text(b.category, 60), location: text(b.location, 120), status, serial: text(b.serial, 80), purchasedAt, cost, currency: text(b.currency, 3)?.toUpperCase() ?? null, notes: text(b.notes, 1000) };
}

/** POST /api/registers/assets { name, category?, location?, status?, serial?, purchasedAt?, cost?, currency?, notes?, tags?: string[], count? } */
export async function addAssets(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const f = assetFields(b);
  const scanned = Array.isArray(b.tags) ? [...new Set(b.tags.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toUpperCase()).filter(Boolean))].slice(0, 100) : [];
  const count = Math.min(100, Math.max(scanned.length, Number.isInteger(Number(b.count)) ? Number(b.count) : 1));
  if (scanned.length) {
    const taken = await prisma.asset.findMany({ where: { tag: { in: scanned } }, select: { tag: true } });
    if (taken.length) throw new ConflictException(`These tags are used already: ${taken.map((t) => t.tag).join(', ')}.`);
  }
  const tags = [...scanned];
  while (tags.length < count) {
    const t = await newTag();
    if (!tags.includes(t)) tags.push(t);
  }
  const ids = tags.map(() => `c${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`);
  await prisma.asset.createMany({ data: tags.map((tag, i) => ({ id: ids[i], tag, ...f })) });
  await prisma.assetEvent.createMany({ data: ids.map((assetId) => ({ assetId, type: 'created', note: f.location ? `At ${f.location}` : null, byId: user.id })) });
  return { ids, tags };
}

/** GET /api/registers/assets/:id: an item with its history. */
export async function assetDetail(user: SessionUser, id: string) {
  await need(user, 'registers.manage');
  const a = await prisma.asset.findUnique({ where: { id }, include: { assignedTo: { select: { id: true, name: true, email: true } }, events: { orderBy: { at: 'desc' }, take: 50 } } });
  if (!a) throw new NotFoundException('That item isn’t in the register.');
  const people = [...new Set(a.events.map((e) => e.byId).filter((x): x is string => !!x))];
  const names = people.length ? await prisma.user.findMany({ where: { id: { in: people } }, select: { id: true, name: true } }) : [];
  return { ...a, events: a.events.map((e) => ({ ...e, by: names.find((n) => n.id === e.byId)?.name ?? null })) };
}

/** POST /api/registers/assets/:id { action: 'save' | 'move' | 'lend' | 'return' | 'status' | 'seen' | 'delete', … } */
export async function assetAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const a = await prisma.asset.findUnique({ where: { id }, select: { id: true, tag: true, name: true, location: true, status: true, assignedToId: true, assignedTo: { select: { name: true } } } });
  if (!a) throw new NotFoundException('That item isn’t in the register.');
  const note = text(b.note, 300);
  switch (b.action) {
    case 'save': {
      const f = assetFields(b);
      await prisma.asset.update({ where: { id }, data: { ...f, updatedAt: new Date() } });
      await log(id, 'edited', null, user.id);
      return { saved: true };
    }
    case 'move': {
      const location = text(b.location, 120);
      if (!location) throw new BadRequestException('Where is it now?');
      await prisma.asset.update({ where: { id }, data: { location, lastSeenAt: new Date(), updatedAt: new Date() } });
      await log(id, 'moved', `${a.location ? `${a.location} → ` : ''}${location}${note ? ` · ${note}` : ''}`, user.id);
      return { location };
    }
    case 'lend': {
      const person = await prisma.user.findUnique({ where: { id: typeof b.userId === 'string' ? b.userId : '' }, select: { id: true, name: true, role: true, status: true } });
      if (!person || !['STUDENT', 'TEACHER', 'ADMIN'].includes(person.role) || person.status === 'SUSPENDED') throw new BadRequestException('Choose a student or member of staff.');
      if (a.assignedToId === person.id) return { assignedTo: person.name };
      await prisma.asset.update({ where: { id }, data: { assignedToId: person.id, status: 'IN_USE', updatedAt: new Date() } });
      await log(id, 'lent', `${a.assignedTo ? `${a.assignedTo.name} → ` : ''}${person.name}${note ? ` · ${note}` : ''}`, user.id);
      await notify(person.id, { type: 'registers', title: `Lent to you: ${a.name}`, body: `Tag ${a.tag}. Look after it and return it to the school when asked.`, link: person.role === 'STUDENT' ? '/student/life/everyday' : person.role === 'TEACHER' ? '/teacher/staff' : '/admin/registers', email: false });
      return { assignedTo: person.name };
    }
    case 'return': {
      if (!a.assignedToId) throw new BadRequestException('Nobody has it.');
      const location = text(b.location, 120);
      await prisma.asset.update({ where: { id }, data: { assignedToId: null, ...(location ? { location } : {}), lastSeenAt: new Date(), updatedAt: new Date() } });
      await log(id, 'returned', `From ${a.assignedTo?.name ?? 'someone'}${location ? ` to ${location}` : ''}${note ? ` · ${note}` : ''}`, user.id);
      return { returned: true };
    }
    case 'status': {
      const status = ASSET_STATUSES.find((x) => x === b.status);
      if (!status) throw new BadRequestException('Choose a state.');
      await prisma.asset.update({ where: { id }, data: { status, ...(status === 'RETIRED' || status === 'LOST' ? { assignedToId: null } : {}), updatedAt: new Date() } });
      await log(id, 'status', `${status}${note ? ` · ${note}` : ''}`, user.id);
      return { status };
    }
    case 'seen': {
      await prisma.asset.update({ where: { id }, data: { lastSeenAt: new Date() } });
      await log(id, 'seen', note, user.id);
      return { seen: true };
    }
    case 'delete': {
      if (a.assignedToId) throw new BadRequestException('Someone has it. Take it back first.');
      await prisma.asset.delete({ where: { id } });
      return { deleted: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

/** POST /api/registers/assets/check { tags: string[], location? }: a stock check: what was seen (and moved, if a place is given). */
export async function stockCheck(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toUpperCase()).filter(Boolean))].slice(0, 200) : [];
  if (!tags.length) throw new BadRequestException('Scan at least one tag.');
  const location = text(b.location, 120);
  const found = await prisma.asset.findMany({ where: { tag: { in: tags } }, select: { id: true, tag: true, name: true, location: true } });
  const now = new Date();
  if (found.length) {
    await prisma.asset.updateMany({ where: { id: { in: found.map((f) => f.id) } }, data: { lastSeenAt: now, ...(location ? { location } : {}) } });
    await prisma.assetEvent.createMany({ data: found.map((f) => ({ assetId: f.id, type: location && f.location !== location ? 'moved' : 'seen', note: location ? (f.location !== location ? `${f.location ? `${f.location} → ` : ''}${location} (stock check)` : `Stock check at ${location}`) : 'Stock check', byId: user.id })) });
  }
  const missingThere = location ? await prisma.asset.findMany({ where: { location, tag: { notIn: tags }, status: { notIn: ['RETIRED', 'LOST'] } }, select: { tag: true, name: true }, take: 200 }) : [];
  return { seen: found.map((f) => ({ tag: f.tag, name: f.name })), unknown: tags.filter((t) => !found.some((f) => f.tag === t)), notSeenThere: missingThere };
}

/** GET /api/registers/people?q=: students and staff (to lend to, or put on a bus or in a room). */
export async function findPeople(user: SessionUser, q: string, studentsOnly: boolean) {
  await need(user, 'registers.manage');
  const s = q.trim().slice(0, 60);
  if (s.length < 2) return { people: [] };
  const people = await prisma.user.findMany({
    where: { role: { in: studentsOnly ? ['STUDENT'] : ['STUDENT', 'TEACHER', 'ADMIN'] }, status: { not: 'SUSPENDED' }, OR: [{ name: { contains: s } }, { email: { contains: s.toLowerCase() } }] },
    orderBy: { name: 'asc' }, take: 10, select: { id: true, name: true, email: true, avatar: true, role: true },
  });
  return { people };
}

// ── Buses ───────────────────────────────────────────────────────────────────────────────────

type Stop = { name: string; time: string | null };
const parseStops = (s: string): Stop[] => { try { const x = JSON.parse(s); return Array.isArray(x) ? x : []; } catch { return []; } };

export function routeFields(b: Record<string, unknown>) {
  const name = text(b.name, 80);
  if (!name) throw new BadRequestException('Name the route, like “Route 3 · North”.');
  const stops = (Array.isArray(b.stops) ? b.stops : []).slice(0, 40).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const stopName = text(r.name, 80);
    const time = typeof r.time === 'string' && TIME_RE.test(r.time) ? r.time : null;
    return stopName ? { name: stopName, time } : null;
  }).filter((x): x is Stop => !!x);
  const capacity = b.capacity != null && b.capacity !== '' ? Number(b.capacity) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) throw new BadRequestException('Seats should be 1 to 200.');
  return { name, vehicle: text(b.vehicle, 60), driverName: text(b.driverName, 80), driverPhone: text(b.driverPhone, 30), capacity, stops: JSON.stringify(stops), notes: text(b.notes, 500) };
}

/** GET /api/registers/routes: every route with its stops and how many ride. */
export async function routes(user: SessionUser) {
  await need(user, 'registers.manage');
  const rows = await prisma.transportRoute.findMany({ orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, vehicle: true, driverName: true, driverPhone: true, capacity: true, stops: true, notes: true, _count: { select: { riders: true } } } });
  return { routes: rows.map((r) => ({ ...r, stops: parseStops(r.stops), riders: r._count.riders })) };
}

/** POST /api/registers/routes { name, vehicle?, driverName?, driverPhone?, capacity?, stops: [{name, time}], notes? } */
export async function createRoute(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const r = await prisma.transportRoute.create({ data: routeFields(b), select: { id: true, name: true } });
  return r;
}

/** GET /api/registers/routes/:id: a route and who rides it, by stop. */
export async function routeDetail(user: SessionUser, id: string) {
  await need(user, 'registers.manage');
  const r = await prisma.transportRoute.findUnique({ where: { id }, include: { riders: { orderBy: { createdAt: 'asc' }, select: { stop: true, student: { select: { id: true, name: true, avatar: true } } } } } });
  if (!r) throw new NotFoundException('That route doesn’t exist.');
  return { ...r, stops: parseStops(r.stops), riders: r.riders.map((x) => ({ ...x.student, stop: x.stop })) };
}

/** POST /api/registers/routes/:id { action: 'save', … } | { action: 'add', studentId, stop? } | { action: 'remove', studentId } | { action: 'delete' } */
export async function routeAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const r = await prisma.transportRoute.findUnique({ where: { id }, select: { id: true, name: true, capacity: true, stops: true, _count: { select: { riders: true } } } });
  if (!r) throw new NotFoundException('That route doesn’t exist.');
  switch (b.action) {
    case 'save': await prisma.transportRoute.update({ where: { id }, data: { ...routeFields(b), updatedAt: new Date() } }); return { saved: true };
    case 'delete': await prisma.transportRoute.delete({ where: { id } }); return { deleted: true };
    case 'add': {
      const student = await prisma.user.findUnique({ where: { id: typeof b.studentId === 'string' ? b.studentId : '' }, select: { id: true, name: true, role: true, busRide: { select: { routeId: true } } } });
      if (!student || student.role !== 'STUDENT') throw new BadRequestException('Choose a student.');
      const stops = parseStops(r.stops);
      const stop = typeof b.stop === 'string' && stops.some((s) => s.name === b.stop) ? b.stop : null;
      if (stops.length && !stop) throw new BadRequestException('Choose their stop.');
      const moving = student.busRide && student.busRide.routeId !== id;
      if (!student.busRide || moving) { if (r.capacity && r._count.riders >= r.capacity) throw new BadRequestException(`${r.name} is full (${r.capacity} seats).`); }
      await prisma.transportRider.upsert({ where: { studentId: student.id }, update: { routeId: id, stop }, create: { routeId: id, studentId: student.id, stop } });
      const time = stops.find((s) => s.name === stop)?.time;
      await notify(student.id, { type: 'registers', title: `Your school bus: ${r.name}`, body: stop ? `From ${stop}${time ? ` at ${time}` : ''}.` : 'See the details in Everyday life.', link: '/student/life/everyday', email: false });
      return { added: student.name, moved: !!moving };
    }
    case 'remove': {
      await prisma.transportRider.deleteMany({ where: { routeId: id, studentId: typeof b.studentId === 'string' ? b.studentId : '' } });
      return { removed: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

// ── Hostel ──────────────────────────────────────────────────────────────────────────────────

/** GET /api/registers/rooms: every room with who lives there. */
export async function rooms(user: SessionUser) {
  await need(user, 'registers.manage');
  const rows = await prisma.hostelRoom.findMany({ orderBy: [{ building: 'asc' }, { name: 'asc' }], take: 1000, select: { id: true, building: true, name: true, beds: true, notes: true, residents: { orderBy: { createdAt: 'asc' }, select: { bed: true, since: true, student: { select: { id: true, name: true, avatar: true } } } } } });
  return { rooms: rows.map((r) => ({ ...r, residents: r.residents.map((x) => ({ ...x.student, bed: x.bed, since: x.since })) })) };
}

export function roomFields(b: Record<string, unknown>) {
  const building = text(b.building, 60), name = text(b.name, 40);
  if (!building || !name) throw new BadRequestException('Give the building and the room.');
  const beds = Number(b.beds);
  if (!Number.isInteger(beds) || beds < 1 || beds > 20) throw new BadRequestException('Beds should be 1 to 20.');
  return { building, name, beds, notes: text(b.notes, 300) };
}

/** POST /api/registers/rooms { building, name, beds, notes?, count? }: a room, or several numbered from `name` (101 → 101, 102…). */
export async function createRooms(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const f = roomFields(b);
  const count = Math.min(100, Math.max(1, Number.isInteger(Number(b.count)) ? Number(b.count) : 1));
  const start = /^\d+$/.test(f.name) ? Number(f.name) : null;
  if (count > 1 && start == null) throw new BadRequestException('To add several rooms at once, start from a number, like 101.');
  const names = count > 1 ? Array.from({ length: count }, (_, i) => String(start! + i)) : [f.name];
  const taken = await prisma.hostelRoom.findMany({ where: { building: f.building, name: { in: names } }, select: { name: true } });
  if (taken.length) throw new ConflictException(`${f.building} already has room${taken.length === 1 ? '' : 's'} ${taken.map((t) => t.name).join(', ')}.`);
  await prisma.hostelRoom.createMany({ data: names.map((name) => ({ ...f, name })) });
  return { created: names.length };
}

/** POST /api/registers/rooms/:id { action: 'save', … } | { action: 'add', studentId, bed?, since? } | { action: 'remove', studentId } | { action: 'delete' } */
export async function roomAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'registers.manage');
  const r = await prisma.hostelRoom.findUnique({ where: { id }, select: { id: true, building: true, name: true, beds: true, residents: { select: { studentId: true } } } });
  if (!r) throw new NotFoundException('That room doesn’t exist.');
  switch (b.action) {
    case 'save': {
      const f = roomFields(b);
      if (f.beds < r.residents.length) throw new BadRequestException(`${r.residents.length} students live here: that’s more than ${f.beds} beds.`);
      const clash = await prisma.hostelRoom.findUnique({ where: { building_name: { building: f.building, name: f.name } }, select: { id: true } });
      if (clash && clash.id !== id) throw new ConflictException('There’s already a room with that name in that building.');
      await prisma.hostelRoom.update({ where: { id }, data: f });
      return { saved: true };
    }
    case 'delete': {
      if (r.residents.length) throw new BadRequestException('Students live here. Move them first.');
      await prisma.hostelRoom.delete({ where: { id } });
      return { deleted: true };
    }
    case 'add': {
      const student = await prisma.user.findUnique({ where: { id: typeof b.studentId === 'string' ? b.studentId : '' }, select: { id: true, name: true, role: true, hostelRoom: { select: { roomId: true } } } });
      if (!student || student.role !== 'STUDENT') throw new BadRequestException('Choose a student.');
      const already = student.hostelRoom?.roomId === id;
      if (!already && r.residents.length >= r.beds) throw new BadRequestException(`${r.building} ${r.name} is full (${r.beds} beds).`);
      const since = typeof b.since === 'string' && DAY_RE.test(b.since) ? b.since : null;
      await prisma.hostelResident.upsert({ where: { studentId: student.id }, update: { roomId: id, bed: text(b.bed, 20), since }, create: { roomId: id, studentId: student.id, bed: text(b.bed, 20), since } });
      await notify(student.id, { type: 'registers', title: `Your hostel room: ${r.building} ${r.name}`, body: b.bed ? `Bed ${String(b.bed).slice(0, 20)}.` : 'See the details in Everyday life.', link: '/student/life/everyday', email: false });
      return { added: student.name, moved: !!student.hostelRoom && !already };
    }
    case 'remove': {
      await prisma.hostelResident.deleteMany({ where: { roomId: id, studentId: typeof b.studentId === 'string' ? b.studentId : '' } });
      return { removed: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

// ── What a student (or their parent, or a member of staff) sees ─────────────────────────────

async function registersOf(userId: string) {
  const [ride, room, assets] = await Promise.all([
    prisma.transportRider.findUnique({ where: { studentId: userId }, select: { stop: true, route: { select: { name: true, vehicle: true, driverName: true, driverPhone: true, stops: true, notes: true } } } }),
    prisma.hostelResident.findUnique({ where: { studentId: userId }, select: { bed: true, since: true, room: { select: { building: true, name: true, residents: { where: { studentId: { not: userId } }, select: { student: { select: { name: true } } } } } } } }),
    prisma.asset.findMany({ where: { assignedToId: userId }, orderBy: { name: 'asc' }, take: 50, select: { tag: true, name: true, category: true } }),
  ]);
  const stops = ride ? parseStops(ride.route.stops) : [];
  return {
    bus: ride ? { route: ride.route.name, vehicle: ride.route.vehicle, driver: ride.route.driverName, driverPhone: ride.route.driverPhone, notes: ride.route.notes, stop: ride.stop, time: stops.find((s) => s.name === ride.stop)?.time ?? null, stops } : null,
    room: room ? { building: room.room.building, name: room.room.name, bed: room.bed, since: room.since, roommates: room.room.residents.map((x) => firstName(x.student.name)) } : null,
    assets,
  };
}

/** GET /api/registers/me: my bus, room and the equipment lent to me. */
export async function myRegisters(user: SessionUser) {
  if (user.role === 'GUARDIAN') throw new ForbiddenException('Parents see this under each child.');
  return registersOf(user.id);
}

/** GET /api/parent/registers?studentId=: a linked child's bus, room and equipment. */
export async function childRegisters(user: SessionUser, studentId: string | null) {
  if (user.role !== 'GUARDIAN') throw new ForbiddenException('This is for parent accounts.');
  const link = studentId ? await prisma.guardianLink.findUnique({ where: { guardianId_studentId: { guardianId: user.id, studentId } }, select: { studentId: true } }) : null;
  if (!link) throw new NotFoundException('That child isn’t linked to your account.');
  return registersOf(link.studentId);
}
