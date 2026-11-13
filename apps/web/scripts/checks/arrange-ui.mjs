// M165 (dev server or built Worker): arrange any page with the mouse alone (no mode, nothing drawn). On the
// Create page's Quick notes: a click still presses, typing and selecting in a field move nothing; a toolbar
// button dragged onto another changes places with it (that press isn't a click) and stays so after a
// reload; the tool's card pulled by its bottom edge gets taller and by its right edge narrower; Ctrl+Z takes
// a change back and the top bar's "Put this page back" (there only on a rearranged page) resets. Quick
// notes' dividers and panes; a phone: hold, then carry. Axe at 1440 and 390.
//   node scripts/checks/arrange-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const B = baseUrl();
const browser = await launch();
const out = [], fail = [];
const PAGE = '/studio?tool=notes';
const order = (page) => page.evaluate(() => {
  const bar = [...document.querySelectorAll('#main button')].find((b) => b.textContent.includes('Copy link'))?.parentElement;
  return bar ? [...bar.children].filter((k) => k.offsetParent).sort((a, b) => (Number(a.style.order) || 0) - (Number(b.style.order) || 0)).map((k) => (k.textContent || '').trim().slice(0, 14)) : [];
});
const dragTo = async (page, from, to) => {
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + a.width / 2 + ((b.x + b.width / 2 - a.x - a.width / 2) * i) / 12, a.y + a.height / 2 + ((b.y + b.height / 2 - a.y - a.height / 2) * i) / 12); await page.waitForTimeout(25); }
  await page.mouse.up(); await page.waitForTimeout(450);
};
{
  const ctx = await signedIn(browser, B, 'demo@student.com', { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`error: ${e.message.slice(0, 140)}`));
  await page.goto(B + PAGE, { waitUntil: 'load', timeout: 240000 });
  const copy = page.getByRole('button', { name: /Copy link/ }).first();
  await copy.waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  const before = await order(page);
  const back = page.getByRole('button', { name: 'Put this page back' });
  if (await back.count()) fail.push('"Put this page back" shows on an untouched page');
  if (await page.locator('#main [data-arr]').count() || await page.evaluate(() => 'arranging' in document.documentElement.dataset)) fail.push('the page is marked up for arranging');
  // A click still presses.
  await copy.click(); await page.waitForTimeout(400);
  if (!(await page.locator('[data-sonner-toast]').count())) fail.push('a plain click no longer presses the button');
  // Sweeping the mouse across the search field selects in it, and moves nothing.
  const search = page.getByPlaceholder('Search').first();
  await search.fill('hello there');
  const sb = await search.boundingBox();
  await page.mouse.move(sb.x + 40, sb.y + sb.height / 2); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(sb.x + 40 + i * 20, sb.y + sb.height / 2 + i * 6); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(200);
  if (await back.count()) fail.push('dragging inside a field rearranged the page');
  await search.fill('');
  // Drag "Copy link" onto the star button (the last in the row).
  const star = page.locator('#main button', { hasText: /^Star|Starred/ }).first();
  await page.evaluate(() => { window.__clicks = 0; document.addEventListener('click', (e) => { if (e.target.closest?.('#main button')) window.__clicks++; }); });
  await dragTo(page, copy, star);
  const after = await order(page);
  if (await page.evaluate(() => window.__clicks)) fail.push('the press that moved a button also clicked it');
  await back.first().waitFor({ timeout: 5000 }).catch(() => fail.push('"Put this page back" did not appear after a move'));
  out.push(`toolbar: ${before.join(' | ')}  →  ${after.join(' | ')}`);
  if (after.join() === before.join()) fail.push('the drag changed nothing');
  // Resize the tool's card: taller by its bottom edge, narrower by its right edge.
  const card = page.locator('#main section.panel').first();
  // Its bottom edge on screen first (the card is taller than the window).
  await card.evaluate((el) => el.scrollIntoView({ block: 'end' })); await page.waitForTimeout(300);
  await page.evaluate(() => { for (const el of document.querySelectorAll('#main *')) if (el.scrollHeight > el.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(el).overflowY)) { el.scrollTop -= 160; break; } }); await page.waitForTimeout(200);
  const r0 = await card.boundingBox();
  await page.mouse.move(r0.x + r0.width / 2, r0.y + r0.height - 4); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(r0.x + r0.width / 2, r0.y + r0.height - 4 + i * 15); await page.waitForTimeout(20); }
  await page.mouse.up(); await page.waitForTimeout(300);
  const r1 = await card.boundingBox();
  if (r1.height < r0.height + 80) fail.push(`not taller: ${Math.round(r0.height)} → ${Math.round(r1.height)}`);
  await page.mouse.move(r1.x + r1.width - 4, r1.y + 200); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(r1.x + r1.width - 4 - i * 40, r1.y + 200); await page.waitForTimeout(20); }
  await page.mouse.up(); await page.waitForTimeout(300);
  const r2 = await card.boundingBox();
  if (r2.width > r1.width - 200) fail.push(`not narrower: ${Math.round(r1.width)} → ${Math.round(r2.width)}`);
  out.push(`card: ${Math.round(r0.width)}×${Math.round(r0.height)} → ${Math.round(r2.width)}×${Math.round(r2.height)}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push('sideways scrolling after a resize');
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run({ exclude: [['[data-sonner-toaster]']] }, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`1440 axe ${b}`);
  // A reload keeps it.
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: /Copy link/ }).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  const kept = await order(page), r3 = await page.locator('#main section.panel').first().boundingBox();
  if (kept.join() !== after.join()) fail.push(`not kept after a reload: ${kept.join(' | ')}`);
  if (Math.abs(r3.width - r2.width) > 12 || Math.abs(r3.height - r2.height) > 12) fail.push(`size not kept: ${Math.round(r3.width)}×${Math.round(r3.height)}`);
  // "Put this page back", then Ctrl+Z brings the arrangement back, then back again.
  await back.first().click(); await page.waitForTimeout(500);
  const reset = await order(page), r4 = await page.locator('#main section.panel').first().boundingBox();
  if (reset.join() !== before.join() || Math.abs(r4.width - r0.width) > 12) fail.push(`"Put this page back" left: ${reset.join(' | ')}, ${Math.round(r4.width)} wide`);
  if (await back.count()) fail.push('"Put this page back" stays after it was used');
  await page.locator('body').click({ position: { x: 5, y: 400 } });
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
  if ((await order(page)).join() !== after.join()) fail.push('Ctrl+Z did not take the reset back');
  await back.first().click(); await page.waitForTimeout(300);
  await ctx.close();
}
{
  // A phone: a swipe still scrolls; a finger held on a number tile, then moved, carries it past the next one.
  const ctx = await signedIn(browser, B, 'demo@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`phone error: ${e.message.slice(0, 140)}`));
  await page.goto(B + '/student', { waitUntil: 'load', timeout: 240000 });
  await page.waitForTimeout(3500);
  const tiles = () => page.evaluate(() => { const t = [...document.querySelectorAll('#main *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Enrolled courses'); let c = t; while (c && !/(^| )grid( |$)/.test(c.parentElement?.className ?? '')) c = c.parentElement; if (!c) return null; c.scrollIntoView({ block: 'center' }); return [...c.parentElement.children].map((k) => { const r = k.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: k.textContent.replace(/[\d%]+/g, '').trim().slice(0, 12) }; }); });
  const t0 = await tiles(); await page.waitForTimeout(400);
  const t1 = await tiles();
  let n = 0;
  if (!t1 || t1.length < 2) fail.push('phone: the number tiles were not found');
  else {
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const [a, b] = t1;
    await touch('touchStart', a.x, a.y); await page.waitForTimeout(500);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12); await page.waitForTimeout(20); }
    await touch('touchEnd'); await page.waitForTimeout(600);
    const t2 = await page.evaluate(() => { const t = [...document.querySelectorAll('#main *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Enrolled courses'); let c = t; while (c && !/(^| )grid( |$)/.test(c.parentElement?.className ?? '')) c = c.parentElement; return [...c.parentElement.children].map((k) => Number(k.style.order) || 0); });
    n = t2.filter(Boolean).length;
    if (!n || t2[0] <= t2[1]) fail.push(`phone: holding and carrying a tile did not move it (orders ${t2.join(',')}; was ${t0?.map((x) => x.t).join(' | ')})`);
    await page.getByRole('button', { name: 'Put this page back' }).first().tap().catch(() => fail.push('phone: no "Put this page back"'));
    await page.waitForTimeout(300);
  }
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run({ exclude: [['[data-sonner-toaster]']] }, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`390 axe ${b}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push('phone: sideways scrolling');
  out.push(`phone: a held tile carried past its neighbour (${n} tiles placed)`);
  await ctx.close();
}
// Quick notes' own dividers (any time, no mode): the folders pane wider, the whole thing taller, kept
// after a reload, back with a double-click; then its panes change places in the mode. Frames while dragging.
{
  const ctx = await signedIn(browser, B, 'demo@student.com', { width: 1440, height: 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail.push(`error: ${e.message.slice(0, 140)}`));
  await page.goto(B + PAGE, { waitUntil: 'load', timeout: 240000 });
  const folders = page.locator('nav[aria-label="Folders"]');
  await folders.waitFor({ timeout: 60000 }); await page.waitForTimeout(1200);
  const pull = async (name, dx, dy) => {
    const h = page.getByRole('separator', { name });
    await h.scrollIntoViewIfNeeded();
    const b = await h.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + b.width / 2 + (dx * i) / 10, b.y + b.height / 2 + (dy * i) / 10); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(120);
  };
  const w0 = (await folders.boundingBox()).width;
  await pull('Folders width', 90, 0);
  const w1 = (await folders.boundingBox()).width;
  if (Math.abs(w1 - w0 - 90) > 4) fail.push(`folders pane: ${w0} -> ${w1}, expected +90`);
  const root = folders.locator('xpath=..');
  const h0 = (await root.boundingBox()).height;
  await pull('Quick notes height', 0, -120);
  const h1 = (await root.boundingBox()).height;
  if (Math.abs(h0 - h1 - 120) > 6) fail.push(`height: ${h0} -> ${h1}, expected -120`);
  await page.reload({ waitUntil: 'load' }); await folders.waitFor({ timeout: 60000 }); await page.waitForTimeout(1200);
  const w2 = (await folders.boundingBox()).width;
  if (Math.abs(w2 - w1) > 2) fail.push(`folders width after a reload: ${w2}, was ${w1}`);
  const sep = page.getByRole('separator', { name: 'Folders width' });
  await sep.focus(); await page.keyboard.press('ArrowRight');
  const w3 = (await folders.boundingBox()).width;
  if (Math.abs(w3 - w2 - 16) > 2) fail.push(`arrow key on the divider: ${w2} -> ${w3}`);
  await sep.dblclick(); await page.getByRole('separator', { name: 'Quick notes height' }).dblclick(); await page.waitForTimeout(150);
  const w4 = (await folders.boundingBox()).width;
  if (Math.abs(w4 - 180) > 2) fail.push(`double-click did not put the folders pane back: ${w4}`);
  out.push(`quick notes: folders ${Math.round(w0)} -> ${Math.round(w1)} px, height ${Math.round(h0)} -> ${Math.round(h1)} px, kept, back to ${Math.round(w4)}`);

  // The panes change places: the folders pane, held by its heading, dragged past the list.
  {
    await page.evaluate(() => { window.__gaps = []; let t = performance.now(); const f = (n) => { window.__gaps.push(n - t); t = n; window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
    const a = await folders.boundingBox();
    const list = page.locator('nav[aria-label="Folders"] + section');
    const b = await list.boundingBox();
    const grab = { x: a.x + a.width / 2, y: a.y + 250 };
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    for (let i = 1; i <= 40; i++) { await page.mouse.move(grab.x + ((b.x + b.width * 0.8 - grab.x) * i) / 40, grab.y - Math.abs(Math.sin(i / 4)) * 30); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(500);
    const gaps = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__gaps; });
    const slow = gaps.filter((g) => g > 34).length, worst = Math.max(...gaps);
    out.push(`dragging a pane: ${gaps.length} frames, ${slow} over 34 ms, worst ${Math.round(worst)} ms`);
    if (slow > 8) fail.push(`dragging a pane dropped ${slow} frames (worst ${Math.round(worst)} ms)`);
    const fx = (await folders.boundingBox()).x, lx = (await list.boundingBox()).x;
    if (!(fx > lx)) fail.push(`the folders pane did not move after the list (folders at ${Math.round(fx)}, list at ${Math.round(lx)})`);
    await page.getByRole('button', { name: 'Put this page back' }).first().click({ timeout: 5000 }).catch(() => fail.push('no "Put this page back" after moving a pane')); await page.waitForTimeout(400);
    const fx2 = (await folders.boundingBox()).x, lx2 = (await list.boundingBox()).x;
    if (!(fx2 < lx2)) fail.push('Reset did not put the panes back');
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 1));
process.exit(fail.length ? 1 : 0);
