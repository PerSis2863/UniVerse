// M215 UniVerse Travel: a trip's Money and Packing parts. Alice makes a trip (Bangkok, then Kyoto) and Bob
// joins it. On Money, Alice adds a dinner Bob paid for both of them; her balance says she owes him; Settle
// up suggests one payment and "Mark as paid" squares it; the converter and everyday prices show. On
// Packing, the suggestions follow the trip (sunscreen and baht for Bangkok), "Add all" fills the list,
// ticking one counts it and Bob's open page sees it. Axe at 1280 (dark) and 390 (light, a phone), no
// sideways scroll, no page errors. Deletes the trip. Runs against `local:serve` (or BASE=… for local:dev).
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
const errors = [], r = { axe: [] };
const open = async (who, theme, width) => {
  const phone = width < 600;
  const ctx = await signedIn(browser, base, who, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-travel-home', 'GB'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message.slice(0, 160)}`));
  page.on('dialog', (d) => void d.accept());
  return { ctx, page };
};
const call = async (page, who, method, path, data) => {
  const res = await page.request.fetch(`${base}/api/core${path}`, { method, headers: { Authorization: `Bearer mock-token-${who}` }, data, timeout: 120_000 });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const alice = await open('alice@student.com', 'dark', 1280);
const { trip } = await call(alice.page, 'alice@student.com', 'POST', '/travel/trips', { name: 'Money check trip', startDate: '2027-08-10', stop: { guide: 'Bangkok', name: 'Bangkok', cc: 'TH', lat: 13.75, lon: 100.5, days: 4 } });
await call(alice.page, 'alice@student.com', 'POST', `/travel/trips/${trip.id}/stops`, { guide: 'Kyoto', name: 'Kyoto', cc: 'JP', lat: 35.01, lon: 135.77, days: 3 });
const { code } = await call(alice.page, 'alice@student.com', 'POST', `/travel/trips/${trip.id}/code`, {});
await call(alice.page, 'alice@student.com', 'POST', '/travel/trips/join', { code });
await call(alice.page, 'bob@student.com', 'POST', '/travel/trips/join', { code });
const members = (await call(alice.page, 'alice@student.com', 'GET', `/travel/trips/${trip.id}`)).members;
const bobId = members.find((m) => !m.owner).id;
try {
  // Money: a dinner Bob paid for both.
  await alice.page.goto(`${base}/travel/trip?id=${trip.id}&part=money`, { waitUntil: 'load', timeout: 180_000 });
  const costs = alice.page.getByRole('region', { name: 'Shared costs' });
  await costs.getByLabel('What for').waitFor({ timeout: 120_000 });
  await costs.getByLabel('What for').fill('Dinner by the river');
  await costs.getByLabel('How much').fill('42.50');
  await costs.getByLabel('Paid by').selectOption(bobId);
  await costs.getByRole('button', { name: 'Add the cost' }).click();
  await costs.getByText('Dinner by the river').waitFor({ timeout: 30_000 });
  await alice.page.getByText(/^You owe/).waitFor({ timeout: 30_000 });
  r.balance = await alice.page.getByText(/^You owe/).innerText();
  const settleBox = alice.page.getByRole('region', { name: 'Settle up' });
  r.settle = (await settleBox.locator('li').first().innerText()).replace(/\s+/g, ' ');
  r.converter = await alice.page.getByRole('region', { name: 'Convert' }).locator('output').innerText();
  r.everyday = (await alice.page.getByRole('region', { name: 'What things cost there' }).locator('tbody tr').first().innerText()).replace(/\s+/g, ' ');
  if (shots) await alice.page.screenshot({ path: `${shots}/travel-money-1280.png`, fullPage: true });
  r.axe.push(...(await axe(alice.page)).map((x) => `money 1280 ${x}`));
  r.wide1280 = await wide(alice.page);
  await settleBox.getByRole('button', { name: 'Mark as paid' }).click();
  await settleBox.getByText('Everyone is square.').waitFor({ timeout: 30_000 });
  r.afterPaid = await alice.page.getByText('All square').isVisible();

  // Packing: suggestions for this trip, Add all, tick one; Bob sees it.
  const bob = await open('bob@student.com', 'light', 390);
  await bob.page.goto(`${base}/travel/trip?id=${trip.id}&part=packing`, { waitUntil: 'load', timeout: 180_000 });
  await alice.page.goto(`${base}/travel/trip?id=${trip.id}&part=packing`, { waitUntil: 'load', timeout: 180_000 });
  const ideas = alice.page.getByRole('region', { name: 'For this trip' });
  await ideas.getByRole('button', { name: /^Add all/ }).waitFor({ timeout: 120_000 });
  r.ideas = await ideas.locator('li').allInnerTexts().then((l) => l.filter((x) => /Sunscreen|THB|JPY|adapter|Insect/.test(x)).map((x) => x.split('\n')[0]));
  await ideas.getByRole('button', { name: /^Add all/ }).click();
  const list = alice.page.getByRole('region', { name: 'Packing list' });
  await list.getByRole('checkbox', { name: 'Sunscreen' }).waitFor({ timeout: 30_000 });
  await list.getByRole('checkbox', { name: 'Sunscreen' }).click();
  await list.getByText(/1 of \d+ packed/).waitFor({ timeout: 30_000 });
  r.packed = await list.getByText(/of \d+ packed/).innerText();
  r.axe.push(...(await axe(alice.page)).map((x) => `packing 1280 ${x}`));
  await bob.page.getByRole('region', { name: 'Packing list' }).getByText(/1 of \d+ packed/).waitFor({ timeout: 45_000 });
  r.bobSees = await bob.page.getByRole('region', { name: 'Packing list' }).getByText(/of \d+ packed/).innerText();
  if (shots) await bob.page.screenshot({ path: `${shots}/travel-packing-390.png`, fullPage: true });
  r.axe.push(...(await axe(bob.page)).map((x) => `packing 390 ${x}`));
  r.wide390 = await wide(bob.page);
  await bob.page.goto(`${base}/travel/trip?id=${trip.id}&part=money`, { waitUntil: 'load', timeout: 180_000 });
  await bob.page.getByRole('region', { name: 'Shared costs' }).getByText('Dinner by the river').waitFor({ timeout: 60_000 });
  r.axe.push(...(await axe(bob.page)).map((x) => `money 390 ${x}`));
  r.wide390money = await wide(bob.page);
  await bob.ctx.close();
} finally {
  await call(alice.page, 'alice@student.com', 'DELETE', `/travel/trips/${trip.id}`).catch((e) => { r.cleanup = e.message; });
}
r.errors = errors;
console.log(JSON.stringify(r, null, 2));
await browser.close();
