import prisma from '@/lib/db';
import { parseCsv } from '@/lib/csv';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, HttpException } from './http';
import { verifyApiKey, type ApiScope } from './public-api';
import { inSchools, schoolsOf, usersIn, type SchoolIds } from './school-scope';

// Stage 5 · C3: OneRoster 1.2 SIS Integration (1EdTech / IMS Global Standard).
// Enables universities and schools to sync student rosters, courses, and class enrollments
// from Student Information Systems (PowerSchool, Infinite Campus, Skyward, etc.).
// An admin syncs into their own school only (school-scope.ts): accounts are matched by email and
// courses by code only within the admin's schools (a course is its teacher's school). Another
// school's email or course code is left out with a reason, never matched, enrolled or given a new
// teacher; the preview doesn't look outside the school, so it can't tell whose an email is.

export interface OneRosterOrg {
  sourcedId: string;
  name: string;
  type?: string;
  identifier?: string;
}

export interface OneRosterAcademicSession {
  sourcedId: string;
  title: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  schoolYear?: string;
}

export interface OneRosterCourse {
  sourcedId: string;
  title: string;
  courseCode: string;
  grades?: string;
  orgSourcedId?: string;
}

export interface OneRosterClass {
  sourcedId: string;
  title: string;
  courseSourcedId: string;
  termSourcedIds?: string;
  classCode?: string;
}

export interface OneRosterUser {
  sourcedId: string;
  enabledUser?: string | boolean;
  role: 'student' | 'teacher' | 'administrator';
  username?: string;
  givenName?: string;
  familyName?: string;
  email: string;
  identifier?: string;
}

export interface OneRosterEnrollment {
  sourcedId: string;
  classSourcedId: string;
  userSourcedId: string;
  role: 'student' | 'teacher';
  primary?: string | boolean;
}

export interface OneRosterPayload {
  orgs?: OneRosterOrg[];
  academicSessions?: OneRosterAcademicSession[];
  courses?: OneRosterCourse[];
  classes?: OneRosterClass[];
  users?: OneRosterUser[];
  enrollments?: OneRosterEnrollment[];
}

export interface OneRosterPreviewItem {
  type: 'USER' | 'COURSE' | 'ENROLLMENT';
  sourcedId: string;
  label: string;
  action: 'create' | 'match' | 'enrol' | 'skip' | 'error';
  detail: string;
}

export interface OneRosterPreviewResult {
  valid: boolean;
  summary: string;
  counts: {
    usersTotal: number;
    usersToCreate: number;
    usersExisting: number;
    coursesTotal: number;
    coursesToCreate: number;
    coursesExisting: number;
    enrollmentsTotal: number;
    enrollmentsToCreate: number;
    enrollmentsExisting: number;
  };
  warnings: string[];
  items: OneRosterPreviewItem[];
}

// ── Parsing CSV Tables ─────────────────────────────────────────────────────────

export function parseOneRosterCsvTable<T = Record<string, string>>(csvText: string): T[] {
  if (!csvText || !csvText.trim()) return [];
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().replace(/^"|"$/g, ''));
  const results: T[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      const val = (row[j] ?? '').trim().replace(/^"|"$/g, '');
      obj[key] = val;
    }
    results.push(obj as unknown as T);
  }

  return results;
}

