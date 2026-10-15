import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ course: { findMany: vi.fn() }, calendarEvent: { findMany: vi.fn() } }));
vi.mock('@/lib/db', () => ({ default: db }));
vi.mock('./smart-planner', () => ({ feedBlocks: vi.fn().mockResolvedValue([]) }));

import { calendarFeed, courseCalendarIcs } from './ical';

const unfold = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n');

describe('calendar files', () => {
  it('the personal feed has assignment due dates too (Stage 5 · B2)', async () => {
    db.course.findMany.mockResolvedValue([{
      code: 'CS101', name: 'Intro', teacherId: 't1', staff: [], timetableSlots: [], quizzes: [],
      assignments: [{ id: 'a1', title: 'Recursion worksheet', dueDate: new Date('2026-10-20T17:00:00Z') }],
    }]);
    db.calendarEvent.findMany.mockResolvedValue([]);
    const lines = unfold(await calendarFeed('s1'));
    expect(lines).toContain('SUMMARY:Assignment due: Recursion worksheet (CS101)');
    expect(lines).toContain('DTEND:20261020T170000Z');
    // Only open assignments in the window are asked for.
    expect(db.course.findMany.mock.calls[0][0].select.assignments.where.status).toBe('OPEN');
  });

  it('a course file repeats classes weekly on their day and lists the dated items', () => {
    const ics = courseCalendarIcs({
      course: { id: 'c1', code: 'CS101', name: 'Intro, part 1' }, canManage: false,
      weekly: [{ id: 's1', dayOfWeek: 0, startTime: '09:00', endTime: '10:30', type: 'LECTURE', room: 'Room 4', createdAt: '2026-10-15T08:00:00.000Z' }],
      items: [
        { id: 'q1', kind: 'quiz', title: 'Week 4 check', at: '2026-10-18T12:00:00.000Z', endAt: null, note: 'Due', href: null },
        { id: 'e1', kind: 'event', title: 'Midterm', at: '2026-10-17T10:00:00.000Z', endAt: '2026-10-17T12:00:00.000Z', note: 'Exam · Hall B', href: null },
      ],
    });
    expect(ics.endsWith('\r\n')).toBe(true);
    const lines = unfold(ics);
    expect(lines).toContain('X-WR-CALNAME:CS101 Intro\\, part 1');
    // 0 is Monday in the timetable: the week of 15 Oct 2026 starts on Monday the 12th.
    expect(lines).toContain('DTSTART:20261012T090000');
    expect(lines).toContain('RRULE:FREQ=WEEKLY');
    expect(lines).toContain('LOCATION:Room 4');
    expect(lines).toContain('SUMMARY:Quiz due: Week 4 check (CS101)');
    expect(lines).toContain('DTSTART:20261018T113000Z');
    expect(lines).toContain('DESCRIPTION:Exam · Hall B');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
