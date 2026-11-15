// M199: a final check that one school can't see another's people. Makes a second school (its own admin,
// teacher and student; removed after), then calls every GET API route without an id in its address,
// and the core API's lists, as that school's admin, teacher and student, and looks for the main
// school's people (names and emails) in the answers. Runs against `local:dev` (BASE=…) or `local:serve`,
// which must allow the test accounts: DEMO_ACCOUNT_EMAILS must include admin@leak.test,
// teacher@leak.test and student@leak.test.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.BASE ?? 'http://localhost:8787';
const sql = (s) => { const f = join(tmpdir(), 'leak.sql'); writeFileSync(f, s); execFileSync('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--file', f], { stdio: 'pipe' }); };
const now = new Date().toISOString().replace('Z', '+00:00');
const ACCOUNTS = [['leak-admin', 'Lena Leakcheck', 'admin@leak.test', 'ADMIN'], ['leak-teacher', 'Theo Leakcheck', 'teacher@leak.test', 'TEACHER'], ['leak-student', 'Sami Leakcheck', 'student@leak.test', 'STUDENT']];
const cleanup = `DELETE FROM users WHERE id IN (${ACCOUNTS.map(([id]) => `'${id}'`).join(',')}); DELETE FROM organizations WHERE id = 'leak-org';`;
sql(`${cleanup}
INSERT INTO users (id, name, email, role, status, organizationId, onboardedAt, createdAt, updatedAt) VALUES ${ACCOUNTS.map(([id, name, email, role]) => `('${id}', '${name}', '${email}', '${role}', 'ACTIVE', NULL, '${now}', '${now}', '${now}')`).join(',')};
INSERT INTO organizations (id, name, ownerId, updatedAt) VALUES ('leak-org', 'Leak Check School', 'leak-admin', '${now}');
UPDATE users SET organizationId = 'leak-org' WHERE id IN (${ACCOUNTS.map(([id]) => `'${id}'`).join(',')});`);

// The main school's people: who must never show up for the second school.
const MARKERS = ['alice@student.com', 'bob@student.com', 'tara@teacher.com', 'Alice Johnson', 'Bob Smith', 'Tara Teacher', 'Data Structures and Algorithms'];

// Every GET route without a [param], and the core API's GET lists (src/server/modules).
const gen = readFileSync('cloudflare/api-routes.gen.ts', 'utf8');
const plain = [...gen.matchAll(/\["(\/api\/[^"]+)"/g)].map((m) => m[1]).filter((r) => !r.includes('[') && !/\/(cron|webhooks?|stripe|lti|oneroster|scim|internal|realtime|auth)\b/.test(r));
const core = [];
for (const f of readdirSync('src/server/modules')) {
  const src = readFileSync(join('src/server/modules', f), 'utf8');
  for (const c of src.matchAll(/controller\('([^']+)'\)/g)) for (const g of src.matchAll(/\br\.get(?:<[^>]*>)?\('([^':]*)'/g)) core.push(`/api/core/${c[1]}${g[1] ? `/${g[1]}` : ''}`);
}
const routes = [...new Set([...plain, ...core])];

const hits = [];
let called = 0;
for (const [, , email, role] of ACCOUNTS) {
  for (const r of routes) {
    const res = await fetch(base + r, { headers: { Authorization: `Bearer mock-token-${email}` } }).catch(() => null);
    if (!res || !res.ok) continue;
    called++;
    const body = await res.text();
    const found = MARKERS.filter((m) => body.includes(m));
    if (found.length) hits.push(`${role} ${r}: ${found.join(', ')}`);
  }
}
sql(cleanup);
console.log(JSON.stringify({ routes: routes.length, answered: called, leaks: hits }, null, 1));
