// The security fix and S4 on the built Worker (pnpm local:serve --test-secret):
// 1. Admins see only their own school: the demo admin (main school) doesn't see the "Q3 Test
//    School" student in the people list, their page, the activity log or the dashboard counts; moved
//    into that school for a moment (then back), they see only its people and not the main school's.
// 2. Scroll motion: blocks below the fold wait and rise as they scroll into view, nothing is left
//    hidden after scrolling to the bottom, figures end on their real value, nothing moves for Reduce
//    Motion. Phone and computer, light and dark, axe after scrolling.
// 3. /api/build-budget answers (and lets builds through here: not the paid plan).
// Restores everything it changes.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', AD = 'demo@admin.com', S = 'demo@student.com';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const get = (token, path) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
const call = async (token, path) => { const r = await get(token, path).catch(() => new Promise((ok) => setTimeout(ok, 1500)).then(() => get(token, path))); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const pause = () => new Promise((ok) => setTimeout(ok, 800));
const out = { checks: [], axe: [], wide: [] };
const ok = (name, v) => out.checks.push(`${v ? '✓' : '✗'} ${name}`);

const admin = rows(`SELECT id, organizationId FROM users WHERE email='${AD}'`)[0];
// The demo admin owns the test school locally (and so may see it); for this check another admin owns it.
const school = rows(`SELECT ownerId FROM organizations WHERE id='orgq3test'`)[0];
const otherAdmin = rows(`SELECT id FROM users WHERE email='it-support@universe.com'`)[0];
const other = rows(`SELECT id, email FROM users WHERE organizationId='orgq3test' LIMIT 1`)[0];
// A student of the main school (no school). Locally the demo student is in the test school.
const mainStudent = rows(`SELECT id FROM users WHERE organizationId IS NULL AND role='STUDENT' LIMIT 1`)[0];

// ── 1. School separation ──
try {
  if (!other || !school || !otherAdmin) ok('a person in another school exists (Q3 Test School)', false);
  else {
    sql(`UPDATE organizations SET ownerId='${otherAdmin.id}' WHERE id='orgq3test'`);
    await pause();
    const t = `mock-token-${admin.id}`;
    const list = await call(t, '/api/core/users?limit=5000');
    ok('main-school admin: the other school’s person is not in the people list', list.s === 200 && !list.b.some((u) => u.id === other.id) && list.b.some((u) => u.id === mainStudent.id));
    ok('…their overview is "not found"', (await call(t, `/api/core/users/${other.id}/overview`)).s === 404);
    const card = await call(t, `/api/core/users/${other.id}`);
    ok('…their page shows only the public card (no email)', card.s === 200 && !('email' in card.b));
    const stats = await call(t, '/api/core/users/stats');
    const total = rows(`SELECT COUNT(*) AS n FROM users WHERE organizationId IS NULL`)[0].n;
    ok('…counts cover only the main school', stats.b.total === total);
    // For a moment the admin belongs to the other school (a fresh sign-in by id, not the remembered one).
    sql(`UPDATE users SET organizationId='orgq3test' WHERE id='${admin.id}'`);
    await pause();
    const t2 = `mock-token-${AD}`;
    const theirs = await call(t2, '/api/core/users?limit=5000');
    ok('other-school admin: sees that school’s people only', theirs.s === 200 && theirs.b.some((u) => u.id === other.id) && !theirs.b.some((u) => u.id === mainStudent.id));
    ok('…the main school’s student is "not found"', (await call(t2, `/api/core/users/${mainStudent.id}/overview`)).s === 404);
    const audit = await call(t2, '/api/core/audit?limit=200');
    const actors = new Set(audit.b.entries?.map((e) => e.actorId));
    const outside = [...actors].filter((id) => id && rows(`SELECT organizationId FROM users WHERE id='${id}'`)[0]?.organizationId !== 'orgq3test');
    ok('…the activity log shows only that school’s people’s actions', audit.s === 200 && outside.length === 0);
  }
} finally {
  sql(`UPDATE users SET organizationId=${admin.organizationId ? `'${admin.organizationId}'` : 'NULL'} WHERE id='${admin.id}'`);
  if (school) sql(`UPDATE organizations SET ownerId='${school.ownerId}' WHERE id='orgq3test'`);
}

// ── 3. Build budget ──
const budget = (await call('none', '/api/build-budget')).b;
ok('/api/build-budget answers, and lets builds through here', budget && budget.stop === false && budget.limit === 6000);

// ── 2. Scroll motion ──
const me = {};
for (const e of [S, AD]) me[e] = (await call(`mock-token-${e}`, '/api/core/auth/me')).b;
const browser = await launch();
try {
  const open = async (who, width, theme, reduced = false) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference', ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(([t, u, th]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    }, [`mock-token-${who}`, me[who], theme]);
    return { ctx, page: await ctx.newPage() };
  };
  // Scrolls the page's scroll box (or the window) down step by step, then reports what's still hidden.
  const scrollAll = (page) => page.evaluate(async () => {
    const box = [...document.querySelectorAll('main, [class*="overflow-y-auto"]')].find((el) => el.scrollHeight > el.clientHeight + 50) ?? document.scrollingElement;
    const waiting = document.querySelectorAll('[data-sr="wait"]').length;
    for (let y = 0; y <= box.scrollHeight; y += 300) { box.scrollTop = y; window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 1600));
    const hidden = [...document.querySelectorAll('[data-sr]')].filter((el) => getComputedStyle(el).opacity !== '1').length;
    return { waiting, hidden, left: document.querySelectorAll('[data-sr="wait"]').length };
  });
  const pages = [[S, '/student'], [S, '/student/courses'], [S, '/student/impact'], [AD, '/admin'], [AD, '/admin/insights'], [AD, '/admin/analytics'], [AD, '/admin/reports']];
  for (const [width, theme] of [[390, 'light'], [1280, 'dark']]) {
    for (const [who, path] of pages) {
      const { ctx, page } = await open(who, width, theme);
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(2500);
      const r = await scrollAll(page);
      ok(`${path} ${width}: ${r.waiting} parts waited below the fold; none left hidden after scrolling (${r.hidden}/${r.left})`, r.hidden === 0 && r.left === 0);
      if (path === '/admin/insights' || path === '/student') {
        await page.addScriptTag({ path: AXE });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes[0]?.target}`));
        if (v.length) out.axe.push(`${path} ${width} ${theme}: ${v.join('; ')}`);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) out.wide.push(`${path} ${width}`);
      }
      await ctx.close();
    }
  }
  // Figures end on their real value (the admin home's numbers count up).
  {
    const { ctx, page } = await open(AD, 1280, 'light');
    await page.goto(`${base}/admin/insights`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => [...document.querySelectorAll('.tabular-nums')].map((e) => e.textContent));
    await scrollAll(page);
    const after = await page.evaluate(() => [...document.querySelectorAll('.tabular-nums')].map((e) => e.textContent));
    ok('figures end on exactly their real values', JSON.stringify(before) === JSON.stringify(after));
    await ctx.close();
  }
  // Reduce Motion: nothing waits.
  {
    const { ctx, page } = await open(S, 390, 'light', true);
    await page.goto(`${base}/student`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(2000);
    ok('Reduce Motion: no part waits or moves', (await page.evaluate(() => document.querySelectorAll('[data-sr]').length)) === 0);
    await ctx.close();
  }
  // The public blog and legal pages (signed out).
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    for (const path of ['/privacy', '/', '/blog']) {
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(1500);
      const r = await scrollAll(page);
      ok(`${path} (signed out): none left hidden after scrolling (${r.waiting} waited)`, r.hidden === 0 && r.left === 0);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(out.checks.join('\n'));
console.log(out.axe.length ? `axe:\n${out.axe.join('\n')}` : 'axe: clean');
console.log(out.wide.length ? `sideways scrolling: ${out.wide.join(', ')}` : 'no sideways scrolling');
process.exit(out.checks.some((c) => c.startsWith('✗')) || out.axe.length || out.wide.length ? 1 : 0);
