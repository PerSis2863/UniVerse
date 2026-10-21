// Q22 follow-ups and Q23 small items in the browser on the built Worker (pnpm local:serve
// --test-secret): the due-date countdown on Alice's assignments; "asked the tutor" on her mastery
// map; her library card; the teacher's Copy link / Remind / Duplicate; the linked class call box in
// an in-person class; the teacher's leave balances; Settings → week starts on Sunday, then the
// calendar's month starts on Sunday; "?" shows the keyboard shortcuts; the admin's fees and staff
// pages (read-only demo admin). Axe at 390 and 1280 px, light and dark, no sideways scrolling.
// Everything made here is removed at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', AD = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
// One retry: a kept-alive connection can go stale while the slow database commands run.
const send = (who, path, body, method) => fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
const call = async (who, path, body, method) => { const r = await send(who, path, body, method).catch(() => send(who, path, body, method)); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const ts = (d = new Date()) => d.toISOString().replace('Z', '+00:00');
const uid = (email) => rows(`SELECT id FROM users WHERE email='${email}'`)[0].id;
const aId = uid(A);
const began = ts();
const out = { checks: [], axe: [], wide: [] };
const ok = (name, v) => out.checks.push(`${v ? '✓' : '✗'} ${name}`);
const shades = [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']];

async function axe(page, where) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  if (v.length) out.axe.push(`${where}: ${v.join('; ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) out.wide.push(where);
}

const made = { assignment: null, concept: null, session: null, leave: null };
try {
  // ── Data: an assignment due in 3 hours, a concept Alice asked the tutor about, an in-person class linked to its call, a half day of leave ──
  const src = rows(`SELECT id FROM assignments WHERE courseId='${C}' ORDER BY createdAt LIMIT 1`)[0];
  made.assignment = (await call(T, `/api/assignments/${src.id}/duplicate`, {})).b.id;
  sql(`UPDATE assignments SET title='Q23 countdown essay', dueDate='${ts(new Date(Date.now() + 3 * 3_600_000 + 120_000))}' WHERE id='${made.assignment}'`);
  await call(T, `/api/courses/${C}/concepts`, { action: 'add', concepts: [{ name: 'Q23 hash tables', description: 'Keys, buckets and collisions' }] });
  made.concept = rows(`SELECT id FROM course_concepts WHERE courseId='${C}' AND name='Q23 hash tables'`)[0].id;
  for (let i = 0; i < 2; i++) sql(`INSERT INTO concept_signals (id, courseId, studentId, conceptId, kind, outcome, refId, createdAt) VALUES ('q23ui${i}${Date.now()}', '${C}', '${aId}', '${made.concept}', 'TUTOR', 0, NULL, '${ts()}')`);
  made.session = (await call(T, '/api/classroom', { courseId: C })).b.id;
  await call(T, `/api/classroom/${made.session}`, { action: 'link', on: true });
  const day = new Date(Date.now() + 9 * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  made.leave = (await call(T, '/api/staff/me', { action: 'leave', type: 'PERSONAL', fromDate: day.toISOString().slice(0, 10), toDate: day.toISOString().slice(0, 10), halfDay: 'AM', reason: 'Q23 UI check' })).b.id;

  const browser = await launch();
  const me = {};
  for (const e of [T, A, AD]) me[e] = (await call(e, '/api/core/auth/me')).b;
  const open = async (who, width, theme, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(([t, u, th, more]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    }, [`mock-token-${who}`, me[who], theme, extra]);
    return { ctx, page: await ctx.newPage() };
  };
  try {
    // Alice: the countdown, "asked the tutor", her library card, the shortcuts sheet.
    for (const [width, theme] of shades) {
      const { ctx, page } = await open(A, width, theme);
      await page.goto(`${base}/student/assignments`, { waitUntil: 'networkidle', timeout: 60_000 });
      const row = page.getByRole('link', { name: /Q23 countdown essay/ });
      await row.waitFor({ timeout: 15_000 });
      if (width === 390 && theme === 'light') ok('countdown chip: ' + (await row.innerText()).replace(/\s+/g, ' ').slice(0, 80), /Due in 3 h/.test(await row.innerText()));
      await axe(page, `assignments ${width} ${theme}`);
      await page.goto(`${base}/student/mastery?course=${C}`, { waitUntil: 'networkidle', timeout: 60_000 });
      const tile = page.getByText(/asked the tutor 2×/).first();
      const seen = await tile.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
      if (width === 390 && theme === 'light') ok('mastery map: asked the tutor 2×', seen);
      await axe(page, `mastery ${width} ${theme}`);
      if (width === 1280) {
        await page.goto(`${base}/library`, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.getByRole('button', { name: /My library card/ }).click();
        const svg = page.locator('svg[aria-label="Library card barcode"], [aria-label="Library card barcode"]').first();
        if (theme === 'light') ok('library card barcode', await svg.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false));
        await page.waitForTimeout(1000); // the sheet slides in
        await axe(page, `library card ${width} ${theme}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {});
        await page.keyboard.press('Shift+Slash');
        const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
        if (theme === 'light') ok('"?" shows the keyboard shortcuts', await sheet.waitFor({ timeout: 8000 }).then(() => true).catch(() => false));
        await page.waitForTimeout(1000);
        await axe(page, `shortcuts ${width} ${theme}`);
      }
      await ctx.close();
    }

    // Alice: week starts on Sunday in Settings, then the month view.
    {
      const { ctx, page } = await open(A, 1280, 'light');
      await page.goto(`${base}/student/settings?section=appearance`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByRole('button', { name: 'Sunday', exact: true }).click();
      ok('Settings saved Sunday', await page.evaluate(() => localStorage.getItem('uv-week-start')) === 'sun');
      ok('Mirror my video switch', await page.getByRole('switch', { name: 'Mirror my video' }).isVisible());
      await axe(page, 'settings appearance 1280 light');
      await page.goto(`${base}/student/calendar`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByRole('radio', { name: 'Month' }).or(page.getByRole('tab', { name: 'Month' })).or(page.getByRole('button', { name: 'Month', exact: true })).first().click();
      await page.waitForTimeout(600);
      const head = await page.locator('section span.uppercase').first().innerText().catch(() => '');
      ok(`month starts on "${head}"`, /sun/i.test(head));
      await ctx.close();
    }

    // The teacher: Copy link / Remind / Duplicate; the in-person class's call box; leave balances.
    for (const [width, theme] of shades) {
      const { ctx, page } = await open(T, width, theme);
      await page.goto(`${base}/teacher/assignments/${made.assignment}`, { waitUntil: 'networkidle', timeout: 60_000 });
      const remind = page.getByRole('button', { name: /^Remind \d+/ });
      await remind.waitFor({ timeout: 15_000 });
      if (width === 1280 && theme === 'light') {
        ok('Copy link and Duplicate shown', await page.getByRole('button', { name: 'Copy link for students' }).isVisible() && await page.getByRole('button', { name: 'Duplicate the assignment' }).isVisible());
        await remind.click();
        ok('reminded', await page.getByText(/Reminded \d+|reminded/i).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false));
      }
      await axe(page, `teacher assignment ${width} ${theme}`);
      await page.goto(`${base}/teacher/live?course=${C}`, { waitUntil: 'networkidle', timeout: 60_000 });
      const link = page.getByRole('switch', { name: 'Link the class call to this class' });
      const shown = await link.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
      if (width === 1280 && theme === 'light') ok('in-person class: linked call box', shown && (await link.getAttribute('aria-checked')) === 'true');
      await axe(page, `in-person class ${width} ${theme}`);
      await page.goto(`${base}/teacher/staff`, { waitUntil: 'networkidle', timeout: 60_000 });
      if (width === 1280 && theme === 'light') ok('my leave: half day and balances', await page.getByText(/morning|half day/i).first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false));
      await axe(page, `my staff ${width} ${theme}`);
      await ctx.close();
    }

    // The demo admin (read-only): fees and staff pages draw with the new parts.
    for (const [width, theme] of [[1280, 'light'], [390, 'dark']]) {
      const { ctx, page } = await open(AD, width, theme);
      await page.goto(`${base}/admin/staff?view=leave`, { waitUntil: 'networkidle', timeout: 60_000 });
      if (width === 1280) ok('staff admin: leave allowances', await page.getByText(/Leave allowances/).first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false));
      await axe(page, `admin staff ${width} ${theme}`);
      await page.goto(`${base}/admin/fees`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(800);
      await axe(page, `admin fees ${width} ${theme}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  if (made.assignment) sql(`DELETE FROM notifications WHERE link='/student/assignments/${made.assignment}'; DELETE FROM concept_tags WHERE refId LIKE '${made.assignment}:%'; DELETE FROM assignments WHERE id='${made.assignment}'`);
  if (made.concept) sql(`DELETE FROM concept_signals WHERE conceptId='${made.concept}'; DELETE FROM course_concepts WHERE id='${made.concept}'`);
  if (made.session) sql(`DELETE FROM classroom_sessions WHERE id='${made.session}'`);
  if (made.leave) sql(`DELETE FROM staff_leave WHERE id='${made.leave}'`);
  sql(`DELETE FROM notifications WHERE createdAt >= '${began}' AND title LIKE 'Leave request:%'`);
  sql(`DELETE FROM audit_logs WHERE createdAt >= '${began}' AND summary LIKE 'Duplicated assignment%'`);
  console.log(JSON.stringify(out, null, 1));
}
