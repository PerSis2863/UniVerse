import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { bulkRole, bulkStatus, renewInvitation } from './user-bulk';

vi.mock('@/lib/db', () => ({
  default: {
    user: { findMany: vi.fn(), updateMany: vi.fn() },
    studentProfile: { upsert: vi.fn() },
    teacherProfile: { upsert: vi.fn() },
    invitation: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('./auth', () => ({ forgetUser: vi.fn(), isOwnerEmail: (e: string) => e === 'owner@x.test' }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, Fn>>;
const admin = { id: 'a1' };
const person = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `P ${id}`, email: `${id}@x.test`, status: 'ACTIVE', role: 'STUDENT', _count: { taughtCourses: 0, enrollments: 0 }, ...extra });

describe('Admin → Users, several at once (Phase E)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deactivates the chosen people, never yourself or the owner', async () => {
    db.user.findMany.mockResolvedValue([person('u1'), person('u2', { status: 'SUSPENDED' }), person('a1'), person('o1', { email: 'owner@x.test' })]);
    const out = await bulkStatus(admin, ['u1', 'u2', 'a1', 'o1', 'u1'], 'SUSPENDED');
    expect(out.changed).toBe(1);
    expect(db.user.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['u1'] } }, data: { status: 'SUSPENDED' } });
    expect(out.skipped.map((s) => s.why)).toEqual(['Your own account', 'This account is protected']);
  });

  it('refuses an empty choice, odd ids and too many at once', async () => {
    await expect(bulkStatus(admin, [], 'ACTIVE')).rejects.toThrow(/at least one/);
    await expect(bulkStatus(admin, ['bad id!'], 'ACTIVE')).rejects.toThrow(/at least one/);
    await expect(bulkRole(admin, Array.from({ length: 21 }, (_, i) => `u${i}`), 'TEACHER')).rejects.toThrow(/up to 20/);
    await expect(bulkRole(admin, ['u1'], 'ADMIN')).rejects.toThrow(/Student or Teacher/);
  });

  it('fixes a wrong role only for people with no courses, with their profile', async () => {
    db.user.findMany.mockResolvedValue([
      person('s1'), person('s2', { _count: { taughtCourses: 0, enrollments: 2 } }), person('t1', { role: 'TEACHER' }),
      person('t2', { role: 'TEACHER', _count: { taughtCourses: 1, enrollments: 0 } }), person('ad', { role: 'ADMIN' }), person('a1'),
    ]);
    const out = await bulkRole(admin, ['s1', 's2', 't1', 't2', 'ad', 'a1'], 'TEACHER');
    expect(out.changed).toBe(1);
    expect(db.user.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['s1'] } }, data: { role: 'TEACHER', accountType: 'STAFF' } });
    expect(db.teacherProfile.upsert).toHaveBeenCalledTimes(1);
    // t1 and t2 are teachers already: nothing to do for them.
    expect(out.skipped.map((s) => s.id)).toEqual(['s2', 'ad', 'a1']);
    expect(out.skipped[0].why).toMatch(/Enrolled in 2 courses/);
    db.user.findMany.mockResolvedValueOnce([person('t1', { role: 'TEACHER' }), person('t2', { role: 'TEACHER', _count: { taughtCourses: 1, enrollments: 0 } })]);
    const back = await bulkRole(admin, ['t1', 't2'], 'STUDENT');
    expect(back.changed).toBe(1);
    expect(back.skipped).toEqual([{ id: 't2', name: 'P t2', why: 'Teaches 1 course: give them to another teacher first' }]);
    expect(db.studentProfile.upsert).toHaveBeenCalledTimes(1);
  });

  it('renews an open invitation for 30 days and nothing else', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    db.invitation.findUnique.mockResolvedValue({ id: 'i1', email: 'new@x.test', status: 'PENDING' });
    const out = await renewInvitation('i1', now);
    expect(out.expiresAt.toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(db.invitation.update.mock.calls[0][0]).toEqual({ where: { id: 'i1' }, data: { expiresAt: out.expiresAt } });
    db.invitation.findUnique.mockResolvedValue({ id: 'i2', email: 'x@x.test', status: 'ACTIVE' });
    await expect(renewInvitation('i2', now)).rejects.toThrow(/not found/);
  });
});
