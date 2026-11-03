// M52: the landing's planet section (src/components/landing/WorldSection.tsx) and the M52 colours on the
// landing and sign-in pages: the planet draws, nothing scrolls sideways, and axe finds nothing serious
// on the whole page, at 390 and 1280 px.
//   node scripts/checks/world-ui.mjs [http://localhost:3000]
import { createRequire } from 'node:module';
import { baseUrl, launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const browser = await launch();
try {
  for (const path of ['/', '/login']) {
    for (const width of [390, 1280]) {
      const what = `${path} ${width}`;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('uv-cookies', 'essential'); } catch { /* a locked frame */ } });
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: 'load', timeout: 240_000 });
      if (path === '/') {
        const planet = page.locator('section[aria-labelledby="world-h"] canvas').first();
        if (!(await planet.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false))) { fail.push(`${what}: no planet`); await ctx.close(); continue; }
        await planet.scrollIntoViewIfNeeded();
        await page.waitForTimeout(3000);
        const lit = await planet.evaluate((c) => {
          const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0; for (let i = 3; i < x.length; i += 16) if (x[i] > 40) n++;
          return n;
        });
        if (lit < 500) fail.push(`${what}: the planet didn't draw (${lit})`);
        out.push(`${what}: lit ${lit}`);
      } else {
        await page.waitForTimeout(2500);
        out.push(what);
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const b of bad) fail.push(`${what} axe ${b}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
