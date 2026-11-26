// M548 Simulate → Fields: the electromagnet solves on open (field, energy), choosing the bar shows its force, the
// capacitor gives a capacitance. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-fields-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
const facts = (page) => page.locator('[data-fields-facts]').innerText().then((t) => t.replace(/\n/g, ' ')).catch(() => '');
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-sim-fields'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('group', { name: 'Kind of simulation' }).getByRole('button', { name: 'Fields' }).click({ timeout: 120_000 });
    await page.locator('[data-fields-facts]').waitFor({ timeout: 60_000 });
    r.magnet = await facts(page);
    await page.getByRole('button', { name: /^Iron: 2000/ }).last().click();
    r.force = await page.getByText(/^Force on it/).innerText().catch(() => '');
    if (shots) await page.screenshot({ path: `${shots}/fields-${theme}.png` });
    await page.getByLabel('Start from').selectOption('capacitor');
    await page.waitForTimeout(1500);
    r.capacitor = await facts(page);
    if (shots) await page.screenshot({ path: `${shots}/fields-cap-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
