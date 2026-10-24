import { describe, expect, it } from 'vitest';
import { businessRedirect, inboxFor, settingsFor } from './business';

describe('businessRedirect', () => {
  it('keeps the business app', () => {
    for (const p of ['/trace', '/trace/map', '/trace/tracking', '/collab', '/docs/abc', '/console', '/student/inbox', '/admin/settings', '/calls', '/notifications']) expect(businessRedirect(p)).toBeNull();
  });
  it('sends school pages to Trace', () => {
    for (const p of ['/student', '/student/courses', '/teacher/grades', '/admin', '/admin/fees', '/library', '/campus-map', '/impact-league/x']) expect(businessRedirect(p)).toBe('/trace');
  });
  it('leaves other addresses alone', () => {
    expect(businessRedirect('/studentx')).toBeNull();
    expect(businessRedirect('/blog')).toBeNull();
  });
});

describe('inboxFor / settingsFor', () => {
  it('follow the role', () => {
    expect(inboxFor('ADMIN')).toBe('/admin/inbox');
    expect(inboxFor('STUDENT')).toBe('/student/inbox');
    expect(settingsFor('TEACHER')).toBe('/teacher/settings');
  });
});
