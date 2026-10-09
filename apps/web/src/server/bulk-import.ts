import prisma from '@/lib/db';
import { toCsv } from '@/lib/csv';
import { IMPORT_COLUMNS, IMPORT_KINDS, MAX_IMPORT_ROWS, type ImportKind } from '@/lib/import-columns';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { need } from './permissions';

// Bulk import from CSV with a preview and undo (Stage 5 · B15.7). The admin's browser reads the file
// and matches its columns (src/lib/csv.ts); the server checks every row and says what it would do
// (preview: reads only), then does it (import) and keeps what it created and what each changed row
// was before, so the whole import can be undone for 7 days. Kinds:
//   people      invitations (approved on sign-up), students put in classes (now, or when they join)
//   enrolments  students in classes (people invited but not joined: when they join)
//   courses     new courses, or changes to existing ones (matched by code)
//   timetable   weekly class times with rooms (room clashes refused)
// Every lookup and write is one statement whatever the number of rows (JSON in one bound value,
// read with json_each), so 1,000 rows stay within D1's 50 statements and 100 values a request.

export type Action = 'invite' | 'enrol' | 'create' | 'update' | 'skip' | 'error';
export interface RowResult { n: number; action: Action; message: string; label: string }
type Row = Record<string, string | undefined>;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9 _.\-/]{0,19}$/;
const INVITE_DAYS = 30, UNDO_DAYS = 7;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dbDate = (d = new Date()) => d.toISOString().replace('Z', '+00:00');
const newId = () => `c${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
/** Runs a read with a list as one JSON value (read in SQL with json_each(?1)). */
const readWith = <T,>(sql: string, list: unknown[], ...args: unknown[]) => list.length ? prisma.$queryRawUnsafe<T[]>(sql, JSON.stringify(list), ...args) : Promise.resolve([] as T[]);
const writeWith = (sql: string, list: unknown[], ...args: unknown[]) => list.length ? prisma.$executeRawUnsafe(sql, JSON.stringify(list), ...args) : Promise.resolve(0);

// ── Reading cells ───────────────────────────────────────────────────────────────────────────

export function readRole(v: string | undefined): 'STUDENT' | 'TEACHER' | null {
  const r = (v ?? '').trim().toLowerCase();
  if (!r || ['student', 'pupil', 'learner'].includes(r)) return 'STUDENT';
  if (['teacher', 'staff', 'faculty', 'instructor', 'lecturer', 'professor'].includes(r)) return 'TEACHER';
  return null;
}
/** Mon…Sun → 0…6 (also full names, and 1–7 with Monday as 1). */
export function readDay(v: string | undefined): number | null {
  const d = (v ?? '').trim().toLowerCase();
  if (/^[1-7]$/.test(d)) return Number(d) - 1;
  const i = DAYS.findIndex((x) => d.startsWith(x) && (d.length === 3 || 'monday tuesday wednesday thursday friday saturday sunday'.includes(d)));
  return i >= 0 ? i : null;
}
/** "9:00", "09.00", "0900" → "09:00"; null if it isn't a time. */
export function readTime(v: string | undefined): string | null {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec((v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}
export const readCodes = (v: string | undefined) => [...new Set((v ?? '').split(/[;|,]/).map((c) => c.trim()).filter(Boolean))];

// ── Plans: what each row would do ───────────────────────────────────────────────────────────

interface Plan {
  results: RowResult[];
  invites: { id: string; email: string; role: string }[];
  reinvites: { email: string; role: string; before: { role: string; status: string; expiresAt: string } }[];
  enrol: { id: string; studentId: string; courseId: string }[];
  pending: { id: string; email: string; courseId: string }[];
  courses: { id: string; code: string; name: string; teacherId: string; credits: number; department: string | null; description: string | null; status: string }[];
  courseUpdates: { id: string; name: string | null; teacherId: string | null; credits: number | null; department: string | null; description: string | null; status: string | null; before: Record<string, unknown> }[];
  slots: { id: string; courseId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string | null; type: string }[];
}
const emptyPlan = (): Plan => ({ results: [], invites: [], reinvites: [], enrol: [], pending: [], courses: [], courseUpdates: [], slots: [] });

async function coursesByCode(codes: string[]) {
  const rows = await readWith<{ id: string; code: string; name: string; teacherId: string; credits: number; department: string | null; description: string | null; status: string }>(
    `SELECT id, code, name, "teacherId", credits, department, description, status FROM courses WHERE upper(code) IN (SELECT upper(value) FROM json_each(?1))`, [...new Set(codes)]);
  return new Map(rows.map((c) => [c.code.toUpperCase(), c]));
}
async function usersByEmail(emails: string[]) {
  const rows = await readWith<{ id: string; email: string; role: string; name: string }>(`SELECT id, lower(email) AS email, role, name FROM users WHERE lower(email) IN (SELECT value FROM json_each(?1))`, [...new Set(emails)]);
  return new Map(rows.map((u) => [u.email, u]));
}
async function invitesByEmail(emails: string[]) {
  const rows = await readWith<{ email: string; role: string; status: string; expiresAt: string }>(`SELECT lower(email) AS email, role, status, "expiresAt" FROM invitations WHERE lower(email) IN (SELECT value FROM json_each(?1))`, [...new Set(emails)]);
  return new Map(rows.map((i) => [i.email, i]));
}

async function planPeople(rows: Row[]): Promise<Plan> {
  const plan = emptyPlan();
  const emails = rows.map((r) => (r.email ?? '').trim().toLowerCase());
  const [users, invites, courses] = await Promise.all([usersByEmail(emails.filter(Boolean)), invitesByEmail(emails.filter(Boolean)), coursesByCode(rows.flatMap((r) => readCodes(r.courses)))]);
  const enrolled = new Set((await readWith<{ k: string }>(`SELECT "studentId" || ':' || "courseId" AS k FROM enrollments WHERE "studentId" IN (SELECT value FROM json_each(?1))`, [...users.values()].map((u) => u.id))).map((x) => x.k));
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const n = i + 1, email = emails[i];
    const label = r.name ? `${r.name} · ${email}` : email || '(no email)';
    const out = (action: Action, message: string) => plan.results.push({ n, action, message, label });
    if (!EMAIL_RE.test(email) || email.length > 254) return out('error', 'This isn’t an email address.');
    if (seen.has(email)) return out('error', `Same email as row ${seen.get(email)}.`);
    seen.set(email, n);
    const role = readRole(r.role);
    if (!role) return out('error', `Role “${r.role}” should be student or teacher.`);
    const codes = readCodes(r.courses);
    const missing = codes.filter((c) => !courses.has(c.toUpperCase()));
    if (missing.length) return out('error', `No course with code ${missing.join(', ')}.`);
    const wanted = codes.map((c) => courses.get(c.toUpperCase())!);
    const user = users.get(email);
    if (user) {
      if (!wanted.length) return out('skip', `Already has an account (${user.role.toLowerCase()}).`);
      if (user.role !== 'STUDENT') return out('skip', `Already has an account as ${user.role.toLowerCase()}: only students are put in classes.`);
      const add = wanted.filter((c) => !enrolled.has(`${user.id}:${c.id}`));
      if (!add.length) return out('skip', 'Already has an account and is in those classes.');
      add.forEach((c) => plan.enrol.push({ id: newId(), studentId: user.id, courseId: c.id }));
      return out('enrol', `Has an account: will be put in ${add.map((c) => c.code).join(', ')}.`);
    }
    const inv = invites.get(email);
    if (inv) plan.reinvites.push({ email, role, before: { role: inv.role, status: inv.status, expiresAt: inv.expiresAt } });
    else plan.invites.push({ id: newId(), email, role });
    if (role === 'STUDENT') wanted.forEach((c) => plan.pending.push({ id: newId(), email, courseId: c.id }));
    const classes = role === 'STUDENT' && wanted.length ? `, then put in ${wanted.map((c) => c.code).join(', ')} when they join` : role === 'TEACHER' && wanted.length ? ' (courses are ignored for teachers: set the teacher on the course)' : '';
    return out('invite', `${inv ? 'Invitation renewed' : 'Will be invited'} as ${role.toLowerCase()} for ${INVITE_DAYS} days${classes}.`);
  });
  return plan;
}

async function planEnrolments(rows: Row[]): Promise<Plan> {
  const plan = emptyPlan();
  const emails = rows.map((r) => (r.email ?? '').trim().toLowerCase());
  const [users, invites, courses] = await Promise.all([usersByEmail(emails.filter(Boolean)), invitesByEmail(emails.filter(Boolean)), coursesByCode(rows.map((r) => (r.course ?? '').trim()).filter(Boolean))]);
  const ids = [...users.values()].map((u) => u.id);
  const [enrolled, pending] = await Promise.all([
    readWith<{ k: string }>(`SELECT "studentId" || ':' || "courseId" AS k FROM enrollments WHERE "studentId" IN (SELECT value FROM json_each(?1))`, ids).then((x) => new Set(x.map((y) => y.k))),
    readWith<{ k: string }>(`SELECT lower(email) || ':' || "courseId" AS k FROM pending_enrolments WHERE lower(email) IN (SELECT value FROM json_each(?1))`, [...new Set(emails)]).then((x) => new Set(x.map((y) => y.k))),
  ]);
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const n = i + 1, email = emails[i], code = (r.course ?? '').trim();
    const label = `${email || '(no email)'} → ${code || '(no course)'}`;
    const out = (action: Action, message: string) => plan.results.push({ n, action, message, label });
    if (!EMAIL_RE.test(email)) return out('error', 'This isn’t an email address.');
    const course = courses.get(code.toUpperCase());
    if (!course) return out('error', code ? `No course with code ${code}.` : 'Say which course.');
    const key = `${email}:${course.id}`;
    if (seen.has(key)) return out('skip', `Same as row ${seen.get(key)}.`);
    seen.set(key, n);
    const user = users.get(email);
    if (user) {
      if (user.role !== 'STUDENT') return out('error', `${user.name} is a ${user.role.toLowerCase()}, not a student.`);
      if (enrolled.has(`${user.id}:${course.id}`)) return out('skip', `Already in ${course.code}.`);
      plan.enrol.push({ id: newId(), studentId: user.id, courseId: course.id });
      return out('enrol', `${user.name} will be put in ${course.code}.`);
    }
    const inv = invites.get(email);
    if (inv?.status === 'PENDING' && inv.role === 'STUDENT') {
      if (pending.has(key)) return out('skip', `Already waiting to join ${course.code}.`);
      plan.pending.push({ id: newId(), email, courseId: course.id });
      return out('enrol', `Invited, not joined yet: will be put in ${course.code} when they join.`);
    }
    return out('error', 'No student account or invitation for this email. Import them under People first.');
  });
  return plan;
}

async function planCourses(rows: Row[]): Promise<Plan> {
  const plan = emptyPlan();
  const codes = rows.map((r) => (r.code ?? '').trim());
  const teacherEmails = rows.map((r) => (r.teacher ?? '').trim().toLowerCase()).filter(Boolean);
  const [existing, teachers] = await Promise.all([coursesByCode(codes.filter(Boolean)), usersByEmail(teacherEmails)]);
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const n = i + 1, code = codes[i];
    const label = r.name ? `${code} · ${r.name}` : code || '(no code)';
    const out = (action: Action, message: string) => plan.results.push({ n, action, message, label });
    if (!CODE_RE.test(code)) return out('error', code ? 'Codes are up to 20 letters, numbers, spaces or - _ . /' : 'Give the course a code.');
    if (seen.has(code.toUpperCase())) return out('error', `Same code as row ${seen.get(code.toUpperCase())}.`);
    seen.set(code.toUpperCase(), n);
    const name = r.name?.trim().slice(0, 120) || null;
    const teacherEmail = r.teacher?.trim().toLowerCase();
    const teacher = teacherEmail ? teachers.get(teacherEmail) : undefined;
    if (teacherEmail && !teacher) return out('error', `No account with the email ${teacherEmail}.`);
    if (teacher && teacher.role !== 'TEACHER' && teacher.role !== 'ADMIN') return out('error', `${teacher.name} isn’t a teacher.`);
    const credits = r.credits?.trim() ? Number(r.credits) : null;
    if (credits != null && (!Number.isInteger(credits) || credits < 0 || credits > 30)) return out('error', 'Credits should be a whole number from 0 to 30.');
    const status = r.status?.trim() ? ({ published: 'PUBLISHED', live: 'PUBLISHED', active: 'PUBLISHED', draft: 'DRAFT', archived: 'ARCHIVED' } as Record<string, string>)[r.status.trim().toLowerCase()] : null;
    if (r.status?.trim() && !status) return out('error', 'Status should be published, draft or archived.');
    const department = r.department?.trim().slice(0, 80) || null;
    const description = r.description?.trim().slice(0, 2000) || null;
    const cur = existing.get(code.toUpperCase());
    if (cur) {
      const changes: string[] = [];
      if (name && name !== cur.name) changes.push('name');
      if (teacher && teacher.id !== cur.teacherId) changes.push(`teacher → ${teacher.name}`);
      if (credits != null && credits !== cur.credits) changes.push(`credits → ${credits}`);
      if (department && department !== cur.department) changes.push('department');
      if (description && description !== cur.description) changes.push('description');
      if (status && status !== cur.status) changes.push(status.toLowerCase());
      if (!changes.length) return out('skip', `${cur.code} exists, nothing to change.`);
      plan.courseUpdates.push({ id: cur.id, name, teacherId: teacher?.id ?? null, credits, department, description, status, before: { name: cur.name, teacherId: cur.teacherId, credits: cur.credits, department: cur.department, description: cur.description, status: cur.status } });
      return out('update', `${cur.code} exists: will change ${changes.join(', ')}.`);
    }
    if (!name) return out('error', 'New courses need a name.');
    if (!teacher) return out('error', 'New courses need a teacher (their email).');
    plan.courses.push({ id: newId(), code, name, teacherId: teacher.id, credits: credits ?? 3, department, description, status: status ?? 'PUBLISHED' });
    return out('create', `New course taught by ${teacher.name}${status === 'DRAFT' ? ' (draft)' : ''}.`);
  });
  return plan;
}

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;

async function planTimetable(rows: Row[]): Promise<Plan> {
  const plan = emptyPlan();
  const [courses, rooms] = await Promise.all([
    coursesByCode(rows.map((r) => (r.course ?? '').trim()).filter(Boolean)),
    prisma.room.findMany({ select: { id: true, name: true }, take: 1000 }),
  ]);
  const roomByName = new Map(rooms.map((r) => [r.name.trim().toLowerCase(), r]));
  const taken = await readWith<{ courseId: string; dayOfWeek: number; startTime: string; endTime: string; roomId: string | null; code: string }>(
    `SELECT s."courseId", s."dayOfWeek", s."startTime", s."endTime", s."roomId", c.code FROM timetable_slots s JOIN courses c ON c.id = s."courseId"
     WHERE s."courseId" IN (SELECT value FROM json_each(?1)) OR s."roomId" IS NOT NULL`, [...courses.values()].map((c) => c.id));
  const placed: { courseId: string; day: number; start: string; end: string; roomId: string | null; code: string; n: number }[] = [];
  rows.forEach((r, i) => {
    const n = i + 1, code = (r.course ?? '').trim();
    const label = `${code || '(no course)'} · ${r.day ?? ''} ${r.start ?? ''}–${r.end ?? ''}`;
    const out = (action: Action, message: string) => plan.results.push({ n, action, message, label });
    const course = courses.get(code.toUpperCase());
    if (!course) return out('error', code ? `No course with code ${code}.` : 'Say which course.');
    const day = readDay(r.day);
    if (day == null) return out('error', `Day “${r.day ?? ''}” should be Mon to Sun.`);
    const start = readTime(r.start), end = readTime(r.end);
    if (!start || !end) return out('error', 'Times look like 09:00.');
    if (end <= start) return out('error', 'It ends before it starts.');
    const room = r.room?.trim() ? roomByName.get(r.room.trim().toLowerCase()) : null;
    if (r.room?.trim() && !room) return out('error', `No room called “${r.room.trim()}”. Add it under Rooms first.`);
    const type = r.type?.trim() ? ({ lecture: 'LECTURE', class: 'LECTURE', lab: 'LAB', laboratory: 'LAB', practical: 'LAB', tutorial: 'TUTORIAL', seminar: 'TUTORIAL' } as Record<string, string>)[r.type.trim().toLowerCase()] : 'LECTURE';
    if (!type) return out('error', 'Type should be lecture, lab or tutorial.');
    const slot = { start, end };
    if (taken.some((t) => t.courseId === course.id && t.dayOfWeek === day && t.startTime === start)) return out('skip', `${course.code} is already on ${DAY_NAMES[day]} at ${start}.`);
    const same = placed.find((p) => p.courseId === course.id && p.day === day && p.start === start);
    if (same) return out('skip', `Same as row ${same.n}.`);
    if (room) {
      const clash = taken.find((t) => t.roomId === room.id && t.dayOfWeek === day && overlaps(slot, { start: t.startTime, end: t.endTime }))
        ?? placed.find((p) => p.roomId === room.id && p.day === day && overlaps(slot, p));
      if (clash) return out('error', `${room.name} is taken then by ${clash.code} (${'startTime' in clash ? clash.startTime : clash.start}–${'endTime' in clash ? clash.endTime : clash.end}).`);
    }
    placed.push({ courseId: course.id, day, start, end, roomId: room?.id ?? null, code: course.code, n });
    plan.slots.push({ id: newId(), courseId: course.id, dayOfWeek: day, startTime: start, endTime: end, roomId: room?.id ?? null, type });
    return out('create', `${course.code} on ${DAY_NAMES[day]} ${start}–${end}${room ? ` in ${room.name}` : ''} (${type.toLowerCase()}).`);
  });
  return plan;
}

function readRequest(b: Record<string, unknown>) {
  const kind = IMPORT_KINDS.find((k) => k === b.kind);
  if (!kind) throw new BadRequestException('Choose what you’re importing.');
  if (!Array.isArray(b.rows) || !b.rows.length) throw new BadRequestException('The file has no rows.');
  if (b.rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Import up to ${MAX_IMPORT_ROWS.toLocaleString('en')} rows at a time.`);
  const keys = IMPORT_COLUMNS[kind].map((c) => c.key);
  const rows: Row[] = b.rows.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return Object.fromEntries(keys.map((k) => [k, typeof o[k] === 'string' ? (o[k] as string).slice(0, 2000) : typeof o[k] === 'number' ? String(o[k]) : undefined]));
  });
  return { kind, rows };
}

