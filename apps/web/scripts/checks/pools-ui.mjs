// Pools and changing numbers in the browser. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const q of (await call(T, '/api/core/quizzes')) ?? []) if (q.title?.startsWith('Pools UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const quiz = await call(T, '/api/core/quizzes', { courseId: C, title: 'Pools UI' });
const look = await call(T, '/api/core/quizzes', { courseId: C, title: 'Pools UI look' });
await call(T, `/api/quizzes/${look.id}/questions`, { question: 'Intro: pick yes', options: ['yes', 'no'], correctAnswer: 'yes', points: 1 });
for (let k = 1; k <= 4; k++) await call(T, `/api/quizzes/${look.id}/questions`, { question: `Pool question ${k}: pick yes`, options: ['yes', 'no'], correctAnswer: 'yes', points: 1, pool: 'week 3' });
await call(T, `/api/quizzes/${look.id}/questions`, { type: 'NUMBER', question: 'Double {a}?', formula: '2a', vars: [{ name: 'a', min: 1, max: 9, step: 1 }], points: 1 });
await call(T, `/api/quizzes/${look.id}`, { pools: { 'week 3': 2 }, status: 'PUBLISHED' }, 'PATCH');
await call(T, `/api/quizzes/${quiz.id}/questions`, { question: 'Intro: pick yes', options: ['yes', 'no'], correctAnswer: 'yes', points: 1 });
for (let k = 1; k <= 4; k++) await call(T, `/api/quizzes/${quiz.id}/questions`, { question: `Pool question ${k}: pick yes`, options: ['yes', 'no'], correctAnswer: 'yes', points: 1, pool: 'week 3' });
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
const toast = async (page, text) => (await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
const browser = await launch();
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, 'Pools UI', /Manage Quiz/).click();
  await page.getByLabel('How many from week 3').waitFor({ timeout: 20_000 });
  if (act) {
    await page.getByLabel('How many from week 3').fill('2');
    await page.getByRole('button', { name: 'Save the pools' }).click();
    r.saved = await toast(page, 'Pools saved');
    r.pools = (await call(T, `/api/quizzes/${quiz.id}`)).pools;
    await page.reload({ waitUntil: 'networkidle' });
    await card(page, 'Pools UI', /Manage Quiz/).click();
    r.afterReload = await page.getByLabel('How many from week 3').inputValue({ timeout: 20_000 });
    await page.getByLabel('Question type').selectOption('NUMBER');
    await page.getByLabel('Question', { exact: true }).fill('Double {a}?');
    await page.getByLabel('Numbers that change for each student').check();
    await page.getByLabel('The answer’s formula').fill('2a');
    r.example = (await page.locator('p', { hasText: /^For example:/ }).innerText().catch(() => '')).slice(0, 60);
    await page.getByRole('button', { name: 'Add question' }).click();
    r.added = await toast(page, 'Question added');
    r.key = (await call(T, `/api/quizzes/${quiz.id}`)).questions.find((q) => q.type === 'NUMBER')?.correctAnswer;
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await call(T, `/api/quizzes/${quiz.id}`, { status: 'PUBLISHED' }, 'PATCH');
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'student', theme, width, axe: [] };
  await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  const title = act ? 'Pools UI' : 'Pools UI look';
  r.listed = await page.locator('div').filter({ has: page.getByText(title, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Start Quiz/ }) }).last().getByText('4 Questions').count();
  await card(page, title, /Start Quiz/).click();
  for (let n = 1; n <= 4; n++) {
    await page.getByText(`Question ${n} of 4`).waitFor({ timeout: 15_000 });
    const text = await page.locator('h3').filter({ hasText: /\?|yes/ }).last().innerText();
    if (act) {
      const m = /Double (\d+)\?/.exec(text);
      if (m) { r.double = m[1]; await page.getByLabel(`Your answer to question ${n}`).fill(String(2 * Number(m[1]))); }
      else await page.getByRole('radio', { name: 'yes' }).click();
    }
    if (act || n === 1) r.axe.push(...(await axe(page)).map((x) => `q${n} ${x}`));
    await page.getByRole('button', { name: n < 4 ? 'Next Question' : 'Finish' }).click();
  }
  if (act) { await page.getByRole('button', { name: 'Submit', exact: true }).click(); r.result = await toast(page, 'Quiz submitted'); }
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
for (const id of [quiz.id, look.id]) await call(T, `/api/core/quizzes/${id}`, null, 'DELETE');
