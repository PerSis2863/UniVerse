// M546 Simulate → Structures → Fatigue: the start beam's life and fatigue safety factor; "On and off" and a bigger load
// change them; the life picture shows. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-fatigue-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
const said = (page) => page.getByText(/cracks after|lasts more than a billion/).first().innerText().catch(() => '');
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-sim-structure'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const outline = page.getByRole('navigation', { name: 'Study outline' });
    await outline.waitFor({ timeout: 120_000 });
    await outline.getByRole('button', { name: /^Fatigue/ }).click();
    await page.waitForTimeout(1500);
    r.reversed = await said(page);
    await page.getByRole('group', { name: 'The loads repeat' }).getByRole('button', { name: 'On and off' }).click();
    await page.waitForTimeout(1200);
    r.pulsating = await said(page);
    await page.getByRole('button', { name: 'Show the life' }).click();
    await page.waitForTimeout(800);
    r.picture = await page.getByLabel(/Fatigue life/).first().getAttribute('aria-label').catch(() => '');
    if (shots) await page.screenshot({ path: `${shots}/fatigue-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
