import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server-auth';

// Security review (22 Oct 2026, school-scope.ts): OneRoster sync, course copy, search, report cards
// and bulk-import undo reach only the admin's own school's people and courses (a course is its
// teacher's school). Another school's records look "not found"; teachers keep their access and the
// platform owner sees everything.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    course: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    enrollment: { findUnique: vi.fn(), create: vi.fn() },
    oneRosterMapping: { findMany: vi.fn(), upsert: vi.fn() },
    oneRosterSync: { create: vi.fn() },
    reportCardRun: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reportCard: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    importBatch: { findFirst: vi.fn(), updateMany: vi.fn() },
    group: { findMany: vi.fn() },
    nGOProject: { findMany: vi.fn() },
    internship: { findMany: vi.fn() },
    knowledgeHubResource: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./permissions', () => ({ need: vi.fn(async () => undefined) }));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));
vi.mock('./grade-scale', () => ({ scaleFor: vi.fn(async () => ({})) }));
vi.mock('@/server/search-index', () => ({ searchMine: vi.fn(async () => []), indexCourseAssignments: vi.fn() }));
vi.mock('@/lib/server-auth', () => ({ getSessionUser: vi.fn() }));

import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { GET as search } from '@/app/api/search/route';
import { executeOneRosterSync, previewOneRosterSync } from './oneroster';
import { courseCopyStep, startCourseCopy } from './course-copy';
import { compileBatch, deleteRun, runDetail, setComment, setPublished } from './report-cards';
import { undoImport } from './bulk-import';

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>> & { $queryRawUnsafe: Fn; $executeRawUnsafe: Fn };
// A fresh object each time: schoolsOf remembers its answer per user object.
const person = (id: string, organizationId: string | null, role = 'ADMIN') => ({ id, name: id, email: `${id}@school.test`, role, organizationId }) as SessionUser;
const adminA = () => person('a1', 'orgA');
const owner = () => ({ ...person('o1', null), owner: true }) as SessionUser;
const status = (n: number) => expect.objectContaining({ status: n });

beforeEach(() => {
  vi.clearAllMocks();
  // s1 (a main-school admin) also owns orgX, where OneRoster put people; nobody else owns a school.
  db.organization.findUnique.mockImplementation(async ({ where }: { where: { ownerId?: string } }) => (where.ownerId === 's1' ? { id: 'orgX' } : null));
  db.$executeRawUnsafe.mockResolvedValue(1);
});

