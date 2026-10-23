// Explain UniVerse (owner console) on the built Worker (pnpm local:serve --test-secret --owner-test):
// the tab shows its ten parts and is axe-clean; "Open the whiteboard" makes "UniVerse explained" from
// all ten templates and opens it; opening again goes back to the same board. Screenshots of the board
// and the console go to the folder given as the first argument. Puts everything back afterwards.
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
// The board's frames, from the same code that draws it (Node strips the types).
const { guideElements } = await import('../../src/components/boards/universe-guide.ts');
const frames = guideElements().filter((e) => e.type === 'frame');
let boardId = null;
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
  sql(`DELETE FROM boards WHERE ownerId='${owner.id}'`);
  sql(`DELETE FROM audit_logs WHERE actorId='${owner.id}'`);
  sql(`DELETE FROM owner_changes WHERE ownerId='${owner.id}'`);
  sql(`DELETE FROM login_events WHERE userId='${owner.id}'`);
  sql(`DELETE FROM users WHERE id='${owner.id}'`);
}

try {
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${ownerToken}` } }).then((r) => r.json());
  const browser = await launch();
  try {
    for (const theme of ['dark', 'light']) {
      const r = { theme };
      const errors = [];
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      await ctx.addInitScript(([t, u, th]) => {
        localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
        localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
      }, [ownerToken, me, theme]);
      await ctx.route(/\/api\//, (route) => {
        const h = route.request().headers();
        return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${ownerToken}` } });
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      await page.goto(`${base}/console?tab=guide`, { waitUntil: 'networkidle', timeout: 60_000 });
      const openBtn = page.getByRole('button', { name: 'Open the whiteboard' });
      await openBtn.waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      r.parts = await page.locator('main ol > li').count();
      await page.addScriptTag({ path: AXE });
      r.axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
      await page.screenshot({ path: `${out}/console-${theme}.png` });
      // Dark: "Open the whiteboard" makes the board; light: it goes back to the same one.
      await openBtn.click();
      await page.waitForURL(/\/boards\//, { timeout: 30_000 });
      const id = new URL(page.url()).pathname.split('/').pop();
      if (theme === 'dark') { boardId = id; r.made = page.url().includes('template=guide'); } else r.sameBoard = id === boardId && !page.url().includes('template=');
      await page.locator('.excalidraw').first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(theme === 'dark' ? 9000 : 6000);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+1');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/board-${theme}-all.png` });
      // Each frame: drag a box round it in the zoomed-out view (its place worked out from the layout,
      // centred as "zoom to fit" centres it), then zoom to the selection.
      const box = await page.locator('.excalidraw').first().boundingBox();
      const zoomText = await page.locator('.excalidraw').getByText(/^\d+%$/).first().textContent();
      const z = Number(zoomText.replace('%', '')) / 100;
      const W = Math.max(...frames.map((f) => f.x + f.width)), H = Math.max(...frames.map((f) => f.y + f.height));
      const at = (x, y) => [box.x + box.width / 2 + (x - W / 2) * z, box.y + box.height / 2 + (y - H / 2) * z];
      r.zoom = z;
      for (const [i, f] of frames.entries()) {
        await page.keyboard.press('Shift+1');
        await page.waitForTimeout(500);
        const [x1, y1] = at(f.x - 250, f.y - 250), [x2, y2] = at(f.x + f.width + 250, f.y + f.height + 250);
        await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 8 }); await page.mouse.up();
        await page.keyboard.press('Shift+2');
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${out}/board-${theme}-${i + 1}.png` });
        await page.keyboard.press('Escape');
      }
      r.errors = errors.filter((e) => !e.includes("reading 'waiting'"));
      console.log(JSON.stringify(r));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  restore();
  keys.close();
}
