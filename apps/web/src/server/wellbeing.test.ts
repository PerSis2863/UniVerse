import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notify, notifyMany } from './email';
import { can } from './permissions';
import { wellbeingAction, wellbeingNudges, wellbeingRequestAction, wellbeingRequests } from './wellbeing';

vi.mock('@/lib/db', () => ({
  default: {
    wellbeingSettings: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    wellbeingCheckin: { upsert: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    wellbeingAlert: { count: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'w1' }), deleteMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    aiUse: { findMany: vi.fn().mockResolvedValue([]) }, assignmentSubmission: { findMany: vi.fn().mockResolvedValue([]) }, quizSubmission: { findMany: vi.fn().mockResolvedValue([]) },
    classroomCheckin: { count: vi.fn().mockResolvedValue(0) }, assignment: { count: vi.fn().mockResolvedValue(0) }, quiz: { count: vi.fn().mockResolvedValue(0) },
    staffRole: { findMany: vi.fn().mockResolvedValue([{ members: [{ userId: 'c1' }] }]) }, user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ organizationId: null }) },
    organization: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('./email', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('./permissions', () => ({ can: vi.fn() }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const student: SessionUser = { id: 's1', role: 'STUDENT', email: 's@x.edu', name: 'Sam Lee' };
const teacher: SessionUser = { id: 't1', role: 'TEACHER', email: 't@x.edu', name: 'Tess' };
const hardWeek = (n: number, mood = 2) => Array.from({ length: n }, (_, i) => ({ day: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), mood }));

describe('wellbeing radar on the server (Stage 5 · D13)', () => {
  beforeEach(() => { vi.clearAllMocks(); db.wellbeingCheckin.findMany.mockResolvedValue([]); db.wellbeingAlert.count.mockResolvedValue(0); });

  it('is only for students, and only once they turn it on', async () => {
    await expect(wellbeingAction(teacher, { action: 'join' })).rejects.toMatchObject({ message: expect.stringContaining('for students') });
    db.wellbeingSettings.findUnique.mockResolvedValue(null);
    await expect(wellbeingAction(student, { action: 'check-in', mood: 3 })).rejects.toMatchObject({ message: 'Turn the wellbeing radar on first.' });
    await wellbeingAction(student, { action: 'join', timeZone: 'Asia/Kolkata', counsellorOk: 'yes' });
    expect(db.wellbeingSettings.upsert.mock.calls[0][0].create).toMatchObject({ optedIn: true, counsellorOk: false, timeZone: 'Asia/Kolkata' });
  });

  it('a check-in tells nobody unless the student agreed, and then only on a really hard stretch', async () => {
    db.wellbeingSettings.findUnique.mockResolvedValue({ optedIn: true, counsellorOk: false, timeZone: 'UTC' });
    db.wellbeingCheckin.findMany.mockResolvedValue(hardWeek(5, 1));
    const r = await wellbeingAction(student, { action: 'check-in', mood: 1, tags: ['sleep', 'nope'], note: 'secret' });
    expect(r).toMatchObject({ ok: true, counsellorTold: false });
    expect(db.wellbeingCheckin.upsert.mock.calls[0][0].create).toMatchObject({ mood: 1, tags: '["sleep"]', note: 'secret' });
    expect(notifyMany).not.toHaveBeenCalled();

    db.wellbeingSettings.findUnique.mockResolvedValue({ optedIn: true, counsellorOk: true, timeZone: 'UTC' });
    db.wellbeingCheckin.findMany.mockResolvedValue(hardWeek(2, 3));
    expect(await wellbeingAction(student, { action: 'check-in', mood: 3 })).toMatchObject({ counsellorTold: false });
    db.wellbeingCheckin.findMany.mockResolvedValue(hardWeek(4, 2));
    expect(await wellbeingAction(student, { action: 'check-in', mood: 2 })).toMatchObject({ counsellorTold: true });
    expect(db.wellbeingAlert.create.mock.calls[0][0].data).toEqual({ userId: 's1', reason: 'PATTERN', message: '' }); // never the note
    expect(notifyMany).toHaveBeenCalledWith(['c1'], expect.objectContaining({ email: false, link: '/admin/wellbeing' }));
    db.wellbeingAlert.count.mockResolvedValue(1); // told within the last fortnight already
    expect(await wellbeingAction(student, { action: 'check-in', mood: 2 })).toMatchObject({ counsellorTold: false });
  });

  it('“Talk to someone” sends one request at a time', async () => {
    await wellbeingAction(student, { action: 'ask', message: ' Can we talk this week? ' });
    expect(db.wellbeingAlert.create.mock.calls[0][0].data).toEqual({ userId: 's1', reason: 'ASKED', message: 'Can we talk this week?' });
    db.wellbeingAlert.count.mockResolvedValue(1);
    await expect(wellbeingAction(student, { action: 'ask' })).rejects.toMatchObject({ message: expect.stringContaining('already') });
  });

  it('leaving deletes the check-ins and withdraws unseen requests', async () => {
    await wellbeingAction(student, { action: 'leave' });
    expect(db.wellbeingCheckin.deleteMany).toHaveBeenCalledWith({ where: { userId: 's1' } });
    expect(db.wellbeingAlert.deleteMany).toHaveBeenCalledWith({ where: { userId: 's1', status: 'OPEN' } });
    expect(db.wellbeingSettings.deleteMany).toHaveBeenCalledWith({ where: { userId: 's1' } });
  });

  it('only counsellors see requests; the student is told when one is seen', async () => {
    vi.mocked(can).mockResolvedValue(false);
    await expect(wellbeingRequests(teacher)).rejects.toMatchObject({ message: expect.stringContaining('counsellors') });
    vi.mocked(can).mockResolvedValue(true);
    db.wellbeingAlert.findMany.mockResolvedValue([{ id: 'a', status: 'CLOSED' }, { id: 'b', status: 'OPEN' }]);
    expect((await wellbeingRequests(teacher)).requests.map((r) => r.id)).toEqual(['b', 'a']);
    db.wellbeingAlert.findUnique.mockResolvedValue({ id: 'b', userId: 's1', status: 'OPEN', reason: 'ASKED' });
    db.wellbeingAlert.findFirst.mockResolvedValue({ id: 'b', userId: 's1', status: 'OPEN', reason: 'ASKED' });
    await wellbeingRequestAction(teacher, { id: 'b', action: 'seen' });
    expect(notify).toHaveBeenCalledWith('s1', expect.objectContaining({ title: 'A counsellor has seen your request', email: false }));
  });

  it('the daily nudge is private, and skips quiet weeks', async () => {
    db.wellbeingSettings.findMany.mockResolvedValue([{ userId: 's1', timeZone: 'UTC' }, { userId: 's2', timeZone: 'UTC' }]);
    db.assignment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5).mockResolvedValue(0); // s1: 5 due soon
    const r = await wellbeingNudges(25);
    expect(r).toEqual({ checked: 2, sent: 1 });
    expect(notify).toHaveBeenCalledWith('s1', expect.objectContaining({ title: 'A heavy few days ahead', email: false }));
    expect(db.wellbeingSettings.update).toHaveBeenCalledTimes(2);
  });
});
