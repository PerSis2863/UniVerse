import { describe, expect, it } from 'vitest';
import { pageKey } from './web-vitals';

describe('pageKey', () => {
  it('keeps plain pages', () => {
    expect(pageKey('/student/courses')).toBe('/student/courses');
    expect(pageKey('/')).toBe('/');
  });
  it('replaces ids', () => {
    expect(pageKey('/docs/cmulde1h0000abcdxyz12345')).toBe('/docs/:id');
    expect(pageKey('/boards/123/edit')).toBe('/boards/:id/edit');
    expect(pageKey('/calls/3f2b8c1e-9a4d-4e2b-8f1a-2c3d4e5f6a7b')).toBe('/calls/:id');
  });
  it('keeps long words without digits', () => {
    expect(pageKey('/student/administrative/scholarships')).toBe('/student/administrative/scholarships');
  });
  it('drops the query and hash', () => expect(pageKey('/tasks?view=week#today')).toBe('/tasks'));
  it('caps the length', () => expect(pageKey('/' + 'a'.repeat(300)).length).toBeLessThanOrEqual(120));
});
