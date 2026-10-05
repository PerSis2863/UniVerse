import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { isAppFileUrl } from '@/lib/storage';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// The campus network (upgrade 9): several universities in one UniVerse. A campus is a group of
// people, found from their email domain at first sign-in (admins can move anyone). Courses belong to
// their teacher's campus; a teacher or admin can share one with partner campuses, whose students
// can then join it (class calls follow enrolment, so they're in the calls too). Students on exchange
// can also join their host campus's courses while it lasts. Nothing changes for anyone until an
// admin adds campuses: people without a campus see and can join every course, as before.
//
// Privacy: the directory shows campuses and counts, never people. Search only finds people at
// other campuses who turned on "Let partner campuses find me" (src/app/api/chat/users).

const DAY = 86_400_000;
const MAX_DOMAINS = 10;
/** Shared email services: a campus can't claim them (everyone with Gmail isn't a student there). */
const PUBLIC_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com', '163.com', 'phone.local']);

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const coord = (v: unknown, limit: number) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

/** Email domains from a list or a comma-separated string: lower case, valid, no shared mail services. */
export function cleanDomains(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : [];
  const out = new Set<string>();
  for (const item of raw) {
    const d = String(item ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^.*@/, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!d) continue;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || d.length > 100) throw new BadRequestException(`“${d}” isn’t an email domain. Use something like uni.edu.`);
    if (PUBLIC_MAIL.has(d)) throw new BadRequestException(`${d} is a shared email service, so it can’t belong to one campus.`);
    out.add(d);
  }
  if (out.size > MAX_DOMAINS) throw new BadRequestException(`A campus can have up to ${MAX_DOMAINS} email domains.`);
  return [...out];
}

const parseDomains = (s: string | null | undefined): string[] => {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : []; } catch { return []; }
};

type CampusLite = { id: string; name: string; domains: string[] };
let cache: { at: number; list: CampusLite[] } | null = null;

/** Every campus with its domains, kept a minute. */
export async function campusList(fresh = false): Promise<CampusLite[]> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.list;
  const rows = await prisma.campus.findMany({ orderBy: { name: 'asc' }, take: 200, select: { id: true, name: true, emailDomains: true } });
  cache = { at: Date.now(), list: rows.map((r) => ({ id: r.id, name: r.name, domains: parseDomains(r.emailDomains) })) };
  return cache.list;
}

/** The campus an email address belongs to (the longest matching domain wins), or null. */
export async function campusForEmail(email: string | null | undefined): Promise<string | null> {
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  if (!domain) return null;
  let best: { id: string; len: number } | null = null;
  for (const c of await campusList()) {
    for (const d of c.domains) if ((domain === d || domain.endsWith(`.${d}`)) && (!best || d.length > best.len)) best = { id: c.id, len: d.length };
  }
  return best?.id ?? null;
}

/** Puts people who have no campus yet into the one their email domain belongs to. Returns how many moved. */
export async function assignByDomain(): Promise<number> {
  const pairs = (await campusList(true)).flatMap((c) => c.domains.map((d) => ({ id: c.id, d }))).sort((a, b) => b.d.length - a.d.length).slice(0, 30);
  let moved = 0;
  for (const p of pairs) {
    moved += await prisma.$executeRawUnsafe(`UPDATE "users" SET "campusId" = ? WHERE "campusId" IS NULL AND (lower("email") LIKE ? OR lower("email") LIKE ?)`, p.id, `%@${p.d}`, `%.${p.d}`);
  }
  return moved;
}

const onExchangeNow = (p: { exchangeFrom: Date | null; exchangeUntil: Date | null }, now = Date.now()) =>
  (!p.exchangeFrom || p.exchangeFrom.getTime() <= now + DAY) && (!p.exchangeUntil || p.exchangeUntil.getTime() + DAY > now);

/**
 * The campuses whose courses a student may see and join: their own, and their exchange campus while
 * the exchange lasts. Null: no limit (the student has no campus, so nothing changed for them).
 */
