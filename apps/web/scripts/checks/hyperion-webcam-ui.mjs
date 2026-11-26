// M555 Hyperion's webcam: with Chromium's fake camera (allowed without asking), webcamlist names it, snapshot takes a
// 320 × 240 colour picture and imshow draws it. Light; no page errors.
//   BASE=http://localhost:3000 node scripts/checks/hyperion-webcam-ui.mjs
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await chromium.launch({ ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const r = {}, errors = [];
try {
  const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
  await ctx.grantPermissions(['camera'], { origin: base });
  await ctx.addInitScript(() => { localStorage.setItem('uv-cookies', 'essential'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
  const cmd = page.getByPlaceholder('Type a command, then Enter');
  await cmd.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await cmd.fill("names = webcamlist; cam = webcam(1, 'Resolution', '320x240'); img = snapshot(cam); disp(size(img)); disp(class(img)); imshow(img)"); await cmd.press('Enter');
  await page.waitForTimeout(8000);
  r.log = (await page.getByRole('log', { name: 'Output' }).innerText()).split('\n').slice(-4).join(' | ');
  r.figure = await page.locator('section[aria-label="Figure"] svg image, section[aria-label="Figure"] img').count();
  await ctx.close();
} finally { await browser.close(); }
console.log(JSON.stringify({ r, errors }, null, 1));