export function parseOneRosterBundle(files: Record<string, string>): OneRosterPayload {
  const payload: OneRosterPayload = {};

  for (const [rawName, content] of Object.entries(files)) {
    const filename = rawName.toLowerCase().replace(/\.[^/.]+$/, '').trim();

    if (filename.includes('user')) {
      const raw = parseOneRosterCsvTable<Record<string, string>>(content);
      payload.users = raw.map((r) => ({
        sourcedId: r.sourcedId || r.sourcedid || r.id || '',
        enabledUser: r.enabledUser || r.enableduser || 'true',
        role: normalizeOneRosterRole(r.role),
        username: r.username || r.email || '',
        givenName: r.givenName || r.givenname || r.firstName || '',
        familyName: r.familyName || r.familyname || r.lastName || '',
        email: (r.email || r.username || '').toLowerCase().trim(),
        identifier: r.identifier || '',
      })).filter((u) => !!u.sourcedId && !!u.email);
    } else if (filename.includes('course')) {
      const raw = parseOneRosterCsvTable<Record<string, string>>(content);
      payload.courses = raw.map((r) => ({
        sourcedId: r.sourcedId || r.sourcedid || r.id || '',
        title: r.title || r.name || 'Untitled Course',
        courseCode: (r.courseCode || r.coursecode || r.code || r.sourcedId || '').trim().toUpperCase(),
        grades: r.grades || '',
        orgSourcedId: r.orgSourcedId || r.orgsourcedid || '',
      })).filter((c) => !!c.sourcedId);
    } else if (filename.includes('class')) {
      const raw = parseOneRosterCsvTable<Record<string, string>>(content);
      payload.classes = raw.map((r) => ({
        sourcedId: r.sourcedId || r.sourcedid || r.id || '',
        title: r.title || r.name || 'Untitled Class',
        courseSourcedId: r.courseSourcedId || r.coursesourcedid || '',
        termSourcedIds: r.termSourcedIds || r.termsourcedids || '',
        classCode: (r.classCode || r.classcode || r.code || r.sourcedId || '').trim().toUpperCase(),
      })).filter((c) => !!c.sourcedId);
    } else if (filename.includes('enrollment')) {
      const raw = parseOneRosterCsvTable<Record<string, string>>(content);
      payload.enrollments = raw.map((r) => ({
        sourcedId: r.sourcedId || r.sourcedid || r.id || '',
        classSourcedId: r.classSourcedId || r.classsourcedid || '',
        userSourcedId: r.userSourcedId || r.usersourcedid || '',
        role: ((r.role || '').toLowerCase().includes('teach') ? 'teacher' : 'student') as 'teacher' | 'student',
        primary: r.primary || 'true',
      })).filter((e) => !!e.sourcedId && !!e.classSourcedId && !!e.userSourcedId);
    } else if (filename.includes('session')) {
      const raw = parseOneRosterCsvTable<Record<string, string>>(content);
      payload.academicSessions = raw.map((r) => ({
        sourcedId: r.sourcedId || r.sourcedid || r.id || '',
        title: r.title || r.name || '',
        type: r.type || 'term',
        startDate: r.startDate || r.startdate || '',
        endDate: r.endDate || r.enddate || '',
        schoolYear: r.schoolYear || r.schoolyear || '',
      })).filter((s) => !!s.sourcedId);
    } else if (filename.includes('org')) {
      const raw = parseOneRosterCsvTable<Record<string, string>>(content);
      payload.orgs = raw.map((r) => ({
        sourcedId: r.sourcedId || r.sourcedid || r.id || '',
        name: r.name || '',
        type: r.type || 'school',
        identifier: r.identifier || '',
      })).filter((o) => !!o.sourcedId);
    }
  }

  return payload;
}

function normalizeOneRosterRole(rawRole?: string): 'student' | 'teacher' | 'administrator' {
  const r = (rawRole ?? '').trim().toLowerCase();
  if (r.includes('teach') || r.includes('faculty') || r.includes('instructor')) return 'teacher';
  if (r.includes('admin') || r.includes('principal') || r.includes('staff')) return 'administrator';
  return 'student';
}

// ── The admin's school ────────────────────────────────────────────────────────

const OTHER_ACCOUNT = 'This email has an account outside your school: it’s left out.';
const takenMessage = (title: string, code: string) => `${title}: the code ${code} is taken, so it’s left out (give it another code in the SIS).`;

/** The schools the admin syncs into (school-scope.ts); the school synced into must be one of them. */
async function syncSchools(actor: SessionUser, orgId: string | null): Promise<SchoolIds | 'all'> {
  const schools = await schoolsOf(actor);
  if (!inSchools(schools, orgId)) throw new ForbiddenException('You can only sync into your own school.');
  return schools;
}

