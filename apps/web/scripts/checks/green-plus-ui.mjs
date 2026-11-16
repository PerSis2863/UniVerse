// M216 UniVerse Green's second wave: every new tab (Footprint, Journeys, Goals, Tips, Events, Green places,
// Teams' weekly league) and My impact's year, at 1280 (dark) and 390 (light, a touch phone): axe, no sideways
// scroll, no page errors. On the computer: a footprint saved; a journey ranked; a goal set, a tip pledged and
// a day ticked; an event put up by Alice (an adult here), Bob going, then deleted; green places
// listed from the map. Tidies up. Runs against `local:serve` (or BASE=… for local:dev).
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
const call = async (page, who, method, path, data) => {
  const res = await page.request.fetch(`${base}/api/core${path}`, { method, headers: { Authorization: `Bearer mock-token-${who}` }, data, timeout: 120_000 });
  return { status: res.status(), body: await res.json().catch(() => null) };
};
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [], wide: [] });
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.setItem('uv-green-places', JSON.stringify({ lat: 38.7105, lon: -9.1365, zoom: 15.5 })); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`${width}: ${e.message.slice(0, 160)}`));
  page.on('dialog', (d) => void d.accept());
  const visit = async (view, ready) => {
    await page.goto(`${base}/green${view ? `?view=${view}` : ''}`, { waitUntil: 'load', timeout: 180_000 });
    await ready().waitFor({ timeout: 120_000 }).catch(async (e) => { console.error('PAGE', view, (await page.locator('#main').innerText().catch(() => '')).slice(0, 400).replace(/\n/g, ' | ')); throw e; });
    if (shots) await page.screenshot({ path: `${shots}/green-${view || 'impact'}-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `${view || 'impact'} ${x}`));
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) r.wide.push(view || 'impact');
  };
  if (!phone) { // a clean start: no pledge or goal from an earlier run
    const g = await call(page, 'alice@student.com', 'GET', '/green/goals');
    for (const p of g.body?.pledges ?? []) if (p.tip === 'meat-free-days') await call(page, 'alice@student.com', 'DELETE', `/green/pledges/${p.id}`);
    for (const e of (await call(page, 'alice@student.com', 'GET', '/green/events')).body?.events ?? []) if (e.mine && e.title.startsWith('Check:')) await call(page, 'alice@student.com', 'DELETE', `/green/events/${e.id}`);
  }
  await visit('', () => page.getByRole('heading', { name: 'Your year' }));
  await visit('footprint', () => page.getByRole('heading', { name: 'Your footprint' }));
  if (!phone) {
    await page.getByLabel('Car, km a week').fill('40');
    await page.getByRole('button', { name: 'Save this result' }).click();
    await page.getByRole('heading', { name: 'Your results' }).waitFor({ timeout: 30_000 });
    r.footprint = await page.getByRole('region', { name: 'Your footprint' }).locator('div.text-4xl').innerText();
  }
  await visit('trips', () => page.getByRole('heading', { name: /km,/ }));
  if (!phone) {
    await page.getByRole('combobox', { name: /^From/ }).selectOption('Lisbon');
    await page.getByRole('combobox', { name: /^To/ }).selectOption('Porto');
    await page.getByText('Cleanest', { exact: true }).waitFor({ timeout: 15_000 });
    r.journey = (await page.getByRole('region', { name: /km,/ }).locator('li').first().innerText()).replace(/\s+/g, ' ');
  }
  await visit('tips', () => page.getByRole('heading', { name: 'What saves the most' }));
  if (!phone) {
    await page.getByRole('listitem').filter({ hasText: 'Two meat-free days a week' }).getByRole('button', { name: 'Pledge this' }).click();
    await page.getByRole('listitem').filter({ hasText: 'Two meat-free days a week' }).getByText('Pledged').waitFor({ timeout: 30_000 });
  }
  await visit('goals', () => page.getByRole('heading', { name: 'My pledges' }));
  if (!phone) {
    await page.getByLabel('Goal, kg of CO₂ a month').fill('50');
    await page.getByRole('button', { name: /^(Set|Change)$/ }).click();
    await page.getByText(/of 50 kg/).waitFor({ timeout: 30_000 });
    const days = page.getByRole('group', { name: /Days you kept “Two meat-free days a week”/ });
    await days.getByRole('button').last().click();
    await days.getByRole('button', { pressed: true }).first().waitFor({ timeout: 30_000 });
    r.goals = 'goal 50 kg, pledge ticked';
  }
  await visit('events', () => page.getByRole('button', { name: 'Organise one' }));
  if (!phone) {
    const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const made = await call(page, 'alice@student.com', 'POST', '/green/events', { title: 'Check: park litter pick', kind: 'cleanup', date, time: '10:00', place: 'Main gate', lat: 38.71, lng: -9.14 });
    r.made = made.status;
    r.bobGoing = (await call(page, 'bob@student.com', 'POST', `/green/events/${made.body?.id}/going`)).body;
    await page.reload({ waitUntil: 'load' });
    const card = page.getByRole('listitem').filter({ hasText: 'Check: park litter pick' });
    await card.getByText(/2 going · organised by you/).waitFor({ timeout: 30_000 });
    r.going = await card.getByText(/going · organised/).innerText();
    r.axe.push(...(await axe(page)).map((x) => `events-card ${x}`));
    if (made.body?.id) await call(page, 'alice@student.com', 'DELETE', `/green/events/${made.body.id}`);
  }
  await visit('places', () => page.locator('canvas.maplibregl-canvas'));
  await page.getByRole('complementary', { name: 'Green places' }).locator('ol li button').first().waitFor({ timeout: 90_000 }).catch(() => {});
  r.places = await page.getByRole('complementary', { name: 'Green places' }).locator('ol li button').count();
  await page.goto(`${base}/green/teams`, { waitUntil: 'load', timeout: 180_000 });
  await page.getByRole('heading', { name: 'Team league' }).waitFor({ timeout: 60_000 });
  r.axe.push(...(await axe(page)).map((x) => `teams ${x}`));
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) r.wide.push('teams');
  if (!phone) {
    // Tidy up: the pledge and the goal.
    const g = await call(page, 'alice@student.com', 'GET', '/green/goals');
    for (const p of g.body?.pledges ?? []) if (p.tip === 'meat-free-days') await call(page, 'alice@student.com', 'DELETE', `/green/pledges/${p.id}`);
    await call(page, 'alice@student.com', 'PUT', '/green/goals', { monthlyKg: null });
  }
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
