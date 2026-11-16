// M217 UniVerse Relief's second wave: every new tab (Most urgent, Matches, Alerts, Be ready, First aid, My hours)
// and the tab row on My requests and Organisations, at 1280 (dark) and 390 (light, a touch phone): axe, no
// sideways scroll, no page errors. On the computer: the alerts list (GDACS and USGS through the server), a plan
// saved and read back, a go-bag item ticked, a country's emergency numbers, a first-aid card opened. Tidies up.
// Runs against `local:serve` (or BASE=… for local:dev). Needs the internet (GDACS, USGS).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch();
const out = { errors: [] };
const call = async (page, method, path, data) => (await page.request.fetch(`${base}/api/core${path}`, { method, headers: { Authorization: 'Bearer mock-token-alice@student.com' }, data, timeout: 120_000 })).json().catch(() => null);
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [], wide: [] });
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-travel-home', 'PT'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`${width}: ${e.message.slice(0, 160)}`));
  const visit = async (path, ready, name) => {
    await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180_000 });
    await ready().waitFor({ timeout: 120_000 });
    if (shots) await page.screenshot({ path: `${shots}/relief-${name}-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `${name} ${x}`));
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) r.wide.push(name);
  };
  await visit('/relief?view=urgent', () => page.getByRole('heading', { name: 'The most urgent needs' }), 'urgent');
  r.urgent = await page.locator('section[aria-labelledby="urgent-h"] ol > li').count();
  await visit('/relief?view=matches', () => page.getByRole('heading', { name: 'Offers that fit open needs' }), 'matches');
  await visit('/relief?view=alerts', () => page.getByRole('complementary', { name: 'Disaster alerts' }).locator('ol'), 'alerts');
  r.alerts = await page.getByRole('complementary', { name: 'Disaster alerts' }).locator('ol > li button').count();
  await visit('/relief?view=ready', () => page.getByRole('heading', { name: 'My emergency plan' }), 'ready');
  if (!phone) {
    await page.getByLabel('Where to meet near home').fill('The bakery on the corner');
    await page.getByRole('button', { name: 'Save the plan' }).click();
    await page.getByText(/Plan saved/).waitFor({ timeout: 30_000 });
    r.planBack = (await call(page, 'GET', '/relief/plan'))?.plan?.meetNear;
    await page.getByLabel(/litres of water/).check();
    await page.getByText(/1 of \d+ ready/).waitFor({ timeout: 30_000 });
    r.kitBack = (await call(page, 'GET', '/relief/plan'))?.kit;
    r.numbers = await page.getByRole('region', { name: 'Emergency numbers' }).locator('a[href^="tel:"]').allInnerTexts();
  }
  await visit('/relief?view=firstaid', () => page.getByRole('heading', { name: 'First aid basics' }), 'firstaid');
  if (!phone) { await page.getByText('Heavy bleeding').click(); r.firstAid = await page.locator('details[open]').count(); }
  await visit('/relief?view=hours', () => page.getByRole('heading', { name: 'My volunteer hours' }), 'hours');
  await visit('/relief/mine', () => page.getByRole('navigation', { name: 'Relief' }), 'mine');
  await visit('/relief/orgs', () => page.getByRole('navigation', { name: 'Relief' }), 'orgs');
  if (!phone) await call(page, 'PUT', '/relief/plan', { plan: {}, kit: [] });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
