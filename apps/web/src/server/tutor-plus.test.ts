import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { cachedAi } from './ai-budget';
import { commonQuestions, homeworkMore, saveRule, sendCardReminders } from './tutor-plus';
import type { Access } from './tutor';

vi.mock('@/lib/db', () => ({
  default: {
    aiUse: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    course: { update: vi.fn() },
    user: { findMany: vi.fn() },
    studyCard: { groupBy: vi.fn() },
    notification: { createMany: vi.fn() },
    pushSubscription: { findMany: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  },
}));
vi.mock('./ai-budget', () => ({ cachedAi: vi.fn(), saveAi: vi.fn(), spendAi: vi.fn() }));
vi.mock('./ai-receipts', () => ({ logAiUse: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn(), geminiJsonImage: vi.fn() }));
vi.mock('./semester', () => ({ indexClassSession: vi.fn() }));
vi.mock('./services/push.service', () => ({ pushService: { sendEach: vi.fn().mockResolvedValue(1) } }));
vi.mock('./tutor', () => ({ aiOn: vi.fn().mockResolvedValue(true), tutorClosed: vi.fn().mockReturnValue(null) }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>> & { $executeRawUnsafe: Fn };
const cached = cachedAi as unknown as Fn;
const rule = { hintsOnly: false, note: '', off: false, offUntil: null };
const student: Access = { courseId: 'c1', courseName: 'Chemistry', courseCode: 'CH101', role: 'STUDENT', rule };
const me = { id: 's1', name: 'Sam', email: 's@x', role: 'STUDENT' };
const ref = 'a'.repeat(32);
const saved = { readable: true, problem: 'Balance $\\ce{H2 + O2 -> H2O}$', topic: 'Equations', hints: ['Count the atoms.', 'Oxygen needs a 2.', 'Put a 2 before water.'], answer: '$\\ce{2H2 + O2 -> 2H2O}$' };

describe('the tutor’s study tools (Stage 5 · Q13)', () => {
  beforeEach(() => { vi.clearAllMocks(); cached.mockResolvedValue(saved); });

  it('gives a photo’s hints one at a time and the answer only when asked', async () => {
    expect(await homeworkMore(student, me, { ref, hints: 2 }, 'normal')).toEqual({ ref, hints: saved.hints.slice(0, 2), total: 3 });
    expect(await homeworkMore(student, me, { ref, hints: 99 }, 'normal')).toMatchObject({ hints: saved.hints });
    expect((await homeworkMore(student, me, { ref, answer: true }, 'normal')).answer).toBe(saved.answer);
    // Only the asker's own photo: the key carries the course and the person.
    expect(cached.mock.calls[0][0]).toEqual(['homework', 'c1', 's1', ref]);
  });

  it('never shows the answer in a hints-only course or in Hints only mode', async () => {
    await expect(homeworkMore({ ...student, rule: { ...rule, hintsOnly: true } }, me, { ref, answer: true }, 'hints')).rejects.toThrow(/hints only/);
    await expect(homeworkMore(student, me, { ref, answer: true }, 'hints')).rejects.toThrow(/You chose hints only/);
    cached.mockResolvedValue(null);
    await expect(homeworkMore(student, me, { ref, hints: 1 }, 'normal')).rejects.toThrow(/send it again/);
    await expect(homeworkMore(student, me, { ref: 'nope', hints: 1 }, 'normal')).rejects.toThrow(/send it again/);
  });

  it('lets only the teaching team set the rule, and not to turn back on in the past', async () => {
    await expect(saveRule(student, { hintsOnly: true })).rejects.toThrow(/Only the course’s teachers/);
    const teacher = { ...student, role: 'TEACHER' as const };
    await expect(saveRule(teacher, { off: true, offUntil: '2000-01-01T00:00:00Z' })).rejects.toThrow(/future/);
    const out = await saveRule(teacher, { hintsOnly: true, off: true, note: 'Use SI units' });
    expect(out).toMatchObject({ hintsOnly: true, off: true, note: 'Use SI units' });
    expect(JSON.parse(db.course.update.mock.calls[0][0].data.tutorRule)).toEqual({ hintsOnly: true, note: 'Use SI units', off: true, offUntil: null });
  });

  it('shows the teacher only students’ questions, grouped, with no names', async () => {
    const at = new Date('2026-10-10T10:00:00Z');
    db.aiUse.findMany.mockResolvedValue([
      { userId: 's1', detail: 'What is a mole?', createdAt: at }, { userId: 's2', detail: 'Photo: how many moles in 18 g of water', createdAt: at },
      { userId: 's2', detail: 'Answer shown: how many moles in 18 g of water', createdAt: at }, { userId: 't1', detail: 'What is a mole?', createdAt: at },
    ]);
    db.enrollment.findMany.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }]);
    await expect(commonQuestions(student)).rejects.toThrow(/Only the course’s teachers/);
    const out = await commonQuestions({ ...student, role: 'TEACHER' });
    expect(out).toMatchObject({ asked: 2, students: 2 });
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]).toMatchObject({ people: 2, asked: 2 });
    expect(JSON.stringify(out)).not.toMatch(/s1|s2|t1/);
  });

  it('reminds people with cards due in the evening, and books tomorrow’s for everyone', async () => {
    const now = new Date('2026-10-17T12:30:00Z');
    db.user.findMany.mockResolvedValue([{ id: 'u1', cardsRemindAt: new Date('2026-10-17T12:30:00Z') }, { id: 'u2', cardsRemindAt: new Date('2026-10-17T12:15:00Z') }]);
    db.studyCard.groupBy.mockResolvedValue([{ userId: 'u1', _count: { _all: 3 } }]);
    db.pushSubscription.findMany.mockResolvedValue([{ userId: 'u1', endpoint: 'e', p256dh: 'p', auth: 'a' }]);
    const out = await sendCardReminders(now);
    expect(out).toEqual({ due: 2, told: 1, sent: 1 });
    expect(db.notification.createMany.mock.calls[0][0].data).toEqual([{ userId: 'u1', title: 'Flashcards to review', body: '3 flashcards to review. A few minutes now keeps them fresh.', type: 'reminder', link: '/student/tutor?tab=cards' }]);
    const values = db.$executeRawUnsafe.mock.calls[0].slice(1);
    expect(values).toEqual(['u1', '2026-10-18T12:30:00.000+00:00', 'u2', '2026-10-18T12:15:00.000+00:00', 'u1', 'u2']);
  });
});
