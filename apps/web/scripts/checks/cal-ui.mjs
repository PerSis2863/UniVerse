// Q12 in a browser on the built Worker (time zone Asia/Kolkata): a student taps empty time for a new
// event, drags it an hour later (Undo puts it back), drags its bottom edge, drags it to the next day,
// opens it, sees it in Agenda, imports a calendar file; on a phone (touch) the + menu's Event, and a
// long press then drag; a teacher's weekly office hours and deleting the series; the admin's
// Plan a week and Exams. axe at 390 / 1280 px, light / dark.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch } from '../browser-session.mjs';
import { fileURLToPath as __path } from 'node:url';
import { tmpdir as __tmp } from 'node:os';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const SCRATCH = __tmp();
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787';
const A = 'alice@student.com', T = 'demo@teacher.com', ADM = 'demo@admin.com';

const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const TZ = 'Asia/Kolkata';
const local = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const out = (x) => console.log(JSON.stringify(x));

async function context(browser, email, { width = 1280, theme = 'light', touch = false } = {}) {
  const token = `mock-token-${email}`;
  const u = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, u, theme]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const mineNamed = async (title) => (await call(A, '/api/core/calendar/my'))[1].find((e) => e.title === title);

// Next Monday, as the grid names its column.
const monday = new Date(); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
const colName = (d) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }).format(d);
const tuesday = new Date(monday.getTime() + 86_400_000);

