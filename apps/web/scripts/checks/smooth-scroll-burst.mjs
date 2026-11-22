// M332–M333: the wheel's glide on every app's pages, and tripist's click burst on the website (not in the app).
// Run against `pnpm local:dev` or `pnpm local:serve`: node scripts/checks/smooth-scroll-burst.mjs [base]
import { launch, signedIn } from '../browser-session.mjs';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const browser = await launch();
let bad = 0;
const fail = (m) => { bad++; console.log('✗', m); };

/** One 100 px wheel turn over the page's middle: where it is a tenth of a second later, and when it has settled. */
async function glide(page) {
  await page.mouse.move(640, 560);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(120);
  const early = (await page.evaluate(() => scrollY)) - y0;
  await page.waitForTimeout(2700);
  return { early, late: (await page.evaluate(() => scrollY)) - y0 };
}

// The website: the burst after a mouse click, gone after its 0.4 s; the glide.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const { early, late } = await glide(page);
  if (!(early > 2 && early < 90 && Math.abs(late - 100) < 2)) fail(`landing: glide ${early} → ${late}`);
  await page.mouse.click(1200, 300);
  await page.waitForTimeout(60);
  const lines = await page.locator('.click-burst i').count();
  if (lines !== 4) fail(`landing: ${lines} burst lines after a click`);
  await page.waitForTimeout(700);
  if (await page.locator('.click-burst').count()) fail('landing: the burst stayed after its 0.4 s');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
  if (await page.locator('.click-burst').count()) fail('landing: a key press made a burst');
  console.log(`landing: glide ${early} px after 0.12 s, ${late} px settled; burst ${lines} lines`);
  await page.close();
}

// Every app: the glide on its home, and no burst inside the app.
for (const [email, paths] of Object.entries({ 'demo@student.com': ['/student', '/student/courses', '/travel', '/student/life/green', '/relief', '/trace'], 'demo@teacher.com': ['/teacher/courses'] })) {
  const ctx = await signedIn(browser, base, email, { width: 1280, height: 800 });
  const page = await ctx.newPage();
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (tall < 120) { console.log(`${p}: too short to scroll (${tall} px)`); continue; }
    if (await page.evaluate(() => !!document.elementFromPoint(640, 560)?.closest('.maplibregl-map, canvas, [data-scroll-native]'))) { console.log(`${p}: a map under the pointer takes the wheel (as it should)`); continue; }
    const { early, late } = await glide(page);
    if (!(early > 2 && early < 90 && Math.abs(late - 100) < 2)) fail(`${p}: glide ${early} → ${late}`);
    await page.mouse.click(1200, 400);
    await page.waitForTimeout(60);
    if (await page.locator('.click-burst').count()) fail(`${p}: a burst inside the app`);
    console.log(`${p}: glide ${early} px after 0.12 s, ${late} px settled`);
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} problem(s)` : 'all good');
process.exit(bad ? 1 : 0);
