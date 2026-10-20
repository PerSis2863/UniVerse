// Q19 owner console in the browser on the built Worker (pnpm local:serve --test-secret --owner-test).
// The owner (a made-up owner@check.test whose Google sign-in is checked against a key server this
// script runs on port 8790) opens Schools (health, growth charts, a school's people), "View as" a
// student in a new tab (read-only: the banner, changes and private messages refused, the owner's own
// sign-in untouched, End), Moderation (a test chat flag dismissed) and the gradual rollout card.
// Axe at 390/1280, light/dark, no sideways scrolling. Everything made here is removed at the end.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', OWNER = 'owner@check.test', S = 'demo@student.com';
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: 'ignore' });
const rows = (c) => JSON.parse(execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const started = new Date().toISOString().replace('Z', '+00:00');

// ── A stand-in for Google's sign-in keys (this machine only) and the owner's sign-in ──
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'check-key', alg: 'RS256', use: 'sig' };
const keys = createServer((_, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8790);
const project = 'universe-71e68';
const now = Math.floor(Date.now() / 1000);
const ownerToken = await new SignJWT({ email: OWNER, email_verified: true, name: 'Check Owner', auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} } })
  .setProtectedHeader({ alg: 'RS256', kid: 'check-key' }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project)
  .setSubject('check-owner-uid').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
const call = async (token, path, body, method) => {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};

// ── Put things back afterwards ───────────────────────────────────────────
const [control] = rows(`SELECT switches FROM server_control WHERE id='main'`);
const student = rows(`SELECT id, organizationId FROM users WHERE email='${S}'`)[0];
const chat = rows(`SELECT conversationId AS id FROM conversation_participants WHERE userId='${student.id}' LIMIT 1`)[0];
const flagId = `check-flag-${Date.now()}`;
sql(`INSERT INTO safety_flags (id, conversationId, senderId, kind, severity, excerpt, source, repeats, status, createdAt) VALUES ('${flagId}', '${chat.id}', '${student.id}', 'bullying', 'medium', 'Console check: a made-up flag', 'words', 0, 'OPEN', '${started}')`);
function restore() {
  sql(`DELETE FROM safety_flags WHERE id='${flagId}'`);
  // The settings row is made on first use; if this run made it, remove it again.
  if (control) sql(`UPDATE server_control SET switches=${q(control.switches)} WHERE id='main'`);
  else sql(`DELETE FROM server_control WHERE id='main'`);
  const owner = rows(`SELECT id FROM users WHERE email='${OWNER}'`)[0];
  if (owner) {
    sql(`DELETE FROM audit_logs WHERE actorId='${owner.id}'`);
    sql(`DELETE FROM owner_changes WHERE ownerId='${owner.id}'`);
    sql(`DELETE FROM login_events WHERE userId='${owner.id}'`);
    sql(`DELETE FROM users WHERE id='${owner.id}'`);
  }
}

