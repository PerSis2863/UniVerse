// M567 Simulate → Circuits: a SPICE netlist opens on the board (its parts laid out, ground and probes placed, the
// notes on what was left out), runs, and a part set to break open shows its ✕. Dark and light; axe; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-spice-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const NET = `RC filter
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 1k
C1 out 0 1u
Q1 a b c qmod
.tran 10u 20m
.end`;
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
    await page.getByRole('group', { name: 'Kind of simulation' }).getByRole('button', { name: 'Circuits' }).click({ timeout: 120_000 });
    await page.locator('input[type=file][accept*=".cir"]').setInputFiles({ name: 'rc.cir', mimeType: 'text/plain', buffer: Buffer.from(NET) });
    await page.getByRole('status').filter({ hasText: 'Opened rc.cir' }).waitFor({ timeout: 20_000 });
    r.notes = await page.getByRole('status').filter({ hasText: 'Opened rc.cir' }).innerText();
    r.board = await page.getByRole('group', { name: /^Circuit board/ }).getAttribute('aria-label');
    const res = page.getByRole('group', { name: /^Circuit board/ }).getByRole('button', { name: /^Resistor/ }).first();
    await res.focus(); await page.keyboard.press('Enter');
    await page.getByLabel('When it fails').selectOption('open');
    r.fault = await page.getByRole('button', { name: /set to break open/ }).count();
    await page.getByRole('button', { name: 'Run' }).click().catch(() => {});
    await page.waitForTimeout(1500);
    if (shots) await page.screenshot({ path: `${shots}/spice-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
