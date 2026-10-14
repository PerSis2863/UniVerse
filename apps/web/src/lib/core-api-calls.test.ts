import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { api } from '@/server/app';

// Calls through the core API client (src/lib/api.ts: `api.get('/courses')`, SWR keys with `fetcher`)
// go to /api/core/<path>, answered by src/server/app.ts. A path with no route there fails only when
// someone uses that screen (the DPDP grievance form posted to a route that never existed; Consents and
// Trust passed full /api/... addresses, so the app asked for /api/core/api/...). This finds them all.
const SRC = new URL('../', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'sample' ? [] : files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

// A `${…}` segment can be anything (an id, or an action such as approve/reject), so it matches any
// segment; the query string isn't part of the route.
type Route = { method: string; segments: string[] };
const routes = (api as unknown as { routes: Route[] }).routes;
const hasRoute = (method: string, raw: string) => {
  const parts = raw.split('?')[0].replace(/\$\{[^}]*\}/g, '\u0000').split('/').filter(Boolean);
  return routes.some((r) => r.method === method && r.segments.length === parts.length && r.segments.every((seg, i) => parts[i] === '\u0000' || seg.startsWith(':') || seg === parts[i]));
};

describe('core API client calls', () => {
  it('every call has a route in src/server/app.ts', () => {
    const missing: string[] = [];
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (!/from '@\/lib\/(api|fetcher)'/.test(text)) continue;
      const calls = [
        ...[...text.matchAll(/\bapi\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*(['`])(\/[^'`]*)\2/g)].map((m) => [m[1].toUpperCase(), m[3]]),
        ...[...text.matchAll(/useSWR(?:<[^>]*>)?\(\s*(['`])(\/[^'`]*)\1\s*,\s*fetcher/g)].map((m) => ['GET', m[2]]),
      ];
      for (const [method, raw] of calls) {
        if (!hasRoute(method, raw)) missing.push(`${method} /api/core${raw}  (${file.slice(SRC.length)})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
