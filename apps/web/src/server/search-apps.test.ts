import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ default: {} }));
import { pagesFor } from './search-apps';

// M303: the apps' pages are found by any of their words, all words needed.
describe('pages by name', () => {
  it('finds a page by its words', () => {
    expect(pagesFor('free room').map((p) => p.href)).toEqual(['/campus-map']);
    expect(pagesFor('trip').map((p) => p.title)).toContain('Trip planner');
    expect(pagesFor('go bag')[0]).toMatchObject({ title: 'Be ready', subtitle: 'Relief' });
    expect(pagesFor('x')).toEqual([]);
    expect(pagesFor('free unicorn')).toEqual([]);
  });
});