describe('OneRoster sync', () => {
  const payload = {
    users: [
      { sourcedId: 'u1', email: 'mine@a.test', role: 'student' as const },
      { sourcedId: 'u2', email: 'theirs@b.test', role: 'student' as const },
      { sourcedId: 'u3', email: 'teach@a.test', role: 'teacher' as const },
    ],
    classes: [
      { sourcedId: 'k1', title: 'Algebra', classCode: 'A101', courseSourcedId: 'k1' },
      { sourcedId: 'k2', title: 'Biology', classCode: 'B101', courseSourcedId: 'k2' },
    ],
    enrollments: [
      { sourcedId: 'e1', classSourcedId: 'k1', userSourcedId: 'u1', role: 'student' as const },
      { sourcedId: 'e2', classSourcedId: 'k1', userSourcedId: 'u2', role: 'student' as const },
      { sourcedId: 'e3', classSourcedId: 'k2', userSourcedId: 'u3', role: 'teacher' as const },
      { sourcedId: 'e4', classSourcedId: 'k2', userSourcedId: 'u1', role: 'student' as const },
      { sourcedId: 'e5', classSourcedId: 'k1', userSourcedId: 'u3', role: 'teacher' as const },
    ],
  };
  beforeEach(() => {
    // theirs@b.test is school B's account; B101 is school B's course.
    db.user.findMany.mockResolvedValue([
      { id: 'sA', email: 'mine@a.test', organizationId: 'orgA' },
      { id: 'sB', email: 'theirs@b.test', organizationId: 'orgB' },
      { id: 'tA', email: 'teach@a.test', organizationId: 'orgA' },
    ]);
    db.course.findMany.mockResolvedValue([
      { id: 'cA', code: 'A101', name: 'Algebra', teacher: { organizationId: 'orgA' } },
      { id: 'cB', code: 'B101', name: 'Biology', teacher: { organizationId: 'orgB' } },
    ]);
    db.oneRosterMapping.findMany.mockResolvedValue([]);
    db.user.findFirst.mockResolvedValue({ id: 'tA' });
    db.enrollment.findUnique.mockResolvedValue(null);
    db.course.updateMany.mockResolvedValue({ count: 1 });
    db.oneRosterSync.create.mockResolvedValue({ id: 'sync1' });
  });

  it('never matches, enrols or makes another school’s account, nor takes over its course', async () => {
    const out = await executeOneRosterSync('orgA', adminA(), payload);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.course.create).not.toHaveBeenCalled();
    const mapped = db.oneRosterMapping.upsert.mock.calls.map(([a]) => a.create.targetId);
    expect(mapped).toEqual(['sA', 'tA', 'cA']);
    expect(db.enrollment.create.mock.calls.map(([a]) => a.data)).toEqual([{ studentId: 'sA', courseId: 'cA' }]);
    // The only teacher set is school A's person, on school A's course, and only while it's still school A's.
    expect(db.course.update).not.toHaveBeenCalled();
    expect(db.course.updateMany.mock.calls).toEqual([[{ where: { id: 'cA', teacher: { organizationId: { in: ['orgA'] } } }, data: { teacherId: 'tA' } }]]);
    expect(out.leftOut.map((x) => [x.type, x.sourcedId])).toEqual([['USER', 'u2'], ['COURSE', 'k2']]);
    expect(out.leftOut[1].message).toMatch(/B101 is taken/);
    expect(out.counts).toMatchObject({ users: 2, classes: 1, enrollments: 2, leftOut: 2 });
  });

  it('a course that stopped being the school’s keeps its teacher', async () => {
    db.course.updateMany.mockResolvedValue({ count: 0 });
    const out = await executeOneRosterSync('orgA', adminA(), { ...payload, enrollments: [payload.enrollments[4]] });
    expect(out.counts.enrollments).toBe(0);
    expect(out.leftOut.map((x) => x.sourcedId)).toContain('e5');
  });

  it('the preview looks up emails in the school only, so it can’t tell whose an email is; another school’s code is taken', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'sA', email: 'mine@a.test', name: 'Mine', role: 'STUDENT' }]);
    const out = await previewOneRosterSync('orgA', adminA(), payload);
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ email: { in: ['mine@a.test', 'theirs@b.test', 'teach@a.test'] }, organizationId: { in: ['orgA'] } });
    const item = (id: string) => out.items.find((i) => i.sourcedId === id);
    expect(item('u1')?.action).toBe('match');
    // Another school's email reads like any new one.
    expect(item('u2')).toMatchObject({ action: 'create', detail: 'New student account to provision (theirs@b.test)' });
    expect(item('k1')?.action).toBe('match');
    expect(item('k2')?.action).toBe('error');
    expect(out.warnings.join(' ')).toMatch(/B101 is taken/);
    // Enrolments in the left-out class aren't counted.
    expect(out.counts.enrollmentsToCreate).toBe(3);
  });

  it('the platform owner matches across schools', async () => {
    await previewOneRosterSync('orgA', owner(), payload);
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ email: { in: ['mine@a.test', 'theirs@b.test', 'teach@a.test'] } });
    const out = await executeOneRosterSync('orgA', owner(), payload);
    expect(out.leftOut).toEqual([]);
    expect(db.course.updateMany.mock.calls.map(([a]) => a.where)).toEqual([{ id: 'cB' }, { id: 'cA' }]);
  });

  it('can’t sync into another school', async () => {
    await expect(executeOneRosterSync('orgB', adminA(), payload)).rejects.toEqual(status(403));
    await expect(previewOneRosterSync('orgB', adminA(), payload)).rejects.toEqual(status(403));
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe('course copy', () => {
  const course = (id: string, teacherId: string, org: string) => ({ id, code: id.toUpperCase(), name: id, description: null, skills: null, credits: 3, department: null, color: null, emoji: null, teacherId, teacher: { organizationId: org } });
  beforeEach(() => {
    db.course.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id === 'cA' ? course('cA', 'tA', 'orgA') : where.id === 'cB' ? course('cB', 'tB', 'orgB') : null));
    db.course.create.mockResolvedValue({ id: 'new', code: 'NEW1', name: 'cA' });
  });

  it('an admin can’t copy another school’s course in or out (it looks not found)', async () => {
    await expect(courseCopyStep('cA', adminA(), { target: 'cB', stage: 'quizzes' })).rejects.toEqual(status(404));
    await expect(courseCopyStep('cB', adminA(), { target: 'cA', stage: 'quizzes' })).rejects.toEqual(status(404));
    await expect(startCourseCopy('cB', adminA(), { code: 'NEW1' })).rejects.toEqual(status(404));
    expect(db.course.create).not.toHaveBeenCalled();
  });

  it('the admin’s own school’s course, its teacher and the owner can copy', async () => {
    await expect(startCourseCopy('cA', adminA(), { code: 'NEW1' })).resolves.toMatchObject({ course: { id: 'new' } });
    await expect(startCourseCopy('cB', person('tB', 'orgB', 'TEACHER'), { code: 'NEW2' })).resolves.toBeTruthy();
    await expect(startCourseCopy('cB', owner(), { code: 'NEW3' })).resolves.toBeTruthy();
    await expect(startCourseCopy('cB', person('t9', 'orgB', 'TEACHER'), { code: 'NEW4' })).rejects.toEqual(status(403));
  });
});

