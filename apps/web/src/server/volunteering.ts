import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { readRotatingCode, rotatingCode } from './campus-life';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { evidenceFromShift, safely } from './skill-evidence';

// Verified volunteering (upgrade 5). NGO projects have shifts; students sign up, check in on site by
// scanning the supervisor's rotating QR code (or by GPS near the shift's place), and check out. A
// QR or GPS check-in is verified automatically: hours become impact points, passport evidence and
// a pre-filled certificate request. Nothing runs in the background: a student who forgets to check
// out is checked out at the shift's end the next time their shifts load.

const MIN = 60_000;
const isSupervisor = (u: SessionUser) => u.role === 'ADMIN' || u.role === 'TEACHER';
const SHIFT_SELECT = {
  id: true, title: true, startAt: true, endAt: true, location: true, lat: true, lng: true, radiusM: true, capacity: true,
  project: { select: { id: true, name: true, sdgNumber: true, impactPoints: true, skillsRequired: true, ngo: { select: { name: true } } } },
} as const;

/** Distance in metres between two points (haversine). */
export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutes that count: from check-in (not before the start) to check-out (not after the end). */
export function countedMinutes(start: Date, end: Date, inAt: Date, outAt: Date) {
  const from = Math.max(start.getTime(), inAt.getTime());
  const to = Math.min(end.getTime(), outAt.getTime());
  return Math.max(0, Math.round((to - from) / MIN));
}

