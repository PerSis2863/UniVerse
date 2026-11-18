// M270 Travel's map: a place's card has its facts (built, heritage, designer, height, visitors…) and a "Did you know?"
// with no credit line under it; the panel's two plain choices (Directions, Sightseeing walk) say what they do and
// Directions opens From / To. Opened on Paris; the Eiffel Tower is tapped from its must-see list. Axe at 1280 (dark) and
// 390 (light), no page errors. Needs the internet (Nominatim, Wikidata, Wikipedia). Runs against `local:serve` (or BASE=…).
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
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-travel-stay'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/travel?view=map&d=Paris`, { waitUntil: 'load', timeout: 180_000 });
  await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 90_000 });
  const panel = page.getByRole('complementary', { name: 'Places' });
  // A phone's sheet starts folded down (the list under the fold): pulled up once the page is ready.
  if (phone) { await page.waitForTimeout(3000); const more = page.getByRole('button', { name: 'Show more' }); if (await more.count()) await more.click(); }
  await panel.getByRole('button', { name: 'Sightseeing walk' }).waitFor({ timeout: 90_000 }).catch(() => {}); // once the map is over Paris
  r.directionsButton = await panel.getByRole('button', { name: 'Directions', exact: true }).count();
  r.walkButton = await panel.getByRole('button', { name: 'Sightseeing walk' }).count();
  r.explained = await panel.getByText(/from any place to another/).count();
  await panel.getByRole('button', { name: /^Eiffel Tower/ }).first().click({ timeout: 90_000 }).catch(async (e) => { console.log('PANEL', (await panel.innerText()).slice(0, 300)); await page.screenshot({ path: '/tmp/claude-0/-home-user-UniVerse/108f1097-fb74-5b13-8b2c-743ce0bd2a19/scratchpad/shots/fail.png', timeout: 60_000 }).catch(() => {}); throw e; });
  await panel.getByRole('list', { name: /^Facts about/ }).waitFor({ timeout: 90_000 }).then(() => { r.facts = true; }).catch(() => { r.facts = false; });
  r.factLines = await panel.getByRole('list', { name: /^Facts about/ }).locator('li').allTextContents().catch(() => []);
  r.funFact = (await panel.getByText('Did you know?').count()) > 0;
  r.creditLine = await page.getByText(/OpenStreetMap contributors \(ODbL\), Wikidata/).count();
  if (shots) await page.screenshot({ path: `${shots}/facts-${width}.png`, timeout: 90_000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  r.axe = await page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`));
  // Directions: From and To (the card closed first).
  await panel.getByRole('button', { name: /^Close/ }).first().click().catch(() => {});
  await panel.getByRole('button', { name: 'Directions', exact: true }).last().click().catch(() => {});
  r.fromTo = await panel.getByText(/^(From|To)$/).count().catch(() => 0) || await panel.getByRole('button', { name: /^(From|To) / }).count();
  await ctx.close();
}
console.log(JSON.stringify({ ...out, errors }, null, 1));
await browser.close();
