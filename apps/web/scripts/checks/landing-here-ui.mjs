// M81 in the browser (`pnpm local:serve` or the dev server): the landing's "Here to" row. Five
// choices; Learn and Teach open sign-up with the role already picked (Continue as a student / as a
// teacher), Protect my brand opens Trace's sign-up, Help people Relief's, Look around the sample
// product passport (no sign-in). Axe (whole page) and no sideways scrolling at 390 and 1280.
//   node scripts/checks/landing-here-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };
async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${what}: sideways scrolling`);
}

const browser = await launch();
try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    const here = page.getByRole('navigation', { name: 'What are you here for?' });
    const home = async () => { await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120_000 }); await here.waitFor({ timeout: 60_000 }); await page.waitForTimeout(1200); };
    await home();
    check(await here.getByRole('link').count() === 5, `${width}: five choices`);
    await axe(page, `${width} landing`);
    for (const [label, url, then] of [
      ['Learn', /\/register\?app=campus&as=student/, /Continue as a student/],
      ['Teach', /\/register\?app=campus&as=teacher/, /Continue as Staff/],
      ['Protect my brand', /\/register\?app=trace/, null],
      ['Help people', /\/register\?app=relief/, null],
      ['Look around', /\/t\/demo/, null],
    ]) {
      if (label !== 'Learn') await home();
      await here.getByRole('link', { name: label }).click();
      const went = await page.waitForURL(url, { timeout: 60_000 }).then(() => true, () => false);
      check(went, `${width}: ${label} went to ${page.url()}`);
      if (went && then) {
        const ready = await page.getByRole('button', { name: then }).waitFor({ timeout: 30_000 }).then(() => true, () => false);
        check(ready, `${width}: ${label}: the role is already picked`);
        if (ready && width === 390 && label === 'Teach') await axe(page, `${width} sign-up, teacher picked`);
      }
    }
    check(!errors.length, `${width}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ Here to: five choices, roles picked on sign-up, Trace, Relief, the sample passport; axe at 390 and 1280');
process.exit(fail.length ? 1 : 0);
