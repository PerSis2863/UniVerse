// M166 (dev server or built Worker): the rest of "arrange any page". A table's rows change places and keep
// their columns lined up with the header (grades); rows with lines between them keep one line between
// each (admin people); the side menu's entries move and stay after a reload; a number tile carried out of
// its row sits among the page's cards and goes back in; a double-click on a card's edge undoes its
// resize. Syncing: off by default (a second "device" sees nothing), turned on in Settings it shows there
// after a reload, a page put back on one is put back on the other, and turning it off stops it.
//   node scripts/checks/arrange-more-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const B = baseUrl();
const browser = await launch();
const out = [], fail = [];
const settle = (page, ms = 1500) => page.waitForTimeout(ms);
const drag = async (page, a, b, steps = 14) => {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(500);
};
const mid = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const axe = async (page, label) => {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run({ exclude: [['[data-sonner-toaster]']] }, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${label} axe ${b}`);
};
const back = (page) => page.getByRole('button', { name: 'Put this page back' }).first();
const open = async (ctx, path, wait) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/Router action dispatched before initialization/.test(e.message)) fail.push(`${path} error: ${e.message.slice(0, 140)}`); }); // (that one is the dev server's own, on a quick reload)
  await page.goto(B + path, { waitUntil: 'load', timeout: 240000 });
  if (wait) await page.locator(wait).first().waitFor({ timeout: 120000 });
  await settle(page, 2500);
  return page;
};

// ── A table's rows (the student's grades) ──
{
  const ctx = await signedIn(browser, B, 'demo@student.com', { width: 1440, height: 900 });
  const page = await open(ctx, '/student/grades', '#main tbody tr');
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#main tbody tr')].map((r) => ({ t: r.textContent.replace(/\s+/g, ' ').trim().slice(0, 90), y: Math.round(r.getBoundingClientRect().top), cells: [...r.cells].map((c) => Math.round(c.getBoundingClientRect().left)) })).sort((a, b) => a.y - b.y));
  const r0 = await rows();
  const head0 = await page.evaluate(() => [...document.querySelectorAll('#main thead th')].map((c) => Math.round(c.getBoundingClientRect().left)));
  // Held by the gap beside the words of its first cell (words themselves select).
  const cell = await page.locator('#main tbody tr').first().locator('td, th').last().boundingBox();
  const target = await page.locator('#main tbody tr').nth(2).boundingBox();
  await drag(page, { x: cell.x + cell.width - 6, y: cell.y + cell.height / 2 }, { x: cell.x + cell.width - 6, y: target.y + target.height * 0.7 });
  const r1 = await rows();
  out.push(`grades rows: ${r0.map((r) => r.t).join(' | ')}  →  ${r1.map((r) => r.t).join(' | ')}`);
  if (r1.map((r) => r.t).join() === r0.map((r) => r.t).join()) fail.push('the table row did not move');
  const head1 = await page.evaluate(() => [...document.querySelectorAll('#main thead th')].map((c) => Math.round(c.getBoundingClientRect().left)));
  if (r1.some((r) => r.cells.some((x, i) => Math.abs(x - head1[i]) > 2))) fail.push(`columns no longer line up with the header: ${JSON.stringify(head1)} vs ${JSON.stringify(r1[0].cells)}`);
  if (head1.some((x, i) => Math.abs(x - head0[i]) > 3)) fail.push(`the table's columns jumped: ${head0} → ${head1}`);
  if (await page.locator('#main table[role="table"] tbody[role="rowgroup"] tr[role="row"]').count() < 2) fail.push('the rearranged table lost its table roles');
  await axe(page, 'rearranged grades table');
  await page.reload({ waitUntil: 'load' }); await page.locator('#main tbody tr').first().waitFor({ timeout: 120000 }); await settle(page, 2500);
  if ((await rows()).map((r) => r.t).join() !== r1.map((r) => r.t).join()) fail.push('the rows were not kept after a reload');
  await back(page).click({ timeout: 8000 }).catch(() => fail.push('grades: no "Put this page back"')); await settle(page, 500);
  if ((await rows()).map((r) => r.t).join() !== r0.map((r) => r.t).join()) fail.push('the rows did not go back');
  if (await page.locator('#main table[data-arr-table]').count()) fail.push('the table stayed a grid after being put back');

  // ── The side menu ──
  const menu = () => page.evaluate(() => [...document.querySelectorAll('#side-nav > *')].filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim().slice(0, 5), y: e.getBoundingClientRect().top })).sort((a, b) => a.y - b.y).map((e) => e.t));
  const m0 = await menu();
  const items = page.locator('#side-nav > *');
  await drag(page, mid(await items.nth(1).boundingBox()), mid(await items.nth(4).boundingBox()));
  const m1 = await menu();
  out.push(`menu: ${m0.join(' | ')}  →  ${m1.join(' | ')}`);
  if (m1.join() === m0.join()) fail.push('the menu entry did not move');
  if (page.url() !== B + '/student/grades') fail.push(`moving a menu entry opened it (${page.url()})`);
  await page.reload({ waitUntil: 'load' }); await page.locator('#side-nav > *').first().waitFor(); await settle(page, 2500);
  if ((await menu()).join() !== m1.join()) fail.push('the menu was not kept after a reload');
  await back(page).click({ timeout: 8000 }).catch(() => fail.push('menu: no "Put this page back"')); await settle(page, 500);
  if ((await menu()).join() !== m0.join()) fail.push('the menu did not go back');
  // A plain click on an entry still opens it.
  await items.nth(1).click(); await page.waitForURL((u) => !u.pathname.endsWith('/student/grades'), { timeout: 60000 }).catch(() => fail.push('a click on a menu entry no longer opens it'));
  await page.close();

  // ── Out of its row and back (the student home's number tiles) ──
  const home = await open(ctx, '/student', '#main .kpi-row');
  const tile = home.locator('#main .kpi-row > *').first();
  await tile.scrollIntoViewIfNeeded();
  const where = () => home.evaluate(() => { const row = document.querySelector('#main .kpi-row'); const t = row.children[0]; const r = t.getBoundingClientRect(); const others = [...row.children].slice(1).map((k) => k.getBoundingClientRect()); return { open: row.dataset.arrOpen !== undefined, top: Math.round(r.top), width: Math.round(r.width), rowTop: Math.round(Math.min(...others.map((o) => o.top))), w2: Math.round(others[0].width) }; });
  const w0 = await where();
  // Up, out of the row, onto the card above it.
  const t0 = await tile.boundingBox();
  const above = await home.evaluate(() => { let row = document.querySelector('#main .kpi-row'); while (row.parentElement.children.length === 1) row = row.parentElement; let near = row.previousElementSibling; while (near && !near.offsetParent) near = near.previousElementSibling; let up = true; if (!near) { up = false; near = row.nextElementSibling; while (near && !near.offsetParent) near = near.nextElementSibling; } if (!near) return { none: row.parentElement.className.slice(0, 80) + ' / ' + row.parentElement.children.length }; const r = near.getBoundingClientRect(); return { up, x: r.x + r.width / 2, y: up ? r.y + Math.min(r.height / 2, 60) : Math.min(r.y + 40, innerHeight - 30) }; });
  if (above.none) fail.push(`the tiles row has no neighbour to carry a tile to: ${above.none}`);
  const outside = (w) => (above.up ? w.top < w.rowTop - 20 : w.top > w.rowTop + 20);
  // Frames: the same path with nothing held first (this page's own cost in the test browser), then carrying.
  const frames = async (press) => {
    await home.evaluate(() => { window.__gaps = []; let t = performance.now(); const f = (n) => { window.__gaps.push(n - t); t = n; window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
    if (press) await drag(home, { x: t0.x + t0.width / 2, y: t0.y + 14 }, above, 40);
    else { await home.mouse.move(t0.x + t0.width / 2, t0.y + 14); for (let i = 1; i <= 40; i++) { await home.mouse.move(t0.x + t0.width / 2 + ((above.x - t0.x - t0.width / 2) * i) / 40, t0.y + 14 + ((above.y - t0.y - 14) * i) / 40); await home.waitForTimeout(16); } await home.waitForTimeout(500); }
    const g = await home.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__gaps; });
    return { n: g.length, slow: g.filter((x) => x > 34).length, worst: Math.round(Math.max(...g)) };
  };
  const still = await frames(false), carry = await frames(true);
  out.push(`frames, mouse only: ${still.slow} of ${still.n} slow (worst ${still.worst} ms); carrying a tile out of its row: ${carry.slow} of ${carry.n} (worst ${carry.worst} ms)`);
  // (The test browser draws without a graphics chip and this page drops frames by itself, a different number each run:
  // what fails is a pause a person sees, as the 600 ms one on the drop that M166 removed, or mostly slow frames.)
  if (carry.worst > 250 || carry.slow > carry.n * 0.4) fail.push(`carrying a tile between groups is slower than the page itself: ${JSON.stringify({ still, carry })}`);
  const w1 = await where();
  out.push(`tile out of its row: row opened ${w1.open}, tile top ${w0.top} → ${w1.top} (the row's ${w1.rowTop}), widths ${w0.width}/${w0.w2} → ${w1.width}/${w1.w2}`);
  if (!w1.open) fail.push('the row did not open for a tile carried out of it');
  if (!outside(w1)) fail.push('the tile is not outside its old row');
  if (Math.abs(w1.w2 - w0.w2) > 10) fail.push(`the tiles left behind changed width: ${w0.w2} → ${w1.w2}`);
  await home.reload({ waitUntil: 'load' }); await home.locator('#main .kpi-row').waitFor({ timeout: 120000 }); await settle(home, 3000);
  const w2 = await where();
  if (!w2.open || !outside(w2)) fail.push(`the tile outside its row was not kept after a reload: ${JSON.stringify(w2)}`);
  // Back in among its row: the row closes again.
  await home.evaluate(() => { const t = document.querySelector('#main .kpi-row').children[0]; const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.contains(t)); const r = t.getBoundingClientRect(); (sc ?? document.scrollingElement).scrollTop += r.top - 120; }); await settle(home, 600);
  const t2 = await tile.boundingBox();
  // (The page moves under the hand as things make room: aim again at where the third tile is now, as a person does.)
  await home.mouse.move(t2.x + t2.width / 2, t2.y + 14); await home.mouse.down();
  let hand = { x: t2.x + t2.width / 2, y: t2.y + 14 };
  for (let round = 0; round < 4; round++) {
    const q = await home.locator('#main .kpi-row > *').nth(2).boundingBox();
    const aim = { x: q.x + q.width * 0.3, y: Math.min(q.y + q.height / 2, 800) }; // (above the bottom edge, where the page scrolls by itself)
    for (let i = 1; i <= 10; i++) { await home.mouse.move(hand.x + ((aim.x - hand.x) * i) / 10, hand.y + ((aim.y - hand.y) * i) / 10); await home.waitForTimeout(16); }
    hand = aim; await home.waitForTimeout(350);
  }
  await home.mouse.up(); await home.waitForTimeout(600);
  const w3 = await where();
  if (w3.open) fail.push('the row did not close when its tile came back');
  if (Math.abs(w3.top - w3.rowTop) > 4) fail.push(`the tile is not back in its row: ${JSON.stringify(w3)}`);
  // Ctrl+Z takes that move back (the tile is outside again); "Put this page back" makes it as it came.
  await home.locator('body').click({ position: { x: 5, y: 500 } });
  await home.keyboard.press('Control+z'); await settle(home, 500);
  const w4 = await where();
  if (!w4.open || !outside(w4)) fail.push(`Ctrl+Z did not take the move back: ${JSON.stringify(w4)}`);
  await back(home).click({ timeout: 8000 }).catch(() => fail.push('home: no "Put this page back"')); await settle(home, 500);
  const w5 = await where();
  if (w5.open || Math.abs(w5.width - w0.width) > 2 || Math.abs(w5.top - w5.rowTop) > 2) fail.push(`"Put this page back" left: ${JSON.stringify(w5)}`);
  if (await home.evaluate(() => !!document.querySelector('#main [data-arranged], #main [data-arr-open], #main [data-arr-fit]'))) fail.push('traces of the arrangement stay on the page after it was put back');
  if (await home.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push('sideways scrolling on the student home');

  // ── A double-click on an edge undoes a resize ──
  const card = home.locator('#main .kpi-row > *').nth(1);
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' })); await settle(home, 500);
  const c0 = await card.boundingBox();
  await drag(home, { x: c0.x + c0.width / 2, y: c0.y + c0.height - 3 }, { x: c0.x + c0.width / 2, y: c0.y + c0.height + 90 });
  const c1 = await card.boundingBox();
  if (c1.height < c0.height + 60) fail.push(`the tile did not get taller: ${c0.height} → ${c1.height}`);
  await home.mouse.dblclick(c1.x + c1.width / 2, c1.y + c1.height - 3); await settle(home, 500);
  const c2 = await card.boundingBox();
  if (Math.abs(c2.height - c0.height) > 3) fail.push(`a double-click on the edge did not undo the resize: ${c2.height}`);
  out.push(`tile height: ${Math.round(c0.height)} → ${Math.round(c1.height)} → ${Math.round(c2.height)}`);
  await ctx.close();
}

