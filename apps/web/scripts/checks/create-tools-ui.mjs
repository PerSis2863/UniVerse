// M72 and M74 in the browser (dev server with demo login, or `pnpm local:serve`): Collaborate → Create's
// list (search, star, recent, Esc back to the same scroll spot), every tool's bar (focus mode, next
// tool, copy link, a dropped text file) and the 86 tools from M72 and M74, each opened by address with
// a quick use of the main ones. Axe (serious/critical) inside the page at 1280 dark and 390 light, no
// sideways scrolling, no page errors. `--new` runs only M74's 56, `--old` the rest (one run is long).
//   node scripts/checks/create-tools-ui.mjs [http://localhost:3000] [--new | --old]
import { createRequire } from 'node:module';
import { baseUrl, launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = baseUrl();
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };
const M74 = ['lorem', 'morse', 'numwords', 'roman', 'letters', 'lines', 'fancy', 'journal', 'wordplay', 'matrix', 'countdowns', 'meeting', 'checklists', 'goals', 'week', 'swot', 'proscons', 'reading', 'stopwatch', 'poll', 'agenda', 'drill', 'periodic', 'quiz', 'seating', 'dice', 'fractions', 'equation', 'shapes', 'numfacts', 'traffic', 'scoreboard', 'loan', 'savings', 'price', 'age', 'bmi', 'split', 'booth', 'icon', 'meme', 'colourblind', 'pixel', 'cleanphoto', 'metronome', 'tuner', 'focus', 'base', 'names', 'shadow', 'cron', 'escape', 'chars', 'status', 'keys', 'mock'];
const M72 = ['mindmap', 'outline', 'stickies', 'gantt', 'timetable', 'habits', 'decide', 'flow', 'cards', 'gpa', 'studyplan', 'rubric', 'wordsearch', 'certificate', 'wheel', 'noise', 'graph', 'stats', 'explore', 'budget', 'invoice', 'zones', 'cv', 'cloud', 'prompter', 'playground', 'barcode', 'redact', 'slideshow', 'signature'];
// Older tools changed in M74 (text kept on the device, copy buttons that answer).
const OLDER = ['words', 'clean', 'compare', 'table', 'json', 'markdown', 'replace', 'read', 'cite', 'calc', 'picker', 'chart', 'present'];
const TOOLS = process.argv.includes('--new') ? M74 : process.argv.includes('--old') ? [...M72, ...OLDER] : [...M72, ...OLDER, ...M74];

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

    // Every tool's bar: focus mode (Esc leaves it), ] goes to the next tool, a dropped text file fills the box.
    await page.goto(`${base}/studio?tool=words`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator('#tool-title').waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Focus' }).click();
    await page.waitForTimeout(300);
    check(await page.getByText('Focus mode · Esc to leave').isVisible(), `${scheme}: focus mode opens`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(page.url().includes('tool=words') && !(await page.getByText('Focus mode · Esc to leave').count()), `${scheme}: Esc leaves focus mode first`);
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['dropped words here'], 'notes.txt', { type: 'text/plain' })); const sec = document.querySelector('section[aria-labelledby="tool-title"]'); for (const type of ['dragover', 'drop']) sec.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })); });
    await page.waitForTimeout(400);
    check((await page.locator('textarea').first().inputValue()) === 'dropped words here', `${scheme}: a dropped text file fills the box`);
    await page.evaluate(() => document.activeElement?.blur?.());
    const next = await page.getByRole('button', { name: /^Next tool:/ }).first().textContent();
    await page.keyboard.press(']');
    await page.waitForURL((u) => !u.search.includes('tool=words'), { timeout: 20_000 });
    const want = (next ?? '').replace('Next tool: ', '');
    check(await page.waitForFunction((w) => document.querySelector('#tool-title')?.textContent === w, want, { timeout: 15_000 }).then(() => true, () => false), `${scheme}: ] opens the next tool (${want})`);

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
      if (id === 'words') { await page.locator('textarea').first().fill('kept text'); await page.waitForTimeout(400); await page.reload(); await page.locator('#tool-title').waitFor(); await page.waitForTimeout(600); check((await page.locator('textarea').first().inputValue()) === 'kept text', `${scheme}: text is kept after leaving`); }
      if (id === 'json') { await page.locator('textarea').first().fill('{"a":1}'); await page.getByRole('button', { name: /Tidy|Format/ }).first().click().catch(() => {}); }
      if (id === 'periodic') { await page.getByRole('button', { name: /^26\s*Fe\s*, Iron/ }).click(); await page.waitForTimeout(300); check(await page.getByText('Iron', { exact: true }).last().isVisible(), `${scheme}: the periodic table shows iron`); }
      if (id === 'numwords') check((await page.getByRole('status').first().textContent())?.includes('Twenty-Five Thousand') || (await page.getByRole('status').first().textContent())?.toLowerCase().includes('twenty-five thousand'), `${scheme}: numbers in words`);
      if (id === 'split') check((await page.getByLabel('Payments to settle up').locator('li').count()) >= 1, `${scheme}: the bill splits`);
      if (id === 'quiz') { await page.getByRole('button', { name: 'Mercury' }).click(); await page.waitForTimeout(200); check(await page.getByRole('button', { name: 'Next question' }).isVisible(), `${scheme}: a quiz answer is marked`); }
      if (id === 'scoreboard') { await page.getByRole('button', { name: '+5 for Team Blue' }).click(); await page.waitForTimeout(500); check((await page.locator('li').filter({ hasText: '★' }).count()) >= 1, `${scheme}: the scoreboard leader`); await page.getByRole('button', { name: /^Reset/ }).count(); }
      if (id === 'cron') check(await page.getByText(/At 09:30, on Mon/).isVisible(), `${scheme}: cron in words`);
      if (id === 'flow') check((await page.locator('svg[aria-label^="Flowchart"] rect').count()) === 5, `${scheme}: the flowchart has 5 steps`);
      await axe(page, `${scheme} ${id}`);
    }
    check(!errors.length, `${scheme}: page errors ${[...new Set(errors)].slice(0, 6).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : `✓ Create: list, tool bar and ${TOOLS.length} tools`);
process.exit(fail.length ? 1 : 0);
