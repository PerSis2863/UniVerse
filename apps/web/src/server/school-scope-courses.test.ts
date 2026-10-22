import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { GradesService } from './services/grades.service';
import { QuizzesService } from './services/quizzes.service';
import { CoursesService } from './services/courses.service';
import { BlackboardService } from './services/blackboard.service';
import { MentorshipService } from './services/mentorship.service';
import { announcementWhere } from './course-announcements';

// An admin of school A manages school A's courses (a course belongs to its teacher's school) and
// gets "not found" for school B's (security fix, school-scope.ts).

vi.mock('@/lib/db', () => ({
  default: {
    organization: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
    course: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    courseStaff: { findFirst: vi.fn() },
    enrollment: { findMany: vi.fn(), findUnique: vi.fn() },
    grade: { findMany: vi.fn() },
    quiz: { findUnique: vi.fn(), findMany: vi.fn() },
    quizSubmission: { findMany: vi.fn() },
    announcement: { findMany: vi.fn() },
    material: { findMany: vi.fn() },
    knowledgeHubResource: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
    mentorshipRequest: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('./auth', () => ({ isOwner: () => false }));
vi.mock('./skill-evidence', () => ({ evidenceFromQuiz: vi.fn(), safely: vi.fn() }));
vi.mock('./offline', () => ({ clientIdOf: vi.fn(), offlineTime: vi.fn(), tellTeacher: vi.fn() }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn() } }));
vi.mock('@/lib/course-access', () => ({ teaches: vi.fn().mockResolvedValue(false), taughtBy: (id: string) => ({ teacherId: id }) }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const adminA = () => ({ id: 'a1', role: 'ADMIN', organizationId: 'orgA' });
const ownCourse = { id: 'c1', teacherId: 't1', teacher: { organizationId: 'orgA' }, staff: [] };
const otherCourse = { id: 'c2', teacherId: 't2', teacher: { organizationId: 'orgB' }, staff: [] };

beforeEach(() => {
  vi.clearAllMocks();
  db.organization.findUnique.mockResolvedValue(null);
  for (const m of ['findMany']) for (const t of ['course', 'enrollment', 'grade', 'quiz', 'quizSubmission', 'announcement', 'material', 'knowledgeHubResource', 'calendarEvent']) db[t][m].mockResolvedValue([]);
});

describe('grades', () => {
  const grades = new GradesService();
  it('school B’s course is not found; school A’s opens', async () => {
    db.course.findUnique.mockResolvedValue(otherCourse);
    await expect(grades.getCourseGrades('c2', adminA())).rejects.toMatchObject({ status: 404 });
    db.course.findUnique.mockResolvedValue(ownCourse);
    await expect(grades.getCourseGrades('c1', adminA())).resolves.toEqual({ enrollments: [], grades: [] });
  });
  it('the course’s teacher keeps access, another teacher is refused', async () => {
    db.course.findUnique.mockResolvedValue(otherCourse);
    await expect(grades.getCourseGrades('c2', { id: 't2', role: 'TEACHER' })).resolves.toBeTruthy();
    await expect(grades.getCourseGrades('c2', { id: 't9', role: 'TEACHER' })).rejects.toMatchObject({ status: 403 });
  });
});

describe('quizzes', () => {
  const quizzes = new QuizzesService();
  const quiz = (course: typeof ownCourse) => ({ id: 'q1', courseId: course.id, status: 'DRAFT', shuffle: false, pools: null, course, questions: [{ id: 'x', correctAnswer: 'a' }] });
  it('an admin gets the answers only for their school’s course', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz(otherCourse));
    await expect(quizzes.findOne('q1', adminA())).rejects.toMatchObject({ message: 'Quiz not found' });
    db.quiz.findUnique.mockResolvedValue(quiz(ownCourse));
    expect((await quizzes.findOne('q1', adminA())).questions[0]).toHaveProperty('correctAnswer', 'a');
  });
  it('the admin list and the late offline quizzes are limited to the school', async () => {
    await quizzes.findAll(adminA());
    expect(db.quiz.findMany.mock.calls[0][0].where).toEqual({ course: { teacher: { organizationId: { in: ['orgA'] } } } });
    await quizzes.offlinePending(adminA());
    expect(db.quizSubmission.findMany.mock.calls[0][0].where.quiz).toEqual({ course: { teacher: { organizationId: { in: ['orgA'] } } } });
  });
});

describe('courses', () => {
  const courses = new CoursesService();
  it('the admin list is the school’s courses', async () => {
    await courses.findAllForAdmin(adminA());
    expect(db.course.findMany.mock.calls[0][0].where).toEqual({ teacher: { organizationId: { in: ['orgA'] } } });
  });
  it('school B’s course: catalogue view only, no changes, no delete', async () => {
    db.course.findUnique.mockResolvedValue({ ...otherCourse, teacher: { id: 't2', name: 'T', avatar: null, email: 't@b', organizationId: 'orgB' }, enrollments: [{ studentId: 's1' }], materials: [], quizzes: [] });
    const seen = await courses.findOne('c2', adminA());
    expect(seen).not.toHaveProperty('enrollments');
    db.course.findUnique.mockResolvedValue(otherCourse);
    await expect(courses.update('c2', adminA(), { name: 'X' })).rejects.toMatchObject({ status: 404 });
    await expect(courses.remove('c2', adminA())).rejects.toMatchObject({ status: 404 });
    expect(db.course.update).not.toHaveBeenCalled();
    expect(db.course.delete).not.toHaveBeenCalled();
  });
  it('school A’s course: the full view, and reassigning only to a teacher of the school', async () => {
    db.course.findUnique.mockResolvedValue({ ...ownCourse, teacher: { id: 't1', name: 'T', avatar: null, email: 't@a', organizationId: 'orgA' }, enrollments: [], materials: [], quizzes: [] });
    const seen = await courses.findOne('c1', adminA());
    expect(seen).toHaveProperty('enrollments');
    expect(seen.teacher).not.toHaveProperty('organizationId');
    db.course.findUnique.mockResolvedValue(ownCourse);
    db.user.findFirst.mockResolvedValue(null);
    await expect(courses.update('c1', adminA(), { teacherId: 't2' })).rejects.toMatchObject({ status: 404 });
    db.user.findFirst.mockResolvedValue({ id: 't3' });
    await courses.update('c1', adminA(), { teacherId: 't3' });
    expect(db.course.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { teacherId: 't3' } });
  });
  it('an admin creating a course for a teacher of another school is refused', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(courses.create('t2', { code: 'X1', name: 'X' }, adminA())).rejects.toMatchObject({ status: 404 });
  });
});

describe('the course board and mentorship', () => {
  it('blackboard: school B’s course is not found to the admin', async () => {
    db.course.findUnique.mockResolvedValue(otherCourse);
    await expect(new BlackboardService().getBlackboardData('c2', adminA())).rejects.toMatchObject({ status: 404 });
    db.course.findUnique.mockResolvedValue(ownCourse);
    await expect(new BlackboardService().getBlackboardData('c1', adminA())).resolves.toHaveProperty('announcements');
  });
  it('mentorship: only a request by a student of the school', async () => {
    db.mentorshipRequest.findUnique.mockResolvedValue({ studentId: 's2', teacherId: 't2', student: { organizationId: 'orgB' } });
    await expect(new MentorshipService().getSessions('r1', adminA())).rejects.toMatchObject({ status: 404 });
  });
  it('announcements: an admin reads their school’s', async () => {
    expect(await announcementWhere({ id: 'a1', name: 'A', email: 'a@a', role: 'ADMIN', organizationId: 'orgA' })).toEqual({ author: { organizationId: { in: ['orgA'] } } });
  });
});
