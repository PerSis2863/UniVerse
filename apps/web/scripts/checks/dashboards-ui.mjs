// M282 on the built Worker: every UniVersity home and the hub in sample mode, at 1280 light and 390 dark. The greeting
// row is there with the page's own button on the same row as "Edit home" (no stray rows above the cards), figures are
// grouped (1,240, never 1240), no sideways scroll, axe serious/critical clean, no page errors.
//   node scripts/checks/dashboards-ui.mjs [base]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl().replace('3100', '8787');
const PAGES = [['demo@student.com', '/student', null], ['demo@teacher.com', '/teacher', /New course/i], ['demo@admin.com', '/admin', /Send announcement/i], ['demo@student.com', '/hub', null]];
const fail = [], shots = process.env.SHOTS;
const browser = await launch();
try {
  for (const [width, theme] of [[1280, 'light'], [390, 'dark']]) {
    for (const [who, path, action] of PAGES) {
      const what = `${path} ${width} ${theme}`;
      const ctx = await signedIn(browser, base, who, { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* fine */ } }, theme);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fail.push(`${what}: ${e.message.slice(0, 120)}`));
      await page.goto(base + path, { waitUntil: 'load', timeout: 180_000 });
      await page.waitForTimeout(4000);
      if (path !== '/hub') {
        if (!(await page.getByText(/^Good (morning|afternoon|evening)/).first().isVisible().catch(() => false))) fail.push(`${what}: no greeting row`);
        const edit = await page.getByRole('button', { name: /Edit home/ }).boundingBox();
        if (action) {
          const btn = await page.getByRole('button', { name: action }).first().boundingBox();
          if (!btn || !edit) fail.push(`${what}: the page's button or Edit home is missing`);
          else if (Math.abs(btn.y - edit.y) > 6) fail.push(`${what}: the page's button (${Math.round(btn.y)}) isn't on Edit home's row (${Math.round(edit.y)})`);
        }
      }
      const raw = await page.evaluate(() => [...document.querySelectorAll('.kpi-card .tabular-nums')].map((e) => e.textContent?.trim() ?? '').filter((t) => /^\d{4,}$/.test(t)));
      if (raw.length) fail.push(`${what}: ungrouped figures ${raw.join(', ')}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: scrolls sideways`);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const b of bad) fail.push(`${what} axe ${b}`);
      if (shots) await page.screenshot({ path: `${shots}/home${path.replace(/\//g, '-')}-${width}-${theme}.png` });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (fail.length) { console.log(`${fail.length} problem(s):\n${fail.join('\n')}`); process.exit(1); }
console.log('dashboards-ui: all good');
