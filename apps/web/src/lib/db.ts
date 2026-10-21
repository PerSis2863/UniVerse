import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';
import { mergeParts, partArgs, planSplit } from './d1-split';

// The database is Cloudflare D1 (SQLite), reached through its `DB` binding (wrangler.jsonc).
// In `next dev` the binding is a local D1 provided by wrangler (see initOpenNextCloudflareForDev
// in next.config.ts). The binding can be reused across requests, so one client per binding.
declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

// D1 on Workers Free answers at most 50 queries in one request (a cron run is one request too).
// Each request's queries are counted: a warning in the logs names the query that reaches 40 and 50,
// and long jobs can ask queriesUsed() to stop in time and carry on in the next run.
const used = new WeakMap<object, number>();
function requestKey(): object | null {
  // Only on Workers (and wrangler): under `next dev` the context can be one object for every request.
  if (!onWorkers) return null;
  try { return (getCloudflareContext().ctx as object | undefined) ?? null; } catch { return null; }
}
/** How many database queries this request has made so far (0 outside a request). */
export function queriesUsed(): number {
  const key = requestKey();
  return key ? used.get(key) ?? 0 : 0;
}
function counted(model: string | undefined, operation: string, n = 1) {
  const key = requestKey();
  if (!key) return;
  const before = used.get(key) ?? 0, now = before + n;
  used.set(key, now);
  for (const mark of [40, 50]) if (before < mark && now >= mark) console.warn(`D1: ${now} queries in one request (Workers Free allows 50); this one: ${model ?? 'raw'}.${operation}`, new Error().stack?.split('\n').slice(2, 7).map((l) => l.trim()).join(' | '));
}

/**
 * Queries with a long `in` list (a big class, group or school) run in parts that fit D1's 100
 * values (src/lib/d1-split.ts); every other query runs exactly as written. Every query is counted.
 */
export function withListSplit(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const plan = model ? planSplit(operation, args) : null;
        if (!plan) { counted(model, operation); return query(args); }
        const { parts, added } = partArgs(operation, args as Record<string, unknown>, plan);
        counted(model, operation, parts.length);
        // One after another: run together inside one extension call, every part comes back empty
        // (checked on D1, Oct 2026).
        const results: unknown[] = [];
        for (const part of parts) results.push(await query(part as typeof args));
        return mergeParts(operation, args as Record<string, unknown>, results, added);
      },
    },
  }) as unknown as PrismaClient;
}

function createClient(db: D1Database): PrismaClient {
  const adapter = new PrismaD1(db);
  if (!onWorkers) return withListSplit(new PrismaClient({ adapter }));
  // Workers can't run Prisma's native engine, so load its WebAssembly build explicitly (the bundler
  // would otherwise pick the Node build). Required lazily so `next dev` never loads it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: WasmPrismaClient } = require('@prisma/client/wasm') as typeof import('@prisma/client');
  return withListSplit(new WasmPrismaClient({ adapter }));
}

// A client connects once, and queries that arrive while it's connecting await that same promise
// (Prisma's ClientEngine: `case "connecting": return await this.#e.promise`). On Workers a request
// must never wait on a promise another request started: the waiting request has no I/O of its own,
// so the runtime cancels it as hung ("your Worker's code had hung", HTTP 500 after ~30 ms, in bursts
// when a dashboard's many requests reach a fresh instance together, Oct 2026). So each request uses
// its own client until one has finished connecting; from then on that one serves every request.
let warm: { db: D1Database; client: PrismaClient } | null = null;
const starting = new WeakMap<object, PrismaClient>(); // per request (keyed by its context)

export function getPrisma(): PrismaClient {
  const { env, ctx } = getCloudflareContext();
  if (!env.DB) throw new Error('D1 binding "DB" is missing; check wrangler.jsonc');
  if (warm?.db === env.DB) return warm.client;
  const key = (ctx as object | undefined) ?? env.DB;
  let client = starting.get(key);
  if (!client) {
    const c = createClient(env.DB);
    starting.set(key, c);
    // Started by this request; once connected it's safe to share.
    c.$connect().then(() => { if (warm?.db !== env.DB) warm = { db: env.DB, client: c }; }, () => {});
    client = c;
  }
  return client;
}

// `prisma.user.findMany(...)` etc. resolve the client lazily, on first use inside a request.
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
