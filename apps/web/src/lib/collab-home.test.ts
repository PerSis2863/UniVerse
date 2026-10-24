import { describe, expect, it } from 'vitest';
import { activityDays, dueThisWeek, notesToHtml, streakOf } from './collab-home';

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('collab home', () => {
  it('counts changes per day, oldest first', () => {
    const now = noon(2026, 10, 23);
    const days = activityDays([new Date(noon(2026, 10, 23)).toISOString(), new Date(noon(2026, 10, 22)).toISOString(), new Date(noon(2026, 10, 22)).toISOString(), new Date(noon(2026, 9, 1)).toISOString(), 'nope'], now, 7);
    expect(days).toEqual([0, 0, 0, 0, 0, 2, 1]);
  });

  it('keeps a streak through a quiet today', () => {
    expect(streakOf([1, 0, 1, 1, 2])).toBe(3);
    expect(streakOf([1, 1, 1, 0])).toBe(3);
    expect(streakOf([1, 0, 0])).toBe(0);
  });

  it('sorts my cards into the week and counts the overdue ones', () => {
    const now = noon(2026, 10, 23); // a Friday
    const iso = (t: number) => new Date(t).toISOString();
    const { days, overdue } = dueThisWeek([{ dueAt: iso(noon(2026, 10, 23) + 3600_000) }, { dueAt: iso(noon(2026, 10, 25)) }, { dueAt: iso(noon(2026, 10, 20)) }, { dueAt: null }, { dueAt: iso(noon(2026, 11, 20)) }], now);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
    expect(days.map((d) => d.items.length)).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(overdue).toBe(1);
  });

  it('turns notes into safe paragraphs and lists', () => {
    expect(notesToHtml('Ideas <b>\n- one\n* two\nend')).toBe('<p>Ideas &lt;b&gt;</p><ul><li><p>one</p></li><li><p>two</p></li></ul><p>end</p>');
  });
});
