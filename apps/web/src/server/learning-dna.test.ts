import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { classMastery, recordSignal, studentMastery } from './learning-dna';

vi.mock('@/lib/db', () => ({
  default: {
    courseConcept: { findMany: vi.fn() },
    conceptTag: { findMany: vi.fn().mockResolvedValue([]) },
    conceptSignal: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    secondChance: { findMany: vi.fn().mockResolvedValue([]) },
    enrollment: { findMany: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/course-access', () => ({ courseAccess: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(false) }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const student: SessionUser = { id: 's1', role: 'STUDENT', email: 's@x.edu', name: 'Sam' };
const teacher: SessionUser = { id: 't1', role: 'TEACHER', email: 't@x.edu', name: 'Tess' };
const concepts = [
  { id: 'loops', name: 'Loops', description: 'for and while loops', parentId: null, position: 0 },
  { id: 'rec', name: 'Recursion', description: 'base cases', parentId: null, position: 1 },
];
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

describe('mastery signals from flashcards and tutor questions (Stage 5 · Q22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.courseConcept.findMany.mockResolvedValue(concepts);
    (courseAccess as Fn).mockImplementation(async (_c: string, u: SessionUser) => ({ canManage: u.role === 'TEACHER', course: { id: 'c1', code: 'CS101', name: 'Intro' } }));
  });

  it('records a flashcard review for the concept its words match, one a card a day', async () => {
    expect(await recordSignal({ courseId: 'c1', studentId: 's1', kind: 'CARD', text: 'What stops a while loop? Its condition', grade: 'hard', cardId: 'k1' })).toBe('loops');
    expect(db.conceptSignal.deleteMany.mock.calls[0][0].where).toMatchObject({ studentId: 's1', kind: 'CARD', refId: 'k1' });
    expect(db.conceptSignal.create.mock.calls[0][0].data).toMatchObject({ conceptId: 'loops', kind: 'CARD', outcome: 0.6, refId: 'k1' });
    // A card already matched keeps its concept (while it still exists); nothing matches: nothing kept.
    expect(await recordSignal({ courseId: 'c1', studentId: 's1', kind: 'CARD', text: 'unrelated', grade: 'easy', cardId: 'k2', conceptId: 'rec' })).toBe('rec');
    expect(await recordSignal({ courseId: 'c1', studentId: 's1', kind: 'CARD', text: 'What year is it?', grade: 'good', cardId: 'k3' })).toBeNull();
    expect(db.conceptSignal.create).toHaveBeenCalledTimes(2);
  });

  it('records a tutor question without an outcome, and never throws', async () => {
    expect(await recordSignal({ courseId: 'c1', studentId: 's1', kind: 'TUTOR', text: 'Can you explain recursion again?' })).toBe('rec');
    expect(db.conceptSignal.create.mock.calls[0][0].data).toEqual({ courseId: 'c1', studentId: 's1', conceptId: 'rec', kind: 'TUTOR' });
    db.courseConcept.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(recordSignal({ courseId: 'c1', studentId: 's1', kind: 'TUTOR', text: 'recursion' })).resolves.toBeNull();
  });

  it('counts card reviews lightly on my map and shows what I asked the tutor', async () => {
    db.conceptSignal.findMany.mockResolvedValue([
      { studentId: 's1', conceptId: 'loops', kind: 'CARD', outcome: 1, createdAt: ago(1) },
      { studentId: 's1', conceptId: 'loops', kind: 'CARD', outcome: 1, createdAt: ago(2) },
      { studentId: 's1', conceptId: 'rec', kind: 'TUTOR', outcome: null, createdAt: ago(3) },
      { studentId: 's1', conceptId: 'rec', kind: 'TUTOR', outcome: null, createdAt: ago(90) }, // too old to count as asked
    ]);
    const r = await studentMastery(student, 'c1', null);
    const loops = r.concepts.find((c) => c.id === 'loops')!, rec = r.concepts.find((c) => c.id === 'rec')!;
    expect(loops.n).toBe(2);
    expect(loops.level).toBeGreaterThan(0.3); // up from the start…
    expect(loops.level).toBeLessThan(0.6); // …but two self-marked cards are not mastery
    expect(loops.band).not.toBe('mastered');
    expect(rec).toMatchObject({ n: 0, asked: 1 }); // asking doesn't change the level
  });

  it('gives the teacher tutor questions per concept for the class, never per student', async () => {
    db.enrollment.findMany.mockResolvedValue([{ student: { id: 's1', name: 'Sam' } }, { student: { id: 's2', name: 'Ana' } }]);
    db.conceptSignal.findMany.mockResolvedValue([
      { studentId: 's1', conceptId: 'rec', kind: 'TUTOR', outcome: null, createdAt: ago(1) },
      { studentId: 's1', conceptId: 'rec', kind: 'TUTOR', outcome: null, createdAt: ago(2) },
      { studentId: 's2', conceptId: 'rec', kind: 'TUTOR', outcome: null, createdAt: ago(2) },
    ]);
    const r = await classMastery(teacher, 'c1');
    expect(r.concepts.find((c) => c.id === 'rec')).toMatchObject({ asked: 3, askedBy: 2 });
    expect(r.concepts.find((c) => c.id === 'loops')).toMatchObject({ asked: 0, askedBy: 0 });
    expect(JSON.stringify(r.concepts)).not.toContain('s1');
  });
});
