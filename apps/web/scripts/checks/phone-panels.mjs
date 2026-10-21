// The phone's slide-in panels, checked by eye and measured (Stage 5 review follow-up): the
// Notifications panel slides in from the right (from the left in Arabic), its rows cascade in and
// still scale when tapped, the home logo's ping stops, and the side menu's first open doesn't
// restyle the whole page. On a 390 × 844 touch screen with the CPU 4× slower, with a performance
// trace: style recalculation (UpdateLayoutTree), layout and paint per action, and how many
// elements each style recalculation touched.
//
//   pnpm local:serve --test-secret   (in another terminal)
//   node scripts/checks/phone-panels.mjs [http://localhost:8787]
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const base = baseUrl();
const browser = await launch();
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✖'} ${what}`); if (!ok) failed++; };

async function phone(lang) {
  const ctx = await signedIn(browser, base, 'demo@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (lang) await ctx.addInitScript((l) => localStorage.setItem('universe-language', JSON.stringify({ state: { language: l }, version: 0 })), lang);
  const page = await ctx.newPage();
  await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2500);
  return { ctx, page, cdp: await ctx.newCDPSession(page) };
}

// Main-thread rendering work during `act`, from a trace.
async function traced(page, cdp, act, ms = 1500) {
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
  await act();
  await page.waitForTimeout(ms);
  await cdp.send('Tracing.end');
  await done;
  const sum = (name) => Math.round(events.filter((e) => e.name === name && e.ph === 'X').reduce((a, e) => a + (e.dur ?? 0), 0) / 1000);
  const styles = events.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  const most = Math.max(0, ...styles.map((e) => e.args?.elementCount ?? 0));
  return { style: sum('UpdateLayoutTree'), layout: sum('Layout'), paint: sum('Paint'), mostElements: most };
}

// English: the side menu and the panel.
{
  const { ctx, page, cdp } = await phone(null);
  const logoPings = await page.evaluate(() => [...document.querySelectorAll('.universe-ping')].map((el) => getComputedStyle(el).animationIterationCount));
  check(logoPings.every((n) => n !== 'infinite'), `the logo's ping plays a few times, not forever (${logoPings.join(', ') || 'none on screen'})`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const more = page.locator('nav[aria-label="Primary"] button').last();
  const menu = await traced(page, cdp, () => more.tap());
  console.log(`  side menu first open: style ${menu.style} ms (at most ${menu.mostElements} elements at once), layout ${menu.layout} ms, paint ${menu.paint} ms`);
  check(menu.mostElements < 600, 'the side menu opens without restyling the whole page');
  const bodyScrolls = await page.evaluate(() => { const y = scrollY; scrollBy(0, 300); const moved = scrollY !== y; scrollTo(0, y); return moved; });
  console.log(`  (the page can still be scrolled by script while the menu is open: ${bodyScrolls}; fingers are what's locked)`);
  const touch = await page.locator('aside[aria-label="Navigation"]').evaluate((el) => getComputedStyle(el.previousElementSibling).touchAction);
  check(touch === 'none', `a finger on the dimmed page behind the menu doesn't scroll it (touch-action: ${touch})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  const bell = page.getByRole('button', { name: /^Notifications/ }).first();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  const open = await traced(page, cdp, () => bell.tap());
  console.log(`  notifications open: style ${open.style} ms, layout ${open.layout} ms, paint ${open.paint} ms`);
  const box = await panel.boundingBox();
  check(box && Math.round(box.x) === 0 && Math.round(box.width) === 390, `the panel ends up filling the phone's width (x ${box?.x}, width ${box?.width})`);
  const rows = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Notifications"] .stagger > *')].slice(0, 3).map((el) => getComputedStyle(el).animationName));
  check(rows.length > 0 && rows.every((n) => n === 'rise'), `the rows cascade in with the CSS animation (${rows.join(', ')})`);
  const row = page.locator('[role="dialog"][aria-label="Notifications"] .stagger > *').first();
  if (await row.count()) {
    // After the cascade, nothing of the animation is left on the row, so its press scale works.
    await page.waitForTimeout(600);
    const after = await row.evaluate((el) => ({ transition: getComputedStyle(el).transitionProperty, held: getComputedStyle(el).transform, running: el.getAnimations().length }));
    check(/scale|transform|all/.test(after.transition) && after.held === 'none' && after.running === 0, `a row's press effect is still there (transition: ${after.transition}, transform left: ${after.held})`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  check(!(await panel.count()), 'the panel closes');
  await ctx.close();
}

// Arabic: the panel comes in from the left.
{
  const { ctx, page } = await phone('ar');
  check(await page.evaluate(() => document.documentElement.dir === 'rtl'), 'Arabic turns the page right to left');
  const bell = page.locator('header button[aria-haspopup], header button').filter({ has: page.locator('svg') });
  const target = page.getByRole('button', { name: /^Notifications|الإشعارات/ }).first();
  await (await target.count() ? target : bell.first()).tap();
  await page.waitForTimeout(90);
  const mid = await page.locator('[role="dialog"]').first().boundingBox();
  await page.waitForTimeout(1200);
  const end = await page.locator('[role="dialog"]').first().boundingBox();
  check(mid && end && mid.x < end.x + 1 && Math.round(end.x) === 0, `in Arabic the panel slides in from the left (x ${Math.round(mid?.x ?? NaN)} → ${Math.round(end?.x ?? NaN)})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const leaving = await page.locator('[role="dialog"]').first().boundingBox().catch(() => null);
  check(!leaving || leaving.x < 0, `and slides out to the left (x ${Math.round(leaving?.x ?? NaN)})`);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n✖ ${failed} failed` : '\n✔ All passed');
process.exit(failed ? 1 : 0);
