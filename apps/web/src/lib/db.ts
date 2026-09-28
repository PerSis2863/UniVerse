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

const clients = new WeakMap<D1Database, PrismaClient>();

export function getPrisma(): PrismaClient {
  const { env } = getCloudflareContext();
  if (!env.DB) throw new Error('D1 binding "DB" is missing; check wrangler.jsonc');
  let client = clients.get(env.DB);
  if (!client) {
    client = createClient(env.DB);
    clients.set(env.DB, client);
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