export async function studentCampuses(studentId: string): Promise<string[] | null> {
  const u = await prisma.user.findUnique({ where: { id: studentId }, select: { campusId: true, studentProfile: { select: { exchangeCampusId: true, exchangeFrom: true, exchangeUntil: true } } } });
  if (!u?.campusId) return null;
  const ex = u.studentProfile;
  return ex?.exchangeCampusId && onExchangeNow(ex) ? [u.campusId, ex.exchangeCampusId] : [u.campusId];
}

/** Courses a student with these campuses may join: unassigned teachers, their campuses, and courses shared with them. */
export function courseWhereFor(campusIds: string[] | null): Prisma.CourseWhereInput {
  if (!campusIds) return {};
  return { OR: [{ teacher: { campusId: null } }, { teacher: { campusId: { in: campusIds } } }, { campuses: { some: { campusId: { in: campusIds } } } }] };
}

/** Throws unless this student may join the course (their campus, a partner it's shared with, or an exchange campus). */
export async function assertCanJoinCourse(courseId: string, studentId: string) {
  const ids = await studentCampuses(studentId);
  if (!ids) return;
  const ok = await prisma.course.count({ where: { id: courseId, ...courseWhereFor(ids) } });
  if (!ok) throw new ForbiddenException('This course is only open to students of its campus and the partner campuses it’s shared with.');
}

async function tell(userId: string, title: string, body: string, link: string) {
  await prisma.notification.create({ data: { userId, title, body, type: 'info', link } });
  publish([userId], { type: 'notification' });
  await pushService.sendToMany([userId], { title, body, url: link, tag: 'campus-network' }).catch(() => 0);
}

const requireAdmin = (user: SessionUser) => {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can manage the campus network.');
};

// ─── Directory ───────────────────────────────────────────────────────────────────────────────

type Num = number | bigint | null;
const num = (v: Num | undefined) => Number(v ?? 0);

/** The network for everyone: campuses with counts (no people), my campus, my exchange and my search setting. */
export async function networkOverview(user: SessionUser) {
  const now = new Date(Date.now() - DAY).toISOString().replace('Z', '+00:00');
  const [rows, me] = await Promise.all([
    prisma.$queryRawUnsafe<{ id: string; name: string; country: string | null; city: string | null; logoUrl: string | null; emailDomains: string; lat: number | null; lng: number | null; students: Num; teachers: Num; courses: Num; shared: Num; exchange: Num }[]>(
      `SELECT c."id", c."name", c."country", c."city", c."logoUrl", c."emailDomains", c."lat", c."lng",
              (SELECT COUNT(*) FROM "users" u WHERE u."campusId" = c."id" AND u."role" = 'STUDENT' AND u."status" = 'ACTIVE') AS students,
              (SELECT COUNT(*) FROM "users" u WHERE u."campusId" = c."id" AND u."role" = 'TEACHER' AND u."status" = 'ACTIVE') AS teachers,
              (SELECT COUNT(*) FROM "courses" co JOIN "users" t ON t."id" = co."teacherId" WHERE t."campusId" = c."id" AND co."status" = 'PUBLISHED') AS courses,
              (SELECT COUNT(*) FROM "course_campuses" cc WHERE cc."campusId" = c."id") AS shared,
              (SELECT COUNT(*) FROM "student_profiles" sp WHERE sp."exchangeCampusId" = c."id" AND (sp."exchangeUntil" IS NULL OR sp."exchangeUntil" >= ?)) AS exchange
       FROM "campuses" c ORDER BY c."name" LIMIT 100`,
      now,
    ),
    prisma.user.findUnique({ where: { id: user.id }, select: { campusId: true, networkVisible: true, studentProfile: { select: { exchangeCampusId: true, exchangeFrom: true, exchangeUntil: true } } } }),
  ]);
  const name = (id: string | null | undefined) => rows.find((r) => r.id === id)?.name ?? null;
  const ex = me?.studentProfile;
  const unassigned = user.role === 'ADMIN'
    ? num((await prisma.$queryRawUnsafe<{ n: Num }[]>(`SELECT COUNT(*) AS n FROM "users" WHERE "campusId" IS NULL AND "status" = 'ACTIVE' AND "role" IN ('STUDENT', 'TEACHER')`))[0]?.n)
    : null;
  return {
    campuses: rows.map((r) => ({
      id: r.id, name: r.name, country: r.country, city: r.city, logoUrl: r.logoUrl, lat: r.lat, lng: r.lng,
      students: num(r.students), teachers: num(r.teachers), courses: num(r.courses), shared: num(r.shared), exchange: num(r.exchange),
      ...(user.role === 'ADMIN' ? { domains: parseDomains(r.emailDomains) } : {}),
    })),
    me: {
      campusId: me?.campusId ?? null,
      campusName: name(me?.campusId),
      networkVisible: me?.networkVisible ?? false,
      exchange: ex?.exchangeCampusId ? { campusId: ex.exchangeCampusId, campusName: name(ex.exchangeCampusId), from: ex.exchangeFrom, until: ex.exchangeUntil, now: onExchangeNow(ex) } : null,
    },
    unassigned,
  };
}

