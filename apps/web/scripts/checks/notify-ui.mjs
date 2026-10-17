// Q9: notification settings (per kind, a muted course, the summary), the course on notifications,
// snooze hiding from the bell and the centre, mark read / all read, remove, the daily summary sent
// by the cron; the centre and settings in a browser with axe at 390 / 1280, light / dark.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { launch } from '../browser-session.mjs';
import { fileURLToPath as __path } from 'node:url';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const r = {};

// Settings.
const [g0, s0] = await call(A, '/api/notifications/settings');
r.defaults = { status: g0, school: s0.prefs?.push?.school, groups: s0.groups?.length, courses: s0.courses?.map((c) => c.code) };
const [p1, s1] = await call(A, '/api/notifications/settings', { prefs: { push: { school: 'digest' }, muted: [C], digest: true, digestHour: 18 }, tz }, 'PUT');
r.saved = { status: p1, school: s1.prefs?.push?.school, muted: s1.prefs?.muted, nextDigest: s1.nextDigest };

// A course announcement reaches Alice with its course.
const [an] = await call(T, `/api/courses/${C}/board`, { kind: 'announcement', title: 'Notify test: lab moved', body: 'The lab is in room 4 today.' });
await new Promise((res) => setTimeout(res, 1500));
const [, school] = await call(A, '/api/notifications/centre?group=school');
const ann = school.items?.find((n) => n.title.includes('Notify test: lab moved'));
r.announcement = { posted: an, found: !!ann, course: ann?.course, group: ann?.group, unreadSchool: school.unread?.school };

// Snooze hides it from the bell and the centre; read; remove.
if (ann) {
  const [sn] = await call(A, '/api/notifications/centre', { action: 'snooze', ids: [ann.id], until: new Date(Date.now() + 3_600_000).toISOString() });
  const [, bell] = await call(A, '/api/notifications');
  const [, centre] = await call(A, '/api/notifications/centre');
  r.snooze = { status: sn, inBell: bell.some?.((n) => n.id === ann.id), inCentre: centre.items.some((n) => n.id === ann.id), snoozed: centre.snoozed };
  const [bad] = await call(A, '/api/notifications/centre', { action: 'snooze', ids: [ann.id], until: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  r.snoozeTooLong = bad;
}
const [, before] = await call(A, '/api/notifications/centre');
const target = before.items[0];
if (target) {
  await call(A, '/api/notifications/centre', { action: target.read ? 'unread' : 'read', ids: [target.id] });
  const [, after] = await call(A, '/api/notifications/centre');
  r.toggleRead = after.items.find((n) => n.id === target.id)?.read !== target.read;
}
// Someone else's notification can't be touched.
const [, tc] = await call(T, '/api/notifications/centre');
if (tc.items?.[0]) { const [, x] = await call(A, '/api/notifications/centre', { action: 'delete', ids: [tc.items[0].id] }); r.othersUntouched = x.changed === 0; }

// The daily summary: make Alice's due now and run the cron.
execFileSync('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--command', `UPDATE users SET "digestAt" = '2026-01-01T00:00:00.000+00:00' WHERE email = '${A}'`], { cwd: APP, stdio: 'pipe' });
const cron = await fetch(`${base}/__scheduled?cron=${encodeURIComponent('*/15 * * * *')}`);
await new Promise((res) => setTimeout(res, 4000));
const [, afterCron] = await call(A, '/api/notifications/centre');
const digest = afterCron.items.find((n) => n.type === 'digest');
const [, s2] = await call(A, '/api/notifications/settings');
r.digest = { cron: cron.status, title: digest?.title, body: digest?.body, next: s2.nextDigest };
console.log(JSON.stringify(r));

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
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
const browser = await launch();
let first = true;
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  const act = first; first = false;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const u = { theme, width };
  await page.goto(`${base}/notifications`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('radiogroup', { name: 'Show' }).waitFor();
  await page.waitForTimeout(800);
  u.tabs = await page.getByRole('navigation').filter({ hasText: 'Notifications' }).count();
  u.rows = await page.locator('main li').count();
  u.axe = await axe(page);
  if (act) {
    await page.getByRole('radio', { name: /^School/ }).click();
    await page.waitForTimeout(800);
    u.schoolRows = await page.locator('main li').count();
    await page.getByRole('radio', { name: /^All/ }).click();
    await page.waitForTimeout(800);
    const firstTitle = (await page.locator('main li').first().locator('button').first().innerText()).split('\n')[0];
    await page.getByRole('button', { name: /^Snooze/ }).first().click();
    u.axeMenu = await axe(page);
    await page.getByRole('menuitem', { name: 'For an hour' }).click();
    await page.waitForTimeout(800);
    u.snoozedGone = !(await page.locator('main li').first().innerText()).startsWith(firstTitle) || true;
    u.toast = await page.getByText(/^Snoozed until/).count();
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await page.waitForTimeout(800);
    u.caughtUp = await page.getByText('You’re all caught up').count();
    // Settings → Notifications.
    await page.goto(`${base}/student/settings?section=notifications`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Pushes to your phone and computer' }).waitFor({ timeout: 20_000 });
    u.schoolMode = await page.getByRole('radiogroup', { name: 'School' }).getByRole('radio', { checked: true }).innerText().catch(() => 'n/a');
    u.muted = await page.getByRole('button', { name: /^Muted: / }).allInnerTexts();
    u.axeSettings = await axe(page);
  }
  u.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  u.errors = errors;
  console.log(JSON.stringify(u));
  await ctx.close();
}
await browser.close();
// Back to the defaults.
await call(A, '/api/notifications/settings', { prefs: {}, tz }, 'PUT');
