import { describe, expect, it } from 'vitest';
import { cleanPath } from './analytics';

// M137: page addresses sent to PostHog never carry an id or a token.
describe('the addresses counted', () => {
  it('blanks ids and tokens, keeps the page', () => {
    expect(cleanPath('/student/courses')).toBe('/student/courses');
    expect(cleanPath('/s/a8f3k2m9q7x1z4w6v5b2n8c3')).toBe('/s/:id');
    expect(cleanPath('/call/g_cmv8jn4i90007psp7jdfqih1s')).toBe('/call/:id');
    expect(cleanPath('/t/AB12CD34?x=1#y')).toBe('/t/:id');
    expect(cleanPath('/')).toBe('/');
  });
});
