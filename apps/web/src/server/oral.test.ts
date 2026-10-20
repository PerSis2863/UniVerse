import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { spendAi } from './ai-budget';
import { notify } from './email';
import { geminiJson } from './gemini';
import { liveToken } from './live-token';
import { createOralCheck, finishOral, oralCheckAction, oralSession, startOral } from './oral';

vi.mock('@/lib/db', () => ({
  default: {
    oralCheck: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    oralSession: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    grade: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'g-new' }), update: vi.fn().mockResolvedValue({ id: 'g1' }) },
    enrollment: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('@/lib/course-access', () => ({ courseAccess: vi.fn() }));
vi.mock('@/lib/storage', () => ({ isAppFileUrl: (u: unknown) => typeof u === 'string' && u.startsWith('/api/files/'), deleteFile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn().mockResolvedValue({ ok: true, left: 5, message: '' }) }));
vi.mock('./email', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./live-token', () => ({ liveToken: vi.fn().mockResolvedValue({ token: 'tok', model: 'live-model' }) }));
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(false) }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));
vi.mock('./grade-history', () => ({ logGradeChanges: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { oralCheck: Record<string, Fn>; oralSession: Record<string, Fn>; enrollment: Record<string, Fn>; grade: Record<string, Fn> };
const student: SessionUser = { id: 's1', role: 'STUDENT', email: 's@x.edu', name: 'Sam Lee' };
const teacher: SessionUser = { id: 't1', role: 'TEACHER', email: 't@x.edu', name: 'Tess' };
const RUBRIC = JSON.stringify([{ id: 'clarity', name: 'Clarity', desc: '', max: 4 }, { id: 'depth', name: 'Depth', desc: '', max: 4 }]);
const check = { id: 'k1', courseId: 'c1', teacherId: 't1', title: 'Viva 1', kind: 'VIVA', topic: 'Scheduling', questions: 'What is a quantum?', lang: '', rubric: RUBRIC, minutes: 5, dueAt: null, status: 'OPEN', course: { code: 'CS101', name: 'Intro' } };
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const lines = [{ who: 'ai', text: 'What is round robin?' }, { who: 'you', text: `Round robin gives each process a turn. ${words(45)}` }];

describe('oral exams on the server (Stage 5 · D11)', () => {
  const key = process.env.GEMINI_API_KEY;
  afterAll(() => { if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-only';
    vi.mocked(courseAccess).mockResolvedValue({ canManage: false, course: { code: 'CS101', name: 'Intro', _count: { enrollments: 3 } } } as never);
  });

  it('starts an oral check once: one attempt, counted for the site, the examiner told what to cover', async () => {
    db.oralCheck.findUnique.mockResolvedValue(check);
    db.oralSession.findUnique.mockResolvedValue(null);
    const r = await startOral(student, { checkId: 'k1' });
    expect(r).toMatchObject({ token: 'tok', attempt: true, minutes: 5, title: 'Viva 1' });
    expect(spendAi).toHaveBeenCalledWith(null);
    expect(db.oralSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 's1', checkId: 'k1', status: 'STARTED' }) });
    const [prompt, minutes] = vi.mocked(liveToken).mock.calls[0];
    expect(prompt).toContain('What is a quantum?');
    expect(prompt).toContain('Sam');
    expect(minutes).toBe(6);

    db.oralSession.findUnique.mockResolvedValue({ status: 'STARTED' });
    await expect(startOral(student, { checkId: 'k1' })).rejects.toMatchObject({ message: expect.stringContaining('ask your teacher') });
    db.oralSession.findUnique.mockResolvedValue(null);
    db.oralCheck.findUnique.mockResolvedValue({ ...check, status: 'CLOSED' });
    await expect(startOral(student, { checkId: 'k1' })).rejects.toMatchObject({ message: 'This oral check is closed.' });
    vi.mocked(courseAccess).mockResolvedValue(null as never);
    await expect(startOral(student, { checkId: 'k1' })).rejects.toMatchObject({ message: 'Oral check not found.' });
  });

  it('gives the attempt back when the examiner can’t start', async () => {
    db.oralCheck.findUnique.mockResolvedValue(check);
    db.oralSession.findUnique.mockResolvedValue(null);
    vi.mocked(liveToken).mockRejectedValueOnce(new Error('busy'));
    await expect(startOral(student, { checkId: 'k1' })).rejects.toMatchObject({ message: expect.stringContaining('busy') });
    expect(db.oralSession.deleteMany).toHaveBeenCalledWith({ where: { checkId: 'k1', userId: 's1', status: 'STARTED' } });
  });

  it('practice: checks the setup and counts for the student', async () => {
    await expect(startOral(student, { kind: 'VIVA', topic: 'x' })).rejects.toMatchObject({ message: 'Say what the oral is about.' });
    await expect(startOral(student, { kind: 'LANGUAGE', topic: 'My town' })).rejects.toMatchObject({ message: expect.stringContaining('language') });
    const r = await startOral(student, { kind: 'INTERVIEW', topic: '', minutes: 99 });
    expect(r).toMatchObject({ attempt: false, minutes: 8, kind: 'INTERVIEW' });
    expect(spendAi).toHaveBeenCalledWith(student);
    vi.mocked(spendAi).mockResolvedValueOnce({ ok: false, left: 0, message: 'No AI left today.' });
    await expect(startOral(student, { kind: 'VIVA', topic: 'Loops' })).rejects.toMatchObject({ message: 'No AI left today.' });
  });

  it('a finished check goes to the teacher with the AI’s draft, hidden from the student until confirmed', async () => {
    db.oralSession.findUnique.mockResolvedValue({ id: 'o1', status: 'STARTED', kind: 'VIVA', topic: 'Scheduling', lang: '', rubric: RUBRIC, check: { id: 'k1', title: 'Viva 1', teacherId: 't1', courseId: 'c1' } });
    vi.mocked(geminiJson).mockResolvedValue({ scores: [{ id: 'clarity', score: 3, reason: 'Clear.', quote: 'Round robin gives each process a turn' }, { id: 'depth', score: 9, reason: 'Some.', quote: 'invented' }], summary: 'Good.', strengths: ['Clear'], nextSteps: ['Give data'] });
    await expect(finishOral(student, { checkId: 'k1', lines, durationSec: 200, audioUrl: 'https://evil.example/a.webm' })).rejects.toMatchObject({ message: 'Upload the recording first.' });
    const r = await finishOral(student, { checkId: 'k1', lines, durationSec: 200, audioUrl: '/api/files/abcdefghijklmnopqr/oral-check.webm' });
    expect(r).toEqual({ id: 'o1', status: 'SUBMITTED' });
    const data = db.oralSession.update.mock.calls[0][0].data;
    expect(data.status).toBe('SUBMITTED');
    expect(JSON.parse(data.aiScores)).toEqual([{ id: 'clarity', score: 3, reason: 'Clear.', quote: 'Round robin gives each process a turn' }, { id: 'depth', score: 4, reason: 'Some.', quote: '' }]);
    expect(notify).toHaveBeenCalledWith('t1', expect.objectContaining({ email: false }));

    // The student's view of it: no scores yet; the teacher's: the AI's draft.
    const row = { id: 'o1', userId: 's1', checkId: 'k1', courseId: 'c1', kind: 'VIVA', topic: 'Scheduling', lang: '', rubric: RUBRIC, transcript: JSON.stringify(lines), durationSec: 200, audioUrl: null, aiScores: data.aiScores, aiSummary: data.aiSummary, status: 'SUBMITTED', finalScores: null, teacherComment: null, confirmedAt: null, createdAt: new Date(), check: { title: 'Viva 1', courseId: 'c1' }, user: { name: 'Sam Lee' } };
    db.oralSession.findUnique.mockResolvedValue(row);
    const mine = await oralSession(student, 'o1');
    expect(mine.scores).toBeNull();
    expect(mine.aiScores).toBeNull();
    expect(mine.summary).toBeNull();
    vi.mocked(courseAccess).mockResolvedValue({ canManage: true } as never);
    const theirs = await oralSession(teacher, 'o1');
    expect(theirs.aiTotal).toBe(7);
    expect(theirs.student).toBe('Sam Lee');
  });

  it('the teacher confirms with their own numbers, keeping the AI’s reasons as evidence', async () => {
    vi.mocked(courseAccess).mockResolvedValue({ canManage: true } as never);
    db.oralCheck.findUnique.mockResolvedValue(check);
    db.oralSession.findFirst.mockResolvedValue({ id: 'o1', userId: 's1', status: 'SUBMITTED', kind: 'VIVA', rubric: RUBRIC, aiScores: JSON.stringify([{ id: 'clarity', score: 3, reason: 'Clear.', quote: 'q' }]) });
    await expect(oralCheckAction(teacher, 'k1', { action: 'confirm', sessionId: 'o1', scores: [{ id: 'clarity', score: 4 }] })).rejects.toMatchObject({ message: 'Give a score for every criterion.' });
    const r = await oralCheckAction(teacher, 'k1', { action: 'confirm', sessionId: 'o1', scores: [{ id: 'clarity', score: 9 }, { id: 'depth', score: 2 }], comment: ' Well argued. ' });
    expect(r).toEqual({ ok: true, total: 6, max: 8 });
    const data = db.oralSession.update.mock.calls[0][0].data;
    expect(JSON.parse(data.finalScores)).toEqual([{ id: 'clarity', score: 4, reason: 'Clear.', quote: 'q' }, { id: 'depth', score: 2, reason: '', quote: '' }]);
    expect(data).toMatchObject({ status: 'CONFIRMED', teacherComment: 'Well argued.', confirmedById: 't1' });
    expect(notify).toHaveBeenCalledWith('s1', expect.objectContaining({ body: '6 / 8: Well argued.', email: false }));
    // Into the gradebook (Q22): a new row the first time, the same row when re-marked.
    expect(db.grade.create.mock.calls[0][0].data).toMatchObject({ studentId: 's1', assignmentName: `Oral: ${check.title}`, score: 6, maxScore: 8, feedback: 'Well argued.' });
    db.grade.findFirst.mockResolvedValueOnce({ id: 'g1', score: 6 });
    db.oralSession.findFirst.mockResolvedValueOnce({ id: 'o1', userId: 's1', status: 'CONFIRMED', kind: 'VIVA', rubric: RUBRIC, aiScores: '[]' });
    await oralCheckAction(teacher, 'k1', { action: 'confirm', sessionId: 'o1', scores: [{ id: 'clarity', score: 3 }, { id: 'depth', score: 3 }] });
    expect(db.grade.update.mock.calls[0][0]).toMatchObject({ where: { id: 'g1' }, data: { score: 6 } });
    expect(db.grade.create).toHaveBeenCalledTimes(1);

    vi.mocked(courseAccess).mockResolvedValue({ canManage: false } as never);
    await expect(oralCheckAction(student, 'k1', { action: 'close' })).rejects.toMatchObject({ message: 'Oral check not found.' });
  });

  it('practice that’s too short is kept but not scored', async () => {
    db.oralSession.create.mockImplementation(async ({ data }) => ({ id: 'p1', checkId: null, confirmedAt: null, createdAt: new Date(), finalScores: null, teacherComment: null, audioUrl: null, ...data }));
    const r = (await finishOral(student, { kind: 'VIVA', topic: 'Loops', lines: [{ who: 'you', text: 'I don’t know.' }], durationSec: 30 })) as { note: string; scores: unknown };
    expect(r.note).toContain('too short');
    expect(r.scores).toBeNull();
    expect(geminiJson).not.toHaveBeenCalled();
  });

  it('checks a new oral check’s settings', async () => {
    vi.mocked(courseAccess).mockResolvedValue({ canManage: true, course: { code: 'CS101' } } as never);
    db.oralCheck.create.mockResolvedValue({ id: 'k9' });
    await expect(createOralCheck(teacher, 'c1', { title: 'Viva', kind: 'VIVA', topic: 'Loops', minutes: 30 })).rejects.toMatchObject({ message: 'Choose 3 to 15 minutes.' });
    await expect(createOralCheck(teacher, 'c1', { title: 'Viva', kind: 'VIVA', topic: 'Loops', minutes: 5, rubric: [{ name: '', max: 4 }] })).rejects.toMatchObject({ message: expect.stringContaining('rubric') });
    await expect(createOralCheck(teacher, 'c1', { title: 'Viva', kind: 'VIVA', topic: 'Loops', minutes: 5, dueAt: '2001-01-01' })).rejects.toMatchObject({ message: expect.stringContaining('future') });
    expect(await createOralCheck(teacher, 'c1', { title: 'Viva', kind: 'VIVA', topic: 'Loops', minutes: 5 })).toEqual({ id: 'k9' });
    expect(JSON.parse(db.oralCheck.create.mock.calls[0][0].data.rubric).map((c: { id: string }) => c.id)).toEqual(['clarity', 'depth', 'evidence']);
    vi.mocked(courseAccess).mockResolvedValue({ canManage: false } as never);
    await expect(createOralCheck(student, 'c1', { title: 'Viva', kind: 'VIVA', topic: 'Loops', minutes: 5 })).rejects.toMatchObject({ message: 'Course not found.' });
  });
});
