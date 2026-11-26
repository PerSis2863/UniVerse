// M554 Hyperion's apps: a script typed in the command window makes a window (uifigure) with a label, a slider, a button,
// a drop-down and axes; pressing the button and choosing in the drop-down run their callbacks, which change the label
// and draw in the axes. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-apps-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const APP = "fig = uifigure('Name', 'Wave maker'); lbl = uilabel(fig, 'Text', 'Pick a wave', 'Position', [20 440 300 22]); ax = uiaxes(fig, 'Position', [20 140 600 280]); dd = uidropdown(fig, 'Items', {'sin', 'cos'}, 'Position', [20 100 120 22], 'ValueChangedFcn', @(s, e) set(lbl, 'Text', ['Wave: ' e.Value])); b = uibutton(fig, 'Text', 'Draw', 'Position', [160 100 100 22], 'ButtonPushedFcn', @(s, e) plot(ax, 0:0.1:6, sin(0:0.1:6)));";
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
    const cmd = page.getByPlaceholder('Type a command, then Enter');
    await cmd.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1500);
    await cmd.fill(APP); await cmd.press('Enter');
    const win = page.getByRole('region', { name: 'Wave maker' });
    await win.waitFor({ timeout: 30_000 }).catch(async () => { console.log('LOG:', (await page.getByRole('log', { name: 'Output' }).innerText()).slice(-800)); throw new Error('no window'); });
    r.window = true;
    await win.getByRole('combobox').selectOption('cos');
    await page.waitForTimeout(800);
    r.label = await win.getByText(/^Wave: /).innerText().catch(() => '');
    await win.getByRole('button', { name: 'Draw' }).click();
    await page.waitForTimeout(1200);
    r.plotted = await win.getByRole('img', { name: 'App axes' }).locator('path, polyline').count();
    if (shots) await page.screenshot({ path: `${shots}/apps-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
