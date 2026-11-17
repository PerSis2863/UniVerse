// M260 live navigation on Travel's map, with a simulated walk (the phone's position from Playwright's geolocation, the
// FOSSGIS router and Nominatim answered here, map tiles refused: no internet needed). Directions from where I am to a
// shared spot, the route's time bubble and the card's new parts (stops, leave at, avoid for driving), Start: the banner
// counts down to the turn, says it, shows "Then"; leaving the route asks for a new one; reaching the end shows the arrival
// card. Spoken lines are recorded (speechSynthesis wrapped). Long tasks are counted while navigating. Axe at 1280 (dark)
// and 390 (light, a touch phone), no sideways scroll, no page errors. Runs against `local:dev` or `local:serve` (BASE=…).
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;

// An L-shaped walk in Helsinki: north up Mannerheimintie, then right along Esplanadi.
const A = [24.94, 60.17], B = [24.94, 60.175], C = [24.95, 60.175];
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
function answer(from) {
  // From A: the L; from anywhere else (a new route): straight to the corner's east street, then to C.
  const start = from[0] === A[0] && from[1] === A[1] ? A : from, corner = [start[0], B[1]];
  return { code: 'Ok', routes: [
    { duration: 800, distance: 1110, geometry: { coordinates: [start, corner, C] }, legs: [{ steps: [
      { name: 'Mannerheimintie', distance: 556, duration: 400, maneuver: { type: 'depart', location: start } },
      { name: 'Esplanadi', distance: 554, duration: 400, maneuver: { type: 'turn', modifier: 'right', location: corner } },
      { name: '', distance: 0, duration: 0, maneuver: { type: 'arrive', location: C } }] }] },
    { duration: 1000, distance: 1300, geometry: { coordinates: [start, [start[0] + 0.004, start[1] + 0.001], [C[0], C[1] - 0.002], C] }, legs: [{ steps: [
      { name: 'Bulevardi', distance: 1300, duration: 1000, maneuver: { type: 'depart', location: start } },
      { name: '', distance: 0, duration: 0, maneuver: { type: 'arrive', location: C } }] }] },
  ] };
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run({ exclude: [['.maplibregl-canvas-container']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
}
const browser = await launch();
const out = {}, errors = [];
for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = { axe: [], reroutes: 0 });
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({ latitude: A[1], longitude: A[0], accuracy: 5 });
  await ctx.addInitScript((th) => {
    localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential');
    window.__spoken = [];
    try { const speak = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { if (u.text.trim()) window.__spoken.push(u.text); return speak(u); }; } catch { /* no speech */ }
    window.__long = 0;
    try { new PerformanceObserver((l) => { window.__long += l.getEntries().filter((e) => e.duration > 80).length; }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
  }, theme);
  await ctx.route(/tiles\.openfreemap\.org|elevation-tiles|tiles\.maps\.eox|panoramax/, (rt) => rt.fulfill({ status: 404, body: '' }));
  await ctx.route(/nominatim\.openstreetmap\.org/, (rt) => rt.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ display_name: 'Esplanadi 1, Kaartinkaupunki, Helsinki, Finland' }) }));
  await ctx.route(/routing\.openstreetmap\.de/, (rt) => {
    const m = /driving\/(-?[\d.]+),(-?[\d.]+);/.exec(rt.request().url()), from = [Number(m[1]), Number(m[2])];
    if (from[0] !== A[0]) r.reroutes++;
    return rt.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer(from)) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)} ${(e.stack ?? '').split('\n').slice(1, 3).join(' ').slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource|AJAXError|tiles|net::/.test(m.text())) errors.push(`${width} console: ${m.text().slice(0, 200)}`); if (/Content Security Policy/.test(m.text())) errors.push(`${width} CSP: ${m.text().slice(0, 160)}`); });
  await page.goto(`${base}/travel?view=map&at=${C[1]},${C[0]},16&pin=1`, { waitUntil: 'load', timeout: 180_000 });
  await page.locator('canvas.maplibregl-canvas').waitFor({ timeout: 120_000 });
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }); // local:dev's badge sits over the bottom bar
  await page.getByRole('button', { name: 'Where I am' }).click();
  const here = page.getByRole('dialog', { name: 'What’s here' });
  await here.getByRole('button', { name: 'Directions to here' }).click();
  const panel = page.getByRole('complementary', { name: 'Places' });
  await panel.getByRole('button', { name: 'Start', exact: true }).waitFor({ timeout: 30_000 });
  r.routes = await panel.locator('ul li').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ').trim()));
  r.bubbles = await page.evaluate(() => document.querySelector('canvas.maplibregl-canvas') ? 'drawn' : 'none');
  r.cardParts = { addStop: await panel.getByRole('button', { name: 'Add a stop' }).isVisible(), when: await panel.getByLabel('When').inputValue() };
  await panel.getByRole('button', { name: 'Drive', exact: true }).click();
  await panel.getByRole('button', { name: 'Start', exact: true }).waitFor({ timeout: 30_000 }).catch(async (e) => { if (shots) await page.screenshot({ path: `${shots}/nav-fail-${width}.png` }); throw e; });
  r.cardParts.avoid = await panel.getByLabel('Avoid').isVisible();
  r.cardParts.trafficNote = await panel.getByText(/live traffic isn’t counted/).isVisible();
  r.axe.push(...(await axe(page)).map((x) => `directions ${x}`));
  if (shots) await page.screenshot({ path: `${shots}/nav-directions-${width}.png` });
  await panel.getByRole('button', { name: 'Walk', exact: true }).click();
  await panel.getByRole('button', { name: 'Start', exact: true }).waitFor({ timeout: 30_000 });
  await panel.getByRole('button', { name: 'Start', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Next turn' });
  await banner.waitFor({ timeout: 20_000 });
  await banner.getByText(/\d+ m$/).waitFor({ timeout: 20_000 });
  r.first = (await banner.innerText()).replace(/\s+/g, ' ');
  // Walk up the street: the banner counts down.
  const go = async (p) => { await ctx.setGeolocation({ latitude: p[1], longitude: p[0], accuracy: 5 }); await page.waitForTimeout(phone ? 450 : 350); };
  for (let t = 0.1; t <= 0.85; t += 0.15) await go(lerp(A, B, t));
  r.near = (await banner.innerText()).replace(/\s+/g, ' ');
  if (shots) await page.screenshot({ path: `${shots}/nav-walking-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `navigating ${x}`));
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  // Round the corner, then off the route (three fixes 150 m east of the street: a new route).
  for (const t of [0.95, 1]) await go(lerp(A, B, t));
  for (const t of [0.1, 0.2]) await go(lerp(B, C, t));
  for (let i = 0; i < 4; i++) await go([B[0] + 0.0045, B[1] - 0.0015 + i * 0.0001]);
  await page.waitForTimeout(800);
  r.afterOff = (await banner.innerText().catch(() => '')).replace(/\s+/g, ' ');
  // Move the map: "Re-centre" appears, and brings the camera back.
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height * 0.6 + 60, { steps: 6 }); await page.mouse.up();
  r.recentre = await page.getByRole('button', { name: 'Re-centre' }).isVisible();
  if (r.recentre) await page.getByRole('button', { name: 'Re-centre' }).click();
  // The turns still to come, then on to the end.
  await page.getByRole('button', { name: /See the turns/ }).click();
  r.turns = await page.locator('#nav-turns li').count();
  await page.getByRole('button', { name: /Hide the turns/ }).click();
  const from = [B[0] + 0.0045, B[1] - 0.0012];
  for (let t = 0.2; t <= 1.001; t += 0.2) await go(lerp(from, [from[0], B[1]], t));
  for (let t = 0.2; t <= 1.001; t += 0.2) await go(lerp([from[0], B[1]], C, t));
  await page.getByRole('heading', { name: 'You have arrived' }).waitFor({ timeout: 15_000 });
  r.arrived = (await page.getByRole('status').filter({ hasText: 'You have arrived' }).innerText()).replace(/\s+/g, ' ');
  r.spoken = await page.evaluate(() => window.__spoken);
  r.longTasks = await page.evaluate(() => window.__long);
  if (shots) await page.screenshot({ path: `${shots}/nav-arrived-${width}.png` });
  r.axe.push(...(await axe(page)).map((x) => `arrived ${x}`));
  await page.getByRole('button', { name: 'Done' }).click();
  r.back = await panel.getByRole('heading', { name: 'Directions' }).isVisible();
  await ctx.close();
}
out.errors = errors;
await browser.close();
console.log(JSON.stringify(out, null, 2));
