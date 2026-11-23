// M492–M505 Hyperion's science and industry toolboxes in the real window: each worked example runs in the engine's
// thread from its tab (Run), prints what it should, shows a figure and no error; the maths-teaching steps are set as
// maths. Axe at 1280 (dark) and 1024 (light), no sideways scroll, no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-sciences-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const EXPECT = { 'epidemic.m': 'R0 by age groups', 'dosing.m': 'Steady state', 'dna.m': 'open reading frame', 'reactors.m': 'Robertson at t = 40', 'neurons.m': 'Poisson train', 'physics.m': 'A 1 m pendulum', 'quake.m': 'Found at', 'ecg.m': 'HRV: SDNN', 'ctscan.m': 'Lesion:', 'options.m': 'Black-Scholes', 'portfolio.m': 'Best Sharpe', 'teach.m': 'Gauss–Jordan', 'materials.m': 'Built-in potential', 'farm_energy.m': 'Dispatch:' };
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [theme, width] of [['dark', 1280], ['light', 1024]]) {
    const r = (out[`${theme} ${width}`] = { ran: {} });
    const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-lab-scripts'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const names = theme === 'dark' ? Object.keys(EXPECT) : ['teach.m', 'ctscan.m'];
    for (const name of names) {
      await page.getByRole('tab', { name }).click({ timeout: 120_000 });
      const log = page.getByRole('log', { name: 'Output' }), before = (await log.innerText()).length;
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      const ok = await page.waitForFunction(([want, from]) => { const t = document.querySelector('[aria-label="Output"]')?.textContent ?? ''; return t.slice(from).includes(want) || /\n?Error|isn’t a variable/.test(t.slice(from)); }, [EXPECT[name], before], { timeout: 120_000 }).then(() => true, () => false);
      const text = (await log.innerText()).slice(before);
      r.ran[name] = ok && text.includes(EXPECT[name]) && !/isn’t a variable|Error:/.test(text) ? 'ok' : `FAILED: ${text.slice(-300)}`;
      if (name === 'teach.m') r.mathsSet = (await page.locator('[aria-label="Output"] .katex').count()) > 5;
      if (shots && (name === 'teach.m' || name === 'ecg.m' || name === 'ctscan.m')) await page.screenshot({ path: `${shots}/sciences-${name.replace('.m', '')}-${theme}-${width}.png` });
    }
    r.figure = (await page.getByRole('region', { name: 'Figure' }).or(page.locator('section[aria-label="Figure"]')).locator('svg, img').count()) > 0;
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