// ── Preview Sync ─────────────────────────────────────────────────────────────

export async function previewOneRosterSync(
  orgId: string | null,
  actor: SessionUser,
  payload: OneRosterPayload,
): Promise<OneRosterPreviewResult> {
  const schools = await syncSchools(actor, orgId);
  const warnings: string[] = [];
  const items: OneRosterPreviewItem[] = [];

  const users = payload.users ?? [];
  const classes = payload.classes ?? (payload.courses ?? []).map((c) => ({
    sourcedId: c.sourcedId,
    title: c.title,
    courseSourcedId: c.sourcedId,
    classCode: c.courseCode,
  }));
  const enrollments = payload.enrollments ?? [];

  if (users.length === 0 && classes.length === 0) {
    throw new BadRequestException('OneRoster archive contains no valid users or classes.');
  }

  // 1. Check existing users (the school's only: whether another school has an email isn't shown)
  const userEmails = users.map((u) => u.email).filter(Boolean);
  const existingUsers = userEmails.length > 0
    ? await prisma.user.findMany({
        where: { email: { in: userEmails }, ...usersIn(schools) },
        select: { id: true, email: true, name: true, role: true },
      })
    : [];

  const existingEmailMap = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));

  // Also check existing OneRoster user mappings
  const userSourcedIds = users.map((u) => u.sourcedId);
  const existingUserMappings = userSourcedIds.length > 0
    ? await prisma.oneRosterMapping.findMany({
        where: {
          entityType: 'USER',
          sourcedId: { in: userSourcedIds },
          ...(orgId ? { organizationId: orgId } : {}),
        },
        select: { sourcedId: true, targetId: true },
      })
    : [];
  const userMappingMap = new Map(existingUserMappings.map((m) => [m.sourcedId, m.targetId]));

  let usersToCreate = 0;
  let usersExisting = 0;

  for (const u of users) {
    // Matched by email, as the sync does (an earlier sync's mapping alone isn't a match).
    const isExisting = existingEmailMap.has(u.email);
    if (isExisting) {
      usersExisting++;
      items.push({
        type: 'USER',
        sourcedId: u.sourcedId,
        label: `${u.givenName} ${u.familyName}`.trim() || u.email,
        action: 'match',
        detail: `Matches existing account (${u.email})`,
      });
    } else {
      usersToCreate++;
      items.push({
        type: 'USER',
        sourcedId: u.sourcedId,
        label: `${u.givenName} ${u.familyName}`.trim() || u.email,
        action: 'create',
        detail: `New ${u.role} account to provision (${u.email})`,
      });
    }
  }

  // 2. Check existing courses / classes (another school's code is taken: like bulk import)
  const classCodes = classes.map((c) => (c.classCode || c.sourcedId).toUpperCase());
  const existingCourses = classCodes.length > 0
    ? await prisma.course.findMany({
        where: { code: { in: classCodes } },
        select: { id: true, code: true, name: true, teacher: { select: { organizationId: true } } },
      })
    : [];
  const existingCourseMap = new Map(existingCourses.filter((c) => inSchools(schools, c.teacher?.organizationId)).map((c) => [c.code.toUpperCase(), c]));
  const takenCodes = new Set(existingCourses.filter((c) => !inSchools(schools, c.teacher?.organizationId)).map((c) => c.code.toUpperCase()));

  const classSourcedIds = classes.map((c) => c.sourcedId);
  const existingClassMappings = classSourcedIds.length > 0
    ? await prisma.oneRosterMapping.findMany({
        where: {
          entityType: 'CLASS',
          sourcedId: { in: classSourcedIds },
          ...(orgId ? { organizationId: orgId } : {}),
        },
        select: { sourcedId: true, targetId: true },
      })
    : [];
  const classMappingMap = new Map(existingClassMappings.map((m) => [m.sourcedId, m.targetId]));

  let coursesToCreate = 0;
  let coursesExisting = 0;

  const leftOutClasses = new Set<string>();
  for (const c of classes) {
    const code = (c.classCode || c.sourcedId).toUpperCase();
    if (takenCodes.has(code)) {
      leftOutClasses.add(c.sourcedId);
      warnings.push(takenMessage(c.title, code));
      items.push({ type: 'COURSE', sourcedId: c.sourcedId, label: c.title, action: 'error', detail: takenMessage(c.title, code) });
      continue;
    }
    const isExisting = existingCourseMap.has(code) || classMappingMap.has(c.sourcedId);
    if (isExisting) {
      coursesExisting++;
      items.push({
        type: 'COURSE',
        sourcedId: c.sourcedId,
        label: c.title,
        action: 'match',
        detail: `Matches existing course [${code}]`,
      });
    } else {
      coursesToCreate++;
      items.push({
        type: 'COURSE',
        sourcedId: c.sourcedId,
        label: c.title,
        action: 'create',
        detail: `New academic course to register [${code}]`,
      });
    }
  }

  // 3. Check enrollments
  let enrollmentsToCreate = 0;
  const enrollmentsExisting = 0;

  const validClassSourcedIds = new Set(classes.map((c) => c.sourcedId));
  const validUserSourcedIds = new Set(users.map((u) => u.sourcedId));

  for (const e of enrollments) {
    if (!validClassSourcedIds.has(e.classSourcedId)) {
      warnings.push(`Enrollment ${e.sourcedId} references unknown class ${e.classSourcedId}`);
      continue;
    }
    // Its class is left out (see its notice).
    if (leftOutClasses.has(e.classSourcedId)) continue;
    if (!validUserSourcedIds.has(e.userSourcedId) && !userMappingMap.has(e.userSourcedId)) {
      warnings.push(`Enrollment ${e.sourcedId} references unknown user ${e.userSourcedId}`);
      continue;
    }

    enrollmentsToCreate++;
    items.push({
      type: 'ENROLLMENT',
      sourcedId: e.sourcedId,
      label: `Enrollment: ${e.userSourcedId} → ${e.classSourcedId}`,
      action: 'enrol',
      detail: `Assign as ${e.role}`,
    });
  }

  const summary = `OneRoster preview: ${usersToCreate} new users, ${usersExisting} matched users; ${coursesToCreate} new courses, ${coursesExisting} matched courses${leftOutClasses.size ? `, ${leftOutClasses.size} left out (code taken)` : ''}; ${enrollmentsToCreate} roster memberships.`;

  return {
    valid: warnings.length < 50,
    summary,
    counts: {
      usersTotal: users.length,
      usersToCreate,
      usersExisting,
      coursesTotal: classes.length,
      coursesToCreate,
      coursesExisting,
      enrollmentsTotal: enrollments.length,
      enrollmentsToCreate,
      enrollmentsExisting,
    },
    warnings: warnings.slice(0, 10),
    items: items.slice(0, 100),
  };
}

