// Notes on hand-ins in the browser: words in a typed answer, a box on a PDF page, the student's view.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const x of await call(T, `/api/assignments?courseId=${C}`)) if (x.title.startsWith('Notes UI')) await call(T, `/api/assignments/${x.id}`, null, 'DELETE');
const text = 'Loops repeat steps. A for loop counts; a while loop waits for something to happen.';
const tA = await call(T, '/api/assignments', { courseId: C, title: 'Notes UI text', instructions: 'Write.', rubric: [{ criterion: 'C', points: 5 }] });
await call(A, `/api/assignments/${tA.id}/submission`, { text }, 'PUT');
const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 260]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const up = await fetch(`${base}/api/upload?filename=essay.pdf`, { method: 'POST', headers: { Authorization: `Bearer mock-token-${A}`, 'Content-Type': 'application/pdf' }, body: pdf }).then((r) => r.json());
const fA = await call(T, '/api/assignments', { courseId: C, title: 'Notes UI file', instructions: 'Upload.', rubric: [{ criterion: 'C', points: 5 }], submitKind: 'FILE' });
await call(A, `/api/assignments/${fA.id}/submission`, { fileUrl: up.url, fileName: 'essay.pdf', fileSize: pdf.length }, 'PUT');

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
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { theme, width };
  await page.goto(`${base}/teacher/assignments/${tA.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const notes = page.getByRole('region', { name: 'Notes for the student' });
  await notes.waitFor({ timeout: 20_000 });
  if (act) {
    // Select "A for loop counts" in the notes' copy of the answer.
    await notes.evaluate((el, words) => {
      const box = el.querySelector('.whitespace-pre-wrap');
      const node = [...box.childNodes].map((n) => n.firstChild ?? n).find((n) => n.textContent.includes(words));
      const i = node.textContent.indexOf(words);
      const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + words.length);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
      box.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, 'A for loop counts');
    await notes.getByRole('button', { name: 'Add a note on the selected words' }).click();
    await notes.getByLabel('Your note').fill('Good: give an example of each.');
    await notes.getByRole('button', { name: 'Add the note' }).click();
    r.textToast = await toast(page);
    r.marked = await notes.locator('mark').count();
  }
  r.axeText = await axe(page);
  // The PDF: draw a box on page 1.
  await page.goto(`${base}/teacher/assignments/${fA.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const fnotes = page.getByRole('region', { name: 'Notes for the student' });
  await fnotes.locator('canvas').first().waitFor({ timeout: 20_000 });
  if (act) {
    await fnotes.getByRole('button', { name: 'Draw a box on page 1' }).click();
    const layer = fnotes.locator('.cursor-crosshair').first();
    const b = await layer.boundingBox();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.35, { steps: 5 });
    await page.mouse.up();
    await fnotes.getByLabel('Your note').fill('This paragraph needs a source.');
    await fnotes.getByRole('button', { name: 'Add the note' }).click();
    r.boxToast = await toast(page);
    r.box = await fnotes.getByRole('button', { name: /^Note 1:/ }).count();
  }
  r.axeFile = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
// Graded: Alice sees the notes.
for (const id of [tA.id, fA.id]) {
  const d = await call(T, `/api/assignments/${id}`);
  await call(T, `/api/assignments/submissions/${d.submissions[0].id}/return`, { criteria: d.rubric.map((x) => ({ id: x.id, score: 4 })) });
}
{
  const ctx = await context(browser, A);
  const page = await ctx.newPage();
  await page.goto(`${base}/student/assignments/${tA.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const n = page.getByRole('region', { name: 'Your teacher’s notes' });
  await n.waitFor({ timeout: 20_000 });
  const r = { who: 'alice', textNote: await n.getByText('Good: give an example of each.').count(), draw: await n.getByRole('button', { name: /Draw a box|Add a note/ }).count(), axeText: await axe(page) };
  await page.goto(`${base}/student/assignments/${fA.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const fn = page.getByRole('region', { name: 'Your teacher’s notes' });
  await fn.locator('canvas').first().waitFor({ timeout: 20_000 });
  r.boxNote = await fn.getByRole('button', { name: /^Note 1:/ }).count();
  r.axeFile = await axe(page);
  out.push(r);
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
for (const id of [tA.id, fA.id]) await call(T, `/api/assignments/${id}`, null, 'DELETE');
