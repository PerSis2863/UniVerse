// M421 Ghidra in the owner console (Server → Usage): Ask starts its background thread, which downloads the model and answers
// "What is Relief?"; Write on writes on from "Once upon a time"
// in the browser, then the button is back. Axe at 1280 dark and 390 light, no sideways scroll, no page errors.
// On the built Worker (pnpm local:serve --test-secret --owner-test), or the dev server started with
// SUPER_ADMIN_EMAILS=owner@check.test FIREBASE_TEST_JWKS_URL=http://localhost:8790/jwks.json (then BASE=http://localhost:3000).
// Port 8790 must be free (the stand-in sign-in keys). Screenshots go to the folder given as the first argument.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = process.env.BASE ?? 'http://localhost:8787', OWNER = 'owner@check.test';
const out = process.argv[2] ?? '/tmp';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;

// A stand-in for Google's sign-in keys (this machine only) and the owner's sign-in.
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'check-key', alg: 'RS256', use: 'sig' };
const keys = createServer((_, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8790);
const project = 'universe-71e68';
const now = Math.floor(Date.now() / 1000);
const ownerToken = await new SignJWT({ email: OWNER, email_verified: true, name: 'Check Owner', auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} } })
  .setProtectedHeader({ alg: 'RS256', kid: 'check-key' }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project)
  .setSubject('check-owner-uid').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);

function restore() {
  const owner = rows(`SELECT id FROM users WHERE email='${OWNER}'`)[0];
  if (!owner) return;
  sql(`DELETE FROM audit_logs WHERE actorId='${owner.id}'`);
  sql(`DELETE FROM owner_changes WHERE ownerId='${owner.id}'`);
  sql(`DELETE FROM login_events WHERE userId='${owner.id}'`);
  sql(`DELETE FROM users WHERE id='${owner.id}'`);
}

try {
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${ownerToken}` } }).then((r) => r.json());
  const browser = await launch();
  const results = [];
  try {
    for (const [device, viewport, theme] of [['desktop', { width: 1280, height: 900 }, 'dark'], ['phone', { width: 390, height: 844 }, 'light']]) {
      const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await ctx.addInitScript(([t, u, th]) => {
        localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
        localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1'); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('universe-console-server-section', 'usage');
      }, [ownerToken, me, theme]);
      await ctx.route(/\/api\//, (route) => {
        const h = route.request().headers();
        return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${ownerToken}` } });
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      await page.goto(`${base}/console?tab=server`, { waitUntil: 'load', timeout: 180_000 });
      const cardTitle = page.getByRole('heading', { name: 'Ghidra, our own AI' });
      await cardTitle.waitFor({ timeout: 60_000 }).catch(async (e) => { await page.screenshot({ path: `${out}/ghidra-fail.png` }); console.log(JSON.stringify({ errors, me: me?.user?.owner ?? me?.owner })); throw e; });
      await cardTitle.scrollIntoViewIfNeeded();
      const card = cardTitle.locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
      const t0 = Date.now();
      await card.getByRole('button', { name: 'Ask', exact: true }).last().click(); // the form's button (the switch's Ask is first)
      await card.locator('button[type=submit]', { hasText: 'Ask' }).waitFor({ timeout: 120_000 }); // back once it has answered
      const seconds = (Date.now() - t0) / 1000;
      const answer = await card.locator('p[aria-live]').innerText();
      await card.getByRole('button', { name: 'Write on' }).click();
      await card.locator('button[type=submit]').click();
      await card.locator('button[type=submit]', { hasText: 'Write' }).waitFor({ timeout: 120_000 });
      const text = await card.locator('p[aria-live]').innerText();
      await card.screenshot({ path: `${out}/ghidra-${theme}-${device}.png` });
      await page.addScriptTag({ path: AXE });
      const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
        .violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      results.push({ device, theme, seconds, answer, wrote: text.length, text: text.slice(0, 200), axe, wide, errors });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 1));
  process.exitCode = results.some((r) => r.wrote < 30 || r.answer.length < 10 || r.axe.length || r.wide || r.errors.length) ? 1 : 0;
} finally {
  restore();
  keys.close();
}
