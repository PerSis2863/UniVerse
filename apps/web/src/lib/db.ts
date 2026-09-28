import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Pool } from 'pg';

// On Cloudflare Workers, Prisma talks to Postgres through the `pg` driver adapter, and a database
// connection can't be shared between requests, so each request gets its own client. In Node
// (`next dev`, scripts) one client is shared as before.
const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function createWorkerClient(): PrismaClient {
  // Workers can't run Prisma's native engine, so load its WebAssembly build explicitly (the bundler
  // would otherwise pick the Node build). Required lazily so `next dev` never loads it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: WasmPrismaClient } = require('@prisma/client/wasm') as typeof import('@prisma/client');
  return new WasmPrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })) });
}

const perRequest = new WeakMap<object, PrismaClient>();

function workerClient(): PrismaClient {
  const { ctx } = getCloudflareContext();
  let client = perRequest.get(ctx);
  if (!client) {
    client = createWorkerClient();
    perRequest.set(ctx, client);
  }
  return client;
}

declare global {
  var prismaGlobal: undefined | PrismaClient;
}

function nodeClient(): PrismaClient {
  globalThis.prismaGlobal ??= new PrismaClient();
  return globalThis.prismaGlobal;
}

const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = onWorkers ? workerClient() : nodeClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
