// M3 error hub (Owner console → Errors) on the built Worker (pnpm local:serve --test-secret --owner-test).
// Three made-up problems: a bot's (an impossible Mac signature on Chrome 71), a diagnosed server one
// and a new browser one. "Diagnose new" files the bot's as ignored (no AI spent); the list and the
// detailed view side by side on a computer, the details in place of the list on a phone; the tabs
// (Overview, Technical, Fix with AI); axe at 390/1280, light/dark; no sideways scrolling.
// Screenshots go to the folder given as the first argument. Everything made here is removed.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const out = process.argv[2] ?? '/tmp';
const base = 'http://localhost:8787', OWNER = 'owner@check.test';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const at = (h) => new Date(Date.now() - h * 3600_000).toISOString().replace('Z', '+00:00');

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'check-key', alg: 'RS256', use: 'sig' };
const keys = createServer((_, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8790);
const project = 'universe-71e68';
const now = Math.floor(Date.now() / 1000);
const ownerToken = await new SignJWT({ email: OWNER, email_verified: true, name: 'Check Owner', auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} } })
  .setProtectedHeader({ alg: 'RS256', kid: 'check-key' }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project)
  .setSubject('check-owner-uid').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
const call = async (path, body) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};

const tag = `hubcheck${Date.now()}`;
const made = [
  { id: `${tag}a`, source: 'CLIENT', kind: 'render', message: 'Blank page: app code did not start', path: '/', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 9_1_1) AppleWebKit/578.36 (KHTML, like Gecko) Chrome/71.0.167 Safari/537.36', status: 'DIAGNOSED', severity: 'high', diagnosis: '**A user encountered a completely blank page.**\n\n**Likely cause:** A fatal error during start-up.\n\n**Where to look:** src/app/layout.tsx\n\n**Suggested fix:** Check browser compatibility.', count: 1, h: 6 },
  { id: `${tag}b`, source: 'SERVER', kind: 'api', message: "TypeError: Cannot read properties of null (reading 'organizationId')", path: '/api/core/users/stats', ua: null, status: 'DIAGNOSED', severity: 'high', diagnosis: '**The people counts fail for an admin without a school.**\n\n**Likely cause:** The admin row has no organisation and the code reads it without a check.\n\n**Where to look:** src/server/modules/users.ts, the stats route.\n\n**Suggested fix:** Treat a missing organisation as the main school before reading it.', count: 14, h: 1 },
  { id: `${tag}c`, source: 'CLIENT', kind: 'promise', message: 'Error: Request failed with status code 500', path: '/student/grades', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', status: 'NEW', severity: null, diagnosis: null, count: 3, h: 3 },
];
function restore() {
  sql(`DELETE FROM error_reports WHERE id LIKE '${tag}%'`);
  const owner = rows(`SELECT id FROM users WHERE email='${OWNER}'`)[0];
  if (owner) for (const t of ['audit_logs WHERE actorId', 'owner_changes WHERE ownerId', 'login_events WHERE userId', 'users WHERE id']) sql(`DELETE FROM ${t}='${owner.id}'`);
}

const r = {}, axeOut = [], wideOut = [];
try {
  for (const e of made) sql(`INSERT INTO error_reports (id, fingerprint, source, kind, message, path, userAgent, count, users, status, severity, diagnosis, diagnosedAt, firstSeen, lastSeen) VALUES (${q(e.id)}, ${q(e.id)}, ${q(e.source)}, ${q(e.kind)}, ${q(e.message)}, ${q(e.path)}, ${q(e.ua)}, ${e.count}, 1, ${q(e.status)}, ${q(e.severity)}, ${q(e.diagnosis)}, ${e.diagnosis ? q(at(e.h)) : 'NULL'}, ${q(at(e.h + 24))}, ${q(at(e.h))})`);
  const me = await call('/api/core/auth/me');
  r.ownerSignIn = me.s === 200 && me.b.owner === true;
  r.diagnose = (await call('/api/core/owner/errors/diagnose', {})).s;
  r.botIgnored = rows(`SELECT status FROM error_reports WHERE id='${tag}a'`)[0]?.status === 'IGNORED';
  r.othersOpen = rows(`SELECT COUNT(*) AS n FROM error_reports WHERE id IN ('${tag}b','${tag}c') AND status IN ('NEW','DIAGNOSED')`)[0].n === 2;

  const browser = await launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addInitScript(([t, u, th]) => {
        localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
        localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
      }, [ownerToken, me.b, theme]);
      await ctx.route(/\/api\//, (route) => { const h = route.request().headers(); return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${ownerToken}` } }); });
      const page = await ctx.newPage();
      // workbox-window can't read a registration with service workers blocked (this test only).
      const errors = []; page.on('pageerror', (e) => { if (!/reading 'waiting'/.test(e.message)) errors.push(e.message.slice(0, 120)); });
      await page.goto(`${base}/console?tab=errors`, { waitUntil: 'networkidle', timeout: 60_000 });
      const row = page.getByRole('button', { name: /people counts fail/ });
      await row.waitFor({ timeout: 20_000 });
      const key = `${theme}-${width}`;
      if (width < 500) {
        r[`${key} details hidden until chosen`] = !(await page.getByRole('article').isVisible().catch(() => false));
      }
      await row.click();
      if (width < 500) await page.getByRole('button', { name: 'All problems' }).waitFor({ timeout: 5000 });
      const art = page.getByRole('article', { name: /people counts fail/ });
      await art.waitFor({ timeout: 5000 });
      r[`${key} detail shows the AI's cause`] = await art.getByText('Likely cause').isVisible();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/hub-${key}.png`, fullPage: width > 500 });
      await art.getByRole('tab', { name: 'Technical' }).click();
      r[`${key} technical tab`] = await art.getByText("TypeError: Cannot read properties of null").isVisible();
      await art.getByRole('tab', { name: 'Fix with AI' }).click();
      r[`${key} fix tab`] = await art.getByRole('button', { name: /Diagnose again|Diagnose/ }).first().isVisible();
      await page.waitForTimeout(400);
      await page.addScriptTag({ path: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes[0]?.target}`));
      if (v.length) axeOut.push(`${key}: ${v.join('; ')}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) wideOut.push(key);
      if (errors.length) r[`${key} page errors`] = errors.join(' | ');
      await ctx.close();
    }
  } finally { await browser.close(); }
} finally {
  restore();
  keys.close();
}
for (const [k, v] of Object.entries(r)) console.log(`${v === true || v === 200 ? '✓' : '✗'} ${k}${v === true ? '' : `: ${v}`}`);
console.log(axeOut.length ? `axe:\n${axeOut.join('\n')}` : 'axe: clean');
console.log(wideOut.length ? `sideways scrolling: ${wideOut.join(', ')}` : 'no sideways scrolling');
process.exit(Object.values(r).some((v) => v !== true && v !== 200) || axeOut.length || wideOut.length ? 1 : 0);
