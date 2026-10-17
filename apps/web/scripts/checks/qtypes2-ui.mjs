// Maths and picture questions and the short-answer check in the browser. Axe at 390/1280, light/dark.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
import { fileURLToPath as __path } from 'node:url';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const PNG = `${APP}/public/icon-192x192.png`;
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const q of (await call(T, '/api/core/quizzes')) ?? []) if (q.title?.startsWith('Types2 UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const up = await fetch(`${base}/api/upload?filename=pic.png`, { method: 'POST', headers: { Authorization: `Bearer mock-token-${T}`, 'Content-Type': 'image/png' }, body: readFileSync(PNG) }).then((r) => r.json());
const quiz = await call(T, '/api/core/quizzes', { courseId: C, title: 'Types2 UI' });
const look = await call(T, '/api/core/quizzes', { courseId: C, title: 'Types2 UI look' });
for (const id of [quiz.id, look.id]) for (const q of [
  { type: 'MATH', question: 'Expand (x+1)^2.', accepted: ['x^2 + 2x + 1'] },
  { type: 'HOTSPOT', question: 'Tap the top left corner.', image: up.url, areas: [{ x: 0, y: 0, w: 30, h: 30 }] },
  { type: 'SHORT', question: 'Capital of France?', accepted: ['Paris'] },
]) await call(T, `/api/quizzes/${id}/questions`, { ...q, points: 1 });
for (const id of [quiz.id, look.id]) await call(T, `/api/quizzes/${id}`, { status: 'PUBLISHED' }, 'PATCH');
const qs = (await call(T, `/api/quizzes/${quiz.id}`)).questions;
await call(B, `/api/core/quizzes/${quiz.id}/submit`, { answers: { [qs[0].id]: 'x^2+1', [qs[1].id]: '90,90', [qs[2].id]: 'paree' } });
const card = (page, title, button) => page.locator('div').filter({ has: page.getByText(title, { exact: true }) }).filter({ has: page.getByRole('button', { name: button }) }).last().getByRole('button', { name: button });

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
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
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (page, text) => (text ? await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing') : await page.locator('[data-sonner-toast]').last().innerText({ timeout: 15_000 }).catch(() => '')).split('\n')[0];
const browser = await launch();

for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, 'Types2 UI', /Manage Quiz/).click();
  await page.getByLabel('Question type').waitFor({ timeout: 20_000 });
  r.picture = await page.getByRole('img', { name: 'The picture, with the areas that count' }).count();
  await page.locator('summary', { hasText: 'Check the answers' }).click();
  await page.getByText('paree').waitFor({ timeout: 10_000 });
  if (act) {
    await page.getByRole('button', { name: 'Accept' }).first().click();
    r.accepted = await toast(page);
    r.bobNow = (await call(T, `/api/quizzes/${quiz.id}`)).submissions.find((x) => x.student.name.startsWith('Bob'))?.score;
    // A maths question with its preview, and a picture question with an area.
    await page.getByLabel('Question type').selectOption('MATH');
    await page.getByLabel('Question', { exact: true }).fill('Simplify 2x + 3x.');
    await page.getByLabel(/The answer, one way of writing it per line/).fill('5x');
    r.preview = await page.getByText('Read as:').count();
    await page.getByRole('button', { name: 'Add question' }).click();
    r.addedMath = await toast(page, 'Question added');
    await page.locator('[data-sonner-toast]', { hasText: 'Question added' }).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    await page.getByLabel('Question type').selectOption('HOTSPOT');
    await page.getByLabel('Question', { exact: true }).fill('Tap the middle.');
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(PNG);
    await page.getByRole('button', { name: 'Add an area in the middle' }).click({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Add question' }).click();
    r.addedPicture = await toast(page, 'Question added');
    r.types = (await call(T, `/api/quizzes/${quiz.id}`)).questions.map((q) => q.type).join(',');
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}

for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'student', theme, width, axe: [] };
  await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, act ? 'Types2 UI' : 'Types2 UI look', /Start Quiz/).click();
  const total = act ? 5 : 3;
  for (let n = 1; n <= total; n++) {
    const label = `Your answer to question ${n}`;
    await page.getByText(`Question ${n} of ${total}`).waitFor({ timeout: 15_000 });
    const pic = page.getByRole('application', { name: new RegExp(label) });
    if (await page.getByText(/Type the expression/).count()) {
      await page.getByLabel(label).fill(n === 1 ? '(x+1)^2' : '5*x');
      await page.getByText('Read as:').waitFor({ timeout: 10_000 });
      await page.locator('math').first().waitFor({ timeout: 10_000 }).catch(() => {});
      r.math = (r.math ?? 0) + await page.locator('math').count();
    } else if (await pic.count()) {
      const box = await pic.boundingBox();
      const middle = (await page.locator('h3').filter({ hasText: 'middle' }).count()) > 0;
      await page.mouse.click(box.x + box.width * (middle ? 0.5 : 0.1), box.y + box.height * (middle ? 0.5 : 0.1));
      await pic.focus();
      await page.keyboard.press('ArrowRight');
      r.marker = (await pic.getAttribute('aria-label')).replace(label, '').trim();
    } else {
      await page.getByLabel(label).fill('Paris');
    }
    if (act || n <= 3) r.axe.push(...(await axe(page)).map((x) => `q${n} ${x}`));
    await page.getByRole('button', { name: n < total ? 'Next Question' : 'Finish' }).click();
  }
  if (act) { await page.getByRole('button', { name: 'Submit', exact: true }).click(); r.result = await toast(page); }
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await call(T, `/api/quizzes/${quiz.id}`, { status: 'CLOSED' }, 'PATCH');
for (const theme of ['light', 'dark']) {
  const ctx = await context(browser, A, { width: 390, theme });
  const page = await ctx.newPage();
  await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /View all results/ }).click().catch(() => {});
  await page.getByRole('button').filter({ hasText: 'Types2 UI' }).filter({ hasNotText: 'look' }).first().click();
  await page.getByRole('img', { name: 'Where you tapped' }).first().waitFor({ timeout: 15_000 });
  console.log(JSON.stringify({ who: 'review', theme, pictures: await page.getByRole('img', { name: 'Where you tapped' }).count(), right: await page.getByText(/^Right: your tap/).count(), axe: await axe(page) }));
  await ctx.close();
}
await browser.close();
for (const id of [quiz.id, look.id]) await call(T, `/api/core/quizzes/${id}`, null, 'DELETE');
