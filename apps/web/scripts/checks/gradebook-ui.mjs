// Post grades, grade history and the grading scale page in the browser.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', ADMIN = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const x of await call(T, `/api/assignments?courseId=${C}`)) if (x.title === 'Post UI test') await call(T, `/api/assignments/${x.id}`, null, 'DELETE');
const a = await call(T, '/api/assignments', { courseId: C, title: 'Post UI test', instructions: 'Write.', rubric: [{ criterion: 'C', points: 10 }], postPolicy: 'MANUAL' });
await call(A, `/api/assignments/${a.id}/submission`, { text: 'An answer long enough to hand in for grading.' }, 'PUT');
const d = await call(T, `/api/assignments/${a.id}`);
await call(T, `/api/assignments/submissions/${d.submissions[0].id}/return`, { criteria: d.rubric.map((r) => ({ id: r.id, score: 8 })), feedback: 'Well done' });

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
// Alice before posting: her answer, no grade.
{
  const ctx = await context(browser, A);
  const page = await ctx.newPage();
  await page.goto(`${base}/student/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText('Your answer').first().waitFor({ timeout: 20_000 });
  out.push({ who: 'alice before', graded: await page.getByText(/^Graded:/).count(), feedback: await page.getByText('Well done').count() });
  await ctx.close();
}
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { theme, width };
  await page.goto(`${base}/teacher/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('summary', { hasText: 'Rules and extensions' }).click();
  r.held = await page.getByText(/graded, not posted yet/).count();
  r.chip = await page.getByText(/· not posted/).count();
  r.axeAssignment = await axe(page);
  if (act) {
    await page.getByRole('button', { name: /^Post 1 grade/ }).click();
    await page.getByRole('button', { name: 'Post them' }).click();
    r.posted = await toast(page);
  }
  await page.goto(`${base}/teacher/grades`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Grade history' }).click();
  const sheet = page.getByRole('dialog', { name: 'Grade history' });
  await sheet.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  r.historyRows = await sheet.locator('li').count();
  r.axeHistory = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
{
  const ctx = await context(browser, A);
  const page = await ctx.newPage();
  await page.goto(`${base}/student/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText(/^Graded:/).waitFor({ timeout: 20_000 }).catch(() => {});
  out.push({ who: 'alice after', graded: (await page.getByText(/^Graded:/).innerText().catch(() => '')).trim(), feedback: await page.getByText('Well done').count() });
  await ctx.close();
}
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, ADMIN, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/admin/reports/grading-scale`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: /scale/ }).first().waitFor({ timeout: 20_000 });
  out.push({ who: 'admin scale', theme, width, bands: await page.getByRole('textbox', { name: /Band \d+ name/ }).count(), example: await page.getByText(/For example: 95% is A/).count(), tab: await page.getByRole('link', { name: 'Grading scale' }).count(), axe: await axe(page), wide: await wide(page), errors });
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