export async function setNetworkVisible(user: SessionUser, visible: unknown) {
  await prisma.user.update({ where: { id: user.id }, data: { networkVisible: visible === true } });
  return { networkVisible: visible === true };
}

// ─── Campuses (admins) ───────────────────────────────────────────────────────────────────────

function campusData(body: Record<string, unknown>, partial: boolean) {
  const data: Prisma.CampusUpdateInput = {};
  if (!partial || body.name !== undefined) {
    const name = text(body.name, 120);
    if (!name) throw new BadRequestException('Give the campus a name.');
    data.name = name;
  }
  if (body.country !== undefined) data.country = text(body.country, 80) || null;
  if (body.city !== undefined) data.city = text(body.city, 80) || null;
  if (body.logoUrl !== undefined) {
    // Only files uploaded to UniVerse: the page's security policy blocks images from other sites.
    const url = text(body.logoUrl, 500);
    if (url && !isAppFileUrl(url)) throw new BadRequestException('Upload the logo here instead of linking to another site.');
    data.logoUrl = url || null;
  }
  if (body.emailDomains !== undefined) data.emailDomains = JSON.stringify(cleanDomains(body.emailDomains));
  if (body.lat !== undefined) data.lat = coord(body.lat, 90);
  if (body.lng !== undefined) data.lng = coord(body.lng, 180);
  return data;
}

/** No two campuses may claim the same email domain. */
async function assertDomainsFree(domains: string[], campusId: string | null) {
  if (!domains.length) return;
  for (const c of await campusList(true)) {
    if (c.id === campusId) continue;
    const clash = c.domains.find((d) => domains.includes(d));
    if (clash) throw new BadRequestException(`${clash} already belongs to ${c.name}.`);
  }
}

export async function createCampus(user: SessionUser, body: Record<string, unknown>) {
  requireAdmin(user);
  const data = campusData(body, false);
  if ((await prisma.campus.count()) >= 100) throw new BadRequestException('The network can have up to 100 campuses.');
  const domains = parseDomains(String(data.emailDomains ?? '[]'));
  await assertDomainsFree(domains, null);
  const campus = await prisma.campus.create({ data: { ...(data as Prisma.CampusCreateInput), emailDomains: JSON.stringify(domains) }, select: { id: true, name: true } });
  cache = null;
  const moved = domains.length ? await assignByDomain() : 0;
  return { ...campus, moved };
}

export async function updateCampus(user: SessionUser, id: string, body: Record<string, unknown>) {
  requireAdmin(user);
  const data = campusData(body, true);
  if (data.emailDomains !== undefined) await assertDomainsFree(parseDomains(String(data.emailDomains)), id);
  const campus = await prisma.campus.update({ where: { id }, data, select: { id: true, name: true } }).catch(() => null);
  if (!campus) throw new NotFoundException('This campus no longer exists.');
  cache = null;
  const moved = data.emailDomains !== undefined ? await assignByDomain() : 0;
  return { ...campus, moved };
}

