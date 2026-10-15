import { describe, expect, it } from 'vitest';
import { routeOf } from './route-label';

describe('API routes for the Health numbers', () => {
  it('replaces ids, keeps the words', () => {
    expect(routeOf('/api/core/courses/cmulde0g900147d341qn9mxlw/students')).toBe('/api/core/courses/:id/students');
    expect(routeOf('/api/chat/conversations/cmulde03m00087d34mm292mhk/messages')).toBe('/api/chat/conversations/:id/messages');
    expect(routeOf('/api/calls/g_cmv8jn4i/ticket')).toBe('/api/calls/:id/ticket');
    expect(routeOf('/api/receipts/123')).toBe('/api/receipts/:id');
    expect(routeOf('/api/chat/users/alice%40x.com')).toBe('/api/chat/users/:id');
    expect(routeOf('/api/bootstrap')).toBe('/api/bootstrap');
    expect(routeOf('/api/a/b/c/d/e/f/g/h/i')).toBe('/api/a/b/c/d/e/f');
  });
});
