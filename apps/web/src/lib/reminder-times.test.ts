import { describe, expect, it } from 'vitest';
import { MAX_AHEAD_MS, reminderChoices, snoozeChoices, validReminderTime } from './reminder-times';

const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('reminder choices', () => {
  it('offers this evening only before 5 pm', () => {
    const morning = reminderChoices(local(2026, 10, 7, 10, 30)); // a Wednesday
    expect(morning.map((c) => c.id)).toEqual(['20m', '1h', '3h', 'evening', 'tomorrow', 'monday']);
    expect(morning.find((c) => c.id === 'evening')!.at).toEqual(local(2026, 10, 7, 18));
    expect(reminderChoices(local(2026, 10, 7, 17, 5)).map((c) => c.id)).not.toContain('evening');
  });
  it('works out tomorrow morning and next Monday from the local clock', () => {
    const wed = reminderChoices(local(2026, 10, 7, 22));
    expect(wed.find((c) => c.id === 'tomorrow')!.at).toEqual(local(2026, 10, 8, 9));
    expect(wed.find((c) => c.id === 'monday')!.at).toEqual(local(2026, 10, 12, 9));
    // On a Monday, next week is a week on; on a Sunday, it's tomorrow.
    expect(reminderChoices(local(2026, 10, 12, 8)).find((c) => c.id === 'monday')!.at).toEqual(local(2026, 10, 19, 9));
    expect(reminderChoices(local(2026, 10, 11, 8)).find((c) => c.id === 'monday')!.at).toEqual(local(2026, 10, 12, 9));
  });
  it('relative choices count from now; snoozing offers an hour or tomorrow', () => {
    const now = local(2026, 10, 7, 10);
    expect(reminderChoices(now)[0].at.getTime() - now.getTime()).toBe(20 * 60_000);
    expect(snoozeChoices(now).map((c) => c.id)).toEqual(['1h', 'tomorrow']);
  });
  it('accepts a time from a minute to 60 days ahead', () => {
    const now = local(2026, 10, 7, 10);
    expect(validReminderTime(new Date(now.getTime() + 30_000), now)).toBe(false);
    expect(validReminderTime(new Date(now.getTime() + 60_000), now)).toBe(true);
    expect(validReminderTime(new Date(now.getTime() + MAX_AHEAD_MS + 1), now)).toBe(false);
    expect(validReminderTime(new Date('nonsense'), now)).toBe(false);
  });
});