const browser = await launch();
const errors = [];
if (!process.env.SKIP1) {
  // ── Student, desktop, light: make, drag, resize, move a day, open, agenda, import ──
  const ctx = await context(browser, A);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const u = { who: 'student-desktop' };
  await page.goto(`${base}/student/calendar`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('region', { name: /^Your timetable/ }).waitFor({ timeout: 20_000 });
  u.axeWeek = await axe(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const col = page.getByRole('group', { name: colName(monday) });
  await col.waitFor({ timeout: 10_000 });
  // Let the days finish sliding in before measuring.
  await page.waitForTimeout(900);
  // 3 PM on the hour labels.
  const hourY = async (label) => page.evaluate((l) => { const s = [...document.querySelectorAll('section span')].find((x) => x.textContent === l && x.closest('[aria-hidden]')); const r = s?.getBoundingClientRect(); return r ? r.top + r.height / 2 : null; }, label);
  const box = await col.boundingBox();
  const y3 = await hourY('3 PM'), y4 = await hourY('4 PM');
  const hh = y4 - y3;
  await page.mouse.click(box.x + box.width / 2, y3 + 4);
  const sheet = page.getByRole('dialog', { name: 'New event' });
  await sheet.waitFor({ timeout: 5000 });
  u.prefilled = [await sheet.getByLabel('Starts').inputValue(), await sheet.getByLabel('Ends').inputValue()];
  u.axeSheet = await axe(page);
  await sheet.getByLabel('Title').fill('Chem revision');
  await sheet.getByLabel('Kind').selectOption('FOCUS');
  await sheet.getByRole('button', { name: 'Save' }).click();
  const block = () => page.getByRole('button', { name: /^Chem revision/ });
  await block().waitFor({ timeout: 10_000 });
  let e = await mineNamed('Chem revision');
  u.made = local(e.startAt) + ' – ' + local(e.endAt);
  // Drag it an hour later.
  const drag = async (fromX, fromY, dx, dy) => { await page.mouse.move(fromX, fromY); await page.mouse.down(); for (let i = 1; i <= 6; i++) await page.mouse.move(fromX + (dx * i) / 6, fromY + (dy * i) / 6); await page.mouse.up(); await page.waitForTimeout(1200); };
  let b = await block().boundingBox();
  await drag(b.x + b.width / 2, b.y + 12, 0, hh);
  e = await mineNamed('Chem revision');
  u.draggedHour = local(e.startAt) + ' – ' + local(e.endAt);
  u.toast = (await page.locator('[data-sonner-toast]').first().innerText()).replace(/\s+/g, ' ');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(1200);
  e = await mineNamed('Chem revision');
  u.undone = local(e.startAt);
  // The bottom edge, half an hour longer.
  b = await block().boundingBox();
  await drag(b.x + b.width / 2, b.y + b.height - 3, 0, hh / 2);
  e = await mineNamed('Chem revision');
  u.resized = local(e.startAt) + ' – ' + local(e.endAt);
  // To Tuesday, same time.
  b = await block().boundingBox();
  await drag(b.x + b.width / 2, b.y + 12, box.width, 0);
  e = await mineNamed('Chem revision');
  u.nextDay = local(e.startAt) + ' – ' + local(e.endAt);
  u.inTuesday = await page.getByRole('group', { name: colName(tuesday) }).getByRole('button', { name: /^Chem revision/ }).count();
  // A click opens it to change.
  await block().click();
  const edit = page.getByRole('dialog', { name: 'Edit event' });
  await edit.waitFor({ timeout: 5000 });
  u.editTitle = await edit.getByLabel('Title').inputValue();
  await page.keyboard.press('Escape');
  // Agenda.
  await page.getByRole('button', { name: 'Agenda' }).click();
  u.agendaTitle = await page.getByRole('region', { name: /^Your timetable/ }).getAttribute('aria-label');
  await page.getByRole('button', { name: /Chem revision/ }).first().waitFor({ timeout: 5000 });
  u.axeAgenda = await axe(page);
  // Import a calendar file: a weekly event three times.
  const d0 = new Date(monday.getTime() + 2 * 86_400_000);
  const ymd = `${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}${String(d0.getDate()).padStart(2, '0')}`;
  writeFileSync(`${SCRATCH}/football.ics`, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART;TZID=Asia/Kolkata:${ymd}T170000`, `DTEND;TZID=Asia/Kolkata:${ymd}T183000`, 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Football practice', 'LOCATION:Main ground', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
  await page.locator('input[type=file][accept*="ics"]').setInputFiles(`${SCRATCH}/football.ics`);
  await page.getByText(/Added 3 events from “football”/).waitFor({ timeout: 10_000 });
  const foot = (await call(A, '/api/core/calendar/my'))[1].filter((x) => x.title === 'Football practice');
  u.imported = foot.map((x) => local(x.startAt));
  u.agendaFootball = await page.getByRole('button', { name: /Football practice/ }).count();
  u.wide = await wide(page);
  out(u);
  await ctx.close();
}
for (const theme of process.env.SKIP2 ? [] : ['light', 'dark']) {
  // ── Student, phone, touch: + → Event, then a long press and drag ──
  const ctx = await context(browser, A, { width: 390, theme, touch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const u = { who: 'student-phone', theme };
  await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Quick create' }).click();
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New event' });
  await sheet.waitFor({ timeout: 15_000 });
  u.plusOpens = page.url().endsWith('/student/calendar');
  u.axeSheet = await axe(page);
  await page.keyboard.press('Escape');
  await page.getByRole('region', { name: /^Your timetable/ }).waitFor();
  u.axe = await axe(page);
  u.wide = await wide(page);
  if (theme === 'light' && !process.env.SKIP1) {
    // 4 days from today: go forward until Tuesday's column shows.
    for (let i = 0; i < 3 && !(await page.getByRole('group', { name: colName(tuesday) }).count()); i++) { await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(500); }
    const blk = page.getByRole('group', { name: colName(tuesday) }).getByRole('button', { name: /^Chem revision/ });
    await blk.waitFor({ timeout: 10_000 });
    await blk.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(600);
    const before = local((await mineNamed('Chem revision')).startAt);
    const b = await blk.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const x = b.x + b.width / 2, y = b.y + 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(650);
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (56 * i) / 8 }] }); await page.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1500);
    u.longPressDrag = [before, local((await mineNamed('Chem revision')).startAt)];
    u.sheetAfterDrag = await page.getByRole('dialog').count();
  }
  out(u);
  await ctx.close();
}
if (!process.env.SKIP2) {
  // ── Teacher: weekly office hours, then delete the series ──
  const ctx = await context(browser, T);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const u = { who: 'teacher' };
  await page.goto(`${base}/teacher/calendar`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Office hours' }).click();
  const sheet = page.getByRole('dialog', { name: 'New event' });
  await sheet.waitFor();
  u.preset = [await sheet.getByLabel('Title').inputValue(), await sheet.getByLabel('Kind').inputValue(), await sheet.getByLabel('Repeat').inputValue()];
  u.showTo = await sheet.getByLabel('Show to').locator('option').count();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Added for 12 weeks').waitFor({ timeout: 10_000 });
  const [, evs] = await call(T, '/api/core/calendar/my');
  const oh = evs.filter((x) => x.title === 'Office hours' && x.type === 'OFFICE_HOURS');
  u.officeHours = { count: oh.length, sameBatch: new Set(oh.map((x) => x.batch)).size === 1, first: local(oh[0]?.startAt) };
  await page.getByRole('button', { name: 'Agenda' }).click();
  await page.getByRole('button', { name: /^Office hours/ }).first().waitFor();
  await page.getByRole('button', { name: /Office hours/ }).nth(1).click();
  const edit = page.getByRole('dialog', { name: 'Edit event' });
  await edit.waitFor();
  await edit.getByRole('button', { name: 'Delete series' }).click();
  await page.getByRole('button', { name: 'Delete all' }).click();
  await page.getByText('Series deleted').waitFor({ timeout: 10_000 });
  u.afterDelete = (await call(T, '/api/core/calendar/my'))[1].filter((x) => x.title === 'Office hours' && x.type === 'OFFICE_HOURS').length;
  u.axe = await axe(page);
  out(u);
  await ctx.close();
}
// A clash for the admin to see: a class of a course sharing 3 students with CS101, at the time of a CS101 class.
const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--command', q], { cwd: APP, stdio: 'pipe' }).toString();
sql(`INSERT OR REPLACE INTO timetable_slots (id, courseId, dayOfWeek, startTime, endTime, roomId, type, createdAt, updatedAt) SELECT 'qclash1', 'cmulde0i500167d342f83i9cq', dayOfWeek, startTime, endTime, NULL, 'LECTURE', createdAt, updatedAt FROM timetable_slots WHERE courseId = 'cmulde0g900147d341qn9mxlw' LIMIT 1`);
let first = true;
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  // ── Admin: clashes, Plan a week, Exams ──
  const ctx = await context(browser, ADM, { width, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const u = { who: 'admin', theme, width };
  await page.goto(`${base}/admin/timetable`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('group', { name: 'Show' }).waitFor({ timeout: 20_000 });
  u.clashBanner = await page.getByRole('status').filter({ hasText: /clash/ }).first().innerText({ timeout: 8000 }).catch(() => null);
  u.clashMarks = await page.getByText(/of its students also have/).allInnerTexts();
  u.axeClasses = await axe(page);
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Plan a week' }).click();
  await page.getByRole('button', { name: 'Work out a week' }).click();
  const res = page.getByRole('heading', { name: /classes placed/ });
  await res.waitFor({ timeout: 15_000 });
  u.week = await res.innerText();
  u.axePlan = await axe(page);
  u.widePlan = await wide(page);
  if (first) {
    await page.getByRole('button', { name: 'Use this timetable' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use this timetable' }).click();
    await page.waitForTimeout(1500);
    u.saveAsDemoAdmin = await page.locator('[data-sonner-toast]').allInnerTexts();
  }
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Exams' }).click();
  await page.getByRole('button', { name: 'Work out exams' }).click();
  const ex = page.getByRole('heading', { name: /exams placed/ });
  await ex.waitFor({ timeout: 15_000 });
  u.exams = await ex.innerText();
  u.examDays = await page.locator('ol > li h3').allInnerTexts();
  u.axeExams = await axe(page);
  u.wideExams = await wide(page);
  first = false;
  out(u);
  await ctx.close();
}
await browser.close();
sql(`DELETE FROM timetable_slots WHERE id = 'qclash1'`);
out({ errors });
// Tidy up.
for (const t of ['Chem revision', 'Football practice']) { const e = await mineNamed(t); if (e) await call(A, `/api/core/calendar/${e.id}${e.batch ? '?series=1' : ''}`, undefined, 'DELETE'); }
