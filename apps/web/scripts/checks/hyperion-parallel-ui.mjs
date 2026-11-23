// M477 Hyperion's parallel computing: the example parallel.m, run in the Code window, shares its parfor passes among
// background workers and prints the speed-up; the results match (the sums, the futures). No page errors.
//   BASE=http://localhost:3000 node scripts/checks/hyperion-parallel-ui.mjs
import { launch, signedIn } from '../browser-session.mjs';
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await launch();
const out = {}, errors = [];
try {
  const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
  await ctx.addInitScript(() => { localStorage.setItem('uv-cookies', 'essential'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${e.message.slice(0, 200)} ${(e.stack ?? '').slice(0, 400)}`));
  await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
  out.cores = await page.evaluate(() => navigator.hardwareConcurrency);
  await page.getByRole('tab', { name: 'parallel.m' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByText(/Primes up to 80000/).waitFor({ timeout: 180_000 });
  // Again, with the pool's workers already started (the first run includes loading the engine in each).
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.waitForFunction(() => (document.body.innerText.match(/Primes up to 80000/g) ?? []).length >= 2, null, { timeout: 180_000 });
  const text = await page.evaluate(() => document.body.innerText);
  out.parfor = text.match(/parfor: \d.*/g) ?? [];
  out.timing = text.match(/for: \d.* as fast\)/g);
  out.sum = text.match(/Σ 1\/k² to 1000 = \d.*/)?.[0];
  await ctx.close();
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
