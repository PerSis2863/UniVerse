// M181 (dev server or built Worker): arranging keeps things where they belong, and every edge resizes.
// On the student home: a number tile's start (left) edge pulled out widens it, the edge following the
// hand; Quick notes' top edge pulled up makes it taller. A tile carried out of its row and let go
// elsewhere goes back to its place (the order is unchanged), with a short shake. "Tidy" packs the page
// and Ctrl+Z takes it back. Axe after.
//   node scripts/checks/arrange-keep-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const B = baseUrl();
const browser = await launch();
const ctx = await signedIn(browser, B, 'demo@student.com', { width: 1440, height: 1000 });
await ctx.addInitScript(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('uv-arrange')) localStorage.removeItem(k); localStorage.setItem('uv-cookies', 'essential'); });
const out = [], fail = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => { if (!/Router action dispatched before initialization/.test(e.message)) fail.push(`error: ${e.message.slice(0, 160)}`); });
await page.goto(`${B}/student`, { waitUntil: 'load', timeout: 240000 });
await page.locator('#main .kpi-row').first().waitFor({ state: 'attached', timeout: 120000 }).catch(async () => { await page.screenshot({ path: '/tmp/claude-0/keep-fail.png' }); throw new Error('no number tiles on the student home'); });
await page.waitForTimeout(2500);
const tiles = page.locator('#main .kpi-row > *');
const names = () => tiles.evaluateAll((els) => els.map((el) => [el.textContent?.trim().slice(0, 14), Number(getComputedStyle(el).order) || 0]).sort((a, b) => a[1] - b[1]).map((x) => x[0]));
const pull = async (x, y, dx, dy) => { await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= 12; i++) { await page.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(700); };

// The start edge: pulled out (to the left), the tile is wider.
const tile = tiles.nth(1);
await tile.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(500);
const t0 = await tile.boundingBox();
await pull(t0.x + 3, t0.y + t0.height / 2, -200, 0);
const t1 = await tile.boundingBox();
out.push(`start edge: ${Math.round(t0.width)} → ${Math.round(t1.width)} px`);
if (!(t1.width > t0.width * 1.4)) fail.push(`pulling the start edge out did not widen the tile: ${t0.width} → ${t1.width}`);
await page.keyboard.press('Control+z'); await page.waitForTimeout(600);

// The top edge (Quick notes' card): pulled up, the card is taller.
{
  const notes = await ctx.newPage();
  await notes.goto(`${B}/studio?tool=notes`, { waitUntil: 'load', timeout: 240000 });
  await notes.locator('nav[aria-label="Folders"]').first().waitFor({ timeout: 120000 }); await notes.waitForTimeout(2500);
  const card = notes.locator('#main section.panel').first();
  // Room above it for the hand.
  await card.evaluate((el) => { el.scrollIntoView({ block: 'start', behavior: 'instant' }); }); await notes.mouse.wheel(0, -160); await notes.waitForTimeout(600);
  const c0 = await card.boundingBox(), x = c0.x + c0.width / 2, y = c0.y + 3;
  await notes.mouse.move(x, y); await notes.mouse.down();
  for (let i = 1; i <= 6; i++) { await notes.mouse.move(x, y - i * 8); await notes.waitForTimeout(16); }
  const mid = await card.boundingBox();
  await notes.mouse.up(); await notes.waitForTimeout(800);
  const c1 = await card.boundingBox();
  out.push(`top edge: ${Math.round(c0.height)} → ${Math.round(c1.height)} px (mid-pull its top at ${Math.round(mid.y)}, the hand at ${Math.round(y - 48)})`);
  if (!(c1.height > c0.height + 30)) fail.push(`pulling the top edge up did not make the card taller: ${c0.height} → ${c1.height}`);
  if (Math.abs(mid.y - (y - 48)) > 8) fail.push(`mid-pull the top edge is not where the hand is: ${mid.y} vs ${y - 48}`);
  await notes.keyboard.press('Control+z'); await notes.waitForTimeout(600);
  await notes.close();
}

// Carried out of its row and let go far away: back in its place.
const before = await names();
const a = await tiles.nth(0).boundingBox();
await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
for (let i = 1; i <= 20; i++) { await page.mouse.move(a.x + a.width / 2 + i * 4, a.y + a.height / 2 + i * 22); await page.waitForTimeout(16); }
await page.evaluate(() => { const was = Element.prototype.animate; window.__shook = false; Element.prototype.animate = function (k, o) { if (JSON.stringify(k).includes('translateX(-6px)')) window.__shook = true; return was.call(this, k, o); }; });
await page.mouse.up();
await page.waitForTimeout(900);
const shake = await page.evaluate(() => window.__shook);
const after = await names();
out.push(`dropped outside its row: ${JSON.stringify(before) === JSON.stringify(after) ? 'back in its place' : 'moved'}${shake ? ', with a shake' : ''}`);
if (JSON.stringify(before) !== JSON.stringify(after)) fail.push(`a tile let go outside its row changed the order: ${before} → ${after}`);
if (!shake) fail.push('no shake when the drop was refused');

// Tidy: shown once the page is arranged; Ctrl+Z takes it back.
const t2 = await tiles.nth(1).boundingBox();
await pull(t2.x + t2.width - 3, t2.y + t2.height / 2, 120, 0);
const tidy = page.getByRole('button', { name: 'Tidy this page' }).first();
if (await tidy.count()) {
  await tidy.click(); await page.waitForTimeout(700);
  const flow = await tiles.first().evaluate((el) => getComputedStyle(el.parentElement).gridAutoFlow);
  out.push(`tidy: grid-auto-flow ${flow}`);
  if (!flow.includes('dense')) fail.push(`Tidy did not pack the grid: ${flow}`);
  await page.locator('body').click({ position: { x: 5, y: 500 } });
  await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
  const back = await tiles.first().evaluate((el) => getComputedStyle(el.parentElement).gridAutoFlow);
  if (back.includes('dense')) fail.push('Ctrl+Z did not take Tidy back');
} else fail.push('no Tidy button after arranging');

await page.addScriptTag({ path: AXE });
const bad = await page.evaluate(async () => (await window.axe.run({ exclude: [['[data-sonner-toaster]']] }, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0].target}`));
for (const b of bad) fail.push(`axe ${b}`);
await page.getByRole('button', { name: 'Put this page back' }).first().click().catch(() => {});
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 1));
process.exit(fail.length ? 1 : 0);
