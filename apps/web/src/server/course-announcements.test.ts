import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ enrollment: { findMany: vi.fn() }, course: { findMany: vi.fn() }, organization: { findUnique: vi.fn(async () => null) } }));
vi.mock('@/lib/db', () => ({ default: db }));
vi.mock('./email', () => ({ notifyMany: vi.fn() }));

import { announcementWhere, publishTime, visibleNow } from './course-announcements';

const NOW = Date.parse('2026-10-15T09:00:00Z');
const user = (role: string, organizationId: string | null = null) => ({ id: 'u1', name: 'U', email: 'u@x', role, organizationId });
type Scoped = { AND: { OR: unknown[] }[] };

describe('course announcements', () => {
  it('accepts a time from a minute ahead up to a year, or none for now', () => {
    expect(publishTime(undefined, NOW)).toBeNull();
    expect(publishTime('', NOW)).toBeNull();
    expect(publishTime('2026-10-16T08:00:00Z', NOW)?.toISOString()).toBe('2026-10-16T08:00:00.000Z');
    expect(() => publishTime('2026-10-15T09:00:30Z', NOW)).toThrow(/minute/);
    expect(() => publishTime('2025-01-01T00:00:00Z', NOW)).toThrow(/minute/);
    expect(() => publishTime('2028-01-01T00:00:00Z', NOW)).toThrow(/year/);
    expect(() => publishTime('next tuesday', NOW)).toThrow(/date/);
  });

  it('shows students only what is due', () => {
    const now = new Date(NOW);
    expect(visibleNow(now)).toEqual({ OR: [{ publishAt: null }, { publishAt: { lte: now } }] });
  });

  it('lets people read school-wide announcements and their own courses’ only', async () => {
    db.enrollment.findMany.mockResolvedValue([{ courseId: 'c1' }]);
    db.course.findMany.mockResolvedValue([{ id: 'c2' }]);
    const student = (await announcementWhere(user('STUDENT', 'org1'))) as Scoped;
    expect(student.AND[0]).toEqual({ OR: [{ courseId: null, target: { in: ['ALL', 'STUDENTS'] }, author: { organizationId: 'org1' } }, { courseId: { in: ['c1'] } }] });
    // Scheduled ones only from their time, except for whoever wrote them.
    expect(student.AND[1].OR).toEqual(expect.arrayContaining([{ publishAt: null }, { authorId: 'u1' }]));
    const teacher = (await announcementWhere(user('TEACHER'))) as Scoped;
    expect(teacher.AND[0].OR[0]).toEqual({ courseId: null, target: { in: ['ALL', 'TEACHERS', 'STUDENTS'] } });
    expect(teacher.AND[0].OR[1]).toEqual({ courseId: { in: ['c1', 'c2'] } });
    // Admins: everything at their own school (school-scope.ts); one in no school runs the main school.
    expect(await announcementWhere(user('ADMIN', 'org1'))).toEqual({ author: { organizationId: { in: ['org1'] } } });
    expect(await announcementWhere(user('ADMIN'))).toEqual({ author: { organizationId: null } });
  });
});
