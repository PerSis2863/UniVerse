import prisma from '@/lib/db';
import { parseCsv } from '@/lib/csv';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException } from './http';

// Stage 5 · C3: OneRoster 1.2 SIS Integration (1EdTech / IMS Global Standard).
// Enables universities and schools to sync student rosters, courses, and class enrollments
// from Student Information Systems (PowerSchool, Infinite Campus, Skyward, etc.).

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
  action: 'create' | 'match' | 'enrol' | 'skip';
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

// ── Preview Sync ─────────────────────────────────────────────────────────────

export async function previewOneRosterSync(
  orgId: string | null,
  payload: OneRosterPayload,
): Promise<OneRosterPreviewResult> {
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

  // 1. Check existing users
  const userEmails = users.map((u) => u.email).filter(Boolean);
  const existingUsers = userEmails.length > 0
    ? await prisma.user.findMany({
        where: { email: { in: userEmails } },
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
    const isExisting = existingEmailMap.has(u.email) || userMappingMap.has(u.sourcedId);
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

  // 2. Check existing courses / classes
  const classCodes = classes.map((c) => c.classCode || c.sourcedId);
  const existingCourses = classCodes.length > 0
    ? await prisma.course.findMany({
        where: { code: { in: classCodes } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const existingCourseMap = new Map(existingCourses.map((c) => [c.code.toUpperCase(), c]));

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

  for (const c of classes) {
    const code = (c.classCode || c.sourcedId).toUpperCase();
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

  const summary = `OneRoster preview: ${usersToCreate} new users, ${usersExisting} matched users; ${coursesToCreate} new courses, ${coursesExisting} matched courses; ${enrollmentsToCreate} roster memberships.`;

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

  // Fallback default teacher (actor or first faculty)
  let defaultTeacherId = actor.id;
  const firstTeacher = await prisma.user.findFirst({
    where: { role: 'TEACHER', ...(orgId ? { organizationId: orgId } : {}) },
    select: { id: true },
  });
  if (firstTeacher) defaultTeacherId = firstTeacher.id;

  // 1. Process Users (chunked in groups of 30)
  const userMap = new Map<string, string>(); // sourcedId -> userId

  for (let i = 0; i < users.length; i += 30) {
    const batch = users.slice(i, i + 30);
    const emails = batch.map((u) => u.email);

    const existingInDb = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const emailToId = new Map(existingInDb.map((u) => [u.email.toLowerCase(), u.id]));

    for (const u of batch) {
      const emailLower = u.email.toLowerCase();
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
  const classMap = new Map<string, string>(); // sourcedId -> courseId

  for (let i = 0; i < classes.length; i += 30) {
    const batch = classes.slice(i, i + 30);
    const codes = batch.map((c) => (c.classCode || c.sourcedId).toUpperCase());

    const existingCourses = await prisma.course.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const codeToId = new Map(existingCourses.map((c) => [c.code.toUpperCase(), c.id]));

    for (const c of batch) {
      const code = (c.classCode || c.sourcedId).toUpperCase();
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

  // 3. Process Enrollments (chunked in groups of 30)
  let enrolledCount = 0;

  for (let i = 0; i < enrollments.length; i += 30) {
    const batch = enrollments.slice(i, i + 30);

    for (const e of batch) {
      const userId = userMap.get(e.userSourcedId);
      const courseId = classMap.get(e.classSourcedId);

      if (!userId || !courseId) continue;

      if (e.role === 'teacher') {
        // Assign as course teacher
        await prisma.course.update({
          where: { id: courseId },
          data: { teacherId: userId },
        });
        enrolledCount++;
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

  const summary = `Successfully synchronized OneRoster SIS data: ${users.length} users, ${classes.length} courses/classes, ${enrolledCount} active memberships.`;

  // 4. Record OneRosterSync operation log
  const syncRecord = await prisma.oneRosterSync.create({
    data: {
      organizationId: orgId,
      syncType: 'CSV_BATCH',
      status: 'SUCCESS',
      summary,
      coursesCount: classes.length,
      classesCount: classes.length,
      usersCount: users.length,
      enrollmentsCount: enrolledCount,
      actorId: actor.id,
    },
  });

  return {
    syncId: syncRecord.id,
    status: 'SUCCESS',
    summary,
    counts: {
      users: users.length,
      classes: classes.length,
      enrollments: enrolledCount,
    },
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
