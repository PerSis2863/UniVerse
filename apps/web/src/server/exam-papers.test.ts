import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { paperToQuiz } from './exam-papers';
import { buildVersions } from '@/lib/exam-paper';
import type { SessionUser } from '@/lib/server-auth';

// M324: a paper becomes a draft online quiz: bank questions as in the bank, the rest from the paper's key.
const versions = buildVersions([
  { id: 'b1', question: 'From the bank', type: 'CHOICE', options: ['x', 'y'], correctAnswer: 'y', points: 1 },
  { id: 'q2', question: 'Primes?', type: 'MULTI', options: ['2', '4', '5'], correctAnswer: '["2","5"]', points: 2 },
  { id: 'w1', question: 'Explain.', type: 'WRITTEN', options: [], correctAnswer: 'Because.', points: 0, rubric: [{ name: 'Idea', points: 3 }] },
], { versions: 1, shuffleOptions: false, seed: 's' });
vi.mock('@/lib/db', () => ({
  default: {
    examPaper: { findUnique: vi.fn() },
    bankQuestion: { findMany: vi.fn() },
    quiz: { create: vi.fn().mockResolvedValue({ id: 'qz' }) },
    quizQuestion: { createMany: vi.fn() },
  },
}));
vi.mock('@/lib/course-access', () => ({ courseAccess: vi.fn().mockResolvedValue({ canManage: true }) }));

describe('a paper as an online quiz', () => {
  it('makes a draft with each question', async () => {
    vi.mocked(prisma.examPaper.findUnique).mockResolvedValue({ id: 'p1', courseId: 'c1', title: 'Midterm', instructions: null, minutes: 60, versions: JSON.stringify(versions) } as never);
    vi.mocked(prisma.bankQuestion.findMany).mockResolvedValue([{ id: 'b1', question: 'From the bank', options: ['x', 'y'], correctAnswer: 'y', points: 1, type: 'CHOICE', meta: null }] as never);
    await paperToQuiz({ id: 't' } as SessionUser, 'p1');
    expect(vi.mocked(prisma.quiz.create).mock.calls[0][0].data).toMatchObject({ title: 'Midterm (online)', status: 'DRAFT', timeLimit: 60 });
    const rows = vi.mocked(prisma.quizQuestion.createMany).mock.calls[0][0].data as { type: string; correctAnswer: string; points: number }[];
    expect(rows.map((r) => [r.type, r.correctAnswer, r.points])).toEqual([['CHOICE', 'y', 1], ['MULTI', '["2","5"]', 2], ['SHORT', 'Because.', 3]]);
  });
});