/** Removes a campus. Its people keep their accounts and simply have no campus (they see every course again). */
export async function deleteCampus(user: SessionUser, id: string) {
  requireAdmin(user);
  await prisma.user.updateMany({ where: { campusId: id }, data: { campusId: null } });
  await prisma.studentProfile.updateMany({ where: { exchangeCampusId: id }, data: { exchangeCampusId: null, exchangeFrom: null, exchangeUntil: null } });
  await prisma.campus.delete({ where: { id } }).catch(() => null);
  cache = null;
  return { ok: true };
}

/** Moves one person (by email) to a campus, or out of every campus (campusId null). */
export async function setPersonCampus(user: SessionUser, body: Record<string, unknown>) {
  requireAdmin(user);
  const email = text(body.email, 200).toLowerCase();
  const campusId = typeof body.campusId === 'string' && body.campusId ? body.campusId : null;
  if (!email) throw new BadRequestException('Type the person’s email address.');
  if (campusId && !(await prisma.campus.findUnique({ where: { id: campusId }, select: { id: true } }))) throw new NotFoundException('This campus no longer exists.');
  const person = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!person) throw new NotFoundException(`No one on UniVerse uses ${email}.`);
  await prisma.user.update({ where: { id: person.id }, data: { campusId } });
  return { name: person.name };
}

// ─── Joint courses ───────────────────────────────────────────────────────────────────────────

async function requireCourseManager(user: SessionUser, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, teacherId: true, teacher: { select: { campusId: true } } } });
  if (!course) throw new NotFoundException('Course not found.');
  if (user.role !== 'ADMIN' && course.teacherId !== user.id) throw new ForbiddenException('Only the course’s teacher or an admin can share it.');
  return course;
}

/** Shares a course with a partner campus: its students can see and join it. */
export async function shareCourse(user: SessionUser, courseId: string, campusId: unknown) {
  const course = await requireCourseManager(user, courseId);
  const campus = typeof campusId === 'string' ? await prisma.campus.findUnique({ where: { id: campusId }, select: { id: true, name: true } }) : null;
  if (!campus) throw new NotFoundException('Pick a campus.');
  if (course.teacher.campusId === campus.id) throw new BadRequestException(`${course.code} already belongs to ${campus.name}.`);
  if ((await prisma.courseCampus.count({ where: { courseId } })) >= 20) throw new BadRequestException('A course can be shared with up to 20 campuses.');
  await prisma.courseCampus.upsert({ where: { courseId_campusId: { courseId, campusId: campus.id } }, create: { courseId, campusId: campus.id, addedById: user.id }, update: {} });
  return { ok: true, campus: campus.name };
}

/** Stops sharing a course. Students who already joined stay enrolled (the teacher decides about them). */
export async function unshareCourse(user: SessionUser, courseId: string, campusId: string) {
  await requireCourseManager(user, courseId);
  await prisma.courseCampus.deleteMany({ where: { courseId, campusId } });
  return { ok: true };
}

/** Courses for the sharing screens: the teacher's own (admins: every course), with the campuses each is shared with. */
export async function shareableCourses(user: SessionUser) {
  const courses = await prisma.course.findMany({
    where: user.role === 'ADMIN' ? {} : { teacherId: user.id },
    orderBy: [{ status: 'asc' }, { code: 'asc' }],
    take: user.role === 'ADMIN' ? 300 : 60,
    select: {
      id: true, code: true, name: true, status: true,
      teacher: { select: { name: true, campus: { select: { id: true, name: true } } } },
      campuses: { select: { campus: { select: { id: true, name: true } } } },
      _count: { select: { enrollments: true } },
    },
  });
  return courses.map((c) => ({
    id: c.id, code: c.code, name: c.name, status: c.status, teacher: c.teacher.name, students: c._count.enrollments,
    home: c.teacher.campus, sharedWith: c.campuses.map((x) => x.campus),
  }));
}

/**
 * For a student: courses from partner campuses they can join (shared with their campus), and their
 * exchange campus's courses while the exchange lasts. Empty when they have no campus.
 */
