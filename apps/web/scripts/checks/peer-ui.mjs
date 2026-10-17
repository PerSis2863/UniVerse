// Peer review in the browser: the teacher's settings and "Hand out reviews", a student's review form,
// the reviews beside grading. 390 and 1280 px, light and dark, axe.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', S = 'demo@student.com', A = 'alice@student.com', BOB = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const x of await call(T, `/api/assignments?courseId=${C}`)) if (x.title === 'Peer UI test') await call(T, `/api/assignments/${x.id}`, null, 'DELETE');
const a = await call(T, '/api/assignments', { courseId: C, title: 'Peer UI test', instructions: 'Write about loops.', rubric: [{ criterion: 'Content', points: 6 }, { criterion: 'Clarity', points: 4 }] });
for (const [who, t] of [[S, 'John'], [A, 'Alice'], [BOB, 'Bob']]) await call(who, `/api/assignments/${a.id}/submission`, { text: `Answer ${t.length} about loops, long enough to hand in for review.` }, 'PUT');

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
// Teacher turns it on and hands out reviews (390, light), then every size checks the panel.
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/teacher/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('summary', { hasText: 'Rules and extensions' }).click();
  const r = { theme, width };
  if (act) {
    await page.getByLabel('Answers each student reviews').fill('2');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    r.saveToast = await toast(page);
    await page.getByRole('button', { name: 'Hand out reviews' }).click();
    r.handToast = await toast(page);
  }
  r.count = await page.getByText(/of 6 reviews done/).count();
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
// Alice reviews at 390 light; the other sizes check her page.
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/student/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Peer review' }).waitFor({ timeout: 20_000 });
  const r = { who: 'alice', theme, width, intro: (await page.getByText(/to review/).first().innerText().catch(() => '')).slice(0, 80), anonymous: !(await page.getByText(/John Doe|Bob Smith/).count()) };
  r.axe = await axe(page);
  if (act) {
    const form = page.locator('details', { hasText: 'Answer 1' });
    await form.getByLabel(/^Content/).fill('5');
    await form.getByLabel(/^Clarity/).fill('3');
    await form.getByLabel('What works, and one thing to improve').fill('Clear start; add an example of a while loop.');
    await form.getByRole('button', { name: 'Send review' }).click();
    r.sent = await toast(page);
    r.reviewed = await page.getByText('reviewed').count();
  }
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
// The teacher sees the review beside grading.
{
  const ctx = await context(browser, T, { width: 1280 });
  const page = await ctx.newPage();
  await page.goto(`${base}/teacher/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const d = await call(T, `/api/assignments/${a.id}`);
  const reviewed = d.peerReviewList.find((x) => x.status === 'DONE')?.submissionId;
  const name = d.submissions.find((x) => x.id === reviewed)?.student.name;
  if (name) await page.getByRole('navigation', { name: 'Submissions' }).getByText(name).click();
  out.push({ who: 'teacher grading', summary: await page.locator('summary', { hasText: 'Peer reviews' }).innerText().catch(() => ''), axe: await axe(page) });
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
