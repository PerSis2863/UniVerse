import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { QuizzesService } from './quizzes.service';

vi.mock('@/lib/db', () => ({ default: { quiz: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) }, enrollment: { findUnique: vi.fn() } } }));
vi.mock('../skill-evidence', () => ({ evidenceFromQuiz: vi.fn(), safely: vi.fn() }));
vi.mock('../offline', () => ({ clientIdOf: vi.fn(), offlineTime: vi.fn(), tellTeacher: vi.fn() }));
vi.mock('../realtime', () => ({ publish: vi.fn() }));
vi.mock('./push.service', () => ({ pushService: { sendToMany: vi.fn() } }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { quiz: { findUnique: Fn; findMany: Fn }; enrollment: { findUnique: Fn } };
const service = new QuizzesService();
const quiz = (status = 'PUBLISHED', staff: { id: string }[] = []) => ({
  id: 'q1', courseId: 'c1', title: 'Quiz', status, shuffle: false, course: { teacherId: 't1', staff },
  questions: [{ id: 'a', question: 'Q?', options: ['x', 'y'], correctAnswer: 'x', points: 1, order: 0 }],
});

describe('who may open a quiz', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the course’s teacher and admins get the answers', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz('DRAFT'));
    const own = await service.findOne('q1', { id: 't1', role: 'TEACHER' });
    expect(own.questions[0]).toHaveProperty('correctAnswer', 'x');
    expect(own).not.toHaveProperty('course');
    const admin = await service.findOne('q1', { id: 'a1', role: 'ADMIN' });
    expect(admin.questions[0]).toHaveProperty('correctAnswer', 'x');
  });

  it('a co-teacher gets the answers too (Stage 5 · B2)', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz('DRAFT', [{ id: 'st1' }]));
    const co = await service.findOne('q1', { id: 't3', role: 'TEACHER' });
    expect(co.questions[0]).toHaveProperty('correctAnswer', 'x');
    // Only co-teachers are looked up, never assistants.
    expect(db.quiz.findUnique.mock.calls[0][0].include.course.select.staff).toEqual({ where: { userId: 't3', role: 'CO_TEACHER' }, select: { id: true }, take: 1 });
  });

  it('another teacher gets nothing', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz());
    db.enrollment.findUnique.mockResolvedValue(null);
    await expect(service.findOne('q1', { id: 't2', role: 'TEACHER' })).rejects.toMatchObject({ message: 'Quiz not found' });
  });

  it('an enrolled student gets a published quiz without the answers', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz());
    db.enrollment.findUnique.mockResolvedValue({ id: 'e1' });
    const mine = await service.findOne('q1', { id: 's1', role: 'STUDENT' });
    expect(mine.questions[0]).not.toHaveProperty('correctAnswer');
  });

  it('a student outside the course, or any student for a draft, gets nothing', async () => {
    db.quiz.findUnique.mockResolvedValue(quiz());
    db.enrollment.findUnique.mockResolvedValue(null);
    await expect(service.findOne('q1', { id: 's2', role: 'STUDENT' })).rejects.toMatchObject({ message: 'Quiz not found' });
    db.quiz.findUnique.mockResolvedValue(quiz('DRAFT'));
    db.enrollment.findUnique.mockResolvedValue({ id: 'e1' });
    await expect(service.findOne('q1', { id: 's1', role: 'STUDENT' })).rejects.toMatchObject({ message: 'Quiz not found' });
    await expect(service.findOne('q1', undefined)).rejects.toMatchObject({ message: 'Quiz not found' });
  });

  it('the quiz list shows only your own courses’ quizzes', async () => {
    await service.findAll({ id: 't1', role: 'TEACHER' });
    expect(db.quiz.findMany.mock.calls[0][0].where).toEqual({ course: { OR: [{ teacherId: 't1' }, { staff: { some: { userId: 't1', role: { in: ['CO_TEACHER'] } } } }] } });
    await service.findAll({ id: 's1', role: 'STUDENT' });
    expect(db.quiz.findMany.mock.calls[1][0].where).toEqual({ status: { not: 'DRAFT' }, course: { enrollments: { some: { studentId: 's1' } } } });
    await service.findAll({ id: 'a1', role: 'ADMIN' });
    expect(db.quiz.findMany.mock.calls[2][0].where).toBeUndefined();
    expect(await service.findAll(undefined)).toEqual([]);
  });
});
