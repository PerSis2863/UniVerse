import { describe, expect, it } from 'vitest';
import { usable } from './offline-reads';

describe('offline copies', () => {
  const now = new Date(2026, 9, 31, 15).getTime();
  const saved = (hoursAgo: number, uid = 'u1') => ({ uid, savedAt: now - hoursAgo * 3600_000 });

  it('only for the person who saved it, signed in', () => {
    expect(usable(saved(1), 'u1', false, now)).toBe(true);
    expect(usable(saved(1), 'u2', false, now)).toBe(false);
    expect(usable(saved(1), null, false, now)).toBe(false);
  });

  it('not after two weeks', () => {
    expect(usable(saved(13 * 24), 'u1', false, now)).toBe(true);
    expect(usable(saved(15 * 24), 'u1', false, now)).toBe(false);
  });

  it("today's answers only on the day they were saved", () => {
    expect(usable(saved(10), 'u1', true, now)).toBe(true); // 05:00 today
    expect(usable(saved(16), 'u1', true, now)).toBe(false); // 23:00 yesterday
  });
});

describe('reads kept for offline use (M305)', () => {
  it('keeps the calendar, grades, a course’s plan and packs, and Relief’s plan, nothing else of theirs', async () => {
    const { keptOffline } = await import('./offline-reads');
    for (const u of ['/api/core/calendar/my', '/api/core/grades/student', '/api/core/lesson-plans?courseId=c123', '/api/core/revision-packs?courseId=c123', '/api/core/relief/plan', '/api/notifications']) expect(keptOffline(u)).toBe(true);
    for (const u of ['/api/core/lesson-plans?courseId=c1&x=1', '/api/core/users/me/export', '/api/core/trace/brand']) expect(keptOffline(u)).toBe(false);
  });
});
