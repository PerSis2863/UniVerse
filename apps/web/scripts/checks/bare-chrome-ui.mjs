// M271 a page that is one big map (Travel's Map, Relief's Alerts, Green's Places): on a phone the top bar (logo,
// search, bell) steps aside and the map takes its height; leaving the map brings the bar back; on a computer nothing
// changes. Axe on the map page, no sideways scroll, no page errors. Runs against `local:serve` (or BASE=…).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const PAGES = (process.env.PAGES ?? '/travel?view=map,/relief?view=alerts,/green?view=places').split(',');
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {}, errors = [];
const state = (page) => page.evaluate(() => {
  const h = document.querySelector('.mobile-header');
  return { bare: document.documentElement.hasAttribute('data-bare'), header: !!h && getComputedStyle(h).display !== 'none', mapTop: Math.round(document.querySelector('.maplibregl-canvas, canvas')?.getBoundingClientRect().top ?? -1) };
});
for (const width of [390, 1280]) {
  const phone = width < 600;
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript(() => localStorage.setItem('uv-cookies', 'essential'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
  for (const path of PAGES) {
    await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180_000 });
    await page.locator('canvas').first().waitFor({ timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r = (out[`${width} ${path}`] = await state(page));
    if (phone && shots) await page.screenshot({ path: `${shots}/bare-${path.replace(/\W+/g, '-')}.png`, timeout: 90_000 }).catch(() => {});
    if (phone) {
      await page.addScriptTag({ path: AXE });
      r.axe = await page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id));
      r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    }
  }
  // Leaving the map: the bar comes back.
  await page.goto(`${base}/travel`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(1500);
  out[`${width} /travel (after)`] = await state(page);
  await ctx.close();
}
console.log(JSON.stringify({ ...out, errors }, null, 1));
await browser.close();
