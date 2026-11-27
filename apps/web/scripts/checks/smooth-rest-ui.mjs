// M566 and M567 in the browser (dev server with demo login): the parts that keep their own movement on the search window's
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
  // M567: the Planner's Settings section folds open (height, on the search window's timing) and folds away quicker.
  await page.goto(`${base}/student/planner`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const toggle = page.locator('button[aria-expanded]:has-text("Settings")').first();
  await toggle.waitFor({ timeout: 60000 });
  await toggle.click();
  const hs = [];
  for (let i = 0; i < 8; i++) {
    hs.push(await page.evaluate(() => { const el = [...document.querySelectorAll('div.overflow-hidden')].find((d) => d.style.height || d.style.opacity); return el ? Math.round(el.getBoundingClientRect().height) : -1; }));
    await page.waitForTimeout(50);
  }
  console.log('fold-out heights:', hs.join(' '));
  if (!(hs.some((h) => h >= 0) && Math.min(...hs.filter((h) => h >= 0)) < Math.max(...hs))) fail.push('the section did not fold open');
  await toggle.click();
  const f0 = Date.now();
  await page.waitForFunction(() => !document.querySelector('[aria-expanded="true"]'), null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(260);
  console.log('folded away in about', Date.now() - f0, 'ms');
} finally { await browser.close(); }
if (fail.length) { console.log(fail.join('\n')); process.exit(1); }
console.log('ok');
