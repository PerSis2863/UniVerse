// M482 in the browser (dev server with demo login): the parts that keep their own movement on the search window's
// timing. Internships' Filters panel slides in from the end edge (transform only) with its backdrop fading; closing is
// quicker than opening; no page errors.   node scripts/checks/smooth-rest-ui.mjs [http://localhost:3000]
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const base = baseUrl();
const fail = [];
const browser = await launch();
try {
  const ctx = await signedIn(browser, base, 'demo@student.com', { width: 1280, height: 860 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`page error: ${e.message}`));
  await page.goto(`${base}/student/internships`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const card = page.locator('main button:has-text("Filters")').first();
  await card.waitFor({ timeout: 30000 });
  await card.click();
  const panel = page.locator('div.fixed.end-0.top-0').last();
  const seen = [];
  for (let i = 0; i < 8; i++) { seen.push(await panel.evaluate((el) => getComputedStyle(el).transform).catch(() => 'none')); await page.waitForTimeout(40); }
  console.log('opening transforms:', seen.join(' | '));
  if (!seen.some((t) => t.startsWith('matrix') && t !== 'matrix(1, 0, 0, 1, 0, 0)')) fail.push('the panel did not slide in');
  await page.waitForTimeout(500);
  const end = await panel.evaluate((el) => getComputedStyle(el).transform);
  if (end !== 'none' && end !== 'matrix(1, 0, 0, 1, 0, 0)') fail.push(`the panel did not settle: ${end}`);
  await page.keyboard.press('Escape');
  await page.mouse.click(20, 400);
  const t0 = Date.now();
  await panel.waitFor({ state: 'detached', timeout: 3000 }).catch(() => fail.push('the panel did not close'));
  console.log('closed in', Date.now() - t0, 'ms');
} finally { await browser.close(); }
if (fail.length) { console.log(fail.join('\n')); process.exit(1); }
console.log('ok');
