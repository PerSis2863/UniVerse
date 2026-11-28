// M568 Simulate → Blocks → Chart (state charts, their C) and Circuits opening a netlist with a maker's library file.
// Dark and light; axe; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-chart-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const NET = 'uses a library\n.include vendor.lib\nV1 in 0 12\nX1 in a DIV\nR3 a 0 1k\n.end';
const LIB = '.subckt DIV top mid PARAMS: R=1k\nR1 top mid {R}\nR2 mid 0 {R*3}\n.ends';
const browser = await launch();
const out = {}, errors = [];
const axe = async (page) => { await page.addScriptTag({ path: AXE }); return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`)); };
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const kinds = page.getByRole('group', { name: 'Kind of simulation' });
    await kinds.getByRole('button', { name: 'Blocks' }).click({ timeout: 120_000 });
    await page.getByLabel('Start from').selectOption('thermostat');
    await page.getByRole('group', { name: /^Block diagram/ }).getByRole('button', { name: /^Chart/ }).first().click();
    const area = page.getByLabel('States and transitions');
    r.chart = await page.getByText(/3 states, 3 transitions; starts in Off/).count();
    await page.getByText('C code for a microcontroller').click();
    r.c = (await page.locator('pre').first().innerText()).includes('chart_step');
    await page.getByText(/ran [\d,]+ steps/).waitFor({ timeout: 30_000 });
    r.scope = await page.getByRole('img', { name: /Scope/ }).first().getAttribute('aria-label');
    if (shots) await page.screenshot({ path: `${shots}/chart-${theme}.png` });
    r.axe = await axe(page);
    await area.fill('state A\nA -> B when u1 > 0');
    r.error = await page.getByRole('alert').filter({ hasText: /no state called B/ }).count();
    await kinds.getByRole('button', { name: 'Circuits' }).click();
    await page.locator('input[type=file][accept*=".cir"]').setInputFiles([{ name: 'net.cir', mimeType: 'text/plain', buffer: Buffer.from(NET) }, { name: 'vendor.lib', mimeType: 'text/plain', buffer: Buffer.from(LIB) }]);
    r.notes = await page.getByRole('status').filter({ hasText: 'Opened net.cir' }).innerText({ timeout: 20_000 });
    if (shots) await page.screenshot({ path: `${shots}/spice-lib-${theme}.png` });
    r.axe2 = await axe(page);
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
