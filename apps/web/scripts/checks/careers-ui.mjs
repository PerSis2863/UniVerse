// Q15 careers in the browser on the built Worker: the application tracker (add, stage, edit, the
// "Coming up" list, the next-step reminder from the 15-minute cron, remove), interview practice
// (questions without AI, an answer's filler / STAR / length checks, history), mentors (a teacher
// offers a time, Alice books it from the page, the call and both calendar entries appear, she
// cancels and the time is free again; two people booking one time at once), "Be a mentor" for a
// student, the teacher's mentor page, the job alerts switch and an alert for a matching new
// opening, and the three tabs in sample mode. Axe at 390/1280, light/dark.
// Adds one piece of skill evidence for Alice, a mentor profile for the demo teacher and one test
// opening; removes them (and everything the test made) at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: who ? H(who) : { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const sql = (command) => execSync(`npx wrangler d1 execute universe-db --local --command "${command}"`, { cwd: APP, stdio: 'ignore' });
const rows = (command) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${command}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const user = (email) => `(SELECT id FROM users WHERE email='${email}')`;
/** A time `min` minutes from now as a datetime-local value (local time). */
const localAt = (min) => { const d = new Date(Date.now() + min * 60_000); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

// ── Test data ─────────────────────────────────────────────────────────────
// Profiles this check made (a run that stopped half way) are fine to remove; any other one isn't.
const ours = `COALESCE(bio,'') != 'Careers UI mentor' AND COALESCE(jobTitle,'') != 'Junior analyst'`;
const teacherHadProfile = rows(`SELECT id FROM mentor_profiles WHERE userId=${user(T)} AND ${ours}`).length > 0;
const aliceHadProfile = rows(`SELECT id FROM mentor_profiles WHERE userId=${user(A)} AND ${ours}`).length > 0;
if (teacherHadProfile || aliceHadProfile) throw new Error('A test account already has a mentor profile: this check would change it. Stopping.');
async function cleanup() {
  sql(`DELETE FROM job_applications WHERE title LIKE 'Careers UI%'`);
  sql(`DELETE FROM interview_answers WHERE role LIKE 'Careers UI%'`);
  sql(`DELETE FROM skill_evidence WHERE sourceId='careers-ui'`);
  sql(`DELETE FROM calendar_events WHERE batch IN (SELECT 'mentor:' || b.id FROM mentorship_bookings b JOIN mentor_profiles m ON m.id=b.mentorId WHERE m.userId IN (${user(T)}, ${user(A)}))`);
  sql(`DELETE FROM scheduled_calls WHERE id IN (SELECT b.scheduledCallId FROM mentorship_bookings b JOIN mentor_profiles m ON m.id=b.mentorId WHERE m.userId IN (${user(T)}, ${user(A)}))`);
  sql(`DELETE FROM mentorship_bookings WHERE mentorId IN (SELECT id FROM mentor_profiles WHERE userId IN (${user(T)}, ${user(A)}))`);
  sql(`DELETE FROM mentor_profiles WHERE userId IN (${user(T)}, ${user(A)})`);
  sql(`DELETE FROM internships WHERE title LIKE 'Careers UI%'`);
  sql(`DELETE FROM notifications WHERE title LIKE '%Careers UI%' OR title LIKE '%booked a mentoring session%' OR title LIKE '%cancelled a mentoring session%'`);
  await call(A, '/api/careers/alerts', { on: true });
}
await cleanup();
sql(`INSERT INTO skill_evidence (id, userId, skill, label, kind, sourceId, title, level) VALUES ('careers-ui-ev', ${user(A)}, 'python', 'Python', 'QUIZ', 'careers-ui', 'Careers UI evidence', 'Proficient')`);

// ── API rules ─────────────────────────────────────────────────────────────
const api = {};
api.teacherTracker = (await call(T, '/api/careers/applications')).s;
api.noRole = (await call(A, '/api/careers/applications', { company: 'X' })).s;
api.badLink = (await call(A, '/api/careers/applications', { title: 'Careers UI link', company: 'X', url: 'javascript:alert(1)' })).b?.[0]?.url ?? 'missing';
api.badStage = (await call(A, '/api/careers/applications', { title: 'Careers UI stage', company: 'X', stage: 'HIRED' })).s;
api.shortAnswer = (await call(A, '/api/careers/interview', { action: 'feedback', role: 'Careers UI x', question: 'Tell me about yourself.', answer: 'Too short.' })).s;

// The demo teacher becomes a mentor and offers three times.
const prof = await call(T, '/api/careers/mentoring', { action: 'profile', jobTitle: 'Careers adviser', company: 'UniVerse', skills: ['CVs', 'Interviews'], isAlumni: false, bio: 'Careers UI mentor' });
api.profile = prof.s;
api.teacherCantBook = (await call(T, '/api/careers/mentoring', { action: 'book', slotId: 'x', topic: 'x' })).s;
api.tooSoon = (await call(T, '/api/careers/mentoring', { action: 'slots', startAt: new Date(Date.now() + 5 * 60_000).toISOString(), minutes: 30 })).s;
const slotAt = new Date(Date.now() + 2 * 86_400_000); slotAt.setUTCMinutes(0, 0, 0);
api.slots = (await call(T, '/api/careers/mentoring', { action: 'slots', startAt: slotAt.toISOString(), minutes: 30, weeks: 2 })).b.slots?.length;
api.overlap = (await call(T, '/api/careers/mentoring', { action: 'slots', startAt: new Date(slotAt.getTime() + 15 * 60_000).toISOString(), minutes: 30 })).s;
// Two people book the same time at once: exactly one gets it.
const race = (await call(T, '/api/careers/mentoring')).b.slots[1];
const both = await Promise.all([A, B].map((who) => call(who, '/api/careers/mentoring', { action: 'book', slotId: race.id, topic: 'Careers UI race' })));
api.race = both.map((r) => r.s).sort();
for (const r of both) for (const b of r.b?.bookings ?? []) if (b.as === 'student' && b.status === 'CONFIRMED') await call(r === both[0] ? A : B, '/api/careers/mentoring', { action: 'cancel', bookingId: b.id });
api.raceFreed = (await call(T, '/api/careers/mentoring')).b.slots.find((s) => s.id === race.id)?.bookingId ?? null;
// Nobody's email is in the mentor lists.
api.emailsShown = [JSON.stringify((await call(A, '/api/core/mentorship/mentors')).b), JSON.stringify((await call(A, '/api/careers/mentors')).b)].map((t) => t.includes('@') || t.includes('email'));

// Job alerts: a new opening asking for Python and SQL matches Alice (Python), not Bob.
const opening = (await call(T, '/api/core/internships', { title: 'Careers UI data intern', company: 'Careers UI Co', description: 'Test opening', location: 'Remote', type: 'FULL_TIME', isActive: true, skills: 'Python, SQL' })).b;
api.openingSkills = opening.skills;
await new Promise((r) => setTimeout(r, 2500));
api.alerted = rows(`SELECT u.email, n.type, n.link FROM notifications n JOIN users u ON u.id=n.userId WHERE n.title LIKE '%Careers UI data intern%'`);
api.alertedOnce = rows(`SELECT alertedAt FROM internships WHERE id='${opening.id}'`)[0]?.alertedAt != null;
await call(T, `/api/core/internships/${opening.id}`, { isActive: false }, 'PATCH');
await call(T, `/api/core/internships/${opening.id}`, { isActive: true }, 'PATCH');
await new Promise((r) => setTimeout(r, 1500));
api.notAlertedTwice = rows(`SELECT COUNT(*) AS n FROM notifications WHERE title LIKE '%Careers UI data intern%'`)[0].n;
await call(T, `/api/core/internships/${opening.id}`, null, 'DELETE');

// ── Browser helpers ───────────────────────────────────────────────────────
async function context(browser, email, { width = 390, theme = 'light', sample = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  await ctx.addInitScript(([t, u, th, s]) => {
    localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
    localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    if (s) sessionStorage.setItem('universe:sample-mode', '1');
  }, [token, me, theme, sample]);
  return ctx;
}
async function axe(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
}
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (page, text) => (await page.locator('[data-sonner-toast]', { hasText: text }).last().innerText({ timeout: 15_000 }).catch(() => 'missing')).split('\n')[0];
const open = async (page, path, ready) => { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 }); await ready.waitFor({ timeout: 20_000 }); };
const confirm = (page, name) => page.getByRole('alertdialog').getByRole('button', { name, exact: true }).click();

