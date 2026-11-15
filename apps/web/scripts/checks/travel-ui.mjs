// M196 UniVerse Travel: Explore (search finds a place as you type, the featured places), a real guide
// (Kyoto/Central: facts, the week's weather, booking links, the parts as tabs with their places), Save on
// a place and the Saved page listing it, then removing it. Axe at 1280 (dark) and 390 (light, a touch
// phone), no sideways scroll, no page errors. Needs the internet (Wikivoyage, Nominatim, MET Norway).
// Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', who = 'alice@student.com', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch();
const out = {};
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600;
  const r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.goto(`${base}/travel`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('combobox', { name: 'Search a place' }).waitFor({ timeout: 60_000 });
  r.ideas = await page.locator('a[href^="/travel/guide?d="]').count();
  await page.getByRole('combobox', { name: 'Search a place' }).fill('Kyoto');
  r.search = await page.getByRole('option').first().waitFor({ timeout: 30_000 }).then(() => page.getByRole('option').count(), () => 0);
  if (shots) await page.screenshot({ path: `${shots}/travel-explore-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `explore ${x}`));
  r.wideExplore = await wide();
  await page.goto(`${base}/travel/guide?d=${encodeURIComponent('Kyoto/Central')}`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('tablist', { name: 'Parts of the guide' }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  const text = await page.locator('main').innerText();
  r.facts = /Japanese Yen/.test(text) && /Emergency/.test(text) ? 'money and emergency numbers' : 'missing';
  r.weather = /This week’s weather/.test(text) ? 'shown' : 'missing';
  r.booking = await page.locator('a[href*="booking.com"], a[href*="getyourguide"]').count();
  await page.getByRole('tab', { name: /^Eat/ }).click();
  await page.waitForTimeout(500);
  r.eatPlaces = await page.getByRole('tabpanel').locator('li.card').count();
  if (shots) await page.screenshot({ path: `${shots}/travel-guide-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `guide ${x}`));
  r.wideGuide = await wide();
  if (!phone) {
    const card = page.getByRole('tabpanel').locator('li.card').first();
    const name = (await card.locator('p').first().innerText()).trim();
    await card.getByRole('button', { name: 'Save' }).click();
    await card.getByRole('button', { name: 'Saved' }).waitFor({ timeout: 20_000 });
    await page.goto(`${base}/travel/saved`, { waitUntil: 'load', timeout: 120_000 });
    await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30_000 });
    r.saved = `"${name}" saved`;
    r.axe.push(...(await axe(page)).map((x) => `saved ${x}`));
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await page.waitForTimeout(1200);
    r.removed = (await page.getByText(name, { exact: true }).count()) === 0 ? 'removed' : 'still there';
  }
  r.errors = errors;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
