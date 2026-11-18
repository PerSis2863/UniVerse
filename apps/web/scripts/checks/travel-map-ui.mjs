// M209 UniVerse Travel's map (M214: the Layers panel, satellite and transport, the places filter; no CSP refusals): OpenFreeMap's 3D map draws (WebGL), the sights in view are listed, a tapped
// place shows its real facts (OpenStreetMap through Nominatim: hours, open or closed in its own time,
// address, links), a review with "I live here" counts under locals, Food lists other places, "Walk from
// here" strings sights into a walk, the hour slider moves the sun. Phone: the panel opens from the
// bottom. Axe at 1280 (dark) and 390 (light, a touch phone), no sideways scroll, no page errors. Deletes
// the review. Needs the internet (OpenFreeMap, Nominatim). Runs against `local:serve` (or BASE=…).
import { createRequire } from 'node:module';
import { playwright, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  // The map's own canvas labels are MapLibre's; the page around it is ours.
  return page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await playwright().chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {}, errors = [];
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [] });
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
  page.on('dialog', (d) => void d.accept());
  page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) errors.push(`${width} CSP: ${m.text().slice(0, 160)}`); });
  await page.goto(`${base}/travel?view=map&at=38.6975,-9.2066,16`, { waitUntil: 'load', timeout: 180_000 });
  await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 90_000 });
  const panel = page.getByRole('complementary', { name: 'Places' });
  if (phone) await panel.getByRole('button', { name: 'Show more' }).click();
  await panel.locator('ol li button').first().waitFor({ timeout: 90_000 });
  r.canvas = await page.evaluate(() => { const c = document.querySelector('canvas.maplibregl-canvas'); return `${c.width}x${c.height}`; });
  r.sights = await panel.locator('ol li button').count();
  if (shots) await page.screenshot({ path: `${shots}/travel-map-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `map ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  // M214: the Layers panel (satellite and transport on, then back), and the filter for the places in view.
  await page.getByRole('button', { name: 'Layers' }).click();
  const layersBox = page.getByRole('dialog', { name: 'Map layers' });
  await layersBox.getByRole('button', { name: 'Satellite' }).click();
  await layersBox.getByLabel('Trains, metro and ferries').check();
  await page.waitForTimeout(2500);
  r.axe.push(...(await axe(page)).map((x) => `layers ${x}`));
  await layersBox.getByRole('button', { name: 'Map', exact: true }).click();
  await layersBox.getByLabel('Trains, metro and ferries').uncheck();
  await page.getByRole('button', { name: 'Close layers' }).click();
  const filterBox = panel.getByLabel('Filter these places');
  if (await filterBox.isVisible()) {
    const first = (await panel.locator('ol li button').first().locator('span.font-semibold').innerText()).trim();
    await filterBox.fill(first.slice(0, 5));
    r.filtered = `${await panel.locator('ol li button').count()} for "${first.slice(0, 5)}"`;
    await filterBox.fill('');
  }
  if (!phone) {
    // A real place's card.
    const name = (await panel.locator('ol li button').first().locator('span.font-semibold').innerText()).trim();
    await panel.locator('ol li button').first().click();
    await panel.getByRole('link', { name: 'Directions' }).waitFor({ timeout: 30_000 });
    await panel.getByText(/Looking it up/).waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
    r.place = { name, heading: await panel.getByRole('heading', { level: 3 }).first().innerText(), hours: await panel.getByText(/^(Open|Closed)/).first().innerText().catch(() => 'no hours known'), links: await panel.locator('a').evaluateAll((as) => as.map((a) => a.textContent.trim()).filter(Boolean)) };
    // A review as a local.
    await panel.getByRole('button', { name: 'Write a review' }).click();
    await panel.getByRole('radio', { name: '5 stars' }).click();
    await panel.getByLabel('What should people know?').fill('Go early and sit by the window.');
    await panel.getByLabel('I live here').check();
    await panel.getByRole('button', { name: 'Post review' }).click();
    await panel.getByText('Lives here').waitFor({ timeout: 30_000 });
    r.review = (await panel.getByText(/^Locals say/).locator('xpath=..').innerText()).replace(/\s+/g, ' ');
    r.axe.push(...(await axe(page)).map((x) => `place ${x}`));
    await panel.getByRole('button', { name: 'Change my review' }).click();
    await panel.getByRole('button', { name: 'Delete' }).click();
    await panel.getByText(/No reviews yet/).waitFor({ timeout: 30_000 });
    r.reviewDeleted = true;
    await panel.getByRole('button', { name: 'Close' }).click();
    // Another kind of place, a walk, the hour.
    await page.getByRole('button', { name: 'Food', exact: true }).click();
    await page.waitForTimeout(1500);
    r.food = await panel.locator('ol li button span.font-semibold').allInnerTexts().then((t) => t.slice(0, 3));
    await page.getByRole('button', { name: 'Sights', exact: true }).click();
    await page.waitForTimeout(800);
    await panel.getByRole('button', { name: 'Sightseeing walk' }).click();
    await panel.getByText(/stops · .* km on foot/).waitFor({ timeout: 30_000 });
    r.walk = (await panel.getByText(/stops · .* km on foot/).innerText()).trim();
    if (shots) await page.screenshot({ path: `${shots}/travel-walk-1280.png` });
    const clock = panel.locator('label:has(input[type=range]) > span').first();
    const before = (await clock.innerText()).replace(/\s+/g, ' ');
    await panel.getByLabel('The hour at this place').fill('24');
    r.hour = `${before} → ${(await clock.innerText()).replace(/\s+/g, ' ')}`;
  }
  await ctx.close();
}
out.errors = errors;
await browser.close();
console.log(JSON.stringify(out, null, 2));
