import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';

// The database is Cloudflare D1 (SQLite), reached through its `DB` binding (wrangler.jsonc).
// In `next dev` the binding is a local D1 provided by wrangler (see initOpenNextCloudflareForDev
// in next.config.ts). The binding can be reused across requests, so one client per binding.
declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function createClient(db: D1Database): PrismaClient {
  const adapter = new PrismaD1(db);
  if (!onWorkers) return new PrismaClient({ adapter });
  // Workers can't run Prisma's native engine, so load its WebAssembly build explicitly (the bundler
  // would otherwise pick the Node build). Required lazily so `next dev` never loads it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: WasmPrismaClient } = require('@prisma/client/wasm') as typeof import('@prisma/client');
  return new WasmPrismaClient({ adapter });
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
