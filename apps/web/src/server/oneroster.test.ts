import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  parseOneRosterCsvTable,
  parseOneRosterBundle,
  previewOneRosterSync,
  executeOneRosterSync,
  getOneRosterOrgs,
  getOneRosterCourses,
  getOneRosterUsers,
  getOneRosterEnrollments,
} from './oneroster';

vi.mock('@/lib/db', () => ({
  default: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    enrollment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    oneRosterMapping: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    oneRosterSync: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('OneRoster 1.2 SIS Integration', () => {
  const actor: SessionUser = {
    id: 'admin-1',
    role: 'ADMIN',
    email: 'admin@school.edu',
    name: 'Admin User',
  } as unknown as SessionUser;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseOneRosterCsvTable', () => {
    it('parses CSV table with headers and quotes', () => {
      const csv = 'sourcedId,givenName,familyName,email\nu1,"Grace","Hopper",grace@navy.mil\nu2,Alan,Turing,alan@bletchley.uk';
      const parsed = parseOneRosterCsvTable<{ sourcedId: string; givenName: string; email: string }>(csv);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].sourcedId).toBe('u1');
      expect(parsed[0].givenName).toBe('Grace');
      expect(parsed[0].email).toBe('grace@navy.mil');
      expect(parsed[1].sourcedId).toBe('u2');
      expect(parsed[1].email).toBe('alan@bletchley.uk');
    });

    it('returns empty array on empty string or header-only', () => {
      expect(parseOneRosterCsvTable('')).toEqual([]);
      expect(parseOneRosterCsvTable('sourcedId,email')).toEqual([]);
    });
  });

  describe('parseOneRosterBundle', () => {
    it('extracts users, courses, classes, and enrollments from file map', () => {
      const files = {
        'users.csv': 'sourcedId,email,role,givenName,familyName\ns1,student@school.edu,student,John,Doe',
        'classes.csv': 'sourcedId,title,classCode,courseSourcedId\nc1,Calculus I,MATH101,course1',
        'enrollments.csv': 'sourcedId,classSourcedId,userSourcedId,role\ne1,c1,s1,student',
      };

      const payload = parseOneRosterBundle(files);
      expect(payload.users).toHaveLength(1);
      expect(payload.users?.[0].email).toBe('student@school.edu');
      expect(payload.users?.[0].role).toBe('student');

      expect(payload.classes).toHaveLength(1);
      expect(payload.classes?.[0].classCode).toBe('MATH101');

      expect(payload.enrollments).toHaveLength(1);
      expect(payload.enrollments?.[0].userSourcedId).toBe('s1');
    });
  });

  describe('previewOneRosterSync', () => {
    it('distinguishes between new and existing users/courses', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: 'existing-1', email: 'existing@school.edu', name: 'Existing', role: 'STUDENT' } as never,
      ]);
      vi.mocked(prisma.oneRosterMapping.findMany)
        .mockResolvedValueOnce([]) // users mapping
        .mockResolvedValueOnce([]); // courses mapping
      vi.mocked(prisma.course.findMany).mockResolvedValueOnce([]);

      const payload = {
        users: [
          { sourcedId: 'u1', email: 'existing@school.edu', role: 'student' as const, givenName: 'Existing' },
          { sourcedId: 'u2', email: 'new@school.edu', role: 'student' as const, givenName: 'New' },
        ],
        classes: [
          { sourcedId: 'c1', title: 'Biology', classCode: 'BIO101', courseSourcedId: 'c1' },
        ],
        enrollments: [
          { sourcedId: 'e1', classSourcedId: 'c1', userSourcedId: 'u1', role: 'student' as const },
        ],
      };

      const res = await previewOneRosterSync('org-1', payload);
      expect(res.counts.usersTotal).toBe(2);
      expect(res.counts.usersExisting).toBe(1);
      expect(res.counts.usersToCreate).toBe(1);
      expect(res.counts.coursesToCreate).toBe(1);
      expect(res.counts.enrollmentsToCreate).toBe(1);
      expect(res.warnings).toHaveLength(0);
    });

    it('emits warnings for dangling enrollment references', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.oneRosterMapping.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      vi.mocked(prisma.course.findMany).mockResolvedValueOnce([]);

      const payload = {
        users: [{ sourcedId: 'u1', email: 'user@school.edu', role: 'student' as const }],
        classes: [{ sourcedId: 'c1', title: 'History', classCode: 'HIST1', courseSourcedId: 'c1' }],
        enrollments: [
          { sourcedId: 'e1', classSourcedId: 'UNKNOWN_CLASS', userSourcedId: 'u1', role: 'student' as const },
        ],
      };

      const res = await previewOneRosterSync('org-1', payload);
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(res.warnings[0]).toContain('unknown class UNKNOWN_CLASS');
    });
  });

  describe('executeOneRosterSync', () => {
    it('creates missing records, upserts mappings, and logs sync', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: 'teacher-1' } as never);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]); // no existing user
      vi.mocked(prisma.user.create).mockResolvedValueOnce({ id: 'created-student' } as never);
      vi.mocked(prisma.course.findMany).mockResolvedValueOnce([]); // no existing course
      vi.mocked(prisma.course.create).mockResolvedValueOnce({ id: 'created-course' } as never);
      vi.mocked(prisma.enrollment.findUnique).mockResolvedValueOnce(null); // not enrolled yet
      vi.mocked(prisma.enrollment.create).mockResolvedValueOnce({ id: 'enr-1' } as never);
      vi.mocked(prisma.oneRosterSync.create).mockResolvedValueOnce({ id: 'sync-1' } as never);

      const payload = {
        users: [{ sourcedId: 'u1', email: 'learner@school.edu', role: 'student' as const, givenName: 'Ada' }],
        classes: [{ sourcedId: 'c1', title: 'Physics', classCode: 'PHYS101', courseSourcedId: 'c1' }],
        enrollments: [{ sourcedId: 'e1', classSourcedId: 'c1', userSourcedId: 'u1', role: 'student' as const }],
      };

      const res = await executeOneRosterSync('org-1', actor, payload);
      expect(res.status).toBe('SUCCESS');
      expect(res.counts.users).toBe(1);
      expect(res.counts.classes).toBe(1);
      expect(res.counts.enrollments).toBe(1);
      expect(prisma.oneRosterSync.create).toHaveBeenCalled();
    });
  });

  describe('1EdTech Outbound REST Endpoints', () => {
    it('returns formatted OneRoster orgs', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        id: 'org-1',
        name: 'Riverside High',
        slug: 'riverside',
        updatedAt: new Date('2026-10-01T00:00:00Z'),
      } as never);

      const res = await getOneRosterOrgs('org-1');
      expect(res.orgs).toHaveLength(1);
      expect(res.orgs[0].name).toBe('Riverside High');
      expect(res.orgs[0].type).toBe('school');
    });

    it('returns formatted OneRoster courses', async () => {
      vi.mocked(prisma.course.findMany).mockResolvedValueOnce([
        { id: 'crs-1', code: 'CS101', name: 'Intro CS', credits: 3, updatedAt: new Date('2026-10-01T00:00:00Z') } as never,
      ]);

      const res = await getOneRosterCourses('org-1');
      expect(res.courses).toHaveLength(1);
      expect(res.courses[0].courseCode).toBe('CS101');
      expect(res.courses[0].title).toBe('Intro CS');
    });

    it('returns formatted OneRoster users', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: 'usr-1', name: 'Marie Curie', email: 'curie@rad.fr', role: 'TEACHER', status: 'ACTIVE', updatedAt: new Date('2026-10-01T00:00:00Z') } as never,
      ]);

      const res = await getOneRosterUsers('org-1');
      expect(res.users).toHaveLength(1);
      expect(res.users[0].role).toBe('teacher');
      expect(res.users[0].email).toBe('curie@rad.fr');
    });

    it('returns formatted OneRoster enrollments', async () => {
      vi.mocked(prisma.enrollment.findMany).mockResolvedValueOnce([
        { id: 'enr-1', studentId: 'usr-1', courseId: 'crs-1', enrolledAt: new Date('2026-10-01T00:00:00Z') } as never,
      ]);

      const res = await getOneRosterEnrollments('org-1');
      expect(res.enrollments).toHaveLength(1);
      expect(res.enrollments[0].userSourcedId).toBe('usr-1');
      expect(res.enrollments[0].classSourcedId).toBe('crs-1');
    });
  });
});
