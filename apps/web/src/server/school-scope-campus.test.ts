import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { exportCsv, previewImport, runImport, undoImport } from './bulk-import';
import { assignByDomain, setExchange, setPersonCampus, updateCampus } from './campus-network';

// Bulk import and the campus network touch only the admin's own school's people (security fix,
// school-scope.ts): another school's accounts are never enrolled, moved or exported.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), update: vi.fn() },
    campus: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    importBatch: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    studentProfile: { upsert: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn(async () => 0) } }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>> & { $queryRawUnsafe: Fn; $executeRawUnsafe: Fn };
// A fresh object each time: schoolsOf remembers its answer per user object.
const adminA = () => ({ id: 'a1', name: 'Admin A', role: 'ADMIN', organizationId: 'orgA', email: 'a@a.test' }) as SessionUser;
const owner = () => ({ id: 'o1', name: 'Owner', role: 'ADMIN', organizationId: null, owner: true, email: 'o@o.test' }) as SessionUser;

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
  db.$executeRawUnsafe.mockResolvedValue(1);
});

describe('bulk import, for one school', () => {
  // a2 is school A's student, b1 is school B's; CS1 is a school A course.
  beforeEach(() => {
    db.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (/FROM users WHERE lower\(email\)/.test(sql)) return [
        { id: 'a2', email: 'a2@a.test', role: 'STUDENT', name: 'Amy', org: 'orgA' },
        { id: 'b1', email: 'b1@b.test', role: 'STUDENT', name: 'Ben', org: 'orgB' },
      ];
      if (/FROM courses c LEFT JOIN users t/.test(sql)) return [{ id: 'c1', code: 'CS1', name: 'Code', teacherId: 't1', credits: 3, department: null, description: null, status: 'PUBLISHED', org: 'orgA' }];
      return [];
    });
    db.importBatch.create.mockResolvedValue({ id: 'batch1' });
  });
  const rows = [{ email: 'a2@a.test', role: 'student', courses: 'CS1' }, { email: 'b1@b.test', role: 'student', courses: 'CS1' }];

  it('says another school’s account is left alone', async () => {
    const out = await previewImport(adminA(), { kind: 'people', rows });
    expect(out.results.map((r) => r.action)).toEqual(['enrol', 'error']);
    expect(out.results[1].message).toMatch(/outside your school/);
  });

  it('never enrols or changes another school’s user', async () => {
    await runImport(adminA(), { kind: 'people', rows });
    const writes = db.$executeRawUnsafe.mock.calls;
    const enrol = writes.find(([sql]) => String(sql).includes('INSERT INTO enrollments'));
    expect(JSON.parse(enrol![1] as string).map((e: { studentId: string }) => e.studentId)).toEqual(['a2']);
    for (const call of writes) expect(JSON.stringify(call)).not.toContain('b1');
  });

  it('doesn’t match another school’s course by its code', async () => {
    db.$queryRawUnsafe.mockImplementation(async (sql: string) =>
      /FROM courses c LEFT JOIN users t/.test(sql) ? [{ id: 'c9', code: 'CS9', name: 'Other', teacherId: 't9', credits: 3, department: null, description: null, status: 'PUBLISHED', org: 'orgB' }] : []);
    const out = await previewImport(adminA(), { kind: 'enrolments', rows: [{ email: 'new@a.test', course: 'CS9' }] });
    expect(out.results[0].message).toMatch(/No course with code CS9/);
  });

  it('exports only the admin’s school', async () => {
    db.$queryRawUnsafe.mockResolvedValue([]);
    await exportCsv(adminA(), 'students');
    const [sql, ...args] = db.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('u.organizationId IN (?)');
    expect(sql).not.toContain('IS NULL');
    expect(args).toEqual(['orgA']);
  });

  it('can’t undo another school’s import (it looks not found)', async () => {
    db.importBatch.findFirst.mockResolvedValue(null);
    await expect(undoImport(adminA(), 'batchB', { action: 'undo' })).rejects.toThrow(/doesn’t exist/);
    expect(db.importBatch.findFirst.mock.calls[0][0].where.createdBy).toEqual({ organizationId: { in: ['orgA'] } });
    expect(db.importBatch.updateMany).not.toHaveBeenCalled();
  });
});

describe('the campus network, for one school', () => {
  beforeEach(() => {
    db.campus.findMany.mockResolvedValue([{ id: 'cp1', name: 'Uni', emailDomains: '["uni.edu"]' }]);
    db.campus.update.mockResolvedValue({ id: 'cp1', name: 'Uni' });
  });

  it('assigns by domain only the admin’s school’s people', async () => {
    const out = await updateCampus(adminA(), 'cp1', { emailDomains: 'uni.edu' });
    expect(out.moved).toBe(1);
    const [sql, ...args] = db.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/^UPDATE "users" SET "campusId" = \?.* AND \("users"\.organizationId IN \(\?\)\)$/);
    expect(args).toEqual(['cp1', '%@uni.edu', '%.uni.edu', 'orgA']);
  });

  it('assigns everyone for the platform owner', async () => {
    await assignByDomain('all');
    expect(db.$executeRawUnsafe.mock.calls[0][0]).toContain('AND 1 = 1');
    await updateCampus(owner(), 'cp1', { emailDomains: 'uni.edu' });
    expect(db.$executeRawUnsafe.mock.calls[1].slice(1)).toEqual(['cp1', '%@uni.edu', '%.uni.edu']);
  });

  it('can’t move or send on exchange another school’s person (not found)', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(setPersonCampus(adminA(), { email: 'b1@b.test', campusId: null })).rejects.toThrow(/No one on UniVerse/);
    await expect(setExchange(adminA(), { email: 'b1@b.test', campusId: 'cp1', from: '2026-11-01', until: '2026-12-01' })).rejects.toThrow(/No student/);
    for (const [q] of db.user.findFirst.mock.calls) expect(q.where).toMatchObject({ email: 'b1@b.test', organizationId: { in: ['orgA'] } });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.studentProfile.upsert).not.toHaveBeenCalled();
  });
});
