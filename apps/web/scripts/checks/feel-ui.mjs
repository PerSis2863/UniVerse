// M45 in the browser (dev server with demo login, or `pnpm local:serve`), as a phone with a finger:
// a long press on a chat opens its options as a sheet from the bottom; a swipe toward the end marks
// it unread (and back); a swipe on a notification marks it read; the shared menu (snooze) opens as a
// sheet; back from a chat shows the list; Settings → Appearance has Sounds, off until turned on.
// Axe on each at 390 (and Messages at 1280), light and dark.
//   node scripts/checks/feel-ui.mjs [http://localhost:3100]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

/** Axe on the page, or only on `within` (an open sheet: the page behind it is dimmed on purpose). */
async function axe(page, what, within) {
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async (sel) => (await window.axe.run(sel ? document.querySelector(sel) : document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), within);
  for (const b of bad) fail.push(`${what} axe ${b}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${what}: sideways scrolling`);
}

/** A finger: down at (x, y), optionally moving to (x2, y), held for `ms`, then up. */
async function finger(page, x, y, { x2 = x, ms = 60 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const at = (px) => [{ x: px, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x) });
  for (let i = 1; i <= 8 && x2 !== x; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x + ((x2 - x) * i) / 8) }); await page.waitForTimeout(16); }
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const browser = await launch();
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await signedIn(browser, base, 'demo@student.com', { width: 390, height: 844 }, { colorScheme: scheme, hasTouch: true, isMobile: true });
    await ctx.addInitScript((s) => { try { localStorage.setItem('theme', s); } catch { /* a locked frame */ } }, scheme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => page.url() !== 'about:blank' && errors.push(`${e.message.slice(0, 160)} @ ${page.url().replace(base, '')} ${(e.stack ?? '').split('\n').slice(1, 3).join(' ').slice(0, 200)}`));

    // Messages: long press → sheet; swipe → unread and back; open and back.
    await page.goto(base + '/student/inbox', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const row = page.locator('.stagger > div.group button').first();
    await row.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(800);
    // A swipe toward the end flips read / unread (the row's badge), a second one puts it back.
    const badge = () => page.locator('.stagger > div.group').first().locator('.badge-bump').count();
    const swipe = async () => { const b = await row.boundingBox(); await finger(page, b.x + 40, b.y + b.height / 2, { x2: b.x + 280 }); await page.waitForTimeout(1200); };
    const had = await badge();
    await swipe();
    check((await badge()) !== had, `${scheme}: a swipe flips read / unread (${had} → ${await badge()})`);
    await swipe();
    check((await badge()) === had, `${scheme}: a second swipe puts it back`);
    check(!errors.length, `${scheme} messages: page errors ${errors.join(' | ')}`);

    // A long press: Android sends "contextmenu" (and no tap) when the finger is held.
    await row.dispatchEvent('contextmenu');
    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ timeout: 10_000 }).catch(() => {});
    check(await sheet.getByRole('button', { name: /Archive chat|Unarchive/ }).isVisible().catch(() => false), `${scheme}: a long press opens the chat's options as a sheet`);
    await axe(page, `${scheme} chat sheet`, '[role="dialog"]');
    await sheet.getByRole('button', { name: /close/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(600);
    await row.click();
    await page.waitForTimeout(1200);
    await page.goBack().catch(() => {});
    await page.getByRole('button', { name: /^Back|Chats$/ }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Notifications: the snooze menu is a sheet; a swipe toward the start marks one read.
    await page.goto(base + '/notifications', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const snooze = page.getByRole('button', { name: /^Snooze “/ }).first();
    if (await snooze.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)) {
      await snooze.click();
      check(await page.getByRole('dialog').getByRole('menuitem').first().isVisible().catch(() => false), `${scheme}: snooze menu opens as a sheet`);
      await axe(page, `${scheme} snooze sheet`, '[role="dialog"]');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else fail.push(`${scheme}: no notifications to test`);

    // Settings → Appearance: Sounds, off by default.
    await page.goto(base + '/student/settings?section=appearance', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const sw = page.getByRole('switch', { name: 'Sounds' });
    await sw.waitFor({ timeout: 60_000 });
    await axe(page, `${scheme} settings`); // at the top: nothing under the see-through top bar
    check((await sw.getAttribute('aria-checked')) === 'false', `${scheme}: sounds off by default`);
    await sw.click();
    check((await page.evaluate(() => localStorage.getItem('uv-sounds'))) === 'on', `${scheme}: sounds turn on`);
    await sw.click();
    check((await page.evaluate(() => localStorage.getItem('uv-sounds'))) === null, `${scheme}: and off again`);
    check(!errors.length, `${scheme}: page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // Computers keep the small menu.
  const ctx = await signedIn(browser, base, 'demo@student.com', { width: 1280, height: 860 });
  const page = await ctx.newPage();
  await page.goto(base + '/student/inbox', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const row = page.locator('.stagger > div.group').first();
  await row.waitFor({ timeout: 120_000 });
  await row.hover();
  await row.getByRole('button', { name: 'Chat options' }).click();
  check(await page.locator('.menu-pop').isVisible(), '1280: chat options stay a small menu');
  check(!(await page.getByRole('dialog').isVisible().catch(() => false)), '1280: no sheet on a computer');
  await axe(page, '1280 messages');
  await ctx.close();
} finally {
  await browser.close();
}

if (fail.length) { console.log(`FAILED (${fail.length}):\n- ${fail.join('\n- ')}`); process.exit(1); }
console.log('feel-ui: all good');
