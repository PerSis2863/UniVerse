// M222 the notifications panel, Apple style: opened from the bell at 1280 (dark and light) and 390 (light, a touch
// phone): its rows by day with their icons, a stack of the same notification opening and closing, the segmented control filters them (Unread), Escape closes it; the
// slide in measured (no frame over 50 ms while it opens); axe on the open panel, no sideways scroll, no page
// errors. Runs against `local:serve` (or BASE=… for local:dev); SHOTS=<dir> saves screenshots.
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = { errors: [] };
for (const [theme, width] of [['dark', 1280], ['light', 1280], ['light', 390]]) {
  const phone = width < 600, r = (out[`${theme} ${width}`] = {});
  const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`${theme} ${width}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/student`, { waitUntil: 'load', timeout: 180_000 });
  const bell = page.locator('[data-tour="notifications"]:visible').first();
  await bell.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  // Long frames while the sheet slides in.
  await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 60) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await panel.waitFor();
  await page.waitForTimeout(1200);
  r.slowFrames = await page.evaluate(() => window.__frames.slice(2).filter((d) => d > 50).length);
  r.groups = await panel.locator('section h3').allInnerTexts();
  r.rows = await panel.locator('li.notif-row').count();
  if (shots) await page.screenshot({ path: `${shots}/notifications-${theme}-${width}.png` });
  await page.addScriptTag({ path: AXE });
  r.axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('[role="dialog"][aria-label="Notifications"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  // A stack (the same notification several times) opens with a tap and closes with Show less.
  r.stacks = await panel.locator('button[aria-expanded="false"]').count();
  if (r.stacks) {
    await panel.locator('button[aria-expanded="false"]').first().click();
    await page.waitForTimeout(500);
    r.rowsOpened = await panel.locator('li.notif-row').count();
    if (shots) await page.screenshot({ path: `${shots}/notifications-${theme}-${width}-stack.png` });
    await panel.getByRole('button', { name: 'Show less' }).click();
    await page.waitForTimeout(500);
    r.rowsClosed = await panel.locator('li.notif-row').count();
  }
  await panel.getByRole('button', { name: 'Unread', exact: true }).click();
  await page.waitForTimeout(500);
  r.unreadRows = await panel.locator('li.notif-row').count();
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  r.closed = (await panel.count()) === 0;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
