// Rich lesson pages on the built Worker: read (callout, quick check, flashcards), edit, add blocks,
// save, preview; a new page opens the editor; students read without editing. 390 and 1280 px, light
// and dark, axe.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787';
const C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', S = 'demo@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const mods = `/api/courses/${C}/modules`;
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Loops, step by step' }] },
  p('Read this, then try the check.'),
  { type: 'callout', attrs: { tone: 'warning' }, content: [p('Mind the off-by-one.')] },
  { type: 'embed', attrs: { kind: 'math', tex: 'x^2 + 1' } },
  { type: 'quickCheck', attrs: { question: 'How many times does range(3) loop?', options: ['2', '3', '4'], answer: 1, explain: 'It counts 0, 1 and 2.' } },
  { type: 'flashcards', attrs: { title: 'Words', cards: [{ front: 'loop', back: 'repeat a step' }, { front: 'range', back: 'numbers in a row' }] } },
] };

// Test data (and what a stopped run left).
for (const m of (await call(T, mods)).modules ?? []) if (['Lesson pages test', 'Opens next week'].includes(m.title)) await call(T, mods, { action: 'delete-module', moduleId: m.id });
const mod = await call(T, mods, { action: 'create-module', title: 'Lesson pages test', published: true });
const locked = await call(T, mods, { action: 'create-module', title: 'Opens next week', published: true, releaseAt: new Date(Date.now() + 7 * 864e5).toISOString() });
const item = await call(T, mods, { action: 'add-item', moduleId: mod.id, kind: 'PAGE', title: 'Loops lesson' });
await call(T, mods, { action: 'update-item', itemId: item.id, body: JSON.stringify(doc) });
await call(T, mods, { action: 'add-item', moduleId: locked.id, kind: 'PAGE', title: 'Next week reading', body: 'Chapter 6' });

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, me, theme]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (page) => (await page.locator('[data-sonner-toast]').last().innerText({ timeout: 8000 }).catch(() => '')).split('\n')[0];

/** Opens the page and tries its blocks; returns what happened. */
async function read(page, who) {
  await page.goto(`${base}/${who}/blackboard?course=${C}&tab=modules`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /Loops lesson/ }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Loops lesson' });
  await dlg.getByRole('heading', { name: 'Loops, step by step' }).waitFor({ timeout: 20_000 });
  const callout = await dlg.locator('[role="note"][aria-label="Watch out"]').count();
  const math = await dlg.locator('math').first().waitFor({ timeout: 10_000 }).then(() => 1, () => 0);
  await dlg.getByRole('radio', { name: '2', exact: true }).check();
  await dlg.getByRole('button', { name: 'Check' }).click();
  const wrong = await dlg.getByText('Not quite. Have another go.').count();
  await dlg.getByRole('radio', { name: '3', exact: true }).check();
  await dlg.getByRole('button', { name: 'Check' }).click();
  const right = await dlg.getByText('Right!').count() && await dlg.getByText('It counts 0, 1 and 2.').count();
  await dlg.getByRole('button', { name: /Tap to turn it over/ }).click();
  const back = await dlg.getByText('repeat a step').count();
  await dlg.getByRole('button', { name: 'Next card' }).click();
  const next = await dlg.getByText('range', { exact: true }).count();
  const axeRead = await axe(page);
  const editButton = await dlg.getByRole('button', { name: 'Edit page' }).count();
  return { dlg, out: { callout, math, wrong, right: !!right, back, next, editButton, axeRead, wide: await wide(page) } };
}

const browser = await launch();
const results = [];
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const { dlg, out } = await read(page, 'teacher');
  // Edit: add a callout, a quick check and flashcards, type, save, preview.
  await dlg.getByRole('button', { name: 'Edit page' }).click();
  const ed = page.getByRole('dialog', { name: 'Edit page' });
  const text = ed.locator('[aria-label="Page text"]');
  await text.waitFor({ timeout: 20_000 });
  const toolbarOn = await ed.getByRole('button', { name: 'Bold' }).isEnabled();
  const axeEdit = await axe(page);
  let saved = null, preview = null, blocks = null;
  if (theme === 'light') {
    await ed.getByRole('heading', { name: 'Loops, step by step' }).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Added in the browser.');
    const insert = ed.getByRole('button', { name: /Insert a video, maths/ });
    await insert.click(); await ed.getByRole('button', { name: 'Callout (note, tip…)' }).click();
    await insert.click(); await ed.getByRole('button', { name: 'Quick check', exact: true }).click();
    await ed.getByLabel('Question').last().fill('Is 7 prime?');
    await ed.getByLabel('Answer 1', { exact: true }).last().fill('Yes');
    await ed.getByLabel('Answer 2', { exact: true }).last().fill('No');
    await insert.click(); await ed.getByRole('button', { name: 'Flashcards', exact: true }).click();
    await ed.getByLabel('Card 1, front').last().fill('prime');
    await ed.getByLabel('Card 1, back').last().fill('only 1 and itself');
    await ed.getByRole('button', { name: 'Preview' }).click();
    preview = await ed.getByText('This is how students see it').count() && await ed.getByRole('button', { name: /Tap to turn it over/ }).count();
    await ed.getByRole('button', { name: 'Back to editing' }).click();
    await ed.getByRole('button', { name: 'Save' }).click();
    saved = await toast(page);
    const body = JSON.parse((await call(T, `${mods}/${item.id}`)).body);
    blocks = body.content.map((n) => n.type).join(',');
    // Put the test page back as it was for the next round.
    await call(T, mods, { action: 'update-item', itemId: item.id, body: JSON.stringify(doc) });
  }
  await page.keyboard.press('Escape');
  // A new page opens the editor straight away.
  let newPage = null;
  if (theme === 'light' && width === 390) {
    await page.goto(`${base}/teacher/blackboard?course=${C}&tab=modules`, { waitUntil: 'networkidle', timeout: 60_000 });
    const section = page.locator('li', { has: page.getByText('Lesson pages test', { exact: true }) }).first();
    await section.getByRole('button', { name: 'Add item' }).click();
    const add = page.getByRole('dialog', { name: 'Add to module' });
    await add.getByRole('radio', { name: 'Page' }).click();
    await add.getByLabel('Title').fill('Blank page');
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    const ed2 = page.getByRole('dialog', { name: 'Edit page' });
    newPage = await ed2.waitFor({ timeout: 15_000 }).then(() => ed2.getByRole('textbox', { name: 'Page title' }).inputValue(), () => 'no editor');
  }
  results.push({ theme, width, ...out, toolbarOn, axeEdit, saved, preview: !!preview, blocks, newPage, errors });
  await ctx.close();
}
// Student: reads and tries it; no Edit page; the locked module's item is readable (contrast).
{
  const ctx = await context(browser, S);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const { out } = await read(page, 'student');
  await page.keyboard.press('Escape');
  const axeList = await axe(page);
  results.push({ who: 'student', ...out, axeList, errors });
  await ctx.close();
}
await browser.close();
for (const r of results) console.log(JSON.stringify(r));
for (const id of [mod.id, locked.id]) await call(T, mods, { action: 'delete-module', moduleId: id });
