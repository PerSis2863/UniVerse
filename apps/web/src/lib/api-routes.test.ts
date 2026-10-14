import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { API_ROUTES } from '../../cloudflare/api-routes.gen';
import { matchApiRoute } from '../../cloudflare/api-match';
import { table } from '../../scripts/gen-api-routes.mjs';

const require = createRequire(import.meta.url);
const { getRouteRegex } = require('next/dist/shared/lib/router/utils/route-regex');
const { getRouteMatcher } = require('next/dist/shared/lib/router/utils/route-matcher');

// The direct API path (cloudflare/api-direct.ts) must pick the route Next.js picks, with the same params.
describe('direct API routes', () => {
  it('the table lists every route in src/app/api (run: node scripts/gen-api-routes.mjs)', () => {
    expect(readFileSync(new URL('../../cloudflare/api-routes.gen.ts', import.meta.url), 'utf8')).toBe(table());
  });

  it('matches like Next.js for an address of every route', () => {
    const next = API_ROUTES.map(([route]) => ({ route, match: getRouteMatcher(getRouteRegex(route)) }));
    for (const [route] of API_ROUTES) {
      const path = route.replace(/\[\[\.\.\.[^\]]+\]\]/, 'x/y').replace(/\[\.\.\.[^\]]+\]/, 'a/b c').replace(/\[[^\]]+\]/g, 'id%201');
      const expected = next.find((r) => r.match(path));
      const got = matchApiRoute(path);
      expect(got?.route, path).toBe(expected?.route);
      expect(got?.params, path).toEqual(expected?.match(path));
    }
  });

  it('decodes parameters and prefers fixed segments', () => {
    expect(matchApiRoute('/api/docs')?.route).toBe('/api/docs');
    expect(matchApiRoute('/api/docs/a%20b')).toMatchObject({ route: '/api/docs/[id]', params: { id: 'a b' } });
    expect(matchApiRoute('/api/boards/versions/v1')?.route).toBe('/api/boards/versions/[vid]');
    expect(matchApiRoute('/api/boards/b1')?.route).toBe('/api/boards/[id]');
    expect(matchApiRoute('/api/core/courses/c1/students')).toMatchObject({ route: '/api/core/[...path]', params: { path: ['courses', 'c1', 'students'] } });
    expect(matchApiRoute('/api/no-such-thing')).toBeNull();
    expect(() => matchApiRoute('/api/docs/%E0%A4%A')).toThrow(URIError);
  });
});
