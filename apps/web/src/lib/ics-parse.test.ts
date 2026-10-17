import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics-parse';

const file = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');

describe('parseIcs', () => {
  it('reads UTC times, a named time zone, folded lines and escapes', () => {
    const out = parseIcs(file(
      'BEGIN:VEVENT', 'DTSTART:20261020T090000Z', 'DTEND:20261020T103000Z', 'SUMMARY:Dentist\\, then lunch', 'LOCATION:High St', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=Asia/Kolkata:20261021T140000', 'DURATION:PT45M', 'SUMMARY:Tuition with a very long', ' title', 'DESCRIPTION:Line one\\nLine two', 'END:VEVENT',
    ));
    expect(out).toEqual([
      { title: 'Dentist, then lunch', startAt: '2026-10-20T09:00:00.000Z', endAt: '2026-10-20T10:30:00.000Z', description: 'High St' },
      { title: 'Tuition with a very longtitle', startAt: '2026-10-21T08:30:00.000Z', endAt: '2026-10-21T09:15:00.000Z', description: 'Line one\nLine two' },
    ]);
  });

  it('reads whole days in the viewer’s zone and skips cancelled events', () => {
    const out = parseIcs(file(
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261102', 'DTEND;VALUE=DATE:20261103', 'SUMMARY:Holiday', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261103T090000Z', 'STATUS:CANCELLED', 'SUMMARY:Gone', 'END:VEVENT',
    ), { timeZone: 'Europe/London' });
    expect(out).toEqual([{ title: 'Holiday', startAt: '2026-11-02T00:00:00.000Z', endAt: '2026-11-03T00:00:00.000Z' }]);
  });

  it('unrolls weekly repeats, keeping the clock time when summer time ends', () => {
    const out = parseIcs(file(
      'BEGIN:VEVENT', 'DTSTART;TZID=Europe/London:20261019T180000', 'DTEND;TZID=Europe/London:20261019T190000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Football', 'END:VEVENT',
    ));
    // 18:00 in London: 17:00 UTC in summer time, 18:00 UTC after 25 October.
    expect(out.map((e) => e.startAt)).toEqual(['2026-10-19T17:00:00.000Z', '2026-10-26T18:00:00.000Z', '2026-11-02T18:00:00.000Z']);
  });

  it('follows BYDAY, UNTIL, and leaves out what ended before `from`', () => {
    const out = parseIcs(file(
      'BEGIN:VEVENT', 'DTSTART:20261005T080000Z', 'DTEND:20261005T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261015T000000Z', 'SUMMARY:Gym', 'END:VEVENT',
    ), { from: Date.parse('2026-10-08T00:00:00Z') });
    expect(out.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-10-12', '2026-10-14']);
  });
});