const planFor = (kind: ImportKind, rows: Row[]) =>
  kind === 'people' ? planPeople(rows) : kind === 'enrolments' ? planEnrolments(rows) : kind === 'courses' ? planCourses(rows) : planTimetable(rows);

const countOf = (results: RowResult[]) => {
  const c: Record<Action, number> = { invite: 0, enrol: 0, create: 0, update: 0, skip: 0, error: 0 };
  for (const r of results) c[r.action]++;
  return c;
};

/** POST /api/admin/import/preview { kind, rows }: what each row would do. Reads only. */
export async function previewImport(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'import.run');
  const { kind, rows } = readRequest(b);
  const plan = await planFor(kind, rows);
  return { kind, counts: countOf(plan.results), results: plan.results };
}

// ── Import and undo ─────────────────────────────────────────────────────────────────────────

interface Undo {
  invitations: string[]; reinvites: Plan['reinvites']; enrollments: string[]; pending: string[];
  courses: string[]; courseUpdates: { id: string; before: Record<string, unknown> }[]; slots: string[];
}

/** POST /api/admin/import { kind, rows, fileName? }: checks again and does it; rows with problems are left out. */
export async function runImport(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'import.run');
  const { kind, rows } = readRequest(b);
  const plan = await planFor(kind, rows);
  const counts = countOf(plan.results);
  if (!counts.invite && !counts.enrol && !counts.create && !counts.update) throw new BadRequestException('Nothing to import: every row is skipped or has a problem.');
  const now = dbDate();
  const expires = dbDate(new Date(Date.now() + INVITE_DAYS * 86_400_000));
  await writeWith(`INSERT INTO invitations (id, email, role, status, "expiresAt", "createdAt", "updatedAt")
    SELECT json_extract(value, '$.id'), json_extract(value, '$.email'), json_extract(value, '$.role'), 'PENDING', ?2, ?3, ?3 FROM json_each(?1) WHERE true
    ON CONFLICT(email) DO NOTHING`, plan.invites, expires, now);
  await writeWith(`UPDATE invitations SET role = (SELECT json_extract(value, '$.role') FROM json_each(?1) WHERE json_extract(value, '$.email') = lower(invitations.email)),
    status = 'PENDING', "expiresAt" = ?2, "updatedAt" = ?3 WHERE lower(email) IN (SELECT json_extract(value, '$.email') FROM json_each(?1))`, plan.reinvites, expires, now);
  await writeWith(`INSERT INTO enrollments (id, "studentId", "courseId", "enrolledAt")
    SELECT json_extract(value, '$.id'), json_extract(value, '$.studentId'), json_extract(value, '$.courseId'), ?2 FROM json_each(?1) WHERE true
    ON CONFLICT DO NOTHING`, plan.enrol, now);
  await writeWith(`INSERT INTO pending_enrolments (id, email, "courseId", "batchId", "createdAt")
    SELECT json_extract(value, '$.id'), json_extract(value, '$.email'), json_extract(value, '$.courseId'), NULL, ?2 FROM json_each(?1) WHERE true
    ON CONFLICT DO NOTHING`, plan.pending, now);
  await writeWith(`INSERT INTO courses (id, code, name, description, credits, department, status, "teacherId", "createdAt", "updatedAt")
    SELECT json_extract(value, '$.id'), json_extract(value, '$.code'), json_extract(value, '$.name'), json_extract(value, '$.description'), json_extract(value, '$.credits'),
           json_extract(value, '$.department'), json_extract(value, '$.status'), json_extract(value, '$.teacherId'), ?2, ?2 FROM json_each(?1) WHERE true
    ON CONFLICT DO NOTHING`, plan.courses, now);
  // Changed courses: each field only where the file gave one.
  const field = (f: string) => `COALESCE((SELECT json_extract(value, '$.${f}') FROM json_each(?1) WHERE json_extract(value, '$.id') = courses.id), ${f === 'teacherId' ? '"teacherId"' : f})`;
  await writeWith(`UPDATE courses SET name = ${field('name')}, "teacherId" = ${field('teacherId')}, credits = ${field('credits')}, department = ${field('department')},
    description = ${field('description')}, status = ${field('status')}, "updatedAt" = ?2 WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?1))`,
    plan.courseUpdates.map((x) => ({ id: x.id, name: x.name, teacherId: x.teacherId, credits: x.credits, department: x.department, description: x.description, status: x.status })), now);
  await writeWith(`INSERT INTO timetable_slots (id, "courseId", "dayOfWeek", "startTime", "endTime", "roomId", type, "createdAt", "updatedAt")
    SELECT json_extract(value, '$.id'), json_extract(value, '$.courseId'), json_extract(value, '$.dayOfWeek'), json_extract(value, '$.startTime'), json_extract(value, '$.endTime'),
           json_extract(value, '$.roomId'), json_extract(value, '$.type'), ?2, ?2 FROM json_each(?1) WHERE true`, plan.slots, now);
  const undo: Undo = {
    invitations: plan.invites.map((i) => i.id), reinvites: plan.reinvites, enrollments: plan.enrol.map((e) => e.id), pending: plan.pending.map((p) => p.id),
    courses: plan.courses.map((c) => c.id), courseUpdates: plan.courseUpdates.map((u) => ({ id: u.id, before: u.before })), slots: plan.slots.map((s) => s.id),
  };
  const fileName = typeof b.fileName === 'string' ? b.fileName.slice(0, 120) : null;
  const batch = await prisma.importBatch.create({ data: { kind, fileName, rows: rows.length, summary: JSON.stringify(counts), undo: JSON.stringify(undo), createdById: user.id }, select: { id: true } });
  if (plan.pending.length) await writeWith(`UPDATE pending_enrolments SET "batchId" = ?2 WHERE id IN (SELECT value FROM json_each(?1))`, undo.pending, batch.id);
  return { id: batch.id, kind, counts };
}

