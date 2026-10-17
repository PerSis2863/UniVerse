import { describe, expect, it } from 'vitest';
import { examSessions, findConflicts, planExams, planWeek, seatExam, startTimes, type PlanCourse, type PlanRoom, type Overlap } from './schedule-solver';

const week = { days: [0, 1, 2, 3, 4], start: 9 * 60, end: 17 * 60, breakStart: 12 * 60, breakEnd: 13 * 60, step: 60 };
const rooms: PlanRoom[] = [{ id: 'small', name: 'Room 1', capacity: 30 }, { id: 'big', name: 'Hall', capacity: 120 }];

describe('planWeek', () => {
  it('places every class with no teacher, room or student clashes, a course on different days', () => {
    const courses: PlanCourse[] = [
      { id: 'a', code: 'A', teacherId: 't1', students: 25, sessions: 3, length: 60 },
      { id: 'b', code: 'B', teacherId: 't1', students: 25, sessions: 3, length: 60 },
      { id: 'c', code: 'C', teacherId: 't2', students: 100, sessions: 2, length: 120 },
      { id: 'd', code: 'D', teacherId: 't3', students: 28, sessions: 4, length: 60 },
    ];
    const overlaps: Overlap[] = [['a', 'c', 20], ['b', 'd', 10]];
    const plan = planWeek(courses, rooms, overlaps, week);
    expect(plan.unplaced).toEqual([]);
    expect(plan.slots).toHaveLength(12);
    const info = new Map(courses.map((c) => [c.id, c]));
    const cap = new Map(rooms.map((r) => [r.id, r]));
    expect(findConflicts(plan.slots, info, cap, overlaps)).toEqual([]);
    for (const c of courses) {
      const days = plan.slots.filter((s) => s.courseId === c.id).map((s) => s.day);
      expect(new Set(days).size).toBe(days.length);
    }
    // The big course in the hall; nothing over lunch.
    expect(plan.slots.filter((s) => s.courseId === 'c').every((s) => s.roomId === 'big')).toBe(true);
    expect(plan.slots.some((s) => s.start < 13 * 60 && s.end > 12 * 60)).toBe(false);
  });

  it('keeps classes that stay and says why the rest can’t fit', () => {
    const tight = { days: [0], start: 9 * 60, end: 11 * 60, step: 60 };
    const courses: PlanCourse[] = [{ id: 'a', code: 'A', teacherId: 't1', students: 10, sessions: 2, length: 60 }];
    // The teacher already teaches 9–11 on Monday.
    const plan = planWeek(courses, rooms, [], tight, { fixed: [{ courseId: 'x', day: 0, start: 9 * 60, end: 11 * 60, roomId: 'small', teacherId: 't1' }] });
    expect(plan.slots).toEqual([]);
    expect(plan.unplaced).toEqual([{ courseId: 'a', missing: 2, reason: 'teacher' }]);
  });

  it('works out start times around the break', () => {
    expect(startTimes(week, 90)).toEqual([540, 600, 780, 840, 900]);
  });
});

describe('findConflicts', () => {
  it('finds a teacher or room in two places, shared students and small rooms', () => {
    const slots = [
      { courseId: 'a', day: 0, start: 540, end: 600, roomId: 'small' },
      { courseId: 'b', day: 0, start: 570, end: 630, roomId: 'small' },
      { courseId: 'c', day: 0, start: 540, end: 600, roomId: null },
    ];
    const courses = new Map([['a', { teacherId: 't1', students: 40 }], ['b', { teacherId: 't1', students: 10 }], ['c', { teacherId: 't2', students: 5 }]]);
    const kinds = findConflicts(slots, courses, new Map(rooms.map((r) => [r.id, r])), [['a', 'c', 3]]).map((c) => c.kind).sort();
    expect(kinds).toEqual(['capacity', 'noroom', 'room', 'students', 'teacher']);
  });
});

describe('planExams', () => {
  const sessions = examSessions('2026-11-02', '2026-11-04', [{ start: 540, end: 720 }, { start: 840, end: 1020 }]);

  it('makes sittings on weekdays only', () => {
    expect(examSessions('2026-10-30', '2026-11-02', [{ start: 540, end: 720 }]).map((s) => s.day)).toEqual(['2026-10-30', '2026-11-02']);
    expect(sessions).toHaveLength(6);
  });

  it('never gives a student two exams at once, and one a day when it can', () => {
    const exams = [
      { id: 'a', code: 'A', students: 40, length: 120 },
      { id: 'b', code: 'B', students: 40, length: 120 },
      { id: 'c', code: 'C', students: 40, length: 120 },
    ];
    const overlaps: Overlap[] = [['a', 'b', 30], ['b', 'c', 30], ['a', 'c', 30]];
    const plan = planExams(exams, [{ id: 'hall', name: 'Hall', capacity: 200 }], overlaps, sessions);
    expect(plan.unplaced).toEqual([]);
    const days = plan.placed.map((p) => sessions[p.session].day);
    expect(new Set(days).size).toBe(3);
    expect(plan.sameDay).toBe(0);
  });

  it('seats a big exam over several rooms, and says when there aren’t enough seats', () => {
    expect(seatExam(140, rooms)).toEqual([{ roomId: 'big', seats: 120 }, { roomId: 'small', seats: 20 }]);
    expect(seatExam(25, rooms)).toEqual([{ roomId: 'small', seats: 25 }]);
    expect(seatExam(200, rooms)).toBeNull();
    const plan = planExams([{ id: 'huge', code: 'H', students: 500, length: 120 }], rooms, [], sessions);
    expect(plan.unplaced).toEqual([{ courseId: 'huge', reason: 'rooms' }]);
    const long = planExams([{ id: 'x', code: 'X', students: 5, length: 240 }], rooms, [], sessions);
    expect(long.unplaced).toEqual([{ courseId: 'x', reason: 'length' }]);
  });
});
