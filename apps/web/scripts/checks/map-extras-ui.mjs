// M336 Travel's map, the features from other maps: Layers → "Weather and the world" (rain, clouds, day and night, the
// sun's directions, trails, disasters) turn on and their layers show; "What's here" has the Plus Code and "Report a
// problem"; no page errors; axe clean at 1280 (dark) and 390 (light, a touch phone) with the panel open; no
// sideways scroll. Works without the tile hosts (it checks the controls and the map's layers, not the pictures).
// Runs against `local:serve` or `local:dev` (BASE=http://localhost:3000).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {}, errors = [];
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = {});
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-travel-map-look'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/travel?view=map&at=38.7100,-9.1400,14`, { waitUntil: 'load', timeout: 240_000 });
  await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Layers' }).click();
  const box = page.getByRole('dialog', { name: 'Map layers' });
  for (const name of ['Rain (the last hours)', 'Clouds from space (yesterday)', 'Day and night', 'Sunrise and sunset directions', 'Hiking and cycling routes', 'Disasters and earthquakes']) await box.getByRole('checkbox', { name }).check();
  await page.waitForTimeout(800);
  r.checked = await box.getByRole('checkbox', { checked: true }).count();
  await page.addScriptTag({ path: AXE });
  r.axe = await page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  if (shots) await page.screenshot({ path: `${shots}/map-extras-layers-${width}.png` });
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await box.getByRole('button', { name: 'Close layers' }).click();
  // What's here: a right-click (a computer) on the middle of the map.
  if (!phone) {
    const c = page.locator('canvas.maplibregl-canvas'), b = await c.boundingBox();
    await page.mouse.click(b.x + b.width * 0.7, b.y + b.height / 2, { button: 'right' });
    const here = page.getByRole('dialog', { name: 'What’s here' });
    await here.waitFor({ timeout: 10_000 });
    r.plusCode = /[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}/.test(await here.innerText());
    r.report = await here.getByRole('link', { name: 'Report a problem with the map' }).count();
    if (shots) await page.screenshot({ path: `${shots}/map-extras-here-${width}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ out, errors }, null, 1));
