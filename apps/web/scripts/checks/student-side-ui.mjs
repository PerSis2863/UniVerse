// The student side in the browser: status labels, the receipt, regrade request and answer, the
// receipt check. 390 and 1280 px, light and dark, axe.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const x of await call(T, `/api/assignments?courseId=${C}`)) if (x.title.startsWith('Side UI')) await call(T, `/api/assignments/${x.id}`, null, 'DELETE');
const graded = await call(T, '/api/assignments', { courseId: C, title: 'Side UI graded', instructions: 'Write about loops.', rubric: [{ criterion: 'Content', points: 10 }] });
await call(A, `/api/assignments/${graded.id}/submission`, { text: 'An answer long enough to hand in for grading.' }, 'PUT');
const d = await call(T, `/api/assignments/${graded.id}`);
await call(T, `/api/assignments/submissions/${d.submissions[0].id}/return`, { criteria: d.rubric.map((r) => ({ id: r.id, score: 6 })), feedback: 'Good start' });
const late = await call(T, '/api/assignments', { courseId: C, title: 'Side UI late', instructions: 'Write.', rubric: [{ criterion: 'C', points: 5 }], dueDate: new Date(Date.now() - 2 * 864e5).toISOString() });
await call(A, `/api/assignments/${late.id}/submission`, { text: 'Handed in after the due date, long enough.' }, 'PUT');

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
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
let receipt = '';
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'alice', theme, width };
  await page.goto(`${base}/student/assignments`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Side UI late').waitFor({ timeout: 20_000 });
  r.lateChip = await page.locator('a', { hasText: 'Side UI late' }).getByText('Handed in late').count();
  r.gradedChip = await page.locator('a', { hasText: 'Side UI graded' }).getByText('6/10').count();
  r.axeList = await axe(page);
  await page.goto(`${base}/student/assignments/${graded.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('region', { name: 'Your grade' }).waitFor({ timeout: 20_000 });
  r.rubricButton = await page.getByRole('button', { name: 'What does this rubric mean?' }).count();
  await page.locator('summary', { hasText: 'Hand-in receipt' }).click();
  receipt = (await page.locator('code').first().innerText().catch(() => '')) || receipt;
  r.receipt = receipt.slice(0, 3);
  if (act) {
    await page.getByRole('button', { name: 'Ask for a regrade' }).click();
    await page.getByLabel(/Which part should be looked at again/).fill('Please look at my second paragraph again; it has two sources.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    r.asked = await toast(page);
    r.waiting = await page.getByText('Waiting for your teacher’s answer.').count();
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/assignments/${graded.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const box = page.getByRole('region', { name: 'Regrade requests' });
  await box.waitFor({ timeout: 20_000 });
  r.chip = await page.getByText('Regrade?').count();
  if (act) {
    await box.getByLabel('Your answer').fill('Looked again: the grade stays, your sources are not cited.');
    await box.getByRole('button', { name: 'Send the answer' }).click();
    r.answered = await toast(page);
    await page.locator('summary', { hasText: 'Rules and extensions' }).click();
    await page.getByLabel('Receipt code').fill(receipt);
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    r.check = (await page.getByText(/^Valid:|^Not a valid/).innerText({ timeout: 10_000 }).catch(() => '')).slice(0, 90);
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
for (const id of [graded.id, late.id]) await call(T, `/api/assignments/${id}`, null, 'DELETE');
