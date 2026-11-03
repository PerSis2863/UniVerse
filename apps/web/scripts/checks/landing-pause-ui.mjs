// M47 on the built site (`pnpm local:serve`): the landing's looping demos run only while on screen.
// On a phone: at the top the hero picture moves and the parts below hold still (`data-away`, `Live`
// in src/components/landing/bits.tsx); scrolled to the questions, the hero holds still too and nothing
// in it is still animating; back at the top it moves again.
//   node scripts/checks/landing-pause-ui.mjs [http://localhost:8787]
import { baseUrl, launch } from '../browser-session.mjs';

const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

/** How many elements in parts marked away still change their style within half a second. */
async function moving(page) {
  const snap = () => page.evaluate(() => [...document.querySelectorAll('[data-away] *')].map((e) => e.getAttribute('style') ?? ''));
  const a = await snap();
  await page.waitForTimeout(500);
  const b = await snap();
  return a.filter((x, i) => x !== b[i]).length;
}

const state = (page) => page.evaluate(() => ({
  heroAway: !!document.querySelector('main > section [data-away]'),
  away: document.querySelectorAll('[data-away]').length,
}));

const browser = await launch();
const out = {};
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
try {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  out.top = await state(page);
  check(!out.top.heroAway, 'top: the hero picture moves');
  check(out.top.away > 0, 'top: the parts below hold still');
  await page.locator('#faq').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000); // the hero's scroll spring settles
  out.bottom = { ...(await state(page)), moving: await moving(page) };
  check(out.bottom.heroAway, 'bottom: the hero holds still');
  check(out.bottom.moving === 0, `bottom: ${out.bottom.moving} parts off screen still animating`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  check(!(await state(page)).heroAway, 'back at the top: the hero moves again');
  await ctx.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
