// Q11 attendance on the built Worker: bulk marks, the frequent-absence flag, suggestions from a
// class call, an excuse request answered (the day becomes Excused), the seating chart, the location
// check's switch; then the register in a browser (keyboard marking, everyone present, seating, the
// excuses tab) and the student's request form, with axe at 390 / 1280, light / dark.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { launch } from '../browser-session.mjs';
import { fileURLToPath as __path } from 'node:url';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--command', q], { cwd: APP, stdio: 'pipe' }).toString();
const me = async (e) => (await call(e, '/api/core/auth/me'))[1];
const day = (n = 0) => { const d = new Date(Date.now() - n * 86_400_000); return d.toISOString().slice(0, 10); };
const alice = await me(A), bob = await me(B);
const r = {};

// Bulk marks today; Bob absent three days running → flagged.
const [m1, s1] = await call(T, `/api/attendance/register/${C}`, { day: day(0), marks: [{ studentId: alice.id, status: 'PRESENT' }, { studentId: bob.id, status: 'ABSENT' }, { studentId: 'nobody', status: 'PRESENT' }] });
r.bulk = { status: m1, marked: s1.marked };
for (const n of [1, 2]) await call(T, `/api/attendance/register/${C}`, { day: day(n), marks: [{ studentId: bob.id, status: 'ABSENT' }] });
const [, reg] = await call(T, `/api/attendance/register/${C}?day=${day(0)}`);
const rb = reg.students?.find((s) => s.id === bob.id), ra = reg.students?.find((s) => s.id === alice.id);
r.register = { alice: ra?.mark, bob: rb?.mark, bobChronic: rb?.chronic, bobRecent: rb?.recent?.slice(0, 3), students: reg.students?.length };
r.alertedAt = /absenceAlertAt": "2/.test(sql(`SELECT absenceAlertAt FROM enrollments WHERE courseId = '${C}' AND studentId = '${bob.id}'`));
const [nostudent] = await call(A, `/api/attendance/register/${C}?day=${day(0)}`);
r.studentCantOpen = nostudent;

// A class call today: the teacher 60 min, Alice 50, Bob 10.
const at = new Date().toISOString().replace('Z', '+00:00');
sql(`INSERT INTO call_stats (id, callId, userId, type, mode, seconds, createdAt) VALUES ('qtest1', 'c_${C}', '${(await me(T)).id}', 'class', 'sfu', 3600, '${at}'), ('qtest2', 'c_${C}', '${alice.id}', 'class', 'sfu', 3000, '${at}'), ('qtest3', 'c_${C}', '${bob.id}', 'class', 'sfu', 600, '${at}')`);
const [, sug] = await call(T, `/api/attendance/register/${C}/call?day=${day(0)}&tz=UTC&threshold=0.75`);
r.call = { length: sug.length, alice: sug.suggestions?.find((s) => s.studentId === alice.id)?.suggest, bob: sug.suggestions?.find((s) => s.studentId === bob.id)?.suggest };
sql(`DELETE FROM call_stats WHERE id IN ('qtest1', 'qtest2', 'qtest3')`);

// An excuse request: Alice for yesterday; the teacher approves; the day is Excused.
const [e1, ex] = await call(A, '/api/attendance/excuses', { courseId: C, day: day(1), reason: 'I had a fever and stayed home.' });
const [e2] = await call(A, '/api/attendance/excuses', { courseId: 'not-a-course', day: day(1), reason: 'Sick' });
const [, list] = await call(T, `/api/attendance/register/${C}/excuses`);
const [d1] = await call(T, `/api/attendance/excuses/${ex.id}`, { approve: true, note: 'Get well soon.' });
const [d2] = await call(T, `/api/attendance/excuses/${ex.id}`, { approve: false });
const [, yreg] = await call(T, `/api/attendance/register/${C}?day=${day(1)}`);
const [, mine] = await call(A, '/api/attendance/excuses');
r.excuse = { asked: e1, notMine: e2, listed: list.some?.((x) => x.id === ex.id), decided: d1, twice: d2, dayNow: yreg.students?.find((s) => s.id === alice.id)?.mark, aliceSees: mine.find?.((x) => x.id === ex.id)?.status };

