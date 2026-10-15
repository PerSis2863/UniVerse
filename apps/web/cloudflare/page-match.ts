// Which page answers an address without starting Next.js. A page with parameters (/docs/<id>) used to
// be rendered per request, which starts the whole Next.js server on a fresh Worker (~1 s of CPU;
// Workers Free allows 10 ms, so Cloudflare showed "Error 1101"). Those pages are now built once ahead
// of time with every parameter "open" (/docs/open; their page.tsx) and read the real values from the
// address in the browser, so the Worker answers /docs/<id> with the built page. Two pages that only
// redirect are answered here directly.
import { PAGE_ROUTES } from './page-routes.gen';

type Route = { route: string; fixed: string; re: RegExp | null; pattern: string | null; built: string | null };
let routes: Route[] | null = null;

/** Pages that only send the visitor elsewhere (their page.tsx does the same for `next dev`). */
const REDIRECTS: Record<string, (value: string) => [path: string, param: string]> = {
  '/join/[inviteCode]': (code) => ['/join', `code=${encodeURIComponent(code)}`],
  '/student/courses/[id]': (id) => ['/student/blackboard', `course=${encodeURIComponent(id)}`],
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
    const rest = search.replace(/^\?/, '');
    return { redirect: `${path}?${param}${rest ? `&${rest}` : ''}` };
  }
  if (!r.built || pathname === r.built) return null;
  return { rewrite: r.built };
}
