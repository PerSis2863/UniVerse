// M239–M248 UniVerse Travel: the trip page's new parts. Alice makes a trip (Lisbon then Porto, starting today, so
// Today has a live day) with places planned, Bob joins. Today shows the next place; Votes: Alice asks, Bob's open
// page gets the poll live and his vote reaches Alice's; Journal: an entry and the Story; Phrases: Portuguese with the
// big card; Ready: jet lag, offline, documents, holidays, footprint; Share: the family link opens signed out. Axe at
// 1280 (dark) and 390 (light, a phone) on each part, no sideways scroll, no page errors. Deletes the trip.
// Runs against `local:serve` (or BASE=http://localhost:3000 for local:dev). SHOTS=dir saves screenshots.
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
const errors = [], r = { axe: [], wide: [] };
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
/** Waits for something to arrive live; with LIVE=0 (local:dev has no live updates) reloads once instead. */
const live = async (page, loc) => {
  try { await loc.waitFor({ timeout: process.env.LIVE === '0' ? 4_000 : 45_000 }); return true; } catch (e) {
    if (process.env.LIVE !== '0') throw e;
    await page.reload(); await loc.waitFor({ timeout: 60_000 }); return 'after reload';
  }
};
const today = new Date().toISOString().slice(0, 10);
const A = 'alice@student.com', B = 'bob@student.com';
const TRIP = `Ten features check ${Date.now().toString(36)}`; // new each run: a train leg is logged in Green once

