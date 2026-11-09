// M143 (dev server or built Worker): a teacher's courses page as the reels' "Agent Center", in sample
// mode. The header's summary line and status pill; the three summary cards; a card per course with its
// status label, three figures and a 14-day column chart; "Open board" goes to the course's board;
// "New course" opens the M142 window. Axe at 1280 and 390, light and dark.
//   node scripts/checks/courses-center-ui.mjs [http://localhost:8787]
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
      const what = `/teacher/courses ${width} ${theme}`;
      const ctx = await signedIn(browser, base, 'demo@teacher.com', { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* a locked frame */ } }, theme);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fail.push(`${what}: ${e.message}`));
      await page.goto(base + '/teacher/courses', { waitUntil: 'load', timeout: 240_000 });
      await page.locator('.course-card').first().waitFor({ timeout: 60_000 }).catch(() => fail.push(`${what}: no course cards`));
      await page.waitForTimeout(2500);
      const cards = await page.locator('.course-card').count();
      const charts = await page.locator('.course-card .mini-col').count();
      if (charts !== cards * 14) fail.push(`${what}: ${charts} columns for ${cards} cards`);
      if (!(await page.getByText(/hand-ins? in 14 days/).count())) fail.push(`${what}: no summary line`);
      if (!(await page.getByText(/active this fortnight/).count())) fail.push(`${what}: no status pill`);
      for (const t of ['Students by course', 'Hand-ins', 'Active courses']) if (!(await page.getByRole('heading', { name: t }).count())) fail.push(`${what}: no "${t}" card`);
      await page.addScriptTag({ path: AXE });
      const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
      for (const b of bad) fail.push(`${what} axe ${b}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
      if (width > 600 && theme === 'light') {
        await page.getByRole('button', { name: /^New course$/ }).first().click();
        if (!(await page.getByRole('radiogroup', { name: 'Start from' }).waitFor({ timeout: 6000 }).then(() => true).catch(() => false))) fail.push(`${what}: New course didn't open`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.locator('.course-card').first().getByRole('button', { name: /Open board/ }).click();
        if (!(await page.waitForURL(/\/teacher\/blackboard\?course=/, { timeout: 30_000 }).then(() => true).catch(() => false))) fail.push(`${what}: Open board didn't go to the board`);
      }
      out.push(`${what}: ${cards} cards`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
