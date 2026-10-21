// Q26 in the browser on the built Worker (pnpm local:serve --test-secret --owner-test): the blog
// (the owner writes a draft in the owner console → Blog, it isn't public until published, then it's
// listed at /blog and read at /blog/<slug>), scheduled report exports (Admin → Reports: a schedule,
// "Save now" puts a CSV in My files → Scheduled reports with an in-app note; the read-only demo
// admin is refused) and Export CSV on the analytics people list. The owner is a made-up
// owner@check.test (signed in against a key server on port 8790), made an admin for the export
// part. Axe at 390 and 1280 px, light and dark. Everything made here is removed at the end.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', OWNER = 'owner@check.test', AD = 'demo@admin.com';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const out = { checks: [], axe: [], wide: [] };
const ok = (name, v) => out.checks.push(`${v ? '✓' : '✗'} ${name}`);

// ── A stand-in for Google's sign-in keys (this machine only) and the owner's sign-in ──
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'check-key', alg: 'RS256', use: 'sig' };
const keys = createServer((_, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8790);
const project = 'universe-71e68', now = Math.floor(Date.now() / 1000);
// A sign-in is remembered until it expires, so after the owner is made an admin a new one is signed.
const signIn = (jti) => new SignJWT({ email: OWNER, email_verified: true, name: 'Check Owner', auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} } })
  .setProtectedHeader({ alg: 'RS256', kid: 'check-key' }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project)
  .setSubject('check-owner-uid').setJti(jti).setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
const ownerToken = await signIn('owner');
const call = async (token, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})), h: r.headers };
};
const pub = async (path) => { const r = await fetch(base + path); return { s: r.status, b: await r.json().catch(() => ({})) }; };

