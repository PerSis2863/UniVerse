// M213 UniVerse Travel: a shared trip updates live on a friend's screen. Alice makes a trip (Lisbon) and
// Bob joins it with its code; Bob has the trip open; Alice adds Porto and renames the trip; Bob's page
// shows both without a reload, in seconds (live updates through the RealtimeHub, not the 30-second
// fallback). Then Alice deletes the trip. Needs the internet (Wikivoyage's coordinates for the places).
// Runs against `local:serve` (the live updates need the built site's Durable Object).
import { playwright, signedIn } from '../browser-session.mjs';

const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await playwright().chromium.launch();
const ctx = await signedIn(browser, base, 'bob@student.com', { width: 1280, height: 900 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
const call = async (who, method, path, data) => {
  const res = await page.request.fetch(`${base}/api/core${path}`, { method, headers: { Authorization: `Bearer mock-token-${who}` }, data, timeout: 120_000 });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const r = {};
const { trip } = await call('alice@student.com', 'POST', '/travel/trips', { name: 'Live check trip', stop: { guide: 'Lisbon', name: 'Lisbon', cc: 'PT', lat: 38.72, lon: -9.14 } });
const { code } = await call('alice@student.com', 'POST', `/travel/trips/${trip.id}/code`, {});
await call('bob@student.com', 'POST', '/travel/trips/join', { code });
try {
  await page.goto(`${base}/travel/trip?id=${trip.id}`, { waitUntil: 'load', timeout: 180_000 });
  const name = page.getByLabel('Trip name');
  await name.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(3000); // the live connection settles
  const t0 = Date.now();
  await call('alice@student.com', 'POST', `/travel/trips/${trip.id}/stops`, { guide: 'Porto', name: 'Porto', cc: 'PT', lat: 41.15, lon: -8.61, days: 2 });
  await page.getByText('Porto', { exact: true }).first().waitFor({ timeout: 45_000 });
  r.cityArrived = `${((Date.now() - t0) / 1000).toFixed(1)} s`;
  const t1 = Date.now();
  await call('alice@student.com', 'PATCH', `/travel/trips/${trip.id}`, { name: 'Live check, renamed' });
  await page.waitForFunction(() => document.getElementById('trip-name')?.value === 'Live check, renamed', null, { timeout: 45_000 });
  const t2 = Date.now();
  r.renameArrived = `${((t2 - t1) / 1000).toFixed(1)} s`;
  r.live = Math.max(t1 - t0, t2 - t1) < 15_000 ? 'live (well under the 30 s fallback)' : 'slow: the fallback refresh, not live';
} finally {
  await call('alice@student.com', 'DELETE', `/travel/trips/${trip.id}`).catch((e) => { r.cleanup = e.message; });
}
r.errors = errors;
console.log(JSON.stringify(r, null, 2));
await browser.close();