/** GET /api/admin/import: the last imports, newest first, with whether they can still be undone. */
export async function importHistory(user: SessionUser) {
  await need(user, 'import.run');
  const rows = await prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, fileName: true, rows: true, summary: true, createdAt: true, undoneAt: true, createdBy: { select: { name: true } } } });
  const now = Date.now();
  return { batches: rows.map((r) => ({ ...r, summary: JSON.parse(r.summary) as Record<Action, number>, by: r.createdBy.name, createdBy: undefined, canUndo: !r.undoneAt && now - r.createdAt.getTime() < UNDO_DAYS * 86_400_000 })) };
}

/**
 * POST /api/admin/import/:id { action: 'undo' }: takes an import back. Invitations already used to
 * join, and courses that have been used since (materials, classes, grades, other students), stay.
 */
export async function undoImport(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'import.run');
  if (b.action !== 'undo') throw new BadRequestException('Unknown action.');
  const batch = await prisma.importBatch.findUnique({ where: { id }, select: { undo: true, undoneAt: true, createdAt: true } });
  if (!batch) throw new NotFoundException('That import doesn’t exist.');
  if (batch.undoneAt) throw new BadRequestException('This import was already undone.');
  if (Date.now() - batch.createdAt.getTime() > UNDO_DAYS * 86_400_000) throw new BadRequestException(`Imports can be undone for ${UNDO_DAYS} days.`);
  // Claimed first, so two clicks never undo twice.
  const claim = await prisma.importBatch.updateMany({ where: { id, undoneAt: null }, data: { undoneAt: new Date(), undoneById: user.id } });
  if (!claim.count) throw new BadRequestException('This import was already undone.');
  const u = JSON.parse(batch.undo) as Undo;
  const ids = `(SELECT value FROM json_each(?1))`;
  await writeWith(`DELETE FROM timetable_slots WHERE id IN ${ids}`, u.slots);
  await writeWith(`DELETE FROM enrollments WHERE id IN ${ids}`, u.enrollments);
  await writeWith(`DELETE FROM pending_enrolments WHERE id IN ${ids}`, u.pending);
  const invitesKept = (await readWith<{ n: number }>(`SELECT COUNT(*) AS n FROM invitations WHERE id IN ${ids} AND status != 'PENDING'`, u.invitations))[0]?.n ?? 0;
  await writeWith(`DELETE FROM invitations WHERE id IN ${ids} AND status = 'PENDING'`, u.invitations);
  await writeWith(`UPDATE invitations SET role = (SELECT json_extract(value, '$.before.role') FROM json_each(?1) WHERE json_extract(value, '$.email') = lower(invitations.email)),
    status = (SELECT json_extract(value, '$.before.status') FROM json_each(?1) WHERE json_extract(value, '$.email') = lower(invitations.email)),
    "expiresAt" = (SELECT json_extract(value, '$.before.expiresAt') FROM json_each(?1) WHERE json_extract(value, '$.email') = lower(invitations.email))
    WHERE status = 'PENDING' AND lower(email) IN (SELECT json_extract(value, '$.email') FROM json_each(?1))`, u.reinvites);
  const back = (f: string) => `(SELECT json_extract(value, '$.before.${f}') FROM json_each(?1) WHERE json_extract(value, '$.id') = courses.id)`;
  await writeWith(`UPDATE courses SET name = ${back('name')}, "teacherId" = ${back('teacherId')}, credits = ${back('credits')}, department = ${back('department')},
    description = ${back('description')}, status = ${back('status')} WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?1))`, u.courseUpdates);
  // New courses go unless something now hangs on them.
  const used = (await readWith<{ id: string }>(`SELECT id FROM courses c WHERE id IN ${ids} AND (
      EXISTS (SELECT 1 FROM enrollments WHERE "courseId" = c.id) OR EXISTS (SELECT 1 FROM materials WHERE "courseId" = c.id)
      OR EXISTS (SELECT 1 FROM assignments WHERE "courseId" = c.id) OR EXISTS (SELECT 1 FROM quizzes WHERE "courseId" = c.id)
      OR EXISTS (SELECT 1 FROM class_sessions WHERE "courseId" = c.id) OR EXISTS (SELECT 1 FROM attendance WHERE "courseId" = c.id)
      OR EXISTS (SELECT 1 FROM grades WHERE "courseId" = c.id) OR EXISTS (SELECT 1 FROM announcements WHERE "courseId" = c.id)
      OR EXISTS (SELECT 1 FROM timetable_slots WHERE "courseId" = c.id))`, u.courses)).map((x) => x.id);
  await writeWith(`DELETE FROM courses WHERE id IN ${ids}`, u.courses.filter((c) => !used.includes(c)));
  return { undone: true, kept: { invitations: Number(invitesKept), courses: used.length } };
}

