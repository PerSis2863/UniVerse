// M72 in the browser (dev server with demo login, or `pnpm local:serve`): Collaborate → Create's list
// (search, star, recent, Esc back to the same scroll spot) and the 30 bigger tools, each opened by
// address with a quick use of the main ones. Axe (serious/critical) inside the page at 1280 dark and
// 390 light, no sideways scrolling, no page errors.
//   node scripts/checks/create-tools-ui.mjs [http://localhost:3000]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };
const TOOLS = ['mindmap', 'outline', 'stickies', 'gantt', 'timetable', 'habits', 'decide', 'flow', 'cards', 'gpa', 'studyplan', 'rubric', 'wordsearch', 'certificate', 'wheel', 'noise', 'graph', 'stats', 'explore', 'budget', 'invoice', 'zones', 'cv', 'cloud', 'prompter', 'playground', 'barcode', 'redact', 'slideshow', 'signature'];

async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document.querySelector('main') ?? document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${what}: sideways scrolling`);
}

const browser = await launch();
try {
  for (const [scheme, viewport] of [['dark', { width: 1280, height: 900 }], ['light', { width: 390, height: 844 }]]) {
    const ctx = await signedIn(browser, base, 'demo@student.com', viewport, { colorScheme: scheme });
    await ctx.addInitScript((s) => { try { localStorage.setItem('theme', s); for (const k of Object.keys(localStorage)) if (k.startsWith('uv-create')) localStorage.removeItem(k); } catch { /* a sandboxed frame */ } }, scheme);
    const page = await ctx.newPage();
    const errors = [];
    // The helper's init scripts also run inside sandboxed previews (no storage there): not the app.
    page.on('pageerror', (e) => !/sandboxed and lacks/.test(e.message) && errors.push(`${e.message.slice(0, 160)} @ ${page.url().replace(base, '')}`));

    // The list: search, Enter opens the first, star, recent, Esc back to the same spot.
    await page.goto(`${base}/studio`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const search = page.getByRole('searchbox');
    await search.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(800);
    await axe(page, `${scheme} list`);
    await search.fill('flash');
    await page.waitForTimeout(400);
    check((await page.getByRole('status').filter({ hasText: /1 tool/ }).count()) === 1, `${scheme}: search finds Flashcards alone`);
    await search.press('Enter');
    await page.waitForURL(/tool=cards/, { timeout: 30_000 });
    await page.getByRole('heading', { name: 'Flashcards' }).waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Star/ }).first().click();
    await page.keyboard.press('Escape');
    await page.waitForURL((u) => !u.search.includes('tool='), { timeout: 30_000 });
    await page.getByRole('region', { name: 'Starred' }).waitFor({ timeout: 10_000 });
    check(await page.getByRole('region', { name: 'Starred' }).getByText('Flashcards').isVisible(), `${scheme}: starred shelf shows Flashcards`);
    // Scroll down, open a tool, come back: the list is where it was.
    const scroller = page.locator('div.overflow-y-auto').filter({ has: page.getByRole('searchbox') }).first();
    await scroller.evaluate((el) => { el.scrollTop = 1400; });
    await page.waitForTimeout(300);
    const before = await scroller.evaluate((el) => el.scrollTop);
    await page.locator('#g-code button').first().click();
    await page.waitForURL(/tool=/, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.goBack();
    await page.getByRole('searchbox').waitFor();
    await page.waitForTimeout(600);
    const after = await page.locator('div.overflow-y-auto').filter({ has: page.getByRole('searchbox') }).first().evaluate((el) => el.scrollTop);
    check(Math.abs(after - before) < 40, `${scheme}: back keeps the scroll spot (${before} → ${after})`);

    for (const id of TOOLS) {
      await page.goto(`${base}/studio?tool=${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      try { await page.locator('#tool-title').waitFor({ timeout: 60_000 }); } catch { fail.push(`${scheme} ${id}: didn't open`); continue; }
      await page.waitForTimeout(900);
      if (id === 'mindmap') { await page.getByRole('application').focus(); await page.keyboard.press('Tab'); await page.waitForTimeout(400); check((await page.locator('svg g text').filter({ hasText: 'New idea' }).count()) === 1, `${scheme}: Tab adds an idea`); }
      if (id === 'cards') { await page.getByRole('button', { name: /^Question/ }).click(); await page.waitForTimeout(500); await page.getByRole('button', { name: /I knew it/ }).click(); await page.waitForTimeout(300); check(await page.getByText(/to go/).isVisible(), `${scheme}: a flashcard can be answered`); }
      if (id === 'stats') check((await page.locator('dd').filter({ hasText: /^15$/ }).count()) >= 1, `${scheme}: stats show a median`);
      if (id === 'playground') { await page.waitForTimeout(1500); check((await page.getByRole('log').innerText()).includes('Running'), `${scheme}: the playground runs and logs`); }
      if (id === 'graph') { const r = await page.locator('canvas').first().evaluate((c) => c.width > 0); check(r, `${scheme}: the graph draws`); }
      if (id === 'outline') { const first = page.getByRole('textbox', { name: /Line 2/ }); await first.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); check((await page.getByRole('textbox', { name: /^Line \d/ }).count()) === 5, `${scheme}: Enter adds an outline line`); }
      if (id === 'barcode') check((await page.locator('svg[aria-label^="Barcode"] rect').count()) > 20, `${scheme}: a barcode draws`);
      if (id === 'flow') check((await page.locator('svg[aria-label^="Flowchart"] rect').count()) === 5, `${scheme}: the flowchart has 5 steps`);
      await axe(page, `${scheme} ${id}`);
    }
    check(!errors.length, `${scheme}: page errors ${[...new Set(errors)].slice(0, 6).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ Create: list and 30 tools');
process.exit(fail.length ? 1 : 0);
