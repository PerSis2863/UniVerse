import { describe, expect, it } from 'vitest';
import { cleanCampusItem } from './campus';
import { courseColor } from './course-color';
import { byMonth } from './month-buckets';
import { planLimits } from './plan-limits';
import { safeHref } from './safe-href';
import { words } from './text-search';

describe('safeHref', () => {
  it.each(['/student', 'https://example.org', 'http://x.y', 'mailto:a@b.c', 'tel:+33123'])('keeps %s', (u) => expect(safeHref(u)).toBe(u));
  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,hi', '//evil.example', 'vbscript:x', 'ftp://x'])('drops %s', (u) => expect(safeHref(u)).toBeUndefined());
  it('nothing for empty', () => {
    expect(safeHref('')).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
  });
  it('trims', () => expect(safeHref('  /docs ')).toBe('/docs'));
});

describe('words', () => {
  it('lower case without accents or common words', () => expect(words('Qu’est-ce que la Révolution française?')).toEqual(['qu', 'revolution', 'francaise']));
  it('drops one-letter words and English stop words', () => expect(words('What is a B-tree in the index')).toEqual(['tree', 'index']));
  it('nothing for no words', () => expect(words('?! .')).toEqual([]));
});

describe('byMonth', () => {
  it('counts per UTC month', () => {
    const rows = [new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T23:59:00Z'), new Date('2026-10-01T00:00:00Z')];
    expect(byMonth(rows, (d) => d)).toEqual([
      { month: new Date('2026-09-01T00:00:00Z'), value: 2 },
      { month: new Date('2026-10-01T00:00:00Z'), value: 1 },
    ]);
  });
  it('sums a value', () => {
    expect(byMonth([{ at: new Date('2026-01-05Z'), h: 2.5 }, { at: new Date('2026-01-20Z'), h: 1 }], (r) => r.at, (r) => r.h)[0].value).toBe(3.5);
  });
});

describe('courseColor', () => {
  it('keeps CSS colours', () => {
    expect(courseColor('#123456')).toBe('#123456');
    expect(courseColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
  });
  it('turns Tailwind classes into colours', () => {
    expect(courseColor('bg-blue-500')).toBe('#3b82f6');
    expect(courseColor('emerald-600')).toBe('#10b981');
  });
  it('a stable colour from the code otherwise', () => {
    expect(courseColor(null, 'CS101')).toBe(courseColor(undefined, 'CS101'));
    expect(courseColor('bg-nope-500', 'X')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('cleanCampusItem', () => {
  it('trims and caps text', () => {
    const c = cleanCampusItem({ title: '  Library  ', description: 'x'.repeat(2000) });
    expect(c.title).toBe('Library');
    expect(c.description).toHaveLength(1000);
  });
  it('only http(s) links', () => {
    expect(cleanCampusItem({ url: 'https://u.edu' }).url).toBe('https://u.edu');
    expect(cleanCampusItem({ url: 'javascript:alert(1)' }).url).toBeNull();
  });
  it('dates and capacity', () => {
    expect(cleanCampusItem({ startAt: '2026-10-08T10:00:00Z' }).startAt?.toISOString()).toBe('2026-10-08T10:00:00.000Z');
    expect(cleanCampusItem({ startAt: 'tomorrow' }).startAt).toBeNull();
    expect(cleanCampusItem({ capacity: '40' }).capacity).toBe(40);
    expect(cleanCampusItem({ capacity: -1 }).capacity).toBeNull();
    expect(cleanCampusItem({ capacity: 1.5 }).capacity).toBeNull();
    expect(cleanCampusItem({ capacity: 10 ** 9 }).capacity).toBe(100_000);
  });
  it('empty strings become null', () => expect(cleanCampusItem({ title: '   ', category: 3 })).toMatchObject({ title: null, category: null }));
});

describe('planLimits', () => {
  it('Workers Free by default, Paid when set', () => {
    const before = process.env.WORKERS_PAID;
    delete process.env.WORKERS_PAID;
    expect(planLimits().livePushes).toBe(40);
    process.env.WORKERS_PAID = ' TRUE ';
    expect(planLimits().livePushes).toBe(500);
    if (before === undefined) delete process.env.WORKERS_PAID; else process.env.WORKERS_PAID = before;
  });
});