// ── Rows with lines between them (the admin's people) ──
{
  const ctx = await signedIn(browser, B, 'demo@admin.com', { width: 1440, height: 900 });
  const page = await open(ctx, '/admin/users', '#main tbody tr');
  const lines = () => page.evaluate(() => [...document.querySelectorAll('#main tbody tr')].filter((r) => r.offsetParent).map((r) => ({ y: r.getBoundingClientRect().top, line: parseFloat(getComputedStyle(r).borderTopWidth) + parseFloat(getComputedStyle(r).borderBottomWidth) })).sort((a, b) => a.y - b.y).map((r) => r.line));
  const l0 = await lines();
  const first = await page.locator('#main tbody tr').first().boundingBox(), third = await page.locator('#main tbody tr').nth(3).boundingBox();
  await drag(page, { x: first.x + first.width - 8, y: first.y + first.height / 2 }, { x: first.x + first.width - 8, y: third.y + third.height * 0.7 });
  const l1 = await lines();
  out.push(`lines above the people rows: ${l0.join(',')}  →  ${l1.join(',')}`);
  if (await back(page).count() === 0) fail.push('the people row did not move');
  else if (l1.join() !== l0.join()) fail.push(`the lines between rows are wrong after a move: ${l1.join(',')}`);
  await back(page).click({ timeout: 8000 }).catch(() => undefined);
  await ctx.close();
}

