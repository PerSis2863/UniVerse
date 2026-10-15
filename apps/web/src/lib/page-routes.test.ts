import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGE_ROUTES } from '../../cloudflare/page-routes.gen';
import { isBuiltPage, pageFor } from '../../cloudflare/page-match';
import { pageTable } from '../../scripts/gen-api-routes.mjs';

// The Worker answers pages with parameters with the page built once ahead of time (or a redirect), so
// opening one never starts the whole Next.js server on a fresh Worker (Workers Free: "Error 1101").
describe('pages answered without starting Next.js', () => {
  it('the table lists every page (run: node scripts/gen-api-routes.mjs)', () => {
    expect(readFileSync(new URL('../../cloudflare/page-routes.gen.ts', import.meta.url), 'utf8')).toBe(pageTable());
  });

  it('every page with parameters is built once or redirects (none rendered per request)', () => {
    for (const [route, pattern] of PAGE_ROUTES.filter(([, p]) => p)) {
      const address = route.replace(/\[[^\]]+\]/g, 'x%201');
      expect(new RegExp(pattern!).test(address), route).toBe(true);
      expect(pageFor(address, ''), route).not.toBeNull();
    }
  });

  it('answers each address with its own built page, never a neighbour', () => {
    expect(pageFor('/docs/cm123', '')).toEqual({ rewrite: '/docs/open' });
    expect(pageFor('/call/g_cmv8jn4i90007psp7jdfqih1s', '?kind=video')).toEqual({ rewrite: '/call/open' });
    expect(pageFor('/spaces/club/c1', '')).toEqual({ rewrite: '/spaces/open/open' });
    expect(pageFor('/spaces/club/c1/files', '')).toEqual({ rewrite: '/spaces/open/open/files' });
    expect(pageFor('/verify/scholarship/t1', '')).toEqual({ rewrite: '/verify/scholarship/open' });
    expect(pageFor('/verify/c1', '')).toEqual({ rewrite: '/verify/open' });
    expect(pageFor('/apply/status/t1', '')).toEqual({ rewrite: '/apply/status/open' });
    expect(pageFor('/apply/mit', '')).toEqual({ rewrite: '/apply/open' });
    expect(pageFor('/guardian/updates/t1', '')).toEqual({ rewrite: '/guardian/updates/open' });
  });

  it('leaves fixed pages, the built page itself, "/" endings and unknown addresses to Next.js', () => {
    for (const path of ['/', '/docs', '/student/assignments', '/student/courses', '/join', '/docs/open', '/spaces/open/open', '/docs/a/', '/nope/x', '/docs/a/b']) {
      expect(pageFor(path, ''), path).toBeNull();
    }
  });

  it('knows the built pages (link prefetches from them are skipped: Next.js knows them by "open")', () => {
    expect(isBuiltPage('/docs/open')).toBe(true);
    expect(isBuiltPage('/spaces/open/open/files')).toBe(true);
    expect(isBuiltPage('/docs/cm123')).toBe(false);
    expect(isBuiltPage('/student/assignments')).toBe(false);
    expect(isBuiltPage(null)).toBe(false);
  });

  it('redirects the two redirect-only pages, keeping the query', () => {
    expect(pageFor('/join/AB%20C', '')).toEqual({ redirect: '/join?code=AB%20C' });
    expect(pageFor('/join/ABC123', '?utm_source=wa')).toEqual({ redirect: '/join?code=ABC123&utm_source=wa' });
    expect(pageFor('/student/courses/c1', '')).toEqual({ redirect: '/student/blackboard?course=c1' });
    expect(pageFor('/join/%E0%A4%A', '')).toBeNull(); // bad %-encoding: Next.js answers it
  });
});
