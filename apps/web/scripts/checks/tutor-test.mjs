// Q13 on the built Worker (run with a throwaway GEMINI_API_KEY so "AI on" checks pass; real AI
// calls fail, so a homework photo's reading is put in the AI cache first, exactly where the tutor
// keeps it). API: the teacher's rule (who may set it, hints only, off with a time), the photo's
// hints one at a time and the answer, refusals; common questions (no names, students only); practice
// from the classes with none; FSRS reviews; the evening reminder through the cron. Browser: the
// student's Ask tab with modes, a photo turn with formulas shown as MathML, hints, the answer; the
// teacher's tab; the off banner; flashcards with FSRS buttons and the reminder; axe at 390 / 1280,
// light / dark.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch } from '../browser-session.mjs';
import { fileURLToPath as __path } from 'node:url';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method, again = true) => {
  try { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; }
  catch (e) { if (again) return call(who, path, body, method, false); throw e; } // a kept-alive connection the server closed
};
const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--json', '--command', q], { cwd: APP, stdio: 'pipe' }).toString();
const rows = (q) => JSON.parse(sql(q))[0].results;
const me = async (e) => (await call(e, '/api/core/auth/me'))[1];
const sha = (s) => createHash('sha256').update(s).digest('hex');
const esc = (s) => s.replace(/'/g, "''");
const alice = await me(A), bob = await me(B);
const HOMEWORK = { readable: true, problem: 'Balance the equation $\\ce{H2 + O2 -> H2O}$ and find $x$ if $2x + 3 = 11$.', topic: 'Equations', hints: ['Count the atoms of each element on both sides.', 'Oxygen comes in pairs, so water needs a 2 in front: $2\\ce{H2O}$.', 'Now hydrogen: $2\\ce{H2}$ on the left. For $x$: take 3 from both sides.'], answer: '$\\ce{2H2 + O2 -> 2H2O}$, and $2x = 8$ so $x = 4$.' };
const seed = (userId, data) => {
  const ref = sha(data).slice(0, 32);
  const key = sha(['homework', C, userId, ref].join('\u0000'));
  sql(`INSERT OR REPLACE INTO ai_cache (key, value, createdAt) VALUES ('${key}', '${esc(JSON.stringify(HOMEWORK))}', '${new Date().toISOString().replace('Z', '+00:00')}')`);
  return ref;
};
const r = {};

if (!process.env.DBG) {
// ── The teacher's rule ──
r.ruleStudent = (await call(A, `/api/tutor/${C}/rule`))[1];
r.studentSets = (await call(A, `/api/tutor/${C}/rule`, { hintsOnly: true }, 'PUT'))[0];
const [s1, set1] = await call(T, `/api/tutor/${C}/rule`, { hintsOnly: true, note: 'Use SI units.' }, 'PUT');
r.teacherSets = { status: s1, ...set1 };
r.studentSeesNote = 'note' in (await call(A, `/api/tutor/${C}/rule`))[1];

// ── A homework photo ──
const png = readFileSync(`${APP}/public/icon-192x192.png`).toString('base64');
const ref = seed(alice.id, png);
const [p1, first] = await call(A, `/api/tutor/${C}/photo`, { image: { mimeType: 'image/png', data: png }, mode: 'normal' });
r.photo = { status: p1, hints: first.hints?.length, total: first.total, answerAllowed: first.answerAllowed, refMatches: first.ref === ref, topic: first.topic };
r.moreHints = (await call(A, `/api/tutor/${C}/photo`, { ref, hints: 2 }))[1].hints?.length;
r.answerHintsOnlyCourse = (await call(A, `/api/tutor/${C}/photo`, { ref, answer: true }))[0];
await call(T, `/api/tutor/${C}/rule`, { hintsOnly: false, note: 'Use SI units.' }, 'PUT');
r.answerInHintsMode = (await call(A, `/api/tutor/${C}/photo`, { ref, answer: true, mode: 'hints' }))[0];
const [a1, ans] = await call(A, `/api/tutor/${C}/photo`, { ref, answer: true });
r.answer = { status: a1, has: !!ans.answer };
r.bobUsesAlicesRef = (await call(B, `/api/tutor/${C}/photo`, { ref, hints: 1 }))[0];
r.notAPhoto = (await call(A, `/api/tutor/${C}/photo`, { image: { mimeType: 'text/plain', data: 'aGVsbG8=' } }))[0];
r.loggedForTeacher = rows(`SELECT COUNT(*) AS n FROM ai_uses WHERE userId = '${alice.id}' AND kind = 'homework' AND courseId = '${C}'`)[0].n;

// ── Off before an exam ──
const until = new Date(Date.now() + 2 * 3600_000).toISOString();
await call(T, `/api/tutor/${C}/rule`, { off: true, offUntil: until, note: 'Use SI units.' }, 'PUT');
const [o1, off] = await call(A, `/api/tutor/${C}/ask`, { question: 'What is a mole?' });
r.off = { ask: o1, message: off.error, photo: (await call(A, `/api/tutor/${C}/photo`, { ref, hints: 1 }))[0], practice: (await call(A, `/api/tutor/${C}/practice`, { from: 'classes' }))[0], voice: (await call(A, '/api/tutor/voice', { courseId: C }))[0], teacherAsks: (await call(T, `/api/tutor/${C}/ask`, { question: 'What is a mole?' }))[0], rule: (await call(A, `/api/tutor/${C}/rule`))[1] };
await call(T, `/api/tutor/${C}/rule`, { off: false, note: 'Use SI units.' }, 'PUT');
r.backOn = (await call(A, `/api/tutor/${C}/ask`, { question: 'What is a mole?' }))[0];

// ── Common questions ──
const now = new Date().toISOString().replace('Z', '+00:00');
sql(`INSERT INTO ai_uses (id, userId, kind, detail, courseId, createdAt) VALUES ('qq1', '${alice.id}', 'tutor', 'What is recursion?', '${C}', '${now}'), ('qq2', '${bob.id}', 'tutor', 'Explain recursion with a simple example', '${C}', '${now}'), ('qq3', '${bob.id}', 'tutor', 'When is the lab report due?', '${C}', '${now}')`);
const [q1, qs] = await call(T, `/api/tutor/${C}/questions`);
r.questions = { status: q1, groups: qs.groups?.map((g) => [g.label, g.people, g.asked]), named: /alice|bob/i.test(JSON.stringify(qs)), student: (await call(A, `/api/tutor/${C}/questions`))[0] };

// ── Practice from the classes, with no class recordings ──
r.classesPractice = (await call(A, `/api/tutor/${C}/practice`, { from: 'classes' }))[0];

// ── Flashcards: FSRS and the reminder ──
const [, card] = await call(A, '/api/tutor/cards', { courseId: C, front: 'What is water?', back: '$\\ce{H2O}$' });
const [, rev] = await call(A, `/api/tutor/cards/${card.id}`, { grade: 'good', tz: 'Asia/Kolkata' });
r.review = { interval: rev.interval, stability: rev.stability, db: rows(`SELECT stability, difficulty, interval FROM study_cards WHERE id = '${card.id}'`)[0] };
const [, rem] = await call(A, '/api/tutor/cards/reminder', { on: true, tz: 'Asia/Kolkata' }, 'PUT');
r.reminderOn = { reminder: rem.reminder, nextKolkata: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(rem.next)) };
// Make it time, with a card due; the 15-minute cron sends it and books tomorrow's.
const past = new Date(Date.now() - 60_000).toISOString().replace('Z', '+00:00');
sql(`UPDATE users SET cardsRemindAt = '${past}' WHERE id = '${alice.id}'; UPDATE study_cards SET due = '${past}' WHERE id = '${card.id}'`);
await fetch(`${base}/__scheduled?cron=*/15+*+*+*+*`);
await new Promise((res) => setTimeout(res, 4000));
const note = rows(`SELECT title, body FROM notifications WHERE userId = '${alice.id}' AND title = 'Flashcards to review' ORDER BY createdAt DESC LIMIT 1`)[0];
const nextAt = rows(`SELECT cardsRemindAt FROM users WHERE id = '${alice.id}'`)[0].cardsRemindAt;
r.cron = { note, movedADay: Math.round((Date.parse(nextAt) - Date.parse(past)) / 3600_000) };
console.log(JSON.stringify(r, null, 1));
}