describe('search', () => {
  const where = (m: string) => db[m].findMany.mock.calls[0][0].where;
  beforeEach(() => {
    for (const m of ['course', 'group', 'nGOProject', 'internship', 'knowledgeHubResource']) db[m].findMany.mockResolvedValue([]);
  });
  it('an admin finds only their school’s courses and knowledge-hub resources', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(adminA());
    await search(new Request('http://x/api/search?q=math'));
    expect(where('course').teacher).toEqual({ organizationId: { in: ['orgA'] } });
    expect(where('knowledgeHubResource').AND[0]).toEqual({ OR: [{ isPublic: true }, { authorId: 'a1' }, { author: { organizationId: { in: ['orgA'] } } }] });
  });
  it('teachers are unchanged; the owner finds everything', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(person('t1', 'orgA', 'TEACHER'));
    await search(new Request('http://x/api/search?q=math'));
    expect(where('course')).toMatchObject({ status: 'PUBLISHED' });
    expect(where('course').teacher).toBeUndefined();
    expect(where('knowledgeHubResource').AND[0]).toEqual({ OR: [{ isPublic: true }, { authorId: 't1' }] });
    vi.clearAllMocks();
    for (const m of ['course', 'group', 'nGOProject', 'internship', 'knowledgeHubResource']) db[m].findMany.mockResolvedValue([]);
    vi.mocked(getSessionUser).mockResolvedValue(owner());
    await search(new Request('http://x/api/search?q=math'));
    expect(where('course').teacher).toBeUndefined();
    expect(where('knowledgeHubResource').AND[0]).toEqual({});
  });
});

