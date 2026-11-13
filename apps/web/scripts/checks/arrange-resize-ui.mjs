// M168 (dev server or built Worker): resizing is smooth. On the student home, a number tile's right edge
// pulled across a column: mid-pull its width is where the hand is (to the pixel, not in steps), the
// tiles pushed aside glide (they don't jump), let go it eases to the columns it takes; frames counted.
// The Quick notes card's right edge: the same in a row (a share of it), and its bottom edge (a height in
// px). A double-click on the edge eases it back. Quick notes' divider sizes its pane while dragged.
// Undo and redo (Ctrl+Z, Ctrl+Shift+Z) glide things back and forth.
//   node scripts/checks/arrange-resize-ui.mjs [http://localhost:8787]
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const B = baseUrl();
const browser = await launch();
const out = [], fail = [];
const ctx = await signedIn(browser, B, 'demo@student.com', { width: 1440, height: 1000 });
await ctx.addInitScript(() => { if (!sessionStorage.getItem('rs-check')) { for (const k of Object.keys(localStorage)) if (k.startsWith('uv-arrange')) localStorage.removeItem(k); sessionStorage.setItem('rs-check', '1'); } });
const watch = (page) => page.evaluate(() => { window.__gaps = []; window.__anims = new Set(); let t = performance.now(); const f = (n) => { window.__gaps.push(n - t); t = n; for (const a of document.getAnimations()) if (a.id) window.__anims.add(a.id); window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
const stop = (page) => page.evaluate(() => { cancelAnimationFrame(window.__raf); const g = window.__gaps; return { n: g.length, slow: g.filter((x) => x > 34).length, worst: Math.round(Math.max(...g)), anims: [...window.__anims] }; });
const open = async (path, wait) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/Router action dispatched before initialization/.test(e.message)) fail.push(`${path} error: ${e.message.slice(0, 160)}`); });
  await page.goto(B + path, { waitUntil: 'load', timeout: 240000 });
  await page.locator(wait).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(2500);
  return page;
};

// ── A tile in a grid ──
{
  const page = await open('/student', '#main .kpi-row');
  const tile = page.locator('#main .kpi-row > *').nth(1);
  await tile.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(600);
  const t0 = await tile.boundingBox(), n0 = await page.locator('#main .kpi-row > *').nth(2).boundingBox();
  const x = t0.x + t0.width - 3, y = t0.y + t0.height / 2;
  await watch(page);
  await page.mouse.move(x, y); await page.mouse.down();
  const mids = [];
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(x + i * 7, y); await page.waitForTimeout(16);
    if (i % 10 === 0) mids.push({ want: t0.width + i * 7 - 0, got: (await tile.boundingBox()).width });
  }
  await page.mouse.up(); await page.waitForTimeout(80);
  const easing = await tile.evaluate((el) => el.getAnimations().some((a) => a.id === 'arr-size'));
  await page.waitForTimeout(500);
  const f = await stop(page);
  const t1 = await tile.boundingBox(), n1 = await page.locator('#main .kpi-row > *').nth(2).boundingBox();
  out.push(`grid tile: mid-pull widths ${mids.map((m) => `${Math.round(m.got)}/${Math.round(m.want)}`).join(', ')}; ${Math.round(t0.width)} → ${Math.round(t1.width)} px; neighbour ${Math.round(n0.x)} → ${Math.round(n1.x)}; animations ${f.anims.join(',')}; ${f.slow} of ${f.n} frames slow, worst ${f.worst} ms`);
  if (mids.some((m) => Math.abs(m.got - m.want) > 3)) fail.push(`the tile does not follow the hand: ${JSON.stringify(mids)}`);
  if (!easing) fail.push('the tile did not ease to its columns when let go');
  if (!(t1.width > t0.width * 1.5)) fail.push(`the tile did not take another column: ${t0.width} → ${t1.width}`);
  if (Math.abs(n1.x - n0.x) < 20) fail.push('the neighbour did not move aside');
  if (!f.anims.includes('arr')) fail.push('the neighbour jumped instead of gliding');
  if (f.worst > 250) fail.push(`a pause while resizing: ${f.worst} ms`);
  // Undo, redo: things glide.
  await page.locator('body').click({ position: { x: 5, y: 500 } });
  await watch(page);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  const u = await stop(page), tu = await tile.boundingBox();
  if (Math.abs(tu.width - t0.width) > 3) fail.push(`Ctrl+Z did not give the tile its width back: ${tu.width}`);
  if (!u.anims.includes('arr')) fail.push('undo did not glide');
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(600);
  const tr = await tile.boundingBox();
  if (Math.abs(tr.width - t1.width) > 3) fail.push(`Ctrl+Shift+Z did not make it wide again: ${tr.width}`);
  await page.getByRole('button', { name: 'Put this page back' }).first().click({ timeout: 8000 }).catch(() => fail.push('no "Put this page back"'));
  await page.waitForTimeout(600);
  await page.close();
}

