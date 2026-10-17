// Q10: search everywhere. Words inside a course document are found by people in the course only;
// a private document by its owner only; task cards and assignments the same; renames and deletes
// follow. Then the search box in a browser: grouped results with the matched words highlighted,
// Enter opens it, Recent remembers it, actions and "Video call"; axe at 390 / 1280, light / dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com', O = 'tom@teacher.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const find = async (who, q) => ((await call(who, `/api/search?q=${encodeURIComponent(q)}`))[1].results ?? []).filter((x) => ['doc', 'sheet', 'slides', 'task', 'assignment', 'board'].includes(x.type));
const r = {};

// A course document with a rare word in its body.
const [, cdoc] = await call(T, '/api/docs', { title: 'Search test class notes', courseId: C });
await call(T, `/api/docs/${cdoc.id}/versions`, { html: '<h1>Plants</h1><p>The zorblax cycle turns light into <strong>sugar</strong>.</p>', text: 'Plants' });
r.courseDoc = { alice: (await find(A, 'zorblax')).map((x) => `${x.type}:${x.title}|${x.snippet}`), tomTA: (await find(O, 'zorblax')).length, prefix: (await find(A, 'zorbl')).length };
// A course Alice isn't in: its document and assignment stay out of her search.
const [, other] = await call(O, '/api/core/courses', { name: 'Search test other course', code: `ST${Date.now() % 100000}`, credits: 3 });
const [, odoc] = await call(O, '/api/docs', { title: 'Search test other notes', courseId: other.id });
await call(O, `/api/docs/${odoc.id}/versions`, { html: '<p>The plumbus is kept here.</p>', text: 'x' });
const [, oasg] = await call(O, '/api/assignments', { courseId: other.id, title: 'Search test other essay', instructions: 'Describe a plumbus.', rubric: [{ id: 'c1', criterion: 'Answer', points: 10 }], maxScore: 10 });
r.otherCourse = { tom: (await find(O, 'plumbus')).map((x) => x.type), alice: (await find(A, 'plumbus')).length, demoTeacher: (await find(T, 'plumbus')).length };
// A private document.
const [, pdoc] = await call(A, '/api/docs', { title: 'Search test diary' });
await call(A, `/api/docs/${pdoc.id}/versions`, { html: '<p>My quixotically private thoughts.</p>', text: 'My' });
r.privateDoc = { alice: (await find(A, 'quixotically')).length, bob: (await find(B, 'quixotically')).length, teacher: (await find(T, 'quixotically')).length };
// Renamed and deleted.
await call(A, `/api/docs/${pdoc.id}`, { title: 'Search test journal snarkle' }, 'PATCH');
r.renamed = (await find(A, 'snarkle')).map((x) => x.title);
await call(A, `/api/docs/${pdoc.id}`, null, 'DELETE');
r.afterDelete = (await find(A, 'quixotically')).length;
// A task card on a private board.
const [, board] = await call(T, '/api/tasks', { title: 'Search test board' });
const [, full] = await call(T, `/api/tasks/${board.id}`);
const listId = full.lists?.[0]?.id;
const [, card] = await call(T, `/api/tasks/${board.id}/items`, { listId, title: 'Search test card' });
await call(T, `/api/tasks/items/${card.id}`, { notes: 'Remember the flibbertigibbet form.' }, 'PATCH');
r.card = { teacher: (await find(T, 'flibbertigibbet')).map((x) => `${x.type}:${x.href}`), alice: (await find(A, 'flibbertigibbet')).length, board: (await find(T, 'Search test board')).map((x) => x.type) };
// An assignment in the course.
const rubric = [{ id: 'c1', criterion: 'Answer', points: 10 }];
const [, asg] = await call(T, '/api/assignments', { courseId: C, title: 'Search test essay', instructions: 'Explain the snollygoster effect in 300 words.', rubric, maxScore: 10 });
r.assignment = { alice: (await find(A, 'snollygoster')).map((x) => x.href), teacher: (await find(T, 'snollygoster')).map((x) => x.href) };
console.log(JSON.stringify(r));

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, me, theme]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await launch();
let first = true;
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  const act = first; first = false;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const u = { theme, width };
  await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
  if (width < 1024) await page.getByRole('button', { name: 'Search' }).first().click();
  else await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.waitFor();
  await page.getByPlaceholder(/Search documents/).fill('zorblax');
  await dialog.getByText('Documents').waitFor({ timeout: 15_000 });
  u.groups = await dialog.locator('p').allInnerTexts();
  u.marked = await dialog.locator('mark').allInnerTexts();
  u.axe = await axe(page);
  if (act) {
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/docs\//, { timeout: 15_000 });
    u.opened = page.url().replace(base, '');
    await page.keyboard.press('Control+k');
    await dialog.waitFor();
    u.recent = (await dialog.innerText()).split('\n').slice(0, 6).join(' | ');
    await page.keyboard.type('new spread');
    await page.waitForTimeout(500);
    u.action = await dialog.getByRole('option', { name: /New spreadsheet/ }).count();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('bob');
    await dialog.getByRole('option', { name: /Video call/ }).first().waitFor({ timeout: 15_000 }).then(() => { u.videoCall = true; }, () => { u.videoCall = false; });
    u.axeActions = await axe(page);
  }
  u.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  u.errors = errors;
  console.log(JSON.stringify(u));
  await ctx.close();
}
await browser.close();
// Tidy up.
await call(T, `/api/docs/${cdoc.id}`, null, 'DELETE');
await call(T, `/api/tasks/${board.id}`, null, 'DELETE');
if (asg.id) await call(T, `/api/assignments/${asg.id}`, null, 'DELETE');
if (oasg.id) await call(O, `/api/assignments/${oasg.id}`, null, 'DELETE');
if (odoc.id) await call(O, `/api/docs/${odoc.id}`, null, 'DELETE');
console.log('other course left (draft):', other.id);
