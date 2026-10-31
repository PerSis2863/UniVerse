// M48–M50: the live cards (src/components/live): the student's, teacher's and admin's constellations,
// the hub's, Relief's funnel and radar, and Trace's fleet city, radar and wallet (in sample mode). Each draws (its canvas has lit pixels), the page doesn't scroll
// sideways, and axe finds nothing serious, at 390 and 1280 px, light and dark.
//   node scripts/checks/live-ui.mjs [http://localhost:3000]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const PAGES = [
  ['demo@student.com', '/student', '.live-card'],
  ['demo@teacher.com', '/teacher', '.live-card'],
  ['demo@admin.com', '/admin', '.live-card'],
  ['demo@student.com', '/hub', '.trace-hero'],
  ['demo@student.com', '/relief', '.live-card'],
  // M50, in "Explore with sample data" (the demo account has no brand): the fleet city, the radar,
  // the wallet's constellation.
  ['demo@student.com', '/trace/tracking', '.live-card', true],
  ['demo@student.com', '/trace/radar', '.live-card', true],
  ['demo@student.com', '/trace/wallet', '.live-card', true],
];

const browser = await launch();
try {
  for (const [who, path, sel, sample] of PAGES) {
    for (const scheme of ['light', 'dark']) {
      for (const width of [390, 1280]) {
        const what = `${path} ${scheme} ${width}`;
        const ctx = await signedIn(browser, base, who, { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true, colorScheme: scheme } : { colorScheme: scheme });
        await ctx.addInitScript(([s, demo]) => { try { localStorage.setItem('theme', s); if (demo) sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* a locked frame */ } }, [scheme, !!sample]);
        const page = await ctx.newPage();
        await page.goto(base + path, { waitUntil: 'load', timeout: 240_000 });
        await page.evaluate(() => { const id = JSON.parse(localStorage.getItem('universe-auth') || '{}')?.state?.user?.id; if (id) localStorage.setItem(`universe-tour-done:${id}`, '1'); });
        const card = page.locator(sel).first();
        if (!(await card.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false))) { fail.push(`${what}: no live card`); await ctx.close(); continue; }
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(2500);
        const lit = await card.locator('canvas').first().evaluate((c) => {
          const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0; for (let i = 3; i < x.length; i += 16) if (x[i] > 40) n++;
          return n;
        }).catch(() => 0);
        if (lit < 50) fail.push(`${what}: the picture didn't draw (${lit})`);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
        await page.addScriptTag({ path: AXE });
        const bad = await page.evaluate(async (s) => (await window.axe.run(document.querySelector(s), { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), sel);
        for (const b of bad) fail.push(`${what} axe ${b}`);
        out.push(`${what}: lit ${lit}`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
