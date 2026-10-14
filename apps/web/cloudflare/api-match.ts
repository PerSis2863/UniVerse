// Which API route an address belongs to, as Next.js decides it: the routes in Next.js's match order
// with Next.js's own patterns (api-routes.gen.ts), parameters decoded like its getRouteMatcher.
import { API_ROUTES } from './api-routes.gen';

type Route = { route: string; fixed: string; exact: boolean; pattern: string; re?: RegExp; params: [string, boolean][]; load: () => Promise<Record<string, unknown>> };
let routes: Route[] | null = null;

/** The route, its module and its decoded parameters, or null. Throws (URIError) for a parameter that isn't valid %-encoding. */
export function matchApiRoute(pathname: string) {
  // The part before the first parameter rules most routes out with one string check; patterns are
  // compiled only for routes that could match.
  routes ??= API_ROUTES.map(([route, pattern, params, load]) => ({ route, fixed: route.split('[')[0], exact: !route.includes('['), pattern, params, load }));
  for (const route of routes) {
    if (route.exact ? pathname !== route.fixed : !pathname.startsWith(route.fixed.replace(/\/$/, ''))) continue;
    route.re ??= new RegExp(route.pattern);
    const m = route.re.exec(pathname);
    if (!m) continue;
    const params: Record<string, string | string[]> = {};
    route.params.forEach(([name, many], i) => {
      const value = m[i + 1];
      if (value !== undefined) params[name] = many ? value.split('/').map((s) => decodeURIComponent(s)) : decodeURIComponent(value);
    });
    return { route: route.route, load: route.load, params };
  }
  return null;
}