// ── Execute Sync ─────────────────────────────────────────────────────────────

export async function executeOneRosterSync(
  orgId: string | null,
  actor: SessionUser,
  payload: OneRosterPayload,
) {
  const users = payload.users ?? [];
  const classes = payload.classes ?? (payload.courses ?? []).map((c) => ({
    sourcedId: c.sourcedId,
    title: c.title,
    courseSourcedId: c.sourcedId,
    classCode: c.courseCode,
  }));
  const enrollments = payload.enrollments ?? [];

  if (users.length === 0 && classes.length === 0) {
    throw new BadRequestException('OneRoster archive contains no data to sync.');
  }

  const schools = await syncSchools(actor, orgId);
  // Rows left out, with why (another school's email or course code).
  const leftOut: { type: 'USER' | 'COURSE' | 'ENROLLMENT'; sourcedId: string; label: string; message: string }[] = [];

  // Fallback default teacher (actor or first faculty of the school)
  let defaultTeacherId = actor.id;
  const firstTeacher = await prisma.user.findFirst({
    where: { role: 'TEACHER', ...(orgId ? { organizationId: orgId } : usersIn(schools)) },
    select: { id: true },
  });
  if (firstTeacher) defaultTeacherId = firstTeacher.id;

  // 1. Process Users (chunked in groups of 30)
  const userMap = new Map<string, string>(); // sourcedId -> userId: only the school's people (matched in it, or made in it)

  for (let i = 0; i < users.length; i += 30) {
    const batch = users.slice(i, i + 30);
    const emails = batch.map((u) => u.email);

    // Every school's, so another school's account is left out rather than matched (or made twice).
    const existingInDb = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, organizationId: true },
    });
    const emailToId = new Map(existingInDb.filter((u) => inSchools(schools, u.organizationId)).map((u) => [u.email.toLowerCase(), u.id]));
    const elsewhere = new Set(existingInDb.filter((u) => !inSchools(schools, u.organizationId)).map((u) => u.email.toLowerCase()));

    for (const u of batch) {
      const emailLower = u.email.toLowerCase();
      if (elsewhere.has(emailLower)) {
        leftOut.push({ type: 'USER', sourcedId: u.sourcedId, label: emailLower, message: OTHER_ACCOUNT });
        continue;
      }
      let userId = emailToId.get(emailLower);

      if (!userId) {
        const role = u.role === 'teacher' ? 'TEACHER' : u.role === 'administrator' ? 'ADMIN' : 'STUDENT';
        const name = `${u.givenName || ''} ${u.familyName || ''}`.trim() || u.username || emailLower.split('@')[0];

        const created = await prisma.user.create({
          data: {
            email: emailLower,
            name,
            role,
            status: 'ACTIVE',
            onboardedAt: new Date(),
            organizationId: orgId,
          },
          select: { id: true },
        });
        userId = created.id;
        emailToId.set(emailLower, userId);
      }

      userMap.set(u.sourcedId, userId);

      // Record / update mapping
      await prisma.oneRosterMapping.upsert({
        where: {
          organizationId_entityType_sourcedId: {
            organizationId: orgId ?? '',
            entityType: 'USER',
            sourcedId: u.sourcedId,
          },
        },
        create: {
          organizationId: orgId,
          entityType: 'USER',
          sourcedId: u.sourcedId,
          targetId: userId,
        },
        update: {
          targetId: userId,
        },
      });
    }
  }

  // 2. Process Courses / Classes (chunked in groups of 30)
  const classMap = new Map<string, string>(); // sourcedId -> courseId: only the school's courses

  for (let i = 0; i < classes.length; i += 30) {
    const batch = classes.slice(i, i + 30);
    const codes = batch.map((c) => (c.classCode || c.sourcedId).toUpperCase());

    // A course is its teacher's school: another school's code is taken (never matched or taken over).
    const existingCourses = await prisma.course.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, teacher: { select: { organizationId: true } } },
    });
    const codeToId = new Map(existingCourses.filter((c) => inSchools(schools, c.teacher?.organizationId)).map((c) => [c.code.toUpperCase(), c.id]));
    const taken = new Set(existingCourses.filter((c) => !inSchools(schools, c.teacher?.organizationId)).map((c) => c.code.toUpperCase()));

    for (const c of batch) {
      const code = (c.classCode || c.sourcedId).toUpperCase();
      if (taken.has(code)) {
        leftOut.push({ type: 'COURSE', sourcedId: c.sourcedId, label: c.title, message: takenMessage(c.title, code) });
        continue;
      }
      let courseId = codeToId.get(code);

      if (!courseId) {
        const created = await prisma.course.create({
          data: {
            code,
            name: c.title,
            credits: 3,
            status: 'PUBLISHED',
            teacherId: defaultTeacherId,
          },
          select: { id: true },
        });
        courseId = created.id;
        codeToId.set(code, courseId);
      }

      classMap.set(c.sourcedId, courseId);

      await prisma.oneRosterMapping.upsert({
        where: {
          organizationId_entityType_sourcedId: {
            organizationId: orgId ?? '',
            entityType: 'CLASS',
            sourcedId: c.sourcedId,
          },
        },
        create: {
          organizationId: orgId,
          entityType: 'CLASS',
          sourcedId: c.sourcedId,
          targetId: courseId,
        },
        update: {
          targetId: courseId,
        },
      });
    }
  }

  // 3. Process Enrollments (chunked in groups of 30). Both sides are the school's (userMap and
  // classMap hold nothing else); a left-out person or class leaves its enrolments out too.
  let enrolledCount = 0;

  for (let i = 0; i < enrollments.length; i += 30) {
    const batch = enrollments.slice(i, i + 30);

    for (const e of batch) {
      const userId = userMap.get(e.userSourcedId);
      const courseId = classMap.get(e.classSourcedId);

      if (!userId || !courseId) continue;

      if (e.role === 'teacher') {
        // Assign as course teacher: a school's person, and only on a course that's still the school's.
        const set = await prisma.course.updateMany({
          where: { id: courseId, ...(schools === 'all' ? {} : { teacher: usersIn(schools) }) },
          data: { teacherId: userId },
        });
        if (set.count) enrolledCount++;
        else leftOut.push({ type: 'ENROLLMENT', sourcedId: e.sourcedId, label: `${e.userSourcedId} → ${e.classSourcedId}`, message: 'The class isn’t your school’s: its teacher is left as they are.' });
      } else {
        // Enroll student
        const exists = await prisma.enrollment.findUnique({
          where: {
            studentId_courseId: {
              studentId: userId,
              courseId,
            },
          },
          select: { id: true },
        });

        if (!exists) {
          await prisma.enrollment.create({
            data: {
              studentId: userId,
              courseId,
            },
          });
          enrolledCount++;
        }
      }
    }
  }

  const people = users.length - leftOut.filter((x) => x.type === 'USER').length;
  const courses = classes.length - leftOut.filter((x) => x.type === 'COURSE').length;
  const summary = `Successfully synchronized OneRoster SIS data: ${people} users, ${courses} courses/classes, ${enrolledCount} active memberships.${leftOut.length ? ` ${leftOut.length} left out (an email or course code used outside your school).` : ''}`;

  // 4. Record OneRosterSync operation log
  const syncRecord = await prisma.oneRosterSync.create({
    data: {
      organizationId: orgId,
      syncType: 'CSV_BATCH',
      status: 'SUCCESS',
      summary,
      coursesCount: courses,
      classesCount: courses,
      usersCount: people,
      enrollmentsCount: enrolledCount,
      actorId: actor.id,
    },
  });

  return {
    syncId: syncRecord.id,
    status: 'SUCCESS',
    summary,
    counts: {
      users: people,
      classes: courses,
      enrollments: enrolledCount,
      leftOut: leftOut.length,
    },
    leftOut: leftOut.slice(0, 100),
  };
}

