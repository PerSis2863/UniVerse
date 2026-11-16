// M221 the landing's app tabs, pointed at quickly one after another while their sections are still downloading
// (each download held back 2.5 s): no page error. Before M221 the hidden copy of the first app was dropped while
// its download was on the way and React crashed when it arrived ("null is not an object (evaluating
// 'e.stateNode._retryCache')", the live error log, 16 Nov). Then a tab is picked and its sections show.
// Runs against `local:serve` (or BASE=… for local:dev).
import { launch } from '../browser-session.mjs';
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await launch();
const out = { errors: [] };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => out.errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && /retryCache|stateNode/.test(m.text())) out.errors.push(m.text().slice(0, 200)); });
await page.goto(`${base}/`, { waitUntil: 'load', timeout: 180_000 });
await page.locator('[data-uv-app="trace"]').first().waitFor({ timeout: 120_000 });
await page.waitForTimeout(1500);
// The sections' own files (and anything else the page asks for from now on) arrive late.
await page.route(/\/_next\/static\/chunks\/.+\.js/, async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue(); });
for (const id of ['trace', 'relief', 'green', 'play', 'trace']) {
  await page.locator(`[data-uv-app="${id}"]`).first().hover();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(7000);
await page.unroute(/\/_next\/static\/chunks\/.+\.js/);
await page.locator('[data-uv-app="green"]').first().click();
await page.waitForTimeout(4000);
out.greenShown = await page.locator('main').innerText().then((t) => t.length > 500);
console.log(JSON.stringify(out, null, 2));
await browser.close();
