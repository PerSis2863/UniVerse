import { describe, expect, it } from 'vitest';
import { dueChip } from './due-chip';

const now = Date.UTC(2026, 9, 20, 9, 0);
const MIN = 60_000, H = 60 * MIN, D = 24 * H;

describe('due-date countdown chips (Q23)', () => {
  it('counts minutes, hours, then days', () => {
    expect(dueChip(now + 40 * MIN, now)).toEqual({ label: 'Due in 40 min', tone: 'soon' });
    expect(dueChip(now + 5 * H + 10 * MIN, now)).toEqual({ label: 'Due in 5 h', tone: 'soon' });
    expect(dueChip(now + 20 * H, now)).toEqual({ label: 'Due in 20 h', tone: 'today' });
    expect(dueChip(now + 30 * H, now)).toEqual({ label: '1 day left', tone: 'week' });
    expect(dueChip(now + 3 * D + H, now)).toEqual({ label: '3 days left', tone: 'week' });
  });
  it('shows nothing when past, far off, or before the clock is known', () => {
    expect(dueChip(now - MIN, now)).toBeNull();
    expect(dueChip(now + 8 * D, now)).toBeNull();
    expect(dueChip(now + H, 0)).toBeNull();
  });
});
