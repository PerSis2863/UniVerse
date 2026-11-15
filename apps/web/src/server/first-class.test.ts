import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { firstClass } from './first-class';

// M196: the first-class steps read the teacher's own newest course; others see nothing.
vi.mock('@/lib/db', () => ({ default: { course: { findFirst: vi.fn() }, enrollment: { findMany: vi.fn() } } }));
const db = prisma as unknown as { course: { findFirst: ReturnType<typeof vi.fn> }; enrollment: { findMany: ReturnType<typeof vi.fn> } };
const teacher = { id: 't1', name: 'Tara', email: 't@x', role: 'TEACHER' };

describe('first class', () => {
  it('is only for teachers', async () => expect(await firstClass({ ...teacher, role: 'STUDENT' })).toEqual({ show: false }));
  it('starts with no course', async () => {
    db.course.findFirst.mockResolvedValue(null);
    expect(await firstClass(teacher)).toMatchObject({ show: true, course: null, students: 0 });
  });
  it('names who joined by first name only, from the teacher’s own course', async () => {
    db.course.findFirst.mockResolvedValue({ id: 'c1', code: 'BIO1', name: 'Biology', status: 'PUBLISHED', _count: { enrollments: 2, assignments: 0 } });
    db.enrollment.findMany.mockResolvedValue([{ enrolledAt: new Date(), student: { name: 'Alice Johnson' } }, { enrolledAt: new Date(), student: { name: 'Bob Smith' } }]);
    const r = await firstClass(teacher);
    expect(db.course.findFirst.mock.calls.at(-1)[0].where.teacherId).toBe('t1');
    expect(r).toMatchObject({ students: 2, assignments: 0, joined: [{ name: 'Alice' }, { name: 'Bob' }] });
  });
});
