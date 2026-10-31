// The owner console's deck (M13) on the built Worker (pnpm local:serve --test-secret --owner-test):
// Overview, Feature flows and a few other sections open from their links (?tab=), in dark and light,
// on desktop and phone; axe-clean; no sideways scrolling; no page errors; the live cards draw (M49). Screenshots go to the
// folder given as the first argument. Puts everything back afterwards.
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

const TABS = ['overview', 'flows', 'errors', 'server', 'people'];
try {
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${ownerToken}` } }).then((r) => r.json());
  const browser = await launch();
  try {
    for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      for (const theme of ['dark', 'light']) {
        const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
        await ctx.addInitScript(([t, u, th]) => {
          localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
          localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1'); localStorage.setItem('uv-cookies', 'essential');
        }, [ownerToken, me, theme]);
        await ctx.route(/\/api\//, (route) => {
          const h = route.request().headers();
          return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${ownerToken}` } });
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        for (const tab of device === 'phone' ? ['overview', 'flows'] : TABS) {
          await page.goto(`${base}/console?tab=${tab}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
          const opened = await page.evaluate(() => new URLSearchParams(location.search).get('tab'));
          await page.screenshot({ path: `${out}/deck-${tab}-${theme}-${device}.png` });
          await page.addScriptTag({ path: AXE });
          const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
            .violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
          const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
          // M49: the live cards' pictures draw (lit pixels in each canvas).
          const live = tab !== 'overview' ? undefined : await page.evaluate(async () => {
            const lit = [];
            for (const card of document.querySelectorAll('.live-card')) {
              card.scrollIntoView({ block: 'center' });
              await new Promise((r) => setTimeout(r, 1200));
              const c = card.querySelector('canvas');
              if (!c) { lit.push(-1); continue; }
              const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
              let n = 0; for (let i = 3; i < x.length; i += 16) if (x[i] > 40) n++;
              lit.push(n);
            }
            return lit;
          });
          if (live) for (const [i, card] of (await page.locator('.live-card').all()).entries()) await card.screenshot({ path: `${out}/deck-live${i}-${theme}-${device}.png` }).catch(() => {});
          console.log(JSON.stringify({ device, theme, tab, opened, axe, wide, live }));
        }
        if (errors.length) console.log(JSON.stringify({ device, theme, errors: errors.slice(0, 5) }));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  restore();
  keys.close();
}
