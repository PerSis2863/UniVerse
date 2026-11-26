// M506 and M508 in the real window. Learn → Sciences: every toolbox's window shows a figure and result cards, a slider
// changes them, and "Open in Code" opens the script; animate.m in Code sends frames while it runs (the figure changes
// before Run comes back). Axe at 1280 (dark) and 1024 (light), no sideways scroll, no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-windows-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const TOOLBOXES = ['Epidemics', 'Drug dosing', 'DNA and proteins', 'Chemistry and reactors', 'Neurons', 'Physics', 'Geoscience', 'ECG and biosignals', 'Medical imaging', 'Option and bond pricing', 'Portfolios and risk', 'Maths for class', 'Semiconductors and materials', 'Farms and power'];
const browser = await launch();
const out = {}, errors = [];
const settle = (page) => page.waitForFunction(() => document.querySelector('section[aria-busy]')?.getAttribute('aria-busy') === 'false', null, { timeout: 60_000 }).then(() => true, () => false);
try {
  for (const [theme, width] of [['dark', 1280], ['light', 1024]]) {
    const r = (out[`${theme} ${width}`] = { windows: {} });
    const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); sessionStorage.setItem('uv-learn-tab', 'sciences'); localStorage.removeItem('uv-lab-scripts'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/learn`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const names = theme === 'dark' ? TOOLBOXES : ['Epidemics', 'Medical imaging'];
    for (const name of names) {
      await page.getByRole('navigation', { name: 'Toolboxes' }).getByRole('button', { name }).click({ timeout: 120_000 });
      await page.waitForTimeout(400);
      const done = await settle(page);
      const sec = page.locator('section[aria-busy]');
      const figs = await sec.locator('[role="img"] svg').count(), cards = await sec.locator('dl > div').count(), err = await sec.getByRole('alert').count();
      r.windows[name] = done && figs > 0 && cards > 0 && !err ? 'ok' : `FAILED figs ${figs} cards ${cards} errors ${err}`;
      if (shots && ['Epidemics', 'Medical imaging', 'Physics'].includes(name)) await page.screenshot({ path: `${shots}/windows-${name.split(' ')[0]}-${theme}-${width}.png` });
    }
    // A slider moves the result.
    await page.getByRole('navigation', { name: 'Toolboxes' }).getByRole('button', { name: 'Epidemics' }).click();
    await settle(page);
    const first = await page.locator('dl > div').nth(1).innerText();
    const slider = page.locator('#sci-epidemic-r0');
    await slider.focus(); for (let k = 0; k < 10; k++) await slider.press('ArrowRight');
    await page.waitForTimeout(500); await settle(page);
    r.sliderChanges = (await page.locator('dl > div').nth(1).innerText()) !== first;
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (theme === 'dark') {
      // Open in Code carries the script over; then animate.m plays while it runs.
      await page.getByText('The script').click();
      await page.getByRole('button', { name: 'Open in Code' }).click();
      await page.waitForURL(/\/hyperion#/, { timeout: 60_000 }).catch(() => {});
      await page.getByRole('button', { name: 'Open it' }).click({ timeout: 60_000 }).catch(() => {});
      r.openInCode = await page.getByRole('tab', { name: /epidemic/ }).first().waitFor({ timeout: 60_000 }).then(() => true, () => false);
      await page.getByRole('tab', { name: 'animate.m' }).click({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      const seen = new Set();
      for (let k = 0; k < 20; k++) { await page.waitForTimeout(150); const t = await page.locator('section[aria-label="Figure"], [aria-label^="Figure"]').first().innerHTML().catch(() => ''); const m = t.match(/t = [\d.]+ s/); if (m) seen.add(m[0]); }
      r.animationFrames = seen.size;
      if (shots) await page.screenshot({ path: `${shots}/animate-dark-1280.png` });
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
