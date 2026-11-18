// M287–M288 Travel's look and smoothness: a guide's opening kept to three lines with Plan a trip and the map on its
// picture, the booking links in one row, the parts' tabs staying in view while you scroll, long text behind
// "Read more" at a readable width, a part opening at once; trip cards with the photo to their edges. Axe at
// 1280 (dark) and 390 (light, a touch phone), no sideways scroll, no page errors. Needs the internet
// (Wikivoyage). Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787';
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch();
const out = {}, fails = [];
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, k = `${theme} ${width}`;
  const r = (out[k] = {});
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.goto(`${base}/travel/guide?d=Lisbon`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('tablist', { name: 'Parts of the guide' }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  r.hero = await page.evaluate(() => { const p = document.querySelector('section h2 ~ p'); return p ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)) : 0; });
  const hero = page.locator('section:has(> h2)').first();
  r.heroActions = await hero.getByRole('button', { name: /^Plan a trip/ }).isVisible() && await hero.getByRole('link', { name: /^(Map|See on the map)$/ }).isVisible();
  r.bookRow = await page.getByRole('region', { name: /^Book for/ }).evaluate((s) => new Set([...s.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().top))).size);
  r.axeTop = await axe(page);
  r.wideTop = await wide();
  const tab = page.getByRole('tab', { name: /^Do/ });
  const t0 = Date.now(); await tab.click(); await page.getByRole('tabpanel', { name: 'Do' }).waitFor(); r.partMs = Date.now() - t0;
  await page.evaluate(() => window.scrollBy(0, 1400)); await page.waitForTimeout(400);
  r.tabsInView = await page.getByRole('tablist', { name: 'Parts of the guide' }).evaluate((el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.top < 140; });
  const more = page.getByRole('button', { name: /^Read more/ }).first();
  if (await more.count()) {
    const before = await page.getByRole('tabpanel').locator('p').count();
    await more.click();
    r.readMore = (await page.getByRole('tabpanel').locator('p').count()) > before;
    r.lineChars = await page.getByRole('tabpanel').locator('p').first().evaluate((p) => Math.round(p.getBoundingClientRect().width / (parseFloat(getComputedStyle(p).fontSize) * 0.5)));
  }
  r.axeDo = await axe(page);
  r.wideDo = await wide();
  await page.goto(`${base}/travel/saved`, { waitUntil: 'load', timeout: 180_000 });
  const card = page.locator('a[href^="/travel/trip?id="]').first();
  if (await card.count() || await card.waitFor({ timeout: 30_000 }).then(() => true, () => false)) {
    r.flushPhoto = await card.evaluate((a) => { const p = a.firstElementChild.getBoundingClientRect(), b = a.getBoundingClientRect(); return Math.abs(p.left - b.left) < 2 && Math.abs(p.top - b.top) < 2; });
  }
  r.axeTrips = await axe(page);
  // M288: a trip's parts: the settings only where they change something; on a phone a stop's dates on one line and
  // the prices table without sideways scrolling.
  const H = { Authorization: 'Bearer mock-token-alice@student.com' };
  const trip = (await fetch(`${base}/api/core/travel/trips`, { headers: H }).then((x) => x.json())).trips.find((t) => t.places > 0 && t.startDate);
  if (trip) {
    await page.goto(`${base}/travel/trip?id=${trip.id}&part=today`, { waitUntil: 'load', timeout: 180_000 });
    await page.getByRole('region', { name: 'Which day' }).waitFor({ timeout: 60_000 });
    r.detailsOnToday = await page.getByRole('region', { name: 'Trip details' }).count();
    await page.goto(`${base}/travel/trip?id=${trip.id}`, { waitUntil: 'load', timeout: 180_000 });
    await page.getByRole('region', { name: 'Trip details' }).waitFor({ timeout: 60_000 });
    r.stopDateLines = await page.locator('ol li p.text-xs').first().evaluate((p) => Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)));
    await page.goto(`${base}/travel/trip?id=${trip.id}&part=money`, { waitUntil: 'load', timeout: 180_000 });
    const prices = page.getByRole('region', { name: 'Prices in each country' });
    await prices.waitFor({ timeout: 60_000 });
    r.pricesFit = await prices.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    r.axeMoney = await axe(page);
    r.wideMoney = await wide();
  }
  r.wideTrips = await wide();
  r.errors = errors;
  if (r.hero > 3) fails.push(`${k}: the opening is ${r.hero} lines`);
  if (!r.heroActions) fails.push(`${k}: no Plan a trip / map on the picture`);
  if (r.bookRow !== 1) fails.push(`${k}: booking links on ${r.bookRow} rows`);
  if (!r.tabsInView) fails.push(`${k}: the tabs scrolled away`);
  if (r.partMs > 300) fails.push(`${k}: a part took ${r.partMs} ms`);
  if (r.readMore === false) fails.push(`${k}: Read more showed nothing`);
  if (r.lineChars > 100) fails.push(`${k}: ~${r.lineChars} characters a line`);
  if (r.flushPhoto === false) fails.push(`${k}: the trip photo is inset`);
  if (r.detailsOnToday) fails.push(`${k}: the trip's settings above Today`);
  if (r.stopDateLines > 1) fails.push(`${k}: a stop's dates on ${r.stopDateLines} lines`);
  if (phone && r.pricesFit === false) fails.push(`${k}: the prices table scrolls sideways`);
  for (const x of ['axeTop', 'axeDo', 'axeTrips', 'axeMoney']) if (r[x]?.length) fails.push(`${k} ${x}: ${r[x].join('; ')}`);
  for (const x of ['wideTop', 'wideDo', 'wideTrips', 'wideMoney']) if (r[x]) fails.push(`${k}: sideways scroll (${x})`);
  if (errors.length) fails.push(`${k}: page errors ${errors.join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (fails.length) { console.error('FAILED\n' + fails.join('\n')); process.exit(1); }
console.log('travel-look-ui: all good');
