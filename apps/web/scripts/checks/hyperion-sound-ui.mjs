// M551 Simulate → Sound: the room's wave runs (time moves, a level at the listener), Loudness shows, the resonance study
// finds modes. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-sound-ui.mjs
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
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); localStorage.removeItem('uv-sim-sound'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('group', { name: 'Kind of simulation' }).getByRole('button', { name: 'Sound' }).click({ timeout: 120_000 });
    await page.waitForTimeout(3000);
    r.facts = (await page.locator('[data-sound-facts]').innerText()).replace(/\n/g, ' ');
    await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Loudness (dB)' }).click();
    await page.waitForTimeout(800);
    if (shots) await page.screenshot({ path: `${shots}/sound-${theme}.png` });
    await page.getByLabel('Start from').selectOption('modes');
    await page.waitForTimeout(12000);
    r.modes = await page.locator('[data-sound-modes]').innerText().catch(() => '');
    r.textbook = await page.getByText(/A plain rectangle by the textbook/).innerText().catch(() => '');
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
