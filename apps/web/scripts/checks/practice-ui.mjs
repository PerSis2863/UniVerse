// Adaptive practice in the browser: a wrong try with the hint, then right with the explanation; the
// teacher's switch and hint fields. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const q of (await call(T, '/api/core/quizzes')) ?? []) if (q.title?.startsWith('Practice UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const set = await call(T, '/api/core/quizzes', { courseId: C, title: 'Practice UI' });
await call(T, `/api/quizzes/${set.id}/questions`, { question: 'Which keyword starts a loop?', options: ['for', 'if', 'def'], correctAnswer: 'for', hint: 'It repeats.', explain: 'A for loop repeats its body.', points: 1 });
await call(T, `/api/quizzes/${set.id}`, { practice: true, status: 'PUBLISHED' }, 'PATCH');
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
const browser = await launch();
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'student', theme, width, axe: [] };
  await page.goto(`${base}/student/mastery`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByLabel('Course').selectOption(C).catch(() => {});
  const box = page.getByRole('region', { name: 'Practice' });
  await box.getByRole('heading', { level: 3 }).waitFor({ timeout: 20_000 });
  // Skip to our question (the course may have closed quizzes to practise too).
  for (let k = 0; k < 80 && !(await box.getByText('Which keyword starts a loop?').count()); k++) {
    const was = await box.getByRole('heading', { level: 3 }).innerText();
    await box.getByRole('button', { name: 'Another question' }).click();
    await page.waitForFunction(([w]) => { const h = document.querySelector('section[aria-labelledby="practice-title"] h3'); return h && h.textContent !== w; }, [was], { timeout: 5000 }).catch(() => {});
  }
  r.skips = await page.evaluate(() => 0);
  r.found = await box.getByText('Which keyword starts a loop?').count();
  r.why = (await box.locator('p.text-indigo-700, p.dark\\:text-indigo-300').first().innerText().catch(() => '')).slice(0, 60);
  r.axe.push(...(await axe(page)).map((x) => `start ${x}`));
  if (act && r.found) {
    await box.getByRole('radio', { name: 'if' }).click();
    await box.getByRole('button', { name: 'Check' }).click();
    r.wrong = (await box.getByRole('status').innerText({ timeout: 10_000 })).replace(/\s+/g, ' ');
    r.axe.push(...(await axe(page)).map((x) => `wrong ${x}`));
    await box.getByRole('radio', { name: 'for' }).click();
    await box.getByRole('button', { name: 'Check' }).click();
    await box.getByRole('status').filter({ hasText: /Right/ }).waitFor({ timeout: 10_000 });
    r.right = (await box.getByRole('status').innerText()).replace(/\s+/g, ' ');
    r.axe.push(...(await axe(page)).map((x) => `right ${x}`));
    await box.getByRole('button', { name: 'Next question' }).click();
    await page.waitForTimeout(800);
    r.stats = (await box.getByText(/Today:/).innerText().catch(() => '')).replace(/\s+/g, ' ');
  }
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await card(page, 'Practice UI', /Manage Quiz/).click();
  const sw = page.getByRole('switch', { name: 'Practice set' });
  await sw.waitFor({ timeout: 20_000 });
  r.on = await sw.getAttribute('aria-checked');
  await page.locator('summary', { hasText: 'Hint and explanation' }).click();
  r.fields = await page.getByLabel(/Hint, shown in practice/).count() + await page.getByLabel(/Explanation, shown with the answer/).count();
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
await call(T, `/api/core/quizzes/${set.id}`, null, 'DELETE');
