// File and link hand-ins and group work in the browser on the built Worker.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { launch } from '../browser-session.mjs';
import { tmpdir as __tmp } from 'node:os';
const SCRATCH = __tmp();
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', S = 'demo@student.com', A = 'alice@student.com', BOB = 'bob@student.com';
const DIR = `${SCRATCH}/cc`;
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
writeFileSync(`${DIR}/essay.pdf`, pdf);
const ids = Object.fromEntries((await call(T, `/api/courses/${C}/enrolment`)).students.map((s) => [s.email, s.id]));
const clean = async () => { for (const a of await call(T, `/api/assignments?courseId=${C}`)) if (a.title.startsWith('UI ')) await call(T, `/api/assignments/${a.id}`, null, 'DELETE'); };
await clean();
const mk = (title, extra) => call(T, '/api/assignments', { courseId: C, title, instructions: 'Do the task.', rubric: [{ criterion: 'Content', points: 10 }], ...extra });
const file = await mk('UI file test', { submitKind: 'FILE' });
const link = await mk('UI link test', { submitKind: 'LINK' });
const grp = await mk('UI group test', { groupMode: 'SHARED' });
const up = await fetch(`${base}/api/upload?filename=essay.pdf`, { method: 'POST', headers: { Authorization: `Bearer mock-token-${A}`, 'Content-Type': 'application/pdf' }, body: pdf }).then((r) => r.json());
await call(A, `/api/assignments/${file.id}/submission`, { fileUrl: up.url, fileName: 'essay.pdf', fileSize: pdf.length, text: 'My essay is attached.' }, 'PUT');
const team = await call(T, `/api/assignments/${grp.id}/groups`, { action: 'add', name: 'Team' });
for (const who of [A, BOB]) await call(T, `/api/assignments/${grp.id}/groups`, { action: 'move', studentId: ids[who], groupId: team.id });
await call(A, `/api/assignments/${grp.id}/submission`, { text: 'Our group answer, long enough to hand in for everyone.' }, 'PUT');

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
const toast = async (page) => (await page.locator('[data-sonner-toast]').last().innerText({ timeout: 15_000 }).catch(() => '')).split('\n')[0];

const browser = await launch();
const out = [];
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { theme, width };
  // A file hand-in in the grader.
  await page.goto(`${base}/teacher/assignments/${file.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: /^Alice Johnson/ }).waitFor({ timeout: 20_000 });
  r.file = await page.getByText('essay.pdf').count();
  r.note = await page.getByText('Their note').count();
  r.aiButton = await page.getByRole('button', { name: /Draft with AI/ }).count();
  r.axeFile = await axe(page);
  // The group assignment: the Groups panel and the grader.
  await page.goto(`${base}/teacher/assignments/${grp.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: /^Team/ }).waitFor({ timeout: 20_000 });
  r.groupHeading = (await page.getByRole('heading', { name: /^Team/ }).innerText()).replace(/\s+/g, ' ');
  await page.locator('summary', { hasText: /^Groups/ }).click();
  r.groupsPanel = await page.getByRole('button', { name: 'Make random groups' }).count();
  r.notInGroup = await page.getByText(/Not in a group: John Doe/).count();
  r.axeGroup = await axe(page);
  r.wide = await wide(page);
  // The new-assignment form has the two new choices.
  await page.goto(`${base}/teacher/assignments`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /New assignment/ }).first().click();
  r.formKinds = await page.getByRole('combobox', { name: /Students hand in/ }).locator('option').allInnerTexts();
  r.axeForm = await axe(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
// Students: Bob sees his group's hand-in; John hands in a file and a link.
{
  const ctx = await context(browser, BOB);
  const page = await ctx.newPage();
  await page.goto(`${base}/student/assignments/${grp.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText(/^Group work:/).waitFor({ timeout: 20_000 });
  out.push({ who: 'bob', group: await page.getByText(/^Group work:/).innerText(), answer: await page.locator('#answer').inputValue().catch(() => ''), axe: await axe(page) });
  await ctx.close();
}
{
  const ctx = await context(browser, S);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/student/assignments/${grp.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const noGroup = await page.getByText(/you’re not in a group yet/).count();
  await page.goto(`${base}/student/assignments/${file.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'What you hand in' }).waitFor({ timeout: 20_000 });
  const axeFile = await axe(page);
  await page.locator('input[type="file"]').setInputFiles(`${DIR}/essay.pdf`);
  await page.getByText(/^essay\.pdf/).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Hand in', exact: true }).click();
  const fileToast = await toast(page);
  await page.goto(`${base}/student/assignments/${link.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByLabel('Your link').fill('https://example.com/my-video');
  await page.getByRole('button', { name: 'Hand in', exact: true }).click();
  const linkToast = await toast(page);
  await page.waitForTimeout(800);
  const linkShown = await page.getByText('example.com').count();
  out.push({ who: 'john', noGroup, axeFile, fileToast, linkToast, linkShown, errors });
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
await clean();
