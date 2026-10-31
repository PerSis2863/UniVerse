// STORMFALL (M41) on the built Worker: on a computer the /play card is there, the page asks 16+,
// downloads the Unity build and starts it with no Content-Security-Policy blocks or page errors;
// on a phone there is no card and the page explains instead of downloading. Ridgeline Ops is gone.
// Axe on the intro and the phone notice, light and dark.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', who = 'alice@student.com';
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
// WebGL 2 in headless Chromium comes from SwiftShader (software), so the game runs, slowly.
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {};
for (const theme of ['light', 'dark']) {
  const r = (out[theme] = { axe: [] });
  // ---- computer ----
  const ctx = await signedIn(browser, base, who, { width: 1280, height: 860 });
  await ctx.addInitScript((th) => localStorage.setItem('theme', th), theme);
  const page = await ctx.newPage();
  const errors = [], csp = [], files = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('response', (res) => { if (res.url().includes('/games/stormfall/')) files.push(`${res.status()} ${res.url().split('/').pop()}`); });
  await page.exposeFunction('reportCsp', (v) => csp.push(v));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.reportCsp(`${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(`${base}/play`, { waitUntil: 'networkidle', timeout: 90_000 });
  r.card = await page.getByRole('link', { name: /STORMFALL/ }).count();
  r.ridgeline = await page.getByText(/Ridgeline/).count();
  await page.goto(`${base}/play/stormfall`, { waitUntil: 'networkidle', timeout: 90_000 });
  r.axe.push(...(await axe(page)).map((x) => `computer ${x}`));
  if (theme === 'light') {
    await page.getByRole('button', { name: /Deploy/ }).click();
    const yes = page.getByRole('button', { name: /I am 16 or older/ });
    r.askedAge = await yes.isVisible({ timeout: 5000 }).catch(() => false);
    if (r.askedAge) await yes.click();
    await page.getByRole('progressbar', { name: 'Downloading the game' }).waitFor({ timeout: 15_000 });
    r.loading = 'ok';
    const started = Date.now();
    await page.getByRole('button', { name: 'Full screen' }).waitFor({ timeout: 300_000 });
    r.startedInSeconds = Math.round((Date.now() - started) / 1000);
    await page.waitForTimeout(15_000); // let a few frames of the infil render
    r.screenshot = join(tmpdir(), 'stormfall-web.png');
    await page.locator('#stormfall-canvas').screenshot({ path: r.screenshot });
    r.files = files;
  }
  r.cspBlocks = csp;
  r.errors = errors.filter((e) => !/WebGL warning|GPU stall|swiftshader/i.test(e)).slice(0, 10);
  await ctx.close();
  // ---- phone ----
  const ph = await signedIn(browser, base, who, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  await ph.addInitScript((th) => localStorage.setItem('theme', th), theme);
  const pp = await ph.newPage();
  const phoneFiles = [];
  pp.on('request', (q) => { if (q.url().includes('/games/stormfall/')) phoneFiles.push(q.url()); });
  await pp.goto(`${base}/play`, { waitUntil: 'networkidle', timeout: 90_000 });
  r.phoneCard = await pp.getByRole('link', { name: /STORMFALL/ }).count();
  await pp.goto(`${base}/play/stormfall`, { waitUntil: 'networkidle', timeout: 90_000 });
  r.phoneNotice = await pp.getByRole('heading', { name: /needs a computer/ }).count();
  r.phoneDownloads = phoneFiles.length;
  r.phoneWide = await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  r.axe.push(...(await axe(pp)).map((x) => `phone ${x}`));
  await ph.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