const api = {};
try {
  const me = await call(ownerToken, '/api/core/auth/me');
  api.ownerSignIn = me.s === 200 && me.b.owner === true;
  const schools = await call(ownerToken, '/api/core/owner/schools');
  api.schools = [schools.s, schools.b.schools?.length];
  const school = await call(ownerToken, `/api/core/owner/schools/${schools.b.schools?.[0]?.id}`);
  api.school = [school.s, school.b.admins?.length, school.b.recent?.length, school.b.message];
  const growth = await call(ownerToken, '/api/core/owner/growth');
  api.growth = [growth.s, growth.b.revenue?.length, growth.b.churn?.length, growth.b.cohorts?.length];
  api.moderationHasFlag = (await call(ownerToken, '/api/core/owner/moderation')).b.items?.some((i) => i.id === flagId);
  api.demoAdminHidden = (await call('mock-token-demo@admin.com', '/api/core/owner/schools')).s; // 404: owner only
  api.rollout = (await call(ownerToken, '/api/core/owner/server', { rollout: { feature: 'calls', percent: 30 } })).s;
  // View as: a 30-minute read-only session for the student.
  const view = await call(ownerToken, `/api/core/owner/view-as/${student.id}`, {});
  api.viewAs = [view.s, view.b.minutes];
  const vt = view.b.token;
  api.viewReads = (await call(vt, '/api/core/users/me')).b.id === student.id;
  api.viewWriteRefused = (await call(vt, '/api/core/users/me', { bio: 'x' }, 'PATCH')).s; // 403
  api.viewChatRefused = (await call(vt, '/api/chat/conversations')).s; // 401: private messages not shown
  api.viewOwnerRouteHidden = (await call(vt, '/api/core/owner/schools')).s; // 404
  api.viewOfOwnerRefused = (await call(ownerToken, `/api/core/owner/view-as/${me.b.id}`, {})).s; // 403
  const boot = await call(vt, '/api/bootstrap', { keys: ['/api/core/users/me', '/api/chat/incoming'], ticket: true, session: true });
  api.viewBootstrap = [boot.s, boot.b.results?.['/api/core/users/me']?.status, !!boot.b.ticket];
  api.noSignInEntry = rows(`SELECT COUNT(*) AS n FROM login_events WHERE userId='${student.id}' AND createdAt >= '${started}'`)[0].n === 0;
  api.audited = rows(`SELECT COUNT(*) AS n FROM audit_logs WHERE action='support.view_as' AND targetId='${student.id}' AND createdAt >= '${started}'`)[0].n >= 1;
  console.log('api', JSON.stringify(api));

  // ── Browser ──
  const ownerMe = me.b;
  async function context(browser, { width, theme }) {
    // No service worker: its requests would skip the stand-in sign-in added below.
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(([t, u, th]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    }, [ownerToken, ownerMe, theme]);
    // No real Firebase here: the owner's requests carry the stand-in sign-in (a view-as tab sends its own).
    await ctx.route(/\/api\//, (route) => {
      const h = route.request().headers();
      return route.continue(h.authorization ? undefined : { headers: { ...h, authorization: `Bearer ${ownerToken}` } });
    });
    return ctx;
  }
  async function axe(page) {
    await page.waitForTimeout(400);
    await page.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
    await page.addScriptTag({ path: AXE });
    return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  }
  const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const open = async (page, path, ready) => { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60_000 }); await ready.waitFor({ timeout: 20_000 }); };

  const browser = await launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [390, 1280]) {
      const act = theme === 'light' && width === 1280;
      const r = { theme, width };
      const errors = [];
      const ctx = await context(browser, { width, theme });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.slice(0, 120)}`));

      await open(page, '/console?tab=schools', page.getByRole('heading', { name: 'Schools', exact: true }));
      await page.getByRole('heading', { name: 'Who keeps coming back' }).waitFor({ timeout: 20_000 });
      r.schoolsAxe = await axe(page);
      r.schoolsWide = await wide(page);
      const first = page.locator('#schools-h').locator('xpath=../..').locator('button[aria-expanded]').first();
      await first.click();
      await page.getByRole('heading', { name: 'Admins', exact: true }).waitFor({ timeout: 15_000 });
      r.peopleAxe = await axe(page);

      if (act) {
        // View as the student from the person page (People → the student).
        await open(page, `/console?tab=people&person=${student.id}`, page.getByRole('button', { name: /View as .* \(read-only\)/ }));
        const [tab] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /View as .* \(read-only\)/ }).click()]);
        tab.on('pageerror', (e) => errors.push(`view-as ${new URL(tab.url()).pathname}: ${e.message.slice(0, 120)}`));
        await tab.waitForURL(/\/student/, { timeout: 30_000 });
        await tab.getByText('Viewing as').waitFor({ timeout: 20_000 });
        r.viewAsHome = new URL(tab.url()).pathname;
        r.viewAsBannerAxe = await axe(tab);
        r.viewAsOwnerSignInKept = await tab.evaluate((t) => localStorage.getItem('accessToken') === t && !sessionStorage.getItem('uv-pass'), ownerToken);
        r.viewAsTabOnly = await tab.evaluate(() => !!sessionStorage.getItem('uv-view-as') && JSON.parse(sessionStorage.getItem('universe-auth')).state.user.role === 'STUDENT');
        r.viewAsWrite = await tab.evaluate(async () => (await fetch('/api/core/users/me', { method: 'PATCH', headers: { Authorization: `Bearer ${sessionStorage.getItem('uv-view-as')}`, 'Content-Type': 'application/json' }, body: '{"bio":"x"}' })).status);
        r.ownerTabStillOwner = await page.evaluate(() => JSON.parse(localStorage.getItem('universe-auth')).state.user.owner === true && !sessionStorage.getItem('uv-view-as'));
        await tab.getByRole('button', { name: 'End' }).click();
        await tab.waitForURL(/\/view-as\?ended=1/, { timeout: 15_000 });
        await tab.getByRole('heading', { name: 'View as has ended' }).waitFor();
        r.endedAxe = await axe(tab);
        r.endedCleared = await tab.evaluate(() => !sessionStorage.getItem('uv-view-as') && !sessionStorage.getItem('universe-auth'));
        await tab.close();
      }

      await open(page, '/console?tab=moderation', page.getByRole('heading', { name: /Open safety reports/ }));
      const flag = page.locator('li', { hasText: 'Console check: a made-up flag' });
      await flag.waitFor({ timeout: 15_000 });
      r.moderationAxe = await axe(page);
      r.moderationWide = await wide(page);
      if (act) {
        await flag.getByRole('button', { name: 'Dismiss' }).click();
        await flag.waitFor({ state: 'detached', timeout: 15_000 });
        r.flagDismissed = rows(`SELECT status FROM safety_flags WHERE id='${flagId}'`)[0]?.status;
        sql(`UPDATE safety_flags SET status='OPEN', reviewedById=NULL, reviewedAt=NULL WHERE id='${flagId}'`);
      }

      await open(page, '/console?tab=server', page.getByRole('heading', { name: 'Gradual rollout' }));
      await page.getByRole('heading', { name: 'Gradual rollout' }).scrollIntoViewIfNeeded();
      r.rolloutShown = await page.getByText(/Rolling out: Voice and video calls \(30 %\)/).isVisible();
      if (act || width === 390) r.serverAxe = await axe(page);
      r.serverWide = await wide(page);
      // The service worker is blocked here (see context), so its registration is missing: not an app error.
      r.errors = errors.filter((e) => !e.includes("reading 'waiting'"));
      console.log(JSON.stringify(r));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  restore();
  keys.close();
}