// ── Query Sync History ────────────────────────────────────────────────────────

export async function listOneRosterSyncHistory(orgId: string | null) {
  return prisma.oneRosterSync.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}

// ── Outbound OneRoster 1.2 REST Endpoints ─────────────────────────────────────

export async function getOneRosterOrgs(orgId: string | null) {
  const org = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId } })
    : null;

  return {
    orgs: [
      {
        sourcedId: org?.id ?? 'default-school',
        status: 'active',
        dateLastModified: (org?.updatedAt ?? new Date()).toISOString(),
        name: org?.name ?? 'UniVerse Academy',
        type: 'school',
        identifier: org?.slug ?? 'universe',
      },
    ],
  };
}

export async function getOneRosterCourses(orgId: string | null, limit = 100, offset = 0) {
  const courses = await prisma.course.findMany({
    where: orgId ? { teacher: { organizationId: orgId } } : {},
    take: Math.min(limit, 100),
    skip: offset,
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, credits: true, updatedAt: true },
  });

  return {
    courses: courses.map((c) => ({
      sourcedId: c.id,
      status: 'active',
      dateLastModified: c.updatedAt.toISOString(),
      title: c.name,
      courseCode: c.code,
      grades: ['Higher Education'],
      orgSourcedId: orgId ?? 'default-school',
    })),
  };
}

