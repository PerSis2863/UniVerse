// One-way exams in the browser: answer, reload (goes on from the next question), hand in; the
// teacher's switches. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const q of (await call(T, '/api/core/quizzes')) ?? []) if (q.title?.startsWith('Exam UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const made = [];
for (const title of ['Exam UI', 'Exam UI look']) {
  const quiz = await call(T, '/api/core/quizzes', { courseId: C, title, timeLimit: 20 });
  for (let k = 1; k <= 3; k++) await call(T, `/api/quizzes/${quiz.id}/questions`, { question: `Q${k}: pick yes`, options: ['yes', 'no'], correctAnswer: 'yes', points: 1 });
  await call(T, `/api/quizzes/${quiz.id}`, { examMode: true, oneWay: true, hardStop: true, status: 'PUBLISHED' }, 'PATCH');
  made.push(quiz);
}
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
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'student', theme, width };
  await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  const title = act ? 'Exam UI' : 'Exam UI look';
  await card(page, title, /Start Quiz/).click();
  await page.getByText('Question 1 of 3').waitFor({ timeout: 15_000 });
  r.note = await page.getByText(/once you go on, you can’t go back/).count();
  if (act) {
    await page.getByRole('radio', { name: 'yes' }).click();
    await page.getByRole('button', { name: 'Next Question' }).click();
    await page.getByText('Question 2 of 3').waitFor({ timeout: 15_000 });
    await page.reload({ waitUntil: 'networkidle' });
    await card(page, title, /Start Quiz/).click();
    r.resumedAt = (await page.getByText(/^Question \d of 3$/).innerText({ timeout: 15_000 }).catch(() => '')).trim();
    await page.getByRole('radio', { name: 'no' }).click();
    await page.getByRole('button', { name: 'Next Question' }).click();
    await page.getByText('Question 3 of 3').waitFor({ timeout: 15_000 });
    await page.getByRole('radio', { name: 'yes' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    r.result = await toast(page, 'Quiz submitted');
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, 'Exam UI', /Manage Quiz/).click();
  const sw = page.getByRole('switch', { name: 'Stop when time is up' });
  await sw.waitFor({ timeout: 20_000 });
  r.switches = await page.getByRole('switch', { name: /no going back|Stop when time is up/ }).count();
  if (act) {
    await sw.click();
    r.toggled = await toast(page, 'Late answers');
    r.hardStop = (await call(T, `/api/quizzes/${made[0].id}`)).hardStop;
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
for (const q of made) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
