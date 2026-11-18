// M268 Travel's map for a city and a stay: opened on Paris (from its guide), the Sights panel shows the guide's
// must-see places and its areas (districts with what's there); Food, picked over the whole city, glides in and lists
// restaurants instead of asking to zoom in; a hotel typed in ("Hotel Le Bristol Paris") is found and marked, and the
// panel recommends what's around it (must-see with the walk, areas) with buttons for the nearest restaurants, cafés,
// bars and shops; with the stay's district guide, the city's own picks for food and shopping (M268); a hotel saved on a
// trip is offered under the field and used with one tap. Axe at 1280 (dark) and 390 (light), no sideways scroll, no page errors. Needs the internet
// (OpenFreeMap, Nominatim, Wikivoyage). Runs against `local:serve` (or BASE=…).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {}, errors = [];
const H = { Authorization: 'Bearer mock-token-alice@student.com', 'Content-Type': 'application/json' };
const call = async (path, body, method = body ? 'POST' : 'GET') => (await fetch(`${base}/api/core${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })).json();
// A trip to Paris with a hotel on it (an earlier run's left over first).
for (const t of (await call('/travel/trips')).trips ?? []) if (t.name === 'Stay check') await fetch(`${base}/api/core/travel/trips/${t.id}`, { method: 'DELETE', headers: H });
const trip = await call('/travel/trips', { name: 'Stay check', stop: { guide: 'Paris', name: 'Paris', cc: 'FR', lat: 48.8566, lon: 2.3522, days: 3 } });
const tripId = trip.id ?? trip.trip?.id;
const full = await call(`/travel/trips/${tripId}`);
const stopId = full.stops[0].id;
await call(`/travel/trips/${tripId}/items`, { stopId, name: 'Le Bristol', kind: 'sleep', address: '112 Rue du Faubourg Saint-Honoré, Paris' });
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = {});
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-travel-stay'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/travel?view=map&d=Paris`, { waitUntil: 'load', timeout: 180_000 });
  await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 90_000 });
  const panel = page.getByRole('complementary', { name: 'Places' });
  if (phone) await page.getByRole('button', { name: 'Show more' }).click().catch(() => {});
  await panel.getByText('Must-see in Paris').waitFor({ timeout: 90_000 }).then(() => { r.mustSee = true; }).catch(() => { r.mustSee = false; });
  r.sights = await panel.locator('section[aria-label="Highlights of Paris"] li').count();
  r.areas = await panel.getByText('Areas to explore').count();
  // Food over the whole city: it glides in and lists places.
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Places"] ol li button').length > 2, null, { timeout: 60_000 }).then(() => { r.foodListed = true; }).catch(() => { r.foodListed = false; });
  r.zoomInMessage = await panel.getByText(/Zoom in/).count();
  // A stay.
  await page.getByLabel(/Where you're staying/).fill('Hotel Le Bristol Paris');
  await page.getByRole('button', { name: 'Find' }).click();
  await panel.getByText(/^Around/).waitFor({ timeout: 90_000 }).then(() => { r.around = true; }).catch(() => { r.around = false; });
  r.stayMarker = await page.getByText('Your stay', { exact: true }).count();
  await panel.getByRole('heading', { name: 'Food', exact: true }).waitFor({ timeout: 90_000 }).catch(() => {});
  r.cityFood = await panel.getByRole('heading', { name: 'Food', exact: true }).locator('xpath=following-sibling::ol[1]/li').count();
  r.cityShops = await panel.getByRole('heading', { name: 'Shopping', exact: true }).count();
  r.walks = await panel.getByText(/min walk/).count();
  await panel.getByRole('button', { name: 'Restaurants' }).click().catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Places"] ol li button').length > 2, null, { timeout: 45_000 }).catch(() => {});
  r.restaurants = await panel.locator('ol li button').count();
  // The stay from the trip, with one tap.
  await page.getByRole('button', { name: "Forget where I'm staying" }).click();
  await page.getByLabel(/Where you're staying/).focus();
  const fromTrip = page.getByRole('group', { name: 'Stays on your trips' }).getByRole('button', { name: /Le Bristol/ });
  r.tripOffered = await fromTrip.count();
  if (r.tripOffered) { await fromTrip.click(); await panel.getByText(/^Around/).waitFor({ timeout: 60_000 }).then(() => { r.tripUsed = true; }).catch(() => { r.tripUsed = false; }); }
  if (shots) await page.screenshot({ path: `${shots}/stay-${width}.png`, timeout: 90_000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  r.axe = await page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`));
  r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  await ctx.close();
}
await fetch(`${base}/api/core/travel/trips/${tripId}`, { method: 'DELETE', headers: H });
console.log(JSON.stringify({ ...out, errors }, null, 1));
await browser.close();