const coords = (b: Record<string, unknown>) => {
  const lat = Number(b.lat), lng = Number(b.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

/** Hours become impact points and passport evidence (once per check-in). */
async function award(checkinId: string, verifierName?: string | null) {
  const c = await prisma.shiftCheckin.findUnique({ where: { id: checkinId }, select: { id: true, studentId: true, minutes: true, verified: true, verifiedById: true, checkOutAt: true, shift: { select: SHIFT_SELECT } } });
  if (!c || !c.verified || c.minutes <= 0) return;
  const exists = await prisma.impactPoint.findFirst({ where: { sourceType: 'SHIFT', sourceId: c.id }, select: { id: true } });
  if (!exists) {
    // Ten points an hour, at least one.
    await prisma.impactPoint.create({ data: { userId: c.studentId, points: Math.max(1, Math.round((c.minutes / 60) * 10)), reason: `Volunteering: ${c.shift.project.name}`.slice(0, 200), sourceType: 'SHIFT', sourceId: c.id } });
  }
  await safely(evidenceFromShift({
    userId: c.studentId, checkinId: c.id, title: c.shift.title, projectName: c.shift.project.name, organization: c.shift.project.ngo?.name ?? 'NGO',
    minutes: c.minutes, skills: c.shift.project.skillsRequired, verifiedById: c.verifiedById, verifiedByName: verifierName ?? null, at: c.checkOutAt ?? new Date(),
  }));
}

async function checkOutRow(id: string, at: Date) {
  const c = await prisma.shiftCheckin.findUnique({ where: { id }, select: { id: true, checkInAt: true, checkOutAt: true, method: true, shift: { select: { startAt: true, endAt: true } } } });
  if (!c?.checkInAt || c.checkOutAt) return;
  const out = new Date(Math.min(at.getTime(), c.shift.endAt.getTime()));
  const minutes = countedMinutes(c.shift.startAt, c.shift.endAt, c.checkInAt, out);
  await prisma.shiftCheckin.update({ where: { id }, data: { checkOutAt: out, minutes, verified: c.method === 'QR' || c.method === 'GPS' || c.method === 'MANUAL' } });
  await award(id);
}

/** GET /api/impact/shifts: upcoming and recent shifts, with places taken and my sign-up. */
export async function listShifts(user: SessionUser) {
  const now = Date.now();
  // Forgotten check-outs: closed at the shift's end.
  const open = await prisma.shiftCheckin.findMany({ where: { studentId: user.id, checkInAt: { not: null }, checkOutAt: null, shift: { endAt: { lt: new Date(now) } } }, select: { id: true }, take: 10 });
  for (const o of open) await checkOutRow(o.id, new Date(now));
  const shifts = await prisma.volunteerShift.findMany({ where: { endAt: { gte: new Date(now - 14 * 86_400_000) } }, orderBy: { startAt: 'asc' }, take: 100, select: SHIFT_SELECT });
  const ids = shifts.map((s) => s.id).slice(0, 90);
  const [counts, mine] = ids.length ? await Promise.all([
    prisma.shiftCheckin.groupBy({ by: ['shiftId'], where: { shiftId: { in: ids } }, _count: { _all: true } }),
    prisma.shiftCheckin.findMany({ where: { studentId: user.id, shiftId: { in: ids } }, select: { shiftId: true, checkInAt: true, checkOutAt: true, minutes: true, verified: true, method: true } }),
  ]) : [[], []];
  return shifts.map((s) => ({ ...s, taken: counts.find((c) => c.shiftId === s.id)?._count._all ?? 0, mine: mine.find((m) => m.shiftId === s.id) ?? null }));
}

/** POST /api/impact/shifts/[id]/signup { on }: take a place on a shift, or give it up. */
export async function signUp(user: SessionUser, shiftId: string, on: boolean) {
  const shift = await prisma.volunteerShift.findUnique({ where: { id: shiftId }, select: { capacity: true, endAt: true } });
  if (!shift) throw new NotFoundException('Shift not found.');
  const mine = await prisma.shiftCheckin.findUnique({ where: { shiftId_studentId: { shiftId, studentId: user.id } } });
  if (!on) {
    if (mine?.checkInAt) throw new BadRequestException('You’ve already checked in to this shift.');
    if (mine) await prisma.shiftCheckin.delete({ where: { id: mine.id } });
    return { ok: true };
  }
  if (mine) return { ok: true };
  if (shift.endAt.getTime() < Date.now()) throw new BadRequestException('This shift is over.');
  if ((await prisma.shiftCheckin.count({ where: { shiftId } })) >= shift.capacity) throw new BadRequestException('This shift is full.');
  await prisma.shiftCheckin.create({ data: { shiftId, studentId: user.id } });
  return { ok: true };
}

/**
 * POST /api/impact/shifts/checkin { code } or { shiftId, lat, lng }: check in with the supervisor's
 * code, or by GPS near the shift's place. From 30 minutes before the start until the end.
 */
export async function checkIn(user: SessionUser, b: Record<string, unknown>) {
  const viaCode = typeof b.code === 'string' ? readRotatingCode('s1', b.code.trim()) : null;
  if (typeof b.code === 'string' && !viaCode) throw new BadRequestException('This code has expired. Scan the one on the supervisor’s screen now.');
  const shiftId = viaCode ?? (typeof b.shiftId === 'string' ? b.shiftId : null);
  if (!shiftId) throw new BadRequestException('Scan the supervisor’s code, or check in by location.');
  const shift = await prisma.volunteerShift.findUnique({ where: { id: shiftId }, select: { id: true, title: true, startAt: true, endAt: true, lat: true, lng: true, radiusM: true, capacity: true } });
  if (!shift) throw new NotFoundException('Shift not found.');
  const now = Date.now();
  if (now < shift.startAt.getTime() - 30 * MIN) throw new BadRequestException('Check-in opens 30 minutes before the shift starts.');
  if (now > shift.endAt.getTime()) throw new BadRequestException('This shift is over.');
  const at = coords(b);
  const place = shift.lat != null && shift.lng != null ? { lat: shift.lat, lng: shift.lng } : null;
  if (!viaCode) {
    if (!place) throw new BadRequestException('This shift checks in with the supervisor’s QR code.');
    if (!at) throw new BadRequestException('Allow location to check in here.');
  }
  if (place && at) {
    const d = metres(place, at);
    // A code from the screen proves presence; GPS is checked only as a sanity limit then.
    if (d > shift.radiusM + (viaCode ? 2000 : 0)) throw new BadRequestException(`You’re about ${Math.round(d)} m away. Check in when you’re at ${viaCode ? 'the site' : 'the site (within ' + shift.radiusM + ' m)'}.`);
  }
  const mine = await prisma.shiftCheckin.findUnique({ where: { shiftId_studentId: { shiftId, studentId: user.id } } });
  if (mine?.checkInAt) return { title: shift.title, checkInAt: mine.checkInAt, already: true };
  const data = { checkInAt: new Date(now), method: viaCode ? 'QR' : 'GPS', lat: at?.lat ?? null, lng: at?.lng ?? null };
  if (mine) await prisma.shiftCheckin.update({ where: { id: mine.id }, data });
  else {
    if ((await prisma.shiftCheckin.count({ where: { shiftId } })) >= shift.capacity) throw new BadRequestException('This shift is full. Ask the supervisor.');
    await prisma.shiftCheckin.create({ data: { shiftId, studentId: user.id, ...data } });
  }
  return { title: shift.title, checkInAt: data.checkInAt, already: false };
}

/** POST /api/impact/shifts/[id]/checkout: hours are counted and verified; returns the certificate prefill. */
export async function checkOut(user: SessionUser, shiftId: string) {
  const mine = await prisma.shiftCheckin.findUnique({ where: { shiftId_studentId: { shiftId, studentId: user.id } }, select: { id: true, checkInAt: true } });
  if (!mine?.checkInAt) throw new BadRequestException('Check in first.');
  await checkOutRow(mine.id, new Date());
  const c = await prisma.shiftCheckin.findUnique({ where: { id: mine.id }, select: { minutes: true, verified: true, shift: { select: SHIFT_SELECT } } });
  return { minutes: c?.minutes ?? 0, verified: !!c?.verified, prefill: c ? { project: c.shift.project.name, org: c.shift.project.ngo?.name ?? '', hours: String(Math.max(1, Math.round((c.minutes ?? 0) / 60))) } : null };
}

// ── Supervisors (admins and teachers) ────────────────────────────────────────────────────────

function requireSupervisor(user: SessionUser) {
  if (!isSupervisor(user)) throw new ForbiddenException('Only admins and teachers can run shifts.');
}

/** POST /api/impact/shifts { projectId, title, startAt, endAt, location?, lat?, lng?, radiusM?, capacity? } */
export async function createShift(user: SessionUser, b: Record<string, unknown>) {
  requireSupervisor(user);
  const project = typeof b.projectId === 'string' ? await prisma.nGOProject.findUnique({ where: { id: b.projectId }, select: { id: true } }) : null;
  if (!project) throw new BadRequestException('Pick a project.');
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
  const startAt = new Date(String(b.startAt)), endAt = new Date(String(b.endAt));
  if (!title) throw new BadRequestException('Give the shift a name.');
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt || endAt.getTime() - startAt.getTime() > 16 * 60 * MIN) throw new BadRequestException('Pick a start and end on the same day (up to 16 hours).');
  const at = coords(b);
  return prisma.volunteerShift.create({
    data: {
      projectId: project.id, title, startAt, endAt, createdById: user.id,
      location: typeof b.location === 'string' ? b.location.trim().slice(0, 120) || null : null,
      lat: at?.lat ?? null, lng: at?.lng ?? null,
      radiusM: Math.min(5000, Math.max(50, Math.round(Number(b.radiusM) || 200))),
      capacity: Math.min(1000, Math.max(1, Math.round(Number(b.capacity) || 20))),
    },
    select: SHIFT_SELECT,
  });
}

export async function deleteShift(user: SessionUser, id: string) {
  requireSupervisor(user);
  if (await prisma.shiftCheckin.count({ where: { shiftId: id, verified: true } })) throw new BadRequestException('Students have verified hours on this shift, so it can’t be deleted.');
  await prisma.volunteerShift.delete({ where: { id } }).catch(() => null);
  return { ok: true };
}

/** GET /api/impact/shifts/[id]/roster: who signed up and checked in, plus the live check-in code. */
export async function roster(user: SessionUser, id: string) {
  requireSupervisor(user);
  const shift = await prisma.volunteerShift.findUnique({ where: { id }, select: SHIFT_SELECT });
  if (!shift) throw new NotFoundException('Shift not found.');
  const people = await prisma.shiftCheckin.findMany({
    where: { shiftId: id }, orderBy: { signedUpAt: 'asc' }, take: 1000,
    select: { id: true, checkInAt: true, checkOutAt: true, method: true, minutes: true, verified: true, student: { select: { id: true, name: true, email: true } } },
  });
  return { shift, people };
}

export function shiftCode(user: SessionUser, id: string) {
  requireSupervisor(user);
  return rotatingCode('s1', id);
}

/** POST /api/impact/shifts/[id]/present { studentId }: the supervisor confirms someone was there all shift. */
export async function markPresent(user: SessionUser, shiftId: string, studentId: unknown) {
  requireSupervisor(user);
  if (typeof studentId !== 'string') throw new BadRequestException('Pick a student.');
  const shift = await prisma.volunteerShift.findUnique({ where: { id: shiftId }, select: { startAt: true, endAt: true } });
  if (!shift) throw new NotFoundException('Shift not found.');
  const minutes = countedMinutes(shift.startAt, shift.endAt, shift.startAt, shift.endAt);
  const row = await prisma.shiftCheckin.upsert({
    where: { shiftId_studentId: { shiftId, studentId } },
    create: { shiftId, studentId, checkInAt: shift.startAt, checkOutAt: shift.endAt, method: 'MANUAL', minutes, verified: true, verifiedById: user.id },
    update: { checkInAt: shift.startAt, checkOutAt: shift.endAt, method: 'MANUAL', minutes, verified: true, verifiedById: user.id },
    select: { id: true },
  });
  await award(row.id, user.name);
  return { ok: true };
}

// ── Map and yearly report ────────────────────────────────────────────────────────────────────

/** GET /api/impact/volunteering?year=YYYY: verified hours by place, project and SDG (map + report). */
export async function volunteeringReport(yearParam: string | null) {
  const year = Number(yearParam) || new Date().getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year + 1, 0, 1));
  const rows = await prisma.shiftCheckin.findMany({
    where: { verified: true, checkOutAt: { gte: from, lt: to } },
    select: { studentId: true, minutes: true, shift: { select: { id: true, lat: true, lng: true, location: true, project: { select: { id: true, name: true, sdgNumber: true, ngo: { select: { name: true } } } } } } },
    take: 5000,
  });
  const places = new Map<string, { lat: number; lng: number; label: string; minutes: number; people: Set<string> }>();
  const projects = new Map<string, { name: string; ngo: string; sdg: number | null; minutes: number; people: Set<string> }>();
  const sdgs = new Map<number, number>();
  for (const r of rows) {
    const s = r.shift;
    if (s.lat != null && s.lng != null) {
      const k = `${s.lat.toFixed(2)},${s.lng.toFixed(2)}`;
      const p = places.get(k) ?? { lat: s.lat, lng: s.lng, label: s.location ?? s.project.name, minutes: 0, people: new Set<string>() };
      p.minutes += r.minutes; p.people.add(r.studentId); places.set(k, p);
    }
    const pr = projects.get(s.project.id) ?? { name: s.project.name, ngo: s.project.ngo?.name ?? '', sdg: s.project.sdgNumber, minutes: 0, people: new Set<string>() };
    pr.minutes += r.minutes; pr.people.add(r.studentId); projects.set(s.project.id, pr);
    if (s.project.sdgNumber) sdgs.set(s.project.sdgNumber, (sdgs.get(s.project.sdgNumber) ?? 0) + r.minutes);
  }
  const hours = (m: number) => Math.round((m / 60) * 10) / 10;
  return {
    year,
    totals: { hours: hours(rows.reduce((t, r) => t + r.minutes, 0)), volunteers: new Set(rows.map((r) => r.studentId)).size, shifts: new Set(rows.map((r) => r.shift.id)).size },
    places: [...places.values()].map((p) => ({ lat: p.lat, lng: p.lng, label: p.label, hours: hours(p.minutes), people: p.people.size })),
    projects: [...projects.values()].map((p) => ({ name: p.name, ngo: p.ngo, sdg: p.sdg, hours: hours(p.minutes), people: p.people.size })).sort((a, b) => b.hours - a.hours),
    sdgs: [...sdgs.entries()].map(([sdg, m]) => ({ sdg, hours: hours(m) })).sort((a, b) => a.sdg - b.sdg),
  };
}
