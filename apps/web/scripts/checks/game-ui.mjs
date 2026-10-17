// The live quiz game in two browsers at once: the teacher's class screen and a student's phone.
// Run twice: light (teacher 1280, phone 390) and dark (teacher 390, phone 1280). Axe at each step.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const q of (await call(T, '/api/core/quizzes')) ?? []) if (q.title?.startsWith('Game UI')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const quiz = await call(T, '/api/core/quizzes', { courseId: C, title: 'Game UI' });
await call(T, `/api/quizzes/${quiz.id}/questions`, { question: 'Which keyword starts a loop?', options: ['for', 'if', 'def'], correctAnswer: 'for', points: 1 });
await call(T, `/api/quizzes/${quiz.id}/questions`, { question: 'Which keyword defines a function?', options: ['for', 'if', 'def'], correctAnswer: 'def', points: 1 });
await call(T, `/api/quizzes/${quiz.id}`, { status: 'PUBLISHED' }, 'PATCH');
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
for (const [theme, tw, sw] of [['light', 1280, 390], ['dark', 390, 1280]]) {
  const open = (await call(T, `/api/live/game?courseId=${C}`)).game;
  if (open && open.status !== 'DONE') await call(T, `/api/live/game/${open.id}`, { action: 'end' });
  const r = { theme, teacherWidth: tw, phoneWidth: sw, axe: [] };
  const tctx = await context(browser, T, { width: tw, theme });
  const sctx = await context(browser, A, { width: sw, theme });
  const tp = await tctx.newPage(), sp = await sctx.newPage();
  const errors = []; tp.on('pageerror', (e) => errors.push(`t: ${e.message}`)); sp.on('pageerror', (e) => errors.push(`s: ${e.message}`));
  const both = async (step) => { r.axe.push(...(await axe(tp)).map((x) => `teacher ${step} ${x}`), ...(await axe(sp)).map((x) => `phone ${step} ${x}`)); };
  await tp.goto(`${base}/teacher/live`, { waitUntil: 'networkidle', timeout: 60_000 });
  await tp.getByLabel('Course').selectOption(C);
  const panel = tp.getByRole('region', { name: 'Quiz game' });
  await panel.getByRole('combobox', { name: /^Quiz/ }).selectOption({ label: 'Game UI' });
  await panel.getByRole('button', { name: /Start a game|New game/ }).click();
  await panel.getByRole('button', { name: 'Start the first question' }).waitFor({ timeout: 20_000 });
  await sp.goto(`${base}/student/live`, { waitUntil: 'networkidle', timeout: 60_000 });
  const phone = sp.getByRole('region', { name: /Quiz game/ });
  await phone.getByRole('button', { name: 'Join the game' }).click({ timeout: 20_000 });
  await phone.getByText(/You’re in!/).waitFor({ timeout: 15_000 });
  await panel.getByRole('list', { name: 'Players' }).getByText(/Alice/).waitFor({ timeout: 20_000 });
  r.lobby = 'ok';
  await both('lobby');
  await panel.getByRole('button', { name: 'Start the first question' }).click();
  await phone.getByRole('group', { name: 'Your answer' }).waitFor({ timeout: 20_000 });
  await both('question');
  await phone.getByRole('button', { name: /for$/ }).click();
  await phone.getByText(/Answer locked in/).waitFor({ timeout: 15_000 });
  await panel.getByText(/1 answered/).waitFor({ timeout: 20_000 });
  await panel.getByRole('button', { name: 'Show the answer' }).click();
  await phone.getByText(/Right! \+/).waitFor({ timeout: 20_000 });
  r.right = (await phone.getByText(/Right! \+/).innerText()).trim();
  r.rank = (await phone.getByText(/You’re 1st/).innerText().catch(() => '')).trim();
  await both('reveal');
  await panel.getByRole('button', { name: 'Next question' }).click();
  await phone.getByRole('group', { name: 'Your answer' }).waitFor({ timeout: 20_000 });
  await phone.getByRole('button', { name: /if$/ }).click();
  await phone.getByText(/Answer locked in/).waitFor({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Show the answer' }).click();
  await phone.getByText(/Not this time/).waitFor({ timeout: 20_000 });
  r.wrongShowsAnswer = await phone.getByText('def', { exact: true }).count();
  await panel.getByRole('button', { name: 'See the winners' }).click();
  await panel.getByText(/wins “Game UI”/).waitFor({ timeout: 20_000 });
  await phone.getByText('Game over').waitFor({ timeout: 20_000 });
  r.winner = (await panel.getByText(/wins “Game UI”/).innerText()).trim();
  await both('done');
  r.wide = [await wide(tp), await wide(sp)];
  r.errors = errors;
  console.log(JSON.stringify(r));
  await tctx.close(); await sctx.close();
}
await browser.close();
await call(T, `/api/core/quizzes/${quiz.id}`, null, 'DELETE');
