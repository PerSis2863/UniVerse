// M141 (dev server or built Worker): the activity log in the reels' "Agent Activity" style, in sample
// mode. The heatmap has 7 × 24 squares and names the busiest times for screen readers; the totals and
// the tabs agree; a tab shows only its area; every row has an outcome label; a row's details open. Axe
// at 1280 and 390, light and dark, without sideways scrolling.
//   node scripts/checks/activity-log-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const browser = await launch();
try {
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      const what = `/admin/audit ${width} ${theme}`;
      const ctx = await signedIn(browser, base, 'demo@admin.com', { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* a locked frame */ } }, theme);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fail.push(`${what}: ${e.message}`));
      await page.goto(base + '/admin/audit', { waitUntil: 'load', timeout: 240_000 });
      await page.locator('.heat-cell').first().waitFor({ timeout: 60_000 }).catch(() => fail.push(`${what}: no heatmap`));
      await page.waitForTimeout(2500);
      const cells = await page.locator('.heat-cell').count();
      if (cells !== 168) fail.push(`${what}: ${cells} heatmap squares, not 168`);
      if (!(await page.getByText(/^Busiest: /).count())) fail.push(`${what}: no words for screen readers`);
      const rows = await page.locator('.log-row').count();
      const badges = await page.locator('.log-row [class*="ring-inset"]').count();
      if (!rows || badges !== rows) fail.push(`${what}: ${rows} rows but ${badges} outcome labels`);
      if (width > 600 && theme === 'light') {
        const tab = page.getByRole('group', { name: 'Type of activity' }).getByRole('button', { name: /^Grades/ });
        const said = Number((await tab.innerText()).replace(/\D/g, ''));
        await tab.click();
        await page.waitForTimeout(1200);
        const areas = await page.locator('.log-row').evaluateAll((els) => els.map((el) => el.querySelector('span.hidden.lg\\:flex')?.textContent?.trim()));
        if (!areas.length || areas.some((a) => a !== 'Grades')) fail.push(`${what}: the Grades tab shows ${[...new Set(areas)].join(', ')}`);
        if (areas.length !== said) fail.push(`${what}: the Grades tab says ${said}, the log shows ${areas.length}`);
        await page.locator('.log-row').first().getByRole('button', { name: /^Details/ }).click();
        if (!(await page.getByText('Who they are today').first().isVisible().catch(() => false))) fail.push(`${what}: a row's details didn't open`);
        out.push(`${what}: Grades tab ${said}`);
      }
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const b of bad) fail.push(`${what} axe ${b}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
      out.push(`${what}: ${cells} squares, ${rows} rows`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