const browser = await launch();

for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
  const act = theme === 'light' && width === 390;
  const r = { theme, width };
  const errors = [];
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));

  // Applications
  await open(page, '/student/internships/applications', page.getByRole('button', { name: 'Add application' }).first());
  if (act) {
    await page.getByRole('button', { name: 'Add application' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Add an application' });
    await sheet.getByLabel('Role', { exact: true }).fill('Careers UI analyst');
    await sheet.getByLabel('Company', { exact: true }).fill('Test Co');
    await sheet.getByLabel('Job advert link').fill('http://jobs.example.com/1');
    await sheet.getByLabel('Next step', { exact: true }).fill('Phone screen');
    await sheet.getByLabel('When', { exact: true }).fill(localAt(40));
    await sheet.getByLabel('Document name').fill('CV');
    await sheet.getByLabel('Document link').fill('https://example.com/cv.pdf');
    await sheet.getByRole('button', { name: 'Add link' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    r.added = await toast(page, 'Added to your tracker');
    r.comingUp = await page.getByRole('region', { name: 'Coming up' }).getByText('Phone screen').count();
    await page.getByLabel('Stage of Careers UI analyst').selectOption('INTERVIEW');
    await page.waitForTimeout(800);
    const saved = (await call(A, '/api/careers/applications')).b.find((a) => a.title === 'Careers UI analyst');
    r.saved = { stage: saved?.stage, url: saved?.url, docs: saved?.documents?.length };
    // The 15-minute cron sends the next-step reminder (it's within the hour).
    await fetch(`${base}/__scheduled?cron=${encodeURIComponent('*/15 * * * *')}`);
    await new Promise((res) => setTimeout(res, 2500));
    r.reminder = rows(`SELECT n.type, n.title FROM notifications n WHERE n.userId=${user(A)} AND n.title LIKE '%Careers UI analyst%'`).map((n) => `${n.type}: ${n.title}`);
    r.remindedOnce = rows(`SELECT remindedAt FROM job_applications WHERE title='Careers UI analyst'`)[0]?.remindedAt != null;
  }
  r.appsAxe = await axe(page);
  r.appsWide = await wide(page);
  if (act) {
    await page.getByRole('listitem').filter({ hasText: 'Careers UI analyst' }).getByRole('button', { name: 'Edit' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit application' });
    await sheet.getByLabel('Notes', { exact: true }).fill('Ask about the team.');
    r.editAxe = await axe(page);
    await sheet.getByRole('button', { name: 'Save' }).click();
    r.edited = await toast(page, 'Saved');
    r.notesShown = await page.getByText('Ask about the team.').count();
    await page.getByRole('button', { name: 'Remove Careers UI analyst' }).click();
    await confirm(page, 'Remove');
    await page.waitForTimeout(800);
    r.removed = (await call(A, '/api/careers/applications')).b.every((a) => a.title !== 'Careers UI analyst');
  }

  // Interview practice
  await open(page, '/student/internships/interview', page.getByRole('heading', { name: 'What are you interviewing for?' }));
  if (act) {
    await page.getByLabel('Role').fill('Careers UI data analyst');
    await page.getByRole('button', { name: 'Get questions' }).click();
    await page.getByRole('heading', { name: /Questions for/ }).waitFor({ timeout: 20_000 });
    r.questions = { n: await page.locator('ol > li').count(), source: await page.getByText(/Common questions|Written by AI/).innerText() };
    await page.getByRole('button', { name: /Tell me about a time you worked in a team/ }).click();
    await page.getByLabel('Your answer').fill('Um, so last year in my second year project our team had to, like, build a survey app. My task was to clean the data. So I wrote scripts and, um, I tested them with the team. As a result we cut errors by 40% and I learned to plan earlier, you know.');
    await page.getByRole('button', { name: 'Check my answer' }).click();
    await page.getByText('Filler words').waitFor({ timeout: 20_000 });
    r.checks = { fillers: await page.getByText('Filler words').locator('..').innerText(), star: await page.getByRole('list', { name: 'STAR parts' }).innerText(), note: await page.getByText(/AI feedback isn’t available|AI feedback ·/).first().innerText().catch(() => 'missing') };
    r.history = await page.getByRole('region', { name: 'Your recent practice' }).getByText('Tell me about a time you worked in a team').count();
  }
  r.interviewAxe = await axe(page);
  r.interviewWide = await wide(page);
  if (act) {
    await page.getByRole('button', { name: /Remove practice answer/ }).first().click();
    await page.waitForTimeout(800);
    r.historyCleared = (await call(A, '/api/careers/interview')).b.answers.filter((x) => x.role.startsWith('Careers UI')).length;
  }

  // Mentors: book the teacher's first time, then cancel.
  await open(page, '/student/internships/mentors', page.getByRole('button', { name: 'Be a mentor' }));
  await page.getByRole('heading', { name: 'Dr. Jane Smith' }).waitFor({ timeout: 20_000 });
  if (act) {
    await page.getByRole('button', { name: /^Book Dr\. Jane Smith/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Book Dr. Jane Smith' });
    await sheet.getByLabel('What would you like to talk about?').fill('Careers UI: my CV');
    r.bookAxe = await axe(page);
    await sheet.getByRole('button', { name: 'Book' }).click();
    r.booked = await toast(page, 'Booked with');
    const mine = (await call(A, '/api/careers/mentoring')).b.bookings.find((b) => b.status === 'CONFIRMED');
    r.booking = {
      sessions: await page.getByRole('region', { name: 'Your sessions' }).getByText('With Dr. Jane Smith').count(),
      call: rows(`SELECT template, durationMin, conversationId IS NOT NULL AS chat FROM scheduled_calls WHERE id='${mine?.callId}'`)[0] ?? null,
      calendar: rows(`SELECT COUNT(*) AS n FROM calendar_events WHERE batch='mentor:${mine?.id}'`)[0].n,
      teacherTold: rows(`SELECT COUNT(*) AS n FROM notifications WHERE userId=${user(T)} AND title LIKE '%booked a mentoring session%'`)[0].n,
      teacherCalls: ((await call(T, '/api/calls/scheduled')).b ?? []).some((c) => c.id === mine?.callId),
    };
    r.sessionsAxe = await axe(page);
    await page.getByRole('region', { name: 'Your sessions' }).getByRole('button', { name: 'Cancel' }).click();
    await confirm(page, 'Cancel session');
    r.cancelled = await toast(page, 'Session cancelled');
    r.afterCancel = {
      call: rows(`SELECT COUNT(*) AS n FROM scheduled_calls WHERE id='${mine?.callId}'`)[0].n,
      calendar: rows(`SELECT COUNT(*) AS n FROM calendar_events WHERE batch='mentor:${mine?.id}'`)[0].n,
      slotFree: (await call(T, '/api/careers/mentoring')).b.slots.every((s) => !s.bookingId),
    };
  }
  r.mentorsAxe = await axe(page);
  r.mentorsWide = await wide(page);

  // Be a mentor (Alice as a recent graduate)
  await page.getByRole('button', { name: 'Be a mentor' }).click();
  await page.getByLabel('What you do').waitFor({ timeout: 15_000 });
  if (act) {
    await page.getByLabel('What you do').fill('Junior analyst');
    await page.getByLabel('I studied here (alumni)').check();
    await page.getByLabel('Year you graduated').fill('2025');
    await page.getByRole('button', { name: 'Become a mentor' }).click();
    r.becameMentor = await toast(page, 'You’re a mentor now');
    await page.getByLabel('Starts').fill(localAt(3 * 24 * 60));
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    r.slotAdded = await toast(page, 'Time added');
    r.aliceInDirectory = (await call(B, '/api/careers/mentors')).b.mentors.some((m) => m.isAlumni && m.gradYear === 2025);
  }
  r.beMentorAxe = await axe(page);
  r.beMentorWide = await wide(page);

  // Skills match: the job alerts switch
  await open(page, '/student/internships/match', page.getByRole('switch', { name: /new opening matches my skills/ }));
  if (act) {
    await page.getByRole('switch', { name: /new opening matches my skills/ }).click();
    await page.waitForTimeout(800);
    r.alertsOff = (await call(A, '/api/careers/alerts')).b.on === false;
    await page.getByRole('switch', { name: /new opening matches my skills/ }).click();
    await page.waitForTimeout(800);
  }
  r.matchAxe = await axe(page);
  r.matchWide = await wide(page);
  r.errors = errors;
  await ctx.close();

  // The teacher's mentor page
  const tctx = await context(browser, T, { width, theme });
  const tpage = await tctx.newPage();
  tpage.on('pageerror', (e) => errors.push(`teacher: ${e.message.slice(0, 120)}`));
  await open(tpage, '/teacher/mentorship', tpage.getByRole('heading', { name: 'Mentor students yourself' }));
  await tpage.getByRole('heading', { name: 'Times you offer' }).waitFor({ timeout: 20_000 });
  r.teacher = { fake45: await tpage.getByText('45', { exact: true }).count(), mailto: await tpage.locator('[href^="mailto:"]').count(), aliceListed: await tpage.getByText('Alice Johnson').count() };
  r.teacherAxe = await axe(tpage);
  r.teacherWide = await wide(tpage);
  await tctx.close();
  console.log(JSON.stringify(r));
}

// Sample mode: the three new tabs answer from sample data, not the real account.
{
  const ctx = await context(browser, A, { sample: true });
  const page = await ctx.newPage();
  const sample = {};
  await open(page, '/student/internships/applications', page.getByText('Data analyst intern').first());
  sample.apps = await page.getByText('Brightside Studio').count();
  await open(page, '/student/internships/mentors', page.getByText('Priya Menon').first());
  sample.mentors = await page.getByText('Priya Menon').count();
  await open(page, '/student/internships/interview', page.getByLabel('Role'));
  await page.getByLabel('Role').fill('Sample role');
  await page.getByRole('button', { name: 'Get questions' }).click();
  sample.questions = await page.getByRole('heading', { name: 'Questions for Sample role' }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  console.log(JSON.stringify({ sample }));
  await ctx.close();
}

console.log(JSON.stringify({ api }));
await browser.close();
await cleanup();
