// Question types in the browser: the teacher adds a matching question in the editor; a student
// answers one of each type, hands in, and reads the review. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const q of (await call(T, '/api/core/quizzes')) ?? []) if (q.title?.startsWith('Types UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const quiz = await call(T, '/api/core/quizzes', { courseId: C, title: 'Types UI' });
const look = await call(T, '/api/core/quizzes', { courseId: C, title: 'Types UI look' });
const QS = [
  { type: 'CHOICE', question: '2 + 2?', options: ['3', '4', '5'], correctAnswer: '4' },
  { type: 'TRUE_FALSE', question: 'The sun is a star.', correctAnswer: 'True' },
  { type: 'MULTI', question: 'Which are primes?', options: ['2', '3', '4', '5'], correct: ['2', '3', '5'] },
  { type: 'SHORT', question: 'Capital of France?', accepted: ['Paris'] },
  { type: 'BLANKS', question: 'Water boils at [[100]] °C at [[sea level]].' },
  { type: 'ORDER', question: 'Smallest first.', items: ['1', '2', '3', '4'] },
  { type: 'NUMBER', question: 'g in m/s²?', value: '9.81', tolerance: '0.1', unit: 'm/s²' },
];
for (const id of [quiz.id, look.id]) for (const q of QS) await call(T, `/api/quizzes/${id}/questions`, { ...q, points: 1 });
await call(T, `/api/quizzes/${look.id}/questions`, { type: 'MATCH', question: 'Match the capitals.', pairs: [{ left: 'France', right: 'Paris' }, { left: 'Spain', right: 'Madrid' }], points: 1 });
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
const toast = async (page) => (await page.locator('[data-sonner-toast]').last().innerText({ timeout: 15_000 }).catch(() => '')).split('\n')[0];
const browser = await launch();
const out = [];

// Teacher: the editor, at each size and theme; adds a matching question once.
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, 'Types UI', /Manage Quiz/).click();
  await page.getByLabel('Question type').waitFor({ timeout: 20_000 });
  r.typeLabels = await page.getByText(/· (True or false|Several answers|Fill in the blanks|Put in order|Number) ·/).count();
  if (act) {
    await page.getByLabel('Question type').selectOption('MATCH');
    await page.getByLabel('Question', { exact: true }).fill('Match the capitals.');
    await page.getByLabel('Prompt 1').fill('France'); await page.getByLabel('Its match 1').fill('Paris');
    await page.getByLabel('Prompt 2').fill('Spain'); await page.getByLabel('Its match 2').fill('Madrid');
    await page.getByRole('button', { name: 'Add question' }).click();
    r.added = await toast(page);
    r.afterType = await page.getByLabel('Question type').inputValue();
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r); console.log(JSON.stringify(r));
  await ctx.close();
}
for (const id of [quiz.id, look.id]) await call(T, `/api/quizzes/${id}`, { status: 'PUBLISHED' }, 'PATCH');

// Student: answer everything once (390 light); elsewhere step through and check each screen.
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'student', theme, width, axe: [] };
  await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, act ? 'Types UI' : 'Types UI look', /Start Quiz/).click();
  for (let n = 1; n <= 8; n++) {
    const label = `Your answer to question ${n}`;
    await page.getByText(`Question ${n} of 8`).waitFor({ timeout: 15_000 });
    const text = await page.locator('h3').filter({ hasText: /\?|\.|_/ }).last().innerText();
    if (act) {
      if (text.includes('2 + 2')) await page.getByRole('radio', { name: '4' }).click();
      else if (text.includes('sun')) await page.getByRole('radio', { name: 'True' }).click();
      else if (text.includes('primes')) for (const x of ['2', '3', '5']) await page.getByRole('checkbox', { name: x }).click();
      else if (text.includes('France?')) await page.getByLabel(label).fill('paris');
      else if (text.includes('boils')) { await page.getByLabel('Blank 1').fill('100'); await page.getByLabel('Blank 2').fill('Sea level'); }
      else if (text.includes('Smallest')) {
        for (let pass = 0; pass < 6; pass++) {
          const items = await page.getByRole('list', { name: label }).locator('li span.flex-1').allInnerTexts();
          const k = items.findIndex((x, i) => i > 0 && Number(x) < Number(items[i - 1]));
          if (k < 0) break;
          await page.getByRole('button', { name: `Move “${items[k]}” up` }).click();
        }
        r.order = (await page.getByRole('list', { name: label }).locator('li span.flex-1').allInnerTexts()).join('');
      } else if (text.includes('g in')) await page.getByLabel(label).fill('9.8');
      else if (text.includes('capitals')) { await page.getByLabel('France').selectOption('Paris'); await page.getByLabel('Spain').selectOption('Madrid'); }
    }
    if (n <= 3 || act) r.axe.push(...(await axe(page)).map((x) => `q${n} ${x}`));
    await page.getByRole('button', { name: n < 8 ? 'Next Question' : 'Finish' }).click();
  }
  r.answered = (await page.getByText(/You’ve answered \d+ of 8/).innerText().catch(() => '')).slice(0, 40);
  if (act) {
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    r.result = await toast(page);
  }
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r); console.log(JSON.stringify(r));
  await ctx.close();
}
await call(T, `/api/quizzes/${quiz.id}`, { status: 'CLOSED' }, 'PATCH');
// The review once answers are shown.
for (const theme of ['light', 'dark']) {
  const ctx = await context(browser, A, { width: 390, theme });
  const page = await ctx.newPage();
  const r = { who: 'review', theme };
  await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /View all results/ }).click().catch(() => {});
  await page.locator('div.cursor-pointer').filter({ hasText: 'Types UI' }).filter({ hasNotText: 'look' }).first().click();
  await page.getByText(/Your answer: /).first().waitFor({ timeout: 15_000 });
  r.typed = await page.getByText(/Your answer: /).count();
  r.wrongShown = await page.getByText(/Right answer: /).count();
  r.axe = await axe(page);
  out.push(r); console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();

for (const id of [quiz.id, look.id]) await call(T, `/api/core/quizzes/${id}`, null, 'DELETE');
