// M472– Hyperion Signals: each window opens; the Filter designer redraws when an edge is dragged (the order readout
// changes). Axe at 1280 (dark and light), no sideways scroll, no page errors. (Hyperion is for computers.)
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-signals-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const TABS = (process.env.TABS ?? 'Filter designer').split(',');
const browser = await launch();
const out = {}, errors = [];
const axe = async (page) => { await page.addScriptTag({ path: AXE }); return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`)); };
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)} ${(e.stack ?? '').slice(0, 300)}`));
    await page.goto(`${base}/hyperion/signals`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    for (const tab of TABS) {
      await page.getByRole('group', { name: 'Signals' }).getByRole('button', { name: tab }).click({ timeout: 120_000 });
      await page.waitForTimeout(800);
      if (tab === 'Filter designer') {
        const svg = page.getByRole('img', { name: /Magnitude response/ });
        await svg.waitFor({ timeout: 60_000 });
        const before = await svg.getAttribute('aria-label');
        const box = await svg.boundingBox();
        // The stopband edge starts at 0.3 of the width: drag it out to 0.5.
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(300);
        r.dragged = before !== (await svg.getAttribute('aria-label'));
      }
      if (shots) await page.screenshot({ path: `${shots}/signals-${tab.replace(/\W+/g, '-')}-${theme}.png` });
      r[tab] = await axe(page);
    }
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
