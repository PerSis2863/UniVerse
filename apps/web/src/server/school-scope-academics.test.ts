import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { manageableQuiz } from '@/lib/quizzes';
import { listRuns, runDetail, setComment, deleteRun } from './report-cards';
import { flagFor } from './support-plans';
import { analyticsCourses } from './course-analytics';
import { publishExams } from './timetable-plan';
import { reviewResearchDataRequest } from './analytics-warehouse';
import { runMetric } from './school-analytics';

// An admin of school A sees and changes school A's academic records (courses by their teacher's
// school, people by their own) and gets "not found" for school B's (security fix, school-scope.ts).
// Teachers keep exactly their access; the platform owner sees everything.

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    course: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    enrollment: { findUnique: vi.fn(), findMany: vi.fn() },
    quiz: { findUnique: vi.fn() },
    reportCardRun: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    reportCard: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    studentRiskFlag: { findUnique: vi.fn() },
    calendarEvent: { deleteMany: vi.fn() },
    researchDataRequest: { findUnique: vi.fn(), update: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./email', () => ({ later: vi.fn(), notifyMany: vi.fn() }));
vi.mock('./grade-scale', () => ({ scaleFor: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn(), cachedAi: vi.fn(), sameQuestion: (s: string) => s, saveAi: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./moderation', () => ({ featureOff: vi.fn() }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn() } }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>> & { $queryRawUnsafe: Fn; $executeRawUnsafe: Fn };
const adminA = () => ({ id: 'a1', name: 'A', email: 'a@x', role: 'ADMIN', organizationId: 'orgA' });
const owner = () => ({ id: 'o1', name: 'O', email: 'o@x', role: 'ADMIN', organizationId: null, owner: true });
const teacherB = () => ({ id: 't2', name: 'T2', email: 't2@x', role: 'TEACHER', organizationId: 'orgB' });
const notFound = { status: 404 };

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
  db.enrollment.findUnique.mockResolvedValue(null);
});

describe('course access (Blackboard)', () => {
  const course = (org: string, teacherId: string) => ({ id: 'c', name: 'C', code: 'C1', color: null, teacherId, skills: null, teacher: { id: teacherId, name: 'T', organizationId: org }, _count: { enrollments: 0 }, staff: [] });
  it('an admin manages their school’s course, gets nothing for another school’s', async () => {
    db.course.findUnique.mockResolvedValue(course('orgA', 't1'));
    expect(await courseAccess('c', adminA())).toMatchObject({ canManage: true, canGrade: true });
    db.course.findUnique.mockResolvedValue(course('orgB', 't2'));
    expect(await courseAccess('c', adminA())).toBeNull();
  });
  it('the teacher keeps access; the owner sees every school’s', async () => {
    db.course.findUnique.mockResolvedValue(course('orgB', 't2'));
    expect(await courseAccess('c', teacherB())).toMatchObject({ canManage: true });
    expect(await courseAccess('c', owner())).toMatchObject({ canManage: true });
  });
});

describe('quizzes', () => {
  const quiz = (org: string) => ({ id: 'q', courseId: 'c', course: { teacherId: 't2', name: 'C', code: 'C1', teacher: { organizationId: org }, staff: [] } });
  it('another school’s quiz is not found for an admin; the teacher still manages it, and the school stays out of the result', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz('orgB'));
    expect(await manageableQuiz('q', adminA())).toBeNull();
    const own = await manageableQuiz('q', teacherB());
    expect(own?.course).toEqual({ teacherId: 't2', name: 'C', code: 'C1', staff: [] });
    db.quiz.findUnique.mockResolvedValue(quiz('orgA'));
    expect(await manageableQuiz('q', adminA())).toBeTruthy();
  });
});

