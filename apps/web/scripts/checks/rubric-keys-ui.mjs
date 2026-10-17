// Rubric level keys in the grader: 0–5 picks a level and moves to the next criterion. Axe, 390/1280, light/dark.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const x of await call(T, `/api/assignments?courseId=${C}`)) if (x.title.startsWith('Keys UI')) await call(T, `/api/assignments/${x.id}`, null, 'DELETE');
const a = await call(T, '/api/assignments', { courseId: C, title: 'Keys UI', instructions: 'Write.', rubric: [{ criterion: 'Content', points: 10 }, { criterion: 'Style', points: 5 }, { criterion: 'Sources', points: 4 }] });
await call(A, `/api/assignments/${a.id}/submission`, { text: 'An answer long enough to hand in for grading.' }, 'PUT');
async function axe(page) {
  await page.waitForTimeout(400);
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const browser = await launch();
const token = `mock-token-${T}`;
const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, me, theme]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/teacher/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const row = page.getByRole('radiogroup', { name: /Level for Content/ });
  await row.waitFor({ timeout: 20_000 });
  const r = { theme, width };
  if (theme === 'light' && width === 390) {
    await row.getByRole('radio', { name: /^0 of 5/ }).focus();
    await page.keyboard.press('4');
    await page.keyboard.press('5');
    await page.keyboard.press('ArrowRight'); // nothing past the last criterion's row: stays
    await page.keyboard.press('2');
    r.scores = [await page.locator('input[id^="score-"]').nth(0).inputValue(), await page.locator('input[id^="score-"]').nth(1).inputValue(), await page.locator('input[id^="score-"]').nth(2).inputValue()];
    r.checked = await page.getByRole('radio', { checked: true }).count();
    r.focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    await page.locator('input[id^="score-"]').nth(0).fill('7');
    r.typedClears = await row.getByRole('radio', { checked: true }).count();
  }
  r.axe = await axe(page);
  r.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