// ── Two devices ──
{
  const a = await signedIn(browser, B, 'bob@student.com', { width: 1440, height: 900 });
  const b = await signedIn(browser, B, 'bob@student.com', { width: 1280, height: 800 });
  const api = (ctx, method, body) => ctx.request.fetch(B + '/api/core/arrange', { method, headers: { Authorization: 'Bearer mock-token-bob@student.com', 'Content-Type': 'application/json' }, data: body });
  await api(a, 'DELETE');
  const menuOf = (page) => page.evaluate(() => [...document.querySelectorAll('#side-nav > *')].filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim().slice(0, 5), y: e.getBoundingClientRect().top })).sort((x, y) => x.y - y.y).map((e) => e.t));
  const pa = await open(a, '/student', '#side-nav > *');
  const m0 = await menuOf(pa);
  const items = pa.locator('#side-nav > *');
  await drag(pa, mid(await items.nth(0).boundingBox()), mid(await items.nth(2).boundingBox()));
  const m1 = await menuOf(pa);
  if (m1.join() === m0.join()) fail.push('sync: the menu entry did not move on the first device');
  await settle(pa, 2500);
  // Off by default: the other device knows nothing.
  const pb = await open(b, '/student', '#side-nav > *');
  if ((await menuOf(pb)).join() !== m0.join()) fail.push('sync is off, yet the second device shows the arrangement');
  // On, in Settings, on the first device.
  await pa.goto(B + '/student/settings?section=appearance&setting=arrange-sync', { waitUntil: 'load' });
  const sw = pa.getByRole('switch', { name: 'Use my arrangement on my other devices' });
  await sw.scrollIntoViewIfNeeded({ timeout: 120000 }).catch(() => fail.push('the sync switch is not in Settings'));
  if (await sw.getAttribute('aria-checked') === 'true') fail.push('the sync switch starts on');
  await sw.click(); await settle(pa, 2500);
  if (await sw.getAttribute('aria-checked') !== 'true') fail.push('the sync switch did not turn on');
  await axe(pa, 'settings with sync on');
  await pb.reload({ waitUntil: 'load' }); await pb.locator('#side-nav > *').first().waitFor();
  // (The dev server may take a while over a route it serves for the first time.)
  const until = async (page, want) => { for (let i = 0; i < 40; i++) { if ((await menuOf(page)).join() === want.join()) return true; await page.waitForTimeout(500); } return false; };
  await until(pb, m1);
  const mb = await menuOf(pb);
  out.push(`second device after sync: ${mb.join(' | ')}`);
  if (mb.join() !== m1.join()) fail.push(`the second device does not show the first one's menu: ${mb.join(' | ')}`);
  // Put back on the second device: the first follows (when it next asks: here, a reload).
  await back(pb).click({ timeout: 8000 }).catch(() => fail.push('sync: no "Put this page back" on the second device')); await settle(pb, 3000);
  await pa.goto(B + '/student', { waitUntil: 'load' }); await pa.locator('#side-nav > *').first().waitFor();
  if (!(await until(pa, m0))) fail.push('a page put back on one device was not put back on the other');
  // Signed out: nothing.
  const anon = await a.request.fetch(B + '/api/core/arrange');
  if (anon.status() !== 401) fail.push(`signed out: ${anon.status()}`);
  // Off again: the account's copy is gone.
  const offR = await api(a, 'DELETE'); const got = await (await api(a, 'GET')).json();
  if (!offR.ok() || got.sync !== false || got.doc !== null) fail.push(`turning sync off: ${JSON.stringify(got).slice(0, 120)}`);
  await a.close(); await b.close();
}
// ── A phone: Quick notes' grab bar keeps the list above an open note; widths chosen on a computer wait ──
{
  const ctx = await signedIn(browser, B, 'demo@student.com', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  const page = await open(ctx, '/studio?tool=notes', 'text=Write a note');
  await page.getByRole('button', { name: 'Write a note' }).first().tap(); await settle(page, 1200);
  const bar = page.getByRole('separator', { name: 'Notes list height' });
  if (!(await bar.count())) fail.push('phone: no grab bar between the list and the open note');
  else {
    const list = page.locator('section[aria-label="All notes"]');
    if (await list.isVisible()) fail.push('phone: the list shows above the note before the bar is pulled');
    await bar.scrollIntoViewIfNeeded();
    const q = await bar.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', q.x + q.width / 2, q.y + q.height / 2);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', q.x + q.width / 2, q.y + q.height / 2 + i * 20); await page.waitForTimeout(20); }
    await touch('touchEnd'); await settle(page, 500);
    const h = (await list.boundingBox())?.height ?? 0;
    out.push(`phone: the notes list above the open note is ${Math.round(h)} px after pulling the bar 200`);
    if (Math.abs(h - 200) > 12) fail.push(`phone: the list is ${h} px tall after pulling the bar down 200`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail.push('phone: sideways scrolling in Quick notes');
  }
  // A width chosen on a computer isn't used on a one-column phone (the order is).
  const meId = (await (await ctx.request.fetch(B + '/api/core/users/me', { headers: { Authorization: 'Bearer mock-token-demo@student.com' } })).json()).id;
  await page.evaluate((id) => { const k = 'uv-arrange:' + id; localStorage.setItem(k, JSON.stringify({ store: { '/student': [{ order: ['Your day', 'Up next'], sizes: { 'Up next': { pct: 50 } } }] }, at: { '/student': Date.now() } })); }, meId);
  await page.goto(B + '/student', { waitUntil: 'load' }); await settle(page, 4500);
  const got = await page.evaluate(() => { const find = (t) => [...document.querySelectorAll('#main h2, #main h3')].find((h) => h.textContent.trim() === t)?.closest('[class*="rounded"]'); const a = find('Up next'), b = find('Your day'); return a && b ? { w: Math.round(a.getBoundingClientRect().width), full: Math.round(a.parentElement.getBoundingClientRect().width), dayFirst: b.getBoundingClientRect().top < a.getBoundingClientRect().top } : null; });
  if (!got) out.push('phone: the two cards for the width test were not found (skipped)');
  else { out.push(`phone: "Up next" ${got.w} of ${got.full} px wide, "Your day" first: ${got.dayFirst}`); if (got.w < got.full - 4) fail.push('phone: a width chosen on a computer narrowed a card on a phone'); if (!got.dayFirst) fail.push('phone: the order chosen on a computer is not used on the phone'); }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 1));
process.exit(fail.length ? 1 : 0);
