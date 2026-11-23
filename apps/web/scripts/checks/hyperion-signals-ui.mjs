// M472– Hyperion Signals: each window opens; the Filter designer redraws when an edge is dragged (the order readout
// changes). Axe at 1280 (dark and light), no sideways scroll, no page errors. (Hyperion is for computers.)
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/hyperion-signals-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const TABS = (process.env.TABS ?? 'Filter designer,Audio,Devices').split(',');
const browser = await launch();
const out = {}, errors = [];
const axe = async (page) => { await page.addScriptTag({ path: AXE }); return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`)); };
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)} ${(e.stack ?? '').slice(0, 300)}`));
    await page.goto(`${base}/hyperion/signals`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    for (const tab of TABS) {
      await page.getByRole('group', { name: 'Signals' }).getByRole('button', { name: tab }).click({ timeout: 120_000 });
      await page.waitForTimeout(800);
      if (tab === 'Filter designer') {
        const svg = page.getByRole('img', { name: /Magnitude response/ });
        await svg.waitFor({ timeout: 60_000 });
        const before = await svg.getAttribute('aria-label');
        const box = await svg.boundingBox();
        // The stopband edge starts at 0.3 of the width: drag it out to 0.5.
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(300);
        r.dragged = before !== (await svg.getAttribute('aria-label'));
      }
      if (tab === 'Audio') {
        // The generator needs no microphone: a 1 kHz sine should read about 1 kHz and −12 dBFS − 3 dB.
        await page.getByRole('button', { name: 'Start', exact: true }).click();
        await page.waitForTimeout(1500);
        r.hz = await page.locator('[data-reading="hz"]').innerText();
        r.level = await page.locator('[data-reading="level"]').innerText();
        await page.getByRole('button', { name: /^Record$/ }).click();
        await page.getByText(/Saved in Hyperion’s files/).waitFor({ timeout: 15_000 });
        r.recorded = true;
        await page.getByRole('button', { name: 'Start logging' }).click();
        await page.waitForTimeout(1600);
        r.logged = await page.getByText(/readings$/).innerText();
      }
      if (tab === 'Devices') {
        // The simulated Arduino: text lines plotted, a command answered; then Firmata pins.
        await page.getByRole('button', { name: 'Try a simulated Arduino' }).click();
        await page.locator('[data-series="temp"]').waitFor({ timeout: 10_000 });
        await page.waitForTimeout(600);
        r.temp = await page.locator('[data-series="temp"]').innerText();
        await page.getByLabel('A command for the device').fill('LED ON');
        await page.getByRole('button', { name: 'Send' }).click();
        await page.getByText('ok: led on').waitFor({ timeout: 5000 });
        r.answered = true;
        if (shots) await page.screenshot({ path: `${shots}/signals-devices-text-${theme}.png` });
        r['Devices text'] = await axe(page);
        await page.getByRole('button', { name: 'Disconnect' }).click();
        await page.getByRole('group', { name: 'Talk to it as' }).getByRole('button', { name: 'Firmata' }).click();
        await page.getByRole('button', { name: 'Try a simulated Arduino' }).click();
        await page.getByLabel('A0 mode').selectOption('analog');
        await page.getByLabel('D13 mode').selectOption('output');
        await page.getByRole('button', { name: 'Low (off)' }).click();
        await page.waitForTimeout(500);
        r.a0 = await page.locator('[data-pin="A0"]').innerText();
        r.d13 = await page.getByRole('button', { name: 'High (on)' }).count();
      }
      if (shots) await page.screenshot({ path: `${shots}/signals-${tab.replace(/\W+/g, '-')}-${theme}.png` });
      r[tab] = await axe(page);
    }
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
