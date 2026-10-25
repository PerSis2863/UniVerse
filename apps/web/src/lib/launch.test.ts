import { describe, expect, it } from 'vitest';
import { launchSummary, launchTotal } from './launch';

const DAY = 86_400_000, now = Date.parse('2026-10-26T12:00:00Z');

describe('launch board', () => {
  it('counts people, new ones this week and the ones who came back', () => {
    const s = launchSummary([
      { userId: 'a', at: now - 20 * DAY }, { userId: 'a', at: now - 2 * DAY }, // came back
      { userId: 'b', at: now - DAY }, { userId: 'b', at: now - DAY + 60_000 }, // new, same day twice
      { userId: '', at: now },
    ], now);
    expect(s).toEqual({ people: 2, newThisWeek: 1, cameBack: 1, last: new Date(now - DAY + 60_000).toISOString() });
  });
  it('is empty without rows', () => {
    expect(launchSummary([], now)).toEqual({ people: 0, newThisWeek: 0, cameBack: 0, last: null });
  });
  it('joins the apps by person', () => {
    expect(launchTotal([{ userId: 'a', at: now }, { userId: 'a', at: now - 3 * DAY }, { userId: 'b', at: now }])).toEqual({ people: 2, cameBack: 1 });
  });
});
