import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { cleanWeek, publishExams, saveWeek } from './timetable-plan';

vi.mock('@/lib/db', () => ({
  default: {
    course: { findMany: vi.fn() },
    room: { findMany: vi.fn() },
    timetableSlot: { findMany: vi.fn(), deleteMany: vi.fn() },
    calendarEvent: { deleteMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    organization: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('./email', () => ({ later: vi.fn(), notifyMany: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { course: { findMany: Fn }; room: { findMany: Fn }; timetableSlot: { findMany: Fn; deleteMany: Fn }; calendarEvent: { deleteMany: Fn }; $executeRawUnsafe: Fn };
const admin = { id: 'a1', name: 'Admin', email: 'a@x', role: 'ADMIN' };
const slot = (courseId: string, dayOfWeek: number, startTime = '09:00', endTime = '10:00', roomId: string | null = 'r1') => ({ courseId, dayOfWeek, startTime, endTime, roomId, type: 'LECTURE' });

describe('timetable generator: saving (Stage 5 · Q12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.course.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id, code: id.toUpperCase(), name: id }))));
    db.room.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id }))));
    db.timetableSlot.findMany.mockResolvedValue([]);
    db.calendarEvent.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('refuses classes for courses not being planned, or without a proper time', () => {
    expect(() => cleanWeek({ courseIds: ['c1'], slots: [slot('c2', 0)] })).toThrow(/no course/);
    expect(() => cleanWeek({ courseIds: ['c1'], slots: [slot('c1', 0, '10:00', '09:00')] })).toThrow(/proper time/);
    expect(() => cleanWeek({ courseIds: ['c1'], slots: [slot('c1', 7)] })).toThrow(/proper time/);
    expect(() => cleanWeek({ courseIds: [], slots: [] })).toThrow(/Pick the courses/);
    expect(cleanWeek({ courseIds: ['c1'], slots: [{ ...slot('c1', 1), type: 'DANCE' }] }).slots[0].type).toBe('LECTURE');
  });

  it('keeps classes already there, adds the new ones first and removes the old ones after', async () => {
    db.timetableSlot.findMany.mockResolvedValue([{ id: 'keep', ...slot('c1', 0) }, { id: 'old', ...slot('c1', 3) }]);
    const many = Array.from({ length: 20 }, (_, i) => slot('c1', i % 5, `${String(10 + Math.floor(i / 5)).padStart(2, '0')}:00`, `${String(11 + Math.floor(i / 5)).padStart(2, '0')}:00`));
    const out = await saveWeek(admin, { courseIds: ['c1'], slots: [slot('c1', 0), ...many] });
    expect(out).toEqual({ added: 20, removed: 1, kept: 1 });
    // 20 new classes: two statements, each under D1's 100 values.
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    for (const [, ...values] of db.$executeRawUnsafe.mock.calls) expect(values.length).toBeLessThanOrEqual(100);
    expect(db.$executeRawUnsafe.mock.calls[0].length - 1).toBe(96);
    expect(db.timetableSlot.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old'] } } });
    expect(db.$executeRawUnsafe.mock.invocationCallOrder[1]).toBeLessThan(db.timetableSlot.deleteMany.mock.invocationCallOrder[0]);
  });

  it('is for admins only, and checks the rooms exist', async () => {
    await expect(saveWeek({ ...admin, role: 'TEACHER' }, { courseIds: ['c1'], slots: [] })).rejects.toThrow(/Only admins/);
    db.room.findMany.mockResolvedValue([]);
    await expect(saveWeek(admin, { courseIds: ['c1'], slots: [slot('c1', 0, '09:00', '10:00', 'gone')] })).rejects.toThrow(/room/);
  });

  it('publishes exams under a name, replacing the last one with that name', async () => {
    db.calendarEvent.deleteMany.mockResolvedValue({ count: 3 });
    const exams = Array.from({ length: 15 }, (_, i) => ({ courseId: `c${i}`, startAt: '2026-11-02T09:00:00.000Z', endAt: '2026-11-02T11:00:00.000Z', rooms: 'Hall (40)' }));
    const out = await publishExams(admin, { name: ' End of term ', exams });
    expect(out).toEqual({ published: 15, replaced: 3, batch: 'exam:End of term' });
    // Only this school's timetable of that name (an admin in no school runs the main school).
    expect(db.calendarEvent.deleteMany).toHaveBeenCalledWith({ where: { batch: 'exam:End of term', course: { teacher: { organizationId: null } } } });
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const values = db.$executeRawUnsafe.mock.calls[0].slice(1);
    expect(values.length).toBe(98);
    expect(values.slice(0, 7)).toEqual(['a1', 'C0 exam', 'c0 · Hall (40)', '2026-11-02T09:00:00.000+00:00', '2026-11-02T11:00:00.000+00:00', 'c0', 'exam:End of term']);
    await expect(publishExams(admin, { name: 'X', exams: [{ courseId: 'c1', startAt: '2026-11-02T09:00:00Z', endAt: '2026-11-03T09:00:00Z' }] })).rejects.toThrow(/proper time/);
  });
});
