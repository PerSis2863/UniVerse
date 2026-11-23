// M476 Hyperion's unit tests: the example tests.m, run with the Test button, shows the results panel (5 of 6 pass:
// one fails on purpose, with its reason). Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-tests-ui.mjs
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
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('tab', { name: 'tests.m' }).click({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    const summary = page.locator('[data-test-summary]');
    await summary.waitFor({ timeout: 60_000 });
    r.summary = await summary.innerText();
    r.reason = await page.getByText(/verifyEqual failed/).first().innerText();
    if (shots) await page.screenshot({ path: `${shots}/hyperion-tests-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
