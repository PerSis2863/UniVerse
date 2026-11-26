// M562– Simulate → Blocks → tools: the PID tuner on the cruise model (tables filled, Update block writes the gains).
// Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-control-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const only = process.env.ONLY;
const browser = await launch();
const out = {}, errors = [];
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-sim-blocks'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('group', { name: 'Kind of simulation' }).getByRole('button', { name: 'Blocks' }).click({ timeout: 120_000 });
    const tools = page.getByRole('group', { name: 'Tools' });
    for (const tool of ['Tune', 'Logic', 'Real time', 'Code', 'Verify']) {
      if (only && only !== tool) continue;
      const b = tools.getByRole('button', { name: tool });
      if (!(await b.count())) continue;
      if (tool === 'Logic') await page.getByLabel('Start from').selectOption('tank');
      await b.click();
      await page.waitForTimeout(2500);
      r[`${tool}-text`] = (await page.getByRole('region', { name: /tuner|logic|real time|code|verif/i }).innerText()).slice(0, 600);
      if (tool === 'Logic') {
        await page.getByRole('button', { name: 'Play' }).click();
        await page.waitForTimeout(3000);
        r.logicTime = await page.locator('[data-chart-time]').innerText();
      }
      if (tool === 'Tune') {
        await page.getByRole('button', { name: 'Update block' }).isEnabled({ timeout: 20_000 }).catch(() => {});
        r.tuned = await page.getByRole('table').first().innerText();
        r.perf = await page.getByRole('table').nth(1).innerText();
        await page.getByRole('button', { name: 'Update block' }).click({ timeout: 5000 }).catch(() => { r.updateDisabled = true; });
        await page.waitForTimeout(800);
      }
      if (shots) await page.screenshot({ path: `${shots}/control-${tool.replace(' ', '')}-${theme}.png` });
      await page.addScriptTag({ path: AXE });
      r[`${tool}-axe`] = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    }
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
