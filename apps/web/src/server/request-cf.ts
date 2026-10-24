import { getCloudflareContext } from '@opennextjs/cloudflare';

export type RequestCf = { timezone?: string; city?: string; country?: string; region?: string; latitude?: string; longitude?: string };

/**
 * Cloudflare's guess of where a request comes from (time zone, city, country). Next.js routes get a
 * copy of the request without it (request.cf is dropped on the way in), so it comes from the Worker's
 * context for this request. The light API path (cloudflare/fast-api.ts) reads request.cf directly.
 */
export function requestCf(req: Request): RequestCf | undefined {
  const own = (req as Request & { cf?: RequestCf }).cf;
  if (own) return own;
  try {
    return getCloudflareContext().cf as RequestCf | undefined;
  } catch {
    return undefined;
  }
}