// ── The browser ──
async function context(browser, email, { width = 1280, theme = 'light' } = {}) {
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
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await call(A, '/api/tutor/cards', { courseId: C, front: 'Speed of light', back: '$c \\approx 3 \\times 10^8\\,\\text{m/s}$' });
const browser = await launch();
const errors = [];
let first1 = true;
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  const act = first1; first1 = false;
  const ctx = await context(browser, A, { width, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // The browser shrinks the photo itself: put the AI's reading of exactly what it sends in the cache.
  await page.route('**/api/tutor/*/photo', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (body.image?.data) seed(alice.id, body.image.data);
    await route.continue();
  });
  const u = { who: 'student', theme, width };
  await page.goto(`${base}/student/tutor?course=${C}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('group', { name: 'How the tutor answers' }).waitFor({ timeout: 20_000 });
  u.axeAsk = await axe(page);
  if (act || width === 390) {
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(`${APP}/public/icon-512x512.png`);
    const resp = await page.waitForResponse((x) => x.url().includes('/photo'), { timeout: 20_000 }).catch(() => null);
    u.photoStatus = resp ? `${resp.status()} ${(await resp.text()).slice(0, 200)}` : 'no request';
    if (process.env.DBG) { u.text = (await page.locator('main').innerText()).slice(-600); console.log(JSON.stringify(u)); process.exit(0); }
    await page.getByText(/^Hint 1 of 3/).waitFor({ timeout: 20_000 });
    u.formulas = await page.locator('math').count();
    await page.getByRole('button', { name: 'Another hint' }).click();
    await page.getByText(/^Hint 2 of 3/).waitFor();
    await page.getByRole('button', { name: 'Show the answer' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Show the answer' }).click();
    await page.getByText('Worked answer').waitFor({ timeout: 10_000 });
    u.formulasAfter = await page.locator('math').count();
    u.rawChemistryLeft = (await page.locator('main').innerText()).includes('\\ce{');
    u.axePhoto = await axe(page);
  }
  if (act) {
    await page.getByRole('tab', { name: /Flashcards/ }).click();
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    u.buttons = await page.getByRole('button', { name: /^(Again|Hard|Good|Easy)/ }).allInnerTexts();
    u.cardMath = await page.locator('math').count();
    u.reminder = await page.getByRole('switch', { name: /Remind me at 6 pm/ }).getAttribute('aria-checked');
    u.axeCards = await axe(page);
    await page.getByRole('tab', { name: /Practice/ }).click();
    await page.getByRole('button', { name: 'The classes' }).click();
    await page.getByRole('button', { name: /Make 5 questions/ }).click();
    await page.waitForTimeout(1500);
    u.classesToast = await page.locator('[data-sonner-toast]').allInnerTexts();
    u.axePractice = await axe(page);
  }
  u.wide = await wide(page);
  console.log(JSON.stringify(u));
  await ctx.close();
}
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
  const ctx = await context(browser, T, { width, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const u = { who: 'teacher', theme, width };
  await page.goto(`${base}/teacher/tutor?course=${C}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('tab', { name: /Teacher/ }).click();
  await page.getByRole('heading', { name: 'What your class asks the tutor' }).waitFor({ timeout: 20_000 });
  await page.getByText(/recursion/).first().waitFor({ timeout: 10_000 });
  u.groups = await page.locator('section[aria-labelledby="tp-questions"] li > p.font-semibold').allInnerTexts();
  u.axe = await axe(page);
  if (theme === 'light' && width === 1280) {
    await page.getByRole('switch', { name: 'Turn the tutor off for students' }).click();
    await page.getByText(/Off for students until you turn it back on/).waitFor({ timeout: 10_000 });
    u.offSaved = (await call(A, `/api/tutor/${C}/rule`))[1];
    // The student sees the banner.
    const sctx = await context(browser, A, { width: 390 });
    const sp = await sctx.newPage();
    await sp.goto(`${base}/student/tutor?course=${C}`, { waitUntil: 'networkidle', timeout: 60_000 });
    u.banner = await sp.getByRole('status').filter({ hasText: /turned the tutor off/ }).count();
    u.inputDisabled = await sp.getByLabel('Question').isDisabled();
    u.axeBanner = await axe(sp);
    await sctx.close();
    await page.getByRole('switch', { name: 'Turn the tutor off for students' }).click();
    await page.waitForTimeout(1200);
    u.backOn = (await call(A, `/api/tutor/${C}/rule`))[1].off;
  }
  u.wide = await wide(page);
  console.log(JSON.stringify(u));
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ errors }));
// Tidy up.
sql(`DELETE FROM ai_uses WHERE id IN ('qq1', 'qq2', 'qq3') OR (userId = '${alice.id}' AND kind = 'homework'); DELETE FROM study_cards WHERE userId = '${alice.id}' AND courseId = '${C}'; UPDATE users SET cardsRemindAt = NULL WHERE id = '${alice.id}'; UPDATE courses SET tutorRule = NULL WHERE id = '${C}'; DELETE FROM notifications WHERE userId = '${alice.id}' AND title = 'Flashcards to review'`);