// ── A card in a row, and its height ──
{
  const page = await open('/studio?tool=notes', 'nav[aria-label="Folders"]');
  const card = page.locator('#main section.panel').first();
  await card.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(600);
  const c0 = await card.boundingBox();
  let x = c0.x + c0.width - 3, y = c0.y + 300;
  await watch(page);
  await page.mouse.move(x, y); await page.mouse.down();
  const mids = [];
  for (let i = 1; i <= 30; i++) { await page.mouse.move(x - i * 9, y); await page.waitForTimeout(16); if (i % 10 === 0) mids.push({ want: c0.width - i * 9, got: (await card.boundingBox()).width }); }
  await page.mouse.up(); await page.waitForTimeout(600);
  const f = await stop(page), c1 = await card.boundingBox();
  out.push(`row card: mid-pull widths ${mids.map((m) => `${Math.round(m.got)}/${Math.round(m.want)}`).join(', ')}; ${Math.round(c0.width)} → ${Math.round(c1.width)} px; ${f.slow} of ${f.n} frames slow, worst ${f.worst} ms`);
  if (mids.some((m) => Math.abs(m.got - m.want) > 3)) fail.push(`the card does not follow the hand: ${JSON.stringify(mids)}`);
  if (Math.abs(c1.width - (c0.width - 270)) > 14) fail.push(`the card did not keep about the width it was let go at: ${c1.width}, wanted ~${c0.width - 270}`);
  if (f.worst > 250) fail.push(`a pause while resizing the card: ${f.worst} ms`);
  // Its bottom edge: a height to the pixel.
  const c2 = await card.boundingBox();
  if (c2.y + c2.height > 990) await page.evaluate((d) => scrollBy(0, d), c2.y + c2.height - 700);
  await page.waitForTimeout(500);
  const c3 = await card.boundingBox();
  x = c3.x + c3.width / 2; y = c3.y + c3.height - 3;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(x, y - i * 11); await page.waitForTimeout(16); }
  const mid = (await card.boundingBox()).height;
  await page.mouse.up(); await page.waitForTimeout(500);
  const c4 = await card.boundingBox();
  if (Math.abs(mid - (c3.height - 110)) > 3 || Math.abs(c4.height - (c3.height - 110)) > 3) fail.push(`the height does not follow the hand: mid ${mid}, after ${c4.height}, wanted ${c3.height - 110}`);
  // A double-click on that edge eases it back.
  await page.mouse.dblclick(x, c4.y + c4.height - 3); await page.waitForTimeout(80);
  const easing = await card.evaluate((el) => el.getAnimations().some((a) => a.id === 'arr-size'));
  await page.waitForTimeout(500);
  const c5 = await card.boundingBox();
  if (!easing) fail.push('the double-click did not ease the card back');
  if (Math.abs(c5.height - c3.height) > 3) fail.push(`the double-click did not give the height back: ${c5.height} vs ${c3.height}`);
  out.push(`card height: ${Math.round(c3.height)} → ${Math.round(c4.height)} → ${Math.round(c5.height)} (double-click)`);
  await page.getByRole('button', { name: 'Put this page back' }).first().click({ timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  // The divider: its pane follows while dragged; let go, the width is kept.
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400);
  const folders = page.locator('nav[aria-label="Folders"]'), sep = page.getByRole('separator', { name: 'Folders width' });
  const w0 = (await folders.boundingBox()).width, s = await sep.boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + 200); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(s.x + s.width / 2 + i * 10, s.y + 200); await page.waitForTimeout(16); }
  const wm = (await folders.boundingBox()).width;
  await page.mouse.up(); await page.waitForTimeout(400);
  const w1 = (await folders.boundingBox()).width;
  if (Math.abs(wm - (w0 + 80)) > 3 || Math.abs(w1 - (w0 + 80)) > 3) fail.push(`the divider: ${w0} → mid ${wm} → ${w1}, wanted ${w0 + 80}`);
  await sep.dblclick();
  await page.close();
}
await ctx.close();
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 1));
process.exit(fail.length ? 1 : 0);
