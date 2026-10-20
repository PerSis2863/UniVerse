import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { classCode, codeWindow, markOnline, moodCounts, normalizeClassCode, studentAction } from './classroom';
import { spendAi } from './ai-budget';
import { taAnswer } from './whisper';

vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('@/lib/db', () => ({
  default: {
    classroomCheckin: { findUnique: vi.fn() },
    classroomSession: { findUnique: vi.fn() },
    classroomQuestion: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    enrollment: { findMany: vi.fn() },
    attendance: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('./whisper', () => ({ taAnswer: vi.fn().mockResolvedValue({ answer: 'It stops at n - 1 because… [1]', citations: [{ n: 1, title: 'Loops' }], grounded: true, topic: 'loops' }) }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn().mockResolvedValue({ ok: true }), sameQuestion: (s: string) => s.toLowerCase().replace(/[?!.\s]+$/u, '').trim() }));
vi.mock('./ai-receipts', () => ({ logAiUse: vi.fn() }));
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(false) }));
vi.mock('./calls', () => ({ callPeople: vi.fn().mockResolvedValue({ ids: ['s1', 's2', 't9'], creator: null }), callPulse: vi.fn().mockResolvedValue({ lost: 2, got: 3, total: 6 }) }));

describe('in-person class codes', () => {
  it('makes the same 6-character code for a secret and window, and a different one next window', async () => {
    const a = await classCode('secret-1', 1000);
    expect(a).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    expect(await classCode('secret-1', 1000)).toBe(a);
    expect(await classCode('secret-1', 1001)).not.toBe(a);
    expect(await classCode('secret-2', 1000)).not.toBe(a);
  });
  it('changes window every 30 seconds', () => {
    expect(codeWindow(0)).toBe(0);
    expect(codeWindow(29_999)).toBe(0);
    expect(codeWindow(30_000)).toBe(1);
  });
  it('reads codes the way people type them', () => {
    expect(normalizeClassCode('ab2-c3d')).toBe('AB2C3D');
    expect(normalizeClassCode(' ab 2c 3d ')).toBe('AB2C3D');
    expect(normalizeClassCode('AB2C3')).toBeNull();
    expect(normalizeClassCode('AB2C3O')).toBeNull(); // O isn't used
    expect(normalizeClassCode(123456)).toBeNull();
  });
});

describe('moodCounts', () => {
  it('counts lost and fine answers from the last five minutes only', () => {
    const now = Date.parse('2026-10-13T10:00:00Z');
    const ago = (min: number) => new Date(now - min * 60_000);
    const m = moodCounts([
      { mood: 'LOST', moodAt: ago(1) },
      { mood: 'LOST', moodAt: ago(6) }, // too old: reset
      { mood: 'OK', moodAt: ago(2) },
      { mood: null, moodAt: null },
    ], now);
    expect(m).toEqual({ lost: 1, ok: 1, total: 4 });
  });
});