async function axe(page, where) {
  await page.mouse.move(1, 1).catch(() => {});
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target}`));
  if (v.length) out.axe.push(`${where}: ${v.join('; ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) out.wide.push(where);
}

let ownerId = null, postId = null;
const browser = await launch();
try {
  const me = (await call(ownerToken, '/api/core/auth/me')).b;
  ownerId = me.id;
  ok('the test owner signs in', me.owner === true);
  const context = async (width, theme, token = ownerToken, user = me) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', acceptDownloads: true, ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript(([t, u, th]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    }, [token, user, theme]);
    if (!token.startsWith('mock-token-')) await ctx.route(/\/api\//, (route) => { const h = route.request().headers(); return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${token}` } }); });
    return ctx;
  };

  // ── The blog ──
  {
    const ctx = await context(1280, 'light');
    const page = await ctx.newPage();
    await page.goto(`${base}/console?tab=blog`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByRole('button', { name: 'New post' }).click();
    await page.getByLabel('Title').fill('Check post: a new term');
    ok('the address follows the title', (await page.getByLabel('Address').inputValue()) === 'check-post-a-new-term');
    await page.getByLabel('Summary (shown under the title and in the list of posts)').fill('What changes this term.');
    await page.getByLabel('Post').fill('## What is new\n\nA paragraph with **bold** and a [link](https://example.com).\n\n- One\n- Two');
    await page.getByRole('radio', { name: 'Preview' }).or(page.getByRole('button', { name: 'Preview' })).first().click();
    ok('the preview shows the Markdown as on the blog', await page.getByRole('heading', { name: 'What is new' }).isVisible());
    await axe(page, 'console blog editor 1280 light');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByText('Draft saved').waitFor({ timeout: 10_000 });
    postId = rows(`SELECT id FROM blog_posts WHERE slug='check-post-a-new-term'`)[0]?.id;
    ok('the draft is saved', !!postId);
    ok('a draft is not public', (await pub('/api/core/blog/check-post-a-new-term')).s === 404 && !(await pub('/api/core/blog')).b.posts?.some((p) => p.slug === 'check-post-a-new-term'));
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.getByText('Published on the blog').waitFor({ timeout: 10_000 });
    const listed = await pub('/api/core/blog');
    ok('published: listed on the blog', listed.b.posts?.[0]?.slug === 'check-post-a-new-term' && listed.b.posts[0].minutes === 1);
    await page.getByRole('button', { name: 'All posts' }).click();
    ok('the console list shows it published', await page.getByText(/^Published /).first().waitFor({ timeout: 10_000 }).then(() => true, () => false));
    await axe(page, 'console blog list 1280 light');
    await ctx.close();
    ok('the demo admin can’t see the blog drafts', (await call(`mock-token-${AD}`, '/api/core/owner/blog')).s === 404);

    for (const [width, theme] of [[390, 'light'], [1280, 'dark']]) {
      const c = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const p = await c.newPage();
      await p.goto(`${base}/blog`, { waitUntil: 'networkidle', timeout: 60_000 });
      const card = p.getByRole('link', { name: /Check post: a new term/ });
      ok(`/blog lists the post (${width})`, await card.waitFor({ timeout: 15_000 }).then(() => true, () => false));
      await axe(p, `/blog ${width} ${theme}`);
      await card.click();
      ok(`the post opens at its address (${width})`, await p.getByRole('heading', { name: 'Check post: a new term', level: 1 }).waitFor({ timeout: 15_000 }).then(() => true, () => false) && p.url().endsWith('/blog/check-post-a-new-term'));
      ok(`the post's text is shown (${width})`, await p.getByRole('heading', { name: 'What is new' }).isVisible() && await p.getByRole('link', { name: 'link' }).getAttribute('href') === 'https://example.com');
      await axe(p, `/blog/<post> ${width} ${theme}`);
      if (width === 390) {
        await p.goto(`${base}/blog/no-such-post`, { waitUntil: 'networkidle' });
        ok('a wrong address says so', await p.getByRole('heading', { name: 'This post isn’t on the blog' }).waitFor({ timeout: 15_000 }).then(() => true, () => false));
        await p.goto(`${base}/`, { waitUntil: 'networkidle' });
        ok('the site footer links to the blog', await p.locator('footer').getByRole('link', { name: 'Blog' }).count() === 1);
      }
      await c.close();
    }
    const back = await call(ownerToken, `/api/core/owner/blog/${postId}`, { title: 'Check post: a new term', body: 'x', status: 'DRAFT' }, 'PUT');
    ok('taken back: not public any more', back.s === 200 && (await pub('/api/core/blog/check-post-a-new-term')).s === 404);
  }

  // ── Scheduled report exports (the test owner made an admin for this) ──
  sql(`UPDATE users SET role='ADMIN', status='ACTIVE' WHERE id='${ownerId}'`);
  const adminToken = await signIn('admin');
  const asAdmin = { ...me, role: 'ADMIN' };
  {
    const ctx = await context(1280, 'light', adminToken, asAdmin);
    const page = await ctx.newPage();
    await page.goto(`${base}/admin/reports`, { waitUntil: 'networkidle', timeout: 60_000 });
    const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Scheduled exports' }) });
    await panel.waitFor({ timeout: 20_000 });
    await panel.getByLabel('Role').selectOption('TEACHER');
    await panel.getByLabel('How often').selectOption('MONTH');
    await panel.getByRole('button', { name: 'Schedule' }).click();
    ok('a schedule is added', await panel.getByText('Members (teachers)').waitFor({ timeout: 10_000 }).then(() => true, () => false));
    ok('…every month, first file at the next daily run', await panel.getByText(/Every month · first file at the next daily run/).isVisible());
    await axe(page, 'admin reports scheduled exports 1280 light');
    await panel.getByRole('button', { name: /Save now/ }).click();
    await page.getByText(/Saved to My files/).waitFor({ timeout: 20_000 }).catch(() => {});
    const file = rows(`SELECT f.name, f.size, d.name AS folder FROM space_files f JOIN space_folders d ON d.id=f.folderId WHERE f.spaceKind='me' AND f.spaceId='${ownerId}'`)[0];
    ok('"Save now" puts the CSV in My files → Scheduled reports', file?.folder === 'Scheduled reports' && /^Members \(teachers\) \d{4}-\d{2}-\d{2}\.csv$/.test(file?.name ?? '') && file.size > 100);
    ok('…with a note in the app', rows(`SELECT COUNT(*) AS n FROM notifications WHERE userId='${ownerId}' AND title LIKE 'Report saved:%'`)[0].n === 1);
    ok('…and the next one in a month', await panel.getByText(/last saved .* next /).waitFor({ timeout: 10_000 }).then(() => true, () => false));
    await page.goto(`${base}/files`, { waitUntil: 'networkidle' });
    ok('My files shows the Scheduled reports folder', await page.getByText('Scheduled reports').first().waitFor({ timeout: 15_000 }).then(() => true, () => false));
    await ctx.close();
    for (const [width, theme] of [[390, 'dark']]) {
      const c = await context(width, theme, adminToken, asAdmin);
      const p = await c.newPage();
      await p.goto(`${base}/admin/reports`, { waitUntil: 'networkidle', timeout: 60_000 });
      await p.getByText('Members (teachers)').waitFor({ timeout: 20_000 });
      await axe(p, `admin reports scheduled exports ${width} ${theme}`);
      await c.close();
    }
    const id = rows(`SELECT id FROM report_schedules WHERE ownerId='${ownerId}'`)[0]?.id;
    ok('the demo admin can’t add or run one', (await call(`mock-token-${AD}`, '/api/admin/report-schedules', { type: 'impact', every: 'DAY' })).s >= 400 && (await call(`mock-token-${AD}`, `/api/admin/report-schedules/${id}/run`, {})).s >= 400);
    ok('…nor see this admin’s', !(await call(`mock-token-${AD}`, '/api/admin/report-schedules')).b.schedules?.some((s) => s.id === id));
    ok('a made-up report is refused', (await call(adminToken, '/api/admin/report-schedules', { type: 'constructor', every: 'DAY' })).s === 400);
    ok('stopping it removes it', (await call(adminToken, `/api/admin/report-schedules/${id}`, undefined, 'DELETE')).s === 200 && !rows(`SELECT id FROM report_schedules WHERE id='${id}'`).length);
  }

  // ── Export CSV on the analytics people list ──
  {
    const ctx = await context(1280, 'light', adminToken, asAdmin);
    const page = await ctx.newPage();
    await page.goto(`${base}/admin/analytics`, { waitUntil: 'networkidle', timeout: 60_000 });
    const button = page.getByRole('button', { name: /Export CSV/ }).first();
    if (await button.waitFor({ timeout: 20_000 }).then(() => true, () => false)) {
      const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
      const text = (await (await dl.createReadStream()).toArray()).join('');
      ok('analytics: the people shown download as CSV', /^﻿?Name,Email,Designation/.test(text) || /^﻿?Rank,Name/.test(text));
    } else ok('analytics: Export CSV button', false);
    await ctx.close();
  }
} finally {
  await browser.close();
  keys.close();
  if (postId) sql(`DELETE FROM blog_posts WHERE id='${postId}'`);
  sql(`DELETE FROM blog_posts WHERE slug='check-post-a-new-term'`);
  if (ownerId) {
    const files = rows(`SELECT id, url FROM space_files WHERE spaceKind='me' AND spaceId='${ownerId}'`);
    for (const f of files) {
      const key = /\/api\/files\/([^/]+)\//.exec(f.url)?.[1];
      if (key) sql(`DELETE FROM stored_files WHERE key='${key}'`);
    }
    sql(`DELETE FROM space_file_versions WHERE fileId IN (SELECT id FROM space_files WHERE spaceKind='me' AND spaceId='${ownerId}')`);
    sql(`DELETE FROM space_files WHERE spaceKind='me' AND spaceId='${ownerId}'`);
    sql(`DELETE FROM space_folders WHERE spaceKind='me' AND spaceId='${ownerId}'`);
    sql(`DELETE FROM report_schedules WHERE ownerId='${ownerId}'`);
    sql(`DELETE FROM notifications WHERE userId='${ownerId}'`);
    sql(`DELETE FROM organizations WHERE ownerId='${ownerId}'`);
    sql(`DELETE FROM audit_logs WHERE actorId='${ownerId}'`);
    sql(`DELETE FROM owner_changes WHERE ownerId='${ownerId}'`);
    sql(`DELETE FROM login_events WHERE userId='${ownerId}'`);
    sql(`DELETE FROM users WHERE id='${ownerId}'`);
  }
}
console.log(out.checks.join('\n'));
console.log(out.axe.length ? `axe:\n${out.axe.join('\n')}` : 'axe: clean');
console.log(out.wide.length ? `sideways scrolling: ${out.wide.join(', ')}` : 'no sideways scrolling');
process.exit(out.checks.some((c) => c.startsWith('✗')) || out.axe.length || out.wide.length ? 1 : 0);