describe('report cards', () => {
  // r1 was started by s1, who runs the main school and owns orgX: its cards can be either school's.
  const starter = () => person('s1', null);
  const mainAdmin = () => person('m2', null);
  beforeEach(() => {
    db.reportCardRun.findUnique.mockResolvedValue({ id: 'r1', title: 'T1', createdById: 's1', publishedAt: null, fromDate: new Date(), toDate: new Date(), school: 'Main', total: 3 });
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, organizationId: null }));
    db.user.findMany.mockResolvedValue([]);
    db.reportCard.findMany.mockResolvedValue([]);
    db.reportCard.update.mockResolvedValue({ id: 'card1' });
  });

  it('another main-school admin sees only their schools’ students’ cards', async () => {
    await runDetail(mainAdmin(), 'r1');
    expect(db.reportCard.findMany.mock.calls[0][0].where).toEqual({ runId: 'r1', student: { organizationId: null } });
    await runDetail(starter(), 'r1');
    expect(db.reportCard.findMany.mock.calls[1][0].where).toEqual({ runId: 'r1', student: { OR: [{ organizationId: null }, { organizationId: { in: ['orgX'] } }] } });
    await runDetail(owner(), 'r1');
    expect(db.reportCard.findMany.mock.calls[2][0].where).toEqual({ runId: 'r1' });
  });

  it('another school’s student’s card can’t be commented on (not found)', async () => {
    db.reportCard.findUnique.mockResolvedValue({ runId: 'r1', student: { organizationId: 'orgX' } });
    await expect(setComment(mainAdmin(), 'card1', 'Well done')).rejects.toMatchObject({ status: 404 });
    expect(db.reportCard.update).not.toHaveBeenCalled();
    await expect(setComment(starter(), 'card1', 'Well done')).resolves.toEqual({ ok: true });
    db.reportCard.findUnique.mockResolvedValue({ runId: 'r1', student: { organizationId: null } });
    await expect(setComment(mainAdmin(), 'card1', 'Well done')).resolves.toEqual({ ok: true });
  });

  it('cards are made only for the viewer’s schools’ students', async () => {
    await compileBatch(mainAdmin(), 'r1', null);
    expect(db.user.findMany.mock.calls[0][0].where.AND[0]).toEqual({ organizationId: null });
    await compileBatch(starter(), 'r1', null);
    expect(db.user.findMany.mock.calls[1][0].where.AND[0]).toEqual({ OR: [{ organizationId: null }, { organizationId: { in: ['orgX'] } }] });
  });

  it('a round with another school’s cards is published or deleted only by its starter', async () => {
    db.reportCard.count.mockResolvedValue(1);
    await expect(setPublished(mainAdmin(), 'r1', true)).rejects.toMatchObject({ status: 403 });
    await expect(deleteRun(mainAdmin(), 'r1')).rejects.toMatchObject({ status: 403 });
    expect(db.reportCard.count.mock.calls[0][0].where).toEqual({ runId: 'r1', NOT: { student: { organizationId: null } } });
    expect(db.reportCardRun.update).not.toHaveBeenCalled();
    expect(db.reportCardRun.delete).not.toHaveBeenCalled();
    db.reportCard.count.mockResolvedValue(0);
    await expect(deleteRun(starter(), 'r1')).resolves.toEqual({ ok: true });
    expect(db.reportCardRun.delete).toHaveBeenCalled();
  });
});

describe('bulk-import undo', () => {
  const undo = { invitations: [], reinvites: [], enrollments: ['e1'], pending: [], courses: [], courseUpdates: [], slots: [] };
  beforeEach(() => {
    db.importBatch.findFirst.mockResolvedValue({ undo: JSON.stringify(undo), undoneAt: null, createdAt: new Date() });
    db.importBatch.updateMany.mockResolvedValue({ count: 1 });
  });

  it('is refused when the import changed another school’s records', async () => {
    db.$queryRawUnsafe.mockResolvedValueOnce([{ n: 1 }]);
    await expect(undoImport(person('m2', null), 'b1', { action: 'undo' })).rejects.toEqual(status(403));
    const [sql, ...args] = db.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('organizationId IS NULL OR');
    expect(args).toHaveLength(8);
    expect(args[2]).toBe('["e1"]');
    expect(args[7]).toBe('[]');
    expect(db.importBatch.updateMany).not.toHaveBeenCalled();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('goes ahead when everything it changed is the viewer’s school’s; the owner always can', async () => {
    db.$queryRawUnsafe.mockResolvedValueOnce([{ n: 0 }]).mockResolvedValue([]);
    await expect(undoImport(adminA(), 'b1', { action: 'undo' })).resolves.toMatchObject({ undone: true });
    const [sql, ...args] = db.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('organizationId IS NOT NULL AND');
    expect(args[7]).toBe('["orgA"]');
    expect(db.$executeRawUnsafe).toHaveBeenCalled();
    vi.clearAllMocks();
    db.importBatch.updateMany.mockResolvedValue({ count: 1 });
    await expect(undoImport(owner(), 'b1', { action: 'undo' })).resolves.toMatchObject({ undone: true });
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