// The seating chart keeps only this class's students, each once.
const [, seat] = await call(T, `/api/attendance/register/${C}/seating`, { rows: 3, cols: 4, seats: { '0-0': alice.id, '0-1': alice.id, '1-1': bob.id, '2-3': 'stranger' } }, 'PUT');
r.seating = seat;

// The location check: off for students to see; on (set by the school) means a position is needed.
const [, pol] = await call(A, '/api/attendance/policy');
r.policyOff = pol;
sql(`INSERT INTO school_policy (id, checkinGeo, checkinLat, checkinLng, checkinRadius, updatedAt) VALUES ('main', 1, 12.9716, 77.5946, 300, '${at}') ON CONFLICT(id) DO UPDATE SET checkinGeo = 1, checkinLat = 12.9716, checkinLng = 77.5946, checkinRadius = 300`);
const [, pol2] = await call(A, '/api/attendance/policy');
r.policyOnForStudent = pol2;
sql(`UPDATE school_policy SET checkinGeo = 0 WHERE id = 'main'`);
console.log(JSON.stringify(r));

async function context(browser, email, { width = 390, theme = 'light' } = {}) {
  const token = `mock-token-${email}`;
  const u = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(([t, user, th]) => { localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 })); localStorage.setItem('theme', th); }, [token, u, theme]);
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
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const u = { theme, width };
  await page.goto(`${base}/teacher/attendance?course=${C}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const list = page.getByRole('list', { name: /register for/ });
  await list.waitFor({ timeout: 20_000 });
  u.rows = await list.getByRole('listitem').count();
  u.axe = await axe(page);
  if (act) {
    // Keyboard: first row, P; the next row, L.
    await list.getByRole('listitem').first().focus();
    await page.keyboard.press('p');
    await page.waitForTimeout(800);
    await page.keyboard.press('l');
    await page.waitForTimeout(1200);
    const [, after] = await call(T, `/api/attendance/register/${C}?day=${day(0)}`);
    u.keyboard = after.students.slice(0, 2).map((s) => s.mark);
    await page.getByRole('button', { name: 'Everyone else present' }).click();
    await page.waitForTimeout(1200);
    const [, all] = await call(T, `/api/attendance/register/${C}?day=${day(0)}`);
    u.unmarkedAfterAll = all.students.filter((s) => !s.mark).length;
    await page.getByRole('button', { name: 'Seating' }).click();
    const seatAlice = page.getByRole('button', { name: new RegExp(`^${alice.name}`) });
    await seatAlice.waitFor({ timeout: 10_000 });
    const beforeSeat = (await seatAlice.innerText()).replace(/\s+/g, ' ');
    await seatAlice.click();
    await page.waitForTimeout(1200);
    u.seatTap = [beforeSeat, (await page.getByRole('button', { name: new RegExp(`^${alice.name}`) }).innerText()).replace(/\s+/g, ' ')];
    u.axeSeating = await axe(page);
    await page.getByRole('button', { name: /^Excuses/ }).click();
    await page.getByText('I had a fever and stayed home.').first().waitFor({ timeout: 10_000 });
    u.axeExcuses = await axe(page);
  }
  u.wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  u.errors = errors;
  console.log(JSON.stringify(u));
  await ctx.close();
}
// The student's form.
for (const theme of ['light', 'dark']) {
  const ctx = await context(browser, A, { width: 390, theme });
  const page = await ctx.newPage();
  await page.goto(`${base}/student/attendance`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Ask to be excused' }).click();
  const u = { who: 'student', theme, axe: await axe(page), listed: await page.getByText('I had a fever and stayed home.').count(), wide: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1) };
  console.log(JSON.stringify(u));
  await ctx.close();
}
await browser.close();
sql(`DELETE FROM attendance_excuses WHERE id = '${ex.id}'`);
