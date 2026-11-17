// M219 the menu as a bar across the top on a computer's browser (the side menu stays in the installed app and on
// phones): at 1440, 1280 and 1024 (dark and light) the bar is there and the side menu isn't, every entry fits or
// is under More, a group's list opens with its pages, the chosen page is lit; at 390 the phone's tab bar is kept;
// the installed app (display-mode standalone, emulated) keeps the side menu; M231: full screen counts as the browser
// (the rule's text), and the choice in Settings → Appearance (top or side) wins either way. axe, no sideways scroll, no page
// errors; the page starts under the bar with no empty row; no name both in the bar and in the page's own row of
// sections; an entry dragged to another place stays there and is put back from the account menu (M221). Runs against `local:serve` (or BASE=… for local:dev); SHOTS=<dir> saves screenshots.
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
async function axe(page) {
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await launch();
const out = { errors: [] };
const runs = [['demo@admin.com', '/admin/users', 'dark', 1440], ['demo@admin.com', '/admin', 'light', 1024], ['alice@student.com', '/trace/radar', 'dark', 1280], ['alice@student.com', '/green', 'light', 1280], ['alice@student.com', '/travel', 'dark', 1280], ['alice@student.com', '/student', 'light', 390], ['alice@student.com', '/green', 'dark', 390], ['alice@student.com', '/trace', 'light', 390]];
for (const [email, path, theme, width] of runs) {
  const phone = width < 600, name = `${path.replaceAll('/', '_')}-${theme}-${width}`, r = (out[name] = {});
  const ctx = await signedIn(browser, base, email, { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
  await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`${name}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 180_000 });
  await page.locator(phone ? 'nav[aria-label="Primary"]' : 'header.top-nav').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200);
  r.sideMenu = await page.locator('aside[aria-label="Navigation"]').count();
  if (!phone) {
    const bar = page.locator('header.top-nav');
    const box = await bar.boundingBox();
    r.bar = box && { y: Math.round(box.y), h: Math.round(box.height), w: Math.round(box.width) };
    r.entries = await bar.locator('nav > div > [data-chip], nav > div > [data-tour="more"]').allInnerTexts();
    // M221: nothing in the bar that the page's own row of sections (Trace, Green, Relief, Travel) shows too.
    r.dupes = await page.evaluate(() => { const bar = new Set([...document.querySelectorAll('header.top-nav [data-chip]')].map((c) => c.textContent.trim())); return [...document.querySelectorAll('#main nav a')].map((a) => a.textContent.trim()).filter((t) => bar.has(t)); });
    // The page starts right under the bar: no empty row of the page's own bar (M219).
    r.pageBar = await page.locator('header.app-topbar:visible').count();
    r.gapUnder = await page.evaluate(() => { const b = document.querySelector('header.top-nav').getBoundingClientRect().bottom; const first = [...document.querySelectorAll('#main *')].find((el) => { const r = el.getBoundingClientRect(); return r.height > 8 && r.width > 40 && getComputedStyle(el).visibility !== 'hidden' && el.children.length === 0; }); return first ? Math.round(first.getBoundingClientRect().top - b) : null; });
    r.lit = await bar.locator('[aria-current="page"], button.font-semibold').allInnerTexts();
    // Nothing in the row runs past its end.
    r.clipped = await page.evaluate(() => { const row = document.querySelector('header.top-nav nav > div'); const end = row.getBoundingClientRect().right; return [...row.children].filter((c) => !c.hasAttribute('aria-hidden') && c.getBoundingClientRect().right > end + 1).map((c) => c.textContent); });
    if (shots) await page.screenshot({ path: `${shots}/top-nav${name}.png` });
    const group = bar.locator('nav button[aria-haspopup]').first();
    if (await group.count()) {
      await group.click();
      await page.waitForTimeout(450); // the list's fade-in
      r.groupList = await page.locator('[data-popover] [role="menuitem"]').allInnerTexts();
      if (shots) await page.screenshot({ path: `${shots}/top-nav${name}-open.png` });
      r.axeOpen = await axe(page);
      await page.keyboard.press('Escape');
    }
  } else if (shots) await page.screenshot({ path: `${shots}/top-nav${name}.png` });
  r.axe = await axe(page);
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await ctx.close();
}
// M221: the bar's entries are dragged into another order; the order stays after a reload and More follows it;
// the account menu puts it back.
{
  const ctx = await signedIn(browser, base, 'demo@admin.com', { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`drag: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/admin`, { waitUntil: 'load', timeout: 180_000 });
  const chips = page.locator('header.top-nav nav [data-chip]');
  await chips.first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200);
  const names = () => chips.allInnerTexts().then((a) => a.map((t) => t.trim()));
  const before = await names();
  const from = await chips.last().boundingBox(), to = await chips.first().boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + from.width / 2 + ((to.x + 4) - (from.x + from.width / 2)) * (i / 12), from.y + from.height / 2);
  if (shots) await page.screenshot({ path: `${shots}/top-nav-dragging.png` });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await names();
  await page.reload({ waitUntil: 'load' });
  await chips.first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
  const reloaded = await names();
  await page.getByRole('button', { name: /Your account/ }).click();
  await page.getByRole('button', { name: 'Put the menu back in order' }).click();
  await page.waitForTimeout(400);
  out.drag = { before, after, stillThere: reloaded.join() === after.join(), path: new URL(page.url()).pathname, putBack: (await names()).join() === before.join() };
  await ctx.close();
}

// The installed app on a computer keeps the side menu. Chromium can't emulate display-mode, so the page's script is
// told it's installed (CSS still sees a browser: only the menu chosen is checked, not the page's margin).
const ctx = await signedIn(browser, base, 'demo@admin.com', { width: 1280, height: 900 });
await ctx.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('display-mode: browser') ? { ...mm('(min-width: 99999px)'), matches: false, media: q, addEventListener() {}, removeEventListener() {} } : mm(q)); });
const page = await ctx.newPage();
await page.goto(`${base}/admin`, { waitUntil: 'load', timeout: 180_000 });
await page.locator('aside[aria-label="Navigation"]').waitFor({ timeout: 120_000 });
out.installed = { sideMenu: await page.locator('aside[aria-label="Navigation"]').count(), bar: await page.locator('header.top-nav').count() };
if (shots) await page.screenshot({ path: `${shots}/top-nav-installed-1280.png` });
await ctx.close();
// M231: the choice in Settings → Appearance wins: the side menu in a browser, the top bar in the installed app.
for (const [place, installed] of [['side', false], ['top', true]]) {
  const c = await signedIn(browser, base, 'demo@admin.com', { width: 1280, height: 900 });
  await c.addInitScript(([p, inst]) => {
    localStorage.setItem('uv-menu', p);
    if (inst) { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('display-mode: browser') ? { ...mm('(min-width: 99999px)'), matches: false, media: q, addEventListener() {}, removeEventListener() {} } : mm(q)); }
  }, [place, installed]);
  const pg = await c.newPage();
  await pg.goto(`${base}/admin`, { waitUntil: 'load', timeout: 180_000 });
  await pg.locator(place === 'side' ? 'aside[aria-label="Navigation"]' : 'header.top-nav').waitFor({ timeout: 120_000 });
  out[`chosen-${place}${installed ? '-installed' : ''}`] = { sideMenu: await pg.locator('aside[aria-label="Navigation"]').count(), bar: await pg.locator('header.top-nav').count(), dataMenu: await pg.evaluate(() => document.documentElement.dataset.menu ?? null) };
  if (shots) await pg.screenshot({ path: `${shots}/top-nav-chosen-${place}.png` });
  await c.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
