// M207 UniVerse Travel on a trip: getting there and back from home (flights, every way), where to stay
// (the guide's price bands, Hostelworld beside Booking.com with the dates), and the travellers board:
// Alice and Bob each plan Lisbon on the same dates, tick 18+ and join; Bob sees Alice by first name,
// messages her (a Travel chat opens), then blocks her and neither sees the other. A guide's Sleep tab has
// both stay links. Axe at 1280 (dark) and 390 (light, a touch phone), no sideways scroll, no page errors.
// Tidies up (both off the board, unblocked, trips deleted). Needs the internet (Wikivoyage).
// Runs against `local:serve` (or BASE=… for local:dev).
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
const start = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const open = async (who, theme, width) => {
  const phone = width < 600;
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-travel-home', 'GB'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message.slice(0, 160)}`));
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Test report' : undefined));
  return { ctx, page };
};
/** A new trip to Lisbon starting on `start`, open on its page. */
async function lisbonTrip(page) {
  // The page is live once its list of trips has come back.
  await Promise.all([page.waitForResponse((res) => /\/travel\/trips$/.test(new URL(res.url()).pathname), { timeout: 180_000 }), page.goto(`${base}/travel/saved`, { waitUntil: 'load', timeout: 180_000 })]);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.waitForURL(/\/travel\/trip\?id=/, { timeout: 60_000 });
  await page.getByRole('combobox', { name: 'Add a place to the trip' }).waitFor({ timeout: 90_000 });
  await page.getByLabel('Starts').fill(start);
  await page.waitForTimeout(600);
  await page.getByRole('combobox', { name: 'Add a place to the trip' }).fill('Lisbon');
  await page.getByRole('listbox').getByRole('option', { name: /^Lisbon/ }).first().click();
  await page.getByRole('heading', { name: /Travellers in Lisbon/ }).waitFor({ timeout: 90_000 });
}
async function joinBoard(page) {
  const board = page.getByRole('region', { name: /Travellers in Lisbon/ });
  await board.getByRole('checkbox').waitFor({ timeout: 60_000 });
  await board.getByRole('checkbox').check();
  await board.getByRole('button', { name: 'Show me on the board' }).click();
  await board.getByText(/You’re on the board/).waitFor({ timeout: 30_000 });
  return board;
}

const alice = await open('alice@student.com', 'dark', 1280);
await lisbonTrip(alice.page);
const there = alice.page.getByRole('region', { name: 'Getting there and back' });
await there.getByLabel('Setting off from').fill('London');
r.thereLinks = await there.locator('a').evaluateAll((as) => as.map((a) => new URL(a.href).hostname));
const stays = alice.page.getByRole('region', { name: /Where to stay/ });
await stays.getByText(/in the guide|doesn’t sort/).first().waitFor({ timeout: 60_000 });
r.stayBands = await stays.locator('li').allInnerTexts();
r.stayLinks = await stays.locator('a').evaluateAll((as) => as.map((a) => `${new URL(a.href).hostname}${a.href.includes('checkin=') ? ' with dates' : ''}`));
await joinBoard(alice.page);
if (shots) await alice.page.getByRole('region', { name: /Where to stay/ }).screenshot({ path: `${shots}/travel-extras-1280.png` });
r.axe.push(...(await axe(alice.page)).map((x) => `trip 1280 ${x}`));
r.wide1280 = await alice.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const aliceTrip = alice.page.url();

const bob = await open('bob@student.com', 'light', 390);
await lisbonTrip(bob.page);
const board = await joinBoard(bob.page);
r.bobSees = await board.locator('li p.font-semibold').allInnerTexts();
if (shots) await board.screenshot({ path: `${shots}/travel-board-390.png` });
r.axe.push(...(await axe(bob.page)).map((x) => `board 390 ${x}`));
r.wide390 = await bob.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const bobTrip = bob.page.url();
await board.getByRole('button', { name: 'Message' }).first().click();
await bob.page.waitForURL(/inbox\?c=/, { timeout: 60_000 });
r.message = 'chat opened';
await bob.page.goto(bobTrip, { waitUntil: 'load', timeout: 120_000 });
const board2 = bob.page.getByRole('region', { name: /Travellers in Lisbon/ });
await board2.getByRole('button', { name: 'Block' }).first().waitFor({ timeout: 60_000 });
await board2.getByRole('button', { name: 'Block' }).first().click();
await board2.getByText(/No one else yet/).waitFor({ timeout: 30_000 });
r.afterBlock = 'Bob no longer sees Alice';
await alice.page.reload({ waitUntil: 'load' });
await alice.page.getByRole('region', { name: /Travellers in Lisbon/ }).getByText(/No one else yet/).waitFor({ timeout: 60_000 });
r.aliceAfterBlock = 'Alice no longer sees Bob';

// A guide's Sleep tab: hostels beside hotels.
await alice.page.goto(`${base}/travel/guide?d=Lisbon`, { waitUntil: 'load', timeout: 180_000 });
await alice.page.getByRole('tab', { name: /^Sleep/ }).click();
const sleep = alice.page.getByRole('tabpanel', { name: 'Sleep' });
await sleep.getByText('Compare prices:').waitFor({ timeout: 30_000 });
r.guideStays = await sleep.locator('a[href*="hostelworld"], a[href*="booking.com"]').count();

// Tidy up.
for (const [who, url] of [[bob, bobTrip], [alice, aliceTrip]]) {
  await who.page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  const b = who.page.getByRole('region', { name: /Travellers in Lisbon/ });
  if (who === bob) { await b.getByRole('button', { name: 'Unblock everyone I blocked' }).click(); await who.page.waitForTimeout(800); }
  await b.getByRole('button', { name: 'Take me off' }).click();
  await b.getByRole('button', { name: 'Show me on the board' }).waitFor({ timeout: 30_000 });
  await who.page.getByRole('button', { name: 'Delete this trip' }).click();
  await who.page.waitForURL(/\/travel\/saved/, { timeout: 60_000 });
}
r.errors = errors;
await alice.ctx.close();
await bob.ctx.close();
await browser.close();
console.log(JSON.stringify(r, null, 2));