export async function jointCoursesFor(studentId: string) {
  const ids = await studentCampuses(studentId);
  if (!ids) return { courses: [], exchange: null };
  const profile = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { exchangeCampusId: true, exchangeFrom: true, exchangeUntil: true, exchangeCampus: { select: { name: true } } } });
  const host = profile?.exchangeCampusId && ids.includes(profile.exchangeCampusId) ? profile.exchangeCampusId : null;
  const courses = await prisma.course.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [
        { campuses: { some: { campusId: { in: ids } } }, teacher: { campusId: { notIn: ids } } },
        ...(host ? [{ teacher: { campusId: host } }] : []),
      ],
    },
    orderBy: { code: 'asc' },
    take: 60,
    select: {
      id: true, code: true, name: true, description: true, credits: true, color: true, emoji: true,
      teacher: { select: { name: true, campus: { select: { id: true, name: true } } } },
      enrollments: { where: { studentId }, select: { id: true } },
      _count: { select: { enrollments: true } },
    },
  });
  return {
    courses: courses.map((c) => ({
      id: c.id, code: c.code, name: c.name, description: c.description, credits: c.credits, color: c.color, emoji: c.emoji,
      teacher: c.teacher.name, campus: c.teacher.campus?.name ?? null, viaExchange: !!host && c.teacher.campus?.id === host,
      enrolled: c.enrollments.length > 0, students: c._count.enrollments,
    })),
    exchange: host && profile ? { campus: profile.exchangeCampus?.name ?? '', from: profile.exchangeFrom, until: profile.exchangeUntil } : null,
  };
}

// ─── Exchange students (admins) ──────────────────────────────────────────────────────────────

const day = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Sends a student on exchange to a partner campus between two dates (they're told in the app). */
export async function setExchange(user: SessionUser, body: Record<string, unknown>) {
  requireAdmin(user);
  const email = text(body.email, 200).toLowerCase();
  const student = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true, campusId: true } }) : null;
  if (!student || student.role !== 'STUDENT') throw new NotFoundException(email ? `No student on UniVerse uses ${email}.` : 'Type the student’s email address.');
  const campus = typeof body.campusId === 'string' ? await prisma.campus.findUnique({ where: { id: body.campusId }, select: { id: true, name: true } }) : null;
  if (!campus) throw new NotFoundException('Pick the campus they’re going to.');
  if (student.campusId === campus.id) throw new BadRequestException(`${student.name} already belongs to ${campus.name}.`);
  const from = day(body.from), until = day(body.until);
  if (!from || !until) throw new BadRequestException('Pick the first and last day of the exchange.');
  if (until < from) throw new BadRequestException('The last day must be after the first.');
  if (until.getTime() - from.getTime() > 730 * DAY) throw new BadRequestException('An exchange can last up to two years.');
  const data = { exchangeCampusId: campus.id, exchangeFrom: from, exchangeUntil: until };
  await prisma.studentProfile.upsert({ where: { userId: student.id }, create: { userId: student.id, ...data }, update: data });
  const when = `${from.toISOString().slice(0, 10)} to ${until.toISOString().slice(0, 10)}`;
  await tell(student.id, `Exchange at ${campus.name}`, `From ${when} you can also join ${campus.name}’s courses: they’re under My courses.`, '/student/courses');
  return { ok: true, name: student.name, campus: campus.name };
}

export async function endExchange(user: SessionUser, studentId: string) {
  requireAdmin(user);
  await prisma.studentProfile.updateMany({ where: { userId: studentId }, data: { exchangeCampusId: null, exchangeFrom: null, exchangeUntil: null } });
  return { ok: true };
}

/** Students with an exchange set (current and upcoming first). */
export async function exchangeList(user: SessionUser) {
  requireAdmin(user);
  const rows = await prisma.studentProfile.findMany({
    where: { exchangeCampusId: { not: null } },
    orderBy: { exchangeFrom: 'desc' },
    take: 200,
    select: { exchangeFrom: true, exchangeUntil: true, exchangeCampus: { select: { name: true } }, user: { select: { id: true, name: true, email: true, campus: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    id: r.user.id, name: r.user.name, email: r.user.email, home: r.user.campus?.name ?? null, host: r.exchangeCampus?.name ?? '',
    from: r.exchangeFrom, until: r.exchangeUntil, now: onExchangeNow(r),
  }));
}
