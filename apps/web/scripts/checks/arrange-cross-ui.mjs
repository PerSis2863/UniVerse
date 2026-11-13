// M167 (dev server or built Worker): the last of "arrange any page".
// - The side menu and the page: a menu entry dragged onto the page becomes a shortcut there (the menu
//   keeps it, nothing opens); a link dragged from the page onto the menu becomes an entry at the height
//   it was dropped (the page keeps it); a shortcut dragged back to the menu entry it came from goes away;
//   × removes one; kept after a reload.
// - Inside a card: a button carried over the Quick notes card and held still goes inside it (the card
//   makes room, keeps its look), still works, is kept after a reload, and comes back out to its row.
// - A table (the student's grades): a column carried by its heading, and one carried sideways from a cell,
//   move with every cell under its heading; the header carried down goes under the rows; kept after a
//   reload; put back. Axe on the rearranged table and the card; frames while carrying a column.
//   node scripts/checks/arrange-cross-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const B = baseUrl();
const browser = await launch();
const out = [], fail = [];
const settle = (page, ms = 1500) => page.waitForTimeout(ms);
const mid = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const drag = async (page, a, b, { steps = 16, rest = 0 } = {}) => {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps); await page.waitForTimeout(16); }
  if (rest) { await page.mouse.move(b.x + 1, b.y + 1); await page.waitForTimeout(rest); }
  await page.mouse.up(); await page.waitForTimeout(600);
};
const axe = async (page, label) => {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run({ exclude: [['[data-sonner-toaster]']] }, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${label} axe ${b}`);
};
const back = (page) => page.getByRole('button', { name: 'Put this page back' }).first();
const open = async (ctx, path, wait) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/Router action dispatched before initialization/.test(e.message)) fail.push(`${path} error: ${e.message.slice(0, 160)}`); });
  await page.goto(B + path, { waitUntil: 'load', timeout: 240000 });
  if (wait) await page.locator(wait).first().waitFor({ timeout: 120000 });
  await settle(page, 2500);
  return page;
};

const ctx = await signedIn(browser, B, 'demo@student.com', { width: 1440, height: 900 });
// A clean start: nothing arranged, no shortcuts.
await ctx.addInitScript(() => { if (!sessionStorage.getItem('arr-check')) { for (const k of Object.keys(localStorage)) if (k.startsWith('uv-arrange')) localStorage.removeItem(k); sessionStorage.setItem('arr-check', '1'); } });

// ── The side menu and the page ──
{
  const page = await open(ctx, '/student', '#main .kpi-row');
  const menuLink = (text) => page.locator('#side-nav > a', { hasText: text }).first();
  const href = await menuLink('Messages').getAttribute('href');
  // Menu → page.
  await drag(page, mid(await menuLink('Messages').boundingBox()), { x: 800, y: 420 }, { steps: 24 });
  const chip = page.locator(`[data-page-pins] [data-pin="${href}"]`);
  if (!(await chip.count())) fail.push('a menu entry dragged onto the page made no shortcut there');
  if (!page.url().endsWith('/student')) fail.push(`dragging a menu entry opened it: ${page.url()}`);
  if (!(await menuLink('Messages').count())) fail.push('the menu lost the entry dragged onto the page');
  // Page → menu, dropped between "Collaborate" and "My records"'s neighbours.
  const grades = page.locator('#main a[href="/student/grades"]').first();
  await grades.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await settle(page, 1200);
  const c = await menuLink('Collaborate').boundingBox();
  await drag(page, mid(await grades.boundingBox()), { x: c.x + c.width / 2, y: c.y + c.height + 2 }, { steps: 30 });
  const pin = page.locator('#side-nav [data-pin="/student/grades"]');
  if (!(await pin.count())) fail.push('a link dragged onto the side menu made no entry there');
  else {
    const order = await page.evaluate(() => [...document.querySelectorAll('#side-nav > *')].filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim().slice(0, 12), y: e.getBoundingClientRect().top })).sort((a, b) => a.y - b.y).map((e) => e.t));
    out.push(`menu after the drop: ${order.join(' | ')}`);
    const i = order.findIndex((t) => t.startsWith('Grades')), j = order.findIndex((t) => t.startsWith('Collaborate'));
    if (i !== j + 1) fail.push(`the new menu entry is not where it was dropped (after Collaborate): ${order.join(' | ')}`);
  }
  if (!(await page.locator('#main a[href="/student/grades"]').count())) fail.push('the page lost the link dragged onto the menu');
  // Kept after a reload.
  await page.reload({ waitUntil: 'load' }); await page.locator('#main .kpi-row').waitFor({ timeout: 120000 }); await settle(page, 2500);
  if (!(await chip.count()) || !(await pin.count())) fail.push('the shortcuts were not kept after a reload');
  await axe(page, 'student home with shortcuts');
  // The chip dragged back to the menu, which already lists Messages: the chip just goes.
  if (await chip.count()) await drag(page, mid(await chip.boundingBox()), mid(await menuLink('Home').boundingBox()), { steps: 24 });
  if (await chip.count()) fail.push('the shortcut dragged back to its menu entry is still on the page');
  if (await page.locator(`#side-nav [data-pin="${href}"]`).count()) fail.push('the menu lists Messages twice');
  // × removes the menu one.
  if (await pin.count()) {
    await pin.hover(); await page.getByRole('button', { name: /Remove the shortcut Grades/ }).click(); await settle(page, 500);
    if (await pin.count()) fail.push('× did not remove the menu shortcut');
  }
  out.push('menu ↔ page: a shortcut each way, kept, taken back, removed');
  await page.close();
}

// ── Inside a card ──
{
  const page = await open(ctx, '/studio?tool=notes', 'nav[aria-label="Folders"]');
  // (Tall enough for the card and the toolbar above it: the button sits at the card's foot.)
  await page.setViewportSize({ width: 1440, height: 1150 }); await settle(page, 600);
  const copy = page.getByRole('button', { name: /Copy link/ }).first();
  const card = page.locator('#main section.panel').first();
  const pad0 = await card.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  const cb = await card.boundingBox();
  await drag(page, mid(await copy.boundingBox()), { x: cb.x + cb.width / 2, y: cb.y + 160 }, { steps: 24, rest: 700 });
  const inside = async () => { const b = await copy.boundingBox(), k = await card.boundingBox(); return !!b && !!k && b.x >= k.x - 1 && b.x + b.width <= k.x + k.width + 1 && b.y >= k.y && b.y + b.height <= k.y + k.height + 1 && b.y > k.y + k.height - 120; };
  const pad1 = await card.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  out.push(`inside a card: card padding ${pad0} → ${pad1} px; the button at its foot: ${await inside()}`);
  if (!(await inside())) fail.push('the button held over the card did not go inside it');
  if (pad1 < pad0 + 20) fail.push('the card did not make room for the button');
  if (!(await card.evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'))) fail.push('the card lost its look');
  await copy.click(); await settle(page, 500);
  if (!(await page.locator('[data-sonner-toast]').count())) fail.push('the button inside the card no longer works');
  await axe(page, 'a button inside the card');
  await page.reload({ waitUntil: 'load' }); await page.locator('nav[aria-label="Folders"]').waitFor({ timeout: 120000 }); await settle(page, 3000);
  if (!(await inside())) fail.push('the button inside the card was not kept after a reload');
  // Out again, onto the "Share" button in its old row.
  const share = page.getByRole('button', { name: /^Share$/ }).first();
  await drag(page, mid(await copy.boundingBox()), mid(await share.boundingBox()), { steps: 24 });
  if (await inside()) fail.push('the button did not come out of the card');
  const pad2 = await card.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  if (Math.abs(pad2 - pad0) > 1) fail.push(`the card kept its room after the button left: ${pad2}`);
  if (await back(page).count()) { await back(page).click(); await settle(page, 400); }
  await page.close();
}

// ── A table ──
{
  const page = await open(ctx, '/student/grades', '#main tbody tr');
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#main thead th')].map((t) => ({ t: t.textContent.trim(), x: Math.round(t.getBoundingClientRect().left) })).sort((a, b) => a.x - b.x));
  const lined = () => page.evaluate(() => {
    const hx = [...document.querySelectorAll('#main thead th')].map((t) => Math.round(t.getBoundingClientRect().left));
    return [...document.querySelectorAll('#main tbody tr')].every((r) => [...r.children].every((c, i) => Math.abs(Math.round(c.getBoundingClientRect().left) - hx[i]) <= 2));
  });
  const h0 = await heads();
  const th = (t) => page.locator('#main thead th', { hasText: t }).first();
  // "Score" carried by its heading onto "Graded", with frames counted.
  await page.evaluate(() => { window.__gaps = []; let t = performance.now(); const f = (n) => { window.__gaps.push(n - t); t = n; window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
  const sb = await th('Score').boundingBox(), gb = await th('Graded').boundingBox();
  await drag(page, mid(sb), { x: gb.x + gb.width * 0.4, y: sb.y + sb.height / 2 + 3 }, { steps: 30 });
  const gaps = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__gaps; });
  const h1 = await heads();
  out.push(`columns: ${h0.map((h) => h.t).join(' | ')}  →  ${h1.map((h) => h.t).join(' | ')}; frames ${gaps.filter((g) => g > 34).length} of ${gaps.length} slow, worst ${Math.round(Math.max(...gaps))} ms`);
  if (h1.findIndex((h) => h.t === 'Score') >= h1.findIndex((h) => h.t === 'Graded')) fail.push('the Score column did not move before Graded');
  if (!(await lined())) fail.push('the cells are not under their headings after a column moved');
  if (Math.max(...gaps) > 250) fail.push(`a pause while carrying a column: ${Math.round(Math.max(...gaps))} ms`);
  // Sideways from a cell: the Grade column to the front.
  const cell = page.locator('#main tbody tr').first().locator('td').nth(3);
  const cb = await cell.boundingBox(), first = await page.locator('#main tbody tr').first().locator('td').first().boundingBox();
  await drag(page, { x: cb.x + cb.width - 6, y: cb.y + cb.height / 2 }, { x: first.x + 20, y: cb.y + cb.height / 2 + 4 }, { steps: 30 });
  const h2 = await heads();
  if (h2[0].t !== 'Grade') fail.push(`carried sideways from a cell, the Grade column is not first: ${h2.map((h) => h.t).join(' | ')}`);
  if (!(await lined())) fail.push('the cells are not under their headings after a column moved from a cell');
  // The header carried down under the rows.
  const hb = await th('Course').boundingBox(), last = await page.locator('#main tbody tr').last().boundingBox();
  await drag(page, { x: hb.x + 30, y: hb.y + hb.height / 2 }, { x: hb.x + 34, y: last.y + last.height * 0.8 }, { steps: 30 });
  const under = await page.evaluate(() => document.querySelector('#main thead').getBoundingClientRect().top > document.querySelector('#main tbody').getBoundingClientRect().top);
  if (!under) fail.push('the header carried down did not go under the rows');
  await axe(page, 'the rearranged grades table');
  await page.reload({ waitUntil: 'load' }); await page.locator('#main tbody tr').first().waitFor({ timeout: 120000 }); await settle(page, 3000);
  const h3 = await heads();
  if (h3.map((h) => h.t).join() !== h2.map((h) => h.t).join()) fail.push(`the column order was not kept after a reload: ${h3.map((h) => h.t).join(' | ')}`);
  if (!(await lined())) fail.push('after a reload the cells are not under their headings');
  if (!(await page.evaluate(() => document.querySelector('#main thead').getBoundingClientRect().top > document.querySelector('#main tbody').getBoundingClientRect().top))) fail.push('the header under the rows was not kept after a reload');
  out.push(`after a reload: ${h3.map((h) => h.t).join(' | ')}, header under the rows`);
  await back(page).click({ timeout: 8000 }).catch(() => fail.push('grades: no "Put this page back"')); await settle(page, 500);
  if ((await heads()).map((h) => h.t).join() !== h0.map((h) => h.t).join()) fail.push('the columns did not go back');
  if (await page.evaluate(() => !!document.querySelector('#main [data-arr-table]') || [...document.querySelectorAll('#main th, #main td')].some((c) => c.style.order))) fail.push('traces of the arrangement stay on the table');
  await page.close();
}
await ctx.close();

// ── A phone: shortcuts show above the page and in the menu; axe; no sideways scrolling ──
{
  const phone = await signedIn(browser, B, 'demo@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  const id = (await (await phone.request.fetch(B + '/api/core/users/me', { headers: { Authorization: 'Bearer mock-token-demo@student.com' } })).json()).id;
  await phone.addInitScript((uid) => localStorage.setItem(`uv-arrange:${uid}`, JSON.stringify({ store: {}, at: { '/~pins/student': Date.now() }, pins: { '/~pins/student': [{ href: '/student/grades', label: 'Grades' }, { href: '/student/courses', label: 'My courses' }], '/~pins/menu': [{ href: '/student/attendance', label: 'Attendance' }] } })), id);
  const page = await open(phone, '/student', '#main .kpi-row');
  if (await page.locator('[data-page-pins] [data-pin]').count() !== 2) fail.push('phone: the page shortcuts are not shown');
  await axe(page, 'phone with shortcuts');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push('phone: sideways scrolling with shortcuts');
  out.push('phone: shortcuts shown, axe clean');
  await phone.close();
}
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 1));
process.exit(fail.length ? 1 : 0);
