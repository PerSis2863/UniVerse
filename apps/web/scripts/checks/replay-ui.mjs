// Writing replay in the browser: the student writes (typed, a paste, a reload that brings the draft
// back), hands in; the teacher opens "How it was written". 390 and 1280 px, light and dark, axe.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})); };
for (const x of await call(T, `/api/assignments?courseId=${C}`)) if (x.title.startsWith('Replay UI')) await call(T, `/api/assignments/${x.id}`, null, 'DELETE');
const a = await call(T, '/api/assignments', { courseId: C, title: 'Replay UI', instructions: 'Write about loops.', rubric: [{ criterion: 'Content', points: 10 }] });

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
const PASTE = 'A for loop runs a fixed number of times; a while loop runs until its condition is false. Both need a way to stop, or they run forever, which is the most common bug in loops that students write in their first programs.';
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'alice', theme, width };
  await page.goto(`${base}/student/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('#answer').waitFor({ timeout: 20_000 });
  r.note = await page.getByText(/Your teacher can replay how your answer grew/).count();
  if (act) {
    const box = page.locator('#answer');
    await box.click();
    await page.keyboard.type('Loops repeat steps. ', { delay: 5 });
    await page.evaluate((t) => navigator.clipboard.writeText(t), PASTE);
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForTimeout(1200); // the draft is saved
    await page.reload({ waitUntil: 'networkidle' });
    r.draftBack = await toast(page);
    await page.locator('#answer').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' The end.', { delay: 5 });
    await page.getByRole('button', { name: 'Hand in', exact: true }).click();
    r.handedIn = await toast(page);
  }
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
const d = await call(T, `/api/assignments/${a.id}`);
const sub = d.submissions?.[0];
const rep = sub ? await call(T, `/api/assignments/submissions/${sub.id}/replay`) : {};
out.push({ api: { matches: sub?.replayMatches, chunks: rep.replay?.chunks?.length, pastes: rep.replay?.chunks?.filter((c) => c.paste).map((c) => c.i.length) } });
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const r = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/assignments/${a.id}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const summary = page.locator('summary', { hasText: 'How it was written' });
  await summary.waitFor({ timeout: 20_000 });
  await summary.click();
  const slider = page.getByRole('slider', { name: 'Point in the writing' });
  await slider.waitFor({ timeout: 10_000 });
  r.stats = (await page.getByText(/^Written /).innerText()).slice(0, 120);
  r.pasteButton = await page.getByRole('button', { name: /^Paste: / }).count();
  await page.getByRole('button', { name: /^Paste: / }).first().click();
  r.amber = await page.locator('ins.bg-amber-400\\/30').count();
  await page.getByRole('button', { name: 'Play the replay' }).click();
  await page.waitForTimeout(1500);
  r.played = await slider.inputValue();
  r.axe = await axe(page);
  r.wide = await wide(page);
  r.errors = errors;
  out.push(r);
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
