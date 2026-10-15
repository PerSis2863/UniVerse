// Pages built once ahead of time and served for every address of their route (cloudflare/worker.ts,
// cloudflare/page-routes.gen.ts) read their [params] from the address instead of Next.js's params,
// which hold the placeholder they were built with ("open").

/** The values of `pattern`'s [params] in `pathname` (decoded), or null when the address doesn't fit. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean);
  const got = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (want.length !== got.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const m = /^\[(\w+)\]$/.exec(want[i]);
    if (!m) {
      if (want[i] !== got[i]) return null;
      continue;
    }
    try {
      out[m[1]] = decodeURIComponent(got[i]);
    } catch {
      return null;
    }
  }
  return out;
}
