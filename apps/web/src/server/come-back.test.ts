import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { notify, notifyMany } from './email';
import { dueLabel, dueSoonNudges, weekLine, weeklyProgress } from './come-back';

// M197: due-soon reminders go once, only to students who haven't handed in, and the teacher hears who.
vi.mock('@/lib/db', () => ({ default: {
  assignment: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  enrollment: { findMany: vi.fn() },
  assignmentSubmission: { findMany: vi.fn(), count: vi.fn() },
  user: { findMany: vi.fn() },
} }));
vi.mock('./email', () => ({ notify: vi.fn(), notifyMany: vi.fn(async (ids: string[]) => ids.length) }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: vi.fn(async () => 0) } }));
const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const now = new Date('2026-11-16T09:00:00Z'); // a Monday

beforeEach(() => vi.clearAllMocks());

describe('come back', () => {
  it('reminds only who hasn’t handed in, once, and tells the teacher their names', async () => {
    db.assignment.findMany.mockResolvedValue([{ id: 'a1', title: 'Essay', dueDate: new Date(now.getTime() + 20 * 3600_000), courseId: 'c1', course: { code: 'BIO1', teacherId: 't1' } }]);
    db.assignment.updateMany.mockResolvedValue({ count: 1 });
    db.enrollment.findMany.mockResolvedValue([{ studentId: 's1', student: { name: 'Alice J' } }, { studentId: 's2', student: { name: 'Bob S' } }]);
    db.assignmentSubmission.findMany.mockResolvedValue([{ studentId: 's1' }]);
    expect(await dueSoonNudges(5, now)).toEqual({ checked: 1, sent: 1 });
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['s2']);
    expect(vi.mocked(notify).mock.calls[0]).toMatchObject(['t1', { title: '1 of 2 haven’t handed in “Essay”', body: 'BIO1, due within a day: Bob.' }]);
  });
  it('skips an assignment another run already claimed', async () => {
    db.assignment.findMany.mockResolvedValue([{ id: 'a1', title: 'Essay', dueDate: now, courseId: 'c1', course: { code: 'X', teacherId: 't1' } }]);
    db.assignment.updateMany.mockResolvedValue({ count: 0 });
    await dueSoonNudges(5, now);
    expect(notifyMany).not.toHaveBeenCalled();
  });
  it('words the week', () => {
    expect(dueLabel(new Date(now.getTime() + 30 * 3600_000), now)).toBe('due in two days');
    expect(weekLine(0, 0)).toBeNull();
    expect(weekLine(1, 2)).toBe('Last week you handed in 1 piece of work. 2 are due this week.');
  });
  it('sends "Your week" only on Mondays', async () => {
    expect(await weeklyProgress(null, () => 50, new Date('2026-11-17T09:00:00Z'))).toEqual({ done: true, cursor: null, info: 0 });
    db.user.findMany.mockResolvedValueOnce([{ id: 's1' }]).mockResolvedValueOnce([]);
    db.assignmentSubmission.count.mockResolvedValue(2);
    db.assignment.count.mockResolvedValue(0);
    expect(await weeklyProgress(null, () => 50, now)).toEqual({ done: true, cursor: 's1', info: 1 });
  });
});
