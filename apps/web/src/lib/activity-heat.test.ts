import { describe, expect, it } from 'vitest';
import { heatLevel, heatOf } from './activity-heat';

describe('heatOf', () => {
  it('counts by weekday and hour in the viewer’s time zone, and by area', () => {
    // Monday 9 Nov 2026, 22:30 UTC: Tuesday 04:00 in India (+330 min).
    const h = heatOf([
      { createdAt: new Date('2026-11-09T22:30:00Z'), action: 'grade.updated' },
      { createdAt: new Date('2026-11-09T22:45:00Z'), action: 'grade.updated' },
      { createdAt: new Date('2026-11-15T10:00:00Z'), action: 'user.role_changed' },
    ], 330);
    expect(h.total).toBe(3);
    expect(h.cells[1][4]).toBe(2);
    expect(h.cells[6][15]).toBe(1);
    expect(h.areas).toEqual({ grade: 2, user: 1 });
    expect(heatOf([{ createdAt: new Date('2026-11-09T22:30:00Z'), action: 'x' }], 0).cells[0][22]).toBe(1);
  });
  it('shades from 0 to 4 against the busiest', () => {
    expect([0, 1, 2, 3, 4, 8].map((n) => heatLevel(n, 8))).toEqual([0, 1, 1, 2, 2, 4]);
    expect(heatLevel(3, 0)).toBe(0);
  });
});
