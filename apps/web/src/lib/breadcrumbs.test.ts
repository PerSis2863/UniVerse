import { describe, expect, it } from 'vitest';
import { crumbsFor } from './breadcrumbs';

const nav = [
  { href: '/student', label: 'Dashboard', also: ['/student/calendar'] },
  { label: 'Schooling', subItems: [
    { href: '/student/courses', label: 'Courses', also: ['/student/live'] },
    { href: '/student/assignments', label: 'Assignments & grades', also: ['/student/grades'] },
  ] },
  { href: '/student/settings?section=language', label: 'Settings' },
];

describe('where am I (breadcrumbs)', () => {
  it('names the menu group and entry of a page, its tabs and the pages under it', () => {
    expect(crumbsFor(nav, '/student/courses')).toEqual({ group: 'Schooling', entry: { label: 'Courses', href: '/student/courses' } });
    expect(crumbsFor(nav, '/student/grades')?.entry.label).toBe('Assignments & grades');
    expect(crumbsFor(nav, '/student/courses/abc/week-2')).toEqual({ group: 'Schooling', entry: { label: 'Courses', href: '/student/courses' } });
    expect(crumbsFor(nav, '/student/settings')).toEqual({ entry: { label: 'Settings', href: '/student/settings' } });
  });

  it('prefers the closest entry over the home page every page sits under', () => {
    expect(crumbsFor(nav, '/student/calendar')?.entry.label).toBe('Dashboard');
    expect(crumbsFor(nav, '/student/live/xyz')?.entry.label).toBe('Courses');
  });

  it('shows nothing for a page in no menu', () => {
    expect(crumbsFor(nav, '/teacher/students')).toBeNull();
  });
});
