// Q5 screens on the built Worker: discussion, announcements, teaching team, copy dialog.
import { createRequire } from 'node:module';
import { launch } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787';
const C = 'cmulde0g900147d341qn9mxlw';
const results = [];
const log = (x) => { results.push(x); console.log(JSON.stringify(x)); };

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([t, user, th]) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 }));
    localStorage.setItem('theme', th);
  }, [token, me, theme]);
  return ctx;
}
async function axe(page) {
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const browser = await launch();
for (const theme of ['light', 'dark']) {
  for (const width of [390, 1280]) {
    // Teacher: discussion, announcements, team, copy.
    const ctx = await context(browser, 'demo@teacher.com', { width, theme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/teacher/blackboard?course=${C}&tab=discussion`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Discussion' }).waitFor({ timeout: 20_000 });
    const threads = await page.locator('button:has-text("repl")').count();
    const axeList = await axe(page);
    await page.locator('button:has-text("repl")').first().click();
    await page.getByRole('button', { name: 'All posts' }).waitFor({ timeout: 10_000 });
    const draftBtn = await page.getByRole('button', { name: 'Draft an answer with AI' }).count();
    const axeThread = await axe(page);
    const wideThread = await wide(page);
    await page.getByRole('button', { name: 'All posts' }).click();
    // Announcements tab with the schedule option.
    await page.getByRole('button', { name: 'Announcements', exact: true }).click();
    await page.getByRole('button', { name: /^Post$/ }).click().catch(() => {});
    await page.getByLabel('Send later').check();
    const dateField = await page.locator('input[type="datetime-local"]').count();
    const seenText = await page.locator('text=/Seen by \\d+ of \\d+/').count();
    const axeAnn = await axe(page);
    // Teaching team sheet.
    await page.getByRole('button', { name: 'Teaching team' }).click();
    await page.getByRole('dialog', { name: 'Teaching team' }).waitFor({ timeout: 10_000 });
    await page.getByText('Tara Mehta').waitFor({ timeout: 10_000 });
    const axeTeam = await axe(page);
    await page.getByRole('dialog', { name: 'Teaching team' }).getByRole('button', { name: 'Close' }).click();
    // Copy dialog (opened, not run here).
    await page.getByRole('button', { name: 'Copy to a new term' }).click();
    await page.getByRole('dialog', { name: 'Copy to a new term' }).waitFor({ timeout: 10_000 });
    const codeValue = await page.getByLabel('New course code').inputValue();
    const axeCopy = await axe(page);
    log({ who: 'teacher', theme, width, threads, draftBtn, dateField, seenText, codeValue, axe: { list: axeList, thread: axeThread, announcements: axeAnn, team: axeTeam, copy: axeCopy }, wideThread, errors });
    await ctx.close();
  }
}

// Student at 390: ask an anonymous question, see it listed as theirs.
{
  const ctx = await context(browser, 'alice@student.com');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/student/blackboard?course=${C}&tab=discussion`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'New post' }).click();
  await page.getByLabel('Title').fill('Is the quiz open book?');
  await page.getByLabel('Details').fill('Can we use our notes during the loops quiz?');
  await page.getByLabel(/Hide my name from classmates/).check();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByRole('button', { name: 'All posts' }).waitFor({ timeout: 10_000 });
  const heading = await page.getByRole('heading', { name: 'Is the quiz open book?' }).count();
  const hidden = await page.getByText('(hidden from classmates)').count();
  await page.getByLabel('Your reply').fill('Adding: I mean printed notes.');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.waitForTimeout(1200);
  const replies = await page.getByText('Adding: I mean printed notes.').count();
  const axeS = await axe(page);
  log({ who: 'student', heading, hidden, replies, axe: axeS, wide: await wide(page), errors });
  await ctx.close();
}

// Teaching assistant at 390: roster in Grades, quizzes without Manage.
{
  const ctx = await context(browser, 'tom@teacher.com');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/teacher/blackboard?course=${C}&tab=quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const manage = await page.getByRole('button', { name: 'Manage' }).count();
  const copyBtn = await page.getByRole('button', { name: 'Copy to a new term' }).count();
  const teamBtn = await page.getByRole('button', { name: 'Teaching team' }).count();
  const post = await page.getByRole('button', { name: /^Post$/ }).count();
  log({ who: 'assistant', manage, copyBtn, teamBtn, post, errors });
  await ctx.close();
}
await browser.close();