const alice = await open(A, 'dark', 1280);
const { trip } = await call(alice.page, A, 'POST', '/travel/trips', { name: TRIP, startDate: today, stop: { guide: 'Lisbon', name: 'Lisbon', cc: 'PT', lat: 38.7139, lon: -9.1394, days: 2 } });
const { stop } = await call(alice.page, A, 'POST', `/travel/trips/${trip.id}/stops`, { guide: 'Porto', name: 'Porto', cc: 'PT', lat: 41.1496, lon: -8.611, days: 2 });
const first = (await call(alice.page, A, 'GET', `/travel/trips/${trip.id}`)).stops[0];
for (const [i, [name, lat, lon]] of [['Belém Tower', 38.6916, -9.216], ['Jerónimos Monastery', 38.6979, -9.2068], ['Time Out Market', 38.7069, -9.1459]].entries()) {
  await call(alice.page, A, 'POST', `/travel/trips/${trip.id}/items`, { stopId: first.id, name, kind: 'see', lat, lon, minutes: 60, day: i < 2 ? 0 : null });
}
const { code } = await call(alice.page, A, 'POST', `/travel/trips/${trip.id}/code`, {});
await call(alice.page, B, 'POST', '/travel/trips/join', { code });
const part = async (p, name, width) => {
  await p.page.goto(`${base}/travel/trip?id=${trip.id}&part=${name}`, { waitUntil: 'load', timeout: 180_000 });
  await p.page.locator('main').getByRole('group', { name: 'Part of the trip' }).waitFor({ timeout: 120_000 });
  await p.page.waitForTimeout(1500);
  if (shots) await p.page.screenshot({ path: `${shots}/travel-${name}-${width}.png`, fullPage: true });
  r.axe.push(...(await axe(p.page)).map((x) => `${name} ${width} ${x}`));
  if (await wide(p.page)) r.wide.push(`${name} ${width}`);
};
try {
  // Today.
  await part(alice, 'today', 1280);
  r.today = (await alice.page.getByRole('region', { name: 'Which day' }).innerText()).replace(/\s+/g, ' ').slice(0, 120);
  r.todayPlan = await alice.page.getByRole('region', { name: 'The day' }).locator('li').count();

  // Votes, live between Alice and Bob.
  const bob = await open(B, 'light', 390);
  await part(bob, 'polls', 390);
  await part(alice, 'polls', 1280);
  const ask = alice.page.getByRole('region', { name: 'Ask the group' });
  await ask.getByLabel('Question').fill('Day trip from Lisbon?');
  await ask.getByLabel('Choice 1').fill('Sintra');
  await ask.getByLabel('Choice 2').fill('Cascais');
  await ask.getByRole('button', { name: 'Ask everyone' }).click();
  r.pollLiveToBob = await live(bob.page, bob.page.getByRole('heading', { name: 'Day trip from Lisbon?' }));
  await bob.page.getByRole('button', { name: /Sintra/ }).click();
  r.voteLiveToAlice = await live(alice.page, alice.page.getByText(/Leading/));
  r.vote = (await alice.page.getByRole('button', { name: /Sintra/ }).innerText()).replace(/\s+/g, ' ');
  r.axe.push(...(await axe(alice.page)).map((x) => `polls-after 1280 ${x}`));

  // Journal and its story.
  await part(alice, 'journal', 1280);
  await alice.page.getByLabel('What happened').fill('Custard tarts, still warm.');
  await alice.page.getByRole('button', { name: 'Add to the journal' }).click();
  await alice.page.getByText('Custard tarts, still warm.').waitFor({ timeout: 30_000 });
  await alice.page.getByRole('button', { name: 'Story' }).click();
  await alice.page.getByRole('region', { name: /^Day 1/ }).waitFor({ timeout: 30_000 });
  r.story = true;
  r.axe.push(...(await axe(alice.page)).map((x) => `story 1280 ${x}`));
  await part(bob, 'journal', 390);

  // Phrases.
  await part(alice, 'phrases', 1280);
  r.phrases = await alice.page.getByRole('region', { name: 'Greetings' }).getByText('Olá').isVisible();
  await alice.page.getByRole('button', { name: 'Show “Thank you” big' }).click();
  r.bigCard = await alice.page.getByRole('dialog').getByText('Obrigado / Obrigada').isVisible();
  r.axe.push(...(await axe(alice.page)).map((x) => `phrases-card 1280 ${x}`));
  await alice.page.keyboard.press('Escape');
  await part(bob, 'phrases', 390);

  // Ready: the footprint's train goes to Green; a document with its warning.
  await part(alice, 'ready', 1280);
  const foot = alice.page.getByRole('region', { name: 'Footprint' });
  await foot.getByRole('button', { name: /^Train/ }).click();
  await alice.page.getByText(/Logged in Green/).waitFor({ timeout: 30_000 });
  r.green = true;
  const docs = alice.page.getByRole('region', { name: 'Documents' });
  await docs.getByLabel('Expires (optional)').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await docs.getByRole('button', { name: 'Add' }).click();
  await docs.getByText(/Passport expires in 20 days/).waitFor({ timeout: 30_000 });
  r.docWarning = true;
  r.holidays = (await alice.page.getByRole('region', { name: 'Holidays and events' }).innerText()).replace(/\s+/g, ' ').slice(0, 160);
  r.axe.push(...(await axe(alice.page)).map((x) => `ready-after 1280 ${x}`));
  r.bobSeesDoc = await (await call(alice.page, B, 'GET', `/travel/docs?trip=${trip.id}`)).docs.length;
  await part(bob, 'ready', 390);

  // Share: the family link, I'm safe, and the page signed out.
  await part(alice, 'share', 1280);
  await alice.page.getByRole('button', { name: 'Turn on the family link' }).click();
  const link = await alice.page.locator('code').filter({ hasText: '/journey/' }).innerText({ timeout: 30_000 });
  await alice.page.getByPlaceholder(/Landed/).fill('All good here');
  await alice.page.getByRole('button', { name: 'I’m safe' }).click();
  await alice.page.getByText('All good here').waitFor({ timeout: 30_000 });
  r.axe.push(...(await axe(alice.page)).map((x) => `share-after 1280 ${x}`));
  await part(bob, 'share', 390);
  for (const [theme, width] of [['light', 390], ['dark', 1280]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`family: ${e.message.slice(0, 160)}`));
    await page.goto(link, { waitUntil: 'load', timeout: 180_000 });
    await page.getByRole('heading', { name: TRIP }).waitFor({ timeout: 120_000 });
    await page.getByText(/checked in safe/).waitFor({ timeout: 30_000 });
    const text = await page.locator('main').innerText();
    r.familyNoEmail = !/@/.test(text);
    r.familyStory = text.includes('Custard tarts');
    if (shots) await page.screenshot({ path: `${shots}/travel-family-${width}.png`, fullPage: true });
    r.axe.push(...(await axe(page)).map((x) => `family ${width} ${x}`));
    if (await wide(page)) r.wide.push(`family ${width}`);
    await ctx.close();
  }
  await part(bob, 'today', 390);
} catch (e) {
  r.failed = String(e).slice(0, 400);
} finally {
  await call(alice.page, A, 'DELETE', `/travel/trips/${trip.id}`).catch(() => {});
  void stop;
}
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
process.exit(r.failed || errors.length || r.axe.length || r.wide.length ? 1 : 0);
