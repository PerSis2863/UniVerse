// M526 Hyperion Signals → Bluetooth & USB: the simulated heart-rate sensor's pulse arrives, the battery is read, the
// simulated USB device echoes what it's sent; then a script in the Code window reads three pulses in a loop and talks
// to the USB device. Axe at 1280, dark and light; no page errors.
//   BASE=http://localhost:3000 node scripts/checks/hyperion-wireless-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await launch();
const out = {}, errors = [];
try {
  for (const theme of ['dark', 'light']) {
    const r = (out[theme] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${theme}: ${e.message.slice(0, 200)}`));
    await page.goto(`${base}/hyperion/signals`, { waitUntil: 'load', timeout: 240_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('group', { name: 'Signals' }).getByRole('button', { name: 'Bluetooth & USB' }).click({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Try a simulated heart-rate sensor' }).click();
    await page.waitForFunction(() => /beats a minute/.test(document.querySelector('[data-char="Heart rate measurement"] [data-value]')?.textContent ?? ''), null, { timeout: 10_000 });
    r.pulse = await page.locator('[data-char="Heart rate measurement"] [data-value]').innerText();
    await page.getByRole('button', { name: 'Read Battery level' }).click();
    r.battery = await page.locator('[data-char="Battery level"] [data-value]').innerText();
    await page.getByRole('button', { name: 'Try a simulated echo device' }).click();
    await page.getByLabel('Bytes or text to send').fill('hello');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'Receive' }).click();
    await page.waitForFunction(() => /5 bytes/.test(document.querySelector('[data-usb-got]')?.textContent ?? ''), null, { timeout: 5000 });
    r.echo = await page.locator('[data-usb-got]').innerText();
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    if (theme === 'dark') {
      await page.locator('a[href="/hyperion"]').first().click();
      const box = page.getByLabel('Command', { exact: true });
      await box.waitFor({ timeout: 120_000 });
      await page.waitForTimeout(1500);
      await box.fill("b = ble; c = characteristic(b, 'heart_rate', '2A37'); for k = 1:3, d = read(c); p(k) = d(2); end\nu = usbdev; write(u, [7 8 9]); e = read(u, 3); fprintf('pulses %s echo %s\\n', mat2str(p), mat2str(e))");
      await box.press('Enter');
      await page.getByText(/pulses \[\d+ \d+ \d+\] echo \[7 8 9\]/).waitFor({ timeout: 30_000 });
      r.script = await page.evaluate(() => document.body.innerText.match(/pulses \[.*\] echo \[.*\]/)?.[0]);
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
