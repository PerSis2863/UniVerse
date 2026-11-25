// M479 Simulate → Queues: the bench runs on open (statistics shown), Play moves through the run, changing a station
// reruns it. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-queues-ui.mjs
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
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('group', { name: 'Kind of simulation' }).getByRole('button', { name: 'Queues' }).click({ timeout: 120_000 });
    const sys = page.locator('[data-stat="system"]');
    await sys.waitFor({ timeout: 30_000 });
    r.system = await sys.innerText();
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Pause' }).click();
    r.time = await page.locator('[data-sim-time]').innerText();
    await page.getByLabel('Servers').first().fill('4');
    await page.waitForTimeout(500);
    r.afterMoreServers = await sys.innerText();
    if (shots) await page.screenshot({ path: `${shots}/queues-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
