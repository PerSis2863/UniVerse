// M544 Simulate → Structures → Warming: an even warming of a beam held at both ends squeezes it (the peak stress follows
// E·α·ΔT), "From Heat" uses the Heat bench's temperatures on the same part. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-warming-ui.mjs
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
    await ctx.addInitScript((th) => {
      localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential');
      localStorage.removeItem('uv-sim-structure'); localStorage.removeItem('uv-sim-heat');
    }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/simulate`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const outline = page.getByRole('navigation', { name: 'Study outline' });
    await outline.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1500);
    r.before = await page.getByText(/^It (holds|fails)|^Too close/).first().innerText().catch(() => '');
    await outline.getByRole('button', { name: /^Warming/ }).click();
    await page.getByRole('group', { name: 'The part is warmed' }).getByRole('button', { name: 'Evenly' }).click();
    await page.getByLabel(/Temperature change/).fill('100');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Back to the results' }).click();
    r.even = await page.getByText(/^It (holds|fails)|^Too close/).first().innerText().catch(() => '');
    await outline.getByRole('button', { name: /^Warming/ }).click();
    await page.getByRole('group', { name: 'The part is warmed' }).getByRole('button', { name: 'From Heat' }).click();
    await page.waitForTimeout(1500);
    r.fromHeat = await page.getByText(/Heat is set up on a different part/).first().innerText().catch(() => 'solved');
    // Heat on the same beam (its start: the left end held at 100 °C, the faces cooled by air): now it solves.
    await page.evaluate(() => localStorage.setItem('uv-sim-heat', JSON.stringify({ template: 'beam' })));
    await page.getByRole('group', { name: 'The part is warmed' }).getByRole('button', { name: 'Evenly' }).click();
    await page.getByRole('group', { name: 'The part is warmed' }).getByRole('button', { name: 'From Heat' }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Back to the results' }).click();
    r.sameHeat = await page.getByText(/^It (holds|fails)|^Too close|Heat is set up/).first().innerText().catch(() => '');
    if (shots) await page.screenshot({ path: `${shots}/warming-${theme}.png` });
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
