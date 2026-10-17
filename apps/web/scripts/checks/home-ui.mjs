// Q8 home pages: Up next changing as the time passes (a class call 12 min away → Join at 10 min →
// "Now"), Edit home (hide, move, remembered after a reload), the daily goal, the teacher's needs
// attention and create cards, the admin's live numbers, the phone's "+" menu; axe at 390 / 1280,
// light / dark; no sideways scroll.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', S = 'demo@student.com', A = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };

// A class call in 12 minutes, and a clean layout for the student.
const startAt = new Date(Date.now() + 12 * 60_000);
const [st, made] = await call(T, '/api/calls/scheduled', { room: 'class', roomId: C, title: 'Home test call', startAt: startAt.toISOString(), durationMin: 30, kind: 'video' });
console.log('scheduled', st, made.id ?? made);
await call(S, '/api/home/layout', { order: [], hidden: [], goal: 3 }, 'PUT');
const [hs, home] = await call(S, `/api/home?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
console.log('student /api/home', hs, { upNext: home.upNext?.map((u) => `${u.kind}:${u.title}`), study: !!home.study });
const [ths, thome] = await call(T, '/api/home');
console.log('teacher /api/home', ths, { upNext: thome.upNext?.map((u) => `${u.kind}:${u.title}`), attention: thome.attention && Object.keys(thome.attention) });
const [ahs, ahome] = await call(A, '/api/home');
console.log('admin /api/home', ahs, ahome.live ?? ahome);

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); localStorage.setItem('universe-tour-done', '1'); }, [token, me, theme]);
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

// 1. The student: Up next over time, Edit home, goal.
{
  const ctx = await context(browser, S, { width: 1280 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: Date.now() });
  await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
  const up = page.getByRole('region', { name: 'Up next' });
  await up.getByText('Home test call').first().waitFor({ timeout: 20_000 });
  const r = { who: 'student' };
  r.before = (await up.innerText()).split('\n').filter((l) => /Home test call|In \d+ min|Join/.test(l)).join(' | ');
  await page.clock.fastForward('03:00');
  await page.waitForTimeout(300);
  r.at9 = (await up.getByRole('link', { name: /^Join: Home test call/ }).count()) > 0;
  await page.clock.fastForward('10:00');
  await page.waitForTimeout(300);
  r.live = (await up.getByText(/^Now · until/).count()) > 0;
  r.goal = (await page.getByRole('region', { name: 'Daily goal' }).innerText()).split('\n').slice(0, 3).join(' | ');
  // Edit home: hide the impact banner and the streak, move the goal down, then reload.
  await page.getByRole('button', { name: 'Edit home' }).click();
  await page.getByRole('button', { name: 'Move Daily goal down' }).click();
  await page.getByRole('button', { name: 'Hide' }).nth(2).click(); // the third top card: Impact network
  r.axeEdit = await axe(page);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(800);
  const [, saved] = await call(S, '/api/home');
  r.saved = { hidden: saved.layout.hidden, side: saved.layout.order.filter((x) => ['goal', 'level', 'streak', 'deadlines', 'grades'].includes(x)).slice(0, 2) };
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('region', { name: 'Up next' }).waitFor();
  r.afterReloadImpact = await page.getByRole('link', { name: /Browse/ }).count();
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}

// 2. The teacher: Up next with the call, needs attention, create.
{
  const ctx = await context(browser, T, { width: 1280 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/teacher`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('region', { name: 'Up next' }).getByText('Home test call').first().waitFor({ timeout: 20_000 });
  const r = { who: 'teacher' };
  r.attention = (await page.getByRole('region', { name: 'Needs attention' }).innerText()).split('\n').slice(0, 6).join(' | ');
  r.create = await page.getByRole('region', { name: 'Create' }).getByRole('link').count();
  r.errors = errors;
  console.log(JSON.stringify(r));
  await ctx.close();
}

// 3. Every home in both themes and widths: axe and no sideways scroll; the admin's live numbers.
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) for (const [who, path] of [[S, '/student'], [T, '/teacher'], [A, '/admin']]) {
  const ctx = await context(browser, who, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1200);
  const r = { theme, width, path, axe: await axe(page), wide: await wide(page), errors };
  if (who === A) r.live = (await page.getByRole('region', { name: 'Today, live' }).innerText().catch(() => 'missing')).split('\n').slice(0, 8).join(' | ');
  // The phone's "+" menu.
  if (width === 390 && theme === 'light' && who === S) {
    await page.getByRole('button', { name: 'Quick create' }).click();
    const sheet = page.getByRole('dialog', { name: 'Quick create' });
    r.plus = await sheet.getByRole('button').allInnerTexts();
    r.axePlus = await axe(page);
    await sheet.getByRole('button', { name: 'Document' }).click();
    await page.waitForURL(/\/docs/);
    await page.getByPlaceholder('Lab report').waitFor({ timeout: 15_000 }).then(() => { r.docForm = true; }, () => { r.docForm = false; });
    await page.getByRole('button', { name: 'Quick create' }).click();
    await page.getByRole('dialog', { name: 'Quick create' }).getByRole('button', { name: 'Message' }).click();
    await page.waitForURL(/inbox/);
    await page.getByRole('heading', { name: 'New chat' }).waitFor({ timeout: 15_000 }).then(() => { r.chatDialog = true; }, () => { r.chatDialog = false; });
    r.url = page.url().replace(base, '');
  }
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
if (made.id) await call(T, `/api/calls/scheduled/${made.id}`, null, 'DELETE');
await call(S, '/api/home/layout', { order: [], hidden: [], goal: 3 }, 'PUT');
