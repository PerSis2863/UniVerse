import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ course: { findUnique: vi.fn(), count: vi.fn() }, enrollment: { findUnique: vi.fn() } }));
vi.mock('@/lib/db', () => ({ default: db }));

import { courseAccess, ownsCourse, taughtBy } from './course-access';

const course = (staff: { role: string }[] = []) => ({ id: 'c1', name: 'Intro', code: 'CS101', color: null, teacherId: 't1', skills: null, teacher: { id: 't1', name: 'T' }, _count: { enrollments: 3 }, staff });
const who = (id: string, role = 'TEACHER') => ({ id, name: id, email: `${id}@x`, role });

describe('course access with a teaching team (Stage 5 · B2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('teacher and admins manage; the team list never leaks into the course', async () => {
    db.course.findUnique.mockResolvedValue(course());
    expect(await courseAccess('c1', who('t1'))).toMatchObject({ canManage: true, canGrade: true, staffRole: null });
    const admin = await courseAccess('c1', who('a1', 'ADMIN'));
    expect(admin).toMatchObject({ canManage: true, canGrade: true });
    expect(admin!.course).not.toHaveProperty('staff');
  });

  it('a co-teacher manages, an assistant only grades', async () => {
    db.course.findUnique.mockResolvedValue(course([{ role: 'CO_TEACHER' }]));
    expect(await courseAccess('c1', who('t2'))).toMatchObject({ canManage: true, canGrade: true, staffRole: 'CO_TEACHER' });
    db.course.findUnique.mockResolvedValue(course([{ role: 'TA' }]));
    expect(await courseAccess('c1', who('t3'))).toMatchObject({ canManage: false, canGrade: true, staffRole: 'TA' });
    expect(db.enrollment.findUnique).not.toHaveBeenCalled();
  });

  it('students need to be enrolled; anyone else gets nothing', async () => {
    db.course.findUnique.mockResolvedValue(course([{ role: 'SOMETHING_ELSE' }]));
    db.enrollment.findUnique.mockResolvedValue({ id: 'e1' });
    expect(await courseAccess('c1', who('s1', 'STUDENT'))).toMatchObject({ canManage: false, canGrade: false, staffRole: null });
    db.enrollment.findUnique.mockResolvedValue(null);
    expect(await courseAccess('c1', who('t9'))).toBeNull();
    db.course.findUnique.mockResolvedValue(null);
    expect(await courseAccess('nope', who('t1'))).toBeNull();
  });

  it('only the teacher or an admin owns the course', () => {
    expect(ownsCourse({ teacherId: 't1' }, who('t1'))).toBe(true);
    expect(ownsCourse({ teacherId: 't1' }, who('a', 'ADMIN'))).toBe(true);
    expect(ownsCourse({ teacherId: 't1' }, who('t2'))).toBe(false);
  });

  it('lists courses someone teaches or is on the team of', () => {
    expect(taughtBy('t2')).toEqual({ OR: [{ teacherId: 't2' }, { staff: { some: { userId: 't2', role: { in: ['CO_TEACHER', 'TA'] } } } }] });
    expect(taughtBy('t2', ['CO_TEACHER']).OR[1]).toEqual({ staff: { some: { userId: 't2', role: { in: ['CO_TEACHER'] } } } });
  });
});
