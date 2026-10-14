// The light API path (cloudflare/fast-api.ts) must answer exactly like the Next.js routes it stands
// in for. This asks both the same questions and compares the answers field by field.
//
//   DEMO_ACCOUNT_EMAILS=<the accounts below> pnpm dev -p 3100                       (Next.js routes)
//   npx opennextjs-cloudflare build && npx wrangler dev --port 8787 \
//     --var DEMO_LOGIN_ENABLED:true --var DEMO_ACCOUNT_EMAILS:<the accounts below>  (light path)
//   node scripts/light-path-parity.mjs [--as a@x,b@y] [/api/extra/path ...]
//
// Both use the same local D1, so add data that makes it hard (equal timestamps across a "latest 5" cut,
// more than one page, a parent account) before running. Opening a chat marks it read and asking
// records that you're online (every 30 s), so run again if only lastReadAt or lastSeenAt differ.
// Exits 1 on any difference.

import { isDeepStrictEqual } from 'node:util';

const NEXT = 'http://localhost:3100';
const LIGHT = 'http://localhost:8787';
const asArg = process.argv.indexOf('--as');
const accounts = asArg > 0 ? process.argv[asArg + 1].split(',') : ['demo@student.com', 'demo@teacher.com', 'demo@admin.com'];
const extra = process.argv.slice(2).filter((a, i, all) => a.startsWith('/') && all[i - 1] !== '--as');
const dow = (new Date().getDay() + 6) % 7;
const GETS = ['/api/me', '/api/core/users/me', '/api/notifications', '/api/chat/incoming', '/api/chat/conversations', '/api/boards', '/api/docs', '/api/spaces', '/api/core/dashboard/admin', '/api/core/dashboard/teacher', `/api/student/overview?dow=${dow}`, '/api/student/overview?dow=x', ...extra];
// What each home page asks for when the app opens (src/lib/bootstrap.ts).
const BOOT = ['/api/core/users/me', '/api/me', '/api/notifications', '/api/chat/incoming', `/api/student/overview?dow=${dow}`, '/api/core/dashboard/teacher', '/api/core/dashboard/admin', '/api/parent/children'];

const auth = (email) => ({ Authorization: `Bearer mock-token-${email}` });
const read = async (res) => ({ status: res.status, body: await res.json().catch(() => null) });
const flat = (o, p = '') => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, `${p}${k}.`)) : [[p.slice(0, -1), JSON.stringify(o)]]);
let fail = 0;
function compare(label, a, b) {
  if (isDeepStrictEqual(a, b)) return console.log('SAME', label, a?.status ?? '');
  fail++;
  console.log('DIFF', label);
  const A = new Map(flat(a)), B = new Map(flat(b));
  [...new Set([...A.keys(), ...B.keys()])].filter((k) => A.get(k) !== B.get(k)).slice(0, 8)
    .forEach((k) => console.log(`  ${k}: next=${A.get(k)} light=${B.get(k)}`));
}

for (const email of accounts) {
  // Each chat this person is in, too.
  const list = await fetch(`${NEXT}/api/chat/conversations`, { headers: auth(email) }).then((r) => r.json()).catch(() => null);
  const threads = (list?.conversations ?? []).slice(0, 5).map((c) => `/api/chat/conversations/${c.id}/messages`);
  for (const path of [...GETS, ...threads]) {
    const a = await fetch(NEXT + path, { headers: auth(email) }).then(read);
    const b = await fetch(LIGHT + path, { headers: auth(email) }).then(read);
    compare(`${email} GET ${path}`, a, b);
  }
  const body = JSON.stringify({ keys: BOOT, session: true });
  const boot = (base) => fetch(`${base}/api/bootstrap`, { method: 'POST', headers: { ...auth(email), 'content-type': 'application/json' }, body }).then(read);
  const a = await boot(NEXT);
  const b = await boot(LIGHT);
  for (const key of BOOT) compare(`${email} bootstrap ${key}`, a.body?.results?.[key], b.body?.results?.[key]);
}
console.log(fail ? `${fail} DIFFERENT` : 'ALL SAME');
process.exit(fail ? 1 : 0);