export async function getOneRosterClasses(orgId: string | null, limit = 100, offset = 0) {
  const courses = await prisma.course.findMany({
    where: orgId ? { teacher: { organizationId: orgId } } : {},
    take: Math.min(limit, 100),
    skip: offset,
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, updatedAt: true },
  });

  return {
    classes: courses.map((c) => ({
      sourcedId: c.id,
      status: 'active',
      dateLastModified: c.updatedAt.toISOString(),
      title: c.name,
      classCode: c.code,
      classType: 'scheduled',
      courseSourcedId: c.id,
    })),
  };
}

export async function getOneRosterUsers(orgId: string | null, role?: string, limit = 100, offset = 0) {
  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  if (role) {
    const r = role.toUpperCase();
    if (['STUDENT', 'TEACHER', 'ADMIN'].includes(r)) where.role = r;
  }

  const users = await prisma.user.findMany({
    where,
    take: Math.min(limit, 100),
    skip: offset,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, status: true, updatedAt: true },
  });

  return {
    users: users.map((u) => {
      const parts = u.name.split(' ');
      return {
        sourcedId: u.id,
        status: u.status === 'ACTIVE' ? 'active' : 'tobedeleted',
        dateLastModified: u.updatedAt.toISOString(),
        enabledUser: u.status === 'ACTIVE',
        username: u.email,
        givenName: parts[0] || u.name,
        familyName: parts.slice(1).join(' ') || '',
        role: u.role === 'TEACHER' ? 'teacher' : u.role === 'ADMIN' ? 'administrator' : 'student',
        email: u.email,
      };
    }),
  };
}

