// M545 Simulate → Structures → Buckling: the beam pushed end-on buckles at a load factor near Euler's, pulled it can't.
// Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-buckling-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
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
    // The start: a 500 N force down on the beam's end. Turn it to push along the beam (Left).
    await outline.getByRole('button', { name: /^Force/ }).click();
    await page.getByRole('button', { name: 'Left', exact: true }).click();
    await outline.getByRole('button', { name: /^Buckling/ }).click();
    await page.waitForTimeout(2500);
    r.push = await page.getByText(/^It would buckle|^It buckles|^It can’t buckle/).first().innerText().catch(() => '');
    r.shapes = await page.getByRole('button', { name: /^Show buckling shape/ }).count();
    if (shots) await page.screenshot({ path: `${shots}/buckling-${theme}.png` });
    await outline.getByRole('button', { name: /^Force/ }).click();
    await page.getByRole('button', { name: 'Right', exact: true }).click();
    await outline.getByRole('button', { name: /^Buckling/ }).click();
    await page.waitForTimeout(2500);
    r.pull = await page.getByText(/^It would buckle|^It buckles|^It can’t buckle/).first().innerText().catch(() => '');
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
