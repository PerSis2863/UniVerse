// M521 Hyperion waits mid-run: its pages are cross-origin isolated (the headers, and a page entered from the rest of the
// site reloads once to get them); a script's readline inside a loop and a function waits for the simulated Arduino's
// next lines, a parfor inside a function runs on the pool. No page errors.
//   BASE=http://localhost:3000 node scripts/checks/hyperion-wait-ui.mjs
import { launch, signedIn } from '../browser-session.mjs';
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await launch();
const out = {}, errors = [];
const command = async (page, code, until) => {
  await page.getByLabel('Command', { exact: true }).fill(code);
  await page.getByLabel('Command', { exact: true }).press('Enter');
  try { await page.getByText(until).first().waitFor({ timeout: 60_000 }); } catch (e) {
    console.log(JSON.stringify({ isolated: await page.evaluate(() => self.crossOriginIsolated), shown: (await page.getByRole('region', { name: 'Command window' }).innerText()).slice(-900) }, null, 1));
    throw e;
  }
};
try {
  const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
  await ctx.addInitScript(() => { localStorage.setItem('uv-cookies', 'essential'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${e.message.slice(0, 200)} ${(e.stack ?? '').slice(0, 300)}`));
  const res = await page.goto(`${base}/hyperion/signals`, { waitUntil: 'load', timeout: 240_000 });
  out.headers = { coop: res.headers()['cross-origin-opener-policy'], coep: res.headers()['cross-origin-embedder-policy'] };
  await page.waitForTimeout(1500);
  out.isolated = await page.evaluate(() => self.crossOriginIsolated);
  await page.getByRole('group', { name: 'Signals' }).getByRole('button', { name: 'Devices' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Try a simulated Arduino' }).click();
  await page.locator('[data-series="temp"]').waitFor({ timeout: 10_000 });
  // To the Code window by the app's own menu (the device link stays open).
  await page.locator('a[href="/hyperion"]').first().click();
  await page.getByLabel('Command', { exact: true }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  await command(page, "function v = one(s), v = readline(s); end\ns = serialport('Arduino', 9600, 'Timeout', 5); flush(s); L = {}; for i = 1:20, L{i} = one(s); end; fprintf('got %d lines, %d empty\\n', numel(L), sum(cellfun(@isempty, L)))", /got 20 lines/);
  out.lines = (await page.evaluate(() => document.body.innerText.match(/got 20 lines, \d+ empty/)?.[0]));
  out.linesTookMs = Date.now() - t0;
  await command(page, "function y = sq(n), y = zeros(1, n); parfor k = 1:n, y(k) = k^2; end, end\nfprintf('parfor in a function: %s\\n', mat2str(sq(6)))", /parfor in a function: \[/);
  out.parfor = await page.evaluate(() => document.body.innerText.match(/parfor in a function: \[.*/)?.[0]);
  // M522: a channel's readings while the script runs (the newest channel; run hyperion-signals-ui.mjs first to make one).
  const list = await (await fetch(`${base}/api/core/iot/channels`, { headers: { Authorization: 'Bearer mock-token-alice@student.com' } })).json();
  const ch = list.channels?.at(-1);
  if (ch) {
    await command(page, `[d, t, names] = iotread('${ch.name}', 'NumPoints', 3); fprintf('iot: %d rows of %s\\n', size(d, 1), names{1})`, /iot: \d+ rows of /);
    out.iotread = await page.evaluate(() => document.body.innerText.match(/iot: \d+ rows of .*/)?.[0]);
  }
  await ctx.close();
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
