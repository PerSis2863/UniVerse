// M264 Travel's "A trip on the map" in the command look (the owner's recording): a trip started three days ago
// (Lisbon three days, then Porto: today is day 4, in Porto) with places on its days. Layers → A trip on the map: the
// way to Porto travelled (solid), Porto pulsing, the day chips with counts, the number cards (a computer). Map tiles are
// refused (no internet needed). Axe at 1280 (dark) and 390 (light, a touch phone); the trip is deleted after.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/travel-command-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const call = async (method, path, body) => {
  const r = await fetch(`${base}/api/core${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-token-alice@student.com' }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => null);
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const name = `Command look trip ${Date.now() % 100000}`;
const { trip } = await call('POST', '/travel/trips', { name, startDate: day(-3), stop: { guide: 'Lisbon', name: 'Lisbon', cc: 'PT', lat: 38.72, lon: -9.14, days: 3 } });
await call('POST', `/travel/trips/${trip.id}/stops`, { guide: 'Porto', name: 'Porto', cc: 'PT', lat: 41.15, lon: -8.61, days: 2 });
const full = await call('GET', `/travel/trips/${trip.id}`);
const [lis, por] = full.stops;
for (const [stopId, d, n, lat, lon] of [[lis.id, 0, 'Belém Tower', 38.6916, -9.216], [lis.id, 1, 'Alfama', 38.7114, -9.13], [lis.id, 1, 'São Jorge Castle', 38.7139, -9.1335], [por.id, 0, 'Ribeira', 41.1405, -8.6131]])
  await call('POST', `/travel/trips/${trip.id}/items`, { stopId, name: n, kind: 'see', lat, lon, day: d });
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
}
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
    const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [] });
    const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    await ctx.route(/tiles\.openfreemap\.org|elevation-tiles|tiles\.maps\.eox|panoramax|wikimedia/, (rt) => rt.fulfill({ status: 404, body: '' }));
    // M265: the routers answered here with a road that bends (a zigzag through every point asked).
    r.routed = [];
    await ctx.route(/routing\.openstreetmap\.de/, (rt) => {
      const url = rt.request().url(), pts = /driving\/([^?]+)/.exec(url)[1].split(';').map((p) => p.split(',').map(Number));
      r.routed.push(/routed-(\w+)/.exec(url)[1]);
      const path = pts.slice(1).flatMap((b, i) => { const a = pts[i]; const k = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.15; return [a, [a[0] + (b[0] - a[0]) * 0.3 + k, a[1] + (b[1] - a[1]) * 0.3], [a[0] + (b[0] - a[0]) * 0.7 - k, a[1] + (b[1] - a[1]) * 0.7], b]; });
      return rt.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', routes: [{ duration: 600, distance: 1000, geometry: { coordinates: path }, legs: [{ steps: [] }] }] }) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
    await page.goto(`${base}/travel?view=map&at=40,-9,6`, { waitUntil: 'load', timeout: 180_000 });
    await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 120_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByRole('dialog', { name: 'Map layers' }).locator('select').selectOption({ label: new RegExp(name) }).catch(async () => {
      const opt = await page.getByRole('dialog', { name: 'Map layers' }).locator('option', { hasText: name }).getAttribute('value');
      await page.getByRole('dialog', { name: 'Map layers' }).locator('select').selectOption(opt);
    });
    await page.getByRole('button', { name: 'Close layers' }).click();
    const days = page.getByRole('radiogroup', { name: 'Day of the trip' });
    await days.waitFor({ timeout: 30_000 }).catch(async (e) => { if (shots) await page.screenshot({ path: `${shots}/travel-fail-${width}.png` }); console.log(JSON.stringify(errors)); throw e; });
    await page.waitForTimeout(2200);
    r.days = await days.innerText({ timeout: 5000 }).then((t) => t.replace(/\s+/g, ' ')).catch(async () => { if (shots) await page.screenshot({ path: `${shots}/travel-gone-${width}.png` }); return `gone; errors: ${JSON.stringify(errors)}`; });
    r.ring = await page.locator('.cmd-ring').count();
    r.stats = await page.locator('.cmd-travel .cmd-pop').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')));
    r.layers = await page.evaluate(() => { const m = document.querySelector('.maplibregl-map'); return m ? 'map' : 'none'; });
    if (shots) await page.screenshot({ path: `${shots}/travel-command-${width}.png` });
    r.axe.push(...(await axe(page)).map((x) => `trip ${x}`));
    await days.getByRole('radio', { name: /Day 2/ }).click();
    r.day2 = await days.getByRole('radio', { name: /Day 2/ }).getAttribute('aria-checked');
    await page.waitForTimeout(2500);
    r.routedAfterDay = [...new Set(r.routed)];
    if (shots) await page.screenshot({ path: `${shots}/travel-day-walk-${width}.png` });
    r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await ctx.close();
  }
} finally {
  await call('DELETE', `/travel/trips/${trip.id}`);
  await browser.close();
}
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
