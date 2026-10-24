import { describe, expect, it } from 'vitest';
import { appFor, appHome, isShared } from './apps';

describe('apps', () => {
  it('finds the app an address belongs to', () => {
    expect(appFor('/student/courses')?.id).toBe('campus');
    expect(appFor('/admin')?.id).toBe('campus');
    expect(appFor('/trace/map')?.id).toBe('trace');
    expect(appFor('/t/ABC')?.id).toBe('trace');
    expect(appFor('/relief')?.id).toBe('relief');
    expect(appFor('/green/teams')?.id).toBe('green');
  });
  it('treats shared tools as no app', () => {
    for (const p of ['/student/inbox', '/admin/settings', '/collab', '/docs/x', '/hub', '/console']) {
      expect(isShared(p)).toBe(true);
      expect(appFor(p)).toBeNull();
    }
    expect(appFor('/traceability')).toBeNull();
  });
  it('opens Campus by role', () => {
    expect(appHome('campus', 'TEACHER')).toBe('/teacher');
    expect(appHome('campus', 'STUDENT')).toBe('/student');
    expect(appHome('trace')).toBe('/trace');
  });
});
