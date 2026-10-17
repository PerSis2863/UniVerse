// Question bank import in the browser: a GIFT file and a Canvas QTI package; the preview, what's
// skipped and why, the import, and the types stored. Axe at 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
import { tmpdir as __tmp } from 'node:os';
const SCRATCH = __tmp();
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const S = `${SCRATCH}/qfiles/`;
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
const bank = () => call(T, `/api/courses/${C}/question-bank`).then((r) => r.questions ?? []);
const MINE = /^(What is the capital of France\?|The sun is a star\.|Who wrote Hamlet\?|Match the animals\.|Largest planet \(QTI\)\?|Pi to two places \(QTI\)\?)$/;
const tidy = async () => { for (const q of await bank()) if (MINE.test(q.question)) await call(T, `/api/courses/${C}/question-bank`, { action: 'delete', questionId: q.id }); };
await tidy();
const toast = async (page, text) => (await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
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
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { theme, width, axe: [] };
  await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('radio', { name: 'Question bank' }).click().catch(() => page.getByRole('button', { name: 'Question bank' }).click());
  await page.getByLabel('Course').selectOption(C);
  await page.getByRole('button', { name: 'Import questions' }).waitFor({ timeout: 20_000 });
  await page.getByLabel('Question file to import').setInputFiles(S + 'moodle.txt');
  const sheet = page.getByRole('dialog', { name: 'Import questions' });
  await sheet.waitFor({ timeout: 10_000 });
  r.format = await sheet.getByText('GIFT', { exact: true }).count();
  r.ready = (await sheet.getByText(/questions? ready/).innerText()).trim();
  r.skipped = await sheet.locator('li', { hasText: 'Essay' }).innerText().catch(() => 'none');
  r.axe.push(...(await axe(page)).map((x) => `gift ${x}`));
  if (act) {
    await sheet.getByRole('button', { name: /^Import \d+ question/ }).click();
    r.toast = await toast(page, 'added to the bank');
    await page.getByLabel('Question file to import').setInputFiles(S + 'canvas-qti.zip');
    await sheet.waitFor({ timeout: 10_000 });
    r.qtiFormat = await sheet.getByText('QTI', { exact: true }).count();
    r.qtiReady = (await sheet.getByText(/questions? ready/).innerText()).trim();
    await sheet.getByRole('button', { name: /^Import \d+ question/ }).click();
    r.qtiToast = await toast(page, 'added to the bank');
    r.stored = (await bank()).filter((q) => MINE.test(q.question)).map((q) => `${q.type}:${q.correctAnswer}`).sort();
    r.listed = await page.getByText('Largest planet (QTI)?').count();
    r.axe.push(...(await axe(page)).map((x) => `list ${x}`));
  } else await sheet.getByRole('button', { name: /Close/ }).first().click();
  r.wide = await wide(page);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
await tidy();
