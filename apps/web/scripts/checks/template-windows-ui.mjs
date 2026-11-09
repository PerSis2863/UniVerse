// M142 (dev server or built Worker): the "New …" windows with "Start from" cards (the reels' New agent).
// A teacher's New course: six kinds; choosing Lab course sets 4 credits, ticks its four activities and
// writes the description; unticking one says "3 of 4" and rewrites it; the arrow keys move the choice.
// The calendar's New event starts from cards too. Axe with each window open at 1280 and 390, light and
// dark.
//   node scripts/checks/template-windows-ui.mjs [http://localhost:8787]
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
const browser = await launch();
try {
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      const ctx = await signedIn(browser, base, 'demo@teacher.com', { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* a locked frame */ } }, theme);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fail.push(`${width} ${theme}: ${e.message}`));
      // New course
      let what = `New course ${width} ${theme}`;
      await page.goto(base + '/teacher', { waitUntil: 'load', timeout: 240_000 });
      await page.waitForTimeout(4000);
      await page.getByRole('button', { name: /new course/i }).first().click();
      const group = page.getByRole('radiogroup', { name: 'Start from' });
      if (!(await group.waitFor({ timeout: 8000 }).then(() => true).catch(() => false))) { fail.push(`${what}: no cards`); await ctx.close(); continue; }
      const cards = await group.getByRole('radio').count();
      if (cards !== 6) fail.push(`${what}: ${cards} kinds, not 6`);
      if (width > 600 && theme === 'light') {
        await group.getByRole('radio', { name: /Lab course/ }).click();
        if ((await page.getByLabel('Credits').inputValue()) !== '4') fail.push(`${what}: Lab course didn't set 4 credits`);
        const desc = await page.getByLabel('Description').inputValue();
        if (!/lab session/i.test(desc)) fail.push(`${what}: no description written ("${desc}")`);
        await page.getByRole('checkbox', { name: 'A safety briefing' }).uncheck();
        if (!(await page.getByText('3 of 4 chosen').count())) fail.push(`${what}: the count didn't follow`);
        if (/safety/i.test(await page.getByLabel('Description').inputValue())) fail.push(`${what}: the description kept an unticked activity`);
        await page.keyboard.press('Shift+Tab');
        await group.getByRole('radio', { name: /Lab course/ }).focus();
        await page.keyboard.press('ArrowRight');
        if ((await group.getByRole('radio', { checked: true }).getAttribute('data-value')) !== 'seminar') fail.push(`${what}: the arrow key didn't move the choice`);
        out.push(`${what}: ${desc}`);
      }
      await page.waitForTimeout(700);
      await axe(page, what);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      // New event
      what = `New event ${width} ${theme}`;
      await page.goto(base + '/teacher/calendar', { waitUntil: 'load', timeout: 240_000 });
      await page.waitForTimeout(4000);
      // In the test browser's phone emulation a tap can hit an older frame's layout (the toolbar before it
      // wrapped); the page itself runs at 60 a second, so the button is pressed directly there.
      const add = page.getByRole('button', { name: /^New event$/ }).first();
      if (width < 600) await add.dispatchEvent('click'); else await add.click();
      const kinds = page.getByRole('radiogroup', { name: 'Kind of event' });
      if (!(await kinds.waitFor({ timeout: 8000 }).then(() => true).catch(() => false))) fail.push(`${what}: no cards`);
      else {
        out.push(`${what}: ${await kinds.getByRole('radio').count()} kinds`);
        await kinds.getByRole('radio', { name: /Deadline/ }).click();
        if ((await kinds.getByRole('radio', { checked: true }).getAttribute('data-value')) !== 'DEADLINE') fail.push(`${what}: Deadline not chosen`);
        await page.waitForTimeout(700);
        await axe(page, what);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
