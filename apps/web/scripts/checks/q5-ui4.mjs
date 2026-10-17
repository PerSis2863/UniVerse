// Calendar tab, syllabus sheet and class list on the built Worker, 390 and 1280 px, light and dark, axe.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787';
const C = 'cmulde0g900147d341qn9mxlw', UI = 'cmv9cjlv40003psp7tz9audko';

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true });
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

const browser = await launch();
for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const ctx = await context(browser, 'demo@teacher.com', { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  // Calendar
  await page.goto(`${base}/teacher/blackboard?course=${C}&tab=calendar`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Due dates and events' }).waitFor({ timeout: 20_000 });
  const weekly = await page.locator('#weekly-h + ul li').count();
  const dated = await page.locator('section[aria-labelledby="dated-h"] li.panel').count();
  const axeCal = await axe(page);
  const wideCal = await wide(page);
  let downloaded = null;
  if (width === 390 && theme === 'light') {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.getByRole('button', { name: /Add to my calendar/ }).click()]);
    downloaded = dl.suggestedFilename();
  }
  // Grades: class list
  await page.goto(`${base}/teacher/blackboard?course=${UI}&tab=grades`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Class list' }).waitFor({ timeout: 20_000 });
  const axeList = await axe(page);
  const wideList = await wide(page);
  // Modules: syllabus sheet
  await page.goto(`${base}/teacher/blackboard?course=${UI}&tab=modules`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Draft a syllabus with AI' }).click();
  await page.getByRole('dialog', { name: 'Draft a syllabus with AI' }).waitFor({ timeout: 10_000 });
  const axeSyl = await axe(page);
  await page.getByRole('button', { name: 'Draft it' }).click();
  const toastText = await page.locator('[data-sonner-toast]').first().innerText({ timeout: 15_000 }).catch(() => '');
  console.log(JSON.stringify({ theme, width, weekly, dated, downloaded, axe: { calendar: axeCal, classList: axeList, syllabus: axeSyl }, wide: { cal: wideCal, list: wideList }, aiToast: toastText.slice(0, 80), errors }));
  await ctx.close();
}
// Student: calendar has no draft quiz; no class list.
{
  const ctx = await context(browser, 'demo@student.com');
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/student/blackboard?course=${C}&tab=calendar`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Due dates and events' }).waitFor({ timeout: 20_000 });
  const draft = await page.getByText('Draft midterm').count();
  const week4 = await page.getByText('Week 4 check').count();
  await page.goto(`${base}/student/blackboard?course=${C}&tab=grades`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const classList = await page.getByRole('heading', { name: 'Class list' }).count();
  console.log(JSON.stringify({ who: 'student', draft, week4, classList, errors }));
  await ctx.close();
}
await browser.close();
