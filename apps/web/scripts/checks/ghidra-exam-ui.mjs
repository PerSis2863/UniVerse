// M445 Ghidra's exam in the owner console, on the built Worker (pnpm local:serve --ai-placeholder --test-secret
// --owner-test; port 8790 free for its sign-in key server). The owner starts a run of 5 questions per skill, two steps
// save their results (with the placeholder AI every answer is "no answer"), the demo admin can't reach it; in the
// browser, Console → Health shows the exam card, Continue asks more and fills the score table, Stop stops it.
// Axe at 390/1280, light/dark, no sideways scrolling. The runs and the made-up owner are removed at the end.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', OWNER = 'owner@check.test';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const started = new Date().toISOString().replace('T', ' ').slice(0, 19);

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'check-key', alg: 'RS256', use: 'sig' };
const keys = createServer((_, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8790);
const project = 'universe-71e68', now = Math.floor(Date.now() / 1000);
const ownerToken = await new SignJWT({ email: OWNER, email_verified: true, name: 'Check Owner', auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} } })
  .setProtectedHeader({ alg: 'RS256', kid: 'check-key' }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project)
  .setSubject('check-owner-uid').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
const call = async (token, path, body) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
function restore() {
  sql(`DELETE FROM ghidra_exam_runs WHERE startedAt >= '${started}'`);
  const owner = rows(`SELECT id FROM users WHERE email='${OWNER}'`)[0];
  if (owner) for (const t of ['audit_logs WHERE actorId', 'owner_changes WHERE ownerId', 'login_events WHERE userId', 'users WHERE id']) sql(`DELETE FROM ${t}='${owner.id}'`);
}

const api = {}, ui = {};
let failed = false;
try {
  const me = await call(ownerToken, '/api/core/auth/me');
  api.owner = me.s === 200 && me.b.owner === true;
  api.demoAdminHidden = (await call('mock-token-demo@admin.com', '/api/core/owner/ghidra-exam')).s; // 404
  const start = await call(ownerToken, '/api/core/owner/ghidra-exam', { action: 'start', per: 5 });
  api.start = [start.s, start.b.run?.status, start.b.run?.total];
  const id = start.b.run?.id;
  await call(ownerToken, '/api/core/owner/ghidra-exam', { action: 'step', id });
  const two = await call(ownerToken, '/api/core/owner/ghidra-exam', { action: 'step', id });
  api.twoSteps = [two.b.run?.cursor, two.b.skills?.reduce((n, s) => n + s.asked, 0)];
  api.badAction = (await call(ownerToken, '/api/core/owner/ghidra-exam', { action: 'nope' })).s; // 400
  console.log('api', JSON.stringify(api));

  const browser = await launch();
  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(([t, u, th]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    }, [ownerToken, me.b, theme]);
    await ctx.route(/\/api\//, (route) => { const h = route.request().headers(); return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${ownerToken}` } }); });
    const page = await ctx.newPage();
    await page.goto(`${base}/console?tab=health`, { waitUntil: 'networkidle', timeout: 60_000 });
    const card = page.getByRole('heading', { name: 'Ghidra’s exam' }).or(page.getByRole('heading', { name: "Ghidra's exam" }));
    await card.waitFor({ timeout: 30_000 });
    const k = `${width}-${theme}`;
    if (width === 1280 && theme === 'light') {
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('cell', { name: 'safety' }).or(page.getByText(/questions · started/)).first().waitFor({ timeout: 60_000 });
      await page.waitForFunction(() => /(1[2-9]|[2-9]\d|\d{3}) of \d+ questions/.test(document.body.innerText), null, { timeout: 120_000 });
      ui.progressed = true;
      await page.getByRole('button', { name: 'Stop' }).click();
      await page.getByText(/Stopped ·/).waitFor({ timeout: 20_000 });
      ui.stopped = true;
      ui.table = await page.locator('section[aria-labelledby="ghidra-exam"] tbody tr').count();
    }
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.addScriptTag({ path: AXE });
    ui[`axe ${k}`] = await page.evaluate(async () => (await window.axe.run(document.querySelector('section[aria-labelledby="ghidra-exam"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id));
    ui[`sideways ${k}`] = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (width === 1280 && theme === 'light') await page.screenshot({ path: '/tmp/ghidra-exam-console.png', fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log('ui', JSON.stringify(ui));
  failed = !(api.owner && api.demoAdminHidden === 404 && api.start[0] === 201 && api.start[1] === 'RUNNING' && api.twoSteps[0] === 12 && api.twoSteps[1] === 12 && api.badAction === 400 && ui.progressed && ui.stopped && ui.table > 0
    && Object.entries(ui).every(([k2, v]) => !k2.startsWith('axe') || !v.length) && Object.entries(ui).every(([k2, v]) => !k2.startsWith('sideways') || !v));
} catch (e) {
  console.error(e); failed = true;
} finally {
  restore(); keys.close();
}
console.log(failed ? 'FAILED' : 'OK');
process.exit(failed ? 1 : 0);