/** When someone invited by an import joins: the classes waiting for them become real enrolments. */
export async function applyPendingEnrolments(userId: string, email: string) {
  const e = email.trim().toLowerCase();
  await prisma.$executeRawUnsafe(`INSERT INTO enrollments (id, "studentId", "courseId", "enrolledAt") SELECT lower(hex(randomblob(12))), ?, "courseId", ? FROM pending_enrolments WHERE lower(email) = ? ON CONFLICT DO NOTHING`, userId, dbDate(), e);
  await prisma.$executeRawUnsafe(`DELETE FROM pending_enrolments WHERE lower(email) = ?`, e);
}

// ── Export ──────────────────────────────────────────────────────────────────────────────────

export const EXPORTS = ['students', 'teachers', 'courses', 'enrolments', 'timetable'] as const;

/** GET /api/admin/import/export?kind=: a CSV with the same headers the import reads. */
export async function exportCsv(user: SessionUser, kind: string | null) {
  await need(user, 'export.run');
  const q = <T,>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);
  switch (kind) {
    case 'students':
    case 'teachers': {
      const role = kind === 'students' ? 'STUDENT' : 'TEACHER';
      const rows = await q<{ name: string; email: string; status: string; joined: string; courses: string | null }>(
        `SELECT u.name, u.email, u.status, substr(u."createdAt", 1, 10) AS joined,
                ${role === 'STUDENT'
                  ? `(SELECT group_concat(c.code, ';') FROM enrollments e JOIN courses c ON c.id = e."courseId" WHERE e."studentId" = u.id)`
                  : `(SELECT group_concat(c.code, ';') FROM courses c WHERE c."teacherId" = u.id)`} AS courses
         FROM users u WHERE u.role = '${role}' ORDER BY u.name LIMIT 20000`);
      return toCsv(['Email', 'Name', 'Role', 'Courses', 'Status', 'Joined'], rows.map((r) => [r.email, r.name, role.toLowerCase(), r.courses ?? '', r.status.toLowerCase(), r.joined]));
    }
    case 'courses': {
      const rows = await q<{ code: string; name: string; teacher: string | null; credits: number; department: string | null; status: string; description: string | null; students: number }>(
        `SELECT c.code, c.name, t.email AS teacher, c.credits, c.department, c.status, c.description, (SELECT COUNT(*) FROM enrollments e WHERE e."courseId" = c.id) AS students
         FROM courses c LEFT JOIN users t ON t.id = c."teacherId" ORDER BY c.code LIMIT 5000`);
      return toCsv(['Code', 'Name', 'Teacher', 'Credits', 'Department', 'Status', 'Description', 'Students'], rows.map((r) => [r.code, r.name, r.teacher ?? '', r.credits, r.department ?? '', r.status.toLowerCase(), r.description ?? '', Number(r.students)]));
    }
    case 'enrolments': {
      const rows = await q<{ email: string; name: string; code: string; at: string }>(
        `SELECT u.email, u.name, c.code, substr(e."enrolledAt", 1, 10) AS at FROM enrollments e JOIN users u ON u.id = e."studentId" JOIN courses c ON c.id = e."courseId" ORDER BY c.code, u.name LIMIT 50000`);
      return toCsv(['Email', 'Course', 'Name', 'Enrolled'], rows.map((r) => [r.email, r.code, r.name, r.at]));
    }
    case 'timetable': {
      const rows = await q<{ code: string; day: number; start: string; end: string; room: string | null; type: string }>(
        `SELECT c.code, s."dayOfWeek" AS day, s."startTime" AS start, s."endTime" AS "end", r.name AS room, s.type FROM timetable_slots s JOIN courses c ON c.id = s."courseId" LEFT JOIN rooms r ON r.id = s."roomId" ORDER BY s."dayOfWeek", s."startTime", c.code LIMIT 10000`);
      return toCsv(['Course', 'Day', 'Start', 'End', 'Room', 'Type'], rows.map((r) => [r.code, DAY_NAMES[r.day] ?? '', r.start, r.end, r.room ?? '', r.type.toLowerCase()]));
    }
    default: throw new BadRequestException('Choose what to export.');
  }
}
