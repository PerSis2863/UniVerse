import type { Role, User } from '@prisma/client';
import type { RateLimit } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ForbiddenException, HttpException, NotFoundException } from './http';
import { extractBearer, resolveUser } from './auth';

// A small router for the API that used to run as a NestJS app on Render (apps/api). Routes keep
// their NestJS paths, guards (sign-in + @Roles) and response conventions, and are served from
// /api/core/* by src/app/api/core/[...path]/route.ts.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Ctx<P extends Record<string, string> = Record<string, string>> {
  /** The signed-in user (routes declared with `public: true` get null). */
  user: User;
  params: P;
  query: Record<string, any>;
  body: any;
  req: Request;
}

export interface RouteOptions {
  /** Skip sign-in (NestJS routes without FirebaseAuthGuard). */
  public?: boolean;
  /** Allowed roles (NestJS @Roles). */
  roles?: Role[];
  /** Response status on success (NestJS default: 201 for POST, otherwise 200). */
  status?: number;
}

interface Route extends RouteOptions {
  method: Method;
  segments: string[];
  handler: (ctx: Ctx<any>) => unknown;
}

export class Router {
  private routes: Route[] = [];

  constructor(private prefix = '') {}

  /** A group of routes under a path prefix, sharing options (like a NestJS controller). */
  controller(prefix: string, shared: RouteOptions = {}) {
    const base = [this.prefix, prefix].filter(Boolean).join('/');
    const add = (method: Method) =>
      <P extends Record<string, string> = Record<string, string>>(
        path: string,
        a: RouteOptions | ((ctx: Ctx<P>) => unknown),
        b?: (ctx: Ctx<P>) => unknown,
      ) => {
        const options = typeof a === 'function' ? {} : a;
        const handler = (typeof a === 'function' ? a : b)!;
        const full = [base, path].filter(Boolean).join('/');
        this.routes.push({ ...shared, ...options, method, segments: split(full), handler });
      };
    return { get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') };
  }

  match(method: string, path: string) {
    const parts = split(path);
    let pathMatched = false;
    for (const r of this.routes) {
      if (r.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = r.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pathMatched = true;
      if (r.method === method) return { route: r, params };
    }
    return { route: null, params: {}, pathMatched };
  }

  async handle(req: Request, path: string): Promise<Response> {
    try {
      if (await rateLimited(req)) {
        return Response.json({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, { status: 429 });
      }
      const { route, params } = this.match(req.method, path);
      if (!route) throw new NotFoundException(`Cannot ${req.method} /api/${path}`);

      const user = route.public ? null : await resolveUser(extractBearer(req.headers.get('authorization')));
      if (route.roles && (!user || !route.roles.includes(user.role))) throw new ForbiddenException('Forbidden resource');

      const result = await route.handler({ user: user as User, params, query: parseQuery(new URL(req.url)), body: await readBody(req), req });
      if (result instanceof Response) return result;
      const status = route.status ?? (req.method === 'POST' ? 201 : 200);
      if (result === undefined || result === null) return new Response(null, { status });
      return Response.json(result, { status });
    } catch (error) {
      if (error instanceof HttpException) return Response.json(error.toJSON(), { status: error.getStatus() });
      console.error(`${req.method} /api/core/${path} failed:`, error);
      return Response.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 });
    }
  }
}

declare global {
  interface CloudflareEnv {
    API_RATE_LIMITER?: RateLimit;
  }
}

/** 100 requests/minute per client IP (the old API's global ThrottlerGuard). Off where the binding is missing. */
async function rateLimited(req: Request) {
  let limiter: RateLimit | undefined;
  try {
    limiter = getCloudflareContext().env.API_RATE_LIMITER;
  } catch {
    return false;
  }
  const ip = req.headers.get('cf-connecting-ip');
  if (!limiter || !ip) return false;
  const { success } = await limiter.limit({ key: ip });
  return !success;
}

function split(path: string) {
  return path.split('/').filter(Boolean);
}

/** Query string → object like Express: repeated keys and `key[]` become arrays. */
function parseQuery(url: URL) {
  const out: Record<string, any> = {};
  for (const [rawKey, value] of url.searchParams) {
    const key = rawKey.endsWith('[]') ? rawKey.slice(0, -2) : rawKey;
    if (key in out) out[key] = ([] as string[]).concat(out[key], value);
    else out[key] = rawKey.endsWith('[]') ? [value] : value;
  }
  return out;
}

async function readBody(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return req.clone().json().catch(() => ({}));
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(await req.clone().text()));
  // multipart and other bodies are read by the handler itself via ctx.req.
  return {};
}