describe('report cards', () => {
  const run = (id: string, createdById: string) => ({ id, title: 'T1', createdById, publishedAt: null, fromDate: new Date(), toDate: new Date(), _count: { cards: 0 } });
  beforeEach(() => {
    db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, organizationId: where.id === 'adminB' ? 'orgB' : 'orgA' }));
    db.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id, organizationId: id === 'adminB' ? 'orgB' : 'orgA' }))));
    db.reportCard.findMany.mockResolvedValue([]);
  });
  it('another school’s round is not found, to see, comment on or delete', async () => {
    db.reportCardRun.findUnique.mockResolvedValue(run('rB', 'adminB'));
    await expect(runDetail(adminA(), 'rB')).rejects.toMatchObject(notFound);
    await expect(deleteRun(adminA(), 'rB')).rejects.toMatchObject(notFound);
    expect(db.reportCardRun.delete).not.toHaveBeenCalled();
    db.reportCard.findUnique.mockResolvedValue({ runId: 'rB' });
    await expect(setComment(adminA(), 'card', 'Well done')).rejects.toMatchObject(notFound);
    expect(db.reportCard.update).not.toHaveBeenCalled();
  });
  it('the admin’s own round opens; the owner opens any', async () => {
    db.reportCardRun.findUnique.mockResolvedValue(run('rA', 'a1'));
    await expect(runDetail(adminA(), 'rA')).resolves.toMatchObject({ run: { id: 'rA' } });
    db.reportCardRun.findUnique.mockResolvedValue(run('rB', 'adminB'));
    await expect(runDetail(owner(), 'rB')).resolves.toMatchObject({ run: { id: 'rB' } });
  });
  it('the list leaves out other schools’ rounds', async () => {
    db.reportCardRun.findMany.mockResolvedValue([run('rA', 'a1'), run('rB', 'adminB')]);
    expect((await listRuns(adminA())).map((r) => r.id)).toEqual(['rA']);
    expect((await listRuns(owner())).map((r) => r.id)).toEqual(['rA', 'rB']);
  });
});

describe('early warning study plans', () => {
  const flag = (studentOrg: string, teacherOrg: string) => ({ id: 'f', studentId: 's', courseId: 'c', course: { id: 'c', code: 'C1', name: 'C', teacherId: 't2', teacher: { organizationId: teacherOrg } }, student: { id: 's', name: 'S', organizationId: studentOrg } });
  it('another school’s flag is not found for an admin; their own works without leaking schools', async () => {
    db.studentRiskFlag.findUnique.mockResolvedValue(flag('orgB', 'orgB'));
    await expect(flagFor('f', adminA())).rejects.toMatchObject(notFound);
    db.studentRiskFlag.findUnique.mockResolvedValue(flag('orgA', 'orgA'));
    const own = await flagFor('f', adminA());
    expect(own.student).toEqual({ id: 's', name: 'S' });
    expect(own.course).toEqual({ id: 'c', code: 'C1', name: 'C', teacherId: 't2' });
  });
});

describe('course analytics', () => {
  it('admins pick only their school’s published courses', async () => {
    db.course.findMany.mockResolvedValue([]);
    await analyticsCourses(adminA());
    expect(db.course.findMany.mock.calls[0][0].where).toEqual({ status: 'PUBLISHED', teacher: { organizationId: { in: ['orgA'] } } });
  });
});

describe('exam timetable', () => {
  it('another school’s course counts as gone, so nothing lands on its calendars', async () => {
    db.course.findMany.mockResolvedValue([]);
    await expect(publishExams(adminA(), { name: 'Finals', exams: [{ courseId: 'cB', startAt: '2026-11-02T09:00:00Z', endAt: '2026-11-02T11:00:00Z' }] })).rejects.toThrow(/no longer exists/);
    expect(db.course.findMany.mock.calls[0][0].where).toMatchObject({ teacher: { organizationId: { in: ['orgA'] } } });
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.calendarEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe('research data requests', () => {
  it('a request of another school is not found; the main school’s ("default-org") is its admins’', async () => {
    db.researchDataRequest.findUnique.mockResolvedValue({ id: 'r', organizationId: 'orgB' });
    db.user.findUnique.mockResolvedValue({ id: 'a1', organizationId: 'orgA' });
    await expect(reviewResearchDataRequest({ requestId: 'r', reviewerId: 'a1', status: 'REJECTED' })).rejects.toMatchObject(notFound);
    expect(db.researchDataRequest.update).not.toHaveBeenCalled();
    db.researchDataRequest.findUnique.mockResolvedValue({ id: 'r', organizationId: 'default-org' });
    db.user.findUnique.mockResolvedValue({ id: 'm1', organizationId: null });
    db.researchDataRequest.update.mockResolvedValue({ status: 'REJECTED' });
    await expect(reviewResearchDataRequest({ requestId: 'r', reviewerId: 'm1', status: 'REJECTED' })).resolves.toMatchObject({ status: 'REJECTED' });
  });
});

describe('school analytics', () => {
  it('counts only the admin’s school (its courses’ teachers, its people)', async () => {
    db.$queryRawUnsafe.mockResolvedValue([]);
    await runMetric(adminA(), 'grades_by_department');
    const [sql, ...args] = db.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/JOIN users t ON t\.id = c\.teacherId/);
    expect(sql).toMatch(/t\.organizationId IN \(\?\)/);
    expect(args).toContain('orgA');
    db.$queryRawUnsafe.mockClear();
    await runMetric(adminA(), 'teacher_workload');
    expect(db.$queryRawUnsafe.mock.calls[0][0]).toMatch(/u\.organizationId IN \(\?\)/);
  });
});
