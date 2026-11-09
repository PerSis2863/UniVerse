// M139 (dev server or built Worker): the cards' "···" menu (components/ui/CardMenu.tsx). On the
// student's grades page the transcript's menu offers Full screen, Copy and Download as CSV; the CSV holds
// the table's column names; Copy puts the card's text on the clipboard; Full screen shows the card alone
// and its menu still opens there (Exit full screen). A card without a table has no CSV item. Phones: the
// menu is a sheet. Axe on the pages that carry it at 390 and 1280, light and dark.
//   node scripts/checks/card-menu-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const out = [];
const browser = await launch();
try {
  {
    const ctx = await signedIn(browser, base, 'demo@student.com', { width: 1280, height: 900 });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const page = await ctx.newPage();
    await page.goto(base + '/student/grades', { waitUntil: 'load', timeout: 240_000 });
    const more = page.getByRole('button', { name: 'More for Academic Transcript' });
    await more.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await more.click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    out.push(`transcript menu: ${items.map((s) => s.trim()).join(' · ')}`);
    for (const want of ['Full screen', 'Copy', 'Download as CSV']) if (!items.some((s) => s.includes(want))) fail.push(`transcript menu: no "${want}"`);
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download as CSV' }).click()]);
    const csv = await readFile(await file.path(), 'utf8');
    out.push(`CSV ${file.suggestedFilename()}: ${csv.split('\n')[0].replace(/^﻿/, '')}`);
    if (!/course/i.test(csv.split('\n')[0])) fail.push('CSV: no column names');
    await more.click();
    await page.getByRole('menuitem', { name: 'Copy' }).click();
    await page.waitForTimeout(300);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (!copied.includes('Academic Transcript')) fail.push('Copy: the clipboard has no card text');
    await more.click();
    await page.getByRole('menuitem', { name: 'Full screen' }).click();
    await page.waitForTimeout(600);
    const full = await page.evaluate(() => document.fullscreenElement?.textContent?.includes('Academic Transcript') ?? false);
    if (!full) fail.push('Full screen: the card is not full screen');
    await more.click();
    const exit = page.getByRole('menuitem', { name: 'Exit full screen' });
    if (!(await exit.isVisible().catch(() => false))) fail.push('Full screen: the menu does not open there');
    else { await exit.click(); await page.waitForTimeout(400); }
    if (await page.evaluate(() => !!document.fullscreenElement)) fail.push('Full screen: did not exit');
    await page.getByRole('button', { name: 'More for GPA Trend' }).click();
    const gpa = page.getByRole('menu', { name: 'More for GPA Trend' });
    await gpa.waitFor({ timeout: 3000 });
    if (await gpa.getByRole('menuitem', { name: 'Download as CSV' }).count()) fail.push('GPA Trend: a CSV item without a table');
    await page.keyboard.press('Escape');
    await ctx.close();
  }
  for (const [email, path] of [['demo@student.com', '/student/grades'], ['demo@student.com', '/student'], ['demo@student.com', '/student/attendance'], ['demo@teacher.com', '/teacher'], ['demo@admin.com', '/admin']]) {
    for (const width of [1280, 390]) {
      for (const theme of ['dark', 'light']) {
        const what = `${path} ${width} ${theme}`;
        const ctx = await signedIn(browser, base, email, { width, height: 900 }, width < 600 ? { isMobile: true, hasTouch: true } : {});
        await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* a locked frame */ } }, theme);
            const page = await ctx.newPage();
        await page.goto(base + path, { waitUntil: 'load', timeout: 240_000 });
        await page.getByRole('button', { name: /^More for / }).first().waitFor({ timeout: 60_000 }).catch(() => fail.push(`${what}: no "···" menu`));
        await page.waitForTimeout(1500);
        if (await page.getByText('This page hit a problem').count()) fail.push(`${what}: the page hit a problem`);
        const menus = await page.getByRole('button', { name: /^More for / }).count();
        if (width < 600 && theme === 'dark' && menus) {
          await page.getByRole('button', { name: /^More for / }).first().click();
          if (!(await page.getByRole('dialog').first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false))) fail.push(`${what}: the menu is not a sheet on a phone`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }
        await page.addScriptTag({ path: AXE });
        const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
        for (const b of bad) fail.push(`${what} axe ${b}`);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail.push(`${what}: sideways scrolling`);
        out.push(`${what}: ${menus} menus`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
