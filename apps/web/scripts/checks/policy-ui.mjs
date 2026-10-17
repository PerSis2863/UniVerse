// Assignment rules in the browser: the teacher's Rules and extensions panel, the late notice and
// waiver in grading, "Let them hand in again", the student's view, extra time in the Class list.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', S = 'demo@student.com', A = 'alice@student.com', BOB = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const DAY = 864e5;
const ids = Object.fromEntries((await call(T, `/api/courses/${C}/enrolment`)).students.map((s) => [s.email, s.id]));
for (const a of await call(T, `/api/assignments?courseId=${C}`)) if (a.title === 'Rules UI test') await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
const asg = await call(T, '/api/assignments', { courseId: C, title: 'Rules UI test', instructions: 'Write about loops.', rubric: [{ criterion: 'Content', points: 10 }], dueDate: new Date(Date.now() - 2 * DAY + 3600e3).toISOString(), latePenalty: 10, lateGraceMinutes: 30, maxAttempts: 2 });
const P = `/api/assignments/${asg.id}`;
await call(A, `${P}/submission`, { text: 'This is my answer to the question, long enough to hand in.' }, 'PUT');
await call(T, `${P}/extensions`, { studentId: ids[BOB], dueDate: new Date(Date.now() + 3 * DAY).toISOString(), note: 'Ill' });

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
const toast = async (page) => (await page.locator('[data-sonner-toast]').last().innerText({ timeout: 10_000 }).catch(() => '')).split('\n')[0];

const browser = await launch();
const out = [];
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/teacher/assignments/${asg.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const summary = page.locator('summary', { hasText: 'Rules and extensions' });
  await summary.waitFor({ timeout: 20_000 });
  const summaryText = await summary.innerText();
  await summary.click();
  const r = { theme, width, summaryText: summaryText.replace(/\s+/g, ' ').slice(0, 140) };
  r.penaltyField = await page.getByLabel('Late penalty (% a day)').inputValue();
  r.extensionListed = await page.getByText(/Bob Smith · until/).count();
  r.lateNotice = await page.getByText(/2 days late: −20%/).count();
  await page.getByLabel('Content', { exact: true }).fill('8');
  r.heading = (await page.getByRole('heading', { name: /^Grade ·/ }).innerText()).replace(/\s+/g, ' ');
  r.axeTeacher = await axe(page);
  r.wide = await wide(page);
  if (act) {
    await page.getByRole('button', { name: 'Give an extension' }).click();
    await page.getByRole('combobox', { name: /^Student/ }).selectOption(ids[S]);
    await page.getByRole('button', { name: 'Give the extension' }).click();
    r.extToast = await toast(page);
    await page.getByRole('button', { name: 'Return grade' }).click();
    r.returnToast = await toast(page);
    const rawDetail = await call(T, P);
    r.saved = rawDetail.submissions.map((x) => `${x.student.name}: ${x.score} (raw ${x.rawScore}, ${x.latePenalty}%)`).join('; ');
    await page.getByRole('button', { name: 'Let them hand in again' }).click();
    await page.getByRole('button', { name: 'Let them', exact: true }).click();
    r.reopenToast = await toast(page);
  }
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
// Alice: her grade with the penalty, reopened; John: his extension. Both 390, light.
for (const [who, label] of [[A, 'alice'], [S, 'john']]) {
  const ctx = await context(browser, who);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/student/assignments/${asg.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText(/^Due /).first().waitFor({ timeout: 20_000 });
  out.push({ who: label, due: await page.getByText(/^Due /).first().innerText(), rules: await page.getByText(/Late work loses/).first().innerText().catch(() => ''), graded: await page.getByText(/^Graded:/).innerText().catch(() => ''), penalty: await page.getByText(/less 20% for handing it in/).innerText().catch(() => ''), reopened: await page.getByText(/let you hand in again/).count(), canWrite: await page.locator('#answer').count(), axe: await axe(page), errors });
  await ctx.close();
}
// Class list: extra time for John.
{
  const ctx = await context(browser, T, { width: 390 });
  const page = await ctx.newPage();
  await page.goto(`${base}/teacher/blackboard?course=${C}&tab=grades`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText(/^Students \(/).click();
  await page.getByRole('button', { name: 'Extra time for John Doe' }).click();
  const dlg = page.getByRole('dialog', { name: 'Extra time for John Doe' });
  await dlg.getByLabel('Extra days on assignment due dates').fill('2');
  await dlg.getByLabel('Extra time on timed quizzes (%)').fill('25');
  const axeSheet = await axe(page);
  await dlg.getByRole('button', { name: 'Save' }).click();
  const t = await toast(page);
  const chip = await page.getByText('+2 days · +25% time').count();
  out.push({ who: 'class list', toast: t, chip, axeSheet, axeList: await axe(page) });
  await call(T, `/api/courses/${C}/accommodations`, { studentId: ids[S], extraDays: 0, extraTimePct: 0 });
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
await call(T, P, null, 'DELETE');
