import { describe, expect, it } from 'vitest';
import { matchPath } from './path-params';

describe('page params from the address', () => {
  it('reads [params], decoded, only when the address fits', () => {
    expect(matchPath('/docs/[id]', '/docs/abc123')).toEqual({ id: 'abc123' });
    expect(matchPath('/docs/[id]', '/docs/abc123/')).toEqual({ id: 'abc123' });
    expect(matchPath('/spaces/[kind]/[id]/files', '/spaces/course/c1/files')).toEqual({ kind: 'course', id: 'c1' });
    expect(matchPath('/verify/[id]', '/verify/UV-2026%2F17')).toEqual({ id: 'UV-2026/17' });
    expect(matchPath('/student/profile/[id]', '/student/profile/Asha%20Rao')).toEqual({ id: 'Asha Rao' });
    expect(matchPath('/docs/[id]', '/docs')).toBeNull();
    expect(matchPath('/docs/[id]', '/boards/x')).toBeNull();
    expect(matchPath('/spaces/[kind]/[id]', '/spaces/course/c1/files')).toBeNull();
    expect(matchPath('/docs/[id]', '/docs/%E0%A4%A')).toBeNull(); // not valid %-encoding
  });
});
