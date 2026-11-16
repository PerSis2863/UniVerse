// M206 UniVerse Travel's trip planner: "Plan this trip" from Find where to go makes a trip; a start date,
// a second city found by search, places added from the city's guide, "Plan my days" spreads them over
// the days, a drag moves one back to "Not planned yet" (kept after a reload), the budget adds up, the
// calendar file downloads, and a friend joins with the invite link and sees the same trip. Axe at 1280
// (dark) and 390 (light, a touch phone), no sideways scroll, no page errors. Deletes the trip at the end.
// Needs the internet (Wikivoyage). Runs against `local:serve` (or BASE=… for local:dev).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch();
const r = { axe: [] }, errors = [];
const open = async (who, theme, width) => {
  const phone = width < 600;
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-travel-home', 'GB'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message.slice(0, 160)}`));
  return { ctx, page };
};
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const column = (page, name) => page.getByRole('region', { name, exact: true });

const { ctx, page } = await open('alice@student.com', 'dark', 1280);
await page.goto(`${base}/travel?view=find`, { waitUntil: 'load', timeout: 180_000 });
const first = page.locator('ol[aria-live] > li').first();
await first.waitFor({ timeout: 90_000 });
r.planned = (await first.locator('a span.text-lg').innerText()).trim();
await first.getByRole('button', { name: 'Plan this trip' }).click();
await page.waitForURL(/\/travel\/trip\?id=/, { timeout: 60_000 });
const id = new URL(page.url()).searchParams.get('id');
await page.getByRole('heading', { name: 'Route' }).waitFor({ timeout: 90_000 });
r.name = await page.getByLabel('Trip name').inputValue();
await page.getByLabel('Starts').fill('2027-04-08');
await page.waitForTimeout(800);
// A second city, found by search.
await page.getByRole('combobox', { name: 'Add a place to the trip' }).fill('Porto');
await page.getByRole('listbox').getByRole('option').first().waitFor({ timeout: 30_000 });
await page.getByRole('listbox').getByRole('option').first().click();
await page.getByRole('button', { name: /One day fewer in Porto/ }).waitFor({ timeout: 60_000 });
r.cities = await page.locator('ol > li[data-key]').count();
r.leg = await page.getByText(/km · about/).first().innerText().catch(() => 'missing');
r.wayLinks = await page.locator('a[href*="rome2rio.com/s/"]').count();
// Places from the first city's guide.
await page.getByRole('button', { name: 'Add places' }).click();
await page.getByRole('button', { name: 'From the guide' }).click();
await page.getByRole('button', { name: 'Add', exact: true }).first().waitFor({ timeout: 90_000 });
for (let i = 0; i < 4; i++) {
  const add = page.getByRole('button', { name: 'Add', exact: true }).first();
  if (!(await add.count())) break;
  await add.click();
  await page.waitForTimeout(900);
}
await page.getByRole('button', { name: 'Done adding' }).click();
const notPlanned = column(page, 'Not planned yet');
r.added = await notPlanned.locator('[data-key]').count();
await page.getByRole('button', { name: 'Plan my days' }).click();
await page.waitForTimeout(1500);
r.afterPlan = { notPlanned: await notPlanned.locator('[data-key]').count(), day1: await column(page, 'Day 1').locator('[data-key]').count(), day2: await column(page, 'Day 2').locator('[data-key]').count() };
r.hops = await page.getByText(/min (walk|by metro, bus or taxi)/).count();
await page.getByRole('heading', { name: 'Day by day' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
if (shots) await page.screenshot({ path: `${shots}/travel-days-1280.png` });
// Drag the first place of day 1 back to "Not planned yet".
const card = column(page, 'Day 1').locator('[data-key] [draggable="true"]').first();
const dragged = (await card.locator('p').first().innerText()).trim();
await card.dragTo(notPlanned, { targetPosition: { x: 60, y: 60 } });
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'load' });
await page.getByRole('heading', { name: 'Route' }).waitFor({ timeout: 90_000 });
r.dragKept = (await notPlanned.getByText(dragged, { exact: true }).count()) > 0 ? `"${dragged}" not planned` : 'not moved';
await page.getByRole('region', { name: 'Budget' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(1600); // the figure counts up
r.budget = await page.getByRole('region', { name: 'Budget' }).locator('div.text-3xl').innerText();
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Add to calendar' }).click()]);
r.calendar = download.suggestedFilename();
if (shots) await page.screenshot({ path: `${shots}/travel-trip-1280.png` });
r.axe.push(...(await axe(page)).map((x) => `trip 1280 ${x}`));
r.wide1280 = await wide(page);
const invite = await page.locator('code').first().innerText();

// A friend joins with the link, on a phone in light mode.
const friend = await open('bob@student.com', 'light', 390);
await friend.page.goto(invite.replace(/^https?:\/\/[^/]+/, base), { waitUntil: 'load', timeout: 180_000 });
// Wait until the page is live (its list of trips has loaded), then join.
await friend.page.getByRole('button', { name: 'New trip' }).first().waitFor({ timeout: 90_000 });
await friend.page.getByRole('button', { name: 'Join the trip' }).click();
await friend.page.waitForURL(/\/travel\/trip\?id=/, { timeout: 60_000 });
await friend.page.getByRole('heading', { name: 'Route' }).waitFor({ timeout: 90_000 });
r.friendSees = await friend.page.getByLabel('Trip name').inputValue();
r.friendLeave = await friend.page.getByRole('button', { name: 'Leave this trip' }).count();
if (shots) await friend.page.screenshot({ path: `${shots}/travel-trip-390.png` });
r.axe.push(...(await axe(friend.page)).map((x) => `trip 390 ${x}`));
r.wide390 = await wide(friend.page);
await friend.page.goto(`${base}/travel/saved`, { waitUntil: 'load', timeout: 120_000 });
await friend.page.getByText(r.friendSees, { exact: true }).first().waitFor({ timeout: 30_000 });
r.axe.push(...(await axe(friend.page)).map((x) => `trips 390 ${x}`));
await friend.ctx.close();

await page.reload({ waitUntil: 'load' });
await page.getByRole('heading', { name: 'Planning together' }).waitFor({ timeout: 90_000 });
r.members = await page.getByRole('heading', { name: 'Planning together' }).locator('xpath=..').locator('li').count();
// Tidy up: delete the trip.
page.once('dialog', (d) => void d.accept());
await page.getByRole('button', { name: 'Delete this trip' }).click();
await page.waitForURL(/\/travel\/saved/, { timeout: 60_000 });
r.deleted = id ? 'deleted' : 'no id';
r.errors = errors;
await ctx.close();
await browser.close();
console.log(JSON.stringify(r, null, 2));