describe('the class TA in an in-person class (Stage 5 · Q22)', () => {
  type Fn = ReturnType<typeof vi.fn>;
  const db = prisma as unknown as { classroomCheckin: Record<string, Fn>; classroomSession: Record<string, Fn>; classroomQuestion: Record<string, Fn> };
  const student: SessionUser = { id: 's1', role: 'STUDENT', email: 's@x.edu', name: 'Sam' };
  const started = new Date(Date.now() - 30 * 60_000);
  const q = { id: 'q1', text: 'Why does the loop stop at n - 1?', answeredAt: null, createdAt: new Date(), answer: null, citations: null, grounded: false };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    db.classroomCheckin.findUnique.mockResolvedValue({ id: 'ck1', session: { id: 'cs1', teacherId: 't1', startedAt: started, endedAt: null, pulse: '[]' } });
    db.classroomQuestion.findFirst.mockResolvedValue(q);
    db.classroomQuestion.findMany.mockResolvedValue([]);
    db.classroomQuestion.update.mockImplementation(async ({ data }) => ({ ...q, ...data }));
    // Notes from 25 and 5 minutes into the class: only the last ten minutes go to the TA.
    db.classroomSession.findUnique.mockResolvedValue({ startedAt: started, transcript: JSON.stringify([{ t: 300, who: 'Dr Rao', text: 'Old part' }, { t: 1500, who: 'Dr Rao', text: 'The loop runs while i < n' }]), course: { id: 'c1', code: 'CS101', name: 'Intro', tutorRule: null } });
  });

  it('answers my question privately from the course and the last minutes of notes', async () => {
    const r = await studentAction('cs1', student, { action: 'ta', questionId: 'q1' });
    expect(r).toMatchObject({ answer: expect.stringContaining('n - 1'), grounded: true, citations: [{ n: 1, title: 'Loops' }] });
    const heard = (taAnswer as Fn).mock.calls[0][2] as { text: string }[];
    expect(heard.map((l) => l.text)).toEqual(['The loop runs while i < n']);
    expect(db.classroomQuestion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'q1', sessionId: 'cs1', studentId: 's1' } }));
  });

  it('reuses an answer to the same question in this class, at no cost', async () => {
    db.classroomQuestion.findMany.mockResolvedValue([{ text: 'why does the loop stop at n - 1', answer: 'Made earlier [1]', citations: '[{"n":1,"title":"Loops"}]', grounded: true, createdAt: new Date() }]);
    expect(await studentAction('cs1', student, { action: 'ta', questionId: 'q1' })).toMatchObject({ answer: 'Made earlier [1]' });
    expect(taAnswer).not.toHaveBeenCalled();
    expect(spendAi).not.toHaveBeenCalled();
  });

  it('follows the teacher’s switch and only answers my own questions', async () => {
    db.classroomSession.findUnique.mockResolvedValueOnce({ startedAt: started, transcript: '[]', course: { id: 'c1', code: 'CS101', name: 'Intro', tutorRule: JSON.stringify({ whisperOff: true }) } });
    await expect(studentAction('cs1', student, { action: 'ta', questionId: 'q1' })).rejects.toMatchObject({ status: 403 });
    db.classroomQuestion.findFirst.mockResolvedValueOnce(null);
    await expect(studentAction('cs1', student, { action: 'ta', questionId: 'someone-elses' })).rejects.toMatchObject({ status: 404 });
    expect(taAnswer).not.toHaveBeenCalled();
  });
});

describe('a hybrid class: in the room and in the class call (Stage 5 · Q22)', () => {
  type Fn = ReturnType<typeof vi.fn>;
  const db = prisma as unknown as Record<string, Record<string, Fn>>;
  beforeEach(() => {
    vi.clearAllMocks();
    db.classroomSession.findFirst = vi.fn().mockResolvedValue({ id: 'cs1', startedAt: new Date(Date.now() - 5 * 60_000), teacherId: 't1' });
    db.enrollment.findMany.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }]);
  });

  it('marks the call’s students present, keeping marks the teacher made', async () => {
    db.attendance.findMany.mockResolvedValue([{ studentId: 's2', status: 'EXCUSED' }, { studentId: 's3', status: 'ABSENT' }]);
    expect(await markOnline('c1', ['s1', 's2', 's3', 't9'])).toBe(2);
    expect(db.enrollment.findMany.mock.calls[0][0].where).toMatchObject({ courseId: 'c1', studentId: { in: ['s1', 's2', 's3', 't9'] } }); // the teacher isn't a student: left out
    expect(db.attendance.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ studentId: 's1', courseId: 'c1', status: 'PRESENT', note: 'Online (class call)' })]);
    expect(db.attendance.updateMany.mock.calls[0][0]).toMatchObject({ where: { studentId: { in: ['s3'] } }, data: { status: 'PRESENT' } });
  });

  it('late after the first 15 minutes; nothing when no in-person class is linked', async () => {
    db.classroomSession.findFirst.mockResolvedValueOnce({ id: 'cs1', startedAt: new Date(Date.now() - 40 * 60_000), teacherId: 't1' });
    db.attendance.findMany.mockResolvedValue([]);
    await markOnline('c1', ['s1']);
    expect(db.attendance.createMany.mock.calls[0][0].data[0].status).toBe('LATE');
    db.classroomSession.findFirst.mockResolvedValueOnce(null);
    expect(await markOnline('c1', ['s1'])).toBe(0);
    expect(db.attendance.createMany).toHaveBeenCalledTimes(1);
  });
});
