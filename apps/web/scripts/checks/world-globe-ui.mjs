// M131 (dev server or built Worker): the landing's globe you can use. An app's button under the heading
// opens its card (what it does, "Start with …"); the planet turns to face that app, so after closing
// the card a click in the planet's middle picks it again (a click on the globe, through the background
// thread); the card closes. The page's frames while the globe turns. Axe with the card open at 390 and
// 1280, light and dark.
//   node scripts/checks/world-globe-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const browser = await launch();
try {
  for (const width of [1280, 390]) {
    for (const scheme of ['dark', 'light']) {
      const what = `${width} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('uv-cookies', 'essential'); } catch { /* a locked frame */ } });
      const page = await ctx.newPage();
      await page.goto(base + '/', { waitUntil: 'load', timeout: 240_000 });
      const group = page.getByRole('group', { name: 'The apps on the planet' });
      await group.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await group.getByRole('button', { name: 'Trace' }).click();
      const card = page.getByRole('region', { name: 'UniVerse Trace' });
      if (!(await card.waitFor({ timeout: 5000 }).then(() => true).catch(() => false))) { fail.push(`${what}: no card for Trace`); await ctx.close(); continue; }
      if (!(await card.getByRole('link', { name: /Start with Trace/ }).count())) fail.push(`${what}: no "Start with Trace"`);
      if (width === 1280 && scheme === 'dark') {
        // The page's frames while the planet turns to the next app.
        await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 90) requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await group.getByRole('button', { name: 'Play' }).click();
        await page.waitForTimeout(1600);
        out.push(`${what}: worst frame while turning ${Math.round(Math.max(...(await page.evaluate(() => window.__gaps.slice(2)))))} ms`);
        await group.getByRole('button', { name: 'Trace' }).click();
        await page.waitForTimeout(1500);
      }
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const b of bad) fail.push(`${what} axe ${b}`);
      // Close, then pick Trace on the planet itself: it's in the middle now.
      await card.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(400);
      if (await card.count()) fail.push(`${what}: the card didn't close`);
      const planet = page.getByRole('img', { name: /The five UniVerse apps on one planet/ });
      const box = await planet.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      if (!(await card.waitFor({ timeout: 3000 }).then(() => true).catch(() => false))) fail.push(`${what}: a click on the planet didn't pick Trace`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
      out.push(what);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
