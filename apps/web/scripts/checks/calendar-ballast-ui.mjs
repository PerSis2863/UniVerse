// M140 (dev server or built Worker): the reels' calendar pieces. (1) The calendars open on the Timeline
// (computers; the student's and the teacher's, in sample mode so there are classes): days down the side,
// classes as cards, "Now" on the hours; a card opens its class; the admin's timetable has it too, with
// real clashes in amber. Phones keep their 4-day view. (2) The date range picker (the audit log's
// filter): a quick choice, then Apply, names the button; two days picked by click and by arrow keys;
// Cancel changes nothing. Axe with the picker open, and on the calendars, at 1280 and 390, light and dark.
//   node scripts/checks/calendar-ballast-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const axe = async (page, what) => {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
};
const open = async (email, path, width, theme, sample = true) => {
  const ctx = await signedIn(browser, base, email, { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript(([t, s]) => { try { localStorage.setItem('theme', t); if (s) sessionStorage.setItem('universe:sample-mode', '1'); } catch { /* a locked frame */ } }, [theme, sample]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`${path} ${width} ${theme}: ${e.message}`));
  await page.goto(base + path, { waitUntil: 'load', timeout: 240_000 });
  await page.waitForTimeout(5000);
  if (await page.getByText('This page hit a problem').count()) fail.push(`${path} ${width} ${theme}: the page hit a problem`);
  return { ctx, page };
};
const browser = await launch();
try {
  for (const [email, path] of [['demo@student.com', '/student/calendar'], ['demo@teacher.com', '/teacher/calendar'], ['demo@admin.com', '/admin/timetable']]) {
    for (const width of [1280, 390]) {
      for (const theme of ['light', 'dark']) {
        const what = `${path} ${width} ${theme}`;
        const { ctx, page } = await open(email, path, width, theme);
        const cards = await page.locator('.tl-block').count();
        if (width > 600 && cards < 1) fail.push(`${what}: no classes on the timeline`);
        if (width < 600 && path !== '/admin/timetable' && cards > 0) fail.push(`${what}: the timeline on a phone`);
        await axe(page, what);
        if (width > 600 && theme === 'light') {
          if (!(await page.getByText(/^Now \d\d:\d\d$/).count())) out.push(`${what}: "Now" not on the hours (outside them now)`);
          if (path === '/admin/timetable') {
            const amber = await page.locator('.tl-block[class*="border-amber"]').count();
            out.push(`${what}: ${amber} clashing classes in amber`);
            if (!amber) fail.push(`${what}: the clashes aren't marked`);
          } else {
            await page.locator('.tl-block').first().click();
            // A student gets the class's panel (time, place, length); a teacher goes to the course's board.
            const opened = path.startsWith('/teacher')
              ? await page.waitForURL(/\/teacher\/blackboard/, { timeout: 30_000 }).then(() => true).catch(() => false)
              : await page.getByText('Duration', { exact: true }).first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
            if (!opened) fail.push(`${what}: a class didn't open`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          }
        }
        out.push(`${what}: ${cards} cards`);
        await ctx.close();
      }
    }
  }
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      const what = `/admin/audit picker ${width} ${theme}`;
      const { ctx, page } = await open('demo@admin.com', '/admin/audit', width, theme, false);
      const button = page.getByRole('button', { name: /^Dates: / });
      await button.click();
      const apply = page.getByRole('button', { name: 'Apply' });
      if (!(await apply.waitFor({ timeout: 4000 }).then(() => true).catch(() => false))) { fail.push(`${what}: the picker didn't open`); await ctx.close(); continue; }
      if (width > 600 && theme === 'light') {
        await page.getByRole('button', { name: 'Last 30 days' }).click();
        if (!(await page.getByText(/30 days$/).count())) fail.push(`${what}: Last 30 days isn't written out`);
        await apply.click();
        await page.waitForTimeout(400);
        const name = await button.getAttribute('aria-label');
        if (name !== 'Dates: Last 30 days') fail.push(`${what}: the button says "${name}"`);
        // Two days by hand: today, then three days back with the arrow keys and Enter.
        await button.click();
        await page.waitForTimeout(400);
        const today = page.locator('[data-in][aria-current="date"]').first();
        await today.click();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(150);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        const said = await page.locator('[data-popover] p[aria-live="polite"]').innerText();
        out.push(`${what}: picked "${said}"`);
        if (!/4 days/.test(said)) fail.push(`${what}: the arrow keys didn't pick a span ("${said}")`);
        await page.getByRole('button', { name: 'Cancel' }).click();
        await page.waitForTimeout(300);
        if ((await button.getAttribute('aria-label')) !== 'Dates: Last 30 days') fail.push(`${what}: Cancel changed the dates`);
        await button.click();
        await page.waitForTimeout(400);
      }
      await axe(page, what);
      out.push(what);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
