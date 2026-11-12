// Which page answers an address without starting Next.js. A page with parameters (/docs/<id>) used to
// be rendered per request, which starts the whole Next.js server on a fresh Worker (~1 s of CPU;
// Workers Free allows 10 ms, so Cloudflare showed "Error 1101"). Those pages are now built once ahead
// of time with every parameter "open" (/docs/open; their page.tsx) and read the real values from the
// address in the browser, so the Worker answers /docs/<id> with the built page. Two pages that only
// redirect are answered here directly.
import { PAGE_ROUTES } from './page-routes.gen';
import { gs1Target } from '../src/lib/dpp';

type Route = { route: string; fixed: string; re: RegExp | null; pattern: string | null; built: string | null };
let routes: Route[] | null = null;

/** Pages that only send the visitor elsewhere (their page.tsx does the same for `next dev`). */
const REDIRECTS: Record<string, (value: string) => [path: string, param: string]> = {
  '/join/[inviteCode]': (code) => ['/join', `code=${encodeURIComponent(code)}`],
  '/student/courses/[id]': (id) => ['/student/blackboard', `course=${encodeURIComponent(id)}`],
  // GS1 Digital Link (M108): a unit's passport, or the product's (src/lib/dpp.ts); anything else lands
  // on /dpp, which says there's no passport (so Next.js never starts for a made-up address).
  '/01/[...gs1]': (rest) => gs1Target(rest) ?? ['/dpp', ''],
};

let builtPages: Set<string> | null = null;
/** Whether `pathname` is one of the pages built once for every address (/docs/open, …). */
export function isBuiltPage(pathname: string | null): boolean {
  builtPages ??= new Set(PAGE_ROUTES.flatMap(([, , b]) => (b ? [b] : [])));
  return !!pathname && builtPages.has(pathname);
}

/** The page route Next.js would pick for `pathname` (null: none, so its 404 page). */
function routeOf(pathname: string): Route | null {
  routes ??= PAGE_ROUTES.map(([route, pattern, built]) => ({ route, fixed: route.split('[')[0], re: null, pattern, built }));
  for (const r of routes) {
    if (!r.pattern) {
      if (pathname === r.route) return r;
      continue;
    }
    if (!pathname.startsWith(r.fixed)) continue;
    r.re ??= new RegExp(r.pattern);
    if (r.re.test(pathname)) return r;
  }
  return null;
}

/**
 * For a page request: the built page that answers it ({ rewrite }), a redirect ({ redirect }), or
 * null (Next.js handles it as before: fixed pages come from the cache anyway). Addresses ending in
 * "/" are left to Next.js, which redirects them to the address without it.
 */
export function pageFor(pathname: string, search: string): { rewrite: string } | { redirect: string } | null {
  if (pathname.length > 1 && pathname.endsWith('/')) return null;
  const r = routeOf(pathname);
  if (!r?.pattern) return null;
  const go = REDIRECTS[r.route];
  if (go) {
    let value: string;
    try {
      value = decodeURIComponent(pathname.slice(r.fixed.length));
    } catch {
      return null; // bad %-encoding: Next.js answers 400
    }
    const [path, param] = go(value);
    const query = [param, search.replace(/^\?/, '')].filter(Boolean).join('&');
    return { redirect: query ? `${path}?${query}` : path };
  }
  if (!r.built || pathname === r.built) return null;
  return { rewrite: r.built };
}

/**
 * Whether a request to a page address is one the app makes: reading the page, or a Server Action
 * (always sent with its Next-Action header; no form in the app posts to a page). Anything else is a
 * probe, refused without starting Next.js: a broken upload form posted to "/" made Next.js fail with
 * a 500 (the live error report of 10 Nov 2026), and each such request cost a page render.
 */
export const pageRequestOk = (method: string, serverAction: boolean): boolean => method === 'GET' || method === 'HEAD' || (method === 'POST' && serverAction);
