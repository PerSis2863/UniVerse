// M110–M113 in the browser on the built Worker (pnpm local:build, then pnpm local:serve):
// - the landing leads with UniVersity: four "Lab" tags on the app tabs, "What does Lab mean?", and the
//   Play tab's worlds without the rated Night Shift and STORMFALL (M112); the hub's Lab tags;
// - Relief's "I need help" form says to call the emergency number first (M110);
// - a teacher's class link (M113): the teacher publishes a draft course from "No students yet", a
//   student opens /join?course=… and joins in one tap (lands on the course), opens it again ("You're
//   in"), a student who opened the link before signing in is sent back to it (homeFor), "Not now"
//   goes home, a signed-out visitor gets a student sign-up with no card check, the teacher sees
//   "your class's link". The course is made for the check and deleted at the end.
// Axe (serious/critical) and no sideways scrolling at 390 and 1280, light and dark where it matters.
//   node scripts/checks/launch-focus-ui.mjs [http://localhost:8787]
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787';
const T = 'demo@teacher.com', S = 'bob@student.com', S2 = 'alice@student.com';
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };
async function axe(page, what) {
  await page.addScriptTag({ path: AXE });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  for (const b of bad) fail.push(`${what} axe ${b}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${what}: sideways scrolling`);
}
const api = async (email, path, init = {}) => {
  const res = await fetch(`${base}/api/core${path}`, { ...init, headers: { Authorization: `Bearer mock-token-${email}`, 'Content-Type': 'application/json' } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const visible = (page, text, timeout = 30_000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);

const browser = await launch();
let courseId = null;
try {
  // ── M112: the landing and the hub ──
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const tabs = page.getByRole('tablist', { name: 'Choose an app' });
    await tabs.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1200);
    check(await tabs.getByText('Lab', { exact: true }).count() === 4, `${width}: four Lab tags on the app tabs`);
    check(await tabs.getByRole('tab', { name: 'UniVersity' }).getAttribute('aria-selected') === 'true', `${width}: UniVersity leads`);
    check(await page.getByRole('button', { name: 'What does Lab mean?' }).count() === 1, `${width}: the FAQ explains Lab`);
    await axe(page, `${width} landing`);
    await page.goto(base + '/?app=play', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByRole('heading', { name: /Worlds/ }).first().waitFor({ timeout: 60_000 }).catch(() => {});
    const text = await page.locator('main').innerText();
    check(/Skyline Obby/.test(text) && /Orbit Breach/.test(text) && /Reef Rescue/.test(text), `${width}: Play's worlds for everyone`);
    check(!/Night Shift|STORMFALL/.test(text), `${width}: no rated world on the public page`);
    check(!errors.length, `${width}: landing page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
  for (const [width, scheme] of [[390, 'light'], [1280, 'dark']]) {
    const ctx = await signedIn(browser, base, S, { width, height: 900 }, { colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(base + '/hub', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const apps = page.locator('section[aria-labelledby="apps-h"]');
    await apps.getByRole('heading', { name: /UniVersity/ }).waitFor({ timeout: 60_000 });
    check(await apps.getByText('Lab', { exact: true }).count() === 4, `${width} ${scheme}: four Lab tags on the hub`);
    await axe(page, `${width} ${scheme} hub`);
    // ── M110: Relief's emergency line ──
    await page.goto(base + '/relief', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByRole('button', { name: 'Ask or offer help' }).first().click({ timeout: 60_000 });
    const form = page.getByRole('form', { name: 'Ask or offer help' });
    check(await visible(form, 'UniVerse isn’t an emergency service.'), `${width} ${scheme}: Relief's form says it isn't an emergency service`);
    await page.waitForTimeout(400);
    await axe(page, `${width} ${scheme} Relief form`);
    await form.getByRole('radio', { name: 'I can offer' }).click();
    check(await form.getByText('UniVerse isn’t an emergency service.').count() === 0, `${width} ${scheme}: offers don't show the line`);
    await ctx.close();
  }

  // ── M113: the class link ──
  const code = `M113-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const made = await api(T, '/courses', { method: 'POST', body: JSON.stringify({ code, name: 'Invite check', credits: 3 }) });
  courseId = made.body?.id ?? null;
  check(made.status < 300 && courseId, `made a course (${made.status} ${JSON.stringify(made.body).slice(0, 120)})`);
  if (courseId) {
    const link = `/join?course=${courseId}`;
    // The teacher: "No students yet", publish from there, then the link.
    for (const [width, scheme] of [[390, 'light'], [1280, 'dark']]) {
      const ctx = await signedIn(browser, base, T, { width, height: 900 }, { colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(`${base}/teacher/blackboard?course=${courseId}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const empty = page.locator('section[aria-labelledby="no-students-h"]');
      check(await empty.waitFor({ timeout: 60_000 }).then(() => true, () => false), `${width} ${scheme}: "No students yet" on an empty course`);
      if (width === 390) {
        await empty.getByRole('button', { name: `Publish ${code}` }).click();
        check(await empty.getByRole('button', { name: 'Share the link' }).waitFor({ timeout: 30_000 }).then(() => true, () => false), `${width}: published, the link to share`);
      }
      check(await visible(empty, link), `${width} ${scheme}: the link is shown`);
      await page.getByRole('button', { name: 'Invite students' }).click();
      const sheet = page.getByRole('dialog', { name: `Invite students to ${code}` });
      check(await sheet.waitFor({ timeout: 30_000 }).then(() => true, () => false), `${width} ${scheme}: Invite students opens the sheet`);
      await page.waitForTimeout(500);
      await axe(page, `${width} ${scheme} invite sheet`);
      await ctx.close();
    }
    // A student opens the link and joins.
    {
      const ctx = await signedIn(browser, base, S, { width: 390, height: 860 });
      const page = await ctx.newPage();
      await page.goto(base + link, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      check(await visible(page, 'Join this class?', 60_000), 'student: the join card');
      check(await visible(page, `${code} · Invite check`), 'student: the class is named');
      await axe(page, '390 join card');
      await page.getByRole('button', { name: 'Join the class' }).click();
      check(await page.waitForURL(/\/student\/blackboard\?course=/, { timeout: 60_000 }).then(() => true, () => false), `student: joined and on the course (${page.url()})`);
      const after = await api(S, `/courses/${courseId}`);
      check(after.body?.enrollments?.some?.((e) => e.student?.email === S || e.studentId), 'student: enrolled on the server');
      await page.goto(base + link, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      check(await visible(page, 'You’re in this class', 60_000), 'student: the link again says you are in');
      await ctx.close();
    }
    // A student who opened the link before signing in goes back to it; "Not now" goes home.
    {
      const ctx = await signedIn(browser, base, S2, { width: 1280, height: 900 });
      await ctx.addInitScript((id) => { if (!sessionStorage.getItem('uv-check-once')) { sessionStorage.setItem('uv-check-once', '1'); localStorage.setItem('uv-join-course', JSON.stringify({ id, at: Date.now() })); } }, courseId);
      const page = await ctx.newPage();
      // Signing up or in ends with homeFor (the landing uses it too for someone signed in).
      await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      check(await page.waitForURL(/\/join\?course=/, { timeout: 60_000 }).then(() => true, () => false), `pending invite: sent back to the class link (${page.url()})`);
      const card = await visible(page, 'Join this class?', 60_000);
      check(card, 'pending invite: the join card');
      if (card) {
        await page.getByRole('link', { name: 'Not now' }).click();
        await page.waitForURL((u) => !u.pathname.startsWith('/join'), { timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        check(!/\/join/.test(page.url()), `"Not now" goes home, not back to the link (${page.url()})`);
        await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForTimeout(4000);
        check(!/\/join/.test(page.url()), `after "Not now" the invite is forgotten (${page.url()})`);
      }
      await ctx.close();
    }
    // Signed out: a student sign-up that opens straight away.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
      const page = await ctx.newPage();
      await page.goto(base + link, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      check(await visible(page, 'You’re invited to a class', 60_000), 'signed out: the invite');
      await axe(page, '390 invite signed out');
      await page.getByRole('link', { name: 'Create my account' }).click();
      check(await page.waitForURL(/\/register\?app=campus/, { timeout: 60_000 }).then(() => true, () => false), 'signed out: to sign-up');
      check(await visible(page, 'You’re joining a class from your teacher’s link', 60_000), 'sign-up: says the account opens straight away');
      check(await page.getByText('Which describes you?').count() === 0, 'sign-up: no student-card question');
      check(await page.getByRole('button', { name: /Continue as a student/ }).count() === 1, 'sign-up: Continue as a student');
      await axe(page, '390 sign-up from a class link');
      await ctx.close();
    }
    // The teacher opening their own link.
    {
      const ctx = await signedIn(browser, base, T, { width: 1280, height: 900 });
      const page = await ctx.newPage();
      await page.goto(base + link, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      check(await visible(page, 'This is your class’s link', 60_000), 'teacher: "your class’s link"');
      await ctx.close();
    }
  }
} finally {
  if (courseId) {
    const gone = await api(T, `/courses/${courseId}`, { method: 'DELETE' });
    check(gone.status < 300, `deleted the check's course (${gone.status})`);
  }
  await browser.close();
}
console.log(fail.length ? `✗ ${fail.length} problems\n${fail.join('\n')}` : '✓ Lab tags, the worlds for everyone, Relief\'s emergency line, the class link from publish to joined; axe at 390 and 1280, light and dark');
process.exit(fail.length ? 1 : 0);