export async function getOneRosterEnrollments(orgId: string | null, limit = 100, offset = 0) {
  const enrollments = await prisma.enrollment.findMany({
    where: orgId ? { student: { organizationId: orgId } } : {},
    take: Math.min(limit, 100),
    skip: offset,
    orderBy: { enrolledAt: 'desc' },
    select: { id: true, studentId: true, courseId: true, enrolledAt: true },
  });

  return {
    enrollments: enrollments.map((e) => ({
      sourcedId: e.id,
      status: 'active',
      dateLastModified: e.enrolledAt.toISOString(),
      classSourcedId: e.courseId,
      schoolSourcedId: orgId ?? 'default-school',
      userSourcedId: e.studentId,
      role: 'student',
      primary: true,
    })),
  };
}

/**
 * Answers a OneRoster read (GET /api/oneroster/v1p2/*). Every one needs a school's API key (Admin →
 * Integrations → Developer, "Bearer uv_live_…") with `scope`, and gives that school's data only.
 * They used to answer anyone, so anybody could list every account's name, email and role.
 */
export async function oneRosterGet(
  req: Request,
  scope: ApiScope,
  read: (org: string | null, page: { limit: number; offset: number }, url: URL) => Promise<unknown>,
): Promise<Response> {
  try {
    const auth = await verifyApiKey(req.headers.get('authorization'), scope);
    const url = new URL(req.url);
    const whole = (key: string, fallback: number, max: number) => {
      const v = Math.floor(Number(url.searchParams.get(key) ?? fallback));
      return Number.isFinite(v) && v >= 0 ? Math.min(v, max) : fallback;
    };
    const data = await read(auth.organization?.id ?? null, { limit: Math.max(1, whole('limit', 100, 100)), offset: whole('offset', 0, 1_000_000) }, url);
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof HttpException) return Response.json({ error: e.message }, { status: e.getStatus(), headers: { 'Cache-Control': 'no-store' } });
    throw e;
  }
}
